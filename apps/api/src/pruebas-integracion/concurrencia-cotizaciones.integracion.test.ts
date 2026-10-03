/**
 * Concurrencia, idempotencia y reversión de cotizaciones (ADR-0008 §5) con PostgreSQL real
 * (softarq_test): ediciones simultáneas sin pérdida silenciosa, folios y versiones únicos con
 * solicitudes en paralelo, doble envío y reintentos con la misma clave, claves caducadas o
 * reutilizadas, comprobaciones de la fase B y ausencia de escrituras parciales ante un fallo.
 * También mide los tiempos reales de las fases A y B.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaDetalleCotizacion, EsquemaVersion, type CapturaBorrador } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, RAIZ_API, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const HORA = 60 * 60 * 1000;
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let credencial: Credencial;
let usuarioId: string;
let organizacionId: string;
/** Desfase del reloj de instantes (sesiones e idempotencia) para probar la caducidad de claves. */
let desfaseMs = 0;
const tiempos: { A: number[]; B: number[] } = { A: [], B: [] };

const entrar = () => new ClienteHttp(url).entrar(credencial);
const conClave = (clave: string = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });

async function nuevaCotizacion(c: ClienteHttp, captura: CapturaBorrador = borradorDesdeEntrada(R1.entrada)) {
  const cli = await c.post("/api/v1/clientes", { nombre: "[DEMO] Cliente concurrencia" }, conClave());
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: "[DEMO] Obra concurrencia" }, conClave());
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, conClave());
  expect(cot.status, cot.texto).toBe(201);
  return { proyectoId: pry.cuerpo.id as string, detalle: EsquemaDetalleCotizacion.parse(cot.cuerpo) };
}

const contar = async (tabla: "cotizacion" | "cotizacion_version" | "idempotencia", where = "true") => {
  const filas = await migrador.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${tabla} WHERE ${where}`);
  return Number(filas[0]!.n);
};

function percentil(valores: number[], p: number): number {
  const v = [...valores].sort((a, b) => a - b);
  return Math.round(v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)]! * 10) / 10;
}

beforeAll(async () => {
  organizacionId = (await cargarDemo(prisma, { codigo: "DEMO-CONC", nombre: "[DEMO] Concurrencia" })).organizacionId;
  migrador = await prismaMigrador();
  credencial = (await crearCuentas(migrador, "DEMO-CONC", [cuenta("preparador.conc@softarq.test", "[DEMO] Preparador Conc", "PREPARADOR")]))[
    "preparador.conc@softarq.test"
  ]!;
  const [u] = await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'preparador.conc@softarq.test'`;
  usuarioId = u!.id;
  app = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }), {
    reloj: new RelojFijo("2026-09-25"),
    relojSesiones: { ahora: () => new Date(Date.now() + desfaseMs) },
    medirTiempos: (fase, ms) => tiempos[fase].push(ms),
  });
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
  if (tiempos.A.length > 0 && tiempos.B.length > 0) {
    const resumen = {
      fecha: new Date().toISOString(),
      nota: "Tiempos reales (ms) de crear versión en softarq_test; A = lectura REPEATABLE READ + cálculo; B = sentencia de escritura.",
      A: { n: tiempos.A.length, p50: percentil(tiempos.A, 50), p95: percentil(tiempos.A, 95), max: percentil(tiempos.A, 100) },
      B: { n: tiempos.B.length, p50: percentil(tiempos.B, 50), p95: percentil(tiempos.B, 95), max: percentil(tiempos.B, 100) },
    };
    const carpeta = join(RAIZ_API, "..", "..", "..", "_work", "registros", "modulo6");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "tiempos-fases-integracion.json"), `${JSON.stringify(resumen, null, 2)}\n`, "utf8");
    console.log(`[tiempos] ${JSON.stringify(resumen)}`);
  }
});

describe("concurrencia del borrador (revisión)", () => {
  it("dos guardados simultáneos sobre la misma revisión: uno gana y el otro recibe 409 con el estado vigente", async () => {
    const c = await entrar();
    const { detalle } = await nuevaCotizacion(c);
    const id = detalle.cotizacion.id;
    const pestanaA = borradorDesdeEntrada(R1.entrada);
    (pestanaA.partidas[0] as { descripcion: string }).descripcion = "Pestaña A";
    const pestanaB = borradorDesdeEntrada(R1.entrada);
    (pestanaB.partidas[0] as { descripcion: string }).descripcion = "Pestaña B";

    const [ra, rb] = await Promise.all([
      c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: pestanaA }),
      c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: pestanaB }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const [ganadora, perdedora, capturaGanadora] = ra.status === 200 ? [ra, rb, pestanaA] : [rb, ra, pestanaB];
    expect(ganadora.cuerpo.revision).toBe(1);
    expect(perdedora.cuerpo.error).toMatchObject({ codigo: "CONFLICTO_EDICION", actual: { revision: 1, captura: capturaGanadora } });

    const final = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    expect(final.borrador).toMatchObject({ revision: 1, captura: capturaGanadora });
  });
});

describe("folios y versiones con solicitudes en paralelo", () => {
  it("10 cotizaciones simultáneas reciben folios distintos (contador atómico, sin MAX + 1)", async () => {
    const c = await entrar();
    const { proyectoId } = await nuevaCotizacion(c);
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => c.post("/api/v1/cotizaciones", { proyectoId }, conClave())),
    );
    expect(respuestas.map((r) => r.status)).toEqual(Array(10).fill(201));
    const folios = respuestas.map((r) => r.cuerpo.cotizacion.folio as string);
    expect(new Set(folios).size).toBe(10);
    for (const f of folios) expect(f).toMatch(/^COT-2026-\d{5}$/);
  });

  it("4 versiones simultáneas de la misma cotización: números únicos y consecutivos", async () => {
    const c = await entrar();
    const { detalle } = await nuevaCotizacion(c);
    const id = detalle.cotizacion.id;
    const respuestas = await Promise.all(
      Array.from({ length: 4 }, () => c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, conClave())),
    );
    expect(respuestas.map((r) => r.status), respuestas.map((r) => r.texto).join("\n")).toEqual([201, 201, 201, 201]);
    const numeros = respuestas.map((r) => EsquemaVersion.parse(r.cuerpo).version.numero).sort();
    expect(numeros).toEqual([1, 2, 3, 4]);
    expect(await contar("cotizacion_version", `cotizacion_id = '${id}'`)).toBe(4);
  });

  it("la fase B rechaza un borrador cambiado o una versión anterior distinta sin escribir nada", async () => {
    const c = await entrar();
    const { detalle } = await nuevaCotizacion(c);
    const id = detalle.cotizacion.id;
    expect((await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: detalle.borrador.captura })).status).toBe(200);
    const llamar = (revision: number, anterior: number, clave: string) =>
      prisma.$queryRaw`
        SELECT * FROM softarq_crear_version(
          ${organizacionId}::uuid, ${usuarioId}::uuid, ${id}::uuid, ${revision}::integer, ${anterior}::integer, '{}'::jsonb,
          ${clave}::uuid, 'crear_version', ${Buffer.alloc(32)}, now() + interval '1 day')`;
    const clave1 = randomUUID();
    await expect(llamar(0, 0, clave1)).rejects.toThrow(/BORRADOR_DESACTUALIZADO/);
    const clave2 = randomUUID();
    await expect(llamar(1, 7, clave2)).rejects.toThrow(/VERSION_CONCURRENTE/);
    expect(await contar("cotizacion_version", `cotizacion_id = '${id}'`)).toBe(0);
    expect(await contar("idempotencia", `clave IN ('${clave1}', '${clave2}')`)).toBe(0);
    const [q] = await migrador.$queryRaw<{ u: number }[]>`SELECT ultima_version AS u FROM cotizacion WHERE id = ${id}::uuid`;
    expect(q!.u).toBe(0);
  });
});

describe("idempotencia de las altas", () => {
  it("doble envío simultáneo con la misma clave crea UNA cotización; repetirla después la reproduce", async () => {
    const c = await entrar();
    const { proyectoId } = await nuevaCotizacion(c);
    const antes = await contar("cotizacion");
    const clave = randomUUID();
    const [a, b] = await Promise.all([
      c.post("/api/v1/cotizaciones", { proyectoId }, conClave(clave)),
      c.post("/api/v1/cotizaciones", { proyectoId }, conClave(clave)),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.cuerpo.cotizacion.folio).toBe(b.cuerpo.cotizacion.folio);
    expect([a.headers.get("idempotent-replayed"), b.headers.get("idempotent-replayed")].filter(Boolean)).toEqual(["true"]);
    expect(await contar("cotizacion")).toBe(antes + 1);

    const reintento = await c.post("/api/v1/cotizaciones", { proyectoId }, conClave(clave));
    expect(reintento.status).toBe(201);
    expect(reintento.headers.get("idempotent-replayed")).toBe("true");
    expect(reintento.cuerpo.cotizacion.id).toBe(a.cuerpo.cotizacion.id);
    expect(await contar("cotizacion")).toBe(antes + 1);
  });

  it("la misma clave con otro contenido u otra operación se rechaza (422) y no crea nada", async () => {
    const c = await entrar();
    const { proyectoId } = await nuevaCotizacion(c);
    const clave = randomUUID();
    expect((await c.post("/api/v1/cotizaciones", { proyectoId }, conClave(clave))).status).toBe(201);
    const antes = await contar("cotizacion");
    const otroCuerpo = await c.post("/api/v1/cotizaciones", { proyectoId, captura: borradorDesdeEntrada(R1.entrada) }, conClave(clave));
    expect(otroCuerpo.status).toBe(422);
    expect(otroCuerpo.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    const otraOperacion = await c.post("/api/v1/clientes", { nombre: "[DEMO] Otro" }, conClave(clave));
    expect(otraOperacion.status).toBe(422);
    expect(otraOperacion.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    expect(await contar("cotizacion")).toBe(antes);

    const sinClave = await c.post("/api/v1/clientes", { nombre: "[DEMO] Sin clave" });
    expect(sinClave.status).toBe(400);
    expect(sinClave.cuerpo.error.campos[0].ruta).toBe("cabecera Idempotency-Key");
  });

  it("guardar versión con la misma clave en paralelo y tras perder la respuesta: una sola versión", async () => {
    const c = await entrar();
    const { detalle } = await nuevaCotizacion(c);
    const id = detalle.cotizacion.id;
    const clave = randomUUID();
    const [a, b] = await Promise.all([
      c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, conClave(clave)),
      c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, conClave(clave)),
    ]);
    expect([a.status, b.status], `${a.texto}\n${b.texto}`).toEqual([201, 201]);
    expect(a.cuerpo).toEqual(b.cuerpo);
    const reintento = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, conClave(clave));
    expect(reintento.cuerpo).toEqual(a.cuerpo);
    expect(reintento.headers.get("idempotent-replayed")).toBe("true");
    expect(await contar("cotizacion_version", `cotizacion_id = '${id}'`)).toBe(1);
  });

  it("una clave caducada (24 h) no se reutiliza: 422 IDEMPOTENCIA_CADUCADA", async () => {
    const c = await entrar();
    const clave = randomUUID();
    expect((await c.post("/api/v1/clientes", { nombre: "[DEMO] Caducidad" }, conClave(clave))).status).toBe(201);
    desfaseMs = 25 * HORA;
    try {
      const otra = await entrar(); // la sesión anterior también venció
      const r = await otra.post("/api/v1/clientes", { nombre: "[DEMO] Caducidad" }, conClave(clave));
      expect(r.status).toBe(422);
      expect(r.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CADUCADA");
    } finally {
      desfaseMs = 0;
    }
  });
});

describe("reversión ante fallos", () => {
  it("si falla una escritura de la fase B no queda versión, número, evento ni clave registrada", async () => {
    const c = await entrar();
    const { detalle } = await nuevaCotizacion(c);
    const id = detalle.cotizacion.id;
    // Fallo inyectado con el rol migrador (solo softarq_test): la inserción del evento falla.
    await migrador.$executeRawUnsafe(`
      CREATE FUNCTION prueba_falla_bitacora() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tipo = 'VERSION_CREADA' THEN RAISE EXCEPTION 'fallo inyectado por la prueba'; END IF;
        RETURN NEW;
      END $$`);
    await migrador.$executeRawUnsafe(
      `CREATE TRIGGER prueba_falla_bitacora_trg BEFORE INSERT ON bitacora FOR EACH ROW EXECUTE FUNCTION prueba_falla_bitacora()`,
    );
    const clave = randomUUID();
    try {
      const r = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, conClave(clave));
      expect(r.status).toBe(500);
      expect(r.cuerpo.error.codigo).toBe("ERROR_INTERNO");
      expect(r.texto).not.toMatch(/fallo inyectado|bitacora|SQL/i);
    } finally {
      await migrador.$executeRawUnsafe(`DROP TRIGGER prueba_falla_bitacora_trg ON bitacora`);
      await migrador.$executeRawUnsafe(`DROP FUNCTION prueba_falla_bitacora()`);
    }
    expect(await contar("cotizacion_version", `cotizacion_id = '${id}'`)).toBe(0);
    expect(await contar("idempotencia", `clave = '${clave}'`)).toBe(0);
    const [q] = await migrador.$queryRaw<{ u: number }[]>`SELECT ultima_version AS u FROM cotizacion WHERE id = ${id}::uuid`;
    expect(q!.u).toBe(0);

    // Sin registro de la clave, el reintento con la misma clave crea v1.
    const reintento = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, conClave(clave));
    expect(reintento.status).toBe(201);
    expect(reintento.cuerpo.version.numero).toBe(1);
  });
});
