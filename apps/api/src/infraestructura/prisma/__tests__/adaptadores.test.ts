/** Conversión decimal y de fechas del adaptador de persistencia (sin base de datos). */
import { describe, expect, it } from "vitest";
import {
  COLUMNAS_DECIMALES,
  ErrorDecimalColumna,
  decimalParaColumna,
  textoDeDecimal,
} from "../decimales.js";
import { fechaDeColumna, fechaParaColumna } from "../fechas.js";
import { Dec } from "../../../modules/calculo/domain/decimal.js";

describe("decimalParaColumna: nunca deja que PostgreSQL redondee", () => {
  it.each([
    ["dinero", "999999999999.999999"],
    ["dinero", "9.8"],
    ["cantidad", "2.196"],
    ["cantidad", "99999999999999.999999"],
    ["factor", "0.0000000001"],
    ["factor", "9999999999.9999999999"],
    ["fraccion", "0.16"],
    ["fraccion", "1"],
    ["traslape", "0.1"],
  ] as const)("%s acepta %s", (clase, valor) => {
    expect(decimalParaColumna(valor, clase, "x")).toBe(valor);
  });

  it.each([
    ["dinero", "1.0000001", "decimales"],
    ["fraccion", "0.1234567", "decimales"],
    ["dinero", "1000000000000", "enteros"],
    ["fraccion", "10", "enteros"],
    ["cantidad", "1e3", "formato"],
    ["cantidad", "1,5", "formato"],
  ] as const)("%s rechaza %s (%s)", (clase, valor, _motivo) => {
    expect(() => decimalParaColumna(valor, clase, "x")).toThrow(ErrorDecimalColumna);
  });

  it("los ceros finales no cuentan como escala (2.1960000000 cabe en 6 decimales)", () => {
    expect(decimalParaColumna("2.1960000000", "cantidad", "x")).toBe("2.1960000000");
  });

  it("las escalas por clase son las del ADR-0004", () => {
    expect(COLUMNAS_DECIMALES).toEqual({
      dinero: { precision: 18, escala: 6 },
      cantidad: { precision: 20, escala: 6 },
      factor: { precision: 20, escala: 10 },
      fraccion: { precision: 7, escala: 6 },
      traslape: { precision: 9, escala: 6 },
    });
  });
});

describe("textoDeDecimal: lectura sin number ni exponente", () => {
  it.each([
    ["385.000000", "385"],
    ["0.200000", "0.2"],
    ["2.196000", "2.196"],
    ["0.0000000001", "0.0000000001"],
    ["0.000000", "0"],
    ["999999999999.999999", "999999999999.999999"],
  ])("%s -> %s", (columna, esperado) => {
    expect(textoDeDecimal(new Dec(columna))).toBe(esperado);
  });
});

describe("fechas DATE sin desplazamiento por zona horaria", () => {
  it.each(["2026-09-01", "2027-09-30", "2028-02-29", "2026-12-31"])("ida y vuelta %s", (f) => {
    expect(fechaDeColumna(fechaParaColumna(f, "x"))).toBe(f);
  });
  it("rechaza fechas inexistentes o mal formadas", () => {
    expect(() => fechaParaColumna("2026-02-30", "x")).toThrow();
    expect(() => fechaParaColumna("01/09/2026", "x")).toThrow();
  });
});
