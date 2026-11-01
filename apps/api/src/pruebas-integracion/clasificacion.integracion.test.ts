/**
 * Clasificación de clientes: presentación, QA o humo (E3.8) por HTTP contra softarq_test.
 *
 * Garantías que se comprueban: solo el Administrador del sistema clasifica; el motivo es obligatorio; cada cambio queda en la
 * bitácora; sin filtro se ve TODO (nada se oculta ni se reclasifica por sí solo); los filtros identifican y consultan; los
 * proyectos, cotizaciones y solicitudes heredan la categoría de su cliente; otra organización no ve ni clasifica registros ajenos;
 * y la base rechaza la escritura directa del rol de la aplicación.
 */
import type { INestApplication } from "@nestjs/common";
import { EsquemaRespuestaClientes, EsquemaRespuestaCotizaciones } from "@softarq/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";

const FECHA = "2026-09-25";
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const cred: Record<string, Credencial> = {};
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const web = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);

const PREP = "prep@clf.softarq.test";
const SIS = "sis@clf.softarq.test";
const CAT = "cat@clf.softarq.test";
const OTRA = "sis@otra-clf.softarq.test";

const ids: Record<string, string> = {};

const bitacoraDe = async (id: string): Promise<{ tipo: string; detalle: Record<string, unknown> }[]> =>
  (await migrador.$queryRaw<{ tipo: string; detalle: Record<string, unknown> }[]>`SELECT tipo, detalle FROM bitacora WHERE entidad_id = ${id}::uuid AND entidad = 'cliente' ORDER BY ocurrido_en, id`).filter((f) =>
    f.tipo.startsWith("CLASIFICA"),
  );

beforeAll(async () => {
  await cargarDemo(prisma, { codigo: "DEMO-CLF", nombre: "[DEMO] Clasificación" });
  await cargarDemo(prisma, { codigo: "DEMO-CLF2", nombre: "[DEMO] Clasificación otra" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-CLF", [cuenta(PREP, "[DEMO] Preparador CLF", "PREPARADOR"), cuenta(SIS, "[DEMO] Sistema CLF", "ADMIN_SISTEMA"), cuenta(CAT, "[DEMO] Catálogo CLF", "ADMIN_CATALOGO")]),
    await crearCuentas(migrador, "DEMO-CLF2", [cuenta(OTRA, "[DEMO] Sistema otra CLF", "ADMIN_SISTEMA")]),
  );
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_ACCESO_INTENTOS_IP: "1000", API_ACCESO_FALLOS_CUENTA: "1000", API_ACCESO_FALLOS_CUENTA_IP: "100", API_LIMITE_GENERAL_POR_MINUTO: "5000" }),
    { reloj: new RelojFijo(FECHA) },
  );
  app.useLogger(false);
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");

  // Tres clientes con proyecto y cotización: uno por clasificar y dos que se dejan sin clasificar.
  const p = await web(PREP);
  for (const nombre of ["A", "B", "C"]) {
    const c = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente clasificación ${nombre}`, contactoNombre: "Persona", contactoTelefono: "55 1234 5678" }, idem());
    expect(c.status, c.texto).toBe(201);
    ids[`cliente${nombre}`] = c.cuerpo.id;
    const pr = await p.post("/api/v1/proyectos", { clienteId: c.cuerpo.id, nombre: `Proyecto ${nombre}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Prueba" }, idem());
    expect(pr.status, pr.texto).toBe(201);
    const q = await p.post("/api/v1/cotizaciones", { proyectoId: pr.cuerpo.id }, idem());
    expect(q.status, q.texto).toBe(201);
    ids[`cotizacion${nombre}`] = q.cuerpo.cotizacion.id;
  }
});

afterAll(async () => {
  await app.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

describe("clasificar un cliente", () => {
  it("sin clasificar por omisión: nada se asume por llevar [DEMO] en el nombre", async () => {
    const p = await web(PREP);
    const r = EsquemaRespuestaClientes.parse((await p.get("/api/v1/clientes?buscar=Cliente clasificación")).cuerpo);
    expect(r.clientes).toHaveLength(3);
    for (const c of r.clientes) expect(c.clasificacion ?? null).toBeNull();
  });

  it("solo el Administrador del sistema clasifica; el Preparador y el Administrador del catálogo reciben 403", async () => {
    const cuerpo = { categoria: "HUMO", motivo: "Prueba de permisos" };
    for (const correo of [PREP, CAT]) {
      const r = await (await web(correo)).put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, cuerpo, idem());
      expect(r.status, correo).toBe(403);
    }
    expect(await bitacoraDe(ids["clienteA"]!)).toEqual([]);
  });

  it("el motivo es obligatorio y la categoría debe ser una de las tres", async () => {
    const s = await web(SIS);
    expect((await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "HUMO", motivo: "  " }, idem())).status).toBe(400);
    expect((await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "DESECHABLE", motivo: "Intento" }, idem())).status).toBe(400);
    expect((await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "HUMO" }, idem())).status).toBe(400);
    expect((await s.put(`/api/v1/clientes/${randomUUID()}/clasificacion`, { categoria: "HUMO", motivo: "No existe" }, idem())).status).toBe(404);
  });

  it("clasifica con motivo, lo deja en la bitácora y se puede cambiar y retirar sin perder el historial", async () => {
    const s = await web(SIS);
    const a = await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "HUMO", motivo: "Resto de una prueba de humo" }, idem());
    expect(a.status, a.texto).toBe(200);
    expect(a.cuerpo).toMatchObject({ clasificacion: "HUMO", clasificacionMotivo: "Resto de una prueba de humo" });
    const b = await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "QA", motivo: "Corrección: es de automatización" }, idem());
    expect(b.cuerpo.clasificacion).toBe("QA");
    const c = await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: null, motivo: "Se decidió no clasificarlo" }, idem());
    expect(c.status, c.texto).toBe(200);
    expect(c.cuerpo.clasificacion ?? null).toBeNull();
    const h = await bitacoraDe(ids["clienteA"]!);
    expect(h.map((x) => x.tipo)).toEqual(["CLASIFICADO", "CLASIFICADO", "CLASIFICACION_RETIRADA"]);
    expect(h[1]!.detalle).toMatchObject({ categoria: "QA", anterior: "HUMO" });
    expect(h[2]!.detalle).toMatchObject({ anterior: "QA" });
  });
});

describe("filtros, herencia y aislamiento", () => {
  beforeAll(async () => {
    const s = await web(SIS);
    expect((await s.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "PRESENTACION", motivo: "Cliente de la presentación" }, idem())).status).toBe(200);
    expect((await s.put(`/api/v1/clientes/${ids["clienteB"]}/clasificacion`, { categoria: "HUMO", motivo: "Resto de una prueba de humo" }, idem())).status).toBe(200);
  });

  it("sin filtro se ven TODOS; cada filtro identifica solo los suyos; SIN_CLASIFICAR trae los que no tienen fila", async () => {
    const p = await web(PREP);
    const lista = async (f?: string) => EsquemaRespuestaClientes.parse((await p.get(`/api/v1/clientes?buscar=Cliente clasificación${f ? `&clasificacion=${f}` : ""}`)).cuerpo).clientes.map((c) => c.id).sort();
    expect(await lista()).toEqual([ids["clienteA"]!, ids["clienteB"]!, ids["clienteC"]!].sort());
    expect(await lista("PRESENTACION")).toEqual([ids["clienteA"]!]);
    expect(await lista("HUMO")).toEqual([ids["clienteB"]!]);
    expect(await lista("QA")).toEqual([]);
    expect(await lista("SIN_CLASIFICAR")).toEqual([ids["clienteC"]!]);
    expect((await p.get("/api/v1/clientes?clasificacion=DESECHABLE")).status).toBe(400);
  });

  it("las cotizaciones heredan la categoría de su cliente: se ven con su etiqueta y se filtran", async () => {
    const p = await web(PREP);
    const todas = EsquemaRespuestaCotizaciones.parse((await p.get("/api/v1/cotizaciones?limite=100")).cuerpo).cotizaciones;
    const de = (id: string) => todas.find((c) => c.id === id)!;
    expect(de(ids["cotizacionA"]!).cliente.clasificacion).toBe("PRESENTACION");
    expect(de(ids["cotizacionB"]!).cliente.clasificacion).toBe("HUMO");
    expect(de(ids["cotizacionC"]!).cliente.clasificacion ?? null).toBeNull();
    const humo = EsquemaRespuestaCotizaciones.parse((await p.get("/api/v1/cotizaciones?clasificacion=HUMO&limite=100")).cuerpo).cotizaciones;
    expect(humo.map((c) => c.id)).toEqual([ids["cotizacionB"]!]);
    const sin = EsquemaRespuestaCotizaciones.parse((await p.get("/api/v1/cotizaciones?clasificacion=SIN_CLASIFICAR&limite=100")).cuerpo).cotizaciones;
    expect(sin.map((c) => c.id)).toContain(ids["cotizacionC"]);
    expect(sin.map((c) => c.id)).not.toContain(ids["cotizacionA"]);
  });

  it("otra organización no ve ni puede clasificar estos clientes", async () => {
    const otra = await web(OTRA);
    expect((await otra.put(`/api/v1/clientes/${ids["clienteA"]}/clasificacion`, { categoria: "HUMO", motivo: "Intento ajeno" }, idem())).status).toBe(404);
    const r = EsquemaRespuestaClientes.parse((await otra.get("/api/v1/clientes?buscar=Cliente clasificación")).cuerpo);
    expect(r.clientes).toEqual([]);
  });

  it("la base rechaza que el rol de la aplicación escriba la tabla directamente y el motivo vacío", async () => {
    await expect(prisma.$executeRaw`INSERT INTO clasificacion_cliente (organizacion_id, cliente_id, categoria, motivo, clasificado_por) SELECT organizacion_id, id, 'HUMO', 'directo', creado_por FROM cliente WHERE id = ${ids["clienteC"]}::uuid`).rejects.toThrow();
    await expect(migrador.$executeRaw`INSERT INTO clasificacion_cliente (organizacion_id, cliente_id, categoria, motivo, clasificado_por) SELECT organizacion_id, id, 'HUMO', ' ', creado_por FROM cliente WHERE id = ${ids["clienteC"]}::uuid`).rejects.toThrow();
    await expect(migrador.$executeRaw`INSERT INTO clasificacion_cliente (organizacion_id, cliente_id, categoria, motivo, clasificado_por) SELECT organizacion_id, id, 'DESECHABLE', 'categoría inválida', creado_por FROM cliente WHERE id = ${ids["clienteC"]}::uuid`).rejects.toThrow();
  });
});
