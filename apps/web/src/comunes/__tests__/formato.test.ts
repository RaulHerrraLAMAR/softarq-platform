import { describe, expect, it } from "vitest";
import { formatearCantidad, formatearFecha, formatearImporte, formatearTasa, redondearDecimales, truncarDecimales } from "../formato.ts";

describe("formato es-MX sin pasar por number", () => {
  it("importes: agrupa miles y conserva los decimales recibidos", () => {
    expect(formatearImporte("54190.68", "MXN")).toBe("$54,190.68");
    expect(formatearImporte("4911.79", "MXN")).toBe("$4,911.79");
    expect(formatearImporte("900.00", "MXN")).toBe("$900.00");
    expect(formatearImporte("-1200.50", "MXN")).toBe("-$1,200.50");
  });

  it("no pierde precisión con valores que un number redondearía", () => {
    expect(formatearImporte("123456789012345.67", "MXN")).toBe("$123,456,789,012,345.67");
    expect(formatearCantidad("0.1000000001")).toBe("0.1000000001");
  });

  it("cantidades sin redondeo", () => {
    expect(formatearCantidad("88.8")).toBe("88.8");
    expect(formatearCantidad("12345.125")).toBe("12,345.125");
    expect(formatearCantidad("7")).toBe("7");
  });

  it("texto no decimal se devuelve tal cual", () => {
    expect(formatearImporte("abc", "MXN")).toBe("abc");
  });

  it("tasa como porcentaje sin aritmética de punto flotante", () => {
    expect(formatearTasa("0.16")).toBe("16 %");
    expect(formatearTasa("0.075")).toBe("7.5 %");
    expect(formatearTasa("0")).toBe("0 %");
    expect(formatearTasa("1")).toBe("100 %");
  });

  it("fecha AAAA-MM-DD → DD/MM/AAAA", () => {
    expect(formatearFecha("2026-09-25")).toBe("25/09/2026");
  });
});

describe("redondeo y truncado de texto para mostrar (módulo 14)", () => {
  it("truncado a 4 decimales como el prorrateo de §3.14", () => {
    expect(truncarDecimales("343.994475124", 4)).toBe("343.9944");
    expect(truncarDecimales("2411.005524876", 4)).toBe("2411.0055");
    expect(truncarDecimales("12", 4)).toBe("12.0000");
    expect(truncarDecimales("-0.00001", 4)).toBe("0.0000");
  });

  it("redondeo mitad hacia arriba y simétrico (CR-15), sin number", () => {
    expect(redondearDecimales("1804.194475", 4)).toBe("1804.1945");
    expect(redondearDecimales("0.125", 2)).toBe("0.13");
    expect(redondearDecimales("-0.125", 2)).toBe("-0.13");
    expect(redondearDecimales("999.995", 2)).toBe("1000.00");
    expect(redondearDecimales("1460.2", 2)).toBe("1460.20");
    expect(redondearDecimales("0.1666666666666666666667", 4)).toBe("0.1667");
    expect(redondearDecimales("123456789012345.675", 2)).toBe("123456789012345.68");
    expect(redondearDecimales("-0.004", 2)).toBe("0.00");
    expect(redondearDecimales("abc", 2)).toBe("abc");
  });
});
