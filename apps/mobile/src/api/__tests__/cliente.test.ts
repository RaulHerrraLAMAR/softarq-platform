import { EsquemaRespuestaSesionMovil } from "@softarq/contracts/cliente";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { crearFetchFalso, errorApi, sesionDe, CAPACIDADES_CLIENTE, TOKEN_A } from "../../pruebas/ayudas";
import { ClienteApi, TAMANO_MAXIMO_DOCUMENTO } from "../cliente";
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
    await cliente.obtener("/api/v1/cliente/solicitudes", Eco, { query: { buscar: "Casa", vacio: "", nada: undefined } });
    const p = peticiones[0]!;
    expect(p.url.toString()).toBe("http://localhost:3000/api/v1/cliente/solicitudes?buscar=Casa");
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
    const sesion = montar(() => ({ estado: 200, cuerpo: { ...sesionDe(["CLIENTE"], CAPACIDADES_CLIENTE), campoNuevo: 1 } }));
    await expect(sesion.cliente.obtener("/x", EsquemaRespuestaSesionMovil)).rejects.toMatchObject({ tipo: "respuesta_invalida" });
  });

  it("PUT y POST envían JSON con la sesión; la respuesta se valida con el esquema", async () => {
    const { cliente, peticiones } = montar(() => ({ estado: 200, cuerpo: { ok: true } }));
    await cliente.enviar("PUT", "/api/v1/cliente/solicitudes/abc", { revision: 3, captura: { trabajos: [], notas: null } }, Eco);
    const p = peticiones[0]!;
    expect(p.metodo).toBe("PUT");
    expect(p.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_A}`);
    expect(p.cuerpo).toEqual({ revision: 3, captura: { trabajos: [], notas: null } });
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
    [403, "CUENTA_INTERNA_USE_PANEL", "cuenta_interna"],
    [409, "CONFLICTO_EDICION", "conflicto"],
    [409, "SOLICITUD_NO_EDITABLE", "conflicto"],
    [409, "ESTADO_SOLICITUD_NO_PERMITE", "conflicto"],
    [422, "SOLICITUD_INCOMPLETA", "invalido"],
    [422, "VALOR_INVALIDO", "invalido"],
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

  it("conserva la dirección del panel cuando una cuenta del equipo intenta entrar a la app", async () => {
    const { cliente } = montar(() => ({ estado: 403, cuerpo: errorApi("CUENTA_INTERNA_USE_PANEL", "Esta aplicación es para clientes.", { panelUrl: "http://localhost:5173" }) }), { token: null });
    const e = (await cliente.enviar("POST", "/api/v1/auth/movil/sesion", {}, Eco, { conToken: false }).catch((x: unknown) => x)) as FalloApi;
    expect(e).toMatchObject({ tipo: "cuenta_interna", detalle: { estado: 403, codigo: "CUENTA_INTERNA_USE_PANEL", panelUrl: "http://localhost:5173" } });
    expect(mensajeDeFallo(e)).toContain("equipo de SoftArq");
  });

  it("un conflicto de edición no cierra la sesión ni se confunde con un permiso retirado", async () => {
    const vistos: string[] = [];
    const { cliente } = montar(() => ({ estado: 409, cuerpo: errorApi("CONFLICTO_EDICION", "Hay cambios más recientes en tu solicitud; vuelve a abrirla.") }), { alFalloDeSesion: (f) => vistos.push(f.tipo) });
    const e = (await cliente.enviar("PUT", "/x", {}, Eco).catch((x: unknown) => x)) as FalloApi;
    expect(e.tipo).toBe("conflicto");
    expect(mensajeDeFallo(e)).toBe("Hay cambios más recientes en tu solicitud; vuelve a abrirla.");
    expect(vistos).toEqual([]);
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

describe("descarga de documentos", () => {
  const pdf = (n = 64) => {
    const b = new Uint8Array(n);
    b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    for (let i = 8; i < n; i++) b[i] = (i * 31) % 256;
    return b;
  };

  it("devuelve los mismos bytes, pide application/pdf y manda la sesión en la cabecera (nunca en la URL)", async () => {
    const original = pdf(2048);
    const { cliente, peticiones } = montar(() => ({ estado: 200, bytes: original }));
    const bytes = await cliente.descargar("/api/v1/cliente/cotizaciones/abc/documento");
    expect(Array.from(bytes)).toEqual(Array.from(original));
    const p = peticiones[0]!;
    expect(p.cabeceras["Accept"]).toBe("application/pdf");
    expect(p.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_A}`);
    expect(p.url.toString()).not.toContain(TOKEN_A);
    expect(p.credenciales).toBe("omit");
  });

  it("rechaza lo que no es un PDF: otro tipo de contenido, sin la firma %PDF- o vacío", async () => {
    const otroTipo = montar(() => ({ estado: 200, bytes: pdf(), cabeceras: { "content-type": "text/html" } }));
    await expect(otroTipo.cliente.descargar("/x")).rejects.toMatchObject({ tipo: "respuesta_invalida" });
    const sinFirma = montar(() => ({ estado: 200, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }));
    await expect(sinFirma.cliente.descargar("/x")).rejects.toMatchObject({ tipo: "respuesta_invalida" });
    const vacio = montar(() => ({ estado: 200, bytes: new Uint8Array() }));
    await expect(vacio.cliente.descargar("/x")).rejects.toMatchObject({ tipo: "respuesta_invalida" });
  });

  it("rechaza un documento mayor al tope", async () => {
    const { cliente } = montar(() => ({ estado: 200, bytes: pdf(TAMANO_MAXIMO_DOCUMENTO + 1) }));
    await expect(cliente.descargar("/x")).rejects.toMatchObject({ tipo: "respuesta_invalida", message: "El documento es demasiado grande." });
  });

  it("un error de la API en la descarga se clasifica como cualquier otro, y una sesión vencida avisa a la sesión", async () => {
    const vistos: string[] = [];
    const a = montar(() => ({ estado: 404, cuerpo: errorApi("NO_ENCONTRADO") }));
    await expect(a.cliente.descargar("/x")).rejects.toMatchObject({ tipo: "no_encontrado" });
    const b = montar(() => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") }), { alFalloDeSesion: (f) => vistos.push(f.tipo) });
    await expect(b.cliente.descargar("/x")).rejects.toMatchObject({ tipo: "sesion" });
    expect(vistos).toEqual(["sesion"]);
  });

  it("cancelarTodo descarta una descarga que ya venía en camino", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    const { cliente } = montar(() => ({ estado: 200, bytes: pdf(), espera }));
    const p = cliente.descargar("/x").catch((x: unknown) => x);
    cliente.cancelarTodo();
    soltar();
    expect(await p).toMatchObject({ tipo: "cancelada" });
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
