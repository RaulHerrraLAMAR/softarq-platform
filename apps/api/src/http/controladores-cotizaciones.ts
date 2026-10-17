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
import { EsquemaConsultaSeguimiento, EsquemaRegistroRespuesta, EsquemaCorreccionRespuesta,
  type SeguimientoEmision, type RegistroRespuesta, type CorreccionRespuesta, type EventoRespuestaCliente } from "@softarq/contracts";
import { ServicioRespuestas } from "../modules/cotizaciones/aplicacion/servicio-respuestas.js";
import { SERVICIO_EXCEPCIONES, SERVICIO_RESPUESTAS } from "./tokens.js";
import { EsquemaConsultaComponentesExcepcion, EsquemaDecisionExcepcion,
  type DecisionExcepcionSolicitud, type ExcepcionesVersion, type RespuestaComponentesExcepcion } from "@softarq/contracts";
import type { ServicioExcepciones } from "../modules/cotizaciones/aplicacion/servicio-excepciones.js";
import {
  CABECERA_IDEMPOTENCIA,
  CABECERA_IDEMPOTENCIA_REPRODUCIDA,
  EsquemaConsultaClientes,
  EsquemaConsultaCotizaciones,
  EsquemaConsultaProyectos,
  EsquemaAnulacionAprobacion,
  EsquemaConsultaRevisiones,
  EsquemaDecisionRevision,
  EsquemaDescarteCotizacion,
  EsquemaEdicionEmisor,
  EsquemaSolicitudEmision,
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
  type AnulacionAprobacion,
  type ConsultaRevisiones,
  type DecisionRevisionSolicitud,
  type DescarteCotizacion,
  type DetalleEmision,
  type EdicionEmisor,
  type Emisor,
  type SolicitudEmision,
  type ValidacionEmision,
  type VerificacionRevision,
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
import type { ServicioEmisiones } from "../modules/cotizaciones/aplicacion/servicio-emisiones.js";
import type { ServicioRevisiones } from "../modules/cotizaciones/aplicacion/servicio-revisiones.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Requiere } from "./guardia-sesion.js";
import { SERVICIO_CLIENTES, SERVICIO_COTIZACIONES, SERVICIO_EMISIONES, SERVICIO_REVISIONES } from "./tokens.js";

const EsquemaClaveIdempotencia = z.uuid();

@Controller("emisiones")
@SkipThrottle({ calculo: true })
export class RespuestasController {
  constructor(@Inject(SERVICIO_RESPUESTAS) private readonly servicio: ServicioRespuestas) {}
  @Get(":id/seguimiento")
  @Requiere("cotizaciones.consultar")
  seguimiento(@Req() req: Request, @Param() params: unknown, @Query({ schema: EsquemaConsultaSeguimiento }) q: { antesDe?: number }): Promise<SeguimientoEmision> {
    return this.servicio.seguimiento(organizacionDe(req), actorDe(req), idDeRuta(params), q.antesDe);
  }
  @Post(":id/respuestas")
  @HttpCode(201)
  @Requiere("respuestas.registrar")
  async registrar(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param() params: unknown,
    @Body({ schema: EsquemaRegistroRespuesta }) s: RegistroRespuesta): Promise<EventoRespuestaCliente> {
    const r = await this.servicio.registrar(organizacionDe(req), actorDe(req), idDeRuta(params), null, s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.evento;
  }
  @Post(":id/respuestas/:eventoId/correcciones")
  @HttpCode(201)
  @Requiere("respuestas.corregir")
  async corregir(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param() params: unknown,
    @Body({ schema: EsquemaCorreccionRespuesta }) s: CorreccionRespuesta): Promise<EventoRespuestaCliente> {
    const p = z.strictObject({ id: z.uuid(), eventoId: z.uuid() }).safeParse(params);
    if (!p.success) throw new ErrorApi(404, "NO_ENCONTRADO", "La emisión o respuesta no existe en su organización.");
    const r = await this.servicio.registrar(organizacionDe(req), actorDe(req), p.data.id, p.data.eventoId, s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.evento;
  }
}

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
    // Las excepciones del borrador solo para quien tiene su capacidad (módulo 10).
    return this.servicio.detalle(organizacionDe(req), idDeRuta(params), sesionDe(req).capacidades.includes("excepciones.consultar"));
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

  /**
   * Descartar la cotización con motivo (B-37; ADR-0010). No elude revisiones pendientes ni
   * aprobaciones vigentes; conserva folio, versiones y eventos.
   */
  @Post(":id/descarte")
  @HttpCode(200)
  @Requiere("cotizaciones.preparar")
  async descartar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaDescarteCotizacion }) s: DescarteCotizacion,
  ): Promise<DetalleCotizacion> {
    const id = idDeRuta(params);
    const clave = claveIdempotencia(req);
    const r = await this.servicio.descartar(organizacionDe(req), autorDe(req), id, s, clave);
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }
}

// ---------------------------------------------------------------------------
// Revisión y aprobación (módulo 7, ADR-0009)
// ---------------------------------------------------------------------------

function actorDe(req: Request) {
  const s = sesionDe(req);
  return { usuarioId: s.usuario.id, nombre: s.usuario.nombre, capacidades: s.capacidades, funciones: s.funciones };
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

  /** Anular una aprobación antes de emitir, con motivo (Revisor; módulo 8, ADR-0010). */
  @Post(":id/anulacion")
  @HttpCode(200)
  @Requiere("revisiones.decidir")
  async anular(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaAnulacionAprobacion }) s: AnulacionAprobacion,
  ): Promise<DetalleRevision> {
    const id = idDeRuta(params);
    const clave = claveIdempotencia(req);
    const r = await this.servicio.anular(organizacionDe(req), actorDe(req), id, s, clave);
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

// ---------------------------------------------------------------------------
// Emisión, documento y emisor (módulo 8, ADR-0010)
// ---------------------------------------------------------------------------

function versionDeRuta(params: unknown): { id: string; numero: number } {
  const r = EsquemaParametroNumeroVersion.safeParse(params);
  if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "La versión no existe en su organización.");
  return r.data;
}

/**
 * Verificación vigente de una versión (módulo 11, ADR-0015): el editor la consulta para avisar que
 * el catálogo cambió después del cálculo. Sin importes ni datos internos.
 */
@Controller("cotizaciones")
@SkipThrottle({ calculo: true })
export class VerificacionVersionController {
  constructor(@Inject(SERVICIO_REVISIONES) private readonly servicio: ServicioRevisiones) {}

  @Get(":id/versiones/:numero/verificacion")
  @Requiere("cotizaciones.consultar")
  verificar(@Req() req: Request, @Param() params: unknown): Promise<VerificacionRevision> {
    const v = versionDeRuta(params);
    return this.servicio.verificacionDeVersion(organizacionDe(req), v.id, v.numero);
  }
}

/** Validar y emitir una versión concreta: `/cotizaciones/{id}/versiones/{numero}/emision`. */
@Controller("cotizaciones")
@SkipThrottle({ calculo: true })
export class EmisionVersionController {
  constructor(@Inject(SERVICIO_EMISIONES) private readonly servicio: ServicioEmisiones) {}

  /** Lo que se emitiría hoy (destinatario, emisor, textos, fechas y total) y lo que lo impide. */
  @Get(":id/versiones/:numero/emision/validacion")
  @Requiere("cotizaciones.consultar")
  validar(@Req() req: Request, @Param() params: unknown): Promise<ValidacionEmision> {
    const v = versionDeRuta(params);
    return this.servicio.validar(organizacionDe(req), actorDe(req), v.id, v.numero);
  }

  /**
   * Emite la versión con la aprobación indicada: genera el PDF, lo guarda y registra la emisión.
   * 201 solo cuando el documento y el registro existen.
   */
  @Post(":id/versiones/:numero/emision")
  @HttpCode(201)
  @Requiere("emisiones.emitir")
  async emitir(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaSolicitudEmision }) s: SolicitudEmision,
  ): Promise<DetalleEmision> {
    const v = versionDeRuta(params);
    const clave = claveIdempotencia(req);
    const r = await this.servicio.emitir(organizacionDe(req), actorDe(req), v.id, v.numero, s, clave);
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }
}

@Controller("emisiones")
@SkipThrottle({ calculo: true })
export class EmisionesController {
  constructor(@Inject(SERVICIO_EMISIONES) private readonly servicio: ServicioEmisiones) {}

  /** Registro de la emisión y contenido exacto del documento emitido. */
  @Get(":id")
  @Requiere("cotizaciones.consultar")
  detalle(@Req() req: Request, @Param() params: unknown): Promise<DetalleEmision> {
    return this.servicio.detalle(organizacionDe(req), idDeRuta(params));
  }

  /**
   * Descarga autenticada del PDF emitido: los mismos bytes registrados (tamaño y SHA-256
   * comprobados), nunca regenerados. Nombre de archivo armado solo con el folio validado.
   */
  @Get(":id/documento")
  @Requiere("cotizaciones.consultar")
  async documento(@Req() req: Request, @Res() res: Response, @Param() params: unknown): Promise<void> {
    const a = await this.servicio.archivo(organizacionDe(req), idDeRuta(params));
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

/** Datos del emisor de la organización (BL-15). Los configura el Administrador del sistema. */
@Controller("emisor")
@SkipThrottle({ calculo: true })
export class EmisorController {
  constructor(@Inject(SERVICIO_EMISIONES) private readonly servicio: ServicioEmisiones) {}

  @Get()
  @Requiere("cotizaciones.consultar")
  consultar(@Req() req: Request): Promise<Emisor> {
    return this.servicio.emisor(organizacionDe(req), actorDe(req));
  }

  @Put()
  @Requiere("emisor.configurar")
  guardar(@Req() req: Request, @Body({ schema: EsquemaEdicionEmisor }) s: EdicionEmisor): Promise<Emisor> {
    return this.servicio.guardarEmisor(organizacionDe(req), actorDe(req), s);
  }
}

// ---------------------------------------------------------------------------
// Excepciones B-22 (módulo 10, ADR-0014): contrato interno con permiso propio.
// ---------------------------------------------------------------------------

/** Componentes de catálogo para registrar una excepción de rendimiento (Preparador). */
@Controller("excepciones")
@SkipThrottle({ calculo: true })
export class ExcepcionesCatalogoController {
  constructor(@Inject(SERVICIO_EXCEPCIONES) private readonly servicio: ServicioExcepciones) {}

  @Get("componentes")
  @Requiere("cotizaciones.preparar", "excepciones.consultar")
  componentes(
    @Req() req: Request,
    @Query({ schema: EsquemaConsultaComponentesExcepcion }) q: { conceptos: string[] },
  ): Promise<RespuestaComponentesExcepcion> {
    return this.servicio.componentes(organizacionDe(req), q.conceptos);
  }
}

/** Excepciones congeladas en una versión, con sus decisiones: `GET /cotizaciones/{id}/versiones/{n}/excepciones`. */
@Controller("cotizaciones")
@SkipThrottle({ calculo: true })
export class ExcepcionesVersionController {
  constructor(@Inject(SERVICIO_EXCEPCIONES) private readonly servicio: ServicioExcepciones) {}

  @Get(":id/versiones/:numero/excepciones")
  @Requiere("cotizaciones.consultar", "excepciones.consultar")
  consultar(@Req() req: Request, @Param() params: unknown): Promise<ExcepcionesVersion> {
    const r = EsquemaParametroVersion.safeParse(params);
    if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "La versión no existe en su organización.");
    return this.servicio.consultar(organizacionDe(req), actorDe(req), r.data.id, r.data.numero);
  }
}

/** Autorizar o rechazar la excepción N durante la revisión: `POST /revisiones/{id}/excepciones/{numero}/decision`. */
@Controller("revisiones")
@SkipThrottle({ calculo: true })
export class ExcepcionesRevisionController {
  constructor(@Inject(SERVICIO_EXCEPCIONES) private readonly servicio: ServicioExcepciones) {}

  @Post(":id/excepciones/:numero/decision")
  @HttpCode(200)
  @Requiere("revisiones.decidir", "excepciones.consultar")
  async decidir(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaDecisionExcepcion }) s: DecisionExcepcionSolicitud,
  ): Promise<ExcepcionesVersion> {
    const p = z.strictObject({ id: z.uuid(), numero: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number) }).safeParse(params);
    if (!p.success) throw new ErrorApi(404, "NO_ENCONTRADO", "La revisión o la excepción no existe en su organización.");
    const r = await this.servicio.decidir(organizacionDe(req), actorDe(req), p.data.id, p.data.numero, s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.excepciones;
  }
}
