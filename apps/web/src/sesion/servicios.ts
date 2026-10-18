/**
 * Endpoints de sesión (ADR-0007). Ninguna función guarda tokens: el de sesión vive en la cookie
 * HttpOnly (el navegador lo gestiona) y el CSRF lo conserva en memoria el proveedor de sesión.
 */
import { EsquemaRespuestaCsrf, EsquemaRespuestaSesion, type CambioContrasena, type RespuestaCsrf, type RespuestaSesion } from "@softarq/contracts";
import { z } from "zod";
import type { ClienteApi, ResultadoApi } from "../api/cliente.ts";

export interface ServiciosSesion {
  /** Sesión previa (cookie) y token CSRF para el formulario de acceso. */
  prepararAcceso(): Promise<ResultadoApi<RespuestaCsrf>>;
  iniciar(correo: string, contrasena: string): Promise<ResultadoApi<RespuestaSesion>>;
  consultar(signal?: AbortSignal): Promise<ResultadoApi<RespuestaSesion>>;
  cerrar(): Promise<ResultadoApi<null>>;
  /** Cambio de la contraseña propia (módulo 13): 204; el servidor revoca todas las sesiones. */
  cambiarContrasena(datos: CambioContrasena): Promise<ResultadoApi<null>>;
}

export function crearServiciosSesion(cliente: ClienteApi): ServiciosSesion {
  return {
    prepararAcceso: () => cliente.obtener("/api/v1/auth/csrf", EsquemaRespuestaCsrf, { sinAvisoDeSesion: true }),
    iniciar: (correo, contrasena) =>
      cliente.enviar("/api/v1/auth/sesion", EsquemaRespuestaSesion, {
        cuerpo: { correo, contrasena },
        sinAvisoDeSesion: true,
        tiempoMaximo: 20_000,
      }),
    consultar: (signal) => cliente.obtener("/api/v1/auth/sesion", EsquemaRespuestaSesion, { signal, sinAvisoDeSesion: true }),
    cerrar: () => cliente.eliminar("/api/v1/auth/sesion", { sinAvisoDeSesion: true }),
    cambiarContrasena: (datos) => cliente.enviar("/api/v1/auth/contrasena", z.null(), { cuerpo: datos, sinAvisoDeSesion: true, tiempoMaximo: 20_000 }),
  };
}
