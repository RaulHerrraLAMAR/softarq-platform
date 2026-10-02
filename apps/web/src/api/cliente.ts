/**
 * Cliente HTTP centralizado de la API v1.
 *
 * - Toda respuesta se valida con los esquemas de `@softarq/contracts`; si no cumple, el resultado
 *   es «incompatible» (nunca se muestra una respuesta cruda).
 * - Los errores se clasifican para la interfaz sin exponer detalles técnicos.
 * - Cada solicitud admite cancelación (`AbortSignal`) y tiene un tiempo máximo.
 */
import { EsquemaRespuestaError, type RespuestaError } from "@softarq/contracts";
import type { z } from "zod";

export type FalloApi =
  | { tipo: "invalida"; campos: { ruta: string; mensaje: string }[] }
  | { tipo: "bloqueado"; problemas: { codigo: string; referencia: string; mensaje: string }[] }
  | { tipo: "no_encontrado"; faltantes: { tipo: string; codigo: string }[] }
  | { tipo: "limite"; reintentarEnSegundos: number | null }
  | { tipo: "no_disponible" }
  | { tipo: "incompatible" }
  | { tipo: "error_servidor" }
  | { tipo: "red" }
  | { tipo: "cancelado" };

export type ResultadoApi<T> = { ok: true; datos: T } | { ok: false; fallo: FalloApi };

export interface OpcionesSolicitud {
  signal?: AbortSignal | undefined;
  cuerpo?: unknown;
  /** Tiempo máximo en milisegundos (15 s por omisión). */
  tiempoMaximo?: number;
}

export interface ClienteApi {
  obtener<E extends z.ZodType>(ruta: string, esquema: E, opciones?: OpcionesSolicitud): Promise<ResultadoApi<z.infer<E>>>;
  enviar<E extends z.ZodType>(ruta: string, esquema: E, opciones: OpcionesSolicitud): Promise<ResultadoApi<z.infer<E>>>;
}

const TIEMPO_MAXIMO_MS = 15_000;

export function crearClienteApi(urlBase: string, hacerFetch: typeof fetch = (...a) => fetch(...a)): ClienteApi {
  async function solicitar<E extends z.ZodType>(
    metodo: "GET" | "POST",
    ruta: string,
    esquema: E,
    opciones: OpcionesSolicitud = {},
  ): Promise<ResultadoApi<z.infer<E>>> {
    const externo = opciones.signal;
    if (externo?.aborted) return { ok: false, fallo: { tipo: "cancelado" } };
    const limite = AbortSignal.timeout(opciones.tiempoMaximo ?? TIEMPO_MAXIMO_MS);
    const signal = externo ? AbortSignal.any([externo, limite]) : limite;

    let respuesta: Response;
    try {
      respuesta = await hacerFetch(`${urlBase}${ruta}`, {
        method: metodo,
        signal,
        headers: metodo === "POST" ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
        ...(metodo === "POST" ? { body: JSON.stringify(opciones.cuerpo) } : {}),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      return { ok: false, fallo: externo?.aborted ? { tipo: "cancelado" } : { tipo: "red" } };
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      if (externo?.aborted) return { ok: false, fallo: { tipo: "cancelado" } };
      return { ok: false, fallo: falloPorEstado(respuesta, null) };
    }
    if (externo?.aborted) return { ok: false, fallo: { tipo: "cancelado" } };

    if (respuesta.ok) {
      const r = esquema.safeParse(cuerpo);
      return r.success ? { ok: true, datos: r.data } : { ok: false, fallo: { tipo: "incompatible" } };
    }
    const error = EsquemaRespuestaError.safeParse(cuerpo);
    return { ok: false, fallo: falloPorEstado(respuesta, error.success ? error.data : null) };
  }

  return {
    obtener: (ruta, esquema, opciones) => solicitar("GET", ruta, esquema, opciones),
    enviar: (ruta, esquema, opciones) => solicitar("POST", ruta, esquema, opciones),
  };
}

function falloPorEstado(respuesta: Response, error: RespuestaError | null): FalloApi {
  const e = error?.error;
  switch (respuesta.status) {
    case 400:
      return e ? { tipo: "invalida", campos: e.campos ?? [] } : { tipo: "incompatible" };
    case 404:
      return e ? { tipo: "no_encontrado", faltantes: e.faltantes ?? [] } : { tipo: "incompatible" };
    case 422:
      return e?.codigo === "CALCULO_BLOQUEADO" ? { tipo: "bloqueado", problemas: e.problemas ?? [] } : { tipo: "incompatible" };
    case 429:
      return { tipo: "limite", reintentarEnSegundos: segundos(respuesta.headers.get("Retry-After")) };
    case 502:
    case 503:
    case 504:
      return { tipo: "no_disponible" };
    default:
      return respuesta.status >= 500 || respuesta.status === 413 || respuesta.status === 415
        ? { tipo: "error_servidor" }
        : { tipo: "incompatible" };
  }
}

function segundos(cabecera: string | null): number | null {
  if (cabecera === null || !/^\d{1,5}$/.test(cabecera)) return null;
  return Number.parseInt(cabecera, 10);
}

/** Mensaje para el usuario, sin detalles técnicos. */
export function mensajeDeFallo(fallo: FalloApi): string {
  switch (fallo.tipo) {
    case "invalida":
      return "Hay datos que no se pueden usar. Revise los campos marcados.";
    case "bloqueado":
      return "El cálculo está bloqueado por las reglas de la cotización.";
    case "no_encontrado":
      return "Algún elemento de la captura ya no existe en el catálogo.";
    case "limite":
      return fallo.reintentarEnSegundos !== null
        ? `Se hicieron demasiadas solicitudes. Espere ${fallo.reintentarEnSegundos} s y vuelva a intentarlo.`
        : "Se hicieron demasiadas solicitudes. Espere un momento y vuelva a intentarlo.";
    case "no_disponible":
      return "El servicio de cotización no está disponible en este momento.";
    case "incompatible":
      return "La respuesta del servicio no tiene el formato esperado. No se muestra ningún resultado.";
    case "error_servidor":
      return "El servicio no pudo atender la solicitud.";
    case "red":
      return "No hay conexión con el servicio de cotización. Compruebe que esté iniciado.";
    case "cancelado":
      return "Solicitud cancelada.";
  }
}
