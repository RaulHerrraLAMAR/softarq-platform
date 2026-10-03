/**
 * Controladores HTTP: validan (Standard Schema/Zod), coordinan y presentan. No contienen reglas
 * de cálculo ni consultas: delegan en la capa de aplicación.
 *
 * Autorización (ADR-0007): la guardia global exige sesión y la capacidad de `@Requiere`; la
 * organización de las consultas sale de la sesión (`organizacionDe(req)`), nunca del cliente.
 */
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  EsquemaConsultaConceptos,
  EsquemaConsultaOpcionesPrecio,
  EsquemaConsultaTiposAdicional,
  EsquemaSolicitudCalculoDemo,
  type ConsultaConceptos,
  type ConsultaOpcionesPrecio,
  type ConsultaTiposAdicional,
  type RespuestaCalculoDemo,
  type RespuestaConceptos,
  type RespuestaOpcionesPrecio,
  type RespuestaSalud,
  type RespuestaTiposAdicional,
  type SolicitudCalculoDemo,
} from "@softarq/contracts";
import type { Request, Response } from "express";
import type { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import {
  consultarConceptos,
  consultarOpcionesPrecio,
  consultarTiposAdicional,
} from "../modules/catalogos/aplicacion/consultas-catalogo.js";
import { calcularDemo } from "../modules/calculo/aplicacion/calculo-demo.js";
import type { Reloj } from "../modules/calculo/aplicacion/reloj.js";
import type { ServicioBaseDeDatos } from "./base-de-datos.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Publico, Requiere } from "./guardia-sesion.js";
import { construirDocumentoOpenApi } from "./openapi.js";
import { BASE_DE_DATOS, RELOJ, REPOSITORIO_CATALOGOS } from "./tokens.js";

/** GET /health (sin prefijo): servicio y PostgreSQL, sin configuración interna. */
@Controller("health")
@SkipThrottle({ calculo: true })
@Publico()
export class SaludController {
  constructor(@Inject(BASE_DE_DATOS) private readonly bd: ServicioBaseDeDatos) {}

  @Get()
  async salud(@Res({ passthrough: true }) res: Response): Promise<RespuestaSalud> {
    if (await this.bd.disponible()) return { estado: "ok", baseDeDatos: "disponible" };
    res.status(503);
    return { estado: "degradado", baseDeDatos: "no disponible" };
  }
}

@Controller("catalogos")
@SkipThrottle({ calculo: true })
@Requiere("catalogos.consultar")
export class CatalogosController {
  constructor(
    @Inject(REPOSITORIO_CATALOGOS) private readonly repo: RepositorioCatalogos,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Get("conceptos")
  conceptos(
    @Req() req: Request,
    @Query({ schema: EsquemaConsultaConceptos }) consulta: ConsultaConceptos,
  ): Promise<RespuestaConceptos> {
    return consultarConceptos(this.repo, organizacionDe(req), consulta);
  }

  @Get("opciones-precio")
  async opcionesPrecio(
    @Req() req: Request,
    @Query({ schema: EsquemaConsultaOpcionesPrecio }) consulta: ConsultaOpcionesPrecio,
  ): Promise<RespuestaOpcionesPrecio> {
    const r = await consultarOpcionesPrecio(this.repo, organizacionDe(req), consulta.conceptos, this.reloj.hoy());
    if (r.estado === "NO_ENCONTRADO") {
      throw new ErrorApi(404, "NO_ENCONTRADO", "Uno o más conceptos no existen o no están disponibles.", {
        faltantes: r.faltantes,
      });
    }
    return r.respuesta;
  }

  @Get("tipos-adicional")
  tiposAdicional(
    @Req() req: Request,
    @Query({ schema: EsquemaConsultaTiposAdicional }) consulta: ConsultaTiposAdicional,
  ): Promise<RespuestaTiposAdicional> {
    return consultarTiposAdicional(this.repo, organizacionDe(req), consulta);
  }
}

@Controller("calculos")
@Requiere("calculo.ejecutar")
export class CalculosController {
  constructor(
    @Inject(REPOSITORIO_CATALOGOS) private readonly repo: RepositorioCatalogos,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** POST /api/v1/calculos/demo: no escribe cotizaciones ni modifica catálogos. */
  @Post("demo")
  @HttpCode(200)
  async demo(
    @Req() req: Request,
    @Body({ schema: EsquemaSolicitudCalculoDemo }) solicitud: SolicitudCalculoDemo,
  ): Promise<RespuestaCalculoDemo> {
    if (!sesionDe(req).organizacion.esDemo) {
      throw new ErrorApi(403, "SIN_PERMISO", "El cálculo DEMO solo está disponible para organizaciones DEMO.");
    }
    const r = await calcularDemo(this.repo, organizacionDe(req), solicitud, this.reloj.hoy());
    switch (r.estado) {
      case "CALCULADO":
        return r.respuesta;
      case "BLOQUEADO":
        throw new ErrorApi(422, "CALCULO_BLOQUEADO", "El cálculo está bloqueado por reglas de negocio.", {
          problemas: r.problemas,
        });
      case "ENTRADA_INVALIDA":
        throw new ErrorApi(400, "SOLICITUD_INVALIDA", "La captura no cumple las reglas de medición o de formato.", {
          campos: r.campos,
        });
      case "NO_ENCONTRADO":
        throw new ErrorApi(404, "NO_ENCONTRADO", "Uno o más códigos no existen en el catálogo.", {
          faltantes: r.faltantes,
        });
    }
  }
}

@Controller("openapi.json")
@SkipThrottle({ calculo: true })
@Publico()
export class OpenApiController {
  private readonly documento = construirDocumentoOpenApi();

  @Get()
  openapi(): unknown {
    return this.documento;
  }
}
