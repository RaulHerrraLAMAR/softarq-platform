/**
 * Endpoints de sesión (ADR-0007):
 * - `GET  /api/v1/auth/csrf`   (público): sesión previa en la cookie y token CSRF para el acceso.
 * - `POST /api/v1/auth/sesion` (sesión previa + CSRF): inicio de sesión con correo y contraseña.
 * - `GET  /api/v1/auth/sesion`: identidad, organización, funciones, capacidades y token CSRF.
 * - `DELETE /api/v1/auth/sesion` (CSRF): cierre de sesión (revocación en la base).
 * - `POST /api/v1/auth/contrasena` (CSRF): cambio propio (obligatorio con una contraseña temporal;
 *   módulo 13, ADR-0017). Revoca todas las sesiones de la persona: hay que volver a entrar.
 *
 * Nunca se registran el cuerpo, el correo, la contraseña, la cookie ni los tokens.
 */
import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Post, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  EsquemaCambioContrasena,
  EsquemaSolicitudAcceso,
  type CambioContrasena,
  type RespuestaAccesoMovil,
  type RespuestaCsrf,
  type RespuestaSesion,
  type RespuestaSesionMovil,
  type SolicitudAcceso,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import type { ConfiguracionApi } from "../config/entorno.js";
import { POLITICA_SESION } from "../modules/autenticacion/dominio/politica.js";
import type {
  ContextoSesion,
  RelojSesiones,
  ServicioAutenticacion,
} from "../modules/autenticacion/aplicacion/servicio-autenticacion.js";
import { sesionDe } from "./contexto.js";
import { borrarCookieSesion, escribirCookieSesion, leerCookieSesion } from "./cookies.js";
import { ErrorApi, solicitudIdDe } from "./errores.js";
import {
  AccesoMovil,
  ConSesionPrevia,
  PermitidaConCambioPendiente,
  PermitidaEnMovil,
  Publico,
  Requiere,
  leerBearer,
  sesionPreviaDe,
} from "./guardia-sesion.js";
import { CONFIGURACION, RELOJ_SESIONES, SERVICIO_AUTENTICACION } from "./tokens.js";

/** Identidad y contexto de la sesión, comunes a los canales web y móvil (sin token alguno). */
export function presentarSesionMovil(s: ContextoSesion): RespuestaSesionMovil {
  return {
    usuario: { nombre: s.usuario.nombre, correo: s.usuario.correo },
    organizacion: { codigo: s.organizacion.codigo, nombre: s.organizacion.nombre, esDemo: s.organizacion.esDemo },
    funciones: [...s.funciones],
    capacidades: [...s.capacidades],
    expiraEn: s.expiraEn.toISOString(),
    inactividadMinutos: POLITICA_SESION.inactividadMs / 60_000,
    cambioContrasenaRequerido: s.cambioContrasenaRequerido,
  };
}

export function presentarSesion(s: ContextoSesion, csrfToken: string): RespuestaSesion {
  return { ...presentarSesionMovil(s), csrfToken };
}

/** IP del socket (sin trust proxy: X-Forwarded-For se ignora). */
function ipDe(req: Request): string {
  return req.socket.remoteAddress ?? "desconocida";
}

@Controller("auth")
@SkipThrottle({ calculo: true })
export class AutenticacionController {
  private readonly registro: Logger | null;

  constructor(
    @Inject(SERVICIO_AUTENTICACION) private readonly servicio: ServicioAutenticacion,
    @Inject(RELOJ_SESIONES) private readonly reloj: RelojSesiones,
    @Inject(CONFIGURACION) config: ConfiguracionApi,
  ) {
    this.registro = config.registro === "ninguno" ? null : new Logger("Seguridad");
  }

  @Get("csrf")
  @Publico()
  async csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<RespuestaCsrf> {
    const t = await this.servicio.crearSesionPrevia(leerCookieSesion(req));
    escribirCookieSesion(res, t.tokenSesion, t.expiraEn, this.reloj.ahora());
    return { csrfToken: t.csrfToken };
  }

  @Post("sesion")
  @HttpCode(200)
  @ConSesionPrevia()
  async iniciar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudAcceso }) solicitud: SolicitudAcceso,
  ): Promise<RespuestaSesion> {
    const r = await this.servicio.iniciarSesion(sesionPreviaDe(req), solicitud.correo, solicitud.contrasena, ipDe(req));
    const id = solicitudIdDe(res);
    switch (r.estado) {
      case "LIMITE":
        this.registro?.log(`[${id}] ACCESO_LIMITE`);
        res.setHeader("Retry-After", String(r.reintentarEnSegundos));
        throw new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiados intentos de acceso; espere antes de volver a intentarlo.");
      case "CREDENCIALES_INVALIDAS":
        this.registro?.log(`[${id}] ACCESO_FALLO`);
        throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.");
      case "TEMPORAL_CADUCADA":
        this.registro?.log(`[${id}] ACCESO_TEMPORAL_CADUCADA`);
        throw new ErrorApi(401, "CONTRASENA_TEMPORAL_CADUCADA", "La contraseña temporal caducó. Pida al Administrador del sistema un restablecimiento.");
      case "CORRECTO":
        escribirCookieSesion(res, r.tokens.tokenSesion, r.tokens.expiraEn, this.reloj.ahora());
        this.registro?.log(`[${id}] ACCESO_OK`);
        return presentarSesion(r.contexto, r.tokens.csrfToken);
    }
  }

  @Get("sesion")
  @Requiere("sesion.propia")
  @PermitidaConCambioPendiente()
  consultar(@Req() req: Request): RespuestaSesion {
    const s = sesionDe(req);
    return presentarSesion(s, this.servicio.csrfDe(s.sesionId));
  }

  @Delete("sesion")
  @HttpCode(204)
  @Requiere("sesion.propia")
  @PermitidaConCambioPendiente()
  @PermitidaEnMovil()
  async cerrar(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.servicio.cerrarSesion(sesionDe(req).sesionId);
    borrarCookieSesion(res);
    this.registro?.log(`[${solicitudIdDe(res)}] CIERRE`);
  }

  /**
   * Cambio propio de contraseña. Nunca se registran las contraseñas. La respuesta borra la cookie: la
   * base ya revocó todas las sesiones de la persona y hay que entrar con la contraseña nueva.
   */
  @Post("contrasena")
  @HttpCode(204)
  @Requiere("sesion.propia")
  @PermitidaConCambioPendiente()
  @PermitidaEnMovil()
  async cambiarContrasena(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaCambioContrasena }) c: CambioContrasena,
  ): Promise<void> {
    const r = await this.servicio.cambiarContrasena(sesionDe(req), c.actual, c.nueva, ipDe(req));
    const id = solicitudIdDe(res);
    switch (r.estado) {
      case "LIMITE":
        res.setHeader("Retry-After", String(r.reintentarEnSegundos));
        throw new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiados intentos; espere antes de volver a intentarlo.");
      case "ACTUAL_INCORRECTA":
        this.registro?.log(`[${id}] CAMBIO_CONTRASENA_FALLO`);
        throw new ErrorApi(422, "CONTRASENA_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.", {
          campos: [{ ruta: "actual", mensaje: "La contraseña actual no es correcta." }],
        });
      case "TEMPORAL_CADUCADA":
        throw new ErrorApi(401, "CONTRASENA_TEMPORAL_CADUCADA", "La contraseña temporal caducó. Pida al Administrador del sistema un restablecimiento.");
      case "CAMBIADA":
        borrarCookieSesion(res);
        this.registro?.log(`[${id}] CAMBIO_CONTRASENA`);
    }
  }
}

/**
 * Canal móvil (módulo 16, ADR-0020): sesión por `Authorization: Bearer`, sin cookie ni CSRF.
 * - `POST /api/v1/auth/movil/sesion`: inicio de sesión; devuelve el token opaco una sola vez.
 * - `GET  /api/v1/auth/movil/sesion`: revalida la sesión y devuelve identidad y capacidades vigentes.
 * El cierre y el cambio de contraseña reutilizan `DELETE /auth/sesion` y `POST /auth/contrasena`.
 * Nunca se registran el cuerpo, el correo, la contraseña ni el token.
 */
@Controller("auth/movil")
@SkipThrottle({ calculo: true })
export class AutenticacionMovilController {
  private readonly registro: Logger | null;

  constructor(
    @Inject(SERVICIO_AUTENTICACION) private readonly servicio: ServicioAutenticacion,
    @Inject(CONFIGURACION) config: ConfiguracionApi,
  ) {
    this.registro = config.registro === "ninguno" ? null : new Logger("Seguridad");
  }

  @Post("sesion")
  @HttpCode(200)
  @AccesoMovil()
  async iniciar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudAcceso }) solicitud: SolicitudAcceso,
  ): Promise<RespuestaAccesoMovil> {
    const r = await this.servicio.iniciarSesionMovil(solicitud.correo, solicitud.contrasena, ipDe(req));
    const id = solicitudIdDe(res);
    switch (r.estado) {
      case "LIMITE":
        this.registro?.log(`[${id}] ACCESO_MOVIL_LIMITE`);
        res.setHeader("Retry-After", String(r.reintentarEnSegundos));
        throw new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiados intentos de acceso; espere antes de volver a intentarlo.");
      case "CREDENCIALES_INVALIDAS":
        this.registro?.log(`[${id}] ACCESO_MOVIL_FALLO`);
        throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.");
      case "TEMPORAL_CADUCADA":
        this.registro?.log(`[${id}] ACCESO_MOVIL_TEMPORAL_CADUCADA`);
        throw new ErrorApi(401, "CONTRASENA_TEMPORAL_CADUCADA", "La contraseña temporal caducó. Pida al Administrador del sistema un restablecimiento.");
      case "CORRECTO":
        this.registro?.log(`[${id}] ACCESO_MOVIL_OK`);
        return { ...presentarSesionMovil(r.contexto), tokenSesion: r.tokens.tokenSesion };
    }
  }

  @Get("sesion")
  @Requiere("sesion.propia")
  @PermitidaConCambioPendiente()
  @PermitidaEnMovil()
  consultar(@Req() req: Request): RespuestaSesionMovil {
    // Este canal es solo para sesiones móviles: una cookie web no lo usa.
    if (leerBearer(req) === undefined) throw new ErrorApi(403, "ACCESO_MOVIL_NO_PERMITIDO", "Esta consulta es solo para la app móvil.");
    return presentarSesionMovil(sesionDe(req));
  }
}
