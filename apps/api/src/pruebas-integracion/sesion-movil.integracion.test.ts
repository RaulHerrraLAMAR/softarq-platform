/**
 * Canal móvil (módulo 16, ADR-0020) por HTTP contra la API real y PostgreSQL (solo softarq_test):
 * acceso sin cookie ni CSRF, sesión de tipo MOVIL con Bearer, lista blanca de rutas, aislamiento
 * entre canales y entre organizaciones, revocación, desactivación, contraseña temporal, expiración
 * (con un reloj de sesiones) y que la web (cookie, CSRF, Origin, CORS) no cambia.
 */
import { Logger, type INestApplication } from "@nestjs/common";
import {
  EsquemaDetalleCotizacion,
  EsquemaRespuestaAccesoMovil,
  EsquemaRespuestaSesionMovil,
  EsquemaVersion,
  type CapturaBorrador,
  type EntradaCalculo,
} from "@softarq/contracts";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { POLITICA_SESION } from "../modules/autenticacion/dominio/politica.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, ClienteMovil, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const MOTIVO = "[DEMO] Comprobación del canal móvil (módulo 16).";
const MIN = 60_000;
/** Claves que solo existen en los contratos internos; nunca en una respuesta de consulta comercial. */
const INTERNAS = /costoProrrateado|costoCompra|costoDirecto|costoMateriales|margen|recargo|sobrante|consumoBase|proveedor|referenciasInternas|resultadoInterno|entradaCalculo/i;

const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const cred: Record<string, Credencial> = {};
const idem = (clave: string = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });
const web = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const movil = (correo: string) => new ClienteMovil(url).entrar(cred[correo]!);
const sha = (t: string) => createHash("sha256").update(t).digest();

/** Instante de la política de sesiones, controlado por las pruebas (parte de la hora real). */
let instante = new Date();
const avanzar = (ms: number) => (instante = new Date(instante.getTime() + ms));

let cotA: { id: string; folio: string; clienteId: string; proyectoId: string };

async function cotizacionDe(c: ClienteHttp, captura: CapturaBorrador) {
  const s = randomUUID().slice(0, 6);
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente móvil ${s}`, contactoNombre: "Contacto", contactoTelefono: "55 1234 5678" }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra móvil ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán" }, idem());
  expect(pry.status, pry.texto).toBe(201);
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
  expect(cot.status, cot.texto).toBe(201);
  const v = await c.post(`/api/v1/cotizaciones/${cot.cuerpo.cotizacion.id}/versiones`, { revisionBorrador: cot.cuerpo.borrador.revision }, idem());
  expect(v.status, v.texto).toBe(201);
  return { id: cot.cuerpo.cotizacion.id as string, folio: cot.cuerpo.cotizacion.folio as string, clienteId: cli.cuerpo.id as string, proyectoId: pry.cuerpo.id as string };
}

beforeAll(async () => {
  await cargarDemo(prisma, { codigo: "DEMO-MOV-A", nombre: "[DEMO] Móvil A" });
  await cargarDemo(prisma, { codigo: "DEMO-MOV-B", nombre: "[DEMO] Móvil B" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-MOV-A", [
      cuenta("prep.mov@softarq.test", "[DEMO] Preparador móvil", "PREPARADOR"),
      cuenta("rev.mov@softarq.test", "[DEMO] Revisor móvil", "REVISOR"),
      cuenta("sis.mov@softarq.test", "[DEMO] Administrador del sistema móvil", "ADMIN_SISTEMA"),
      cuenta("sis2.mov@softarq.test", "[DEMO] Segundo administrador del sistema móvil", "ADMIN_SISTEMA"),
      cuenta("cat.mov@softarq.test", "[DEMO] Administrador del catálogo móvil", "ADMIN_CATALOGO"),
      cuenta("limite.mov@softarq.test", "[DEMO] Cuenta del limitador móvil", "PREPARADOR"),
      cuenta("baja.mov@softarq.test", "[DEMO] Cuenta de baja móvil", "PREPARADOR"),
      cuenta("funciones.mov@softarq.test", "[DEMO] Cuenta de funciones móvil", "PREPARADOR"),
      cuenta("reloj.mov@softarq.test", "[DEMO] Cuenta de expiración móvil", "PREPARADOR"),
    ]),
    await crearCuentas(migrador, "DEMO-MOV-B", [cuenta("prep.movb@softarq.test", "[DEMO] Preparador móvil B", "PREPARADOR")]),
  );
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "5000", API_ACCESO_INTENTOS_IP: "1000", API_ACCESO_FALLOS_CUENTA: "1000" }),
    { reloj: new RelojFijo("2026-09-25"), relojSesiones: { ahora: () => instante } },
  );
  app.useLogger(false);
  Logger.overrideLogger(false);
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  cotA = await cotizacionDe(await web("prep.mov@softarq.test"), borradorDesdeEntrada(R1.entrada as EntradaCalculo));
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
});

describe("inicio de sesión móvil", () => {
  it("correcto: contexto de la base, token opaco una sola vez, sin cookie ni CSRF; la base guarda tipo MOVIL y solo el SHA-256", async () => {
    const cl = new ClienteMovil(url);
    const r = await cl.iniciarSesion(cred["prep.mov@softarq.test"]!);
    expect(r.status, r.texto).toBe(200);
    const s = EsquemaRespuestaAccesoMovil.parse(r.cuerpo);
    expect(s.usuario.correo).toBe("prep.mov@softarq.test");
    expect(s.organizacion).toEqual({ codigo: "DEMO-MOV-A", nombre: "[DEMO] Móvil A", esDemo: true });
    expect(s.funciones).toEqual(["PREPARADOR"]);
    expect(s.capacidades).toContain("cotizaciones.consultar");
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
      const r = await c.iniciarSesion(cred["prep.mov@softarq.test"]!, { Origin: origin });
      expect(r.status).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
    }
    const conBearer = await c.post("/api/v1/auth/movil/sesion", { correo: "prep.mov@softarq.test", contrasena: cred["prep.mov@softarq.test"]!.contrasena }, { token: "A".repeat(43) });
    expect(conBearer.cuerpo.error.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
    expect(await migrador.sesion.count({ where: { tipo: "MOVIL" } })).toBe(antes);
  });

  it("credenciales incorrectas: mensaje único (401); cuerpo inválido: 400", async () => {
    const c = new ClienteMovil(url);
    const mala = await c.iniciarSesion({ correo: "prep.mov@softarq.test", contrasena: "no-es" });
    const inexistente = await c.iniciarSesion({ correo: "nadie.mov@softarq.test", contrasena: "no-es" });
    expect(mala.status).toBe(401);
    expect(mala.cuerpo.error).toMatchObject({ codigo: "CREDENCIALES_INVALIDAS", mensaje: "Correo o contraseña incorrectos." });
    expect(inexistente.cuerpo.error.mensaje).toBe(mala.cuerpo.error.mensaje);
    expect((await c.post("/api/v1/auth/movil/sesion", { correo: "x@y.test" }, { token: null })).status).toBe(400);
    expect((await c.post("/api/v1/auth/movil/sesion", { correo: "x@y.test", contrasena: "z", extra: 1 }, { token: null })).status).toBe(400);
  });

  it("el limitador de accesos aplica al canal móvil: 5 fallos y el siguiente intento, aun correcto, recibe 429 con Retry-After", async () => {
    const c = new ClienteMovil(url);
    for (let i = 0; i < 5; i++) expect((await c.iniciarSesion({ correo: "limite.mov@softarq.test", contrasena: "mala" })).status).toBe(401);
    const bloqueado = await c.iniciarSesion(cred["limite.mov@softarq.test"]!);
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("sesión móvil y revalidación", () => {
  it("GET /auth/movil/sesion devuelve el contexto vigente sin token ni CSRF", async () => {
    const cl = await movil("prep.mov@softarq.test");
    const r = await cl.get("/api/v1/auth/movil/sesion");
    expect(r.status).toBe(200);
    expect(EsquemaRespuestaSesionMovil.parse(r.cuerpo).usuario.correo).toBe("prep.mov@softarq.test");
    expect(Object.keys(r.cuerpo)).not.toEqual(expect.arrayContaining(["tokenSesion", "csrfToken"]));
  });

  it("sin token, con token inventado o con un esquema distinto: 401", async () => {
    const c = new ClienteMovil(url);
    expect((await c.get("/api/v1/auth/movil/sesion")).status).toBe(401);
    expect((await c.get("/api/v1/auth/movil/sesion", { token: "A".repeat(43) })).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
    expect((await c.get("/api/v1/auth/movil/sesion", { cabeceras: { Authorization: "Basic YTpi" }, token: null })).cuerpo.error.codigo).toBe("NO_AUTENTICADO");
  });

  it("una sesión web (cookie) no entra al canal móvil ni su cookie sirve como Bearer, y al revés", async () => {
    const w = await web("prep.mov@softarq.test");
    const m = await movil("prep.mov@softarq.test");
    expect((await w.get("/api/v1/auth/movil/sesion")).cuerpo.error.codigo).toBe("ACCESO_MOVIL_NO_PERMITIDO");
    expect((await new ClienteMovil(url).get("/api/v1/clientes", { token: w.cookie })).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
    // Un cliente aparte: la respuesta 401 borra la cookie del que la recibe.
    expect((await new ClienteHttp(url).get("/api/v1/clientes", { cookie: m.token })).status).toBe(401);
    expect((await w.get("/api/v1/clientes")).status).toBe(200); // la sesión web no se vio afectada
    expect((await m.get("/api/v1/clientes")).status).toBe(200);
  });

  it("Bearer válido con una cookie web ajena o inválida: manda el Bearer", async () => {
    const m = await movil("prep.mov@softarq.test");
    const r = await m.get("/api/v1/clientes", { cabeceras: { Cookie: `softarq_sesion=${"B".repeat(43)}` } });
    expect(r.status).toBe(200);
  });
});

describe("consultas comerciales por Bearer", () => {
  it("clientes, proyectos, cotizaciones, detalle y versión de la propia organización", async () => {
    const cl = await movil("prep.mov@softarq.test");
    expect((await cl.get("/api/v1/clientes")).cuerpo.clientes.some((x: { id: string }) => x.id === cotA.clienteId)).toBe(true);
    expect((await cl.get(`/api/v1/clientes/${cotA.clienteId}`)).status).toBe(200);
    expect((await cl.get(`/api/v1/proyectos?clienteId=${cotA.clienteId}`)).cuerpo.proyectos).toHaveLength(1);
    expect((await cl.get(`/api/v1/proyectos/${cotA.proyectoId}`)).status).toBe(200);
    const lista = await cl.get("/api/v1/cotizaciones?buscar=" + encodeURIComponent(cotA.folio));
    expect(lista.cuerpo.cotizaciones.map((x: { folio: string }) => x.folio)).toContain(cotA.folio);
    const detalle = EsquemaDetalleCotizacion.parse((await cl.get(`/api/v1/cotizaciones/${cotA.id}`)).cuerpo);
    expect(detalle.versiones).toHaveLength(1);
    const v = await cl.get(`/api/v1/cotizaciones/${cotA.id}/versiones/1`);
    expect(v.status, v.texto).toBe(200);
    EsquemaVersion.parse(v.cuerpo);
  });

  it("la versión consultada es comercial: ninguna clave de costo, margen, recargo, consumo ni proveedor", async () => {
    const cl = await movil("rev.mov@softarq.test");
    const v = await cl.get(`/api/v1/cotizaciones/${cotA.id}/versiones/1`);
    expect(v.status).toBe(200);
    // Se revisan las CLAVES: el aviso comercial AV-03 menciona «sobrante» en su texto, sin cifras internas.
    const claves = (x: unknown): string[] =>
      Array.isArray(x) ? x.flatMap(claves) : x !== null && typeof x === "object" ? Object.entries(x).flatMap(([k, valor]) => [k, ...claves(valor)]) : [];
    expect(claves(v.cuerpo).filter((k) => INTERNAS.test(k))).toEqual([]);
    expect(claves((await cl.get(`/api/v1/cotizaciones/${cotA.id}`)).cuerpo).filter((k) => INTERNAS.test(k))).toEqual([]);
  });

  it("aislamiento entre organizaciones: otra organización no ve ni abre nada", async () => {
    const b = await movil("prep.movb@softarq.test");
    expect((await b.get("/api/v1/cotizaciones?buscar=" + encodeURIComponent(cotA.folio))).cuerpo.cotizaciones).toHaveLength(0);
    for (const ruta of [`/api/v1/cotizaciones/${cotA.id}`, `/api/v1/cotizaciones/${cotA.id}/versiones/1`, `/api/v1/clientes/${cotA.clienteId}`, `/api/v1/proyectos/${cotA.proyectoId}`]) {
      const r = await b.get(ruta);
      expect(r.status, ruta).toBe(404);
    }
  });

  it("las capacidades siguen mandando: el Administrador del catálogo consulta; una sesión sin la capacidad recibe 403", async () => {
    const cat = await movil("cat.mov@softarq.test");
    expect((await cat.get("/api/v1/clientes")).status).toBe(200);
    expect((await cat.get("/api/v1/cotizaciones")).status).toBe(200);
  });
});

describe("lista blanca: lo que el móvil no puede hacer aunque tenga la capacidad", () => {
  it("escrituras, cálculo, catálogos, administración, PDF y salidas internas → 403 RUTA_NO_DISPONIBLE_EN_MOVIL", async () => {
    const p = await movil("prep.mov@softarq.test");
    const intentos: [string, string, unknown?][] = [
      ["POST", "/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }],
      ["PATCH", `/api/v1/clientes/${cotA.clienteId}`, { revision: 0, nombre: "z" }],
      ["POST", "/api/v1/cotizaciones", { proyectoId: cotA.proyectoId }],
      ["PUT", `/api/v1/cotizaciones/${cotA.id}/borrador`, { revision: 0, captura: {} }],
      ["POST", `/api/v1/cotizaciones/${cotA.id}/versiones`, { revisionBorrador: 0 }],
      ["POST", `/api/v1/cotizaciones/${cotA.id}/descarte`, { motivo: "no" }],
      ["POST", "/api/v1/calculos/demo", {}],
      ["GET", "/api/v1/catalogos/conceptos"],
      ["GET", `/api/v1/cotizaciones/${cotA.id}/versiones/1/salidas-internas`],
      ["POST", `/api/v1/cotizaciones/${cotA.id}/versiones/1/vista-previa`, {}],
      ["GET", "/api/v1/revisiones"],
      ["GET", "/api/v1/admin/personas"],
      ["GET", "/api/v1/emisor"],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const r = await p.solicitar(metodo, ruta, cuerpo === undefined ? {} : { cuerpo });
      expect(r.status, `${metodo} ${ruta}`).toBe(403);
      expect(r.cuerpo.error.codigo, `${metodo} ${ruta}`).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
    }
    // No se crearon ni cambiaron datos.
    expect((await (await web("prep.mov@softarq.test")).get(`/api/v1/clientes/${cotA.clienteId}`)).cuerpo.cliente?.nombre ?? "[DEMO]").toMatch(/\[DEMO\]/);
  });

  it("las funciones administrativas no conceden acciones de otra función: el Administrador del sistema no consulta salidas ni administra desde el móvil", async () => {
    const a = await movil("sis.mov@softarq.test");
    for (const ruta of ["/api/v1/admin/personas", "/api/v1/admin/parametros", "/api/v1/emisor"]) {
      expect((await a.get(ruta)).cuerpo.error.codigo, ruta).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
    }
  });

  it("OPTIONS desde el origen web no autoriza la cabecera Authorization (CORS de la web sin cambios)", async () => {
    const r = await fetch(`${url}/api/v1/clientes`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
    });
    expect((r.headers.get("access-control-allow-headers") ?? "").toLowerCase()).not.toContain("authorization");
  });
});

describe("cierre, revocación y pérdida de acceso", () => {
  it("cerrar la sesión (DELETE /auth/sesion con Bearer) revoca en la base y el mismo token deja de servir", async () => {
    const cl = await movil("prep.mov@softarq.test");
    const token = cl.token!;
    expect((await cl.delete("/api/v1/auth/sesion")).status).toBe(204);
    expect((await cl.get("/api/v1/clientes")).status).toBe(401);
    const fila = await migrador.sesion.findUniqueOrThrow({ where: { tokenHash: new Uint8Array(sha(token)) } });
    expect(fila.motivoRevocacion).toBe("CIERRE");
    expect((await cl.delete("/api/v1/auth/sesion")).status).toBe(401);
  });

  it("el Administrador del sistema desactiva la cuenta: la sesión móvil se cierra con 401 y reactivar no la revive", async () => {
    const adm = await web("sis.mov@softarq.test");
    const m = await movil("baja.mov@softarq.test");
    expect((await m.get("/api/v1/clientes")).status).toBe(200);
    const persona = (await adm.get("/api/v1/admin/personas?buscar=baja.mov%40")).cuerpo.personas[0];
    const baja = await adm.patch(`/api/v1/admin/personas/${persona.id}`, { revision: persona.revision, motivo: MOTIVO, activa: false });
    expect(baja.status, baja.texto).toBe(200);
    expect((await m.get("/api/v1/clientes")).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
    expect((await new ClienteMovil(url).iniciarSesion(cred["baja.mov@softarq.test"]!)).status).toBe(401);
    const alta = await adm.patch(`/api/v1/admin/personas/${persona.id}`, { revision: baja.cuerpo.revision, motivo: MOTIVO, activa: true });
    expect(alta.status, alta.texto).toBe(200);
    expect((await m.get("/api/v1/clientes")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion(cred["baja.mov@softarq.test"]!)).status).toBe(200);
  });

  it("un cambio de funciones se aplica en la siguiente solicitud (se leen de la pertenencia, no de la sesión)", async () => {
    const adm = await web("sis.mov@softarq.test");
    const m = await movil("funciones.mov@softarq.test");
    expect((await m.get("/api/v1/auth/movil/sesion")).cuerpo.funciones).toEqual(["PREPARADOR"]);
    const persona = (await adm.get("/api/v1/admin/personas?buscar=funciones.mov%40")).cuerpo.personas[0];
    const r = await adm.patch(`/api/v1/admin/personas/${persona.id}`, { revision: persona.revision, motivo: MOTIVO, funciones: ["REVISOR"] });
    expect(r.status, r.texto).toBe(200);
    const despues = (await m.get("/api/v1/auth/movil/sesion")).cuerpo;
    expect(despues.funciones).toEqual(["REVISOR"]);
    expect(despues.capacidades).not.toContain("calculo.ejecutar");
    expect(despues.capacidades).toContain("revisiones.decidir");
  });

  it("restablecer la contraseña revoca también las sesiones móviles de la persona", async () => {
    const adm = await web("sis.mov@softarq.test");
    const m = await movil("rev.mov@softarq.test");
    expect((await m.get("/api/v1/clientes")).status).toBe(200);
    const persona = (await adm.get("/api/v1/admin/personas?buscar=rev.mov%40")).cuerpo.personas[0];
    const r = await adm.post(`/api/v1/admin/personas/${persona.id}/restablecimiento`, { motivo: MOTIVO }, idem());
    expect(r.status, r.texto).toBe(200);
    expect((await m.get("/api/v1/clientes")).status).toBe(401);
    // Con la contraseña temporal entra, pero restringido al cambio.
    const nuevo = new ClienteMovil(url);
    const acceso = await nuevo.iniciarSesion({ correo: "rev.mov@softarq.test", contrasena: r.cuerpo.contrasenaTemporal });
    expect(acceso.status).toBe(200);
    cred["rev.mov@softarq.test"] = { correo: "rev.mov@softarq.test", contrasena: r.cuerpo.contrasenaTemporal };
  });
});

describe("contraseña temporal en el móvil", () => {
  it("acceso restringido; cambio con Bearer revoca TODAS las sesiones (web y móvil) y exige volver a entrar", async () => {
    const adm = await web("sis.mov@softarq.test");
    const correo = `primera.${randomUUID().slice(0, 6)}@softarq.test`;
    const alta = await adm.post("/api/v1/admin/personas", { correo, nombre: "[DEMO] Primer acceso móvil", funciones: ["PREPARADOR"], motivo: MOTIVO }, idem());
    expect(alta.status, alta.texto).toBe(201);
    const temporal = alta.cuerpo.contrasenaTemporal as string;

    const m = new ClienteMovil(url);
    const acceso = await m.iniciarSesion({ correo, contrasena: temporal });
    expect(acceso.status).toBe(200);
    expect(acceso.cuerpo).toMatchObject({ cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    // Otra sesión de la misma persona (web) para comprobar que también se revoca.
    const w = await new ClienteHttp(url).entrar({ correo, contrasena: temporal });

    for (const ruta of ["/api/v1/clientes", "/api/v1/cotizaciones", "/api/v1/proyectos"]) {
      const r = await m.get(ruta);
      expect(r.status, ruta).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
    }
    expect((await m.get("/api/v1/auth/movil/sesion")).status).toBe(200); // revalidar sí se permite

    const nueva = `Nueva-${randomUUID()}`;
    expect((await m.post("/api/v1/auth/contrasena", { actual: "incorrecta", nueva, confirmacion: nueva })).cuerpo.error.codigo).toBe("CONTRASENA_ACTUAL_INCORRECTA");
    expect((await m.post("/api/v1/auth/contrasena", { actual: temporal, nueva: "corta", confirmacion: "corta" })).status).toBe(400);
    const cambio = await m.post("/api/v1/auth/contrasena", { actual: temporal, nueva, confirmacion: nueva });
    expect(cambio.status, cambio.texto).toBe(204);

    expect((await m.get("/api/v1/auth/movil/sesion")).status).toBe(401);
    expect((await w.get("/api/v1/auth/sesion")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion({ correo, contrasena: temporal })).status).toBe(401);
    const normal = new ClienteMovil(url);
    const ok = await normal.iniciarSesion({ correo, contrasena: nueva });
    expect(ok.status).toBe(200);
    expect(ok.cuerpo.cambioContrasenaRequerido).toBe(false);
    expect((await normal.get("/api/v1/clientes")).status).toBe(200);
  });

  it("una temporal caducada no entra por el móvil y una cuenta sin pertenencia activa tampoco", async () => {
    const adm = await web("sis.mov@softarq.test");
    const correo = `caduca.${randomUUID().slice(0, 6)}@softarq.test`;
    const alta = await adm.post("/api/v1/admin/personas", { correo, nombre: "[DEMO] Caducidad móvil", funciones: ["REVISOR"], motivo: MOTIVO }, idem());
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() - interval '1 minute' WHERE id = ${alta.cuerpo.persona.id}::uuid`;
    const r = await new ClienteMovil(url).iniciarSesion({ correo, contrasena: alta.cuerpo.contrasenaTemporal });
    expect(r.status).toBe(401);
    expect(r.cuerpo.error.codigo).toBe("CONTRASENA_TEMPORAL_CADUCADA");
  });
});

describe("expiración de la sesión móvil (reloj de sesiones)", () => {
  it("30 minutos sin actividad: 401; con actividad dentro de la ventana sigue viva; a las 8 h vence aunque haya actividad", async () => {
    const inactiva = await movil("reloj.mov@softarq.test");
    avanzar(29 * MIN);
    expect((await inactiva.get("/api/v1/clientes")).status).toBe(200);
    avanzar(29 * MIN);
    expect((await inactiva.get("/api/v1/clientes")).status).toBe(200);
    avanzar(31 * MIN);
    expect((await inactiva.get("/api/v1/clientes")).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");

    const larga = await movil("reloj.mov@softarq.test");
    for (let i = 0; i < 16; i++) {
      avanzar(29 * MIN);
      expect((await larga.get("/api/v1/clientes")).status, `${i}`).toBe(200);
    }
    avanzar(29 * MIN); // 8 h 13 min desde el acceso
    expect((await larga.get("/api/v1/clientes")).cuerpo.error.codigo).toBe("SESION_NO_VALIDA");
  });
});

describe("la web no cambia", () => {
  it("la cookie sigue exigiendo Origin permitido y CSRF; un POST web sin ellos se rechaza igual", async () => {
    const w = await web("prep.mov@softarq.test");
    expect((await w.post("/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }, { origen: null, ...idem() })).cuerpo.error.codigo).toBe("ORIGEN_NO_PERMITIDO");
    expect((await w.post("/api/v1/clientes", { nombre: "x", contactoNombre: "y", contactoTelefono: "55 1234 5678" }, { csrf: null, ...idem() })).cuerpo.error.codigo).toBe("CSRF_NO_VALIDO");
    const ok = await w.post("/api/v1/clientes", { nombre: `[DEMO] Cliente web ${randomUUID().slice(0, 6)}`, contactoNombre: "y", contactoTelefono: "55 1234 5678" }, idem());
    expect(ok.status, ok.texto).toBe(201);
  });
});
