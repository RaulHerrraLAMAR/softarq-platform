/**
 * Salidas internas de solo lectura (módulo 14, ADR-0018), por HTTP con sesiones reales contra
 * softarq_test: permiso propio `salidas.consultar` (Preparador y Revisor), sesión, organización,
 * versión concreta, inmutabilidad al consultar, catálogo modificado después del cálculo y
 * versiones anteriores sin referencias congeladas. Totales de referencia de la guía (54,190.68;
 * 43,312.16; 22,405.28; 4,911.79) y unidades por producto de las fixtures, copiados de la fuente.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaSalidasInternasVersion, type CapturaBorrador, type EntradaCalculo, type SalidasInternasVersion } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { dec } from "../modules/calculo/domain/decimal.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { MOTIVO_SIN_NOMBRES } from "../modules/cotizaciones/dominio/salidas-internas.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
const REFERENCIAS = ["GUIA-R1-FALDONES-10M", "GUIA-R2-ESPESOR-012", "GUIA-R3-SIN-VENTANA", "GUIA-PROPIA-CON-00001"] as const;
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
/** Claves que solo existen en el contrato interno; nunca en los comerciales. */
const INTERNAS = /costoProrrateado|costoCompra|costoDirecto|costoMateriales|margen|recargo|sobrante|consumoBase|proveedor|referenciasInternas|resultadoInterno|entradaCalculo/i;

const prisma = prismaApp();
let migrador: ClientePrisma;
let url: string;
let org: string;
let orgC: string;
let app: INestApplication;
const cred: Record<string, Credencial> = {};
const entrar = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const ruta = (id: string, n: number) => `/api/v1/cotizaciones/${id}/versiones/${n}/salidas-internas`;

async function cotizacion(c: ClienteHttp, captura: CapturaBorrador) {
  const s = randomUUID().slice(0, 6);
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente salidas ${s}`, contactoNombre: "Begoña Íñiguez", contactoTelefono: "55 1234 5678" }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra salidas ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán" }, idem());
  expect(pry.status, pry.texto).toBe(201);
  const cot = await c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
  expect(cot.status, cot.texto).toBe(201);
  return { id: cot.cuerpo.cotizacion.id as string, folio: cot.cuerpo.cotizacion.folio as string, revision: cot.cuerpo.borrador.revision as number };
}

async function version(c: ClienteHttp, id: string, revisionBorrador: number, motivo?: string) {
  const v = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador, ...(motivo ? { motivo } : {}) }, idem());
  expect(v.status, v.texto).toBe(201);
  return v.cuerpo;
}

async function salidas(c: ClienteHttp, id: string, n: number): Promise<SalidasInternasVersion> {
  const r = await c.get(ruta(id, n));
  expect(r.status, r.texto).toBe(200);
  return EsquemaSalidasInternasVersion.parse(r.cuerpo);
}

/** Huella de todo lo que el negocio escribe para una organización (sin sesiones ni registros técnicos). */
async function huellaNegocio(): Promise<string> {
  const [f] = await migrador.$queryRaw<{ h: string }[]>`
    SELECT md5(concat_ws('|',
      (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY to_jsonb(v)::text), '[]') FROM cotizacion_version v WHERE v.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY to_jsonb(c)::text), '[]') FROM cotizacion c WHERE c.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text), '[]') FROM cotizacion_borrador b WHERE b.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]') FROM revision r WHERE r.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text), '[]') FROM revision_evento e WHERE e.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text), '[]') FROM emision e WHERE e.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY to_jsonb(d)::text), '[]') FROM excepcion_decision d WHERE d.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text), '[]') FROM bitacora b WHERE b.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY to_jsonb(k)::text), '[]') FROM contador k WHERE k.organizacion_id = ${org}::uuid),
      (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY to_jsonb(i)::text), '[]') FROM idempotencia i WHERE i.organizacion_id = ${org}::uuid)
    )) AS h`;
  return f!.h;
}

const usuarioId = async (correo: string) => (await migrador.usuario.findUniqueOrThrow({ where: { correo } })).id;

beforeAll(async () => {
  org = (await cargarDemo(prisma, { codigo: "DEMO-SAL", nombre: "[DEMO] Módulo catorce" })).organizacionId;
  await cargarDemo(prisma, { codigo: "DEMO-SAL-B", nombre: "[DEMO] Módulo catorce B" });
  orgC = (await cargarDemo(prisma, { codigo: "DEMO-SAL-C", nombre: "[DEMO] Módulo catorce C" })).organizacionId;
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-SAL", [
      cuenta("prep.sal@softarq.test", "[DEMO] Preparadora Módulo Catorce", "PREPARADOR"),
      cuenta("rev.sal@softarq.test", "[DEMO] Revisor Módulo Catorce", "REVISOR"),
      cuenta("cat.sal@softarq.test", "[DEMO] Administrador del catálogo", "ADMIN_CATALOGO"),
      cuenta("sis.sal@softarq.test", "[DEMO] Administrador del sistema", "ADMIN_SISTEMA"),
      cuenta("admins.sal@softarq.test", "[DEMO] Ambos administradores", "ADMIN_CATALOGO", "ADMIN_SISTEMA"),
      cuenta("ambas.sal@softarq.test", "[DEMO] Preparador y Revisor", "PREPARADOR", "REVISOR"),
      cuenta("sisprep.sal@softarq.test", "[DEMO] Sistema y Preparador", "ADMIN_SISTEMA", "PREPARADOR"),
      cuenta("retiro.sal@softarq.test", "[DEMO] Función retirada", "REVISOR"),
      cuenta("baja.sal@softarq.test", "[DEMO] Persona desactivada", "REVISOR"),
      cuenta("temporal.sal@softarq.test", "[DEMO] Contraseña temporal", "REVISOR"),
    ]),
    await crearCuentas(migrador, "DEMO-SAL-B", [cuenta("prep.salb@softarq.test", "[DEMO] Preparador otra organización", "PREPARADOR")]),
    await crearCuentas(migrador, "DEMO-SAL-C", [cuenta("prep.salc@softarq.test", "[DEMO] Preparador catálogo cambiado", "PREPARADOR")]),
  );
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "1000" }),
    { reloj: new RelojFijo(FECHA) },
  );
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
}, 120_000);

afterAll(async () => {
  await app?.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

describe("permiso salidas.consultar, sesión y organización", () => {
  let id: string;
  beforeAll(async () => {
    const p = await entrar("prep.sal@softarq.test");
    const c = await cotizacion(p, borradorDesdeEntrada(R1.entrada as EntradaCalculo));
    id = c.id;
    await version(p, id, c.revision);
  });

  it.each([
    ["Preparador", "prep.sal@softarq.test", 200],
    ["Revisor", "rev.sal@softarq.test", 200],
    ["Preparador y Revisor", "ambas.sal@softarq.test", 200],
    ["Administrador del sistema con Preparador", "sisprep.sal@softarq.test", 200],
    ["Administrador del catálogo", "cat.sal@softarq.test", 403],
    ["Administrador del sistema", "sis.sal@softarq.test", 403],
    ["ambos administradores", "admins.sal@softarq.test", 403],
  ])("%s → %i", async (_, correo, estado) => {
    const c = await entrar(correo);
    const r = await c.get(ruta(id, 1));
    expect(r.status, r.texto).toBe(estado);
    if (estado === 403) {
      expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
      expect(r.texto).not.toMatch(INTERNAS);
      // La consulta comercial de la versión sigue disponible para quien tiene cotizaciones.consultar.
      expect((await c.get(`/api/v1/cotizaciones/${id}/versiones/1`)).status).toBe(200);
    }
  });

  it("la sesión anuncia la capacidad solo a Preparador y Revisor", async () => {
    for (const [correo, tiene] of [["prep.sal@softarq.test", true], ["rev.sal@softarq.test", true], ["cat.sal@softarq.test", false], ["sis.sal@softarq.test", false]] as const) {
      const r = await (await entrar(correo)).get("/api/v1/auth/sesion");
      expect(r.cuerpo.capacidades.includes("salidas.consultar"), correo).toBe(tiene);
    }
  });

  it("sin sesión 401; otra organización, otra versión o identificadores inválidos 404 sin datos", async () => {
    expect((await new ClienteHttp(url).get(ruta(id, 1))).status).toBe(401);
    const ajeno = await entrar("prep.salb@softarq.test");
    const r = await ajeno.get(ruta(id, 1));
    expect(r.status).toBe(404);
    expect(r.texto).not.toMatch(INTERNAS);
    const p = await entrar("prep.sal@softarq.test");
    expect((await p.get(ruta(id, 2))).status).toBe(404);
    expect((await p.get(ruta(randomUUID(), 1))).status).toBe(404);
    expect((await p.get(`/api/v1/cotizaciones/no-es-uuid/versiones/1/salidas-internas`)).status).toBe(404);
    expect((await p.get(`/api/v1/cotizaciones/${id}/versiones/0/salidas-internas`)).status).toBe(404);
  });

  it("función retirada con la sesión abierta: 403 en la petición siguiente", async () => {
    const c = await entrar("retiro.sal@softarq.test");
    expect((await c.get(ruta(id, 1))).status).toBe(200);
    const u = await usuarioId("retiro.sal@softarq.test");
    await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['ADMIN_CATALOGO']::varchar[] WHERE usuario_id = ${u}::uuid AND organizacion_id = ${org}::uuid`;
    try {
      const r = await c.get(ruta(id, 1));
      expect(r.status).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
      expect((await c.get("/api/v1/auth/sesion")).cuerpo.capacidades).not.toContain("salidas.consultar");
    } finally {
      await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['REVISOR']::varchar[] WHERE usuario_id = ${u}::uuid AND organizacion_id = ${org}::uuid`;
    }
  });

  it("persona desactivada con la sesión abierta: 401", async () => {
    const c = await entrar("baja.sal@softarq.test");
    expect((await c.get(ruta(id, 1))).status).toBe(200);
    const u = await usuarioId("baja.sal@softarq.test");
    await migrador.$executeRaw`UPDATE usuario SET activo = false WHERE id = ${u}::uuid`;
    const r = await c.get(ruta(id, 1));
    expect(r.status).toBe(401);
    expect(r.texto).not.toMatch(INTERNAS);
  });

  it("contraseña temporal pendiente de cambio: 403 CAMBIO_CONTRASENA_REQUERIDO", async () => {
    const c = await entrar("temporal.sal@softarq.test");
    const u = await usuarioId("temporal.sal@softarq.test");
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() + interval '1 hour' WHERE id = ${u}::uuid`;
    const r = await c.get(ruta(id, 1));
    expect(r.status).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
  });
});

describe("versión concreta, solo lectura y detalle histórico", () => {
  it("v1 y v2 se consultan por separado; consultar no escribe nada del negocio", async () => {
    const p = await entrar("prep.sal@softarq.test");
    const r = await entrar("rev.sal@softarq.test");
    const c = await cotizacion(p, borradorDesdeEntrada(R1.entrada as EntradaCalculo));
    await version(p, c.id, c.revision);
    const v1 = await salidas(p, c.id, 1);
    // v2 sin consolidar compras: otro cálculo de la misma cotización.
    const det = (await p.get(`/api/v1/cotizaciones/${c.id}`)).cuerpo.borrador;
    const g = await p.put(`/api/v1/cotizaciones/${c.id}/borrador`, { revision: det.revision, captura: { ...det.captura, consolidarCompras: false } });
    expect(g.status, g.texto).toBe(200);
    await version(p, c.id, g.cuerpo.revision, "Compras separadas por partida para comparar.");

    const antes = await huellaNegocio();
    const v2 = await salidas(r, c.id, 2);
    const v1b = await salidas(r, c.id, 1);
    for (let i = 0; i < 3; i++) await salidas(p, c.id, 1);
    expect(await huellaNegocio()).toBe(antes);

    expect(v1b).toEqual({ ...v1, encabezado: { ...v1.encabezado, esUltima: false } });
    expect(v1.encabezado).toMatchObject({ folio: c.folio, numero: 1, idVersion: `${c.folio}-v1`, origen: "WEB_DEMO", ambiente: "DEMO", consolidarCompras: true, estado: "BORRADOR", fechaCalculo: FECHA });
    expect(v2.encabezado).toMatchObject({ numero: 2, consolidarCompras: false, esUltima: true });
    // Consolidadas: compras sin partida. Por partida: cada compra pertenece a una sola partida.
    expect(v1.compras.every((k) => k.partida === null)).toBe(true);
    expect(v2.compras.every((k) => k.partida !== null && k.prorrateo.every((x) => x.partidaId === k.partida!.id))).toBe(true);
    expect(v2.compras.length).toBeGreaterThanOrEqual(v1.compras.length);
    // El total no cambia el desglose: los dos cálculos concilian sus categorías y su prorrateo.
    expect(v1.conciliacion).toEqual({ categorias: true, importes: true, prorrateo: true });
    expect(v2.conciliacion).toEqual({ categorias: true, importes: true, prorrateo: true });
  });

  it("versión nueva: nombres y vigencias congelados; cambios posteriores del catálogo y parámetros no la alteran", async () => {
    // Organización propia: los cambios del catálogo no afectan a las demás pruebas.
    const p = await entrar("prep.salc@softarq.test");
    const c = await cotizacion(p, borradorDesdeEntrada(R1.entrada as EntradaCalculo));
    await version(p, c.id, c.revision);
    const antes = await salidas(p, c.id, 1);
    expect(antes.disponibilidad.estado).toBe("COMPLETO");
    const k = antes.compras[0]!;
    expect(k.producto.nombre).toMatch(/\[DEMO\]/);
    expect(k.proveedor.nombre).not.toBeNull();
    expect(k.precio.vigenteHasta).not.toBeNull();
    const consumo = antes.partidas[0]!.consumos[0]!;
    expect(consumo.insumo.nombre).not.toBeNull();

    // Cambios del catálogo vigente con el rol migrador: nombres, rendimiento, precio anulado,
    // tarifa desactivada y recargo. Los precios y tarifas no se editan (disparadores).
    const ctx = { organizacionId: orgC };
    await migrador.$executeRaw`UPDATE producto SET descripcion = '[DEMO] Nombre cambiado después' WHERE organizacion_id = ${orgC}::uuid AND codigo = ${k.producto.codigo}`;
    await migrador.$executeRaw`UPDATE proveedor SET nombre = '[DEMO] Proveedor renombrado' WHERE organizacion_id = ${orgC}::uuid AND codigo = ${k.proveedor.codigo}`;
    await migrador.$executeRaw`UPDATE insumo SET descripcion = '[DEMO] Insumo renombrado' WHERE organizacion_id = ${orgC}::uuid AND codigo = ${consumo.insumo.codigo}`;
    await migrador.$executeRaw`UPDATE componente SET rendimiento = rendimiento + 1 WHERE organizacion_id = ${orgC}::uuid AND codigo = ${consumo.componenteCodigo}`;
    await new RepositorioCatalogos(migrador).anularPrecio(ctx, k.precio.codigo);
    await migrador.$executeRaw`UPDATE tarifa_mano_obra SET activa = false WHERE organizacion_id = ${orgC}::uuid`;
    await migrador.$executeRaw`UPDATE parametros_calculo SET recargo_sobre_costo = 0.25 WHERE organizacion_id = ${orgC}::uuid`;
    expect(await salidas(p, c.id, 1)).toEqual(antes);
  });

  it("estado de la versión igual al de la vista comercial (borrador y en revisión)", async () => {
    const p = await entrar("prep.sal@softarq.test");
    const c = await cotizacion(p, borradorDesdeEntrada(R1.entrada as EntradaCalculo));
    await version(p, c.id, c.revision);
    const estadoComercial = async () => (await p.get(`/api/v1/cotizaciones/${c.id}/versiones/1`)).cuerpo.version.estado;
    expect((await salidas(p, c.id, 1)).encabezado.estado).toBe("BORRADOR");
    expect(await estadoComercial()).toBe("BORRADOR");
    const env = await p.post(`/api/v1/cotizaciones/${c.id}/versiones/1/revisiones`, { revisionBorrador: c.revision }, idem());
    expect(env.status, env.texto).toBe(201);
    expect((await salidas(p, c.id, 1)).encabezado.estado).toBe("EN_REVISION");
    expect(await estadoComercial()).toBe("EN_REVISION");
  });

  it("versión anterior al módulo (sin referencias congeladas): SIN_NOMBRES, solo códigos; no usa el catálogo actual", async () => {
    const p = await entrar("prep.sal@softarq.test");
    const c = await cotizacion(p, borradorDesdeEntrada(R1.entrada as EntradaCalculo));
    await version(p, c.id, c.revision);
    // Fila legítima como las de los módulos 6 a 13: misma instantánea, sin referencias_internas.
    await migrador.$executeRaw`UPDATE cotizacion SET ultima_version = 2 WHERE id = ${c.id}::uuid`;
    await migrador.$executeRaw`
      INSERT INTO cotizacion_version (organizacion_id, cotizacion_id, numero, revision_borrador, captura, solicitud_calculo,
        entrada_calculo, resultado_interno, proyeccion_comercial, avisos, total, fecha_calculo, version_motor, huella_calculo,
        huella_referencia, cliente_codigo, cliente_nombre, proyecto_codigo, proyecto_nombre, proyecto_ubicacion,
        proyecto_descripcion, autor_id, autor_nombre, motivo, resumen_cambios)
      SELECT organizacion_id, cotizacion_id, 2, revision_borrador, captura, solicitud_calculo, entrada_calculo,
        resultado_interno, proyeccion_comercial, avisos, total, fecha_calculo, version_motor, huella_calculo,
        huella_referencia, cliente_codigo, cliente_nombre, proyecto_codigo, proyecto_nombre, proyecto_ubicacion,
        proyecto_descripcion, autor_id, autor_nombre, 'Versión anterior simulada', resumen_cambios
        FROM cotizacion_version WHERE cotizacion_id = ${c.id}::uuid AND numero = 1`;
    const nueva = await salidas(p, c.id, 1);
    const vieja = await salidas(p, c.id, 2);
    expect(vieja.disponibilidad).toEqual({ estado: "SIN_NOMBRES", motivo: MOTIVO_SIN_NOMBRES });
    expect(vieja.compras.every((k) => k.producto.nombre === null && k.proveedor.nombre === null && k.presentacion === null && k.precio.vigenteHasta === null)).toBe(true);
    // Mismas cifras congeladas que la versión con referencias: solo faltan los nombres.
    expect(vieja.compras.map((k) => [k.producto.codigo, k.unidades, k.costoCompra])).toEqual(nueva.compras.map((k) => [k.producto.codigo, k.unidades, k.costoCompra]));
    expect(vieja.indicadores).toEqual(nueva.indicadores);
  });
});

describe("cuatro referencias y contratos comerciales", () => {
  it.each(REFERENCIAS)("%s: total y unidades por producto desde la versión guardada", async (escenario) => {
    const e = ESCENARIOS.find((x) => x.id === escenario)!;
    const p = await entrar("prep.sal@softarq.test");
    const c = await cotizacion(p, borradorDesdeEntrada(e.entrada as EntradaCalculo));
    const v = await version(p, c.id, c.revision);
    const s = await salidas(p, c.id, 1);
    expect(s.indicadores.total).toEqual({ estado: "VALOR", valor: e.esperado.total });
    expect(s.indicadores.subtotal).toEqual({ estado: "VALOR", valor: e.esperado.subtotal });
    expect(s.indicadores.costoDirectoRedondeado).toEqual({ estado: "VALOR", valor: e.esperado.costoDirectoRedondeado });
    expect(v.cotizacion.total).toBe(e.esperado.total);
    for (const [producto, unidades] of Object.entries(e.esperado.unidadesPorProducto ?? {})) {
      const total = s.compras.filter((k) => k.producto.codigo === producto).reduce((a, k) => a.plus(k.unidades), dec("0"));
      expect(total.eq(unidades), producto).toBe(true);
    }
    expect(s.conciliacion).toEqual({ categorias: true, importes: true, prorrateo: true });

    // Los contratos comerciales de la misma versión no exponen nada del contrato interno.
    for (const r of [`/api/v1/cotizaciones/${c.id}/versiones/1`, `/api/v1/cotizaciones/${c.id}/versiones/1/verificacion`, `/api/v1/cotizaciones/${c.id}`]) {
      const x = await p.get(r);
      expect(x.status, r).toBe(200);
      expect(Object.keys(JSON.parse(x.texto)).join(","), r).not.toMatch(INTERNAS);
      expect(x.texto, r).not.toMatch(/costoProrrateado|costoCompra|margenSobrePrecio|recargoSobreCosto|referenciasInternas|"sobrante"/);
    }
  });
});
