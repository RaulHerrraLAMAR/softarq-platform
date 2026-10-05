import { describe, expect, it } from "vitest";
import { EsquemaCorreccionRespuesta, EsquemaRegistroRespuesta } from "@softarq/contracts";
import { validarFechaRespuesta, vigenciaDocumento } from "../respuesta-cliente.js";
import { RelojDelSistema } from "../../../calculo/aplicacion/reloj.js";
import { vi } from "vitest";
const e = { fechaEmision: "2026-09-25", vigenteHasta: "2026-10-10" };
describe("vigencia y respuesta recibida", () => {
  it.each(["2026-09-25", "2026-10-10"])("admite el límite %s aunque se capture después de vencer", (f) => {
    expect(() => validarFechaRespuesta(f, e, "2026-10-11")).not.toThrow();
  });
  it.each([["2026-09-24", "2026-10-11", "FECHA_RESPUESTA_INVALIDA"], ["2026-10-11", "2026-10-11", "RESPUESTA_FUERA_VIGENCIA"], ["2026-09-26", "2026-09-25", "FECHA_RESPUESTA_INVALIDA"]])("rechaza %s con fecha del servidor %s", (f, hoy, codigo) => {
    expect(() => validarFechaRespuesta(f, e, hoy)).toThrow(expect.objectContaining({ codigo }));
  });
  it("vence después del último día, sin mutar el documento", () => {
    expect(vigenciaDocumento(e.vigenteHasta, "2026-10-10")).toBe("VIGENTE");
    expect(vigenciaDocumento(e.vigenteHasta, "2026-10-11")).toBe("VENCIDA");
  });
  it("usa el día civil de México a ambos lados de medianoche", () => {
    vi.useFakeTimers();
    try {
      const reloj = new RelojDelSistema("America/Mexico_City");
      vi.setSystemTime(new Date("2026-10-11T05:59:59Z")); expect(reloj.hoy()).toBe("2026-10-10");
      vi.setSystemTime(new Date("2026-10-11T06:00:00Z")); expect(reloj.hoy()).toBe("2026-10-11");
    } finally { vi.useRealTimers(); }
  });
  it("contrato estricto: no acepta identidad ni una corrección sin motivo", () => {
    const d = { resultado: "ACEPTADA", fechaRespuesta: "2026-09-25" };
    expect(EsquemaRegistroRespuesta.safeParse({ ...d, registradoPor: "cliente" }).success).toBe(false);
    expect(EsquemaCorreccionRespuesta.safeParse({ ...d, motivo: "12345678901" }).success).toBe(false);
    expect(EsquemaRegistroRespuesta.safeParse({ ...d, fechaRespuesta: "2026-02-30" }).success).toBe(false);
  });
});
