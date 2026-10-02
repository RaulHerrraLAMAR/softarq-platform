import type { TipoFormula } from "@softarq/contracts";

/** Qué medidas se capturan según la fórmula del concepto (texto para el usuario). */
export const NOMBRE_FORMULA: Record<TipoFormula, string> = {
  CONTEO: "solo piezas",
  LONGITUD: "piezas y largo",
  AREA: "piezas, largo y ancho o alto",
  VOLUMEN: "piezas, largo, ancho y alto",
};

export const UNIDAD_MEDIDA = "m";
