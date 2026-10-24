/**
 * Consultas de solo lectura de la etapa 1 (ADR-0020). Reutilizan los endpoints existentes y validan con
 * los contratos compartidos; la API aplica la organización, las capacidades y la lista blanca móvil.
 *
 * El detalle de cotización y la versión son los mismos que usa la web; la app solo muestra su parte
 * comercial (nunca costos ni márgenes: esos endpoints no los entregan).
 */
import {
  EsquemaDetalleCliente,
  EsquemaDetalleCotizacion,
  EsquemaProyecto,
  EsquemaRespuestaClientes,
  EsquemaRespuestaCotizaciones,
  EsquemaRespuestaProyectos,
  EsquemaVersion,
  LIMITES_API,
} from "@softarq/contracts/movil";
import { FalloApi } from "../api/errores";
import type { ClienteApi } from "../api/cliente";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identificador de la ruta de la pantalla solo se usa si tiene forma de UUID (nunca se arma una ruta con texto libre). */
function idValido(id: string): string {
  if (!UUID.test(id)) throw new FalloApi("no_encontrado", "No se encontró el registro.");
  return id;
}

/** Los listados piden el máximo que admite la API; si hay más, la pantalla avisa y la búsqueda acota. */
const LIMITE = String(LIMITES_API.limiteListadoMaximo);

/** ¿La respuesta llegó al límite pedido (puede haber más registros)? */
export const estaTruncada = (cantidad: number): boolean => cantidad >= LIMITES_API.limiteListadoMaximo;

const texto = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export interface FiltrosLista {
  buscar?: string | undefined;
  clienteId?: string | undefined;
  proyectoId?: string | undefined;
}

export const listarClientes = (api: ClienteApi, f: FiltrosLista = {}, senal?: AbortSignal) =>
  api.obtener("/api/v1/clientes", EsquemaRespuestaClientes, { query: { buscar: texto(f.buscar), limite: LIMITE }, senal });

export const detalleCliente = (api: ClienteApi, id: string, senal?: AbortSignal) =>
  api.obtener(`/api/v1/clientes/${idValido(id)}`, EsquemaDetalleCliente, { senal });

export const listarProyectos = (api: ClienteApi, f: FiltrosLista = {}, senal?: AbortSignal) =>
  api.obtener("/api/v1/proyectos", EsquemaRespuestaProyectos, {
    query: { buscar: texto(f.buscar), clienteId: f.clienteId ? idValido(f.clienteId) : undefined, limite: LIMITE },
    senal,
  });

export const detalleProyecto = (api: ClienteApi, id: string, senal?: AbortSignal) =>
  api.obtener(`/api/v1/proyectos/${idValido(id)}`, EsquemaProyecto, { senal });

export const listarCotizaciones = (api: ClienteApi, f: FiltrosLista = {}, senal?: AbortSignal) =>
  api.obtener("/api/v1/cotizaciones", EsquemaRespuestaCotizaciones, {
    query: {
      buscar: texto(f.buscar),
      clienteId: f.clienteId ? idValido(f.clienteId) : undefined,
      proyectoId: f.proyectoId ? idValido(f.proyectoId) : undefined,
      limite: LIMITE,
    },
    senal,
  });

export const detalleCotizacion = (api: ClienteApi, id: string, senal?: AbortSignal) =>
  api.obtener(`/api/v1/cotizaciones/${idValido(id)}`, EsquemaDetalleCotizacion, { senal });

export function versionCotizacion(api: ClienteApi, id: string, numero: string, senal?: AbortSignal) {
  if (!/^[1-9]\d{0,5}$/.test(numero)) throw new FalloApi("no_encontrado", "No se encontró la versión.");
  return api.obtener(`/api/v1/cotizaciones/${idValido(id)}/versiones/${numero}`, EsquemaVersion, { senal });
}
