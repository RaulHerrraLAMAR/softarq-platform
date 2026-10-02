/**
 * Reglas unitarias CR-01 a CR-16. Los casos PC-xx reproducen las entradas y resultados de
 * entrega\fuentes\vba\modPruebas.bas (casos internos del libro 1.0.0-F1).
 */
import { PATRON_DECIMAL_TEXTO, esDecimalTexto } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { cr06Compra, cr08Prorratear } from "../compras.js";
import { cr02Neto, cr03ConDesperdicio, cr04Convertir, factorConversion } from "../consumo.js";
import { Dec, aTexto, aTextoDinero, dec, redondearMA } from "../decimal.js";
import { cr09ManoObra } from "../mano-obra.js";
import { cr01Renglon, validarRenglon } from "../medicion.js";
import { cr11PrecioUnitario, cr12Importe, cr13Impuestos, margen, margenDeRecargo } from "../precio-venta.js";
import { cr07Vigente, cr16VigenteHasta, esFechaISOValida } from "../vigencias.js";
import { igualDecimal } from "./ayudas.js";

const t2 = (x: Dec) => x.toFixed(2);
const t4 = (x: Dec) => x.toFixed(4);

describe("CR-15 redondeo mitad hacia arriba (PC-01 a PC-06)", () => {
  it.each([
    ["PC-01", "0.125", "0.13"],
    ["PC-02", "2.675", "2.68"],
    ["PC-03", "0.124999", "0.12"],
    ["PC-04", "-0.125", "-0.13"],
    ["PC-05", "-2.675", "-2.68"],
    ["PC-06", "1.005", "1.01"],
  ])("%s: %s -> %s", (_caso, entrada, esperado) => {
    expect(t2(redondearMA(dec(entrada), 2))).toBe(esperado);
  });

  it("no redondea al par (diferencia con Round de VBA)", () => {
    expect(t2(redondearMA(dec("0.5"), 0))).toBe("1.00");
    expect(t2(redondearMA(dec("2.5"), 0))).toBe("3.00");
  });

  it("la precisión intermedia no se recorta a 2 decimales", () => {
    const x = dec("1").div(3);
    expect(aTexto(x).length).toBeGreaterThan(30);
    expect(aTextoDinero(redondearMA(x))).toBe("0.33");
  });
});

describe("formato DecimalTexto (contrato)", () => {
  it.each(["0", "12.5", "-1.20", "18790.94", "999999999999999.9999999999"])("acepta %s", (v) => {
    expect(esDecimalTexto(v)).toBe(true);
  });
  it.each(["1,000", "1e3", " 1", "+1", "01", ".5", "5.", "", "1.12345678901", "1000000000000000", "NaN"])(
    "rechaza %j",
    (v) => {
      expect(PATRON_DECIMAL_TEXTO.test(v)).toBe(false);
    },
  );
  it("rechaza tipos que no son texto", () => {
    expect(esDecimalTexto(1.5)).toBe(false);
    expect(esDecimalTexto(null)).toBe(false);
  });
  it("la salida nunca usa notación exponencial", () => {
    expect(aTexto(dec("0.0000000001").div(1000))).toBe("0.0000000000001");
    expect(aTexto(dec("999999999999999").times(1e10))).toBe("9999999999999990000000000");
  });
});

describe("CR-01 medición (PC-07 a PC-10)", () => {
  it("PC-07: 12.50 − 1.20 = 11.30 m² con vano", () => {
    const a = cr01Renglon("AREA", "+", dec("1"), dec("5.00"), dec("2.50"), null);
    const b = cr01Renglon("AREA", "-", dec("1"), dec("1.00"), dec("1.20"), null);
    expect(t2(a.plus(b))).toBe("11.30");
  });
  it("PC-08: 3 × 0.40 × 0.40 × 2.50 = 1.20 m³", () => {
    expect(t2(cr01Renglon("VOLUMEN", "+", dec("3"), dec("0.40"), dec("0.40"), dec("2.50")))).toBe("1.20");
  });
  it("PC-09: conteo + 12 piezas", () => {
    expect(t2(cr01Renglon("CONTEO", "+", dec("12"), null, null, null))).toBe("12.00");
  });
  it("PC-10: longitud 4 × 3.25 m", () => {
    expect(t2(cr01Renglon("LONGITUD", "+", dec("4"), dec("3.25"), null, null))).toBe("13.00");
  });
  it("AREA admite alto en lugar de ancho (muro: largo × alto)", () => {
    expect(t2(cr01Renglon("AREA", "+", dec("1"), dec("6"), null, dec("2.7")))).toBe("16.20");
  });

  const r = (signo: "+" | "-", piezas: string, largo: string | null, ancho: string | null, alto: string | null) => ({
    descripcion: "",
    signo,
    piezas,
    largo,
    ancho,
    alto,
  });
  it.each([
    ["descuento no permitido", "AREA", false, r("-", "1", "1", "1", null), "signo"],
    ["piezas no enteras", "CONTEO", false, r("+", "1.5", null, null, null), "piezas"],
    ["piezas cero", "CONTEO", false, r("+", "0", null, null, null), "piezas"],
    ["CONTEO con dimensiones", "CONTEO", false, r("+", "2", "1", null, null), "largo"],
    ["LONGITUD con ancho", "LONGITUD", false, r("+", "2", "1", "1", null), "ancho"],
    ["AREA con ancho y alto", "AREA", false, r("+", "1", "2", "1", "1"), "alto"],
    ["AREA sin ancho ni alto", "AREA", false, r("+", "1", "2", null, null), "ancho"],
    ["VOLUMEN sin alto", "VOLUMEN", false, r("+", "1", "2", "1", null), "alto"],
    ["dimensión negativa", "LONGITUD", false, r("+", "1", "-2", null, null), "largo"],
    ["dimensión cero (renglón cero)", "LONGITUD", false, r("+", "1", "0", null, null), "largo"],
  ] as const)("rechaza: %s", (_n, tipo, permite, renglon, campo) => {
    const errores = validarRenglon(tipo, permite, renglon);
    expect(errores.map((e) => e.campo)).toContain(campo);
  });
  it("acepta un descuento si el concepto lo permite", () => {
    expect(validarRenglon("AREA", true, r("-", "1", "1.2", "1", null))).toEqual([]);
  });
});

describe("CR-02 a CR-04 consumos (PC-11 a PC-16)", () => {
  it.each([
    ["PC-11", "11.30", "12.5", "0.05", "141.2500", "148.3125"],
    ["PC-12", "11.30", "5", "0.03", "56.5000", "58.1950"],
    ["PC-13", "1.20", "330", "0.03", "396.0000", "407.8800"],
    ["PC-14", "1.20", "1", "0.05", "1.2000", "1.2600"],
  ])("%s", (_c, cant, rend, desp, neto, conDesp) => {
    const n = cr02Neto(dec(cant), dec(rend), dec("0"));
    expect(t4(n)).toBe(neto);
    expect(t4(cr03ConDesperdicio(n, dec(desp)))).toBe(conDesp);
  });
  it("PC-15: traslape aprobado 10 × 1 × (1 + 0.10) = 11", () => {
    expect(t4(cr02Neto(dec("10"), dec("1"), dec("0.10")))).toBe("11.0000");
  });
  it("PC-16: conversión 20 m × 0.5 kg/m = 10 kg", () => {
    expect(t4(cr04Convertir(dec("20"), dec("0.5")))).toBe("10.0000");
  });
  it("factor: 1 en la unidad base, registrado si existe, null si falta (sin inversas)", () => {
    const conv = [{ insumoId: "I", unidadOrigen: "m", unidadDestino: "kg", factor: "4.2" }];
    expect(factorConversion("I", "kg", "kg", conv)?.toString()).toBe("1");
    expect(factorConversion("I", "kg", "m", conv)?.toString()).toBe("4.2");
    expect(factorConversion("I", "m", "kg", conv)).toBeNull();
    expect(factorConversion("OTRO", "kg", "m", conv)).toBeNull();
  });
});

describe("CR-06 compra por presentación (PC-17 a PC-20)", () => {
  it("PC-17: 148.3125 pza no fraccionable -> 149", () => {
    expect(t2(cr06Compra(dec("148.3125"), dec("1"), false, null).unidades)).toBe("149.00");
  });
  it("PC-18: 466.075 kg / 25 -> 19 bultos", () => {
    expect(t2(cr06Compra(dec("466.075"), dec("25"), false, null).unidades)).toBe("19.00");
  });
  it("PC-19: múltiplo exacto 50 kg / 25 -> 2 bultos, sobrante 0", () => {
    const c = cr06Compra(dec("50.000"), dec("25"), false, null);
    expect(`${t2(c.unidades)}/${t4(c.sobrante)}`).toBe("2.00/0.0000");
  });
  it("PC-20: fraccionable cada 0.25: 1.26 -> 1.50 m³; sobrante 0.24; costo 2,850.00", () => {
    const c = cr06Compra(dec("1.26"), dec("1"), true, dec("0.25"));
    expect(`${t2(c.cantidadComprada)}/${t4(c.sobrante)}/${t2(c.unidades.times(1900))}`).toBe("1.50/0.2400/2850.00");
  });
  it("fraccionable con contenido distinto de 1: unidades = cantidad ÷ contenido", () => {
    const c = cr06Compra(dec("3"), dec("2"), true, dec("0.5"));
    expect(t2(c.unidades)).toBe("1.50");
  });
  it("rechaza contenido o incremento no positivos", () => {
    expect(() => cr06Compra(dec("1"), dec("0"), false, null)).toThrow();
    expect(() => cr06Compra(dec("1"), dec("1"), true, null)).toThrow();
  });
});

describe("CR-08 prorrateo", () => {
  it("la suma es exacta y el último recibe el remanente", () => {
    const partes = cr08Prorratear(dec("100"), [dec("1"), dec("1"), dec("1")]);
    const suma = partes.reduce((a, b) => a.plus(b), dec("0"));
    expect(suma.eq(100)).toBe(true);
    expect(partes[0]!.eq(partes[1]!)).toBe(true);
    expect(partes[2]!.eq(dec("100").minus(partes[0]!).minus(partes[1]!))).toBe(true);
  });
});

describe("CR-09 mano de obra (PC-25 a PC-27)", () => {
  it("PC-25: por unidad 11.30 × $180 = $2,034.00", () => {
    expect(t2(cr09ManoObra("UNIDAD", dec("11.30"), dec("180"), null).costo)).toBe("2034.00");
  });
  it("PC-26: por jornada 1.20/0.60 = 2 jor × $1,500 = $3,000", () => {
    const r = cr09ManoObra("JORNADA", dec("1.20"), dec("1500"), dec("0.60"));
    expect(`${t4(r.jornadas!)}/${t2(r.costo)}`).toBe("2.0000/3000.00");
  });
  it("PC-27: subcontrato 10 × $50 = $500 (acumulado aparte)", () => {
    const r = cr09ManoObra("SUBCONTRATO", dec("10"), dec("50"), null);
    expect(t2(r.costo)).toBe("500.00");
    expect(r.esSubcontrato).toBe(true);
  });
  it("jornadas fraccionarias (recorrido 2: 3.24 / 3.5 = 0.9257 jornadas = $2,221.71)", () => {
    const r = cr09ManoObra("JORNADA", dec("3.24"), dec("2400"), dec("3.5"));
    expect(t4(r.jornadas!)).toBe("0.9257");
    expect(t2(redondearMA(r.costo))).toBe("2221.71");
  });
});

describe("CR-11 a CR-14 y margen", () => {
  it("CR-11/12: adicionales del ejemplo (PC-30): $600 -> $720.00 y $800 -> $960.00", () => {
    const pu1 = cr11PrecioUnitario(dec("600"), dec("0.2"), dec("1"));
    const pu2 = cr11PrecioUnitario(dec("800"), dec("0.2"), dec("1"));
    expect(`${t2(cr12Importe(dec("1"), pu1))}/${t2(cr12Importe(dec("1"), pu2))}`).toBe("720.00/960.00");
  });
  it("CR-13: impuesto redondeado (PC-33)", () => {
    expect(t2(cr13Impuestos(dec("16199.09"), dec("0.16")))).toBe("2591.85");
  });
  it("PC-36: recargo 20 % equivale a margen 16.67 %", () => {
    expect(t4(margenDeRecargo(dec("0.20")))).toBe("0.1667");
  });
  it("margen nulo si la venta es cero", () => {
    expect(margen(dec("0"), dec("10"))).toBeNull();
  });
  it("CR-11 rechaza cantidad no positiva", () => {
    expect(() => cr11PrecioUnitario(dec("1"), dec("0.2"), dec("0"))).toThrow();
  });
});

describe("CR-07 y CR-16 vigencias (PC-41 a PC-43)", () => {
  it("PC-41: 01/10/2026 + 15 = 16/10/2026", () => {
    expect(cr16VigenteHasta("2026-10-01", 15)).toBe("2026-10-16");
  });
  it("PC-42: 20/12/2026 + 15 = 04/01/2027", () => {
    expect(cr16VigenteHasta("2026-12-20", 15)).toBe("2027-01-04");
  });
  it("PC-43: vigente en sus límites y vencido al día siguiente", () => {
    expect(cr07Vigente("2026-10-01", "2026-10-31", "2026-10-01")).toBe(true);
    expect(cr07Vigente("2026-10-01", "2026-10-31", "2026-10-31")).toBe(true);
    expect(cr07Vigente("2026-10-01", "2026-10-31", "2026-11-01")).toBe(false);
  });
  it("valida fechas de calendario y vigencia positiva (BL-14)", () => {
    expect(esFechaISOValida("2026-02-30")).toBe(false);
    expect(esFechaISOValida("2028-02-29")).toBe(true);
    expect(() => cr16VigenteHasta("2026-10-01", 0)).toThrow();
  });
});

describe("igualdad decimal de las ayudas", () => {
  it("1.20 equivale a 1.2", () => igualDecimal("1.20", "1.2"));
});
