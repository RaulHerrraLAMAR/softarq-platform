import { EsquemaRespuestaCalculoDemo, EsquemaRespuestaSalud } from "@softarq/contracts";
import { describe, expect, it, vi } from "vitest";
import { RESPUESTA_CALCULADA } from "../../pruebas/datos.ts";
import { crearClienteApi, mensajeDeFallo, type FalloApi } from "../cliente.ts";

function respuesta(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json", ...cabeceras },
  });
}

const error = (codigo: string, extra: object = {}) => ({ error: { codigo, mensaje: "m", solicitudId: "id", ...extra } });

async function fallo(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): Promise<FalloApi> {
  const cliente = crearClienteApi("http://127.0.0.1:3000", async () => respuesta(estado, cuerpo, cabeceras));
  const r = await cliente.enviar("/api/v1/calculos/demo", EsquemaRespuestaCalculoDemo, { cuerpo: {} });
  if (r.ok) throw new Error("se esperaba un fallo");
  return r.fallo;
}

describe("cliente HTTP", () => {
  it("200 válido según el contrato", async () => {
    const f = vi.fn(async () => respuesta(200, RESPUESTA_CALCULADA));
    const cliente = crearClienteApi("http://127.0.0.1:3000", f);
    const r = await cliente.enviar("/api/v1/calculos/demo", EsquemaRespuestaCalculoDemo, { cuerpo: { a: 1 } });
    expect(r).toEqual({ ok: true, datos: RESPUESTA_CALCULADA });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3000/api/v1/calculos/demo");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.credentials).toBe("omit");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("200 con campos de más o de menos → incompatible (no se muestra)", async () => {
    expect(await fallo(200, { ...RESPUESTA_CALCULADA, costoDirecto: "1" })).toEqual({ tipo: "incompatible" });
    expect(await fallo(200, { estado: "CALCULADO" })).toEqual({ tipo: "incompatible" });
    expect(await fallo(200, "<html>")).toEqual({ tipo: "incompatible" });
  });

  it("400 con campos", async () => {
    expect(await fallo(400, error("SOLICITUD_INVALIDA", { campos: [{ ruta: "partidas[0].mediciones[0].piezas", mensaje: "x" }] }))).toEqual({
      tipo: "invalida",
      campos: [{ ruta: "partidas[0].mediciones[0].piezas", mensaje: "x" }],
    });
  });

  it("404, 422, 429, 503 y 500", async () => {
    expect(await fallo(404, error("NO_ENCONTRADO", { faltantes: [{ tipo: "precio", codigo: "PRE-1" }] }))).toEqual({
      tipo: "no_encontrado",
      faltantes: [{ tipo: "precio", codigo: "PRE-1" }],
    });
    expect(await fallo(422, error("CALCULO_BLOQUEADO", { problemas: [{ codigo: "BL-08", referencia: "INS-1", mensaje: "m" }] }))).toEqual({
      tipo: "bloqueado",
      problemas: [{ codigo: "BL-08", referencia: "INS-1", mensaje: "m" }],
    });
    expect(await fallo(429, error("DEMASIADAS_SOLICITUDES"), { "Retry-After": "42" })).toEqual({ tipo: "limite", reintentarEnSegundos: 42 });
    expect(await fallo(429, "", {})).toEqual({ tipo: "limite", reintentarEnSegundos: null });
    expect(await fallo(503, error("SERVICIO_NO_DISPONIBLE"))).toEqual({ tipo: "no_disponible" });
    expect(await fallo(500, error("ERROR_INTERNO"))).toEqual({ tipo: "error_servidor" });
    expect(await fallo(422, { otra: "cosa" })).toEqual({ tipo: "incompatible" });
  });

  it("red caída y cancelación", async () => {
    const caida = crearClienteApi("http://127.0.0.1:3000", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await caida.obtener("/health", EsquemaRespuestaSalud)).toEqual({ ok: false, fallo: { tipo: "red" } });

    const control = new AbortController();
    const lenta = crearClienteApi("http://127.0.0.1:3000", (_u, init) =>
      new Promise((_, rechazar) => init?.signal?.addEventListener("abort", () => rechazar(new DOMException("abortado", "AbortError")))),
    );
    const pendiente = lenta.obtener("/health", EsquemaRespuestaSalud, { signal: control.signal });
    control.abort();
    expect(await pendiente).toEqual({ ok: false, fallo: { tipo: "cancelado" } });
  });

  it("tiempo máximo agotado → red", async () => {
    const lenta = crearClienteApi("http://127.0.0.1:3000", (_u, init) =>
      new Promise((_, rechazar) => init?.signal?.addEventListener("abort", () => rechazar(new DOMException("tiempo", "TimeoutError")))),
    );
    expect(await lenta.obtener("/health", EsquemaRespuestaSalud, { tiempoMaximo: 10 })).toEqual({ ok: false, fallo: { tipo: "red" } });
  });

  it("los mensajes para el usuario no contienen detalles técnicos", () => {
    const fallos: FalloApi[] = [
      { tipo: "red" },
      { tipo: "no_disponible" },
      { tipo: "error_servidor" },
      { tipo: "incompatible" },
      { tipo: "limite", reintentarEnSegundos: 30 },
    ];
    for (const f of fallos) expect(mensajeDeFallo(f)).not.toMatch(/http|127\.0\.0\.1|fetch|json|500|503|stack/i);
  });
});
