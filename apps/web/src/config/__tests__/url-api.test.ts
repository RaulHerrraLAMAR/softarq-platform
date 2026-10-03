import { describe, expect, it } from "vitest";
import { URL_API_POR_OMISION, validarUrlApi } from "../url-api.ts";

describe("VITE_API_URL", () => {
  it("por omisión usa la API local en localhost", () => {
    expect(URL_API_POR_OMISION).toBe("http://localhost:3000");
    expect(validarUrlApi(undefined)).toEqual({ ok: true, url: URL_API_POR_OMISION });
  });

  it("acepta localhost con puerto", () => {
    expect(validarUrlApi("http://localhost:3101")).toEqual({ ok: true, url: "http://localhost:3101" });
    expect(validarUrlApi("http://localhost:3000/")).toEqual({ ok: true, url: "http://localhost:3000" });
  });

  // Módulo 5 (ADR-0007): 127.0.0.1 deja de admitirse; la web está en localhost y la cookie de
  // sesión SameSite=Strict solo viaja si la API es del mismo site.
  it.each([
    ["http://127.0.0.1:3000", "localhost"],
    ["http://192.168.1.10:3000", "localhost"],
    ["https://localhost:3000", "http"],
    ["http://usuario:clave@localhost:3000", "credenciales"],
    ["http://localhost:3000/api", "sin ruta"],
    ["http://localhost", "puerto"],
    ["no es url", "URL válida"],
  ])("rechaza %s", (valor, motivo) => {
    const r = validarUrlApi(valor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain(motivo);
  });
});
