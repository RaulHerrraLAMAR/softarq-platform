import { describe, expect, it } from "vitest";
import { URL_API_POR_OMISION, validarUrlApi } from "../url-api.ts";

describe("VITE_API_URL", () => {
  it("por omisión usa la API local", () => {
    expect(validarUrlApi(undefined)).toEqual({ ok: true, url: URL_API_POR_OMISION });
  });

  it("acepta loopback con puerto", () => {
    expect(validarUrlApi("http://localhost:3101")).toEqual({ ok: true, url: "http://localhost:3101" });
    expect(validarUrlApi("http://127.0.0.1:3000/")).toEqual({ ok: true, url: "http://127.0.0.1:3000" });
  });

  it.each([
    ["http://192.168.1.10:3000", "127.0.0.1 o localhost"],
    ["https://127.0.0.1:3000", "http"],
    ["http://usuario:clave@127.0.0.1:3000", "credenciales"],
    ["http://127.0.0.1:3000/api", "sin ruta"],
    ["http://127.0.0.1", "puerto"],
    ["no es url", "URL válida"],
  ])("rechaza %s", (valor, motivo) => {
    const r = validarUrlApi(valor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain(motivo);
  });
});
