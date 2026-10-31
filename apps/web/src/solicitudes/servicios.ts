/**
 * Endpoints de la atención de solicitudes de clientes y de la administración de su acceso (módulo 17, ADR-0021):
 * `/api/v1/solicitudes`, `/api/v1/clientes/{id}/acceso`, `/api/v1/admin/accesos-cliente` y
 * `/api/v1/admin/referencias-estimacion`. La API comprueba la capacidad de cada ruta (`solicitudes.atender`,
 * `personas.administrar`, `catalogos.administrar`); la web solo muestra u oculta controles.
 *
 * Atender crea la cotización SIN precios elegidos ni estimación heredada: la clave de idempotencia la crea quien expresa
 * la intención (el botón) y se reutiliza en los reintentos. La contraseña temporal del alta o del restablecimiento llega
 * una vez en la respuesta: aquí solo se devuelve a la pantalla.
 */
import {
  CABECERA_IDEMPOTENCIA,
  EsquemaAccesoCliente,
  EsquemaDetalleSolicitudEquipo,
  EsquemaRespuestaAltaAcceso,
  EsquemaRespuestaAtencion,
  EsquemaRespuestaReferencias,
  EsquemaRespuestaSolicitudesEquipo,
  type AccesoCliente,
  type DetalleSolicitudEquipo,
  type EstadoSolicitud,
  type RespuestaAltaAcceso,
  type RespuestaAtencion,
  type RespuestaReferencias,
  type RespuestaSolicitudesEquipo,
} from "@softarq/contracts";
import type { ClienteApi, ResultadoApi } from "../api/cliente.ts";

export interface ServiciosSolicitudes {
  listar(estados: readonly EstadoSolicitud[], signal?: AbortSignal): Promise<ResultadoApi<RespuestaSolicitudesEquipo>>;
  detalle(id: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleSolicitudEquipo>>;
  atender(id: string, revision: number, clave: string): Promise<ResultadoApi<RespuestaAtencion>>;
  // Acceso de clientes (Administrador del sistema)
  acceso(clienteId: string, signal?: AbortSignal): Promise<ResultadoApi<AccesoCliente>>;
  crearAcceso(clienteId: string, datos: { correo: string; nombre: string; motivo: string }, clave: string): Promise<ResultadoApi<RespuestaAltaAcceso>>;
  cambiarEstadoAcceso(usuarioId: string, activo: boolean, motivo: string, clave: string): Promise<ResultadoApi<AccesoCliente>>;
  restablecerAcceso(usuarioId: string, motivo: string, clave: string): Promise<ResultadoApi<RespuestaAltaAcceso>>;
  // Referencias de estimación (Administrador del catálogo)
  referencias(signal?: AbortSignal): Promise<ResultadoApi<RespuestaReferencias>>;
  designarReferencia(insumoCodigo: string, precioCodigo: string, motivo: string, clave: string): Promise<ResultadoApi<RespuestaReferencias>>;
  retirarReferencia(insumoCodigo: string, motivo: string, clave: string): Promise<ResultadoApi<RespuestaReferencias>>;
}

const conClave = (clave: string) => ({ [CABECERA_IDEMPOTENCIA]: clave });
const e = encodeURIComponent;

export function crearServiciosSolicitudes(cliente: ClienteApi): ServiciosSolicitudes {
  return {
    listar: (estados, signal) => {
      const q = estados.length > 0 ? `?estado=${estados.join(",")}` : "";
      return cliente.obtener(`/api/v1/solicitudes${q}`, EsquemaRespuestaSolicitudesEquipo, { signal });
    },
    detalle: (id, signal) => cliente.obtener(`/api/v1/solicitudes/${e(id)}`, EsquemaDetalleSolicitudEquipo, { signal }),
    atender: (id, revision, clave) => cliente.enviar(`/api/v1/solicitudes/${e(id)}/atencion`, EsquemaRespuestaAtencion, { cuerpo: { revision }, cabeceras: conClave(clave) }),
    acceso: (clienteId, signal) => cliente.obtener(`/api/v1/clientes/${e(clienteId)}/acceso`, EsquemaAccesoCliente, { signal }),
    crearAcceso: (clienteId, datos, clave) => cliente.enviar(`/api/v1/clientes/${e(clienteId)}/acceso`, EsquemaRespuestaAltaAcceso, { cuerpo: datos, cabeceras: conClave(clave) }),
    cambiarEstadoAcceso: (usuarioId, activo, motivo, clave) =>
      cliente.enviar(`/api/v1/admin/accesos-cliente/${e(usuarioId)}/estado`, EsquemaAccesoCliente, { metodo: "PUT", cuerpo: { activo, motivo }, cabeceras: conClave(clave) }),
    restablecerAcceso: (usuarioId, motivo, clave) =>
      cliente.enviar(`/api/v1/admin/accesos-cliente/${e(usuarioId)}/contrasena`, EsquemaRespuestaAltaAcceso, { cuerpo: { motivo }, cabeceras: conClave(clave) }),
    referencias: (signal) => cliente.obtener("/api/v1/admin/referencias-estimacion", EsquemaRespuestaReferencias, { signal }),
    designarReferencia: (insumo, precioCodigo, motivo, clave) =>
      cliente.enviar(`/api/v1/admin/referencias-estimacion/${e(insumo)}`, EsquemaRespuestaReferencias, { metodo: "PUT", cuerpo: { precioCodigo, motivo }, cabeceras: conClave(clave) }),
    retirarReferencia: (insumo, motivo, clave) =>
      cliente.enviar(`/api/v1/admin/referencias-estimacion/${e(insumo)}/retiro`, EsquemaRespuestaReferencias, { cuerpo: { motivo }, cabeceras: conClave(clave) }),
  };
}
