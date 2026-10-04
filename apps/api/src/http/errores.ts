/**
 * Errores HTTP de la API v1 (ADR-0005): un único sobre `{ error: { codigo, mensaje, solicitudId, … } }`,
 * mensajes en español y sin detalles internos (SQL, rutas, credenciales, variables ni trazas).
 */
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { CodigoErrorApi, RespuestaError } from "@softarq/contracts";
import type { Request, Response } from "express";
import { ErrorContrasenasSaturado } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { ErrorNegocio, type CodigoNegocio } from "../modules/cotizaciones/aplicacion/errores.js";

/** Forma mínima de un issue de Standard Schema (la que entrega StandardSchemaValidationPipe). */
interface IssueEsquema {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

type DetallesError = Omit<RespuestaError["error"], "codigo" | "mensaje" | "solicitudId">;

/** Error de la API con su estado HTTP y su código público. */
export class ErrorApi extends Error {
  constructor(
    readonly estadoHttp: number,
    readonly codigo: CodigoErrorApi,
    mensaje: string,
    readonly detalles: DetallesError = {},
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

const MAXIMO_CAMPOS = 50;

/** exceptionFactory del StandardSchemaValidationPipe: issues de Zod → 400 SOLICITUD_INVALIDA. */
export function errorDeValidacion(issues: readonly IssueEsquema[]): ErrorApi {
  return new ErrorApi(400, "SOLICITUD_INVALIDA", "La solicitud no cumple el contrato de la API.", {
    campos: issues.slice(0, MAXIMO_CAMPOS).map((i) => ({
      ruta: (i.path ?? [])
        .map((s) => (typeof s === "object" && s !== null && "key" in s ? s.key : s))
        .map((s) => (typeof s === "number" ? `[${s}]` : `.${String(s)}`))
        .join("")
        .replace(/^\./, "") || "(cuerpo)",
      mensaje: i.message,
    })),
  });
}

/** Códigos de error de red y de PostgreSQL que significan «base de datos no disponible». */
const CODIGOS_NO_DISPONIBLE = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EPIPE",
  "P1001", // Prisma: no se alcanza el servidor
  "P1002", // Prisma: tiempo agotado
  "P1017", // Prisma: el servidor cerró la conexión
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "53300", // too_many_connections
  "28P01", // autenticación fallida: el servicio no puede usar su credencial
  "3D000", // la base no existe
]);

/** Busca en el error y en su cadena de causas un indicio de PostgreSQL inaccesible. */
export function esBaseDeDatosNoDisponible(error: unknown, profundidad = 0): boolean {
  if (error === null || typeof error !== "object" || profundidad > 6) return false;
  const e = error as Record<string, unknown>;
  for (const campo of ["code", "errorCode", "originalCode"]) {
    const v = e[campo];
    if (typeof v === "string" && CODIGOS_NO_DISPONIBLE.has(v)) return true;
  }
  if (e["name"] === "PrismaClientInitializationError") return true;
  const kind = (e["cause"] as Record<string, unknown> | undefined)?.["kind"];
  if (kind === "DatabaseNotReachable" || kind === "DatabaseDoesNotExist" || kind === "AuthenticationFailed") return true;
  if (Array.isArray(e["errors"]) && e["errors"].some((x) => esBaseDeDatosNoDisponible(x, profundidad + 1))) return true;
  return esBaseDeDatosNoDisponible(e["cause"], profundidad + 1);
}

/** Errores del parser de cuerpo (body-parser) que conviene traducir. */
function errorDeCuerpo(error: unknown): ErrorApi | null {
  if (error === null || typeof error !== "object") return null;
  const tipo = (error as { type?: unknown }).type;
  if (tipo === "entity.too.large") {
    return new ErrorApi(413, "CUERPO_DEMASIADO_GRANDE", "El cuerpo de la solicitud excede el tamaño permitido.");
  }
  if (tipo === "entity.parse.failed") {
    return new ErrorApi(400, "SOLICITUD_INVALIDA", "El cuerpo no es JSON válido.");
  }
  if (tipo === "encoding.unsupported" || tipo === "charset.unsupported") {
    return new ErrorApi(415, "TIPO_DE_CONTENIDO_NO_ADMITIDO", "Codificación del cuerpo no admitida.");
  }
  return null;
}

/** Estado HTTP de cada error de negocio de cotizaciones (ADR-0008). */
const ESTADO_NEGOCIO: Record<CodigoNegocio, number> = {
  NO_ENCONTRADO: 404,
  SIN_PERMISO: 403,
  CONFLICTO_EDICION: 409,
  BORRADOR_DESACTUALIZADO: 409,
  CAPTURA_INCOMPLETA: 422,
  CALCULO_BLOQUEADO: 422,
  REGISTRO_INACTIVO: 422,
  IDEMPOTENCIA_CONFLICTO: 422,
  IDEMPOTENCIA_CADUCADA: 422,
  REFERENCIA_NO_DISPONIBLE: 422,
  REVISION_PENDIENTE: 409,
  VERSION_NO_VIGENTE: 409,
  CONFLICTO_REVISION: 409,
  ENVIO_BLOQUEADO: 422,
  APROBACION_BLOQUEADA: 422,
  DECISION_BLOQUEADA: 422,
  // Módulo 8 (ADR-0010).
  EMISION_BLOQUEADA: 422,
  VERSION_EMITIDA: 409,
  APROBACION_NO_VIGENTE: 409,
  CONFLICTO_EMISION: 409,
  FOLIO_NO_ACTIVO: 409,
  DESCARTE_BLOQUEADO: 422,
  DOCUMENTO_NO_GENERADO: 500,
  DOCUMENTO_NO_DISPONIBLE: 500,
};

export function traducirError(error: unknown): ErrorApi {
  if (error instanceof ErrorApi) return error;
  if (error instanceof ErrorNegocio) {
    return new ErrorApi(ESTADO_NEGOCIO[error.codigo], error.codigo, error.message, error.detalle);
  }
  const cuerpo = errorDeCuerpo(error);
  if (cuerpo) return cuerpo;
  if (error instanceof ErrorContrasenasSaturado) {
    return new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiadas solicitudes; intente de nuevo más tarde.");
  }
  if (error instanceof ThrottlerException) {
    return new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiadas solicitudes; intente de nuevo más tarde.");
  }
  if (error instanceof HttpException) {
    const s = error.getStatus();
    if (s === 404) return new ErrorApi(404, "NO_ENCONTRADO", "Recurso no encontrado.");
    if (s === 429) return new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiadas solicitudes; intente de nuevo más tarde.");
    if (s === 413) return new ErrorApi(413, "CUERPO_DEMASIADO_GRANDE", "El cuerpo de la solicitud excede el tamaño permitido.");
    // 400 genérico: p. ej. URIError de una ruta mal codificada (el JSON inválido se traduce antes,
    // en el middleware JSON, porque el adaptador Express de Nest lo convierte en BadRequestException).
    if (s === 400) return new ErrorApi(400, "SOLICITUD_INVALIDA", "Solicitud inválida.");
  }
  if (esBaseDeDatosNoDisponible(error)) {
    return new ErrorApi(503, "SERVICIO_NO_DISPONIBLE", "El servicio no está disponible temporalmente.");
  }
  return new ErrorApi(500, "ERROR_INTERNO", "Error interno del servidor.");
}

export function solicitudIdDe(res: Response): string {
  const id = res.locals["solicitudId"];
  return typeof id === "string" ? id : "sin-id";
}

/** Escribe el sobre de error. Para 429 añade Retry-After (segundos de la ventana del limitador). */
export function responderError(res: Response, error: ErrorApi, reintentarEnSegundos?: number): void {
  const cuerpo: RespuestaError = {
    error: { codigo: error.codigo, mensaje: error.message, solicitudId: solicitudIdDe(res), ...error.detalles },
  };
  if (error.estadoHttp === 429 && reintentarEnSegundos !== undefined && !res.getHeader("Retry-After")) {
    res.setHeader("Retry-After", String(reintentarEnSegundos));
  }
  res.status(error.estadoHttp).json(cuerpo);
}

/** Filtro global: todo error termina en el sobre público; el detalle técnico solo va al registro. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly registro = new Logger("Errores");

  constructor(
    private readonly registrar: boolean,
    private readonly ventanaLimitadorSegundos: number,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const error = traducirError(exception);
    if (this.registrar && error.estadoHttp >= 500) {
      const tecnico = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.registro.error(`[${solicitudIdDe(res)}] ${req.method} ${req.path} → ${error.estadoHttp} ${error.codigo}\n${tecnico}`);
    }
    if (res.headersSent) return;
    responderError(res, error, this.ventanaLimitadorSegundos);
  }
}
