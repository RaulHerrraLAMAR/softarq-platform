/**
 * Contadores operativos de la hoja «00 INICIO» (Word v1.3, ADR-0018 §2.2 y ADR-0023): lo que hay en cada etapa del flujo.
 * Distintos de «Mi trabajo» (bandejas propias de cada persona): estos cuentan la organización completa y siguen unas reglas
 * explícitas que la propia respuesta incluye en `reglas`.
 */
import { z } from "zod";
import { EsquemaFechaISO } from "./comunes.js";

export const DIAS_PRECIOS_POR_VENCER = 30;

export const EsquemaContadoresInicio = z.strictObject({
  /** Fecha del servidor con la que se evaluaron vigencias. */
  fecha: EsquemaFechaISO,
  borradores: z.number().int().nonnegative(),
  enRevision: z.number().int().nonnegative(),
  aprobadasPorEmitir: z.number().int().nonnegative(),
  emitidasVigentes: z.number().int().nonnegative(),
  vencidas: z.number().int().nonnegative(),
  preciosPorVencer: z.number().int().nonnegative(),
  /** Folio más alto asignado (incluye descartados: los folios no se reutilizan); `null` si aún no hay. */
  ultimoFolio: z.string().nullable(),
  avisos: z.array(z.strictObject({ codigo: z.string(), mensaje: z.string() })),
  reglas: z.array(z.string()),
});
export type ContadoresInicio = z.infer<typeof EsquemaContadoresInicio>;
