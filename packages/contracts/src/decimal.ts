/**
 * Número decimal exacto transmitido como texto.
 *
 * Formato de ENTRADA (validado por la API):
 * - signo opcional `-` (nunca `+`);
 * - parte entera sin ceros a la izquierda, de 1 a 15 dígitos;
 * - punto `.` como separador y de 1 a 10 decimales opcionales;
 * - sin exponentes, comas, espacios ni símbolos de moneda.
 *
 * Ejemplos válidos: `"0"`, `"12.5"`, `"-1.20"`, `"18790.94"`.
 * Ejemplos inválidos: `"1,000"`, `"1e3"`, `" 1"`, `"+1"`, `"01"`, `".5"`, `"5."`.
 *
 * Formato de SALIDA:
 * - importes de venta (P.U., importe, subtotal, impuestos, total) con exactamente 2 decimales;
 * - cantidades, consumos y costos intermedios con precisión completa, sin exponente.
 *
 * Nunca se debe convertir a `number` para operar con importes o cantidades.
 */
export type DecimalTexto = string;

export const LIMITES_DECIMAL_TEXTO = {
  digitosEnteros: 15,
  decimales: 10,
} as const;

export const PATRON_DECIMAL_TEXTO = /^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$/;

export function esDecimalTexto(valor: unknown): valor is DecimalTexto {
  return typeof valor === "string" && PATRON_DECIMAL_TEXTO.test(valor);
}

/** Fecha de calendario sin hora ni zona horaria: `AAAA-MM-DD`. */
export type FechaISO = string;

export const PATRON_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
