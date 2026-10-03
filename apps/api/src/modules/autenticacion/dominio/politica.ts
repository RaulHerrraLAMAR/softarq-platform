/**
 * Política de sesiones (ADR-0007 §4). Funciones puras: reciben el instante actual, nunca leen el
 * reloj. La fecha de negocio del cálculo (Reloj) es independiente de este instante.
 */

export const POLITICA_SESION = {
  /** Expiración absoluta de una sesión de usuario: una jornada de trabajo. */
  absolutaMs: 8 * 60 * 60 * 1000,
  /** Vence tras 30 minutos sin solicitudes (OWASP: 15–30 min para riesgo bajo o medio). */
  inactividadMs: 30 * 60 * 1000,
  /** Sesión previa al acceso: solo sirve para el formulario de inicio de sesión. */
  previaMs: 15 * 60 * 1000,
  /** La última actividad se actualiza como mucho una vez por minuto (menos escrituras). */
  actualizarActividadCadaMs: 60 * 1000,
} as const;

export interface TiemposSesion {
  readonly creadaEn: Date;
  readonly ultimaActividadEn: Date;
  readonly expiraEn: Date;
  readonly revocadaEn: Date | null;
}

export type EstadoTemporalSesion = "VIGENTE" | "REVOCADA" | "VENCIDA_ABSOLUTA" | "VENCIDA_INACTIVIDAD";

/** Estado temporal de una sesión en `ahora`. El límite es exclusivo: en el instante exacto ya venció. */
export function estadoTemporal(s: TiemposSesion, ahora: Date): EstadoTemporalSesion {
  if (s.revocadaEn !== null) return "REVOCADA";
  if (ahora.getTime() >= s.expiraEn.getTime()) return "VENCIDA_ABSOLUTA";
  if (ahora.getTime() - s.ultimaActividadEn.getTime() >= POLITICA_SESION.inactividadMs) return "VENCIDA_INACTIVIDAD";
  return "VIGENTE";
}

/** `true` si conviene registrar la actividad de esta solicitud. */
export function debeActualizarActividad(ultimaActividadEn: Date, ahora: Date): boolean {
  return ahora.getTime() - ultimaActividadEn.getTime() >= POLITICA_SESION.actualizarActividadCadaMs;
}

/** Normalización del correo: la misma que exige el CHECK de la tabla `usuario`. */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}
