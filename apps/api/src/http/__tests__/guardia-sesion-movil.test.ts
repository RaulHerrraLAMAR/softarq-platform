// Guardia de sesión: canal móvil (módulo 16, ADR-0020). Sin base de datos: el servicio es un doble.
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { Capacidad } from "@softarq/contracts";
import type { ContextoSesion, ServicioAutenticacion } from "../../modules/autenticacion/aplicacion/servicio-autenticacion.js";
import { ErrorApi } from "../errores.js";
import {
  AccesoMovil,
  ConSesionPrevia,
  GuardiaSesion,
  PermitidaConCambioPendiente,
  PermitidaEnMovil,
  Publico,
  Requiere,
  leerBearer,
} from "../guardia-sesion.js";

const ORIGEN_WEB = "http://localhost:5173";
const TOKEN_COOKIE = "C".repeat(43);
const TOKEN_MOVIL = "M".repeat(43);

const sesion = (extra: Partial<ContextoSesion> = {}): ContextoSesion => ({
  sesionId: "sesion-1",
  usuario: { id: "u1", nombre: "Persona", correo: "persona@softarq.test" },
  organizacion: { id: "o1", codigo: "DEMO", nombre: "Org", esDemo: true },
  funciones: ["PREPARADOR"],
  capacidades: ["sesion.propia", "clientes.consultar"],
  expiraEn: new Date("2030-01-01T00:00:00Z"),
  cambioContrasenaRequerido: false,
  ...extra,
});

function servicioDoble(opciones: { cookie?: ContextoSesion; movil?: ContextoSesion } = {}) {
  return {
    resolver: vi.fn(async (t: string | undefined) =>
      t === undefined ? { estado: "SIN_COOKIE" } : t === TOKEN_COOKIE && opciones.cookie ? { estado: "VIGENTE", sesion: opciones.cookie } : { estado: "NO_VALIDA", motivo: "DESCONOCIDA" },
    ),
    resolverMovil: vi.fn(async (t: string | undefined) =>
      t === TOKEN_MOVIL && opciones.movil ? { estado: "VIGENTE", sesion: opciones.movil } : { estado: "NO_VALIDA", motivo: "DESCONOCIDA" },
    ),
    resolverPrevia: vi.fn(async () => ({ estado: "NO_VALIDA", motivo: "DESCONOCIDA" })),
    csrfValido: vi.fn(() => true),
  };
}

/** Un handler con los metadatos de los decoradores, aplicados como lo hace Nest. */
function handler(...decoradores: ((t: object, k: string, d: PropertyDescriptor) => unknown)[]): () => void {
  const fn = function ruta() {};
  for (const d of decoradores) d({}, "ruta", { value: fn });
  return fn;
}
class ClaseVacia {}

async function evaluar(
  servicio: ReturnType<typeof servicioDoble>,
  ruta: () => void,
  req: { method?: string; headers?: Record<string, string> },
): Promise<{ ok: boolean; error?: ErrorApi; sesion?: unknown }> {
  const guardia = new GuardiaSesion(new Reflector(), servicio as unknown as ServicioAutenticacion, [ORIGEN_WEB], false);
  const res = { locals: {} as Record<string, unknown>, getHeader: () => undefined, setHeader: vi.fn() };
  const request = { method: req.method ?? "GET", headers: req.headers ?? {}, res } as never;
  const contexto = {
    getHandler: () => ruta,
    getClass: () => ClaseVacia,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => res }),
  } as unknown as ExecutionContext;
  try {
    await guardia.canActivate(contexto);
    return { ok: true, sesion: res.locals["sesion"] };
  } catch (e) {
    if (e instanceof ErrorApi) return { ok: false, error: e };
    throw e;
  }
}

const requiere = (...c: [Capacidad, ...Capacidad[]]) => Requiere(...c);

describe("leerBearer", () => {
  it.each([
    [undefined, undefined],
    ["Bearer abc_DEF-123", "abc_DEF-123"],
    ["bearer abc", null],
    ["Basic abc", null],
    ["Bearer ", null],
    ["Bearer a b", null],
    ["Bearer " + "x".repeat(129), null],
  ])("%s", (cabecera, esperado) => {
    const req = { headers: cabecera === undefined ? {} : { authorization: cabecera } } as never;
    expect(leerBearer(req)).toBe(esperado);
  });
});

describe("Bearer: lista blanca de rutas", () => {
  const rutaMarcada = handler(requiere("clientes.consultar"), PermitidaEnMovil());
  const rutaSinMarca = handler(requiere("clientes.consultar"));

  it("una sesión móvil vigente pasa por una ruta marcada, sin Origin ni CSRF", async () => {
    const s = servicioDoble({ movil: sesion() });
    const r = await evaluar(s, rutaMarcada, { headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(r.ok).toBe(true);
    expect(r.sesion).toMatchObject({ sesionId: "sesion-1" });
    expect(s.csrfValido).not.toHaveBeenCalled();
    expect(s.resolver).not.toHaveBeenCalled(); // la cookie web no participa
  });

  it("una ruta sin la marca responde 403 aunque el token sea válido y no resuelve la sesión", async () => {
    const s = servicioDoble({ movil: sesion() });
    const r = await evaluar(s, rutaSinMarca, { headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(r.error).toMatchObject({ estadoHttp: 403, codigo: "RUTA_NO_DISPONIBLE_EN_MOVIL" });
    expect(s.resolverMovil).not.toHaveBeenCalled();
  });

  it("una escritura sin marca tampoco pasa por Bearer (sin Origin ni CSRF no hay otra vía)", async () => {
    const r = await evaluar(servicioDoble({ movil: sesion() }), rutaSinMarca, { method: "POST", headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(r.error?.codigo).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
  });

  it("la capacidad sigue exigiéndose: sin ella, 403 SIN_PERMISO", async () => {
    const r = await evaluar(servicioDoble({ movil: sesion({ capacidades: ["sesion.propia"] }) }), rutaMarcada, { headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(r.error).toMatchObject({ estadoHttp: 403, codigo: "SIN_PERMISO" });
  });

  it("token desconocido, vencido o revocado: 401 SESION_NO_VALIDA", async () => {
    const r = await evaluar(servicioDoble(), rutaMarcada, { headers: { authorization: `Bearer ${"X".repeat(43)}` } });
    expect(r.error).toMatchObject({ estadoHttp: 401, codigo: "SESION_NO_VALIDA" });
  });

  it("cabecera Authorization que no es un Bearer válido: 401 NO_AUTENTICADO", async () => {
    const r = await evaluar(servicioDoble({ movil: sesion() }), rutaMarcada, { headers: { authorization: "Basic abc" } });
    expect(r.error).toMatchObject({ estadoHttp: 401, codigo: "NO_AUTENTICADO" });
  });

  it("un token de cookie web NO sirve como Bearer", async () => {
    const r = await evaluar(servicioDoble({ cookie: sesion() }), rutaMarcada, { headers: { authorization: `Bearer ${TOKEN_COOKIE}` } });
    expect(r.error?.codigo).toBe("SESION_NO_VALIDA");
  });

  it("con Bearer manda el Bearer: una cookie web válida no lo rescata ni se usa", async () => {
    const s = servicioDoble({ cookie: sesion() });
    const r = await evaluar(s, rutaMarcada, { headers: { authorization: `Bearer ${"Z".repeat(43)}`, cookie: `softarq_sesion=${TOKEN_COOKIE}` } });
    expect(r.error?.codigo).toBe("SESION_NO_VALIDA");
    expect(s.resolver).not.toHaveBeenCalled();
  });

  it("contraseña temporal pendiente: solo las rutas permitidas con cambio pendiente", async () => {
    const pendiente = sesion({ cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    const s = servicioDoble({ movil: pendiente });
    const normal = await evaluar(s, rutaMarcada, { headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(normal.error).toMatchObject({ estadoHttp: 403, codigo: "CAMBIO_CONTRASENA_REQUERIDO" });
    const cambio = handler(requiere("sesion.propia"), PermitidaConCambioPendiente(), PermitidaEnMovil());
    expect((await evaluar(s, cambio, { headers: { authorization: `Bearer ${TOKEN_MOVIL}` } })).ok).toBe(true);
  });

  it("el Bearer en una ruta de inicio de sesión web (sesión previa) responde 403", async () => {
    const r = await evaluar(servicioDoble({ movil: sesion() }), handler(ConSesionPrevia()), { method: "POST", headers: { authorization: `Bearer ${TOKEN_MOVIL}`, origin: ORIGEN_WEB } });
    expect(r.error?.codigo).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
  });

  it("las rutas públicas (salud, OpenAPI) no usan la sesión", async () => {
    const s = servicioDoble();
    const r = await evaluar(s, handler(Publico()), { headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(r.ok).toBe(true);
    expect(s.resolverMovil).not.toHaveBeenCalled();
  });
});

describe("cookie web: sin cambios", () => {
  const ruta = handler(requiere("clientes.consultar"), PermitidaEnMovil());

  it("una escritura con cookie sigue exigiendo Origin permitido y CSRF (también en rutas marcadas)", async () => {
    const s = servicioDoble({ cookie: sesion() });
    const sinOrigen = await evaluar(s, ruta, { method: "POST", headers: { cookie: `softarq_sesion=${TOKEN_COOKIE}` } });
    expect(sinOrigen.error?.codigo).toBe("ORIGEN_NO_PERMITIDO");
    s.csrfValido.mockReturnValueOnce(false);
    const sinCsrf = await evaluar(s, ruta, { method: "POST", headers: { cookie: `softarq_sesion=${TOKEN_COOKIE}`, origin: ORIGEN_WEB } });
    expect(sinCsrf.error?.codigo).toBe("CSRF_NO_VALIDO");
    expect((await evaluar(s, ruta, { method: "POST", headers: { cookie: `softarq_sesion=${TOKEN_COOKIE}`, origin: ORIGEN_WEB } })).ok).toBe(true);
  });

  it("un token móvil presentado como cookie no sirve (el servicio resuelve solo USUARIO)", async () => {
    const r = await evaluar(servicioDoble({ movil: sesion() }), ruta, { headers: { cookie: `softarq_sesion=${TOKEN_MOVIL}` } });
    expect(r.error?.codigo).toBe("SESION_NO_VALIDA");
  });

  it("sin cookie ni Bearer: 401 NO_AUTENTICADO", async () => {
    expect((await evaluar(servicioDoble(), ruta, {})).error).toMatchObject({ estadoHttp: 401, codigo: "NO_AUTENTICADO" });
  });
});

describe("inicio de sesión móvil (@AccesoMovil)", () => {
  const ruta = handler(AccesoMovil());

  it("pasa sin cookie, sin CSRF y sin Origin (cliente que no es un navegador)", async () => {
    const s = servicioDoble();
    expect((await evaluar(s, ruta, { method: "POST", headers: {} })).ok).toBe(true);
    expect(s.csrfValido).not.toHaveBeenCalled();
  });

  it("se rechaza si trae Origin (navegador), aunque sea el permitido", async () => {
    for (const origin of [ORIGEN_WEB, "https://sitio-ajeno.example"]) {
      const r = await evaluar(servicioDoble(), ruta, { method: "POST", headers: { origin } });
      expect(r.error).toMatchObject({ estadoHttp: 403, codigo: "ACCESO_MOVIL_NO_PERMITIDO" });
    }
  });

  it("se rechaza si trae Authorization", async () => {
    const r = await evaluar(servicioDoble(), ruta, { method: "POST", headers: { authorization: `Bearer ${TOKEN_MOVIL}` } });
    expect(r.error?.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
  });
});
