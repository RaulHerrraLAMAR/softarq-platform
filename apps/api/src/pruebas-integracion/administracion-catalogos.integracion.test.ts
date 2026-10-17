/**
 * Administración de proveedores, productos, precios y tarifas (módulo 11, ADR-0015), por HTTP con
 * sesiones reales contra softarq_test.
 *
 * Fuentes: `modCatalogos.bas` (Val_Proveedor, Val_Producto, Val_Precio, Val_Tarifa, Precio_Anular,
 * Cat_CambiarActivo), Word maestro §3.5/§5.6 y `fase1.csv` (TI-004 proveedor duplicado; TI-060
 * solape). Adaptaciones autorizadas por el propietario: bloqueo técnico del producto con precios,
 * cierre de vigencia con sucesor (P3 pendiente) y asignación de tarifa. Cifra esperada de la fuente:
 * 22,405.28 (GUIA-R3-SIN-VENTANA), no del motor.
 */
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EsquemaDetalleCotizacion,
  EsquemaDetalleRevision,
  EsquemaRespuestaOpcionesPrecio,
  EsquemaVerificacionRevision,
  type CapturaBorrador,
  type EntradaCalculo,
} from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { ServicioAdministracionCatalogos } from "../modules/catalogos/aplicacion/servicio-administracion.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { ErrorNegocio } from "../modules/cotizaciones/aplicacion/errores.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, NOMBRE_COOKIE, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const HOY = "2026-10-17";
const MANANA = "2026-10-18";
const SV = ESCENARIOS.find((e) => e.id === "GUIA-R3-SIN-VENTANA")!;
const DOCUMENTOS = join(directorioDocumentosPrueba("integracion"), "..", "documentos-admin-catalogos");
const MOTIVO = "[DEMO] Lista de precios nueva del proveedor ficticio.";

const prisma = prismaApp();
let migrador: ClientePrisma;
let url: string;
let urlManana: string;
let org: string;
let orgB: string;
const apps: INestApplication[] = [];
const cred: Record<string, Credencial> = {};

const entrar = (correo: string, base = url) => new ClienteHttp(base).entrar(cred[correo]!);
const admin = (base?: string) => entrar("admin.cat@softarq.test", base);
const preparador = (base?: string) => entrar("prep.cat@softarq.test", base);
const revisor = () => entrar("rev.cat@softarq.test");
const sistema = () => entrar("sis.cat@softarq.test");
const adminB = () => entrar("admin.catb@softarq.test");
const idem = (clave: string = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });

async function appConFecha(fecha: string): Promise<string> {
  const a = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "5000", SOFTARQ_DIR_DOCUMENTOS: DOCUMENTOS }),
    { reloj: new RelojFijo(fecha) },
  );
  await a.listen(0, "127.0.0.1");
  apps.push(a);
  return (await a.getUrl()).replace("[::1]", "127.0.0.1");
}

const sufijo = () => randomUUID().slice(0, 8);
const nuevoProveedor = (c: ClienteHttp, nombre = `[DEMO] Proveedor comprobación ${sufijo()}`, clave?: string) =>
  c.post("/api/v1/admin/proveedores", { nombre, contacto: "[DEMO] Contacto ficticio", correo: "contacto@ejemplo.invalid" }, idem(clave));
const producto = (over: Record<string, unknown> = {}) => ({
  insumoCodigo: "INS-00010",
  descripcion: `[DEMO] Block comprobación ${sufijo()}`,
  presentacion: "pieza",
  unidadCompra: "pza",
  contenido: "1",
  fraccionable: false,
  incrementoMinimo: null,
  ...over,
});
const precio = (productoCodigo: string, proveedorCodigo: string, over: Record<string, unknown> = {}) => ({
  productoCodigo,
  proveedorCodigo,
  precioUnitario: "13.9",
  vigenteDesde: "2026-10-01",
  vigenteHasta: "2026-12-31",
  fuente: "[DEMO] Lista ficticia de comprobación",
  ...over,
});
const tarifa = (over: Record<string, unknown> = {}) => ({
  modalidad: "UNIDAD",
  descripcion: `[DEMO] Mano de obra de comprobación ${sufijo()}`,
  unidad: "m2",
  importe: "210",
  rendimientoJornada: null,
  proveedorCodigo: null,
  vigenteDesde: "2026-09-01",
  vigenteHasta: "2027-09-30",
  fuente: "[DEMO] Comprobación del módulo 11",
  ...over,
});

async function proveedorCreado(c: ClienteHttp): Promise<string> {
  const r = await nuevoProveedor(c);
  expect(r.status, r.texto).toBe(201);
  return r.cuerpo.codigo as string;
}
async function productoCreado(c: ClienteHttp, over: Record<string, unknown> = {}): Promise<string> {
  const r = await c.post("/api/v1/admin/productos", producto(over), idem());
  expect(r.status, r.texto).toBe(201);
  return r.cuerpo.codigo as string;
}
async function precioRegistrado(c: ClienteHttp, prd: string, prv: string, over: Record<string, unknown> = {}) {
  const r = await c.post("/api/v1/admin/precios", precio(prd, prv, over), idem());
  expect(r.status, r.texto).toBe(201);
  return r.cuerpo as { codigo: string; revision: number; estado: string };
}
const contar = async (tabla: "proveedor" | "producto" | "precio" | "tarifa_mano_obra", organizacion = org) =>
  Number(
    (
      await migrador.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${tabla} WHERE organizacion_id = $1::uuid`, organizacion)
    )[0]!.n,
  );

/** Cotización con la captura del ejemplo 3 sin ventana (22,405.28 con el catálogo DEMO). */
async function cotizacionSV(p: ClienteHttp, captura: CapturaBorrador = borradorDesdeEntrada(SV.entrada as EntradaCalculo)) {
  const s = sufijo();
  const cli = await p.post("/api/v1/clientes", { nombre: `[DEMO] Cliente catálogo ${s}`, contactoNombre: "Begoña Íñiguez", contactoTelefono: "55 1234 5678" }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await p.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Muro." }, idem());
  expect(pry.status, pry.texto).toBe(201);
  const cot = await p.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
  expect(cot.status, cot.texto).toBe(201);
  return cot.cuerpo.cotizacion.id as string;
}
const borrador = async (c: ClienteHttp, id: string) => EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo).borrador;
async function version(p: ClienteHttp, id: string, numero = 1) {
  const b = await borrador(p, id);
  const v = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: b.revision, ...(numero > 1 ? { motivo: "Recalcular con el catálogo vigente." } : {}) }, idem());
  return v;
}
const verificacion = async (c: ClienteHttp, id: string, n: number) => {
  const r = await c.get(`/api/v1/cotizaciones/${id}/versiones/${n}/verificacion`);
  expect(r.status, r.texto).toBe(200);
  return EsquemaVerificacionRevision.parse(r.cuerpo);
};
const filaVersion = async (id: string, numero: number) =>
  (await migrador.$queryRaw<{ fila: unknown }[]>`SELECT to_jsonb(v) AS fila FROM cotizacion_version v WHERE cotizacion_id = ${id}::uuid AND numero = ${numero}`)[0]!.fila;

beforeAll(async () => {
  vaciarDocumentosPrueba(DOCUMENTOS);
  org = (await cargarDemo(prisma, { codigo: "DEMO-CAT", nombre: "[DEMO] Módulo once" })).organizacionId;
  await cargarEmisorDemo(prisma, org);
  orgB = (await cargarDemo(prisma, { codigo: "DEMO-CAT-B", nombre: "[DEMO] Módulo once B" })).organizacionId;
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-CAT", [
      cuenta("admin.cat@softarq.test", "[DEMO] Administradora del catálogo Begoña", "ADMIN_CATALOGO"),
      cuenta("prep.cat@softarq.test", "[DEMO] Preparador catálogo", "PREPARADOR"),
      cuenta("rev.cat@softarq.test", "[DEMO] Revisora catálogo", "REVISOR"),
      cuenta("sis.cat@softarq.test", "[DEMO] Administrador del sistema", "ADMIN_SISTEMA"),
      cuenta("perdida.cat@softarq.test", "[DEMO] Administrador que pierde la función", "ADMIN_CATALOGO"),
    ]),
    await crearCuentas(migrador, "DEMO-CAT-B", [cuenta("admin.catb@softarq.test", "[DEMO] Administrador otra organización", "ADMIN_CATALOGO")]),
  );
  url = await appConFecha(HOY);
  urlManana = await appConFecha(MANANA);
}, 120_000);

afterAll(async () => {
  for (const a of apps) await a.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

describe("permisos (Req_Funcion FN_ADMCAT) y separación de información", () => {
  it("solo el Administrador del catálogo administra; Preparador, Revisor y Administrador del sistema reciben 403 sin escribir", async () => {
    const a = await admin();
    expect((await a.get("/api/v1/auth/sesion")).cuerpo.capacidades).toContain("catalogos.administrar");
    const antes = await contar("proveedor");
    for (const otro of [await preparador(), await revisor(), await sistema()]) {
      expect((await otro.get("/api/v1/auth/sesion")).cuerpo.capacidades).not.toContain("catalogos.administrar");
      for (const ruta of ["/api/v1/admin/proveedores", "/api/v1/admin/precios", "/api/v1/admin/tarifas", "/api/v1/admin/productos/PCM-00001"]) {
        const r = await otro.get(ruta);
        expect(r.status, ruta).toBe(403);
        expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
      }
      expect((await nuevoProveedor(otro)).status).toBe(403);
      expect((await otro.post("/api/v1/admin/conceptos/CON-00001/tarifa", { tarifaActual: "TMO-00001", tarifaNueva: "TMO-00005", motivo: MOTIVO }, idem())).status).toBe(403);
    }
    expect(await contar("proveedor")).toBe(antes);
    const lista = await a.get("/api/v1/admin/precios?limite=3");
    expect(lista.status, lista.texto).toBe(200);
    expect(lista.cuerpo.precios[0].precioUnitario).toMatch(/^\d/);
  });

  it("la API no acepta organización, identidad ni código desde el navegador", async () => {
    const a = await admin();
    const r = await a.post("/api/v1/admin/proveedores", { nombre: "[DEMO] Intruso", organizacionId: orgB }, idem());
    expect(r.status).toBe(400);
    const r2 = await a.post("/api/v1/admin/proveedores", { nombre: "[DEMO] Intruso", codigo: "PRV-99999" }, idem());
    expect(r2.status).toBe(400);
    const sinClave = await a.post("/api/v1/admin/proveedores", { nombre: "[DEMO] Sin clave" });
    expect(sinClave.status).toBe(400);
  });

  it("pérdida de la función durante la sesión: 403 en la guardia y SIN_PERMISO en la base, sin escribir ni 500", async () => {
    const c = await entrar("perdida.cat@softarq.test");
    const usuario = await migrador.usuario.findUniqueOrThrow({ where: { correo: "perdida.cat@softarq.test" } });
    const antes = await contar("proveedor");
    await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['PREPARADOR']::varchar[] WHERE usuario_id = ${usuario.id}::uuid AND organizacion_id = ${org}::uuid`;
    try {
      const r = await nuevoProveedor(c);
      expect(r.status, r.texto).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
      // La capacidad venía de una sesión anterior: la función de la base vuelve a exigir ADMIN_CATALOGO.
      const servicio = new ServicioAdministracionCatalogos(prisma, new RelojFijo(HOY), { ahora: () => new Date() });
      const intento = servicio.crearProveedor({ organizacionId: org }, { usuarioId: usuario.id }, { nombre: `[DEMO] Sin función ${sufijo()}` }, randomUUID());
      await expect(intento).rejects.toBeInstanceOf(ErrorNegocio);
      await expect(intento).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
      const precioIntento = servicio.anularPrecio({ organizacionId: org }, { usuarioId: usuario.id }, "PRE-000001", { revision: 0, motivo: MOTIVO }, randomUUID());
      await expect(precioIntento).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
      expect(await contar("proveedor")).toBe(antes);
      const [p1] = await migrador.$queryRaw<{ anulado: boolean }[]>`SELECT anulado FROM precio WHERE organizacion_id = ${org}::uuid AND codigo = 'PRE-000001'`;
      expect(p1!.anulado).toBe(false);
    } finally {
      await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['ADMIN_CATALOGO']::varchar[] WHERE usuario_id = ${usuario.id}::uuid AND organizacion_id = ${org}::uuid`;
    }
  });

  it("aislamiento entre organizaciones: un código de otra organización responde 404 y no se mezcla", async () => {
    const a = await admin();
    const prv = await proveedorCreado(a);
    const prd = await productoCreado(a);
    const b = await adminB();
    expect((await b.get(`/api/v1/admin/proveedores/${prv}`)).status).toBe(404);
    expect((await b.patch(`/api/v1/admin/proveedores/${prv}`, { revision: 0, nombre: "[DEMO] Ajeno" })).status).toBe(404);
    expect((await b.get(`/api/v1/admin/productos/${prd}`)).status).toBe(404);
    const cruzado = await b.post("/api/v1/admin/precios", precio(prd, "PRV-00001"), idem());
    expect(cruzado.status, cruzado.texto).toBe(404);
    const listaB = await b.get("/api/v1/admin/proveedores?incluirInactivos=true&limite=100");
    expect(listaB.cuerpo.proveedores.map((p: { codigo: string }) => p.codigo)).not.toContain(prv);
    // La base impide relacionar organizaciones distintas aunque se intente directamente.
    const [idPrdA] = await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM producto WHERE organizacion_id = ${org}::uuid AND codigo = ${prd}`;
    const [idPrvB] = await migrador.$queryRaw<{ id: string }[]>`SELECT id::text FROM proveedor WHERE organizacion_id = ${orgB}::uuid AND codigo = 'PRV-00001'`;
    await expect(
      migrador.$executeRaw`INSERT INTO precio (organizacion_id, codigo, producto_id, proveedor_id, precio_unitario, vigente_desde, vigente_hasta, fuente)
        VALUES (${org}::uuid, 'PRE-CRUZADO', ${idPrdA!.id}::uuid, ${idPrvB!.id}::uuid, 1, '2026-10-01', '2026-10-31', 'x')`,
    ).rejects.toThrow(/precio_organizacion_id_proveedor_id_fkey|foreign key/i);
  });
});

describe("proveedores (03 PROVEEDORES)", () => {
  it("TI-004: alta con código PRV consecutivo que salta los DEMO, duplicado normalizado rechazado, doble clic sin duplicar", async () => {
    const a = await admin();
    const nombre = `[DEMO] Proveedor Tres Ñandú ${sufijo()}`;
    const clave = randomUUID();
    const [r1, r2] = await Promise.all([nuevoProveedor(a, nombre, clave), nuevoProveedor(a, nombre, clave)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 201]);
    expect(r1.cuerpo.codigo).toBe(r2.cuerpo.codigo);
    expect(r1.cuerpo.codigo).toMatch(/^PRV-\d{5}$/);
    expect(["PRV-00001", "PRV-00002"]).not.toContain(r1.cuerpo.codigo);
    expect([r1.headers.get("idempotent-replayed"), r2.headers.get("idempotent-replayed")]).toContain("true");
    const dup = await nuevoProveedor(a, `  ${nombre.toUpperCase().replace("Ñ", "N")}  `);
    expect(dup.status, dup.texto).toBe(409);
    expect(dup.cuerpo.error.codigo).toBe("DUPLICADO");
    expect(dup.cuerpo.error.mensaje).toBe(`Ya existe el proveedor ${r1.cuerpo.codigo}.`);
    expect(dup.cuerpo.error.registroVigente.codigo).toBe(r1.cuerpo.codigo);
    // Dos altas simultáneas con claves distintas: una sola entra (índice único normalizado).
    const otro = `[DEMO] Carrera ${sufijo()}`;
    const carrera = await Promise.all([nuevoProveedor(a, otro), nuevoProveedor(a, otro)]);
    expect(carrera.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("edición con revisión: conflicto 409 con el registro vigente, sin sobrescribir; desactivar conserva el historial", async () => {
    const a = await admin();
    const prv = await proveedorCreado(a);
    const e1 = await a.patch(`/api/v1/admin/proveedores/${prv}`, { revision: 0, telefono: "999 123 4567" });
    expect(e1.status, e1.texto).toBe(200);
    expect(e1.cuerpo.revision).toBe(1);
    const viejo = await a.patch(`/api/v1/admin/proveedores/${prv}`, { revision: 0, telefono: "999 000 0000" });
    expect(viejo.status).toBe(409);
    expect(viejo.cuerpo.error.codigo).toBe("CONFLICTO_EDICION");
    expect(viejo.cuerpo.error.registroVigente).toMatchObject({ codigo: prv, telefono: "999 123 4567", revision: 1 });
    const correoMalo = await a.patch(`/api/v1/admin/proveedores/${prv}`, { revision: 1, correo: "sin arroba" });
    expect(correoMalo.status).toBe(400);
    const off = await a.patch(`/api/v1/admin/proveedores/${prv}`, { revision: 1, activo: false });
    expect(off.status).toBe(200);
    expect(off.cuerpo.activo).toBe(false);
    const d = await a.get(`/api/v1/admin/proveedores/${prv}`);
    expect(d.cuerpo.historial.map((e: { tipo: string }) => e.tipo)).toEqual(["PROVEEDOR_DESACTIVADO", "PROVEEDOR_EDITADO", "PROVEEDOR_CREADO"]);
    expect(d.cuerpo.historial[0].usuario).toBe("[DEMO] Administradora del catálogo Begoña");
    // Inactivo no admite precios nuevos (Val_Precio) ni aparece en el listado por omisión.
    const prd = await productoCreado(a);
    const r = await a.post("/api/v1/admin/precios", precio(prd, prv), idem());
    expect(r.status).toBe(422);
    expect(r.cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    const lista = await a.get("/api/v1/admin/proveedores?limite=100");
    expect(lista.cuerpo.proveedores.map((p: { codigo: string }) => p.codigo)).not.toContain(prv);
    // Sin borrado: el rol de la aplicación no tiene DELETE.
    await expect(prisma.$executeRaw`DELETE FROM proveedor WHERE organizacion_id = ${org}::uuid AND codigo = ${prv}`).rejects.toThrow(/permis|permission/i);
  });

  it("listado con límite y paginación por código, sin descargar todo", async () => {
    const a = await admin();
    for (let i = 0; i < 3; i++) await proveedorCreado(a);
    const p1 = await a.get("/api/v1/admin/proveedores?limite=2&incluirInactivos=true");
    expect(p1.cuerpo.proveedores).toHaveLength(2);
    expect(p1.cuerpo.siguiente).toBe(p1.cuerpo.proveedores[1].codigo);
    const p2 = await a.get(`/api/v1/admin/proveedores?limite=2&incluirInactivos=true&despuesDe=${p1.cuerpo.siguiente}`);
    expect(p2.cuerpo.proveedores[0].codigo > p1.cuerpo.siguiente).toBe(true);
    expect((await a.get("/api/v1/admin/proveedores?limite=101")).status).toBe(400);
  });
});

describe("productos: presentación, contenido y bloqueo técnico (decisión del propietario)", () => {
  it("validaciones de Val_Producto: insumo activo y de la organización, contenido > 0 sin redondeo, incremento solo si es fraccionable", async () => {
    const a = await admin();
    expect((await a.post("/api/v1/admin/productos", producto({ contenido: "1.1234567" }), idem())).status).toBe(400);
    expect((await a.post("/api/v1/admin/productos", producto({ fraccionable: true }), idem())).status).toBe(400);
    expect((await a.post("/api/v1/admin/productos", producto({ insumoCodigo: "INS-99999" }), idem())).status).toBe(404);
    expect((await a.post("/api/v1/admin/productos", producto({ unidadCompra: "xyz" }), idem())).cuerpo.error.codigo).toBe("VALOR_INVALIDO");
    const ok = await a.post("/api/v1/admin/productos", producto({ fraccionable: true, incrementoMinimo: "0.25", contenido: "25.5", unidadCompra: "bulto", insumoCodigo: "INS-00011" }), idem());
    expect(ok.status, ok.texto).toBe(201);
    expect(ok.cuerpo).toMatchObject({ contenido: "25.5", incrementoMinimo: "0.25", tienePrecios: false, insumo: { codigo: "INS-00011", unidadBase: "kg" } });
    const dup = await a.post("/api/v1/admin/productos", producto({ descripcion: ok.cuerpo.descripcion.toUpperCase(), presentacion: "PIEZA" }), idem());
    expect(dup.status).toBe(409);
    expect(dup.cuerpo.error.codigo).toBe("DUPLICADO");
  });

  it("sin precios se editan los campos técnicos; con un precio (vigente, vencido o anulado) quedan bloqueados en API y base", async () => {
    const a = await admin();
    const prd = await productoCreado(a);
    const e1 = await a.patch(`/api/v1/admin/productos/${prd}`, { revision: 0, contenido: "2", presentacion: "paquete de 2 piezas" });
    expect(e1.status, e1.texto).toBe(200);
    expect(e1.cuerpo).toMatchObject({ contenido: "2", presentacion: "paquete de 2 piezas", revision: 1 });
    // Un precio ya vencido también bloquea.
    const vencido = await precioRegistrado(a, prd, "PRV-00001", { vigenteDesde: "2026-08-01", vigenteHasta: "2026-08-31" });
    expect(vencido.estado).toBe("VENCIDO");
    for (const cambio of [{ contenido: "3" }, { unidadCompra: "lote" }, { fraccionable: true, incrementoMinimo: "1" }, { insumoCodigo: "INS-00001" }, { presentacion: "otra" }]) {
      const r = await a.patch(`/api/v1/admin/productos/${prd}`, { revision: 1, ...cambio });
      expect(r.status, JSON.stringify(cambio)).toBe(422);
      expect(r.cuerpo.error.codigo).toBe("PRODUCTO_CON_PRECIOS");
    }
    // Reenviar el mismo valor no es un cambio técnico.
    expect((await a.patch(`/api/v1/admin/productos/${prd}`, { revision: 1, contenido: "2.000" })).status).toBe(200);
    const desc = await a.patch(`/api/v1/admin/productos/${prd}`, { revision: 1, descripcion: `[DEMO] Descripción corregida ${sufijo()}` });
    expect(desc.status, desc.texto).toBe(200);
    // Anular el precio no permite eludir el bloqueo.
    const anul = await a.post(`/api/v1/admin/precios/${vencido.codigo}/anulacion`, { revision: vencido.revision, motivo: MOTIVO }, idem());
    expect(anul.status, anul.texto).toBe(200);
    expect((await a.patch(`/api/v1/admin/productos/${prd}`, { revision: desc.cuerpo.revision, contenido: "5" })).cuerpo.error.codigo).toBe("PRODUCTO_CON_PRECIOS");
    // El disparador lo impone también al propietario de la tabla.
    await expect(migrador.$executeRaw`UPDATE producto SET contenido = 9 WHERE organizacion_id = ${org}::uuid AND codigo = ${prd}`).rejects.toThrow(/PRODUCTO_CON_PRECIOS/);
    const off = await a.patch(`/api/v1/admin/productos/${prd}`, { revision: desc.cuerpo.revision, activo: false });
    expect(off.status).toBe(200);
  });

  it("carrera: registrar un precio mientras se edita el contenido no permite saltar el bloqueo", async () => {
    const a = await admin();
    const prd = await productoCreado(a);
    const [ids] = await migrador.$queryRaw<{ producto: string; proveedor: string }[]>`
      SELECT p.id::text AS producto, r.id::text AS proveedor FROM producto p, proveedor r
       WHERE p.organizacion_id = ${org}::uuid AND p.codigo = ${prd} AND r.organizacion_id = ${org}::uuid AND r.codigo = 'PRV-00001'`;
    let edicion: Promise<{ status: number; cuerpo: any }> | null = null;
    let resuelta = false;
    await migrador.$transaction(
      async (tx) => {
        await tx.$executeRaw`INSERT INTO precio (organizacion_id, codigo, producto_id, proveedor_id, precio_unitario, vigente_desde, vigente_hasta, fuente)
          VALUES (${org}::uuid, ${`PRE-CARRERA-${sufijo()}`}, ${ids!.producto}::uuid, ${ids!.proveedor}::uuid, 10, '2026-10-01', '2026-10-31', '[DEMO] carrera')`;
        edicion = a.patch(`/api/v1/admin/productos/${prd}`, { revision: 0, contenido: "7" });
        void edicion.then(() => (resuelta = true));
        await new Promise((r) => setTimeout(r, 700));
        // La edición espera el bloqueo del producto mientras el precio no se confirma.
        expect(resuelta).toBe(false);
      },
      { timeout: 20_000 },
    );
    const r = await edicion!;
    expect(r.status).toBe(422);
    expect(r.cuerpo.error.codigo).toBe("PRODUCTO_CON_PRECIOS");
    const d = await a.get(`/api/v1/admin/productos/${prd}`);
    expect(d.cuerpo.producto).toMatchObject({ contenido: "1", tienePrecios: true, revision: 0 });
  });
});

describe("precios (06 PRECIOS): registrar sin solape, anular con motivo, cerrar vigencia con sucesor", () => {
  it("TI-060: el solape con el mismo producto y proveedor se rechaza en el límite inclusivo; el día siguiente es válido", async () => {
    const a = await admin();
    const prd = await productoCreado(a);
    const p1 = await precioRegistrado(a, prd, "PRV-00002", { vigenteDesde: "2026-09-01", vigenteHasta: "2027-03-31" });
    expect(p1.codigo).toMatch(/^PRE-\d{6}$/);
    const solape = await a.post("/api/v1/admin/precios", precio(prd, "PRV-00002", { vigenteDesde: "2027-03-31", vigenteHasta: "2027-06-30" }), idem());
    expect(solape.status, solape.texto).toBe(409);
    expect(solape.cuerpo.error.codigo).toBe("SOLAPE_VIGENCIA");
    expect(solape.cuerpo.error.mensaje).toBe(`Ya existe un precio vigente de ese proveedor en el periodo (${p1.codigo}, 2026-09-01 a 2027-03-31).`);
    // Otro proveedor del mismo producto sí puede (D-12) y el día siguiente también.
    await precioRegistrado(a, prd, "PRV-00001", { vigenteDesde: "2027-03-31", vigenteHasta: "2027-06-30" });
    await precioRegistrado(a, prd, "PRV-00002", { vigenteDesde: "2027-04-01", vigenteHasta: "2027-06-30" });
    // Escala del importe: no se redondea en PostgreSQL.
    const escala = await a.post("/api/v1/admin/precios", precio(prd, "PRV-00002", { precioUnitario: "10.1234567", vigenteDesde: "2027-07-01", vigenteHasta: "2027-07-31" }), idem());
    expect(escala.status).toBe(400);
    const exacto = await precioRegistrado(a, prd, "PRV-00002", { precioUnitario: "10.123456", vigenteDesde: "2027-07-01", vigenteHasta: "2027-07-31" });
    const [fila] = await migrador.$queryRaw<{ p: string }[]>`SELECT precio_unitario::text AS p FROM precio WHERE organizacion_id = ${org}::uuid AND codigo = ${exacto.codigo}`;
    expect(fila!.p).toBe("10.123456");
    // Un anulado no bloquea el periodo.
    const anul = await a.post(`/api/v1/admin/precios/${exacto.codigo}/anulacion`, { revision: 0, motivo: MOTIVO }, idem());
    expect(anul.status).toBe(200);
    await precioRegistrado(a, prd, "PRV-00002", { vigenteDesde: "2027-07-01", vigenteHasta: "2027-07-31" });
  });

  it("anular: motivo obligatorio, definitivo, idempotente y registrado; la base impide editar importes o reactivar", async () => {
    const a = await admin();
    const prd = await productoCreado(a);
    const p = await precioRegistrado(a, prd, "PRV-00001");
    expect((await a.post(`/api/v1/admin/precios/${p.codigo}/anulacion`, { revision: 0, motivo: "corto" }, idem())).status).toBe(400);
    const clave = randomUUID();
    const r1 = await a.post(`/api/v1/admin/precios/${p.codigo}/anulacion`, { revision: 0, motivo: MOTIVO }, idem(clave));
    expect(r1.status, r1.texto).toBe(200);
    expect(r1.cuerpo).toMatchObject({ estado: "ANULADO", motivoAnulacion: MOTIVO, anuladoPor: "[DEMO] Administradora del catálogo Begoña", precioUnitario: "13.9" });
    const repetida = await a.post(`/api/v1/admin/precios/${p.codigo}/anulacion`, { revision: 0, motivo: MOTIVO }, idem(clave));
    expect(repetida.status).toBe(200);
    expect(repetida.headers.get("idempotent-replayed")).toBe("true");
    const otra = await a.post(`/api/v1/admin/precios/${p.codigo}/anulacion`, { revision: 1, motivo: MOTIVO }, idem());
    expect(otra.status).toBe(409);
    expect(otra.cuerpo.error.codigo).toBe("PRECIO_ANULADO");
    const d = await a.get(`/api/v1/admin/precios/${p.codigo}`);
    expect(d.cuerpo.historial[0]).toMatchObject({ tipo: "PRECIO_ANULADO", detalle: { motivo: MOTIVO } });
    await expect(migrador.$executeRaw`UPDATE precio SET precio_unitario = 1 WHERE organizacion_id = ${org}::uuid AND codigo = ${p.codigo}`).rejects.toThrow(/REGISTRO_INMUTABLE/);
    await expect(migrador.$executeRaw`UPDATE precio SET anulado = false, motivo_anulacion = NULL, anulado_en = NULL, anulado_por = NULL WHERE organizacion_id = ${org}::uuid AND codigo = ${p.codigo}`).rejects.toThrow(/PRECIO_ANULADO/);
    await expect(migrador.$executeRaw`DELETE FROM precio WHERE organizacion_id = ${org}::uuid AND codigo = ${p.codigo}`).rejects.toThrow(/REGISTRO_INMUTABLE/);
    // softarq_app tampoco puede cambiar el importe aunque lo intente sin la función.
    await expect(prisma.$executeRaw`UPDATE precio SET precio_unitario = 1 WHERE organizacion_id = ${org}::uuid AND codigo = ${p.codigo}`).rejects.toThrow(/permis|permission/i);
  });

  it("cierre de vigencia: hoy permite sucesor mañana; ayer, ampliar o igualar se rechaza; si el sucesor falla no se acorta nada", async () => {
    const a = await admin();
    const prd = await productoCreado(a);
    const p = await precioRegistrado(a, prd, "PRV-00001", { vigenteDesde: "2026-09-01", vigenteHasta: "2027-03-31" });
    const futuro = await precioRegistrado(a, prd, "PRV-00001", { vigenteDesde: "2027-05-01", vigenteHasta: "2027-06-30" });
    const cierre = (nuevaHasta: string, desde: string, hasta = "2027-03-31") => ({
      revision: 0,
      nuevaHasta,
      motivo: MOTIVO,
      sucesor: { precioUnitario: "14.2", vigenteDesde: desde, vigenteHasta: hasta, fuente: "[DEMO] Lista nueva ficticia" },
    });
    for (const [c, codigo] of [
      [cierre("2026-10-16", "2026-10-17"), "VIGENCIA_INVALIDA"],
      [cierre("2027-03-31", "2027-04-01", "2027-04-15"), "VIGENCIA_INVALIDA"],
      [cierre("2027-04-30", "2027-05-01", "2027-05-15"), "VIGENCIA_INVALIDA"],
    ] as const) {
      const r = await a.post(`/api/v1/admin/precios/${p.codigo}/cierre-vigencia`, c, idem());
      expect(r.status, r.texto).toBe(422);
      expect(r.cuerpo.error.codigo).toBe(codigo);
    }
    // El sucesor se solapa con el precio futuro: nada cambia (una sola sentencia).
    const falla = await a.post(`/api/v1/admin/precios/${p.codigo}/cierre-vigencia`, cierre(HOY, MANANA, "2027-05-15"), idem());
    expect(falla.status, falla.texto).toBe(409);
    expect(falla.cuerpo.error.codigo).toBe("SOLAPE_VIGENCIA");
    expect(falla.cuerpo.error.registroVigente.codigo).toBe(futuro.codigo);
    const intacto = await a.get(`/api/v1/admin/precios/${p.codigo}`);
    expect(intacto.cuerpo.precio).toMatchObject({ vigenteHasta: "2027-03-31", revision: 0 });
    // Dos cierres simultáneos con la misma revisión: uno solo.
    const carrera = await Promise.all([
      a.post(`/api/v1/admin/precios/${p.codigo}/cierre-vigencia`, cierre(HOY, MANANA), idem()),
      a.post(`/api/v1/admin/precios/${p.codigo}/cierre-vigencia`, cierre(HOY, MANANA), idem()),
    ]);
    expect(carrera.map((r) => r.status).sort()).toEqual([201, 409]);
    const ok = carrera.find((r) => r.status === 201)!;
    expect(ok.cuerpo.cerrado).toMatchObject({ codigo: p.codigo, vigenteHasta: HOY, precioUnitario: "13.9", estado: "VIGENTE" });
    expect(ok.cuerpo.sucesor).toMatchObject({ vigenteDesde: MANANA, vigenteHasta: "2027-03-31", precioUnitario: "14.2", estado: "FUTURO" });
    const perdedor = carrera.find((r) => r.status === 409)!;
    expect(perdedor.cuerpo.error.codigo).toBe("CONFLICTO_EDICION");
    const hist = (await a.get(`/api/v1/admin/precios/${p.codigo}`)).cuerpo.historial;
    expect(hist[0]).toMatchObject({
      tipo: "PRECIO_VIGENCIA_CERRADA",
      usuario: "[DEMO] Administradora del catálogo Begoña",
      detalle: { hastaAnterior: "2027-03-31", hastaNueva: HOY, motivo: MOTIVO, sucesor: ok.cuerpo.sucesor.codigo, fechaNegocio: HOY },
    });
    // Desde el día siguiente el precio cerrado está vencido y el sucesor vigente.
    const m = await admin(urlManana);
    expect((await m.get(`/api/v1/admin/precios/${p.codigo}`)).cuerpo.precio.estado).toBe("VENCIDO");
    expect((await m.get(`/api/v1/admin/precios/${ok.cuerpo.sucesor.codigo}`)).cuerpo.precio.estado).toBe("VIGENTE");
    // La base solo admite acortar: ampliar falla también para el propietario.
    await expect(migrador.$executeRaw`UPDATE precio SET vigente_hasta = '2027-12-31' WHERE organizacion_id = ${org}::uuid AND codigo = ${p.codigo}`).rejects.toThrow(/VIGENCIA_INVALIDA/);
  });
});

describe("tarifas (07 MANO_OBRA) y asignación al concepto (Word §3.5)", () => {
  it("registro con las modalidades del libro; unidades admitidas; no se editan; desactivar y reactivar", async () => {
    const a = await admin();
    expect((await a.post("/api/v1/admin/tarifas", tarifa({ modalidad: "JORNADA" }), idem())).status).toBe(400);
    expect((await a.post("/api/v1/admin/tarifas", tarifa({ unidad: "jor" }), idem())).cuerpo.error.codigo).toBe("VALOR_INVALIDO");
    const prv = await proveedorCreado(a);
    const t = await a.post("/api/v1/admin/tarifas", tarifa({ modalidad: "SUBCONTRATO", proveedorCodigo: prv, importe: "95.5" }), idem());
    expect(t.status, t.texto).toBe(201);
    expect(t.cuerpo).toMatchObject({ modalidad: "SUBCONTRATO", importe: "95.5", proveedor: { codigo: prv }, activa: true, vigenteHoy: true });
    const j = await a.post("/api/v1/admin/tarifas", tarifa({ modalidad: "JORNADA", unidad: "m3", rendimientoJornada: "0.6", importe: "1500" }), idem());
    expect(j.status, j.texto).toBe(201);
    expect(j.cuerpo.rendimientoJornada).toBe("0.6");
    const off = await a.patch(`/api/v1/admin/tarifas/${t.cuerpo.codigo}`, { revision: 0, activa: false });
    expect(off.status).toBe(200);
    expect((await a.patch(`/api/v1/admin/tarifas/${t.cuerpo.codigo}`, { revision: 0, activa: true })).status).toBe(409);
    expect((await a.patch(`/api/v1/admin/tarifas/${t.cuerpo.codigo}`, { revision: 1, importe: "1" })).status).toBe(400);
    await expect(migrador.$executeRaw`UPDATE tarifa_mano_obra SET importe = 1 WHERE organizacion_id = ${org}::uuid AND codigo = ${t.cuerpo.codigo}`).rejects.toThrow(/REGISTRO_INMUTABLE/);
    // Proveedor desactivado no puede ser subcontratista de una tarifa nueva.
    await a.patch(`/api/v1/admin/proveedores/${prv}`, { revision: 0, activo: false });
    expect((await a.post("/api/v1/admin/tarifas", tarifa({ proveedorCodigo: prv }), idem())).cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
  });

  it("asignar: unidad compatible (BL-06), activa, concurrencia por la tarifa vista, aprobación conservada y bitácora", async () => {
    const a = await admin();
    const m3 = (await a.post("/api/v1/admin/tarifas", tarifa({ unidad: "m3" }), idem())).cuerpo.codigo as string;
    const inactiva = (await a.post("/api/v1/admin/tarifas", tarifa(), idem())).cuerpo.codigo as string;
    await a.patch(`/api/v1/admin/tarifas/${inactiva}`, { revision: 0, activa: false });
    const nueva = (await a.post("/api/v1/admin/tarifas", tarifa(), idem())).cuerpo.codigo as string;
    const asignar = (actual: string | null, t: string, o = idem()) => a.post("/api/v1/admin/conceptos/CON-00001/tarifa", { tarifaActual: actual, tarifaNueva: t, motivo: MOTIVO }, o);
    expect((await asignar("TMO-00001", m3)).cuerpo.error.codigo).toBe("UNIDAD_INCOMPATIBLE");
    expect((await asignar("TMO-00001", inactiva)).cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    expect((await asignar("TMO-00001", "TMO-99999")).status).toBe(404);
    const vista = await asignar("TMO-00009", nueva);
    expect(vista.status).toBe(409);
    expect(vista.cuerpo.error.codigo).toBe("CONFLICTO_TARIFA");
    expect(vista.cuerpo.error.registroVigente.tarifa.codigo).toBe("TMO-00001");
    const carrera = await Promise.all([asignar("TMO-00001", nueva), asignar("TMO-00001", "TMO-00005")]);
    expect(carrera.map((r) => r.status).sort()).toEqual([200, 409]);
    const ganador = carrera.find((r) => r.status === 200)!;
    expect(ganador.cuerpo).toMatchObject({ codigo: "CON-00001", estado: "Aprobado" });
    const [ev] = await migrador.$queryRaw<{ tipo: string; detalle: Record<string, unknown> }[]>`
      SELECT b.tipo, b.detalle FROM bitacora b JOIN concepto c ON c.id = b.entidad_id
       WHERE c.organizacion_id = ${org}::uuid AND c.codigo = 'CON-00001' ORDER BY b.ocurrido_en DESC LIMIT 1`;
    expect(ev).toMatchObject({ tipo: "CONCEPTO_TARIFA_ASIGNADA", detalle: { tarifaAnterior: "TMO-00001", motivo: MOTIVO, estadoConcepto: "Aprobado" } });
    expect((await (await adminB()).post("/api/v1/admin/conceptos/CON-00001/tarifa", { tarifaActual: "TMO-00001", tarifaNueva: nueva, motivo: MOTIVO }, idem())).status).toBe(404);
    // Restaurar la tarifa original del concepto para las demás pruebas.
    const actual = ganador.cuerpo.tarifa.codigo as string;
    expect((await asignar(actual, "TMO-00001")).status).toBe(200);
  });
});

describe("integración con el cotizador (sin selección automática; versiones y PDF intactos)", () => {
  it("opción nueva visible; desactivada deja de ofrecerse; el borrador conserva la referencia y el cálculo la bloquea (BL-08)", async () => {
    const a = await admin();
    const prv = await proveedorCreado(a);
    const nuevo = await precioRegistrado(a, "PCM-00010", prv, { precioUnitario: "13.5", vigenteDesde: "2026-10-01", vigenteHasta: "2027-03-31" });
    const p = await preparador();
    const opciones = async () => EsquemaRespuestaOpcionesPrecio.parse((await p.get("/api/v1/catalogos/opciones-precio?conceptos=CON-00009")).cuerpo);
    const block = (await opciones()).insumos.find((i) => i.insumoCodigo === "INS-00010")!;
    expect(block.opciones.map((o) => o.precioCodigo)).toContain(nuevo.codigo);
    // Ningún precio se elige por el usuario: la captura nueva no trae selección para el block.
    const base = borradorDesdeEntrada(SV.entrada as EntradaCalculo);
    const captura: CapturaBorrador = { ...base, seleccion: base.seleccion.map((s) => (s.insumoCodigo === "INS-00010" ? { ...s, precioCodigo: nuevo.codigo } : s)) };
    const id = await cotizacionSV(p, captura);
    // El proveedor se desactiva: la opción desaparece para selecciones nuevas.
    const det = (await a.get(`/api/v1/admin/proveedores/${prv}`)).cuerpo;
    expect(det.impacto).toMatchObject({ preciosVigentes: 1, borradoresAbiertos: 1 });
    expect((await a.patch(`/api/v1/admin/proveedores/${prv}`, { revision: det.proveedor.revision, activo: false })).status).toBe(200);
    expect((await opciones()).insumos.find((i) => i.insumoCodigo === "INS-00010")!.opciones.map((o) => o.precioCodigo)).not.toContain(nuevo.codigo);
    // El borrador conserva la referencia; guardar otro campo no la borra.
    const b = await borrador(p, id);
    expect(b.captura.seleccion).toContainEqual({ insumoCodigo: "INS-00010", precioCodigo: nuevo.codigo });
    const guardado = await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: b.revision, captura: { ...b.captura, consolidarCompras: !b.captura.consolidarCompras } });
    expect(guardado.status, guardado.texto).toBe(200);
    expect((await borrador(p, id)).captura.seleccion).toContainEqual({ insumoCodigo: "INS-00010", precioCodigo: nuevo.codigo });
    const calculo = await version(p, id);
    expect(calculo.status, calculo.texto).toBe(422);
    expect(calculo.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-08");
  });

  it("calcula con un precio administrado (22,405.28) y, tras cambiar el catálogo, la versión, la emisión y el PDF no cambian; la verificación bloquea con BL-16", async () => {
    const a = await admin();
    const p = await preparador();
    // Sucesor administrado de PRE-000016 (block $13.90) en una organización de pruebas.
    const original = (await a.get("/api/v1/admin/precios/PRE-000016")).cuerpo.precio;
    const cierre = await a.post(
      "/api/v1/admin/precios/PRE-000016/cierre-vigencia",
      { revision: original.revision, nuevaHasta: HOY, motivo: MOTIVO, sucesor: { precioUnitario: "13.90", vigenteDesde: MANANA, vigenteHasta: "2027-09-30", fuente: "[DEMO] Sucesor de comprobación" } },
      idem(),
    );
    expect(cierre.status, cierre.texto).toBe(201);
    const sucesor = cierre.cuerpo.sucesor.codigo as string;
    // Mañana, una cotización que elige explícitamente el sucesor da la cifra de la fuente.
    const pm = await preparador(urlManana);
    const base = borradorDesdeEntrada(SV.entrada as EntradaCalculo);
    const id2 = await cotizacionSV(pm, { ...base, seleccion: base.seleccion.map((s) => (s.precioCodigo === "PRE-000016" ? { ...s, precioCodigo: sucesor } : s)) });
    const v2 = await version(pm, id2);
    expect(v2.status, v2.texto).toBe(201);
    expect(v2.cuerpo.cotizacion.total).toBe(SV.esperado.total);
    expect(SV.esperado.total).toBe("22405.28");

    // Hoy: versión con el catálogo DEMO, aprobada por otra persona y emitida.
    const id = await cotizacionSV(p);
    const v = await version(p, id);
    expect(v.status, v.texto).toBe(201);
    expect(v.cuerpo.cotizacion.total).toBe("22405.28");
    const b = await borrador(p, id);
    const env = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: b.revision }, idem());
    expect(env.status, env.texto).toBe(201);
    const rev = EsquemaDetalleRevision.parse(env.cuerpo);
    const r = await revisor();
    const apr = await r.post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId: rev.revision.version.id, revision: rev.revision.revision }, idem());
    expect(apr.status, apr.texto).toBe(200);
    const emi = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId: rev.revision.version.id, revisionId: rev.revision.id }, idem());
    expect(emi.status, emi.texto).toBe(201);
    const pdf = async () => {
      const res = await fetch(`${p.url}/api/v1/emisiones/${emi.cuerpo.emision.id}/documento`, { headers: { Cookie: `${NOMBRE_COOKIE}=${p.cookie}` } });
      expect(res.status).toBe(200);
      return createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex");
    };
    const antes = { version: await filaVersion(id, 1), pdf: await pdf(), emision: (await migrador.$queryRaw<{ f: unknown }[]>`SELECT to_jsonb(e) AS f FROM emision e WHERE id = ${emi.cuerpo.emision.id}::uuid`)[0]!.f };

    // Otra cotización con v1 sin enviar: tras asignar otra tarifa al concepto, la verificación la bloquea (BL-16).
    const id3 = await cotizacionSV(p);
    expect((await version(p, id3)).status).toBe(201);
    expect((await verificacion(p, id3, 1)).bloqueos).toEqual([]);
    const otra = (await a.post("/api/v1/admin/tarifas", tarifa({ importe: "215" }), idem())).cuerpo.codigo as string;
    expect((await a.post("/api/v1/admin/conceptos/CON-00009/tarifa", { tarifaActual: "TMO-00005", tarifaNueva: otra, motivo: MOTIVO }, idem())).status).toBe(200);
    const ver = await verificacion(p, id3, 1);
    expect(ver.bloqueos.map((x) => x.codigo)).toContain("BL-16");
    const b3 = await borrador(p, id3);
    const envio = await p.post(`/api/v1/cotizaciones/${id3}/versiones/1/revisiones`, { revisionBorrador: b3.revision }, idem());
    expect(envio.status, envio.texto).toBe(422);
    expect(envio.cuerpo.error.codigo).toBe("ENVIO_BLOQUEADO");
    // Anular el precio usado por la versión emitida tampoco la toca.
    const pre17 = (await a.get("/api/v1/admin/precios/PRE-000017")).cuerpo.precio;
    expect((await a.post("/api/v1/admin/precios/PRE-000017/anulacion", { revision: pre17.revision, motivo: MOTIVO }, idem())).status).toBe(200);
    const despues = { version: await filaVersion(id, 1), pdf: await pdf(), emision: (await migrador.$queryRaw<{ f: unknown }[]>`SELECT to_jsonb(e) AS f FROM emision e WHERE id = ${emi.cuerpo.emision.id}::uuid`)[0]!.f };
    expect(despues).toEqual(antes);
    // Una versión nueva con la tarifa nueva recalcula y la anulación bloquea con BL-08 (sin sustituir).
    const v3b = await version(p, id3, 2);
    expect(v3b.status).toBe(422);
    expect(v3b.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-08");
    // Restaurar el catálogo de la organización de pruebas no es posible para el precio anulado (definitivo);
    // la tarifa sí se reasigna.
    expect((await a.post("/api/v1/admin/conceptos/CON-00009/tarifa", { tarifaActual: otra, tarifaNueva: "TMO-00005", motivo: MOTIVO }, idem())).status).toBe(200);
  });

  it("la carga DEMO repetida no revierte ediciones administrativas", async () => {
    const a = await admin();
    const d = (await a.get("/api/v1/admin/proveedores/PRV-00002")).cuerpo.proveedor;
    const nombre = "[DEMO] Proveedor Dos (ficticio) — contacto actualizado";
    expect((await a.patch("/api/v1/admin/proveedores/PRV-00002", { revision: d.revision, nombre, telefono: "55 0000 0000" })).status).toBe(200);
    const r = await cargarDemo(prisma, { codigo: "DEMO-CAT", nombre: "[DEMO] Módulo once" });
    // Informa sin corregir el precio DEMO cuya vigencia se cerró en una prueba anterior.
    expect(r.diferencias.some((x) => x.startsWith("precio PRE-000016"))).toBe(true);
    expect(r.creados).toEqual({});
    expect((await a.get("/api/v1/admin/proveedores/PRV-00002")).cuerpo.proveedor).toMatchObject({ nombre, telefono: "55 0000 0000" });
    expect((await a.get("/api/v1/admin/precios/PRE-000016")).cuerpo.precio.vigenteHasta).toBe(HOY);
    expect((await a.get("/api/v1/admin/precios/PRE-000017")).cuerpo.precio.estado).toBe("ANULADO");
  });
});
