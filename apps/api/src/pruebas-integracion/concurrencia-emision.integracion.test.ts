/**
 * Emisión (módulo 8, ADR-0010): concurrencia, idempotencia, fallos entre el archivo y el registro,
 * y recuperación, contra softarq_test y la carpeta EXCLUSIVA _work\pruebas\documentos-integracion.
 *
 * La base y el disco no comparten transacción: cada prueba comprueba que nunca queda una emisión
 * sin archivo válido ni un archivo definitivo sin registro (salvo la interrupción simulada, que
 * limpia `revisar`), y que un reintento con la misma clave no duplica nada.
 */
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaDetalleRevision, type DetalleRevision, type EntradaCalculo } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion, type OpcionesAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { AlmacenArchivos, ErrorDocumento, type AlmacenDocumentos } from "../modules/cotizaciones/infraestructura/almacen-documentos.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, NOMBRE_COOKIE, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const DIR = directorioDocumentosPrueba("integracion");

const prisma = prismaApp();
let migrador: ClientePrisma;
let orgId: string;
let url: string;
const cred: Record<string, Credencial> = {};
const apps: INestApplication[] = [];

const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function iniciarApp(opciones: OpcionesAplicacion = {}): Promise<string> {
  const a = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", SOFTARQ_DIR_DOCUMENTOS: DIR, API_ACCESO_INTENTOS_IP: "1000" }),
    { reloj: new RelojFijo(FECHA), ...opciones },
  );
  await a.listen(0, "127.0.0.1");
  apps.push(a);
  return (await a.getUrl()).replace("[::1]", "127.0.0.1");
}

const preparador = (base = url) => new ClienteHttp(base).entrar(cred["prep.emic@softarq.test"]!);
const revisor = (base = url) => new ClienteHttp(base).entrar(cred["rev.emic@softarq.test"]!);

/** Cotización con v1 aprobada por otra persona, lista para emitir. */
async function aprobadaLista() {
  const p = await preparador();
  const sufijo = randomUUID().slice(0, 6);
  const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente ${sufijo}`, contactoNombre: "Íñigo Peña", contactoTelefono: "55 5555 5555" }, idem());
  const pry = await p.post(
    "/api/v1/proyectos",
    { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${sufijo}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Nave." },
    idem(),
  );
  const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(R1.entrada as EntradaCalculo) }, idem());
  const id = cot.cuerpo.cotizacion.id as string;
  const v1 = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
  expect(v1.status, v1.texto).toBe(201);
  const env = EsquemaDetalleRevision.parse((await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem())).cuerpo);
  const r = await revisor();
  const ok = await r.post(`/api/v1/revisiones/${env.revision.id}/decision`, { decision: "APROBAR", versionId: v1.cuerpo.version.id, revision: 0 }, idem());
  expect(ok.status, ok.texto).toBe(200);
  return { id, versionId: v1.cuerpo.version.id as string, rev: EsquemaDetalleRevision.parse(ok.cuerpo) as DetalleRevision };
}

const emitir = (c: ClienteHttp, id: string, versionId: string, revisionId: string, o = idem()) =>
  c.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId, revisionId }, o);

async function descargar(c: ClienteHttp, emisionId: string) {
  const r = await fetch(`${c.url}/api/v1/emisiones/${emisionId}/documento`, { headers: { Cookie: `${NOMBRE_COOKIE}=${c.cookie}` } });
  const cuerpo = Buffer.from(await r.arrayBuffer());
  return { status: r.status, cuerpo, json: r.headers.get("content-type")?.includes("json") ? JSON.parse(cuerpo.toString("utf8")) : null };
}

const archivosOrg = () => (existsSync(join(DIR, "emisiones", orgId)) ? readdirSync(join(DIR, "emisiones", orgId)).sort() : []);
const temporales = () => (existsSync(join(DIR, "tmp")) ? readdirSync(join(DIR, "tmp")) : []);
const emisionesDe = async (cotizacionId: string) =>
  migrador.$queryRaw<{ id: string; archivo_clave: string }[]>`SELECT id::text, archivo_clave FROM emision WHERE cotizacion_id = ${cotizacionId}::uuid`;
/** Emisiones de ESTA organización (las demás pruebas comparten la base, pero vacían la carpeta al empezar). */
const registradas = async () =>
  (await migrador.$queryRaw<{ id: string; archivo_clave: string; archivo_bytes: number; sha: string }[]>`
    SELECT id::text, archivo_clave, archivo_bytes, encode(archivo_sha256, 'hex') AS sha FROM emision
     WHERE organizacion_id = ${orgId}::uuid`).map((r) => ({
    id: r.id,
    archivoClave: r.archivo_clave,
    archivoBytes: r.archivo_bytes,
    archivoSha256: r.sha,
  }));

/** Cada archivo definitivo de la organización tiene su registro y viceversa. */
async function coherente(): Promise<void> {
  const claves = new Set((await registradas()).map((r) => r.archivoClave));
  for (const f of archivosOrg()) expect(claves.has(`emisiones/${orgId}/${f}`), `archivo sin registro ${f}`).toBe(true);
  for (const c of claves) if (c.startsWith(`emisiones/${orgId}/`)) expect(existsSync(join(DIR, ...c.split("/"))), `registro sin archivo ${c}`).toBe(true);
  expect(temporales()).toEqual([]);
}

beforeAll(async () => {
  vaciarDocumentosPrueba(DIR);
  orgId = (await cargarDemo(prisma, { codigo: "DEMO-EMI-C", nombre: "[DEMO] Emisión concurrente" })).organizacionId;
  await cargarEmisorDemo(prisma, orgId);
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-EMI-C", [
      cuenta("prep.emic@softarq.test", "[DEMO] Preparador C", "PREPARADOR"),
      cuenta("rev.emic@softarq.test", "[DEMO] Revisor C", "REVISOR"),
    ]),
  );
  url = await iniciarApp();
});

afterAll(async () => {
  for (const a of apps) await a.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

describe("idempotencia", () => {
  it("respuesta perdida: el reintento con la misma clave reproduce la emisión (mismos bytes y hash), sin duplicar", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const p = await preparador();
    const o = idem();
    const a = await emitir(p, id, versionId, rev.revision.id, o);
    expect(a.status, a.texto).toBe(201);
    const b = await emitir(p, id, versionId, rev.revision.id, o);
    expect(b.status).toBe(201);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.cuerpo.emision.id).toBe(a.cuerpo.emision.id);
    const d1 = await descargar(p, a.cuerpo.emision.id);
    const d2 = await descargar(p, b.cuerpo.emision.id);
    expect(d1.cuerpo.equals(d2.cuerpo)).toBe(true);
    expect(sha(d1.cuerpo)).toBe(a.cuerpo.emision.archivo.sha256);
    expect(await emisionesDe(id)).toHaveLength(1);
    await coherente();
  });

  it("doble clic (misma clave en paralelo): una emisión y un archivo", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const p = await preparador();
    const o = idem();
    const antes = archivosOrg().length;
    const [a, b] = await Promise.all([emitir(p, id, versionId, rev.revision.id, o), emitir(p, id, versionId, rev.revision.id, o)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.cuerpo.emision.id).toBe(b.cuerpo.emision.id);
    expect(await emisionesDe(id)).toHaveLength(1);
    expect(archivosOrg().length).toBe(antes + 1);
    await coherente();
  });

  it("dos emisiones con claves distintas a la vez: una se confirma, la otra 409 y su archivo se borra", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const p = await preparador();
    const p2 = await preparador();
    const antes = archivosOrg().length;
    const rs = await Promise.all([emitir(p, id, versionId, rev.revision.id), emitir(p2, id, versionId, rev.revision.id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)!.cuerpo.error.codigo).toBe("VERSION_EMITIDA");
    expect(await emisionesDe(id)).toHaveLength(1);
    expect(archivosOrg().length).toBe(antes + 1);
    await coherente();
  });
});

describe("carreras con anulación, descarte y edición", () => {
  it("la aprobación se anula entre el archivo y el registro: no se emite (409) y el archivo se borra", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const r = await revisor();
    const base = await iniciarApp({
      documentos: {
        ganchos: {
          antesDeRegistrar: async () => {
            const an = await r.post(`/api/v1/revisiones/${rev.revision.id}/anulacion`, { revision: rev.revision.revision, motivo: "Anulada durante la emisión (prueba)." }, idem());
            expect(an.status, an.texto).toBe(200);
          },
        },
      },
    });
    const antes = archivosOrg();
    const e = await emitir(await preparador(base), id, versionId, rev.revision.id);
    expect(e.status).toBe(409);
    expect(e.cuerpo.error.codigo).toBe("APROBACION_NO_VIGENTE");
    expect(await emisionesDe(id)).toHaveLength(0);
    expect(archivosOrg()).toEqual(antes);
    await coherente();
  });

  it("una anulación sin confirmar bloquea la sentencia de emisión, que falla al confirmarse la anulación", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const revisorId = (await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'rev.emic@softarq.test'`)[0]!.id;
    const p = await preparador();
    let liberar!: () => void;
    const listo = new Promise<void>((r) => (liberar = r));
    let emision!: Promise<Awaited<ReturnType<typeof emitir>>>;
    let esperoElBloqueo = false;
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT softarq_anular_aprobacion(${orgId}::uuid, ${revisorId}::uuid, ${rev.revision.id}::uuid, ${rev.revision.revision}::integer,
          'Anulación concurrente sin confirmar (prueba).', ${randomUUID()}::uuid, 'anular_aprobacion', ${Buffer.alloc(32, 7)}, now() + interval '1 day')`;
        emision = emitir(p, id, versionId, rev.revision.id);
        // La emisión llega a su sentencia y espera el bloqueo de la revisión.
        for (let i = 0; i < 100; i++) {
          // Con el rol de la aplicación: pg_stat_activity solo muestra el texto de las sesiones propias.
          const esperando = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%softarq_emitir_version%'`;
          if (Number(esperando[0]!.n) > 0) {
            esperoElBloqueo = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        liberar();
      },
      { timeout: 20_000 },
    );
    await listo;
    expect(esperoElBloqueo).toBe(true);
    const e = await emision;
    expect(e.status).toBe(409);
    expect(e.cuerpo.error.codigo).toBe("APROBACION_NO_VIGENTE");
    expect(await emisionesDe(id)).toHaveLength(0);
    await coherente();
  });

  it("descartar mientras se emite: el descarte se rechaza (aprobación vigente) y la emisión se confirma", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const p = await preparador();
    let descarte: { status: number; cuerpo: { error?: { codigo: string } } } | null = null;
    const base = await iniciarApp({
      documentos: {
        ganchos: {
          antesDeRegistrar: async () => {
            descarte = await p.post(`/api/v1/cotizaciones/${id}/descarte`, { motivo: "Descarte simultáneo (prueba)." }, idem());
          },
        },
      },
    });
    const e = await emitir(await preparador(base), id, versionId, rev.revision.id);
    expect(e.status, e.texto).toBe(201);
    expect(descarte!.status).toBe(422);
    expect(descarte!.cuerpo.error!.codigo).toBe("DESCARTE_BLOQUEADO");
    await coherente();
  });

  it("el borrador cambia entre el archivo y el registro: 409 sin emisión ni archivo", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const p = await preparador();
    const base = await iniciarApp({
      documentos: {
        ganchos: {
          antesDeRegistrar: async () => {
            const d = (await p.get(`/api/v1/cotizaciones/${id}`)).cuerpo;
            const g = await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: d.borrador.revision, captura: d.borrador.captura });
            expect(g.status, g.texto).toBe(200);
          },
        },
      },
    });
    const e = await emitir(await preparador(base), id, versionId, rev.revision.id);
    expect(e.status).toBe(409);
    expect(e.cuerpo.error.codigo).toBe("BORRADOR_DESACTUALIZADO");
    expect(await emisionesDe(id)).toHaveLength(0);
    await coherente();
  });
});

describe("fallos de generación, escritura, movimiento y registro", () => {
  it("falla la generación: 500 DOCUMENTO_NO_GENERADO, nada registrado ni escrito; el reintento con la misma clave emite", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const base = await iniciarApp({ documentos: { generador: async () => Promise.reject(new Error("fallo simulado del generador")) } });
    const o = idem();
    const antes = archivosOrg();
    const e = await emitir(await preparador(base), id, versionId, rev.revision.id, o);
    expect(e.status).toBe(500);
    expect(e.cuerpo.error.codigo).toBe("DOCUMENTO_NO_GENERADO");
    expect(e.cuerpo.error.mensaje).toMatch(/sigue aprobada y sin emitir/);
    expect(await emisionesDe(id)).toHaveLength(0);
    expect(archivosOrg()).toEqual(antes);
    const ok = await emitir(await preparador(), id, versionId, rev.revision.id, o);
    expect(ok.status, ok.texto).toBe(201);
    await coherente();
  });

  it("falla la escritura y el destino ya existe (movimiento): nada se sobrescribe ni se registra", async () => {
    const real = new AlmacenArchivos(DIR);
    const falloEscritura: AlmacenDocumentos = {
      guardar: async () => {
        throw new ErrorDocumento("NO_GENERADO", "disco lleno (simulado)");
      },
      leer: (c, b, s) => real.leer(c, b, s),
      descartar: (c) => real.descartar(c),
    };
    const { id, versionId, rev } = await aprobadaLista();
    const e1 = await emitir(await preparador(await iniciarApp({ documentos: { almacen: falloEscritura } })), id, versionId, rev.revision.id);
    expect([e1.status, e1.cuerpo.error.codigo]).toEqual([500, "DOCUMENTO_NO_GENERADO"]);

    // Movimiento: un archivo ajeno ocupa el nombre definitivo; `link` no lo sobrescribe.
    let ocupado = "";
    const destinoOcupado: AlmacenDocumentos = {
      guardar: async (clave, contenido) => {
        ocupado = join(DIR, ...clave.split("/"));
        mkdirSync(dirname(ocupado), { recursive: true });
        writeFileSync(ocupado, "contenido ajeno que no se debe sobrescribir");
        return real.guardar(clave, contenido);
      },
      leer: (c, b, s) => real.leer(c, b, s),
      descartar: (c) => real.descartar(c),
    };
    const e2 = await emitir(await preparador(await iniciarApp({ documentos: { almacen: destinoOcupado } })), id, versionId, rev.revision.id);
    expect([e2.status, e2.cuerpo.error.codigo]).toEqual([500, "DOCUMENTO_NO_GENERADO"]);
    expect(readFileSync(ocupado, "utf8")).toBe("contenido ajeno que no se debe sobrescribir");
    expect(await emisionesDe(id)).toHaveLength(0);
    rmSync(ocupado);
    await coherente();
  });

  it("falla el registro tras escribir el archivo: 500, el archivo se borra; el reintento con la misma clave emite", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const base = await iniciarApp({ documentos: { ganchos: { antesDeRegistrar: async () => Promise.reject(new Error("caída simulada de la conexión")) } } });
    const o = idem();
    const antes = archivosOrg();
    const e = await emitir(await preparador(base), id, versionId, rev.revision.id, o);
    expect(e.status).toBe(500);
    expect(await emisionesDe(id)).toHaveLength(0);
    expect(archivosOrg()).toEqual(antes);
    const ok = await emitir(await preparador(), id, versionId, rev.revision.id, o);
    expect(ok.status, ok.texto).toBe(201);
    expect(await emisionesDe(id)).toHaveLength(1);
    await coherente();
  });

  it("interrupción entre el archivo y el registro: queda un archivo sin registro que `revisar` limpia sin tocar los registrados", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const real = new AlmacenArchivos(DIR);
    const sinBorrar: AlmacenDocumentos = {
      guardar: (c, b) => real.guardar(c, b),
      leer: (c, b, s) => real.leer(c, b, s),
      descartar: async () => undefined, // el proceso «murió» antes de limpiar
    };
    let huerfano = "";
    const base = await iniciarApp({
      documentos: {
        almacen: sinBorrar,
        ganchos: {
          antesDeRegistrar: async ({ clave }) => {
            huerfano = clave;
            throw new Error("interrupción simulada");
          },
        },
      },
    });
    expect((await emitir(await preparador(base), id, versionId, rev.revision.id)).status).toBe(500);
    expect(existsSync(join(DIR, ...huerfano.split("/")))).toBe(true);
    expect(await emisionesDe(id)).toHaveLength(0);

    const informe = await real.revisar({ registradas: await registradas(), limpiar: true, antiguedadMinimaMs: 0, ahora: new Date(Date.now() + 1000) });
    expect(informe.sinRegistro).toContain(huerfano);
    expect(informe.eliminados).toContain(huerfano);
    expect(informe.ausentes).toEqual([]);
    expect(informe.danados).toEqual([]);
    await coherente();
    // Reintento: una sola emisión.
    expect((await emitir(await preparador(), id, versionId, rev.revision.id)).status).toBe(201);
    expect(await emisionesDe(id)).toHaveLength(1);
  });
});

describe("archivo histórico dañado o ausente", () => {
  it("responde DOCUMENTO_NO_DISPONIBLE y nunca lo regenera; al restaurar el original vuelve a descargarse igual", async () => {
    const { id, versionId, rev } = await aprobadaLista();
    const p = await preparador();
    const e = await emitir(p, id, versionId, rev.revision.id);
    const emisionId = e.cuerpo.emision.id as string;
    const ruta = join(DIR, "emisiones", orgId, `${emisionId}.pdf`);
    const original = readFileSync(ruta);

    const alterado = Buffer.from(original);
    alterado[alterado.length - 20] = (alterado[alterado.length - 20]! + 1) % 256;
    writeFileSync(ruta, alterado);
    const danado = await descargar(p, emisionId);
    expect(danado.status).toBe(500);
    expect(danado.json.error.codigo).toBe("DOCUMENTO_NO_DISPONIBLE");
    expect(readFileSync(ruta).equals(alterado)).toBe(true); // no se «arregló» solo

    rmSync(ruta);
    const ausente = await descargar(p, emisionId);
    expect(ausente.json.error.codigo).toBe("DOCUMENTO_NO_DISPONIBLE");
    expect(existsSync(ruta)).toBe(false); // no se regeneró
    const informe = await new AlmacenArchivos(DIR).revisar({ registradas: await registradas(), limpiar: false, antiguedadMinimaMs: 0, ahora: new Date() });
    expect(informe.ausentes.some((x) => x.startsWith(emisionId))).toBe(true);

    writeFileSync(ruta, original); // restaurar desde el respaldo
    const restaurado = await descargar(p, emisionId);
    expect(restaurado.status).toBe(200);
    expect(sha(restaurado.cuerpo)).toBe(e.cuerpo.emision.archivo.sha256);
    await coherente();
  });
});
