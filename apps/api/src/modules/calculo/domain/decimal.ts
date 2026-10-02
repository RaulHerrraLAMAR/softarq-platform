/**
 * Aritmética decimal del motor (RNF-02, CR-15).
 *
 * - Instancia local de decimal.js (no se modifica la configuración global de la biblioteca).
 * - 40 cifras significativas para las operaciones intermedias; el Decimal de VBA del libro tenía
 *   unas 28. Si una división no es exacta, el resultado se ajusta a 40 cifras con mitad al par
 *   (solo afecta a la cifra 41 y siguientes).
 * - El redondeo de negocio es explícito y solo se aplica donde lo indican CR-11 a CR-13:
 *   mitad hacia arriba y simétrico en negativos (0.125 → 0.13; −0.125 → −0.13).
 */
import { Decimal as DecimalJs } from "decimal.js";

export const Dec = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export type Dec = InstanceType<typeof Dec>;

export const CERO: Dec = new Dec(0);
export const UNO: Dec = new Dec(1);

/** Convierte un `DecimalTexto` ya validado. */
export function dec(texto: string): Dec {
  return new Dec(texto);
}

/** CR-15: redondeo mitad hacia arriba, alejándose de cero, a `decimales` posiciones. */
export function redondearMA(x: Dec, decimales = 2): Dec {
  return x.toDecimalPlaces(decimales, Dec.ROUND_HALF_UP);
}

/** CR-06: techo (entero inmediato superior). */
export function techo(x: Dec): Dec {
  return x.ceil();
}

/** Texto con precisión completa, sin exponente y sin «-0». */
export function aTexto(x: Dec): string {
  const t = x.toFixed();
  return t === "-0" ? "0" : t;
}

/** Texto de un importe ya redondeado, con exactamente 2 decimales. */
export function aTextoDinero(x: Dec): string {
  const t = x.toFixed(2);
  return t === "-0.00" ? "0.00" : t;
}

export function sumar(valores: readonly Dec[]): Dec {
  return valores.reduce((acc, v) => acc.plus(v), CERO);
}
