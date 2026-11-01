/**
 * RF-26 (exportación CSV de tablas) y contadores de 00 INICIO (ADR-0023) por HTTP contra softarq_test.
 *
 * Exportación: permiso por tabla con las capacidades existentes, aislamiento por organización, columnas fijas sin contraseñas,
 * hashes ni sesiones, formato (BOM UTF-8, CRLF, comillas), defensa contra fórmulas y el canal móvil sin acceso.
 * Contadores: forma, reglas visibles, fecha del servidor, último folio y aislamiento entre organizaciones.
 */
import type { INestApplication } from "@nestjs/common";
import { EsquemaContadoresInicio, EsquemaRespuestaExportaciones } from "@softarq/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { aCsv, celda, DEFINICIONES, TABLAS_EXPORTABLES } from "../modules/exportaciones/servicio-exportaciones.js";
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

const PREP = "prep@exp.softarq.test";
const SIS = "sis@exp.softarq.test";
const CAT = "cat@exp.softarq.test";
const OTRA = "sis@otra-exp.softarq.test";
const PREP_OTRA = "prep@otra-exp.softarq.test";
const FORMULA = '=HYPERLINK("http://ajeno.example","clic")';

const bytes = async (r: Response): Promise<string> => Buffer.from(await r.arrayBuffer()).toString("utf8");
const descargar = async (correo: string, tabla: string): Promise<{ status: number; texto: string; cabeceras: Headers }> => {
  const c = await web(correo);
  const r = await fetch(`${url}/api/v1/exportaciones/${tabla}`, { headers: { Cookie: `softarq_sesion=${c.cookie}` } });
  return { status: r.status, texto: await bytes(r), cabeceras: r.headers };
};

beforeAll(async () => {
  await cargarDemo(prisma, { codigo: "DEMO-EXP", nombre: "[DEMO] Exportaciones" });
  await cargarDemo(prisma, { codigo: "DEMO-EXP2", nombre: "[DEMO] Exportaciones otra" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-EXP", [cuenta(PREP, "[DEMO] Preparador EXP", "PREPARADOR"), cuenta(SIS, "[DEMO] Sistema EXP", "ADMIN_SISTEMA"), cuenta(CAT, "[DEMO] Catálogo EXP", "ADMIN_CATALOGO")]),
    await crearCuentas(migrador, "DEMO-EXP2", [cuenta(OTRA, "[DEMO] Sistema otra EXP", "ADMIN_SISTEMA"), cuenta(PREP_OTRA, "[DEMO] Preparador otra EXP", "PREPARADOR")]),
  );
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_ACCESO_INTENTOS_IP: "1000", API_ACCESO_FALLOS_CUENTA: "1000", API_ACCESO_FALLOS_CUENTA_IP: "100", API_LIMITE_GENERAL_POR_MINUTO: "5000" }),
    { reloj: new RelojFijo(FECHA) },
  );
  app.useLogger(false);
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

afterAll(async () => {
  await app.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

describe("formato del CSV (unitario)", () => {
  it("BOM, CRLF, comillas dobles y apóstrofo ante fórmulas; números negativos no se alteran", () => {
    const csv = aCsv(["a", "b"], [{ a: 'dice "hola", y\nadiós', b: "=1+1" }, { a: -5, b: "@usuario" }, { a: null, b: true }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"dice ""hola"", y\nadiós"');
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@usuario");
    expect(csv.split("\r\n")[2]).toBe("-5,'@usuario");
    expect(celda(new Date("2026-10-31T00:00:00.000Z"))).toBe("2026-10-31");
    expect(celda(new Date("2026-10-31T18:25:19.205Z"))).toBe("2026-10-31T18:25:19.205Z");
    expect(celda(["PREPARADOR", "REVISOR"])).toBe("PREPARADOR|REVISOR");
  });

  it("ninguna tabla declara columnas de contraseña, hash, token ni sesión", () => {
    for (const t of TABLAS_EXPORTABLES) for (const c of DEFINICIONES[t].columnas) expect(c, `${t}.${c}`).not.toMatch(/contrasena|hash|token|sesion|secreto|clave/i);
  });
});

describe("permisos por tabla y aislamiento", () => {
  it("cada función ve solo lo suyo: el Administrador del sistema, comerciales y personas; el del catálogo, los catálogos; el Preparador, nada", async () => {
    const lista = async (correo: string) => EsquemaRespuestaExportaciones.parse((await (await web(correo)).get("/api/v1/exportaciones")).cuerpo).tablas.map((t) => t.tabla).sort();
    expect(await lista(SIS)).toEqual(["clientes", "cotizaciones", "personas", "proyectos"]);
    expect(await lista(CAT)).toEqual(["insumos", "precios", "productos", "proveedores", "tarifas"]);
    expect(await lista(PREP)).toEqual([]);
  });

  it("descargar sin la capacidad de la tabla da 403; una tabla que no existe, 404; sin sesión, 401", async () => {
    expect((await descargar(PREP, "clientes")).status).toBe(403);
    expect((await descargar(SIS, "precios")).status).toBe(403);
    expect((await descargar(CAT, "personas")).status).toBe(403);
    expect((await descargar(SIS, "hash_contrasena")).status).toBe(404);
    expect((await descargar(SIS, "sesion")).status).toBe(404);
    expect((await fetch(`${url}/api/v1/exportaciones/clientes`)).status).toBe(401);
  });

  it("el CSV de clientes es de la propia organización, con BOM, cabecera fija, sin caché y con la defensa contra fórmulas", async () => {
    const p = await web(PREP);
    expect((await p.post("/api/v1/clientes", { nombre: FORMULA, contactoNombre: "Persona", contactoTelefono: "55 1234 5678" }, idem())).status).toBe(201);
    const otra = await web(PREP_OTRA);
    expect((await otra.post("/api/v1/clientes", { nombre: "Cliente de OTRA organización", contactoNombre: "Persona", contactoTelefono: "55 1234 5678" }, idem())).status).toBe(201);
    const r = await descargar(SIS, "clientes");
    expect(r.status).toBe(200);
    expect(r.cabeceras.get("content-type")).toContain("text/csv");
    expect(r.cabeceras.get("cache-control")).toContain("no-store");
    expect(r.cabeceras.get("content-disposition")).toContain('filename="softarq-clientes.csv"');
    expect(r.texto.startsWith("﻿codigo,nombre,contacto_nombre,contacto_telefono,contacto_correo,activo,clasificacion,creado_en,modificado_en\r\n")).toBe(true);
    expect(r.texto).toContain(`"'=HYPERLINK(""http://ajeno.example"",""clic"")"`);
    expect(r.texto).not.toContain("Cliente de OTRA");
    const ajeno = await descargar(OTRA, "clientes");
    expect(ajeno.texto).toContain("Cliente de OTRA organización");
    expect(ajeno.texto).not.toContain("HYPERLINK");
    expect(ajeno.texto.split("\r\n").filter(Boolean)).toHaveLength(2);
  });

  it("el CSV de personas trae correo, nombre y funciones de SU organización y nada de contraseñas ni credenciales", async () => {
    const r = await descargar(SIS, "personas");
    expect(r.status).toBe(200);
    const filas = r.texto.split("\r\n").filter(Boolean);
    expect(filas[0]).toBe("﻿correo,nombre,funciones,activa,es_demo,creada_en");
    expect(filas.length).toBe(4);
    expect(r.texto).toContain("ADMIN_SISTEMA");
    expect(r.texto).not.toMatch(/argon2|\$2[aby]\$|hash|temporal/i);
    expect(r.texto).not.toContain("otra-exp");
  });

  it("el catálogo del Administrador del catálogo exporta precios con importes exactos y solo los de su organización", async () => {
    const r = await descargar(CAT, "precios");
    expect(r.status).toBe(200);
    const filas = r.texto.split("\r\n").filter(Boolean);
    expect(filas[0]).toBe("﻿codigo,producto_codigo,proveedor_codigo,precio_unitario,vigente_desde,vigente_hasta,anulado,motivo_anulacion,fuente,registrado_en");
    expect(filas.length).toBeGreaterThan(1);
    expect(filas[1]).toMatch(/^PRE-\d{6},/);
    const ids = new Set(filas.slice(1).map((f) => f.split(",")[0]));
    expect(ids.size).toBe(filas.length - 1);
  });
});

describe("contadores de 00 INICIO", () => {
  it("la forma, la fecha del servidor, las reglas visibles y cero en una organización sin cotizaciones", async () => {
    const r = await (await web(PREP)).get("/api/v1/cotizaciones/contadores");
    expect(r.status, r.texto).toBe(200);
    const c = EsquemaContadoresInicio.parse(r.cuerpo);
    expect(c.fecha).toBe(FECHA);
    expect(c).toMatchObject({ borradores: 0, enRevision: 0, aprobadasPorEmitir: 0, emitidasVigentes: 0, vencidas: 0, ultimoFolio: null });
    expect(c.reglas.length).toBeGreaterThanOrEqual(5);
  });

  it("un borrador nuevo se cuenta una sola vez y fija el último folio; otra organización no lo ve", async () => {
    const p = await web(PREP);
    const cli = await p.post("/api/v1/clientes", { nombre: "[DEMO] Cliente contadores", contactoNombre: "Persona", contactoTelefono: "55 1234 5678" }, idem());
    const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: "Obra", municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Prueba" }, idem());
    const q = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id }, idem());
    expect(q.status, q.texto).toBe(201);
    const c = EsquemaContadoresInicio.parse((await p.get("/api/v1/cotizaciones/contadores")).cuerpo);
    expect(c.borradores).toBe(1);
    expect(c.ultimoFolio).toBe(q.cuerpo.cotizacion.folio);
    const rev = await (await web(SIS)).get("/api/v1/cotizaciones/contadores");
    expect(rev.status).toBe(200);
    const ajena = EsquemaContadoresInicio.parse((await (await web(OTRA)).get("/api/v1/cotizaciones/contadores")).cuerpo);
    expect(ajena.borradores).toBe(0);
    expect(ajena.ultimoFolio).toBeNull();
  });

  it("los precios que vencen en los próximos 30 días se cuentan y avisan (no hay ninguno con la carga DEMO)", async () => {
    const c0 = EsquemaContadoresInicio.parse((await (await web(PREP)).get("/api/v1/cotizaciones/contadores")).cuerpo);
    expect(c0.preciosPorVencer).toBe(0);
    await migrador.$executeRaw`UPDATE precio SET vigente_hasta = DATE '2026-10-10' WHERE organizacion_id = (SELECT id FROM organizacion WHERE codigo = 'DEMO-EXP') AND codigo = (SELECT min(codigo) FROM precio WHERE organizacion_id = (SELECT id FROM organizacion WHERE codigo = 'DEMO-EXP'))`;
    const c1 = EsquemaContadoresInicio.parse((await (await web(PREP)).get("/api/v1/cotizaciones/contadores")).cuerpo);
    expect(c1.preciosPorVencer).toBe(1);
    expect(c1.avisos.map((a) => a.codigo)).toContain("INI-03");
  });
});
