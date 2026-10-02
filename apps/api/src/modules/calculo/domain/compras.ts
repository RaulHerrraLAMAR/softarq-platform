/**
 * CR-05, CR-06 y CR-08: agrupación, compra por presentación y prorrateo
 * (Word maestro §3.4; modCalculo.CR06_Compra y Calc_Ejecutar).
 */
import { CERO, Dec, techo } from "./decimal.js";

export interface CompraPresentacion {
  /** Lo que se compra, en unidad base. */
  cantidadComprada: Dec;
  /** Unidades de compra (paquetes o fracción de la unidad de compra). */
  unidades: Dec;
  /** Se informa (AV-03) pero no se descuenta (D-10). */
  sobrante: Dec;
}

/**
 * CR-06. No fraccionable: unidades = ⌈consumo ÷ contenido⌉.
 * Fraccionable: cantidad = ⌈consumo ÷ incremento⌉ × incremento (incremento en unidad base).
 */
export function cr06Compra(
  consumo: Dec,
  contenido: Dec,
  fraccionable: boolean,
  incremento: Dec | null,
): CompraPresentacion {
  if (contenido.lte(0)) throw new Error("Contenido del producto inválido.");
  if (fraccionable) {
    if (incremento === null || incremento.lte(0)) throw new Error("Incremento mínimo inválido.");
    const cantidadComprada = techo(consumo.div(incremento)).times(incremento);
    return {
      cantidadComprada,
      unidades: cantidadComprada.div(contenido),
      sobrante: cantidadComprada.minus(consumo),
    };
  }
  const unidades = techo(consumo.div(contenido));
  const cantidadComprada = unidades.times(contenido);
  return { cantidadComprada, unidades, sobrante: cantidadComprada.minus(consumo) };
}

/** CR-05: clave de agrupación de compras. */
export function claveCompra(
  consolidar: boolean,
  partidaId: string,
  productoId: string,
  proveedorId: string,
): string {
  return consolidar
    ? JSON.stringify([productoId, proveedorId])
    : JSON.stringify([partidaId, productoId, proveedorId]);
}

/**
 * CR-08: reparte el costo de una compra entre sus consumos en proporción a su consumo base,
 * con precisión completa; el último consumo recibe el remanente para que la suma sea exacta.
 */
export function cr08Prorratear(costoCompra: Dec, consumosBase: readonly Dec[]): Dec[] {
  const total = consumosBase.reduce((a, c) => a.plus(c), CERO);
  const asignados: Dec[] = [];
  let acumulado = CERO;
  consumosBase.forEach((c, i) => {
    let parte: Dec;
    if (i === consumosBase.length - 1) {
      parte = costoCompra.minus(acumulado);
    } else if (total.gt(0)) {
      parte = costoCompra.times(c).div(total);
    } else {
      parte = CERO;
    }
    acumulado = acumulado.plus(parte);
    asignados.push(parte);
  });
  return asignados;
}
