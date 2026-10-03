/**
 * Revisión y aprobación de versiones (módulo 7, ADR-0009), por HTTP con sesiones reales contra
 * softarq_test: recorrido completo, envíos rechazados, BL-17 por identidad (también si el autor
 * obtiene después la función Revisor), funciones incorrectas, aislamiento, transiciones fuera de
 * orden, verificación vigente sin modificar la versión, aprobación de v1 sin efecto sobre v2,
 * historial estable tras cambiar catálogos, inmutabilidad en la base, sesión y CSRF.
 * La concurrencia y la idempotencia están en concurrencia-revisiones.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaDetalleCotizacion, EsquemaDetalleRevision, EsquemaRespuestaRevisiones, type DetalleRevision } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { PRECIOS_DEMO, TARIFAS_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;

const prisma = prismaApp();
const repo = new RepositorioCatalogos(prisma);
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let orgC: ContextoOrganizacion;
const cred: Record<string, Credencial> = {};
const apps: INestApplication[] = [];

const entrar = (correo: string, base = url) => new ClienteHttp(base).entrar(cred[correo]!);
const preparador = (base?: string) => entrar("prep.rev@softarq.test", base);
const preparador2 = () => entrar("prep2.rev@softarq.test");
const revisor = (base?: string) => entrar("rev.rev@softarq.test", base);
const revisor2 = () => entrar("rev2.rev@softarq.test");
const revisorOtraOrg = () => entrar("rev.revb@softarq.test");
const preparadorC = () => entrar("prep.revc@softarq.test");
const revisorC = (base?: string) => entrar("rev.revc@softarq.test", base);

const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });

/** Ninguna respuesta contiene costos internos, proveedores de compra, precios de compra ni tarifas. */
const CLAVES_INTERNAS =
  /^(costo|consumo|margen|recargo|rendimiento|desperdicio|sobrante|tarifa|excepcion|contenido|compras?$|proveedor|precioId|productoId|entrada|resultadoInterno|huellaReferencia|tokenHash|hash|contrasena|autorId|preparadorId)/i;
function clavesDe(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => clavesDe(x, acc));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (acc.push(k), clavesDe(v, acc));
  return acc;
}
function valoresDe(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => valoresDe(x, acc));
  else if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => (k === "captura" ? null : valoresDe(v, acc)));
  else acc.push(String(o));
  return acc;
}
function sinDatosInternos(cuerpo: unknown): void {
  expect(clavesDe(cuerpo).filter((k) => CLAVES_INTERNAS.test(k))).toEqual([]);
  const valores = valoresDe(cuerpo);
  for (const p of [...PRECIOS_DEMO.map((x) => x.precioUnitario), ...TARIFAS_DEMO.map((t) => t.importe)]) {
    expect(valores, `valor interno ${p}`).not.toContain(p);
  }
}

/** Cliente, proyecto, cotización con la captura del Ejemplo 1 y v1 calculada. */
async function cotizacionConV1(c: ClienteHttp, sufijo: string) {
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente ${sufijo}` }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${sufijo}` }, idem());
  expect(pry.status, pry.texto).toBe(201);
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(R1.entrada) }, idem());
  expect(cot.status, cot.texto).toBe(201);
  const id = cot.cuerpo.cotizacion.id as string;
  const v1 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
  expect(v1.status, v1.texto).toBe(201);
  return { id, cliente: cli.cuerpo, proyecto: pry.cuerpo, folio: cot.cuerpo.cotizacion.folio as string };
}

const enviar = (c: ClienteHttp, id: string, numero: number, revisionBorrador: number, o = idem()) =>
  c.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/revisiones`, { revisionBorrador }, o);

const decidir = (c: ClienteHttp, r: DetalleRevision, decision: "APROBAR" | "SOLICITAR_CAMBIOS", observaciones?: string, o = idem()) =>
  c.post(
    `/api/v1/revisiones/${r.revision.id}/decision`,
    { decision, versionId: r.revision.version.id, revision: r.revision.revision, ...(observaciones ? { observaciones } : {}) },
    o,
  );

const detalleCot = async (c: ClienteHttp, id: string) => EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);

const filaVersion = (cotizacionId: string, numero: number) =>
  migrador.$queryRaw<Record<string, unknown>[]>`
    SELECT to_jsonb(v) AS fila FROM cotizacion_version v WHERE cotizacion_id = ${cotizacionId}::uuid AND numero = ${numero}`;

const contarEventos = async (revisionId: string) =>
  Number((await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM revision_evento WHERE revision_id = ${revisionId}::uuid`)[0]!.n);

async function appConFecha(fecha: string): Promise<string> {
  const a = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }), {
    reloj: new RelojFijo(fecha),
  });
  await a.listen(0, "127.0.0.1");
  apps.push(a);
  return (await a.getUrl()).replace("[::1]", "127.0.0.1");
}

beforeAll(async () => {
  await cargarDemo(prisma, { codigo: "DEMO-REV", nombre: "[DEMO] Revisiones" });
  await cargarDemo(prisma, { codigo: "DEMO-REV-B", nombre: "[DEMO] Revisiones B" });
  orgC = { organizacionId: (await cargarDemo(prisma, { codigo: "DEMO-REV-C", nombre: "[DEMO] Revisiones catálogo" })).organizacionId };
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-REV", [
      cuenta("prep.rev@softarq.test", "[DEMO] Preparador Rev", "PREPARADOR"),
      cuenta("prep2.rev@softarq.test", "[DEMO] Preparador Rev 2", "PREPARADOR"),
      cuenta("rev.rev@softarq.test", "[DEMO] Revisor Rev", "REVISOR"),
      cuenta("rev2.rev@softarq.test", "[DEMO] Revisor Rev 2", "REVISOR"),
    ]),
    await crearCuentas(migrador, "DEMO-REV-B", [cuenta("rev.revb@softarq.test", "[DEMO] Revisor B", "REVISOR")]),
    await crearCuentas(migrador, "DEMO-REV-C", [
      cuenta("prep.revc@softarq.test", "[DEMO] Preparador C", "PREPARADOR"),
      cuenta("rev.revc@softarq.test", "[DEMO] Revisor C", "REVISOR"),
    ]),
  );
  app = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }), {
    reloj: new RelojFijo(FECHA),
  });
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

afterAll(async () => {
  for (const a of apps) await a.close();
  await app.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

describe("recorrido: enviar → solicitar cambios → corregir → v2 → enviar → aprobar por otra persona", () => {
  it("cada paso queda registrado con responsables; las versiones no cambian; v1 conserva su historial", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id, folio } = await cotizacionConV1(p, "Recorrido");
    const filaV1 = await filaVersion(id, 1);

    // Enviar v1.
    const env = await enviar(p, id, 1, 0);
    expect(env.status, env.texto).toBe(201);
    const rev1 = EsquemaDetalleRevision.parse(env.cuerpo);
    expect(rev1.revision).toMatchObject({
      estado: "PENDIENTE",
      revision: 0,
      folio,
      version: { numero: 1, idVersion: `${folio}-v1`, total: R1.esperado.total },
      preparador: "[DEMO] Preparador Rev",
      enviadoPor: "[DEMO] Preparador Rev",
      acciones: { aprobar: false, solicitarCambios: false, retirar: true, motivoNoAprobar: null },
    });
    expect(rev1.verificacion).toMatchObject({ fechaReferencia: FECHA, bloqueos: [] });
    expect(rev1.eventos).toEqual([expect.objectContaining({ secuencia: 1, tipo: "ENVIADA", estadoNuevo: "PENDIENTE", usuario: "[DEMO] Preparador Rev" })]);

    // Con la revisión pendiente el borrador no se edita ni se calcula (BL-19).
    const det = await detalleCot(p, id);
    expect(det.versiones[0]).toMatchObject({ numero: 1, estado: "EN_REVISION", esUltima: true });
    const guardar = await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: det.borrador.captura });
    expect(guardar.status).toBe(409);
    expect(guardar.cuerpo.error.codigo).toBe("REVISION_PENDIENTE");
    const calcular = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(calcular.status).toBe(409);
    expect(calcular.cuerpo.error.codigo).toBe("REVISION_PENDIENTE");

    // Bandeja del revisor y detalle para decidir: solo la vista comercial.
    const bandeja = EsquemaRespuestaRevisiones.parse((await r.get("/api/v1/revisiones")).cuerpo);
    const enBandeja = bandeja.revisiones.find((x) => x.id === rev1.revision.id)!;
    expect(enBandeja.acciones).toMatchObject({ aprobar: true, solicitarCambios: true, retirar: false });
    const abierta = await r.get(`/api/v1/revisiones/${rev1.revision.id}`);
    expect(abierta.status).toBe(200);
    sinDatosInternos(abierta.cuerpo);
    expect(abierta.cuerpo.version.cotizacion.total).toBe(R1.esperado.total);

    // Solicitar cambios exige una explicación útil.
    const corta = await decidir(r, rev1, "SOLICITAR_CAMBIOS", "corrija");
    expect(corta.status).toBe(400);
    const sinTexto = await decidir(r, rev1, "SOLICITAR_CAMBIOS");
    expect(sinTexto.status).toBe(400);
    const cambios = await decidir(r, rev1, "SOLICITAR_CAMBIOS", "Faltan piezas en el faldón norte; revise las medidas.");
    expect(cambios.status, cambios.texto).toBe(200);
    expect(cambios.cuerpo.revision).toMatchObject({
      estado: "CAMBIOS_SOLICITADOS",
      revision: 1,
      resueltaPor: "[DEMO] Revisor Rev",
      observaciones: "Faltan piezas en el faldón norte; revise las medidas.",
    });

    // El preparador ve la decisión; v1 vuelve a Borrador con observaciones y puede corregir.
    const tras = await detalleCot(p, id);
    expect(tras.versiones[0]).toMatchObject({
      estado: "BORRADOR",
      revisionVigente: { estado: "CAMBIOS_SOLICITADOS", resueltaPor: "[DEMO] Revisor Rev" },
    });
    const editada = structuredClone(tras.borrador.captura);
    (editada.partidas[0] as { mediciones: { piezas: string | null }[] }).mediciones[0]!.piezas = "2";
    expect((await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: editada })).status).toBe(200);
    const v2 = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1, motivo: "Corrige piezas" }, idem());
    expect(v2.status, v2.texto).toBe(201);

    // v1 ya no es la última: no se puede enviar. v2 sí.
    const vieja = await enviar(p, id, 1, 1);
    expect(vieja.status).toBe(409);
    expect(vieja.cuerpo.error.codigo).toBe("VERSION_NO_VIGENTE");
    const env2 = await enviar(p, id, 2, 1);
    expect(env2.status, env2.texto).toBe(201);
    const rev2 = EsquemaDetalleRevision.parse(env2.cuerpo);

    // Aprueba OTRA persona.
    const aprobada = await decidir(await revisor2(), rev2, "APROBAR");
    expect(aprobada.status, aprobada.texto).toBe(200);
    expect(aprobada.cuerpo.revision).toMatchObject({ estado: "APROBADA", resueltaPor: "[DEMO] Revisor Rev 2", version: { numero: 2 } });
    expect(aprobada.cuerpo.eventos.map((e: { tipo: string }) => e.tipo)).toEqual(["ENVIADA", "APROBADA"]);

    const final = await detalleCot(p, id);
    expect(final.versiones.map((v) => [v.numero, v.estado])).toEqual([
      [2, "APROBADA"],
      [1, "BORRADOR"],
    ]);
    expect(final.revisiones.map((h) => [h.versionNumero, h.estado])).toEqual([
      [2, "APROBADA"],
      [1, "CAMBIOS_SOLICITADOS"],
    ]);
    expect(final.eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(["REVISION_ENVIADA", "CAMBIOS_SOLICITADOS", "VERSION_APROBADA"]));
    // La versión revisada y su total no cambiaron (fila idéntica).
    expect(await filaVersion(id, 1)).toEqual(filaV1);
    // Aprobar no habilita una segunda aprobación ni un nuevo envío de esa versión (BL-19).
    const otra = await enviar(p, id, 2, 1);
    expect(otra.status).toBe(422);
    expect(otra.cuerpo.error.codigo).toBe("ENVIO_BLOQUEADO");
    expect(otra.cuerpo.error.problemas[0].codigo).toBe("BL-19");
  });
});

describe("qué versión se puede enviar", () => {
  it("rechaza enviar si el borrador cambió después de calcular, o si la revisión del borrador vista es otra", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Pendiente de calcular");
    const det = await detalleCot(p, id);
    // El cliente dice haber visto otra revisión del borrador.
    const otraVista = await enviar(p, id, 1, 7);
    expect(otraVista.status).toBe(409);
    expect(otraVista.cuerpo.error.codigo).toBe("BORRADOR_DESACTUALIZADO");
    // Cambio guardado y no calculado: v1 ya no representa la captura.
    expect((await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: { ...det.borrador.captura, consolidarCompras: false } })).status).toBe(200);
    const r = await enviar(p, id, 1, 1);
    expect(r.status).toBe(409);
    expect(r.cuerpo.error.codigo).toBe("BORRADOR_DESACTUALIZADO");
    expect(r.cuerpo.error.mensaje).toMatch(/Calcule una versión nueva/);
    expect(Number((await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM revision WHERE cotizacion_id = ${id}::uuid`)[0]!.n)).toBe(0);
  });

  it("solo una revisión pendiente por cotización; retirar permite corregir y volver a enviar la misma versión", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Retirar");
    const e1 = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    const repetido = await enviar(p, id, 1, 0);
    expect(repetido.status).toBe(409);
    expect(repetido.cuerpo.error.codigo).toBe("REVISION_PENDIENTE");
    const ret = await p.post(`/api/v1/revisiones/${e1.revision.id}/retiro`, { revision: 0, motivo: "Ajustar medidas" }, idem());
    expect(ret.status, ret.texto).toBe(200);
    expect(ret.cuerpo.revision).toMatchObject({ estado: "RETIRADA", resueltaPor: "[DEMO] Preparador Rev", observaciones: "Ajustar medidas" });
    // Retirada → la versión vuelve a Borrador; se puede volver a enviar (otra revisión).
    const e2 = await enviar(p, id, 1, 0);
    expect(e2.status, e2.texto).toBe(201);
    expect(e2.cuerpo.revision.id).not.toBe(e1.revision.id);
    const historial = (await detalleCot(p, id)).revisiones;
    expect(historial.map((h) => h.estado)).toEqual(["PENDIENTE", "RETIRADA"]);
  });
});

describe("BL-17: la aprobación es de una persona distinta del autor de la versión", () => {
  it("el autor no aprueba su trabajo aunque después obtenga la función de Revisor; otra persona sí", async () => {
    const p2 = await preparador2();
    const { id } = await cotizacionConV1(p2, "BL17");
    const env = EsquemaDetalleRevision.parse((await enviar(p2, id, 1, 0)).cuerpo);

    // El autor recibe la función Revisor (cambio administrativo con el rol migrador) y vuelve a entrar.
    await migrador.$executeRaw`
      UPDATE membresia SET funciones = ARRAY['PREPARADOR','REVISOR']::VARCHAR(20)[]
       WHERE usuario_id = (SELECT id FROM usuario WHERE correo = 'prep2.rev@softarq.test')`;
    try {
      const autorRevisor = await preparador2();
      const vista = EsquemaDetalleRevision.parse((await autorRevisor.get(`/api/v1/revisiones/${env.revision.id}`)).cuerpo);
      expect(vista.revision.acciones).toMatchObject({ aprobar: false, solicitarCambios: true, motivoNoAprobar: expect.stringMatching(/^BL-17/) });
      const intento = await decidir(autorRevisor, vista, "APROBAR");
      expect(intento.status).toBe(422);
      expect(intento.cuerpo.error.codigo).toBe("DECISION_BLOQUEADA");
      expect(intento.cuerpo.error.problemas[0].codigo).toBe("BL-17");

      // Aunque se salte la API, la función de la base lo impide (identidad del autor).
      const usuarioAutor = (await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM usuario WHERE correo = 'prep2.rev@softarq.test'`)[0]!.id;
      const org = (await migrador.$queryRaw<{ o: string }[]>`SELECT organizacion_id::text AS o FROM revision WHERE id = ${env.revision.id}::uuid`)[0]!.o;
      await expect(
        prisma.$queryRaw`SELECT softarq_decidir_revision(
          ${org}::uuid,
          ${usuarioAutor}::uuid, ${env.revision.id}::uuid, ${env.revision.version.id}::uuid, 0, 'APROBAR', NULL, '[]'::jsonb,
          ${randomUUID()}::uuid, 'decidir_revision', ${Buffer.alloc(32)}, now() + interval '1 day')`,
      ).rejects.toThrow(/AUTOAPROBACION/);
      // Y el CHECK de la tabla, incluso para el propietario.
      await expect(
        migrador.$executeRaw`UPDATE revision SET estado = 'APROBADA', revision = revision + 1, resuelta_por = preparador_id, resuelta_en = now()
                              WHERE id = ${env.revision.id}::uuid`,
      ).rejects.toThrow(/revision_bl17_ck/);
    } finally {
      await migrador.$executeRaw`
        UPDATE membresia SET funciones = ARRAY['PREPARADOR']::VARCHAR(20)[]
         WHERE usuario_id = (SELECT id FROM usuario WHERE correo = 'prep2.rev@softarq.test')`;
    }

    const ok = await decidir(await revisor(), env, "APROBAR");
    expect(ok.status, ok.texto).toBe(200);
    expect(ok.cuerpo.revision.estado).toBe("APROBADA");
  });
});

describe("funciones, aislamiento y orden de las transiciones", () => {
  it("rol incorrecto: el Revisor no envía ni retira; el Preparador no decide (403 SIN_PERMISO)", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id } = await cotizacionConV1(p, "Roles");
    const noEnvia = await enviar(r, id, 1, 0);
    expect(noEnvia.status).toBe(403);
    expect(noEnvia.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    expect((await r.post(`/api/v1/revisiones/${env.revision.id}/retiro`, { revision: 0 }, idem())).status).toBe(403);
    const noDecide = await decidir(p, env, "APROBAR");
    expect(noDecide.status).toBe(403);
    expect(noDecide.cuerpo.error.codigo).toBe("SIN_PERMISO");
    expect(await contarEventos(env.revision.id)).toBe(1);
  });

  it("otra organización: 404 en consulta y decisión, y no aparece en su bandeja; el cuerpo no admite identidad", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Aislamiento");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    const b = await revisorOtraOrg();
    expect((await b.get(`/api/v1/revisiones/${env.revision.id}`)).status).toBe(404);
    expect((await decidir(b, env, "APROBAR")).status).toBe(404);
    expect((await b.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: 0 }, idem())).status).toBe(403);
    const bandeja = EsquemaRespuestaRevisiones.parse((await b.get("/api/v1/revisiones")).cuerpo);
    expect(bandeja.revisiones.map((x) => x.id)).not.toContain(env.revision.id);
    // Campos de identidad en el cuerpo: 400 (objetos estrictos).
    const r = await revisor();
    for (const extra of [{ revisorId: randomUUID() }, { preparadorId: randomUUID() }, { organizacionId: randomUUID() }]) {
      const x = await r.post(
        `/api/v1/revisiones/${env.revision.id}/decision`,
        { decision: "APROBAR", versionId: env.revision.version.id, revision: 0, ...extra },
        idem(),
      );
      expect(x.status).toBe(400);
    }
  });

  it("transiciones fuera de orden: decidir una retirada o aprobada y retirar una aprobada → 409 sin eventos", async () => {
    const p = await preparador();
    const r = await revisor();
    const { id } = await cotizacionConV1(p, "Orden");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    expect((await p.post(`/api/v1/revisiones/${env.revision.id}/retiro`, { revision: 0 }, idem())).status).toBe(200);
    const sobreRetirada = await decidir(r, env, "APROBAR");
    expect(sobreRetirada.status).toBe(409);
    expect(sobreRetirada.cuerpo.error.codigo).toBe("CONFLICTO_REVISION");
    expect(sobreRetirada.cuerpo.error.revisionVigente).toMatchObject({ estado: "RETIRADA", revision: 1 });
    // Aunque use la ficha vigente, una retirada es terminal.
    const conFicha = await r.post(
      `/api/v1/revisiones/${env.revision.id}/decision`,
      { decision: "APROBAR", versionId: env.revision.version.id, revision: 1 },
      idem(),
    );
    expect(conFicha.status).toBe(409);

    const env2 = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    expect((await decidir(r, env2, "APROBAR")).status).toBe(200);
    expect((await p.post(`/api/v1/revisiones/${env2.revision.id}/retiro`, { revision: 1 }, idem())).status).toBe(409);
    expect((await decidir(r, { ...env2, revision: { ...env2.revision, revision: 1 } }, "SOLICITAR_CAMBIOS", "Otra observación tardía.")).status).toBe(409);
    expect(await contarEventos(env.revision.id)).toBe(2);
    expect(await contarEventos(env2.revision.id)).toBe(2);
  });

  it("decidir con otra versión que la de la revisión → 409", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Otra versión");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    const x = await (await revisor()).post(
      `/api/v1/revisiones/${env.revision.id}/decision`,
      { decision: "APROBAR", versionId: randomUUID(), revision: 0 },
      idem(),
    );
    expect(x.status).toBe(409);
    expect(x.cuerpo.error.codigo).toBe("CONFLICTO_REVISION");
  });
});

describe("versiones, catálogos e historial", () => {
  it("aprobar v1 no aprueba v2: v2 nace en Borrador con su propio estado; v1 conserva su aprobación", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "V1 no V2");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    expect((await decidir(await revisor(), env, "APROBAR")).status).toBe(200);
    const det = await detalleCot(p, id);
    const editada = structuredClone(det.borrador.captura);
    editada.consolidarCompras = false;
    expect((await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: editada })).status).toBe(200);
    expect((await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem())).status).toBe(201);
    const tras = await detalleCot(p, id);
    expect(tras.versiones.map((v) => [v.numero, v.estado, v.esUltima, v.revisionVigente?.estado ?? null])).toEqual([
      [2, "BORRADOR", true, null],
      [1, "APROBADA", false, "APROBADA"],
    ]);
  });

  it("cambios de catálogo antes de aprobar bloquean (sin cambiar la versión); después de aprobar no alteran nada", async () => {
    const p = await preparadorC();
    const r = await revisorC();
    // Antes de aprobar: el precio elegido se anula → la verificación lo detecta y no se aprueba.
    const a = await cotizacionConV1(p, "Catálogo antes");
    const envA = EsquemaDetalleRevision.parse((await enviar(p, a.id, 1, 0)).cuerpo);
    const filaA = await filaVersion(a.id, 1);
    // Después de aprobar: se aprueba otra antes del cambio.
    const b = await cotizacionConV1(p, "Catálogo después");
    const envB = EsquemaDetalleRevision.parse((await enviar(p, b.id, 1, 0)).cuerpo);
    const aprobadaB = await decidir(r, envB, "APROBAR");
    expect(aprobadaB.status).toBe(200);
    const filaB = await filaVersion(b.id, 1);
    const revisionB = (await r.get(`/api/v1/revisiones/${envB.revision.id}`)).cuerpo;

    await repo.anularPrecio(orgC, R1.entrada.selecciones[0]!.precioId);
    const vista = EsquemaDetalleRevision.parse((await r.get(`/api/v1/revisiones/${envA.revision.id}`)).cuerpo);
    expect(vista.verificacion!.bloqueos.map((x) => x.codigo)).toContain("BL-08");
    expect(vista.version.cotizacion.total).toBe(R1.esperado.total);
    const bloqueada = await decidir(r, vista, "APROBAR");
    expect(bloqueada.status).toBe(422);
    expect(bloqueada.cuerpo.error.codigo).toBe("APROBACION_BLOQUEADA");
    expect(JSON.stringify(bloqueada.cuerpo)).not.toMatch(/"total"|subtotal/);
    expect((await r.get(`/api/v1/revisiones/${envA.revision.id}`)).cuerpo.revision.estado).toBe("PENDIENTE");
    expect((await detalleCot(p, a.id)).eventos[0]).toMatchObject({ tipo: "APROBACION_BLOQUEADA" });
    expect(await filaVersion(a.id, 1)).toEqual(filaA);
    // La solicitud de cambios sigue posible (la corrección es una versión nueva).
    expect((await decidir(r, vista, "SOLICITAR_CAMBIOS", "El precio de la lámina se anuló; elija otro.")).status).toBe(200);

    // La aprobada no cambia: misma respuesta (salvo la verificación, que ya no aplica) y misma fila.
    const despues = (await r.get(`/api/v1/revisiones/${envB.revision.id}`)).cuerpo;
    expect(despues).toEqual(revisionB);
    expect(despues.verificacion).toBeNull();
    expect(await filaVersion(b.id, 1)).toEqual(filaB);
  });

  it("verificación con la fecha de hoy: AV-02 cerca del vencimiento (se aprueba y queda registrado); BL-09 y BL-10 vencidos bloquean", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Vigencias");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);

    // 2027-10-15: precios (hasta 2027-09-30) y tarifa vencidos → bloquea, sin modificar la versión.
    const tarde = await appConFecha("2027-10-15");
    const vistaTarde = EsquemaDetalleRevision.parse((await (await revisor(tarde)).get(`/api/v1/revisiones/${env.revision.id}`)).cuerpo);
    const codigosTarde = vistaTarde.verificacion!.bloqueos.map((x) => x.codigo);
    expect(codigosTarde).toEqual(expect.arrayContaining(["BL-09", "BL-10"]));
    expect(vistaTarde.verificacion!.fechaReferencia).toBe("2027-10-15");
    expect((await decidir(await revisor(tarde), vistaTarde, "APROBAR")).status).toBe(422);

    // 2027-09-20: vigentes, pero vencen antes del fin de la vigencia comercial (15 días) → AV-02.
    const cerca = await appConFecha("2027-09-20");
    const r = await revisor(cerca);
    const vista = EsquemaDetalleRevision.parse((await r.get(`/api/v1/revisiones/${env.revision.id}`)).cuerpo);
    expect(vista.verificacion!.bloqueos).toEqual([]);
    expect(vista.verificacion!.avisos.map((a) => a.codigo)).toContain("AV-02");
    const ok = await decidir(r, vista, "APROBAR");
    expect(ok.status, ok.texto).toBe(200);
    // El aviso queda registrado en el evento, sin marcarse como atendido.
    expect(ok.cuerpo.eventos.at(-1)).toMatchObject({ tipo: "APROBADA", avisos: expect.arrayContaining(["AV-02"]) });
  });
});

describe("inmutabilidad y permisos de la base", () => {
  it("softarq_app no borra ni altera eventos ni datos de la revisión; el propietario tampoco", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Inmutable");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    expect((await decidir(await revisor(), env, "APROBAR")).status).toBe(200);
    const rid = env.revision.id;

    await expect(prisma.$executeRaw`UPDATE revision_evento SET observaciones = 'x' WHERE revision_id = ${rid}::uuid`).rejects.toThrow(/permission denied|42501/);
    await expect(prisma.$executeRaw`DELETE FROM revision_evento WHERE revision_id = ${rid}::uuid`).rejects.toThrow(/permission denied|42501/);
    await expect(prisma.$executeRaw`DELETE FROM revision WHERE id = ${rid}::uuid`).rejects.toThrow(/permission denied|42501/);
    await expect(prisma.$executeRaw`UPDATE revision SET total = 1 WHERE id = ${rid}::uuid`).rejects.toThrow(/permission denied|42501/);
    // Columnas que la aplicación sí puede actualizar: el trigger impide reabrir una revisión terminada.
    await expect(prisma.$executeRaw`UPDATE revision SET estado = 'PENDIENTE', revision = revision + 1 WHERE id = ${rid}::uuid`).rejects.toThrow(
      /REVISION_CERRADA/,
    );
    // Propietario (migrador): triggers.
    await expect(migrador.$executeRaw`UPDATE revision_evento SET observaciones = 'x' WHERE revision_id = ${rid}::uuid`).rejects.toThrow(/EVENTO_INMUTABLE/);
    await expect(migrador.$executeRaw`DELETE FROM revision_evento WHERE revision_id = ${rid}::uuid`).rejects.toThrow(/EVENTO_INMUTABLE/);
    await expect(migrador.$executeRaw`DELETE FROM revision WHERE id = ${rid}::uuid`).rejects.toThrow(/REVISION_INMUTABLE/);
    await expect(migrador.$executeRaw`UPDATE cotizacion_version SET total = 1 WHERE cotizacion_id = ${id}::uuid`).rejects.toThrow(/VERSION_INMUTABLE/);
    expect(await contarEventos(rid)).toBe(2);
  });

  it("dos revisiones pendientes de la misma cotización son imposibles también en la base (índice parcial)", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Índice");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    await expect(
      migrador.$executeRaw`INSERT INTO revision (organizacion_id, cotizacion_id, folio, version_id, version_numero, total, preparador_id, estado, enviado_por)
                           SELECT organizacion_id, cotizacion_id, folio, version_id, version_numero, total, preparador_id, 'PENDIENTE', enviado_por
                             FROM revision WHERE id = ${env.revision.id}::uuid`,
    ).rejects.toThrow(/revision_pendiente_unica/);
  });
});

describe("sesión y CSRF", () => {
  it("sesión vencida → 401; CSRF inválido u origen ajeno → 403; nada se registra", async () => {
    const p = await preparador();
    const { id } = await cotizacionConV1(p, "Sesión");
    const env = EsquemaDetalleRevision.parse((await enviar(p, id, 1, 0)).cuerpo);
    const r = await revisor();
    const malCsrf = await r.post(
      `/api/v1/revisiones/${env.revision.id}/decision`,
      { decision: "APROBAR", versionId: env.revision.version.id, revision: 0 },
      { ...idem(), csrf: `${r.csrf!.startsWith("A") ? "B" : "A"}${r.csrf!.slice(1)}` },
    );
    expect(malCsrf.status).toBe(403);
    expect(malCsrf.cuerpo.error.codigo).toBe("CSRF_NO_VALIDO");
    const otroOrigen = await r.post(
      `/api/v1/revisiones/${env.revision.id}/decision`,
      { decision: "APROBAR", versionId: env.revision.version.id, revision: 0 },
      { ...idem(), origen: "http://evil.example" },
    );
    expect(otroOrigen.status).toBe(403);
    await migrador.$executeRaw`
      UPDATE sesion SET revocada_en = now(), motivo_revocacion = 'RESTABLECIMIENTO'
       WHERE revocada_en IS NULL AND usuario_id = (SELECT id FROM usuario WHERE correo = 'rev.rev@softarq.test')`;
    const vencida = await decidir(r, env, "APROBAR");
    expect(vencida.status).toBe(401);
    expect(await contarEventos(env.revision.id)).toBe(1);
    const sigue = EsquemaDetalleRevision.parse((await (await revisor()).get(`/api/v1/revisiones/${env.revision.id}`)).cuerpo);
    expect(sigue.revision.estado).toBe("PENDIENTE");
  });
});
