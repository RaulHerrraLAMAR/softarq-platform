/**
 * CR-02 a CR-04: consumos y conversión a unidad base (Word maestro §3.4; modCalculo).
 */
import type { ConversionCalculo } from "@softarq/contracts";
import { Dec, UNO, dec } from "./decimal.js";

/** CR-02: consumo neto = cantidad × rendimiento × (1 + traslape aprobado). */
export function cr02Neto(cantidad: Dec, rendimiento: Dec, traslape: Dec): Dec {
  return cantidad.times(rendimiento).times(UNO.plus(traslape));
}

/** CR-03: consumo con desperdicio = neto × (1 + desperdicio). */
export function cr03ConDesperdicio(neto: Dec, desperdicio: Dec): Dec {
  return neto.times(UNO.plus(desperdicio));
}

/** CR-04: consumo en unidad base = consumo × factor. */
export function cr04Convertir(consumo: Dec, factor: Dec): Dec {
  return consumo.times(factor);
}

/**
 * Factor de una unidad a la unidad base del insumo (modCatalogos.Conv_Factor):
 * 1 si ya es la unidad base; si no, la conversión registrada origen → base.
 * `null` si no existe (BL-06). No se deducen conversiones inversas ni encadenadas.
 */
export function factorConversion(
  insumoId: string,
  unidadBase: string,
  unidadOrigen: string,
  conversiones: readonly ConversionCalculo[],
): Dec | null {
  if (unidadOrigen === unidadBase) return UNO;
  const c = conversiones.find(
    (x) => x.insumoId === insumoId && x.unidadOrigen === unidadOrigen && x.unidadDestino === unidadBase,
  );
  return c ? dec(c.factor) : null;
}
