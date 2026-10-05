/**
 * Verificación de condiciones vigentes de una versión para enviarla o aprobarla (módulo 7,
 * ADR-0009). Funciones puras: comparan la instantánea guardada con lo leído hoy, SIN modificarla.
 *
 * Fuente: `Validar(idv, modo)` de `modValidacion.bas` y Word maestro §3.11: «las mismas reglas se
 * evalúan al enviar a revisión, verificar, aprobar y emitir». En la web la versión ya está
 * calculada e inmutable; si una regla exige recalcular, la corrección es una versión nueva.
 */
import type { CotizacionComercial, EntradaCalculo, FechaISO } from "@softarq/contracts";
import { Dec, dec, redondearMA, sumar } from "../../calculo/domain/decimal.js";
import { cr07Vigente, cr16VigenteHasta } from "../../calculo/domain/vigencias.js";
import type { ConceptoLeido, PrecioLeido } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { sha256 } from "./huella.js";

export interface Problema {
  codigo: string;
  referencia: string;
  mensaje: string;
}

export interface Aviso {
  codigo: "AV-01" | "AV-02" | "AV-03" | "AV-04" | "AV-05";
  mensaje: string;
}

const RECALCULAR = "Genere una versión nueva para calcular con las condiciones vigentes.";

/**
 * Valores de la entrada que determinan el cálculo, sin la fecha de cálculo ni el menor precio
 * vigente (solo informa AV-01). Dos entradas con la misma huella producen el mismo resultado.
 */
export function huellaComparable(e: EntradaCalculo): string {
  const { fechaCalculo: _, ...resto } = e;
  return sha256({ ...resto, selecciones: e.selecciones.map(({ menorPrecioVigente: _m, ...s }) => s) }).toString("hex");
}

/** BL-16: la versión ya no se reproduciría igual con los datos de hoy (o con otro motor). */
export function bl16(guardada: EntradaCalculo, motorGuardado: string, actual: EntradaCalculo | null, motorActual: string): Problema[] {
  if (motorGuardado !== motorActual) {
    return [{ codigo: "BL-16", referencia: motorGuardado, mensaje: `La versión se calculó con otro motor (${motorGuardado}). ${RECALCULAR}` }];
  }
  if (actual && huellaComparable(actual) !== huellaComparable(guardada)) {
    return [
      {
        codigo: "BL-16",
        referencia: "condiciones",
        mensaje: `Cambiaron datos, precios o parámetros después del cálculo de esta versión. ${RECALCULAR}`,
      },
    ];
  }
  return [];
}

/** BL-18: verificación cruzada de la proyección guardada (importe = cantidad × P.U.; sumas). */
export function bl18(c: CotizacionComercial): Problema[] {
  const p: Problema[] = [];
  const importes: Dec[] = [];
  for (const x of c.partidas) {
    const importe = dec(x.importe);
    importes.push(importe);
    if (!redondearMA(dec(x.cantidad).times(dec(x.precioUnitario)), 2).eq(importe)) {
      p.push({ codigo: "BL-18", referencia: String(x.numero), mensaje: `Partida ${x.numero}: importe distinto de cantidad × P.U.` });
    }
  }
  if (!sumar(importes).eq(dec(c.subtotal))) p.push({ codigo: "BL-18", referencia: "subtotal", mensaje: "La suma de importes no coincide con el subtotal." });
  if (!dec(c.subtotal).plus(dec(c.impuesto.importe)).eq(dec(c.total))) {
    p.push({ codigo: "BL-18", referencia: "total", mensaje: "El total no es subtotal + impuestos." });
  }
  return p;
}

/** Insumos que la versión usa (componentes de sus conceptos y precios elegidos). */
export function insumosDeEntrada(e: EntradaCalculo): string[] {
  const s = new Set<string>();
  for (const p of e.partidas) if (p.tipo === "CONCEPTO") for (const k of p.componentes) s.add(k.insumoId);
  for (const x of e.selecciones) s.add(x.insumoId);
  return [...s];
}

/** BL-07: insumo sin producto comercial activo (Validar, todos los modos). */
export function bl07(insumos: readonly string[], conProductoActivo: ReadonlySet<string>): Problema[] {
  return insumos
    .filter((i) => !conProductoActivo.has(i))
    .map((i) => ({ codigo: "BL-07", referencia: i, mensaje: `El insumo ${i} no tiene producto comercial activo.` }));
}

/**
 * BL-09: el precio elegido no está vigente a la fecha de referencia, salvo excepción PRECIO_VENCIDO
 * (D-11; W §3.10: registrada al enviar, autorizada al aprobar y emitir). `eximidos` lo decide
 * `preciosConExcepcion` (módulo 10).
 */
export function bl09(
  e: EntradaCalculo,
  precios: readonly PrecioLeido[],
  hoy: FechaISO,
  eximidos: ReadonlySet<string> = new Set(),
): Problema[] {
  const porCodigo = new Map(precios.map((p) => [p.codigo, p]));
  const r: Problema[] = [];
  for (const s of e.selecciones) {
    const p = porCodigo.get(s.precioId);
    if (p && !cr07Vigente(p.vigenteDesde, p.vigenteHasta, hoy) && !eximidos.has(s.precioId)) {
      r.push({
        codigo: "BL-09",
        referencia: s.precioId,
        mensaje: `Insumo ${s.insumoId}: el precio ${s.precioId} no está vigente al ${hoy} (vigencia ${p.vigenteDesde} a ${p.vigenteHasta}). Elija otro precio o registre una excepción de precio vencido en una versión nueva.`,
      });
    }
  }
  return r;
}

/** BL-14: vigencia comercial no definida o no positiva. */
export function bl14(vigenciaDias: number | null): Problema[] {
  return vigenciaDias !== null && Number.isInteger(vigenciaDias) && vigenciaDias > 0
    ? []
    : [{ codigo: "BL-14", referencia: "VIGENCIA_DIAS", mensaje: "Vigencia comercial no definida o no mayor que cero." }];
}

/**
 * AV-02: el precio elegido vence antes de que termine la vigencia comercial contada desde la fecha
 * de referencia (CR-16). Aviso, no bloqueo. La emisión lo evaluará con su fecha real.
 */
export function av02(e: EntradaCalculo, precios: readonly PrecioLeido[], hoy: FechaISO, vigenciaDias: number | null): Aviso[] {
  if (vigenciaDias === null || !Number.isInteger(vigenciaDias) || vigenciaDias <= 0) return [];
  const fin = cr16VigenteHasta(hoy, vigenciaDias);
  const porCodigo = new Map(precios.map((p) => [p.codigo, p]));
  const r: Aviso[] = [];
  for (const s of e.selecciones) {
    const p = porCodigo.get(s.precioId);
    if (p && p.vigenteHasta < fin) {
      r.push({
        codigo: "AV-02",
        mensaje: `El precio ${s.precioId} vence el ${p.vigenteHasta}, antes del fin de la vigencia comercial contada desde hoy (${fin}).`,
      });
    }
  }
  return r;
}

/** AV-05: la versión usa conceptos genéricos o personalizados (clase distinta de ESTANDAR). */
export function av05(e: EntradaCalculo, conceptos: readonly ConceptoLeido[]): Aviso[] {
  const porCodigo = new Map(conceptos.map((c) => [c.codigo, c]));
  const vistos = new Set<string>();
  const r: Aviso[] = [];
  for (const p of e.partidas) {
    if (p.tipo !== "CONCEPTO" || vistos.has(p.concepto.id)) continue;
    vistos.add(p.concepto.id);
    const c = porCodigo.get(p.concepto.id);
    if (c && c.clase !== "ESTANDAR") {
      r.push({ codigo: "AV-05", mensaje: `La versión usa el concepto ${c.clase.toLowerCase()} ${c.codigo}.` });
    }
  }
  return r;
}

/** Faltantes del ensamblador → bloqueos con el código de la regla que corresponde. */
export function problemasDeFaltantes(faltantes: readonly { tipo: string; codigo: string }[]): Problema[] {
  return faltantes.map((f) =>
    f.tipo === "concepto"
      ? { codigo: "BL-04", referencia: f.codigo, mensaje: `El concepto ${f.codigo} ya no existe en el catálogo.` }
      : f.tipo === "precio"
        ? { codigo: "BL-08", referencia: f.codigo, mensaje: `La selección ${f.codigo} ya no existe en el catálogo.` }
        : { codigo: "BL-11", referencia: f.codigo, mensaje: `El tipo de costo adicional ${f.codigo} ya no existe.` },
  );
}

/** Primer aviso de cada mensaje, en orden de código. */
export function ordenarAvisos(avisos: readonly Aviso[]): Aviso[] {
  const vistos = new Set<string>();
  return [...avisos]
    .filter((a) => (vistos.has(a.mensaje) ? false : (vistos.add(a.mensaje), true)))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
