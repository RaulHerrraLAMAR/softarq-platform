/**
 * La preparación de las pruebas de integración vacía el esquema de la base de destino.
 * Estas pruebas (sin base de datos) garantizan que solo acepta softarq_test en localhost.
 */
import { afterEach, describe, expect, it } from "vitest";
import { urlDePrueba } from "../entorno.js";

const original = { ...process.env };
afterEach(() => {
  for (const v of ["DATABASE_URL", "MIGRATION_DATABASE_URL"] as const) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
});

const url = (base: string, host = "localhost") => `postgresql://usuario:clave@${host}:5432/${base}`;

describe("protección de destino de las pruebas de integración", () => {
  it.each([
    ["softarq_dev", "localhost"],
    ["softarq_shadow", "localhost"],
    ["postgres", "localhost"],
    ["softarq_test_copia", "localhost"],
    ["softarq_test", "servidor.remoto.ejemplo"],
    ["softarq_test", "192.168.1.20"],
  ])("rechaza %s en %s", (base, host) => {
    process.env["MIGRATION_DATABASE_URL"] = url(base, host);
    expect(() => urlDePrueba("MIGRATION_DATABASE_URL")).toThrow(/solo pueden usar softarq_test/);
  });

  it("rechaza una variable ausente", () => {
    delete process.env["DATABASE_URL"];
    expect(() => urlDePrueba("DATABASE_URL")).toThrow(/Falta DATABASE_URL/);
  });

  it.each(["localhost", "127.0.0.1"])("acepta softarq_test en %s", (host) => {
    process.env["DATABASE_URL"] = url("softarq_test", host);
    expect(urlDePrueba("DATABASE_URL")).toBe(url("softarq_test", host));
  });
});
