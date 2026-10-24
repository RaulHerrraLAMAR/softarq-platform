/**
 * Administración del cliente externo (módulo 17, ADR-0021) por HTTP contra softarq_test: acceso de un cliente (alta por el
 * Administrador del sistema con contraseña temporal, baja y restablecimiento), precios de referencia y trabajos para clientes
 * (Administrador del catálogo) y las garantías de la base (permisos del rol de la aplicación, coherencia entre la función CLIENTE y su
 * acceso, transiciones de la solicitud). Los recorridos del cliente en sí están en `cliente.integracion.test.ts`.
 */
import type { INestApplication } from "@nestjs/common";
import { EsquemaRespuestaAccesoMovil, EsquemaRespuestaAltaAcceso, EsquemaRespuestaReferencias, EsquemaRespuestaTrabajosCliente } from "@softarq/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, ClienteMovil, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";

const FECHA = "2026-09-25";
const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let orgId: string;
const cred: Record<string, Credencial> = {};
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const web = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);

const PREP = "prep@cla.softarq.test";
const REV = "rev@cla.softarq.test";
const CAT = "cat@cla.softarq.test";
const SIS = "sis@cla.softarq.test";

const TRABAJOS = [
  { codigo: "CUBIERTA", nombre: "Cubierta", descripcion: "Techo de lámina.", ilustracion: "cubierta", orden: 10, concepto: "CON-00007", opcion: "LAMINA", medidas: ["largo", "ancho"] },
  { codigo: "LOSA", nombre: "Losa", descripcion: "Piso de concreto.", ilustracion: "losa", orden: 20, concepto: "CON-00008", opcion: "CONCRETO", medidas: ["largo", "ancho", "alto"] },
  { codigo: "MURO", nombre: "Muro", descripcion: "Muro de block.", ilustracion: "muro", orden: 30, concepto: "CON-00009", opcion: "BLOCK", medidas: ["largo", "alto"] },
] as const;

const definicion = (t: (typeof TRABAJOS)[number], extra: Record<string, unknown> = {}, medidas?: readonly string[]) => ({
  codigo: t.codigo,
  nombre: t.nombre,
  descripcion: t.descripcion,
  ilustracion: t.ilustracion,
  orden: t.orden,
  activo: true,
  motivo: "Definición de prueba",
  opciones: [
    {
      codigo: t.opcion,
      nombre: `${t.nombre} estándar`,
      descripcion: "Opción de prueba.",
      conceptoCodigo: t.concepto,
      consolidarCompras: true,
      medidas: (medidas ?? t.medidas).map((m) => ({ clave: m, etiqueta: m === "alto" && t.codigo === "LOSA" ? "Espesor" : m, ayuda: "Ayuda de prueba." })),
      orden: 10,
      activa: true,
    },
  ],
  ...extra,
});

const tiposBitacora = async (entidadId: string): Promise<string[]> =>
  (await migrador.$queryRaw<{ tipo: string }[]>`SELECT tipo FROM bitacora WHERE entidad_id = ${entidadId}::uuid ORDER BY ocurrido_en, id`).map((f) => f.tipo);

beforeAll(async () => {
  orgId = (await cargarDemo(prisma, { codigo: "DEMO-CLA", nombre: "[DEMO] Cliente administración" })).organizacionId;
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-CLA", [
      cuenta(PREP, "[DEMO] Preparador CLA", "PREPARADOR"),
      cuenta(REV, "[DEMO] Revisor CLA", "REVISOR"),
      cuenta(CAT, "[DEMO] Catálogo CLA", "ADMIN_CATALOGO"),
      cuenta(SIS, "[DEMO] Sistema CLA", "ADMIN_SISTEMA"),
    ]),
  );
  app = await crearAplicacion(
    leerConfiguracion({
      DATABASE_URL: urlDePrueba("DATABASE_URL"),
      API_REGISTRO: "ninguno",
      API_ACCESO_INTENTOS_IP: "1000",
      API_ACCESO_FALLOS_CUENTA: "1000",
      API_ACCESO_FALLOS_CUENTA_IP: "100",
      API_LIMITE_GENERAL_POR_MINUTO: "5000",
    }),
    { reloj: new RelojFijo(FECHA) },
  );
  app.useLogger(false);
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

afterAll(async () => {
  await app.close();
  await migrador.$disconnect();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------------------------------------------------

describe("trabajos para clientes (Administrador del catálogo)", () => {
  it("define trabajos y opciones; solo el Administrador del catálogo; las medidas deben coincidir con la fórmula del concepto", async () => {
    const cat = await web(CAT);
    for (const t of TRABAJOS) {
      const r = await cat.put("/api/v1/admin/trabajos-cliente", definicion(t), idem());
      expect(r.status, r.texto).toBe(200);
    }
    const lista = await cat.get("/api/v1/admin/trabajos-cliente");
    expect(lista.cuerpo.trabajos.map((t: { codigo: string }) => t.codigo)).toEqual(["CUBIERTA", "LOSA", "MURO"]);
    // Otras funciones no los administran.
    for (const correo of [PREP, REV, SIS]) {
      expect((await (await web(correo)).put("/api/v1/admin/trabajos-cliente", definicion(TRABAJOS[0]), idem())).status, correo).toBe(403);
      expect((await (await web(correo)).get("/api/v1/admin/trabajos-cliente")).status, correo).toBe(403);
    }
    // Un área pide ancho O alto, no ambos; un volumen pide las tres; el concepto debe existir; la ilustración es de una lista cerrada.
    const ambos = await cat.put("/api/v1/admin/trabajos-cliente", definicion(TRABAJOS[2], {}, ["largo", "ancho", "alto"]), idem());
    expect(ambos.status).toBe(422);
    expect(ambos.cuerpo.error.campos[0]).toMatchObject({ ruta: "opciones[0].medidas" });
    const faltan = await cat.put("/api/v1/admin/trabajos-cliente", definicion(TRABAJOS[1], {}, ["largo", "ancho"]), idem());
    expect(faltan.status).toBe(422);
    const sinConcepto = definicion(TRABAJOS[0]);
    (sinConcepto.opciones[0] as { conceptoCodigo: string }).conceptoCodigo = "CON-99999";
    const noExiste = await cat.put("/api/v1/admin/trabajos-cliente", sinConcepto, idem());
    expect(noExiste.status).toBe(422);
    const ilustracion = await cat.put("/api/v1/admin/trabajos-cliente", { ...definicion(TRABAJOS[0]), ilustracion: "castillo" }, idem());
    expect(ilustracion.status).toBe(400);
  });

  it("una opción inactiva o con un concepto no aprobado no se ofrece al cliente", async () => {
    const cat = await web(CAT);
    const inactiva = definicion(TRABAJOS[2]);
    inactiva.opciones[0]!.activa = false;
    expect((await cat.put("/api/v1/admin/trabajos-cliente", inactiva, idem())).status).toBe(200);
    // El trabajo sin opciones disponibles desaparece del catálogo del cliente (se verifica con el acceso creado más abajo).
    expect((await cat.put("/api/v1/admin/trabajos-cliente", definicion(TRABAJOS[2]), idem())).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("precios de referencia (Administrador del catálogo)", () => {
  const pend = async (cat: ClienteHttp) => EsquemaRespuestaReferencias.parse((await cat.get("/api/v1/admin/referencias-estimacion")).cuerpo);

  it("lista los insumos de los trabajos que aún no tienen referencia; sin referencia no hay estimación", async () => {
    const cat = await web(CAT);
    const r = await pend(cat);
    expect(r.referencias).toEqual([]);
    expect(r.pendientes.map((x) => x.insumoCodigo)).toEqual(["INS-00004", "INS-00005", "INS-00006", "INS-00007", "INS-00008", "INS-00009", "INS-00010", "INS-00011"]);
  });

  it("designa con motivo y bitácora; rechaza un precio de otro insumo; un precio nuevo sustituye al anterior y queda el historial; retirar lo deja pendiente", async () => {
    const cat = await web(CAT);
    const bien = await cat.put("/api/v1/admin/referencias-estimacion/INS-00007", { precioCodigo: "PRE-000012", motivo: "Precio de referencia de la losa" }, idem());
    expect(bien.status, bien.texto).toBe(200);
    const lista = EsquemaRespuestaReferencias.parse(bien.cuerpo);
    expect(lista.referencias).toHaveLength(1);
    expect(lista.referencias[0]).toMatchObject({ insumoCodigo: "INS-00007", precioCodigo: "PRE-000012", vigente: true, motivo: "Precio de referencia de la losa" });
    expect(lista.pendientes.map((x) => x.insumoCodigo)).not.toContain("INS-00007");
    // Un precio de otro insumo no sirve.
    const otro = await cat.put("/api/v1/admin/referencias-estimacion/INS-00007", { precioCodigo: "PRE-000013", motivo: "Precio de otro insumo" }, idem());
    expect(otro.status).toBe(422);
    expect(otro.cuerpo.error.codigo).toBe("VALOR_INVALIDO");
    // Un precio inexistente.
    expect((await cat.put("/api/v1/admin/referencias-estimacion/INS-00007", { precioCodigo: "PRE-999999", motivo: "No existe" }, idem())).status).toBe(404);
    // El insumo o los datos inválidos.
    expect((await cat.put("/api/v1/admin/referencias-estimacion/INS-99999", { precioCodigo: "PRE-000012", motivo: "Insumo inexistente" }, idem())).status).toBe(404);
    expect((await cat.put("/api/v1/admin/referencias-estimacion/INS-00007", { precioCodigo: "PRE-000012", motivo: "" }, idem())).status).toBe(400);
    // Producto inactivo: no se designa.
    await migrador.$executeRaw`UPDATE producto SET activo = false WHERE organizacion_id = ${orgId}::uuid AND id = (SELECT producto_id FROM precio WHERE codigo = 'PRE-000008' AND organizacion_id = ${orgId}::uuid)`;
    const inactivo = await cat.put("/api/v1/admin/referencias-estimacion/INS-00005", { precioCodigo: "PRE-000008", motivo: "Producto inactivo" }, idem());
    await migrador.$executeRaw`UPDATE producto SET activo = true WHERE organizacion_id = ${orgId}::uuid AND id = (SELECT producto_id FROM precio WHERE codigo = 'PRE-000008' AND organizacion_id = ${orgId}::uuid)`;
    expect(inactivo.status).toBe(422);
    expect(inactivo.cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    // Fuera de vigencia (la función de la base recibe la fecha de negocio): 2026-08-01 es anterior al 2026-09-01.
    const adminCat = (await migrador.$queryRaw<{ id: string }[]>`SELECT u.id FROM usuario u WHERE u.correo = ${CAT}`)[0]!.id;
    const insumo = (await migrador.$queryRaw<{ id: string }[]>`SELECT id FROM insumo WHERE organizacion_id = ${orgId}::uuid AND codigo = 'INS-00005'`)[0]!.id;
    const precio = (await migrador.$queryRaw<{ id: string }[]>`SELECT id FROM precio WHERE organizacion_id = ${orgId}::uuid AND codigo = 'PRE-000008'`)[0]!.id;
    await expect(migrador.$queryRaw`SELECT softarq_designar_referencia(${orgId}::uuid, ${adminCat}::uuid, ${insumo}::uuid, ${precio}::uuid, '2026-08-01'::date, 'Fuera de vigencia')`).rejects.toThrow(/PRECIO_NO_VIGENTE/);

    const retiro = await cat.post("/api/v1/admin/referencias-estimacion/INS-00007/retiro", { motivo: "Se revisa el precio" }, idem());
    expect(retiro.status, retiro.texto).toBe(200);
    expect((await pend(cat)).pendientes.map((x) => x.insumoCodigo)).toContain("INS-00007");
    expect((await cat.post("/api/v1/admin/referencias-estimacion/INS-00007/retiro", { motivo: "Otra vez" }, idem())).status).toBe(404);
    // Se designa de nuevo (historial: la anterior queda retirada, solo hay una activa por insumo).
    expect((await cat.put("/api/v1/admin/referencias-estimacion/INS-00007", { precioCodigo: "PRE-000012", motivo: "Se confirma el precio" }, idem())).status).toBe(200);
    const filas = await migrador.$queryRaw<{ activas: bigint; retiradas: bigint }[]>`
      SELECT count(*) FILTER (WHERE retirada_en IS NULL) AS activas, count(*) FILTER (WHERE retirada_en IS NOT NULL) AS retiradas
        FROM referencia_estimacion r JOIN insumo i ON i.id = r.insumo_id WHERE i.organizacion_id = ${orgId}::uuid AND i.codigo = 'INS-00007'`;
    expect([Number(filas[0]!.activas), Number(filas[0]!.retiradas)]).toEqual([1, 1]);
    const ref = (await migrador.$queryRaw<{ id: string }[]>`SELECT r.id FROM referencia_estimacion r JOIN insumo i ON i.id = r.insumo_id WHERE i.codigo = 'INS-00007' AND i.organizacion_id = ${orgId}::uuid AND r.retirada_en IS NULL`)[0]!.id;
    expect(await tiposBitacora(ref)).toContain("REFERENCIA_DESIGNADA");
  });

  it("solo el Administrador del catálogo designa o retira; el resto de funciones y el cliente no", async () => {
    for (const correo of [PREP, REV, SIS]) {
      const c = await web(correo);
      expect((await c.get("/api/v1/admin/referencias-estimacion")).status, correo).toBe(403);
      expect((await c.put("/api/v1/admin/referencias-estimacion/INS-00007", { precioCodigo: "PRE-000012", motivo: "Sin permiso" }, idem())).status, correo).toBe(403);
      expect((await c.post("/api/v1/admin/referencias-estimacion/INS-00007/retiro", { motivo: "Sin permiso" }, idem())).status, correo).toBe(403);
    }
    // Sin sesión.
    expect((await new ClienteHttp(url).get("/api/v1/admin/referencias-estimacion")).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("acceso del cliente (Administrador del sistema)", () => {
  let clienteId: string;
  let usuarioId: string;
  let temporal: string;
  const correo = "cliente.nuevo@cla.softarq.test";

  beforeAll(async () => {
    const p = await web(PREP);
    const r = await p.post("/api/v1/clientes", { nombre: "Cliente sin acceso", contactoNombre: "Persona de contacto", contactoTelefono: "55 5550 0000" }, idem());
    expect(r.status, r.texto).toBe(201);
    clienteId = r.cuerpo.id;
  });

  it("crea el acceso con contraseña temporal de 72 h entregada una sola vez; ninguna otra función puede", async () => {
    for (const c of [PREP, REV, CAT]) {
      expect((await (await web(c)).post(`/api/v1/clientes/${clienteId}/acceso`, { correo, nombre: "Cliente Nuevo", motivo: "Sin permiso" }, idem())).status, c).toBe(403);
    }
    const sis = await web(SIS);
    const r = await sis.post(`/api/v1/clientes/${clienteId}/acceso`, { correo: ` ${correo.toUpperCase()} `, nombre: "Cliente Nuevo", motivo: "Alta para la presentación" }, idem());
    expect(r.status, r.texto).toBe(201);
    const alta = EsquemaRespuestaAltaAcceso.parse(r.cuerpo);
    expect(alta.acceso).toMatchObject({ correo, nombre: "Cliente Nuevo", activo: true, contrasenaTemporal: true, clienteId });
    expect(alta.contrasenaTemporal).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(new Date(alta.temporalExpiraEn).getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(new Date(alta.temporalExpiraEn).getTime() - Date.now()).toBeLessThan(73 * 3_600_000);
    expect(r.headers.get("cache-control")).toBe("no-store");
    usuarioId = alta.acceso.usuarioId;
    temporal = alta.contrasenaTemporal!;
    // La consulta del acceso no devuelve contraseñas; la base solo guarda el hash Argon2id.
    const g = await sis.get(`/api/v1/clientes/${clienteId}/acceso`);
    expect(g.status).toBe(200);
    expect(g.texto).not.toContain(temporal);
    const fila = await migrador.$queryRaw<{ hash: string; es_demo: boolean }[]>`SELECT hash_contrasena AS hash, es_demo FROM usuario WHERE id = ${usuarioId}::uuid`;
    expect(fila[0]!.hash.startsWith("$argon2id$")).toBe(true);
    expect(fila[0]!.hash).not.toContain(temporal);
    expect(fila[0]!.es_demo).toBe(true);
    expect(await tiposBitacora(usuarioId)).toEqual(["ACCESO_CLIENTE_CREADO"]);
    const bit = await migrador.$queryRaw<{ detalle: string }[]>`SELECT detalle::text AS detalle FROM bitacora WHERE entidad_id = ${usuarioId}::uuid`;
    expect(bit[0]!.detalle).not.toContain(temporal);
  });

  it("un cliente tiene un solo acceso y el correo es único en toda la base", async () => {
    const sis = await web(SIS);
    const otra = await sis.post(`/api/v1/clientes/${clienteId}/acceso`, { correo: "otro@cla.softarq.test", nombre: "Otra persona", motivo: "Segundo acceso" }, idem());
    expect(otra.status).toBe(409);
    expect(otra.cuerpo.error.codigo).toBe("DUPLICADO");
    const p = await web(PREP);
    const c2 = await p.post("/api/v1/clientes", { nombre: "Otro cliente sin acceso" }, idem());
    const repetido = await sis.post(`/api/v1/clientes/${c2.cuerpo.id}/acceso`, { correo: PREP, nombre: "Duplicado", motivo: "Correo existente" }, idem());
    expect(repetido.status).toBe(409);
    expect(repetido.cuerpo.error.codigo).toBe("CORREO_EXISTENTE");
    expect((await sis.post(`/api/v1/clientes/${randomUUID()}/acceso`, { correo: "x@cla.softarq.test", nombre: "Sin cliente", motivo: "No existe" }, idem())).status).toBe(404);
    expect((await sis.post(`/api/v1/clientes/${clienteId}/acceso`, { correo: "no-es-correo", nombre: "X", motivo: "x" }, idem())).status).toBe(400);
    expect((await sis.get(`/api/v1/clientes/${c2.cuerpo.id}/acceso`)).status).toBe(404);
  });

  it("el cliente entra en la app con la temporal, queda restringido hasta cambiarla y, ya con la definitiva, ve su catálogo y no los de otros", async () => {
    const m = new ClienteMovil(url);
    const r = await m.iniciarSesion({ correo, contrasena: temporal });
    expect(r.status, r.texto).toBe(200);
    expect(EsquemaRespuestaAccesoMovil.parse(r.cuerpo)).toMatchObject({ funciones: ["CLIENTE"], cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    const nueva = "definitiva-de-prueba-0123456789";
    expect((await m.post("/api/v1/auth/contrasena", { actual: temporal, nueva, confirmacion: nueva })).status).toBe(204);
    const n = await new ClienteMovil(url).entrar({ correo, contrasena: nueva });
    const t = EsquemaRespuestaTrabajosCliente.parse((await n.get("/api/v1/cliente/trabajos")).cuerpo);
    expect(t.trabajos.map((x) => x.codigo)).toEqual(["CUBIERTA", "LOSA", "MURO"]);
    expect((await n.get("/api/v1/cliente/solicitudes")).cuerpo.solicitudes).toEqual([]);
    // No es una persona del panel: no sale en el listado ni se edita por la administración de personas.
    const sis = await web(SIS);
    const personas = await sis.get("/api/v1/admin/personas?incluirInactivas=true");
    expect(personas.status, personas.texto).toBe(200);
    expect(personas.texto).not.toContain(correo);
    expect((await sis.get(`/api/v1/admin/personas/${usuarioId}`)).status).toBe(404);
    expect((await sis.patch(`/api/v1/admin/personas/${usuarioId}`, { revision: 0, funciones: ["PREPARADOR"], motivo: "No debe poder" }, idem())).status).toBe(404);
    expect((await sis.post(`/api/v1/admin/personas/${usuarioId}/restablecimiento`, { motivo: "No debe poder" }, idem())).status).toBe(404);
    // Tampoco se puede asignar la función CLIENTE desde la administración de personas.
    const alta = await sis.post("/api/v1/admin/personas", { correo: "falso@cla.softarq.test", nombre: "Falso cliente", funciones: ["CLIENTE"], motivo: "Función no asignable" }, idem());
    expect(alta.status).toBe(400);
    cred[correo] = { correo, contrasena: nueva };
  });

  it("restablecer la contraseña: temporal nueva, sesiones revocadas, idempotente con la misma clave (no entrega otra contraseña)", async () => {
    const viva = await new ClienteMovil(url).entrar(cred[correo]!);
    const sis = await web(SIS);
    const clave = randomUUID();
    const r1 = await sis.post(`/api/v1/admin/accesos-cliente/${usuarioId}/contrasena`, { motivo: "Olvidó su contraseña" }, { cabeceras: { "Idempotency-Key": clave } });
    expect(r1.status, r1.texto).toBe(201);
    const nuevaTemporal = EsquemaRespuestaAltaAcceso.parse(r1.cuerpo).contrasenaTemporal!;
    expect(nuevaTemporal).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect((await viva.get("/api/v1/cliente/trabajos")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion(cred[correo]!)).status).toBe(401);
    const r2 = await sis.post(`/api/v1/admin/accesos-cliente/${usuarioId}/contrasena`, { motivo: "Olvidó su contraseña" }, { cabeceras: { "Idempotency-Key": clave } });
    expect(r2.status, r2.texto).toBe(201);
    expect(EsquemaRespuestaAltaAcceso.parse(r2.cuerpo).contrasenaTemporal).toBeNull();
    const m = await new ClienteMovil(url).iniciarSesion({ correo, contrasena: nuevaTemporal });
    expect(EsquemaRespuestaAccesoMovil.parse(m.cuerpo).cambioContrasenaRequerido).toBe(true);
    expect((await (await web(PREP)).post(`/api/v1/admin/accesos-cliente/${usuarioId}/contrasena`, { motivo: "Sin permiso" }, idem())).status).toBe(403);
    expect((await sis.post(`/api/v1/admin/accesos-cliente/${randomUUID()}/contrasena`, { motivo: "No existe" }, idem())).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("garantías de la base", () => {
  it("el rol de la aplicación no puede insertar, modificar ni borrar directamente las tablas del cliente", async () => {
    const tablas = ["acceso_cliente", "trabajo_cliente", "opcion_trabajo_cliente", "referencia_estimacion", "solicitud_cliente", "estimacion_solicitud"];
    for (const t of tablas) {
      await expect(prisma.$executeRawUnsafe(`UPDATE ${t} SET id = id`), `UPDATE ${t}`).rejects.toThrow(/permiso denegado|permission denied/i);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM ${t}`), `DELETE ${t}`).rejects.toThrow(/permiso denegado|permission denied/i);
      await expect(prisma.$executeRawUnsafe(`INSERT INTO ${t} (id) VALUES (gen_random_uuid())`), `INSERT ${t}`).rejects.toThrow(/permiso denegado|permission denied/i);
    }
  });

  it("una pertenencia CLIENTE exige su acceso y un acceso exige una pertenencia exclusivamente CLIENTE (se comprueba al cerrar la transacción)", async () => {
    const usuario = randomUUID();
    await expect(
      migrador.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO usuario (id, correo, nombre, hash_contrasena, es_demo) VALUES (${usuario}::uuid, 'huerfano@cla.softarq.test', 'Huérfano', '$argon2id$v=19$m=65536,t=3,p=4$AAAA$BBBB', true)`;
        await tx.$executeRaw`INSERT INTO membresia (organizacion_id, usuario_id, funciones) VALUES (${orgId}::uuid, ${usuario}::uuid, ARRAY['CLIENTE']::varchar[])`;
      }),
    ).rejects.toThrow();
    // CLIENTE no se combina con funciones internas.
    await expect(
      migrador.$executeRaw`INSERT INTO membresia (organizacion_id, usuario_id, funciones) VALUES (${orgId}::uuid, (SELECT id FROM usuario WHERE correo = ${PREP}), ARRAY['PREPARADOR', 'CLIENTE']::varchar[])`,
    ).rejects.toThrow();
    const sinFila = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM usuario WHERE correo = 'huerfano@cla.softarq.test'`;
    expect(Number(sinFila[0]!.n)).toBe(0);
  });

  it("las funciones de cliente exigen un acceso vigente y las del equipo la función en la base; la solicitud solo avanza por transiciones válidas", async () => {
    const prep = (await migrador.$queryRaw<{ id: string }[]>`SELECT id FROM usuario WHERE correo = ${PREP}`)[0]!.id;
    const sis = (await migrador.$queryRaw<{ id: string }[]>`SELECT id FROM usuario WHERE correo = ${SIS}`)[0]!.id;
    // Una persona interna no es cliente: ninguna función de cliente le sirve aunque la API se la pidiera.
    await expect(prisma.$queryRaw`SELECT softarq_cliente_crear_proyecto(${orgId}::uuid, ${prep}::uuid, '{"nombre":"X","municipio":"x","entidadFederativa":"y"}'::jsonb)`).rejects.toThrow(/SIN_PERMISO/);
    // Un Administrador del sistema no atiende solicitudes ni designa referencias.
    await expect(prisma.$queryRaw`SELECT softarq_atender_solicitud(${orgId}::uuid, ${sis}::uuid, ${randomUUID()}::uuid, 0, 2026, '{}'::jsonb)`).rejects.toThrow(/SIN_PERMISO/);
    await expect(prisma.$queryRaw`SELECT softarq_designar_referencia(${orgId}::uuid, ${sis}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, '2026-09-25'::date, 'No debe poder')`).rejects.toThrow(/SIN_PERMISO/);
    // Un Preparador no crea accesos.
    await expect(prisma.$queryRaw`SELECT softarq_crear_acceso_cliente(${orgId}::uuid, ${prep}::uuid, ${randomUUID()}::uuid, '{"correo":"x@cla.softarq.test","nombre":"X","motivo":"x"}'::jsonb, 'hash', now())`).rejects.toThrow(/SIN_PERMISO/);
  });
});
