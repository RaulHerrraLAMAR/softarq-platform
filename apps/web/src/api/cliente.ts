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
 *   variables públicas, y se envía en todo método con efectos (POST, PUT, PATCH y DELETE).
 * - Si el servidor responde 403 CSRF_NO_VALIDO (p. ej., la API se reinició), se renueva el token
 *   (`renovarCsrf`) y se reintenta UNA vez la misma solicitud con las mismas cabeceras, incluida la
 *   `Idempotency-Key`: el reintento conserva la identidad de la operación y no duplica altas.
 * - Generación de sesión: al iniciar, cerrar o vencer la sesión se cancela todo lo pendiente
 *   (`cancelarTodo`) y cualquier respuesta de una generación anterior se descarta («cancelado»),
 *   de modo que ningún dato de la identidad anterior vuelve a la pantalla.
 * - Un 401 avisa a `alNoAutenticado` (salvo en los endpoints de acceso).
 */
import { CABECERA_CSRF, EsquemaRespuestaError, type RespuestaError } from "@softarq/contracts";
import type { z } from "zod";

export type FalloApi =
  | { tipo: "respuesta"; codigo: "CONFLICTO_RESPUESTA" | "EMISION_SUSTITUIDA" | "FECHA_RESPUESTA_INVALIDA" | "RESPUESTA_FUERA_VIGENCIA"; mensaje: string; seguimientoVigente?: unknown; campos?: { ruta: string; mensaje: string }[] }
  | { tipo: "invalida"; campos: { ruta: string; mensaje: string }[] }
  /**
   * Excepciones B-22 (módulo 10): 409 CONFLICTO_EXCEPCION (otra persona ya decidió;
   * `excepcionesVigentes` sin validar) o 422 EXCEPCION_INVALIDA (campos del borrador).
   */
  | { tipo: "excepcion"; codigo: "CONFLICTO_EXCEPCION" | "EXCEPCION_INVALIDA"; mensaje: string; excepcionesVigentes?: unknown; campos?: { ruta: string; mensaje: string }[] }
  /**
   * 422 con bloqueos (códigos BL, sin importes): CALCULO_BLOQUEADO y, en la revisión (módulo 7),
   * ENVIO_BLOQUEADO, APROBACION_BLOQUEADA y DECISION_BLOQUEADA (BL-17). El estado no cambió.
   */
  | { tipo: "bloqueado"; problemas: { codigo: string; referencia: string; mensaje: string }[]; codigo?: string; mensaje?: string }
  | { tipo: "no_encontrado"; faltantes: { tipo: string; codigo: string }[] }
  | { tipo: "limite"; reintentarEnSegundos: number | null }
  | { tipo: "no_autenticado" }
  | { tipo: "credenciales" }
  | { tipo: "sin_permiso" }
  | { tipo: "csrf" }
  /** 409 (ADR-0008): revisión obsoleta o borrador cambiado; `actual` trae el estado vigente. */
  | { tipo: "conflicto"; codigo: "CONFLICTO_EDICION" | "BORRADOR_DESACTUALIZADO"; mensaje: string; actual: ActualServidor | null }
  /** 422 CAPTURA_INCOMPLETA: la captura no está lista; no se guardó ninguna versión. */
  | { tipo: "incompleta"; campos: { ruta: string; mensaje: string }[] }
  /** 422 REGISTRO_INACTIVO: el cliente o el proyecto no se ofrece para registros nuevos. */
  | { tipo: "inactivo"; mensaje: string }
  /** 422 REFERENCIA_NO_DISPONIBLE: una referencia nueva no existe o no está disponible hoy. */
  | { tipo: "referencia"; campos: { ruta: string; mensaje: string }[] }
  /**
   * 409 de la revisión (módulo 7): REVISION_PENDIENTE (no se edita ni se calcula mientras hay una
   * revisión pendiente), VERSION_NO_VIGENTE o CONFLICTO_REVISION (cambió o ya se decidió).
   * `revisionVigente` trae el estado actual, sin validar (la pantalla lo valida con el contrato).
   */
  | { tipo: "revision"; codigo: "REVISION_PENDIENTE" | "VERSION_NO_VIGENTE" | "CONFLICTO_REVISION"; mensaje: string; revisionVigente: unknown }
  /**
   * 409 de la emisión (módulo 8): VERSION_EMITIDA, APROBACION_NO_VIGENTE, CONFLICTO_EMISION (la
   * versión o la aprobación vistas ya no son las vigentes) o FOLIO_NO_ACTIVO (descartada).
   */
  | { tipo: "estado"; codigo: "VERSION_EMITIDA" | "APROBACION_NO_VIGENTE" | "CONFLICTO_EMISION" | "FOLIO_NO_ACTIVO"; mensaje: string }
  /**
   * 500 del documento (módulo 8): DOCUMENTO_NO_GENERADO (no se emitió; se puede reintentar) o
   * DOCUMENTO_NO_DISPONIBLE (el archivo emitido falta o no coincide; nunca se regenera).
   */
  | { tipo: "documento"; codigo: "DOCUMENTO_NO_GENERADO" | "DOCUMENTO_NO_DISPONIBLE"; mensaje: string }
  /** 422 IDEMPOTENCIA_CONFLICTO o IDEMPOTENCIA_CADUCADA. */
  | { tipo: "idempotencia"; mensaje: string }
  | { tipo: "no_disponible" }
  | { tipo: "incompatible" }
  | { tipo: "error_servidor" }
  | { tipo: "red" }
  | { tipo: "cancelado" };

export interface ActualServidor {
  revision: number;
  actualizadoPor: string;
  actualizadoEn: string;
  /** Solo en borradores: la captura guardada (sin validar; la web la valida con el contrato). */
  captura?: unknown;
}

export type ResultadoApi<T> = { ok: true; datos: T } | { ok: false; fallo: FalloApi };

export interface OpcionesSolicitud {
  signal?: AbortSignal | undefined;
  cuerpo?: unknown;
  /** Tiempo máximo en milisegundos (15 s por omisión). */
  tiempoMaximo?: number;
  /** Endpoints de acceso: un 401 no significa «sesión vencida». */
  sinAvisoDeSesion?: boolean;
  /** Cabeceras adicionales (p. ej., `Idempotency-Key`); se conservan en el reintento por CSRF. */
  cabeceras?: Record<string, string>;
}

export type MetodoEscritura = "POST" | "PUT" | "PATCH";

export interface ClienteApi {
  obtener<E extends z.ZodType>(ruta: string, esquema: E, opciones?: OpcionesSolicitud): Promise<ResultadoApi<z.infer<E>>>;
  enviar<E extends z.ZodType>(
    ruta: string,
    esquema: E,
    opciones: OpcionesSolicitud & { metodo?: MetodoEscritura },
  ): Promise<ResultadoApi<z.infer<E>>>;
  /** DELETE sin cuerpo de respuesta (204). */
  eliminar(ruta: string, opciones?: OpcionesSolicitud): Promise<ResultadoApi<null>>;
  /** GET de un archivo (p. ej. el PDF emitido): el contenido como Blob, con la sesión. */
  descargar(ruta: string, tipo: string, opciones?: OpcionesSolicitud): Promise<ResultadoApi<Blob>>;
  /** Cancela todo lo pendiente y descarta las respuestas que lleguen después. */
  cancelarTodo(): void;
}

export interface OpcionesCliente {
  /** Token CSRF vigente (solo en memoria). */
  csrf?: () => string | null;
  /** Se llama ante un 401 fuera de los endpoints de acceso. */
  alNoAutenticado?: () => void;
  /**
   * Ante un 403 CSRF_NO_VALIDO: obtiene un token nuevo (en memoria) y devuelve `true` si lo
   * consiguió; entonces la solicitud se reintenta una sola vez con las mismas cabeceras.
   */
  renovarCsrf?: () => Promise<boolean>;
}

const TIEMPO_MAXIMO_MS = 15_000;
type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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
    esReintento = false,
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
      const conCuerpo = metodo === "POST" || metodo === "PUT" || metodo === "PATCH";
      const cabeceras: Record<string, string> = { Accept: "application/json", ...(opciones.cabeceras ?? {}) };
      if (conCuerpo) cabeceras["Content-Type"] = "application/json";
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
          ...(conCuerpo ? { body: JSON.stringify(opciones.cuerpo) } : {}),
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
      // Archivo binario: solo si el tipo coincide con el pedido (si no, se trata como error JSON).
      const tipoPedido = opciones.cabeceras?.["Accept"];
      if (respuesta.ok && tipoPedido && tipoPedido !== "application/json") {
        if (!(respuesta.headers.get("Content-Type") ?? "").startsWith(tipoPedido)) return { ok: false, fallo: { tipo: "incompatible" } };
        let blob: Blob;
        try {
          blob = await respuesta.blob();
        } catch {
          return descartado() ? cancelado : { ok: false, fallo: { tipo: "red" } };
        }
        if (descartado()) return cancelado;
        return validar(blob);
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
      if (fallo.tipo === "csrf" && !opciones.sinAvisoDeSesion && !esReintento && opcionesCliente.renovarCsrf) {
        pendientes.delete(propio);
        const renovado = await opcionesCliente.renovarCsrf();
        if (descartado()) return cancelado;
        if (renovado) return solicitar(metodo, ruta, validar, opciones, true);
      }
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
    enviar: (ruta, esquema, { metodo = "POST", ...opciones }) => solicitar(metodo, ruta, conEsquema(esquema), opciones),
    eliminar: (ruta, opciones) =>
      solicitar("DELETE", ruta, (c) => (c === null ? { ok: true, datos: null } : { ok: false, fallo: { tipo: "incompatible" } }), opciones),
    descargar: (ruta, tipo, opciones = {}) =>
      solicitar(
        "GET",
        ruta,
        (c) => (c instanceof Blob ? { ok: true, datos: c } : { ok: false, fallo: { tipo: "incompatible" } }),
        { ...opciones, cabeceras: { ...(opciones.cabeceras ?? {}), Accept: tipo } },
      ),
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
    case 409:
      if (e?.codigo === "CONFLICTO_RESPUESTA" || e?.codigo === "EMISION_SUSTITUIDA") {
        return { tipo: "respuesta", codigo: e.codigo, mensaje: e.mensaje, seguimientoVigente: e.seguimientoVigente };
      }
      if (e?.codigo === "CONFLICTO_EXCEPCION") {
        return { tipo: "excepcion", codigo: e.codigo, mensaje: e.mensaje, excepcionesVigentes: e.excepcionesVigentes };
      }
      if (e?.codigo === "CONFLICTO_EDICION" || e?.codigo === "BORRADOR_DESACTUALIZADO") {
        return { tipo: "conflicto", codigo: e.codigo, mensaje: e.mensaje, actual: e.actual ?? null };
      }
      if (e?.codigo === "REVISION_PENDIENTE" || e?.codigo === "VERSION_NO_VIGENTE" || e?.codigo === "CONFLICTO_REVISION") {
        return { tipo: "revision", codigo: e.codigo, mensaje: e.mensaje, revisionVigente: e.revisionVigente ?? null };
      }
      if (
        e?.codigo === "VERSION_EMITIDA" ||
        e?.codigo === "APROBACION_NO_VIGENTE" ||
        e?.codigo === "CONFLICTO_EMISION" ||
        e?.codigo === "FOLIO_NO_ACTIVO"
      ) {
        return { tipo: "estado", codigo: e.codigo, mensaje: e.mensaje };
      }
      return { tipo: "incompatible" };
    case 422:
      switch (e?.codigo) {
        case "FECHA_RESPUESTA_INVALIDA":
        case "RESPUESTA_FUERA_VIGENCIA":
          return { tipo: "respuesta", codigo: e.codigo, mensaje: e.mensaje, campos: e.campos ?? [] };
        case "CALCULO_BLOQUEADO":
          return { tipo: "bloqueado", problemas: e.problemas ?? [] };
        case "ENVIO_BLOQUEADO":
        case "APROBACION_BLOQUEADA":
        case "DECISION_BLOQUEADA":
        case "EMISION_BLOQUEADA":
        case "DESCARTE_BLOQUEADO":
          return { tipo: "bloqueado", problemas: e.problemas ?? [], codigo: e.codigo, mensaje: e.mensaje };
        case "REFERENCIA_NO_DISPONIBLE":
          return { tipo: "referencia", campos: e.campos ?? [] };
        case "EXCEPCION_INVALIDA":
          return { tipo: "excepcion", codigo: e.codigo, mensaje: e.mensaje, campos: e.campos ?? [] };
        case "CAPTURA_INCOMPLETA":
          return { tipo: "incompleta", campos: e.campos ?? [] };
        case "REGISTRO_INACTIVO":
          return { tipo: "inactivo", mensaje: e.mensaje };
        case "IDEMPOTENCIA_CONFLICTO":
        case "IDEMPOTENCIA_CADUCADA":
          return { tipo: "idempotencia", mensaje: e.mensaje };
        default:
          return { tipo: "incompatible" };
      }
    case 429:
      return { tipo: "limite", reintentarEnSegundos: segundos(respuesta.headers.get("Retry-After")) };
    case 500:
      if (e?.codigo === "DOCUMENTO_NO_GENERADO" || e?.codigo === "DOCUMENTO_NO_DISPONIBLE") {
        return { tipo: "documento", codigo: e.codigo, mensaje: e.mensaje };
      }
      return { tipo: "error_servidor" };
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
      return fallo.mensaje ?? "El cálculo está bloqueado por las reglas de la cotización.";
    case "referencia":
      return "Hay referencias nuevas que no existen o no están disponibles hoy. Revise los campos marcados.";
    case "excepcion":
      return fallo.mensaje;
    case "revision":
    case "respuesta":
    case "estado":
    case "documento":
      return fallo.mensaje;
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
    case "conflicto":
      return fallo.mensaje;
    case "incompleta":
      return "La captura está incompleta: no se guardó ninguna versión. Complete los datos señalados.";
    case "inactivo":
      return fallo.mensaje;
    case "idempotencia":
      return "La operación no se pudo repetir con seguridad. Recargue la página y vuelva a intentarlo.";
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
