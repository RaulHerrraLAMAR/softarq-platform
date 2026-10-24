/**
 * Apoyo de las pruebas (Node): un `fetch` falso que registra lo que la app envía, y datos válidos según
 * los contratos. No es código de la app.
 */
import { CAPACIDADES, type Capacidad, type FuncionUsuario, type RespuestaAccesoMovil, type RespuestaSesionMovil } from "@softarq/contracts/movil";

export interface Peticion {
  metodo: string;
  url: URL;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
  credenciales: RequestCredentials | undefined;
}

export interface RespuestaFalsa {
  estado: number;
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
  /** Hasta que se resuelva, la respuesta no llega (para probar respuestas tardías). */
  espera?: Promise<void>;
}

export type Manejador = (p: Peticion) => RespuestaFalsa | Promise<RespuestaFalsa>;

export function crearFetchFalso(manejador: Manejador) {
  const peticiones: Peticion[] = [];
  const fetchFalso = (async (entrada: unknown, init?: RequestInit) => {
    const cabeceras = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const p: Peticion = {
      metodo: init?.method ?? "GET",
      url: new URL(String(entrada)),
      cabeceras,
      cuerpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      credenciales: init?.credentials,
    };
    peticiones.push(p);
    const senal = init?.signal ?? undefined;
    const abortada = () => new DOMException("Aborted", "AbortError");
    if (senal?.aborted) throw abortada();
    const r = await manejador(p);
    if (senal?.aborted) throw abortada();
    if (r.espera) {
      await new Promise<void>((resolver, rechazar) => {
        senal?.addEventListener("abort", () => rechazar(abortada()));
        void r.espera!.then(resolver);
      });
    }
    if (senal?.aborted) throw abortada();
    const texto = r.cuerpo === undefined ? "" : JSON.stringify(r.cuerpo);
    return new Response(r.estado === 204 ? null : texto, { status: r.estado, headers: { "content-type": "application/json", ...(r.cabeceras ?? {}) } });
  }) as unknown as typeof fetch;
  return { fetch: fetchFalso, peticiones };
}

export const TOKEN_A = "A".repeat(43);
export const TOKEN_B = "B".repeat(43);

export function sesionDe(funciones: FuncionUsuario[], capacidades: Capacidad[], extra: Partial<RespuestaSesionMovil> = {}): RespuestaSesionMovil {
  return {
    usuario: { nombre: "[DEMO] Persona", correo: "persona@softarq.test" },
    organizacion: { codigo: "DEMO", nombre: "[DEMO] Organización", esDemo: true },
    funciones,
    capacidades,
    expiraEn: "2026-10-24T20:00:00.000Z",
    inactividadMinutos: 30,
    cambioContrasenaRequerido: false,
    ...extra,
  };
}

export const CAPACIDADES_CONSULTA: Capacidad[] = ["sesion.propia", "clientes.consultar", "cotizaciones.consultar"];

export function accesoDe(token: string, extra: Partial<RespuestaSesionMovil> = {}): RespuestaAccesoMovil {
  return { ...sesionDe(["PREPARADOR"], CAPACIDADES_CONSULTA, extra), tokenSesion: token };
}

export const errorApi = (codigo: string, mensaje = "Mensaje de la API.", extra: Record<string, unknown> = {}) => ({
  error: { codigo, mensaje, solicitudId: "sol-1", ...extra },
});

/** Todas las capacidades del contrato (para comprobar que la navegación no inventa permisos). */
export const TODAS_LAS_CAPACIDADES = [...CAPACIDADES] as Capacidad[];
