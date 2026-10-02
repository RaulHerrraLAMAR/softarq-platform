/**
 * CR-09: mano de obra (Word maestro §3.5; modCalculo.CR09_ManoObra).
 */
import type { ModalidadManoObra } from "@softarq/contracts";
import type { Dec } from "./decimal.js";

export interface ManoObraResultado {
  costo: Dec;
  /** Solo en JORNADA; fraccionarias. */
  jornadas: Dec | null;
  /** SUBCONTRATO se acumula aparte de la mano de obra. */
  esSubcontrato: boolean;
}

export function cr09ManoObra(
  modalidad: ModalidadManoObra,
  cantidad: Dec,
  importe: Dec,
  rendimientoJornada: Dec | null,
): ManoObraResultado {
  switch (modalidad) {
    case "UNIDAD":
      return { costo: cantidad.times(importe), jornadas: null, esSubcontrato: false };
    case "JORNADA": {
      if (rendimientoJornada === null || rendimientoJornada.lte(0)) {
        throw new Error("Rendimiento por jornada inválido.");
      }
      const jornadas = cantidad.div(rendimientoJornada);
      return { costo: jornadas.times(importe), jornadas, esSubcontrato: false };
    }
    case "SUBCONTRATO":
      return { costo: cantidad.times(importe), jornadas: null, esSubcontrato: true };
  }
}
