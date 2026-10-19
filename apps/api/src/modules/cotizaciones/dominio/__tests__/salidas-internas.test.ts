/**
 * Salidas internas (módulo 14, ADR-0018) armadas con la instantánea de una versión. Las cifras
 * esperadas salen del ejemplo ilustrativo del Word maestro v1.3 §3.14 (fixture `ESPERADO_3_14`),
 * nunca del motor: se comprueban compras, prorrateo, mano de obra, adicionales e indicadores,
 * no solo el total.
 */
import type { EntradaCalculo, ResultadoCalculado } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { dec, redondearMA } from "../../../calculo/domain/decimal.js";
import { calcularCotizacion } from "../../../calculo/domain/motor.js";
import { calculado, trunc4 } from "../../../calculo/domain/__tests__/ayudas.js";
import { ESPERADO_3_14 as E, ejemplo314 } from "../../../calculo/domain/__tests__/fixtures/ejemplo-3-14.js";
import {
  MOTIVO_NO_DISPONIBLE,
  MOTIVO_SIN_NOMBRES,
  aReferenciasInternas,
  codigosDeReferencias,
  construirSalidasInternas,
  type VersionParaSalidas,
} from "../salidas-internas.js";

const SOLICITUD = {
  partidas: [
    { id: "P001", tipo: "CONCEPTO", conceptoCodigo: "CON-00001" },
    { id: "P002", tipo: "CONCEPTO", conceptoCodigo: "CON-00002" },
    { id: "P003", tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001" },
    { id: "P004", tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00002" },
  ],
};

function version(entrada: EntradaCalculo, extra: Partial<VersionParaSalidas> = {}): VersionParaSalidas {
  const resultado = calculado(calcularCotizacion(entrada));
  return {
    versionId: "00000000-0000-4000-8000-000000000001",
    folio: "COT-2026-00001",
    numero: 1,
    origen: "WEB_DEMO",
    resumen: { estado: "BORRADOR", esUltima: true },
    fechaCalculo: entrada.fechaCalculo,
    versionMotor: "motor-1",
    autorNombre: "[DEMO] Preparador",
    creadoEn: "2026-09-23T12:00:00.000Z",
    entradaCalculo: entrada,
    resultadoInterno: resultado,
    solicitudCalculo: SOLICITUD,
    referenciasInternas: null,
    decisiones: new Map(),
    ...extra,
  };
}

const REFERENCIAS = aReferenciasInternas({
  insumos: [{ codigo: "INS-00002", descripcion: "[DEMO] Insumo B", unidadBase: "kg" }],
  productos: [{ codigo: "PCM-00002", descripcion: "[DEMO] Producto B", presentacion: "Bulto 50 kg", unidadCompra: "bulto" }],
  proveedores: [{ codigo: "PRV-00001", nombre: "[DEMO] Proveedor 1" }],
  precios: [{ codigo: "PRE-000002", vigenteDesde: "2026-01-01", vigenteHasta: "2026-12-31" }],
  tarifas: [{ codigo: "TMO-00001", descripcion: "[DEMO] Tarifa por m²" }],
  conceptos: [{ codigo: "CON-00001", descripcion: "[DEMO] Concepto X" }],
  tiposAdicional: [{ codigo: "CAD-00001", descripcion: "[DEMO] Transporte", categoria: "Transporte" }],
});

const valorDe = (i: { estado: string; valor?: string }) => (i.estado === "VALOR" ? i.valor! : null);

describe("compras calculadas (12 COMPRAS, CR-05 a CR-08)", () => {
  const s = construirSalidasInternas(version(ejemplo314()));

  it("consolidadas: K01, K02 y K03 con sus unidades y costos de §3.14; K02 sin partida", () => {
    expect(s.encabezado.consolidarCompras).toBe(true);
    for (const [producto, { unidades, costo }] of Object.entries(E.compras)) {
      const k = s.compras.find((c) => c.producto.codigo === producto)!;
      expect(dec(k.unidades).eq(unidades)).toBe(true);
      expect(dec(k.costoCompra).eq(costo)).toBe(true);
    }
    const b = s.compras.find((c) => c.producto.codigo === "PCM-00002")!;
    expect(b.partida).toBeNull();
    expect(b.insumo.codigo).toBe("INS-00002");
    expect(b.regla).toBe("PAQUETE_COMPLETO");
    expect(s.compras.find((c) => c.producto.codigo === "PCM-00003")!.regla).toBe("FRACCIONABLE");
  });

  it("prorrateo de K02 con precisión completa (4 decimales truncados al mostrar) y suma exacta", () => {
    const b = s.compras.find((c) => c.producto.codigo === "PCM-00002")!;
    expect(b.prorrateo.map((x) => [x.partidaId, trunc4(x.costoProrrateado)])).toEqual([
      ["P001", E.prorrateoPB.P001],
      ["P002", E.prorrateoPB.P002],
    ]);
    expect(b.prorrateo[0]!.costoProrrateado.split(".")[1]!.length).toBeGreaterThan(10);
    expect(s.conciliacion?.prorrateo).toBe(true);
  });

  it("por partida (CR-05 = No): B se compra 3 + 17 = 20 bultos por $2,900.00", () => {
    const n = construirSalidasInternas(version(ejemplo314(false)));
    expect(n.encabezado.consolidarCompras).toBe(false);
    const b = n.compras.filter((c) => c.producto.codigo === "PCM-00002");
    expect(b.map((c) => [c.partida?.id, c.unidades])).toEqual([
      ["P001", E.sinConsolidarPBPorPartida.P001],
      ["P002", E.sinConsolidarPBPorPartida.P002],
    ]);
    const unidades = b.reduce((a, c) => a.plus(c.unidades), dec("0"));
    const costo = b.reduce((a, c) => a.plus(c.costoCompra), dec("0"));
    expect(unidades.eq(E.sinConsolidarPB.unidades)).toBe(true);
    expect(costo.eq(E.sinConsolidarPB.costo)).toBe(true);
    expect(b.every((c) => c.prorrateo.length === 1 && c.prorrateo[0]!.partidaId === c.partida?.id)).toBe(true);
  });

  it("sobrante informado y no descontado (AV-03): cantidad comprada − consumo", () => {
    for (const k of s.compras) {
      expect(dec(k.cantidadComprada).minus(k.consumoTotal).eq(k.sobrante)).toBe(true);
    }
  });
});

describe("detalle del cálculo (13 DETALLE_CALCULO)", () => {
  const s = construirSalidasInternas(version(ejemplo314()));
  const p = (id: string) => s.partidas.find((x) => x.id === id)!;

  it("medición, consumos neto y con desperdicio, y relación consumo → compra", () => {
    expect(dec(p("P001").cantidad).eq(E.cantidades.P001)).toBe(true);
    expect(p("P001").renglones.map((r) => r.resultado)).toEqual(["12.5", "-1.2"]);
    for (const [clave, [neto, conDesp]] of Object.entries(E.consumos)) {
      const [pid, ins] = clave.split("|");
      const c = p(pid!).consumos.find((x) => x.insumo.codigo === ins)!;
      expect(dec(c.consumoNeto).eq(neto)).toBe(true);
      expect(dec(c.consumoConDesperdicio).eq(conDesp)).toBe(true);
      expect(s.compras.some((k) => k.numero === c.compraNumero && k.insumo.codigo === ins)).toBe(true);
    }
  });

  it("mano de obra por unidad y por jornada, adicionales con su categoría, P.U. e importe", () => {
    expect(dec(p("P001").costoManoObra).eq(E.partidas.P001.manoObra)).toBe(true);
    expect(p("P001").manoObra?.modalidad).toBe("UNIDAD");
    expect(dec(p("P002").costoManoObra).eq(E.partidas.P002.manoObra)).toBe(true);
    expect(p("P002").manoObra?.modalidad).toBe("JORNADA");
    expect(dec(p("P002").manoObra!.jornadas!).eq(E.partidas.P002.jornadas)).toBe(true);
    expect(p("P003").tipo).toBe("ADICIONAL");
    expect(p("P003").categoria).toBe("Transporte");
    expect(p("P003").importe).toBe(E.partidas.P003.importe);
    expect(p("P002").precioUnitarioVenta).toBe(E.partidas.P002.pu);
    expect(redondearMA(dec(p("P001").costoMateriales), 4).toFixed(4)).toBe(E.partidas.P001.materiales4);
  });

  it("excepción de rendimiento: valor de catálogo de la versión frente al aplicado, con su decisión", () => {
    const e: EntradaCalculo = {
      ...ejemplo314(),
      excepciones: [{ id: "EXC-1", partidaId: "P001", componenteId: "CMP-00001", campo: "RENDIMIENTO", valorAplicado: "13", estado: "Pendiente" }],
    };
    const x = construirSalidasInternas(version(e, { decisiones: new Map([[1, "AUTORIZADA"]]) }));
    const c = x.partidas[0]!.consumos.find((k) => k.componenteCodigo === "CMP-00001")!;
    expect(c.catalogo?.rendimiento).toBe("12.5");
    expect(c.rendimientoUsado).toBe("13");
    expect(c.ajustes).toEqual([{ numero: 1, campo: "RENDIMIENTO", valorAplicado: "13", estado: "AUTORIZADA" }]);
    const sinDecision = construirSalidasInternas(version(e));
    expect(sinDecision.partidas[0]!.consumos.find((k) => k.componenteCodigo === "CMP-00001")!.ajustes[0]!.estado).toBe("PENDIENTE");
  });
});

describe("indicadores de la versión (10 COTIZAR, 13 B18:L23, 14 A7)", () => {
  const s = construirSalidasInternas(version(ejemplo314()));

  it("costo directo, subtotal, impuestos y total congelados (§3.14)", () => {
    expect(valorDe(s.indicadores.costoDirectoRedondeado)).toBe(E.totales.costoDirectoRedondeado);
    expect(valorDe(s.indicadores.subtotal)).toBe(E.totales.subtotal);
    expect(valorDe(s.indicadores.impuesto.importe)).toBe(E.totales.impuestos);
    expect(valorDe(s.indicadores.total)).toBe(E.totales.total);
  });

  it("desglose sin duplicados: materiales + mano de obra + subcontrato + adicionales = costo directo", () => {
    const suma = ["costoMateriales", "costoManoObra", "costoSubcontrato", "costoAdicional"] as const;
    const total = suma.reduce((a, k) => a.plus(valorDe(s.indicadores[k])!), dec("0"));
    expect(total.eq(valorDe(s.indicadores.costoDirecto)!)).toBe(true);
    expect(dec(valorDe(s.indicadores.costoManoObra)!).eq(dec(E.partidas.P001.manoObra).plus(E.partidas.P002.manoObra))).toBe(true);
    expect(s.indicadores.costosAdicionales).toEqual([
      { categoria: "Transporte", valor: "600" },
      { categoria: "Maquinaria", valor: "800" },
    ]);
    expect(s.conciliacion).toEqual({ categorias: true, importes: true, prorrateo: true });
  });

  it("recargo sobre costo y margen sobre precio por separado (D-07): 20 % frente a 16.67 %", () => {
    expect(valorDe(s.indicadores.recargoSobreCosto)).toBe("0.2");
    expect(redondearMA(dec(valorDe(s.indicadores.margenSobrePrecio)!), 4).toFixed(4)).toBe(E.totales.margen4);
  });

  it("margen con venta 0: NO_APLICA, nunca 0", () => {
    const base = version(ejemplo314());
    const r = structuredClone(base.resultadoInterno) as ResultadoCalculado;
    r.totales.margen = null;
    const x = construirSalidasInternas({ ...base, resultadoInterno: r });
    expect(x.indicadores.margenSobrePrecio.estado).toBe("NO_APLICA");
  });
});

describe("disponibilidad del detalle histórico", () => {
  it("versión sin referencias congeladas: SIN_NOMBRES, solo códigos (no usa el catálogo actual)", () => {
    const s = construirSalidasInternas(version(ejemplo314()));
    expect(s.disponibilidad).toEqual({ estado: "SIN_NOMBRES", motivo: MOTIVO_SIN_NOMBRES });
    expect(s.compras.every((k) => k.producto.nombre === null && k.proveedor.nombre === null && k.precio.vigenteHasta === null)).toBe(true);
    expect(s.compras[0]!.producto.codigo).toBe("PCM-00001");
  });

  it("versión con referencias: COMPLETO, nombres y vigencias congelados", () => {
    const s = construirSalidasInternas(version(ejemplo314(), { referenciasInternas: REFERENCIAS }));
    expect(s.disponibilidad.estado).toBe("COMPLETO");
    const b = s.compras.find((c) => c.producto.codigo === "PCM-00002")!;
    expect(b.producto.nombre).toBe("[DEMO] Producto B");
    expect(b.presentacion).toBe("Bulto 50 kg");
    expect(b.precio.vigenteHasta).toBe("2026-12-31");
    expect(s.partidas[0]!.concepto).toEqual({ codigo: "CON-00001", nombre: "[DEMO] Concepto X" });
    expect(s.partidas[2]!.tipoAdicional).toEqual({ codigo: "CAD-00001", nombre: "[DEMO] Transporte" });
  });

  it.each([
    ["resultado sin compras", (b: VersionParaSalidas) => ({ ...b, resultadoInterno: { ...(b.resultadoInterno as object), compras: undefined } })],
    ["entrada ausente", (b: VersionParaSalidas) => ({ ...b, entradaCalculo: null })],
    ["referencias con otra forma", (b: VersionParaSalidas) => ({ ...b, referenciasInternas: { esquema: 99 } })],
  ])("%s: NO_DISPONIBLE completo, sin cifras parciales", (_, alterar) => {
    const s = construirSalidasInternas(alterar(version(ejemplo314())));
    expect(s.disponibilidad).toEqual({ estado: "NO_DISPONIBLE", motivo: MOTIVO_NO_DISPONIBLE });
    expect(s.compras).toEqual([]);
    expect(s.partidas).toEqual([]);
    expect(s.conciliacion).toBeNull();
    expect(s.indicadores.total.estado).toBe("NO_DISPONIBLE");
    expect(s.indicadores.margenSobrePrecio.estado).toBe("NO_DISPONIBLE");
  });

  it("los códigos a congelar salen de la entrada y de la solicitud del cálculo", () => {
    const c = codigosDeReferencias(ejemplo314(), ["CAD-00002", "CAD-00001", "CAD-00001"]);
    expect(c.productos).toEqual(["PCM-00001", "PCM-00002", "PCM-00003"]);
    expect(c.precios).toEqual(["PRE-000001", "PRE-000002", "PRE-000003"]);
    expect(c.conceptos).toEqual(["CON-00001", "CON-00002"]);
    expect(c.tiposAdicional).toEqual(["CAD-00001", "CAD-00002"]);
    expect(c.tarifas.length).toBeGreaterThan(0);
  });
});
