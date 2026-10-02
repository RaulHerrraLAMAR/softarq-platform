/**
 * Especificación OpenAPI 3.1 de la API v1, generada desde los esquemas Zod de @softarq/contracts
 * (la misma definición que valida en ejecución). `docs/api/openapi.json` debe coincidir con este
 * documento; una prueba lo comprueba.
 */
import {
  EsquemaConsultaConceptos,
  EsquemaConsultaOpcionesPrecio,
  EsquemaConsultaTiposAdicional,
  EsquemaRespuestaCalculoDemo,
  EsquemaRespuestaConceptos,
  EsquemaRespuestaError,
  EsquemaRespuestaOpcionesPrecio,
  EsquemaRespuestaSalud,
  EsquemaRespuestaTiposAdicional,
  EsquemaSolicitudCalculoDemo,
} from "@softarq/contracts";
import { z } from "zod";

const json = (schema: z.ZodType, io: "input" | "output") => {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  return resto;
};

const errores = (...estados: number[]) =>
  Object.fromEntries(
    estados.map((s) => [
      String(s),
      { description: DESCRIPCION_ERROR[s], content: { "application/json": { schema: { $ref: "#/components/schemas/RespuestaError" } } } },
    ]),
  );

const DESCRIPCION_ERROR: Record<number, string> = {
  400: "SOLICITUD_INVALIDA: no cumple el contrato (campos con su ruta) o JSON mal formado.",
  404: "NO_ENCONTRADO: ruta o códigos inexistentes en la organización.",
  413: "CUERPO_DEMASIADO_GRANDE.",
  415: "TIPO_DE_CONTENIDO_NO_ADMITIDO: el cuerpo debe ser application/json.",
  422: "CALCULO_BLOQUEADO: bloqueos de negocio (códigos BL), sin importes.",
  429: "DEMASIADAS_SOLICITUDES (cabecera Retry-After).",
  503: "SERVICIO_NO_DISPONIBLE: PostgreSQL no disponible.",
  500: "ERROR_INTERNO.",
};

function parametrosQuery(schema: z.ZodType): unknown[] {
  const s = json(schema, "input") as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(s.properties ?? {}).map(([name, sch]) => ({
    name,
    in: "query",
    required: (s.required ?? []).includes(name),
    schema: sch,
  }));
}

const ok = (ref: string, descripcion: string) => ({
  description: descripcion,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

export function construirDocumentoOpenApi(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "SoftArq API (DEMO local)",
      version: "1.0.0",
      description:
        "API local de SoftArq: catálogos DEMO y cálculo de cotizaciones con datos de PostgreSQL. " +
        "Solo escucha en 127.0.0.1. Sin autenticación (contexto fijo de la organización DEMO; ver ADR-0005). " +
        "Los importes y cantidades viajan como texto decimal. Todos los datos son DEMO y no tienen validez comercial.",
    },
    servers: [{ url: "http://127.0.0.1:3000" }],
    paths: {
      "/health": {
        get: {
          summary: "Salud del servicio y de PostgreSQL",
          responses: {
            "200": ok("RespuestaSalud", "Servicio y base de datos disponibles."),
            "503": ok("RespuestaSalud", "Base de datos no disponible."),
            ...errores(429),
          },
        },
      },
      "/api/v1/catalogos/conceptos": {
        get: {
          summary: "Conceptos activos y aprobados (sin costos internos)",
          parameters: parametrosQuery(EsquemaConsultaConceptos),
          responses: { "200": ok("RespuestaConceptos", "Conceptos."), ...errores(400, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/opciones-precio": {
        get: {
          summary: "Opciones de precio vigentes por insumo de los conceptos indicados (sin precios)",
          parameters: parametrosQuery(EsquemaConsultaOpcionesPrecio),
          responses: { "200": ok("RespuestaOpcionesPrecio", "Opciones por insumo."), ...errores(400, 404, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/tipos-adicional": {
        get: {
          summary: "Tipos de costo adicional",
          parameters: parametrosQuery(EsquemaConsultaTiposAdicional),
          responses: { "200": ok("RespuestaTiposAdicional", "Tipos."), ...errores(400, 429, 503, 500) },
        },
      },
      "/api/v1/calculos/demo": {
        post: {
          summary: "Calcula una cotización DEMO con datos de PostgreSQL y devuelve la proyección comercial",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SolicitudCalculoDemo" } } },
          },
          responses: {
            "200": ok("RespuestaCalculoDemo", "Cotización calculada (solo vista comercial)."),
            ...errores(400, 404, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/openapi.json": {
        get: { summary: "Esta especificación", responses: { "200": { description: "Documento OpenAPI 3.1." } } },
      },
    },
    components: {
      schemas: {
        SolicitudCalculoDemo: json(EsquemaSolicitudCalculoDemo, "input"),
        RespuestaSalud: json(EsquemaRespuestaSalud, "output"),
        RespuestaConceptos: json(EsquemaRespuestaConceptos, "output"),
        RespuestaOpcionesPrecio: json(EsquemaRespuestaOpcionesPrecio, "output"),
        RespuestaTiposAdicional: json(EsquemaRespuestaTiposAdicional, "output"),
        RespuestaCalculoDemo: json(EsquemaRespuestaCalculoDemo, "output"),
        RespuestaError: json(EsquemaRespuestaError, "output"),
      },
    },
  };
}
