/**
 * Acceso real a la administración del catálogo por función y ruta (pendiente del módulo 11).
 *
 * Recorre TODAS las rutas `/api/v1/admin/...` que documenta OpenAPI (así cubre también las de módulos
 * posteriores). Preparador y Revisor: siempre 403 y ninguna escritura. Desde el módulo 13 (ADR-0017)
 * las rutas se reparten: las del catálogo son del Administrador del catálogo y las de parámetros y
 * personas, del Administrador del sistema; cada uno recibe 403 en las del otro.
 * Con un Administrador de otra organización, un código ajeno responde 404. Además comprueba en
 * respuestas REALES (no solo en los esquemas) que los contratos comerciales no traen datos técnicos
 * ni importes internos del catálogo.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EntradaCalculo } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import { construirDocumentoOpenApi } from "../http/openapi.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let org: string;
const cred: Record<string, Credencial> = {};
const entrar = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);

/** Códigos existentes en la organización DEMO para sustituir los parámetros de ruta. */
const CODIGO_POR_SEGMENTO: Record<string, string> = {
  proveedores: "PRV-00001",
  productos: "PCM-00001",
  precios: "PRE-000001",
  tarifas: "TMO-00001",
  conceptos: "CON-00001",
  insumos: "INS-00001",
  "tipos-estructura": "TES-00001",
  componentes: "CMP-00001",
  conversiones: "m",
  personas: "00000000-0000-4000-8000-000000000000",
  // Módulo 17 (ADR-0021).
  "accesos-cliente": "00000000-0000-4000-8000-000000000000",
  "referencias-estimacion": "INS-00001",
};

/** Rutas del Administrador del sistema (módulo 13); el resto de `/admin` es del catálogo. */
const esDelSistema = (ruta: string) => /^\/api\/v1\/admin\/(parametros|personas|accesos-cliente)(\/|$)/.test(ruta);

function rutasAdmin(): { metodo: string; ruta: string }[] {
  const doc = construirDocumentoOpenApi() as { paths: Record<string, Record<string, unknown>> };
  const r: { metodo: string; ruta: string }[] = [];
  for (const [plantilla, ops] of Object.entries(doc.paths)) {
    if (!plantilla.startsWith("/api/v1/admin/")) continue;
    const segmentos = plantilla.split("/");
    const ruta = segmentos
      .map((s, i) => (s.startsWith("{") ? (CODIGO_POR_SEGMENTO[segmentos[i - 1]!] ?? "X-00001") : s))
      .join("/");
    for (const metodo of Object.keys(ops)) r.push({ metodo: metodo.toUpperCase(), ruta });
  }
  return r;
}

async function huellaCatalogo(): Promise<string> {
  const [f] = await migrador.$queryRaw<{ f: string }[]>`SELECT json_build_array(
      (SELECT count(*) FROM proveedor), (SELECT count(*) FROM producto), (SELECT count(*) FROM precio),
      (SELECT count(*) FROM tarifa_mano_obra), (SELECT count(*) FROM insumo), (SELECT count(*) FROM concepto),
      (SELECT count(*) FROM componente), (SELECT count(*) FROM bitacora),
      (SELECT coalesce(sum(revision), 0) FROM proveedor), (SELECT string_agg(estado || coalesce(tarifa_id::text, ''), ',' ORDER BY id) FROM concepto),
      (SELECT count(*) FROM usuario), (SELECT coalesce(sum(revision), 0) FROM membresia), (SELECT coalesce(sum(revision), 0) FROM parametros_calculo),
      (SELECT count(*) FROM sesion WHERE motivo_revocacion IN ('DESACTIVADA', 'RESTABLECIMIENTO', 'CAMBIO_CONTRASENA'))
    )::text AS f`;
  return f!.f;
}

/** Todas las claves de un objeto JSON (recursivo). */
function claves(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => claves(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), claves(x, acc));
  return acc;
}

/** Datos técnicos o internos del catálogo que nunca deben aparecer en un contrato comercial. */
const INTERNOS = [
  "rendimiento",
  "desperdicio",
  "factorTraslape",
  "factor",
  "contenido",
  "incrementoMinimo",
  "fuente",
  "responsable",
  "reglaMedicion",
  "criterios",
  "tarifa",
  "rendimientoJornada",
  "modalidad",
  "motivoAnulacion",
  "precioUnitarioProveedor",
  "costoDirecto",
  "recargo",
  "margen",
];

beforeAll(async () => {
  org = (await cargarDemo(prisma, { codigo: "DEMO-ACC", nombre: "[DEMO] Acceso por ruta" })).organizacionId;
  await cargarDemo(prisma, { codigo: "DEMO-ACC-B", nombre: "[DEMO] Acceso por ruta B" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-ACC", [
      cuenta("prep.acc@softarq.test", "[DEMO] Preparador acceso", "PREPARADOR"),
      cuenta("rev.acc@softarq.test", "[DEMO] Revisor acceso", "REVISOR"),
      cuenta("sis.acc@softarq.test", "[DEMO] Administrador del sistema acceso", "ADMIN_SISTEMA"),
      cuenta("admin.acc@softarq.test", "[DEMO] Administrador del catálogo acceso", "ADMIN_CATALOGO"),
    ]),
    await crearCuentas(migrador, "DEMO-ACC-B", [cuenta("admin.accb@softarq.test", "[DEMO] Administrador otra organización", "ADMIN_CATALOGO")]),
  );
  app = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "5000" }), {
    reloj: new RelojFijo("2026-10-17"),
  });
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
}, 120_000);

afterAll(async () => {
  await app?.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

describe("acceso real a /admin por función y ruta", () => {
  it("OpenAPI documenta las rutas de administración que se recorren", () => {
    const rutas = rutasAdmin();
    expect(rutas.length).toBeGreaterThanOrEqual(20);
    expect(rutas.some((r) => r.metodo === "POST")).toBe(true);
    expect(rutas.some((r) => r.metodo === "PATCH")).toBe(true);
  });

  it("OpenAPI incluye las rutas del Administrador del sistema (parámetros y personas)", () => {
    const sistema = rutasAdmin().filter((r) => esDelSistema(r.ruta));
    expect(sistema.map((r) => `${r.metodo} ${r.ruta.replace(CODIGO_POR_SEGMENTO.personas!, "{id}")}`).sort()).toEqual([
      "GET /api/v1/admin/parametros",
      "GET /api/v1/admin/personas",
      "GET /api/v1/admin/personas/{id}",
      "PATCH /api/v1/admin/parametros",
      "PATCH /api/v1/admin/personas/{id}",
      "POST /api/v1/admin/accesos-cliente/{id}/contrasena",
      "POST /api/v1/admin/personas",
      "POST /api/v1/admin/personas/{id}/restablecimiento",
      "PUT /api/v1/admin/accesos-cliente/{id}/estado",
    ]);
  });

  it("Preparador y Revisor reciben 403 en TODAS las rutas /admin; cada Administrador, en las del otro; nadie escribe nada", async () => {
    const antes = await huellaCatalogo();
    const casos: [string, (ruta: string) => boolean][] = [
      ["prep.acc@softarq.test", () => true],
      ["rev.acc@softarq.test", () => true],
      ["sis.acc@softarq.test", (ruta) => !esDelSistema(ruta)],
      ["admin.acc@softarq.test", esDelSistema],
    ];
    for (const [correo, prohibida] of casos) {
      const c = await entrar(correo);
      for (const { metodo, ruta } of rutasAdmin().filter((r) => prohibida(r.ruta))) {
        const r = await c.solicitar(metodo, ruta, metodo === "GET" ? {} : { cuerpo: {}, cabeceras: { "Idempotency-Key": randomUUID() } });
        expect(r.status, `${correo} ${metodo} ${ruta}: ${r.texto}`).toBe(403);
        expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
        // El cuerpo del 403 no filtra datos del catálogo.
        expect([...claves(r.cuerpo)].filter((k) => INTERNOS.includes(k))).toEqual([]);
      }
    }
    expect(await huellaCatalogo()).toBe(antes);
  });

  it("el Administrador del sistema accede a parámetros y personas; una persona inexistente responde 404", async () => {
    const s = await entrar("sis.acc@softarq.test");
    for (const { ruta } of rutasAdmin().filter((r) => r.metodo === "GET" && esDelSistema(r.ruta))) {
      const r = await s.get(ruta);
      expect(r.status, `GET ${ruta}: ${r.texto}`).toBe(ruta.includes(CODIGO_POR_SEGMENTO.personas!) ? 404 : 200);
      expect(r.texto).not.toMatch(/hash|argon2/i);
    }
  });

  it("el Administrador del catálogo accede; el de otra organización recibe 404 en los detalles con código", async () => {
    const a = await entrar("admin.acc@softarq.test");
    const b = await entrar("admin.accb@softarq.test");
    for (const { metodo, ruta } of rutasAdmin().filter((r) => r.metodo === "GET" && !esDelSistema(r.ruta))) {
      const r = await a.get(ruta);
      expect(r.status, `${metodo} ${ruta}: ${r.texto}`).toBe(200);
    }
    // Un registro propio de A (no cargado en B) no existe para B.
    const prv = await a.post("/api/v1/admin/proveedores", { nombre: `[DEMO] Solo de A ${randomUUID().slice(0, 6)}` }, { cabeceras: { "Idempotency-Key": randomUUID() } });
    expect(prv.status, prv.texto).toBe(201);
    const ajeno = await b.get(`/api/v1/admin/proveedores/${prv.cuerpo.codigo}`);
    expect(ajeno.status).toBe(404);
    const listaB = await b.get(`/api/v1/admin/proveedores?buscar=${encodeURIComponent("Solo de A")}&incluirInactivos=true`);
    expect(listaB.cuerpo.proveedores).toEqual([]);
  });

  it("las respuestas comerciales reales no traen datos técnicos ni importes internos", async () => {
    const p = await entrar("prep.acc@softarq.test");
    const sv = ESCENARIOS.find((e) => e.id === "GUIA-R3-SIN-VENTANA")!;
    const respuestas = [
      await p.get("/api/v1/catalogos/conceptos?limite=100"),
      await p.get("/api/v1/catalogos/opciones-precio?conceptos=CON-00001,CON-00002,CON-00007,CON-00008,CON-00009"),
      await p.get("/api/v1/catalogos/tipos-adicional"),
    ];
    const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente acceso ${randomUUID().slice(0, 6)}`, contactoNombre: "Contacto", contactoTelefono: "55 1234 5678" }, { cabeceras: { "Idempotency-Key": randomUUID() } });
    const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: "[DEMO] Obra acceso", municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Muro." }, { cabeceras: { "Idempotency-Key": randomUUID() } });
    const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(sv.entrada as EntradaCalculo) }, { cabeceras: { "Idempotency-Key": randomUUID() } });
    const id = cot.cuerpo.cotizacion.id as string;
    const det = await p.get(`/api/v1/cotizaciones/${id}`);
    const v = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: det.cuerpo.borrador.revision }, { cabeceras: { "Idempotency-Key": randomUUID() } });
    expect(v.status, v.texto).toBe(201);
    expect(v.cuerpo.cotizacion.total).toBe("22405.28");
    respuestas.push(v, await p.get(`/api/v1/cotizaciones/${id}/versiones/1`), await p.get(`/api/v1/cotizaciones/${id}/versiones/1/verificacion`), det);
    for (const r of respuestas) {
      expect(r.status, r.texto).toBe(200 <= r.status && r.status < 300 ? r.status : 200);
      const fugas = [...claves(r.cuerpo)].filter((k) => INTERNOS.includes(k));
      expect(fugas, JSON.stringify(r.cuerpo).slice(0, 200)).toEqual([]);
    }
  });
});
