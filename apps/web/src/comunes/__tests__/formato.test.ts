import { describe, expect, it } from "vitest";
import { formatearCantidad, formatearFecha, formatearImporte, formatearTasa } from "../formato.ts";

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
