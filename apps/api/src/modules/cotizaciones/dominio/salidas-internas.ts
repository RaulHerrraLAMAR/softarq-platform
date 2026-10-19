/**
 * Salidas internas de una versión (módulo 14, ADR-0018): 12 COMPRAS, 13 DETALLE_CALCULO e
 * indicadores de 14 REVISION, armados SOLO con lo congelado en la versión.
 *
 * Reglas:
 * - Nunca se lee el catálogo ni los parámetros vigentes: un detalle histórico no se reconstruye con
 *   datos actuales. Sin referencias congeladas (versiones anteriores al módulo) se muestran códigos.
 * - No se recalcula el motor ni se cambia ningún importe. Las únicas operaciones son sumas
 *   decimales de valores congelados (desglose por categoría) y comprobaciones de cuadre.
 * - Si la instantánea no tiene la forma esperada, el detalle es NO_DISPONIBLE completo: no se
 *   entregan cifras parciales como si fueran el informe.
 */
import type {
  CompraInterna,
  EntradaCalculo,
  Indicador,
  PartidaInterna,
  ResumenVersion,
  SalidasInternasVersion,
} from "@softarq/contracts";
import { z } from "zod";
import type { CodigosReferencias, ReferenciasLeidas } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { CERO, Dec, dec, sumar, aTexto } from "../../calculo/domain/decimal.js";

// ---------------------------------------------------------------------------
// Referencias congeladas (columna referencias_internas)
// ---------------------------------------------------------------------------

/** Versión del formato de `referencias_internas`; cambia si cambia su forma. */
export const ESQUEMA_REFERENCIAS = 1;

export interface ReferenciasInternas extends ReferenciasLeidas {
  esquema: typeof ESQUEMA_REFERENCIAS;
}

/** Códigos que usó el cálculo: los de la entrada del motor y los tipos de adicional de la solicitud. */
export function codigosDeReferencias(entrada: EntradaCalculo, tiposAdicional: readonly string[]): CodigosReferencias {
  const unicos = (xs: Iterable<string>) => [...new Set(xs)].sort();
  const conceptos = entrada.partidas.flatMap((p) => (p.tipo === "CONCEPTO" ? [p] : []));
  return {
    insumos: unicos(entrada.insumos.map((i) => i.id)),
    productos: unicos(entrada.selecciones.map((s) => s.productoId)),
    proveedores: unicos(entrada.selecciones.map((s) => s.proveedorId)),
    precios: unicos(entrada.selecciones.map((s) => s.precioId)),
    tarifas: unicos(conceptos.flatMap((p) => (p.tarifaManoObra ? [p.tarifaManoObra.id] : []))),
    conceptos: unicos(conceptos.map((p) => p.concepto.id)),
    tiposAdicional: unicos(tiposAdicional),
  };
}

export function aReferenciasInternas(leidas: ReferenciasLeidas): ReferenciasInternas {
  return { esquema: ESQUEMA_REFERENCIAS, ...leidas };
}

// ---------------------------------------------------------------------------
// Lectura validada de la instantánea (formas mínimas; claves extra permitidas)
// ---------------------------------------------------------------------------

const T = z.string();
const N = z.string().nullable();

const EsquemaResultadoGuardado = z.object({
  estado: z.literal("CALCULADO"),
  parametros: z.object({
    ambiente: T,
    moneda: T,
    recargoSobreCosto: T,
    impuesto: z.object({ tasa: T, base: T, nombre: T }),
    consolidarCompras: z.boolean(),
  }),
  partidas: z.array(
    z.object({
      id: T,
      tipo: z.enum(["CONCEPTO", "ADICIONAL"]),
      descripcion: T,
      unidad: T,
      cantidad: T,
      renglones: z.array(z.object({ numero: z.number().int(), resultado: T })),
      categoria: N,
      manoObra: z
        .object({ tarifaId: T, modalidad: z.enum(["UNIDAD", "JORNADA", "SUBCONTRATO"]), importe: T, rendimientoJornada: N })
        .nullable(),
      jornadas: N,
      costoMateriales: T,
      costoManoObra: T,
      costoSubcontrato: T,
      costoAdicional: T,
      costoDirecto: T,
      precioUnitarioVenta: T,
      importe: T,
    }),
  ),
  consumos: z.array(
    z.object({
      partidaId: T,
      componenteId: T,
      insumoId: T,
      rendimientoUsado: T,
      desperdicioUsado: T,
      traslapeUsado: T,
      unidadRendimiento: T,
      unidadBase: T,
      excepcionIds: z.array(T),
      consumoNeto: T,
      consumoConDesperdicio: T,
      factorConversion: T,
      consumoBase: T,
      compraNumero: z.number().int(),
      costoProrrateado: T,
    }),
  ),
  compras: z.array(
    z.object({
      numero: z.number().int(),
      productoId: T,
      proveedorId: T,
      precioId: T,
      partidaId: N,
      consumoTotal: T,
      contenido: T,
      fraccionable: z.boolean(),
      incrementoMinimo: N,
      cantidadComprada: T,
      unidades: T,
      sobrante: T,
      precioUnitario: T,
      costoCompra: T,
    }),
  ),
  totales: z.object({ costoDirecto: T, costoDirectoRedondeado: T, subtotal: T, impuestos: T, total: T, margen: N }),
  avisos: z.array(z.object({ codigo: T, referencia: T, mensaje: T })),
});

const EsquemaEntradaGuardada = z.object({
  insumos: z.array(z.object({ id: T, unidadBase: T })),
  partidas: z.array(
    z.discriminatedUnion("tipo", [
      z.object({
        tipo: z.literal("CONCEPTO"),
        id: T,
        concepto: z.object({ id: T }),
        componentes: z.array(z.object({ id: T, rendimiento: T, desperdicio: T, factorTraslape: N })),
        tarifaManoObra: z.object({ id: T, unidad: T }).nullable(),
      }),
      z.object({ tipo: z.literal("ADICIONAL"), id: T }),
    ]),
  ),
  selecciones: z.array(z.object({ insumoId: T, productoId: T })),
  excepciones: z.array(z.object({ id: T, partidaId: T, componenteId: T, campo: z.enum(["RENDIMIENTO", "DESPERDICIO"]), valorAplicado: T })),
});

const EsquemaSolicitudGuardada = z.object({
  partidas: z.array(z.object({ id: T, tipo: T, tipoAdicionalCodigo: T.optional() })),
});

const EsquemaReferenciasGuardadas = z.object({
  esquema: z.literal(ESQUEMA_REFERENCIAS),
  insumos: z.array(z.object({ codigo: T, descripcion: T, unidadBase: T })),
  productos: z.array(z.object({ codigo: T, descripcion: T, presentacion: T, unidadCompra: T })),
  proveedores: z.array(z.object({ codigo: T, nombre: T })),
  precios: z.array(z.object({ codigo: T, vigenteDesde: T, vigenteHasta: T })),
  tarifas: z.array(z.object({ codigo: T, descripcion: T })),
  conceptos: z.array(z.object({ codigo: T, descripcion: T })),
  tiposAdicional: z.array(z.object({ codigo: T, descripcion: T, categoria: T })),
});

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------

export interface VersionParaSalidas {
  versionId: string;
  folio: string;
  numero: number;
  origen: string;
  resumen: Pick<ResumenVersion, "estado" | "esUltima">;
  fechaCalculo: string;
  versionMotor: string;
  autorNombre: string;
  creadoEn: string;
  entradaCalculo: unknown;
  resultadoInterno: unknown;
  solicitudCalculo: unknown;
  referenciasInternas: unknown;
  /** Decisión vigente de cada excepción por número (EXC-n ↔ n). */
  decisiones: ReadonlyMap<number, "AUTORIZADA" | "RECHAZADA">;
}

const NO_DISPONIBLE = (motivo: string): Indicador => ({ estado: "NO_DISPONIBLE", motivo });
const valor = (x: Dec | string): Indicador => ({ estado: "VALOR", valor: typeof x === "string" ? x : aTexto(x) });

export const MOTIVO_SIN_NOMBRES =
  "Esta versión se calculó antes de congelar nombres y vigencias del catálogo: se muestran los códigos. Los nombres actuales del catálogo no se usan porque podrían no ser los del cálculo.";
export const MOTIVO_NO_DISPONIBLE =
  "La instantánea interna de esta versión no tiene la forma esperada: el detalle no está disponible y no se muestran cifras parciales.";

export function construirSalidasInternas(v: VersionParaSalidas): SalidasInternasVersion {
  const r = EsquemaResultadoGuardado.safeParse(v.resultadoInterno);
  const e = EsquemaEntradaGuardada.safeParse(v.entradaCalculo);
  const s = EsquemaSolicitudGuardada.safeParse(v.solicitudCalculo);
  const refs = v.referenciasInternas === null || v.referenciasInternas === undefined ? null : EsquemaReferenciasGuardadas.safeParse(v.referenciasInternas);

  const encabezadoBase = {
    versionId: v.versionId,
    idVersion: `${v.folio}-v${v.numero}`,
    folio: v.folio,
    numero: v.numero,
    origen: v.origen,
    estado: v.resumen.estado,
    esUltima: v.resumen.esUltima,
    fechaCalculo: v.fechaCalculo,
    versionMotor: v.versionMotor,
    autorNombre: v.autorNombre,
    creadoEn: v.creadoEn,
  };

  if (!r.success || !e.success || !s.success || (refs !== null && !refs.success)) {
    const motivo = "Sin instantánea interna válida.";
    return {
      encabezado: { ...encabezadoBase, ambiente: null, moneda: null, consolidarCompras: null },
      disponibilidad: { estado: "NO_DISPONIBLE", motivo: MOTIVO_NO_DISPONIBLE },
      compras: [],
      partidas: [],
      indicadores: {
        costoMateriales: NO_DISPONIBLE(motivo),
        costoManoObra: NO_DISPONIBLE(motivo),
        costoSubcontrato: NO_DISPONIBLE(motivo),
        costosAdicionales: [],
        costoAdicional: NO_DISPONIBLE(motivo),
        costoDirecto: NO_DISPONIBLE(motivo),
        costoDirectoRedondeado: NO_DISPONIBLE(motivo),
        subtotal: NO_DISPONIBLE(motivo),
        impuesto: { nombre: null, tasa: NO_DISPONIBLE(motivo), base: null, importe: NO_DISPONIBLE(motivo) },
        total: NO_DISPONIBLE(motivo),
        recargoSobreCosto: NO_DISPONIBLE(motivo),
        margenSobrePrecio: NO_DISPONIBLE(motivo),
      },
      conciliacion: null,
      avisos: [],
    };
  }

  const res = r.data;
  const ent = e.data;
  const ref = refs?.data ?? null;
  const porCodigo = <X extends { codigo: string }>(xs: readonly X[] | undefined) => new Map((xs ?? []).map((x) => [x.codigo, x]));
  const insumos = porCodigo(ref?.insumos);
  const productos = porCodigo(ref?.productos);
  const proveedores = porCodigo(ref?.proveedores);
  const precios = porCodigo(ref?.precios);
  const tarifas = porCodigo(ref?.tarifas);
  const conceptos = porCodigo(ref?.conceptos);
  const tiposAdicional = porCodigo(ref?.tiposAdicional);

  const unidadBase = new Map(ent.insumos.map((i) => [i.id, i.unidadBase]));
  const numeroPartida = new Map(res.partidas.map((p, i) => [p.id, i + 1]));
  const entradaPartida = new Map(ent.partidas.map((p) => [p.id, p]));
  const tipoAdicional = new Map(s.data.partidas.flatMap((p) => (p.tipoAdicionalCodigo ? [[p.id, p.tipoAdicionalCodigo] as const] : [])));
  const excepciones = new Map(ent.excepciones.map((x) => [x.id, x]));
  const insumoDeCompra = new Map<number, string>();
  for (const c of res.consumos) if (!insumoDeCompra.has(c.compraNumero)) insumoDeCompra.set(c.compraNumero, c.insumoId);

  const ajustes = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const x = excepciones.get(id);
      const n = /^EXC-(\d+)$/.exec(id);
      if (!x || !n) return [];
      const numero = Number(n[1]);
      return [{ numero, campo: x.campo, valorAplicado: x.valorAplicado, estado: v.decisiones.get(numero) ?? ("PENDIENTE" as const) }];
    });

  const compras: CompraInterna[] = res.compras.map((k) => {
    const insumo = insumoDeCompra.get(k.numero) ?? null;
    const producto = productos.get(k.productoId);
    const precio = precios.get(k.precioId);
    const partida = k.partidaId === null ? null : res.partidas.find((p) => p.id === k.partidaId);
    return {
      numero: k.numero,
      insumo: { codigo: insumo ?? "", nombre: insumo ? (insumos.get(insumo)?.descripcion ?? null) : null },
      unidadBase: insumo ? (unidadBase.get(insumo) ?? null) : null,
      producto: { codigo: k.productoId, nombre: producto?.descripcion ?? null },
      presentacion: producto?.presentacion ?? null,
      unidadCompra: producto?.unidadCompra ?? null,
      proveedor: { codigo: k.proveedorId, nombre: proveedores.get(k.proveedorId)?.nombre ?? null },
      precio: { codigo: k.precioId, vigenteDesde: precio?.vigenteDesde ?? null, vigenteHasta: precio?.vigenteHasta ?? null },
      partida: partida ? { id: partida.id, numero: numeroPartida.get(partida.id) ?? 0, descripcion: partida.descripcion } : null,
      regla: k.fraccionable ? "FRACCIONABLE" : "PAQUETE_COMPLETO",
      consumoTotal: k.consumoTotal,
      contenido: k.contenido,
      incrementoMinimo: k.incrementoMinimo,
      cantidadComprada: k.cantidadComprada,
      unidades: k.unidades,
      sobrante: k.sobrante,
      precioUnitario: k.precioUnitario,
      costoCompra: k.costoCompra,
      prorrateo: res.consumos
        .filter((c) => c.compraNumero === k.numero)
        .map((c) => ({
          partidaId: c.partidaId,
          partidaNumero: numeroPartida.get(c.partidaId) ?? 0,
          componenteCodigo: c.componenteId,
          consumoBase: c.consumoBase,
          costoProrrateado: c.costoProrrateado,
        })),
    };
  });

  const partidas: PartidaInterna[] = res.partidas.map((p, i) => {
    const pe = entradaPartida.get(p.id);
    const pc = pe?.tipo === "CONCEPTO" ? pe : null;
    const componentes = new Map((pc?.componentes ?? []).map((c) => [c.id, c]));
    const adicional = tipoAdicional.get(p.id) ?? null;
    return {
      id: p.id,
      numero: i + 1,
      tipo: p.tipo,
      concepto: pc ? { codigo: pc.concepto.id, nombre: conceptos.get(pc.concepto.id)?.descripcion ?? null } : null,
      tipoAdicional: p.tipo === "ADICIONAL" && adicional ? { codigo: adicional, nombre: tiposAdicional.get(adicional)?.descripcion ?? null } : null,
      categoria: p.categoria,
      descripcion: p.descripcion,
      unidad: p.unidad,
      cantidad: p.cantidad,
      renglones: p.renglones.map((x) => ({ numero: x.numero, resultado: x.resultado })),
      consumos: res.consumos
        .filter((c) => c.partidaId === p.id)
        .map((c) => {
          const k = componentes.get(c.componenteId);
          return {
            componenteCodigo: c.componenteId,
            insumo: { codigo: c.insumoId, nombre: insumos.get(c.insumoId)?.descripcion ?? null },
            catalogo: k ? { rendimiento: k.rendimiento, desperdicio: k.desperdicio, traslape: k.factorTraslape } : null,
            rendimientoUsado: c.rendimientoUsado,
            desperdicioUsado: c.desperdicioUsado,
            traslapeUsado: c.traslapeUsado,
            unidadRendimiento: c.unidadRendimiento,
            unidadBase: c.unidadBase,
            consumoNeto: c.consumoNeto,
            consumoConDesperdicio: c.consumoConDesperdicio,
            factorConversion: c.factorConversion,
            consumoBase: c.consumoBase,
            compraNumero: c.compraNumero,
            costoProrrateado: c.costoProrrateado,
            ajustes: ajustes(c.excepcionIds),
          };
        }),
      manoObra: p.manoObra
        ? {
            tarifa: { codigo: p.manoObra.tarifaId, nombre: tarifas.get(p.manoObra.tarifaId)?.descripcion ?? null },
            modalidad: p.manoObra.modalidad,
            unidad: pc?.tarifaManoObra?.unidad ?? null,
            importeTarifa: p.manoObra.importe,
            rendimientoJornada: p.manoObra.rendimientoJornada,
            jornadas: p.jornadas,
          }
        : null,
      costoMateriales: p.costoMateriales,
      costoManoObra: p.costoManoObra,
      costoSubcontrato: p.costoSubcontrato,
      costoAdicional: p.costoAdicional,
      costoDirecto: p.costoDirecto,
      precioUnitarioVenta: p.precioUnitarioVenta,
      importe: p.importe,
    };
  });

  // Desglose (COT_R_MAT, COT_R_MO, COT_R_SUB, COT_R_TRA/MAQ/OTR): sumas de lo congelado por partida.
  const suma = (f: (p: (typeof res.partidas)[number]) => string) => sumar(res.partidas.map((p) => dec(f(p))));
  const materiales = suma((p) => p.costoMateriales);
  const manoObra = suma((p) => p.costoManoObra);
  const subcontrato = suma((p) => p.costoSubcontrato);
  const adicional = suma((p) => p.costoAdicional);
  const porCategoria = new Map<string, Dec>();
  for (const p of res.partidas) {
    if (p.tipo !== "ADICIONAL") continue;
    const cat = p.categoria ?? "Sin categoría";
    porCategoria.set(cat, (porCategoria.get(cat) ?? CERO).plus(dec(p.costoAdicional)));
  }
  const costoDirecto = dec(res.totales.costoDirecto);
  const subtotal = dec(res.totales.subtotal);

  const conciliacion = {
    categorias: materiales.plus(manoObra).plus(subcontrato).plus(adicional).eq(costoDirecto),
    importes: suma((p) => p.importe).eq(subtotal),
    prorrateo: compras.every((k) => sumar(k.prorrateo.map((x) => dec(x.costoProrrateado))).eq(dec(k.costoCompra))),
  };

  return {
    encabezado: {
      ...encabezadoBase,
      ambiente: res.parametros.ambiente,
      moneda: res.parametros.moneda,
      consolidarCompras: res.parametros.consolidarCompras,
    },
    disponibilidad: ref ? { estado: "COMPLETO", motivo: null } : { estado: "SIN_NOMBRES", motivo: MOTIVO_SIN_NOMBRES },
    compras,
    partidas,
    indicadores: {
      costoMateriales: valor(materiales),
      costoManoObra: valor(manoObra),
      costoSubcontrato: valor(subcontrato),
      costosAdicionales: [...porCategoria].map(([categoria, x]) => ({ categoria, valor: aTexto(x) })),
      costoAdicional: valor(adicional),
      costoDirecto: valor(res.totales.costoDirecto),
      costoDirectoRedondeado: valor(res.totales.costoDirectoRedondeado),
      subtotal: valor(res.totales.subtotal),
      impuesto: {
        nombre: res.parametros.impuesto.nombre,
        tasa: valor(res.parametros.impuesto.tasa),
        base: res.parametros.impuesto.base,
        importe: valor(res.totales.impuestos),
      },
      total: valor(res.totales.total),
      recargoSobreCosto: valor(res.parametros.recargoSobreCosto),
      margenSobrePrecio:
        res.totales.margen === null
          ? { estado: "NO_APLICA", motivo: "El subtotal de venta es 0: el margen sobre precio no se puede calcular." }
          : valor(res.totales.margen),
    },
    conciliacion,
    avisos: res.avisos.map((a) => ({ codigo: a.codigo, referencia: a.referencia, mensaje: a.mensaje })),
  };
}
