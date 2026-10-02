/**
 * Cálculo con entradas armadas desde PostgreSQL (solo softarq_test).
 *
 * Los totales esperados proceden de los fixtures verificados del módulo 1 (guía de
 * demostración y evidencias del libro), no del cálculo ejecutado durante la prueba.
 */
import type { EntradaCalculo, ResultadoCalculo } from "@softarq/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import {
  RepositorioCatalogos,
  type ContextoOrganizacion,
  type DatosParametros,
} from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import {
  construirEntradaCalculo,
  type SolicitudCalculo,
} from "../modules/calculo/aplicacion/construir-entrada.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { calcularCotizacion } from "../modules/calculo/domain/motor.js";
import { aVistaComercial } from "../modules/calculo/domain/vista-comercial.js";
import { prismaApp } from "./entorno.js";

const app = prismaApp();
const repo = new RepositorioCatalogos(app);
let demo: ContextoOrganizacion;

beforeAll(async () => {
  // Organización DEMO propia: las altas de estas pruebas no alteran `DEMO`, cuyos conteos
  // verifica catalogos.integracion.test.ts (el orden de los archivos no está garantizado).
  demo = {
    organizacionId: (await cargarDemo(app, { codigo: "DEMO-CALCULO", nombre: "[DEMO] Organización para pruebas de cálculo" }))
      .organizacionId,
  };
});
afterAll(() => app.$disconnect());

/** Tipos de costo adicional del catálogo DEMO por categoría (CAD-00001 a CAD-00003). */
const TIPO_POR_CATEGORIA: Record<string, string> = {
  Transporte: "CAD-00001",
  Maquinaria: "CAD-00002",
  Otro: "CAD-00003",
};

/** Traduce una entrada de fixture a la solicitud por códigos que recibe el ensamblador. */
function solicitudDesdeFixture(e: EntradaCalculo): SolicitudCalculo {
  return {
    fechaCalculo: e.fechaCalculo,
    consolidarCompras: e.parametros.consolidarCompras,
    partidas: e.partidas.map((p) =>
      p.tipo === "CONCEPTO"
        ? { id: p.id, tipo: "CONCEPTO", conceptoCodigo: p.concepto.id, descripcion: p.descripcion, mediciones: p.mediciones }
        : {
            id: p.id,
            tipo: "ADICIONAL",
            tipoAdicionalCodigo: TIPO_POR_CATEGORIA[p.categoria]!,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            monto: p.monto,
          },
    ),
    preciosElegidos: e.selecciones.map((s) => s.precioId),
  };
}

async function entradaDesdeBase(s: SolicitudCalculo, ctx = demo): Promise<EntradaCalculo> {
  const r = await construirEntradaCalculo(repo, ctx, s);
  if (r.estado !== "LISTA") throw new Error(`Ensamblado ${r.estado}: ${JSON.stringify(r)}`);
  return r.entrada;
}

function calculado(r: ResultadoCalculo) {
  if (r.estado !== "CALCULADO") throw new Error(`Se esperaba CALCULADO: ${JSON.stringify(r)}`);
  return r;
}

const PRINCIPALES = [
  "GUIA-R1-FALDONES-10M", // 54,190.68
  "GUIA-R2-ESPESOR-012", // 43,312.16
  "GUIA-R3-SIN-VENTANA", // 22,405.28
  "GUIA-PROPIA-CON-00001", // 4,911.79
] as const;

describe.each(PRINCIPALES)("escenario %s calculado con catálogos de PostgreSQL", (id) => {
  const escenario = ESCENARIOS.find((e) => e.id === id)!;

  it(`total de referencia ${escenario.esperado.total} (${escenario.origen.ubicacion})`, async () => {
    const entrada = await entradaDesdeBase(solicitudDesdeFixture(escenario.entrada));
    const r = calculado(calcularCotizacion(entrada));
    expect(r.totales.costoDirectoRedondeado).toBe(escenario.esperado.costoDirectoRedondeado);
    expect(r.totales.subtotal).toBe(escenario.esperado.subtotal);
    expect(r.totales.impuestos).toBe(escenario.esperado.impuestos);
    expect(r.totales.total).toBe(escenario.esperado.total);
  });

  it("la entrada armada desde la base coincide con la del fixture verificado", async () => {
    const desdeBase = await entradaDesdeBase(solicitudDesdeFixture(escenario.entrada));
    const f = escenario.entrada;
    expect(desdeBase.parametros).toEqual(f.parametros);
    expect(desdeBase.partidas).toEqual(f.partidas);
    expect(desdeBase.excepciones).toEqual(f.excepciones);
    // Misma selección explícita; la base además informa el menor precio vigente (AV-01).
    expect(desdeBase.selecciones.map(({ menorPrecioVigente: _m, ...s }) => s)).toEqual(
      f.selecciones.map(({ menorPrecioVigente: _m, ...s }) => s),
    );
    // Insumos y conversiones: los de la base son el subconjunto que usa el escenario.
    for (const i of desdeBase.insumos) expect(f.insumos).toContainEqual(i);
    for (const c of desdeBase.conversiones) expect(f.conversiones).toContainEqual(c);
    // El resultado completo es idéntico al calculado con el fixture.
    expect(calcularCotizacion(desdeBase)).toEqual(calcularCotizacion(f));
  });
});

describe("selección explícita de precios", () => {
  const base = () => solicitudDesdeFixture(ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!.entrada);

  it("AV-01: con la lámina de $385 (menor vigente $362) se informa el aviso y se conserva la selección (TI-309)", async () => {
    const s = base();
    s.preciosElegidos = s.preciosElegidos.map((p) => (p === "PRE-000007" ? "PRE-000006" : p));
    const entrada = await entradaDesdeBase(s);
    const lamina = entrada.selecciones.find((x) => x.insumoId === "INS-00004")!;
    expect(lamina).toMatchObject({ precioId: "PRE-000006", precioUnitario: "385", menorPrecioVigente: "362" });
    const r = calculado(calcularCotizacion(entrada));
    expect(r.avisos.filter((a) => a.codigo === "AV-01").map((a) => a.referencia)).toEqual(["INS-00004"]);
    expect(r.compras.find((c) => c.productoId === "PCM-00004")?.precioId).toBe("PRE-000006");
  });

  it("un precio anulado bloquea con BL-08 y no se sustituye por otro", async () => {
    await repo.asegurarProveedor(demo, { codigo: "PRV-PRUEBA-A", nombre: "[PRUEBA] Proveedor para anular" });
    await repo.asegurarPrecio(demo, {
      codigo: "PRE-PRUEBA-ANULADO",
      producto: "PCM-00004",
      proveedor: "PRV-PRUEBA-A",
      precioUnitario: "300",
      vigenteDesde: "2026-09-01",
      vigenteHasta: "2027-09-30",
      fuente: "[PRUEBA]",
    });
    await repo.anularPrecio(demo, "PRE-PRUEBA-ANULADO");
    const s = base();
    s.preciosElegidos = s.preciosElegidos.map((p) => (p === "PRE-000007" ? "PRE-PRUEBA-ANULADO" : p));
    const r = await construirEntradaCalculo(repo, demo, s);
    expect(r).toMatchObject({ estado: "BLOQUEADO", problemas: [{ codigo: "BL-08", referencia: "INS-00004" }] });
    expect(r).not.toHaveProperty("entrada");
  });

  it("un proveedor inactivo bloquea con BL-08", async () => {
    await repo.asegurarProveedor(demo, { codigo: "PRV-PRUEBA-I", nombre: "[PRUEBA] Proveedor inactivo" });
    await repo.asegurarPrecio(demo, {
      codigo: "PRE-PRUEBA-INACTIVO",
      producto: "PCM-00004",
      proveedor: "PRV-PRUEBA-I",
      precioUnitario: "350",
      vigenteDesde: "2026-09-01",
      vigenteHasta: "2027-09-30",
      fuente: "[PRUEBA]",
    });
    await repo.cambiarActivoProveedor(demo, "PRV-PRUEBA-I", false);
    const s = base();
    s.preciosElegidos = s.preciosElegidos.map((p) => (p === "PRE-000007" ? "PRE-PRUEBA-INACTIVO" : p));
    expect(await construirEntradaCalculo(repo, demo, s)).toMatchObject({
      estado: "BLOQUEADO",
      problemas: [{ codigo: "BL-08" }],
    });
  });

  it("los precios anulados o de proveedores inactivos no cuentan como menor vigente", async () => {
    const entrada = await entradaDesdeBase(base());
    // $300 (anulado) y $350 (proveedor inactivo) existen, pero el menor vigente válido es $362.
    expect(entrada.selecciones.find((x) => x.insumoId === "INS-00004")?.menorPrecioVigente).toBe("362");
  });

  it("sin precio elegido para un insumo, el motor bloquea con BL-08 (el repositorio no elige)", async () => {
    const s = base();
    s.preciosElegidos = s.preciosElegidos.filter((p) => p !== "PRE-000009");
    const r = calcularCotizacion(await entradaDesdeBase(s));
    expect(r).toMatchObject({ estado: "BLOQUEADO" });
    expect(r.estado === "BLOQUEADO" && r.problemas.map((p) => p.codigo)).toContain("BL-08");
  });
});

describe("bloqueos y proyección comercial con datos de la base", () => {
  const escenario = () => ESCENARIOS.find((e) => e.id === "GUIA-PROPIA-CON-00001")!;
  const demoParametros: DatosParametros = {
    ambiente: "DEMO",
    moneda: "MXN",
    recargoSobreCosto: "0.2",
    impuestoTasa: "0.16",
    impuestoBase: "SUBTOTAL_VENTA",
    impuestoTratamiento: "Ilustrativo: impuesto sobre el subtotal de venta",
    impuestoNombre: "Impuesto (tasa ilustrativa)",
    vigenciaDias: 15,
  };

  it("recargo e impuesto NULL en la base: BL-12 y BL-13, sin importes", async () => {
    await repo.actualizarParametros(demo, {
      ...demoParametros,
      recargoSobreCosto: null,
      impuestoTasa: null,
      impuestoBase: null,
      impuestoTratamiento: null,
      impuestoNombre: null,
    });
    try {
      const r = calcularCotizacion(await entradaDesdeBase(solicitudDesdeFixture(escenario().entrada)));
      expect(r.estado).toBe("BLOQUEADO");
      expect(r.estado === "BLOQUEADO" && r.problemas.map((p) => p.codigo)).toEqual(
        expect.arrayContaining(["BL-12", "BL-13"]),
      );
      expect(r).not.toHaveProperty("totales");
    } finally {
      await repo.actualizarParametros(demo, demoParametros);
    }
  });

  it('recargo "0" guardado es válido y distinto de ausente', async () => {
    await repo.actualizarParametros(demo, { ...demoParametros, recargoSobreCosto: "0" });
    try {
      const entrada = await entradaDesdeBase(solicitudDesdeFixture(escenario().entrada));
      expect(entrada.parametros.recargoSobreCosto).toBe("0");
      expect(calcularCotizacion(entrada).estado).toBe("CALCULADO");
    } finally {
      await repo.actualizarParametros(demo, demoParametros);
    }
  });

  it("BL-04: un concepto no aprobado no se arma", async () => {
    await repo.cambiarEstadoConcepto(demo, "CON-00001", "Borrador");
    try {
      expect(await construirEntradaCalculo(repo, demo, solicitudDesdeFixture(escenario().entrada))).toMatchObject({
        estado: "BLOQUEADO",
        problemas: [{ codigo: "BL-04", referencia: "CON-00001" }],
      });
    } finally {
      await repo.cambiarEstadoConcepto(demo, "CON-00001", "Aprobado");
    }
  });

  it("la vista comercial no contiene catálogos ni costos internos", async () => {
    const r = calculado(calcularCotizacion(await entradaDesdeBase(solicitudDesdeFixture(escenario().entrada))));
    const v = aVistaComercial(r);
    expect(v.total).toBe("4911.79");
    const texto = JSON.stringify(v).toLowerCase();
    for (const prohibido of ["costo", "proveedor", "prv-", "pcm-", "pre-", "ins-", "cmp-", "tmo-", "recargo", "margen", "consumo"]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });
});
