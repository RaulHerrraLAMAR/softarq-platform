/**
 * Controladores HTTP del catálogo técnico (módulo 12, ADR-0016): `/admin/tipos-estructura`,
 * `/admin/insumos` (detalle, altas, ediciones y conversiones) y `/admin/conceptos` (detalle, altas,
 * ediciones, aprobación y componentes). Los listados de insumos y conceptos y la asignación de
 * tarifa siguen en `controladores-catalogos-admin.ts` (módulo 11).
 *
 * - Todas las rutas exigen `catalogos.administrar` (Administrador del catálogo). Contrato interno:
 *   rendimientos, desperdicios, factores, reglas y trazabilidad nunca pasan a la proyección comercial.
 * - Organización y autor salen SIEMPRE de la sesión; los cuerpos estrictos rechazan cualquier otro
 *   dato. Un código de otra organización responde 404.
 * - Altas y operaciones POST exigen `Idempotency-Key` (UUID).
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  CABECERA_IDEMPOTENCIA,
  CABECERA_IDEMPOTENCIA_REPRODUCIDA,
  EsquemaAprobacionConcepto,
  EsquemaConsultaTiposEstructura,
  EsquemaEdicionComponente,
  EsquemaEdicionConcepto,
  EsquemaEdicionConversion,
  EsquemaEdicionInsumo,
  EsquemaEdicionTipoEstructura,
  EsquemaParametroCodigo,
  EsquemaParametroComponente,
  EsquemaParametroConversion,
  EsquemaSolicitudComponente,
  EsquemaSolicitudConcepto,
  EsquemaSolicitudConversion,
  EsquemaSolicitudInsumo,
  EsquemaSolicitudTipoEstructura,
  type AprobacionConcepto,
  type ConsultaTiposEstructura,
  type DetalleConceptoAdmin,
  type DetalleInsumoAdmin,
  type DetalleTipoEstructura,
  type EdicionComponente,
  type EdicionConcepto,
  type EdicionConversion,
  type EdicionInsumo,
  type EdicionTipoEstructura,
  type InsumoAdmin,
  type RespuestaTiposEstructura,
  type SolicitudComponente,
  type SolicitudConcepto,
  type SolicitudConversion,
  type SolicitudInsumo,
  type SolicitudTipoEstructura,
  type TipoEstructuraAdmin,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import type { ServicioCatalogoTecnico } from "../modules/catalogos/aplicacion/servicio-catalogo-tecnico.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Requiere } from "./guardia-sesion.js";
import { SERVICIO_CATALOGO_TECNICO } from "./tokens.js";

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

/** Parámetros de ruta: un formato inválido responde 404, como un código inexistente. */
function deRuta<T>(esquema: z.ZodType<T>, params: unknown): T {
  const r = esquema.safeParse(params);
  if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "El registro no existe en su organización.");
  return r.data;
}

const codigoDeRuta = (params: unknown) => deRuta(EsquemaParametroCodigo, params).codigo;

function autorDe(req: Request) {
  return { usuarioId: sesionDe(req).usuario.id };
}

function marcarReproducida(res: Response, reproducida: boolean): void {
  if (reproducida) res.setHeader(CABECERA_IDEMPOTENCIA_REPRODUCIDA, "true");
}

@Controller("admin")
@SkipThrottle({ calculo: true })
@Requiere("catalogos.administrar")
export class CatalogoTecnicoController {
  constructor(@Inject(SERVICIO_CATALOGO_TECNICO) private readonly servicio: ServicioCatalogoTecnico) {}

  // ---------------------------- tipos de estructura ---------------------------

  @Get("tipos-estructura")
  listarTipos(@Req() req: Request, @Query({ schema: EsquemaConsultaTiposEstructura }) c: ConsultaTiposEstructura): Promise<RespuestaTiposEstructura> {
    return this.servicio.listarTipos(organizacionDe(req), c);
  }

  @Get("tipos-estructura/:codigo")
  detalleTipo(@Req() req: Request, @Param() params: unknown): Promise<DetalleTipoEstructura> {
    return this.servicio.detalleTipo(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("tipos-estructura")
  @HttpCode(201)
  async crearTipo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudTipoEstructura }) s: SolicitudTipoEstructura,
  ): Promise<TipoEstructuraAdmin> {
    const r = await this.servicio.crearTipo(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.tipo;
  }

  @Patch("tipos-estructura/:codigo")
  editarTipo(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionTipoEstructura }) e: EdicionTipoEstructura): Promise<TipoEstructuraAdmin> {
    return this.servicio.editarTipo(organizacionDe(req), autorDe(req), codigoDeRuta(params), e);
  }

  // ---------------------------------- insumos ---------------------------------

  @Get("insumos/:codigo")
  detalleInsumo(@Req() req: Request, @Param() params: unknown): Promise<DetalleInsumoAdmin> {
    return this.servicio.detalleInsumo(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("insumos")
  @HttpCode(201)
  async crearInsumo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudInsumo }) s: SolicitudInsumo,
  ): Promise<InsumoAdmin> {
    const r = await this.servicio.crearInsumo(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.insumo;
  }

  @Patch("insumos/:codigo")
  editarInsumo(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionInsumo }) e: EdicionInsumo): Promise<InsumoAdmin> {
    return this.servicio.editarInsumo(organizacionDe(req), autorDe(req), codigoDeRuta(params), e);
  }

  /** Val_Conversion: el destino es la unidad base del insumo. */
  @Post("insumos/:codigo/conversiones")
  @HttpCode(201)
  async crearConversion(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaSolicitudConversion }) s: SolicitudConversion,
  ): Promise<DetalleInsumoAdmin> {
    const r = await this.servicio.crearConversion(organizacionDe(req), autorDe(req), codigoDeRuta(params), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }

  /** Factor o fuente con motivo: los conceptos aprobados que la usan vuelven a Borrador. */
  @Patch("insumos/:codigo/conversiones/:unidad")
  editarConversion(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionConversion }) e: EdicionConversion): Promise<DetalleInsumoAdmin> {
    const p = deRuta(EsquemaParametroConversion, params);
    return this.servicio.editarConversion(organizacionDe(req), autorDe(req), p.codigo, p.unidad, e);
  }

  // --------------------------------- conceptos --------------------------------

  @Get("conceptos/:codigo")
  detalleConcepto(@Req() req: Request, @Param() params: unknown): Promise<DetalleConceptoAdmin> {
    return this.servicio.detalleConcepto(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("conceptos")
  @HttpCode(201)
  async crearConcepto(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudConcepto }) s: SolicitudConcepto,
  ): Promise<DetalleConceptoAdmin> {
    const r = await this.servicio.crearConcepto(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }

  @Patch("conceptos/:codigo")
  editarConcepto(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionConcepto }) e: EdicionConcepto): Promise<DetalleConceptoAdmin> {
    return this.servicio.editarConcepto(organizacionDe(req), autorDe(req), codigoDeRuta(params), e);
  }

  /** Concepto_Aprobar (B-13) de la revisión técnica revisada. */
  @Post("conceptos/:codigo/aprobacion")
  @HttpCode(200)
  async aprobarConcepto(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaAprobacionConcepto }) a: AprobacionConcepto,
  ): Promise<DetalleConceptoAdmin> {
    const r = await this.servicio.aprobarConcepto(organizacionDe(req), autorDe(req), codigoDeRuta(params), a, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }

  @Post("conceptos/:codigo/componentes")
  @HttpCode(201)
  async crearComponente(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaSolicitudComponente }) s: SolicitudComponente,
  ): Promise<DetalleConceptoAdmin> {
    const r = await this.servicio.crearComponente(organizacionDe(req), autorDe(req), codigoDeRuta(params), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.detalle;
  }

  @Patch("conceptos/:codigo/componentes/:componente")
  editarComponente(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionComponente }) e: EdicionComponente): Promise<DetalleConceptoAdmin> {
    const p = deRuta(EsquemaParametroComponente, params);
    return this.servicio.editarComponente(organizacionDe(req), autorDe(req), p.codigo, p.componente, e);
  }
}
