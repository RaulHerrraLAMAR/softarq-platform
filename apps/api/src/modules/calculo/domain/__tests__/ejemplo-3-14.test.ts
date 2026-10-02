/**
 * Motor completo con el ejemplo ilustrativo del Word maestro v1.3 §3.14
 * (casos internos PC-21 a PC-40 del libro).
 */
import { describe, expect, it } from "vitest";
import { Dec, dec, redondearMA } from "../decimal.js";
import { calcularCotizacion } from "../motor.js";
import { calculado, codigos, igualDecimal, trunc4 } from "./ayudas.js";
import { ESPERADO_3_14 as E, ejemplo314 } from "./fixtures/ejemplo-3-14.js";

describe("Ejemplo §3.14 con compras consolidadas", () => {
  const r = calculado(calcularCotizacion(ejemplo314()));
  const partida = (id: string) => r.partidas.find((p) => p.id === id)!;

  it("PC-07/08: cantidades 11.30 m² y 1.20 m³", () => {
    igualDecimal(partida("P001").cantidad, E.cantidades.P001);
    igualDecimal(partida("P002").cantidad, E.cantidades.P002);
    expect(partida("P001").renglones.map((x) => x.resultado)).toEqual(["12.5", "-1.2"]);
  });

  it("PC-11 a PC-14: consumos neto y con desperdicio", () => {
    for (const [clave, [neto, conDesp]] of Object.entries(E.consumos)) {
      const [pid, ins] = clave.split("|");
      const c = r.consumos.find((x) => x.partidaId === pid && x.insumoId === ins)!;
      igualDecimal(c.consumoNeto, neto);
      igualDecimal(c.consumoConDesperdicio, conDesp);
    }
  });

  it("PC-21 a PC-23: compras K01, K02 (consolidada) y K03", () => {
    for (const [prod, { unidades, costo }] of Object.entries(E.compras)) {
      const k = r.compras.find((c) => c.productoId === prod)!;
      igualDecimal(k.unidades, unidades);
      igualDecimal(k.costoCompra, costo);
    }
    expect(r.compras.find((c) => c.productoId === "PCM-00002")!.partidaId).toBeNull();
    expect(r.compras.map((c) => c.numero)).toEqual([1, 2, 3]);
  });

  it("PC-24: prorrateo de K02 con precisión completa y suma exacta", () => {
    const b = r.consumos.filter((c) => c.insumoId === "INS-00002");
    expect(trunc4(b[0]!.costoProrrateado)).toBe(E.prorrateoPB.P001);
    expect(trunc4(b[1]!.costoProrrateado)).toBe(E.prorrateoPB.P002);
    igualDecimal(dec(b[0]!.costoProrrateado).plus(b[1]!.costoProrrateado).toString(), "2755");
    // Precisión completa: el prorrateo no se recorta a 2 decimales.
    expect(b[0]!.costoProrrateado.split(".")[1]!.length).toBeGreaterThan(10);
  });

  it("PC-25/26: mano de obra por unidad y por jornada", () => {
    igualDecimal(partida("P001").costoManoObra, E.partidas.P001.manoObra);
    igualDecimal(partida("P002").costoManoObra, E.partidas.P002.manoObra);
    igualDecimal(partida("P002").jornadas, E.partidas.P002.jornadas);
  });

  it("materiales por partida (§3.14: 1,804.1945… y 5,261.0055…, mostrados redondeados a 4 decimales)", () => {
    // El Word redondea esta columna (1804.194475… -> 1804.1945) aunque trunca el prorrateo
    // (343.994475… -> 343.9944). Ver docs/calculo/matriz-reglas.md, discrepancia 9.
    const r4 = (x: string) => redondearMA(dec(x), 4).toFixed(4);
    expect(r4(partida("P001").costoMateriales)).toBe(E.partidas.P001.materiales4);
    expect(r4(partida("P002").costoMateriales)).toBe(E.partidas.P002.materiales4);
    expect(partida("P001").costoMateriales.startsWith("1804.194475")).toBe(true);
  });

  it("PC-28 a PC-30: P.U. e importes", () => {
    for (const id of ["P001", "P002", "P003", "P004"] as const) {
      expect(partida(id).precioUnitarioVenta).toBe(E.partidas[id].pu);
      expect(partida(id).importe).toBe(E.partidas[id].importe);
    }
  });

  it("PC-31 a PC-35: costo directo, subtotal, impuestos, total y margen", () => {
    expect(r.totales.costoDirectoRedondeado).toBe(E.totales.costoDirectoRedondeado);
    expect(r.totales.subtotal).toBe(E.totales.subtotal);
    expect(r.totales.impuestos).toBe(E.totales.impuestos);
    expect(r.totales.total).toBe(E.totales.total);
    expect(trunc4(redondearMA(new Dec(r.totales.margen!), 4).toString())).toBe(E.totales.margen4);
  });

  it("PC-37: sin redondear el P.U., P001 daría $4,605.83 (el motor da $4,605.88)", () => {
    const sinRedondearPU = redondearMA(dec(partida("P001").costoDirecto).times("1.2"), 2);
    expect(sinRedondearPU.toFixed(2)).toBe("4605.83");
    expect(partida("P001").importe).toBe("4605.88");
  });

  it("PC-38: verificación cruzada (suma de importes = subtotal; total = subtotal + impuestos)", () => {
    const suma = r.partidas.reduce((a, p) => a.plus(p.importe), dec("0"));
    expect(suma.eq(r.totales.subtotal)).toBe(true);
    expect(dec(r.totales.subtotal).plus(r.totales.impuestos).eq(r.totales.total)).toBe(true);
  });

  it("AV-03: informa el sobrante de las presentaciones", () => {
    expect(r.avisos.filter((a) => a.codigo === "AV-03")).toHaveLength(3);
  });

  it("conserva los parámetros DEMO usados", () => {
    expect(r.parametros).toMatchObject({ ambiente: "DEMO", recargoSobreCosto: "0.2", consolidarCompras: true });
    expect(r.parametros.impuesto).toMatchObject({ tasa: "0.16", base: "SUBTOTAL_VENTA" });
  });
});

describe("Ejemplo §3.14 sin consolidar (PC-39)", () => {
  it("B se compra por separado: 3 + 17 = 20 bultos, $2,900.00", () => {
    const r = calculado(calcularCotizacion(ejemplo314(false)));
    const pb = r.compras.filter((c) => c.productoId === "PCM-00002");
    expect(pb.map((c) => [c.partidaId, c.unidades])).toEqual([
      ["P001", "3"],
      ["P002", "17"],
    ]);
    const unidades = pb.reduce((a, c) => a.plus(c.unidades), dec("0"));
    const costo = pb.reduce((a, c) => a.plus(c.costoCompra), dec("0"));
    igualDecimal(unidades.toString(), E.sinConsolidarPB.unidades);
    igualDecimal(costo.toString(), E.sinConsolidarPB.costo);
  });
});

describe("PC-40: sin recargo definido no se calcula precio", () => {
  it("devuelve BL-12 (y BL-13 sin impuesto), sin importes parciales", () => {
    const base = ejemplo314();
    const r = calcularCotizacion({ ...base, parametros: { ...base.parametros, recargoSobreCosto: null, impuesto: null } });
    expect(r.estado).toBe("BLOQUEADO");
    expect(codigos(r)).toEqual(expect.arrayContaining(["BL-12", "BL-13"]));
    expect(r).not.toHaveProperty("totales");
  });
});
