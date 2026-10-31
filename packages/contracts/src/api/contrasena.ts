/**
 * Cambio propio de contraseña (módulo 13, ADR-0017; también lo usa la app móvil, ADR-0020).
 * Archivo aparte para que el cliente móvil no importe los contratos de administración.
 */
import { z } from "zod";
import { LIMITES_API } from "./comunes.js";

/** Longitud mínima de una contraseña nueva (alta, restablecimiento y cambio propio): sin reglas de composición. */
export const CONTRASENA_MINIMA = 12;

/** Contraseña nueva: longitud mínima, sin reglas de composición (NIST SP 800-63B). */
export const EsquemaContrasenaNueva = z
  .string({ error: "La contraseña debe ser un texto." })
  .min(CONTRASENA_MINIMA, { error: `La contraseña nueva debe tener al menos ${CONTRASENA_MINIMA} caracteres.` })
  .max(LIMITES_API.longitudContrasena, { error: "La contraseña es demasiado larga." });

/** Cambio propio (obligatorio con una contraseña temporal). */
export const EsquemaCambioContrasena = z
  .strictObject({
    actual: z.string().min(1, { error: "Indique la contraseña actual." }).max(LIMITES_API.longitudContrasena),
    nueva: EsquemaContrasenaNueva,
    confirmacion: z.string().max(LIMITES_API.longitudContrasena),
  })
  .refine((c) => c.confirmacion === c.nueva, { error: "La confirmación no coincide con la contraseña nueva.", path: ["confirmacion"] })
  .refine((c) => c.nueva !== c.actual, { error: "La contraseña nueva debe ser distinta de la actual.", path: ["nueva"] });
export type CambioContrasena = z.infer<typeof EsquemaCambioContrasena>;
