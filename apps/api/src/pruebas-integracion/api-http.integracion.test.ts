/**
 * Pruebas HTTP de extremo a extremo: validación → controladores → ensamblador → PostgreSQL
 * (solo softarq_test, con la protección de destino existente) → motor → proyección comercial.
 *
 * Los totales esperados proceden de los fixtures verificados (guía de demostración y evidencias
 * del libro), no de cálculos hechos durante la prueba.
 *
 * Módulo 5 (ADR-0007): las solicitudes se hacen con la sesión de un Preparador de la organización
 * de prueba DEMO-HTTP, obtenida con el flujo real de acceso (sin atajos). La autenticación, la
 * autorización y el aislamiento por sesión tienen sus propias pruebas (autenticacion.*, aislamiento.*).
 */
import type { INestApplication } from "@nestjs/common";
import {
  EsquemaRespuestaCalculoDemo,
  EsquemaRespuestaConceptos,
  EsquemaRespuestaError,
  EsquemaRespuestaOpcionesPrecio,
  EsquemaRespuestaTiposAdicional,
  type SolicitudCalculoDemo,
} from "@softarq/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion, type ConfiguracionApi } from "../config/entorno.js";
import { crearAplicacion, type OpcionesAplicacion } from "../http/crear-aplicacion.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { PRECIOS_DEMO, TARIFAS_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import {
  RepositorioCatalogos,
  type ContextoOrganizacion,
  type DatosParametros,
} from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { calcularCotizacion } from "../modules/calculo/domain/motor.js";
import { aVistaComercial } from "../modules/calculo/domain/vista-comercial.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, ORIGEN_PERMITIDO, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { solicitudDemoDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
/** Organización DEMO exclusiva de estas pruebas: no altera los datos de `DEMO` que verifican otras pruebas. */
const ORG_HTTP = { codigo: "DEMO-HTTP", nombre: "[DEMO] Organización para pruebas HTTP" };
const ORIGEN_AJENO = "http://evil.example.test";

const prisma = prismaApp();
const repo = new RepositorioCatalogos(prisma);
let demo: ContextoOrganizacion;
let migrador: ClientePrisma;
let preparador: Credencial;

function configuracion(extra: Partial<ConfiguracionApi> = {}): ConfiguracionApi {
  return {
    ...leerConfiguracion({
      DATABASE_URL: urlDePrueba("DATABASE_URL"),
      API_REGISTRO: "ninguno",
    }),
    ...extra,
  };
}

async function iniciar(extra: Partial<ConfiguracionApi> = {}, opciones: OpcionesAplicacion = {}) {
  const app: INestApplication = await crearAplicacion(configuracion(extra), { reloj: new RelojFijo(FECHA), ...opciones });
  await app.listen(0, "127.0.0.1");
  return { app, url: (await app.getUrl()).replace("[::1]", "127.0.0.1") };
}

let api: { app: INestApplication; url: string };
/** Sesión de un Preparador de DEMO-HTTP (capacidad calculo.ejecutar). */
let cliente: ClienteHttp;

beforeAll(async () => {
  demo = { organizacionId: (await cargarDemo(prisma, ORG_HTTP)).organizacionId };
  migrador = await prismaMigrador();
  const creadas = await crearCuentas(migrador, ORG_HTTP.codigo, [
    cuenta("preparador.http@softarq.test", "[DEMO] Preparador HTTP", "PREPARADOR"),
  ]);
  preparador = creadas["preparador.http@softarq.test"]!;
  api = await iniciar();
  cliente = await new ClienteHttp(api.url).entrar(preparador);
});
afterAll(async () => {
  await api.app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
});

async function post(cuerpo: unknown, c: ClienteHttp = cliente) {
  return c.post("/api/v1/calculos/demo", cuerpo);
}

async function get(ruta: string, c: ClienteHttp = cliente) {
  return c.get(ruta);
}

/** Ninguna respuesta pública contiene costos internos, proveedores en el cálculo ni precios de compra. */
const CLAVES_INTERNAS = /^(costo|consumo|margen|recargo|rendimiento|desperdicio|sobrante|tarifa|excepcion|contenido|compras?$|proveedor|precioId|productoId)/i;
const PRECIOS_COMPRA = PRECIOS_DEMO.map((p) => p.precioUnitario);
const IMPORTES_TARIFA = TARIFAS_DEMO.map((t) => t.importe);

function clavesDe(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => clavesDe(x, acc));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (acc.push(k), clavesDe(v, acc));
  return acc;
}
function valoresDe(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => valoresDe(x, acc));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => valoresDe(v, acc));
  else acc.push(String(o));
  return acc;
}
function sinDatosInternos(cuerpo: unknown): void {
  expect(clavesDe(cuerpo).filter((k) => CLAVES_INTERNAS.test(k))).toEqual([]);
  const valores = valoresDe(cuerpo);
  for (const p of [...PRECIOS_COMPRA, ...IMPORTES_TARIFA]) expect(valores, `valor interno ${p}`).not.toContain(p);
}

const escenario = (id: string) => ESCENARIOS.find((e) => e.id === id)!;
const PRINCIPALES = ["GUIA-R1-FALDONES-10M", "GUIA-R2-ESPESOR-012", "GUIA-R3-SIN-VENTANA", "GUIA-PROPIA-CON-00001"] as const;

describe("POST /api/v1/calculos/demo: escenarios principales por HTTP", () => {
  it.each(PRINCIPALES)("%s reproduce su total de referencia", async (id) => {
    const e = escenario(id);
    const r = await post(solicitudDemoDesdeEntrada(e.entrada));
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const cuerpo = EsquemaRespuestaCalculoDemo.parse(r.cuerpo);
    expect(cuerpo.fechaCalculo).toBe(FECHA);
    expect(cuerpo.cotizacion.subtotal).toBe(e.esperado.subtotal);
    expect(cuerpo.cotizacion.impuesto.importe).toBe(e.esperado.impuestos);
    expect(cuerpo.cotizacion.total).toBe(e.esperado.total);
    // Misma proyección comercial que el cálculo verificado con el fixture.
    const referencia = calcularCotizacion(e.entrada);
    if (referencia.estado !== "CALCULADO") throw new Error("fixture no calculado");
    expect(cuerpo.cotizacion).toEqual(aVistaComercial(referencia));
    sinDatosInternos(r.cuerpo);
  });

  it("el cálculo no escribe ni modifica catálogos", async () => {
    const antes = await repo.contar(demo);
    await post(solicitudDemoDesdeEntrada(escenario("GUIA-R1-FALDONES-10M").entrada));
    expect(await repo.contar(demo)).toEqual(antes);
  });

  it("AV-01 se publica sin importes (lámina de $385 frente a $362)", async () => {
    const s = solicitudDemoDesdeEntrada(escenario("GUIA-R1-FALDONES-10M").entrada);
    s.preciosElegidos = s.preciosElegidos.map((p) => (p === "PRE-000007" ? "PRE-000006" : p));
    const r = await post(s);
    expect(r.status).toBe(200);
    expect(r.cuerpo.avisos).toContainEqual({ codigo: "AV-01", mensaje: "El precio elegido para el insumo INS-00004 no es el menor vigente." });
    sinDatosInternos(r.cuerpo);
  });
});

describe("bloqueos de negocio (422, sin importes)", () => {
  const base = (): SolicitudCalculoDemo => solicitudDemoDesdeEntrada(escenario("GUIA-R1-FALDONES-10M").entrada);
  const DEMO_PARAMETROS: DatosParametros = {
    ambiente: "DEMO",
    moneda: "MXN",
    recargoSobreCosto: "0.2",
    impuestoTasa: "0.16",
    impuestoBase: "SUBTOTAL_VENTA",
    impuestoTratamiento: "Ilustrativo: impuesto sobre el subtotal de venta",
    impuestoNombre: "Impuesto (tasa ilustrativa)",
    vigenciaDias: 15,
  };

  function bloqueado(r: Awaited<ReturnType<typeof post>>, codigo: string) {
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(422);
    const cuerpo = EsquemaRespuestaError.parse(r.cuerpo);
    expect(cuerpo.error.codigo).toBe("CALCULO_BLOQUEADO");
    expect(cuerpo.error.problemas?.map((p) => p.codigo)).toContain(codigo);
    expect(r.cuerpo).not.toHaveProperty("cotizacion");
    sinDatosInternos(r.cuerpo);
  }

  it("cotización vacía → BL-03", async () => {
    bloqueado(await post({ consolidarCompras: true, partidas: [], preciosElegidos: [] }), "BL-03");
  });

  it("sin precio elegido para un insumo → BL-08 (el servidor no elige)", async () => {
    const s = base();
    s.preciosElegidos = s.preciosElegidos.filter((p) => p !== "PRE-000009");
    bloqueado(await post(s), "BL-08");
  });

  it("precio anulado → BL-08 sin sustituto", async () => {
    await repo.asegurarProveedor(demo, { codigo: "PRV-HTTP-A", nombre: "[PRUEBA] Proveedor HTTP" });
    await repo.asegurarPrecio(demo, {
      codigo: "PRE-HTTP-ANULADO",
      producto: "PCM-00004",
      proveedor: "PRV-HTTP-A",
      precioUnitario: "300",
      vigenteDesde: "2026-09-01",
      vigenteHasta: "2027-09-30",
      fuente: "[PRUEBA]",
    });
    await repo.anularPrecio(demo, "PRE-HTTP-ANULADO");
    const s = base();
    s.preciosElegidos = s.preciosElegidos.map((p) => (p === "PRE-000007" ? "PRE-HTTP-ANULADO" : p));
    bloqueado(await post(s), "BL-08");
  });

  it("concepto no aprobado → BL-04", async () => {
    await new RepositorioCatalogos(migrador).cambiarEstadoConcepto(demo, "CON-00007", "Borrador");
    try {
      bloqueado(await post(base()), "BL-04");
    } finally {
      await new RepositorioCatalogos(migrador).cambiarEstadoConcepto(demo, "CON-00007", "Aprobado");
    }
  });

  it("parámetros ausentes en la base → BL-12 y BL-13 (no es una petición mal formada)", async () => {
    await new RepositorioCatalogos(migrador).actualizarParametros(demo, {
      ...DEMO_PARAMETROS,
      recargoSobreCosto: null,
      impuestoTasa: null,
      impuestoBase: null,
      impuestoTratamiento: null,
      impuestoNombre: null,
    });
    try {
      const r = await post(base());
      bloqueado(r, "BL-12");
      expect(r.cuerpo.error.problemas.map((p: { codigo: string }) => p.codigo)).toContain("BL-13");
    } finally {
      await new RepositorioCatalogos(migrador).actualizarParametros(demo, DEMO_PARAMETROS);
    }
  });
});

describe("entradas inválidas (400 con la ruta del campo)", () => {
  const base = (): any => structuredClone(solicitudDemoDesdeEntrada(escenario("GUIA-R1-FALDONES-10M").entrada));

  async function invalida(cuerpo: unknown, ruta?: string) {
    const r = await post(cuerpo);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(400);
    const e = EsquemaRespuestaError.parse(r.cuerpo);
    expect(e.error.codigo).toBe("SOLICITUD_INVALIDA");
    if (ruta) expect(e.error.campos?.map((c) => c.ruta)).toContain(ruta);
    sinDatosInternos(r.cuerpo);
    return e;
  }

  it("decimal enviado como número", async () => {
    const s = base();
    s.partidas[0].mediciones[0].piezas = 1;
    await invalida(s, "partidas[0].mediciones[0].piezas");
  });
  it("decimal con coma", async () => {
    const s = base();
    s.partidas[1].monto = "900,50";
    await invalida(s, "partidas[1].monto");
  });
  it("renglón anidado incompleto", async () => {
    const s = base();
    delete s.partidas[0].mediciones[2].alto;
    await invalida(s, "partidas[0].mediciones[2].alto");
  });
  it.each([
    ["fechaCalculo", "2020-01-01"],
    ["organizacionId", "00000000-0000-0000-0000-000000000000"],
    ["parametros", { recargoSobreCosto: "0" }],
  ])("campo no permitido en la raíz: %s", async (campo, valor) => {
    const e = await invalida({ ...base(), [campo]: valor });
    expect(e.error.campos?.map((c) => c.mensaje).join(" ")).toContain(campo);
  });
  it("campo no permitido anidado (precio en una partida)", async () => {
    const s = base();
    s.partidas[0].precioUnitario = "1";
    await invalida(s);
  });
  it("regla de captura del motor: AREA con ancho y alto", async () => {
    const s = base();
    s.partidas[0].mediciones[0].alto = "2";
    await invalida(s, "partidas[0].mediciones[0].alto");
  });
  it("JSON mal formado", async () => {
    const e = await invalida("{malo");
    expect(e.error.mensaje).toBe("El cuerpo no es JSON válido.");
  });
  it("query fuera de límites o desconocida", async () => {
    for (const q of ["limite=0", "limite=101", "limite=abc", "otro=1", "buscar=" + "x".repeat(61)]) {
      const r = await get(`/api/v1/catalogos/conceptos?${q}`);
      expect(r.status, q).toBe(400);
      expect(r.cuerpo.error.codigo).toBe("SOLICITUD_INVALIDA");
    }
  });
});

describe("catálogos", () => {
  it("conceptos: lista acotada, solo campos comerciales", async () => {
    const r = await get("/api/v1/catalogos/conceptos?limite=2");
    expect(r.status).toBe(200);
    const c = EsquemaRespuestaConceptos.parse(r.cuerpo);
    expect(c.conceptos).toHaveLength(2);
    expect(c.limite).toBe(2);
    sinDatosInternos(r.cuerpo);
  });

  it("conceptos: búsqueda por descripción", async () => {
    const r = await get("/api/v1/catalogos/conceptos?buscar=losa");
    expect(r.cuerpo.conceptos.map((c: { codigo: string }) => c.codigo)).toEqual(["CON-00008"]);
  });

  it("opciones de precio: vigentes a la fecha, sin precio, con el marcador del menor", async () => {
    const r = await get("/api/v1/catalogos/opciones-precio?conceptos=CON-00007");
    expect(r.status).toBe(200);
    const o = EsquemaRespuestaOpcionesPrecio.parse(r.cuerpo);
    expect(o.fechaReferencia).toBe(FECHA);
    const lamina = o.insumos.find((i) => i.insumoCodigo === "INS-00004")!;
    expect(lamina.opciones.map((x) => [x.precioCodigo, x.esMenorPrecio])).toContainEqual(["PRE-000007", true]);
    expect(lamina.opciones.map((x) => [x.precioCodigo, x.esMenorPrecio])).toContainEqual(["PRE-000006", false]);
    // Precios anulados (PRE-HTTP-ANULADO) no se ofrecen.
    expect(lamina.opciones.map((x) => x.precioCodigo)).not.toContain("PRE-HTTP-ANULADO");
    const valores = valoresDe(r.cuerpo);
    for (const p of PRECIOS_COMPRA) expect(valores).not.toContain(p);
    expect(clavesDe(r.cuerpo).filter((k) => /precioUnitario|^precio$|contenido|costo/i.test(k))).toEqual([]);
  });

  it("opciones de precio: un precio vencido a la fecha no se ofrece (PRE-000005)", async () => {
    const r = await get("/api/v1/catalogos/opciones-precio?conceptos=CON-00002");
    const c = r.cuerpo.insumos.find((i: { insumoCodigo: string }) => i.insumoCodigo === "INS-00003");
    expect(c.opciones.map((x: { precioCodigo: string }) => x.precioCodigo)).toEqual(["PRE-000003"]);
  });

  it("tipos de costo adicional", async () => {
    const r = await get("/api/v1/catalogos/tipos-adicional");
    expect(EsquemaRespuestaTiposAdicional.parse(r.cuerpo).tiposAdicional.map((t) => t.codigo)).toEqual([
      "CAD-00001",
      "CAD-00002",
      "CAD-00003",
    ]);
  });

  it("OpenAPI disponible", async () => {
    const r = await get("/api/v1/openapi.json");
    expect(r.status).toBe(200);
    expect(r.cuerpo.openapi).toBe("3.1.0");
  });
});

describe("aislamiento: identificadores de otra organización → 404", () => {
  beforeAll(async () => {
    const otra = { organizacionId: (await repo.asegurarOrganizacion("PRUEBA-HTTP-OTRA", "[PRUEBA] Otra", false)).id };
    await repo.asegurarTipoEstructura(otra, { codigo: "TES-00002", familia: "Concreto reforzado", nombre: "Genérico - Concreto reforzado" });
    await repo.asegurarConcepto(otra, {
      codigo: "CON-OTRA-1",
      tipo: "TES-00002",
      descripcion: "[PRUEBA] Concepto de otra organización",
      unidad: "m2",
      tipoFormula: "AREA",
      permiteDescuento: false,
      clase: "ESTANDAR",
      tarifa: null,
      reglaMedicion: "[PRUEBA] Regla de otra organización",
      criterios: null,
    });
    await repo.asegurarInsumo(otra, { codigo: "INS-OTRA-1", descripcion: "x", unidadBase: "kg" });
    await repo.asegurarProducto(otra, {
      codigo: "PCM-OTRA-1",
      insumo: "INS-OTRA-1",
      descripcion: "x",
      presentacion: "x",
      unidadCompra: "pza",
      contenido: "1",
      fraccionable: false,
      incrementoMinimo: null,
    });
    await repo.asegurarProveedor(otra, { codigo: "PRV-OTRA-1", nombre: "x" });
    await repo.asegurarPrecio(otra, {
      codigo: "PRE-OTRA-1",
      producto: "PCM-OTRA-1",
      proveedor: "PRV-OTRA-1",
      precioUnitario: "1",
      vigenteDesde: "2026-01-01",
      vigenteHasta: "2027-12-31",
      fuente: "x",
    });
  });

  it("concepto de otra organización en el cálculo", async () => {
    const r = await post({
      consolidarCompras: true,
      partidas: [{ id: "P1", tipo: "CONCEPTO", conceptoCodigo: "CON-OTRA-1", mediciones: [] }],
      preciosElegidos: [],
    });
    expect(r.status).toBe(404);
    expect(r.cuerpo.error.faltantes).toEqual([{ tipo: "concepto", codigo: "CON-OTRA-1" }]);
  });

  it("precio de otra organización en el cálculo", async () => {
    const s = solicitudDemoDesdeEntrada(escenario("GUIA-PROPIA-CON-00001").entrada);
    s.preciosElegidos = [...s.preciosElegidos, "PRE-OTRA-1"];
    const r = await post(s);
    expect(r.status).toBe(404);
    expect(r.cuerpo.error.faltantes).toEqual([{ tipo: "precio", codigo: "PRE-OTRA-1" }]);
  });

  it("opciones de precio de un concepto de otra organización", async () => {
    const r = await get("/api/v1/catalogos/opciones-precio?conceptos=CON-OTRA-1");
    expect(r.status).toBe(404);
    expect(r.cuerpo.error.codigo).toBe("NO_ENCONTRADO");
  });

  it("los listados no muestran datos de otra organización", async () => {
    const r = await get("/api/v1/catalogos/conceptos?buscar=OTRA");
    expect(r.cuerpo.conceptos).toEqual([]);
  });
});

describe("transporte", () => {
  it("cabeceras: X-Request-Id, Helmet y sin X-Powered-By", async () => {
    const r = await fetch(`${api.url}/health`);
    expect(r.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBeTruthy();
    expect(r.headers.get("x-powered-by")).toBeNull();
    expect(await r.json()).toEqual({ estado: "ok", baseDeDatos: "disponible" });
  });

  it("Cache-Control: no-store en las respuestas de la API (contienen datos de la sesión)", async () => {
    const r = await get("/api/v1/catalogos/tipos-adicional");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("no confía en el X-Request-Id del cliente", async () => {
    const r = await fetch(`${api.url}/health`, { headers: { "X-Request-Id": "inyectado" } });
    expect(r.headers.get("x-request-id")).not.toBe("inyectado");
  });

  it("413: cuerpo mayor que el límite", async () => {
    const pequeno = await iniciar({ limiteCuerpoKb: 1 });
    try {
      const s = solicitudDemoDesdeEntrada(escenario("GUIA-R1-FALDONES-10M").entrada);
      s.partidas[1] = { ...s.partidas[1]!, descripcion: "x".repeat(200) } as never;
      const grande = { ...s, partidas: Array.from({ length: 20 }, (_, i) => ({ ...s.partidas[1]!, id: `A${i}` })) };
      const r = await post(grande, await new ClienteHttp(pequeno.url).entrar(preparador));
      expect(r.status).toBe(413);
      expect(r.cuerpo.error.codigo).toBe("CUERPO_DEMASIADO_GRANDE");
    } finally {
      await pequeno.app.close();
    }
  });

  it("415: POST sin application/json", async () => {
    const r = await fetch(`${api.url}/api/v1/calculos/demo`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
    expect(r.status).toBe(415);
    expect(((await r.json()) as any).error.codigo).toBe("TIPO_DE_CONTENIDO_NO_ADMITIDO");
  });

  it("404 de ruta inexistente con el sobre de error", async () => {
    const r = await get("/api/v1/no-existe");
    expect(r.status).toBe(404);
    expect(EsquemaRespuestaError.parse(r.cuerpo).error.codigo).toBe("NO_ENCONTRADO");
  });

  it("429: límite específico de cálculo, con Retry-After; los catálogos siguen disponibles", async () => {
    const limitado = await iniciar({ limiteCalculoPorMinuto: 2 });
    try {
      const c = await new ClienteHttp(limitado.url).entrar(preparador);
      const vacia = { consolidarCompras: true, partidas: [], preciosElegidos: [] };
      expect((await post(vacia, c)).status).toBe(422);
      expect((await post(vacia, c)).status).toBe(422);
      const r = await post(vacia, c);
      expect(r.status).toBe(429);
      expect(r.cuerpo.error.codigo).toBe("DEMASIADAS_SOLICITUDES");
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await get("/api/v1/catalogos/tipos-adicional", c)).status).toBe(200);
    } finally {
      await limitado.app.close();
    }
  });

  it("429: límite general", async () => {
    const limitado = await iniciar({ limiteGeneralPorMinuto: 3 });
    try {
      const estados = [];
      for (let i = 0; i < 4; i++) estados.push((await fetch(`${limitado.url}/health`)).status);
      expect(estados).toEqual([200, 200, 200, 429]);
    } finally {
      await limitado.app.close();
    }
  });
});

describe("CORS (lo aplica el navegador según las cabeceras)", () => {
  async function preflight(origen: string) {
    return fetch(`${api.url}/api/v1/calculos/demo`, {
      method: "OPTIONS",
      headers: {
        Origin: origen,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    });
  }

  it("preflight de un origen permitido: autoriza POST, Content-Type, X-CSRF-Token y credenciales (ADR-0007)", async () => {
    const r = await preflight(ORIGEN_PERMITIDO);
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe(ORIGEN_PERMITIDO);
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
    expect(r.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
    expect(r.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-csrf-token");
    // Módulo 5: la cookie de sesión exige credenciales, solo para el origen exacto (nunca "*").
    expect(r.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("preflight de un origen ajeno: sin Access-Control-Allow-Origin (el navegador bloquea)", async () => {
    const r = await preflight(ORIGEN_AJENO);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("GET simple: origen permitido recibe ACAO; el ajeno no (la respuesta existe, pero el navegador no la entrega)", async () => {
    const ok = await fetch(`${api.url}/health`, { headers: { Origin: ORIGEN_PERMITIDO } });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGEN_PERMITIDO);
    expect(ok.headers.get("access-control-expose-headers")).toContain("X-Request-Id");
    const ajeno = await fetch(`${api.url}/health`, { headers: { Origin: ORIGEN_AJENO } });
    expect(ajeno.headers.get("access-control-allow-origin")).toBeNull();
    expect(ajeno.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});

describe("PostgreSQL no disponible (503 sin información interna)", () => {
  let caido: { app: INestApplication; url: string };
  beforeAll(async () => {
    // Sin la comprobación inicial de rol (necesita la base). La guardia sigue exigiendo sesión:
    // con una cookie de forma válida, consultarla en la base inaccesible da 503.
    caido = await iniciar(
      { databaseUrl: "postgresql://softarq_app:clave-falsa@127.0.0.1:1/softarq_test" },
      { sinComprobacionInicialDeRol: true },
    );
  });
  afterAll(() => caido.app.close());

  const PROHIBIDO = /ECONNREFUSED|127\.0\.0\.1|:1\/|prisma|postgres|softarq_test|clave-falsa|stack|at \w+ \(|\\|node_modules/i;

  it("/health responde 503 degradado", async () => {
    const r = await fetch(`${caido.url}/health`);
    const texto = await r.text();
    expect(r.status).toBe(503);
    expect(JSON.parse(texto)).toEqual({ estado: "degradado", baseDeDatos: "no disponible" });
    expect(texto).not.toMatch(PROHIBIDO);
  });

  it.each([
    ["GET", "/api/v1/catalogos/conceptos"],
    ["GET", "/api/v1/catalogos/opciones-precio?conceptos=CON-00007"],
    ["POST", "/api/v1/calculos/demo"],
  ])("%s %s → 503 SERVICIO_NO_DISPONIBLE", async (metodo, ruta) => {
    const sesion = { Cookie: `softarq_sesion=${"A".repeat(43)}` };
    const r = await fetch(`${caido.url}${ruta}`, {
      method: metodo,
      headers:
        metodo === "POST"
          ? { ...sesion, "Content-Type": "application/json", Origin: ORIGEN_PERMITIDO, "X-CSRF-Token": "B".repeat(43) }
          : sesion,
      ...(metodo === "POST"
        ? { body: JSON.stringify(solicitudDemoDesdeEntrada(escenario("GUIA-PROPIA-CON-00001").entrada)) }
        : {}),
    });
    const texto = await r.text();
    expect(r.status).toBe(503);
    expect(EsquemaRespuestaError.parse(JSON.parse(texto)).error.codigo).toBe("SERVICIO_NO_DISPONIBLE");
    expect(texto).not.toMatch(PROHIBIDO);
  });
});

describe("validaciones de arranque", () => {
  // Módulo 5: ya no hay organización configurada al arrancar (SOFTARQ_ORGANIZACION_DEMO se eliminó);
  // la organización sale de la sesión. Las comprobaciones equivalentes (organización DEMO, usuario
  // y pertenencia activos) están en autenticacion.integracion.test.ts.

  it("falla con el rol migrador aunque se salte la validación del entorno (propietario de la base)", async () => {
    await expect(crearAplicacion(configuracion({ databaseUrl: urlDePrueba("MIGRATION_DATABASE_URL") }))).rejects.toThrow(
      /privilegios de administración o de esquema/,
    );
  });
});
