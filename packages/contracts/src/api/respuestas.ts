/** Seguimiento interno por emisión (ADR-0013). Reglas y reloj exclusivamente en la API. */
import { z } from "zod";
import { EsquemaFechaISO } from "./esquemas.js";

export const RESULTADOS_CLIENTE = ["ACEPTADA", "RECHAZADA"] as const;
export const LIMITES_RESPUESTAS = { nota: 2000, motivo: 500, minimoMotivo: 10, pagina: 50 } as const;
const EsquemaFechaRecibida = EsquemaFechaISO.refine((f) => {
  const [a, m, d] = f.split("-").map(Number) as [number, number, number];
  const fecha = new Date(`${f}T00:00:00Z`);
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}, { error: "Capture una fecha real con formato AAAA-MM-DD." });
export const EsquemaRegistroRespuesta = z.strictObject({
  resultado: z.enum(RESULTADOS_CLIENTE),
  fechaRespuesta: EsquemaFechaRecibida,
  nota: z.string().trim().max(LIMITES_RESPUESTAS.nota).nullable().optional().transform((t) => t || null),
});
export const EsquemaCorreccionRespuesta = EsquemaRegistroRespuesta.extend({
  motivo: z.string().trim().max(LIMITES_RESPUESTAS.motivo).refine(
    (t) => t.length >= LIMITES_RESPUESTAS.minimoMotivo && /\p{L}/u.test(t),
    { error: "Explique la corrección (al menos 10 caracteres)." },
  ),
});
export type RegistroRespuesta = z.infer<typeof EsquemaRegistroRespuesta>;
export type CorreccionRespuesta = z.infer<typeof EsquemaCorreccionRespuesta>;

export const EsquemaEventoRespuestaCliente = z.strictObject({
  id: z.uuid(), emisionId: z.uuid(), numero: z.number().int().positive(),
  anteriorId: z.uuid().nullable(), tipo: z.enum(["REGISTRADA", "CORREGIDA"]),
  resultado: z.enum(RESULTADOS_CLIENTE), fechaRespuesta: EsquemaFechaISO,
  nota: z.string().nullable(), registradoPor: z.uuid(), registradoNombre: z.string(),
  registradoEn: z.string(), fechaRegistro: EsquemaFechaISO, motivo: z.string().nullable(),
});
export type EventoRespuestaCliente = z.infer<typeof EsquemaEventoRespuestaCliente>;

export const EsquemaConsultaSeguimiento = z.strictObject({
  antesDe: z.string().regex(/^[1-9][0-9]{0,9}$/).transform(Number).refine((n) => n <= 2147483647).optional(),
});
const EsquemaAccionRespuesta = z.strictObject({ permitida: z.boolean(), motivo: z.string().nullable() });
export const EsquemaSeguimientoEmision = z.strictObject({
  emisionId: z.uuid(), cotizacionId: z.uuid(), versionId: z.uuid(), idVersion: z.string(),
  fechaEmision: EsquemaFechaISO, vigenteHasta: EsquemaFechaISO, sustituida: z.boolean(),
  vigencia: z.strictObject({ estado: z.enum(["VIGENTE", "VENCIDA"]), fechaServidor: EsquemaFechaISO, zonaHoraria: z.string() }),
  respuestaVigente: EsquemaEventoRespuestaCliente.nullable(),
  historial: z.array(EsquemaEventoRespuestaCliente),
  siguienteAntesDe: z.number().int().positive().nullable(),
  acciones: z.strictObject({ registrar: EsquemaAccionRespuesta, corregir: EsquemaAccionRespuesta }),
});
export type SeguimientoEmision = z.infer<typeof EsquemaSeguimientoEmision>;
