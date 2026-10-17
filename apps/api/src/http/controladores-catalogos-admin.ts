/**
 * Controladores HTTP de la administración de catálogos (módulo 11, ADR-0015): `/admin/...`.
 *
 * - Todas las rutas exigen `catalogos.administrar` (Administrador del catálogo). Los contratos de
 *   este módulo son internos: llevan importes de proveedor y tarifas, y nunca se mezclan con la
 *   proyección comercial.
 * - La organización y el autor salen SIEMPRE de la sesión; los cuerpos estrictos rechazan cualquier
 *   dato de identidad u organización. Un código de otra organización responde 404.
 * - Las altas y las operaciones POST exigen `Idempotency-Key` (UUID); al reproducir una clave se
 *   devuelve el resultado con `Idempotent-Replayed: true`.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  CABECERA_IDEMPOTENCIA,
  CABECERA_IDEMPOTENCIA_REPRODUCIDA,
  EsquemaAnulacionPrecio,
  EsquemaAsignacionTarifa,
  EsquemaCierreVigenciaPrecio,
  EsquemaConsultaConceptosAdmin,
  EsquemaConsultaInsumosAdmin,
  EsquemaConsultaPreciosAdmin,
  EsquemaConsultaProductosAdmin,
  EsquemaConsultaProveedoresAdmin,
  EsquemaConsultaTarifasAdmin,
  EsquemaEdicionProducto,
  EsquemaEdicionProveedor,
  EsquemaEdicionTarifa,
  EsquemaParametroCodigo,
  EsquemaSolicitudPrecio,
  EsquemaSolicitudProducto,
  EsquemaSolicitudProveedor,
  EsquemaSolicitudTarifa,
  type AnulacionPrecio,
  type AsignacionTarifa,
  type CierreVigenciaPrecio,
  type ConceptoTarifaAdmin,
  type ConsultaConceptosAdmin,
  type ConsultaInsumosAdmin,
  type ConsultaPreciosAdmin,
  type ConsultaProductosAdmin,
  type ConsultaProveedoresAdmin,
  type ConsultaTarifasAdmin,
  type DetallePrecioAdmin,
  type DetalleProductoAdmin,
  type DetalleProveedorAdmin,
  type DetalleTarifaAdmin,
  type EdicionProducto,
  type EdicionProveedor,
  type EdicionTarifa,
  type PrecioAdmin,
  type ProductoAdmin,
  type ProveedorAdmin,
  type RespuestaCierreVigencia,
  type RespuestaConceptosAdmin,
  type RespuestaInsumosAdmin,
  type RespuestaPreciosAdmin,
  type RespuestaProductosAdmin,
  type RespuestaProveedoresAdmin,
  type RespuestaTarifasAdmin,
  type RespuestaUnidades,
  type SolicitudPrecio,
  type SolicitudProducto,
  type SolicitudProveedor,
  type SolicitudTarifa,
  type TarifaAdmin,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import type { ServicioAdministracionCatalogos } from "../modules/catalogos/aplicacion/servicio-administracion.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Requiere } from "./guardia-sesion.js";
import { SERVICIO_ADMIN_CATALOGOS } from "./tokens.js";

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

/** Códigos de la ruta: un formato inválido responde 404, como un código inexistente. */
function codigoDeRuta(params: unknown): string {
  const r = EsquemaParametroCodigo.safeParse(params);
  if (!r.success) throw new ErrorApi(404, "NO_ENCONTRADO", "El registro no existe en su organización.");
  return r.data.codigo;
}

function autorDe(req: Request) {
  return { usuarioId: sesionDe(req).usuario.id };
}

function marcarReproducida(res: Response, reproducida: boolean): void {
  if (reproducida) res.setHeader(CABECERA_IDEMPOTENCIA_REPRODUCIDA, "true");
}

@Controller("admin")
@SkipThrottle({ calculo: true })
@Requiere("catalogos.administrar")
export class AdministracionCatalogosController {
  constructor(@Inject(SERVICIO_ADMIN_CATALOGOS) private readonly servicio: ServicioAdministracionCatalogos) {}

  // ------------------------------- proveedores ------------------------------

  @Get("proveedores")
  listarProveedores(@Req() req: Request, @Query({ schema: EsquemaConsultaProveedoresAdmin }) c: ConsultaProveedoresAdmin): Promise<RespuestaProveedoresAdmin> {
    return this.servicio.listarProveedores(organizacionDe(req), c);
  }

  @Get("proveedores/:codigo")
  detalleProveedor(@Req() req: Request, @Param() params: unknown): Promise<DetalleProveedorAdmin> {
    return this.servicio.detalleProveedor(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("proveedores")
  @HttpCode(201)
  async crearProveedor(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudProveedor }) s: SolicitudProveedor,
  ): Promise<ProveedorAdmin> {
    const r = await this.servicio.crearProveedor(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.proveedor;
  }

  @Patch("proveedores/:codigo")
  editarProveedor(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionProveedor }) e: EdicionProveedor): Promise<ProveedorAdmin> {
    return this.servicio.editarProveedor(organizacionDe(req), autorDe(req), codigoDeRuta(params), e);
  }

  // -------------------------------- productos -------------------------------

  @Get("productos")
  listarProductos(@Req() req: Request, @Query({ schema: EsquemaConsultaProductosAdmin }) c: ConsultaProductosAdmin): Promise<RespuestaProductosAdmin> {
    return this.servicio.listarProductos(organizacionDe(req), c);
  }

  @Get("productos/:codigo")
  detalleProducto(@Req() req: Request, @Param() params: unknown): Promise<DetalleProductoAdmin> {
    return this.servicio.detalleProducto(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("productos")
  @HttpCode(201)
  async crearProducto(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudProducto }) s: SolicitudProducto,
  ): Promise<ProductoAdmin> {
    const r = await this.servicio.crearProducto(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.producto;
  }

  @Patch("productos/:codigo")
  editarProducto(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionProducto }) e: EdicionProducto): Promise<ProductoAdmin> {
    return this.servicio.editarProducto(organizacionDe(req), autorDe(req), codigoDeRuta(params), e);
  }

  // --------------------------------- precios --------------------------------

  @Get("precios")
  listarPrecios(@Req() req: Request, @Query({ schema: EsquemaConsultaPreciosAdmin }) c: ConsultaPreciosAdmin): Promise<RespuestaPreciosAdmin> {
    return this.servicio.listarPrecios(organizacionDe(req), c);
  }

  @Get("precios/:codigo")
  detallePrecio(@Req() req: Request, @Param() params: unknown): Promise<DetallePrecioAdmin> {
    return this.servicio.detallePrecio(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("precios")
  @HttpCode(201)
  async registrarPrecio(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudPrecio }) s: SolicitudPrecio,
  ): Promise<PrecioAdmin> {
    const r = await this.servicio.registrarPrecio(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.precio;
  }

  /** «Anular precio erróneo» (Precio_Anular): definitivo, con motivo. */
  @Post("precios/:codigo/anulacion")
  @HttpCode(200)
  async anularPrecio(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaAnulacionPrecio }) a: AnulacionPrecio,
  ): Promise<PrecioAdmin> {
    const r = await this.servicio.anularPrecio(organizacionDe(req), autorDe(req), codigoDeRuta(params), a, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.precio;
  }

  /** «Cerrar vigencia y registrar sucesor» (adaptación autorizada; P3 pendiente). */
  @Post("precios/:codigo/cierre-vigencia")
  @HttpCode(201)
  async cerrarVigencia(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaCierreVigenciaPrecio }) c: CierreVigenciaPrecio,
  ): Promise<RespuestaCierreVigencia> {
    const { reproducida, ...r } = await this.servicio.cerrarVigencia(organizacionDe(req), autorDe(req), codigoDeRuta(params), c, claveIdempotencia(req));
    marcarReproducida(res, reproducida);
    return r;
  }

  // --------------------------------- tarifas --------------------------------

  @Get("tarifas")
  listarTarifas(@Req() req: Request, @Query({ schema: EsquemaConsultaTarifasAdmin }) c: ConsultaTarifasAdmin): Promise<RespuestaTarifasAdmin> {
    return this.servicio.listarTarifas(organizacionDe(req), c);
  }

  @Get("tarifas/:codigo")
  detalleTarifa(@Req() req: Request, @Param() params: unknown): Promise<DetalleTarifaAdmin> {
    return this.servicio.detalleTarifa(organizacionDe(req), codigoDeRuta(params));
  }

  @Post("tarifas")
  @HttpCode(201)
  async registrarTarifa(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body({ schema: EsquemaSolicitudTarifa }) s: SolicitudTarifa,
  ): Promise<TarifaAdmin> {
    const r = await this.servicio.registrarTarifa(organizacionDe(req), autorDe(req), s, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.tarifa;
  }

  /** Las tarifas no se editan: solo se desactivan o reactivan. */
  @Patch("tarifas/:codigo")
  editarTarifa(@Req() req: Request, @Param() params: unknown, @Body({ schema: EsquemaEdicionTarifa }) e: EdicionTarifa): Promise<TarifaAdmin> {
    return this.servicio.editarTarifa(organizacionDe(req), autorDe(req), codigoDeRuta(params), e);
  }

  // ---------------------------- conceptos (tarifa) ---------------------------

  @Get("conceptos")
  listarConceptos(@Req() req: Request, @Query({ schema: EsquemaConsultaConceptosAdmin }) c: ConsultaConceptosAdmin): Promise<RespuestaConceptosAdmin> {
    return this.servicio.listarConceptos(organizacionDe(req), c);
  }

  /** «Asignar tarifa» (Word §3.5): solo cambia la tarifa del concepto. */
  @Post("conceptos/:codigo/tarifa")
  @HttpCode(200)
  async asignarTarifa(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param() params: unknown,
    @Body({ schema: EsquemaAsignacionTarifa }) a: AsignacionTarifa,
  ): Promise<ConceptoTarifaAdmin> {
    const r = await this.servicio.asignarTarifa(organizacionDe(req), autorDe(req), codigoDeRuta(params), a, claveIdempotencia(req));
    marcarReproducida(res, r.reproducida);
    return r.concepto;
  }

  // ------------------------------- referencias ------------------------------

  @Get("insumos")
  listarInsumos(@Req() req: Request, @Query({ schema: EsquemaConsultaInsumosAdmin }) c: ConsultaInsumosAdmin): Promise<RespuestaInsumosAdmin> {
    return this.servicio.listarInsumos(organizacionDe(req), c);
  }

  @Get("unidades")
  listarUnidades(): Promise<RespuestaUnidades> {
    return this.servicio.listarUnidades();
  }
}
