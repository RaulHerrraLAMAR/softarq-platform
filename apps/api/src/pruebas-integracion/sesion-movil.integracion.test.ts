/**
 * Canal móvil (módulo 16, ADR-0020; reorientado por el módulo 17, ADR-0021) por HTTP contra la API real y PostgreSQL (solo
 * softarq_test): acceso sin cookie ni CSRF, sesión de tipo MOVIL con Bearer, lista blanca de rutas, aislamiento entre canales y
 * entre organizaciones, revocación, contraseña temporal, expiración (con un reloj de sesiones) y que la web no cambia.
 *
 * La etapa 1 probaba estas mecánicas con cuentas internas (Preparador, Revisor…) que consultaban clientes y cotizaciones desde la
 * app. Desde el módulo 17 la app es solo del cliente: aquí las mismas mecánicas se prueban con cuentas de CLIENTE, y que una cuenta
 * interna reciba `CUENTA_INTERNA_USE_PANEL` y no pueda usar las rutas internas por Bearer se verifica en `cliente.integracion.test.ts`
 * y en la sección «lista blanca» de este archivo. Los recorridos del cliente (solicitud, estimación, cotizaciones) están en ese archivo.
 */
import { Logger, type INestApplication } from "@nestjs/common";
import { EsquemaRespuestaAccesoMovil, EsquemaRespuestaSesionMovil } from "@softarq/contracts";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { POLITICA_SESION } from "../modules/autenticacion/dominio/politica.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarClientesDemo } from "../modules/cliente/demo/cargar-clientes-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, ClienteMovil, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";

const MOTIVO = "[DEMO] Comprobación del canal móvil.";
const MIN = 60_000;
const NUEVA = "contrasena-definitiva-de-prueba-2";
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const cred: Record<string, Credencial> = {};
const temporales: Record<string, string> = {};
const idem = (clave: string = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });
const web = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const movil = (correo: string) => new ClienteMovil(url).entrar(cred[correo]!);
const sha = (t: string) => createHash("sha256").update(t).digest();

/** Instante de la política de sesiones, controlado por las pruebas (parte de la hora real). */
let instante = new Date();
const avanzar = (ms: number) => (instante = new Date(instante.getTime() + ms));

const PREP = "prep.mov@softarq.test";
const SIS = "sis.mov@softarq.test";
const CAT = "cat.mov@softarq.test";
const LAURA = "laura.mendez@mov-a.softarq.test";
const HECTOR = "hector.rios@mov-a.softarq.test";
const SILVIA = "silvia.aranda@mov-a.softarq.test";
const LAURA_B = "laura.mendez@mov-b.softarq.test";

/** Cambia una contraseña temporal por una definitiva y deja la credencial lista para entrar. */
async function activar(correo: string): Promise<void> {
  const t = await new ClienteMovil(url).entrar({ correo, contrasena: temporales[correo]! });
  const r = await t.post("/api/v1/auth/contrasena", { actual: temporales[correo]!, nueva: NUEVA, confirmacion: NUEVA });
  expect(r.status, r.texto).toBe(204);
  cred[correo] = { correo, contrasena: NUEVA };
}

/** Un cliente más, con su acceso creado como lo haría el equipo (Preparador crea el Cliente; el Administrador del sistema, el acceso). */
async function nuevoAcceso(prefijo: string): Promise<{ correo: string; temporal: string; usuarioId: string }> {
  const p = await web(PREP);
  const c = await p.post("/api/v1/clientes", { nombre: `Cliente ${prefijo} ${randomUUID().slice(0, 6)}`, contactoNombre: "Contacto", contactoTelefono: "55 5550 1234" }, idem());
  expect(c.status, c.texto).toBe(201);
  const correo = `${prefijo}.${randomUUID().slice(0, 6)}@mov-a.softarq.test`;
  const a = await (await web(SIS)).post(`/api/v1/clientes/${c.cuerpo.id}/acceso`, { correo, nombre: `Cliente ${prefijo}`, motivo: MOTIVO }, idem());
  expect(a.status, a.texto).toBe(201);
  return { correo, temporal: a.cuerpo.contrasenaTemporal as string, usuarioId: a.cuerpo.acceso.usuarioId as string };
}

beforeAll(async () => {
  await cargarDemo(prisma, { codigo: "DEMO-MOV-A", nombre: "[DEMO] Móvil A" });
  await cargarDemo(prisma, { codigo: "DEMO-MOV-B", nombre: "[DEMO] Móvil B" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-MOV-A", [
      cuenta(PREP, "[DEMO] Preparador móvil", "PREPARADOR"),
      cuenta(SIS, "[DEMO] Administrador del sistema móvil", "ADMIN_SISTEMA"),
      cuenta(CAT, "[DEMO] Administrador del catálogo móvil", "ADMIN_CATALOGO"),
    ]),
    await crearCuentas(migrador, "DEMO-MOV-B", [
      cuenta("prep.movb@softarq.test", "[DEMO] Preparador móvil B", "PREPARADOR"),
      cuenta("sis.movb@softarq.test", "[DEMO] Sistema móvil B", "ADMIN_SISTEMA"),
      cuenta("cat.movb@softarq.test", "[DEMO] Catálogo móvil B", "ADMIN_CATALOGO"),
    ]),
  );
  const contrasenas = new ServicioContrasenas();
  for (const [org, dominio] of [["DEMO-MOV-A", "mov-a.softarq.test"], ["DEMO-MOV-B", "mov-b.softarq.test"]] as const) {
    const r = await cargarClientesDemo(migrador, contrasenas, { organizacion: org, fecha: "2026-09-25", dominioCorreo: dominio });
    for (const c of r.accesosCreados) temporales[c.correo] = c.contrasena;
  }
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "5000", API_ACCESO_INTENTOS_IP: "1000", API_ACCESO_FALLOS_CUENTA: "1000" }),
    { reloj: new RelojFijo("2026-09-25"), relojSesiones: { ahora: () => instante } },
  );
  app.useLogger(false);
  Logger.overrideLogger(false);
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  for (const correo of [LAURA, HECTOR, SILVIA, LAURA_B]) await activar(correo);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
});

describe("inicio de sesión móvil", () => {
  it("correcto: contexto de la base, token opaco una sola vez, sin cookie ni CSRF; la base guarda tipo MOVIL y solo el SHA-256", async () => {
    const cl = new ClienteMovil(url);
    const r = await cl.iniciarSesion(cred[LAURA]!);
    expect(r.status, r.texto).toBe(200);
    const s = EsquemaRespuestaAccesoMovil.parse(r.cuerpo);
    expect(s.usuario.correo).toBe(LAURA);
    expect(s.organizacion).toEqual({ codigo: "DEMO-MOV-A", nombre: "[DEMO] Móvil A", esDemo: true });
    expect(s.funciones).toEqual(["CLIENTE"]);
    expect(s.capacidades).toEqual(["sesion.propia", "cliente.solicitudes", "cliente.cotizaciones"]);
    expect(s.cambioContrasenaRequerido).toBe(false);
    expect(Object.keys(r.cuerpo)).not.toContain("csrfToken");
    expect(r.setCookie).toEqual([]);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(s.tokenSesion).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const fila = await migrador.sesion.findUniqueOrThrow({ where: { tokenHash: new Uint8Array(sha(s.tokenSesion)) } });
    expect(fila).toMatchObject({ tipo: "MOVIL", revocadaEn: null });
    expect(fila.expiraEn.getTime() - fila.creadaEn.getTime()).toBe(POLITICA_SESION.absolutaMs);
    expect(JSON.stringify(fila)).not.toContain(s.tokenSesion);
  });

  it("no es un acceso de navegador: con Origin (también el permitido) o con Authorization responde 403 sin crear sesión", async () => {
    const antes = await migrador.sesion.count({ where: { tipo: "MOVIL" } });
    const c = new ClienteMovil(url);
    for (const origin of ["http://localhost:5173", "http://evil.example.test"]) {
      const r = await c.iniciarSesion(cred[LAURA]!, { Origin: origin });
      expect(r.status).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
    }
    const conBearer = await c.post("/api/v1/auth/movil/sesion", { correo: LAURA, contrasena: cred[LAURA]!.contrasena }, { token: "A".repeat(43) });
    expect(conBearer.cuerpo.error.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
    expect(await migrador.sesion.count({ where: { tipo: "MOVIL" } })).toBe(antes);
  });

  it("credenciales incorrectas: mensaje único (401); cuerpo inválido: 400", async () => {
    const c = new ClienteMovil(url);
    const mala = await c.iniciarSesion({ correo: LAURA, contrasena: "no-es" });
    const inexistente = await c.iniciarSesion({ correo: "nadie.mov@softarq.test", contrasena: "no-es" });
    expect(mala.status).toBe(401);
    expect(mala.cuerpo.error).toMatchObject({ codigo: "CREDENCIALES_INVALIDAS", mensaje: "Correo o contraseña incorrectos." });
    expect(inexistente.cuerpo.error.mensaje).toBe(mala.cuerpo.error.mensaje);
    expect((await c.post("/api/v1/auth/movil/sesion", { correo: "x@y.test" }, { token: null })).status).toBe(400);
    expect((await c.post("/api/v1/auth/movil/sesion", { correo: "x@y.test", contrasena: "z", extra: 1 }, { token: null })).status).toBe(400);
  });

  it("el limitador de accesos aplica al canal móvil: 5 fallos y el siguiente intento, aun correcto, recibe 429 con Retry-After", async () => {
    const n = await nuevoAcceso("limite");
    const c = new ClienteMovil(url);
    for (let i = 0; i < 5; i++) expect((await c.iniciarSesion({ correo: n.correo, contrasena: "mala" })).status).toBe(401);
    const bloqueado = await c.iniciarSesion({ correo: n.correo, contrasena: n.temporal });
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("una cuenta interna con la contraseña correcta: 403 CUENTA_INTERNA_USE_PANEL, sin sesión ni token", async () => {
    const r = await new ClienteMovil(url).iniciarSesion(cred[PREP]!);
    expect(r.status).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("CUENTA_INTERNA_USE_PANEL");
    expect(r.cuerpo.error.panelUrl).toBe("http://localhost:5173");
    expect(r.cuerpo.tokenSesion).toBeUndefined();
  });
});

describe("sesión móvil y revalidación", () => {
  it("GET /auth/movil/sesion devuelve el contexto vigente sin token ni CSRF", async () => {
    const cl = await movil(LAURA);
    const r = await cl.get("/api/v1/auth/movil/sesion");
    expect(r.status).toBe(200);
    expect(EsquemaRespuestaSesionMovil.parse(r.cuerpo).usuario.correo).toBe(LAURA);
    expect(Object.keys(r.cuerpo)).not.toEqual(expect.arrayContaining(["tokenSesion", "csrfToken"]));
  });

  it("sin token, con token inventado o con un esquema distinto: 401", async () => {
    const c = new ClienteMovil(url);
    expect((await c.get("/api/v1/auth/movil/sesion")).status).toBe(401);
    expect((await c.get("/api/v1/auth/movil/sesion", { token: "A".repeat(43) })).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
    expect((await c.get("/api/v1/auth/movil/sesion", { cabeceras: { Authorization: "Basic YTpi" }, token: null })).cuerpo.error.codigo).toBe("NO_AUTENTICADO");
  });

  it("una sesión web (cookie) no entra al canal móvil ni su cookie sirve como Bearer, y al revés", async () => {
    const w = await web(PREP);
    const m = await movil(LAURA);
    expect((await w.get("/api/v1/auth/movil/sesion")).cuerpo.error.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
    expect((await new ClienteMovil(url).get("/api/v1/cliente/trabajos", { token: w.cookie })).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
    expect((await new ClienteHttp(url).get("/api/v1/cliente/trabajos", { cookie: m.token })).status).toBe(401);
    expect((await w.get("/api/v1/clientes")).status).toBe(200); // la sesión web no se vio afectada
    expect((await m.get("/api/v1/cliente/trabajos")).status).toBe(200);
  });

  it("Bearer válido con una cookie web ajena o inválida: manda el Bearer", async () => {
    const m = await movil(LAURA);
    const r = await m.get("/api/v1/cliente/trabajos", { cabeceras: { Cookie: `softarq_sesion=${"B".repeat(43)}` } });
    expect(r.status).toBe(200);
  });
});

describe("lista blanca: lo que el móvil no puede hacer aunque tenga sesión", () => {
  it("clientes, proyectos y cotizaciones internos, escrituras, cálculo, catálogos, administración, PDF interno y salidas → 403 RUTA_NO_DISPONIBLE_EN_MOVIL", async () => {
    const c = await movil(LAURA);
    const intentos: [string, string, unknown?][] = [
      ["GET", "/api/v1/clientes"],
      ["GET", "/api/v1/proyectos"],
      ["GET", "/api/v1/cotizaciones"],
      ["GET", `/api/v1/cotizaciones/${randomUUID()}`],
      ["GET", `/api/v1/cotizaciones/${randomUUID()}/versiones/1`],
      ["POST", "/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }],
      ["POST", "/api/v1/cotizaciones", { proyectoId: randomUUID() }],
      ["POST", "/api/v1/calculos/demo", {}],
      ["GET", "/api/v1/catalogos/conceptos"],
      ["GET", `/api/v1/emisiones/${randomUUID()}/documento`],
      ["GET", "/api/v1/revisiones"],
      ["GET", "/api/v1/solicitudes"],
      ["GET", "/api/v1/admin/personas"],
      ["GET", "/api/v1/admin/referencias-estimacion"],
      ["GET", "/api/v1/emisor"],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const r = await c.solicitar(metodo, ruta, cuerpo === undefined ? {} : { cuerpo });
      expect(r.status, `${metodo} ${ruta}`).toBe(403);
      expect(r.cuerpo.error.codigo, `${metodo} ${ruta}`).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
    }
  });

  it("las rutas del cliente exigen su capacidad: una sesión móvil sin ella recibe 403 aunque la ruta sea de la lista blanca", async () => {
    const n = await nuevoAcceso("temporal");
    const m = new ClienteMovil(url);
    await m.iniciarSesion({ correo: n.correo, contrasena: n.temporal });
    const r = await m.get("/api/v1/cliente/trabajos");
    expect(r.status).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
  });

  it("OPTIONS desde el origen web no autoriza la cabecera Authorization (CORS de la web sin cambios)", async () => {
    const r = await fetch(`${url}/api/v1/cliente/trabajos`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
    });
    expect((r.headers.get("access-control-allow-headers") ?? "").toLowerCase()).not.toContain("authorization");
  });
});

describe("aislamiento entre organizaciones", () => {
  it("el cliente de otra organización no ve el catálogo ni los datos de esta, aunque use el mismo nombre de cliente", async () => {
    const a = await movil(LAURA);
    const b = await movil(LAURA_B);
    const pa = (await a.get("/api/v1/cliente/proyectos")).cuerpo.proyectos.map((x: { id: string }) => x.id);
    const pb = (await b.get("/api/v1/cliente/proyectos")).cuerpo.proyectos.map((x: { id: string }) => x.id);
    expect(pa.length).toBeGreaterThan(0);
    expect(pa.filter((id: string) => pb.includes(id))).toEqual([]);
    const sol = await a.post("/api/v1/cliente/solicitudes", { proyectoId: pa[0], captura: { trabajos: [], notas: null } });
    expect(sol.status, sol.texto).toBe(201);
    expect((await b.get(`/api/v1/cliente/solicitudes/${sol.cuerpo.id}`)).status).toBe(404);
  });
});

describe("cierre, revocación y pérdida de acceso", () => {
  it("cerrar la sesión (DELETE /auth/sesion con Bearer) revoca en la base y el mismo token deja de servir", async () => {
    const cl = await movil(LAURA);
    const token = cl.token!;
    expect((await cl.delete("/api/v1/auth/sesion")).status).toBe(204);
    expect((await cl.get("/api/v1/cliente/trabajos")).status).toBe(401);
    const fila = await migrador.sesion.findUniqueOrThrow({ where: { tokenHash: new Uint8Array(sha(token)) } });
    expect(fila.motivoRevocacion).toBe("CIERRE");
    expect((await cl.delete("/api/v1/auth/sesion")).status).toBe(401);
  });

  it("el Administrador del sistema desactiva el acceso: la sesión móvil se cierra con 401 y reactivar no la revive", async () => {
    const adm = await web(SIS);
    const m = await movil(HECTOR);
    expect((await m.get("/api/v1/cliente/trabajos")).status).toBe(200);
    const u = (await migrador.$queryRaw<{ id: string }[]>`SELECT id FROM usuario WHERE correo = ${HECTOR}`)[0]!.id;
    const baja = await adm.put(`/api/v1/admin/accesos-cliente/${u}/estado`, { activo: false, motivo: MOTIVO }, idem());
    expect(baja.status, baja.texto).toBe(200);
    expect((await m.get("/api/v1/cliente/trabajos")).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
    expect((await new ClienteMovil(url).iniciarSesion(cred[HECTOR]!)).status).toBe(401);
    expect((await adm.put(`/api/v1/admin/accesos-cliente/${u}/estado`, { activo: true, motivo: MOTIVO }, idem())).status).toBe(200);
    expect((await m.get("/api/v1/cliente/trabajos")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion(cred[HECTOR]!)).status).toBe(200);
  });

  it("restablecer la contraseña revoca las sesiones móviles del cliente; con la temporal nueva entra, pero restringido", async () => {
    const adm = await web(SIS);
    const m = await movil(HECTOR);
    const u = (await migrador.$queryRaw<{ id: string }[]>`SELECT id FROM usuario WHERE correo = ${HECTOR}`)[0]!.id;
    const r = await adm.post(`/api/v1/admin/accesos-cliente/${u}/contrasena`, { motivo: MOTIVO }, idem());
    expect(r.status, r.texto).toBe(201);
    expect((await m.get("/api/v1/cliente/trabajos")).status).toBe(401);
    const acceso = await new ClienteMovil(url).iniciarSesion({ correo: HECTOR, contrasena: r.cuerpo.contrasenaTemporal });
    expect(acceso.status).toBe(200);
    expect(acceso.cuerpo).toMatchObject({ cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    temporales[HECTOR] = r.cuerpo.contrasenaTemporal;
    await activar(HECTOR);
  });
});

describe("contraseña temporal en el móvil", () => {
  it("acceso restringido; el cambio con Bearer revoca TODAS las sesiones y exige volver a entrar", async () => {
    const n = await nuevoAcceso("primera");
    const m = new ClienteMovil(url);
    const acceso = await m.iniciarSesion({ correo: n.correo, contrasena: n.temporal });
    expect(acceso.status).toBe(200);
    expect(acceso.cuerpo).toMatchObject({ cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    const otra = await new ClienteMovil(url).entrar({ correo: n.correo, contrasena: n.temporal });
    for (const ruta of ["/api/v1/cliente/trabajos", "/api/v1/cliente/proyectos", "/api/v1/cliente/solicitudes", "/api/v1/cliente/cotizaciones"]) {
      const r = await m.get(ruta);
      expect(r.status, ruta).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
    }
    expect((await m.get("/api/v1/auth/movil/sesion")).status).toBe(200); // revalidar sí se permite
    const nueva = `Nueva-${randomUUID()}`;
    expect((await m.post("/api/v1/auth/contrasena", { actual: "incorrecta", nueva, confirmacion: nueva })).cuerpo.error.codigo).toBe("CONTRASENA_ACTUAL_INCORRECTA");
    expect((await m.post("/api/v1/auth/contrasena", { actual: n.temporal, nueva: "corta", confirmacion: "corta" })).status).toBe(400);
    const cambio = await m.post("/api/v1/auth/contrasena", { actual: n.temporal, nueva, confirmacion: nueva });
    expect(cambio.status, cambio.texto).toBe(204);
    expect((await m.get("/api/v1/auth/movil/sesion")).status).toBe(401);
    expect((await otra.get("/api/v1/auth/movil/sesion")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion({ correo: n.correo, contrasena: n.temporal })).status).toBe(401);
    const normal = new ClienteMovil(url);
    const ok = await normal.iniciarSesion({ correo: n.correo, contrasena: nueva });
    expect(ok.status).toBe(200);
    expect(ok.cuerpo.cambioContrasenaRequerido).toBe(false);
    expect((await normal.get("/api/v1/cliente/trabajos")).status).toBe(200);
  });

  it("una temporal caducada no entra por el móvil", async () => {
    const n = await nuevoAcceso("caduca");
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() - interval '1 minute' WHERE id = ${n.usuarioId}::uuid`;
    const r = await new ClienteMovil(url).iniciarSesion({ correo: n.correo, contrasena: n.temporal });
    expect(r.status).toBe(401);
    expect(r.cuerpo.error.codigo).toBe("CONTRASENA_TEMPORAL_CADUCADA");
  });
});

describe("expiración de la sesión móvil (reloj de sesiones)", () => {
  it("30 minutos sin actividad: 401; con actividad dentro de la ventana sigue viva; a las 8 h vence aunque haya actividad", async () => {
    const inactiva = await movil(SILVIA);
    avanzar(29 * MIN);
    expect((await inactiva.get("/api/v1/cliente/trabajos")).status).toBe(200);
    avanzar(29 * MIN);
    expect((await inactiva.get("/api/v1/cliente/trabajos")).status).toBe(200);
    avanzar(31 * MIN);
    expect((await inactiva.get("/api/v1/cliente/trabajos")).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");

    const larga = await movil(SILVIA);
    for (let i = 0; i < 16; i++) {
      avanzar(29 * MIN);
      expect((await larga.get("/api/v1/cliente/trabajos")).status, `${i}`).toBe(200);
    }
    avanzar(29 * MIN); // 8 h 13 min desde el acceso
    expect((await larga.get("/api/v1/cliente/trabajos")).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
  });
});

describe("la web no cambia", () => {
  it("la cookie sigue exigiendo Origin permitido y CSRF; un POST web sin ellos se rechaza igual", async () => {
    const w = await web(PREP);
    expect((await w.post("/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }, { origen: null, ...idem() })).cuerpo.error.codigo).toBe("ORIGEN_NO_PERMITIDO");
    expect((await w.post("/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }, { csrf: null, ...idem() })).cuerpo.error.codigo).toBe("CSRF_NO_VALIDO");
    const ok = await w.post("/api/v1/clientes", { nombre: `[DEMO] Cliente web ${randomUUID().slice(0, 6)}`, contactoNombre: "y", contactoTelefono: "55 1234 5678" }, idem());
    expect(ok.status, ok.texto).toBe(201);
  });
});
