/**
 * Middleware de transporte (registrados como middleware de Nest para que sus errores lleguen al
 * filtro global): id de solicitud, registro sin cuerpos y parser JSON con límite de tamaño.
 */
import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import express, { type NextFunction, type Request, type Response } from "express";
import { ErrorApi } from "./errores.js";

/** Id generado por el servidor (no se confía en un id enviado por el cliente). */
export function middlewareSolicitudId(_req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  res.locals["solicitudId"] = id;
  res.setHeader("X-Request-Id", id);
  next();
}

/** Registra id, método, ruta (sin query), estado y duración. Nunca cuerpos ni cabeceras. */
export function crearMiddlewareRegistro(nivel: "completo" | "errores" | "ninguno") {
  const registro = new Logger("HTTP");
  return (req: Request, res: Response, next: NextFunction): void => {
    if (nivel === "ninguno") return next();
    const inicio = process.hrtime.bigint();
    res.on("finish", () => {
      if (nivel === "errores" && res.statusCode < 400) return;
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      registro.log(`[${String(res.locals["solicitudId"])}] ${req.method} ${req.path} → ${res.statusCode} (${ms.toFixed(1)} ms)`);
    });
    next();
  };
}

const METODOS_CON_CUERPO = new Set(["POST", "PUT", "PATCH"]);

/** JSON estricto con límite; los métodos con cuerpo exigen Content-Type application/json (415). */
export function crearMiddlewareJson(limiteKb: number) {
  const parser = express.json({ limit: `${limiteKb}kb`, strict: true, type: "application/json" });
  return (req: Request, res: Response, next: NextFunction): void => {
    if (METODOS_CON_CUERPO.has(req.method) && !req.is("application/json")) {
      return next(
        new ErrorApi(415, "TIPO_DE_CONTENIDO_NO_ADMITIDO", "El cuerpo debe enviarse como application/json."),
      );
    }
    parser(req, res, (error?: unknown) => {
      // Traducción aquí: el adaptador Express de Nest convertiría el SyntaxError en un
      // BadRequestException con el mensaje técnico del parser.
      if (error !== null && typeof error === "object" && (error as { type?: unknown }).type === "entity.parse.failed") {
        return next(new ErrorApi(400, "SOLICITUD_INVALIDA", "El cuerpo no es JSON válido."));
      }
      next(error as Error | undefined);
    });
  };
}
