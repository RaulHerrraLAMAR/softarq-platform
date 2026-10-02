/**
 * CR-07 (vigencia de precios y tarifas) y CR-16 (vigencia comercial), Word maestro §3.7.
 * Trabajan con fechas de calendario `AAAA-MM-DD` recibidas explícitamente; no leen el reloj.
 */
import type { FechaISO } from "@softarq/contracts";
import { PATRON_FECHA_ISO } from "@softarq/contracts";

/** `true` si el texto es una fecha de calendario real (rechaza 2026-02-30). */
export function esFechaISOValida(texto: string): boolean {
  if (!PATRON_FECHA_ISO.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** CR-07: vigente si desde <= fecha <= hasta (límites incluidos). */
export function cr07Vigente(desde: FechaISO, hasta: FechaISO, fecha: FechaISO): boolean {
  // Las fechas ISO de igual longitud se comparan correctamente como texto.
  return desde <= fecha && fecha <= hasta;
}

/** CR-16: vigente hasta = fecha de emisión + `dias` días naturales. */
export function cr16VigenteHasta(emision: FechaISO, dias: number): FechaISO {
  if (!esFechaISOValida(emision)) throw new Error(`Fecha de emisión inválida: ${emision}`);
  if (!Number.isInteger(dias) || dias <= 0) throw new Error("La vigencia debe ser un entero mayor que cero (BL-14).");
  const [a, m, d] = emision.split("-").map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}
