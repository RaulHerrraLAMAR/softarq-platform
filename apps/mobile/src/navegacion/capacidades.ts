/**
 * Navegación según las capacidades que entrega el servidor (ADR-0020 §4, ADR-0021).
 *
 * La app no deduce permisos de las funciones: solo mira `capacidades` de la sesión. Ocultar una opción es
 * presentación; la API comprueba la capacidad en cada solicitud.
 */
import type { Capacidad } from "@softarq/contracts/cliente";

export interface Secciones {
  /** Crear, editar y enviar solicitudes (`cliente.solicitudes`). */
  readonly solicitudes: boolean;
  /** Ver las cotizaciones emitidas y su PDF (`cliente.cotizaciones`). */
  readonly cotizaciones: boolean;
}

export const tiene = (capacidades: readonly Capacidad[], c: Capacidad): boolean => capacidades.includes(c);

export function seccionesDe(capacidades: readonly Capacidad[]): Secciones {
  return { solicitudes: tiene(capacidades, "cliente.solicitudes"), cotizaciones: tiene(capacidades, "cliente.cotizaciones") };
}

/** Primer nombre para saludar («Laura Méndez» → «Laura»). */
export function primerNombre(nombre: string): string {
  const limpio = nombre.replace(/^\[DEMO\]\s*/i, "").trim();
  return limpio.split(/\s+/)[0] ?? limpio;
}

/** Iniciales para el avatar del perfil. */
export function iniciales(nombre: string): string {
  const partes = nombre.replace(/^\[DEMO\]\s*/i, "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primera = partes[0]!.charAt(0);
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : "";
  return `${primera}${ultima}`.toUpperCase();
}
