/**
 * Módulo 15 (ADR-0019) por HTTP con sesiones reales contra softarq_test: duplicar (B-35), preparar la
 * versión nueva con modo de precios (B-34) y vista previa PDF BORRADOR (B-25). Fuentes:
 * `modHistorial.bas` (`His_Duplicar`, `His_NuevaVersion`, `Ver_CopiarContenido`), `modPdf.bas`
 * (`BTN_VistaPrevia`), Word maestro v1.3 §3.8, §3.9 y §3.13; pruebas TI-130 a TI-137, TI-155 y
 * TI-324. Totales de referencia de la guía (54,190.68; 43,312.16; 22,405.28; 4,911.79) y unidades
 * por producto de las fixtures (R3 con block: 324 piezas sin excepción, 337 con ella; TI-339).
 */
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EsquemaDetalleCotizacion,
  EsquemaDetalleEmision,
  EsquemaDetalleRevision,
  LEYENDA_DEMO,
  type CapturaBorrador,
  type DetalleCotizacion,
  type DetalleRevision,
  type EntradaCalculo,
  type ExcepcionBorrador,
} from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { EMISOR_PENDIENTE, MARCA_BORRADOR } from "../modules/cotizaciones/dominio/pdf/generador-pdf.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, NOMBRE_COOKIE, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
/** Posterior al fin del precio de prueba PRE-M15-CORTO (31/12/2026) y anterior al de la tarifa (BL-10). */
const FECHA_VENCIDOS = "2027-01-15";
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const R3B = ESCENARIOS.find((e) => e.id === "GUIA-R3-BLOCK-1390")!;
const REFERENCIAS = ["GUIA-R1-FALDONES-10M", "GUIA-R2-ESPESOR-012", "GUIA-R3-SIN-VENTANA", "GUIA-PROPIA-CON-00001"].map((id) => ESCENARIOS.find((e) => e.id === id)!);
const DIR = join(directorioDocumentosPrueba("integracion"), "..", "documentos-m15");
const MOTIVO = "Actualización solicitada por el cliente tras la emisión.";
const INTERNAS = /costo|proveedor|consumo|rendimiento|desperdicio|margen|recargo|excepci|sobrante|_work|postgres/i;

const prisma = prismaApp();
let migrador: ClientePrisma;
let org: string;
let orgC: string;
let url: string;
let urlVencidos: string;
const apps: INestApplication[] = [];
const cred: Record<string, Credencial> = {};
const entrar = (correo: string, base = url) => new ClienteHttp(base).entrar(cred[correo]!);
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function appCon(fecha: string): Promise<string> {
  const a = await crearAplicacion(
    leerConfiguracion({
      DATABASE_URL: urlDePrueba("DATABASE_URL"),
      API_REGISTRO: "ninguno",
      SOFTARQ_DIR_DOCUMENTOS: DIR,
      API_ACCESO_INTENTOS_IP: "1000",
      API_LIMITE_GENERAL_POR_MINUTO: "2000",
      API_LIMITE_CALCULO_POR_MINUTO: "600",
    }),
    { reloj: new RelojFijo(fecha) },
  );
  await a.listen(0, "127.0.0.1");
  apps.push(a);
  return (await a.getUrl()).replace("[::1]", "127.0.0.1");
}

async function textoPdf(pdf: Buffer): Promise<{ paginas: string[]; meta: Record<string, unknown> }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarea = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true });
  const doc = await tarea.promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    paginas.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ").replace(/\s+/g, " "));
  }
  const meta = (await doc.getMetadata()).info as Record<string, unknown>;
  await tarea.destroy();
  return { paginas, meta };
}

/** Cliente (con contacto), proyecto completo y cotización con la captura indicada; con v1 si `calcular`. */
async function cotizacion(c: ClienteHttp, o: { captura?: CapturaBorrador; calcular?: boolean } = {}) {
  const s = randomUUID().slice(0, 6);
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente M15 ${s}`, contactoNombre: "Begoña Muñoz Íñiguez", contactoTelefono: "55 1234 5678", contactoCorreo: "begona@ejemplo.invalid" }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra M15 ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Nave de prueba." }, idem());
  expect(pry.status, pry.texto).toBe(201);
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: o.captura ?? borradorDesdeEntrada(R1.entrada as EntradaCalculo) }, idem());
  expect(cot.status, cot.texto).toBe(201);
  const id = cot.cuerpo.cotizacion.id as string;
  if (o.calcular !== false) {
    const v = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: cot.cuerpo.borrador.revision }, idem());
    expect(v.status, v.texto).toBe(201);
  }
  return { id, folio: cot.cuerpo.cotizacion.folio as string, clienteId: cli.cuerpo.id as string, proyectoId: pry.cuerpo.id as string, clienteRevision: cli.cuerpo.revision as number, proyectoRevision: pry.cuerpo.revision as number };
}

const detalle = async (c: ClienteHttp, id: string): Promise<DetalleCotizacion> => {
  const r = await c.get(`/api/v1/cotizaciones/${id}`);
  expect(r.status, r.texto).toBe(200);
  return EsquemaDetalleCotizacion.parse(r.cuerpo);
};

async function aprobar(p: ClienteHttp, r: ClienteHttp, id: string, numero: number): Promise<DetalleRevision> {
  const d = await detalle(p, id);
  const env = await p.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/revisiones`, { revisionBorrador: d.borrador.revision }, idem());
  expect(env.status, env.texto).toBe(201);
  const rev = EsquemaDetalleRevision.parse(env.cuerpo);
  const ok = await r.post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId: rev.revision.version.id, revision: rev.revision.revision }, idem());
  expect(ok.status, ok.texto).toBe(200);
  return EsquemaDetalleRevision.parse(ok.cuerpo);
}

async function emitir(p: ClienteHttp, r: ClienteHttp, id: string, numero: number) {
  const rev = await aprobar(p, r, id, numero);
  const e = await p.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/emision`, { versionId: rev.revision.version.id, revisionId: rev.revision.id }, idem());
  expect(e.status, e.texto).toBe(201);
  return EsquemaDetalleEmision.parse(e.cuerpo);
}

async function descargarOriginal(c: ClienteHttp, emisionId: string): Promise<Buffer> {
  const r = await fetch(`${c.url}/api/v1/emisiones/${emisionId}/documento`, { headers: { Cookie: `${NOMBRE_COOKIE}=${c.cookie}` } });
  expect(r.status).toBe(200);
  return Buffer.from(await r.arrayBuffer());
}

async function vistaPrevia(c: ClienteHttp, id: string, numero: number, clave = randomUUID()) {
  const cabeceras: Record<string, string> = {
    Cookie: `${NOMBRE_COOKIE}=${c.cookie}`,
    Origin: "http://localhost:5173",
    "Idempotency-Key": clave,
    "Content-Type": "application/json",
  };
  if (c.csrf) cabeceras["X-CSRF-Token"] = c.csrf;
  const r = await fetch(`${c.url}/api/v1/cotizaciones/${id}/versiones/${numero}/vista-previa`, { method: "POST", headers: cabeceras, body: "{}" });
  const cuerpo = Buffer.from(await r.arrayBuffer());
  const json = r.headers.get("content-type")?.includes("json") ? JSON.parse(cuerpo.toString("utf8")) : null;
  return { status: r.status, headers: r.headers, cuerpo, json };
}

const contar = async (tipo: string, entidadId: string) =>
  Number((await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM bitacora WHERE tipo = ${tipo} AND entidad_id = ${entidadId}::uuid`)[0]!.n);

/**
 * Huella de lo que el negocio escribe en una cotización, sin bitácora ni idempotencia (auditoría).
 * Con `conContador`, también el contador de folios de la organización (una vista previa no lo
 * consume; duplicar sí, para la cotización nueva).
 */
async function huellaNegocio(id: string, conContador = true): Promise<string> {
  const [f] = await migrador.$queryRaw<{ h: string }[]>`
    SELECT md5(concat_ws('|',
      (SELECT to_jsonb(q)::text FROM cotizacion q WHERE q.id = ${id}::uuid),
      (SELECT to_jsonb(b)::text FROM cotizacion_borrador b WHERE b.cotizacion_id = ${id}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.numero), '[]')::text FROM cotizacion_version v WHERE v.cotizacion_id = ${id}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]')::text FROM revision r WHERE r.cotizacion_id = ${id}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id), '[]')::text FROM emision e WHERE e.cotizacion_id = ${id}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.entidad), '[]')::text FROM contador k WHERE ${conContador} AND k.organizacion_id = ${org}::uuid)
    )) AS h`;
  return f!.h;
}
const archivosDocumentos = () => {
  try {
    return readdirSync(DIR, { recursive: true }).length;
  } catch {
    return 0;
  }
};

beforeAll(async () => {
  vaciarDocumentosPrueba(DIR);
  org = (await cargarDemo(prisma, { codigo: "DEMO-M15", nombre: "[DEMO] Módulo quince" })).organizacionId;
  await cargarEmisorDemo(prisma, org);
  await cargarDemo(prisma, { codigo: "DEMO-M15-B", nombre: "[DEMO] Módulo quince B" });
  await cargarDemo(prisma, { codigo: "DEMO-M15-SIN", nombre: "[DEMO] Módulo quince sin emisor" });
  // Organización propia para las pruebas que cambian el catálogo (precio anulado, precio de vigencia corta).
  orgC = (await cargarDemo(prisma, { codigo: "DEMO-M15-C", nombre: "[DEMO] Módulo quince catálogo" })).organizacionId;
  await cargarEmisorDemo(prisma, orgC);
  await new RepositorioCatalogos(prisma).asegurarProveedor({ organizacionId: orgC }, { codigo: "PRV-M15", nombre: "[DEMO] Proveedor de vigencia corta" });
  await new RepositorioCatalogos(prisma).asegurarPrecio(
    { organizacionId: orgC },
    { codigo: "PRE-M15-CORTO", producto: "PCM-00004", proveedor: "PRV-M15", precioUnitario: "385", vigenteDesde: "2026-09-01", vigenteHasta: "2026-12-31", fuente: "[DEMO] Precio de vigencia corta para la prueba de BL-09" },
  );
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-M15", [
      cuenta("prep.m15@softarq.test", "[DEMO] Preparadora Módulo Quince", "PREPARADOR"),
      cuenta("rev.m15@softarq.test", "[DEMO] Revisor Módulo Quince", "REVISOR"),
      cuenta("cat.m15@softarq.test", "[DEMO] Administrador del catálogo M15", "ADMIN_CATALOGO"),
      cuenta("sis.m15@softarq.test", "[DEMO] Administrador del sistema M15", "ADMIN_SISTEMA"),
      cuenta("baja.m15@softarq.test", "[DEMO] Persona desactivada M15", "REVISOR"),
      cuenta("temporal.m15@softarq.test", "[DEMO] Temporal M15", "REVISOR"),
    ]),
    await crearCuentas(migrador, "DEMO-M15-B", [cuenta("prep.m15b@softarq.test", "[DEMO] Preparador otra organización", "PREPARADOR")]),
    await crearCuentas(migrador, "DEMO-M15-SIN", [cuenta("prep.m15sin@softarq.test", "[DEMO] Preparador sin emisor", "PREPARADOR")]),
    await crearCuentas(migrador, "DEMO-M15-C", [
      cuenta("prep.m15c@softarq.test", "[DEMO] Preparador catálogo M15", "PREPARADOR"),
      cuenta("rev.m15c@softarq.test", "[DEMO] Revisor catálogo M15", "REVISOR"),
    ]),
  );
  url = await appCon(FECHA);
  urlVencidos = await appCon(FECHA_VENCIDOS);
}, 120_000);

afterAll(async () => {
  for (const a of apps) await a.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

const prep = () => entrar("prep.m15@softarq.test");
const rev = () => entrar("rev.m15@softarq.test");

// ===========================================================================
// Duplicar (B-35)
// ===========================================================================

describe("duplicar (B-35)", () => {
  it("TI-155: desde una versión emitida → folio nuevo, sin precios, aprobación, emisión ni respuesta; trazabilidad; original intacto", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    const em = await emitir(p, r, o.id, 1);
    const pdfAntes = await descargarOriginal(p, em.emision.id);
    const huellaAntes = await huellaNegocio(o.id, false);
    const origenV1 = (await p.get(`/api/v1/cotizaciones/${o.id}/versiones/1`)).cuerpo;

    const d = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "VERSION", numero: 1 }, proyectoId: o.proyectoId }, idem());
    expect(d.status, d.texto).toBe(201);
    const n = EsquemaDetalleCotizacion.parse(d.cuerpo);
    expect(n.cotizacion.folio).not.toBe(o.folio);
    expect(n.cotizacion.folio).toMatch(/^COT-2026-\d{5}$/);
    expect(n.duplicadaDe).toEqual({ cotizacionId: o.id, folio: o.folio, version: 1, revision: null });
    expect(n.versiones).toEqual([]);
    expect(n.revisiones).toEqual([]);
    expect(n.cotizacion.creadoPor).toBe("[DEMO] Preparadora Módulo Quince");
    expect(n.borrador.revision).toBe(0);
    expect(n.borrador.captura.seleccion).toEqual([]);
    expect("excepciones" in n.borrador.captura).toBe(false);
    expect(n.borrador.captura.partidas).toEqual(origenV1.captura.partidas);
    expect(n.borrador.captura.textos).toEqual(origenV1.captura.textos);
    expect(n.borrador.completitud.lista).toBe(false);
    expect(n.nuevaVersion).toBeNull();
    const ev = n.eventos.find((e) => e.tipo === "COTIZACION_DUPLICADA")!;
    expect(ev.detalle).toMatchObject({ origenFolio: o.folio, origenVersion: 1 });
    expect(ev.usuario).toBe("[DEMO] Preparadora Módulo Quince");

    // El original, sus versiones, su emisión y su PDF no cambian.
    expect(await huellaNegocio(o.id, false)).toBe(huellaAntes);
    expect(sha(await descargarOriginal(p, em.emision.id))).toBe(sha(pdfAntes));
  });

  it("desde el borrador guardado: revisión esperada; sin excepciones (el rendimiento excepcional deja de aplicarse); revisión obsoleta 409", async () => {
    const p = await prep();
    const o = await cotizacion(p, { captura: borradorDesdeEntrada(R3B.entrada as EntradaCalculo), calcular: false });
    const b0 = await detalle(p, o.id);
    const excepcion: ExcepcionBorrador = {
      tipo: "RENDIMIENTO", partida: 1, conceptoCodigo: "CON-00009", componenteCodigo: "CMP-00011", campo: "RENDIMIENTO", valorAplicado: "13", motivo: "Block de mayor formato verificado en obra por el residente.",
    };
    const g = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: b0.borrador.revision, captura: { ...b0.borrador.captura, excepciones: [excepcion] } });
    expect(g.status, g.texto).toBe(200);
    const revision = g.cuerpo.revision as number;

    const obsoleta = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "BORRADOR", revision: revision - 1 }, proyectoId: o.proyectoId }, idem());
    expect(obsoleta.status).toBe(409);
    expect(obsoleta.cuerpo.error.codigo).toBe("BORRADOR_DESACTUALIZADO");

    const d = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "BORRADOR", revision }, proyectoId: o.proyectoId }, idem());
    expect(d.status, d.texto).toBe(201);
    const n = EsquemaDetalleCotizacion.parse(d.cuerpo);
    expect(n.duplicadaDe).toMatchObject({ version: null, revision });
    expect("excepciones" in n.borrador.captura).toBe(false);
    expect(n.borrador.captura.seleccion).toEqual([]);

    // Calcular el duplicado con las selecciones elegidas de nuevo: sin la excepción (324 piezas, no 337).
    const sel = (await p.put(`/api/v1/cotizaciones/${n.cotizacion.id}/borrador`, { revision: 0, captura: { ...n.borrador.captura, seleccion: b0.borrador.captura.seleccion } }));
    expect(sel.status, sel.texto).toBe(200);
    const v = await p.post(`/api/v1/cotizaciones/${n.cotizacion.id}/versiones`, { revisionBorrador: sel.cuerpo.revision }, idem());
    expect(v.status, v.texto).toBe(201);
    expect(v.cuerpo.cotizacion.total).toBe(R3B.esperado.total);
    const [fila] = await migrador.$queryRaw<{ r: { compras: { productoId: string; unidades: string }[] } }[]>`
      SELECT resultado_interno AS r FROM cotizacion_version WHERE cotizacion_id = ${n.cotizacion.id}::uuid AND numero = 1`;
    expect(fila!.r.compras.find((k) => k.productoId === "PCM-00010")!.unidades).toBe("324");
    // El original conserva su excepción.
    expect((await detalle(p, o.id)).borrador.captura.excepciones).toEqual([excepcion]);
  });

  it("reintento con la misma clave: un solo folio; dos duplicaciones simultáneas: dos folios distintos", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const cuerpo = { origen: { tipo: "VERSION", numero: 1 }, proyectoId: o.proyectoId };
    const clave = idem();
    const a = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, cuerpo, clave);
    const b = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, cuerpo, clave);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.cuerpo.cotizacion.id).toBe(a.cuerpo.cotizacion.id);
    const [x, y] = await Promise.all([p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, cuerpo, idem()), p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, cuerpo, idem())]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(new Set([a.cuerpo.cotizacion.folio, x.cuerpo.cotizacion.folio, y.cuerpo.cotizacion.folio]).size).toBe(3);
    const [n] = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM cotizacion WHERE duplicada_de_id = ${o.id}::uuid`;
    expect(Number(n!.n)).toBe(3);
  });

  it("destino inactivo: 422 y nada se crea; con otro proyecto activo, sí", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const otro = await cotizacion(p, { calcular: false });
    const des = await p.patch(`/api/v1/proyectos/${o.proyectoId}`, { revision: o.proyectoRevision, activo: false });
    expect(des.status, des.texto).toBe(200);
    const antes = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM cotizacion WHERE organizacion_id = ${org}::uuid`;
    const r = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "VERSION", numero: 1 }, proyectoId: o.proyectoId }, idem());
    expect(r.status).toBe(422);
    expect(r.cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    const despues = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM cotizacion WHERE organizacion_id = ${org}::uuid`;
    expect(despues[0]!.n).toBe(antes[0]!.n);
    const ok = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "VERSION", numero: 1 }, proyectoId: otro.proyectoId }, idem());
    expect(ok.status, ok.texto).toBe(201);
    expect(ok.cuerpo.cotizacion.proyecto.id).toBe(otro.proyectoId);
  });

  it("referencias que dejaron de estar disponibles: se conservan marcadas y no se sustituyen", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const ctx = { organizacionId: org };
    await new RepositorioCatalogos(migrador).cambiarEstadoConcepto(ctx, "CON-00007", "Borrador");
    try {
      const r = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "VERSION", numero: 1 }, proyectoId: o.proyectoId }, idem());
      expect(r.status, r.texto).toBe(201);
      const n = EsquemaDetalleCotizacion.parse(r.cuerpo);
      expect(n.borrador.captura.partidas.some((x) => x.tipo === "CONCEPTO" && x.conceptoCodigo === "CON-00007")).toBe(true);
      expect(n.borrador.referencias.conceptos.find((c) => c.codigo === "CON-00007")).toMatchObject({ disponible: false });
    } finally {
      await new RepositorioCatalogos(migrador).cambiarEstadoConcepto(ctx, "CON-00007", "Aprobado");
    }
  });

  it("permisos y organización: Revisor y Administrador del catálogo 403; otra organización 404", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const cuerpo = { origen: { tipo: "VERSION", numero: 1 }, proyectoId: o.proyectoId };
    for (const correo of ["rev.m15@softarq.test", "cat.m15@softarq.test", "sis.m15@softarq.test"]) {
      const r = await (await entrar(correo)).post(`/api/v1/cotizaciones/${o.id}/duplicados`, cuerpo, idem());
      expect(r.status, correo).toBe(403);
    }
    const b = await (await entrar("prep.m15b@softarq.test")).post(`/api/v1/cotizaciones/${o.id}/duplicados`, cuerpo, idem());
    expect(b.status).toBe(404);
    // Un objeto del navegador que pretenda ser la captura no se acepta (contrato estricto).
    const intento = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { ...cuerpo, captura: { partidas: [] } }, idem());
    expect(intento.status).toBe(400);
  });
});

// ===========================================================================
// Modo de precios para la versión nueva (B-34)
// ===========================================================================

describe("modo de precios (B-34)", () => {
  it("antes de la primera emisión no se pide; tras emitir, guardar y calcular exigen preparar (TI-130)", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    let d = await detalle(p, o.id);
    expect(d.nuevaVersion).toBeNull();
    const g = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: d.borrador.revision, captura: d.borrador.captura });
    expect(g.status).toBe(200);
    const v2 = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: g.cuerpo.revision }, idem());
    expect(v2.status).toBe(201);
    await emitir(p, r, o.id, 2);

    d = await detalle(p, o.id);
    expect(d.nuevaVersion).toEqual({ requerida: true, versionOrigen: 2, preparada: null });
    const sinPreparar = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: d.borrador.revision, captura: d.borrador.captura });
    expect(sinPreparar.status).toBe(409);
    expect(sinPreparar.cuerpo.error.codigo).toBe("NUEVA_VERSION_SIN_PREPARAR");
    const calc = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: d.borrador.revision }, idem());
    expect(calc.status).toBe(409);
    expect(calc.cuerpo.error.codigo).toBe("NUEVA_VERSION_SIN_PREPARAR");
    const sinMotivo = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { versionOrigen: 2, modo: "CONSERVAR", motivo: "", revisionBorrador: d.borrador.revision }, idem());
    expect(sinMotivo.status).toBe(400);
  });

  it("CONSERVAR (TI-131): selecciones de la versión emitida; v(n+1) con modo y origen; total igual si no cambian parámetros; el paso no se repite; reintento sin duplicar", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    const em = await emitir(p, r, o.id, 1);
    const pdfAntes = sha(await descargarOriginal(p, em.emision.id));
    const v1 = (await p.get(`/api/v1/cotizaciones/${o.id}/versiones/1`)).cuerpo;
    const d = await detalle(p, o.id);
    const cuerpo = { versionOrigen: 1, modo: "CONSERVAR", motivo: MOTIVO, revisionBorrador: d.borrador.revision };
    const clave = idem();
    const a = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, cuerpo, clave);
    expect(a.status, a.texto).toBe(200);
    const b = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, cuerpo, clave);
    expect(b.status).toBe(200);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(await contar("NUEVA_VERSION_PREPARADA", o.id)).toBe(1);
    const n = EsquemaDetalleCotizacion.parse(a.cuerpo);
    expect(n.nuevaVersion).toMatchObject({ requerida: false, versionOrigen: 1, preparada: { modo: "CONSERVAR", motivo: MOTIVO, por: "[DEMO] Preparadora Módulo Quince" } });
    expect(n.borrador.captura.seleccion).toEqual(v1.captura.seleccion);
    expect(n.borrador.captura.partidas).toEqual(v1.captura.partidas);
    const otra = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { ...cuerpo, revisionBorrador: n.borrador.revision }, idem());
    expect(otra.status).toBe(422);
    expect(otra.cuerpo.error.codigo).toBe("NUEVA_VERSION_NO_APLICA");

    // Editar y calcular ya se permiten (sin volver a pedir el modo en el mismo ciclo).
    const g = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: n.borrador.revision, captura: n.borrador.captura });
    expect(g.status, g.texto).toBe(200);
    const v2 = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: g.cuerpo.revision }, idem());
    expect(v2.status, v2.texto).toBe(201);
    expect(v2.cuerpo.version).toMatchObject({ numero: 2, modoPrecios: "CONSERVAR", versionOrigen: 1, motivo: MOTIVO });
    expect(v2.cuerpo.cotizacion.total).toBe(R1.esperado.total);
    const g2 = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: g.cuerpo.revision, captura: n.borrador.captura });
    expect(g2.status).toBe(200);
    // La emisión original y su PDF no cambian; la v1 queda emitida.
    expect(sha(await descargarOriginal(p, em.emision.id))).toBe(pdfAntes);
    expect((await p.get(`/api/v1/cotizaciones/${o.id}/versiones/1`)).cuerpo.version.estado).toBe("EMITIDA");
  });

  it("CONSERVAR con recargo vigente distinto: mismos precios, total distinto (recargo, impuesto y tarifa vigentes)", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    await emitir(p, r, o.id, 1);
    const d = await detalle(p, o.id);
    const a = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { versionOrigen: 1, modo: "CONSERVAR", motivo: MOTIVO, revisionBorrador: d.borrador.revision }, idem());
    expect(a.status).toBe(200);
    await migrador.$executeRaw`UPDATE parametros_calculo SET recargo_sobre_costo = 0.25 WHERE organizacion_id = ${org}::uuid`;
    try {
      const v2 = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: a.cuerpo.borrador.revision }, idem());
      expect(v2.status, v2.texto).toBe(201);
      expect(v2.cuerpo.cotizacion.total).not.toBe(R1.esperado.total);
      const [x] = await migrador.$queryRaw<{ s1: unknown; s2: unknown }[]>`
        SELECT (SELECT captura->'seleccion' FROM cotizacion_version WHERE cotizacion_id = ${o.id}::uuid AND numero = 1) AS s1,
               (SELECT captura->'seleccion' FROM cotizacion_version WHERE cotizacion_id = ${o.id}::uuid AND numero = 2) AS s2`;
      expect(x!.s2).toEqual(x!.s1);
    } finally {
      await migrador.$executeRaw`UPDATE parametros_calculo SET recargo_sobre_costo = 0.20 WHERE organizacion_id = ${org}::uuid`;
    }
  });

  it("ELEGIR_DE_NUEVO (TI-135): sin selecciones; calcular bloquea hasta elegir explícitamente; nunca el menor automático", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    await emitir(p, r, o.id, 1);
    const d = await detalle(p, o.id);
    const a = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { versionOrigen: 1, modo: "ELEGIR_DE_NUEVO", motivo: MOTIVO, revisionBorrador: d.borrador.revision }, idem());
    expect(a.status, a.texto).toBe(200);
    const n = EsquemaDetalleCotizacion.parse(a.cuerpo);
    expect(n.borrador.captura.seleccion).toEqual([]);
    const v = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: n.borrador.revision }, idem());
    expect(v.status).toBe(422);
    const g = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: n.borrador.revision, captura: { ...n.borrador.captura, seleccion: d.borrador.captura.seleccion } });
    expect(g.status, g.texto).toBe(200);
    const v2 = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: g.cuerpo.revision }, idem());
    expect(v2.status, v2.texto).toBe(201);
    expect(v2.cuerpo.version.modoPrecios).toBe("ELEGIR_DE_NUEVO");
  });

  it("borrador divergente: 409 con las diferencias y sin cambios hasta confirmar", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    await emitir(p, r, o.id, 1);
    // Borrador con selecciones cambiadas después de emitir (como los anteriores al módulo).
    await migrador.$executeRaw`UPDATE cotizacion_borrador SET captura = jsonb_set(captura, '{seleccion}', '[]'::jsonb) WHERE cotizacion_id = ${o.id}::uuid`;
    const d = await detalle(p, o.id);
    const huellaAntes = await huellaNegocio(o.id);
    const cuerpo = { versionOrigen: 1, modo: "CONSERVAR", motivo: MOTIVO, revisionBorrador: d.borrador.revision };
    const x = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, cuerpo, idem());
    expect(x.status).toBe(409);
    expect(x.cuerpo.error.codigo).toBe("SELECCIONES_DIVERGENTES");
    expect(x.cuerpo.error.selecciones.actuales).toEqual([]);
    expect(x.cuerpo.error.selecciones.propuestas.length).toBeGreaterThan(0);
    expect(await huellaNegocio(o.id)).toBe(huellaAntes);
    const ok = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { ...cuerpo, reemplazarSeleccionesDelBorrador: true }, idem());
    expect(ok.status, ok.texto).toBe(200);
    expect(ok.cuerpo.borrador.captura.seleccion).toEqual(x.cuerpo.error.selecciones.propuestas);
  });

  it("precio conservado anulado → BL-08 al calcular y marcado no disponible (TI-133)", async () => {
    const p = await entrar("prep.m15c@softarq.test");
    const r = await entrar("rev.m15c@softarq.test");
    const o = await cotizacion(p);
    await emitir(p, r, o.id, 1);
    const d = await detalle(p, o.id);
    const a = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { versionOrigen: 1, modo: "CONSERVAR", motivo: MOTIVO, revisionBorrador: d.borrador.revision }, idem());
    expect(a.status).toBe(200);
    const precio = d.borrador.captura.seleccion[0]!.precioCodigo;
    const repo = new RepositorioCatalogos(migrador);
    // Se anula el precio conservado en el catálogo de esta organización de prueba (rol migrador).
    await repo.anularPrecio({ organizacionId: orgC }, precio);
    const v = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: a.cuerpo.borrador.revision }, idem());
    expect(v.status).toBe(422);
    expect(v.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-08");
    const det = await detalle(p, o.id);
    expect(det.borrador.referencias.selecciones.find((s) => s.precioCodigo === precio)).toMatchObject({ disponible: false });
  });

  it("precio conservado vencido (TI-134): la versión se calcula, pero enviar a revisión bloquea con BL-09", async () => {
    const p = await entrar("prep.m15c@softarq.test");
    const r = await entrar("rev.m15c@softarq.test");
    // R1 con el precio de vigencia corta para la lámina (INS-00004), emitida hoy.
    const base = borradorDesdeEntrada(R1.entrada as EntradaCalculo);
    const captura = { ...base, seleccion: base.seleccion.map((x) => (x.insumoCodigo === "INS-00004" ? { ...x, precioCodigo: "PRE-M15-CORTO" } : x)) };
    const o = await cotizacion(p, { captura });
    await emitir(p, r, o.id, 1);
    const pV = await entrar("prep.m15c@softarq.test", urlVencidos);
    const d = await detalle(pV, o.id);
    const a = await pV.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { versionOrigen: 1, modo: "CONSERVAR", motivo: MOTIVO, revisionBorrador: d.borrador.revision }, idem());
    expect(a.status, a.texto).toBe(200);
    expect(a.cuerpo.borrador.captura.seleccion).toContainEqual({ insumoCodigo: "INS-00004", precioCodigo: "PRE-M15-CORTO" });
    expect(a.cuerpo.borrador.referencias.selecciones.find((s: { precioCodigo: string }) => s.precioCodigo === "PRE-M15-CORTO")).toMatchObject({ disponible: false });
    const v2 = await pV.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: a.cuerpo.borrador.revision }, idem());
    expect(v2.status, v2.texto).toBe(201);
    const env = await pV.post(`/api/v1/cotizaciones/${o.id}/versiones/2/revisiones`, { revisionBorrador: a.cuerpo.borrador.revision }, idem());
    expect(env.status).toBe(422);
    expect(env.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-09");
  });

  it("duplicar una versión sustituida y una cotización descartada (§3.9: siempre se puede duplicar)", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    await emitir(p, r, o.id, 1);
    const d = await detalle(p, o.id);
    const a = await p.post(`/api/v1/cotizaciones/${o.id}/nueva-version`, { versionOrigen: 1, modo: "CONSERVAR", motivo: MOTIVO, revisionBorrador: d.borrador.revision }, idem());
    const v2 = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: a.cuerpo.borrador.revision }, idem());
    expect(v2.status).toBe(201);
    await emitir(p, r, o.id, 2);
    expect((await p.get(`/api/v1/cotizaciones/${o.id}/versiones/1`)).cuerpo.version.estado).toBe("SUSTITUIDA");
    const dupS = await p.post(`/api/v1/cotizaciones/${o.id}/duplicados`, { origen: { tipo: "VERSION", numero: 1 }, proyectoId: o.proyectoId }, idem());
    expect(dupS.status, dupS.texto).toBe(201);
    // Tras emitir v2, el ciclo vuelve a pedirse (TI-136: la anterior pasó a Sustituida).
    expect((await detalle(p, o.id)).nuevaVersion).toMatchObject({ requerida: true, versionOrigen: 2 });

    const des = await cotizacion(p);
    const desc = await p.post(`/api/v1/cotizaciones/${des.id}/descarte`, { motivo: "El cliente canceló la obra de prueba." }, idem());
    expect(desc.status, desc.texto).toBe(200);
    const dupD = await p.post(`/api/v1/cotizaciones/${des.id}/duplicados`, { origen: { tipo: "VERSION", numero: 1 }, proyectoId: des.proyectoId }, idem());
    expect(dupD.status, dupD.texto).toBe(201);
    expect(dupD.cuerpo.cotizacion.estadoFolio).toBe("ACTIVO");
    expect((await detalle(p, des.id)).cotizacion.estadoFolio).toBe("DESCARTADO");
  });
});

// ===========================================================================
// Vista previa BORRADOR (B-25)
// ===========================================================================

describe("vista previa BORRADOR (B-25)", () => {
  it("las cuatro funciones la consultan; marcas, folio y paginación; un evento por clave; sin escrituras del negocio ni archivos", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const huellaAntes = await huellaNegocio(o.id);
    const archivosAntes = archivosDocumentos();
    for (const correo of ["prep.m15@softarq.test", "rev.m15@softarq.test", "cat.m15@softarq.test", "sis.m15@softarq.test"]) {
      const v = await vistaPrevia(await entrar(correo), o.id, 1);
      expect(v.status, `${correo} ${v.json ? JSON.stringify(v.json) : ""}`).toBe(200);
      expect(v.headers.get("content-type")).toBe("application/pdf");
      expect(v.headers.get("content-disposition")).toBe(`attachment; filename="${o.folio}-v1-BORRADOR.pdf"`);
      expect(v.headers.get("cache-control")).toContain("no-store");
      expect(v.headers.get("x-content-type-options")).toBe("nosniff");
    }
    expect(await contar("VISTA_PREVIA", o.id)).toBe(4);
    const clave = randomUUID();
    const a = await vistaPrevia(p, o.id, 1, clave);
    const b = await vistaPrevia(p, o.id, 1, clave);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(await contar("VISTA_PREVIA", o.id)).toBe(5);
    expect(await huellaNegocio(o.id)).toBe(huellaAntes);
    expect(archivosDocumentos()).toBe(archivosAntes);
    expect(await contar("COTIZACION_EMITIDA", o.id)).toBe(0);

    const { paginas, meta } = await textoPdf(a.cuerpo);
    paginas.forEach((pg, i) => {
      expect(pg).toContain(MARCA_BORRADOR);
      expect(pg).toContain(LEYENDA_DEMO);
      expect(pg).toContain(`${o.folio}-v1 · WEB DEMO · BORRADOR`);
      expect(pg).toContain(`Página ${i + 1} de ${paginas.length}`);
    });
    const todo = paginas.join(" ");
    expect(todo).toContain("$54,190.68");
    expect(todo).toContain("Sin emitir");
    expect(todo.toLowerCase()).not.toMatch(INTERNAS);
    expect(meta["Author"]).toBeUndefined();
    expect(meta["Title"]).toBeUndefined();
  });

  it("estados: En revisión y Aprobada sí; Emitida y Sustituida no (BL-19); descartada no (BL-19)", async () => {
    const p = await prep();
    const r = await rev();
    const o = await cotizacion(p);
    const d = await detalle(p, o.id);
    const env = await p.post(`/api/v1/cotizaciones/${o.id}/versiones/1/revisiones`, { revisionBorrador: d.borrador.revision }, idem());
    expect(env.status).toBe(201);
    expect((await vistaPrevia(p, o.id, 1)).status).toBe(200);
    const revi = EsquemaDetalleRevision.parse(env.cuerpo);
    const ok = await r.post(`/api/v1/revisiones/${revi.revision.id}/decision`, { decision: "APROBAR", versionId: revi.revision.version.id, revision: revi.revision.revision }, idem());
    expect(ok.status).toBe(200);
    const aprobada = await vistaPrevia(p, o.id, 1);
    expect(aprobada.status).toBe(200);
    expect((await textoPdf(aprobada.cuerpo)).paginas.join(" ")).toContain("Aprobó: [DEMO] Revisor Módulo Quince");
    const e = await p.post(`/api/v1/cotizaciones/${o.id}/versiones/1/emision`, { versionId: revi.revision.version.id, revisionId: revi.revision.id }, idem());
    expect(e.status, e.texto).toBe(201);
    const emitida = await vistaPrevia(p, o.id, 1);
    expect(emitida.status).toBe(422);
    expect(emitida.json.error.codigo).toBe("VISTA_PREVIA_BLOQUEADA");
    expect(emitida.json.error.problemas[0].codigo).toBe("BL-19");

    const des = await cotizacion(p);
    expect((await p.post(`/api/v1/cotizaciones/${des.id}/descarte`, { motivo: "El cliente canceló la obra de prueba." }, idem())).status).toBe(200);
    const descartada = await vistaPrevia(p, des.id, 1);
    expect(descartada.status).toBe(422);
    expect(descartada.json.error.problemas[0].codigo).toBe("BL-19");
  });

  it("cálculo no vigente: borrador cambiado o parámetros cambiados → BL-16, sin escribir nada; los datos administrativos no lo invalidan", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const d = await detalle(p, o.id);
    // Datos administrativos actuales: renombrar el cliente no bloquea y aparece el nombre actual.
    const ren = await p.patch(`/api/v1/clientes/${o.clienteId}`, { revision: o.clienteRevision, nombre: "[DEMO] Cliente renombrado después" });
    expect(ren.status, ren.texto).toBe(200);
    const actual = await vistaPrevia(p, o.id, 1);
    expect(actual.status).toBe(200);
    expect((await textoPdf(actual.cuerpo)).paginas.join(" ")).toContain("[DEMO] Cliente renombrado después");
    expect((await p.get(`/api/v1/cotizaciones/${o.id}/versiones/1`)).cuerpo.cliente.nombre).not.toBe("[DEMO] Cliente renombrado después");

    // Parámetros del cálculo cambiados: BL-16.
    await migrador.$executeRaw`UPDATE parametros_calculo SET recargo_sobre_costo = 0.25 WHERE organizacion_id = ${org}::uuid`;
    try {
      const antes = await contar("VISTA_PREVIA", o.id);
      const x = await vistaPrevia(p, o.id, 1);
      expect(x.status).toBe(422);
      expect(x.json.error.problemas.map((q: { codigo: string }) => q.codigo)).toContain("BL-16");
      expect(await contar("VISTA_PREVIA", o.id)).toBe(antes);
    } finally {
      await migrador.$executeRaw`UPDATE parametros_calculo SET recargo_sobre_costo = 0.20 WHERE organizacion_id = ${org}::uuid`;
    }
    // Borrador guardado después de la versión: BL-16.
    const g = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: d.borrador.revision, captura: d.borrador.captura });
    expect(g.status).toBe(200);
    const y = await vistaPrevia(p, o.id, 1);
    expect(y.status).toBe(422);
    expect(y.json.error.problemas[0].codigo).toBe("BL-16");
  });

  it("emisor pendiente y versión sin textos: se indican tal cual, sin plantillas actuales", async () => {
    const p = await entrar("prep.m15sin@softarq.test");
    const { textos: _t, ...sinTextos } = borradorDesdeEntrada(R1.entrada as EntradaCalculo);
    const o = await cotizacion(p, { calcular: false });
    const d = await detalle(p, o.id);
    const g = await p.put(`/api/v1/cotizaciones/${o.id}/borrador`, { revision: d.borrador.revision, captura: sinTextos });
    expect(g.status, g.texto).toBe(200);
    const v = await p.post(`/api/v1/cotizaciones/${o.id}/versiones`, { revisionBorrador: g.cuerpo.revision }, idem());
    expect(v.status, v.texto).toBe(201);
    const x = await vistaPrevia(p, o.id, 1);
    expect(x.status, x.json ? JSON.stringify(x.json) : "").toBe(200);
    const todo = (await textoPdf(x.cuerpo)).paginas.join(" ");
    expect(todo).toContain(EMISOR_PENDIENTE);
    expect(todo).toContain("No registrados en esta versión.");
  });

  it("sesión, función y organización: 401 sin sesión o desactivada, 403 con temporal pendiente, 404 en otra organización", async () => {
    const p = await prep();
    const o = await cotizacion(p);
    const anonimo = await fetch(`${url}/api/v1/cotizaciones/${o.id}/versiones/1/vista-previa`, {
      method: "POST",
      headers: { Origin: "http://localhost:5173", "Idempotency-Key": randomUUID(), "Content-Type": "application/json" },
      body: "{}",
    });
    expect(anonimo.status).toBe(401);
    expect((await vistaPrevia(await entrar("prep.m15b@softarq.test"), o.id, 1)).status).toBe(404);
    const baja = await entrar("baja.m15@softarq.test");
    const ub = (await migrador.usuario.findUniqueOrThrow({ where: { correo: "baja.m15@softarq.test" } })).id;
    await migrador.$executeRaw`UPDATE usuario SET activo = false WHERE id = ${ub}::uuid`;
    expect((await vistaPrevia(baja, o.id, 1)).status).toBe(401);
    const tmp = await entrar("temporal.m15@softarq.test");
    const ut = (await migrador.usuario.findUniqueOrThrow({ where: { correo: "temporal.m15@softarq.test" } })).id;
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() + interval '1 hour' WHERE id = ${ut}::uuid`;
    const t = await vistaPrevia(tmp, o.id, 1);
    expect(t.status).toBe(403);
    expect(t.json.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
  });

  it.each(REFERENCIAS.map((e) => [e.id, e] as const))("%s: el total de la vista previa es el de la versión", async (_, e) => {
    const p = await prep();
    const o = await cotizacion(p, { captura: borradorDesdeEntrada(e.entrada as EntradaCalculo) });
    const x = await vistaPrevia(p, o.id, 1);
    expect(x.status).toBe(200);
    const [entero, decimales] = e.esperado.total.split(".");
    const total = `$${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimales}`;
    expect((await textoPdf(x.cuerpo)).paginas.join(" ")).toContain(`Total MXN ${total}`);
  });
});
