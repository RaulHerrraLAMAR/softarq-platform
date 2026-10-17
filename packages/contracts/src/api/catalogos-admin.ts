/**
 * Administración de proveedores, productos, precios y tarifas (módulo 11, ADR-0015).
 *
 * Contrato INTERNO: incluye importes de proveedor, contenidos de presentación y tarifas. Solo lo
 * sirve la API bajo `/admin/...` con la capacidad `catalogos.administrar` (Administrador del
 * catálogo, `Req_Funcion FN_ADMCAT` del libro). Nada de esto se añade a la proyección comercial,
 * a las versiones ni al PDF.
 *
 * Fuentes: `modCatalogos.bas` (Cat_Campos, Val_Proveedor, Val_Producto, Val_Precio, Val_Tarifa,
 * Precio_Anular) y Word maestro §3.5, §5.6 y RF-03, RF-05, RF-06, RF-07. Adaptaciones autorizadas
 * por el propietario: bloqueo técnico del producto con precios, cierre de vigencia con sucesor
 * (P3 pendiente con el cliente) y asignación de tarifa al concepto (ADR-0015 §2).
 */
import { z } from "zod";
import { MODALIDADES_MANO_OBRA } from "../calculo.js";
import { PATRON_DECIMAL_TEXTO } from "../decimal.js";
import { EsquemaCodigo, EsquemaFechaISO, LIMITES_API } from "./esquemas.js";

export const LIMITES_CATALOGO_ADMIN = {
  longitudNombre: 200,
  longitudContacto: 200,
  longitudTelefono: 40,
  longitudCorreo: 254,
  longitudDescripcion: 500,
  longitudPresentacion: 200,
  longitudFuente: 500,
  longitudMotivo: 500,
  minimoMotivo: 10,
  longitudBusqueda: 60,
  /** Eventos de bitácora que acompañan al detalle de un registro. */
  historial: 50,
} as const;

/** Magnitudes de unidad admitidas para una tarifa (`Lista_Unidades("longitud;area;volumen;conteo;masa")`). */
export const MAGNITUDES_UNIDAD_TARIFA = ["longitud", "area", "volumen", "conteo", "masa"] as const;

/** Estado de un precio a la fecha del servidor (derivado; no se guarda). */
export const ESTADOS_PRECIO = ["VIGENTE", "FUTURO", "VENCIDO", "ANULADO"] as const;
export type EstadoPrecio = (typeof ESTADOS_PRECIO)[number];

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

const textoObligatorio = (max: number, campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .min(1, { error: `Indique ${campo}.` })
    .max(max, { error: `${campo}: máximo ${max} caracteres.` });

/** Texto opcional: `null` o cadena vacía = sin capturar. */
const textoOpcional = (max: number, campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .max(max, { error: `${campo}: máximo ${max} caracteres.` })
    .transform((t) => (t === "" ? null : t))
    .nullable();

const telefono = z
  .string({ error: "El teléfono debe ser un texto." })
  .trim()
  .max(LIMITES_CATALOGO_ADMIN.longitudTelefono, { error: `Teléfono: máximo ${LIMITES_CATALOGO_ADMIN.longitudTelefono} caracteres.` })
  .refine((t) => t === "" || (/^[0-9+()./ -]+$/.test(t) && (t.match(/\d/g) ?? []).length >= 7), {
    error: "Teléfono: use dígitos y separadores (al menos 7 dígitos).",
  })
  .transform((t) => (t === "" ? null : t))
  .nullable();

/** `Correo_Valido` del libro: se comprueba solo si se captura. */
const correo = z
  .string({ error: "El correo debe ser un texto." })
  .trim()
  .max(LIMITES_CATALOGO_ADMIN.longitudCorreo, { error: `Correo: máximo ${LIMITES_CATALOGO_ADMIN.longitudCorreo} caracteres.` })
  .refine((t) => t === "" || z.email().safeParse(t).success, { error: "Correo: formato inválido." })
  .transform((t) => (t === "" ? null : t))
  .nullable();

/** Motivo de una anulación, un cierre de vigencia o una asignación de tarifa. */
const motivo = z
  .string({ error: "El motivo debe ser un texto." })
  .trim()
  .max(LIMITES_CATALOGO_ADMIN.longitudMotivo, { error: `Motivo: máximo ${LIMITES_CATALOGO_ADMIN.longitudMotivo} caracteres.` })
  .refine((t) => t.length >= LIMITES_CATALOGO_ADMIN.minimoMotivo && /\p{L}/u.test(t), {
    error: `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).`,
  });

/** Fecha de calendario real (AAAA-MM-DD), sin hora ni zona horaria. */
export const EsquemaFechaReal = EsquemaFechaISO.refine(
  (f) => {
    const [a, m, d] = f.split("-").map(Number) as [number, number, number];
    const fecha = new Date(`${f}T00:00:00Z`);
    return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
  },
  { error: "Capture una fecha real con formato AAAA-MM-DD." },
);

/**
 * Decimal en texto mayor que cero que cabe en su columna NUMERIC sin redondeo: como máximo
 * `escala` decimales significativos y `enteros` dígitos enteros (ADR-0004 §4).
 */
export function esquemaDecimalPositivo(campo: string, escala: number, enteros: number) {
  return z
    .string({ error: `${campo}: debe ser un decimal en texto (por ejemplo "12.5"), no un número.` })
    .regex(PATRON_DECIMAL_TEXTO, { error: `${campo}: decimal inválido (punto decimal, sin comas, espacios ni exponente).` })
    .superRefine((v, ctx) => {
      if (v.startsWith("-")) {
        ctx.addIssue({ code: "custom", message: `${campo}: debe ser mayor que cero.` });
        return;
      }
      const [entera = "", fraccion = ""] = v.split(".");
      if (/^0*$/.test(entera) && /^0*$/.test(fraccion)) {
        ctx.addIssue({ code: "custom", message: `${campo}: debe ser mayor que cero.` });
      }
      if (fraccion.replace(/0+$/, "").length > escala) {
        ctx.addIssue({ code: "custom", message: `${campo}: admite hasta ${escala} decimales; no se redondea.` });
      }
      if (entera.replace(/^0+(?=\d)/, "").length > enteros) {
        ctx.addIssue({ code: "custom", message: `${campo}: admite hasta ${enteros} dígitos enteros.` });
      }
    });
}

/** Importes de catálogo: NUMERIC(18,6). */
const dinero = (campo: string) => esquemaDecimalPositivo(campo, 6, 12);
/** Contenido, incremento y rendimiento por jornada: NUMERIC(20,6). */
const cantidad = (campo: string) => esquemaDecimalPositivo(campo, 6, 14);

/** Clave de la referencia común `unidad` (m2, pza, bulto…). */
export const EsquemaClaveUnidad = z
  .string({ error: "La unidad debe ser un texto." })
  .regex(/^[a-z0-9]{1,10}$/, { error: "Unidad inválida." });

const buscar = z
  .string()
  .trim()
  .min(1, { error: "buscar no puede estar vacío." })
  .max(LIMITES_CATALOGO_ADMIN.longitudBusqueda, { error: `buscar admite hasta ${LIMITES_CATALOGO_ADMIN.longitudBusqueda} caracteres.` })
  .optional();

const limite = z
  .string()
  .regex(/^\d{1,3}$/, { error: "limite debe ser un entero." })
  .transform(Number)
  .pipe(z.number().int().min(1).max(LIMITES_API.limiteListadoMaximo, { error: `limite máximo: ${LIMITES_API.limiteListadoMaximo}.` }))
  .optional();

/** Paginación por código (keyset): la página siguiente empieza después de este código. */
const despuesDe = EsquemaCodigo.optional();

const booleanoTexto = z
  .enum(["true", "false"], { error: "Use true o false." })
  .transform((v) => v === "true")
  .optional();

const EsquemaInstante = z.string();

const revision = z.number({ error: "Indique la revisión del registro que editó." }).int().nonnegative();

const alMenosUnCambio = (e: Record<string, unknown>) => Object.keys(e).some((k) => k !== "revision");

/** Evento de la bitácora de un registro de catálogo (sin datos personales ni tokens). */
export const EsquemaEventoCatalogo = z.strictObject({
  tipo: z.string(),
  ocurridoEn: EsquemaInstante,
  usuario: z.string(),
  detalle: z.record(z.string(), z.unknown()),
});
export type EventoCatalogo = z.infer<typeof EsquemaEventoCatalogo>;

export const EsquemaParametroCodigo = z.strictObject({ codigo: EsquemaCodigo });

// ---------------------------------------------------------------------------
// Proveedores (03 PROVEEDORES)
// ---------------------------------------------------------------------------

const camposProveedor = {
  nombre: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudNombre, "el nombre del proveedor"),
  contacto: textoOpcional(LIMITES_CATALOGO_ADMIN.longitudContacto, "el contacto"),
  telefono,
  correo,
};

export const EsquemaSolicitudProveedor = z.strictObject({
  nombre: camposProveedor.nombre,
  contacto: camposProveedor.contacto.optional(),
  telefono: camposProveedor.telefono.optional(),
  correo: camposProveedor.correo.optional(),
});
export type SolicitudProveedor = z.infer<typeof EsquemaSolicitudProveedor>;

export const EsquemaEdicionProveedor = z
  .strictObject({
    revision,
    nombre: camposProveedor.nombre.optional(),
    contacto: camposProveedor.contacto.optional(),
    telefono: camposProveedor.telefono.optional(),
    correo: camposProveedor.correo.optional(),
    activo: z.boolean().optional(),
  })
  .refine(alMenosUnCambio, { error: "Indique al menos un cambio." });
export type EdicionProveedor = z.infer<typeof EsquemaEdicionProveedor>;

export const EsquemaConsultaProveedoresAdmin = z.strictObject({ buscar, incluirInactivos: booleanoTexto, despuesDe, limite });
export type ConsultaProveedoresAdmin = z.infer<typeof EsquemaConsultaProveedoresAdmin>;

export const EsquemaProveedorAdmin = z.strictObject({
  codigo: z.string(),
  nombre: z.string(),
  contacto: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
  activo: z.boolean(),
  revision: z.number().int(),
  creadoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  /** `null` en los registros de la carga DEMO. */
  modificadoPor: z.string().nullable(),
});
export type ProveedorAdmin = z.infer<typeof EsquemaProveedorAdmin>;

export const EsquemaRespuestaProveedoresAdmin = z.strictObject({
  proveedores: z.array(EsquemaProveedorAdmin),
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaProveedoresAdmin = z.infer<typeof EsquemaRespuestaProveedoresAdmin>;

/** Lo que afecta una desactivación (`Cat_CambiarActivo`), para confirmarla con información. */
export const EsquemaImpactoCatalogo = z.strictObject({
  /** Precios no anulados vigentes hoy que dejarían de ofrecerse. */
  preciosVigentes: z.number().int().nonnegative(),
  /** Tarifas activas que lo citan como subcontratista (solo proveedores). */
  tarifas: z.number().int().nonnegative(),
  /** Conceptos que usan la tarifa (solo tarifas). */
  conceptos: z.number().int().nonnegative(),
  /** Cotizaciones activas cuyo borrador guardado lo usa: quedarán con la referencia no disponible o pendientes de recalcular. */
  borradoresAbiertos: z.number().int().nonnegative(),
});
export type ImpactoCatalogo = z.infer<typeof EsquemaImpactoCatalogo>;

export const EsquemaDetalleProveedorAdmin = z.strictObject({
  proveedor: EsquemaProveedorAdmin,
  impacto: EsquemaImpactoCatalogo,
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleProveedorAdmin = z.infer<typeof EsquemaDetalleProveedorAdmin>;

// ---------------------------------------------------------------------------
// Productos comerciales (05 PRODUCTOS)
// ---------------------------------------------------------------------------

const camposProducto = {
  insumoCodigo: EsquemaCodigo,
  descripcion: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudDescripcion, "la descripción comercial"),
  presentacion: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudPresentacion, "la presentación"),
  unidadCompra: EsquemaClaveUnidad,
  contenido: cantidad("Contenido"),
  fraccionable: z.boolean({ error: "Indique si la venta fraccionada está permitida." }),
  /** Obligatorio (> 0) si es fraccionable; `null` si no (se distingue de cero). */
  incrementoMinimo: cantidad("Incremento mínimo").nullable(),
};

export const EsquemaSolicitudProducto = z
  .strictObject(camposProducto)
  .superRefine((p, ctx) => {
    if (p.fraccionable && p.incrementoMinimo === null) {
      ctx.addIssue({ code: "custom", path: ["incrementoMinimo"], message: "Indique el incremento mínimo de venta." });
    }
    if (!p.fraccionable && p.incrementoMinimo !== null) {
      ctx.addIssue({ code: "custom", path: ["incrementoMinimo"], message: "El incremento mínimo solo aplica si la venta fraccionada está permitida." });
    }
  });
export type SolicitudProducto = z.infer<typeof EsquemaSolicitudProducto>;

/**
 * Edición. Con algún precio registrado (vigente, vencido o anulado) solo cambian la descripción
 * comercial y el estado activo; lo comprueban la API y un disparador (ADR-0015 §2.1).
 */
export const EsquemaEdicionProducto = z
  .strictObject({
    revision,
    descripcion: camposProducto.descripcion.optional(),
    presentacion: camposProducto.presentacion.optional(),
    insumoCodigo: camposProducto.insumoCodigo.optional(),
    unidadCompra: camposProducto.unidadCompra.optional(),
    contenido: camposProducto.contenido.optional(),
    fraccionable: camposProducto.fraccionable.optional(),
    incrementoMinimo: camposProducto.incrementoMinimo.optional(),
    activo: z.boolean().optional(),
  })
  .refine(alMenosUnCambio, { error: "Indique al menos un cambio." });
export type EdicionProducto = z.infer<typeof EsquemaEdicionProducto>;

/** Campos que dejan de editarse cuando el producto tiene precios. */
export const CAMPOS_TECNICOS_PRODUCTO = [
  "insumoCodigo",
  "presentacion",
  "unidadCompra",
  "contenido",
  "fraccionable",
  "incrementoMinimo",
] as const;

export const EsquemaConsultaProductosAdmin = z.strictObject({
  buscar,
  insumoCodigo: EsquemaCodigo.optional(),
  incluirInactivos: booleanoTexto,
  despuesDe,
  limite,
});
export type ConsultaProductosAdmin = z.infer<typeof EsquemaConsultaProductosAdmin>;

export const EsquemaProductoAdmin = z.strictObject({
  codigo: z.string(),
  insumo: z.strictObject({ codigo: z.string(), descripcion: z.string(), unidadBase: z.string(), activo: z.boolean() }),
  descripcion: z.string(),
  presentacion: z.string(),
  unidadCompra: z.string(),
  /** En la unidad base del insumo por cada unidad de compra. */
  contenido: z.string(),
  fraccionable: z.boolean(),
  incrementoMinimo: z.string().nullable(),
  activo: z.boolean(),
  revision: z.number().int(),
  /** Tiene al menos un precio registrado (cualquier estado): campos técnicos bloqueados. */
  tienePrecios: z.boolean(),
  creadoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string().nullable(),
});
export type ProductoAdmin = z.infer<typeof EsquemaProductoAdmin>;

export const EsquemaRespuestaProductosAdmin = z.strictObject({
  productos: z.array(EsquemaProductoAdmin),
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaProductosAdmin = z.infer<typeof EsquemaRespuestaProductosAdmin>;

export const EsquemaDetalleProductoAdmin = z.strictObject({
  producto: EsquemaProductoAdmin,
  impacto: EsquemaImpactoCatalogo,
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleProductoAdmin = z.infer<typeof EsquemaDetalleProductoAdmin>;

// ---------------------------------------------------------------------------
// Precios (06 PRECIOS)
// ---------------------------------------------------------------------------

const camposVigencia = {
  vigenteDesde: EsquemaFechaReal,
  vigenteHasta: EsquemaFechaReal,
};

const vigenciaCoherente = (v: { vigenteDesde: string; vigenteHasta: string }) => v.vigenteDesde <= v.vigenteHasta;
const ERROR_VIGENCIA = { error: "La vigencia es incoherente: «desde» debe ser anterior o igual a «hasta».", path: ["vigenteHasta"] };

export const EsquemaSolicitudPrecio = z
  .strictObject({
    productoCodigo: EsquemaCodigo,
    proveedorCodigo: EsquemaCodigo,
    /** MXN por unidad de compra, antes de impuestos (Word §1.5). */
    precioUnitario: dinero("Precio unitario"),
    ...camposVigencia,
    fuente: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudFuente, "la fuente del precio"),
  })
  .refine(vigenciaCoherente, ERROR_VIGENCIA);
export type SolicitudPrecio = z.infer<typeof EsquemaSolicitudPrecio>;

export const EsquemaAnulacionPrecio = z.strictObject({ revision, motivo });
export type AnulacionPrecio = z.infer<typeof EsquemaAnulacionPrecio>;

/** Sucesor del cierre de vigencia: mismo producto y proveedor. */
export const EsquemaSucesorPrecio = z
  .strictObject({
    precioUnitario: dinero("Precio unitario del sucesor"),
    ...camposVigencia,
    fuente: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudFuente, "la fuente del sucesor"),
  })
  .refine(vigenciaCoherente, ERROR_VIGENCIA);

/**
 * «Cerrar vigencia y registrar sucesor» (adaptación autorizada; P3 pendiente con el cliente).
 * Vigencias inclusivas: el sucesor empieza después de la nueva fecha final.
 */
export const EsquemaCierreVigenciaPrecio = z
  .strictObject({
    revision,
    nuevaHasta: EsquemaFechaReal,
    motivo,
    sucesor: EsquemaSucesorPrecio,
  })
  .refine((c) => c.sucesor.vigenteDesde > c.nuevaHasta, {
    error: "El sucesor debe empezar después del último día del precio que se cierra.",
    path: ["sucesor", "vigenteDesde"],
  });
export type CierreVigenciaPrecio = z.infer<typeof EsquemaCierreVigenciaPrecio>;

export const EsquemaConsultaPreciosAdmin = z.strictObject({
  buscar,
  productoCodigo: EsquemaCodigo.optional(),
  proveedorCodigo: EsquemaCodigo.optional(),
  estado: z.enum(ESTADOS_PRECIO).optional(),
  despuesDe,
  limite,
});
export type ConsultaPreciosAdmin = z.infer<typeof EsquemaConsultaPreciosAdmin>;

export const EsquemaPrecioAdmin = z.strictObject({
  codigo: z.string(),
  producto: z.strictObject({
    codigo: z.string(),
    descripcion: z.string(),
    presentacion: z.string(),
    unidadCompra: z.string(),
    activo: z.boolean(),
  }),
  proveedor: z.strictObject({ codigo: z.string(), nombre: z.string(), activo: z.boolean() }),
  precioUnitario: z.string(),
  vigenteDesde: EsquemaFechaISO,
  vigenteHasta: EsquemaFechaISO,
  estado: z.enum(ESTADOS_PRECIO),
  fuente: z.string(),
  motivoAnulacion: z.string().nullable(),
  anuladoPor: z.string().nullable(),
  anuladoEn: EsquemaInstante.nullable(),
  revision: z.number().int(),
  registradoPor: z.string().nullable(),
  registradoEn: EsquemaInstante,
});
export type PrecioAdmin = z.infer<typeof EsquemaPrecioAdmin>;

export const EsquemaRespuestaPreciosAdmin = z.strictObject({
  precios: z.array(EsquemaPrecioAdmin),
  /** Fecha del servidor con la que se derivó el estado. */
  fechaReferencia: EsquemaFechaISO,
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaPreciosAdmin = z.infer<typeof EsquemaRespuestaPreciosAdmin>;

export const EsquemaDetallePrecioAdmin = z.strictObject({
  precio: EsquemaPrecioAdmin,
  fechaReferencia: EsquemaFechaISO,
  impacto: EsquemaImpactoCatalogo,
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetallePrecioAdmin = z.infer<typeof EsquemaDetallePrecioAdmin>;

export const EsquemaRespuestaCierreVigencia = z.strictObject({
  cerrado: EsquemaPrecioAdmin,
  sucesor: EsquemaPrecioAdmin,
  fechaReferencia: EsquemaFechaISO,
});
export type RespuestaCierreVigencia = z.infer<typeof EsquemaRespuestaCierreVigencia>;

// ---------------------------------------------------------------------------
// Tarifas de mano de obra (07 MANO_OBRA)
// ---------------------------------------------------------------------------

export const EsquemaSolicitudTarifa = z
  .strictObject({
    modalidad: z.enum(MODALIDADES_MANO_OBRA, { error: "Seleccione la modalidad." }),
    descripcion: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudDescripcion, "la descripción"),
    /** Unidad del concepto a la que aplica. */
    unidad: EsquemaClaveUnidad,
    /** MXN por unidad, por jornada o precio del subcontrato. */
    importe: dinero("Importe"),
    /** Solo en JORNADA (> 0); `null` en las demás. */
    rendimientoJornada: cantidad("Rendimiento por jornada").nullable(),
    /** Subcontratista opcional. */
    proveedorCodigo: EsquemaCodigo.nullable(),
    ...camposVigencia,
    fuente: textoObligatorio(LIMITES_CATALOGO_ADMIN.longitudFuente, "la fuente de la tarifa"),
  })
  .superRefine((t, ctx) => {
    if (t.modalidad === "JORNADA" && t.rendimientoJornada === null) {
      ctx.addIssue({ code: "custom", path: ["rendimientoJornada"], message: "Falta el rendimiento por jornada." });
    }
    if (t.modalidad !== "JORNADA" && t.rendimientoJornada !== null) {
      ctx.addIssue({ code: "custom", path: ["rendimientoJornada"], message: "El rendimiento por jornada solo aplica a la modalidad JORNADA." });
    }
    if (!vigenciaCoherente(t)) {
      ctx.addIssue({ code: "custom", path: ["vigenteHasta"], message: ERROR_VIGENCIA.error });
    }
  });
export type SolicitudTarifa = z.infer<typeof EsquemaSolicitudTarifa>;

/** Las tarifas no se editan (`Val_Tarifa`): solo se desactivan o reactivan. */
export const EsquemaEdicionTarifa = z.strictObject({ revision, activa: z.boolean() });
export type EdicionTarifa = z.infer<typeof EsquemaEdicionTarifa>;

export const EsquemaConsultaTarifasAdmin = z.strictObject({
  buscar,
  modalidad: z.enum(MODALIDADES_MANO_OBRA).optional(),
  unidad: EsquemaClaveUnidad.optional(),
  incluirInactivas: booleanoTexto,
  despuesDe,
  limite,
});
export type ConsultaTarifasAdmin = z.infer<typeof EsquemaConsultaTarifasAdmin>;

export const EsquemaTarifaAdmin = z.strictObject({
  codigo: z.string(),
  modalidad: z.enum(MODALIDADES_MANO_OBRA),
  descripcion: z.string(),
  unidad: z.string(),
  importe: z.string(),
  rendimientoJornada: z.string().nullable(),
  proveedor: z.strictObject({ codigo: z.string(), nombre: z.string(), activo: z.boolean() }).nullable(),
  vigenteDesde: EsquemaFechaISO,
  vigenteHasta: EsquemaFechaISO,
  /** Vigente a la fecha del servidor (BL-10 la exige al calcular). */
  vigenteHoy: z.boolean(),
  activa: z.boolean(),
  fuente: z.string(),
  revision: z.number().int(),
  registradoPor: z.string().nullable(),
  registradoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
});
export type TarifaAdmin = z.infer<typeof EsquemaTarifaAdmin>;

export const EsquemaRespuestaTarifasAdmin = z.strictObject({
  tarifas: z.array(EsquemaTarifaAdmin),
  fechaReferencia: EsquemaFechaISO,
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaTarifasAdmin = z.infer<typeof EsquemaRespuestaTarifasAdmin>;

export const EsquemaDetalleTarifaAdmin = z.strictObject({
  tarifa: EsquemaTarifaAdmin,
  fechaReferencia: EsquemaFechaISO,
  /** Conceptos que tienen asignada esta tarifa. */
  conceptos: z.array(z.strictObject({ codigo: z.string(), descripcion: z.string(), activo: z.boolean() })),
  impacto: EsquemaImpactoCatalogo,
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleTarifaAdmin = z.infer<typeof EsquemaDetalleTarifaAdmin>;

// ---------------------------------------------------------------------------
// Asignación de tarifa a un concepto (dependencia mínima autorizada; Word §3.5)
// ---------------------------------------------------------------------------

export const EsquemaAsignacionTarifa = z
  .strictObject({
    /** Tarifa que la pantalla mostraba asignada (control de concurrencia); `null` si no tenía. */
    tarifaActual: EsquemaCodigo.nullable(),
    tarifaNueva: EsquemaCodigo,
    motivo,
  })
  .refine((a) => a.tarifaActual !== a.tarifaNueva, { error: "La tarifa nueva es la que ya está asignada.", path: ["tarifaNueva"] });
export type AsignacionTarifa = z.infer<typeof EsquemaAsignacionTarifa>;

export const EsquemaConsultaConceptosAdmin = z.strictObject({ buscar, despuesDe, limite });
export type ConsultaConceptosAdmin = z.infer<typeof EsquemaConsultaConceptosAdmin>;

export const EsquemaConceptoTarifaAdmin = z.strictObject({
  codigo: z.string(),
  descripcion: z.string(),
  unidad: z.string(),
  clase: z.string(),
  estado: z.string(),
  activo: z.boolean(),
  tarifa: z
    .strictObject({
      codigo: z.string(),
      modalidad: z.enum(MODALIDADES_MANO_OBRA),
      descripcion: z.string(),
      unidad: z.string(),
      importe: z.string(),
      activa: z.boolean(),
      vigenteDesde: EsquemaFechaISO,
      vigenteHasta: EsquemaFechaISO,
    })
    .nullable(),
  /** Cotizaciones activas cuyo borrador usa el concepto (se recalculan con la tarifa nueva). */
  borradoresAbiertos: z.number().int().nonnegative(),
});
export type ConceptoTarifaAdmin = z.infer<typeof EsquemaConceptoTarifaAdmin>;

export const EsquemaRespuestaConceptosAdmin = z.strictObject({
  conceptos: z.array(EsquemaConceptoTarifaAdmin),
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaConceptosAdmin = z.infer<typeof EsquemaRespuestaConceptosAdmin>;

// ---------------------------------------------------------------------------
// Referencias de solo lectura para los formularios
// ---------------------------------------------------------------------------

/** Por omisión solo insumos activos (los que se ofrecen para registros nuevos). */
export const EsquemaConsultaInsumosAdmin = z.strictObject({ buscar, incluirInactivos: booleanoTexto, despuesDe, limite });
export type ConsultaInsumosAdmin = z.infer<typeof EsquemaConsultaInsumosAdmin>;

export const EsquemaInsumoAdmin = z.strictObject({
  codigo: z.string(),
  descripcion: z.string(),
  unidadBase: z.string(),
  activo: z.boolean(),
});
export type InsumoAdmin = z.infer<typeof EsquemaInsumoAdmin>;

export const EsquemaRespuestaInsumosAdmin = z.strictObject({
  insumos: z.array(EsquemaInsumoAdmin),
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaInsumosAdmin = z.infer<typeof EsquemaRespuestaInsumosAdmin>;

export const EsquemaUnidad = z.strictObject({ clave: z.string(), nombre: z.string(), magnitud: z.string() });
export const EsquemaRespuestaUnidades = z.strictObject({ unidades: z.array(EsquemaUnidad) });
export type RespuestaUnidades = z.infer<typeof EsquemaRespuestaUnidades>;
