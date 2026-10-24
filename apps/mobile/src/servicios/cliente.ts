/**
 * Servicios de la app del cliente (ADR-0021): una función por operación de `/api/v1/cliente/…`.
 *
 * - Solo rutas del cliente; la app nunca llama a rutas administrativas ni del equipo.
 * - Todo se valida con los esquemas de `@softarq/contracts/cliente` (lo que no coincide es `respuesta_invalida`).
 * - Ningún importe se calcula aquí: llegan de la API como texto decimal y así se muestran.
 * - `ServiciosCliente` es la interfaz que usan las pantallas y el controlador de la solicitud; las pruebas la
 *   reemplazan sin red.
 */
import {
  EsquemaDetalleCotizacionCliente,
  EsquemaEstimacionCliente,
  EsquemaProyectoCliente,
  EsquemaRespuestaCotizacionesCliente,
  EsquemaRespuestaEnvioSolicitud,
  EsquemaRespuestaProyectosCliente,
  EsquemaRespuestaSolicitudesCliente,
  EsquemaRespuestaTrabajosCliente,
  EsquemaSolicitudDelCliente,
  type CapturaSolicitud,
  type CotizacionResumenCliente,
  type DetalleCotizacionCliente,
  type EstimacionCliente,
  type NuevoProyectoCliente,
  type ProyectoCliente,
  type RespuestaEnvioSolicitud,
  type RespuestaSolicitudesCliente,
  type SolicitudDelCliente,
  type TrabajoCliente,
} from "@softarq/contracts/cliente";
import type { ClienteApi, OpcionesSolicitud } from "../api/cliente";

export type ResumenSolicitud = RespuestaSolicitudesCliente["solicitudes"][number];

export interface ServiciosCliente {
  trabajos(o?: OpcionesSolicitud): Promise<TrabajoCliente[]>;
  proyectos(o?: OpcionesSolicitud): Promise<ProyectoCliente[]>;
  crearProyecto(datos: NuevoProyectoCliente): Promise<ProyectoCliente>;
  solicitudes(o?: OpcionesSolicitud): Promise<ResumenSolicitud[]>;
  /** Crea el borrador de un proyecto propio. No es idempotente: la pantalla evita la doble pulsación. */
  crearSolicitud(proyectoId: string): Promise<SolicitudDelCliente>;
  solicitud(id: string, o?: OpcionesSolicitud): Promise<SolicitudDelCliente>;
  guardar(id: string, revision: number, captura: CapturaSolicitud): Promise<SolicitudDelCliente>;
  estimar(id: string, revision: number): Promise<EstimacionCliente>;
  enviar(id: string, revision: number): Promise<RespuestaEnvioSolicitud>;
  retirar(id: string): Promise<SolicitudDelCliente>;
  cotizaciones(o?: OpcionesSolicitud): Promise<CotizacionResumenCliente[]>;
  cotizacion(emisionId: string, o?: OpcionesSolicitud): Promise<DetalleCotizacionCliente>;
  /** Los bytes del PDF emitido, tal como los guarda la API. */
  documento(emisionId: string): Promise<Uint8Array>;
}

const BASE = "/api/v1/cliente";
const ruta = (id: string) => encodeURIComponent(id);

export function crearServicios(api: ClienteApi): ServiciosCliente {
  return {
    trabajos: async (o) => (await api.obtener(`${BASE}/trabajos`, EsquemaRespuestaTrabajosCliente, o)).trabajos,
    proyectos: async (o) => (await api.obtener(`${BASE}/proyectos`, EsquemaRespuestaProyectosCliente, o)).proyectos,
    crearProyecto: (datos) => api.enviar("POST", `${BASE}/proyectos`, datos, EsquemaProyectoCliente),
    solicitudes: async (o) => (await api.obtener(`${BASE}/solicitudes`, EsquemaRespuestaSolicitudesCliente, o)).solicitudes,
    crearSolicitud: (proyectoId) => api.enviar("POST", `${BASE}/solicitudes`, { proyectoId }, EsquemaSolicitudDelCliente),
    solicitud: (id, o) => api.obtener(`${BASE}/solicitudes/${ruta(id)}`, EsquemaSolicitudDelCliente, o),
    guardar: (id, revision, captura) => api.enviar("PUT", `${BASE}/solicitudes/${ruta(id)}`, { revision, captura }, EsquemaSolicitudDelCliente),
    estimar: (id, revision) => api.enviar("POST", `${BASE}/solicitudes/${ruta(id)}/estimaciones`, { revision }, EsquemaEstimacionCliente),
    enviar: (id, revision) => api.enviar("POST", `${BASE}/solicitudes/${ruta(id)}/envio`, { revision }, EsquemaRespuestaEnvioSolicitud),
    retirar: (id) => api.enviar("POST", `${BASE}/solicitudes/${ruta(id)}/retiro`, {}, EsquemaSolicitudDelCliente),
    cotizaciones: async (o) => (await api.obtener(`${BASE}/cotizaciones`, EsquemaRespuestaCotizacionesCliente, o)).cotizaciones,
    cotizacion: (emisionId, o) => api.obtener(`${BASE}/cotizaciones/${ruta(emisionId)}`, EsquemaDetalleCotizacionCliente, o),
    documento: (emisionId) => api.descargar(`${BASE}/cotizaciones/${ruta(emisionId)}/documento`),
  };
}
