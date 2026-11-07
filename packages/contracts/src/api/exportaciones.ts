/**
 * Exportación CSV de tablas para migración (RF-26, ADR-0023): qué tablas puede exportar la sesión y con qué columnas.
 * El contenido es `text/csv; charset=utf-8` y no tiene esquema Zod (es un archivo). Las columnas son fijas y no incluyen
 * contraseñas, hashes, sesiones, tokens ni credenciales temporales.
 */
import { z } from "zod";

export const EsquemaRespuestaExportaciones = z.strictObject({
  tablas: z.array(z.strictObject({ tabla: z.string(), descripcion: z.string(), columnas: z.array(z.string()) })),
  /** Lo que nunca entra en el CSV y por qué (la recuperación completa es el respaldo). */
  excluidas: z.array(z.strictObject({ grupo: z.string(), motivo: z.string() })),
});
export type RespuestaExportaciones = z.infer<typeof EsquemaRespuestaExportaciones>;
