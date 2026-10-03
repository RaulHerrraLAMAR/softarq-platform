/**
 * Verificación de condiciones vigentes para enviar y aprobar (módulo 7, ADR-0009). Reglas de
 * `Validar` (modValidacion.bas) evaluadas sin modificar la versión. Cifras de la proyección del
 * Ejemplo 1 (total 54,190.68 de las fuentes, Word maestro y recorrido guiado).
 */
import type { CotizacionComercial, EntradaCalculo } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { ESCENARIOS } from "../../calculo/domain/__tests__/fixtures/escenarios.js";
import type { ConceptoLeido, PrecioLeido } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { av02, av05, bl07, bl09, bl14, bl16, bl18, huellaComparable, insumosDeEntrada } from "../dominio/verificacion.js";

const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const entrada = R1.entrada as EntradaCalculo;

const comercial: CotizacionComercial = {
  ambiente: "DEMO",
  moneda: "MXN",
  leyenda: "DEMO",
  partidas: [
    { numero: 1, descripcion: "Cubierta", unidad: "m2", cantidad: "88.8", precioUnitario: "513.92", importe: "45636.10" },
    { numero: 2, descripcion: "Transporte", unidad: "viaje", cantidad: "1", precioUnitario: "1080.00", importe: "1080.00" },
  ],
  subtotal: "46716.10",
  impuesto: { nombre: "Impuesto", tasa: "0.16", importe: "7474.58" },
  total: "54190.68",
};

const precio = (codigo: string, desde: string, hasta: string): PrecioLeido => ({
  codigo,
  precioUnitario: "1",
  vigenteDesde: desde,
  vigenteHasta: hasta,
  anulado: false,
  producto: { codigo: "P", insumoCodigo: "I", contenido: "1", fraccionable: false, incrementoMinimo: null, activo: true },
  proveedor: { codigo: "PRV", activo: true },
});

describe("BL-18: verificación cruzada de la proyección guardada", () => {
  it("la proyección del Ejemplo 1 es coherente", () => {
    expect(bl18(comercial)).toEqual([]);
  });
  it("detecta importe ≠ cantidad × P.U., suma ≠ subtotal y total ≠ subtotal + impuesto", () => {
    const mala = { ...comercial, partidas: [{ ...comercial.partidas[0]!, importe: "45636.11" }, comercial.partidas[1]!], total: "54190.69" };
    expect(bl18(mala).map((p) => p.referencia)).toEqual(["1", "subtotal", "total"]);
  });
});

describe("BL-16: la versión se reproduce igual con los datos de hoy", () => {
  it("ignora la fecha de cálculo y el menor precio vigente (solo informa AV-01)", () => {
    const hoy = { ...entrada, fechaCalculo: "2027-01-01", selecciones: entrada.selecciones.map((s) => ({ ...s, menorPrecioVigente: "1" })) };
    expect(huellaComparable(hoy)).toBe(huellaComparable(entrada));
    expect(bl16(entrada, "m", hoy, "m")).toEqual([]);
  });
  it("cambia con un parámetro, un precio o el motor", () => {
    const recargo = { ...entrada, parametros: { ...entrada.parametros, recargoSobreCosto: "0.40" } };
    expect(bl16(entrada, "m", recargo, "m")[0]!.codigo).toBe("BL-16");
    const otroPrecio = { ...entrada, selecciones: entrada.selecciones.map((s, i) => (i === 0 ? { ...s, precioUnitario: "999" } : s)) };
    expect(bl16(entrada, "m", otroPrecio, "m")).toHaveLength(1);
    expect(bl16(entrada, "motor-1", entrada, "motor-2")[0]!.mensaje).toMatch(/otro motor/);
  });
});

describe("BL-07, BL-09 y BL-14", () => {
  it("BL-07: insumo sin producto comercial activo", () => {
    const ins = insumosDeEntrada(entrada);
    expect(bl07(ins, new Set(ins))).toEqual([]);
    expect(bl07(ins, new Set(ins.slice(1))).map((p) => p.referencia)).toEqual([ins[0]]);
  });
  it("BL-09: precio no vigente a la fecha de referencia (límites incluidos)", () => {
    const s = entrada.selecciones[0]!;
    const p = precio(s.precioId, "2026-09-01", "2027-09-30");
    expect(bl09(entrada, [p], "2027-09-30")).toEqual([]);
    expect(bl09(entrada, [p], "2027-10-01").map((x) => x.codigo)).toEqual(["BL-09"]);
    expect(bl09(entrada, [p], "2026-08-31")).toHaveLength(1);
  });
  it("BL-14: vigencia comercial no definida o no positiva", () => {
    expect(bl14(15)).toEqual([]);
    expect(bl14(null)).toHaveLength(1);
    expect(bl14(0)).toHaveLength(1);
  });
});

describe("AV-02 y AV-05 (avisos; no bloquean)", () => {
  it("AV-02: el precio vence antes de hoy + VIGENCIA_DIAS (CR-16)", () => {
    const s = entrada.selecciones[0]!;
    const p = precio(s.precioId, "2026-09-01", "2027-09-30");
    // 2027-09-15 + 15 = 2027-09-30: no vence antes.
    expect(av02(entrada, [p], "2027-09-15", 15)).toEqual([]);
    expect(av02(entrada, [p], "2027-09-16", 15).map((a) => a.codigo)).toEqual(["AV-02"]);
    expect(av02(entrada, [p], "2027-09-16", null)).toEqual([]);
  });
  it("AV-05: concepto de clase distinta de ESTANDAR", () => {
    const id = entrada.partidas.find((x) => x.tipo === "CONCEPTO")!;
    const codigo = id.tipo === "CONCEPTO" ? id.concepto.id : "";
    const concepto = (clase: string) => ({ codigo, clase }) as ConceptoLeido;
    expect(av05(entrada, [concepto("ESTANDAR")])).toEqual([]);
    expect(av05(entrada, [concepto("GENERICO")])[0]!.mensaje).toMatch(/genérico|generico/);
  });
});
