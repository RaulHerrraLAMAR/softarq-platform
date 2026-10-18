/**
 * Controladores HTTP de parámetros y personas (módulo 13, ADR-0017): `/admin/parametros` y
 * `/admin/personas`, solo para el Administrador del sistema (`parametros.administrar`,
 * `personas.administrar`).
 *
 * - La organización y el autor salen SIEMPRE de la sesión; los cuerpos estrictos rechazan cualquier
 *   otro dato (identidad, organización, ambiente, moneda, contraseña).
 * - Alta y restablecimiento exigen `Idempotency-Key`. La contraseña temporal solo viaja en esa
 *   respuesta (sin caché, como todas las de la API); nunca se registra.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  CABECERA_IDEMPOTENCIA,
  CABECERA_IDEMPOTENCIA_REPRODUCIDA,
  EsquemaConsultaPersonas,
  EsquemaEdicionParametros,
  EsquemaEdicionPersona,
  EsquemaParametroPersona,
  EsquemaRestablecimientoContrasena,
  EsquemaSolicitudPersona,
  type ConsultaPersonas,
  type DetalleParametros,
  type DetallePersona,
  type EdicionParametros,
  type EdicionPersona,
  type PersonaAdmin,
  type RespuestaCredencialTemporal,
  type RespuestaPersonas,
  type RestablecimientoContrasena,
  type SolicitudPersona,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import type { ServicioAdministracionSistema } from "../modules/administracion/aplicacion/servicio-administracion-sistema.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Requiere } from "./guardia-sesion.js";
import { SERVICIO_ADMINISTRACION_SISTEMA } from "./tokens.js";

const EsquemaClaveIdempotencia = z.uuid();

function claveIdempotencia(req: Request): string {
  const r = EsquemaClaveIdempotencia.safeParse(req.headers[CABECERA_IDEMPOTENCIA.toLowerCase()]);
  if (!r.success) {
    throw new ErrorApi(400, "SOLICITUD_INVALIDA", "Esta operación exige la cabecera Idempotency-Key con un UUID.", {
      campos: [{ ruta: `cabecera ${CABECERA_IDEMPOTENCIA}`, mensaje: "Indique un UUID generado para esta operación." }],
    });
  }
  return r.data;
}

function idDeRuta(params: unknown): string {
  const r = EsquemaParametroPersona.safeParse(params);
  if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "El registro no existe en su organización.");
  return r.data.id;
}

const autorDe = (req: Request) => ({ usuarioId: sesionDe(req).usuario.id });

function marcar(res: Response, r: RespuestaCredencialTemporal): RespuestaCredencialTemporal {
  if (r.contrasenaEntregada) res.setHeader(CABECERA_IDEMPOTENCIA_REPRODUCIDA, "true");
  return r;
}

@Controller("admin")
@SkipThrottle({ calculo: true })
export class AdministracionSistemaController {
  constructor(@Inject(SERVICIO_ADMINISTRACION_SISTEMA) private readonly servicio: ServicioAdministracionSistema) {}

  // ------------------------------- parámetros -------------------------------

  @Get("parametros")
  @Requiere("parametros.administrar")
  detalleParametros(@Req() req: Request): Promise<DetalleParametros> {
    return this.servicio.detalleParametros(organizacionDe(req));
  }

  @Patch("parametros")
  @Requiere("parametros.administrar")
  editarParametros(@Req() req: Request, @Body({ schema: EsquemaEdicionParametros }) e: EdicionParametros): Promise<DetalleParametros> {
    return this.servicio.editarParametros(organizacionDe(req), autorDe(req), e);
  }

  // -------------------------------- personas --------------------------------

  @Get("personas")
  @Requiere("personas.administrar")
  listarPersonas(@Req() req: Request, @Query({ schema: EsquemaConsultaPersonas }) c: ConsultaPersonas): Promise<RespuestaPersonas> {
    return this.servicio.listarPersonas(organizacionDe(req), c);
  }

  @Get("personas/:id")
  @Requiere("personas.administrar")
  detallePersona(@Req() req: Request, @Param() params: unknown): Promise<DetallePersona> {
    return this.servicio.detallePersona(organizacionDe(req), idDeRuta(params));
  }

  /** Alta (B-39) con contraseña temporal mostrada una sola vez. */
  @Post("personas")
  @HttpCode(201)
  @Requiere("personas.administrar")
  async crearPersona(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudPersona }) s: SolicitudPersona,
  ): Promise<RespuestaCredencialTemporal> {
    return marcar(res, await this.servicio.crearPersona(organizacionDe(req), autorDe(req), s, claveIdempotencia(req)));
  }

  @Patch("personas/:id")
  @Requiere("personas.administrar")
  editarPersona(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionPersona }) e: EdicionPersona): Promise<PersonaAdmin> {
    return this.servicio.editarPersona(organizacionDe(req), autorDe(req), idDeRuta(params), e);
  }

  /** Restablecimiento: temporal nueva, la anterior deja de valer y se revocan todas sus sesiones. */
  @Post("personas/:id/restablecimiento")
  @HttpCode(200)
  @Requiere("personas.administrar")
  async restablecer(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaRestablecimientoContrasena }) r: RestablecimientoContrasena,
  ): Promise<RespuestaCredencialTemporal> {
    return marcar(res, await this.servicio.restablecerContrasena(organizacionDe(req), autorDe(req), idDeRuta(params), r.motivo, claveIdempotencia(req)));
  }
}
