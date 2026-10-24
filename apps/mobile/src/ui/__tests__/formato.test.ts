import { describe, expect, it } from "vitest";
import { formatearCantidad, formatearFecha, formatearImporte, formatearInstante, formatearTasa } from "../formato";

describe("formato de importes (texto decimal, sin number)", () => {
  it("los cuatro totales de referencia se muestran exactamente", () => {
    expect(formatearImporte("54190.68")).toBe("$54,190.68");
    expect(formatearImporte("43312.16")).toBe("$43,312.16");
    expect(formatearImporte("22405.28")).toBe("$22,405.28");
    expect(formatearImporte("4911.79")).toBe("$4,911.79");
  });
  it("no pierde precisión ni redondea", () => {
    expect(formatearImporte("12345678901234567890.123456789")).toBe("$12,345,678,901,234,567,890.123456789");
    expect(formatearImporte("-1500.50")).toBe("-$1,500.50");
    expect(formatearCantidad("88.8")).toBe("88.8");
    expect(formatearCantidad("1234567")).toBe("1,234,567");
  });
  it("un texto que no es decimal se devuelve tal cual", () => {
    expect(formatearImporte("n/d")).toBe("n/d");
  });
  it("tasas sin aritmética de punto flotante", () => {
    expect(formatearTasa("0.16")).toBe("16 %");
    expect(formatearTasa("0.105")).toBe("10.5 %");
  });
  it("fechas de negocio sin zona horaria; instantes en hora local", () => {
    expect(formatearFecha("2026-09-25")).toBe("25/09/2026");
    expect(formatearInstante("no es fecha")).toBe("no es fecha");
    expect(formatearInstante("2026-10-24T12:30:00Z")).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
  });
});
