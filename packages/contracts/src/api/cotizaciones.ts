/**
 * Contratos HTTP de clientes, proyectos y cotizaciones con folio, borrador y versiones
 * (módulo 6, ADR-0008). Mismas reglas que `esquemas.ts`: objetos estrictos, decimales en texto
 * y límites explícitos. Sin lógica de negocio: la completitud, los folios, las versiones y los
 * permisos los decide la API.
 */
import { z } from "zod";
import {
  EsquemaCodigo,
  EsquemaCotizacionComercial,
  EsquemaDecimalTexto,
  EsquemaFechaISO,
  LIMITES_API,
} from "./esquemas.js";
import { EsquemaListaExcepciones } from "./excepciones.js";

export const LIMITES_COTIZACIONES = {
  longitudNombre: 200,
  longitudMunicipio: 120,
  longitudEntidad: 60,
  longitudDescripcionProyecto: 500,
  longitudMotivo: 500,
  longitudBusqueda: 60,
  eventosRecientes: 50,
  // Módulo 8 (ADR-0010): contacto del cliente (BL-01) y textos de la versión (BL-20).
  longitudContactoNombre: 200,
  longitudTelefono: 40,
  longitudCorreo: 254,
  longitudTextoCotizacion: 2000,
} as const;

/** Cabecera de idempotencia de las altas (UUID generado por el cliente para cada intención). */
export const CABECERA_IDEMPOTENCIA = "Idempotency-Key";
/** Cabecera de respuesta cuando se reproduce el resultado de una clave ya usada. */
export const CABECERA_IDEMPOTENCIA_REPRODUCIDA = "Idempotent-Replayed";

/** Origen del historial: independiente de la fase Excel (no se importan folios del libro). */
export const ORIGENES_COTIZACION = ["WEB_DEMO"] as const;
/** Estado del folio: DESCARTADO es definitivo y el folio no se reutiliza (módulo 8, ADR-0010). */
export const ESTADOS_FOLIO = ["ACTIVO", "DESCARTADO"] as const;
/**
 * Estado de una versión, DERIVADO (nunca se escribe en la versión): EMITIDA si tiene emisión
 * (SUSTITUIDA si después se emitió una posterior); si no, el de su última revisión (ADR-0009):
 * EN_REVISION, APROBADA (aprobación vigente) o BORRADOR (sin enviar, con cambios solicitados,
 * retirada o con la aprobación anulada). Aceptada, Rechazada y Vencida del libro no existen aún.
 */
export const ESTADOS_VERSION = ["BORRADOR", "EN_REVISION", "APROBADA", "EMITIDA", "SUSTITUIDA"] as const;
export type EstadoVersion = (typeof ESTADOS_VERSION)[number];

/**
 * Estados de una revisión (máquina explícita): PENDIENTE → APROBADA | CAMBIOS_SOLICITADOS |
 * RETIRADA, las tres terminales. Volver a enviar crea otra revisión.
 */
export const ESTADOS_REVISION = ["PENDIENTE", "APROBADA", "CAMBIOS_SOLICITADOS", "RETIRADA"] as const;
export type EstadoRevision = (typeof ESTADOS_REVISION)[number];

export const TIPOS_EVENTO_REVISION = ["ENVIADA", "APROBADA", "CAMBIOS_SOLICITADOS", "RETIRADA", "APROBACION_ANULADA"] as const;
/** Estado que deja cada evento: ANULADA solo lo deja `APROBACION_ANULADA` (la revisión sigue APROBADA). */
export const ESTADOS_EVENTO_REVISION = [...ESTADOS_REVISION, "ANULADA"] as const;

const EsquemaUuid = z.uuid({ error: "Identificador inválido (UUID)." });

const textoObligatorio = (max: number, campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .min(1, { error: `Indique ${campo}.` })
    .max(max, { error: `${campo}: máximo ${max} caracteres.` });

/** Texto opcional: `null` (o cadena vacía, que se normaliza a `null`) = sin capturar. */
const textoOpcional = (max: number, campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .max(max, { error: `${campo}: máximo ${max} caracteres.` })
    .transform((t) => (t === "" ? null : t))
    .nullable();

const descripcionCaptura = z
  .string({ error: "Debe ser un texto." })
  .max(LIMITES_API.longitudDescripcion, { error: `Máximo ${LIMITES_API.longitudDescripcion} caracteres.` });

/** Decimal capturado: `null` = sin capturar; `"0"` = cero (un valor); otro texto = inválido (400). */
const EsquemaDecimalCapturado = EsquemaDecimalTexto.nullable();

// ---------------------------------------------------------------------------
// Captura en borrador
// ---------------------------------------------------------------------------

const textoCotizacion = (campo: string) =>
  z
    .string({ error: `${campo}: debe ser un texto.` })
    .trim()
    .max(LIMITES_COTIZACIONES.longitudTextoCotizacion, {
      error: `${campo}: máximo ${LIMITES_COTIZACIONES.longitudTextoCotizacion} caracteres.`,
    });

/**
 * Textos comerciales de la versión (10 COTIZAR: alcance, condiciones y exclusiones; BL-20). Se
 * capturan en el borrador, se copian a la versión al calcular y el revisor los ve antes de
 * aprobar. No intervienen en el cálculo. Pueden guardarse vacíos; vacíos bloquean enviar,
 * aprobar y emitir (BL-20).
 */
export const EsquemaTextosCotizacion = z.strictObject({
  alcance: textoCotizacion("Alcance"),
  condiciones: textoCotizacion("Condiciones"),
  exclusiones: textoCotizacion("Exclusiones"),
});
export type TextosCotizacion = z.infer<typeof EsquemaTextosCotizacion>;

export const EsquemaRenglonBorrador = z.strictObject({
  descripcion: descripcionCaptura,
  signo: z.enum(["+", "-"], { error: "El signo debe ser \"+\" o \"-\"." }),
  piezas: EsquemaDecimalCapturado,
  largo: EsquemaDecimalCapturado,
  ancho: EsquemaDecimalCapturado,
  alto: EsquemaDecimalCapturado,
  /** Fórmulas AREA: qué segunda medida se captura (la otra va en `null`). */
  segundaMedida: z.enum(["ancho", "alto"]),
});

export const EsquemaPartidaConceptoBorrador = z.strictObject({
  tipo: z.literal("CONCEPTO"),
  conceptoCodigo: EsquemaCodigo,
  /** Cadena vacía = se usa la descripción del concepto. */
  descripcion: descripcionCaptura,
  mediciones: z
    .array(EsquemaRenglonBorrador)
    .max(LIMITES_API.renglonesPorPartida, { error: `Máximo ${LIMITES_API.renglonesPorPartida} renglones por partida.` }),
});

export const EsquemaPartidaAdicionalBorrador = z.strictObject({
  tipo: z.literal("ADICIONAL"),
  tipoAdicionalCodigo: EsquemaCodigo.nullable(),
  descripcion: descripcionCaptura,
  cantidad: EsquemaDecimalCapturado,
  monto: EsquemaDecimalCapturado,
});

/**
 * Captura editable guardada en el servidor. Solo códigos y textos capturados: ningún resultado,
 * costo ni importe calculado. Puede estar incompleta (la API informa la completitud).
 */
export const EsquemaCapturaBorrador = z
  .strictObject({
    /** `null` = el preparador aún no lo decide (CR-05 no tiene valor por omisión). */
    consolidarCompras: z.boolean().nullable(),
    partidas: z
      .array(z.discriminatedUnion("tipo", [EsquemaPartidaConceptoBorrador, EsquemaPartidaAdicionalBorrador]))
      .max(LIMITES_API.partidas, { error: `Máximo ${LIMITES_API.partidas} partidas.` }),
    /** Precio elegido por insumo (CR-07). El servidor nunca elige por el usuario. */
    seleccion: z
      .array(z.strictObject({ insumoCodigo: EsquemaCodigo, precioCodigo: EsquemaCodigo }))
      .max(LIMITES_API.preciosElegidos, { error: `Máximo ${LIMITES_API.preciosElegidos} precios elegidos.` }),
    /**
     * Textos de la versión (módulo 8). Opcional para que las capturas anteriores sigan siendo
     * válidas tal como se guardaron; sin textos, BL-20 impide enviar, aprobar y emitir.
     */
    textos: EsquemaTextosCotizacion.optional(),
    /**
     * Excepciones B-22 registradas por el Preparador (módulo 10, ADR-0014). Opcional por la misma
     * razón que `textos`. Se congelan en la versión que se calcula; la autorización es del Revisor.
     */
    excepciones: EsquemaListaExcepciones.optional(),
  })
  .superRefine((c, ctx) => {
    const total = c.partidas.reduce((n, p) => n + (p.tipo === "CONCEPTO" ? p.mediciones.length : 0), 0);
    if (total > LIMITES_API.renglonesTotales) {
      ctx.addIssue({
        code: "custom",
        path: ["partidas"],
        message: `Máximo ${LIMITES_API.renglonesTotales} renglones de medición en total (${total}).`,
      });
    }
    const insumos = new Set<string>();
    c.seleccion.forEach((s, i) => {
      if (insumos.has(s.insumoCodigo)) {
        ctx.addIssue({ code: "custom", path: ["seleccion", i, "insumoCodigo"], message: `Insumo repetido: ${s.insumoCodigo}.` });
      }
      insumos.add(s.insumoCodigo);
    });
  });
export type CapturaBorrador = z.infer<typeof EsquemaCapturaBorrador>;

/** Captura vacía de una cotización nueva. */
export const CAPTURA_BORRADOR_VACIA: CapturaBorrador = { consolidarCompras: null, partidas: [], seleccion: [] };

export const EsquemaCompletitud = z.strictObject({
  /** `true` si la captura tiene todo lo necesario para calcular (el cálculo aún puede bloquearse). */
  lista: z.boolean(),
  pendientes: z.array(z.strictObject({ ruta: z.string(), mensaje: z.string() })),
});
export type Completitud = z.infer<typeof EsquemaCompletitud>;

// ---------------------------------------------------------------------------
// Consultas (query string)
// ---------------------------------------------------------------------------

const limite = z
  .string()
  .regex(/^\d{1,3}$/, { error: "limite debe ser un entero." })
  .transform(Number)
  .pipe(z.number().int().min(1).max(LIMITES_API.limiteListadoMaximo, { error: `limite máximo: ${LIMITES_API.limiteListadoMaximo}.` }))
  .optional();

const buscar = z
  .string()
  .trim()
  .min(1, { error: "buscar no puede estar vacío." })
  .max(LIMITES_COTIZACIONES.longitudBusqueda, { error: `buscar admite hasta ${LIMITES_COTIZACIONES.longitudBusqueda} caracteres.` })
  .optional();

const booleanoTexto = z
  .enum(["true", "false"], { error: "Use true o false." })
  .transform((v) => v === "true")
  .optional();

/**
 * Clasificación de un cliente (E3.8): decisión explícita del Administrador del sistema. Sus proyectos, cotizaciones y solicitudes
 * heredan la categoría. Sin clasificación = «sin clasificar»: no se asume que lo [DEMO] sea desechable.
 */
export const CLASIFICACIONES = ["PRESENTACION", "QA", "HUMO"] as const;
export type Clasificacion = (typeof CLASIFICACIONES)[number];
export const EsquemaClasificacion = z.enum(CLASIFICACIONES);
/** Filtro de las listas por clasificación (`SIN_CLASIFICAR` = clientes sin fila). Sin filtro se ve todo. */
export const EsquemaFiltroClasificacion = z.enum([...CLASIFICACIONES, "SIN_CLASIFICAR"], { error: "Use PRESENTACION, QA, HUMO o SIN_CLASIFICAR." }).optional();
export type FiltroClasificacion = z.infer<typeof EsquemaFiltroClasificacion>;

export const EsquemaConsultaClientes = z.strictObject({ buscar, incluirInactivos: booleanoTexto, clasificacion: EsquemaFiltroClasificacion, limite });
export type ConsultaClientes = z.infer<typeof EsquemaConsultaClientes>;

export const EsquemaConsultaProyectos = z.strictObject({
  clienteId: EsquemaUuid.optional(),
  buscar,
  incluirInactivos: booleanoTexto,
  limite,
});
export type ConsultaProyectos = z.infer<typeof EsquemaConsultaProyectos>;

export const EsquemaConsultaCotizaciones = z.strictObject({
  buscar,
  clienteId: EsquemaUuid.optional(),
  proyectoId: EsquemaUuid.optional(),
  clasificacion: EsquemaFiltroClasificacion,
  limite,
});
export type ConsultaCotizaciones = z.infer<typeof EsquemaConsultaCotizaciones>;

export const EsquemaParametroId = z.strictObject({ id: EsquemaUuid });
export const EsquemaParametroVersion = z.strictObject({
  id: EsquemaUuid,
  numero: z
    .string()
    .regex(/^[1-9]\d{0,5}$/, { error: "Número de versión inválido." })
    .transform(Number),
});

// ---------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------

/** Teléfono capturado: dígitos y separadores habituales, con al menos 7 dígitos. */
const telefono = z
  .string({ error: "El teléfono debe ser un texto." })
  .trim()
  .max(LIMITES_COTIZACIONES.longitudTelefono, { error: `Teléfono: máximo ${LIMITES_COTIZACIONES.longitudTelefono} caracteres.` })
  .refine((t) => t === "" || (/^[0-9+()./ -]+$/.test(t) && (t.match(/\d/g) ?? []).length >= 7), {
    error: "Teléfono: use dígitos y separadores (al menos 7 dígitos).",
  })
  .transform((t) => (t === "" ? null : t))
  .nullable();

const correo = z
  .string({ error: "El correo debe ser un texto." })
  .trim()
  .max(LIMITES_COTIZACIONES.longitudCorreo, { error: `Correo: máximo ${LIMITES_COTIZACIONES.longitudCorreo} caracteres.` })
  .refine((t) => t === "" || z.email().safeParse(t).success, { error: "Correo: formato inválido." })
  .transform((t) => (t === "" ? null : t))
  .nullable();

/** Contacto del cliente (BL-01: para emitir hacen falta nombre y teléfono o correo). */
const camposContacto = {
  contactoNombre: textoOpcional(LIMITES_COTIZACIONES.longitudContactoNombre, "el nombre del contacto"),
  contactoTelefono: telefono,
  contactoCorreo: correo,
};

export const EsquemaSolicitudCliente = z.strictObject({
  nombre: textoObligatorio(LIMITES_COTIZACIONES.longitudNombre, "el nombre o razón social"),
  contactoNombre: camposContacto.contactoNombre.optional(),
  contactoTelefono: camposContacto.contactoTelefono.optional(),
  contactoCorreo: camposContacto.contactoCorreo.optional(),
});
export type SolicitudCliente = z.infer<typeof EsquemaSolicitudCliente>;

export const EsquemaEdicionCliente = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    nombre: textoObligatorio(LIMITES_COTIZACIONES.longitudNombre, "el nombre o razón social").optional(),
    contactoNombre: camposContacto.contactoNombre.optional(),
    contactoTelefono: camposContacto.contactoTelefono.optional(),
    contactoCorreo: camposContacto.contactoCorreo.optional(),
    activo: z.boolean().optional(),
  })
  .refine((e) => Object.keys(e).some((k) => k !== "revision"), { error: "Indique al menos un cambio." });
export type EdicionCliente = z.infer<typeof EsquemaEdicionCliente>;

const camposProyecto = {
  nombre: textoObligatorio(LIMITES_COTIZACIONES.longitudNombre, "el nombre del proyecto"),
  municipio: textoOpcional(LIMITES_COTIZACIONES.longitudMunicipio, "el municipio"),
  entidadFederativa: textoOpcional(LIMITES_COTIZACIONES.longitudEntidad, "la entidad federativa"),
  descripcion: textoOpcional(LIMITES_COTIZACIONES.longitudDescripcionProyecto, "la descripción"),
};

export const EsquemaSolicitudProyecto = z.strictObject({
  clienteId: EsquemaUuid,
  nombre: camposProyecto.nombre,
  municipio: camposProyecto.municipio.optional(),
  entidadFederativa: camposProyecto.entidadFederativa.optional(),
  descripcion: camposProyecto.descripcion.optional(),
});
export type SolicitudProyecto = z.infer<typeof EsquemaSolicitudProyecto>;

export const EsquemaEdicionProyecto = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    nombre: camposProyecto.nombre.optional(),
    municipio: camposProyecto.municipio.optional(),
    entidadFederativa: camposProyecto.entidadFederativa.optional(),
    descripcion: camposProyecto.descripcion.optional(),
    activo: z.boolean().optional(),
  })
  .refine((e) => Object.keys(e).some((k) => k !== "revision"), { error: "Indique al menos un cambio." });
export type EdicionProyecto = z.infer<typeof EsquemaEdicionProyecto>;

export const EsquemaSolicitudCotizacion = z.strictObject({
  /** El cliente sale del proyecto (no se envía): la base impide combinarlos mal. */
  proyectoId: EsquemaUuid,
  /** Captura inicial (p. ej. «Guardar como cotización» desde la calculadora). */
  captura: EsquemaCapturaBorrador.optional(),
});
export type SolicitudCotizacion = z.infer<typeof EsquemaSolicitudCotizacion>;

export const EsquemaSolicitudBorrador = z.strictObject({
  /** Revisión sobre la que se editó (control de concurrencia optimista). */
  revision: z.number().int().nonnegative(),
  captura: EsquemaCapturaBorrador,
});
export type SolicitudBorrador = z.infer<typeof EsquemaSolicitudBorrador>;

/**
 * Calcular y guardar una versión. El navegador NO envía captura, resultados ni importes: el
 * servidor calcula con el borrador guardado en esa revisión y las condiciones vigentes.
 */
// ---------------------------------------------------------------------------
// Módulo 15 (ADR-0019): duplicar (B-35) y preparar la versión nueva con modo de precios (B-34)
// ---------------------------------------------------------------------------

/**
 * Origen EXPLÍCITO de una duplicación: una versión concreta (su captura congelada) o el borrador
 * guardado en la revisión indicada (si cambió entre tanto: 409 BORRADOR_DESACTUALIZADO). El
 * servidor lee el origen de la base; nunca acepta una captura enviada por el navegador.
 */
export const EsquemaOrigenDuplicado = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("VERSION"), numero: z.number().int().positive() }),
  z.strictObject({ tipo: z.literal("BORRADOR"), revision: z.number().int().nonnegative() }),
]);
export type OrigenDuplicado = z.infer<typeof EsquemaOrigenDuplicado>;

export const EsquemaSolicitudDuplicado = z.strictObject({
  origen: EsquemaOrigenDuplicado,
  /** Proyecto destino (activo, con cliente activo, de la organización); por omisión, el del origen. */
  proyectoId: EsquemaUuid,
});
export type SolicitudDuplicado = z.infer<typeof EsquemaSolicitudDuplicado>;

/**
 * B-34: CONSERVAR toma las selecciones de precio de la versión emitida (mismos códigos y, por ser
 * inmutables, mismos importes; anulados → BL-08, vencidos → BL-09). ELEGIR_DE_NUEVO las vacía: se
 * eligen explícitamente entre las opciones vigentes. Ninguno elige el menor precio. Recargo,
 * impuesto y tarifa son los vigentes al calcular en ambos casos.
 */
export const MODOS_PRECIOS = ["CONSERVAR", "ELEGIR_DE_NUEVO"] as const;
export type ModoPrecios = (typeof MODOS_PRECIOS)[number];

export const LIMITES_NUEVA_VERSION = { minimoMotivo: 10 } as const;

export const EsquemaSolicitudNuevaVersion = z.strictObject({
  /** Número de la última versión emitida (la que origina el ciclo). */
  versionOrigen: z.number().int().positive(),
  modo: z.enum(MODOS_PRECIOS, { error: "Elija el modo de precios." }),
  motivo: z
    .string({ error: "El motivo es obligatorio." })
    .trim()
    .max(LIMITES_COTIZACIONES.longitudMotivo, { error: `Motivo: máximo ${LIMITES_COTIZACIONES.longitudMotivo} caracteres.` })
    .refine((t) => t.length >= LIMITES_NUEVA_VERSION.minimoMotivo && /\p{L}/u.test(t), {
      error: `Explique el motivo de la versión nueva (al menos ${LIMITES_NUEVA_VERSION.minimoMotivo} caracteres).`,
    }),
  revisionBorrador: z.number().int().nonnegative(),
  /**
   * Decisión explícita cuando las selecciones del borrador ya difieren de las que dejaría el modo
   * (409 SELECCIONES_DIVERGENTES). Sin ella no se cambia nada.
   */
  reemplazarSeleccionesDelBorrador: z.literal(true).optional(),
});
export type SolicitudNuevaVersion = z.infer<typeof EsquemaSolicitudNuevaVersion>;

/** Estado del ciclo de la versión nueva (B-34) en el detalle de la cotización. */
export const EsquemaNuevaVersion = z.strictObject({
  /** Hay que preparar el ciclo antes de editar o calcular (la última versión está emitida). */
  requerida: z.boolean(),
  /** Última versión emitida (origen del ciclo). */
  versionOrigen: z.number().int().positive(),
  /** Ciclo ya preparado para esa emisión (`null` si falta). */
  preparada: z
    .strictObject({ modo: z.enum(MODOS_PRECIOS), motivo: z.string(), por: z.string(), en: z.string() })
    .nullable(),
});
export type NuevaVersion = z.infer<typeof EsquemaNuevaVersion>;

/** Origen de una cotización duplicada (trazabilidad, B-35). */
export const EsquemaDuplicadaDe = z.strictObject({
  cotizacionId: z.string(),
  folio: z.string(),
  version: z.number().int().positive().nullable(),
  revision: z.number().int().nonnegative().nullable(),
});

export const EsquemaSolicitudVersion = z.strictObject({
  revisionBorrador: z.number().int().nonnegative(),
  motivo: z
    .string()
    .trim()
    .max(LIMITES_COTIZACIONES.longitudMotivo, { error: `Motivo: máximo ${LIMITES_COTIZACIONES.longitudMotivo} caracteres.` })
    .transform((t) => (t === "" ? null : t))
    .nullable()
    .optional(),
});
export type SolicitudVersion = z.infer<typeof EsquemaSolicitudVersion>;

// ---------------------------------------------------------------------------
// Respuestas (sin costos internos, proveedores de compra, consumos, recargo ni margen)
// ---------------------------------------------------------------------------

const EsquemaInstante = z.string();

export const EsquemaCliente = z.strictObject({
  id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  contactoNombre: z.string().nullable(),
  contactoTelefono: z.string().nullable(),
  contactoCorreo: z.string().nullable(),
  activo: z.boolean(),
  revision: z.number().int(),
  creadoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string(),
  /** Clasificación explícita del cliente (`null`/ausente = sin clasificar) y el motivo de quien la decidió. */
  clasificacion: EsquemaClasificacion.nullable().optional(),
  clasificacionMotivo: z.string().nullable().optional(),
});
export type Cliente = z.infer<typeof EsquemaCliente>;

/** Clasifica (o, con `categoria: null`, retira la clasificación de) un cliente. Solo el Administrador del sistema. */
export const EsquemaClasificarCliente = z.strictObject({
  categoria: EsquemaClasificacion.nullable(),
  motivo: z.string({ error: "Debe ser un texto." }).trim().min(3, { error: "Indique el motivo." }).max(200, { error: "Máximo 200 caracteres." }),
});
export type ClasificarCliente = z.infer<typeof EsquemaClasificarCliente>;

export const EsquemaProyecto = z.strictObject({
  id: z.string(),
  codigo: z.string(),
  cliente: z.strictObject({ id: z.string(), codigo: z.string(), nombre: z.string(), activo: z.boolean() }),
  nombre: z.string(),
  municipio: z.string().nullable(),
  entidadFederativa: z.string().nullable(),
  descripcion: z.string().nullable(),
  activo: z.boolean(),
  revision: z.number().int(),
  creadoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string(),
});
export type Proyecto = z.infer<typeof EsquemaProyecto>;

export const EsquemaRespuestaClientes = z.strictObject({ clientes: z.array(EsquemaCliente), limite: z.number().int() });
export type RespuestaClientes = z.infer<typeof EsquemaRespuestaClientes>;

export const EsquemaDetalleCliente = z.strictObject({
  cliente: EsquemaCliente,
  proyectos: z.array(EsquemaProyecto),
  /** Cotizaciones activas del cliente, con borrador editable (aviso al desactivar, como Cliente_BorradoresAbiertos). */
  borradoresAbiertos: z.number().int().nonnegative(),
});
export type DetalleCliente = z.infer<typeof EsquemaDetalleCliente>;

export const EsquemaRespuestaProyectos = z.strictObject({ proyectos: z.array(EsquemaProyecto), limite: z.number().int() });
export type RespuestaProyectos = z.infer<typeof EsquemaRespuestaProyectos>;

/** Última revisión de una versión (módulo 7). La ficha `revision` se usa al decidir o retirar. */
export const EsquemaRevisionDeVersion = z.strictObject({
  id: z.string(),
  estado: z.enum(ESTADOS_REVISION),
  revision: z.number().int().nonnegative(),
  enviadoPor: z.string(),
  enviadoEn: EsquemaInstante,
  resueltaPor: z.string().nullable(),
  resueltaEn: EsquemaInstante.nullable(),
  observaciones: z.string().nullable(),
  /** Anulación de la aprobación antes de emitir (módulo 8); `null` si no se anuló. */
  anulacion: z.strictObject({ por: z.string(), en: EsquemaInstante, motivo: z.string() }).nullable(),
});
export type RevisionDeVersion = z.infer<typeof EsquemaRevisionDeVersion>;

/** Emisión registrada de una versión (módulo 8, ADR-0010). El archivo se descarga aparte. */
export const EsquemaResumenEmision = z.strictObject({
  id: z.string(),
  folio: z.string(),
  versionNumero: z.number().int().positive(),
  /** COT-AAAA-NNNNN-vN */
  idVersion: z.string(),
  origen: z.enum(ORIGENES_COTIZACION),
  fechaEmision: EsquemaFechaISO,
  vigenciaDias: z.number().int().positive(),
  vigenteHasta: EsquemaFechaISO,
  total: EsquemaDecimalTexto,
  preparadoPor: z.string(),
  aprobadoPor: z.string(),
  emitidoPor: z.string(),
  emitidoEn: EsquemaInstante,
  plantillaVersion: z.string(),
  /** Una versión posterior de la misma cotización ya se emitió (este documento sigue intacto). */
  sustituida: z.boolean(),
  archivo: z.strictObject({
    /** Nombre sugerido para la descarga (COT-AAAA-NNNNN-vN.pdf). */
    nombre: z.string(),
    bytes: z.number().int().positive(),
    /** SHA-256 en hexadecimal del archivo emitido. */
    sha256: z.string(),
  }),
});
export type ResumenEmision = z.infer<typeof EsquemaResumenEmision>;

export const EsquemaResumenVersion = z.strictObject({
  /** Identificador inmutable de la versión (lo cita la decisión de revisión). */
  id: z.string(),
  numero: z.number().int().positive(),
  /** COT-AAAA-NNNNN-vN */
  idVersion: z.string(),
  /** Derivado de `revisionVigente`; la versión no cambia. */
  estado: z.enum(ESTADOS_VERSION),
  /** Es la última versión de la cotización (solo la última se puede enviar a revisión). */
  esUltima: z.boolean(),
  /** Última revisión de ESTA versión (`null` si nunca se envió). Una aprobación no pasa a otra versión. */
  revisionVigente: EsquemaRevisionDeVersion.nullable(),
  /** Emisión de esta versión (`null` si no se emitió). */
  emision: EsquemaResumenEmision.nullable(),
  revisionBorrador: z.number().int().nonnegative(),
  fechaCalculo: EsquemaFechaISO,
  creadoEn: EsquemaInstante,
  autor: z.string(),
  total: EsquemaDecimalTexto,
  motivo: z.string().nullable(),
  /** Módulo 15 (B-34): modo de precios del ciclo en el que se calculó y versión emitida de origen. */
  modoPrecios: z.enum(MODOS_PRECIOS).nullable(),
  versionOrigen: z.number().int().positive().nullable(),
});
export type ResumenVersion = z.infer<typeof EsquemaResumenVersion>;

export const EsquemaResumenCotizacion = z.strictObject({
  id: z.string(),
  folio: z.string(),
  origen: z.enum(ORIGENES_COTIZACION),
  estadoFolio: z.enum(ESTADOS_FOLIO),
  /** Descarte del folio (módulo 8); `null` si está activo. */
  descarte: z.strictObject({ por: z.string(), en: EsquemaInstante, motivo: z.string() }).nullable(),
  cliente: z.strictObject({ id: z.string(), codigo: z.string(), nombre: z.string(), activo: z.boolean(), clasificacion: EsquemaClasificacion.nullable().optional() }),
  proyecto: z.strictObject({ id: z.string(), codigo: z.string(), nombre: z.string(), activo: z.boolean() }),
  creadoEn: EsquemaInstante,
  creadoPor: z.string(),
  revisionBorrador: z.number().int().nonnegative(),
  borradorActualizadoEn: EsquemaInstante,
  ultimaVersion: EsquemaResumenVersion.nullable(),
  /** Solicitud del cliente de la que nació (módulo 17); `null`/ausente si se preparó desde el panel. */
  solicitud: z.strictObject({ id: z.string(), folio: z.string() }).nullable().optional(),
});
export type ResumenCotizacion = z.infer<typeof EsquemaResumenCotizacion>;

export const EsquemaRespuestaCotizaciones = z.strictObject({
  cotizaciones: z.array(EsquemaResumenCotizacion),
  limite: z.number().int(),
});
export type RespuestaCotizaciones = z.infer<typeof EsquemaRespuestaCotizaciones>;

const EsquemaMotivo = z.string().nullable();

/**
 * Disponibilidad HOY de cada referencia de la captura guardada (solo lectura; la captura no
 * cambia). Una referencia no disponible se conserva hasta que el usuario decida sustituirla o
 * quitarla; el cálculo la señala con su regla.
 */
export const EsquemaReferenciasBorrador = z.strictObject({
  conceptos: z.array(
    z.strictObject({
      codigo: z.string(),
      disponible: z.boolean(),
      /** `null` si está disponible. */
      motivo: EsquemaMotivo,
      /** Insumos de sus componentes activos (vacío si el concepto no existe en la organización). */
      insumos: z.array(z.string()),
    }),
  ),
  selecciones: z.array(
    z.strictObject({ insumoCodigo: z.string(), precioCodigo: z.string(), disponible: z.boolean(), motivo: EsquemaMotivo }),
  ),
  tiposAdicional: z.array(z.strictObject({ codigo: z.string(), disponible: z.boolean(), motivo: EsquemaMotivo })),
});
export type ReferenciasBorrador = z.infer<typeof EsquemaReferenciasBorrador>;

export const EsquemaBorrador = z.strictObject({
  revision: z.number().int().nonnegative(),
  captura: EsquemaCapturaBorrador,
  /**
   * Textos predeterminados del ambiente (DEMO: `DEMO_TEXTO_*` del libro), para restablecerlos de
   * forma explícita; `null` si el ambiente no los tiene. Nunca se aplican solos a la captura.
   */
  textosPredeterminados: EsquemaTextosCotizacion.nullable(),
  actualizadoPor: z.string(),
  actualizadoEn: EsquemaInstante,
  completitud: EsquemaCompletitud,
  referencias: EsquemaReferenciasBorrador,
});
export type Borrador = z.infer<typeof EsquemaBorrador>;

export const EsquemaEvento = z.strictObject({
  tipo: z.string(),
  usuario: z.string(),
  ocurridoEn: EsquemaInstante,
  /** Datos mínimos (número de versión, revisión, campos cambiados); sin capturas ni secretos. */
  detalle: z.record(z.string(), z.unknown()),
});
export type Evento = z.infer<typeof EsquemaEvento>;

export const EsquemaEventoRevision = z.strictObject({
  secuencia: z.number().int().positive(),
  tipo: z.enum(TIPOS_EVENTO_REVISION),
  estadoAnterior: z.enum(ESTADOS_REVISION).nullable(),
  estadoNuevo: z.enum(ESTADOS_EVENTO_REVISION),
  usuario: z.string(),
  ocurridoEn: EsquemaInstante,
  observaciones: z.string().nullable(),
  /** Códigos de aviso presentes al registrar el evento (informativo; no se marcan como atendidos). */
  avisos: z.array(z.string()),
});
export type EventoRevision = z.infer<typeof EsquemaEventoRevision>;

/** Historial de revisiones de la cotización (todas sus versiones; la más reciente primero). */
export const EsquemaHistorialRevision = z.strictObject({
  id: z.string(),
  versionNumero: z.number().int().positive(),
  estado: z.enum(ESTADOS_REVISION),
  eventos: z.array(EsquemaEventoRevision),
});
export type HistorialRevision = z.infer<typeof EsquemaHistorialRevision>;

export const EsquemaDetalleCotizacion = z.strictObject({
  cotizacion: EsquemaResumenCotizacion,
  borrador: EsquemaBorrador,
  versiones: z.array(EsquemaResumenVersion),
  /**
   * Si el ESTADO de la cotización permite descartarla ahora y, si no, por qué (lo decide el
   * servidor). Además hace falta la capacidad `cotizaciones.preparar`.
   */
  descartar: z.strictObject({ permitido: z.boolean(), motivoNoPermitido: z.string().nullable() }),
  /** Revisiones de sus versiones con sus decisiones y responsables (módulo 7). */
  revisiones: z.array(EsquemaHistorialRevision),
  eventos: z.array(EsquemaEvento),
  /** Módulo 15: origen si es un duplicado (B-35) y ciclo de la versión nueva tras emitir (B-34). */
  duplicadaDe: EsquemaDuplicadaDe.nullable(),
  nuevaVersion: EsquemaNuevaVersion.nullable(),
});
export type DetalleCotizacion = z.infer<typeof EsquemaDetalleCotizacion>;

export const EsquemaRespuestaBorradorGuardado = z.strictObject({
  revision: z.number().int().nonnegative(),
  actualizadoPor: z.string(),
  actualizadoEn: EsquemaInstante,
  completitud: EsquemaCompletitud,
  referencias: EsquemaReferenciasBorrador,
});
export type RespuestaBorradorGuardado = z.infer<typeof EsquemaRespuestaBorradorGuardado>;

/** Cambios relevantes frente a la versión anterior, calculados por el servidor. */
export const EsquemaResumenCambios = z.strictObject({
  versionAnterior: z.number().int().positive().nullable(),
  partidasAgregadas: z.array(z.string()),
  partidasQuitadas: z.array(z.string()),
  partidasModificadas: z.array(z.string()),
  seleccionCambiada: z.array(z.string()),
  consolidacionCambiada: z.boolean(),
  datosDescriptivosCambiados: z.array(z.string()),
  /** Textos de la versión que cambiaron (módulo 8; ausente en versiones anteriores). */
  textosCambiados: z.array(z.enum(["alcance", "condiciones", "exclusiones"])).optional(),
  /** Misma referencia de cálculo (parámetros, precios, consumos y tarifas) que la versión anterior. */
  condicionesCambiadas: z.boolean(),
  totalAnterior: EsquemaDecimalTexto.nullable(),
  totalNuevo: EsquemaDecimalTexto,
});
export type ResumenCambios = z.infer<typeof EsquemaResumenCambios>;

/** Versión guardada: lo almacenado, sin recalcular. Solo la proyección comercial. */
export const EsquemaVersion = z.strictObject({
  folio: z.string(),
  origen: z.enum(ORIGENES_COTIZACION),
  version: EsquemaResumenVersion,
  cliente: z.strictObject({ codigo: z.string(), nombre: z.string() }),
  proyecto: z.strictObject({
    codigo: z.string(),
    nombre: z.string(),
    ubicacion: z.string().nullable(),
    descripcion: z.string().nullable(),
  }),
  versionMotor: z.string(),
  /** Huella SHA-256 (hex) de la entrada y el resultado: identifica el cálculo (sello, BL-16). */
  huellaCalculo: z.string(),
  captura: EsquemaCapturaBorrador,
  cotizacion: EsquemaCotizacionComercial,
  avisos: z.array(z.strictObject({ codigo: z.enum(["AV-01", "AV-03"]), mensaje: z.string() })),
  cambios: EsquemaResumenCambios,
});
export type Version = z.infer<typeof EsquemaVersion>;
