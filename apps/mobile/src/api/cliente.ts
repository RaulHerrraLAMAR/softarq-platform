/**
 * Cliente HTTP de la app (ADR-0020). Habla solo con la API de SoftArq.
 *
 * - La sesión viaja como `Authorization: Bearer <token>` (el token vive en memoria aquí y en SecureStore
 *   en el dispositivo). Sin cookies (`credentials: "omit"`), sin `Origin` y sin CSRF: no es una
 *   credencial ambiental (ADR-0020 §3).
 * - Todo lo que llega se valida con los esquemas de `@softarq/contracts`; lo que no coincide es
 *   `respuesta_invalida`.
 * - «Generación»: `cancelarTodo()` aborta lo pendiente y descarta cualquier respuesta que llegue después
 *   de un cambio de cuenta, cierre o expiración (nunca se entrega a la pantalla una respuesta de otra cuenta).
 * - Tiempo máximo por solicitud; sin reintentos automáticos (el reintento es una acción visible).
 * - Nunca se registran cuerpos, cabeceras ni el token.
 */
import { EsquemaRespuestaError } from "@softarq/contracts/movil";
import type { ZodType } from "zod";
import { FalloApi, type CampoInvalido, type TipoFallo } from "./errores";

export const TIEMPO_MAXIMO_MS = 15_000;

export interface OpcionesCliente {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Token de la sesión vigente (memoria). `null` si no hay sesión. */
  token: () => string | null;
  /**
   * Se invoca (solo para solicitudes de la generación vigente y con token) cuando la API informa que la
   * sesión ya no sirve (`sesion`), que hay que cambiar la contraseña (`cambio_contrasena`) o que la
   * función ya no permite la operación (`sin_permiso`, para refrescar las capacidades).
   */
  alFalloDeSesion?: (fallo: FalloApi) => void;
  tiempoMaximoMs?: number;
}

export interface OpcionesSolicitud {
  query?: Record<string, string | undefined>;
  /** Señal de la pantalla: al abortarla, la solicitud se cancela. */
  senal?: AbortSignal | undefined;
  /** `false` en el inicio de sesión (sin token). */
  conToken?: boolean;
}

function clasificar(estado: number, codigo: string | undefined): TipoFallo {
  if (estado === 401) {
    if (codigo === "CREDENCIALES_INVALIDAS") return "credenciales";
    if (codigo === "CONTRASENA_TEMPORAL_CADUCADA") return "temporal_caducada";
    return "sesion";
  }
  if (estado === 403) return codigo === "CAMBIO_CONTRASENA_REQUERIDO" ? "cambio_contrasena" : "sin_permiso";
  if (estado === 404) return "no_encontrado";
  if (estado === 400 || estado === 413 || estado === 415 || estado === 422) return "invalido";
  if (estado === 429) return "limite";
  return "servidor";
}

export class ClienteApi {
  private generacion = 0;
  private readonly pendientes = new Set<AbortController>();
  private readonly llamar: typeof fetch;

  constructor(private readonly opciones: OpcionesCliente) {
    // `fetch` global de React Native; se enlaza para poder reemplazarlo en las pruebas.
    this.llamar = opciones.fetch ?? ((...args) => fetch(...args));
  }

  /** Aborta lo pendiente y descarta cualquier respuesta que llegue después (cambio de cuenta, cierre, expiración). */
  cancelarTodo(): void {
    this.generacion++;
    for (const c of this.pendientes) c.abort();
    this.pendientes.clear();
  }

  async obtener<T>(ruta: string, esquema: ZodType<T>, o: OpcionesSolicitud = {}): Promise<T> {
    const r = await this.solicitar("GET", ruta, undefined, esquema, o);
    if (r === undefined) throw new FalloApi("respuesta_invalida", "La respuesta del servidor no es la esperada.");
    return r;
  }

  enviar<T>(metodo: "POST" | "DELETE", ruta: string, cuerpo: unknown, esquema: ZodType<T> | null, o: OpcionesSolicitud = {}): Promise<T | undefined> {
    return this.solicitar(metodo, ruta, cuerpo, esquema, o);
  }

  private async solicitar<T>(metodo: string, ruta: string, cuerpo: unknown, esquema: ZodType<T> | null, o: OpcionesSolicitud): Promise<T | undefined> {
    const miGeneracion = this.generacion;
    const token = o.conToken === false ? null : this.opciones.token();
    const control = new AbortController();
    this.pendientes.add(control);
    let agotado = false;
    const reloj = setTimeout(() => {
      agotado = true;
      control.abort();
    }, this.opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS);
    const externo = o.senal;
    const alAbortarExterno = () => control.abort();
    externo?.addEventListener("abort", alAbortarExterno);
    const descartado = () => miGeneracion !== this.generacion || externo?.aborted === true;
    const cancelada = () => new FalloApi("cancelada", "La operación se canceló.");

    try {
      const url = new URL(ruta, this.opciones.baseUrl);
      for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, v);
      const cabeceras: Record<string, string> = { Accept: "application/json" };
      if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";
      if (token) cabeceras["Authorization"] = `Bearer ${token}`;

      let r: Response;
      try {
        r = await this.llamar(url.toString(), {
          method: metodo,
          headers: cabeceras,
          credentials: "omit",
          signal: control.signal,
          ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
        });
      } catch {
        if (agotado) throw new FalloApi("red", "El servidor tardó demasiado en responder.");
        if (descartado()) throw cancelada();
        throw new FalloApi("red", "Sin conexión con el servidor.");
      }
      let texto: string;
      try {
        texto = await r.text();
      } catch {
        if (descartado()) throw cancelada();
        throw new FalloApi("red", "Se interrumpió la respuesta del servidor.");
      }
      if (descartado()) throw cancelada();

      let json: unknown = null;
      if (texto !== "") {
        try {
          json = JSON.parse(texto);
        } catch {
          json = null;
        }
      }

      if (!r.ok) {
        const e = EsquemaRespuestaError.safeParse(json);
        const codigo = e.success ? e.data.error.codigo : undefined;
        const tipo = clasificar(r.status, codigo);
        const reintento = Number(r.headers.get("retry-after"));
        const campos = e.success ? extraerCampos(e.data.error) : undefined;
        const fallo = new FalloApi(tipo, e.success ? e.data.error.mensaje : `Error ${r.status} del servidor.`, {
          estado: r.status,
          ...(codigo ? { codigo } : {}),
          ...(Number.isFinite(reintento) && reintento > 0 ? { reintentarEnSegundos: reintento } : {}),
          ...(campos ? { campos } : {}),
        });
        if (token && (tipo === "sesion" || tipo === "cambio_contrasena" || tipo === "sin_permiso")) this.opciones.alFalloDeSesion?.(fallo);
        throw fallo;
      }

      if (esquema === null) return undefined;
      const valido = esquema.safeParse(json);
      if (!valido.success) throw new FalloApi("respuesta_invalida", "La respuesta del servidor no es la esperada.", { estado: r.status });
      return valido.data;
    } finally {
      clearTimeout(reloj);
      externo?.removeEventListener("abort", alAbortarExterno);
      this.pendientes.delete(control);
    }
  }
}

function extraerCampos(error: unknown): CampoInvalido[] | undefined {
  const campos = (error as { campos?: unknown }).campos;
  if (!Array.isArray(campos)) return undefined;
  const r = campos.filter((c): c is CampoInvalido => typeof c === "object" && c !== null && typeof (c as CampoInvalido).ruta === "string" && typeof (c as CampoInvalido).mensaje === "string");
  return r.length > 0 ? r : undefined;
}
