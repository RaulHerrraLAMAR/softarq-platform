/**
 * Contratos HTTP de la emisión de versiones aprobadas, el emisor y el descarte de cotizaciones
 * (módulo 8, ADR-0010). Mismas reglas que los demás contratos: objetos estrictos, decimales en
 * texto y límites explícitos. Sin lógica de negocio: quién emite, los bloqueos (BL-01 a BL-20) y
 * la vigencia los decide la API.
 *
 * La identidad (quién emite, organización) sale SIEMPRE de la sesión. La emisión se refiere a UNA
 * versión inmutable y a UNA aprobación vigente de esa versión; el documento emitido no se vuelve a
 * generar al descargarlo.
 */
import { z } from "zod";
import { EsquemaDecimalTexto, EsquemaFechaISO } from "./esquemas.js";
import { EsquemaResumenEmision, EsquemaTextosCotizacion, ORIGENES_COTIZACION } from "./cotizaciones.js";
import { CODIGOS_AVISO, LIMITES_REVISIONES } from "./revisiones.js";

export const LIMITES_EMISION = {
  longitudNombreEmisor: 200,
  longitudDomicilio: 300,
  longitudTelefono: 40,
  longitudCorreo: 254,
  longitudMotivo: 500,
} as const;

/** Logotipos disponibles: recursos locales de la API (no se suben archivos). */
export const LOGOS_EMISOR = ["DEMO"] as const;

const EsquemaUuid = z.uuid({ error: "Identificador inválido (UUID)." });
const EsquemaInstante = z.string();

const textoOpcional = (max: number, campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .max(max, { error: `${campo}: máximo ${max} caracteres.` })
    .transform((t) => (t === "" ? null : t))
    .nullable();

/** Motivo útil (anulación y descarte): al menos 10 caracteres y alguna letra. */
const motivoUtil = (campo: string, explicacion: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .max(LIMITES_EMISION.longitudMotivo, { error: `${campo}: máximo ${LIMITES_EMISION.longitudMotivo} caracteres.` })
    .refine((t) => t.length >= LIMITES_REVISIONES.minimoObservaciones && /\p{L}/u.test(t), {
      error: `${explicacion} (al menos ${LIMITES_REVISIONES.minimoObservaciones} caracteres).`,
    });

// ---------------------------------------------------------------------------
// Emisor (17 CONFIG: EMISOR_*; BL-15)
// ---------------------------------------------------------------------------

export const EsquemaEmisor = z.strictObject({
  nombre: z.string().nullable(),
  domicilio: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
  logo: z.enum(LOGOS_EMISOR).nullable(),
  /** Datos ficticios de demostración. */
  esDemo: z.boolean(),
  /** Ficha de concurrencia (0 = aún no configurado). */
  revision: z.number().int().nonnegative(),
  modificadoPor: z.string().nullable(),
  modificadoEn: EsquemaInstante.nullable(),
  /** Datos que faltan para emitir (BL-15); vacío si está completo. */
  faltantes: z.array(z.string()),
  /** La sesión puede editarlo. */
  editable: z.boolean(),
});
export type Emisor = z.infer<typeof EsquemaEmisor>;

export const EsquemaEdicionEmisor = z.strictObject({
  revision: z.number().int().nonnegative(),
  nombre: textoOpcional(LIMITES_EMISION.longitudNombreEmisor, "Nombre o razón social"),
  domicilio: textoOpcional(LIMITES_EMISION.longitudDomicilio, "Domicilio"),
  telefono: textoOpcional(LIMITES_EMISION.longitudTelefono, "Teléfono"),
  correo: textoOpcional(LIMITES_EMISION.longitudCorreo, "Correo").refine((t) => t === null || z.email().safeParse(t).success, {
    error: "Correo: formato inválido.",
  }),
  logo: z.enum(LOGOS_EMISOR).nullable(),
  motivo: motivoUtil("Motivo", "Explique el cambio"),
});
export type EdicionEmisor = z.infer<typeof EsquemaEdicionEmisor>;

// ---------------------------------------------------------------------------
// Documento comercial (lo único que recibe el generador del PDF; D-16)
// ---------------------------------------------------------------------------

/**
 * Estructura comercial permitida del documento: SIN costos, proveedores, productos, consumos,
 * rendimientos, recargo, margen, excepciones ni observaciones internas. Se guarda tal cual en el
 * registro de emisión.
 */
export const EsquemaDocumentoCotizacion = z.strictObject({
  plantilla: z.string(),
  ambiente: z.enum(["DEMO", "PRODUCCION"]),
  origen: z.enum(ORIGENES_COTIZACION),
  folio: z.string(),
  versionNumero: z.number().int().positive(),
  idVersion: z.string(),
  fechaEmision: EsquemaFechaISO,
  vigenciaDias: z.number().int().positive(),
  vigenteHasta: EsquemaFechaISO,
  emisor: z.strictObject({
    nombre: z.string(),
    domicilio: z.string(),
    telefono: z.string(),
    correo: z.string(),
    logo: z.enum(LOGOS_EMISOR),
  }),
  /** Nombre del cliente y del proyecto: copias de la versión aprobada. */
  cliente: z.strictObject({ codigo: z.string(), nombre: z.string() }),
  /** Contacto: datos actuales del cliente, congelados al emitir. */
  contacto: z.strictObject({ nombre: z.string(), telefono: z.string().nullable(), correo: z.string().nullable() }),
  proyecto: z.strictObject({ codigo: z.string(), nombre: z.string(), ubicacion: z.string(), descripcion: z.string() }),
  moneda: z.literal("MXN"),
  partidas: z.array(
    z.strictObject({
      numero: z.number().int().positive(),
      descripcion: z.string(),
      unidad: z.string(),
      cantidad: EsquemaDecimalTexto,
      precioUnitario: EsquemaDecimalTexto,
      importe: EsquemaDecimalTexto,
    }),
  ),
  subtotal: EsquemaDecimalTexto,
  impuesto: z.strictObject({ nombre: z.string(), tasa: EsquemaDecimalTexto, importe: EsquemaDecimalTexto }),
  total: EsquemaDecimalTexto,
  /** Textos de la versión aprobada (BL-20), sin cambios. */
  textos: EsquemaTextosCotizacion,
  leyendaTecnica: z.string(),
  /** Registro operativo (como el libro): quién preparó, aprobó y emitió. */
  personas: z.strictObject({ preparo: z.string(), aprobo: z.string(), emitio: z.string() }),
});
export type DocumentoCotizacion = z.infer<typeof EsquemaDocumentoCotizacion>;

// ---------------------------------------------------------------------------
// Validación previa y emisión
// ---------------------------------------------------------------------------

export const EsquemaProblemaEmision = z.strictObject({ codigo: z.string(), referencia: z.string(), mensaje: z.string() });

/**
 * Lo que se emitiría HOY y lo que lo impide (solo lectura). La confirmación muestra folio,
 * versión, destinatario y total; la emisión vuelve a comprobarlo todo.
 */
export const EsquemaValidacionEmision = z.strictObject({
  /** Fecha de negocio del servidor con la que se evaluaron vigencias (BL-09, AV-02, CR-16). */
  fechaEmision: EsquemaFechaISO,
  vigenciaDias: z.number().int().positive().nullable(),
  vigenteHasta: EsquemaFechaISO.nullable(),
  version: z.strictObject({
    id: z.string(),
    numero: z.number().int().positive(),
    idVersion: z.string(),
    total: EsquemaDecimalTexto,
    esUltima: z.boolean(),
  }),
  /** Aprobación vigente de ESTA versión (`null` si no hay). */
  aprobacion: z.strictObject({ revisionId: z.string(), aprobadaPor: z.string(), aprobadaEn: EsquemaInstante }).nullable(),
  preparador: z.string(),
  destinatario: z.strictObject({
    cliente: z.strictObject({ codigo: z.string(), nombre: z.string() }),
    proyecto: z.strictObject({
      codigo: z.string(),
      nombre: z.string(),
      ubicacion: z.string().nullable(),
      descripcion: z.string().nullable(),
    }),
    contacto: z.strictObject({ nombre: z.string().nullable(), telefono: z.string().nullable(), correo: z.string().nullable() }),
  }),
  emisor: z.strictObject({
    nombre: z.string().nullable(),
    domicilio: z.string().nullable(),
    telefono: z.string().nullable(),
    correo: z.string().nullable(),
    logo: z.enum(LOGOS_EMISOR).nullable(),
  }),
  textos: EsquemaTextosCotizacion.nullable(),
  bloqueos: z.array(EsquemaProblemaEmision),
  avisos: z.array(z.strictObject({ codigo: z.enum(CODIGOS_AVISO), mensaje: z.string() })),
  /** La sesión puede emitir ahora (sin bloqueos y con permiso). */
  puedeEmitir: z.boolean(),
  /** Por qué esta persona no puede emitir (permiso o identidad), si aplica. */
  motivoNoEmitir: z.string().nullable(),
  /** Emisión ya registrada de esta versión (`null` si no se emitió). */
  emision: EsquemaResumenEmision.nullable(),
});
export type ValidacionEmision = z.infer<typeof EsquemaValidacionEmision>;

/**
 * Emitir la versión de la ruta con la aprobación que la persona vio. Si la versión o la aprobación
 * ya no son las vigentes, el servidor responde 409 sin emitir.
 */
export const EsquemaSolicitudEmision = z.strictObject({
  versionId: EsquemaUuid,
  revisionId: EsquemaUuid,
});
export type SolicitudEmision = z.infer<typeof EsquemaSolicitudEmision>;

export const EsquemaDetalleEmision = z.strictObject({
  emision: EsquemaResumenEmision,
  /** Contenido exacto del documento emitido (el registro inmutable). */
  documento: EsquemaDocumentoCotizacion,
});
export type DetalleEmision = z.infer<typeof EsquemaDetalleEmision>;

// ---------------------------------------------------------------------------
// Descarte de cotizaciones (B-37)
// ---------------------------------------------------------------------------

export const EsquemaDescarteCotizacion = z.strictObject({
  motivo: motivoUtil("Motivo", "Explique por qué se descarta la cotización"),
});
export type DescarteCotizacion = z.infer<typeof EsquemaDescarteCotizacion>;
