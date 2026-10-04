/**
 * Emisión de versiones aprobadas, PDF DEMO, anulación de aprobaciones y descarte (módulo 8,
 * ADR-0010), por HTTP con sesiones reales contra softarq_test y una carpeta de documentos EXCLUSIVA
 * en _work\pruebas\documentos-integracion.
 *
 * Cubre: emisión por un Preparador y por un Revisor distinto del autor; rechazos (sin aprobación,
 * aprobación anulada o de otra versión, ids que no son los vigentes, Revisor autor, otras
 * funciones, saltarse la revisión en la base); datos faltantes (contacto, proyecto, emisor,
 * textos) y datos descriptivos cambiados; vigencias con la fecha de emisión; los cuatro totales de
 * referencia leídos del PDF; anulación y nueva aprobación; descarte; aislamiento; inmutabilidad;
 * historial y PDF intactos tras cambiar datos actuales. Concurrencia, idempotencia, fallos y
 * recuperación: concurrencia-emision.
 */
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EsquemaDetalleCotizacion,
  EsquemaDetalleEmision,
  EsquemaDetalleRevision,
  EsquemaEmisor,
  EsquemaValidacionEmision,
  LEYENDA_DEMO,
  type CapturaBorrador,
  type DetalleEmision,
  type DetalleRevision,
  type EntradaCalculo,
} from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { PRECIOS_DEMO, TARIFAS_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { cargarEmisorDemo, EMISOR_DEMO } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { TEXTOS_DEMO } from "../modules/cotizaciones/dominio/textos.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, NOMBRE_COOKIE, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const REFERENCIAS = ["GUIA-R1-FALDONES-10M", "GUIA-R2-ESPESOR-012", "GUIA-R3-SIN-VENTANA", "GUIA-PROPIA-CON-00001"].map(
  (id) => ESCENARIOS.find((e) => e.id === id)!,
);
const DIR = directorioDocumentosPrueba("integracion");

const prisma = prismaApp();
const repo = new RepositorioCatalogos(prisma);
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let orgId: string;
const cred: Record<string, Credencial> = {};
const apps: INestApplication[] = [];

const entrar = (correo: string, base = url) => new ClienteHttp(base).entrar(cred[correo]!);
const preparador = (base?: string) => entrar("prep.emi@softarq.test", base);
const preparador2 = () => entrar("prep2.emi@softarq.test");
const revisor = (base?: string) => entrar("rev.emi@softarq.test", base);
const revisor2 = () => entrar("rev2.emi@softarq.test");
const ambas = () => entrar("ambas.emi@softarq.test");
const administrador = (base?: string) => entrar("admin.emi@softarq.test", base);
const preparadorB = () => entrar("prep.emib@softarq.test");
const revisorB = () => entrar("rev.emib@softarq.test");
const preparadorSin = () => entrar("prep.emisin@softarq.test");
const revisorSin = () => entrar("rev.emisin@softarq.test");
const adminSin = () => entrar("admin.emisin@softarq.test");

const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Claves y valores internos que nunca salen hacia HTTP ni al PDF. */
const CLAVES_INTERNAS =
  /^(costo|consumo|margen|recargo|rendimiento|desperdicio|sobrante|tarifa|excepcion|compras?$|proveedor|precioId|productoId|entrada|resultadoInterno|huellaReferencia|tokenHash|hash|contrasena|autorId|preparadorId|archivoClave)/i;
function claves(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => claves(x, acc));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (acc.push(k), claves(v, acc));
  return acc;
}

async function textoPdf(pdf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarea = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true });
  const doc = await tarea.promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    partes.push(c.items.map((x) => ("str" in x ? x.str : "")).join(" "));
  }
  await tarea.destroy();
  return partes.join(" ").replace(/\s+/g, " ");
}

/** Descarga binaria (el cliente de pruebas decodifica texto). */
async function descargar(c: ClienteHttp, emisionId: string, cookie: string | null = c.cookie) {
  const r = await fetch(`${c.url}/api/v1/emisiones/${emisionId}/documento`, {
    headers: cookie ? { Cookie: `${NOMBRE_COOKIE}=${cookie}` } : {},
  });
  const cuerpo = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, cuerpo, json: r.headers.get("content-type")?.includes("json") ? JSON.parse(cuerpo.toString("utf8")) : null };
}

interface Opciones {
  entrada?: EntradaCalculo;
  contacto?: boolean;
  proyectoCompleto?: boolean;
  captura?: CapturaBorrador;
  sufijo?: string;
}

/** Cliente (con contacto), proyecto completo, cotización con la captura del escenario y v1. */
async function conV1(c: ClienteHttp, o: Opciones = {}) {
  const sufijo = o.sufijo ?? randomUUID().slice(0, 6);
  const cli = await c.post(
    "/api/v1/clientes",
    {
      nombre: `[DEMO] Construcción Peñasco ${sufijo}`,
      ...(o.contacto === false ? {} : { contactoNombre: "Begoña Muñoz Íñiguez", contactoTelefono: "55 1234 5678", contactoCorreo: "begona@ejemplo.invalid" }),
    },
    idem(),
  );
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post(
    "/api/v1/proyectos",
    {
      clienteId: cli.cuerpo.id,
      nombre: `[DEMO] Bodega «El Águila» ${sufijo}`,
      ...(o.proyectoCompleto === false ? {} : { municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Ampliación de nave con cubierta ligera." }),
    },
    idem(),
  );
  expect(pry.status, pry.texto).toBe(201);
  const cot = await c.post(
    "/api/v1/cotizaciones",
    { proyectoId: pry.cuerpo.id, captura: o.captura ?? borradorDesdeEntrada((o.entrada ?? R1.entrada) as EntradaCalculo) },
    idem(),
  );
  expect(cot.status, cot.texto).toBe(201);
  const id = cot.cuerpo.cotizacion.id as string;
  const v1 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
  expect(v1.status, v1.texto).toBe(201);
  return { id, folio: cot.cuerpo.cotizacion.folio as string, clienteId: cli.cuerpo.id as string, proyectoId: pry.cuerpo.id as string, versionId: v1.cuerpo.version.id as string };
}

const enviar = (c: ClienteHttp, id: string, numero: number, revisionBorrador: number) =>
  c.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/revisiones`, { revisionBorrador }, idem());

async function aprobar(p: ClienteHttp, r: ClienteHttp, id: string, numero: number, revisionBorrador: number): Promise<DetalleRevision> {
  const env = await enviar(p, id, numero, revisionBorrador);
  expect(env.status, env.texto).toBe(201);
  const rev = EsquemaDetalleRevision.parse(env.cuerpo);
  const ok = await r.post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId: rev.revision.version.id, revision: rev.revision.revision }, idem());
  expect(ok.status, ok.texto).toBe(200);
  return EsquemaDetalleRevision.parse(ok.cuerpo);
}

const validar = async (c: ClienteHttp, id: string, numero: number) => {
  const r = await c.get(`/api/v1/cotizaciones/${id}/versiones/${numero}/emision/validacion`);
  expect(r.status, r.texto).toBe(200);
  return EsquemaValidacionEmision.parse(r.cuerpo);
};

const emitir = (c: ClienteHttp, id: string, numero: number, versionId: string, revisionId: string, o = idem()) =>
  c.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/emision`, { versionId, revisionId }, o);

const detalleCot = async (c: ClienteHttp, id: string) => EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);

const anular = (c: ClienteHttp, rev: DetalleRevision, motivo = "El cliente pidió revisar el alcance antes de emitir.") =>
  c.post(`/api/v1/revisiones/${rev.revision.id}/anulacion`, { revision: rev.revision.revision, motivo }, idem());

const filaVersion = (cotizacionId: string, numero: number) =>
  migrador.$queryRaw<Record<string, unknown>[]>`SELECT to_jsonb(v) AS fila FROM cotizacion_version v WHERE cotizacion_id = ${cotizacionId}::uuid AND numero = ${numero}`;

const contarEmisiones = async (cotizacionId: string) =>
  Number((await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM emision WHERE cotizacion_id = ${cotizacionId}::uuid`)[0]!.n);

async function appCon(fecha: string): Promise<string> {
  const a = await crearAplicacion(
    // Muchas sesiones desde 127.0.0.1: límite por IP amplio (los de cuenta se conservan).
    leerConfiguracion({
      DATABASE_URL: urlDePrueba("DATABASE_URL"),
      API_REGISTRO: "ninguno",
      SOFTARQ_DIR_DOCUMENTOS: DIR,
      API_ACCESO_INTENTOS_IP: "1000",
    }),
    { reloj: new RelojFijo(fecha) },
  );
  await a.listen(0, "127.0.0.1");
  apps.push(a);
  return (await a.getUrl()).replace("[::1]", "127.0.0.1");
}

beforeAll(async () => {
  vaciarDocumentosPrueba(DIR);
  orgId = (await cargarDemo(prisma, { codigo: "DEMO-EMI", nombre: "[DEMO] Emisión" })).organizacionId;
  await cargarEmisorDemo(prisma, orgId);
  const orgB = (await cargarDemo(prisma, { codigo: "DEMO-EMI-B", nombre: "[DEMO] Emisión B" })).organizacionId;
  await cargarEmisorDemo(prisma, orgB);
  // Sin emisor: BL-15 y configuración por el Administrador del sistema.
  await cargarDemo(prisma, { codigo: "DEMO-EMI-SIN", nombre: "[DEMO] Emisión sin emisor" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-EMI", [
      cuenta("prep.emi@softarq.test", "[DEMO] Preparador Emi", "PREPARADOR"),
      cuenta("prep2.emi@softarq.test", "[DEMO] Preparador Emi 2", "PREPARADOR"),
      cuenta("rev.emi@softarq.test", "[DEMO] Revisora Begoña Íñiguez", "REVISOR"),
      cuenta("rev2.emi@softarq.test", "[DEMO] Revisor Emi 2", "REVISOR"),
      cuenta("ambas.emi@softarq.test", "[DEMO] Preparador y revisor Emi", "PREPARADOR", "REVISOR"),
      cuenta("admin.emi@softarq.test", "[DEMO] Administrador Emi", "ADMIN_SISTEMA"),
    ]),
    await crearCuentas(migrador, "DEMO-EMI-B", [
      cuenta("prep.emib@softarq.test", "[DEMO] Preparador B", "PREPARADOR"),
      cuenta("rev.emib@softarq.test", "[DEMO] Revisor B", "REVISOR"),
    ]),
    await crearCuentas(migrador, "DEMO-EMI-SIN", [
      cuenta("prep.emisin@softarq.test", "[DEMO] Preparador Sin", "PREPARADOR"),
      cuenta("rev.emisin@softarq.test", "[DEMO] Revisor Sin", "REVISOR"),
      cuenta("admin.emisin@softarq.test", "[DEMO] Administrador Sin", "ADMIN_SISTEMA"),
    ]),
  );
  url = await appCon(FECHA);
  app = apps.pop()!;
});

afterAll(async () => {
  for (const a of apps) await a.close();
  await app.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

describe("recorrido: preparar → aprobar (otra persona) → emitir (Preparador) → descargar", () => {
  it("registro con quién preparó, aprobó y emitió; PDF correcto, mismos bytes y hash; versión EMITIDA intacta", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, folio, versionId } = await conV1(p, { sufijo: "Recorrido" });
    const filaAntes = await filaVersion(id, 1);
    const rev = await aprobar(p, r, id, 1, 0);

    const v = await validar(p, id, 1);
    expect(v).toMatchObject({
      fechaEmision: FECHA,
      vigenciaDias: 15,
      vigenteHasta: "2026-10-10",
      version: { id: versionId, numero: 1, idVersion: `${folio}-v1`, total: R1.esperado.total, esUltima: true },
      aprobacion: { revisionId: rev.revision.id, aprobadaPor: "[DEMO] Revisora Begoña Íñiguez" },
      preparador: "[DEMO] Preparador Emi",
      destinatario: { contacto: { nombre: "Begoña Muñoz Íñiguez", telefono: "55 1234 5678", correo: "begona@ejemplo.invalid" } },
      emisor: { nombre: EMISOR_DEMO.nombre, logo: "DEMO" },
      textos: TEXTOS_DEMO,
      bloqueos: [],
      puedeEmitir: true,
      emision: null,
    });
    // El revisor que aprobó también ve que puede emitir (no es el autor); el administrador, no.
    expect((await validar(r, id, 1)).puedeEmitir).toBe(true);
    expect((await validar(await administrador(), id, 1)).puedeEmitir).toBe(false);

    const e = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(e.status, e.texto).toBe(201);
    const em: DetalleEmision = EsquemaDetalleEmision.parse(e.cuerpo);
    expect(claves(e.cuerpo).filter((k) => CLAVES_INTERNAS.test(k))).toEqual([]);
    expect(em.emision).toMatchObject({
      folio,
      versionNumero: 1,
      idVersion: `${folio}-v1`,
      origen: "WEB_DEMO",
      fechaEmision: FECHA,
      vigenciaDias: 15,
      vigenteHasta: "2026-10-10",
      total: R1.esperado.total,
      preparadoPor: "[DEMO] Preparador Emi",
      aprobadoPor: "[DEMO] Revisora Begoña Íñiguez",
      emitidoPor: "[DEMO] Preparador Emi",
      plantillaVersion: "cotizacion-web-demo/1",
      sustituida: false,
      archivo: { nombre: `${folio}-v1.pdf` },
    });
    expect(em.documento).toMatchObject({
      folio,
      versionNumero: 1,
      origen: "WEB_DEMO",
      ambiente: "DEMO",
      total: R1.esperado.total,
      textos: TEXTOS_DEMO,
      contacto: { nombre: "Begoña Muñoz Íñiguez" },
      personas: { preparo: "[DEMO] Preparador Emi", aprobo: "[DEMO] Revisora Begoña Íñiguez", emitio: "[DEMO] Preparador Emi" },
    });

    // Descarga autenticada: application/pdf, adjunto con nombre del folio, Repr-Digest y mismos bytes.
    const d = await descargar(p, em.emision.id);
    expect(d.status).toBe(200);
    expect(d.headers.get("content-type")).toBe("application/pdf");
    expect(d.headers.get("content-disposition")).toBe(`attachment; filename="${folio}-v1.pdf"`);
    expect(d.headers.get("cache-control")).toContain("no-store");
    expect(d.headers.get("x-content-type-options")).toBe("nosniff");
    expect(d.cuerpo.length).toBe(em.emision.archivo.bytes);
    expect(sha(d.cuerpo)).toBe(em.emision.archivo.sha256);
    expect(d.headers.get("repr-digest")).toBe(`sha-256=:${Buffer.from(em.emision.archivo.sha256, "hex").toString("base64")}:`);
    const otra = await descargar(r, em.emision.id);
    expect(otra.cuerpo.equals(d.cuerpo)).toBe(true);

    // El PDF dice lo que debe y nada interno.
    const t = await textoPdf(d.cuerpo);
    for (const x of [`${folio}-v1 · WEB DEMO`, "$54,190.68", "[DEMO] Construcción Peñasco Recorrido", "Begoña Muñoz Íñiguez", "Mérida, Yucatán", "«El Águila»", LEYENDA_DEMO, TEXTOS_DEMO.alcance, "Aprobó: [DEMO] Revisora Begoña Íñiguez", "25/09/2026", "10/10/2026"]) {
      expect(t, x).toContain(x);
    }
    const minusculas = t.toLowerCase();
    for (const x of ["costo", "proveedor", "consumo", "margen", "recargo", "rendimiento"]) expect(minusculas, x).not.toContain(x);
    // Ningún precio de compra aparece como cifra propia (ni crudo ni con formato de importe).
    for (const pr of PRECIOS_DEMO.map((x) => x.precioUnitario)) {
      const crudo = new RegExp(String.raw`(?<![\d.,$])` + pr.replace(".", String.raw`\.`) + String.raw`(?!\d)`);
      expect(t, `precio interno ${pr}`).not.toMatch(crudo);
    }

    // Archivo en la carpeta de pruebas con la clave del servidor (org/emisión), no en otra parte.
    const archivo = join(DIR, "emisiones", orgId, `${em.emision.id}.pdf`);
    expect(readFileSync(archivo).equals(d.cuerpo)).toBe(true);

    // Estado derivado y versión intacta; ya no se emite, no se reenvía ni se anula.
    const det = await detalleCot(p, id);
    expect(det.versiones[0]).toMatchObject({ numero: 1, estado: "EMITIDA", emision: { id: em.emision.id } });
    expect(await filaVersion(id, 1)).toEqual(filaAntes);
    const otraVez = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(otraVez.status).toBe(409);
    expect(otraVez.cuerpo.error.codigo).toBe("VERSION_EMITIDA");
    const reenviar = await enviar(p, id, 1, 0);
    expect(reenviar.status).toBe(422);
    const anulacion = await anular(r, rev);
    expect(anulacion.status).toBe(409);
    expect(anulacion.cuerpo.error.codigo).toBe("VERSION_EMITIDA");
    expect((await validar(p, id, 1)).emision?.id).toBe(em.emision.id);
    expect(await contarEmisiones(id)).toBe(1);
  });

  it("también emite un Revisor distinto del autor (aprobada por otro Revisor); se registran las tres personas", async () => {
    const p = await preparador();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, await revisor(), id, 1, 0);
    const e = await emitir(await revisor2(), id, 1, versionId, rev.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(e.cuerpo.emision).toMatchObject({ preparadoPor: "[DEMO] Preparador Emi", aprobadoPor: "[DEMO] Revisora Begoña Íñiguez", emitidoPor: "[DEMO] Revisor Emi 2" });
  });

  it("los cuatro totales de referencia se emiten y se leen en el PDF", async () => {
    const p = await preparador();
    const r = await revisor();
    for (const esc of REFERENCIAS) {
      const { id, folio, versionId } = await conV1(p, { entrada: esc.entrada as EntradaCalculo });
      const rev = await aprobar(p, r, id, 1, 0);
      const e = await emitir(p, id, 1, versionId, rev.revision.id);
      expect(e.status, `${esc.id}: ${e.texto}`).toBe(201);
      expect(e.cuerpo.emision.total).toBe(esc.esperado.total);
      const t = await textoPdf((await descargar(p, e.cuerpo.emision.id)).cuerpo);
      const [entero, dec] = esc.esperado.total.split(".") as [string, string];
      expect(t, esc.id).toContain(`$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`);
      expect(t).toContain(`${folio}-v1`);
    }
  });
});

describe("quién emite y qué aprobación vale", () => {
  it("sin aprobación, con la aprobación anulada o con la de otra versión: bloqueado; ids que no son los vigentes: 409", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, versionId } = await conV1(p);

    // Sin aprobación (ni siquiera enviada).
    const sin = await validar(p, id, 1);
    expect(sin.aprobacion).toBeNull();
    expect(sin.bloqueos.map((b) => b.codigo)).toContain("BL-17");
    const intento = await emitir(p, id, 1, versionId, randomUUID());
    expect(intento.status).toBe(422);
    expect(intento.cuerpo.error.codigo).toBe("EMISION_BLOQUEADA");

    // Aprobada → anulada → bloqueada.
    const rev = await aprobar(p, r, id, 1, 0);
    const an = await anular(r, rev);
    expect(an.status, an.texto).toBe(200);
    const anulada = await validar(p, id, 1);
    expect(anulada.aprobacion).toBeNull();
    expect(anulada.bloqueos.find((b) => b.codigo === "BL-17")!.mensaje).toMatch(/anuló/);
    const conAnulada = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(conAnulada.status).toBe(422);

    // Nueva aprobación de la MISMA versión (el borrador no cambió) → ids viejos: 409; vigentes: 201.
    const rev2 = await aprobar(p, r, id, 1, 0);
    expect(rev2.revision.id).not.toBe(rev.revision.id);
    const vieja = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(vieja.status).toBe(409);
    expect(vieja.cuerpo.error.codigo).toBe("CONFLICTO_EMISION");
    const otraVersion = await emitir(p, id, 1, randomUUID(), rev2.revision.id);
    expect(otraVersion.status).toBe(409);
    expect((await emitir(p, id, 1, versionId, rev2.revision.id)).status).toBe(201);
    expect(await contarEmisiones(id)).toBe(1);
  });

  it("la aprobación de v1 no autoriza emitir v2 (y v1 ya no es la última)", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, r, id, 1, 0);
    const det = await detalleCot(p, id);
    const guardado = await p.put(`/api/v1/cotizaciones/${id}/borrador`, {
      revision: det.borrador.revision,
      captura: { ...det.borrador.captura, textos: { ...TEXTOS_DEMO, alcance: "[DEMO] Alcance corregido para v2." } },
    });
    expect(guardado.status, guardado.texto).toBe(200);
    // Con el borrador cambiado, v1 (aprobada) ya no corresponde a lo capturado.
    const v1Desactualizada = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(v1Desactualizada.status).toBe(422);
    expect(v1Desactualizada.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-16");
    const v2 = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem());
    expect(v2.status, v2.texto).toBe(201);
    expect(v2.cuerpo.cambios.textosCambiados).toEqual(["alcance"]);
    expect(v2.cuerpo.version.total).toBe(R1.esperado.total); // los textos no tocan el cálculo
    const conV1Aprobada = await emitir(p, id, 2, v2.cuerpo.version.id, rev.revision.id);
    expect(conV1Aprobada.status).toBe(422);
    expect(conV1Aprobada.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-17");
    const v1 = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(v1.status).toBe(422);
    expect(v1.cuerpo.error.problemas.map((x: { mensaje: string }) => x.mensaje).join(" ")).toMatch(/última versión/);
  });

  it("BL-17 por identidad: el autor no aprueba; con las dos funciones emite como Preparador tras la aprobación de otra persona", async () => {
    const a = await ambas();
    const { id, versionId } = await conV1(a);
    const env = await enviar(a, id, 1, 0);
    const rev = EsquemaDetalleRevision.parse(env.cuerpo);
    const propia = await a.post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId, revision: 0 }, idem());
    expect(propia.status).toBe(422);
    const ok = await (await revisor()).post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId, revision: 0 }, idem());
    expect(ok.status).toBe(200);
    const e = await emitir(a, id, 1, versionId, rev.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(e.cuerpo.emision).toMatchObject({ preparadoPor: "[DEMO] Preparador y revisor Emi", aprobadoPor: "[DEMO] Revisora Begoña Íñiguez", emitidoPor: "[DEMO] Preparador y revisor Emi" });
  });

  it("un Revisor que es el autor de la versión no emite (perdió la función Preparador); el Administrador tampoco", async () => {
    const correo = `autor-${randomUUID().slice(0, 6)}.emi@softarq.test`;
    const c = await crearCuentas(migrador, "DEMO-EMI", [cuenta(correo, "[DEMO] Autor que pasa a revisor", "PREPARADOR")]);
    const autor = await new ClienteHttp(url).entrar(c[correo]!);
    const { id, versionId } = await conV1(autor);
    const rev = await aprobar(autor, await revisor(), id, 1, 0);
    await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['REVISOR']::varchar(20)[]
                                 WHERE usuario_id = (SELECT id FROM usuario WHERE correo = ${correo})`;
    const ahoraRevisor = await new ClienteHttp(url).entrar(c[correo]!);
    const v = await validar(ahoraRevisor, id, 1);
    expect(v.puedeEmitir).toBe(false);
    expect(v.motivoNoEmitir).toMatch(/BL-17/);
    const e = await emitir(ahoraRevisor, id, 1, versionId, rev.revision.id);
    expect(e.status).toBe(403);
    const adm = await emitir(await administrador(), id, 1, versionId, rev.revision.id);
    expect(adm.status).toBe(403);
    expect(await contarEmisiones(id)).toBe(0);
  });

  it("saltarse la revisión en la base: ni la función ni un INSERT directo registran una emisión sin aprobación vigente", async () => {
    const p = await preparador();
    const { id, versionId } = await conV1(p);
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo); // PENDIENTE
    const usuario = (await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'prep.emi@softarq.test'`)[0]!.id;
    const emisionId = randomUUID();
    const datos = {
      id: emisionId,
      ambiente: "DEMO",
      fechaEmision: FECHA,
      vigenciaDias: 15,
      vigenteHasta: "2026-10-10",
      total: R1.esperado.total,
      contenido: {},
      plantillaVersion: "x",
      archivoClave: `emisiones/${orgId}/${emisionId}.pdf`,
      archivoBytes: 1000,
      archivoSha256: "0".repeat(64),
    };
    await expect(
      prisma.$queryRaw`SELECT softarq_emitir_version(${orgId}::uuid, ${usuario}::uuid, ${id}::uuid, 1, ${versionId}::uuid, ${env.revision.id}::uuid,
        ${JSON.stringify(datos)}::jsonb, ${randomUUID()}::uuid, 'emitir_version', ${Buffer.alloc(32)}, now() + interval '1 day')`,
    ).rejects.toThrow(/REVISION_PENDIENTE|APROBACION_NO_VIGENTE/);
    await expect(
      prisma.$executeRaw`INSERT INTO emision (organizacion_id, cotizacion_id, folio, version_id, version_numero, revision_id, origen, ambiente,
          preparado_por, preparado_nombre, aprobado_por, aprobado_nombre, emitido_por, emitido_nombre, fecha_emision, vigencia_dias,
          vigente_hasta, total, contenido, plantilla_version, archivo_clave, archivo_bytes, archivo_sha256)
        SELECT r.organizacion_id, r.cotizacion_id, r.folio, r.version_id, r.version_numero, r.id, 'WEB_DEMO', 'DEMO',
               r.preparador_id, 'x', (SELECT id FROM usuario WHERE correo = 'rev.emi@softarq.test'), 'y', r.preparador_id, 'z',
               DATE '2026-09-25', 15, DATE '2026-10-10', r.total, '{}'::jsonb, 'x', ${datos.archivoClave}, 1000, ${Buffer.alloc(32)}
          FROM revision r WHERE r.id = ${env.revision.id}::uuid`,
    ).rejects.toThrow(/APROBACION_NO_VIGENTE/);
    expect(await contarEmisiones(id)).toBe(0);
  });
});

describe("datos que faltan y datos descriptivos", () => {
  it("BL-01 sin contacto y BL-02 sin ubicación ni descripción: se informa antes de emitir y no se emite", async () => {
    const p = await preparador();
    const r = await revisor();
    const sinContacto = await conV1(p, { contacto: false });
    const rev = await aprobar(p, r, sinContacto.id, 1, 0);
    const v = await validar(p, sinContacto.id, 1);
    expect(v.destinatario.contacto).toEqual({ nombre: null, telefono: null, correo: null });
    expect(v.bloqueos.filter((b) => b.codigo === "BL-01").map((b) => b.mensaje).join(" ")).toMatch(/contacto/);
    expect(v.puedeEmitir).toBe(false);
    const e = await emitir(p, sinContacto.id, 1, sinContacto.versionId, rev.revision.id);
    expect(e.status).toBe(422);
    expect(e.cuerpo.error.codigo).toBe("EMISION_BLOQUEADA");

    // Completar el contacto (dato actual que se congela al emitir) y emitir.
    const cli = (await p.get(`/api/v1/clientes/${sinContacto.clienteId}`)).cuerpo.cliente;
    const parche = await p.patch(`/api/v1/clientes/${sinContacto.clienteId}`, { revision: cli.revision, contactoNombre: "Íñigo Ñúñez", contactoCorreo: "inigo@ejemplo.invalid" });
    expect(parche.status, parche.texto).toBe(200);
    const ok = await emitir(p, sinContacto.id, 1, sinContacto.versionId, rev.revision.id);
    expect(ok.status, ok.texto).toBe(201);
    expect(ok.cuerpo.documento.contacto).toEqual({ nombre: "Íñigo Ñúñez", telefono: null, correo: "inigo@ejemplo.invalid" });

    const sinUbicacion = await conV1(p, { proyectoCompleto: false });
    await aprobar(p, r, sinUbicacion.id, 1, 0);
    expect((await validar(p, sinUbicacion.id, 1)).bloqueos.map((b) => b.codigo)).toContain("BL-02");
  });

  it("el cliente cambió de nombre después de calcular: bloqueado hasta una versión nueva con su aprobación", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, clienteId, versionId } = await conV1(p);
    const rev = await aprobar(p, r, id, 1, 0);
    const cli = (await p.get(`/api/v1/clientes/${clienteId}`)).cuerpo.cliente;
    await p.patch(`/api/v1/clientes/${clienteId}`, { revision: cli.revision, nombre: "[DEMO] Razón social nueva, S.A." });
    const v = await validar(p, id, 1);
    expect(v.bloqueos.find((b) => b.codigo === "BL-01")!.mensaje).toMatch(/cambió después de calcular v1/);
    expect((await emitir(p, id, 1, versionId, rev.revision.id)).status).toBe(422);
    // vN+1 con el nombre actual, otra aprobación y emisión con el nombre nuevo (sin mezclar).
    const v2 = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(v2.status, v2.texto).toBe(201);
    const rev2 = await aprobar(p, r, id, 2, 0);
    const e = await emitir(p, id, 2, v2.cuerpo.version.id, rev2.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(e.cuerpo.documento.cliente.nombre).toBe("[DEMO] Razón social nueva, S.A.");
  });

  it("BL-20: textos vacíos o ausentes impiden enviar; versiones anteriores sin textos piden una vN+1", async () => {
    const p = await preparador();
    const base = borradorDesdeEntrada(R1.entrada as EntradaCalculo);
    const { id } = await conV1(p);
    // Captura sin textos (como las anteriores al módulo 8) → v2 sin textos → no se envía.
    const det = await detalleCot(p, id);
    const { textos: _t, ...sinTextos } = det.borrador.captura;
    expect((await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: sinTextos })).status).toBe(200);
    expect((await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem())).status).toBe(201);
    const sinEnvio = await enviar(p, id, 2, 1);
    expect(sinEnvio.status).toBe(422);
    expect(sinEnvio.cuerpo.error.problemas.find((x: { codigo: string }) => x.codigo === "BL-20").mensaje).toMatch(/versión nueva/);
    // Textos vacíos: se pueden guardar, pero no enviar.
    const vacios = { ...base, textos: { alcance: "", condiciones: "C", exclusiones: "" } };
    expect((await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 1, captura: vacios })).status).toBe(200);
    expect((await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 2 }, idem())).status).toBe(201);
    const vaciosEnvio = await enviar(p, id, 3, 2);
    expect(vaciosEnvio.status).toBe(422);
    expect(vaciosEnvio.cuerpo.error.problemas.find((x: { codigo: string }) => x.codigo === "BL-20").mensaje).toMatch(/alcance, exclusiones/);
  });

  it("BL-15: sin emisor no se emite; el Administrador del sistema lo configura (con motivo y ficha) y entonces sí", async () => {
    const p = await preparadorSin();
    const r = await revisorSin();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, r, id, 1, 0);
    const v = await validar(p, id, 1);
    expect(v.bloqueos.find((b) => b.codigo === "BL-15")!.mensaje).toMatch(/nombre o razón social, domicilio, teléfono, correo, logotipo/);
    expect((await emitir(p, id, 1, versionId, rev.revision.id)).status).toBe(422);

    const emisorAntes = EsquemaEmisor.parse((await p.get("/api/v1/emisor")).cuerpo);
    expect(emisorAntes).toMatchObject({ revision: 0, editable: false, faltantes: ["nombre o razón social", "domicilio", "teléfono", "correo", "logotipo"] });
    const cuerpo = { revision: 0, nombre: "[DEMO] Emisor configurado", domicilio: "Calle Ficticia 1, Mérida", telefono: "999 000 0000", correo: "emisor@ejemplo.invalid", logo: "DEMO", motivo: "Datos DEMO del emisor para la prueba." };
    expect((await p.put("/api/v1/emisor", cuerpo)).status).toBe(403);
    expect((await (await adminSin()).put("/api/v1/emisor", { ...cuerpo, motivo: "corto" })).status).toBe(400);
    const guardado = await (await adminSin()).put("/api/v1/emisor", cuerpo);
    expect(guardado.status, guardado.texto).toBe(200);
    expect(guardado.cuerpo).toMatchObject({ revision: 1, faltantes: [], editable: true, esDemo: true, modificadoPor: "[DEMO] Administrador Sin" });
    const obsoleto = await (await adminSin()).put("/api/v1/emisor", cuerpo);
    expect(obsoleto.status).toBe(409);
    const e = await emitir(p, id, 1, versionId, rev.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(e.cuerpo.documento.emisor).toMatchObject({ nombre: "[DEMO] Emisor configurado", logo: "DEMO" });
  });
});

describe("vigencias con la fecha de emisión", () => {
  it("BL-09 bloquea con precios vencidos a la fecha de emisión; AV-02 avisa y CR-16 fija la vigencia", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, r, id, 1, 0);

    const tarde = await appCon("2027-10-15");
    const pt = await preparador(tarde);
    const vt = await validar(pt, id, 1);
    expect(vt.fechaEmision).toBe("2027-10-15");
    expect(vt.bloqueos.map((b) => b.codigo)).toContain("BL-09");
    expect((await emitir(pt, id, 1, versionId, rev.revision.id)).status).toBe(422);

    const cerca = await appCon("2027-09-20");
    const pc = await preparador(cerca);
    const vc = await validar(pc, id, 1);
    expect(vc.bloqueos).toEqual([]);
    expect(vc.avisos.map((a) => a.codigo)).toContain("AV-02");
    expect(vc.vigenteHasta).toBe("2027-10-05");
    const e = await emitir(pc, id, 1, versionId, rev.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(e.cuerpo.emision).toMatchObject({ fechaEmision: "2027-09-20", vigenteHasta: "2027-10-05", total: R1.esperado.total });
  });
});

describe("anulación de la aprobación antes de emitir", () => {
  it("solo un Revisor, con motivo; evento nuevo; la aprobación original queda intacta; nueva aprobación y emisión", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, r, id, 1, 0);
    const filaRevision = await migrador.$queryRaw`SELECT to_jsonb(r) AS fila FROM revision r WHERE id = ${rev.revision.id}::uuid`;

    expect((await anular(p, rev)).status).toBe(403);
    expect((await anular(r, rev, "corto")).status).toBe(400);
    const an = await anular(r, rev);
    expect(an.status, an.texto).toBe(200);
    const anulada = EsquemaDetalleRevision.parse(an.cuerpo);
    expect(anulada.revision).toMatchObject({ estado: "APROBADA", anulacion: { por: "[DEMO] Revisora Begoña Íñiguez", motivo: "El cliente pidió revisar el alcance antes de emitir." }, acciones: { anularAprobacion: false } });
    expect(anulada.eventos.map((e) => [e.tipo, e.estadoAnterior, e.estadoNuevo])).toEqual([
      ["ENVIADA", null, "PENDIENTE"],
      ["APROBADA", "PENDIENTE", "APROBADA"],
      ["APROBACION_ANULADA", "APROBADA", "ANULADA"],
    ]);
    // La fila de la revisión no cambió (la anulación es un evento aparte).
    expect(await migrador.$queryRaw`SELECT to_jsonb(r) AS fila FROM revision r WHERE id = ${rev.revision.id}::uuid`).toEqual(filaRevision);
    expect((await anular(r, rev)).status).toBe(409);
    const det = await detalleCot(p, id);
    expect(det.versiones[0]).toMatchObject({ estado: "BORRADOR", revisionVigente: { estado: "APROBADA", anulacion: { motivo: expect.any(String) } } });

    // Volver a enviar la misma versión, aprobar y emitir con la aprobación nueva.
    const rev2 = await aprobar(p, r, id, 1, 0);
    const e = await emitir(p, id, 1, versionId, rev2.revision.id);
    expect(e.status, e.texto).toBe(201);
    // Eventos inmutables también para el propietario.
    await expect(migrador.$executeRaw`DELETE FROM revision_evento WHERE revision_id = ${rev.revision.id}::uuid`).rejects.toThrow(/EVENTO_INMUTABLE/);
  });
});

describe("descarte de cotizaciones", () => {
  it("con motivo y por un Preparador; conserva folio, versiones y eventos; después todo es de solo lectura", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, folio } = await conV1(p);
    const det0 = await detalleCot(p, id);
    expect(det0.descartar).toEqual({ permitido: true, motivoNoPermitido: null });
    expect((await r.post(`/api/v1/cotizaciones/${id}/descarte`, { motivo: "El cliente desistió del proyecto." }, idem())).status).toBe(403);
    expect((await p.post(`/api/v1/cotizaciones/${id}/descarte`, { motivo: "no" }, idem())).status).toBe(400);
    const d = await p.post(`/api/v1/cotizaciones/${id}/descarte`, { motivo: "El cliente desistió del proyecto." }, idem());
    expect(d.status, d.texto).toBe(200);
    const det = EsquemaDetalleCotizacion.parse(d.cuerpo);
    expect(det.cotizacion).toMatchObject({ folio, estadoFolio: "DESCARTADO", descarte: { por: "[DEMO] Preparador Emi", motivo: "El cliente desistió del proyecto." } });
    expect(det.versiones).toHaveLength(1);
    expect(det.eventos.map((e) => e.tipo)).toContain("COTIZACION_DESCARTADA");
    expect(det.descartar.permitido).toBe(false);

    const guardar = await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: det.borrador.captura });
    expect([guardar.status, guardar.cuerpo.error.codigo]).toEqual([409, "FOLIO_NO_ACTIVO"]);
    const calcular = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect([calcular.status, calcular.cuerpo.error.codigo]).toEqual([409, "FOLIO_NO_ACTIVO"]);
    const env = await enviar(p, id, 1, 0);
    expect(env.status).toBe(409);
    expect((await validar(p, id, 1)).bloqueos.map((b) => b.mensaje)).toContain("La cotización está descartada.");
    const otra = await p.post(`/api/v1/cotizaciones/${id}/descarte`, { motivo: "Segundo intento de descarte." }, idem());
    expect(otra.status).toBe(422);
    // El folio no se reutiliza: la siguiente cotización recibe otro.
    const nueva = await conV1(p);
    expect(nueva.folio).not.toBe(folio);
    // Ni el propietario borra o reactiva la cotización.
    await expect(migrador.$executeRaw`UPDATE cotizacion SET estado_folio = 'ACTIVO' WHERE id = ${id}::uuid`).rejects.toThrow(/FOLIO_NO_ACTIVO/);
    await expect(migrador.$executeRaw`DELETE FROM cotizacion WHERE id = ${id}::uuid`).rejects.toThrow(/COTIZACION_INMUTABLE/);
  });

  it("no elude una revisión pendiente, una aprobación vigente ni una emisión", async () => {
    const p = await preparador();
    const r = await revisor();
    const motivo = { motivo: "Se intenta descartar con trámites abiertos." };
    const { id, versionId } = await conV1(p);
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    const pendiente = await p.post(`/api/v1/cotizaciones/${id}/descarte`, motivo, idem());
    expect([pendiente.status, pendiente.cuerpo.error.codigo]).toEqual([422, "DESCARTE_BLOQUEADO"]);
    expect(pendiente.cuerpo.error.mensaje).toMatch(/retírela/);
    const ok = await r.post(`/api/v1/revisiones/${env.revision.id}/decision`, { decision: "APROBAR", versionId, revision: 0 }, idem());
    const aprobada = await p.post(`/api/v1/cotizaciones/${id}/descarte`, motivo, idem());
    expect(aprobada.cuerpo.error.mensaje).toMatch(/anular la aprobación/);
    const e = await emitir(p, id, 1, versionId, ok.cuerpo.revision.id);
    expect(e.status).toBe(201);
    const emitida = await p.post(`/api/v1/cotizaciones/${id}/descarte`, motivo, idem());
    expect(emitida.cuerpo.error.mensaje).toMatch(/emitida/);
    expect((await detalleCot(p, id)).cotizacion.estadoFolio).toBe("ACTIVO");
    // En la base tampoco se elude (la función comprueba lo mismo con las filas bloqueadas).
    const usuario = (await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'prep.emi@softarq.test'`)[0]!.id;
    await expect(
      prisma.$queryRaw`SELECT softarq_descartar_cotizacion(${orgId}::uuid, ${usuario}::uuid, ${id}::uuid, 'Motivo directo en la base',
        ${randomUUID()}::uuid, 'descartar_cotizacion', ${Buffer.alloc(32)}, now() + interval '1 day')`,
    ).rejects.toThrow(/DESCARTE_EMITIDA/);
  });
});

describe("aislamiento, sesión y CSRF", () => {
  it("otra organización no valida, no emite, no ve ni descarga; sin sesión 401; sin CSRF 403", async () => {
    const p = await preparador();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, await revisor(), id, 1, 0);
    const e = await emitir(p, id, 1, versionId, rev.revision.id);
    const emisionId = e.cuerpo.emision.id as string;

    const b = await revisorB();
    expect((await b.get(`/api/v1/cotizaciones/${id}/versiones/1/emision/validacion`)).status).toBe(404);
    expect((await b.get(`/api/v1/emisiones/${emisionId}`)).status).toBe(404);
    expect((await descargar(b, emisionId)).status).toBe(404);
    expect((await emitir(b, id, 1, versionId, rev.revision.id)).status).toBe(404);
    expect((await anular(b, rev)).status).toBe(404);
    expect((await (await preparadorB()).post(`/api/v1/cotizaciones/${id}/descarte`, { motivo: "Intento desde otra organización." }, idem())).status).toBe(404);
    expect((await descargar(p, emisionId, null)).status).toBe(401);
    expect((await descargar(p, "no-es-uuid")).status).toBe(404);
    const sinCsrf = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId, revisionId: rev.revision.id }, { ...idem(), csrf: null });
    expect(sinCsrf.status).toBe(403);
    const conOrg = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId, revisionId: rev.revision.id, emitidoPor: "x" }, idem());
    expect(conOrg.status).toBe(400);
  });
});

describe("inmutabilidad e historial", () => {
  it("los valores internos del catálogo (precios y tarifas) no aparecen en las respuestas de emisión", async () => {
    const p = await preparador();
    const { id, versionId } = await conV1(p);
    const rev = await aprobar(p, await revisor(), id, 1, 0);
    const v = (await p.get(`/api/v1/cotizaciones/${id}/versiones/1/emision/validacion`)).cuerpo;
    const e = (await emitir(p, id, 1, versionId, rev.revision.id)).cuerpo;
    for (const cuerpo of [v, e]) {
      expect(claves(cuerpo).filter((k) => CLAVES_INTERNAS.test(k))).toEqual([]);
      const texto = JSON.stringify(cuerpo);
      for (const x of [...PRECIOS_DEMO.map((q) => `"${q.precioUnitario}"`), ...TARIFAS_DEMO.map((t) => `"${t.importe}"`)]) expect(texto).not.toContain(x);
    }
  });

  it("cambiar cliente, emisor, catálogo y borrador después de emitir no altera el registro ni el PDF", async () => {
    const p = await preparador();
    const { id, clienteId, versionId } = await conV1(p);
    const rev = await aprobar(p, await revisor(), id, 1, 0);
    const e = await emitir(p, id, 1, versionId, rev.revision.id);
    const emisionId = e.cuerpo.emision.id as string;
    const registro = (await p.get(`/api/v1/emisiones/${emisionId}`)).cuerpo;
    const bytes = (await descargar(p, emisionId)).cuerpo;

    const cli = (await p.get(`/api/v1/clientes/${clienteId}`)).cuerpo.cliente;
    await p.patch(`/api/v1/clientes/${clienteId}`, { revision: cli.revision, nombre: "[DEMO] Otro nombre", contactoNombre: "Otra persona" });
    const emisor = EsquemaEmisor.parse((await (await administrador()).get("/api/v1/emisor")).cuerpo);
    const cambio = await (await administrador()).put("/api/v1/emisor", {
      revision: emisor.revision,
      nombre: "[DEMO] Emisor renombrado",
      domicilio: "Otro domicilio ficticio",
      telefono: "000 111 2222",
      correo: "otro@ejemplo.invalid",
      logo: "DEMO",
      motivo: "Cambio de datos DEMO para la prueba de inmutabilidad.",
    });
    expect(cambio.status, cambio.texto).toBe(200);
    await repo.anularPrecio({ organizacionId: orgId }, "PRE-000001").catch(() => undefined);
    const det = await detalleCot(p, id);
    await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: det.borrador.revision, captura: { ...det.borrador.captura, textos: { ...TEXTOS_DEMO, alcance: "[DEMO] Otro alcance" } } });

    expect((await p.get(`/api/v1/emisiones/${emisionId}`)).cuerpo).toEqual(registro);
    const despues = await descargar(p, emisionId);
    expect(despues.cuerpo.equals(bytes)).toBe(true);
    expect(await textoPdf(despues.cuerpo)).toContain(EMISOR_DEMO.nombre);

    // Restaurar el emisor DEMO para las demás pruebas.
    const actual = EsquemaEmisor.parse((await (await administrador()).get("/api/v1/emisor")).cuerpo);
    await (await administrador()).put("/api/v1/emisor", { revision: actual.revision, ...EMISOR_DEMO, logo: "DEMO", logoClave: undefined, motivo: "Restaurar los datos DEMO del emisor." });

    // Ni la aplicación ni el propietario modifican o borran la emisión.
    await expect(prisma.$executeRaw`UPDATE emision SET total = 0 WHERE id = ${emisionId}::uuid`).rejects.toThrow(/permission denied|permiso denegado/i);
    await expect(migrador.$executeRaw`UPDATE emision SET total = 0 WHERE id = ${emisionId}::uuid`).rejects.toThrow(/EMISION_INMUTABLE/);
    await expect(migrador.$executeRaw`DELETE FROM emision WHERE id = ${emisionId}::uuid`).rejects.toThrow(/EMISION_INMUTABLE/);
    expect(existsSync(join(DIR, "emisiones", orgId, `${emisionId}.pdf`))).toBe(true);
  });
});
