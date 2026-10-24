import { describe, expect, it } from "vitest";
import { estadoDeVersion, lineasDeCambios, nombreDeEvento } from "../etiquetas";
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

describe("estados con los términos de la web", () => {
  const base = { estado: "BORRADOR" as const, revisionVigente: null };
  it("deriva el texto del estado y la revisión que entrega el servidor", () => {
    expect(estadoDeVersion(base).texto).toBe("Borrador calculado · sin enviar a revisión");
    expect(estadoDeVersion({ ...base, estado: "EN_REVISION" }).texto).toBe("En revisión");
    expect(estadoDeVersion({ ...base, estado: "EMITIDA" })).toMatchObject({ texto: "Emitida", tono: "correcto" });
    expect(estadoDeVersion({ ...base, estado: "SUSTITUIDA" }).texto).toBe("Emitida · sustituida por una posterior");
    const aprobada = { id: "r", estado: "APROBADA" as const, revision: 1, enviadoPor: "A", enviadoEn: "", resueltaPor: "Revisora", resueltaEn: "", observaciones: null, anulacion: null };
    expect(estadoDeVersion({ estado: "APROBADA", revisionVigente: aprobada }).texto).toBe("Aprobada por Revisora");
    expect(estadoDeVersion({ estado: "BORRADOR", revisionVigente: { ...aprobada, anulacion: { por: "R", en: "", motivo: "x" } } }).texto).toBe("Borrador · aprobación anulada");
    expect(estadoDeVersion({ estado: "BORRADOR", revisionVigente: { ...aprobada, estado: "CAMBIOS_SOLICITADOS" } }).texto).toBe("Borrador · cambios solicitados");
  });
  it("los cambios de versión se resumen sin enumerar insumos ni datos de compra", () => {
    const base = { versionAnterior: 1, partidasAgregadas: [], partidasQuitadas: [], partidasModificadas: [], seleccionCambiada: [], consolidacionCambiada: false, datosDescriptivosCambiados: [], condicionesCambiadas: false, totalAnterior: "100.00", totalNuevo: "120.00" };
    expect(lineasDeCambios({ ...base, versionAnterior: null })).toEqual(["Primera versión de la cotización."]);
    expect(lineasDeCambios(base)).toEqual(["Misma captura y mismas condiciones que la versión anterior (recálculo)."]);
    const l = lineasDeCambios({ ...base, partidasAgregadas: ["Muro"], seleccionCambiada: ["INS-00007", "INS-00009"], datosDescriptivosCambiados: ["cliente.nombre"], condicionesCambiadas: true });
    expect(l).toEqual(["Partidas agregadas: Muro.", "Cambió alguna opción de precio elegida.", "Datos descriptivos actualizados: nombre del cliente.", "Cambiaron los datos vigentes del catálogo o las opciones elegidas."]);
    expect(l.join(" ")).not.toContain("INS-");
  });
  it("eventos desconocidos se muestran por su código, sin inventar texto", () => {
    expect(nombreDeEvento("VERSION_APROBADA")).toBe("Versión aprobada (no es emisión)");
    expect(nombreDeEvento("EVENTO_FUTURO")).toBe("EVENTO_FUTURO");
  });
});
