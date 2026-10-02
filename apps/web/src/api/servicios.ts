/**
 * Funciones por endpoint de la API v1. Solo construyen la ruta y eligen el esquema de respuesta.
 */
import {
  EsquemaRespuestaCalculoDemo,
  EsquemaRespuestaConceptos,
  EsquemaRespuestaOpcionesPrecio,
  EsquemaRespuestaTiposAdicional,
  LIMITES_API,
  type RespuestaCalculoDemo,
  type RespuestaConceptos,
  type RespuestaOpcionesPrecio,
  type RespuestaTiposAdicional,
  type SolicitudCalculoDemo,
} from "@softarq/contracts";
import type { ClienteApi, ResultadoApi } from "./cliente.ts";

export type ConceptoCatalogo = RespuestaConceptos["conceptos"][number];
export type InsumoConOpciones = RespuestaOpcionesPrecio["insumos"][number];
export type OpcionPrecio = InsumoConOpciones["opciones"][number];
export type TipoAdicionalCatalogo = RespuestaTiposAdicional["tiposAdicional"][number];

export interface ServiciosApi {
  buscarConceptos(texto: string, signal?: AbortSignal): Promise<ResultadoApi<RespuestaConceptos>>;
  opcionesPrecio(conceptos: readonly string[], signal?: AbortSignal): Promise<ResultadoApi<RespuestaOpcionesPrecio>>;
  tiposAdicional(signal?: AbortSignal): Promise<ResultadoApi<RespuestaTiposAdicional>>;
  calcular(solicitud: SolicitudCalculoDemo, signal?: AbortSignal): Promise<ResultadoApi<RespuestaCalculoDemo>>;
}

export function crearServicios(cliente: ClienteApi): ServiciosApi {
  return {
    buscarConceptos(texto, signal) {
      const q = new URLSearchParams({ limite: "20" });
      const t = texto.trim().slice(0, LIMITES_API.longitudBusqueda);
      if (t) q.set("buscar", t);
      return cliente.obtener(`/api/v1/catalogos/conceptos?${q}`, EsquemaRespuestaConceptos, { signal });
    },
    opcionesPrecio(conceptos, signal) {
      const q = new URLSearchParams({ conceptos: conceptos.join(",") });
      return cliente.obtener(`/api/v1/catalogos/opciones-precio?${q}`, EsquemaRespuestaOpcionesPrecio, { signal });
    },
    tiposAdicional(signal) {
      return cliente.obtener(`/api/v1/catalogos/tipos-adicional?limite=${LIMITES_API.limiteListadoMaximo}`, EsquemaRespuestaTiposAdicional, {
        signal,
      });
    },
    calcular(solicitud, signal) {
      return cliente.enviar("/api/v1/calculos/demo", EsquemaRespuestaCalculoDemo, { signal, cuerpo: solicitud, tiempoMaximo: 30_000 });
    },
  };
}
