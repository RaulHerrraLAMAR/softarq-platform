/**
 * Concurrencia e idempotencia de la revisión (módulo 7, ADR-0009) contra softarq_test:
 * - aprobar y retirar a la vez, o dos decisiones distintas a la vez: solo se confirma una
 *   transición; la otra recibe 409 CONFLICTO_REVISION y el historial no se contradice;
 * - doble clic (misma clave en paralelo) y reintento tras perder la respuesta: un solo evento;
 * - dos envíos simultáneos de la misma versión: una sola revisión pendiente;
 * - envío y guardado del borrador a la vez: nunca se confirman los dos.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaDetalleRevision, type DetalleRevision } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const cred: Record<string, Credencial> = {};

const entrar = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const idem = (clave = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });

async function pendiente(p: ClienteHttp, sufijo: string): Promise<{ id: string; rev: DetalleRevision }> {
  const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente ${sufijo}` }, idem());
  const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${sufijo}` }, idem());
  const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(R1.entrada) }, idem());
  const id = cot.cuerpo.cotizacion.id as string;
  expect((await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem())).status).toBe(201);
  const env = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem());
  expect(env.status, env.texto).toBe(201);
  return { id, rev: EsquemaDetalleRevision.parse(env.cuerpo) };
}

const cuerpoDecision = (r: DetalleRevision, decision: "APROBAR" | "SOLICITAR_CAMBIOS") => ({
  decision,
  versionId: r.revision.version.id,
  revision: r.revision.revision,
  ...(decision === "SOLICITAR_CAMBIOS" ? { observaciones: "Revise las medidas del faldón sur." } : {}),
});

async function eventos(revisionId: string): Promise<{ tipo: string; secuencia: number }[]> {
  return migrador.$queryRaw`SELECT tipo, secuencia FROM revision_evento WHERE revision_id = ${revisionId}::uuid ORDER BY secuencia`;
}
async function estado(revisionId: string): Promise<string> {
  return (await migrador.$queryRaw<{ estado: string }[]>`SELECT estado FROM revision WHERE id = ${revisionId}::uuid`)[0]!.estado;
}

beforeAll(async () => {
  await cargarDemo(prisma, { codigo: "DEMO-REVCC", nombre: "[DEMO] Revisiones concurrentes" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-REVCC", [
      cuenta("prep.revcc@softarq.test", "[DEMO] Preparador CC", "PREPARADOR"),
      cuenta("rev.revcc@softarq.test", "[DEMO] Revisor CC", "REVISOR"),
      cuenta("rev2.revcc@softarq.test", "[DEMO] Revisor CC 2", "REVISOR"),
    ]),
  );
  app = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }), {
    reloj: new RelojFijo("2026-09-25"),
  });
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

afterAll(async () => {
  await app.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

describe("transiciones simultáneas: solo una se confirma", () => {
  it("aprobar y retirar a la vez (5 rondas): un 200 y un 409; el estado coincide con la transición confirmada", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    const r = await entrar("rev.revcc@softarq.test");
    for (let i = 0; i < 5; i++) {
      const { rev } = await pendiente(p, `Carrera ${i}`);
      const [a, b] = await Promise.all([
        r.post(`/api/v1/revisiones/${rev.revision.id}/decision`, cuerpoDecision(rev, "APROBAR"), idem()),
        p.post(`/api/v1/revisiones/${rev.revision.id}/retiro`, { revision: 0 }, idem()),
      ]);
      expect([a.status, b.status].sort(), `${a.texto} | ${b.texto}`).toEqual([200, 409]);
      const perdedor = a.status === 409 ? a : b;
      expect(perdedor.cuerpo.error.codigo).toBe("CONFLICTO_REVISION");
      const ganadora = a.status === 200 ? "APROBADA" : "RETIRADA";
      expect(await estado(rev.revision.id)).toBe(ganadora);
      expect(perdedor.cuerpo.error.revisionVigente.estado).toBe(ganadora);
      expect((await eventos(rev.revision.id)).map((e) => e.tipo)).toEqual(["ENVIADA", ganadora]);
    }
  });

  it("en la base, sin la API: una retirada sin confirmar bloquea la aprobación, que después falla con CONFLICTO_REVISION", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    const { rev } = await pendiente(p, "Serializar en la base");
    const ids = await migrador.$queryRaw<{ org: string; prep: string; rev: string }[]>`
      SELECT r.organizacion_id::text AS org,
             (SELECT id::text FROM usuario WHERE correo = 'prep.revcc@softarq.test') AS prep,
             (SELECT id::text FROM usuario WHERE correo = 'rev.revcc@softarq.test') AS rev
        FROM revision r WHERE r.id = ${rev.revision.id}::uuid`;
    const { org, prep, rev: revisorId } = ids[0]!;
    const huella = Buffer.alloc(32, 1);
    let aprobacion: Promise<unknown> | null = null;
    let resultadoAprobacion: unknown = null;
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT softarq_retirar_revision(${org}::uuid, ${prep}::uuid, ${rev.revision.id}::uuid, 0, NULL,
          ${randomUUID()}::uuid, 'retirar_revision', ${huella}, now() + interval '1 day')::text`;
        // Otra conexión intenta aprobar con la misma ficha: espera el bloqueo de la fila.
        aprobacion = prisma.$queryRaw`SELECT softarq_decidir_revision(${org}::uuid, ${revisorId}::uuid, ${rev.revision.id}::uuid,
            ${rev.revision.version.id}::uuid, 0, 'APROBAR', NULL, '[]'::jsonb,
            ${randomUUID()}::uuid, 'decidir_revision', ${huella}, now() + interval '1 day')::text`.then(
          (x) => (resultadoAprobacion = x),
          (e: unknown) => (resultadoAprobacion = e),
        );
        await new Promise((r) => setTimeout(r, 400));
        expect(resultadoAprobacion).toBeNull(); // sigue esperando el bloqueo
      },
      { timeout: 10_000 },
    );
    await aprobacion;
    expect(String((resultadoAprobacion as Error).message)).toMatch(/CONFLICTO_REVISION/);
    expect(await estado(rev.revision.id)).toBe("RETIRADA");
    expect((await eventos(rev.revision.id)).map((e) => e.tipo)).toEqual(["ENVIADA", "RETIRADA"]);
  });

  it("dos revisores deciden distinto a la vez: una decisión, un evento y un 409 comprensible", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    const r1 = await entrar("rev.revcc@softarq.test");
    const r2 = await entrar("rev2.revcc@softarq.test");
    const { rev } = await pendiente(p, "Dos revisores");
    const [a, b] = await Promise.all([
      r1.post(`/api/v1/revisiones/${rev.revision.id}/decision`, cuerpoDecision(rev, "APROBAR"), idem()),
      r2.post(`/api/v1/revisiones/${rev.revision.id}/decision`, cuerpoDecision(rev, "SOLICITAR_CAMBIOS"), idem()),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const conflicto = a.status === 409 ? a : b;
    expect(conflicto.cuerpo.error.mensaje).toMatch(/ya no está pendiente/);
    const ev = await eventos(rev.revision.id);
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => e.secuencia)).toEqual([1, 2]);
  });

  it("dos envíos simultáneos de la misma versión: una sola revisión pendiente", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    const cli = await p.post("/api/v1/clientes", { nombre: "[DEMO] Cliente Doble envío" }, idem());
    const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: "[DEMO] Obra Doble envío" }, idem());
    const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(R1.entrada) }, idem());
    const id = cot.cuerpo.cotizacion.id as string;
    await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    const respuestas = await Promise.all(
      [1, 2, 3].map(() => p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem())),
    );
    expect(respuestas.map((x) => x.status).sort()).toEqual([201, 409, 409]);
    const n = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM revision WHERE cotizacion_id = ${id}::uuid`;
    expect(Number(n[0]!.n)).toBe(1);
  });

  it("enviar y guardar el borrador a la vez (5 rondas): nunca se confirman los dos", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    for (let i = 0; i < 5; i++) {
      const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente Envío y guardado ${i}` }, idem());
      const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${i}` }, idem());
      const captura = borradorDesdeEntrada(R1.entrada);
      const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
      const id = cot.cuerpo.cotizacion.id as string;
      await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
      const [envio, guardado] = await Promise.all([
        p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem()),
        p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: { ...captura, consolidarCompras: false } }),
      ]);
      const exitos = [envio.status === 201, guardado.status === 200].filter(Boolean).length;
      expect(exitos, `${envio.status} ${envio.texto} | ${guardado.status} ${guardado.texto}`).toBe(1);
      if (envio.status === 201) expect(guardado.cuerpo.error.codigo).toBe("REVISION_PENDIENTE");
      else expect(envio.cuerpo.error.codigo).toBe("BORRADOR_DESACTUALIZADO");
    }
  });
});

describe("idempotencia de envíos y decisiones", () => {
  it("doble clic (misma clave en paralelo) y reintento tras perder la respuesta: un solo evento y la misma respuesta", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    const r = await entrar("rev.revcc@softarq.test");
    const { rev } = await pendiente(p, "Doble clic");
    const clave = randomUUID();
    const ruta = `/api/v1/revisiones/${rev.revision.id}/decision`;
    const [a, b] = await Promise.all([r.post(ruta, cuerpoDecision(rev, "APROBAR"), idem(clave)), r.post(ruta, cuerpoDecision(rev, "APROBAR"), idem(clave))]);
    expect([a.status, b.status], `${a.texto} | ${b.texto}`).toEqual([200, 200]);
    expect([a.headers.get("idempotent-replayed"), b.headers.get("idempotent-replayed")]).toContain("true");
    // Reintento posterior (respuesta perdida): se reproduce.
    const c = await r.post(ruta, cuerpoDecision(rev, "APROBAR"), idem(clave));
    expect(c.status).toBe(200);
    expect(c.headers.get("idempotent-replayed")).toBe("true");
    expect(c.cuerpo.revision.estado).toBe("APROBADA");
    expect((await eventos(rev.revision.id)).map((e) => e.tipo)).toEqual(["ENVIADA", "APROBADA"]);
    // Misma clave con otro contenido: 422.
    const otro = await r.post(ruta, cuerpoDecision(rev, "SOLICITAR_CAMBIOS"), idem(clave));
    expect(otro.status).toBe(422);
    expect(otro.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CONFLICTO");
  });

  it("el envío con la misma clave se reproduce sin crear otra revisión", async () => {
    const p = await entrar("prep.revcc@softarq.test");
    const cli = await p.post("/api/v1/clientes", { nombre: "[DEMO] Cliente Reintento envío" }, idem());
    const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: "[DEMO] Obra Reintento" }, idem());
    const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(R1.entrada) }, idem());
    const id = cot.cuerpo.cotizacion.id as string;
    await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    const clave = randomUUID();
    const a = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem(clave));
    const b = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem(clave));
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.cuerpo.revision.id).toBe(a.cuerpo.revision.id);
    const n = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM revision WHERE cotizacion_id = ${id}::uuid`;
    expect(Number(n[0]!.n)).toBe(1);
  });
});
