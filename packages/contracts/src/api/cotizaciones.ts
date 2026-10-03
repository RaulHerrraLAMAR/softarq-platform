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

export const LIMITES_COTIZACIONES = {
  longitudNombre: 200,
  longitudMunicipio: 120,
  longitudEntidad: 60,
  longitudDescripcionProyecto: 500,
  longitudMotivo: 500,
  longitudBusqueda: 60,
  eventosRecientes: 50,
} as const;

/** Cabecera de idempotencia de las altas (UUID generado por el cliente para cada intención). */
export const CABECERA_IDEMPOTENCIA = "Idempotency-Key";
/** Cabecera de respuesta cuando se reproduce el resultado de una clave ya usada. */
export const CABECERA_IDEMPOTENCIA_REPRODUCIDA = "Idempotent-Replayed";

/** Origen del historial: independiente de la fase Excel (no se importan folios del libro). */
export const ORIGENES_COTIZACION = ["WEB_DEMO"] as const;
/** Estados alcanzables en este módulo (el libro define más; ver ADR-0008 §3). */
export const ESTADOS_FOLIO = ["ACTIVO"] as const;
/**
 * Estado de una versión, DERIVADO de su última revisión (módulo 7, ADR-0009); nunca se escribe en
 * la versión. Sin revisión, o con cambios solicitados o retirada: Borrador (como en el libro).
 * EMITIDA y las demás del libro no son alcanzables todavía.
 */
export const ESTADOS_VERSION = ["BORRADOR", "EN_REVISION", "APROBADA"] as const;

/**
 * Estados de una revisión (máquina explícita): PENDIENTE → APROBADA | CAMBIOS_SOLICITADOS |
 * RETIRADA, las tres terminales. Volver a enviar crea otra revisión.
 */
export const ESTADOS_REVISION = ["PENDIENTE", "APROBADA", "CAMBIOS_SOLICITADOS", "RETIRADA"] as const;
export type EstadoRevision = (typeof ESTADOS_REVISION)[number];

export const TIPOS_EVENTO_REVISION = ["ENVIADA", "APROBADA", "CAMBIOS_SOLICITADOS", "RETIRADA"] as const;

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

export const EsquemaConsultaClientes = z.strictObject({ buscar, incluirInactivos: booleanoTexto, limite });
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

export const EsquemaSolicitudCliente = z.strictObject({
  nombre: textoObligatorio(LIMITES_COTIZACIONES.longitudNombre, "el nombre o razón social"),
});
export type SolicitudCliente = z.infer<typeof EsquemaSolicitudCliente>;

export const EsquemaEdicionCliente = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    nombre: textoObligatorio(LIMITES_COTIZACIONES.longitudNombre, "el nombre o razón social").optional(),
    activo: z.boolean().optional(),
  })
  .refine((e) => e.nombre !== undefined || e.activo !== undefined, { error: "Indique al menos un cambio." });
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
  activo: z.boolean(),
  revision: z.number().int(),
  creadoEn: EsquemaInstante,
  modificadoEn: EsquemaInstante,
  modificadoPor: z.string(),
});
export type Cliente = z.infer<typeof EsquemaCliente>;

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
});
export type RevisionDeVersion = z.infer<typeof EsquemaRevisionDeVersion>;

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
  revisionBorrador: z.number().int().nonnegative(),
  fechaCalculo: EsquemaFechaISO,
  creadoEn: EsquemaInstante,
  autor: z.string(),
  total: EsquemaDecimalTexto,
  motivo: z.string().nullable(),
});
export type ResumenVersion = z.infer<typeof EsquemaResumenVersion>;

export const EsquemaResumenCotizacion = z.strictObject({
  id: z.string(),
  folio: z.string(),
  origen: z.enum(ORIGENES_COTIZACION),
  estadoFolio: z.enum(ESTADOS_FOLIO),
  cliente: z.strictObject({ id: z.string(), codigo: z.string(), nombre: z.string(), activo: z.boolean() }),
  proyecto: z.strictObject({ id: z.string(), codigo: z.string(), nombre: z.string(), activo: z.boolean() }),
  creadoEn: EsquemaInstante,
  creadoPor: z.string(),
  revisionBorrador: z.number().int().nonnegative(),
  borradorActualizadoEn: EsquemaInstante,
  ultimaVersion: EsquemaResumenVersion.nullable(),
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
  estadoNuevo: z.enum(ESTADOS_REVISION),
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
  /** Revisiones de sus versiones con sus decisiones y responsables (módulo 7). */
  revisiones: z.array(EsquemaHistorialRevision),
  eventos: z.array(EsquemaEvento),
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
