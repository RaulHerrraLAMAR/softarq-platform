// Pruebas unitarias de las guardas de la inicialización de softarq_dev (ADR-0012). Sin base de datos.
import { describe, expect, it } from "vitest";
import { ErrorRespaldo } from "../comun.mjs";
import { DESTINO_INICIALIZACION, compararMigraciones, exigirBaseVacia, migracionesDelRepositorio, validarConfirmacion } from "../inicializar-desarrollo.mjs";

describe("confirmación de la inicialización", () => {
  it("el destino es fijo: softarq_dev", () => {
    expect(DESTINO_INICIALIZACION).toBe("softarq_dev");
    expect(validarConfirmacion("softarq_dev")).toBe("softarq_dev");
  });
  it.each([undefined, "", "SOFTARQ_DEV", "softarq_test", "softarq_restauracion", "postgres"])("rechaza %s", (c) => {
    expect(() => validarConfirmacion(c)).toThrow(ErrorRespaldo);
  });
});

describe("base destino vacía", () => {
  it("acepta 0 objetos", () => expect(() => exigirBaseVacia("0")).not.toThrow());
  it.each([1, "28", 300])("rechaza %s objetos", (n) => {
    expect(() => exigirBaseVacia(n)).toThrow(/no se sobrescribe/);
  });
});

describe("historial de migraciones", () => {
  const repo = migracionesDelRepositorio();
  const ultima = repo.at(-1);
  it("el repositorio tiene migraciones ordenadas", () => expect(repo.length).toBeGreaterThan(0));
  it("sin problemas cuando coinciden", () => {
    expect(compararMigraciones({ aplicadas: repo, manifiesto: { ultimaMigracion: ultima }, repositorio: repo })).toEqual([]);
  });
  it("detecta migraciones pendientes", () => {
    expect(compararMigraciones({ aplicadas: repo.slice(0, -1), manifiesto: { ultimaMigracion: ultima }, repositorio: repo }).length).toBeGreaterThan(0);
  });
  it("detecta un manifiesto de otra versión", () => {
    expect(compararMigraciones({ aplicadas: repo, manifiesto: { ultimaMigracion: "20200101000000_otra" }, repositorio: repo }).length).toBeGreaterThan(0);
  });
});
