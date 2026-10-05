import type { FechaISO } from "@softarq/contracts";
import { ErrorNegocio } from "../aplicacion/errores.js";

/** CR-16 y A-01: el último día completo es vigente. No escribe estados ni recalcula. */
export function vigenciaDocumento(vigenteHasta: FechaISO, fechaServidor: FechaISO): "VIGENTE" | "VENCIDA" {
  return fechaServidor <= vigenteHasta ? "VIGENTE" : "VENCIDA";
}

/** B-36 más la adaptación autorizada: importa cuándo se recibió, no cuándo se capturó. */
export function validarFechaRespuesta(fecha: FechaISO, emision: { fechaEmision: FechaISO; vigenteHasta: FechaISO }, hoy: FechaISO): void {
  if (fecha < emision.fechaEmision || fecha > hoy) {
    throw new ErrorNegocio("FECHA_RESPUESTA_INVALIDA", `La fecha recibida debe estar entre ${emision.fechaEmision} y ${hoy} (fecha del servidor).`,
      { campos: [{ ruta: "fechaRespuesta", mensaje: "No puede ser anterior a la emisión ni futura." }] });
  }
  if (fecha > emision.vigenteHasta) {
    throw new ErrorNegocio("RESPUESTA_FUERA_VIGENCIA", `El último día de vigencia fue ${emision.vigenteHasta}; no se admite una respuesta recibida después.`,
      { campos: [{ ruta: "fechaRespuesta", mensaje: `Debe ser hasta ${emision.vigenteHasta}, inclusive.` }] });
  }
}
