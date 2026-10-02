/**
 * Carga DEMO, restricciones de la base, aislamiento entre organizaciones, decimales y fechas
 * contra PostgreSQL (solo softarq_test).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorDecimalColumna } from "../infraestructura/prisma/decimales.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { COMPONENTES_DEMO, PRECIOS_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import {
  ErrorReferenciaCatalogo,
  RepositorioCatalogos,
  type ContextoOrganizacion,
} from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { construirEntradaCalculo } from "../modules/calculo/aplicacion/construir-entrada.js";
import { prismaApp } from "./entorno.js";

const app = prismaApp();
const repo = new RepositorioCatalogos(app);
let demo: ContextoOrganizacion;
let otra: ContextoOrganizacion;

beforeAll(async () => {
  const r = await cargarDemo(app);
  demo = { organizacionId: r.organizacionId };
  otra = { organizacionId: (await repo.asegurarOrganizacion("PRUEBA-AISLAMIENTO", "[PRUEBA] Segunda organización", false)).id };
});
afterAll(() => app.$disconnect());

const CONTEOS_DEMO = {
  insumos: 11,
  conversiones: 2,
  proveedores: 2,
  productos: 11,
  precios: 17,
  tarifas: 5,
  conceptos: 5,
  componentes: 13,
  tiposAdicional: 3,
  parametros: 1,
};

describe("carga DEMO repetible e idempotente", () => {
  it("la primera carga crea el catálogo completo", async () => {
    expect(await repo.contar(demo)).toEqual(CONTEOS_DEMO);
  });

  it("una segunda y tercera carga no duplican y conservan los datos creados por el usuario", async () => {
    // Registro creado por el «usuario» entre cargas.
    await repo.asegurarInsumo(demo, { codigo: "INS-USUARIO-1", descripcion: "Insumo propio del usuario", unidadBase: "kg" });
    const segunda = await cargarDemo(app);
    const tercera = await cargarDemo(app);
    expect(segunda.creados).toEqual({});
    expect(tercera.creados).toEqual({});
    expect(tercera.diferencias).toEqual([]);
    expect(segunda.organizacionId).toBe(demo.organizacionId);
    expect(await repo.contar(demo)).toEqual({ ...CONTEOS_DEMO, insumos: 12 });
    expect((await repo.obtenerInsumos(demo, ["INS-USUARIO-1"]))[0]?.unidadBase).toBe("kg");
    expect(await app.organizacion.count({ where: { codigo: "DEMO" } })).toBe(1);
  });

  it("los valores guardados son exactamente los del catálogo DEMO", async () => {
    const precios = await repo.obtenerPrecios(demo, PRECIOS_DEMO.map((p) => p.codigo));
    for (const e of PRECIOS_DEMO) {
      const r = precios.find((p) => p.codigo === e.codigo)!;
      expect([r.precioUnitario, r.vigenteDesde, r.vigenteHasta]).toEqual([e.precioUnitario, e.vigenteDesde, e.vigenteHasta]);
    }
    const conceptos = await repo.obtenerConceptos(demo, ["CON-00007"]);
    expect(conceptos[0]!.componentes.map((c) => c.codigo)).toEqual(
      COMPONENTES_DEMO.filter((c) => c.concepto === "CON-00007").map((c) => c.codigo),
    );
    expect(await repo.obtenerParametros(demo)).toEqual({
      ambiente: "DEMO",
      moneda: "MXN",
      recargoSobreCosto: "0.2",
      impuesto: {
        tasa: "0.16",
        base: "SUBTOTAL_VENTA",
        tratamiento: "Ilustrativo: impuesto sobre el subtotal de venta",
        nombre: "Impuesto (tasa ilustrativa)",
      },
      vigenciaDias: 15,
    });
  });
});

describe("restricciones de la base (CHECK, exclusión y unicidad)", () => {
  const ids = async () => {
    const [insumo, concepto, producto, proveedor] = await Promise.all([
      app.insumo.findUniqueOrThrow({ where: { organizacionId_codigo: { organizacionId: demo.organizacionId, codigo: "INS-00004" } } }),
      app.concepto.findUniqueOrThrow({ where: { organizacionId_codigo: { organizacionId: demo.organizacionId, codigo: "CON-00007" } } }),
      app.producto.findUniqueOrThrow({ where: { organizacionId_codigo: { organizacionId: demo.organizacionId, codigo: "PCM-00004" } } }),
      app.proveedor.findUniqueOrThrow({ where: { organizacionId_codigo: { organizacionId: demo.organizacionId, codigo: "PRV-00002" } } }),
    ]);
    return { insumo: insumo.id, concepto: concepto.id, producto: producto.id, proveedor: proveedor.id, org: demo.organizacionId };
  };
  const componente = (i: Awaited<ReturnType<typeof ids>>, extra: Record<string, unknown>) => ({
    organizacionId: i.org,
    codigo: `CMP-CK-${Object.keys(extra).join("-")}`,
    conceptoId: i.concepto,
    insumoId: i.insumo,
    orden: 90,
    rendimiento: "1",
    unidadRendimiento: "m2",
    desperdicio: "0.05",
    fuente: "prueba",
    fecha: new Date(Date.UTC(2026, 9, 2)),
    responsable: "prueba",
    ...extra,
  });

  it("desperdicio = 1 viola el CHECK (0 <= desperdicio < 1)", async () => {
    const i = await ids();
    await expect(app.componente.create({ data: componente(i, { desperdicio: "1" }) as never })).rejects.toThrow();
  });

  it("rendimiento 0 viola el CHECK", async () => {
    const i = await ids();
    await expect(app.componente.create({ data: componente(i, { rendimiento: "0" }) as never })).rejects.toThrow();
  });

  it("precio 0 y vigencia invertida violan los CHECK", async () => {
    const i = await ids();
    const base = {
      organizacionId: i.org,
      productoId: i.producto,
      proveedorId: i.proveedor,
      fuente: "prueba",
    };
    await expect(
      app.precio.create({
        data: { ...base, codigo: "PRE-CK-1", precioUnitario: "0", vigenteDesde: new Date("2030-01-01"), vigenteHasta: new Date("2030-02-01") },
      }),
    ).rejects.toThrow();
    await expect(
      app.precio.create({
        data: { ...base, codigo: "PRE-CK-2", precioUnitario: "1", vigenteDesde: new Date("2030-02-01"), vigenteHasta: new Date("2030-01-01") },
      }),
    ).rejects.toThrow();
  });

  it("dos precios no anulados del mismo producto y proveedor no pueden solaparse (Val_Precio)", async () => {
    const i = await ids();
    // PRE-000007 (PCM-00004, PRV-00002) vale del 2026-09-01 al 2027-09-30.
    await expect(
      app.precio.create({
        data: {
          organizacionId: i.org,
          codigo: "PRE-SOLAPE",
          productoId: i.producto,
          proveedorId: i.proveedor,
          precioUnitario: "370",
          vigenteDesde: new Date("2027-01-01"),
          vigenteHasta: new Date("2027-12-31"),
          fuente: "prueba",
        },
      }),
    ).rejects.toThrow();
  });

  it("tarifa JORNADA sin rendimiento y tarifa UNIDAD con rendimiento violan el CHECK", async () => {
    const t = {
      organizacionId: demo.organizacionId,
      descripcion: "prueba",
      unidad: "m3",
      importe: "100",
      vigenteDesde: new Date("2026-01-01"),
      vigenteHasta: new Date("2026-12-31"),
      fuente: "prueba",
    };
    await expect(app.tarifaManoObra.create({ data: { ...t, codigo: "TMO-CK-1", modalidad: "JORNADA" } })).rejects.toThrow();
    await expect(
      app.tarifaManoObra.create({ data: { ...t, codigo: "TMO-CK-2", modalidad: "UNIDAD", rendimientoJornada: "2" } }),
    ).rejects.toThrow();
  });

  it("parámetros: impuesto incompleto, base distinta, moneda distinta o recargo > 1 violan los CHECK", async () => {
    const o = (await repo.asegurarOrganizacion("PRUEBA-CHECK-PARAM", "[PRUEBA] Parámetros", false)).id;
    const p = { organizacionId: o, ambiente: "DEMO" };
    await expect(app.parametrosCalculo.create({ data: { ...p, impuestoTasa: "0.16" } })).rejects.toThrow();
    await expect(
      app.parametrosCalculo.create({
        data: { ...p, impuestoTasa: "0.16", impuestoBase: "COSTO_DIRECTO", impuestoTratamiento: "x", impuestoNombre: "x" },
      }),
    ).rejects.toThrow();
    await expect(app.parametrosCalculo.create({ data: { ...p, moneda: "USD" } })).rejects.toThrow();
    await expect(app.parametrosCalculo.create({ data: { ...p, recargoSobreCosto: "1.5" } })).rejects.toThrow();
  });

  it("el código es único dentro de la organización", async () => {
    await expect(
      app.insumo.create({
        data: { organizacionId: demo.organizacionId, codigo: "INS-00001", descripcion: "duplicado", unidadBase: "pza" },
      }),
    ).rejects.toThrow();
  });
});

describe("aislamiento entre organizaciones", () => {
  it("la base rechaza relacionar registros de organizaciones distintas (FK compuestas)", async () => {
    const insumoDemo = await app.insumo.findUniqueOrThrow({
      where: { organizacionId_codigo: { organizacionId: demo.organizacionId, codigo: "INS-00006" } },
    });
    await expect(
      app.conversion.create({
        data: {
          organizacionId: otra.organizacionId,
          insumoId: insumoDemo.id,
          unidadOrigen: "m",
          unidadDestino: "kg",
          factor: "1",
          fuente: "intento entre organizaciones",
        },
      }),
    ).rejects.toThrow();
  });

  it("el repositorio no ve los códigos de otra organización y no puede usarlos como referencia", async () => {
    expect(await repo.obtenerConceptos(otra, ["CON-00007"])).toEqual([]);
    expect(await repo.obtenerPrecios(otra, ["PRE-000007"])).toEqual([]);
    await expect(
      repo.asegurarProducto(otra, {
        codigo: "PCM-X",
        insumo: "INS-00004",
        descripcion: "x",
        presentacion: "x",
        unidadCompra: "pza",
        contenido: "1",
        fraccionable: false,
        incrementoMinimo: null,
      }),
    ).rejects.toThrow(ErrorReferenciaCatalogo);
  });

  it("cada organización ve solo sus registros con el mismo código", async () => {
    await repo.asegurarInsumo(otra, { codigo: "INS-00001", descripcion: "[PRUEBA] Mismo código, otra organización", unidadBase: "kg" });
    expect((await repo.obtenerInsumos(otra, ["INS-00001"]))[0]?.unidadBase).toBe("kg");
    expect((await repo.obtenerInsumos(demo, ["INS-00001"]))[0]?.unidadBase).toBe("pza");
  });

  it("el ensamblador devuelve NO_ENCONTRADO con catálogos de otra organización", async () => {
    const r = await construirEntradaCalculo(repo, otra, {
      fechaCalculo: "2026-09-25",
      consolidarCompras: true,
      partidas: [
        { id: "P001", tipo: "CONCEPTO", conceptoCodigo: "CON-00007", mediciones: [] },
      ],
      preciosElegidos: ["PRE-000007"],
    });
    expect(r.estado).toBe("NO_ENCONTRADO");
  });
});

describe("decimales sin pérdida de precisión", () => {
  it("ida y vuelta exacta con los máximos de cada columna", async () => {
    await repo.asegurarInsumo(otra, { codigo: "INS-DEC", descripcion: "decimales", unidadBase: "kg" });
    await repo.asegurarConversion(otra, {
      insumo: "INS-DEC",
      unidadOrigen: "m",
      unidadDestino: "kg",
      factor: "0.0000000001",
      fuente: "prueba",
    });
    await repo.asegurarProducto(otra, {
      codigo: "PCM-DEC",
      insumo: "INS-DEC",
      descripcion: "x",
      presentacion: "x",
      unidadCompra: "pza",
      contenido: "99999999999999.999999",
      fraccionable: true,
      incrementoMinimo: "0.000001",
    });
    await repo.asegurarProveedor(otra, { codigo: "PRV-DEC", nombre: "x" });
    await repo.asegurarPrecio(otra, {
      codigo: "PRE-DEC",
      producto: "PCM-DEC",
      proveedor: "PRV-DEC",
      precioUnitario: "999999999999.999999",
      vigenteDesde: "2026-01-01",
      vigenteHasta: "2026-12-31",
      fuente: "prueba",
    });
    const [precio] = await repo.obtenerPrecios(otra, ["PRE-DEC"]);
    expect(precio?.precioUnitario).toBe("999999999999.999999");
    expect(precio?.producto.contenido).toBe("99999999999999.999999");
    expect(precio?.producto.incrementoMinimo).toBe("0.000001");
    const [conv] = await repo.obtenerConversiones(otra, ["INS-DEC"]);
    expect(conv?.factor).toBe("0.0000000001");
  });

  it("un valor con más escala que la columna se rechaza antes de llegar a PostgreSQL (sin redondeo)", async () => {
    await expect(
      repo.asegurarPrecio(otra, {
        codigo: "PRE-ESCALA",
        producto: "PCM-DEC",
        proveedor: "PRV-DEC",
        precioUnitario: "1.0000001",
        vigenteDesde: "2027-01-01",
        vigenteHasta: "2027-12-31",
        fuente: "prueba",
      }),
    ).rejects.toThrow(ErrorDecimalColumna);
    expect(await repo.obtenerPrecios(otra, ["PRE-ESCALA"])).toEqual([]);
  });

  it("NULL, ausente y cero se distinguen en los parámetros", async () => {
    const o = { organizacionId: (await repo.asegurarOrganizacion("PRUEBA-NULOS", "[PRUEBA] Nulos", false)).id };
    expect(await repo.obtenerParametros(o)).toBeNull();
    await repo.asegurarParametros(o, {
      ambiente: "PRODUCCION",
      moneda: "MXN",
      recargoSobreCosto: null,
      impuestoTasa: null,
      impuestoBase: null,
      impuestoTratamiento: null,
      impuestoNombre: null,
      vigenciaDias: null,
    });
    expect(await repo.obtenerParametros(o)).toMatchObject({ recargoSobreCosto: null, impuesto: null });
    await repo.actualizarParametros(o, {
      ambiente: "PRODUCCION",
      moneda: "MXN",
      recargoSobreCosto: "0",
      impuestoTasa: "0",
      impuestoBase: "SUBTOTAL_VENTA",
      impuestoTratamiento: "x",
      impuestoNombre: "x",
      vigenciaDias: 15,
    });
    expect(await repo.obtenerParametros(o)).toMatchObject({ recargoSobreCosto: "0", impuesto: { tasa: "0" } });
  });
});

describe("fechas de vigencia sin desplazamiento por zona horaria", () => {
  it.each(["America/Mexico_City", "Pacific/Kiritimati", "UTC"])("TZ=%s: las vigencias se leen igual", async (tz) => {
    const anterior = process.env["TZ"];
    process.env["TZ"] = tz;
    try {
      const [p5, p7] = await Promise.all([
        repo.obtenerPrecios(demo, ["PRE-000005"]),
        repo.obtenerPrecios(demo, ["PRE-000007"]),
      ]);
      expect([p5[0]?.vigenteDesde, p5[0]?.vigenteHasta]).toEqual(["2026-08-01", "2026-09-15"]);
      expect([p7[0]?.vigenteDesde, p7[0]?.vigenteHasta]).toEqual(["2026-09-01", "2027-09-30"]);
    } finally {
      if (anterior === undefined) delete process.env["TZ"];
      else process.env["TZ"] = anterior;
    }
  });

  it("vigencia con límites incluidos: PRE-000005 (vencido el 15/09/2026) solo cuenta hasta ese día", async () => {
    const el15 = await repo.obtenerPreciosVigentesDeProductos(demo, ["PCM-00003"], "2026-09-15");
    const el16 = await repo.obtenerPreciosVigentesDeProductos(demo, ["PCM-00003"], "2026-09-16");
    expect(el15.map((p) => p.codigo)).toEqual(["PRE-000003", "PRE-000005"]);
    expect(el16.map((p) => p.codigo)).toEqual(["PRE-000003"]);
  });
});
