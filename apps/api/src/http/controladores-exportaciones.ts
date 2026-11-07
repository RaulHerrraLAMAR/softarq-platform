/**
 * Exportación CSV de tablas para migración (RF-26, ADR-0023).
 *
 * - `GET /exportaciones`: las tablas que la sesión puede exportar (según sus capacidades), con sus columnas.
 * - `GET /exportaciones/{tabla}`: el CSV UTF-8 de la organización de la sesión. 404 si la tabla no existe; 403 si la sesión no
 *   tiene la capacidad de esa tabla (la lista y las columnas son fijas: ver `servicio-exportaciones.ts`).
 * Solo canal web (no `@PermitidaEnMovil`). Nunca se registra el contenido; sin caché.
 */
import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { DEFINICIONES, EXCLUIDAS, esTablaExportable, type ServicioExportaciones } from "../modules/exportaciones/servicio-exportaciones.js";
import { organizacionDe, sesionDe } from "./contexto.js";
import { ErrorApi } from "./errores.js";
import { Requiere } from "./guardia-sesion.js";
import { SERVICIO_EXPORTACIONES } from "./tokens.js";

@Controller("exportaciones")
@SkipThrottle({ calculo: true })
export class ExportacionesController {
  constructor(@Inject(SERVICIO_EXPORTACIONES) private readonly servicio: ServicioExportaciones) {}

  @Get()
  @Requiere("sesion.propia")
  listar(@Req() req: Request): { tablas: { tabla: string; descripcion: string; columnas: readonly string[] }[]; excluidas: readonly { grupo: string; motivo: string }[] } {
    return { tablas: this.servicio.disponibles(sesionDe(req).capacidades), excluidas: EXCLUIDAS };
  }

  /** Manifiesto con los conteos de las tablas que esta sesión puede exportar (como el del libro). Debe ir antes de `:tabla`. */
  @Get("manifiesto")
  @Requiere("sesion.propia")
  async manifiesto(@Req() req: Request, @Res() res: Response): Promise<void> {
    const r = await this.servicio.manifiesto(organizacionDe(req).organizacionId, sesionDe(req).capacidades);
    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="softarq-manifiesto.csv"');
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Filas", String(r.filas));
    res.send(Buffer.from(r.contenido, "utf8"));
  }

  @Get(":tabla")
  @Requiere("sesion.propia")
  async descargar(@Req() req: Request, @Res() res: Response, @Param("tabla") tabla: string): Promise<void> {
    if (!esTablaExportable(tabla)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa exportación.");
    if (!sesionDe(req).capacidades.includes(DEFINICIONES[tabla].capacidad)) throw new ErrorApi(403, "SIN_PERMISO", "Su función no puede exportar esa tabla.");
    const r = await this.servicio.csv(organizacionDe(req).organizacionId, tabla);
    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${r.nombre}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Filas", String(r.filas));
    res.send(Buffer.from(r.contenido, "utf8"));
  }
}
