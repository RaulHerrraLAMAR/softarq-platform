/**
 * Contratos del EQUIPO y la administración de la función de cliente (módulo 17, ADR-0021): accesos de clientes,
 * referencias de estimación, definición de trabajos y bandeja de solicitudes. Los consume el panel web y la API.
 *
 * **No forman parte de `@softarq/contracts/cliente`**: la app del teléfono no debe llevar ni siquiera las
 * definiciones de proveedor, producto, concepto o contraseña temporal (D-16, AGENTS §13).
 */
import { z } from "zod";
import { EsquemaCodigo, EsquemaDecimalTexto, EsquemaFechaISO } from "./esquemas.js";
import {
  ESTADOS_SOLICITUD,
  EsquemaCapturaSolicitud,
  EsquemaEstimacionCliente,
  EsquemaMedidaPedida,
  LIMITES_CLIENTE,
} from "./cliente.js";

const texto = (max: number) => z.string({ error: "Debe ser un texto." }).trim().max(max, { error: `Máximo ${max} caracteres.` });
const nombre = (min = 1) =>
  z.string({ error: "Debe ser un texto." }).trim().min(min, { error: "Escriba un nombre." }).max(LIMITES_CLIENTE.longitudNombre, { error: `Máximo ${LIMITES_CLIENTE.longitudNombre} caracteres.` });

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
