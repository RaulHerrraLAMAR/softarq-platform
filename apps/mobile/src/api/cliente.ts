/**
 * Cliente HTTP de la app (ADR-0020, ADR-0021). Habla solo con la API de SoftArq.
 *
 * - La sesión viaja como `Authorization: Bearer <token>` (el token vive en memoria aquí y en SecureStore
 *   en el dispositivo). Sin cookies (`credentials: "omit"`), sin `Origin` y sin CSRF: no es una
 *   credencial ambiental (ADR-0020 §3).
 * - Todo lo que llega se valida con los esquemas de `@softarq/contracts/cliente`; lo que no coincide es
 *   `respuesta_invalida`.
 * - «Generación»: `cancelarTodo()` aborta lo pendiente y descarta cualquier respuesta que llegue después
 *   de un cambio de cuenta, cierre o expiración (nunca se entrega a la pantalla una respuesta de otra cuenta).
 * - Tiempo máximo por solicitud; sin reintentos automáticos (el reintento es una acción visible).
 * - `descargar` trae un documento binario (el PDF emitido) con el mismo control; nunca lleva el token en la URL.
 * - Nunca se registran cuerpos, cabeceras ni el token.
 */
import { EsquemaRespuestaErrorCliente } from "@softarq/contracts/cliente";
import type { ZodType } from "zod";
import { FalloApi, type CampoInvalido, type TipoFallo } from "./errores";

export const TIEMPO_MAXIMO_MS = 15_000;
/** Tope de un documento descargado: los PDF emitidos pesan decenas de KB; esto evita llenar la memoria con una respuesta errónea. */
export const TAMANO_MAXIMO_DOCUMENTO = 15 * 1024 * 1024;

export interface OpcionesCliente {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Token de la sesión vigente (memoria). `null` si no hay sesión. */
  token: () => string | null;
  /**
   * Se invoca (solo para solicitudes de la generación vigente y con token) cuando la API informa que la
   * sesión ya no sirve (`sesion`), que hay que cambiar la contraseña (`cambio_contrasena`) o que la
   * cuenta ya no permite la operación (`sin_permiso`, para refrescar las capacidades).
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

export type MetodoEscritura = "POST" | "PUT" | "DELETE";

function clasificar(estado: number, codigo: string | undefined): TipoFallo {
  if (estado === 401) {
    if (codigo === "CREDENCIALES_INVALIDAS") return "credenciales";
    if (codigo === "CONTRASENA_TEMPORAL_CADUCADA") return "temporal_caducada";
    return "sesion";
  }
  if (estado === 403) {
    if (codigo === "CAMBIO_CONTRASENA_REQUERIDO") return "cambio_contrasena";
    if (codigo === "CUENTA_INTERNA_USE_PANEL") return "cuenta_interna";
    return "sin_permiso";
  }
  if (estado === 404) return "no_encontrado";
  if (estado === 409) return "conflicto";
  if (estado === 400 || estado === 413 || estado === 415 || estado === 422) return "invalido";
  if (estado === 429) return "limite";
  return "servidor";
}

/** Lo que devuelve una solicitud satisfactoria antes de validarla contra un esquema. */
interface Crudo {
  estado: number;
  json: unknown;
  bytes: Uint8Array | null;
  tipoContenido: string;
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
    const c = await this.solicitar("GET", ruta, undefined, o, false);
    return this.validar(c, esquema);
  }

  async enviar<T>(metodo: MetodoEscritura, ruta: string, cuerpo: unknown, esquema: ZodType<T>, o?: OpcionesSolicitud): Promise<T>;
  async enviar(metodo: MetodoEscritura, ruta: string, cuerpo: unknown, esquema: null, o?: OpcionesSolicitud): Promise<undefined>;
  async enviar<T>(metodo: MetodoEscritura, ruta: string, cuerpo: unknown, esquema: ZodType<T> | null, o: OpcionesSolicitud = {}): Promise<T | undefined> {
    const c = await this.solicitar(metodo, ruta, cuerpo, o, false);
    return esquema === null ? undefined : this.validar(c, esquema);
  }

  /**
   * Descarga un documento binario (PDF). Exige `application/pdf`, la firma `%PDF-` y un tamaño razonable; devuelve
   * los bytes tal cual llegaron (nunca se regeneran ni se transforman).
   */
  async descargar(ruta: string, o: OpcionesSolicitud = {}): Promise<Uint8Array> {
    const c = await this.solicitar("GET", ruta, undefined, o, true);
    const bytes = c.bytes;
    const invalido = () => new FalloApi("respuesta_invalida", "El documento recibido no es un PDF válido.", { estado: c.estado });
    if (!bytes || !c.tipoContenido.toLowerCase().startsWith("application/pdf")) throw invalido();
    if (bytes.length > TAMANO_MAXIMO_DOCUMENTO) throw new FalloApi("respuesta_invalida", "El documento es demasiado grande.", { estado: c.estado });
    // «%PDF-»
    if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) throw invalido();
    return bytes;
  }

  private validar<T>(c: Crudo, esquema: ZodType<T>): T {
    const valido = esquema.safeParse(c.json);
    if (!valido.success) throw new FalloApi("respuesta_invalida", "La respuesta del servidor no es la esperada.", { estado: c.estado });
    return valido.data;
  }

  private async solicitar(metodo: string, ruta: string, cuerpo: unknown, o: OpcionesSolicitud, binario: boolean): Promise<Crudo> {
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
      const cabeceras: Record<string, string> = { Accept: binario ? "application/pdf" : "application/json" };
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

      // Un documento correcto se lee como bytes; cualquier otra respuesta (incluidos los errores) es texto JSON.
      const comoBytes = binario && r.ok;
      let texto = "";
      let bytes: Uint8Array | null = null;
      try {
        if (comoBytes) bytes = new Uint8Array(await r.arrayBuffer());
        else texto = await r.text();
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
        const e = EsquemaRespuestaErrorCliente.safeParse(json);
        const codigo = e.success ? e.data.error.codigo : undefined;
        const tipo = clasificar(r.status, codigo);
        const reintento = Number(r.headers.get("retry-after"));
        const campos = e.success ? extraerCampos(e.data.error) : undefined;
        const panelUrl = e.success && tipo === "cuenta_interna" ? e.data.error.panelUrl : undefined;
        const fallo = new FalloApi(tipo, e.success ? e.data.error.mensaje : `Error ${r.status} del servidor.`, {
          estado: r.status,
          ...(codigo ? { codigo } : {}),
          ...(Number.isFinite(reintento) && reintento > 0 ? { reintentarEnSegundos: reintento } : {}),
          ...(campos ? { campos } : {}),
          ...(panelUrl ? { panelUrl } : {}),
        });
        if (token && (tipo === "sesion" || tipo === "cambio_contrasena" || tipo === "sin_permiso")) this.opciones.alFalloDeSesion?.(fallo);
        throw fallo;
      }

      return { estado: r.status, json, bytes, tipoContenido: r.headers.get("content-type") ?? "" };
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
