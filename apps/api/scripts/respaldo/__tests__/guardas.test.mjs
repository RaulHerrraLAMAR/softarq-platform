// Pruebas unitarias de las guardas del respaldo y la restauración (ADR-0012). Sin base de datos.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIR_WORK,
  ErrorRespaldo,
  FORMATO_MANIFIESTO,
  PATRON_ID,
  RAIZ_PROYECTO,
  RAIZ_REPOSITORIO,
  estaDentro,
  nuevoIdentificador,
  rutaDeClave,
  validarCarpetaDocumentosDestino,
  validarCarpetaRespaldos,
  validarDestino,
  validarManifiesto,
} from "../comun.mjs";

const DOCS_DEV = join(RAIZ_PROYECTO, "datos", "softarq_dev", "documentos");
const RESPALDOS = join(RAIZ_PROYECTO, "respaldos", "softarq_dev");
const ORG = "11111111-1111-4111-8111-111111111111";
const EMI = "22222222-2222-4222-8222-222222222222";

describe("destino de restauración", () => {
  it.each(["softarq_dev", "SOFTARQ_DEV", "softarq_test", "softarq_shadow", "postgres", "template1"])("rechaza %s como PROHIBIDO", (d) => {
    expect(() => validarDestino(d)).toThrow(/PROHIBIDO/);
  });
  it.each(["otra_base", "softarq_restauracion2", ""])("rechaza «%s» fuera de la lista blanca", (d) => {
    expect(() => validarDestino(d)).toThrow(ErrorRespaldo);
  });
  it("solo acepta softarq_restauracion", () => {
    expect(validarDestino("softarq_restauracion")).toBe("softarq_restauracion");
  });
});

describe("carpetas", () => {
  const protegidas = { dirDocumentosDesarrollo: DOCS_DEV, dirRespaldos: RESPALDOS };
  it("rechaza como destino la carpeta de documentos de desarrollo, una subcarpeta o un ancestro", () => {
    expect(() => validarCarpetaDocumentosDestino(DOCS_DEV, protegidas)).toThrow(/PROHIBIDA/);
    expect(() => validarCarpetaDocumentosDestino(join(DOCS_DEV, "emisiones"), protegidas)).toThrow(/PROHIBIDA/);
    expect(() => validarCarpetaDocumentosDestino(DOCS_DEV.toUpperCase(), protegidas)).toThrow(/PROHIBIDA/);
    expect(() => validarCarpetaDocumentosDestino(join(RAIZ_PROYECTO, "datos"), protegidas)).toThrow(/PROHIBIDA/);
  });
  it("rechaza destinos dentro de los respaldos, del repositorio o relativos", () => {
    expect(() => validarCarpetaDocumentosDestino(join(RESPALDOS, "x"), protegidas)).toThrow(/PROHIBIDA/);
    expect(() => validarCarpetaDocumentosDestino(join(RAIZ_REPOSITORIO, "tmp", "docs"), protegidas)).toThrow(/repositorio/);
    expect(() => validarCarpetaDocumentosDestino("documentos", protegidas)).toThrow(/absoluta/);
  });
  it("acepta una carpeta desechable en _work", () => {
    const c = join(DIR_WORK, "restauracion", "softarq_restauracion", "documentos");
    expect(validarCarpetaDocumentosDestino(c, protegidas)).toBe(c);
  });
  it("la carpeta de respaldos no puede estar en el repositorio ni solaparse con los documentos", () => {
    expect(() => validarCarpetaRespaldos(join(RAIZ_REPOSITORIO, "respaldos"), { dirDocumentosDesarrollo: DOCS_DEV })).toThrow(/repositorio/);
    expect(() => validarCarpetaRespaldos(join(DOCS_DEV, "r"), { dirDocumentosDesarrollo: DOCS_DEV })).toThrow(/solaparse/);
    expect(validarCarpetaRespaldos(RESPALDOS, { dirDocumentosDesarrollo: DOCS_DEV })).toBe(RESPALDOS);
  });
  it("estaDentro no confunde prefijos de nombre", () => {
    expect(estaDentro("D:\\a\\documentos-2", "D:\\a\\documentos")).toBe(false);
    expect(estaDentro("D:\\a\\documentos\\x", "D:\\a\\documentos")).toBe(true);
  });
});

describe("identificador y claves", () => {
  it("identificador único con fecha UTC y sufijo aleatorio", () => {
    const id = nuevoIdentificador(new Date("2026-10-04T06:07:08.123Z"), "abc123");
    expect(id).toBe("softarq_dev-20261004T060708Z-abc123");
    expect(PATRON_ID.test(id)).toBe(true);
    expect(nuevoIdentificador()).not.toBe(nuevoIdentificador());
  });
  it("las claves solo resuelven dentro de la carpeta y con el patrón propio", () => {
    expect(rutaDeClave("D:\\r", `emisiones/${ORG}/${EMI}.pdf`)).toBe(join("D:\\r", "emisiones", ORG, `${EMI}.pdf`));
    expect(() => rutaDeClave("D:\\r", `emisiones/../${EMI}.pdf`)).toThrow(/inválida/);
    expect(() => rutaDeClave("D:\\r", "emisiones/x/y.pdf")).toThrow(/inválida/);
  });
});

describe("manifiesto", () => {
  const valido = () => ({
    formato: FORMATO_MANIFIESTO,
    id: "softarq_dev-20261004T060708Z-abc123",
    estado: "COMPLETO",
    problemas: [],
    base: { archivo: "base.dump", sha256: "a".repeat(64), bytes: 10 },
    esquema: { ultimaMigracion: "20261003200000_emision" },
    documentos: { total: 1, lista: [{ clave: `emisiones/${ORG}/${EMI}.pdf`, sha256: "b".repeat(64), bytes: 5 }] },
  });
  it("acepta un manifiesto completo bien formado", () => {
    expect(validarManifiesto(valido())).toEqual([]);
  });
  it("un respaldo COMPLETO no puede tener problemas ni faltarle el esquema", () => {
    const m = valido();
    m.problemas = [{ tipo: "AUSENTE" }];
    delete m.esquema.ultimaMigracion;
    expect(validarManifiesto(m)).toHaveLength(2);
  });
  it("detecta un total incoherente y documentos mal descritos", () => {
    const m = valido();
    m.documentos.total = 2;
    m.documentos.lista[0].sha256 = "x";
    expect(validarManifiesto(m).length).toBe(2);
  });
  it("detecta una URL con credenciales", () => {
    const m = valido();
    m.origen = { nota: "postgresql://softarq_respaldo:secreto@localhost:5432/softarq_dev" };
    expect(validarManifiesto(m).join(" ")).toMatch(/credenciales/);
  });
});
