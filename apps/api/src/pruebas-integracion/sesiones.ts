/**
 * Apoyo de las pruebas HTTP con sesión (ADR-0007). Sin atajos: cada cliente recorre el mismo
 * flujo que el navegador (GET /auth/csrf → POST /auth/sesion con Origin, cookie y X-CSRF-Token)
 * contra la API real y usuarios creados en softarq_test con el rol migrador.
 */
import { CABECERA_CSRF } from "@softarq/contracts";
import type { FuncionUsuario } from "@softarq/contracts";
import type { CuentaDemo } from "../modules/autenticacion/demo/cargar-usuarios-demo.js";
import { cargarUsuariosDemo } from "../modules/autenticacion/demo/cargar-usuarios-demo.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { crearPrisma, type ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { confirmarBase, urlDePrueba } from "./entorno.js";

export const ORIGEN_PERMITIDO = "http://localhost:5173";
export const NOMBRE_COOKIE = "softarq_sesion";

/** Cliente con el rol migrador sobre softarq_test (para crear y modificar cuentas en las pruebas). */
export async function prismaMigrador(): Promise<ClientePrisma> {
  const p = crearPrisma(urlDePrueba("MIGRATION_DATABASE_URL"));
  await confirmarBase(p);
  return p;
}

export interface Credencial {
  readonly correo: string;
  readonly contrasena: string;
}

/**
 * Crea (o conserva) cuentas DEMO de una organización DEMO de prueba y devuelve sus contraseñas
 * generadas. Usa el mismo cargador que `db:cargar-usuarios-demo`.
 */
export async function crearCuentas(
  migrador: ClientePrisma,
  organizacion: string,
  cuentas: readonly CuentaDemo[],
): Promise<Record<string, Credencial>> {
  const r = await cargarUsuariosDemo(migrador, new ServicioContrasenas(), { organizacion, cuentas });
  if (r.conservadas.length > 0) throw new Error(`Las cuentas ya existían: ${r.conservadas.join(", ")}`);
  return Object.fromEntries(r.creadas.map((c) => [c.correo, { correo: c.correo, contrasena: c.contrasena }]));
}

export const cuenta = (correo: string, nombre: string, ...funciones: FuncionUsuario[]): CuentaDemo => ({
  correo,
  nombre,
  funciones,
});

export interface Respuesta {
  status: number;
  headers: Headers;
  texto: string;
  cuerpo: any;
  setCookie: string[];
}

export interface OpcionesSolicitud {
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
  /** Por omisión se envía `Origin` permitido en los métodos con efectos (como el navegador). */
  origen?: string | null;
  /** Por omisión se envía el token CSRF guardado en los métodos con efectos. */
  csrf?: string | null;
  /** Por omisión se envía la cookie guardada. */
  cookie?: string | null;
}

/**
 * Cliente del canal móvil (módulo 16, ADR-0020): como la app, sin cookie, sin `Origin` y sin CSRF;
 * la sesión viaja como `Authorization: Bearer`. `token` puede fijarse para probar tokens ajenos.
 */
export class ClienteMovil {
  token: string | null = null;

  constructor(readonly url: string) {}

  async solicitar(metodo: string, ruta: string, o: { cuerpo?: unknown; cabeceras?: Record<string, string>; token?: string | null } = {}): Promise<Respuesta> {
    const cabeceras: Record<string, string> = { ...(o.cabeceras ?? {}) };
    const token = o.token === undefined ? this.token : o.token;
    if (token) cabeceras["Authorization"] = `Bearer ${token}`;
    if (o.cuerpo !== undefined && !("Content-Type" in cabeceras)) cabeceras["Content-Type"] = "application/json";
    const r = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      ...(o.cuerpo !== undefined ? { body: typeof o.cuerpo === "string" ? o.cuerpo : JSON.stringify(o.cuerpo) } : {}),
    });
    const texto = await r.text();
    let cuerpo: any = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = texto;
    }
    return { status: r.status, headers: r.headers, texto, cuerpo, setCookie: r.headers.getSetCookie() };
  }

  get(ruta: string, o: { cabeceras?: Record<string, string>; token?: string | null } = {}) {
    return this.solicitar("GET", ruta, o);
  }
  post(ruta: string, cuerpo: unknown, o: { cabeceras?: Record<string, string>; token?: string | null } = {}) {
    return this.solicitar("POST", ruta, { ...o, cuerpo });
  }
  delete(ruta: string, o: { cabeceras?: Record<string, string>; token?: string | null } = {}) {
    return this.solicitar("DELETE", ruta, o);
  }

  /** `POST /auth/movil/sesion`; si es correcto, guarda el token. No lanza. */
  async iniciarSesion(c: Credencial, cabeceras: Record<string, string> = {}): Promise<Respuesta> {
    const r = await this.post("/api/v1/auth/movil/sesion", { correo: c.correo, contrasena: c.contrasena }, { cabeceras, token: null });
    if (r.status === 200) this.token = r.cuerpo.tokenSesion;
    return r;
  }

  /** Como `iniciarSesion`, pero exige el éxito. */
  async entrar(c: Credencial): Promise<this> {
    const r = await this.iniciarSesion(c);
    if (r.status !== 200) throw new Error(`Acceso móvil fallido (${r.status}): ${r.texto}`);
    return this;
  }
}

/** Cliente HTTP que conserva la cookie de sesión y el token CSRF, como el navegador. */
export class ClienteHttp {
  cookie: string | null = null;
  csrf: string | null = null;

  constructor(readonly url: string) {}

  async solicitar(metodo: string, ruta: string, o: OpcionesSolicitud = {}): Promise<Respuesta> {
    const conEfectos = metodo !== "GET" && metodo !== "OPTIONS";
    const cabeceras: Record<string, string> = { ...(o.cabeceras ?? {}) };
    const cookie = o.cookie === undefined ? this.cookie : o.cookie;
    if (cookie) cabeceras["Cookie"] = `${NOMBRE_COOKIE}=${cookie}`;
    if (conEfectos) {
      const origen = o.origen === undefined ? ORIGEN_PERMITIDO : o.origen;
      if (origen) cabeceras["Origin"] = origen;
      const csrf = o.csrf === undefined ? this.csrf : o.csrf;
      if (csrf) cabeceras[CABECERA_CSRF] = csrf;
    }
    if (o.cuerpo !== undefined && !("Content-Type" in cabeceras)) cabeceras["Content-Type"] = "application/json";
    const r = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      ...(o.cuerpo !== undefined ? { body: typeof o.cuerpo === "string" ? o.cuerpo : JSON.stringify(o.cuerpo) } : {}),
    });
    const texto = await r.text();
    const setCookie = r.headers.getSetCookie();
    this.recordarCookie(setCookie);
    let cuerpo: any = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = texto;
    }
    return { status: r.status, headers: r.headers, texto, cuerpo, setCookie };
  }

  get(ruta: string, o?: OpcionesSolicitud) {
    return this.solicitar("GET", ruta, o);
  }
  post(ruta: string, cuerpo: unknown, o: OpcionesSolicitud = {}) {
    return this.solicitar("POST", ruta, { ...o, cuerpo });
  }
  put(ruta: string, cuerpo: unknown, o: OpcionesSolicitud = {}) {
    return this.solicitar("PUT", ruta, { ...o, cuerpo });
  }
  patch(ruta: string, cuerpo: unknown, o: OpcionesSolicitud = {}) {
    return this.solicitar("PATCH", ruta, { ...o, cuerpo });
  }
  delete(ruta: string, o?: OpcionesSolicitud) {
    return this.solicitar("DELETE", ruta, o);
  }

  /** Obtiene la sesión previa y su token CSRF. */
  async prepararAcceso(): Promise<Respuesta> {
    const r = await this.get("/api/v1/auth/csrf");
    if (r.status === 200) this.csrf = r.cuerpo.csrfToken;
    return r;
  }

  /** Flujo completo de acceso; no lanza: devuelve la respuesta del POST. */
  async iniciarSesion(c: Credencial): Promise<Respuesta> {
    await this.prepararAcceso();
    const r = await this.post("/api/v1/auth/sesion", { correo: c.correo, contrasena: c.contrasena });
    if (r.status === 200) this.csrf = r.cuerpo.csrfToken;
    return r;
  }

  /** Como `iniciarSesion`, pero exige el éxito. */
  async entrar(c: Credencial): Promise<this> {
    const r = await this.iniciarSesion(c);
    if (r.status !== 200) throw new Error(`Acceso fallido (${r.status}): ${r.texto}`);
    return this;
  }

  private recordarCookie(setCookie: string[]): void {
    const propia = setCookie.find((c) => c.startsWith(`${NOMBRE_COOKIE}=`));
    if (!propia) return;
    const valor = propia.slice(NOMBRE_COOKIE.length + 1).split(";")[0] ?? "";
    this.cookie = /max-age=0/i.test(propia) || valor === "" ? null : valor;
  }
}
