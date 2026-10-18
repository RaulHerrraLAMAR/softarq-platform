/**
 * Parámetros (B-38) y personas y funciones (B-39) — módulo 13, ADR-0017 — por HTTP contra softarq_test.
 *
 * Fuentes: `modConfig.bas` (`BTN_Parametros`, `Param_Guardar`: PCT 0..1 o vacío, ENTERO > 0, motivo
 * obligatorio; `BTN_Personas`, `Persona_Guardar`: alta, funciones, baja y reactivación con motivo,
 * `Req_Funcion FN_ADMSIS`). Decisiones del propietario: contraseña temporal mostrada una vez con
 * cambio obligatorio, y plantillas TEXTO_* editables que solo afectan a cotizaciones nuevas. Cifra
 * de la fuente: 22,405.28 (GUIA-R3-SIN-VENTANA).
 */
import { Logger, type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EntradaCalculo } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { cargarUsuariosDemo } from "../modules/autenticacion/demo/cargar-usuarios-demo.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { TEXTOS_DEMO } from "../modules/cotizaciones/dominio/textos.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const SV = ESCENARIOS.find((e) => e.id === "GUIA-R3-SIN-VENTANA")!;
const MOTIVO = "[DEMO] Ajuste de comprobación del módulo 13.";
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const org: Record<string, string> = {};
const cred: Record<string, Credencial> = {};
const entrar = (correo: string, contrasena?: string) => new ClienteHttp(url).entrar(contrasena ? { correo, contrasena } : cred[correo]!);
const sis = () => entrar("sis.m13@softarq.test");
const idem = (clave: string = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });
const sufijo = () => randomUUID().slice(0, 6);

async function cotizacion(c: ClienteHttp) {
  const s = sufijo();
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente M13 ${s}`, contactoNombre: "Contacto", contactoTelefono: "55 1234 5678", contactoCorreo: "c@ejemplo.invalid" }, idem());
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra M13 ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Muro." }, idem());
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura: borradorDesdeEntrada(SV.entrada as EntradaCalculo) }, idem());
  expect(cot.status, cot.texto).toBe(201);
  return cot.cuerpo.cotizacion.id as string;
}

beforeAll(async () => {
  for (const [clave, codigo] of [
    ["a", "DEMO-M13"],
    ["b", "DEMO-M13-B"],
    ["u", "DEMO-M13-U"],
  ] as const) {
    org[clave] = (await cargarDemo(prisma, { codigo, nombre: `[DEMO] Módulo 13 ${clave}` })).organizacionId;
  }
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-M13", [
      cuenta("sis.m13@softarq.test", "[DEMO] Administradora del sistema M13", "ADMIN_SISTEMA"),
      cuenta("sis2.m13@softarq.test", "[DEMO] Segundo administrador del sistema M13", "ADMIN_SISTEMA"),
      cuenta("cat.m13@softarq.test", "[DEMO] Administrador del catálogo M13", "ADMIN_CATALOGO"),
      cuenta("prep.m13@softarq.test", "[DEMO] Preparador M13", "PREPARADOR"),
      cuenta("rev.m13@softarq.test", "[DEMO] Revisora M13", "REVISOR"),
    ]),
    await crearCuentas(migrador, "DEMO-M13-B", [cuenta("sis.m13b@softarq.test", "[DEMO] Administrador del sistema B", "ADMIN_SISTEMA")]),
  );
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "5000", API_ACCESO_INTENTOS_IP: "1000" }),
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

describe("parámetros (B-38)", () => {
  it("solo el Administrador del sistema; ambiente y moneda no se editan; rangos del libro sin redondeo", async () => {
    for (const c of ["cat.m13@softarq.test", "prep.m13@softarq.test", "rev.m13@softarq.test"]) {
      expect((await (await entrar(c)).get("/api/v1/admin/parametros")).status).toBe(403);
    }
    const a = await sis();
    const d = await a.get("/api/v1/admin/parametros");
    expect(d.status, d.texto).toBe(200);
    expect(d.cuerpo.parametros).toMatchObject({ ambiente: "DEMO", moneda: "MXN", recargoSobreCosto: "0.2", vigenciaDias: 15, textos: TEXTOS_DEMO });
    const rev = d.cuerpo.parametros.revision;
    for (const malo of [
      { recargoSobreCosto: "1.5" },
      { recargoSobreCosto: "0.1234567" },
      { recargoSobreCosto: 0.2 },
      { recargoSobreCosto: "-0.1" },
      { vigenciaDias: 0 },
      { vigenciaDias: null },
      { ambiente: "PRODUCCION" },
      { moneda: "USD" },
      { impuesto: { tasa: "0.16", base: "OTRA", tratamiento: "x", nombre: "y" } },
    ]) {
      expect((await a.patch("/api/v1/admin/parametros", { revision: rev, motivo: MOTIVO, ...malo })).status, JSON.stringify(malo)).toBe(400);
    }
    expect((await a.patch("/api/v1/admin/parametros", { revision: rev, recargoSobreCosto: "0.25" })).status).toBe(400); // sin motivo
  });

  it("ausente (null) bloquea con BL-12, cero es un valor; la v1 anterior no cambia y la verificación detecta BL-16; bitácora con anterior y nuevo", async () => {
    const a = await sis();
    const p = await entrar("prep.m13@softarq.test");
    const id = await cotizacion(p);
    const v1 = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(v1.cuerpo.cotizacion.total).toBe("22405.28");
    const fila = async () => (await migrador.$queryRaw<{ f: unknown }[]>`SELECT to_jsonb(v) f FROM cotizacion_version v WHERE cotizacion_id = ${id}::uuid AND numero = 1`)[0]!.f;
    const antes = await fila();
    let d = (await a.get("/api/v1/admin/parametros")).cuerpo;
    try {
      const sinRecargo = await a.patch("/api/v1/admin/parametros", { revision: d.parametros.revision, motivo: MOTIVO, recargoSobreCosto: null });
      expect(sinRecargo.status, sinRecargo.texto).toBe(200);
      expect(sinRecargo.cuerpo.parametros.recargoSobreCosto).toBeNull();
      expect(sinRecargo.cuerpo.historial[0]).toMatchObject({ tipo: "PARAMETROS_EDITADOS", detalle: { cambios: { recargoSobreCosto: { anterior: "0.200000", nuevo: null } }, motivo: MOTIVO } });
      const bloqueada = await p.post(`/api/v1/cotizaciones/${await cotizacion(p)}/versiones`, { revisionBorrador: 0 }, idem());
      expect(bloqueada.status).toBe(422);
      expect(bloqueada.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-12");
      d = sinRecargo.cuerpo;
      const cero = await a.patch("/api/v1/admin/parametros", { revision: d.parametros.revision, motivo: MOTIVO, recargoSobreCosto: "0" });
      expect(cero.cuerpo.parametros.recargoSobreCosto).toBe("0");
      const conCero = await p.post(`/api/v1/cotizaciones/${await cotizacion(p)}/versiones`, { revisionBorrador: 0 }, idem());
      expect(conCero.status, conCero.texto).toBe(201);
      expect(conCero.cuerpo.cotizacion.total).not.toBe("22405.28");
      d = cero.cuerpo;
      // La v1 calculada antes no cambia; la verificación detecta el cambio de parámetros (BL-16).
      expect(await fila()).toEqual(antes);
      const verif = await p.get(`/api/v1/cotizaciones/${id}/versiones/1/verificacion`);
      expect(verif.cuerpo.bloqueos.map((b: { codigo: string }) => b.codigo)).toContain("BL-16");
      // Conflicto de revisión: no se aplica y devuelve el registro vigente.
      const viejo = await a.patch("/api/v1/admin/parametros", { revision: d.parametros.revision - 1, motivo: MOTIVO, vigenciaDias: 30 });
      expect(viejo.status).toBe(409);
      expect(viejo.cuerpo.error.registroVigente.recargoSobreCosto).toBe("0");
    } finally {
      const r = await a.patch("/api/v1/admin/parametros", { revision: d.parametros.revision, motivo: "[DEMO] Restaurar la configuración de referencia.", recargoSobreCosto: "0.2" });
      expect(r.status, r.texto).toBe(200);
    }
    const ref = await p.post(`/api/v1/cotizaciones/${await cotizacion(p)}/versiones`, { revisionBorrador: 0 }, idem());
    expect(ref.cuerpo.cotizacion.total).toBe("22405.28");
  });

  it("plantillas de textos: solo afectan a cotizaciones nuevas, por organización; la versión anterior no cambia", async () => {
    const a = await sis();
    const p = await entrar("prep.m13@softarq.test");
    const anterior = await cotizacion(p);
    const v1 = await p.post(`/api/v1/cotizaciones/${anterior}/versiones`, { revisionBorrador: 0 }, idem());
    expect(v1.status, v1.texto).toBe(201);
    const fila = async () => (await migrador.$queryRaw<{ f: unknown }[]>`SELECT to_jsonb(v) f FROM cotizacion_version v WHERE cotizacion_id = ${anterior}::uuid AND numero = 1`)[0]!.f;
    const versionAntes = await fila();
    const d = (await a.get("/api/v1/admin/parametros")).cuerpo;
    const nuevos = { alcance: "[DEMO] Alcance nuevo M13.", condiciones: "[DEMO] Condiciones nuevas M13.", exclusiones: "[DEMO] Exclusiones nuevas M13." };
    const r = await a.patch("/api/v1/admin/parametros", { revision: d.parametros.revision, motivo: MOTIVO, textos: nuevos });
    expect(r.status, r.texto).toBe(200);
    try {
      const posterior = await cotizacion(p);
      const textos = async (id: string) => (await p.get(`/api/v1/cotizaciones/${id}`)).cuerpo.borrador.captura.textos;
      expect(await textos(anterior)).toEqual(TEXTOS_DEMO);
      expect(await textos(posterior)).toEqual(nuevos);
      // La versión calculada antes conserva sus textos congelados (la fila entera no cambia).
      expect(await fila()).toEqual(versionAntes);
      expect((versionAntes as { captura: { textos: unknown } }).captura.textos).toEqual(TEXTOS_DEMO);
      // La otra organización conserva los suyos.
      const otra = await new ClienteHttp(url).entrar(cred["sis.m13b@softarq.test"]!);
      expect((await otra.get("/api/v1/admin/parametros")).cuerpo.parametros.textos).toEqual(TEXTOS_DEMO);
      // Texto vacío no se admite.
      expect((await a.patch("/api/v1/admin/parametros", { revision: r.cuerpo.parametros.revision, motivo: MOTIVO, textos: { ...nuevos, alcance: "  " } })).status).toBe(400);
    } finally {
      await a.patch("/api/v1/admin/parametros", { revision: r.cuerpo.parametros.revision, motivo: "[DEMO] Restaurar textos de referencia.", textos: TEXTOS_DEMO });
    }
  });
});

describe("personas y funciones (B-39)", () => {
  it("alta con temporal mostrada UNA vez; reintento sin otra; nunca en listados, bitácora ni idempotencia", async () => {
    const a = await sis();
    expect((await (await entrar("cat.m13@softarq.test")).get("/api/v1/admin/personas")).status).toBe(403);
    const clave = randomUUID();
    const correo = `persona.${sufijo()}@softarq.test`;
    const cuerpo = { correo: `  ${correo.toUpperCase()} `, nombre: "[DEMO] Persona nueva M13", funciones: ["PREPARADOR"], motivo: MOTIVO };
    const alta = await a.post("/api/v1/admin/personas", cuerpo, idem(clave));
    expect(alta.status, alta.texto).toBe(201);
    const temporal = alta.cuerpo.contrasenaTemporal as string;
    expect(temporal).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(alta.cuerpo).toMatchObject({ contrasenaEntregada: false, persona: { correo, funciones: ["PREPARADOR"], activa: true, cambioContrasenaPendiente: true } });
    const repetida = await a.post("/api/v1/admin/personas", cuerpo, idem(clave));
    expect(repetida.status).toBe(201);
    expect(repetida.cuerpo).toMatchObject({ contrasenaTemporal: null, contrasenaEntregada: true });
    expect(repetida.headers.get("idempotent-replayed")).toBe("true");
    expect((await a.post("/api/v1/admin/personas", { ...cuerpo, nombre: "Otra" }, idem())).status).toBe(409);
    const id = alta.cuerpo.persona.id as string;
    const listado = await a.get(`/api/v1/admin/personas?buscar=${encodeURIComponent(correo)}`);
    const detalle = await a.get(`/api/v1/admin/personas/${id}`);
    for (const r of [listado, detalle, repetida]) expect(r.texto).not.toContain(temporal);
    expect(JSON.stringify(detalle.cuerpo)).not.toMatch(/hash|contrasena"/i);
    const rastro = await migrador.$queryRaw<{ t: string }[]>`
      SELECT coalesce((SELECT string_agg(detalle::text, ' ') FROM bitacora WHERE entidad = 'persona'), '') ||
             coalesce((SELECT string_agg(encode(huella_solicitud, 'hex') || recurso_id::text, ' ') FROM idempotencia), '') AS t`;
    expect(rastro[0]!.t).not.toContain(temporal);
    // Otra organización no ve a la persona.
    const otra = await new ClienteHttp(url).entrar(cred["sis.m13b@softarq.test"]!);
    expect((await otra.get(`/api/v1/admin/personas/${id}`)).status).toBe(404);
    expect((await otra.post("/api/v1/admin/personas", { ...cuerpo, nombre: "Otro" }, idem())).status).toBe(409);
  });

  it("primer acceso restringido por la API; cambio propio con política; revoca la sesión y exige volver a entrar", async () => {
    const a = await sis();
    const correo = `primera.${sufijo()}@softarq.test`;
    const alta = await a.post("/api/v1/admin/personas", { correo, nombre: "[DEMO] Primer acceso M13", funciones: ["PREPARADOR"], motivo: MOTIVO }, idem());
    const temporal = alta.cuerpo.contrasenaTemporal as string;
    const c = await entrar(correo, temporal);
    const s = await c.get("/api/v1/auth/sesion");
    expect(s.cuerpo).toMatchObject({ cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    for (const ruta of ["/api/v1/cotizaciones", "/api/v1/clientes", "/api/v1/catalogos/conceptos"]) {
      const r = await c.get(ruta);
      expect(r.status, ruta).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
    }
    expect((await c.post("/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }, idem())).cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
    const nueva = `Nueva-${randomUUID()}`;
    expect((await c.post("/api/v1/auth/contrasena", { actual: "incorrecta", nueva, confirmacion: nueva })).cuerpo.error.codigo).toBe("CONTRASENA_ACTUAL_INCORRECTA");
    expect((await c.post("/api/v1/auth/contrasena", { actual: temporal, nueva: "corta", confirmacion: "corta" })).status).toBe(400);
    expect((await c.post("/api/v1/auth/contrasena", { actual: temporal, nueva, confirmacion: `${nueva}x` })).status).toBe(400);
    expect((await c.post("/api/v1/auth/contrasena", { actual: temporal, nueva: temporal, confirmacion: temporal })).status).toBe(400);
    const cambio = await c.post("/api/v1/auth/contrasena", { actual: temporal, nueva, confirmacion: nueva });
    expect(cambio.status, cambio.texto).toBe(204);
    expect((await c.get("/api/v1/auth/sesion")).status).toBe(401);
    expect((await new ClienteHttp(url).iniciarSesion({ correo, contrasena: temporal })).status).toBe(401);
    const normal = await entrar(correo, nueva);
    expect((await normal.get("/api/v1/auth/sesion")).cuerpo.cambioContrasenaRequerido).toBe(false);
    expect((await normal.get("/api/v1/cotizaciones")).status).toBe(200);
    const persona = (await a.get(`/api/v1/admin/personas/${alta.cuerpo.persona.id}`)).cuerpo;
    expect(persona.persona.cambioContrasenaPendiente).toBe(false);
    expect(persona.historial.map((e: { tipo: string }) => e.tipo)).toEqual(expect.arrayContaining(["PERSONA_CREADA", "PERSONA_CONTRASENA_CAMBIADA"]));
  });

  it("caducidad: una temporal vencida no entra (con la contraseña correcta); restablecer invalida la anterior y revoca todas las sesiones", async () => {
    const a = await sis();
    const correo = `caduca.${sufijo()}@softarq.test`;
    const alta = await a.post("/api/v1/admin/personas", { correo, nombre: "[DEMO] Caducidad M13", funciones: ["REVISOR"], motivo: MOTIVO }, idem());
    const id = alta.cuerpo.persona.id as string;
    const abierta = await entrar(correo, alta.cuerpo.contrasenaTemporal);
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() - interval '1 minute' WHERE id = ${id}::uuid`;
    const caducada = await new ClienteHttp(url).iniciarSesion({ correo, contrasena: alta.cuerpo.contrasenaTemporal });
    expect(caducada.status).toBe(401);
    expect(caducada.cuerpo.error.codigo).toBe("CONTRASENA_TEMPORAL_CADUCADA");
    const mala = await new ClienteHttp(url).iniciarSesion({ correo, contrasena: "no-es-la-contrasena" });
    expect(mala.cuerpo.error.codigo).toBe("CREDENCIALES_INVALIDAS");
    // Restablecer: otra temporal, la anterior deja de valer y la sesión abierta se revoca.
    const clave = randomUUID();
    const r = await a.post(`/api/v1/admin/personas/${id}/restablecimiento`, { motivo: MOTIVO }, idem(clave));
    expect(r.status, r.texto).toBe(200);
    expect(r.cuerpo.contrasenaTemporal).not.toBe(alta.cuerpo.contrasenaTemporal);
    expect((await abierta.get("/api/v1/auth/sesion")).status).toBe(401);
    expect((await new ClienteHttp(url).iniciarSesion({ correo, contrasena: alta.cuerpo.contrasenaTemporal })).status).toBe(401);
    expect((await new ClienteHttp(url).iniciarSesion({ correo, contrasena: r.cuerpo.contrasenaTemporal })).status).toBe(200);
    const rep = await a.post(`/api/v1/admin/personas/${id}/restablecimiento`, { motivo: MOTIVO }, idem(clave));
    expect(rep.cuerpo).toMatchObject({ contrasenaTemporal: null, contrasenaEntregada: true });
    expect((await new ClienteHttp(url).iniciarSesion({ correo, contrasena: r.cuerpo.contrasenaTemporal })).status).toBe(200);
    // Sobre la propia cuenta no: para eso, el cambio propio.
    const yo = (await a.get("/api/v1/admin/personas?buscar=sis.m13%40")).cuerpo.personas[0];
    expect((await a.post(`/api/v1/admin/personas/${yo.id}/restablecimiento`, { motivo: MOTIVO }, idem())).cuerpo.error.codigo).toBe("AUTOPROTECCION");
  });

  it("funciones y desactivación surten efecto en la petición siguiente; la carga DEMO repetida no las restaura", async () => {
    const a = await sis();
    const p = await entrar("prep.m13@softarq.test");
    const yo = (await a.get("/api/v1/admin/personas?buscar=prep.m13%40")).cuerpo.personas[0];
    expect((await p.get("/api/v1/cotizaciones")).status).toBe(200);
    let r = await a.patch(`/api/v1/admin/personas/${yo.id}`, { revision: yo.revision, motivo: MOTIVO, funciones: ["REVISOR"] });
    expect(r.status, r.texto).toBe(200);
    expect((await p.post("/api/v1/clientes", { nombre: "[DEMO] x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }, idem())).status).toBe(403);
    expect((await p.get("/api/v1/auth/sesion")).cuerpo.capacidades).toContain("revisiones.decidir");
    r = await a.patch(`/api/v1/admin/personas/${yo.id}`, { revision: r.cuerpo.revision, motivo: MOTIVO, activa: false });
    expect(r.status, r.texto).toBe(200);
    expect((await p.get("/api/v1/auth/sesion")).status).toBe(401);
    expect((await new ClienteHttp(url).iniciarSesion(cred["prep.m13@softarq.test"]!)).status).toBe(401);
    const conflicto = await a.patch(`/api/v1/admin/personas/${yo.id}`, { revision: yo.revision, motivo: MOTIVO, nombre: "x" });
    expect(conflicto.status).toBe(409);
    expect(conflicto.cuerpo.error.registroVigente.activa).toBe(false);
    r = await a.patch(`/api/v1/admin/personas/${yo.id}`, { revision: r.cuerpo.revision, motivo: MOTIVO, activa: true, funciones: ["PREPARADOR"] });
    expect(r.status, r.texto).toBe(200);
    expect((await new ClienteHttp(url).iniciarSesion(cred["prep.m13@softarq.test"]!)).status).toBe(200);
    const hist = (await a.get(`/api/v1/admin/personas/${yo.id}`)).cuerpo.historial.map((e: { tipo: string }) => e.tipo);
    expect(hist).toEqual(expect.arrayContaining(["PERSONA_FUNCIONES", "PERSONA_DESACTIVADA", "PERSONA_REACTIVADA"]));

    // Carga DEMO de cuentas repetida en otra organización DEMO: no restaura funciones retiradas.
    const contrasenas = new ServicioContrasenas();
    const cuentas = [{ correo: `carga.${sufijo()}@softarq.test`, nombre: "[DEMO] Cuenta de carga", funciones: ["PREPARADOR", "REVISOR"] as const }];
    await cargarUsuariosDemo(migrador, contrasenas, { organizacion: "DEMO-M13-U", cuentas: cuentas.map((c) => ({ ...c, funciones: [...c.funciones] })) });
    const usuario = await migrador.usuario.findUniqueOrThrow({ where: { correo: cuentas[0]!.correo } });
    await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['REVISOR']::varchar[], activa = false WHERE usuario_id = ${usuario.id}::uuid`;
    await cargarUsuariosDemo(migrador, contrasenas, { organizacion: "DEMO-M13-U", cuentas: cuentas.map((c) => ({ ...c, funciones: [...c.funciones] })) });
    const m = await migrador.membresia.findFirstOrThrow({ where: { usuarioId: usuario.id } });
    expect(m).toMatchObject({ funciones: ["REVISOR"], activa: false });
  });

  it("último Administrador del sistema: autoprotección, concurrencia y la base lo impide también con SQL directo", async () => {
    const a = await sis();
    const b = await entrar("sis2.m13@softarq.test");
    const lista = (await a.get("/api/v1/admin/personas?buscar=sis")).cuerpo.personas as { id: string; correo: string; revision: number }[];
    const pa = lista.find((x) => x.correo === "sis.m13@softarq.test")!;
    const pb = lista.find((x) => x.correo === "sis2.m13@softarq.test")!;
    expect((await a.patch(`/api/v1/admin/personas/${pa.id}`, { revision: pa.revision, motivo: MOTIVO, activa: false })).cuerpo.error.codigo).toBe("AUTOPROTECCION");
    expect((await a.patch(`/api/v1/admin/personas/${pa.id}`, { revision: pa.revision, motivo: MOTIVO, funciones: ["PREPARADOR"] })).cuerpo.error.codigo).toBe("AUTOPROTECCION");
    // A y B se retiran la función mutuamente a la vez: nunca quedan cero administradores.
    const [ra, rb] = await Promise.all([
      a.patch(`/api/v1/admin/personas/${pb.id}`, { revision: pb.revision, motivo: MOTIVO, funciones: ["REVISOR"] }),
      b.patch(`/api/v1/admin/personas/${pa.id}`, { revision: pa.revision, motivo: MOTIVO, funciones: ["REVISOR"] }),
    ]);
    expect([ra.status, rb.status].filter((s) => s === 200)).toHaveLength(1);
    const [n] = await migrador.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int n FROM membresia m JOIN usuario u ON u.id = m.usuario_id
       WHERE m.organizacion_id = ${org["a"]}::uuid AND m.activa AND u.activo AND 'ADMIN_SISTEMA' = ANY (m.funciones)`;
    expect(n!.n).toBe(1);
    // Con SQL directo del migrador tampoco se deja la organización sin administrador.
    await expect(
      migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['PREPARADOR']::varchar[] WHERE organizacion_id = ${org["a"]}::uuid AND 'ADMIN_SISTEMA' = ANY (funciones)`,
    ).rejects.toThrow(/ULTIMO_ADMINISTRADOR/);
    // Se restablece el segundo administrador para el resto de pruebas.
    const quedo = ra.status === 200 ? a : b;
    const otro = ra.status === 200 ? pb : pa;
    const vigente = (await quedo.get(`/api/v1/admin/personas/${otro.id}`)).cuerpo.persona;
    expect((await quedo.patch(`/api/v1/admin/personas/${otro.id}`, { revision: vigente.revision, motivo: MOTIVO, funciones: ["ADMIN_SISTEMA"] })).status).toBe(200);
  });
});

describe("registro HTTP", () => {
  it("con el registro completo, ni la contraseña temporal ni la nueva aparecen en la salida", async () => {
    const salida: string[] = [];
    const escribir = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
    const capturar = (chunk: unknown) => (salida.push(String(chunk)), true);
    const registrada = await crearAplicacion(
      leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "completo", API_LIMITE_GENERAL_POR_MINUTO: "5000", API_ACCESO_INTENTOS_IP: "1000" }),
      { reloj: new RelojFijo("2026-10-17") },
    );
    await registrada.listen(0, "127.0.0.1");
    const base = (await registrada.getUrl()).replace("[::1]", "127.0.0.1");
    process.stdout.write = capturar as typeof process.stdout.write;
    process.stderr.write = capturar as typeof process.stderr.write;
    // Todo lo que pasa por el Logger de Nest (registro HTTP, guardia y filtro de errores), con sus argumentos.
    const espias = (["log", "warn", "error", "debug", "verbose"] as const).map((m) =>
      vi.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => void salida.push(args.map(String).join(" "))),
    );
    const nueva = "frase nueva de registro M13";
    let temporal = "";
    try {
      const a = await new ClienteHttp(base).entrar(cred["sis.m13@softarq.test"]!);
      const correo = `registro.${sufijo()}@softarq.test`;
      const alta = await a.post("/api/v1/admin/personas", { correo, nombre: "[DEMO] Registro M13", funciones: ["REVISOR"], motivo: MOTIVO }, idem());
      expect(alta.status, alta.texto).toBe(201);
      temporal = alta.cuerpo.contrasenaTemporal as string;
      const t = await new ClienteHttp(base).entrar({ correo, contrasena: temporal });
      const cambio = await t.post("/api/v1/auth/contrasena", { actual: temporal, nueva, confirmacion: nueva });
      expect(cambio.status, cambio.texto).toBe(204);
    } finally {
      process.stdout.write = escribir.out;
      process.stderr.write = escribir.err;
      for (const e of espias) e.mockRestore();
      await registrada.close();
    }
    // El registro sí se capturó (incluye las rutas), pero sin las contraseñas.
    expect(salida.join("")).toContain("POST /api/v1/admin/personas");
    expect(salida.join("")).toContain("POST /api/v1/auth/contrasena");
    const todo = salida.join("");
    expect(todo).not.toContain(temporal);
    expect(todo).not.toContain(nueva);
  });
});
