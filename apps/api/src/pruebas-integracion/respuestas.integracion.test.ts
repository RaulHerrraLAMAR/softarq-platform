import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { EsquemaEventoRespuestaCliente, EsquemaSeguimientoEmision } from "@softarq/contracts";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import { leerConfiguracion } from "../config/entorno.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, cuenta, crearCuentas, prismaMigrador, NOMBRE_COOKIE, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";
import { ServicioRespuestas } from "../modules/cotizaciones/aplicacion/servicio-respuestas.js";
import { ErrorNegocio } from "../modules/cotizaciones/aplicacion/errores.js";
const db = prismaApp();
let admin: Awaited<ReturnType<typeof prismaMigrador>>, app: INestApplication, org: string;
let p: ClienteHttp, p2: ClienteHttp, r: ClienteHttp, a: ClienteHttp, otro: ClienteHttp;
let hoy = "2026-09-25";
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const datos = { resultado: "ACEPTADA", fechaRespuesta: "2026-09-25", nota: "El cliente confirmó por teléfono: Begoña Íñiguez." };
const ruta = (e: string) => `/api/v1/emisiones/${e}/respuestas`;
const seguimiento = async (e: string, c = p) => { const s = await c.get(`/api/v1/emisiones/${e}/seguimiento`); expect(s.status, s.texto).toBe(200); return EsquemaSeguimientoEmision.parse(s.cuerpo); };
async function documento(e: string) {
  const res = await fetch(`${p.url}/api/v1/emisiones/${e}/documento`, { headers: { Cookie: `${NOMBRE_COOKIE}=${p.cookie}` } });
  expect(res.status).toBe(200); return createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex");
}
async function version(id: string, numero: number) {
  const v = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0, ...(numero > 1 ? { motivo: "Nueva propuesta comercial para el cliente." } : {}) }, idem()); expect(v.status, v.texto).toBe(201);
  const rev = await p.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/revisiones`, { revisionBorrador: 0 }, idem()); expect(rev.status, rev.texto).toBe(201);
  const dec = await r.post(`/api/v1/revisiones/${rev.cuerpo.revision.id}/decision`, { decision: "APROBAR", versionId: v.cuerpo.version.id, revision: rev.cuerpo.revision.revision }, idem()); expect(dec.status, dec.texto).toBe(200);
  const em = await p.post(`/api/v1/cotizaciones/${id}/versiones/${numero}/emision`, { versionId: v.cuerpo.version.id, revisionId: rev.cuerpo.revision.id }, idem()); expect(em.status, em.texto).toBe(201);
  return { id, emision: em.cuerpo.emision.id as string, versionId: v.cuerpo.version.id as string };
}
async function emitir() {
  const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Respuesta Peñasco ${randomUUID().slice(0,6)}`, contactoNombre: "Begoña Íñiguez", contactoTelefono: "55 1234 5678", contactoCorreo: "begona@ejemplo.invalid" }, idem()); expect(cli.status, cli.texto).toBe(201);
  const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: "[DEMO] Nave Águila", municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Cubierta ligera de prueba." }, idem()); expect(pry.status, pry.texto).toBe(201);
  const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!.entrada) }, idem()); expect(cot.status, cot.texto).toBe(201);
  const id = cot.cuerpo.cotizacion.id as string;
  expect((await p.post(ruta(id), datos, idem())).status).toBe(404); // un folio no es una emisión
  return version(id, 1);
}
beforeAll(async () => {
  vaciarDocumentosPrueba(join(directorioDocumentosPrueba("integracion"), "..", "documentos-respuestas"));
  org = (await cargarDemo(db, { codigo: "DEMO-RESP", nombre: "[DEMO] Respuestas" })).organizacionId; await cargarEmisorDemo(db, org);
  await cargarDemo(db, { codigo: "DEMO-RESP-B", nombre: "[DEMO] Respuestas B" });
  admin = await prismaMigrador();
  const cred = { ...await crearCuentas(admin, "DEMO-RESP", [cuenta("prep.resp@softarq.test", "[DEMO] Preparadora Íñiguez", "PREPARADOR"), cuenta("prep2.resp@softarq.test", "[DEMO] Preparador Dos", "PREPARADOR"), cuenta("rev.resp@softarq.test", "[DEMO] Revisor", "REVISOR"), cuenta("admin.resp@softarq.test", "[DEMO] Admin", "ADMIN_SISTEMA")]), ...await crearCuentas(admin, "DEMO-RESP-B", [cuenta("otro.resp@softarq.test", "[DEMO] Otro", "PREPARADOR")]) };
  app = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_ACCESO_INTENTOS_IP: "1000", API_LIMITE_GENERAL_POR_MINUTO: "1000", SOFTARQ_DIR_DOCUMENTOS: join(directorioDocumentosPrueba("integracion"), "..", "documentos-respuestas") }), { reloj: { hoy: () => hoy } });
  await app.listen(0, "127.0.0.1"); const url = await app.getUrl();
  const entrar = (correo: string) => new ClienteHttp(url).entrar(cred[correo] as Credencial);
  const clientes = await Promise.all(["prep.resp", "prep2.resp", "rev.resp", "admin.resp", "otro.resp"].map((c) => entrar(`${c}@softarq.test`)));
  [p,p2,r,a,otro] = [clientes[0]!,clientes[1]!,clientes[2]!,clientes[3]!,clientes[4]!];
}, 120_000);
afterAll(async () => { await app?.close(); await admin?.$disconnect(); await db.$disconnect(); });
beforeEach(() => { hoy = "2026-09-25"; });
describe("seguimiento interno de una emisión exacta", () => {
  it("flujo completo, identidad interna, bitácora y documento/version/importes inmutables", async () => {
    const e = await emitir(); const antes = await db.emision.findUniqueOrThrow({ where: { id: e.emision } });
    const v = await db.cotizacionVersion.findUniqueOrThrow({ where: { id: e.versionId } }); const sha = await documento(e.emision);
    const s = await seguimiento(e.emision); expect(s.respuestaVigente).toBeNull(); expect(s.versionId).toBe(e.versionId); expect(s.acciones.registrar.permitida).toBe(true);
    const res = await p.post(ruta(e.emision), datos, idem()); expect(res.status, res.texto).toBe(201);
    const ev = EsquemaEventoRespuestaCliente.parse(res.cuerpo); expect(ev.registradoNombre).toBe("[DEMO] Preparadora Íñiguez"); expect(ev.nota).toBe(datos.nota); expect(ev.fechaRegistro).toBe(hoy);
    const s2 = await seguimiento(e.emision); expect(s2.historial).toHaveLength(1); expect(s2.respuestaVigente?.id).toBe(ev.id);
    const log = await db.bitacora.findFirst({ where: { entidadId: e.id, tipo: "RESPUESTA_REGISTRADA" } }); expect(log?.usuarioId).toBe(ev.registradoPor);
    expect(await db.emision.findUnique({ where: { id: e.emision } })).toEqual(antes); expect(await db.cotizacionVersion.findUnique({ where: { id: e.versionId } })).toEqual(v); expect(await documento(e.emision)).toBe(sha);
  });
  it("permisos, CSRF, organización e identidad/campos estrictos", async () => {
    const e = await emitir();
    for (const c of [r,a]) { expect((await c.post(ruta(e.emision), datos, idem())).status).toBe(403); expect((await seguimiento(e.emision,c)).acciones.registrar.permitida).toBe(false); }
    expect((await otro.get(`/api/v1/emisiones/${e.emision}/seguimiento`)).status).toBe(404);
    expect((await otro.post(ruta(e.emision), datos, idem())).status).toBe(404);
    expect((await p.post(ruta(e.emision), datos, { ...idem(), csrf: null })).status).toBe(403);
    expect((await p.post(ruta(e.emision), { ...datos, organizacionId: org, registradoPor: randomUUID() }, idem())).status).toBe(400);
    expect((await p.get(`/api/v1/emisiones/${e.emision}/seguimiento?antesDe=1&estado=ACEPTADA`)).status).toBe(400);
    expect((await p.post(ruta(e.versionId), datos, idem())).status).toBe(404);
  });
  it("límite inclusivo y registro tardío de una respuesta recibida en vigencia; no borra al vencer", async () => {
    const e = await emitir(); hoy = "2026-10-10"; expect((await seguimiento(e.emision)).vigencia.estado).toBe("VIGENTE");
    hoy = "2026-10-11"; const d = { ...datos, fechaRespuesta: "2026-10-10" };
    expect((await p.post(ruta(e.emision), d, idem())).status).toBe(201);
    const s = await seguimiento(e.emision); expect(s.vigencia.estado).toBe("VENCIDA"); expect(s.respuestaVigente?.resultado).toBe("ACEPTADA");
    expect(s.respuestaVigente?.fechaRegistro).toBe("2026-10-11"); expect(s.respuestaVigente?.fechaRespuesta).toBe("2026-10-10");
  });
  it.each([["2026-09-24","2026-09-25","FECHA_RESPUESTA_INVALIDA"],["2026-09-26","2026-09-25","FECHA_RESPUESTA_INVALIDA"],["2026-10-11","2026-10-12","RESPUESTA_FUERA_VIGENCIA"]])("bloquea fecha recibida %s", async (fecha,h,codigo) => {
    const e = await emitir(); hoy = h; const res = await p.post(ruta(e.emision), { ...datos, fechaRespuesta: fecha }, idem()); expect(res.status, res.texto).toBe(422); expect(res.cuerpo.error.codigo).toBe(codigo); expect((await seguimiento(e.emision)).historial).toHaveLength(0);
  });
  it("reintento concurrente reproduce la misma respuesta y la clave no admite otro cuerpo", async () => {
    const e = await emitir(), clave = idem(); const respuestas = await Promise.all([p.post(ruta(e.emision), datos, clave), p.post(ruta(e.emision), datos, clave)]);
    expect(respuestas.map((v) => v.status)).toEqual([201,201]); expect(respuestas[0]!.cuerpo.id).toBe(respuestas[1]!.cuerpo.id);
    expect((await seguimiento(e.emision)).historial).toHaveLength(1);
    const conflict = await p.post(ruta(e.emision), { ...datos, nota: "Otra nota" }, clave); expect(conflict.status).toBe(422); expect(conflict.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CONFLICTO");
  });
  it("dos decisiones compiten y el conflicto devuelve el estado vigente sin perder la vencedora", async () => {
    const e = await emitir(); const res = await Promise.all([p.post(ruta(e.emision), datos, idem()), p2.post(ruta(e.emision), { ...datos, resultado: "RECHAZADA", nota: "Otra decisión" }, idem())]);
    expect(res.map((v) => v.status).sort()).toEqual([201,409]); const perdedora = res.find((v) => v.status === 409)!;
    expect(perdedora.cuerpo.error.codigo).toBe("CONFLICTO_RESPUESTA"); expect(EsquemaSeguimientoEmision.parse(perdedora.cuerpo.error.seguimientoVigente).respuestaVigente?.id).toBe(res.find((v) => v.status === 201)!.cuerpo.id);
  });
  it("correcciones concurrentes, motivo obligatorio, eventos intactos y replay del evento original", async () => {
    const e = await emitir(), clave = idem(); const primera = await p.post(ruta(e.emision), datos, clave); expect(primera.status).toBe(201);
    const path = `${ruta(e.emision)}/${primera.cuerpo.id}/correcciones`, d = { ...datos, resultado: "RECHAZADA", motivo: "Se transcribió el resultado equivocado." };
    expect((await p.post(path, { ...d, motivo: "" }, idem())).status).toBe(400); expect((await r.post(path,d,idem())).status).toBe(403);
    const corregidas = await Promise.all([p.post(path,d,idem()),p2.post(path,d,idem())]); expect(corregidas.map((v) => v.status).sort()).toEqual([201,409]);
    const s = await seguimiento(e.emision); expect(s.historial).toHaveLength(2); expect(s.respuestaVigente?.numero).toBe(2); expect(s.historial[1]).toEqual(EsquemaEventoRespuestaCliente.parse(primera.cuerpo));
    const replay = await p.post(ruta(e.emision),datos,clave); expect(replay.status).toBe(201); expect(replay.cuerpo).toEqual(primera.cuerpo);
    await expect(db.$executeRaw`DELETE FROM respuesta_cliente_evento WHERE emision_id=${e.emision}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE respuesta_cliente_evento SET nota='Borrada' WHERE emision_id=${e.emision}::uuid`).rejects.toThrow();
    await expect(admin.$executeRaw`UPDATE respuesta_cliente_evento SET nota='Borrada' WHERE emision_id=${e.emision}::uuid`).rejects.toThrow(/RESPUESTA_INMUTABLE/);
  });
  it("sustitución no hereda resultado, bloquea primera respuesta anterior y permite corrección histórica", async () => {
    const anterior = await emitir(); const first = await p.post(ruta(anterior.emision),datos,idem()); expect(first.status).toBe(201);
    const nueva = await version(anterior.id,2); const s = await seguimiento(nueva.emision); expect(s.versionId).toBe(nueva.versionId); expect(s.respuestaVigente).toBeNull(); expect(s.historial).toHaveLength(0);
    expect((await seguimiento(anterior.emision)).sustituida).toBe(true);
    const corr = await p.post(`${ruta(anterior.emision)}/${first.cuerpo.id}/correcciones`, { ...datos, motivo: "Se corrigió la nota del registro antiguo." }, idem()); expect(corr.status,corr.texto).toBe(201);
    const sin = await emitir(); await version(sin.id,2); const no = await p.post(ruta(sin.emision),datos,idem()); expect(no.status,no.texto).toBe(409); expect(no.cuerpo.error.codigo).toBe("EMISION_SUSTITUIDA");
    expect((await seguimiento(nueva.emision)).respuestaVigente).toBeNull();
  });
  it("historial completo mediante paginación, sin truncar la cabeza", async () => {
    const e = await emitir(); let res = await p.post(ruta(e.emision),datos,idem());
    for(let n=2;n<=52;n++) { res=await p.post(`${ruta(e.emision)}/${res.cuerpo.id}/correcciones`, { ...datos, motivo: `Corrección de nota interna número ${n}.` },idem()); expect(res.status,res.texto).toBe(201); }
    const s=await seguimiento(e.emision); expect(s.historial).toHaveLength(50); expect(s.siguienteAntesDe).toBe(3);
    const pag=await p.get(`/api/v1/emisiones/${e.emision}/seguimiento?antesDe=${s.siguienteAntesDe}`); expect(pag.status).toBe(200); const anterior=EsquemaSeguimientoEmision.parse(pag.cuerpo); expect(anterior.historial.map((e)=>e.numero)).toEqual([2,1]); expect(anterior.respuestaVigente?.numero).toBe(52); expect(anterior.siguienteAntesDe).toBeNull();
  });
  it("si la base rechaza la función (pertenencia cambiada tras la sesión), responde SIN_PERMISO y no 500", async () => {
    // Regresión: SOFTARQ:SIN_PERMISO de softarq_registrar_respuesta no se traducía y llegaba como ERROR_INTERNO.
    const e = await emitir();
    const revisor = await db.usuario.findUniqueOrThrow({ where: { correo: "rev.resp@softarq.test" } });
    const servicio = new ServicioRespuestas(db, { hoy: () => hoy }, { ahora: () => new Date() }, "America/Mexico_City");
    // La capacidad viene de una sesión anterior; la función real en la base es REVISOR.
    const actor = { usuarioId: revisor.id, nombre: revisor.nombre, capacidades: ["respuestas.registrar"] as const };
    const intento = servicio.registrar({ organizacionId: org }, actor, e.emision, null, { resultado: "ACEPTADA", fechaRespuesta: "2026-09-25", nota: null }, randomUUID());
    await expect(intento).rejects.toBeInstanceOf(ErrorNegocio);
    await expect(intento).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
    expect((await seguimiento(e.emision)).historial).toHaveLength(0);
  });
  it("rol de aplicación mínimo: sin UPDATE/DELETE ni DDL", async () => {
    const [f] = await db.$queryRaw<{ lectura:boolean; insercion:boolean; edicion:boolean; borrado:boolean; ddl:boolean }[]>`SELECT has_table_privilege(current_user,'public.respuesta_cliente_evento','SELECT') lectura,has_table_privilege(current_user,'public.respuesta_cliente_evento','INSERT') insercion,has_table_privilege(current_user,'public.respuesta_cliente_evento','UPDATE') edicion,has_table_privilege(current_user,'public.respuesta_cliente_evento','DELETE') borrado,has_schema_privilege(current_user,'public','CREATE') ddl`;
    expect(f).toEqual({lectura:true,insercion:true,edicion:false,borrado:false,ddl:false});
  });
});
