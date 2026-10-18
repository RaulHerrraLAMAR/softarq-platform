/**
 * Endpoints del Administrador del sistema (módulo 13, ADR-0017): `/api/v1/admin/parametros` y
 * `/api/v1/admin/personas`, solo con `parametros.administrar` y `personas.administrar`. La API lo
 * exige en cada ruta.
 *
 * La contraseña temporal del alta o del restablecimiento llega UNA vez en la respuesta: estas
 * funciones la devuelven a la pantalla y nada la guarda (ni almacenamiento del navegador ni caché;
 * el cliente pide `cache: "no-store"`). La clave de idempotencia la crea quien expresa la intención.
 */
import {
  CABECERA_IDEMPOTENCIA,
  EsquemaDetalleParametros,
  EsquemaDetallePersona,
  EsquemaPersonaAdmin,
  EsquemaRespuestaCredencialTemporal,
  EsquemaRespuestaPersonas,
  type DetalleParametros,
  type DetallePersona,
  type EdicionParametros,
  type EdicionPersona,
  type PersonaAdmin,
  type RespuestaCredencialTemporal,
  type RespuestaPersonas,
  type SolicitudPersona,
} from "@softarq/contracts";
import type { ClienteApi, ResultadoApi } from "../api/cliente.ts";

export interface ServiciosAdministracion {
  parametros(signal?: AbortSignal): Promise<ResultadoApi<DetalleParametros>>;
  editarParametros(cambios: EdicionParametros): Promise<ResultadoApi<DetalleParametros>>;
  listarPersonas(f: { buscar?: string; incluirInactivas?: boolean; despuesDe?: string }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaPersonas>>;
  detallePersona(id: string, signal?: AbortSignal): Promise<ResultadoApi<DetallePersona>>;
  crearPersona(datos: SolicitudPersona, clave: string): Promise<ResultadoApi<RespuestaCredencialTemporal>>;
  editarPersona(id: string, cambios: EdicionPersona): Promise<ResultadoApi<PersonaAdmin>>;
  restablecerContrasena(id: string, motivo: string, clave: string): Promise<ResultadoApi<RespuestaCredencialTemporal>>;
}

const LIMITE = 50;
const conClave = (clave: string) => ({ [CABECERA_IDEMPOTENCIA]: clave });
const persona = (id: string, resto = "") => `/api/v1/admin/personas/${encodeURIComponent(id)}${resto}`;

export function crearServiciosAdministracion(cliente: ClienteApi): ServiciosAdministracion {
  return {
    parametros: (signal) => cliente.obtener("/api/v1/admin/parametros", EsquemaDetalleParametros, { signal }),
    editarParametros: (cambios) => cliente.enviar("/api/v1/admin/parametros", EsquemaDetalleParametros, { metodo: "PATCH", cuerpo: cambios }),
    listarPersonas: (f, signal) => {
      const q = new URLSearchParams({ limite: String(LIMITE) });
      if (f.buscar) q.set("buscar", f.buscar.trim().slice(0, 60));
      if (f.incluirInactivas) q.set("incluirInactivas", "true");
      if (f.despuesDe) q.set("despuesDe", f.despuesDe);
      return cliente.obtener(`/api/v1/admin/personas?${q.toString()}`, EsquemaRespuestaPersonas, { signal });
    },
    detallePersona: (id, signal) => cliente.obtener(persona(id), EsquemaDetallePersona, { signal }),
    crearPersona: (datos, clave) => cliente.enviar("/api/v1/admin/personas", EsquemaRespuestaCredencialTemporal, { cuerpo: datos, cabeceras: conClave(clave) }),
    editarPersona: (id, cambios) => cliente.enviar(persona(id), EsquemaPersonaAdmin, { metodo: "PATCH", cuerpo: cambios }),
    restablecerContrasena: (id, motivo, clave) =>
      cliente.enviar(persona(id, "/restablecimiento"), EsquemaRespuestaCredencialTemporal, { cuerpo: { motivo }, cabeceras: conClave(clave) }),
  };
}
