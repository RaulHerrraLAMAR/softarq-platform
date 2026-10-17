/**
 * Administración del catálogo técnico (módulo 12, ADR-0016): tipos de estructura, insumos,
 * conversiones, conceptos y componentes, con la aprobación de conceptos.
 *
 * Contrato INTERNO: rendimientos, desperdicios, traslapes, factores, reglas de medición y
 * trazabilidad. Solo lo sirve la API bajo `/admin/...` con la capacidad `catalogos.administrar`
 * (Administrador del catálogo, `Req_Funcion FN_ADMCAT`). Nada de esto pasa a la proyección comercial,
 * a las versiones ni al PDF.
 *
 * Fuentes: `modCatalogos.bas` (Cat_Campos, Val_Insumo, Val_Conversion, Val_TipoEst, Val_Concepto,
 * Val_Componente, Concepto_Problemas, Concepto_Aprobar, BTN_ConceptoActivo) y `tblListas`.
 * Los decimales viajan como texto con la escala de su columna: rendimiento NUMERIC(20,6),
 * desperdicio (7,6), traslape (9,6) y factor (20,10). `null` (sin capturar) se distingue de cero.
 */
import { z } from "zod";
import { TIPOS_FORMULA } from "../calculo.js";
import { PATRON_DECIMAL_TEXTO } from "../decimal.js";
import {
  EsquemaClaveUnidad,
  EsquemaConceptoTarifaAdmin,
  EsquemaEventoCatalogo,
  EsquemaFechaReal,
  EsquemaInsumoAdmin,
  PIEZAS_CATALOGO,
  esquemaDecimalPositivo,
} from "./catalogos-admin.js";
import { EsquemaCodigo, EsquemaFechaISO } from "./esquemas.js";

const { textoObligatorio, textoOpcional, motivo, buscar, limite, despuesDe, booleanoTexto, revision, alMenosUnCambio, EsquemaInstante } = PIEZAS_CATALOGO;

export const LIMITES_CATALOGO_TECNICO = {
  longitudNombreTipo: 200,
  longitudDescripcion: 500,
  longitudEspecificacion: 2000,
  longitudRegla: 2000,
  longitudCriterios: 2000,
  longitudFuente: 500,
  longitudResponsable: 200,
} as const;

/** `tblListas.FAMILIA` del libro. */
export const FAMILIAS_ESTRUCTURA = [
  "Cimentaciones",
  "Concreto reforzado",
  "Acero estructural",
  "Mampostería reforzada",
  "Cubiertas ligeras",
  "Conceptos personalizados",
] as const;
export type FamiliaEstructura = (typeof FAMILIAS_ESTRUCTURA)[number];

/** `tblListas.CLASE_CONCEPTO`. */
export const CLASES_CONCEPTO = ["ESTANDAR", "GENERICO", "PERSONALIZADO"] as const;
export type ClaseConcepto = (typeof CLASES_CONCEPTO)[number];

/** Unidades de un concepto: `Lista_Unidades("longitud;area;volumen;conteo")`, acorde a la fórmula. */
export const MAGNITUDES_UNIDAD_CONCEPTO = ["longitud", "area", "volumen", "conteo"] as const;

/** Requisitos de aprobación (`Concepto_Problemas` + convertibilidad que exige el motor). */
export const CODIGOS_REQUISITO_CONCEPTO = [
  "HEREDADO",
  "INACTIVO",
  "SIN_REGLA",
  "SIN_TIPO",
  "TIPO_INACTIVO",
  "UNIDAD_FORMULA",
  "SIN_TARIFA",
  "TARIFA_UNIDAD",
  "COMPONENTE_SIN_FUENTE",
  "COMPONENTE_SIN_FECHA",
  "COMPONENTE_SIN_RESPONSABLE",
  "COMPONENTE_SIN_CONVERSION",
  "SIN_COMPONENTES",
] as const;

// ---------------------------------------------------------------------------
// Decimales con la escala de su columna
// ---------------------------------------------------------------------------

/** Decimal en texto >= 0 (o < 1 si `menorQueUno`) que cabe en su columna sin redondeo. */
export function esquemaDecimalNoNegativo(campo: string, escala: number, enteros: number, menorQueUno = false) {
  return z
    .string({ error: `${campo}: debe ser un decimal en texto (por ejemplo "0.05"), no un número.` })
    .regex(PATRON_DECIMAL_TEXTO, { error: `${campo}: decimal inválido (punto decimal, sin comas, espacios ni exponente).` })
    .superRefine((v, ctx) => {
      const [entera = "", fraccion = ""] = v.replace(/^-/, "").split(".");
      const cero = /^0*$/.test(entera) && /^0*$/.test(fraccion);
      if (v.startsWith("-") && !cero) {
        ctx.addIssue({ code: "custom", message: `${campo}: no puede ser negativo.` });
        return;
      }
      if (menorQueUno && !/^0*$/.test(entera)) {
        ctx.addIssue({ code: "custom", message: `${campo}: debe cumplir 0 <= valor < 1 (fracción).` });
      }
      if (fraccion.replace(/0+$/, "").length > escala) {
        ctx.addIssue({ code: "custom", message: `${campo}: admite hasta ${escala} decimales; no se redondea.` });
      }
      if (entera.replace(/^0+(?=\d)/, "").length > enteros) {
        ctx.addIssue({ code: "custom", message: `${campo}: admite hasta ${enteros} dígitos enteros.` });
      }
    });
}

/** Rendimiento: NUMERIC(20,6) > 0. */
export const EsquemaRendimiento = esquemaDecimalPositivo("Rendimiento", 6, 14);
/** Desperdicio: NUMERIC(7,6), 0 <= d < 1. */
export const EsquemaDesperdicio = esquemaDecimalNoNegativo("Desperdicio", 6, 1, true);
/** Factor de traslape: NUMERIC(9,6) >= 0. */
export const EsquemaFactorTraslape = esquemaDecimalNoNegativo("Factor de traslape", 6, 3);
/** Factor de conversión: NUMERIC(20,10) > 0 (1 unidad de origen = factor unidades base). */
export const EsquemaFactorConversion = esquemaDecimalPositivo("Factor", 10, 10);

// ---------------------------------------------------------------------------
// Tipos de estructura (tblTiposEstructura)
// ---------------------------------------------------------------------------

const familia = z.enum(FAMILIAS_ESTRUCTURA, { error: "Seleccione la familia." });
const nombreTipo = textoObligatorio(LIMITES_CATALOGO_TECNICO.longitudNombreTipo, "el nombre del tipo");

export const EsquemaSolicitudTipoEstructura = z.strictObject({
  familia,
  nombre: nombreTipo,
  /** «Tipo prioritario (validación exhaustiva)»; informativo. */
  prioritario: z.boolean().optional(),
});
export type SolicitudTipoEstructura = z.infer<typeof EsquemaSolicitudTipoEstructura>;

/** La familia no cambia si el tipo ya tiene conceptos (registre otro tipo). */
export const EsquemaEdicionTipoEstructura = z
  .strictObject({ revision, familia: familia.optional(), nombre: nombreTipo.optional(), prioritario: z.boolean().optional(), activo: z.boolean().optional() })
  .refine(alMenosUnCambio, { error: "Indique al menos un cambio." });
export type EdicionTipoEstructura = z.infer<typeof EsquemaEdicionTipoEstructura>;

export const EsquemaConsultaTiposEstructura = z.strictObject({ buscar, familia: familia.optional(), incluirInactivos: booleanoTexto, despuesDe, limite });
export type ConsultaTiposEstructura = z.infer<typeof EsquemaConsultaTiposEstructura>;

export const EsquemaTipoEstructuraAdmin = z.strictObject({
  codigo: z.string(),
  familia: z.enum(FAMILIAS_ESTRUCTURA),
  nombre: z.string(),
  prioritario: z.boolean(),
  activo: z.boolean(),
  revision: z.number().int(),
  /** Conceptos clasificados en el tipo: con alguno, la familia ya no cambia. */
  conceptos: z.number().int().nonnegative(),
  creadoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string().nullable(),
});
export type TipoEstructuraAdmin = z.infer<typeof EsquemaTipoEstructuraAdmin>;

export const EsquemaRespuestaTiposEstructura = z.strictObject({
  tipos: z.array(EsquemaTipoEstructuraAdmin),
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaTiposEstructura = z.infer<typeof EsquemaRespuestaTiposEstructura>;

export const EsquemaDetalleTipoEstructura = z.strictObject({
  tipo: EsquemaTipoEstructuraAdmin,
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleTipoEstructura = z.infer<typeof EsquemaDetalleTipoEstructura>;

// ---------------------------------------------------------------------------
// Insumos y conversiones (tblInsumos, tblConversiones)
// ---------------------------------------------------------------------------

const camposInsumo = {
  descripcion: textoObligatorio(LIMITES_CATALOGO_TECNICO.longitudDescripcion, "la descripción técnica"),
  especificacion: textoOpcional(LIMITES_CATALOGO_TECNICO.longitudEspecificacion, "la especificación"),
  unidadBase: EsquemaClaveUnidad,
};

export const EsquemaSolicitudInsumo = z.strictObject({
  descripcion: camposInsumo.descripcion,
  especificacion: camposInsumo.especificacion.optional(),
  unidadBase: camposInsumo.unidadBase,
});
export type SolicitudInsumo = z.infer<typeof EsquemaSolicitudInsumo>;

/** La unidad base no cambia si el insumo ya tiene productos, conversiones o componentes. */
export const EsquemaEdicionInsumo = z
  .strictObject({
    revision,
    descripcion: camposInsumo.descripcion.optional(),
    especificacion: camposInsumo.especificacion.optional(),
    unidadBase: camposInsumo.unidadBase.optional(),
    activo: z.boolean().optional(),
  })
  .refine(alMenosUnCambio, { error: "Indique al menos un cambio." });
export type EdicionInsumo = z.infer<typeof EsquemaEdicionInsumo>;

const fuenteConversion = textoObligatorio(LIMITES_CATALOGO_TECNICO.longitudFuente, "la fuente del factor de conversión");

/** Val_Conversion: el destino es la unidad base del insumo; el origen, otra unidad. */
export const EsquemaSolicitudConversion = z.strictObject({ unidadOrigen: EsquemaClaveUnidad, factor: EsquemaFactorConversion, fuente: fuenteConversion });
export type SolicitudConversion = z.infer<typeof EsquemaSolicitudConversion>;

/** Editar factor o fuente con motivo; los conceptos aprobados que la usan vuelven a Borrador. */
export const EsquemaEdicionConversion = z
  .strictObject({ revision, factor: EsquemaFactorConversion.optional(), fuente: fuenteConversion.optional(), motivo })
  .refine((e) => e.factor !== undefined || e.fuente !== undefined, { error: "Indique el factor o la fuente nuevos." });
export type EdicionConversion = z.infer<typeof EsquemaEdicionConversion>;

export const EsquemaParametroConversion = z.strictObject({ codigo: EsquemaCodigo, unidad: EsquemaClaveUnidad });

const conceptoBreve = z.strictObject({ codigo: z.string(), descripcion: z.string(), estado: z.string(), activo: z.boolean() });

export const EsquemaConversionAdmin = z.strictObject({
  insumoCodigo: z.string(),
  unidadOrigen: z.string(),
  unidadDestino: z.string(),
  factor: z.string(),
  fuente: z.string(),
  revision: z.number().int(),
  registradoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string().nullable(),
  /** Conceptos con un componente activo de este insumo medido en la unidad de origen. */
  conceptos: z.array(conceptoBreve),
});
export type ConversionAdmin = z.infer<typeof EsquemaConversionAdmin>;

export const EsquemaDetalleInsumoAdmin = z.strictObject({
  insumo: EsquemaInsumoAdmin,
  conversiones: z.array(EsquemaConversionAdmin),
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleInsumoAdmin = z.infer<typeof EsquemaDetalleInsumoAdmin>;

// ---------------------------------------------------------------------------
// Conceptos (tblConceptos)
// ---------------------------------------------------------------------------

const camposConcepto = {
  tipoCodigo: EsquemaCodigo,
  descripcion: textoObligatorio(LIMITES_CATALOGO_TECNICO.longitudDescripcion, "la descripción del concepto"),
  unidad: EsquemaClaveUnidad,
  tipoFormula: z.enum(TIPOS_FORMULA, { error: "Seleccione el tipo de fórmula de medición." }),
  permiteDescuento: z.boolean({ error: "Indique si la regla permite descuentos (signo -)." }),
  /** Texto descriptivo para quien mide; el motor calcula con `tipoFormula` y no lo interpreta. */
  reglaMedicion: textoObligatorio(LIMITES_CATALOGO_TECNICO.longitudRegla, "la regla de medición"),
  criterios: textoOpcional(LIMITES_CATALOGO_TECNICO.longitudCriterios, "los criterios especiales"),
  clase: z.enum(CLASES_CONCEPTO, { error: "Seleccione la clase." }),
};

export const EsquemaSolicitudConcepto = z.strictObject({
  ...camposConcepto,
  criterios: camposConcepto.criterios.optional(),
  /** Tarifa activa de la misma unidad (opcional al guardar; obligatoria para aprobar). */
  tarifaCodigo: EsquemaCodigo.nullable().optional(),
});
export type SolicitudConcepto = z.infer<typeof EsquemaSolicitudConcepto>;

/**
 * Edición. Un cambio técnico (tipo, descripción, unidad, fórmula, descuentos, regla, criterios o clase)
 * devuelve el concepto a Borrador y retira su aprobación. Desactivar la conserva; reactivar vuelve a
 * Borrador. La tarifa se cambia con «Asignar tarifa».
 */
export const EsquemaEdicionConcepto = z
  .strictObject({
    revision,
    tipoCodigo: camposConcepto.tipoCodigo.optional(),
    descripcion: camposConcepto.descripcion.optional(),
    unidad: camposConcepto.unidad.optional(),
    tipoFormula: camposConcepto.tipoFormula.optional(),
    permiteDescuento: camposConcepto.permiteDescuento.optional(),
    reglaMedicion: camposConcepto.reglaMedicion.optional(),
    criterios: camposConcepto.criterios.optional(),
    clase: camposConcepto.clase.optional(),
    activo: z.boolean().optional(),
  })
  .refine(alMenosUnCambio, { error: "Indique al menos un cambio." });
export type EdicionConcepto = z.infer<typeof EsquemaEdicionConcepto>;

/** Campos cuyo cambio es técnico (Val_Concepto). */
export const CAMPOS_TECNICOS_CONCEPTO = ["tipoCodigo", "descripcion", "unidad", "tipoFormula", "permiteDescuento", "reglaMedicion", "criterios", "clase"] as const;

/** Aprobar la revisión técnica que se revisó: si cambió mientras tanto, 409. */
export const EsquemaAprobacionConcepto = z.strictObject({
  revisionTecnica: z.number({ error: "Indique la revisión técnica que revisó." }).int().nonnegative(),
});
export type AprobacionConcepto = z.infer<typeof EsquemaAprobacionConcepto>;

export const EsquemaRequisitoConcepto = z.strictObject({
  codigo: z.enum(CODIGOS_REQUISITO_CONCEPTO),
  referencia: z.string(),
  mensaje: z.string(),
});
export type RequisitoConcepto = z.infer<typeof EsquemaRequisitoConcepto>;

/** Convertibilidad de la unidad del rendimiento a la unidad base del insumo (BL-06 del motor). */
export const EsquemaConvertibilidad = z.strictObject({
  estado: z.enum(["BASE", "CONVERSION", "FALTA"]),
  /** Factor aplicado si hay conversión directa. */
  factor: z.string().nullable(),
});

export const EsquemaComponenteAdmin = z.strictObject({
  codigo: z.string(),
  orden: z.number().int(),
  insumo: z.strictObject({ codigo: z.string(), descripcion: z.string(), unidadBase: z.string(), activo: z.boolean() }),
  rendimiento: z.string(),
  unidadRendimiento: z.string(),
  desperdicio: z.string(),
  factorTraslape: z.string().nullable(),
  fuente: z.string().nullable(),
  fecha: EsquemaFechaISO.nullable(),
  responsable: z.string().nullable(),
  activo: z.boolean(),
  revision: z.number().int(),
  convertibilidad: EsquemaConvertibilidad,
  /** Fuente, fecha y responsable técnico presentes (requisito para aprobar y BL-05 al calcular). */
  trazable: z.boolean(),
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string().nullable(),
});
export type ComponenteAdmin = z.infer<typeof EsquemaComponenteAdmin>;

export const EsquemaDetalleConceptoAdmin = z.strictObject({
  concepto: EsquemaConceptoTarifaAdmin,
  permiteDescuento: z.boolean(),
  reglaMedicion: z.string().nullable(),
  criterios: z.string().nullable(),
  creadoPor: z.string().nullable(),
  creadoEn: EsquemaInstante,
  /** Último cambio técnico (del concepto, de un componente o de una conversión que usa). */
  cambioTecnicoPor: z.string().nullable(),
  cambioTecnicoEn: EsquemaInstante.nullable(),
  componentes: z.array(EsquemaComponenteAdmin),
  /** Lista del servidor: vacía = puede aprobarse. */
  requisitos: z.array(EsquemaRequisitoConcepto),
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleConceptoAdmin = z.infer<typeof EsquemaDetalleConceptoAdmin>;

// ---------------------------------------------------------------------------
// Componentes (tblComponentes)
// ---------------------------------------------------------------------------

const trazabilidad = {
  fuente: textoOpcional(LIMITES_CATALOGO_TECNICO.longitudFuente, "la fuente del rendimiento"),
  fecha: EsquemaFechaReal.nullable(),
  responsable: textoOpcional(LIMITES_CATALOGO_TECNICO.longitudResponsable, "el responsable técnico"),
};

/** Fuente, fecha y responsable son opcionales al guardar (como el libro) y obligatorios para aprobar. */
export const EsquemaSolicitudComponente = z.strictObject({
  insumoCodigo: EsquemaCodigo,
  rendimiento: EsquemaRendimiento,
  unidadRendimiento: EsquemaClaveUnidad,
  desperdicio: EsquemaDesperdicio,
  factorTraslape: EsquemaFactorTraslape.nullable(),
  fuente: trazabilidad.fuente.optional(),
  fecha: trazabilidad.fecha.optional(),
  responsable: trazabilidad.responsable.optional(),
});
export type SolicitudComponente = z.infer<typeof EsquemaSolicitudComponente>;

export const EsquemaEdicionComponente = z
  .strictObject({
    revision,
    insumoCodigo: EsquemaCodigo.optional(),
    rendimiento: EsquemaRendimiento.optional(),
    unidadRendimiento: EsquemaClaveUnidad.optional(),
    desperdicio: EsquemaDesperdicio.optional(),
    factorTraslape: EsquemaFactorTraslape.nullable().optional(),
    fuente: trazabilidad.fuente.optional(),
    fecha: trazabilidad.fecha.optional(),
    responsable: trazabilidad.responsable.optional(),
    activo: z.boolean().optional(),
  })
  .refine(alMenosUnCambio, { error: "Indique al menos un cambio." });
export type EdicionComponente = z.infer<typeof EsquemaEdicionComponente>;

export const EsquemaParametroComponente = z.strictObject({ codigo: EsquemaCodigo, componente: EsquemaCodigo });
