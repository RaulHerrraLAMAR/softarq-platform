import { EsquemaRespuestaSesionMovil } from "@softarq/contracts/movil";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { crearFetchFalso, errorApi, sesionDe, CAPACIDADES_CONSULTA, TOKEN_A } from "../../pruebas/ayudas";
import { ClienteApi } from "../cliente";
import { FalloApi, mensajeDeFallo } from "../errores";

const BASE = "http://localhost:3000";
const Eco = z.strictObject({ ok: z.literal(true) });

function montar(manejador: Parameters<typeof crearFetchFalso>[0], extra: { token?: string | null; tiempoMaximoMs?: number; alFalloDeSesion?: (f: FalloApi) => void } = {}) {
  const { fetch, peticiones } = crearFetchFalso(manejador);
  const cliente = new ClienteApi({
    baseUrl: BASE,
    fetch,
    token: () => (extra.token === undefined ? TOKEN_A : extra.token),
    ...(extra.tiempoMaximoMs ? { tiempoMaximoMs: extra.tiempoMaximoMs } : {}),
    ...(extra.alFalloDeSesion ? { alFalloDeSesion: extra.alFalloDeSesion } : {}),
  });
  return { cliente, peticiones };
}

afterEach(() => vi.useRealTimers());

describe("solicitudes", () => {
  it("envía Authorization: Bearer, sin cookies ni Origin ni CSRF, y construye la consulta sin valores vacíos", async () => {
    const { cliente, peticiones } = montar(() => ({ estado: 200, cuerpo: { ok: true } }));
    await cliente.obtener("/api/v1/clientes", Eco, { query: { buscar: "Casa", vacio: "", nada: undefined } });
    const p = peticiones[0]!;
    expect(p.url.toString()).toBe("http://localhost:3000/api/v1/clientes?buscar=Casa");
    expect(p.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_A}`);
    expect(p.credenciales).toBe("omit");
    const nombres = Object.keys(p.cabeceras).map((k) => k.toLowerCase());
    expect(nombres).not.toEqual(expect.arrayContaining(["cookie"]));
    expect(nombres).not.toEqual(expect.arrayContaining(["origin"]));
    expect(nombres).not.toEqual(expect.arrayContaining(["x-csrf-token"]));
  });

  it("sin token (inicio de sesión) no envía Authorization; con cuerpo envía JSON", async () => {
    const { cliente, peticiones } = montar(() => ({ estado: 200, cuerpo: { ok: true } }), { token: TOKEN_A });
    await cliente.enviar("POST", "/api/v1/auth/movil/sesion", { correo: "a@b.test", contrasena: "x" }, Eco, { conToken: false });
    expect(peticiones[0]!.cabeceras["Authorization"]).toBeUndefined();
    expect(peticiones[0]!.cabeceras["Content-Type"]).toBe("application/json");
    expect(peticiones[0]!.cuerpo).toEqual({ correo: "a@b.test", contrasena: "x" });
  });

  it("valida la respuesta con el contrato: si no coincide, respuesta_invalida", async () => {
    const { cliente } = montar(() => ({ estado: 200, cuerpo: { ok: false } }));
    await expect(cliente.obtener("/x", Eco)).rejects.toMatchObject({ tipo: "respuesta_invalida" });
    const sesion = montar(() => ({ estado: 200, cuerpo: { ...sesionDe(["PREPARADOR"], CAPACIDADES_CONSULTA), campoNuevo: 1 } }));
    await expect(sesion.cliente.obtener("/x", EsquemaRespuestaSesionMovil)).rejects.toMatchObject({ tipo: "respuesta_invalida" });
  });

  it("204 sin esquema devuelve undefined", async () => {
    const { cliente } = montar(() => ({ estado: 204 }));
    await expect(cliente.enviar("DELETE", "/api/v1/auth/sesion", undefined, null)).resolves.toBeUndefined();
  });
});

describe("clasificación de fallos (la API decide)", () => {
  const casos: [number, string, string][] = [
    [401, "SESION_NO_VALIDA", "sesion"],
    [401, "NO_AUTENTICADO", "sesion"],
    [401, "CREDENCIALES_INVALIDAS", "credenciales"],
    [401, "CONTRASENA_TEMPORAL_CADUCADA", "temporal_caducada"],
    [403, "CAMBIO_CONTRASENA_REQUERIDO", "cambio_contrasena"],
    [403, "SIN_PERMISO", "sin_permiso"],
    [403, "RUTA_NO_DISPONIBLE_EN_MOVIL", "sin_permiso"],
    [403, "ACCESO_MOVIL_NO_PERMITIDO", "sin_permiso"],
    [404, "NO_ENCONTRADO", "no_encontrado"],
    [422, "CONTRASENA_ACTUAL_INCORRECTA", "invalido"],
    [400, "SOLICITUD_INVALIDA", "invalido"],
    [429, "DEMASIADAS_SOLICITUDES", "limite"],
    [500, "ERROR_INTERNO", "servidor"],
    [503, "SERVICIO_NO_DISPONIBLE", "servidor"],
  ];
  it.each(casos)("%s %s → %s", async (estado, codigo, tipo) => {
    const { cliente } = montar(() => ({ estado, cuerpo: errorApi(codigo), cabeceras: estado === 429 ? { "retry-after": "42" } : {} }));
    const e = await cliente.obtener("/x", Eco).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FalloApi);
    expect(e).toMatchObject({ tipo, detalle: { estado, codigo } });
    if (estado === 429) expect((e as FalloApi).detalle.reintentarEnSegundos).toBe(42);
  });

  it("un código que la app no conoce se clasifica por el estado HTTP (versiones distintas de app y API)", async () => {
    const { cliente } = montar(() => ({ estado: 403, cuerpo: errorApi("CODIGO_FUTURO") }));
    await expect(cliente.obtener("/x", Eco)).rejects.toMatchObject({ tipo: "sin_permiso" });
    const sinCuerpo = montar(() => ({ estado: 502 }));
    await expect(sinCuerpo.cliente.obtener("/x", Eco)).rejects.toMatchObject({ tipo: "servidor" });
  });

  it("conserva los campos de un 400/422 para mostrarlos junto al campo", async () => {
    const { cliente } = montar(() => ({ estado: 422, cuerpo: errorApi("CONTRASENA_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.", { campos: [{ ruta: "actual", mensaje: "No coincide." }] }) }));
    const e = (await cliente.obtener("/x", Eco).catch((x: unknown) => x)) as FalloApi;
    expect(e.detalle.campos).toEqual([{ ruta: "actual", mensaje: "No coincide." }]);
    expect(mensajeDeFallo(e)).toBe("La contraseña actual no es correcta.");
  });

  it("avisa a la sesión solo con token: sesion, cambio_contrasena y sin_permiso", async () => {
    const vistos: string[] = [];
    const a = montar(() => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") }), { alFalloDeSesion: (f) => vistos.push(f.tipo) });
    await a.cliente.obtener("/x", Eco).catch(() => {});
    const b = montar(() => ({ estado: 403, cuerpo: errorApi("CAMBIO_CONTRASENA_REQUERIDO") }), { alFalloDeSesion: (f) => vistos.push(f.tipo) });
    await b.cliente.obtener("/x", Eco).catch(() => {});
    const c = montar(() => ({ estado: 403, cuerpo: errorApi("SIN_PERMISO") }), { alFalloDeSesion: (f) => vistos.push(f.tipo) });
    await c.cliente.obtener("/x", Eco).catch(() => {});
    expect(vistos).toEqual(["sesion", "cambio_contrasena", "sin_permiso"]);
    // Sin token (inicio de sesión): un 401 son credenciales incorrectas, no una sesión perdida.
    const d = montar(() => ({ estado: 401, cuerpo: errorApi("CREDENCIALES_INVALIDAS") }), { token: null, alFalloDeSesion: (f) => vistos.push(f.tipo) });
    await d.cliente.enviar("POST", "/x", {}, Eco, { conToken: false }).catch(() => {});
    expect(vistos).toHaveLength(3);
  });

  it("los mensajes para la persona no incluyen el token ni datos de la respuesta", async () => {
    const { cliente } = montar(() => ({ estado: 500, cuerpo: { secreto: TOKEN_A } }));
    const e = (await cliente.obtener("/x", Eco).catch((x: unknown) => x)) as FalloApi;
    expect(`${e.message} ${mensajeDeFallo(e)}`).not.toContain(TOKEN_A);
  });
});

describe("red, tiempo y cancelación", () => {
  it("sin conexión: tipo red", async () => {
    const { cliente } = montar(() => {
      throw new TypeError("Network request failed");
    });
    await expect(cliente.obtener("/x", Eco)).rejects.toMatchObject({ tipo: "red" });
  });

  it("tiempo agotado: tipo red y la solicitud se aborta", async () => {
    vi.useFakeTimers();
    const { cliente } = montar(() => ({ estado: 200, cuerpo: { ok: true }, espera: new Promise(() => {}) }), { tiempoMaximoMs: 5_000 });
    const p = cliente.obtener("/x", Eco).catch((x: unknown) => x);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await p).toMatchObject({ tipo: "red", message: "El servidor tardó demasiado en responder." });
  });

  it("cancelarTodo descarta una respuesta que ya venía en camino (cambio de cuenta): nunca se entrega", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    const { cliente } = montar(() => ({ estado: 200, cuerpo: { ok: true }, espera }));
    const p = cliente.obtener("/x", Eco).catch((x: unknown) => x);
    cliente.cancelarTodo();
    soltar();
    expect(await p).toMatchObject({ tipo: "cancelada" });
  });

  it("una solicitud posterior a cancelarTodo funciona con normalidad", async () => {
    const { cliente } = montar(() => ({ estado: 200, cuerpo: { ok: true } }));
    cliente.cancelarTodo();
    await expect(cliente.obtener("/x", Eco)).resolves.toEqual({ ok: true });
  });

  it("la señal de la pantalla cancela la solicitud", async () => {
    const control = new AbortController();
    const { cliente } = montar(() => ({ estado: 200, cuerpo: { ok: true }, espera: new Promise(() => {}) }));
    const p = cliente.obtener("/x", Eco, { senal: control.signal }).catch((x: unknown) => x);
    control.abort();
    expect(await p).toMatchObject({ tipo: "cancelada" });
  });

  it("una respuesta con error de una generación anterior tampoco avisa a la sesión nueva", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    const vistos: string[] = [];
    const { cliente } = montar(() => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA"), espera }), { alFalloDeSesion: (f) => vistos.push(f.tipo) });
    const p = cliente.obtener("/x", Eco).catch((x: unknown) => x);
    cliente.cancelarTodo();
    soltar();
    expect(await p).toMatchObject({ tipo: "cancelada" });
    expect(vistos).toEqual([]);
  });
});

describe("registros", () => {
  it("no escribe nada en consola (ni cuerpos, ni cabeceras, ni el token)", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { cliente } = montar(() => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") }));
    await cliente.obtener("/x", Eco).catch(() => {});
    for (const e of espias) expect(e).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
