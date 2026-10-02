import type { ResultadoCalculado, ResultadoCalculo } from "@softarq/contracts";
import { expect } from "vitest";
import { Dec } from "../decimal.js";

export function calculado(r: ResultadoCalculo): ResultadoCalculado {
  if (r.estado !== "CALCULADO") {
    throw new Error(`Se esperaba CALCULADO y se obtuvo ${r.estado}: ${JSON.stringify(r)}`);
  }
  return r;
}

/** Compara decimales por valor (1.20 == 1.2). */
export function igualDecimal(obtenido: string | null | undefined, esperado: string): void {
  expect(obtenido, `esperado ${esperado}`).not.toBeNull();
  expect(new Dec(obtenido as string).eq(esperado), `${obtenido} ≠ ${esperado}`).toBe(true);
}

/** Truncado a 4 decimales, como muestra el Word (§3.14) el prorrateo. */
export function trunc4(x: string): string {
  return new Dec(x).toDecimalPlaces(4, Dec.ROUND_DOWN).toFixed(4);
}

export function codigos(r: ResultadoCalculo): string[] {
  if (r.estado === "BLOQUEADO") return r.problemas.map((p) => p.codigo);
  if (r.estado === "ENTRADA_INVALIDA") return r.errores.map((e) => e.ruta);
  return [];
}

/** Congela en profundidad para detectar cualquier mutación de la entrada. */
export function congelar<T>(o: T): T {
  if (o !== null && typeof o === "object") {
    for (const v of Object.values(o)) congelar(v);
    Object.freeze(o);
  }
  return o;
}
