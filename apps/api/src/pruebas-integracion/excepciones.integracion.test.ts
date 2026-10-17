/**
 * Excepciones B-22 (módulo 10, ADR-0014), por HTTP con sesiones reales contra softarq_test.
 * Fuentes: Word maestro v1.3 §3.10/§3.11 y `fase1.csv` (TI-068 a TI-074, TI-088, TI-090 a TI-093,
 * TI-338/339). Cifras esperadas de la fuente: TI-339 (337 piezas de block); los totales sin
 * excepción son los de referencia (54,190.68).
 */
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EsquemaDetalleCotizacion,
  EsquemaDetalleRevision,
  EsquemaExcepcionesVersion,
  type CapturaBorrador,
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
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, NOMBRE_COOKIE, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const R3 = ESCENARIOS.find((e) => e.id === "GUIA-R3-BLOCK-1390")!;
const MOTIVO = "Block de mayor formato verificado en obra por el residente.";
const DOCUMENTOS = join(directorioDocumentosPrueba("integracion"), "..", "documentos-excepciones");

const prisma = prismaApp();
let migrador: ClientePrisma;
let url: string;
let org: string;
const apps: INestApplication[] = [];
const cred: Record<string, Credencial> = {};

const entrar = (correo: string, base = url) => new ClienteHttp(base).entrar(cred[correo]!);
const preparador = (base?: string) => entrar("prep.exc@softarq.test", base);
const revisor = () => entrar("rev.exc@softarq.test");
const revisor2 = () => entrar("rev2.exc@softarq.test");
const ambas = () => entrar("ambas.exc@softarq.test");
const administrador = () => entrar("admin.exc@softarq.test");
const ajeno = () => entrar("rev.excb@softarq.test");
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });

const excepcionBlock = (over: Partial<Extract<ExcepcionBorrador, { tipo: "RENDIMIENTO" }>> = {}): ExcepcionBorrador => ({
  tipo: "RENDIMIENTO",
  partida: 1,
  conceptoCodigo: "CON-00009",
  componenteCodigo: "CMP-00011",
  campo: "RENDIMIENTO",
  valorAplicado: "13",
  motivo: MOTIVO,
  ...over,
});

async function appConFecha(fecha: string): Promise<string> {
  const a = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "1000", SOFTARQ_DIR_DOCUMENTOS: DOCUMENTOS }),
    { reloj: new RelojFijo(fecha) },
  );
  await a.listen(0, "127.0.0.1");
  apps.push(a);
  return (await a.getUrl()).replace("[::1]", "127.0.0.1");
}

/** Cliente, proyecto y cotización con la captura indicada. */
async function cotizacion(c: ClienteHttp, captura: CapturaBorrador, sufijo = randomUUID().slice(0, 6)) {
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente Muro ${sufijo}`, contactoNombre: "Begoña Íñiguez", contactoTelefono: "55 1234 5678" }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post(
    "/api/v1/proyectos",
    { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${sufijo}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Muro de prueba." },
    idem(),
  );
  expect(pry.status, pry.texto).toBe(201);
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
  expect(cot.status, cot.texto).toBe(201);
  return { id: cot.cuerpo.cotizacion.id as string, folio: cot.cuerpo.cotizacion.folio as string };
}

const borrador = async (c: ClienteHttp, id: string) => EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo).borrador;
const guardar = (c: ClienteHttp, id: string, revision: number, captura: CapturaBorrador) => c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision, captura });
async function conExcepciones(c: ClienteHttp, id: string, excepciones: ExcepcionBorrador[]) {
  const b = await borrador(c, id);
  const r = await guardar(c, id, b.revision, { ...b.captura, excepciones });
  expect(r.status, r.texto).toBe(200);
  return r.cuerpo.revision as number;
}
async function version(c: ClienteHttp, id: string, revisionBorrador: number, numero = 1) {
  const v = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador, ...(numero > 1 ? { motivo: "Corrección de la excepción solicitada." } : {}) }, idem());
  expect(v.status, v.texto).toBe(201);
  return v.cuerpo;
}
const enviar = (c: ClienteHttp, id: string, numero: number, revisionBorrador: number) =>
  c.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/revisiones`, { revisionBorrador }, idem());
const detalle = async (c: ClienteHttp, revisionId: string) => EsquemaDetalleRevision.parse((await c.get(`/api/v1/revisiones/${revisionId}`)).cuerpo);
const aprobar = (c: ClienteHttp, d: DetalleRevision, o = idem()) =>
  c.post(`/api/v1/revisiones/${d.revision.id}/decision`, { decision: "APROBAR", versionId: d.revision.version.id, revision: d.revision.revision }, o);
type Opciones = { cabeceras?: Record<string, string>; csrf?: string | null };
const decidirExc = (c: ClienteHttp, d: DetalleRevision, numero: number, decision: "AUTORIZADA" | "RECHAZADA", o: Opciones = idem(), comentario?: string) =>
  c.post(`/api/v1/revisiones/${d.revision.id}/excepciones/${numero}/decision`, { versionId: d.revision.version.id, decision, ...(comentario ? { comentario } : {}) }, o);
const excepciones = async (c: ClienteHttp, id: string, numero: number) => {
  const r = await c.get(`/api/v1/cotizaciones/${id}/versiones/${numero}/excepciones`);
  expect(r.status, r.texto).toBe(200);
  return EsquemaExcepcionesVersion.parse(r.cuerpo);
};
const emitir = (c: ClienteHttp, id: string, numero: number, versionId: string, revisionId: string) =>
  c.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/emision`, { versionId, revisionId }, idem());
async function documento(c: ClienteHttp, emisionId: string) {
  const r = await fetch(`${c.url}/api/v1/emisiones/${emisionId}/documento`, { headers: { Cookie: `${NOMBRE_COOKIE}=${c.cookie}` } });
  expect(r.status).toBe(200);
  return Buffer.from(await r.arrayBuffer());
}
async function textoPdf(pdf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarea = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true });
  const doc = await tarea.promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) partes.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" "));
  await tarea.destroy();
  return partes.join(" ");
}
const filaVersion = async (id: string, numero: number) =>
  (await migrador.$queryRaw<{ fila: Record<string, unknown> }[]>`SELECT to_jsonb(v) AS fila FROM cotizacion_version v WHERE cotizacion_id = ${id}::uuid AND numero = ${numero}`)[0]!.fila;

/** Cotización R3 con la excepción de block (13 pza/m²), v1 calculada y enviada a revisión. */
async function r3EnRevision(p: ClienteHttp, lista: ExcepcionBorrador[] = [excepcionBlock()]) {
  const { id, folio } = await cotizacion(p, borradorDesdeEntrada(R3.entrada as EntradaCalculo));
  const rev = await conExcepciones(p, id, lista);
  const v = await version(p, id, rev);
  const env = await enviar(p, id, 1, rev);
  expect(env.status, env.texto).toBe(201);
  return { id, folio, rev, versionId: v.version.id as string, revision: EsquemaDetalleRevision.parse(env.cuerpo) };
}

beforeAll(async () => {
  vaciarDocumentosPrueba(DOCUMENTOS);
  org = (await cargarDemo(prisma, { codigo: "DEMO-EXC", nombre: "[DEMO] Módulo diez" })).organizacionId;
  await cargarEmisorDemo(prisma, org);
  await cargarDemo(prisma, { codigo: "DEMO-EXC-B", nombre: "[DEMO] Módulo diez B" });
  // Concepto PERSONALIZADO en Borrador, creado para la prueba (el catálogo DEMO no tiene ninguno).
  const repo = new RepositorioCatalogos(prisma);
  const ctx = { organizacionId: org };
  await repo.asegurarConcepto(ctx, { codigo: "CON-PER-01", tipo: "TES-00006", descripcion: "[DEMO] Muro personalizado de prueba", unidad: "m2", tipoFormula: "AREA", permiteDescuento: true, clase: "PERSONALIZADO", tarifa: "TMO-00001", reglaMedicion: "[DEMO] Área = largo x alto (prueba)", criterios: null });
  await repo.asegurarComponente(ctx, { codigo: "CMP-PER-01", concepto: "CON-PER-01", orden: 1, insumo: "INS-00010", rendimiento: "12.5", unidadRendimiento: "pza", desperdicio: "0.05", factorTraslape: null, fuente: "[DEMO] prueba", fecha: "2026-09-01", responsable: "[DEMO] Responsable" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-EXC", [
      cuenta("prep.exc@softarq.test", "[DEMO] Preparadora Módulo Diez", "PREPARADOR"),
      cuenta("rev.exc@softarq.test", "[DEMO] Revisora Begoña Íñiguez", "REVISOR"),
      cuenta("rev2.exc@softarq.test", "[DEMO] Revisor Dos", "REVISOR"),
      cuenta("ambas.exc@softarq.test", "[DEMO] Persona con ambas funciones", "PREPARADOR", "REVISOR"),
      cuenta("admin.exc@softarq.test", "[DEMO] Administrador del catálogo", "ADMIN_CATALOGO"),
    ]),
    await crearCuentas(migrador, "DEMO-EXC-B", [cuenta("rev.excb@softarq.test", "[DEMO] Revisor otra organización", "REVISOR")]),
  );
  url = await appConFecha(FECHA);
}, 120_000);

afterAll(async () => {
  for (const a of apps) await a.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

describe("registro en el borrador y efecto en el cálculo", () => {
  it("TI-339/TI-091/TI-092: la excepción se guarda en el borrador, la v1 la congela (337 piezas) y el catálogo no cambia", async () => {
    const p = await preparador();
    const { id } = await cotizacion(p, borradorDesdeEntrada(R3.entrada as EntradaCalculo));
    const rev = await conExcepciones(p, id, [excepcionBlock()]);
    // Persistencia: el Preparador la recupera; quien no tiene la capacidad no la ve.
    expect((await borrador(p, id)).captura.excepciones).toEqual([excepcionBlock()]);
    expect("excepciones" in (await borrador(await administrador(), id)).captura).toBe(false);

    const v = await version(p, id, rev);
    expect(v.cotizacion.total).not.toBe(R3.esperado.total);
    expect("excepciones" in v.captura).toBe(false);
    const fila = await filaVersion(id, 1);
    const compra = (fila.resultado_interno as { compras: { productoId: string; unidades: string }[] }).compras.find((c) => c.productoId === "PCM-00010")!;
    expect(compra.unidades).toBe("337");
    expect((fila.solicitud_calculo as { excepciones: unknown[] }).excepciones).toHaveLength(1);
    expect((fila.captura as CapturaBorrador).excepciones).toEqual([excepcionBlock()]);
    const [cmp] = await migrador.$queryRaw<{ r: string }[]>`SELECT k.rendimiento::text AS r FROM componente k JOIN organizacion o ON o.id = k.organizacion_id WHERE o.codigo = 'DEMO-EXC' AND k.codigo = 'CMP-00011'`;
    expect(Number(cmp!.r)).toBe(12.5);

    const x = await excepciones(p, id, 1);
    expect(x.excepciones).toEqual([
      expect.objectContaining({ numero: 1, tipo: "RENDIMIENTO", campo: "RENDIMIENTO", valorOriginal: "12.5 pza", valorAplicado: "13", motivo: MOTIVO, estado: "PENDIENTE", decision: null }),
    ]);
    expect(x.acciones.decidir).toEqual({ permitida: false, motivo: "Solo un Revisor autoriza o rechaza excepciones." });
    // La versión es inmutable también para el propietario de la tabla.
    await expect(migrador.$executeRaw`UPDATE cotizacion_version SET captura = '{}'::jsonb WHERE cotizacion_id = ${id}::uuid`).rejects.toThrow(/VERSION_INMUTABLE/);
  });

  it("TI-090 y rangos: motivo ausente (400), valor fuera de rango y referencias que no corresponden (422); nada se guarda", async () => {
    const p = await preparador();
    const { id } = await cotizacion(p, borradorDesdeEntrada(R3.entrada as EntradaCalculo));
    const b = await borrador(p, id);
    const intento = (x: ExcepcionBorrador) => guardar(p, id, b.revision, { ...b.captura, excepciones: [x] });
    expect((await intento(excepcionBlock({ motivo: "" }))).status).toBe(400);
    const casos: [ExcepcionBorrador, string][] = [
      [excepcionBlock({ valorAplicado: "0" }), "excepciones.0.valorAplicado"],
      [excepcionBlock({ campo: "DESPERDICIO", valorAplicado: "1" }), "excepciones.0.valorAplicado"],
      [excepcionBlock({ partida: 2 }), "excepciones.0.partida"],
      [excepcionBlock({ componenteCodigo: "CMP-00001" }), "excepciones.0.componenteCodigo"],
      [{ tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00003", precioCodigo: "PRE-000005", motivo: MOTIVO }, "excepciones.0.precioCodigo"],
      [{ tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: "CON-00009", motivo: MOTIVO }, "excepciones.0.conceptoCodigo"],
    ];
    for (const [x, ruta] of casos) {
      const r = await intento(x);
      expect(r.status, r.texto).toBe(422);
      expect(r.cuerpo.error.codigo).toBe("EXCEPCION_INVALIDA");
      expect(r.cuerpo.error.campos.map((c: { ruta: string }) => c.ruta)).toEqual([ruta]);
    }
    expect((await borrador(p, id)).revision).toBe(b.revision);
  });
});

describe("revisión, autorización y emisión (W §3.10)", () => {
  it("TI-069 a TI-074 y TI-338/339: se envía pendiente, bloquea al aprobar, se autoriza, AV-04, se aprueba y se emite sin excepciones en el PDF", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, folio, versionId, revision } = await r3EnRevision(p);

    // TI-093/TI-338: pendiente → BL-05 en la verificación y al aprobar.
    const vista = await detalle(r, revision.revision.id);
    expect(vista.verificacion!.bloqueos.map((b) => b.codigo)).toEqual(["BL-05"]);
    expect("excepciones" in vista.version.captura).toBe(false);
    const bloqueada = await aprobar(r, vista);
    expect(bloqueada.status).toBe(422);
    expect(bloqueada.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-05");

    // El Revisor la ve con su valor de catálogo y la autoriza.
    const antes = await excepciones(r, id, 1);
    expect(antes.acciones.decidir.permitida).toBe(true);
    expect(antes.revisionId).toBe(revision.revision.id);
    const ok = await decidirExc(r, vista, 1, "AUTORIZADA", idem(), "Formato verificado.");
    expect(ok.status, ok.texto).toBe(200);
    expect(EsquemaExcepcionesVersion.parse(ok.cuerpo).excepciones[0]).toMatchObject({
      estado: "AUTORIZADA",
      decision: { por: "[DEMO] Revisora Begoña Íñiguez", comentario: "Formato verificado." },
    });

    // TI-072: AV-04 visible; TI-071: se aprueba.
    const vista2 = await detalle(r, revision.revision.id);
    expect(vista2.verificacion!.bloqueos).toEqual([]);
    expect(vista2.verificacion!.avisos.map((a) => a.codigo)).toContain("AV-04");
    const aprobada = await aprobar(r, vista2);
    expect(aprobada.status, aprobada.texto).toBe(200);
    expect(aprobada.cuerpo.eventos.at(-1)).toMatchObject({ tipo: "APROBADA", avisos: expect.arrayContaining(["AV-04"]) });

    // TI-073: se emite; el contenido comercial y el PDF no llevan excepciones.
    const e = await emitir(p, id, 1, versionId, revision.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(JSON.stringify(e.cuerpo)).not.toMatch(/excepci|rendimiento|desperdicio/i);
    const pdf = await documento(p, e.cuerpo.emision.id);
    const texto = await textoPdf(pdf);
    expect(texto).toContain(`${folio}-v1`);
    expect(texto).not.toMatch(/excepci|rendimiento|desperdicio|motivo/i);
    expect(texto).not.toContain(MOTIVO);
    // TI-074: queda en la bitácora.
    const [n] = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM bitacora WHERE entidad_id = ${id}::uuid AND tipo = 'EXCEPCION_AUTORIZADA'`;
    expect(Number(n!.n)).toBe(1);

    // La emisión y su PDF no cambian después (decisiones inmutables; sin regenerar).
    const sha = createHash("sha256").update(pdf).digest("hex");
    await expect(migrador.$executeRaw`UPDATE excepcion_decision SET decision = 'RECHAZADA' WHERE version_id = ${versionId}::uuid`).rejects.toThrow(/DECISION_EXCEPCION_INMUTABLE/);
    await expect(migrador.$executeRaw`DELETE FROM excepcion_decision WHERE version_id = ${versionId}::uuid`).rejects.toThrow(/DECISION_EXCEPCION_INMUTABLE/);
    await expect(prisma.$executeRaw`DELETE FROM excepcion_decision WHERE version_id = ${versionId}::uuid`).rejects.toThrow(/permission denied|42501/);
    expect(createHash("sha256").update(await documento(p, e.cuerpo.emision.id)).digest("hex")).toBe(sha);
  });

  it("una rechazada impide aprobar esa versión; la corrección es vN+1 con revisión y decisiones nuevas; v1 intacta", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, revision } = await r3EnRevision(p);
    const vista = await detalle(r, revision.revision.id);
    expect((await decidirExc(r, vista, 1, "RECHAZADA", idem(), "No hay respaldo técnico.")).status).toBe(200);
    const bloqueada = await aprobar(r, await detalle(r, revision.revision.id));
    expect(bloqueada.status).toBe(422);
    expect(JSON.stringify(bloqueada.cuerpo.error.problemas)).toMatch(/rechazada/);
    const cambios = await r.post(
      `/api/v1/revisiones/${revision.revision.id}/decision`,
      { decision: "SOLICITAR_CAMBIOS", versionId: vista.revision.version.id, revision: vista.revision.revision, observaciones: "Quite o justifique la excepción del block." },
      idem(),
    );
    expect(cambios.status, cambios.texto).toBe(200);
    // Reenviar la misma versión con la rechazada se bloquea (también al enviar).
    const reenvio = await enviar(p, id, 1, (await borrador(p, id)).revision);
    expect(reenvio.status).toBe(422);
    const fila1 = await filaVersion(id, 1);

    // Corrección: desperdicio en lugar de rendimiento → v2 → la nueva excepción vuelve a PENDIENTE.
    const rev = await conExcepciones(p, id, [excepcionBlock({ campo: "DESPERDICIO", valorAplicado: "0.08", motivo: "Desperdicio mayor por cortes en obra." })]);
    await version(p, id, rev, 2);
    const env2 = await enviar(p, id, 2, rev);
    expect(env2.status, env2.texto).toBe(201);
    expect((await excepciones(r, id, 2)).excepciones[0]).toMatchObject({ estado: "PENDIENTE", campo: "DESPERDICIO", valorOriginal: "0.05", valorAplicado: "0.08" });
    expect((await excepciones(r, id, 1)).excepciones[0]).toMatchObject({ estado: "RECHAZADA" });
    expect(await filaVersion(id, 1)).toEqual(fila1);
  });

  it("añadir una excepción después de aprobar no conserva la aprobación en silencio: la emisión se bloquea y hace falta vN+1", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id } = await cotizacion(p, borradorDesdeEntrada(R1.entrada as EntradaCalculo));
    const v = await version(p, id, 0);
    expect(v.cotizacion.total).toBe("54190.68");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    expect((await aprobar(r, env)).status).toBe(200);
    await conExcepciones(p, id, [excepcionBlock({ conceptoCodigo: "CON-00007", componenteCodigo: "CMP-00005", campo: "DESPERDICIO", valorAplicado: "0.07" })]);
    const e = await emitir(p, id, 1, v.version.id, env.revision.id);
    expect(e.status).toBe(422);
    expect(e.cuerpo.error.codigo).toBe("EMISION_BLOQUEADA");
    expect((await detalle(r, env.revision.id)).revision.estado).toBe("APROBADA");
  });
});

describe("permisos, BL-17, aislamiento y concurrencia", () => {
  it("Revisor no guarda el borrador; Preparador no decide; administrador sin la capacidad; otra organización: 404", async () => {
    const p = await preparador();
    const { id, revision } = await r3EnRevision(p);
    const r = await revisor();
    const b = await borrador(p, id);
    expect((await guardar(r, id, b.revision, b.captura)).status).toBe(403);
    expect((await decidirExc(p, revision, 1, "AUTORIZADA")).status).toBe(403);
    const adm = await administrador();
    expect((await adm.get(`/api/v1/cotizaciones/${id}/versiones/1/excepciones`)).status).toBe(403);
    expect((await adm.get("/api/v1/excepciones/componentes?conceptos=CON-00009")).status).toBe(403);
    const otro = await ajeno();
    expect((await otro.get(`/api/v1/cotizaciones/${id}/versiones/1/excepciones`)).status).toBe(404);
    expect((await decidirExc(otro, revision, 1, "AUTORIZADA")).status).toBe(404);
    expect((await decidirExc(r, revision, 1, "AUTORIZADA", { ...idem(), csrf: null })).status).toBe(403);
    expect((await r.post(`/api/v1/revisiones/${revision.revision.id}/excepciones/1/decision`, { versionId: revision.revision.version.id, decision: "AUTORIZADA", organizacionId: org }, idem())).status).toBe(400);
    expect((await decidirExc(r, revision, 2, "AUTORIZADA")).status).toBe(404);
    // Componentes para registrar: datos técnicos sin costos ni tarifas.
    const comp = await p.get("/api/v1/excepciones/componentes?conceptos=CON-00009");
    expect(comp.status).toBe(200);
    expect(comp.cuerpo.conceptos[0].componentes.map((k: { codigo: string }) => k.codigo)).toEqual(["CMP-00011", "CMP-00012", "CMP-00013"]);
    expect(JSON.stringify(comp.cuerpo)).not.toMatch(/costo|precio|tarifa|traslape|proveedor/i);
  });

  it("BL-17: quien preparó la versión no autoriza sus excepciones aunque tenga la función Revisor (API y base)", async () => {
    const a = await ambas();
    const { id, revision } = await r3EnRevision(a);
    expect((await excepciones(a, id, 1)).acciones.decidir.permitida).toBe(false);
    const r = await decidirExc(a, revision, 1, "AUTORIZADA");
    expect(r.status).toBe(422);
    expect(r.cuerpo.error.codigo).toBe("DECISION_BLOQUEADA");
    const [u] = await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'ambas.exc@softarq.test'`;
    await expect(
      prisma.$executeRaw`INSERT INTO excepcion_decision (organizacion_id, cotizacion_id, version_id, revision_id, numero, decision, preparador_id, decidido_por, decidido_nombre)
        VALUES (${org}::uuid, ${id}::uuid, ${revision.revision.version.id}::uuid, ${revision.revision.id}::uuid, 1, 'AUTORIZADA', ${u!.id}::uuid, ${u!.id}::uuid, 'x')`,
    ).rejects.toThrow(/AUTOAPROBACION/);
  });

  it("dos revisores a la vez: una decisión gana y la otra recibe 409 con el estado vigente; el reintento se reproduce", async () => {
    const p = await preparador();
    const { revision } = await r3EnRevision(p);
    const [r1, r2] = [await revisor(), await revisor2()];
    const clave = idem();
    const res = await Promise.all([decidirExc(r1, revision, 1, "AUTORIZADA", clave), decidirExc(r2, revision, 1, "RECHAZADA")]);
    expect(res.map((x) => x.status).sort()).toEqual([200, 409]);
    const perdedora = res.find((x) => x.status === 409)!;
    expect(perdedora.cuerpo.error.codigo).toBe("CONFLICTO_EXCEPCION");
    const vigente = EsquemaExcepcionesVersion.parse(perdedora.cuerpo.error.excepcionesVigentes);
    expect(vigente.excepciones[0]!.estado).not.toBe("PENDIENTE");
    const replay = await decidirExc(r1, revision, 1, "AUTORIZADA", clave);
    expect([200, 409]).toContain(replay.status);
    if (res[0]!.status === 200) expect(replay.headers.get("idempotent-replayed")).toBe("true");
  });

  it("rechazar y aprobar a la vez nunca deja APROBADA una versión con una excepción RECHAZADA; la base lo impide también", async () => {
    const p = await preparador();
    const lista = [excepcionBlock(), excepcionBlock({ campo: "DESPERDICIO", valorAplicado: "0.06" })];
    const { revision } = await r3EnRevision(p, lista);
    const [r1, r2] = [await revisor(), await revisor2()];
    expect((await decidirExc(r1, revision, 1, "AUTORIZADA")).status).toBe(200);
    const vista = await detalle(r1, revision.revision.id);
    await Promise.all([aprobar(r1, vista), decidirExc(r2, revision, 2, "RECHAZADA")]);
    const final = await detalle(r1, revision.revision.id);
    expect(final.revision.estado).toBe("PENDIENTE");

    // Sin pasar por el servicio: la función de la base exige todas autorizadas.
    const [u] = await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'rev.exc@softarq.test'`;
    await expect(
      prisma.$queryRaw`SELECT softarq_decidir_revision(${org}::uuid, ${u!.id}::uuid, ${revision.revision.id}::uuid, ${revision.revision.version.id}::uuid,
        ${final.revision.revision}::int, 'APROBAR', NULL, '[]'::jsonb, ${randomUUID()}::uuid, 'decidir_revision', ${Buffer.alloc(32, 1)}, now() + interval '1 day')::text`,
    ).rejects.toThrow(/EXCEPCIONES_SIN_AUTORIZAR/);
  });

  it("rol de aplicación mínimo en excepcion_decision: SELECT e INSERT, sin UPDATE, DELETE ni DDL", async () => {
    const [f] = await prisma.$queryRaw<Record<string, boolean>[]>`SELECT
      has_table_privilege(current_user, 'public.excepcion_decision', 'SELECT') AS lectura,
      has_table_privilege(current_user, 'public.excepcion_decision', 'INSERT') AS insercion,
      has_table_privilege(current_user, 'public.excepcion_decision', 'UPDATE') AS edicion,
      has_table_privilege(current_user, 'public.excepcion_decision', 'DELETE') AS borrado,
      has_schema_privilege(current_user, 'public', 'CREATE') AS ddl`;
    expect(f).toEqual({ lectura: true, insercion: true, edicion: false, borrado: false, ddl: false });
  });
});

describe("precio vencido y concepto personalizado", () => {
  /** CON-00002 (m³) con PRE-000005, vigente hasta el 2026-09-15 (`datos-demo.ts`, prueba BL-09 del libro). */
  const capturaY: CapturaBorrador = {
    consolidarCompras: true,
    partidas: [
      {
        tipo: "CONCEPTO",
        conceptoCodigo: "CON-00002",
        descripcion: "",
        mediciones: [{ descripcion: "Losa", signo: "+", piezas: "1", largo: "2", ancho: "1", alto: "0.1", segundaMedida: "ancho" }],
      },
    ],
    seleccion: [
      { insumoCodigo: "INS-00002", precioCodigo: "PRE-000002" },
      { insumoCodigo: "INS-00003", precioCodigo: "PRE-000005" },
    ],
  };

  it("TI-068 a TI-073: BL-09 bloquea sin excepción; con PRECIO_VENCIDO registrada se envía, autorizada se aprueba y se emite", async () => {
    // El precio se eligió cuando estaba vigente (2026-09-10); hoy (2026-09-25) ya venció.
    const antes = await preparador(await appConFecha("2026-09-10"));
    const { id } = await cotizacion(antes, capturaY);
    const p = await preparador();
    await version(p, id, 0);
    const sinExc = await enviar(p, id, 1, 0);
    expect(sinExc.status).toBe(422);
    expect(sinExc.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-09");

    const rev = await conExcepciones(p, id, [{ tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00003", precioCodigo: "PRE-000005", motivo: "Proveedor sostiene el precio por escrito hasta la entrega." }]);
    const v2 = await version(p, id, rev, 2);
    const env = await enviar(p, id, 2, rev);
    expect(env.status, env.texto).toBe(201);
    const r = await revisor();
    const vista = await detalle(r, env.cuerpo.revision.id);
    // Como `Validar` estricto del libro: un BL-09 por la excepción pendiente y otro por el precio vencido.
    expect(new Set(vista.verificacion!.bloqueos.map((b) => b.codigo))).toEqual(new Set(["BL-09"]));
    expect((await decidirExc(r, vista, 1, "AUTORIZADA")).status).toBe(200);
    const vista2 = await detalle(r, env.cuerpo.revision.id);
    expect(vista2.verificacion!.bloqueos).toEqual([]);
    expect(vista2.verificacion!.avisos.map((a) => a.codigo)).toContain("AV-04");
    expect((await aprobar(r, vista2)).status).toBe(200);
    const e = await emitir(p, id, 2, v2.version.id, env.cuerpo.revision.id);
    expect(e.status, e.texto).toBe(201);
  });

  it("TI-088: concepto personalizado sin excepción bloquea con BL-04; con la excepción registrada se calcula y exige autorización", async () => {
    const p = await preparador();
    const busqueda = await p.get("/api/v1/catalogos/conceptos?buscar=CON-PER");
    expect(busqueda.cuerpo.conceptos).toEqual([expect.objectContaining({ codigo: "CON-PER-01", clase: "PERSONALIZADO" })]);
    const captura: CapturaBorrador = {
      consolidarCompras: true,
      partidas: [
        {
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-PER-01",
          descripcion: "",
          mediciones: [{ descripcion: "Muro", signo: "+", piezas: "1", largo: "6", ancho: null, alto: "2.7", segundaMedida: "alto" }],
        },
      ],
      seleccion: [{ insumoCodigo: "INS-00010", precioCodigo: "PRE-000016" }],
    };
    const { id } = await cotizacion(p, captura);
    const bloqueado = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(bloqueado.status).toBe(422);
    expect(bloqueado.cuerpo.error.problemas).toEqual([expect.objectContaining({ codigo: "BL-04", referencia: "CON-PER-01" })]);

    const rev = await conExcepciones(p, id, [{ tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: "CON-PER-01", motivo: "Muro especial solicitado por el cliente." }]);
    await version(p, id, rev);
    const env = await enviar(p, id, 1, rev);
    expect(env.status, env.texto).toBe(201);
    const vista = await detalle(await revisor(), env.cuerpo.revision.id);
    expect(vista.verificacion!.bloqueos.map((b) => b.codigo)).toEqual(["BL-04"]);
  });
});
