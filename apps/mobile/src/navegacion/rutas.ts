/**
 * Destinos de navegación de la app del cliente. Todas las pantallas navegan con estas funciones, así los textos de
 * ruta viven en un solo lugar.
 *
 * `Href` es el tipo que genera `typedRoutes` (`.expo/types`, archivo generado que se actualiza al iniciar Metro o
 * exportar). La conversión es deliberada y está solo aquí: la forma de cada ruta la fijan los nombres de archivo de
 * `app/`, y `comprobar:bundle` falla si una ruta no existe.
 */
import type { Href } from "expo-router";

const ruta = (r: string): Href => r as unknown as Href;
const id = (x: string) => encodeURIComponent(x);

export const rutas = {
  inicio: ruta("/"),
  misCotizaciones: ruta("/mias"),
  perfil: ruta("/perfil"),
  contrasena: ruta("/contrasena"),
  nueva: ruta("/nueva"),
  solicitud: (s: string) => ruta(`/solicitud/${id(s)}`),
  elegirTrabajo: (s: string, cambiar?: string) => ruta(`/solicitud/${id(s)}/trabajo${cambiar ? `?cambiar=${id(cambiar)}` : ""}`),
  medidas: (s: string, trabajo: string) => ruta(`/solicitud/${id(s)}/medidas?t=${id(trabajo)}`),
  resumen: (s: string) => ruta(`/solicitud/${id(s)}/resumen`),
  estimacion: (s: string) => ruta(`/solicitud/${id(s)}/estimacion`),
  seguimiento: (s: string) => ruta(`/solicitud/${id(s)}/seguimiento`),
  cotizacion: (emision: string) => ruta(`/cotizacion/${id(emision)}`),
} as const;
