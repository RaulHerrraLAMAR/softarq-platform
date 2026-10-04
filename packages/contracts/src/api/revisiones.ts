/**
 * Contratos HTTP de la revisión y aprobación de versiones (módulo 7, ADR-0009). Mismas reglas que
 * los demás contratos: objetos estrictos, decimales en texto y límites explícitos. Sin lógica de
 * negocio: estados, permisos, BL-17 y la verificación vigente los decide la API.
 *
 * La identidad (preparador, revisor, organización) sale SIEMPRE de la sesión: ningún cuerpo la
 * admite. Una revisión se refiere a UNA versión inmutable (id, organización, folio y número); su
 * estado vive aparte de la versión, que nunca cambia.
 */
import { z } from "zod";
import { EsquemaDecimalTexto, EsquemaFechaISO, LIMITES_API } from "./esquemas.js";
import { ESTADOS_REVISION, EsquemaEventoRevision, EsquemaVersion, ORIGENES_COTIZACION } from "./cotizaciones.js";

export const DECISIONES_REVISION = ["APROBAR", "SOLICITAR_CAMBIOS"] as const;
export type DecisionRevision = (typeof DECISIONES_REVISION)[number];


export const LIMITES_REVISIONES = {
  longitudObservaciones: 2000,
  longitudMotivoRetiro: 500,
  /** Una solicitud de cambios debe explicar algo útil (requisito del propietario, ADR-0009 §4). */
  minimoObservaciones: 10,
} as const;

const EsquemaUuid = z.uuid({ error: "Identificador inválido (UUID)." });

const textoOpcional = (max: number, campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .max(max, { error: `${campo}: máximo ${max} caracteres.` })
    .transform((t) => (t === "" ? null : t))
    .nullable()
    .optional();

// ---------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------

/**
 * Enviar a revisión la versión de la ruta. `revisionBorrador` es la revisión del borrador que la
 * persona tenía a la vista: si el borrador cambió después de calcular esa versión, el servidor
 * rechaza el envío (no se envía una versión anterior como si incluyera esos cambios).
 */
export const EsquemaSolicitudEnvioRevision = z.strictObject({
  revisionBorrador: z.number().int().nonnegative(),
});
export type SolicitudEnvioRevision = z.infer<typeof EsquemaSolicitudEnvioRevision>;

/**
 * Decisión del revisor sobre la versión que vio (`versionId`) con la ficha que leyó (`revision`).
 * Una solicitud de cambios exige observaciones útiles; la aprobación las admite opcionales.
 */
export const EsquemaDecisionRevision = z
  .strictObject({
    decision: z.enum(DECISIONES_REVISION, { error: "Indique APROBAR o SOLICITAR_CAMBIOS." }),
    versionId: EsquemaUuid,
    revision: z.number().int().nonnegative(),
    observaciones: textoOpcional(LIMITES_REVISIONES.longitudObservaciones, "Observaciones"),
  })
  .superRefine((d, ctx) => {
    if (d.decision !== "SOLICITAR_CAMBIOS") return;
    const t = d.observaciones ?? "";
    if (t.length < LIMITES_REVISIONES.minimoObservaciones || !/\p{L}/u.test(t)) {
      ctx.addIssue({
        code: "custom",
        path: ["observaciones"],
        message: `Explique qué debe cambiar (al menos ${LIMITES_REVISIONES.minimoObservaciones} caracteres).`,
      });
    }
  });
export type DecisionRevisionSolicitud = z.infer<typeof EsquemaDecisionRevision>;

/**
 * Anular una aprobación antes de emitir (módulo 8, ADR-0010): sobre la revisión aprobada que la
 * persona vio (`revision` = ficha) y con un motivo útil. Crea un evento nuevo; nada se borra.
 */
export const EsquemaAnulacionAprobacion = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    motivo: textoOpcional(LIMITES_REVISIONES.longitudObservaciones, "Motivo"),
  })
  .superRefine((d, ctx) => {
    const t = d.motivo ?? "";
    if (t.length < LIMITES_REVISIONES.minimoObservaciones || !/\p{L}/u.test(t)) {
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message: `Explique por qué se anula la aprobación (al menos ${LIMITES_REVISIONES.minimoObservaciones} caracteres).`,
      });
    }
  });
export type AnulacionAprobacion = z.infer<typeof EsquemaAnulacionAprobacion>;

export const EsquemaRetiroRevision = z.strictObject({
  revision: z.number().int().nonnegative(),
  motivo: textoOpcional(LIMITES_REVISIONES.longitudMotivoRetiro, "Motivo"),
});
export type RetiroRevision = z.infer<typeof EsquemaRetiroRevision>;

const limite = z
  .string()
  .regex(/^\d{1,3}$/, { error: "limite debe ser un entero." })
  .transform(Number)
  .pipe(z.number().int().min(1).max(LIMITES_API.limiteListadoMaximo, { error: `limite máximo: ${LIMITES_API.limiteListadoMaximo}.` }))
  .optional();

export const EsquemaConsultaRevisiones = z.strictObject({
  /** Por omisión, las pendientes (bandeja del revisor). */
  estado: z.enum(ESTADOS_REVISION).optional(),
  limite,
});
export type ConsultaRevisiones = z.infer<typeof EsquemaConsultaRevisiones>;

export const EsquemaParametroNumeroVersion = z.strictObject({
  id: EsquemaUuid,
  numero: z
    .string()
    .regex(/^[1-9]\d{0,5}$/, { error: "Número de versión inválido." })
    .transform(Number),
});

// ---------------------------------------------------------------------------
// Respuestas (sin costos internos, proveedores de compra, consumos, recargo ni margen)
// ---------------------------------------------------------------------------

const EsquemaInstante = z.string();

/** Una revisión: la versión exacta revisada, su estado y lo que la sesión actual puede hacer. */
export const EsquemaResumenRevision = z.strictObject({
  id: z.string(),
  estado: z.enum(ESTADOS_REVISION),
  /** Ficha de concurrencia: se envía al decidir o retirar. */
  revision: z.number().int().nonnegative(),
  cotizacionId: z.string(),
  folio: z.string(),
  origen: z.enum(ORIGENES_COTIZACION),
  version: z.strictObject({
    id: z.string(),
    numero: z.number().int().positive(),
    /** COT-AAAA-NNNNN-vN */
    idVersion: z.string(),
    total: EsquemaDecimalTexto,
    fechaCalculo: EsquemaFechaISO,
  }),
  cliente: z.strictObject({ codigo: z.string(), nombre: z.string() }),
  proyecto: z.strictObject({ codigo: z.string(), nombre: z.string() }),
  /** Autor de la versión (BL-17: no puede aprobarla). */
  preparador: z.string(),
  enviadoPor: z.string(),
  enviadoEn: EsquemaInstante,
  resueltaPor: z.string().nullable(),
  resueltaEn: EsquemaInstante.nullable(),
  observaciones: z.string().nullable(),
  /** Anulación de la aprobación (módulo 8); `null` si no se anuló. */
  anulacion: z.strictObject({ por: z.string(), en: EsquemaInstante, motivo: z.string() }).nullable(),
  /** La versión revisada ya se emitió (su aprobación ya no se puede anular). */
  emitida: z.boolean(),
  /** Permisos de la sesión actual sobre esta revisión, calculados por el servidor. */
  acciones: z.strictObject({
    aprobar: z.boolean(),
    solicitarCambios: z.boolean(),
    retirar: z.boolean(),
    /** Aprobada, sin anular, sin emitir y la sesión es Revisor. */
    anularAprobacion: z.boolean(),
    /** Por qué no puede aprobar (p. ej. BL-17), si tiene la función de revisor. */
    motivoNoAprobar: z.string().nullable(),
  }),
});
export type ResumenRevision = z.infer<typeof EsquemaResumenRevision>;

export const EsquemaRespuestaRevisiones = z.strictObject({
  revisiones: z.array(EsquemaResumenRevision),
  limite: z.number().int(),
});
export type RespuestaRevisiones = z.infer<typeof EsquemaRespuestaRevisiones>;

export const CODIGOS_AVISO = ["AV-01", "AV-02", "AV-03", "AV-04", "AV-05"] as const;

/**
 * Verificación de condiciones vigentes (B-27): se evalúa al consultar, enviar y aprobar SIN
 * modificar la versión. Si exige recalcular, la corrección es una versión nueva.
 */
export const EsquemaVerificacionRevision = z.strictObject({
  /** Fecha del servidor con la que se evaluaron vigencias (BL-09, AV-02). */
  fechaReferencia: EsquemaFechaISO,
  bloqueos: z.array(z.strictObject({ codigo: z.string(), referencia: z.string(), mensaje: z.string() })),
  avisos: z.array(z.strictObject({ codigo: z.enum(CODIGOS_AVISO), mensaje: z.string() })),
});
export type VerificacionRevision = z.infer<typeof EsquemaVerificacionRevision>;

export const EsquemaDetalleRevision = z.strictObject({
  revision: EsquemaResumenRevision,
  /** La versión revisada tal como se guardó (proyección comercial; nunca se recalcula). */
  version: EsquemaVersion,
  /** Solo mientras está pendiente: lo que impediría aprobar hoy y los avisos para decidir. */
  verificacion: EsquemaVerificacionRevision.nullable(),
  eventos: z.array(EsquemaEventoRevision),
});
export type DetalleRevision = z.infer<typeof EsquemaDetalleRevision>;
