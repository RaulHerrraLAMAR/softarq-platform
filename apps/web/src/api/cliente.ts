/**
 * Cliente HTTP centralizado de la API v1.
 *
 * - Toda respuesta se valida con los esquemas de `@softarq/contracts`; si no cumple, el resultado
 *   es «incompatible» (nunca se muestra una respuesta cruda).
 * - Los errores se clasifican para la interfaz sin exponer detalles técnicos.
 * - Cada solicitud admite cancelación (`AbortSignal`) y tiene un tiempo máximo.
 *
 * Sesión (ADR-0007):
 * - `credentials: "include"`: el navegador envía la cookie HttpOnly de sesión; la web nunca la ve.
 * - El token CSRF se lee de memoria (`csrf()`), nunca de `localStorage`, `sessionStorage` ni
 *   variables públicas, y se envía en POST y DELETE.
 * - Generación de sesión: al iniciar, cerrar o vencer la sesión se cancela todo lo pendiente
 *   (`cancelarTodo`) y cualquier respuesta de una generación anterior se descarta («cancelado»),
 *   de modo que ningún dato de la identidad anterior vuelve a la pantalla.
 * - Un 401 avisa a `alNoAutenticado` (salvo en los endpoints de acceso).
 */
import { CABECERA_CSRF, EsquemaRespuestaError, type RespuestaError } from "@softarq/contracts";
import type { z } from "zod";

export type FalloApi =
  | { tipo: "invalida"; campos: { ruta: string; mensaje: string }[] }
  | { tipo: "bloqueado"; problemas: { codigo: string; referencia: string; mensaje: string }[] }
  | { tipo: "no_encontrado"; faltantes: { tipo: string; codigo: string }[] }
  | { tipo: "limite"; reintentarEnSegundos: number | null }
  | { tipo: "no_autenticado" }
  | { tipo: "credenciales" }
  | { tipo: "sin_permiso" }
  | { tipo: "csrf" }
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
  /** Endpoints de acceso: un 401 no significa «sesión vencida». */
  sinAvisoDeSesion?: boolean;
}

export interface ClienteApi {
  obtener<E extends z.ZodType>(ruta: string, esquema: E, opciones?: OpcionesSolicitud): Promise<ResultadoApi<z.infer<E>>>;
  enviar<E extends z.ZodType>(ruta: string, esquema: E, opciones: OpcionesSolicitud): Promise<ResultadoApi<z.infer<E>>>;
  /** DELETE sin cuerpo de respuesta (204). */
  eliminar(ruta: string, opciones?: OpcionesSolicitud): Promise<ResultadoApi<null>>;
  /** Cancela todo lo pendiente y descarta las respuestas que lleguen después. */
  cancelarTodo(): void;
}

export interface OpcionesCliente {
  /** Token CSRF vigente (solo en memoria). */
  csrf?: () => string | null;
  /** Se llama ante un 401 fuera de los endpoints de acceso. */
  alNoAutenticado?: () => void;
  /** Se llama ante un 403 CSRF_NO_VALIDO (p. ej., la API se reinició). */
  alCsrfNoValido?: () => void;
}

const TIEMPO_MAXIMO_MS = 15_000;
type Metodo = "GET" | "POST" | "DELETE";

export function crearClienteApi(
  urlBase: string,
  hacerFetch: typeof fetch = (...a) => fetch(...a),
  opcionesCliente: OpcionesCliente = {},
): ClienteApi {
  let generacion = 0;
  const pendientes = new Set<AbortController>();

  async function solicitar<T>(
    metodo: Metodo,
    ruta: string,
    validar: (cuerpo: unknown) => ResultadoApi<T>,
    opciones: OpcionesSolicitud = {},
  ): Promise<ResultadoApi<T>> {
    const cancelado: ResultadoApi<T> = { ok: false, fallo: { tipo: "cancelado" } };
    const externo = opciones.signal;
    if (externo?.aborted) return cancelado;
    const miGeneracion = generacion;
    const propio = new AbortController();
    pendientes.add(propio);
    const limite = AbortSignal.timeout(opciones.tiempoMaximo ?? TIEMPO_MAXIMO_MS);
    const signal = AbortSignal.any([propio.signal, limite, ...(externo ? [externo] : [])]);
    const descartado = () => externo?.aborted === true || propio.signal.aborted || miGeneracion !== generacion;

    try {
      const cabeceras: Record<string, string> = { Accept: "application/json" };
      if (metodo === "POST") cabeceras["Content-Type"] = "application/json";
      if (metodo !== "GET") {
        const csrf = opcionesCliente.csrf?.();
        if (csrf) cabeceras[CABECERA_CSRF] = csrf;
      }
      let respuesta: Response;
      try {
        respuesta = await hacerFetch(`${urlBase}${ruta}`, {
          method: metodo,
          signal,
          headers: cabeceras,
          ...(metodo === "POST" ? { body: JSON.stringify(opciones.cuerpo) } : {}),
          credentials: "include",
          cache: "no-store",
          redirect: "error",
        });
      } catch {
        return descartado() ? cancelado : { ok: false, fallo: { tipo: "red" } };
      }
      if (descartado()) return cancelado;

      if (respuesta.status === 204) {
        return respuesta.ok ? validar(null) : { ok: false, fallo: falloPorEstado(respuesta, null) };
      }
      let cuerpo: unknown;
      try {
        cuerpo = await respuesta.json();
      } catch {
        if (descartado()) return cancelado;
        return { ok: false, fallo: falloPorEstado(respuesta, null) };
      }
      if (descartado()) return cancelado;

      if (respuesta.ok) return validar(cuerpo);
      const error = EsquemaRespuestaError.safeParse(cuerpo);
      const fallo = falloPorEstado(respuesta, error.success ? error.data : null);
      if (fallo.tipo === "no_autenticado" && !opciones.sinAvisoDeSesion) opcionesCliente.alNoAutenticado?.();
      if (fallo.tipo === "csrf" && !opciones.sinAvisoDeSesion) opcionesCliente.alCsrfNoValido?.();
      return { ok: false, fallo };
    } finally {
      pendientes.delete(propio);
    }
  }

  const conEsquema =
    <E extends z.ZodType>(esquema: E) =>
    (cuerpo: unknown): ResultadoApi<z.infer<E>> => {
      const r = esquema.safeParse(cuerpo);
      return r.success ? { ok: true, datos: r.data } : { ok: false, fallo: { tipo: "incompatible" } };
    };

  return {
    obtener: (ruta, esquema, opciones) => solicitar("GET", ruta, conEsquema(esquema), opciones),
    enviar: (ruta, esquema, opciones) => solicitar("POST", ruta, conEsquema(esquema), opciones),
    eliminar: (ruta, opciones) =>
      solicitar("DELETE", ruta, (c) => (c === null ? { ok: true, datos: null } : { ok: false, fallo: { tipo: "incompatible" } }), opciones),
    cancelarTodo() {
      generacion++;
      for (const c of pendientes) c.abort();
      pendientes.clear();
    },
  };
}

function falloPorEstado(respuesta: Response, error: RespuestaError | null): FalloApi {
  const e = error?.error;
  switch (respuesta.status) {
    case 400:
      return e ? { tipo: "invalida", campos: e.campos ?? [] } : { tipo: "incompatible" };
    case 401:
      if (e?.codigo === "CREDENCIALES_INVALIDAS") return { tipo: "credenciales" };
      return e?.codigo === "NO_AUTENTICADO" || e?.codigo === "SESION_NO_VALIDA" ? { tipo: "no_autenticado" } : { tipo: "incompatible" };
    case 403:
      if (e?.codigo === "CSRF_NO_VALIDO") return { tipo: "csrf" };
      return e?.codigo === "SIN_PERMISO" || e?.codigo === "ORIGEN_NO_PERMITIDO" ? { tipo: "sin_permiso" } : { tipo: "incompatible" };
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
    case "no_autenticado":
      return "La sesión terminó. Inicie sesión de nuevo.";
    case "credenciales":
      return "Correo o contraseña incorrectos.";
    case "sin_permiso":
      return "Su función no permite esta operación.";
    case "csrf":
      return "La protección de la solicitud se renovó. Vuelva a intentarlo.";
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
