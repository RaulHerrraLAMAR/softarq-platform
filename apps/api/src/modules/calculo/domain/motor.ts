/**
 * Motor de cálculo de una versión de cotización (CR-01 a CR-15).
 *
 * Equivale a modCalculo.Calc_Ejecutar del libro 1.0.0-F1, con estas garantías:
 * - función pura: no lee reloj, archivos, red ni base de datos, y no modifica la entrada;
 * - si hay cualquier bloqueo, devuelve BLOQUEADO sin importes parciales;
 * - una cotización vacía nunca produce un total de cero (BL-03);
 * - la ausencia de recargo o de impuesto nunca se convierte en cero (BL-12, BL-13).
 */
import {
  BASES_IMPUESTO,
  type AvisoCalculo,
  type CompraCalculada,
  type ConsumoCalculado,
  type EntradaCalculo,
  type ParametrosUsados,
  type PartidaCalculada,
  type PartidaConceptoEntrada,
  type ProblemaCalculo,
  type ResultadoCalculo,
  type SeleccionPrecioCalculo,
} from "@softarq/contracts";
import { claveCompra, cr06Compra, cr08Prorratear } from "./compras.js";
import { cr02Neto, cr03ConDesperdicio, cr04Convertir, factorConversion } from "./consumo.js";
import { CERO, Dec, aTexto, aTextoDinero, dec, redondearMA, sumar } from "./decimal.js";
import { cr09ManoObra } from "./mano-obra.js";
import { cantidadDePartida } from "./medicion.js";
import { cr11PrecioUnitario, cr12Importe, cr13Impuestos, cr14Total, margen } from "./precio-venta.js";
import { MAGNITUD_DE_FORMULA, UNIDADES } from "./unidades.js";
import { validarEntrada } from "./validar-entrada.js";
import { cr07Vigente } from "./vigencias.js";

interface ConsumoInterno {
  partidaId: string;
  componenteId: string;
  insumoId: string;
  rendimiento: Dec;
  desperdicio: Dec;
  traslape: Dec;
  unidadRendimiento: string;
  unidadBase: string;
  excepcionIds: string[];
  neto: Dec;
  conDesperdicio: Dec;
  factor: Dec;
  base: Dec;
  compraNumero: number;
  costoProrrateado: Dec;
}

interface PartidaInterna {
  id: string;
  tipo: "CONCEPTO" | "ADICIONAL";
  descripcion: string;
  unidad: string;
  cantidad: Dec;
  renglones: Dec[];
  categoria: string | null;
  manoObra: PartidaCalculada["manoObra"];
  jornadas: Dec | null;
  costoMateriales: Dec;
  costoManoObra: Dec;
  costoSubcontrato: Dec;
  costoAdicional: Dec;
}

interface GrupoCompra {
  seleccion: SeleccionPrecioCalculo;
  partidaId: string | null;
  consumos: ConsumoInterno[];
}

class Problemas {
  readonly lista: ProblemaCalculo[] = [];
  agregar(codigo: ProblemaCalculo["codigo"], referencia: string, mensaje: string): void {
    if (!this.lista.some((p) => p.codigo === codigo && p.mensaje === mensaje)) {
      this.lista.push({ codigo, referencia, mensaje });
    }
  }
}

export function calcularCotizacion(entrada: unknown): ResultadoCalculo {
  const errores = validarEntrada(entrada);
  if (errores.length > 0) return { estado: "ENTRADA_INVALIDA", errores };
  return calcular(entrada as EntradaCalculo);
}

function calcular(e: EntradaCalculo): ResultadoCalculo {
  const problemas = new Problemas();
  const unidadBase = new Map(e.insumos.map((i) => [i.id, i.unidadBase]));
  const seleccion = new Map(e.selecciones.map((s) => [s.insumoId, s]));
  const consolidar = e.parametros.consolidarCompras;

  if (e.partidas.length === 0) {
    problemas.agregar(
      "BL-03",
      "version",
      "La versión no tiene partidas: agregue un concepto (y su medición) o un costo adicional.",
    );
  }

  const partidas: PartidaInterna[] = [];
  const consumos: ConsumoInterno[] = [];
  const grupos = new Map<string, GrupoCompra>();

  for (const p of e.partidas) {
    if (p.tipo === "ADICIONAL") {
      // CR-10: monto de costo capturado.
      const cantidad = dec(p.cantidad);
      const monto = dec(p.monto);
      if (cantidad.lte(0)) {
        problemas.agregar("BL-03", p.id, `Partida ${p.id}: la cantidad debe ser mayor que cero.`);
      }
      if (monto.lte(0)) {
        problemas.agregar("BL-11", p.id, `Partida ${p.id}: capture el monto del costo adicional.`);
      }
      partidas.push({
        ...partidaVacia(p.id, "ADICIONAL", p.descripcion, p.unidad, cantidad),
        categoria: p.categoria,
        costoAdicional: monto,
      });
      continue;
    }

    const partida = calcularPartidaConcepto(e, p, unidadBase, problemas);
    partidas.push(partida.partida);
    for (const c of partida.consumos) {
      consumos.push(c);
      // CR-05: agrupación para la compra.
      const s = seleccion.get(c.insumoId);
      if (!s) {
        problemas.agregar(
          "BL-08",
          c.insumoId,
          `Insumo ${c.insumoId}: falta elegir y confirmar proveedor y precio.`,
        );
        continue;
      }
      const clave = claveCompra(consolidar, p.id, s.productoId, s.proveedorId);
      let g = grupos.get(clave);
      if (!g) {
        g = { seleccion: s, partidaId: consolidar ? null : p.id, consumos: [] };
        grupos.set(clave, g);
      }
      g.consumos.push(c);
    }
  }

  // CR-06 y CR-08: compras por presentación y prorrateo.
  const compras: CompraCalculada[] = [];
  const avisos: AvisoCalculo[] = [];
  const porId = new Map(partidas.map((p) => [p.id, p]));
  let numero = 0;
  for (const g of grupos.values()) {
    numero += 1;
    const s = g.seleccion;
    const consumoTotal = sumar(g.consumos.map((c) => c.base));
    const contenido = dec(s.contenido);
    const incremento = s.incrementoMinimo === null ? null : dec(s.incrementoMinimo);
    const precio = dec(s.precioUnitario);
    const compra = cr06Compra(consumoTotal, contenido, s.fraccionable, incremento);
    const costoCompra = compra.unidades.times(precio);
    const partes = cr08Prorratear(
      costoCompra,
      g.consumos.map((c) => c.base),
    );
    g.consumos.forEach((c, i) => {
      const parte = partes[i] ?? CERO;
      c.compraNumero = numero;
      c.costoProrrateado = parte;
      const destino = porId.get(c.partidaId);
      if (destino) destino.costoMateriales = destino.costoMateriales.plus(parte);
    });
    compras.push({
      numero,
      productoId: s.productoId,
      proveedorId: s.proveedorId,
      precioId: s.precioId,
      partidaId: g.partidaId,
      consumoTotal: aTexto(consumoTotal),
      contenido: aTexto(contenido),
      fraccionable: s.fraccionable,
      incrementoMinimo: incremento === null ? null : aTexto(incremento),
      cantidadComprada: aTexto(compra.cantidadComprada),
      unidades: aTexto(compra.unidades),
      sobrante: aTexto(compra.sobrante),
      precioUnitario: aTexto(precio),
      costoCompra: aTexto(costoCompra),
    });
    if (compra.sobrante.gt(0)) {
      avisos.push({
        codigo: "AV-03",
        referencia: `compra-${numero}`,
        mensaje: `Compra ${numero} (${s.productoId}): sobrante de ${aTexto(compra.sobrante)} en unidad base por redondeo de presentaciones; no se descuenta.`,
      });
    }
  }

  // AV-01: el precio elegido no es el menor vigente (solo si el llamador informa el menor).
  for (const s of e.selecciones) {
    if (!consumos.some((c) => c.insumoId === s.insumoId)) continue;
    if (s.menorPrecioVigente !== null && dec(s.menorPrecioVigente).lt(dec(s.precioUnitario))) {
      avisos.push({
        codigo: "AV-01",
        referencia: s.insumoId,
        mensaje: `Insumo ${s.insumoId}: el precio elegido (${s.precioUnitario}) no es el menor vigente (${s.menorPrecioVigente}).`,
      });
    }
  }

  // Parámetros de venta (BL-12, BL-13).
  const params = parametrosDeVenta(e, problemas);

  if (problemas.lista.length > 0 || params === null) {
    return { estado: "BLOQUEADO", problemas: problemas.lista };
  }

  // CR-11 y CR-12.
  const recargo = dec(params.recargoSobreCosto);
  const tasa = dec(params.impuesto.tasa);
  const calculadas: PartidaCalculada[] = [];
  const costosDirectos: Dec[] = [];
  const importes: Dec[] = [];
  for (const p of partidas) {
    const costoDirecto = p.costoMateriales.plus(p.costoManoObra).plus(p.costoSubcontrato).plus(p.costoAdicional);
    const pu = cr11PrecioUnitario(costoDirecto, recargo, p.cantidad);
    const importe = cr12Importe(p.cantidad, pu);
    costosDirectos.push(costoDirecto);
    importes.push(importe);
    calculadas.push({
      id: p.id,
      tipo: p.tipo,
      descripcion: p.descripcion,
      unidad: p.unidad,
      cantidad: aTexto(p.cantidad),
      renglones: p.renglones.map((r, i) => ({ numero: i + 1, resultado: aTexto(r) })),
      categoria: p.categoria,
      manoObra: p.manoObra,
      jornadas: p.jornadas === null ? null : aTexto(p.jornadas),
      costoMateriales: aTexto(p.costoMateriales),
      costoManoObra: aTexto(p.costoManoObra),
      costoSubcontrato: aTexto(p.costoSubcontrato),
      costoAdicional: aTexto(p.costoAdicional),
      costoDirecto: aTexto(costoDirecto),
      precioUnitarioVenta: aTextoDinero(pu),
      importe: aTextoDinero(importe),
    });
  }

  // CR-13 y CR-14.
  const costoDirecto = sumar(costosDirectos);
  const subtotal = sumar(importes);
  const impuestos = cr13Impuestos(subtotal, tasa);
  const total = cr14Total(subtotal, impuestos);
  const m = margen(subtotal, costoDirecto);

  // BL-18: verificación cruzada (si falla es un defecto del motor).
  const verificacion = new Problemas();
  partidas.forEach((p, i) => {
    const pu = dec(calculadas[i]!.precioUnitarioVenta);
    if (!redondearMA(p.cantidad.times(pu), 2).eq(importes[i]!)) {
      verificacion.agregar("BL-18", p.id, `Partida ${p.id}: importe distinto de cantidad × P.U.`);
    }
  });
  if (!sumar(calculadas.map((c) => dec(c.importe))).eq(subtotal)) {
    verificacion.agregar("BL-18", "subtotal", "La suma de importes no es igual al subtotal.");
  }
  if (!subtotal.plus(impuestos).eq(total)) {
    verificacion.agregar("BL-18", "total", "El total no es igual a subtotal + impuestos.");
  }
  if (verificacion.lista.length > 0) {
    return { estado: "BLOQUEADO", problemas: verificacion.lista };
  }

  return {
    estado: "CALCULADO",
    parametros: params,
    partidas: calculadas,
    consumos: consumos.map(consumoATexto),
    compras,
    totales: {
      costoDirecto: aTexto(costoDirecto),
      costoDirectoRedondeado: aTextoDinero(redondearMA(costoDirecto, 2)),
      subtotal: aTextoDinero(subtotal),
      impuestos: aTextoDinero(impuestos),
      total: aTextoDinero(total),
      margen: m === null ? null : aTexto(m),
    },
    avisos,
  };
}

function partidaVacia(
  id: string,
  tipo: "CONCEPTO" | "ADICIONAL",
  descripcion: string,
  unidad: string,
  cantidad: Dec,
): PartidaInterna {
  return {
    id,
    tipo,
    descripcion,
    unidad,
    cantidad,
    renglones: [],
    categoria: null,
    manoObra: null,
    jornadas: null,
    costoMateriales: CERO,
    costoManoObra: CERO,
    costoSubcontrato: CERO,
    costoAdicional: CERO,
  };
}

function calcularPartidaConcepto(
  e: EntradaCalculo,
  p: PartidaConceptoEntrada,
  unidadBase: Map<string, string>,
  problemas: Problemas,
): { partida: PartidaInterna; consumos: ConsumoInterno[] } {
  const con = p.concepto;
  const { renglones, cantidad } = cantidadDePartida(con.tipoFormula, p.mediciones);
  const partida = partidaVacia(p.id, "CONCEPTO", p.descripcion, con.unidad, cantidad);
  partida.renglones = renglones;

  if (p.mediciones.length === 0) {
    problemas.agregar("BL-03", p.id, `Partida ${p.id}: no tiene medición.`);
  } else if (cantidad.lte(0)) {
    problemas.agregar(
      "BL-03",
      p.id,
      `Partida ${p.id}: la cantidad debe ser mayor que cero (revise los descuentos).`,
    );
  }

  // BL-06: la unidad del concepto debe corresponder a su fórmula.
  const magnitud = UNIDADES[con.unidad]?.magnitud;
  if (magnitud !== MAGNITUD_DE_FORMULA[con.tipoFormula]) {
    problemas.agregar(
      "BL-06",
      p.id,
      `Partida ${p.id}: la unidad ${con.unidad} no corresponde a la fórmula ${con.tipoFormula}.`,
    );
  }

  // CR-02 a CR-04 por componente, con excepciones de rendimiento (§3.10).
  const consumos: ConsumoInterno[] = [];
  for (const c of p.componentes) {
    let rendimiento = dec(c.rendimiento);
    let desperdicio = dec(c.desperdicio);
    const traslape = c.factorTraslape === null ? CERO : dec(c.factorTraslape);
    const excepcionIds: string[] = [];
    for (const x of e.excepciones) {
      if (x.partidaId !== p.id || x.componenteId !== c.id || x.estado === "Rechazada") continue;
      if (x.campo === "DESPERDICIO") desperdicio = dec(x.valorAplicado);
      else rendimiento = dec(x.valorAplicado);
      excepcionIds.push(x.id);
    }
    if (rendimiento.lte(0) || desperdicio.lt(0) || desperdicio.gte(1) || traslape.lt(0)) {
      problemas.agregar(
        "BL-05",
        c.id,
        `Partida ${p.id}, componente ${c.id}: rendimiento > 0, 0 <= desperdicio < 1 y traslape >= 0 son obligatorios.`,
      );
      continue;
    }
    const base = unidadBase.get(c.insumoId) ?? "";
    const factor = factorConversion(c.insumoId, base, c.unidadRendimiento, e.conversiones);
    if (factor === null) {
      problemas.agregar(
        "BL-06",
        p.id,
        `Partida ${p.id}, componente ${c.id}: falta conversión ${c.unidadRendimiento} -> ${base} del insumo ${c.insumoId}.`,
      );
      continue;
    }
    const neto = cr02Neto(cantidad, rendimiento, traslape);
    const conDesperdicio = cr03ConDesperdicio(neto, desperdicio);
    consumos.push({
      partidaId: p.id,
      componenteId: c.id,
      insumoId: c.insumoId,
      rendimiento,
      desperdicio,
      traslape,
      unidadRendimiento: c.unidadRendimiento,
      unidadBase: base,
      excepcionIds,
      neto,
      conDesperdicio,
      factor,
      base: cr04Convertir(conDesperdicio, factor),
      compraNumero: 0,
      costoProrrateado: CERO,
    });
  }

  // CR-09: mano de obra (BL-10, BL-06).
  const t = p.tarifaManoObra;
  if (t === null || !t.activa || !cr07Vigente(t.vigenteDesde, t.vigenteHasta, e.fechaCalculo)) {
    problemas.agregar(
      "BL-10",
      p.id,
      `Partida ${p.id}: falta tarifa de mano de obra activa y vigente al ${e.fechaCalculo}.`,
    );
  } else {
    if (t.unidad !== con.unidad) {
      problemas.agregar(
        "BL-06",
        p.id,
        `Partida ${p.id}: la tarifa ${t.id} es por ${t.unidad} y la partida se mide en ${con.unidad}.`,
      );
    }
    partida.manoObra = {
      tarifaId: t.id,
      modalidad: t.modalidad,
      importe: aTexto(dec(t.importe)),
      rendimientoJornada: t.rendimientoJornada === null ? null : aTexto(dec(t.rendimientoJornada)),
    };
    if (cantidad.gt(0)) {
      const mo = cr09ManoObra(
        t.modalidad,
        cantidad,
        dec(t.importe),
        t.rendimientoJornada === null ? null : dec(t.rendimientoJornada),
      );
      if (mo.esSubcontrato) partida.costoSubcontrato = mo.costo;
      else partida.costoManoObra = mo.costo;
      partida.jornadas = mo.jornadas;
    }
  }

  return { partida, consumos };
}

function parametrosDeVenta(e: EntradaCalculo, problemas: Problemas): ParametrosUsados | null {
  const { recargoSobreCosto, impuesto } = e.parametros;
  let ok = true;
  if (recargoSobreCosto === null) {
    problemas.agregar("BL-12", "recargoSobreCosto", "Recargo sobre costo no definido.");
    ok = false;
  } else if (dec(recargoSobreCosto).lt(0) || dec(recargoSobreCosto).gt(1)) {
    problemas.agregar("BL-12", "recargoSobreCosto", "El recargo sobre costo debe estar entre 0 y 1.");
    ok = false;
  }
  if (impuesto === null) {
    problemas.agregar("BL-13", "impuesto", "Tratamiento fiscal no definido (tasa, base y tratamiento).");
    return null;
  }
  const tasa = dec(impuesto.tasa);
  if (tasa.lt(0) || tasa.gt(1)) {
    problemas.agregar("BL-13", "impuesto.tasa", "La tasa de impuesto está fuera de rango (0 a 1).");
    ok = false;
  }
  const base = BASES_IMPUESTO.find((b) => b === impuesto.base);
  if (base === undefined) {
    problemas.agregar(
      "BL-13",
      "impuesto.base",
      `Base de impuesto no definida: ${impuesto.base}. Solo existe ${BASES_IMPUESTO.join(", ")}.`,
    );
    ok = false;
  }
  if (!ok || recargoSobreCosto === null || base === undefined) return null;
  return {
    ambiente: e.parametros.ambiente,
    moneda: e.parametros.moneda,
    recargoSobreCosto: aTexto(dec(recargoSobreCosto)),
    impuesto: {
      tasa: aTexto(tasa),
      base,
      tratamiento: impuesto.tratamiento,
      nombre: impuesto.nombre,
    },
    consolidarCompras: e.parametros.consolidarCompras,
  };
}

function consumoATexto(c: ConsumoInterno): ConsumoCalculado {
  return {
    partidaId: c.partidaId,
    componenteId: c.componenteId,
    insumoId: c.insumoId,
    rendimientoUsado: aTexto(c.rendimiento),
    desperdicioUsado: aTexto(c.desperdicio),
    traslapeUsado: aTexto(c.traslape),
    unidadRendimiento: c.unidadRendimiento,
    unidadBase: c.unidadBase,
    excepcionIds: [...c.excepcionIds],
    consumoNeto: aTexto(c.neto),
    consumoConDesperdicio: aTexto(c.conDesperdicio),
    factorConversion: aTexto(c.factor),
    consumoBase: aTexto(c.base),
    compraNumero: c.compraNumero,
    costoProrrateado: aTexto(c.costoProrrateado),
  };
}
