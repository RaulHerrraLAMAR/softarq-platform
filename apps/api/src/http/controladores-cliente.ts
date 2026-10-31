/**
 * Rutas del cliente externo (módulo 17, ADR-0021).
 *
 * - `/cliente/...`: la app del cliente (sesión móvil Bearer, solo cuentas CLIENTE). Capacidades `cliente.solicitudes` y
 *   `cliente.cotizaciones`, que ninguna función interna recibe. El cliente, la organización y el estado salen SIEMPRE de la sesión y de
 *   la base; los cuerpos estrictos rechazan cualquier otro dato.
 * - `/solicitudes/...`: bandeja del equipo (Preparador, `solicitudes.atender`).
 * - `/clientes/:id/acceso` y `/admin/...`: accesos de clientes (Administrador del sistema) y referencias de estimación y trabajos para
 *   clientes (Administrador del catálogo).
 * Nunca se registran cuerpos, medidas ni contraseñas.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  CABECERA_IDEMPOTENCIA,
  EsquemaAtenderSolicitud,
  EsquemaCodigo,
  EsquemaDefinicionTrabajo,
  EsquemaDesignarReferencia,
  EsquemaEstadoAccesoCliente,
  EsquemaGuardarSolicitudCliente,
  EsquemaNuevaSolicitudCliente,
  EsquemaNuevoAccesoCliente,
  EsquemaNuevoProyectoCliente,
  EsquemaRetirarReferencia,
  EsquemaRetiroSolicitudCliente,
  EsquemaRevisionSolicitudCliente,
  type AccesoCliente,
  type AtenderSolicitud,
  type DefinicionTrabajo,
  type DesignarReferencia,
  type DetalleCotizacionCliente,
  type DetalleSolicitudEquipo,
  type EstadoAccesoCliente,
  type EstimacionCliente,
  type GuardarSolicitudCliente,
  type NuevaSolicitudCliente,
  type NuevoAccesoCliente,
  type NuevoProyectoCliente,
  type ProyectoCliente,
  type RespuestaAltaAcceso,
  type RespuestaAtencion,
  type RespuestaCotizacionesCliente,
  type RespuestaEnvioSolicitud,
  type RespuestaProyectosCliente,
  type RespuestaReferencias,
  type RespuestaSolicitudesCliente,
  type RespuestaSolicitudesEquipo,
  type RespuestaTrabajosCliente,
  type RespuestaDefinicionesTrabajo,
  type RetirarReferencia,
  type RetiroSolicitudCliente,
  type RevisionSolicitudCliente,
  type SolicitudDelCliente,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import type { ServicioAdministracionCliente } from "../modules/cliente/aplicacion/servicio-administracion-cliente.js";
import type { ServicioCliente } from "../modules/cliente/aplicacion/servicio-cliente.js";
import type { ServicioEquipo } from "../modules/cliente/aplicacion/servicio-equipo.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { PermitidaEnMovil, Requiere } from "./guardia-sesion.js";
import { SERVICIO_ADMINISTRACION_CLIENTE, SERVICIO_CLIENTE, SERVICIO_EQUIPO } from "./tokens.js";

const EsquemaId = z.object({ id: z.uuid() });
const EsquemaCodigoRuta = z.object({ codigo: EsquemaCodigo });
const EsquemaUsuarioRuta = z.object({ usuarioId: z.uuid() });
const EsquemaConsultaSolicitudes = z.object({
  estado: z
    .string()
    .optional()
    .transform((v) => (v ?? "ENVIADA,EN_PREPARACION").split(",").map((s) => s.trim()))
    .pipe(z.array(z.enum(["ENVIADA", "EN_PREPARACION", "COTIZADA", "RETIRADA"])).min(1).max(4)),
});
const EsquemaClaveIdempotencia = z.uuid();

function noEncontrado(): ErrorApi {
  return new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese registro.");
}

function idDeRuta(params: unknown): string {
  const r = EsquemaId.safeParse(params);
  if (!r.success) throw noEncontrado();
  return r.data.id;
}

function claveIdempotencia(req: Request): string {
  const r = EsquemaClaveIdempotencia.safeParse(req.headers[CABECERA_IDEMPOTENCIA.toLowerCase()]);
  if (!r.success) {
    throw new ErrorApi(400, "SOLICITUD_INVALIDA", "Esta operación exige la cabecera Idempotency-Key con un UUID.", {
      campos: [{ ruta: `cabecera ${CABECERA_IDEMPOTENCIA}`, mensaje: "Indique un UUID generado para esta operación." }],
    });
  }
  return r.data;
}

/** Identidad de la sesión: nunca del cuerpo, la ruta ni las cabeceras. */
const identidadDe = (req: Request) => ({ organizacionId: sesionDe(req).organizacion.id, usuarioId: sesionDe(req).usuario.id });

// ---------------------------------------------------------------------------
// App del cliente
// ---------------------------------------------------------------------------

@Controller("cliente")
@SkipThrottle({ calculo: true })
export class ClienteController {
  constructor(@Inject(SERVICIO_CLIENTE) private readonly servicio: ServicioCliente) {}

  @Get("trabajos")
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  trabajos(@Req() req: Request): Promise<RespuestaTrabajosCliente> {
    return this.servicio.trabajos(identidadDe(req));
  }

  @Get("proyectos")
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  proyectos(@Req() req: Request): Promise<RespuestaProyectosCliente> {
    return this.servicio.proyectos(identidadDe(req));
  }

  @Post("proyectos")
  @HttpCode(201)
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  crearProyecto(@Req() req: Request, @Body({ schema: EsquemaNuevoProyectoCliente }) d: NuevoProyectoCliente): Promise<ProyectoCliente> {
    return this.servicio.crearProyecto(identidadDe(req), d);
  }

  @Get("solicitudes")
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  solicitudes(@Req() req: Request): Promise<RespuestaSolicitudesCliente> {
    return this.servicio.solicitudes(identidadDe(req));
  }

  @Post("solicitudes")
  @HttpCode(201)
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  crearSolicitud(@Req() req: Request, @Body({ schema: EsquemaNuevaSolicitudCliente }) s: NuevaSolicitudCliente): Promise<SolicitudDelCliente> {
    return this.servicio.crearSolicitud(identidadDe(req), s);
  }

  @Get("solicitudes/:id")
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  solicitud(@Req() req: Request, @Param() p: unknown): Promise<SolicitudDelCliente> {
    return this.servicio.solicitud(identidadDe(req), idDeRuta(p));
  }

  @Put("solicitudes/:id")
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  guardar(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaGuardarSolicitudCliente }) g: GuardarSolicitudCliente): Promise<SolicitudDelCliente> {
    return this.servicio.guardar(identidadDe(req), idDeRuta(p), g);
  }

  /** Calcula la estimación preliminar. NO envía la solicitud. Usa el limitador de cálculo. */
  @Post("solicitudes/:id/estimaciones")
  @HttpCode(201)
  @SkipThrottle({ calculo: false })
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  estimar(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaRevisionSolicitudCliente }) b: RevisionSolicitudCliente): Promise<EstimacionCliente> {
    return this.servicio.estimar(identidadDe(req), idDeRuta(p), b.revision);
  }

  /** Envía la solicitud al equipo. Idempotente: un reintento devuelve `repetida: true`. */
  @Post("solicitudes/:id/envio")
  @HttpCode(200)
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  enviar(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaRevisionSolicitudCliente }) b: RevisionSolicitudCliente): Promise<RespuestaEnvioSolicitud> {
    return this.servicio.enviar(identidadDe(req), idDeRuta(p), b.revision);
  }

  @Post("solicitudes/:id/retiro")
  @HttpCode(200)
  @Requiere("cliente.solicitudes")
  @PermitidaEnMovil()
  retirar(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaRetiroSolicitudCliente }) b: RetiroSolicitudCliente): Promise<SolicitudDelCliente> {
    return this.servicio.retirar(identidadDe(req), idDeRuta(p), b.motivo);
  }

  @Get("cotizaciones")
  @Requiere("cliente.cotizaciones")
  @PermitidaEnMovil()
  cotizaciones(@Req() req: Request): Promise<RespuestaCotizacionesCliente> {
    return this.servicio.cotizaciones(identidadDe(req));
  }

  @Get("cotizaciones/:id")
  @Requiere("cliente.cotizaciones")
  @PermitidaEnMovil()
  cotizacion(@Req() req: Request, @Param() p: unknown): Promise<DetalleCotizacionCliente> {
    return this.servicio.cotizacion(identidadDe(req), idDeRuta(p));
  }

  /** PDF emitido: los mismos bytes registrados, solo de una cotización del cliente. */
  @Get("cotizaciones/:id/documento")
  @Requiere("cliente.cotizaciones")
  @PermitidaEnMovil()
  async documento(@Req() req: Request, @Res() res: Response, @Param() p: unknown): Promise<void> {
    const a = await this.servicio.documento(identidadDe(req), idDeRuta(p));
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${a.nombre}"`);
    res.setHeader("Content-Length", String(a.contenido.length));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Repr-Digest", `sha-256=:${Buffer.from(a.sha256, "hex").toString("base64")}:`);
    res.end(a.contenido);
  }
}

// ---------------------------------------------------------------------------
// Panel del equipo: bandeja y atención
// ---------------------------------------------------------------------------

@Controller("solicitudes")
@SkipThrottle({ calculo: true })
export class SolicitudesEquipoController {
  constructor(@Inject(SERVICIO_EQUIPO) private readonly servicio: ServicioEquipo) {}

  @Get()
  @Requiere("solicitudes.atender")
  listar(@Req() req: Request, @Query() q: unknown): Promise<RespuestaSolicitudesEquipo> {
    const c = EsquemaConsultaSolicitudes.safeParse(q);
    if (!c.success) throw new ErrorApi(400, "SOLICITUD_INVALIDA", "Consulta no válida.", { campos: [{ ruta: "estado", mensaje: "Use ENVIADA, EN_PREPARACION, COTIZADA o RETIRADA separados por coma." }] });
    return this.servicio.listar(organizacionDe(req), c.data.estado, 100);
  }

  @Get(":id")
  @Requiere("solicitudes.atender")
  detalle(@Req() req: Request, @Param() p: unknown): Promise<DetalleSolicitudEquipo> {
    return this.servicio.detalle(organizacionDe(req), idDeRuta(p));
  }

  /** Crea la cotización formal en borrador SIN precios elegidos. 201 la primera vez; 200 si ya estaba atendida. */
  @Post(":id/atencion")
  @Requiere("solicitudes.atender")
  async atender(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() p: unknown,
    @Body({ schema: EsquemaAtenderSolicitud }) b: AtenderSolicitud,
  ): Promise<RespuestaAtencion> {
    const r = await this.servicio.atender(organizacionDe(req), sesionDe(req).usuario.id, idDeRuta(p), b);
    res.status(r.repetida ? 200 : 201);
    return r;
  }
}

// ---------------------------------------------------------------------------
// Administración: accesos de clientes, referencias de estimación y trabajos
// ---------------------------------------------------------------------------

const autorDe = (req: Request) => sesionDe(req).usuario.id;

@Controller()
@SkipThrottle({ calculo: true })
export class AdministracionClienteController {
  constructor(@Inject(SERVICIO_ADMINISTRACION_CLIENTE) private readonly servicio: ServicioAdministracionCliente) {}

  // ------------------------------- accesos -------------------------------

  @Get("clientes/:id/acceso")
  @Requiere("personas.administrar")
  acceso(@Req() req: Request, @Param() p: unknown): Promise<AccesoCliente> {
    return this.servicio.acceso(organizacionDe(req), idDeRuta(p));
  }

  /** La contraseña temporal viaja solo en esta respuesta (sin caché) y nunca se registra. */
  @Post("clientes/:id/acceso")
  @HttpCode(201)
  @Requiere("personas.administrar")
  crearAcceso(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaNuevoAccesoCliente }) s: NuevoAccesoCliente): Promise<RespuestaAltaAcceso> {
    return this.servicio.crearAcceso(organizacionDe(req), autorDe(req), idDeRuta(p), s);
  }

  @Put("admin/accesos-cliente/:usuarioId/estado")
  @Requiere("personas.administrar")
  estado(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaEstadoAccesoCliente }) e: EstadoAccesoCliente): Promise<AccesoCliente> {
    const u = EsquemaUsuarioRuta.safeParse(p);
    if (!u.success) throw noEncontrado();
    return this.servicio.cambiarEstado(organizacionDe(req), autorDe(req), u.data.usuarioId, e);
  }

  @Post("admin/accesos-cliente/:usuarioId/contrasena")
  @HttpCode(201)
  @Requiere("personas.administrar")
  restablecer(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaRetirarReferencia }) b: RetirarReferencia): Promise<RespuestaAltaAcceso> {
    const u = EsquemaUsuarioRuta.safeParse(p);
    if (!u.success) throw noEncontrado();
    return this.servicio.restablecer(organizacionDe(req), autorDe(req), u.data.usuarioId, b.motivo, claveIdempotencia(req));
  }

  // ------------------------------- referencias de estimación -------------------------------

  @Get("admin/referencias-estimacion")
  @Requiere("catalogos.administrar")
  referencias(@Req() req: Request): Promise<RespuestaReferencias> {
    return this.servicio.referencias(organizacionDe(req));
  }

  @Put("admin/referencias-estimacion/:codigo")
  @Requiere("catalogos.administrar")
  designar(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaDesignarReferencia }) d: DesignarReferencia): Promise<RespuestaReferencias> {
    const c = EsquemaCodigoRuta.safeParse(p);
    if (!c.success) throw noEncontrado();
    return this.servicio.designar(organizacionDe(req), autorDe(req), c.data.codigo, d);
  }

  @Post("admin/referencias-estimacion/:codigo/retiro")
  @HttpCode(200)
  @Requiere("catalogos.administrar")
  retirar(@Req() req: Request, @Param() p: unknown, @Body({ schema: EsquemaRetirarReferencia }) b: RetirarReferencia): Promise<RespuestaReferencias> {
    const c = EsquemaCodigoRuta.safeParse(p);
    if (!c.success) throw noEncontrado();
    return this.servicio.retirar(organizacionDe(req), autorDe(req), c.data.codigo, b.motivo);
  }

  // ------------------------------- trabajos para clientes -------------------------------

  @Get("admin/trabajos-cliente")
  @Requiere("catalogos.administrar")
  trabajos(@Req() req: Request): Promise<RespuestaDefinicionesTrabajo> {
    return this.servicio.trabajos(organizacionDe(req));
  }

  @Put("admin/trabajos-cliente")
  @Requiere("catalogos.administrar")
  guardarTrabajo(@Req() req: Request, @Body({ schema: EsquemaDefinicionTrabajo }) d: DefinicionTrabajo): Promise<RespuestaDefinicionesTrabajo> {
    return this.servicio.guardarTrabajo(organizacionDe(req), autorDe(req), d);
  }
}
