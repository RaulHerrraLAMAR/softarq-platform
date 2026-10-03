/**
 * Controladores HTTP de clientes, proyectos y cotizaciones (ADR-0008). Validan con los contratos,
 * coordinan y presentan; las reglas están en la capa de aplicación.
 *
 * - La organización y el autor salen SIEMPRE de la sesión (`sesionDe(req)`); los cuerpos estrictos
 *   rechazan cualquier `organizacionId` y los ids de la ruta solo se buscan dentro de esa
 *   organización (un id ajeno responde 404, igual que uno inexistente).
 * - Las altas exigen la cabecera `Idempotency-Key` (UUID). Al reproducir una clave ya usada se
 *   devuelve el recurso creado con `Idempotent-Replayed: true`.
 * - Permisos: la guardia exige las capacidades de `@Requiere`; ocultar botones en la web no basta.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  CABECERA_IDEMPOTENCIA,
  CABECERA_IDEMPOTENCIA_REPRODUCIDA,
  EsquemaConsultaClientes,
  EsquemaConsultaCotizaciones,
  EsquemaConsultaProyectos,
  EsquemaConsultaRevisiones,
  EsquemaDecisionRevision,
  EsquemaParametroNumeroVersion,
  EsquemaRetiroRevision,
  EsquemaSolicitudEnvioRevision,
  EsquemaEdicionCliente,
  EsquemaEdicionProyecto,
  EsquemaParametroId,
  EsquemaParametroVersion,
  EsquemaSolicitudBorrador,
  EsquemaSolicitudCliente,
  EsquemaSolicitudCotizacion,
  EsquemaSolicitudProyecto,
  EsquemaSolicitudVersion,
  type Cliente,
  type ConsultaClientes,
  type ConsultaCotizaciones,
  type ConsultaProyectos,
  type ConsultaRevisiones,
  type DecisionRevisionSolicitud,
  type DetalleRevision,
  type RespuestaRevisiones,
  type RetiroRevision,
  type SolicitudEnvioRevision,
  type DetalleCliente,
  type DetalleCotizacion,
  type EdicionCliente,
  type EdicionProyecto,
  type Proyecto,
  type RespuestaBorradorGuardado,
  type RespuestaClientes,
  type RespuestaCotizaciones,
  type RespuestaProyectos,
  type SolicitudBorrador,
  type SolicitudCliente,
  type SolicitudCotizacion,
  type SolicitudProyecto,
  type SolicitudVersion,
  type Version,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import type { ServicioClientes } from "../modules/cotizaciones/aplicacion/servicio-clientes.js";
import type { ServicioCotizaciones } from "../modules/cotizaciones/aplicacion/servicio-cotizaciones.js";
import type { ServicioRevisiones } from "../modules/cotizaciones/aplicacion/servicio-revisiones.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Requiere } from "./guardia-sesion.js";
import { SERVICIO_CLIENTES, SERVICIO_COTIZACIONES, SERVICIO_REVISIONES } from "./tokens.js";

const EsquemaClaveIdempotencia = z.uuid();

/** Clave de idempotencia obligatoria (UUID). Nunca se registra en los logs. */
function claveIdempotencia(req: Request): string {
  const valor = req.headers[CABECERA_IDEMPOTENCIA.toLowerCase()];
  const r = EsquemaClaveIdempotencia.safeParse(valor);
  if (!r.success) {
    throw new ErrorApi(400, "SOLICITUD_INVALIDA", "Las altas exigen la cabecera Idempotency-Key con un UUID.", {
      campos: [{ ruta: `cabecera ${CABECERA_IDEMPOTENCIA}`, mensaje: "Indique un UUID generado para esta operación." }],
    });
  }
  return r.data;
}

/** Ids de la ruta: un formato inválido responde 404, como un id inexistente. */
function idDeRuta(params: unknown): string {
  const r = EsquemaParametroId.safeParse(params);
  if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "El registro no existe en su organización.");
  return r.data.id;
}

function autorDe(req: Request) {
  const s = sesionDe(req);
  return { usuarioId: s.usuario.id, nombre: s.usuario.nombre };
}

function marcarReproducida(res: Response, reproducida: boolean): void {
  if (reproducida) res.setHeader(CABECERA_IDEMPOTENCIA_REPRODUCIDA, "true");
}

@Controller("clientes")
@SkipThrottle({ calculo: true })
export class ClientesController {
  constructor(@Inject(SERVICIO_CLIENTES) private readonly servicio: ServicioClientes) {}

  @Get()
  @Requiere("clientes.consultar")
  listar(@Req() req: Request, @Query({ schema: EsquemaConsultaClientes }) c: ConsultaClientes): Promise<RespuestaClientes> {
    return this.servicio.listarClientes(organizacionDe(req), c);
  }

  @Get(":id")
  @Requiere("clientes.consultar")
  detalle(@Req() req: Request, @Param() params: unknown): Promise<DetalleCliente> {
    return this.servicio.detalleCliente(organizacionDe(req), idDeRuta(params));
  }

  @Post()
  @HttpCode(201)
  @Requiere("clientes.gestionar")
  async crear(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudCliente }) s: SolicitudCliente,
  ): Promise<Cliente> {
    const clave = claveIdempotencia(req);
    const r = await this.servicio.crearCliente(organizacionDe(req), autorDe(req), s, clave);
    marcarReproducida(res, r.reproducida);
    return r.cliente;
  }

  @Patch(":id")
  @Requiere("clientes.gestionar")
  editar(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionCliente }) e: EdicionCliente): Promise<Cliente> {
    return this.servicio.editarCliente(organizacionDe(req), autorDe(req), idDeRuta(params), e);
  }
}

@Controller("proyectos")
@SkipThrottle({ calculo: true })
export class ProyectosController {
  constructor(@Inject(SERVICIO_CLIENTES) private readonly servicio: ServicioClientes) {}

  @Get()
  @Requiere("clientes.consultar")
  listar(@Req() req: Request, @Query({ schema: EsquemaConsultaProyectos }) c: ConsultaProyectos): Promise<RespuestaProyectos> {
    return this.servicio.listarProyectos(organizacionDe(req), c);
  }

  @Get(":id")
  @Requiere("clientes.consultar")
  detalle(@Req() req: Request, @Param() params: unknown): Promise<Proyecto> {
    return this.servicio.detalleProyecto(organizacionDe(req), idDeRuta(params));
  }

  @Post()
  @HttpCode(201)
  @Requiere("clientes.gestionar")
  async crear(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudProyecto }) s: SolicitudProyecto,
  ): Promise<Proyecto> {
    const clave = claveIdempotencia(req);
    const r = await this.servicio.crearProyecto(organizacionDe(req), autorDe(req), s, clave);
    marcarReproducida(res, r.reproducida);
    return r.proyecto;
  }

  @Patch(":id")
  @Requiere("clientes.gestionar")
  editar(
    @Req() req: Request,
    @Param() params: unknown,
    @Body({ schema: EsquemaEdicionProyecto }) e: EdicionProyecto,
  ): Promise<Proyecto> {
    return this.servicio.editarProyecto(organizacionDe(req), autorDe(req), idDeRuta(params), e);
  }
}

@Controller("cotizaciones")
@SkipThrottle({ calculo: true })
export class CotizacionesController {
  constructor(@Inject(SERVICIO_COTIZACIONES) private readonly servicio: ServicioCotizaciones) {}

  @Get()
  @Requiere("cotizaciones.consultar")
  listar(
    @Req() req: Request,
    @Query({ schema: EsquemaConsultaCotizaciones }) c: ConsultaCotizaciones,
  ): Promise<RespuestaCotizaciones> {
    return this.servicio.listar(organizacionDe(req), c);
  }

  @Get(":id")
  @Requiere("cotizaciones.consultar")
  detalle(@Req() req: Request, @Param() params: unknown): Promise<DetalleCotizacion> {
    return this.servicio.detalle(organizacionDe(req), idDeRuta(params));
  }

  /** Reserva el folio al crear el borrador (como el libro). */
  @Post()
  @HttpCode(201)
  @Requiere("cotizaciones.preparar")
  async crear(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudCotizacion }) s: SolicitudCotizacion,
  ): Promise<DetalleCotizacion> {
    const clave = claveIdempotencia(req);
    const r = await this.servicio.crear(organizacionDe(req), autorDe(req), s, clave);
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }

  /** Guarda la captura solo si sigue en la revisión indicada (409 CONFLICTO_EDICION si no). */
  @Put(":id/borrador")
  @Requiere("cotizaciones.preparar")
  guardarBorrador(
    @Req() req: Request,
    @Param() params: unknown,
    @Body({ schema: EsquemaSolicitudBorrador }) s: SolicitudBorrador,
  ): Promise<RespuestaBorradorGuardado> {
    return this.servicio.guardarBorrador(organizacionDe(req), autorDe(req), idDeRuta(params), s);
  }

  /**
   * Calcula en el servidor con el borrador guardado (revisión indicada) y las condiciones
   * vigentes, y guarda una versión inmutable. El cliente no envía resultados ni importes.
   */
  @Post(":id/versiones")
  @HttpCode(201)
  @SkipThrottle({ calculo: false })
  @Requiere("cotizaciones.preparar", "calculo.ejecutar")
  async crearVersion(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaSolicitudVersion }) s: SolicitudVersion,
  ): Promise<Version> {
    const id = idDeRuta(params);
    const clave = claveIdempotencia(req);
    if (!sesionDe(req).organizacion.esDemo) {
      throw new ErrorApi(403, "SIN_PERMISO", "Las versiones calculadas solo están disponibles para organizaciones DEMO.");
    }
    const r = await this.servicio.crearVersion(organizacionDe(req), autorDe(req), id, s, clave);
    marcarReproducida(res, r.reproducida);
    return r.version;
  }

  /** Versión guardada tal como se almacenó: nunca se recalcula al consultarla. */
  @Get(":id/versiones/:numero")
  @Requiere("cotizaciones.consultar")
  version(@Req() req: Request, @Param() params: unknown): Promise<Version> {
    const r = EsquemaParametroVersion.safeParse(params);
    if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "La versión no existe en su organización.");
    return this.servicio.consultarVersion(organizacionDe(req), r.data.id, r.data.numero);
  }
}

// ---------------------------------------------------------------------------
// Revisión y aprobación (módulo 7, ADR-0009)
// ---------------------------------------------------------------------------

function actorDe(req: Request) {
  const s = sesionDe(req);
  return { usuarioId: s.usuario.id, capacidades: s.capacidades };
}

/** Enviar a revisión una versión concreta: `POST /cotizaciones/{id}/versiones/{numero}/revisiones`. */
@Controller("cotizaciones")
@SkipThrottle({ calculo: true })
export class EnvioRevisionController {
  constructor(@Inject(SERVICIO_REVISIONES) private readonly servicio: ServicioRevisiones) {}

  @Post(":id/versiones/:numero/revisiones")
  @HttpCode(201)
  @Requiere("revisiones.enviar")
  async enviar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaSolicitudEnvioRevision }) s: SolicitudEnvioRevision,
  ): Promise<DetalleRevision> {
    const r = EsquemaParametroNumeroVersion.safeParse(params);
    if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "La versión no existe en su organización.");
    const clave = claveIdempotencia(req);
    const e = await this.servicio.enviar(organizacionDe(req), actorDe(req), r.data.id, r.data.numero, s, clave);
    marcarReproducida(res, e.reproducida);
    return e.detalle;
  }
}

@Controller("revisiones")
@SkipThrottle({ calculo: true })
export class RevisionesController {
  constructor(@Inject(SERVICIO_REVISIONES) private readonly servicio: ServicioRevisiones) {}

  /** Bandeja: por omisión, las pendientes (las más antiguas primero). */
  @Get()
  @Requiere("cotizaciones.consultar")
  listar(@Req() req: Request, @Query({ schema: EsquemaConsultaRevisiones }) c: ConsultaRevisiones): Promise<RespuestaRevisiones> {
    return this.servicio.listar(organizacionDe(req), actorDe(req), c);
  }

  /** Revisión, versión revisada (proyección comercial guardada), verificación vigente e historial. */
  @Get(":id")
  @Requiere("cotizaciones.consultar")
  detalle(@Req() req: Request, @Param() params: unknown): Promise<DetalleRevision> {
    return this.servicio.detalle(organizacionDe(req), actorDe(req), idDeRuta(params));
  }

  /** Aprobar o solicitar cambios sobre la versión y la ficha vistas (BL-17 por identidad). */
  @Post(":id/decision")
  @HttpCode(200)
  @Requiere("revisiones.decidir")
  async decidir(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaDecisionRevision }) s: DecisionRevisionSolicitud,
  ): Promise<DetalleRevision> {
    const id = idDeRuta(params);
    const clave = claveIdempotencia(req);
    const r = await this.servicio.decidir(organizacionDe(req), actorDe(req), id, s, clave);
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }

  /** Retirar una revisión pendiente para corregir (Preparador). */
  @Post(":id/retiro")
  @HttpCode(200)
  @Requiere("revisiones.enviar")
  async retirar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaRetiroRevision }) s: RetiroRevision,
  ): Promise<DetalleRevision> {
    const id = idDeRuta(params);
    const clave = claveIdempotencia(req);
    const r = await this.servicio.retirar(organizacionDe(req), actorDe(req), id, s, clave);
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }
}
