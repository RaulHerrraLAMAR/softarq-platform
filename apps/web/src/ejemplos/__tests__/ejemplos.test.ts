import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EsquemaSolicitudCalculoDemo } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { EJEMPLOS } from "../ejemplos.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "..", "docs", "api", "ejemplos");

describe("ejemplos de la web", () => {
  it("son los cuatro escenarios verificados", () => {
    expect(EJEMPLOS.map((e) => e.archivo)).toEqual([
      "calculo-r1-faldones-10m.json",
      "calculo-r2-espesor-012.json",
      "calculo-r3-sin-ventana.json",
      "calculo-propia-con-00001.json",
    ]);
  });

  it.each(EJEMPLOS.map((e) => [e.archivo, e] as const))("%s coincide con docs/api/ejemplos y cumple el contrato", (archivo, e) => {
    const documentado: unknown = JSON.parse(readFileSync(join(CARPETA, archivo), "utf-8"));
    expect(e.solicitud).toEqual(documentado);
    expect(EsquemaSolicitudCalculoDemo.safeParse(e.solicitud).success).toBe(true);
  });

  it("no contienen totales ni importes calculados", () => {
    const texto = JSON.stringify(EJEMPLOS.map((e) => e.solicitud));
    for (const total of ["54190.68", "43312.16", "22405.28", "4911.79"]) expect(texto).not.toContain(total);
    expect(texto).not.toMatch(/total|subtotal|importe|precioUnitario|costo/i);
  });
});
