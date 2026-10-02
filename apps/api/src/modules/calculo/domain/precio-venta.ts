/**
 * CR-11 a CR-14 y margen interno (Word maestro §3.6; modCalculo).
 */
import { Dec, UNO, redondearMA } from "./decimal.js";

/** CR-11: P.U. = redondear((costo directo × (1 + k)) ÷ cantidad, 2). */
export function cr11PrecioUnitario(costoDirecto: Dec, recargo: Dec, cantidad: Dec): Dec {
  if (cantidad.lte(0)) throw new Error("La cantidad debe ser mayor que cero.");
  return redondearMA(costoDirecto.times(UNO.plus(recargo)).div(cantidad), 2);
}

/** CR-12: importe = redondear(cantidad × P.U., 2). */
export function cr12Importe(cantidad: Dec, precioUnitario: Dec): Dec {
  return redondearMA(cantidad.times(precioUnitario), 2);
}

/** CR-13: impuestos = redondear(base × tasa, 2). */
export function cr13Impuestos(base: Dec, tasa: Dec): Dec {
  return redondearMA(base.times(tasa), 2);
}

/** CR-14: total = subtotal + impuestos. */
export function cr14Total(subtotal: Dec, impuestos: Dec): Dec {
  return subtotal.plus(impuestos);
}

/** Margen sobre precio (indicador interno): (venta − costo) ÷ venta; `null` si la venta es 0. */
export function margen(venta: Dec, costo: Dec): Dec | null {
  if (venta.isZero()) return null;
  return venta.minus(costo).div(venta);
}

/** Margen equivalente a un recargo k: k ÷ (1 + k). */
export function margenDeRecargo(recargo: Dec): Dec {
  return recargo.div(UNO.plus(recargo));
}
