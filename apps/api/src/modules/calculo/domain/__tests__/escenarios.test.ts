/**
 * Escenarios de referencia de la guía de demostración y del libro oficial
 * (cifras independientes del motor nuevo; ver fixtures/escenarios.ts).
 */
import { describe, expect, it } from "vitest";
import { dec, redondearMA } from "../decimal.js";
import { calcularCotizacion } from "../motor.js";
import { calculado, igualDecimal } from "./ayudas.js";
import { elegir } from "./fixtures/catalogo-demo.js";
import { ESCENARIOS } from "./fixtures/escenarios.js";

const escenario = (id: string) => {
  const e = ESCENARIOS.find((x) => x.id === id);
  if (!e) throw new Error(id);
  return e;
};

describe.each(ESCENARIOS)("$id", ({ entrada, esperado, origen }) => {
  it(`reproduce ${esperado.total} (${origen.ubicacion})`, () => {
    const r = calculado(calcularCotizacion(entrada));
    igualDecimal(r.partidas[0]!.cantidad, esperado.cantidad);
    expect(r.totales.costoDirectoRedondeado).toBe(esperado.costoDirectoRedondeado);
    expect(r.totales.subtotal).toBe(esperado.subtotal);
    expect(r.totales.impuestos).toBe(esperado.impuestos);
    expect(r.totales.total).toBe(esperado.total);
    for (const [producto, unidades] of Object.entries(esperado.unidadesPorProducto ?? {})) {
      igualDecimal(r.compras.find((c) => c.productoId === producto)?.unidades, unidades);
    }
  });

  it("documenta su origen y está marcado como DEMO", () => {
    expect(origen.fuente.length).toBeGreaterThan(0);
    expect(entrada.parametros.ambiente).toBe("DEMO");
  });
});

describe("detalles respaldados por casos del libro", () => {
  it("TI-305/306: larguero 382.851 kg -> 15 tramos; lámina 38 hojas = $13,756; subcontrato $6,726 aparte", () => {
    const r = calculado(calcularCotizacion(escenario("GUIA-R1-LAMINA-362").entrada));
    const larguero = r.consumos.find((c) => c.insumoId === "INS-00006")!;
    igualDecimal(larguero.factorConversion, "4.2");
    igualDecimal(larguero.consumoBase, "382.851");
    igualDecimal(r.compras.find((c) => c.productoId === "PCM-00004")!.costoCompra, "13756");
    igualDecimal(r.partidas[0]!.costoSubcontrato, "6726");
    igualDecimal(r.partidas[0]!.costoManoObra, "0");
  });

  it("TI-308: la lámina a $385 cuesta $14,630", () => {
    const r = calculado(calcularCotizacion(escenario("GUIA-R1-LAMINA-385").entrada));
    igualDecimal(r.compras.find((c) => c.productoId === "PCM-00004")!.costoCompra, "14630");
  });

  it("TI-309: AV-01 si el precio elegido ($385) no es el menor vigente ($362); la selección no cambia", () => {
    const e = escenario("GUIA-R1-LAMINA-385").entrada;
    const selecciones = e.selecciones.map((s) => (s.insumoId === "INS-00004" ? elegir("PRE-000006", "362") : s));
    const r = calculado(calcularCotizacion({ ...e, selecciones }));
    expect(r.avisos.filter((a) => a.codigo === "AV-01").map((a) => a.referencia)).toEqual(["INS-00004"]);
    expect(r.totales.total).toBe("44865.23");
    expect(r.compras.find((c) => c.productoId === "PCM-00004")!.proveedorId).toBe("PRV-00001");
  });

  it("TI-313: concreto 3.402 m³ -> 3.5 m³ (sobrante 0.098); 0.9257 jornadas = $2,221.71", () => {
    const r = calculado(calcularCotizacion(escenario("GUIA-R2-ESPESOR-010").entrada));
    const concreto = r.compras.find((c) => c.productoId === "PCM-00007")!;
    igualDecimal(concreto.consumoTotal, "3.402");
    igualDecimal(concreto.cantidadComprada, "3.5");
    igualDecimal(concreto.sobrante, "0.098");
    expect(r.partidas[0]!.jornadas!.startsWith("0.9257")).toBe(true);
    expect(r.partidas[0]!.costoManoObra.startsWith("2221.71")).toBe(true);
  });

  it("TI-315: acero 24.66 × 3.2 × 1.05 × 0.56 = 46.4003 kg -> 7 tramos", () => {
    const r = calculado(calcularCotizacion(escenario("GUIA-R3-BLOCK-1390").entrada));
    const acero = r.consumos.find((c) => c.insumoId === "INS-00008")!;
    // TI-315 muestra 4 decimales redondeados (T4 del arnés): 46.400256 -> 46.4003.
    igualDecimal(acero.consumoBase, "46.400256");
    expect(redondearMA(dec(acero.consumoBase), 4).toFixed(4)).toBe("46.4003");
    igualDecimal(r.compras.find((c) => c.productoId === "PCM-00008")!.unidades, "7");
  });

  it("precio alternativo del larguero (COT-2026-00017-v1): solo cambia la compra del larguero", () => {
    const base = calculado(calcularCotizacion(escenario("GUIA-R1-LAMINA-385").entrada));
    const alt = calculado(calcularCotizacion(escenario("LIBRO-COT-2026-00017-v1").entrada));
    const costo = (r: typeof base, p: string) => r.compras.find((c) => c.productoId === p)!;
    igualDecimal(costo(base, "PCM-00006").costoCompra, "9150"); // 15 × 610
    igualDecimal(costo(alt, "PCM-00006").costoCompra, "9600"); // 15 × 640
    expect(costo(alt, "PCM-00006").proveedorId).toBe("PRV-00002");
    expect(costo(alt, "PCM-00004").costoCompra).toBe(costo(base, "PCM-00004").costoCompra);
  });
});
