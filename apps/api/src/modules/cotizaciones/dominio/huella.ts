/**
 * Huellas SHA-256 sobre JSON canónico (claves ordenadas, sin espacios). Equivalen al
 * `sello_calculo` del libro (BL-16), con una función hash estándar en lugar de un hash propio.
 */
import { createHash } from "node:crypto";
import type { EntradaCalculo } from "@softarq/contracts";

/** JSON con las claves de cada objeto ordenadas: dos valores iguales producen el mismo texto. */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, ordenar(o[k])]),
    );
  }
  return v;
}

export function sha256(valor: unknown): Buffer {
  return createHash("sha256").update(jsonCanonico(valor), "utf8").digest();
}

/**
 * Valores de referencia del cálculo, sin la captura: parámetros (salvo la consolidación, que es
 * captura), insumos, conversiones, datos técnicos y tarifas de los conceptos, tipos de adicional
 * y precios elegidos. Dos versiones con la misma huella de referencia usaron las mismas condiciones.
 */
export function huellaReferencia(e: EntradaCalculo): Buffer {
  const { consolidarCompras: _, ...parametros } = e.parametros;
  return sha256({
    parametros,
    insumos: e.insumos,
    conversiones: e.conversiones,
    conceptos: e.partidas.map((p) =>
      p.tipo === "CONCEPTO"
        ? { concepto: p.concepto, componentes: p.componentes, tarifa: p.tarifaManoObra }
        : { categoria: p.categoria, unidad: p.unidad },
    ),
    selecciones: e.selecciones,
  });
}
