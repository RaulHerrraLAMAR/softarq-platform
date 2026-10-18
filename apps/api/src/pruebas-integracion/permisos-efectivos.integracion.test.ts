/**
 * Permisos efectivos del rol de la aplicación e impacto sobre versiones (ADR-0017 §1.2 y §1.3), contra
 * softarq_test.
 *
 * - Rechazos con SQL directo (`softarq_app`) y operaciones permitidas por las funciones.
 * - Funciones SECURITY DEFINER: propietario distinto de la aplicación, `search_path` fijo, sin PUBLIC.
 * - Impacto: borrador, versión sin enviar, en revisión, aprobada sin emitir y emitida, sin contar dos
 *   veces la misma cotización y sin modificar nada al consultarlo. Cifra de la fuente: 22,405.28.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaDetalleRevision, type EntradaCalculo } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const SV = ESCENARIOS.find((e) => e.id === "GUIA-R3-SIN-VENTANA")!;
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let org: string;
const cred: Record<string, Credencial> = {};
const entrar = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const DENEGADO = /permission denied|permiso denegado/i;

beforeAll(async () => {
  org = (await cargarDemo(prisma, { codigo: "DEMO-PERM", nombre: "[DEMO] Permisos efectivos" })).organizacionId;
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-PERM", [
      cuenta("prep.perm@softarq.test", "[DEMO] Preparador permisos", "PREPARADOR"),
      cuenta("rev.perm@softarq.test", "[DEMO] Revisora permisos", "REVISOR"),
      cuenta("admin.perm@softarq.test", "[DEMO] Administrador del catálogo permisos", "ADMIN_CATALOGO"),
    ]),
  );
  await cargarEmisorDemo(prisma, org);
  app = await crearAplicacion(
    leerConfiguracion({
      DATABASE_URL: urlDePrueba("DATABASE_URL"),
      API_REGISTRO: "ninguno",
      API_LIMITE_GENERAL_POR_MINUTO: "5000",
      SOFTARQ_DIR_DOCUMENTOS: join(directorioDocumentosPrueba("integracion"), "..", "documentos-permisos"),
    }),
    { reloj: new RelojFijo("2026-10-17") },
  );
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

describe("permisos efectivos de softarq_app (ADR-0017 §1.2)", () => {
  it("sin UPDATE en organización, tipos de costo adicional, parámetros, identidad ni aprobación de conceptos", async () => {
    const [p] = await migrador.$queryRaw<Record<string, boolean>[]>`SELECT
        has_table_privilege('softarq_app', 'public.organizacion', 'UPDATE') org,
        has_any_column_privilege('softarq_app', 'public.organizacion', 'UPDATE') org_col,
        has_any_column_privilege('softarq_app', 'public.tipo_adicional', 'UPDATE') adicional,
        has_column_privilege('softarq_app', 'public.parametros_calculo', 'organizacion_id', 'UPDATE') param_org,
        has_column_privilege('softarq_app', 'public.parametros_calculo', 'ambiente', 'UPDATE') param_ambiente,
        has_any_column_privilege('softarq_app', 'public.usuario', 'UPDATE') usuario_upd,
        has_table_privilege('softarq_app', 'public.usuario', 'INSERT') usuario_ins,
        has_any_column_privilege('softarq_app', 'public.membresia', 'UPDATE') membresia_upd,
        has_table_privilege('softarq_app', 'public.membresia', 'INSERT') membresia_ins,
        has_column_privilege('softarq_app', 'public.concepto', 'estado', 'UPDATE') estado,
        has_column_privilege('softarq_app', 'public.concepto', 'aprobado_por', 'UPDATE') aprobado_por,
        has_column_privilege('softarq_app', 'public.concepto', 'aprobado_en', 'UPDATE') aprobado_en`;
    expect(p).toEqual({
      org: false,
      org_col: false,
      adicional: false,
      param_org: false,
      param_ambiente: false,
      usuario_upd: false,
      usuario_ins: false,
      membresia_upd: false,
      membresia_ins: false,
      estado: false,
      aprobado_por: false,
      aprobado_en: false,
    });
    await expect(prisma.$executeRaw`UPDATE organizacion SET es_demo = false WHERE id = ${org}::uuid`).rejects.toThrow(DENEGADO);
    await expect(prisma.$executeRaw`UPDATE tipo_adicional SET regla = 'MONTO_CAPTURADO' WHERE organizacion_id = ${org}::uuid`).rejects.toThrow(DENEGADO);
    await expect(prisma.$executeRaw`UPDATE parametros_calculo SET ambiente = 'PRODUCCION' WHERE organizacion_id = ${org}::uuid`).rejects.toThrow(DENEGADO);
    await expect(prisma.$executeRaw`UPDATE membresia SET funciones = ARRAY['ADMIN_SISTEMA']::varchar[] WHERE organizacion_id = ${org}::uuid`).rejects.toThrow(DENEGADO);
    await expect(prisma.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = NULL`).rejects.toThrow(DENEGADO);
    // Módulo 13: los parámetros solo admiten UPDATE de las columnas editables (lo usa softarq_editar_parametros).
    const [c] = await migrador.$queryRaw<Record<string, boolean>[]>`SELECT
        has_column_privilege('softarq_app', 'public.parametros_calculo', 'texto_alcance', 'UPDATE') texto,
        has_column_privilege('softarq_app', 'public.parametros_calculo', 'moneda', 'UPDATE') moneda,
        has_column_privilege('softarq_app', 'public.parametros_calculo', 'revision', 'UPDATE') revision`;
    expect(c).toEqual({ texto: true, moneda: false, revision: true });
  });

  it("las funciones de aprobación y de identidad son SECURITY DEFINER del migrador, con search_path fijo y sin PUBLIC", async () => {
    const filas = await migrador.$queryRaw<{ nombre: string; definer: boolean; propietario: string; config: string[] | null; publico: boolean; app: boolean }[]>`
      SELECT p.proname AS nombre, p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS propietario, p.proconfig AS config,
             has_function_privilege('public', p.oid, 'EXECUTE') AS publico, has_function_privilege('softarq_app', p.oid, 'EXECUTE') AS app
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('softarq_aprobar_concepto', 'softarq_aprobar_carga_base', 'softarq_crear_persona',
             'softarq_editar_persona', 'softarq_restablecer_contrasena', 'softarq_cambiar_contrasena_propia') ORDER BY 1`;
    expect(filas.map((f) => f.nombre)).toEqual([
      "softarq_aprobar_carga_base",
      "softarq_aprobar_concepto",
      "softarq_cambiar_contrasena_propia",
      "softarq_crear_persona",
      "softarq_editar_persona",
      "softarq_restablecer_contrasena",
    ]);
    for (const f of filas) {
      expect(f, f.nombre).toMatchObject({ definer: true, publico: false, app: true });
      expect(f.propietario).not.toBe("softarq_app");
      expect(f.config?.join(",")).toMatch(/search_path=public, ?pg_temp/);
    }
  });

  it("la aprobación de la carga base solo vale para conceptos que la carga acaba de crear en una organización DEMO", async () => {
    // Permitida: una organización nueva recibe sus conceptos aprobados por la carga.
    const nueva = (await cargarDemo(prisma, { codigo: `DEMO-PERM-${randomUUID().slice(0, 4).toUpperCase()}`, nombre: "[DEMO] Carga base" })).organizacionId;
    const estados = await prisma.concepto.findMany({ where: { organizacionId: nueva }, select: { estado: true, aprobadoPor: true } });
    expect(estados.every((e) => e.estado === "Aprobado" && e.aprobadoPor === null)).toBe(true);
    // Rechazada: un concepto existente (devuelto a Borrador por el migrador) no se reaprueba fuera de su alta.
    const ctx = { organizacionId: org };
    await migrador.$executeRaw`UPDATE concepto SET estado = 'Borrador' WHERE organizacion_id = ${org}::uuid AND codigo = 'CON-00002'`;
    try {
      await expect(prisma.$queryRaw`SELECT softarq_aprobar_carga_base(${ctx.organizacionId}::uuid, 'CON-00002')::text`).rejects.toThrow(/APROBACION_DIRECTA/);
      const otra = await migrador.organizacion.findFirstOrThrow({ where: { esDemo: false }, select: { id: true } }).catch(() => null);
      if (otra) await expect(prisma.$queryRaw`SELECT softarq_aprobar_carga_base(${otra.id}::uuid, 'CON-00001')::text`).rejects.toThrow(/APROBACION_DIRECTA|NO_ENCONTRADO/);
    } finally {
      await migrador.$executeRaw`UPDATE concepto SET estado = 'Aprobado', aprobado_en = now() WHERE organizacion_id = ${org}::uuid AND codigo = 'CON-00002'`;
    }
  });
});

describe("impacto sobre borradores y versiones (ADR-0017 §1.3)", () => {
  it("distingue borrador, sin enviar, en revisión, aprobada sin emitir y emitida, sin contar dos veces y sin modificar nada", async () => {
    const p = await entrar("prep.perm@softarq.test");
    const r = await entrar("rev.perm@softarq.test");
    const a = await entrar("admin.perm@softarq.test");
    const captura = borradorDesdeEntrada(SV.entrada as EntradaCalculo);
    const nueva = async () => {
      const s = randomUUID().slice(0, 6);
      const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente impacto ${s}`, contactoNombre: "Contacto", contactoTelefono: "55 1234 5678", contactoCorreo: "c@ejemplo.invalid" }, idem());
      const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra impacto ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Muro." }, idem());
      const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
      expect(cot.status, cot.texto).toBe(201);
      return cot.cuerpo.cotizacion.id as string;
    };
    const version = async (id: string) => {
      const v = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
      expect(v.status, v.texto).toBe(201);
      expect(v.cuerpo.cotizacion.total).toBe("22405.28");
    };
    const enviar = async (id: string) => {
      const e = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem());
      expect(e.status, e.texto).toBe(201);
      return EsquemaDetalleRevision.parse((await r.get(`/api/v1/revisiones/${e.cuerpo.revision.id}`)).cuerpo);
    };
    const aprobar = async (id: string) => {
      const d = await enviar(id);
      const ap = await r.post(`/api/v1/revisiones/${d.revision.id}/decision`, { decision: "APROBAR", versionId: d.revision.version.id, revision: d.revision.revision }, idem());
      expect(ap.status, ap.texto).toBe(200);
      return d;
    };
    const antes = await a.get("/api/v1/admin/conceptos/CON-00009");
    const base = antes.cuerpo.impacto;
    await nueva(); // solo borrador
    const b = await nueva();
    await version(b); // sin enviar
    const c = await nueva();
    await version(c);
    await enviar(c); // en revisión
    const d = await nueva();
    await version(d);
    await aprobar(d); // aprobada sin emitir
    const e = await nueva();
    await version(e);
    const de = await aprobar(e);
    const emi = await p.post(`/api/v1/cotizaciones/${e}/versiones/1/emision`, { versionId: de.revision.version.id, revisionId: de.revision.id }, idem());
    expect(emi.status, emi.texto).toBe(201); // emitida: su versión no cuenta

    const huella = async () =>
      (await migrador.$queryRaw<{ f: string }[]>`SELECT json_build_array(
          (SELECT json_agg(json_build_array(id, estado_folio, ultima_version) ORDER BY id) FROM cotizacion WHERE organizacion_id = ${org}::uuid),
          (SELECT json_agg(json_build_array(id, estado, revision) ORDER BY id) FROM revision WHERE organizacion_id = ${org}::uuid),
          (SELECT json_agg(json_build_array(codigo, estado, revision_tecnica) ORDER BY codigo) FROM concepto WHERE organizacion_id = ${org}::uuid))::text AS f`)[0]!.f;
    const h0 = await huella();
    const despues = await a.get("/api/v1/admin/conceptos/CON-00009");
    expect(despues.status, despues.texto).toBe(200);
    expect(despues.cuerpo.impacto).toEqual({
      cotizaciones: base.cotizaciones + 5,
      borradores: base.borradores + 5,
      sinEnviar: base.sinEnviar + 1,
      enRevision: base.enRevision + 1,
      aprobadasSinEmitir: base.aprobadasSinEmitir + 1,
    });
    // El mismo criterio para un precio elegido y para el insumo (por su instantánea).
    const precio = await a.get("/api/v1/admin/precios/PRE-000016");
    expect(precio.cuerpo.impacto.versiones).toMatchObject({ sinEnviar: base.sinEnviar + 1, enRevision: base.enRevision + 1, aprobadasSinEmitir: base.aprobadasSinEmitir + 1 });
    const insumo = await a.get("/api/v1/admin/insumos/INS-00010");
    expect(insumo.cuerpo.impacto).toMatchObject({ sinEnviar: base.sinEnviar + 1, enRevision: base.enRevision + 1, aprobadasSinEmitir: base.aprobadasSinEmitir + 1 });
    // Consultar no cambia estados ni aprobaciones.
    expect(await huella()).toBe(h0);
    // Otras funciones no ven el detalle de impacto.
    expect((await p.get("/api/v1/admin/conceptos/CON-00009")).status).toBe(403);
  });
});
