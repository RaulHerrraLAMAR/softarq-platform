/**
 * Contratos de parámetros y personas (módulo 13, ADR-0017). Rangos y tipos de `tblParametros`
 * (`Cfg_AyudaTipo`: PCT 0..1, ENTERO > 0, TEXTO_LARGO) y de `Persona_Guardar` (al menos una función,
 * correo único, motivo), no del código bajo prueba.
 */
import {
  EsquemaCambioContrasena,
  EsquemaEdicionParametros,
  EsquemaEdicionPersona,
  EsquemaFraccion,
  EsquemaRespuestaCredencialTemporal,
  EsquemaSolicitudPersona,
  LIMITES_ADMINISTRACION,
} from "@softarq/contracts";
import { describe, expect, it } from "vitest";

const MOTIVO = "[DEMO] Ajuste de comprobación";

describe("fracciones PCT (0..1, hasta 6 decimales, en texto)", () => {
  it("acepta 0, 1 y fracciones con hasta 6 decimales sin redondear", () => {
    for (const v of ["0", "0.2", "0.16", "1", "1.000000", "0.000001", "0.125"]) expect(EsquemaFraccion.safeParse(v).success, v).toBe(true);
  });
  it("rechaza números, negativos, mayores que 1, exponentes, comas y más de 6 decimales", () => {
    for (const v of [0.2, "-0.1", "1.0000001", "1.5", "20", "2e-1", "0,2", " 0.2", "0.0000001"]) expect(EsquemaFraccion.safeParse(v).success, String(v)).toBe(false);
  });
});

describe("edición de parámetros", () => {
  const base = { revision: 3, motivo: MOTIVO };
  it("null (no definido) es distinto de 0 y ambos se admiten en el recargo", () => {
    expect(EsquemaEdicionParametros.parse({ ...base, recargoSobreCosto: null }).recargoSobreCosto).toBeNull();
    expect(EsquemaEdicionParametros.parse({ ...base, recargoSobreCosto: "0" }).recargoSobreCosto).toBe("0");
  });
  it("el impuesto va completo o null; la base es la del libro", () => {
    expect(EsquemaEdicionParametros.safeParse({ ...base, impuesto: { tasa: "0.16", base: "SUBTOTAL_VENTA", tratamiento: "[DEMO] T", nombre: "[DEMO] IVA" } }).success).toBe(true);
    expect(EsquemaEdicionParametros.safeParse({ ...base, impuesto: null }).success).toBe(true);
    expect(EsquemaEdicionParametros.safeParse({ ...base, impuesto: { tasa: "0.16", base: "SUBTOTAL_VENTA", tratamiento: "[DEMO] T" } }).success).toBe(false);
    expect(EsquemaEdicionParametros.safeParse({ ...base, impuesto: { tasa: "0.16", base: "TOTAL", tratamiento: "[DEMO] T", nombre: "[DEMO] IVA" } }).success).toBe(false);
  });
  it("vigencia: entero mayor que cero (D-11), con tope", () => {
    expect(EsquemaEdicionParametros.safeParse({ ...base, vigenciaDias: 1 }).success).toBe(true);
    for (const v of [0, -1, 1.5, "15", LIMITES_ADMINISTRACION.vigenciaMaximaDias + 1]) expect(EsquemaEdicionParametros.safeParse({ ...base, vigenciaDias: v }).success, String(v)).toBe(false);
  });
  it("textos: los tres, sin vacíos y con longitud máxima", () => {
    const textos = { alcance: "[DEMO] A", condiciones: "[DEMO] C", exclusiones: "[DEMO] E" };
    expect(EsquemaEdicionParametros.safeParse({ ...base, textos }).success).toBe(true);
    expect(EsquemaEdicionParametros.safeParse({ ...base, textos: { ...textos, alcance: "   " } }).success).toBe(false);
    expect(EsquemaEdicionParametros.safeParse({ ...base, textos: { alcance: "[DEMO] A", condiciones: "[DEMO] C" } }).success).toBe(false);
    expect(EsquemaEdicionParametros.safeParse({ ...base, textos: { ...textos, exclusiones: "x".repeat(LIMITES_ADMINISTRACION.longitudTexto + 1) } }).success).toBe(false);
  });
  it("exige al menos un cambio y motivo; rechaza ambiente, moneda, organización o contadores", () => {
    expect(EsquemaEdicionParametros.safeParse(base).success).toBe(false);
    expect(EsquemaEdicionParametros.safeParse({ revision: 3, vigenciaDias: 15 }).success).toBe(false);
    for (const extra of [{ ambiente: "PRODUCCION" }, { moneda: "USD" }, { organizacionId: "x" }, { contador: 1 }]) {
      expect(EsquemaEdicionParametros.safeParse({ ...base, vigenciaDias: 15, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
  });
});

describe("personas", () => {
  const alta = { correo: "  Persona.M13@SoftArq.TEST ", nombre: "[DEMO] Persona", funciones: ["PREPARADOR"], motivo: MOTIVO };
  it("alta: correo normalizado, al menos una función sin repetir, sin contraseña ni organización en el cuerpo", () => {
    expect(EsquemaSolicitudPersona.parse(alta).correo).toBe("persona.m13@softarq.test");
    expect(EsquemaSolicitudPersona.safeParse({ ...alta, funciones: [] }).success).toBe(false);
    expect(EsquemaSolicitudPersona.safeParse({ ...alta, funciones: ["PREPARADOR", "PREPARADOR"] }).success).toBe(false);
    expect(EsquemaSolicitudPersona.safeParse({ ...alta, funciones: ["SUPERUSUARIO"] }).success).toBe(false);
    for (const extra of [{ contrasena: "x".repeat(20) }, { organizacionId: "x" }, { hash: "x" }]) expect(EsquemaSolicitudPersona.safeParse({ ...alta, ...extra }).success).toBe(false);
  });
  it("edición: el correo no se edita y hace falta un cambio", () => {
    expect(EsquemaEdicionPersona.safeParse({ revision: 0, motivo: MOTIVO, activa: false }).success).toBe(true);
    expect(EsquemaEdicionPersona.safeParse({ revision: 0, motivo: MOTIVO }).success).toBe(false);
    expect(EsquemaEdicionPersona.safeParse({ revision: 0, motivo: MOTIVO, correo: "otro@softarq.test" }).success).toBe(false);
  });
  it("la respuesta de credencial admite la temporal una vez o null al reproducir", () => {
    const persona = {
      id: "8c3cbb3e-bae5-48b5-a647-4eefc7851280",
      correo: "p@softarq.test",
      nombre: "[DEMO] P",
      funciones: ["PREPARADOR"],
      activa: true,
      cambioContrasenaPendiente: true,
      temporalExpiraEn: "2026-10-20T15:00:00.000Z",
      revision: 0,
      creadaEn: "2026-10-17T15:00:00.000Z",
      modificadaEn: "2026-10-17T15:00:00.000Z",
      modificadaPor: null,
    };
    expect(EsquemaRespuestaCredencialTemporal.safeParse({ persona, contrasenaTemporal: null, contrasenaEntregada: true, temporalExpiraEn: null }).success).toBe(true);
    expect(EsquemaRespuestaCredencialTemporal.safeParse({ persona: { ...persona, hashContrasena: "x" }, contrasenaTemporal: null, contrasenaEntregada: true, temporalExpiraEn: null }).success).toBe(false);
  });
});

describe("cambio de contraseña propia", () => {
  const nueva = "una frase larga de prueba";
  it(`nueva de al menos ${LIMITES_ADMINISTRACION.contrasenaMinima} caracteres, distinta de la actual y confirmada`, () => {
    expect(EsquemaCambioContrasena.safeParse({ actual: "temporal-x", nueva, confirmacion: nueva }).success).toBe(true);
    expect(EsquemaCambioContrasena.safeParse({ actual: "temporal-x", nueva: "corta", confirmacion: "corta" }).success).toBe(false);
    expect(EsquemaCambioContrasena.safeParse({ actual: nueva, nueva, confirmacion: nueva }).success).toBe(false);
    expect(EsquemaCambioContrasena.safeParse({ actual: "temporal-x", nueva, confirmacion: `${nueva}!` }).success).toBe(false);
    expect(EsquemaCambioContrasena.safeParse({ actual: "", nueva, confirmacion: nueva }).success).toBe(false);
  });
});
