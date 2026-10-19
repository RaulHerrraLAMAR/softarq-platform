/**
 * Autenticación, sesiones, CSRF, origen, límites de acceso y permisos (ADR-0007), contra la API
 * real y PostgreSQL (solo softarq_test). Sin atajos: todo acceso recorre el flujo del navegador.
 *
 * La fecha de negocio del cálculo (RelojFijo) es independiente del instante de las sesiones, que
 * aquí se controla con un reloj de sesiones para probar la expiración.
 */
import { Logger, type INestApplication } from "@nestjs/common";
import { EsquemaRespuestaError, EsquemaRespuestaSesion } from "@softarq/contracts";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leerConfiguracion, type ConfiguracionApi } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { POLITICA_SESION } from "../modules/autenticacion/dominio/politica.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial, type Respuesta } from "./sesiones.js";
import { solicitudDemoDesdeEntrada } from "./solicitudes.js";

const ORG = { codigo: "DEMO-AUTH", nombre: "[DEMO] Organización para pruebas de autenticación" };
const FECHA = "2026-09-25";
const MIN = 60_000;
const ORIGEN_AJENO = "http://evil.example.test";
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;

const prisma = prismaApp();
let migrador: ClientePrisma;
let orgId: string;
const cred: Record<string, Credencial> = {};
const c = (correo: string) => cred[correo]!;

/** Instante de la política de sesiones, controlado por las pruebas. */
let instante = new Date("2026-10-02T15:00:00.000Z");
const avanzar = (ms: number) => (instante = new Date(instante.getTime() + ms));

function configuracion(extra: Partial<ConfiguracionApi> = {}): ConfiguracionApi {
  return { ...leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }), ...extra };
}

async function iniciar(extra: Partial<ConfiguracionApi> = {}) {
  const app: INestApplication = await crearAplicacion(configuracion(extra), {
    reloj: new RelojFijo(FECHA),
    relojSesiones: { ahora: () => instante },
  });
  await app.listen(0, "127.0.0.1");
  return { app, url: (await app.getUrl()).replace("[::1]", "127.0.0.1") };
}

let api: { app: INestApplication; url: string };
const nuevo = () => new ClienteHttp(api.url);

beforeAll(async () => {
  orgId = (await cargarDemo(prisma, ORG)).organizacionId;
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, ORG.codigo, [
      cuenta("preparador.auth@softarq.test", "[DEMO] Preparador AUTH", "PREPARADOR"),
      cuenta("revisor.auth@softarq.test", "[DEMO] Revisor AUTH", "REVISOR"),
      cuenta("inactivo.auth@softarq.test", "[DEMO] Inactivo AUTH", "PREPARADOR"),
      cuenta("sinmembresia.auth@softarq.test", "[DEMO] Sin pertenencia AUTH", "PREPARADOR"),
      cuenta("cambios.auth@softarq.test", "[DEMO] Cambios AUTH", "PREPARADOR"),
      cuenta("baja.auth@softarq.test", "[DEMO] Baja AUTH", "PREPARADOR"),
      cuenta("bajam.auth@softarq.test", "[DEMO] Baja pertenencia AUTH", "PREPARADOR"),
      cuenta("dos.auth@softarq.test", "[DEMO] Dos organizaciones AUTH", "PREPARADOR"),
    ]),
  );
  await migrador.usuario.update({ where: { correo: "inactivo.auth@softarq.test" }, data: { activo: false } });
  await migrador.membresia.updateMany({
    where: { usuario: { correo: "sinmembresia.auth@softarq.test" } },
    data: { activa: false },
  });
  // Una segunda pertenencia activa: la selección de organización aún no existe.
  const otra = await cargarDemo(prisma, { codigo: "DEMO-AUTH-2", nombre: "[DEMO] Segunda organización AUTH" });
  const dos = await migrador.usuario.findUniqueOrThrow({ where: { correo: "dos.auth@softarq.test" } });
  await migrador.membresia.create({ data: { organizacionId: otra.organizacionId, usuarioId: dos.id, funciones: ["REVISOR"] } });
  api = await iniciar();
});

afterAll(async () => {
  await api.app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
});

const error = (r: Respuesta) => EsquemaRespuestaError.parse(r.cuerpo).error;
const calcular = (cl: ClienteHttp) => cl.post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada));

describe("inicio de sesión", () => {
  it("correcto: identidad, organización y funciones de la base; cookie HttpOnly, SameSite=Strict, Path, host-only", async () => {
    const cl = nuevo();
    const previa = await cl.prepararAcceso();
    const tokenPrevio = cl.cookie;
    expect(previa.status).toBe(200);
    expect(tokenPrevio).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const r = await cl.post("/api/v1/auth/sesion", { correo: "  Preparador.AUTH@softarq.test ", contrasena: c("preparador.auth@softarq.test").contrasena });
    expect(r.status, r.texto).toBe(200);
    const s = EsquemaRespuestaSesion.parse(r.cuerpo);
    expect(s.usuario).toEqual({ nombre: "[DEMO] Preparador AUTH", correo: "preparador.auth@softarq.test" });
    expect(s.organizacion).toEqual({ codigo: ORG.codigo, nombre: ORG.nombre, esDemo: true });
    expect(s.funciones).toEqual(["PREPARADOR"]);
    // Matriz vigente (ADR-0007 §2, ampliada en ADR-0008 §3 con clientes y cotizaciones).
    expect(s.capacidades).toEqual([
      "sesion.propia",
      "catalogos.consultar",
      "calculo.ejecutar",
      "clientes.consultar",
      "clientes.gestionar",
      "cotizaciones.consultar",
      "cotizaciones.preparar",
      "revisiones.enviar",
      // Módulo 8 (ADR-0010): el Preparador emite tras una aprobación independiente.
      "emisiones.emitir",
      // ADR-0013: el Preparador registra y corrige respuestas internas.
      "respuestas.registrar",
      "respuestas.corregir",
      // ADR-0014 (módulo 10): datos técnicos de las excepciones que registra.
      "excepciones.consultar",
      // ADR-0018 (módulo 14): compras calculadas, detalle e indicadores internos.
      "salidas.consultar",
    ]);
    expect(s.inactividadMinutos).toBe(30);
    expect(new Date(s.expiraEn).getTime()).toBe(instante.getTime() + POLITICA_SESION.absolutaMs);

    const cookie = r.setCookie.find((x) => x.startsWith("softarq_sesion="))!;
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\/api\/v1/);
    expect(cookie).toMatch(/; Max-Age=28800/);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/; Secure/i); // excepción local documentada (HTTP en loopback)
    // Renovación: token nuevo al autenticar; la sesión previa queda revocada.
    expect(cl.cookie).not.toBe(tokenPrevio);
    const previaEnBase = await migrador.sesion.findUnique({
      where: { tokenHash: createHash("sha256").update(tokenPrevio!).digest() },
    });
    expect(previaEnBase).toMatchObject({ tipo: "PREVIA", motivoRevocacion: "AUTENTICADA" });
    expect((await cl.get("/api/v1/catalogos/tipos-adicional", { cookie: tokenPrevio })).status).toBe(401);
  });

  it("GET /auth/sesion restaura la sesión con el mismo token CSRF (se recalcula, no se guarda)", async () => {
    const cl = nuevo();
    const login = await cl.iniciarSesion(c("revisor.auth@softarq.test"));
    const r = await cl.get("/api/v1/auth/sesion");
    expect(r.status).toBe(200);
    expect(EsquemaRespuestaSesion.parse(r.cuerpo)).toEqual(login.cuerpo);
    expect(r.cuerpo.funciones).toEqual(["REVISOR"]);
  });

  it("solo se guarda el SHA-256 del token, nunca el token utilizable", async () => {
    const cl = await nuevo().entrar(c("preparador.auth@softarq.test"));
    const filas = await migrador.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM sesion WHERE token_hash = ${createHash("sha256").update(cl.cookie!).digest()}`;
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas[0], (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("base64url") : v))).not.toContain(cl.cookie);
    expect(Object.keys(filas[0]!)).not.toContain("csrf_hash");
  });

  it.each([
    ["contraseña incorrecta", "preparador.auth@softarq.test", "no-es-la-clave"],
    ["cuenta inexistente", "nadie@softarq.test", "no-es-la-clave"],
    ["cuenta desactivada (contraseña correcta)", "inactivo.auth@softarq.test", null],
    ["sin pertenencia activa (contraseña correcta)", "sinmembresia.auth@softarq.test", null],
    ["dos pertenencias activas (selección pendiente)", "dos.auth@softarq.test", null],
  ])("incorrecto (%s): 401 con el mismo mensaje y sin sesión", async (_n, correo, clave) => {
    const cl = nuevo();
    const r = await cl.iniciarSesion({ correo, contrasena: clave ?? c(correo).contrasena });
    expect(r.status).toBe(401);
    expect(error(r)).toMatchObject({ codigo: "CREDENCIALES_INVALIDAS", mensaje: "Correo o contraseña incorrectos." });
    expect(Object.keys(r.cuerpo.error).sort()).toEqual(["codigo", "mensaje", "solicitudId"]);
    expect(r.setCookie.filter((x) => x.startsWith("softarq_sesion="))).toEqual([]);
    expect((await cl.get("/api/v1/auth/sesion")).status).toBe(401); // la cookie es la previa
  });

  it("cuerpo inválido: 400 sin repetir los valores enviados; campos ajenos rechazados", async () => {
    const cl = nuevo();
    await cl.prepararAcceso();
    const larga = "x".repeat(129);
    const r = await cl.post("/api/v1/auth/sesion", { correo: "a@b.test", contrasena: larga });
    expect(r.status).toBe(400);
    expect(r.texto).not.toContain(larga);
    const extra = await cl.post("/api/v1/auth/sesion", { correo: "a@b.test", contrasena: "x", organizacion: "DEMO" });
    expect(extra.status).toBe(400);
  });
});

describe("rutas protegidas sin sesión válida (no hay contexto DEMO anónimo)", () => {
  it.each([
    ["GET", "/api/v1/catalogos/conceptos"],
    ["GET", "/api/v1/catalogos/opciones-precio?conceptos=CON-00007"],
    ["GET", "/api/v1/catalogos/tipos-adicional"],
    ["GET", "/api/v1/auth/sesion"],
    ["POST", "/api/v1/calculos/demo"],
    ["DELETE", "/api/v1/auth/sesion"],
  ])("%s %s sin cookie → 401 NO_AUTENTICADO", async (metodo, ruta) => {
    const r = await nuevo().solicitar(metodo, ruta, metodo === "POST" ? { cuerpo: solicitudDemoDesdeEntrada(R1.entrada) } : {});
    expect(r.status).toBe(401);
    expect(error(r).codigo).toBe("NO_AUTENTICADO");
    expect(r.texto).not.toMatch(/cotizacion|conceptos"/);
  });

  it.each([
    ["token desconocido con forma válida", "Z".repeat(43)],
    ["token mal formado", "no-es-un-token"],
  ])("%s → 401 SESION_NO_VALIDA y se borra la cookie", async (_n, token) => {
    const r = await nuevo().get("/api/v1/catalogos/tipos-adicional", { cookie: token });
    expect(r.status).toBe(401);
    expect(error(r).codigo).toBe("SESION_NO_VALIDA");
    expect(r.setCookie.find((x) => x.startsWith("softarq_sesion="))).toMatch(/Max-Age=0/);
  });

  it("la sesión previa no da acceso a rutas protegidas", async () => {
    const cl = nuevo();
    await cl.prepararAcceso();
    expect((await cl.get("/api/v1/catalogos/tipos-adicional")).status).toBe(401);
  });

  it("las rutas públicas siguen disponibles: salud y OpenAPI", async () => {
    expect((await nuevo().get("/health")).status).toBe(200);
    expect((await nuevo().get("/api/v1/openapi.json")).status).toBe(200);
  });
});

describe("expiración y revocación", () => {
  it("vence tras 30 minutos sin actividad; la actividad la mantiene viva", async () => {
    const cl = await nuevo().entrar(c("preparador.auth@softarq.test"));
    avanzar(20 * MIN);
    expect((await cl.get("/api/v1/catalogos/tipos-adicional")).status).toBe(200);
    avanzar(20 * MIN); // 40 min desde el acceso, 20 desde la última actividad
    expect((await cl.get("/api/v1/catalogos/tipos-adicional")).status).toBe(200);
    avanzar(30 * MIN);
    const r = await cl.get("/api/v1/catalogos/tipos-adicional");
    expect(r.status).toBe(401);
    expect(error(r).codigo).toBe("SESION_NO_VALIDA");
  });

  it("vence a las 8 horas aunque haya actividad (expiración absoluta)", async () => {
    const cl = await nuevo().entrar(c("preparador.auth@softarq.test"));
    for (let t = 0; t < POLITICA_SESION.absolutaMs - 20 * MIN; t += 20 * MIN) {
      avanzar(20 * MIN);
      expect((await cl.get("/api/v1/auth/sesion")).status, `minuto ${t / MIN + 20}`).toBe(200);
    }
    avanzar(20 * MIN);
    expect((await cl.get("/api/v1/auth/sesion")).status).toBe(401);
  });

  it("la sesión previa vence a los 15 minutos (el formulario de acceso caduca)", async () => {
    const cl = nuevo();
    await cl.prepararAcceso();
    avanzar(15 * MIN);
    const r = await cl.post("/api/v1/auth/sesion", { correo: "preparador.auth@softarq.test", contrasena: c("preparador.auth@softarq.test").contrasena });
    expect(r.status).toBe(403);
    expect(error(r).codigo).toBe("CSRF_NO_VALIDO");
  });

  it("una sesión revocada en la base deja de valer en la siguiente solicitud", async () => {
    const cl = await nuevo().entrar(c("preparador.auth@softarq.test"));
    await migrador.sesion.update({
      where: { tokenHash: createHash("sha256").update(cl.cookie!).digest() },
      data: { revocadaEn: instante, motivoRevocacion: "RESTABLECIMIENTO" },
    });
    expect((await cl.get("/api/v1/auth/sesion")).status).toBe(401);
  });

  it("cerrar sesión revoca en el servidor: la misma cookie ya no sirve", async () => {
    const cl = await nuevo().entrar(c("preparador.auth@softarq.test"));
    const token = cl.cookie!;
    const r = await cl.delete("/api/v1/auth/sesion");
    expect(r.status).toBe(204);
    expect(r.setCookie.find((x) => x.startsWith("softarq_sesion="))).toMatch(/Max-Age=0/);
    expect(cl.cookie).toBeNull();
    for (const ruta of ["/api/v1/auth/sesion", "/api/v1/catalogos/tipos-adicional"]) {
      expect((await cl.get(ruta, { cookie: token })).status).toBe(401);
    }
    expect((await cl.post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada), { cookie: token })).status).toBe(401);
    const fila = await migrador.sesion.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest() } });
    expect(fila?.motivoRevocacion).toBe("CIERRE");
  });
});

describe("CSRF (synchronizer token ligado a la sesión) y origen", () => {
  let preparador: ClienteHttp;
  beforeEach(async () => {
    preparador = await nuevo().entrar(c("preparador.auth@softarq.test"));
  });

  it.each([
    ["ausente", null],
    ["inválido", "Q".repeat(43)],
    ["mal formado", "abc"],
  ])("CSRF %s → 403 en cálculo y cierre", async (_n, csrf) => {
    const calc = await preparador.post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada), { csrf });
    expect(calc.status).toBe(403);
    expect(error(calc).codigo).toBe("CSRF_NO_VALIDO");
    const cierre = await preparador.delete("/api/v1/auth/sesion", { csrf });
    expect(cierre.status).toBe(403);
    expect((await preparador.get("/api/v1/auth/sesion")).status).toBe(200); // sigue abierta
  });

  it("el CSRF de otra sesión no sirve", async () => {
    const otro = await nuevo().entrar(c("revisor.auth@softarq.test"));
    const r = await preparador.delete("/api/v1/auth/sesion", { csrf: otro.csrf });
    expect(r.status).toBe(403);
    expect(error(r).codigo).toBe("CSRF_NO_VALIDO");
  });

  it("CSRF válido: el cálculo responde con el total de referencia", async () => {
    const r = await calcular(preparador);
    expect(r.status, r.texto).toBe(200);
    expect(r.cuerpo.cotizacion.total).toBe(R1.esperado.total);
  });

  it("inicio de sesión sin CSRF, con uno inválido o con el de otra sesión previa → 403", async () => {
    const credencial = c("preparador.auth@softarq.test");
    const a = nuevo();
    await a.prepararAcceso();
    const b = nuevo();
    await b.prepararAcceso();
    for (const csrf of [null, "Q".repeat(43), b.csrf]) {
      const r = await a.post("/api/v1/auth/sesion", credencial, { csrf });
      expect(r.status).toBe(403);
      expect(error(r).codigo).toBe("CSRF_NO_VALIDO");
    }
    expect((await a.post("/api/v1/auth/sesion", credencial)).status).toBe(200);
  });

  it.each([
    ["ajeno", ORIGEN_AJENO],
    ["ausente", null],
  ])("Origin %s → 403 ORIGEN_NO_PERMITIDO en cálculo, acceso y cierre", async (_n, origen) => {
    const calc = await preparador.post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada), { origen });
    expect(calc.status).toBe(403);
    expect(error(calc).codigo).toBe("ORIGEN_NO_PERMITIDO");
    expect((await preparador.delete("/api/v1/auth/sesion", { origen })).status).toBe(403);
    const a = nuevo();
    await a.prepararAcceso();
    expect((await a.post("/api/v1/auth/sesion", c("preparador.auth@softarq.test"), { origen })).status).toBe(403);
  });

  it("CORS no autoriza credenciales a un origen ajeno", async () => {
    const r = await preparador.get("/api/v1/auth/sesion", { cabeceras: { Origin: ORIGEN_AJENO } });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("límites de intentos de acceso (temporales, nunca permanentes)", () => {
  it("cuenta + IP: tras 3 fallos, 429 con Retry-After incluso con la contraseña correcta; al terminar la ventana, vuelve a entrar", async () => {
    const limitado = await iniciar({ accesos: { ventanaMs: 15 * MIN, fallosPorCuentaEIp: 3, fallosPorCuenta: 100, intentosPorIp: 100 } });
    try {
      const credencial = c("preparador.auth@softarq.test");
      const cl = new ClienteHttp(limitado.url);
      for (let i = 0; i < 3; i++) expect((await cl.iniciarSesion({ ...credencial, contrasena: "mala" })).status).toBe(401);
      const bloqueado = await cl.iniciarSesion(credencial);
      expect(bloqueado.status).toBe(429);
      expect(error(bloqueado).codigo).toBe("DEMASIADAS_SOLICITUDES");
      expect(Number(bloqueado.headers.get("retry-after"))).toBe(15 * 60);
      // Las cuentas inexistentes se limitan igual (no revela si existen).
      for (let i = 0; i < 3; i++) await cl.iniciarSesion({ correo: "fantasma@softarq.test", contrasena: "x" });
      expect((await cl.iniciarSesion({ correo: "fantasma@softarq.test", contrasena: "x" })).status).toBe(429);
      // Otra cuenta desde la misma IP no está bloqueada.
      expect((await cl.iniciarSesion(c("revisor.auth@softarq.test"))).status).toBe(200);
      avanzar(15 * MIN);
      expect((await new ClienteHttp(limitado.url).iniciarSesion(credencial)).status).toBe(200);
    } finally {
      await limitado.app.close();
    }
  });

  it("IP: tras 4 intentos de cualquier cuenta, 429 hasta el fin de la ventana", async () => {
    const limitado = await iniciar({ accesos: { ventanaMs: 15 * MIN, fallosPorCuentaEIp: 100, fallosPorCuenta: 100, intentosPorIp: 4 } });
    try {
      const cl = new ClienteHttp(limitado.url);
      for (let i = 0; i < 4; i++) expect((await cl.iniciarSesion({ correo: `x${i}@softarq.test`, contrasena: "x" })).status).toBe(401);
      expect((await cl.iniciarSesion(c("preparador.auth@softarq.test"))).status).toBe(429);
      avanzar(15 * MIN);
      expect((await cl.iniciarSesion(c("preparador.auth@softarq.test"))).status).toBe(200);
    } finally {
      await limitado.app.close();
    }
  });
});

describe("permisos según la matriz (la API decide; el cliente no envía funciones)", () => {
  it("Revisor: consulta catálogos pero no calcula (403 SIN_PERMISO)", async () => {
    const rev = await nuevo().entrar(c("revisor.auth@softarq.test"));
    expect((await rev.get("/api/v1/catalogos/conceptos")).status).toBe(200);
    expect((await rev.get("/api/v1/catalogos/opciones-precio?conceptos=CON-00007")).status).toBe(200);
    const r = await calcular(rev);
    expect(r.status).toBe(403);
    expect(error(r)).toMatchObject({ codigo: "SIN_PERMISO", mensaje: "Su función no permite esta operación." });
    expect(r.texto).not.toContain("cotizacion");
  });

  it("Preparador: calcula", async () => {
    const r = await calcular(await nuevo().entrar(c("preparador.auth@softarq.test")));
    expect(r.status).toBe(200);
  });

  it("enviar una función o capacidad en cabeceras o en el cuerpo no concede nada", async () => {
    const rev = await nuevo().entrar(c("revisor.auth@softarq.test"));
    const r = await rev.post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada), {
      cabeceras: { "X-Funcion": "PREPARADOR", "X-Capacidades": "calculo.ejecutar" },
    });
    expect(r.status).toBe(403);
    const cuerpo = await rev.post("/api/v1/calculos/demo", { ...solicitudDemoDesdeEntrada(R1.entrada), funciones: ["PREPARADOR"] });
    expect([400, 403]).toContain(cuerpo.status);
  });

  it("un cambio de funciones en la pertenencia afecta a la siguiente solicitud", async () => {
    const cl = await nuevo().entrar(c("cambios.auth@softarq.test"));
    expect((await calcular(cl)).status).toBe(200);
    await migrador.membresia.updateMany({ where: { usuario: { correo: "cambios.auth@softarq.test" } }, data: { funciones: ["REVISOR"] } });
    expect((await calcular(cl)).status).toBe(403);
    expect((await cl.get("/api/v1/auth/sesion")).cuerpo.funciones).toEqual(["REVISOR"]);
    await migrador.membresia.updateMany({ where: { usuario: { correo: "cambios.auth@softarq.test" } }, data: { funciones: ["PREPARADOR"] } });
    expect((await calcular(cl)).status).toBe(200);
  });
});

describe("desactivación de cuentas y pertenencias", () => {
  it("usuario desactivado: 401 en la siguiente solicitud, sesión revocada y no revive al reactivarlo", async () => {
    const cl = await nuevo().entrar(c("baja.auth@softarq.test"));
    const token = cl.cookie!;
    await migrador.usuario.update({ where: { correo: "baja.auth@softarq.test" }, data: { activo: false } });
    const r = await cl.get("/api/v1/catalogos/tipos-adicional");
    expect(r.status).toBe(401);
    expect(error(r).codigo).toBe("SESION_NO_VALIDA");
    const fila = await migrador.sesion.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest() } });
    expect(fila?.motivoRevocacion).toBe("USUARIO_INACTIVO");
    await migrador.usuario.update({ where: { correo: "baja.auth@softarq.test" }, data: { activo: true } });
    expect((await cl.get("/api/v1/auth/sesion", { cookie: token })).status).toBe(401);
    expect((await nuevo().iniciarSesion(c("baja.auth@softarq.test"))).status).toBe(200); // nueva sesión, nuevo token
  });

  it("pertenencia desactivada: 401 en la siguiente solicitud y el acceso posterior falla con el mensaje genérico", async () => {
    const cl = await nuevo().entrar(c("bajam.auth@softarq.test"));
    await migrador.membresia.updateMany({ where: { usuario: { correo: "bajam.auth@softarq.test" } }, data: { activa: false } });
    expect((await cl.get("/api/v1/auth/sesion")).status).toBe(401);
    const filas = await migrador.sesion.findMany({ where: { membresia: { is: { usuario: { correo: "bajam.auth@softarq.test" } } } } });
    expect(filas.some((f) => f.motivoRevocacion === "MEMBRESIA_INACTIVA")).toBe(true);
    const r = await nuevo().iniciarSesion(c("bajam.auth@softarq.test"));
    expect(r.status).toBe(401);
    expect(error(r).codigo).toBe("CREDENCIALES_INVALIDAS");
  });
});

describe("sin secretos en respuestas ni registros", () => {
  it("ni contraseñas, ni tokens, ni hashes, ni el correo en los registros; las respuestas no exponen el token", async () => {
    const conRegistro = await iniciar({ registro: "completo" });
    // Todo lo que la API envía al registro (Logger de Nest: HTTP, Seguridad, Errores).
    const salida: string[] = [];
    const anotar = (...partes: unknown[]) => void salida.push(partes.map(String).join(" "));
    Logger.overrideLogger({ log: anotar, error: anotar, warn: anotar, debug: anotar, verbose: anotar, fatal: anotar });
    const respuestas: Respuesta[] = [];
    let cl: ClienteHttp;
    const credencial = c("preparador.auth@softarq.test");
    try {
      cl = new ClienteHttp(conRegistro.url);
      respuestas.push(await cl.iniciarSesion({ ...credencial, contrasena: "clave-equivocada-123" }));
      respuestas.push(await cl.iniciarSesion(credencial));
      respuestas.push(await cl.get("/api/v1/auth/sesion"));
      respuestas.push(await calcular(cl));
      respuestas.push(await cl.delete("/api/v1/auth/sesion"));
    } finally {
      Logger.overrideLogger(false);
      await conRegistro.app.close();
    }
    const registro = salida.join("");
    expect(registro).toContain("ACCESO_FALLO");
    expect(registro).toContain("ACCESO_OK");
    expect(registro).toContain("CIERRE");
    const tokenSesion = respuestas[1]!.setCookie.find((x) => x.startsWith("softarq_sesion="))!.split(";")[0]!.split("=")[1]!;
    const csrf = respuestas[1]!.cuerpo.csrfToken as string;
    for (const prohibido of [credencial.contrasena, "clave-equivocada-123", tokenSesion, csrf, "$argon2id", credencial.correo, "softarq_sesion="]) {
      expect(registro, `registro contiene ${prohibido.slice(0, 6)}…`).not.toContain(prohibido);
    }
    for (const r of respuestas) {
      expect(r.texto).not.toContain(tokenSesion);
      expect(r.texto).not.toContain("$argon2id");
      expect(r.texto).not.toContain(credencial.contrasena);
      expect(r.texto).not.toMatch(/token_?hash|hashContrasena/i);
    }
  });
});
