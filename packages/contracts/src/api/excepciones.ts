/**
 * Excepciones B-22 (módulo 10, ADR-0014). Fuente: Word maestro v1.3 §3.10/§3.11, `modRevision.bas`
 * (`BTN_RegistrarExcepcion`, `Exc_Registrar`, `Exc_Resolver`) y `modValidacion.bas` (`Validar`,
 * `Avisos`). Solo esquemas: las reglas (rangos, referencias, autorización) las aplica la API.
 *
 * - El Preparador las registra en el BORRADOR con motivo; se congelan en la versión que se calcula.
 * - Un Revisor distinto del preparador autoriza o rechaza cada una DURANTE la revisión de esa
 *   versión; aprobar y emitir exigen todas autorizadas.
 * - Datos técnicos (rendimiento, desperdicio): contrato INTERNO con su propia capacidad
 *   (`excepciones.consultar`). Nunca forman parte de la proyección comercial ni del PDF (D-16).
 */
import { z } from "zod";
import { CAMPOS_EXCEPCION } from "../calculo.js";
import { EsquemaCodigo, EsquemaDecimalTexto, LIMITES_API } from "./esquemas.js";

export const TIPOS_EXCEPCION = ["RENDIMIENTO", "PRECIO_VENCIDO", "CONCEPTO_PERSONALIZADO"] as const;
export type TipoExcepcion = (typeof TIPOS_EXCEPCION)[number];

/** Decisión del Revisor sobre una excepción (B-29). Sin decisión = pendiente. */
export const DECISIONES_EXCEPCION = ["AUTORIZADA", "RECHAZADA"] as const;
export type DecisionExcepcion = (typeof DECISIONES_EXCEPCION)[number];

/** Límites técnicos del DEMO (el libro solo exige que el motivo no esté vacío). */
export const LIMITES_EXCEPCIONES = { porCaptura: 100, motivo: 500, minimoMotivo: 10, comentario: 2000 } as const;

export const EsquemaMotivoExcepcion = z
  .string({ error: "El motivo es obligatorio." })
  .trim()
  .max(LIMITES_EXCEPCIONES.motivo, { error: `Máximo ${LIMITES_EXCEPCIONES.motivo} caracteres.` })
  .refine((t) => t.length >= LIMITES_EXCEPCIONES.minimoMotivo && /\p{L}/u.test(t), {
    error: `El motivo es obligatorio: explique la excepción (al menos ${LIMITES_EXCEPCIONES.minimoMotivo} caracteres).`,
  });

/**
 * RENDIMIENTO: cambia el rendimiento o el desperdicio de un componente SOLO en esta cotización
 * (D-04). La partida se cita por su número (posición 1…n) y su concepto: el borrador no tiene
 * identificadores estables y el servidor exige que ambos coincidan.
 */
export const EsquemaExcepcionRendimiento = z.strictObject({
  tipo: z.literal("RENDIMIENTO"),
  partida: z.number().int().min(1).max(LIMITES_API.partidas),
  conceptoCodigo: EsquemaCodigo,
  componenteCodigo: EsquemaCodigo,
  campo: z.enum(CAMPOS_EXCEPCION, { error: "Indique si cambia el rendimiento o el desperdicio." }),
  valorAplicado: EsquemaDecimalTexto,
  motivo: EsquemaMotivoExcepcion,
});

/** PRECIO_VENCIDO: permite emitir con un precio elegido que dejó de estar vigente (D-11, BL-09). */
export const EsquemaExcepcionPrecioVencido = z.strictObject({
  tipo: z.literal("PRECIO_VENCIDO"),
  insumoCodigo: EsquemaCodigo,
  precioCodigo: EsquemaCodigo,
  motivo: EsquemaMotivoExcepcion,
});

/** CONCEPTO_PERSONALIZADO: uso de un concepto de clase PERSONALIZADO (BL-04). */
export const EsquemaExcepcionConceptoPersonalizado = z.strictObject({
  tipo: z.literal("CONCEPTO_PERSONALIZADO"),
  conceptoCodigo: EsquemaCodigo,
  motivo: EsquemaMotivoExcepcion,
});

export const EsquemaExcepcionBorrador = z.discriminatedUnion("tipo", [
  EsquemaExcepcionRendimiento,
  EsquemaExcepcionPrecioVencido,
  EsquemaExcepcionConceptoPersonalizado,
]);
export type ExcepcionBorrador = z.infer<typeof EsquemaExcepcionBorrador>;

/** Clave de duplicado (`Exc_Registrar`): tipo, referencia, partida y campo. */
export function claveExcepcion(x: ExcepcionBorrador): string {
  switch (x.tipo) {
    case "RENDIMIENTO":
      return `RENDIMIENTO|${x.partida}|${x.componenteCodigo}|${x.campo}`;
    case "PRECIO_VENCIDO":
      return `PRECIO_VENCIDO|${x.precioCodigo}`;
    case "CONCEPTO_PERSONALIZADO":
      return `CONCEPTO_PERSONALIZADO|${x.conceptoCodigo}`;
  }
}

export const EsquemaListaExcepciones = z
  .array(EsquemaExcepcionBorrador)
  .max(LIMITES_EXCEPCIONES.porCaptura, { error: `Máximo ${LIMITES_EXCEPCIONES.porCaptura} excepciones.` })
  .superRefine((lista, ctx) => {
    const vistas = new Set<string>();
    lista.forEach((x, i) => {
      const k = claveExcepcion(x);
      if (vistas.has(k)) ctx.addIssue({ code: "custom", path: [i], message: "Ya existe una excepción para esa referencia." });
      vistas.add(k);
    });
  });

// ---------------------------------------------------------------------------
// Consultas internas (capacidad `excepciones.consultar`)
// ---------------------------------------------------------------------------

/** Componente de un concepto para registrar una excepción: datos técnicos, sin costos ni tarifas. */
export const EsquemaComponenteExcepcion = z.strictObject({
  codigo: z.string(),
  insumoCodigo: z.string(),
  insumoDescripcion: z.string(),
  unidad: z.string(),
  rendimiento: z.string(),
  desperdicio: z.string(),
});
export const EsquemaRespuestaComponentesExcepcion = z.strictObject({
  conceptos: z.array(
    z.strictObject({
      codigo: z.string(),
      clase: z.string(),
      componentes: z.array(EsquemaComponenteExcepcion),
    }),
  ),
});
export type RespuestaComponentesExcepcion = z.infer<typeof EsquemaRespuestaComponentesExcepcion>;

export const EsquemaConsultaComponentesExcepcion = z.strictObject({
  conceptos: z
    .string()
    .transform((s) => s.split(",").map((c) => c.trim()).filter(Boolean))
    .pipe(z.array(EsquemaCodigo).min(1).max(LIMITES_API.conceptosPorConsulta)),
});

const EsquemaAccionExcepcion = z.strictObject({ permitida: z.boolean(), motivo: z.string().nullable() });

/** Excepción congelada en una versión, con su decisión (si la hay). */
export const EsquemaExcepcionVersion = z.strictObject({
  numero: z.number().int().positive(),
  tipo: z.enum(TIPOS_EXCEPCION),
  /** Texto legible de lo que se exceptúa (partida, componente, precio o concepto). */
  referencia: z.string(),
  campo: z.enum(CAMPOS_EXCEPCION).nullable(),
  /** Valor del catálogo con el que se calculó la versión (RENDIMIENTO) o vigencia del precio. */
  valorOriginal: z.string().nullable(),
  valorAplicado: z.string().nullable(),
  motivo: z.string(),
  estado: z.enum(["PENDIENTE", ...DECISIONES_EXCEPCION]),
  decision: z
    .strictObject({ por: z.string(), en: z.string(), comentario: z.string().nullable() })
    .nullable(),
});
export type ExcepcionVersion = z.infer<typeof EsquemaExcepcionVersion>;

export const EsquemaExcepcionesVersion = z.strictObject({
  versionId: z.uuid(),
  idVersion: z.string(),
  /** Revisión pendiente en la que se puede decidir (si la hay). */
  revisionId: z.uuid().nullable(),
  excepciones: z.array(EsquemaExcepcionVersion),
  acciones: z.strictObject({ decidir: EsquemaAccionExcepcion }),
});
export type ExcepcionesVersion = z.infer<typeof EsquemaExcepcionesVersion>;

/** Autorizar o rechazar una excepción de la versión que la persona vio (B-29). */
export const EsquemaDecisionExcepcion = z.strictObject({
  versionId: z.uuid({ error: "Identificador inválido (UUID)." }),
  decision: z.enum(DECISIONES_EXCEPCION, { error: "Indique AUTORIZADA o RECHAZADA." }),
  comentario: z
    .string()
    .trim()
    .max(LIMITES_EXCEPCIONES.comentario, { error: `Máximo ${LIMITES_EXCEPCIONES.comentario} caracteres.` })
    .nullable()
    .optional()
    .transform((t) => t || null),
});
export type DecisionExcepcionSolicitud = z.infer<typeof EsquemaDecisionExcepcion>;
