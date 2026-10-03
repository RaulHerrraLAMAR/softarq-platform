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
  EsquemaRespuestaCsrf,
  EsquemaRespuestaError,
  EsquemaRespuestaOpcionesPrecio,
  EsquemaRespuestaSalud,
  EsquemaRespuestaSesion,
  EsquemaRespuestaTiposAdicional,
  EsquemaSolicitudAcceso,
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
  401: "NO_AUTENTICADO (sin cookie de sesión) o SESION_NO_VALIDA (vencida, revocada o desconocida; se borra la cookie).",
  403: "SIN_PERMISO (la función no concede la capacidad), CSRF_NO_VALIDO u ORIGEN_NO_PERMITIDO.",
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
        "Solo escucha en 127.0.0.1. Autenticación con sesión opaca en una cookie HttpOnly (`softarq_sesion`); " +
        "la organización, la identidad y las funciones salen de la sesión (ADR-0007). Las solicitudes POST y DELETE " +
        "exigen la cabecera X-CSRF-Token de la sesión y un Origin permitido. " +
        "Los importes y cantidades viajan como texto decimal. Todos los datos son DEMO y no tienen validez comercial.",
    },
    servers: [{ url: "http://localhost:3000", description: "API local (escucha en 127.0.0.1; el navegador usa localhost)." }],
    security: [{ cookieSesion: [] }],
    paths: {
      "/health": {
        get: {
          summary: "Salud del servicio y de PostgreSQL",
          security: [],
          responses: {
            "200": ok("RespuestaSalud", "Servicio y base de datos disponibles."),
            "503": ok("RespuestaSalud", "Base de datos no disponible."),
            ...errores(429),
          },
        },
      },
      "/api/v1/auth/csrf": {
        get: {
          summary: "Crea la sesión previa al acceso (cookie) y devuelve su token CSRF",
          security: [],
          responses: { "200": ok("RespuestaCsrf", "Token CSRF para iniciar sesión."), ...errores(429, 503, 500) },
        },
      },
      "/api/v1/auth/sesion": {
        post: {
          summary: "Inicia sesión con correo y contraseña (exige la sesión previa y su token CSRF)",
          security: [{ cookieSesion: [], tokenCsrf: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SolicitudAcceso" } } },
          },
          responses: {
            "200": ok("RespuestaSesion", "Sesión iniciada; cookie nueva y token CSRF nuevo."),
            ...errores(400, 401, 403, 413, 415, 429, 503, 500),
          },
        },
        get: {
          summary: "Identidad, organización, funciones, capacidades y token CSRF de la sesión actual",
          responses: { "200": ok("RespuestaSesion", "Sesión vigente."), ...errores(401, 429, 503, 500) },
        },
        delete: {
          summary: "Cierra la sesión (revocación en el servidor) y borra la cookie",
          security: [{ cookieSesion: [], tokenCsrf: [] }],
          responses: { "204": { description: "Sesión cerrada." }, ...errores(401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/conceptos": {
        get: {
          summary: "Conceptos activos y aprobados (sin costos internos)",
          parameters: parametrosQuery(EsquemaConsultaConceptos),
          responses: { "200": ok("RespuestaConceptos", "Conceptos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/opciones-precio": {
        get: {
          summary: "Opciones de precio vigentes por insumo de los conceptos indicados (sin precios)",
          parameters: parametrosQuery(EsquemaConsultaOpcionesPrecio),
          responses: { "200": ok("RespuestaOpcionesPrecio", "Opciones por insumo."), ...errores(400, 401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/tipos-adicional": {
        get: {
          summary: "Tipos de costo adicional",
          parameters: parametrosQuery(EsquemaConsultaTiposAdicional),
          responses: { "200": ok("RespuestaTiposAdicional", "Tipos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/calculos/demo": {
        post: {
          summary: "Calcula una cotización DEMO con datos de PostgreSQL y devuelve la proyección comercial (capacidad calculo.ejecutar: Preparador)",
          security: [{ cookieSesion: [], tokenCsrf: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SolicitudCalculoDemo" } } },
          },
          responses: {
            "200": ok("RespuestaCalculoDemo", "Cotización calculada (solo vista comercial)."),
            ...errores(400, 401, 403, 404, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/openapi.json": {
        get: { summary: "Esta especificación", security: [], responses: { "200": { description: "Documento OpenAPI 3.1." } } },
      },
    },
    components: {
      securitySchemes: {
        cookieSesion: {
          type: "apiKey",
          in: "cookie",
          name: "softarq_sesion",
          description: "Sesión opaca (HttpOnly, SameSite=Strict, Path=/api/v1, host-only).",
        },
        tokenCsrf: {
          type: "apiKey",
          in: "header",
          name: "X-CSRF-Token",
          description: "Token CSRF de la sesión (GET /api/v1/auth/csrf antes del acceso; después, el de la respuesta de sesión).",
        },
      },
      schemas: {
        SolicitudAcceso: json(EsquemaSolicitudAcceso, "input"),
        RespuestaCsrf: json(EsquemaRespuestaCsrf, "output"),
        RespuestaSesion: json(EsquemaRespuestaSesion, "output"),
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
