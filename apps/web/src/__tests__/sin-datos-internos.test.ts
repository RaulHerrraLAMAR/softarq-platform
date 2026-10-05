import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return n === "__tests__" || n === "pruebas" ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(n) ? [ruta] : [];
  });
}

describe("la web no contiene fórmulas ni costos internos", () => {
  // Campos internos del motor (EntradaCalculo / ResultadoCalculado) que nunca deben llegar al cliente.
  const PROHIBIDO = /costo|consumo|rendimiento|desperdicio|margen|recargo|tarifa|traslape|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;

  // Excepción explícita y acotada (módulo 10, ADR-0014): la carpeta `excepciones/` muestra, con su
  // contrato interno y su capacidad propia, el rendimiento y el desperdicio que se exceptúan. Ahí siguen
  // prohibidos costos, consumos, márgenes, recargos, tarifas, traslapes y sobrantes.
  const PROHIBIDO_EN_EXCEPCIONES = /costo|consumo|margen|recargo|tarifa|traslape|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;
  const enExcepciones = (archivo: string) => relative(SRC, archivo).split(/[\\/]/)[0] === "excepciones";

  it.each(archivos(SRC).map((a) => [relative(SRC, a), a]))("%s", (_nombre, archivo) => {
    const lineas = readFileSync(archivo, "utf-8")
      .split("\n")
      // Los textos de interfaz pueden mencionar «costos adicionales» (partidas ADICIONAL del contrato).
      .filter((l) => !/costos? adicional|Costo adicional|costo que usted captura/i.test(l));
    const patron = enExcepciones(archivo) ? PROHIBIDO_EN_EXCEPCIONES : PROHIBIDO;
    expect(lineas.filter((l) => patron.test(l))).toEqual([]);
  });

  it("la excepción del módulo 10 cubre solo la carpeta excepciones/ y sus tres archivos", () => {
    const cubiertos = archivos(SRC)
      .filter(enExcepciones)
      .map((a) => relative(SRC, a).split(/[\\/]/).join("/"));
    expect(cubiertos.sort()).toEqual(["excepciones/PanelExcepcionesVersion.tsx", "excepciones/SeccionExcepciones.tsx", "excepciones/modelo.ts"]);
  });

  it("no hay HTML interpretado", () => {
    for (const a of archivos(SRC)) expect(readFileSync(a, "utf-8")).not.toContain("dangerouslySetInnerHTML");
  });
});
