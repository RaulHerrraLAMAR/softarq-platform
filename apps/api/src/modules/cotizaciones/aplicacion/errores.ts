/**
 * Errores de negocio del módulo de cotizaciones. La capa HTTP los traduce a respuestas
 * (`http/controladores-cotizaciones.ts`); la aplicación no conoce HTTP.
 */
import type { CapturaBorrador } from "@softarq/contracts";

export type CodigoNegocio =
  | "NO_ENCONTRADO"
  | "CONFLICTO_EDICION"
  | "BORRADOR_DESACTUALIZADO"
  | "CAPTURA_INCOMPLETA"
  | "CALCULO_BLOQUEADO"
  | "REGISTRO_INACTIVO"
  | "IDEMPOTENCIA_CONFLICTO"
  | "IDEMPOTENCIA_CADUCADA"
  | "REFERENCIA_NO_DISPONIBLE"
  | "REVISION_PENDIENTE"
  | "VERSION_NO_VIGENTE"
  | "CONFLICTO_REVISION"
  | "ENVIO_BLOQUEADO"
  | "APROBACION_BLOQUEADA"
  | "DECISION_BLOQUEADA"
  | "SIN_PERMISO"
  // Módulo 8 (ADR-0010): emisión, anulación y descarte.
  | "EMISION_BLOQUEADA"
  | "VERSION_EMITIDA"
  | "APROBACION_NO_VIGENTE"
  | "CONFLICTO_EMISION"
  | "FOLIO_NO_ACTIVO"
  | "DESCARTE_BLOQUEADO"
  | "DOCUMENTO_NO_GENERADO"
  | "DOCUMENTO_NO_DISPONIBLE"
  | "CONFLICTO_RESPUESTA"
  | "EMISION_SUSTITUIDA"
  | "FECHA_RESPUESTA_INVALIDA"
  | "RESPUESTA_FUERA_VIGENCIA"
  // Módulo 10 (ADR-0014): excepciones B-22.
  | "EXCEPCION_INVALIDA"
  | "CONFLICTO_EXCEPCION"
  // Módulo 11 (ADR-0015): administración de catálogos.
  | "DUPLICADO"
  | "SOLAPE_VIGENCIA"
  | "PRODUCTO_CON_PRECIOS"
  | "UNIDAD_INCOMPATIBLE"
  | "CONFLICTO_TARIFA"
  | "VIGENCIA_INVALIDA"
  | "PRECIO_ANULADO"
  | "VALOR_INVALIDO"
  // Módulo 12 (ADR-0016): catálogo técnico y aprobación de conceptos.
  | "TIPO_CON_CONCEPTOS"
  | "INSUMO_CON_REFERENCIAS"
  | "CONCEPTO_INCOMPLETO"
  | "REQUISITOS_INCOMPLETOS"
  | "CONFLICTO_APROBACION"
  // Módulo 13 (ADR-0017): parámetros y personas.
  | "CORREO_EXISTENTE"
  | "ULTIMO_ADMINISTRADOR"
  | "AUTOPROTECCION"
  // Módulo 15 (ADR-0019): versión nueva con modo de precios (B-34) y vista previa BORRADOR (B-25).
  | "NUEVA_VERSION_SIN_PREPARAR"
  | "NUEVA_VERSION_NO_APLICA"
  | "SELECCIONES_DIVERGENTES"
  | "VISTA_PREVIA_BLOQUEADA";

export interface DetalleError {
  campos?: { ruta: string; mensaje: string }[];
  problemas?: { codigo: string; referencia: string; mensaje: string }[];
  actual?: { revision: number; actualizadoPor: string; actualizadoEn: string; captura?: CapturaBorrador };
  /** Estado vigente de una revisión (409 CONFLICTO_REVISION). */
  revisionVigente?: unknown;
  seguimientoVigente?: unknown;
  /** Excepciones de la versión con sus decisiones vigentes (409 CONFLICTO_EXCEPCION). */
  excepcionesVigentes?: unknown;
  /** Registro de catálogo vigente, existente (DUPLICADO) o que se solapa (SOLAPE_VIGENCIA). */
  registroVigente?: unknown;
  /** Selecciones del borrador y las que dejaría el modo de precios (409 SELECCIONES_DIVERGENTES). */
  selecciones?: { actuales: { insumoCodigo: string; precioCodigo: string }[]; propuestas: { insumoCodigo: string; precioCodigo: string }[] };
}

export class ErrorNegocio extends Error {
  constructor(
    readonly codigo: CodigoNegocio,
    mensaje: string,
    readonly detalle: DetalleError = {},
  ) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}

/** Error de la base reconocido: código SOFTARQ:* de las funciones o clave de idempotencia repetida. */
export type ErrorBaseReconocido = { tipo: "negocio"; codigo: string } | { tipo: "idempotencia_repetida" };

/**
 * Reconoce los errores que lanzan las funciones PL/pgSQL (`SOFTARQ:<CODIGO>`) y la violación de
 * la clave primaria de `idempotencia`, sin depender de cómo los envuelva el cliente de Prisma.
 */
export function reconocerErrorBase(e: unknown): ErrorBaseReconocido | null {
  const texto = textoDeError(e);
  const negocio = /SOFTARQ:([A-Z_]+)/.exec(texto);
  if (negocio) return { tipo: "negocio", codigo: negocio[1]! };
  if (texto.includes("idempotencia_pkey")) return { tipo: "idempotencia_repetida" };
  return null;
}

function textoDeError(e: unknown, profundidad = 0): string {
  if (e === null || e === undefined || profundidad > 4) return "";
  if (typeof e === "string") return e;
  if (typeof e !== "object") return String(e);
  const o = e as { message?: unknown; meta?: unknown; cause?: unknown };
  let t = typeof o.message === "string" ? o.message : "";
  try {
    if (o.meta !== undefined) t += ` ${JSON.stringify(o.meta)}`;
  } catch {
    // meta no serializable: se ignora
  }
  return `${t} ${textoDeError(o.cause, profundidad + 1)}`;
}

const MENSAJES: Record<string, [CodigoNegocio, string]> = {
  CONFLICTO_RESPUESTA: ["CONFLICTO_RESPUESTA", "Otra persona o pestaña registró una respuesta antes. Revise el registro vigente; su captura se conserva."],
  EMISION_SUSTITUIDA: ["EMISION_SUSTITUIDA", "Este documento fue sustituido por otra emisión: no admite una respuesta inicial."],
  FECHA_RESPUESTA_INVALIDA: ["FECHA_RESPUESTA_INVALIDA", "La fecha recibida debe estar entre la emisión y la fecha del servidor."],
  RESPUESTA_FUERA_VIGENCIA: ["RESPUESTA_FUERA_VIGENCIA", "La respuesta se recibió después del último día de vigencia del documento."],
  NO_ENCONTRADO: ["NO_ENCONTRADO", "El registro no existe en su organización."],
  // softarq_exigir_funcion: la pertenencia perdió la función después de iniciar la sesión (403, no 500).
  SIN_PERMISO: ["SIN_PERMISO", "Su pertenencia ya no tiene la función necesaria para esta operación."],
  CONFLICTO_EDICION: ["CONFLICTO_EDICION", "Otra persona o pestaña guardó cambios antes; revise la versión vigente."],
  BORRADOR_DESACTUALIZADO: [
    "BORRADOR_DESACTUALIZADO",
    "El borrador cambió después de la revisión indicada; guarde o recargue antes de calcular.",
  ],
  // BL-19 (módulo 7): con una revisión pendiente no se guarda el borrador ni se crean versiones.
  REVISION_PENDIENTE: [
    "REVISION_PENDIENTE",
    "La cotización tiene una versión en revisión: no se puede editar ni calcular. Retire la revisión para corregir.",
  ],
  // Módulo 8: un folio descartado no admite cambios (el trigger y las funciones lo impiden).
  FOLIO_NO_ACTIVO: ["FOLIO_NO_ACTIVO", "La cotización está descartada: su folio, versiones e historial solo se consultan."],
  CLIENTE_INACTIVO: ["REGISTRO_INACTIVO", "El cliente está inactivo: no se ofrece para registros nuevos."],
  // Módulo 11 (ADR-0015): administración de catálogos.
  PRODUCTO_CON_PRECIOS: [
    "PRODUCTO_CON_PRECIOS",
    "El producto ya tiene precios registrados: su insumo, presentación, unidad, contenido y venta fraccionada no cambian. Registre un producto nuevo para otra presentación.",
  ],
  PRODUCTO_INACTIVO: ["REGISTRO_INACTIVO", "El producto está inactivo: no admite precios nuevos."],
  PROVEEDOR_INACTIVO: ["REGISTRO_INACTIVO", "El proveedor está inactivo: no admite precios ni tarifas nuevos."],
  INSUMO_INACTIVO: ["REGISTRO_INACTIVO", "Seleccione un insumo activo."],
  TARIFA_INACTIVA: ["REGISTRO_INACTIVO", "La tarifa está inactiva: no se puede asignar."],
  UNIDAD_INVALIDA: ["VALOR_INVALIDO", "La unidad no existe o no corresponde a este registro."],
  UNIDAD_INCOMPATIBLE: [
    "UNIDAD_INCOMPATIBLE",
    "La tarifa está en una unidad distinta a la del concepto (BL-06). Elija una tarifa de la misma unidad.",
  ],
  CONFLICTO_TARIFA: ["CONFLICTO_TARIFA", "Otra persona cambió la tarifa del concepto antes; revise la asignación vigente."],
  VIGENCIA_INVALIDA: [
    "VIGENCIA_INVALIDA",
    "Fechas no válidas: la nueva fecha final debe ser igual o posterior a hoy y al inicio, y anterior a la actual; el sucesor empieza después.",
  ],
  PRECIO_ANULADO: ["PRECIO_ANULADO", "El precio está anulado: la anulación es definitiva y ya no admite cambios."],
  VALOR_INVALIDO: ["VALOR_INVALIDO", "Algún valor no es válido para este registro."],
  REGISTRO_INMUTABLE: ["VALOR_INVALIDO", "Ese dato no se edita: registre uno nuevo."],
  PROYECTO_INACTIVO: ["REGISTRO_INACTIVO", "El proyecto está inactivo: no se ofrece para cotizaciones nuevas."],
  // Módulo 12 (ADR-0016): catálogo técnico y aprobación de conceptos.
  TIPO_INACTIVO: ["REGISTRO_INACTIVO", "El tipo de estructura está inactivo: no se ofrece para conceptos nuevos ni para reclasificar."],
  TIPO_CON_CONCEPTOS: [
    "TIPO_CON_CONCEPTOS",
    "El tipo ya tiene conceptos: su familia no cambia. Registre otro tipo para la nueva familia; los conceptos no se trasladan solos.",
  ],
  INSUMO_CON_REFERENCIAS: [
    "INSUMO_CON_REFERENCIAS",
    "No puede cambiar la unidad base: el insumo ya tiene productos, conversiones o componentes. Registre un insumo nuevo.",
  ],
  CONVERSION_DESTINO: ["VALOR_INVALIDO", "La unidad de origen es la unidad base del insumo; no requiere conversión."],
  UNIDAD_FORMULA: ["VALOR_INVALIDO", "La unidad del concepto no corresponde al tipo de fórmula de medición."],
  CONCEPTO_INCOMPLETO: [
    "CONCEPTO_INCOMPLETO",
    "Datos incompletos de la carga anterior: complete el tipo de estructura y la regla de medición antes de cambiar el concepto o sus componentes.",
  ],
  REQUISITOS_INCOMPLETOS: ["REQUISITOS_INCOMPLETOS", "El concepto no cumple los requisitos de aprobación."],
  CONFLICTO_APROBACION: [
    "CONFLICTO_APROBACION",
    "El contenido técnico del concepto cambió mientras lo revisaba: revise la versión vigente antes de aprobar.",
  ],
  YA_APROBADO: ["CONFLICTO_APROBACION", "El concepto ya está aprobado."],
  // Módulo 13 (ADR-0017): parámetros y personas.
  CORREO_EXISTENTE: ["CORREO_EXISTENTE", "Ese correo ya está registrado. Use otro correo."],
  ULTIMO_ADMINISTRADOR: [
    "ULTIMO_ADMINISTRADOR",
    "La organización debe conservar al menos un Administrador del sistema activo: asigne la función a otra persona antes.",
  ],
  AUTOPROTECCION: [
    "AUTOPROTECCION",
    "No puede retirarse su propia función de Administrador del sistema, desactivarse ni restablecer su propia contraseña: pídalo a otro Administrador o use «Cambiar mi contraseña».",
  ],
  APROBACION_DIRECTA: ["VALOR_INVALIDO", "El concepto se aprueba con la operación Aprobar."],
  // Módulo 15 (ADR-0019, B-34): tras una emisión, la versión nueva exige preparar modo y motivo.
  NUEVA_VERSION_SIN_PREPARAR: [
    "NUEVA_VERSION_SIN_PREPARAR",
    "La última versión está emitida: prepare la versión nueva (modo de precios y motivo) antes de editar o calcular.",
  ],
  NUEVA_VERSION_NO_APLICA: [
    "NUEVA_VERSION_NO_APLICA",
    "No corresponde preparar una versión nueva: la última versión no es la emitida indicada o el ciclo ya está preparado.",
  ],
};

/** Traduce un error de las funciones de la base a `ErrorNegocio`; si no lo reconoce, lo devuelve igual. */
export function traducirErrorBase(e: unknown): unknown {
  const r = reconocerErrorBase(e);
  if (r?.tipo !== "negocio") return e;
  const m = MENSAJES[r.codigo];
  return m ? new ErrorNegocio(m[0], m[1]) : e;
}
