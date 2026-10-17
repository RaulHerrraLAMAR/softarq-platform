/**
 * Ensamblador: arma `EntradaCalculo` para el motor a partir de los catálogos guardados de una
 * organización y de una solicitud (medidas, precios elegidos, adicionales y fecha).
 *
 * - Las reglas de cálculo siguen en el motor (domain/); aquí solo se leen y traducen datos.
 * - Los identificadores de la entrada son los códigos de negocio (INS-00001, PRE-000007…),
 *   igual que en los fixtures verificados del motor.
 * - La selección de precios es EXPLÍCITA: se usan exactamente los precios pedidos. Si uno no es
 *   válido (anulado, producto o proveedor inactivo) se bloquea con BL-08; nunca se sustituye ni
 *   se elige el menor. El menor precio vigente solo se informa para el aviso AV-01.
 * - BL-04 (concepto no aprobado o inactivo) se evalúa aquí, al armar la entrada (matriz de reglas).
 *   Un concepto PERSONALIZADO activo puede usarse aunque esté en Borrador solo si la solicitud trae
 *   su excepción CONCEPTO_PERSONALIZADO registrada (W §3.10; `Validar` en modo ENVIAR). Que esté
 *   AUTORIZADA lo exige la verificación al aprobar y emitir, no el cálculo.
 * - BL-05 de trazabilidad (módulo 12, `Validar`): un componente activo sin fuente, fecha o responsable
 *   técnico bloquea. El motor y su huella no cambian: es un dato del catálogo, no del cálculo.
 */
import type {
  EntradaCalculo,
  ExcepcionRendimientoCalculo,
  FechaISO,
  PartidaEntrada,
  RenglonMedicion,
  SeleccionPrecioCalculo,
} from "@softarq/contracts";
import { Dec } from "../domain/decimal.js";
import type {
  ContextoOrganizacion,
  PrecioLeido,
  RepositorioCatalogos,
} from "../../catalogos/persistencia/repositorio-catalogos.js";

/** Partida pedida por código de concepto, con sus renglones de medición. */
export interface SolicitudPartidaConcepto {
  id: string;
  tipo: "CONCEPTO";
  conceptoCodigo: string;
  /** Si se omite, se usa la descripción del concepto (como `descripcion_copia` del libro). */
  descripcion?: string;
  mediciones: RenglonMedicion[];
}

/** Costo adicional pedido por código de tipo (CR-10). */
export interface SolicitudPartidaAdicional {
  id: string;
  tipo: "ADICIONAL";
  tipoAdicionalCodigo: string;
  descripcion: string;
  cantidad: string;
  monto: string;
}

export interface SolicitudExcepcion {
  id: string;
  partidaId: string;
  componenteCodigo: string;
  campo: ExcepcionRendimientoCalculo["campo"];
  valorAplicado: string;
  estado: ExcepcionRendimientoCalculo["estado"];
}

export interface SolicitudCalculo {
  /** Fecha explícita para vigencias de tarifas y del menor precio (AV-01). */
  fechaCalculo: FechaISO;
  consolidarCompras: boolean;
  partidas: (SolicitudPartidaConcepto | SolicitudPartidaAdicional)[];
  /** Códigos de los precios elegidos y confirmados, uno por insumo (CR-07). */
  preciosElegidos: string[];
  excepciones?: SolicitudExcepcion[];
  /** Conceptos PERSONALIZADO con excepción registrada en la solicitud (módulo 10). */
  conceptosPersonalizadosConExcepcion?: string[];
}

export interface ProblemaEnsamblado {
  codigo: "BL-04" | "BL-05" | "BL-08";
  referencia: string;
  mensaje: string;
}

export type ResultadoEnsamblado =
  | { estado: "LISTA"; entrada: EntradaCalculo }
  | { estado: "BLOQUEADO"; problemas: ProblemaEnsamblado[] }
  | { estado: "NO_ENCONTRADO"; faltantes: { tipo: string; codigo: string }[] };

export async function construirEntradaCalculo(
  repo: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  s: SolicitudCalculo,
): Promise<ResultadoEnsamblado> {
  const faltantes: { tipo: string; codigo: string }[] = [];
  const problemas: ProblemaEnsamblado[] = [];

  const codigosConcepto = unicos(
    s.partidas.filter((p): p is SolicitudPartidaConcepto => p.tipo === "CONCEPTO").map((p) => p.conceptoCodigo),
  );
  const codigosAdicional = unicos(
    s.partidas.filter((p): p is SolicitudPartidaAdicional => p.tipo === "ADICIONAL").map((p) => p.tipoAdicionalCodigo),
  );

  const [parametros, conceptos, tiposAdicional, precios] = await Promise.all([
    repo.obtenerParametros(ctx),
    repo.obtenerConceptos(ctx, codigosConcepto),
    repo.obtenerTiposAdicional(ctx, codigosAdicional),
    repo.obtenerPrecios(ctx, unicos(s.preciosElegidos)),
  ]);

  const conceptoPorCodigo = new Map(conceptos.map((c) => [c.codigo, c]));
  const adicionalPorCodigo = new Map(tiposAdicional.map((t) => [t.codigo, t]));
  const precioPorCodigo = new Map(precios.map((p) => [p.codigo, p]));

  for (const c of codigosConcepto) if (!conceptoPorCodigo.has(c)) faltantes.push({ tipo: "concepto", codigo: c });
  for (const c of codigosAdicional) if (!adicionalPorCodigo.has(c)) faltantes.push({ tipo: "tipo adicional", codigo: c });
  for (const c of unicos(s.preciosElegidos)) if (!precioPorCodigo.has(c)) faltantes.push({ tipo: "precio", codigo: c });
  if (faltantes.length > 0) return { estado: "NO_ENCONTRADO", faltantes };

  // BL-04: solo conceptos activos y aprobados; un personalizado activo, con su excepción registrada.
  const personalizadosConExcepcion = new Set(s.conceptosPersonalizadosConExcepcion ?? []);
  for (const c of conceptos) {
    if (c.activo && c.clase === "PERSONALIZADO") {
      if (!personalizadosConExcepcion.has(c.codigo)) {
        problemas.push({
          codigo: "BL-04",
          referencia: c.codigo,
          mensaje: `Concepto personalizado ${c.codigo} sin excepción registrada (registre una excepción de concepto personalizado).`,
        });
      }
      continue;
    }
    if (!c.activo || c.estado !== "Aprobado") {
      problemas.push({
        codigo: "BL-04",
        referencia: c.codigo,
        mensaje: `El concepto ${c.codigo} no está aprobado o está inactivo (estado ${c.estado}).`,
      });
    }
  }

  // BL-05 (`Validar`): rendimiento y desperdicio trazables (fuente, fecha y responsable técnico).
  for (const p of s.partidas) {
    if (p.tipo !== "CONCEPTO") continue;
    for (const k of conceptoPorCodigo.get(p.conceptoCodigo)!.componentes) {
      if (k.activo && !k.trazable) {
        problemas.push({
          codigo: "BL-05",
          referencia: k.codigo,
          mensaje: `Partida ${p.id}: el componente ${k.codigo} no tiene rendimiento o desperdicio trazable (fuente, fecha y responsable técnico).`,
        });
      }
    }
  }

  // BL-08: una selección inválida bloquea; jamás se reemplaza por otro precio.
  for (const codigo of unicos(s.preciosElegidos)) {
    const p = precioPorCodigo.get(codigo)!;
    const motivo = p.anulado
      ? "el precio está anulado"
      : !p.producto.activo
        ? "el producto está inactivo"
        : !p.proveedor.activo
          ? "el proveedor está inactivo"
          : null;
    if (motivo) {
      problemas.push({
        codigo: "BL-08",
        referencia: p.producto.insumoCodigo,
        mensaje: `Insumo ${p.producto.insumoCodigo}: la selección ${codigo} no es válida (${motivo}). Elija de nuevo.`,
      });
    }
  }
  // Excepciones de rendimiento: el componente debe ser un componente ACTIVO del concepto de esa
  // partida (`Exc_Registrar`). Si el catálogo cambió después de registrarla, bloquea con BL-05.
  const partidaPorId = new Map(s.partidas.map((p) => [p.id, p]));
  for (const x of s.excepciones ?? []) {
    const p = partidaPorId.get(x.partidaId);
    const c = p?.tipo === "CONCEPTO" ? conceptoPorCodigo.get(p.conceptoCodigo) : undefined;
    if (!c || !c.componentes.some((k) => k.activo && k.codigo === x.componenteCodigo)) {
      problemas.push({
        codigo: "BL-05",
        referencia: x.id,
        mensaje: `La excepción ${x.id} cita el componente ${x.componenteCodigo}, que no es un componente activo del concepto de la partida ${x.partidaId}.`,
      });
    }
  }
  if (problemas.length > 0) return { estado: "BLOQUEADO", problemas };

  // Insumos y conversiones de los componentes activos y de los precios elegidos.
  const codigosInsumo = unicos([
    ...conceptos.flatMap((c) => c.componentes.filter((k) => k.activo).map((k) => k.insumoCodigo)),
    ...precios.map((p) => p.producto.insumoCodigo),
  ]);
  const [insumos, conversiones, vigentes] = await Promise.all([
    repo.obtenerInsumos(ctx, codigosInsumo),
    repo.obtenerConversiones(ctx, codigosInsumo),
    repo.obtenerPreciosVigentesDeProductos(ctx, unicos(precios.map((p) => p.producto.codigo)), s.fechaCalculo),
  ]);

  const partidas: PartidaEntrada[] = s.partidas.map((p) => {
    if (p.tipo === "ADICIONAL") {
      const t = adicionalPorCodigo.get(p.tipoAdicionalCodigo)!;
      return {
        id: p.id,
        tipo: "ADICIONAL",
        descripcion: p.descripcion,
        categoria: t.categoria,
        unidad: t.unidad,
        cantidad: p.cantidad,
        monto: p.monto,
      };
    }
    const c = conceptoPorCodigo.get(p.conceptoCodigo)!;
    return {
      id: p.id,
      tipo: "CONCEPTO",
      descripcion: p.descripcion ?? c.descripcion,
      concepto: { id: c.codigo, unidad: c.unidad, tipoFormula: c.tipoFormula, permiteDescuento: c.permiteDescuento },
      mediciones: p.mediciones.map((m) => ({ ...m })),
      componentes: c.componentes
        .filter((k) => k.activo)
        .map((k) => ({
          id: k.codigo,
          insumoId: k.insumoCodigo,
          rendimiento: k.rendimiento,
          unidadRendimiento: k.unidadRendimiento,
          desperdicio: k.desperdicio,
          factorTraslape: k.factorTraslape,
        })),
      tarifaManoObra: c.tarifa
        ? {
            id: c.tarifa.codigo,
            modalidad: c.tarifa.modalidad,
            unidad: c.tarifa.unidad,
            importe: c.tarifa.importe,
            rendimientoJornada: c.tarifa.rendimientoJornada,
            vigenteDesde: c.tarifa.vigenteDesde,
            vigenteHasta: c.tarifa.vigenteHasta,
            activa: c.tarifa.activa,
          }
        : null,
    };
  });

  const selecciones: SeleccionPrecioCalculo[] = unicos(s.preciosElegidos).map((codigo) => {
    const p = precioPorCodigo.get(codigo)!;
    return {
      insumoId: p.producto.insumoCodigo,
      productoId: p.producto.codigo,
      proveedorId: p.proveedor.codigo,
      precioId: p.codigo,
      precioUnitario: p.precioUnitario,
      contenido: p.producto.contenido,
      fraccionable: p.producto.fraccionable,
      incrementoMinimo: p.producto.incrementoMinimo,
      menorPrecioVigente: menorPrecio(vigentes.filter((v) => v.producto.codigo === p.producto.codigo)),
    };
  });

  const entrada: EntradaCalculo = {
    fechaCalculo: s.fechaCalculo,
    parametros: {
      ambiente: parametros?.ambiente ?? "PRODUCCION",
      moneda: "MXN",
      // Sin fila de parámetros, o con valores NULL: ausencia (el motor bloquea con BL-12/BL-13).
      recargoSobreCosto: parametros?.recargoSobreCosto ?? null,
      impuesto: parametros?.impuesto ?? null,
      consolidarCompras: s.consolidarCompras,
    },
    insumos: insumos.map((i) => ({ id: i.codigo, unidadBase: i.unidadBase })),
    conversiones: conversiones.map((c) => ({
      insumoId: c.insumoCodigo,
      unidadOrigen: c.unidadOrigen,
      unidadDestino: c.unidadDestino,
      factor: c.factor,
    })),
    partidas,
    selecciones,
    excepciones: (s.excepciones ?? []).map((x) => ({
      id: x.id,
      partidaId: x.partidaId,
      componenteId: x.componenteCodigo,
      campo: x.campo,
      valorAplicado: x.valorAplicado,
      estado: x.estado,
    })),
  };
  return { estado: "LISTA", entrada };
}

/** Menor precio vigente del producto (informativo para AV-01); `null` si no hay ninguno. */
function menorPrecio(vigentes: readonly PrecioLeido[]): string | null {
  let menor: string | null = null;
  for (const v of vigentes) {
    if (menor === null || new Dec(v.precioUnitario).lt(menor)) menor = v.precioUnitario;
  }
  return menor;
}

function unicos(valores: readonly string[]): string[] {
  return [...new Set(valores)];
}
