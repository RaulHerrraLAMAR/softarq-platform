/**
 * Endpoints de sesión (ADR-0007):
 * - `GET  /api/v1/auth/csrf`   (público): sesión previa en la cookie y token CSRF para el acceso.
 * - `POST /api/v1/auth/sesion` (sesión previa + CSRF): inicio de sesión con correo y contraseña.
 * - `GET  /api/v1/auth/sesion`: identidad, organización, funciones, capacidades y token CSRF.
 * - `DELETE /api/v1/auth/sesion` (CSRF): cierre de sesión (revocación en la base).
 *
 * Nunca se registran el cuerpo, el correo, la contraseña, la cookie ni los tokens.
 */
import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Post, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  EsquemaSolicitudAcceso,
  type RespuestaCsrf,
  type RespuestaSesion,
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
import { ConSesionPrevia, Publico, Requiere, sesionPreviaDe } from "./guardia-sesion.js";
import { CONFIGURACION, RELOJ_SESIONES, SERVICIO_AUTENTICACION } from "./tokens.js";

export function presentarSesion(s: ContextoSesion, csrfToken: string): RespuestaSesion {
  return {
    usuario: { nombre: s.usuario.nombre, correo: s.usuario.correo },
    organizacion: { codigo: s.organizacion.codigo, nombre: s.organizacion.nombre, esDemo: s.organizacion.esDemo },
    funciones: [...s.funciones],
    capacidades: [...s.capacidades],
    expiraEn: s.expiraEn.toISOString(),
    inactividadMinutos: POLITICA_SESION.inactividadMs / 60_000,
    csrfToken,
  };
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
      case "CORRECTO":
        escribirCookieSesion(res, r.tokens.tokenSesion, r.tokens.expiraEn, this.reloj.ahora());
        this.registro?.log(`[${id}] ACCESO_OK`);
        return presentarSesion(r.contexto, r.tokens.csrfToken);
    }
  }

  @Get("sesion")
  @Requiere("sesion.propia")
  consultar(@Req() req: Request): RespuestaSesion {
    const s = sesionDe(req);
    return presentarSesion(s, this.servicio.csrfDe(s.sesionId));
  }

  @Delete("sesion")
  @HttpCode(204)
  @Requiere("sesion.propia")
  async cerrar(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.servicio.cerrarSesion(sesionDe(req).sesionId);
    borrarCookieSesion(res);
    this.registro?.log(`[${solicitudIdDe(res)}] CIERRE`);
  }
}
