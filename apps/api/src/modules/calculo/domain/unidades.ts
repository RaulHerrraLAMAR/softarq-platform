/**
 * Catálogo de unidades de la fase 1 (entrega\fuentes\build\modBuild.bas, B_Unidades).
 * La magnitud permite comprobar que la unidad de un concepto corresponde a su fórmula (BL-06).
 */
import type { TipoFormula } from "@softarq/contracts";

export type Magnitud =
  | "longitud"
  | "area"
  | "volumen"
  | "masa"
  | "conteo"
  | "tiempo"
  | "servicio";

export const UNIDADES: Readonly<Record<string, { nombre: string; magnitud: Magnitud }>> = Object.freeze({
  m: { nombre: "Metro", magnitud: "longitud" },
  m2: { nombre: "Metro cuadrado", magnitud: "area" },
  m3: { nombre: "Metro cúbico", magnitud: "volumen" },
  l: { nombre: "Litro", magnitud: "volumen" },
  kg: { nombre: "Kilogramo", magnitud: "masa" },
  t: { nombre: "Tonelada", magnitud: "masa" },
  pza: { nombre: "Pieza", magnitud: "conteo" },
  bulto: { nombre: "Bulto", magnitud: "conteo" },
  rollo: { nombre: "Rollo", magnitud: "conteo" },
  lote: { nombre: "Lote", magnitud: "conteo" },
  jor: { nombre: "Jornada", magnitud: "tiempo" },
  hr: { nombre: "Hora", magnitud: "tiempo" },
  dia: { nombre: "Día", magnitud: "tiempo" },
  viaje: { nombre: "Viaje", magnitud: "servicio" },
  serv: { nombre: "Servicio", magnitud: "servicio" },
});

export function esUnidadConocida(clave: string): boolean {
  return Object.hasOwn(UNIDADES, clave);
}

/** MagnitudDeFormula de modCalculo.bas. */
export const MAGNITUD_DE_FORMULA: Readonly<Record<TipoFormula, Magnitud>> = Object.freeze({
  CONTEO: "conteo",
  LONGITUD: "longitud",
  AREA: "area",
  VOLUMEN: "volumen",
});
