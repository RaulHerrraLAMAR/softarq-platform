import { describe, expect, it } from "vitest";
import { ErrorConfiguracion, URL_API_POR_OMISION, validarUrlApi } from "../api";

describe("URL de la API (ADR-0020)", () => {
  it("sin valor usa http://localhost:3000", () => {
    expect(validarUrlApi(undefined)).toBe(URL_API_POR_OMISION);
    expect(validarUrlApi("  ")).toBe("http://localhost:3000");
  });

  it.each([
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://localhost:3000/", "http://localhost:3000"],
    ["http://127.0.0.1:3100", "http://127.0.0.1:3100"],
    ["https://api.softarq.example", "https://api.softarq.example"],
  ])("acepta %s", (entrada, esperado) => {
    expect(validarUrlApi(entrada)).toBe(esperado);
  });

  it.each([
    "no es una url",
    "http://localhost", // sin puerto
    "http://192.168.1.20:3000", // una IP de la red: no se acepta por accidente
    "http://10.0.2.2:3000",
    "http://api.softarq.example:3000", // http hacia un host remoto
    "http://localhost.evil.example:3000",
    "ftp://localhost:3000",
    "http://usuario:clave@localhost:3000",
    "http://localhost:3000/api/v1",
    "http://localhost:3000?x=1",
    "http://localhost:3000#frag",
  ])("rechaza %s", (entrada) => {
    expect(() => validarUrlApi(entrada)).toThrow(ErrorConfiguracion);
  });
});
