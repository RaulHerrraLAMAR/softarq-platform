/**
 * Formato es-MX del documento emitido, desde cadenas decimales (nunca `number`): importes
 * `$54,190.68`, cantidades con 2 a 4 decimales, tasas en porcentaje y fechas dd/mm/aaaa.
 */
import { Dec, dec } from "../../../calculo/domain/decimal.js";

function miles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function partes(x: Dec, minimos: number, maximos: number): string {
  const redondeado = x.abs().toDecimalPlaces(maximos, Dec.ROUND_HALF_UP);
  let [entero, fraccion = ""] = redondeado.toFixed(maximos).split(".") as [string, string?];
  fraccion = fraccion.replace(/0+$/, "");
  if (fraccion.length < minimos) fraccion = fraccion.padEnd(minimos, "0");
  return `${x.isNegative() && !redondeado.isZero() ? "-" : ""}${miles(entero)}${fraccion ? `.${fraccion}` : ""}`;
}

/** Importe en MXN con dos decimales: `$54,190.68`. */
export function dinero(texto: string): string {
  const s = partes(dec(texto), 2, 2);
  return s.startsWith("-") ? `-$${s.slice(1)}` : `$${s}`;
}

/** Cantidad con 2 a 4 decimales (`#,##0.00##` del libro). */
export function cantidad(texto: string): string {
  return partes(dec(texto), 2, 4);
}

/** Tasa fraccionaria como porcentaje: `0.16` → `16 %`. */
export function porcentaje(texto: string): string {
  return `${partes(dec(texto).times(100), 0, 4)} %`;
}

/** Fecha ISO (AAAA-MM-DD) como dd/mm/aaaa. */
export function fecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Unidades con superíndice, como `Pdf_Unidad` del libro. */
export function unidad(u: string): string {
  return u === "m2" ? "m²" : u === "m3" ? "m³" : u;
}
