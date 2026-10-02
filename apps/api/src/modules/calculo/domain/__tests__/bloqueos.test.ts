/**
 * Bloqueos del cálculo (Word maestro §3.11) y validación de la entrada.
 * Base: el ejemplo §3.14, que se calcula sin bloqueos.
 */
import type { EntradaCalculo, PartidaConceptoEntrada } from "@softarq/contracts";
import { LIMITES_ENTRADA_CALCULO } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { dec } from "../decimal.js";
import { calcularCotizacion } from "../motor.js";
import { calculado, codigos, igualDecimal } from "./ayudas.js";
import { adicional, entrada, partidaConcepto, renglon } from "./fixtures/construir.js";
import { ejemplo314 } from "./fixtures/ejemplo-3-14.js";

function conPartida0(cambio: (p: PartidaConceptoEntrada) => PartidaConceptoEntrada): EntradaCalculo {
  const e = ejemplo314();
  const [p0, ...resto] = e.partidas;
  return { ...e, partidas: [cambio(p0 as PartidaConceptoEntrada), ...resto] };
}

function bloqueado(e: unknown, codigo: string): void {
  const r = calcularCotizacion(e);
  expect(r.estado, JSON.stringify(r)).toBe("BLOQUEADO");
  expect(codigos(r)).toContain(codigo);
  expect(r).not.toHaveProperty("totales");
}

function invalida(e: unknown, ruta: string): void {
  const r = calcularCotizacion(e);
  expect(r.estado, JSON.stringify(r)).toBe("ENTRADA_INVALIDA");
  expect(codigos(r)).toContain(ruta);
}

describe("BL-03: una cotización vacía nunca vale cero", () => {
  it("sin partidas", () => bloqueado(entrada({ fechaCalculo: "2026-09-23", partidas: [], precios: [] }), "BL-03"));
  it("partida sin medición", () => bloqueado(conPartida0((p) => ({ ...p, mediciones: [] })), "BL-03"));
  it("cantidad total <= 0 por descuentos", () =>
    bloqueado(
      conPartida0((p) => ({
        ...p,
        mediciones: [renglon("a", "+", "1", "1", "1", null), renglon("b", "-", "1", "2", "1", null)],
      })),
      "BL-03",
    ));
  it("adicional con cantidad 0", () => {
    const e = ejemplo314();
    e.partidas[2] = adicional("P003", "Transporte", "Transporte", "viaje", "0", "600");
    bloqueado(e, "BL-03");
  });
});

describe("BL-05: rendimiento y desperdicio trazables", () => {
  it.each([
    ["rendimiento 0", { rendimiento: "0" }],
    ["desperdicio 1", { desperdicio: "1" }],
    ["desperdicio negativo", { desperdicio: "-0.01" }],
    ["traslape negativo", { factorTraslape: "-0.1" }],
  ])("%s", (_n, cambio) => {
    bloqueado(
      conPartida0((p) => ({ ...p, componentes: p.componentes.map((c, i) => (i === 0 ? { ...c, ...cambio } : c)) })),
      "BL-05",
    );
  });
});

describe("BL-06: unidades y conversiones", () => {
  it("falta la conversión de la unidad del rendimiento", () => {
    bloqueado(
      conPartida0((p) => ({
        ...p,
        componentes: p.componentes.map((c, i) => (i === 0 ? { ...c, unidadRendimiento: "kg" } : c)),
      })),
      "BL-06",
    );
  });
  it("la tarifa está en otra unidad que la partida", () => {
    bloqueado(conPartida0((p) => ({ ...p, tarifaManoObra: { ...p.tarifaManoObra!, unidad: "m3" } })), "BL-06");
  });
  it("la unidad del concepto no corresponde a su fórmula", () => {
    bloqueado(conPartida0((p) => ({ ...p, concepto: { ...p.concepto, unidad: "m3" } })), "BL-06");
  });
});

describe("BL-08: el motor nunca elige un precio", () => {
  it("insumo sin selección confirmada", () => {
    const e = ejemplo314();
    bloqueado({ ...e, selecciones: e.selecciones.filter((s) => s.insumoId !== "INS-00001") }, "BL-08");
  });
});

describe("BL-10: tarifa de mano de obra", () => {
  it("sin tarifa", () => bloqueado(conPartida0((p) => ({ ...p, tarifaManoObra: null })), "BL-10"));
  it("tarifa inactiva", () =>
    bloqueado(conPartida0((p) => ({ ...p, tarifaManoObra: { ...p.tarifaManoObra!, activa: false } })), "BL-10"));
  it("tarifa fuera de vigencia a la fecha de cálculo explícita", () =>
    bloqueado({ ...ejemplo314(), fechaCalculo: "2027-04-01" }, "BL-10"));
  it("vigente en el último día", () => {
    expect(calcularCotizacion({ ...ejemplo314(), fechaCalculo: "2027-03-31" }).estado).toBe("CALCULADO");
  });
});

describe("BL-11: costo adicional sin monto", () => {
  it("monto 0", () => {
    const e = ejemplo314();
    e.partidas[3] = adicional("P004", "Maquinaria", "Maquinaria", "dia", "1", "0");
    bloqueado(e, "BL-11");
  });
});

describe("BL-12 y BL-13: ausencia no es cero", () => {
  const conParametros = (cambio: Partial<EntradaCalculo["parametros"]>) => {
    const e = ejemplo314();
    return { ...e, parametros: { ...e.parametros, ...cambio } };
  };
  it("recargo null bloquea", () => bloqueado(conParametros({ recargoSobreCosto: null }), "BL-12"));
  it("recargo fuera de 0..1 bloquea", () => bloqueado(conParametros({ recargoSobreCosto: "1.5" }), "BL-12"));
  it("recargo 0 explícito es válido: P.U. = costo ÷ cantidad redondeado", () => {
    const r = calculado(calcularCotizacion(conParametros({ recargoSobreCosto: "0" })));
    expect(r.partidas.find((p) => p.id === "P003")!.importe).toBe("600.00");
    expect(r.parametros.recargoSobreCosto).toBe("0");
    // El margen no es exactamente 0: el P.U. se redondea a centavos (CR-11).
    expect(r.totales.margen).not.toBeNull();
    expect(dec(r.totales.margen!).abs().lt("0.001")).toBe(true);
  });
  it("impuesto null bloquea", () => bloqueado(conParametros({ impuesto: null }), "BL-13"));
  it("tasa > 1 bloquea", () =>
    bloqueado(conParametros({ impuesto: { ...ejemplo314().parametros.impuesto!, tasa: "1.16" } }), "BL-13"));
  it("base distinta de SUBTOTAL_VENTA bloquea (no se inventan bases)", () =>
    bloqueado(conParametros({ impuesto: { ...ejemplo314().parametros.impuesto!, base: "COSTO_DIRECTO" } }), "BL-13"));
  it("tasa 0 explícita es válida", () => {
    const r = calculado(
      calcularCotizacion(conParametros({ impuesto: { ...ejemplo314().parametros.impuesto!, tasa: "0" } })),
    );
    expect(r.totales.impuestos).toBe("0.00");
    expect(r.totales.total).toBe(r.totales.subtotal);
  });
});

describe("excepciones de rendimiento (§3.10)", () => {
  // Excepción ilustrativa de la guía (recorrido 3): block a 13 pza/m².
  const conExcepcion = (estado: "Pendiente" | "Autorizada" | "Rechazada", campo = "RENDIMIENTO" as const) => ({
    ...ejemplo314(),
    excepciones: [
      { id: "EXC-1", partidaId: "P001", componenteId: "CMP-00001", campo, valorAplicado: "13", estado },
    ],
  });
  it.each(["Pendiente", "Autorizada"] as const)("%s: se aplica y queda trazada", (estado) => {
    const r = calculado(calcularCotizacion(conExcepcion(estado)));
    const c = r.consumos.find((x) => x.componenteId === "CMP-00001")!;
    igualDecimal(c.rendimientoUsado, "13");
    igualDecimal(c.consumoNeto, "146.9"); // 11.30 × 13
    expect(c.excepcionIds).toEqual(["EXC-1"]);
  });
  it("Rechazada: no se aplica", () => {
    const r = calculado(calcularCotizacion(conExcepcion("Rechazada")));
    const c = r.consumos.find((x) => x.componenteId === "CMP-00001")!;
    igualDecimal(c.rendimientoUsado, "12.5");
    expect(c.excepcionIds).toEqual([]);
  });
  it("una excepción de desperdicio fuera de rango bloquea (BL-05)", () => {
    const e = ejemplo314();
    bloqueado(
      {
        ...e,
        excepciones: [
          { id: "EXC-2", partidaId: "P001", componenteId: "CMP-00001", campo: "DESPERDICIO", valorAplicado: "1", estado: "Autorizada" },
        ],
      },
      "BL-05",
    );
  });
});

describe("ENTRADA_INVALIDA: formato, estructura y límites", () => {
  it("no es un objeto", () => invalida(null, "entrada"));
  it("decimal con coma", () => {
    const e = ejemplo314();
    invalida({ ...e, parametros: { ...e.parametros, recargoSobreCosto: "0,2" } }, "parametros.recargoSobreCosto");
  });
  it("número JavaScript en lugar de texto", () => {
    const e = ejemplo314();
    invalida({ ...e, parametros: { ...e.parametros, recargoSobreCosto: 0.2 } }, "parametros.recargoSobreCosto");
  });
  it("recargo ausente (undefined) no se interpreta como cero", () => {
    const e = ejemplo314();
    const { recargoSobreCosto: _omitido, ...sin } = e.parametros;
    invalida({ ...e, parametros: sin }, "parametros.recargoSobreCosto");
  });
  it("consolidarCompras sin valor explícito", () => {
    const e = ejemplo314();
    const { consolidarCompras: _omitido, ...sin } = e.parametros;
    invalida({ ...e, parametros: sin }, "parametros.consolidarCompras");
  });
  it("fecha imposible", () => invalida({ ...ejemplo314(), fechaCalculo: "2026-02-30" }, "fechaCalculo"));
  it("renglón inválido: AREA con ancho y alto", () =>
    invalida(
      conPartida0((p) => ({ ...p, mediciones: [renglon("x", "+", "1", "2", "1", "1")] })),
      "partidas[0].mediciones[0].alto",
    ));
  it("renglón inválido: descuento en concepto que no lo permite", () => {
    const e = ejemplo314();
    const p1 = e.partidas[1] as PartidaConceptoEntrada;
    e.partidas[1] = { ...p1, mediciones: [...p1.mediciones, renglon("v", "-", "1", "0.1", "0.1", "0.1")] };
    invalida(e, "partidas[1].mediciones[1].signo");
  });
  it("precio no positivo", () => {
    const e = ejemplo314();
    invalida(
      { ...e, selecciones: e.selecciones.map((s, i) => (i === 0 ? { ...s, precioUnitario: "0" } : s)) },
      "selecciones[0].precioUnitario",
    );
  });
  it("dos selecciones para el mismo insumo (CR-07: una por insumo)", () => {
    const e = ejemplo314();
    invalida({ ...e, selecciones: [...e.selecciones, e.selecciones[0]!] }, "selecciones[3].insumoId");
  });
  it("producto fraccionable sin incremento", () => {
    const e = ejemplo314();
    invalida(
      { ...e, selecciones: e.selecciones.map((s, i) => (i === 2 ? { ...s, incrementoMinimo: null } : s)) },
      "selecciones[2].incrementoMinimo",
    );
  });
  it("componente con insumo inexistente", () =>
    invalida(
      conPartida0((p) => ({ ...p, componentes: p.componentes.map((c, i) => (i === 0 ? { ...c, insumoId: "X" } : c)) })),
      "partidas[0].componentes[0].insumoId",
    ));
  it("unidad desconocida", () =>
    invalida(conPartida0((p) => ({ ...p, concepto: { ...p.concepto, unidad: "pie2" } })), "partidas[0].concepto.unidad"));
  it("JORNADA sin rendimiento por jornada", () => {
    const e = ejemplo314();
    const p1 = e.partidas[1] as PartidaConceptoEntrada;
    e.partidas[1] = { ...p1, tarifaManoObra: { ...p1.tarifaManoObra!, rendimientoJornada: null } };
    invalida(e, "partidas[1].tarifaManoObra.rendimientoJornada");
  });
  it("partidas duplicadas", () => {
    const e = ejemplo314();
    invalida({ ...e, partidas: [...e.partidas, e.partidas[0]!] }, "partidas[4].id");
  });
  it(`más de ${LIMITES_ENTRADA_CALCULO.renglonesPorPartida} renglones en una partida`, () => {
    const muchos = Array.from({ length: LIMITES_ENTRADA_CALCULO.renglonesPorPartida + 1 }, () =>
      renglon("r", "+", "1", "1", "1", null),
    );
    invalida(conPartida0((p) => ({ ...p, mediciones: muchos })), "partidas[0].mediciones");
  });
  it(`más de ${LIMITES_ENTRADA_CALCULO.partidas} partidas`, () => {
    const partidas = Array.from({ length: LIMITES_ENTRADA_CALCULO.partidas + 1 }, (_, i) =>
      partidaConcepto(`P${i}`, "CON-00001", "x", [renglon("r", "+", "1", "1", "1", null)]),
    );
    invalida({ ...ejemplo314(), partidas }, "partidas");
  });
  it("demasiados dígitos", () => {
    const e = ejemplo314();
    invalida(
      { ...e, selecciones: e.selecciones.map((s, i) => (i === 0 ? { ...s, precioUnitario: "1234567890123456" } : s)) },
      "selecciones[0].precioUnitario",
    );
  });
});
