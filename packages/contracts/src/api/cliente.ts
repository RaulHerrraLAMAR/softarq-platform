/**
 * Cliente externo de la app móvil (módulo 17, ADR-0021): solicitud, estimación preliminar y consulta de
 * las cotizaciones emitidas. Solo tipos, esquemas y enumeraciones; ninguna regla de negocio.
 *
 * Reglas de este contrato:
 * - La app nunca envía identificadores de cliente, organización, función, estado ni importes: la API los
 *   deduce de la sesión y de la base.
 * - Una medida va como texto decimal. `null` = sin capturar (permitido en el borrador, bloquea el envío).
 * - Las medidas que pide cada opción de trabajo las dicta el servidor (`EsquemaTrabajoCliente.opciones`),
 *   derivadas de la fórmula del concepto: el teléfono no duplica el motor.
 * - Nada de lo que recibe el cliente contiene costos, márgenes, proveedores, consumos, excepciones ni la
 *   bitácora técnica (D-16). La estimación expone solo la proyección comercial.
 */
import { z } from "zod";
import { EsquemaCodigo, EsquemaDecimalTexto, EsquemaFechaISO, EsquemaCotizacionComercial } from "./esquemas.js";

export const LIMITES_CLIENTE = {
  trabajosPorSolicitud: 10,
  seccionesPorTrabajo: 20,
  huecosPorTrabajo: 20,
  longitudNombre: 80,
  longitudNotas: 500,
  longitudDescripcionProyecto: 500,
  solicitudesPorListado: 100,
  medidaMaxima: 500,
} as const;

/** Rótulo obligatorio de toda estimación (ADR-0021 §2). La app lo muestra antes del importe. */
export const ROTULO_ESTIMACION = "Estimación preliminar, no es una cotización";

export const ESTADOS_SOLICITUD = ["BORRADOR", "ENVIADA", "EN_PREPARACION", "COTIZADA", "RETIRADA"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Dimensiones que una opción puede pedir (las del motor: DIMENSIONES_POR_FORMULA). */
export const DIMENSIONES_CLIENTE = ["largo", "ancho", "alto"] as const;
export type DimensionCliente = (typeof DIMENSIONES_CLIENTE)[number];

const texto = (max: number) => z.string({ error: "Debe ser un texto." }).trim().max(max, { error: `Máximo ${max} caracteres.` });
const nombre = (min = 1) =>
  z.string({ error: "Debe ser un texto." }).trim().min(min, { error: "Escriba un nombre." }).max(LIMITES_CLIENTE.longitudNombre, { error: `Máximo ${LIMITES_CLIENTE.longitudNombre} caracteres.` });
const medida = EsquemaDecimalTexto.nullable();

// ---------------------------------------------------------------------------
// Trabajos que ofrece el servidor
// ---------------------------------------------------------------------------

export const EsquemaMedidaPedida = z.strictObject({
  clave: z.enum(DIMENSIONES_CLIENTE),
  etiqueta: z.string(),
  ayuda: z.string(),
});

export const EsquemaOpcionTrabajoCliente = z.strictObject({
  codigo: EsquemaCodigo,
  nombre: z.string(),
  descripcion: z.string(),
  /** Qué medidas se piden por sección, en el orden en que se muestran. */
  medidas: z.array(EsquemaMedidaPedida),
  /** `true` si el concepto admite restar huecos (ventanas, tragaluces…); lo decide el concepto. */
  admiteHuecos: z.boolean(),
  unidadResultado: z.string(),
});

export const EsquemaTrabajoCliente = z.strictObject({
  codigo: EsquemaCodigo,
  nombre: z.string(),
  descripcion: z.string(),
  /** Clave de la ilustración que la app dibuja. Solo una lista cerrada. */
  ilustracion: z.enum(["cubierta", "losa", "muro"]),
  opciones: z.array(EsquemaOpcionTrabajoCliente),
});
export type TrabajoCliente = z.infer<typeof EsquemaTrabajoCliente>;

export const EsquemaRespuestaTrabajosCliente = z.strictObject({ trabajos: z.array(EsquemaTrabajoCliente) });
export type RespuestaTrabajosCliente = z.infer<typeof EsquemaRespuestaTrabajosCliente>;

// ---------------------------------------------------------------------------
// Proyectos propios
// ---------------------------------------------------------------------------

export const EsquemaProyectoCliente = z.strictObject({
  id: z.uuid(),
  nombre: z.string(),
  municipio: z.string().nullable(),
  entidadFederativa: z.string().nullable(),
  descripcion: z.string().nullable(),
});
export type ProyectoCliente = z.infer<typeof EsquemaProyectoCliente>;

export const EsquemaNuevoProyectoCliente = z.strictObject({
  nombre: nombre(),
  municipio: texto(120).min(1, { error: "Indique el municipio." }),
  entidadFederativa: texto(120).min(1, { error: "Indique la entidad federativa." }),
  descripcion: texto(LIMITES_CLIENTE.longitudDescripcionProyecto).nullable().default(null),
});
export type NuevoProyectoCliente = z.infer<typeof EsquemaNuevoProyectoCliente>;

export const EsquemaRespuestaProyectosCliente = z.strictObject({ proyectos: z.array(EsquemaProyectoCliente) });
export type RespuestaProyectosCliente = z.infer<typeof EsquemaRespuestaProyectosCliente>;

// ---------------------------------------------------------------------------
// Captura de la solicitud
// ---------------------------------------------------------------------------

/** Sección (o hueco) con sus medidas. Las dimensiones que la opción no pide van en `null`. */
export const EsquemaRenglonCliente = z.strictObject({
  nombre: texto(LIMITES_CLIENTE.longitudNombre),
  /** Piezas iguales; "1" salvo que haya varias idénticas. */
  piezas: EsquemaDecimalTexto,
  largo: medida,
  ancho: medida,
  alto: medida,
});
export type RenglonCliente = z.infer<typeof EsquemaRenglonCliente>;

export const EsquemaTrabajoCapturado = z.strictObject({
  /** Identificador estable dentro de la solicitud (lo genera la app), p. ej. "t1". */
  id: z.string().regex(/^[a-z0-9-]{1,20}$/, { error: "Identificador de trabajo inválido." }),
  trabajoCodigo: EsquemaCodigo,
  opcionCodigo: EsquemaCodigo,
  secciones: z.array(EsquemaRenglonCliente).max(LIMITES_CLIENTE.seccionesPorTrabajo, { error: `Máximo ${LIMITES_CLIENTE.seccionesPorTrabajo} secciones.` }),
  /** Huecos que se restan de la medición (ventanas, tragaluces…). No son descuentos comerciales. */
  huecos: z.array(EsquemaRenglonCliente).max(LIMITES_CLIENTE.huecosPorTrabajo, { error: `Máximo ${LIMITES_CLIENTE.huecosPorTrabajo} huecos.` }),
});
export type TrabajoCapturado = z.infer<typeof EsquemaTrabajoCapturado>;

export const EsquemaCapturaSolicitud = z.strictObject({
  trabajos: z
    .array(EsquemaTrabajoCapturado)
    .max(LIMITES_CLIENTE.trabajosPorSolicitud, { error: `Máximo ${LIMITES_CLIENTE.trabajosPorSolicitud} trabajos por solicitud.` })
    .superRefine((t, ctx) => {
      const ids = new Set<string>();
      t.forEach((x, i) => {
        if (ids.has(x.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Trabajo repetido." });
        ids.add(x.id);
      });
    }),
  notas: texto(LIMITES_CLIENTE.longitudNotas).nullable(),
});
export type CapturaSolicitud = z.infer<typeof EsquemaCapturaSolicitud>;
export const CAPTURA_SOLICITUD_VACIA: CapturaSolicitud = { trabajos: [], notas: null };

// ---------------------------------------------------------------------------
// Estimación preliminar
// ---------------------------------------------------------------------------

export const MOTIVOS_SIN_ESTIMACION = ["FALTA_REFERENCIA", "CONFIGURACION", "PARAMETROS", "MEDIDAS", "NO_DISPONIBLE"] as const;

export const EsquemaEstimacionCliente = z.strictObject({
  id: z.uuid(),
  numero: z.number().int().positive(),
  estado: z.enum(["ESTIMADA", "SIN_ESTIMACION"]),
  rotulo: z.literal(ROTULO_ESTIMACION),
  calculadaEn: z.string(),
  fechaCalculo: EsquemaFechaISO,
  /** Revisión de la captura con la que se calculó. Si es menor que la de la solicitud, está desactualizada. */
  revisionCaptura: z.number().int().nonnegative(),
  desactualizada: z.boolean(),
  /** Solo la proyección comercial; `null` cuando no se pudo estimar. Jamás un cero en su lugar. */
  comercial: EsquemaCotizacionComercial.nullable(),
  /** Presente cuando `estado = SIN_ESTIMACION`: texto comprensible, sin datos internos. */
  motivo: z.strictObject({ codigo: z.enum(MOTIVOS_SIN_ESTIMACION), mensaje: z.string() }).nullable(),
  avisos: z.array(z.strictObject({ codigo: z.string(), mensaje: z.string() })),
});
export type EstimacionCliente = z.infer<typeof EsquemaEstimacionCliente>;

// ---------------------------------------------------------------------------
// Solicitud
// ---------------------------------------------------------------------------

export const EsquemaPendienteSolicitud = z.strictObject({ ruta: z.string(), mensaje: z.string() });

export const EsquemaCotizacionResumenCliente = z.strictObject({
  emisionId: z.uuid(),
  folio: z.string(),
  fechaEmision: EsquemaFechaISO,
  vigenteHasta: EsquemaFechaISO,
  vigente: z.boolean(),
  total: EsquemaDecimalTexto,
  proyecto: z.string(),
  solicitudFolio: z.string().nullable(),
});
export type CotizacionResumenCliente = z.infer<typeof EsquemaCotizacionResumenCliente>;

export const EsquemaSolicitudDelCliente = z.strictObject({
  id: z.uuid(),
  folio: z.string(),
  estado: z.enum(ESTADOS_SOLICITUD),
  proyecto: EsquemaProyectoCliente,
  captura: EsquemaCapturaSolicitud,
  /** Control de concurrencia: se envía al guardar, enviar o estimar. */
  revision: z.number().int().nonnegative(),
  creadaEn: z.string(),
  actualizadaEn: z.string(),
  enviadaEn: z.string().nullable(),
  /** `true` solo en BORRADOR: después no se edita. */
  editable: z.boolean(),
  /** Lo que falta para poder enviarla (vacío = lista). */
  pendientes: z.array(EsquemaPendienteSolicitud),
  ultimaEstimacion: EsquemaEstimacionCliente.nullable(),
  /** Cotización formal emitida a partir de esta solicitud, si ya existe. */
  cotizacionFormal: EsquemaCotizacionResumenCliente.nullable(),
});
export type SolicitudDelCliente = z.infer<typeof EsquemaSolicitudDelCliente>;

export const EsquemaResumenSolicitudCliente = z.strictObject({
  id: z.uuid(),
  folio: z.string(),
  estado: z.enum(ESTADOS_SOLICITUD),
  proyecto: z.string(),
  trabajos: z.array(z.string()),
  actualizadaEn: z.string(),
  /** Total de la última estimación vigente, si la hay (nunca un cero inventado). */
  totalEstimado: EsquemaDecimalTexto.nullable(),
});
export const EsquemaRespuestaSolicitudesCliente = z.strictObject({ solicitudes: z.array(EsquemaResumenSolicitudCliente) });
export type RespuestaSolicitudesCliente = z.infer<typeof EsquemaRespuestaSolicitudesCliente>;

export const EsquemaNuevaSolicitudCliente = z.strictObject({
  proyectoId: z.uuid(),
  captura: EsquemaCapturaSolicitud.default(CAPTURA_SOLICITUD_VACIA),
});
export type NuevaSolicitudCliente = z.infer<typeof EsquemaNuevaSolicitudCliente>;

export const EsquemaGuardarSolicitudCliente = z.strictObject({
  revision: z.number().int().nonnegative(),
  captura: EsquemaCapturaSolicitud,
});
export type GuardarSolicitudCliente = z.infer<typeof EsquemaGuardarSolicitudCliente>;

/** Estimar o enviar: la revisión indica qué captura se estimó o se envía (sin sorpresas por ediciones paralelas). */
export const EsquemaRevisionSolicitudCliente = z.strictObject({ revision: z.number().int().nonnegative() });
export type RevisionSolicitudCliente = z.infer<typeof EsquemaRevisionSolicitudCliente>;

/** Retirar: el motivo es opcional; por omisión «Retirada por el cliente». */
export const EsquemaRetiroSolicitudCliente = z.strictObject({ motivo: z.string().trim().max(200).default("Retirada por el cliente") });
export type RetiroSolicitudCliente = z.infer<typeof EsquemaRetiroSolicitudCliente>;

/** Respuesta de enviar: `repetida` = la solicitud ya estaba enviada (reintento idempotente). */
export const EsquemaRespuestaEnvioSolicitud = z.strictObject({ repetida: z.boolean(), solicitud: EsquemaSolicitudDelCliente });
export type RespuestaEnvioSolicitud = z.infer<typeof EsquemaRespuestaEnvioSolicitud>;

// ---------------------------------------------------------------------------
// Cotizaciones emitidas
// ---------------------------------------------------------------------------

export const EsquemaRespuestaCotizacionesCliente = z.strictObject({ cotizaciones: z.array(EsquemaCotizacionResumenCliente) });
export type RespuestaCotizacionesCliente = z.infer<typeof EsquemaRespuestaCotizacionesCliente>;

export const EsquemaDetalleCotizacionCliente = EsquemaCotizacionResumenCliente.extend({
  /** La misma proyección comercial del documento emitido. Sin costos ni datos internos. */
  comercial: EsquemaCotizacionComercial,
});
export type DetalleCotizacionCliente = z.infer<typeof EsquemaDetalleCotizacionCliente>;

// ---------------------------------------------------------------------------
// Sesión del cliente y cuenta interna que intenta entrar a la app
// ---------------------------------------------------------------------------

/** 403 del acceso móvil de una cuenta interna: la app muestra la explicación y la dirección del panel. */
export const EsquemaCuentaInternaEnApp = z.strictObject({ panelUrl: z.string() });

// ---------------------------------------------------------------------------
// Administración (panel del equipo)
// ---------------------------------------------------------------------------

/** Alta del acceso de un cliente, por el Administrador del sistema (ADR-0021 §1). */
export const EsquemaNuevoAccesoCliente = z.strictObject({
  correo: z.string().trim().toLowerCase().min(3).max(254).email({ error: "Correo no válido." }),
  nombre: nombre(2),
  motivo: texto(200).min(3, { error: "Indique el motivo." }),
});
export type NuevoAccesoCliente = z.infer<typeof EsquemaNuevoAccesoCliente>;

export const EsquemaAccesoCliente = z.strictObject({
  usuarioId: z.uuid(),
  clienteId: z.uuid(),
  correo: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  contrasenaTemporal: z.boolean(),
  creadoEn: z.string(),
});
export type AccesoCliente = z.infer<typeof EsquemaAccesoCliente>;

/** La contraseña temporal se entrega una sola vez, en la respuesta del alta o del restablecimiento. */
export const EsquemaRespuestaAltaAcceso = z.strictObject({
  acceso: EsquemaAccesoCliente,
  /** `null` en un reintento idempotente: la contraseña ya se entregó y no se repite. */
  contrasenaTemporal: z.string().nullable(),
  temporalExpiraEn: z.string(),
});
export type RespuestaAltaAcceso = z.infer<typeof EsquemaRespuestaAltaAcceso>;

export const EsquemaEstadoAccesoCliente = z.strictObject({ activo: z.boolean(), motivo: texto(200).min(3, { error: "Indique el motivo." }) });
export type EstadoAccesoCliente = z.infer<typeof EsquemaEstadoAccesoCliente>;

export const EsquemaRespuestaAccesosCliente = z.strictObject({ accesos: z.array(EsquemaAccesoCliente) });

/** Precio de referencia por insumo (Administrador del catálogo). */
export const EsquemaReferenciaEstimacion = z.strictObject({
  insumoCodigo: z.string(),
  insumo: z.string(),
  precioCodigo: z.string(),
  producto: z.string(),
  proveedor: z.string(),
  vigenteHasta: EsquemaFechaISO,
  /** `false` si el precio dejó de ser válido (anulado, vencido o inactivo): la estimación ya no lo usa. */
  vigente: z.boolean(),
  designadaEn: z.string(),
  motivo: z.string(),
});
export const EsquemaRespuestaReferencias = z.strictObject({
  referencias: z.array(EsquemaReferenciaEstimacion),
  /** Insumos que usan los trabajos para clientes y todavía no tienen referencia: sin ella no hay estimación. */
  pendientes: z.array(z.strictObject({ insumoCodigo: z.string(), insumo: z.string() })),
});
export type RespuestaReferencias = z.infer<typeof EsquemaRespuestaReferencias>;
export type ReferenciaEstimacion = z.infer<typeof EsquemaReferenciaEstimacion>;

export const EsquemaDesignarReferencia = z.strictObject({ precioCodigo: EsquemaCodigo, motivo: texto(200).min(3, { error: "Indique el motivo." }) });
export type DesignarReferencia = z.infer<typeof EsquemaDesignarReferencia>;
export const EsquemaRetirarReferencia = z.strictObject({ motivo: texto(200).min(3, { error: "Indique el motivo." }) });
export type RetirarReferencia = z.infer<typeof EsquemaRetirarReferencia>;

/** Definición de un trabajo para clientes (Administrador del catálogo). */
export const EsquemaDefinicionOpcion = z.strictObject({
  codigo: EsquemaCodigo,
  nombre: nombre(),
  descripcion: texto(300),
  conceptoCodigo: EsquemaCodigo,
  consolidarCompras: z.boolean(),
  medidas: z.array(EsquemaMedidaPedida).min(1).max(3),
  orden: z.number().int().min(0).max(999),
  activa: z.boolean(),
});
export const EsquemaDefinicionTrabajo = z.strictObject({
  codigo: EsquemaCodigo,
  nombre: nombre(),
  descripcion: texto(300),
  ilustracion: z.enum(["cubierta", "losa", "muro"]),
  orden: z.number().int().min(0).max(999),
  activo: z.boolean(),
  opciones: z.array(EsquemaDefinicionOpcion).min(1).max(10),
  motivo: texto(200).min(3, { error: "Indique el motivo." }),
});
export type DefinicionTrabajo = z.infer<typeof EsquemaDefinicionTrabajo>;
export const EsquemaRespuestaDefinicionesTrabajo = z.strictObject({ trabajos: z.array(EsquemaDefinicionTrabajo.omit({ motivo: true })) });
export type RespuestaDefinicionesTrabajo = z.infer<typeof EsquemaRespuestaDefinicionesTrabajo>;

// ---------------------------------------------------------------------------
// Bandeja del equipo
// ---------------------------------------------------------------------------

export const EsquemaResumenSolicitudEquipo = z.strictObject({
  id: z.uuid(),
  folio: z.string(),
  estado: z.enum(ESTADOS_SOLICITUD),
  cliente: z.string(),
  proyecto: z.string(),
  trabajos: z.array(z.string()),
  enviadaEn: z.string().nullable(),
  /** Total de la estimación del cliente, si existe; la API lo marca como preliminar en el detalle. */
  totalEstimado: EsquemaDecimalTexto.nullable(),
  cotizacionId: z.uuid().nullable(),
});
export const EsquemaRespuestaSolicitudesEquipo = z.strictObject({ solicitudes: z.array(EsquemaResumenSolicitudEquipo) });
export type RespuestaSolicitudesEquipo = z.infer<typeof EsquemaRespuestaSolicitudesEquipo>;

export const EsquemaDetalleSolicitudEquipo = EsquemaResumenSolicitudEquipo.extend({
  revision: z.number().int().nonnegative(),
  captura: EsquemaCapturaSolicitud,
  ultimaEstimacion: EsquemaEstimacionCliente.nullable(),
  folioCotizacion: z.string().nullable(),
});
export type DetalleSolicitudEquipo = z.infer<typeof EsquemaDetalleSolicitudEquipo>;

export const EsquemaAtenderSolicitud = z.strictObject({ revision: z.number().int().nonnegative() });
export type AtenderSolicitud = z.infer<typeof EsquemaAtenderSolicitud>;
export const EsquemaRespuestaAtencion = z.strictObject({ cotizacionId: z.uuid(), folio: z.string(), repetida: z.boolean() });
export type RespuestaAtencion = z.infer<typeof EsquemaRespuestaAtencion>;
