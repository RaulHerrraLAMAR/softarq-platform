/**
 * Clientes, proyectos y cotizaciones con folio, borrador y versiones (ADR-0008), por HTTP con
 * sesiones reales contra softarq_test: recorrido completo, borrador incompleto, escenarios
 * principales como versiones guardadas, v2 sin alterar v1, historial tras cambiar catálogo y
 * datos descriptivos, desactivación, permisos del Revisor, aislamiento e inmutabilidad.
 * La concurrencia, la idempotencia y la reversión están en concurrencia-cotizaciones.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EsquemaDetalleCotizacion,
  EsquemaVersion,
  type CapturaBorrador,
} from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { calcularCotizacion } from "../modules/calculo/domain/motor.js";
import { aVistaComercial } from "../modules/calculo/domain/vista-comercial.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { PARAMETROS_DEMO, PRECIOS_DEMO, TARIFAS_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";
import { TEXTOS_DEMO } from "../modules/cotizaciones/dominio/textos.js";

const FECHA = "2026-09-25";
const escenario = (id: string) => ESCENARIOS.find((e) => e.id === id)!;
const R1 = escenario("GUIA-R1-FALDONES-10M");
const PRINCIPALES = ["GUIA-R1-FALDONES-10M", "GUIA-R2-ESPESOR-012", "GUIA-R3-SIN-VENTANA", "GUIA-PROPIA-CON-00001"] as const;

const prisma = prismaApp();
const repo = new RepositorioCatalogos(prisma);
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
let org: ContextoOrganizacion;
let orgH: ContextoOrganizacion;
const cred: Record<string, Credencial> = {};

const preparador = () => new ClienteHttp(url).entrar(cred["preparador.cot@softarq.test"]!);
const revisor = () => new ClienteHttp(url).entrar(cred["revisor.cot@softarq.test"]!);
const preparadorB = () => new ClienteHttp(url).entrar(cred["preparador.cotb@softarq.test"]!);
const preparadorH = () => new ClienteHttp(url).entrar(cred["preparador.coth@softarq.test"]!);
const preparadorS = () => new ClienteHttp(url).entrar(cred["preparador.cots@softarq.test"]!);
let orgS: ContextoOrganizacion;

const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });

/** Ninguna respuesta contiene costos internos, proveedores de compra, precios de compra ni tarifas. */
const CLAVES_INTERNAS =
  /^(costo|consumo|margen|recargo|rendimiento|desperdicio|sobrante|tarifa|excepcion|contenido|compras?$|proveedor|precioId|productoId|entrada|resultadoInterno|huellaReferencia|tokenHash|hash)/i;
function clavesDe(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => clavesDe(x, acc));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (acc.push(k), clavesDe(v, acc));
  return acc;
}
function valoresDe(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => valoresDe(x, acc));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => valoresDe(v, acc));
  else acc.push(String(o));
  return acc;
}
function sinDatosInternos(cuerpo: unknown): void {
  expect(clavesDe(cuerpo).filter((k) => CLAVES_INTERNAS.test(k))).toEqual([]);
  // La captura es lo que el preparador escribió (incluidos montos de adicionales); los importes
  // internos calculados no deben aparecer en el resto de la respuesta.
  const { captura: _, ...resto } = (cuerpo ?? {}) as Record<string, unknown>;
  const valores = valoresDe(resto);
  for (const p of [...PRECIOS_DEMO.map((x) => x.precioUnitario), ...TARIFAS_DEMO.map((t) => t.importe)]) {
    expect(valores, `valor interno ${p}`).not.toContain(p);
  }
}

async function crearClienteProyecto(c: ClienteHttp, sufijo: string) {
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente ${sufijo}` }, idem());
  expect(cli.status, cli.texto).toBe(201);
  const pry = await c.post(
    "/api/v1/proyectos",
    { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra ${sufijo}`, municipio: "Querétaro", entidadFederativa: "Querétaro" },
    idem(),
  );
  expect(pry.status, pry.texto).toBe(201);
  return { cliente: cli.cuerpo, proyecto: pry.cuerpo };
}

async function crearCotizacion(c: ClienteHttp, proyectoId: string, captura?: CapturaBorrador) {
  const r = await c.post("/api/v1/cotizaciones", { proyectoId, ...(captura ? { captura } : {}) }, idem());
  expect(r.status, r.texto).toBe(201);
  return EsquemaDetalleCotizacion.parse(r.cuerpo);
}

const filaVersion = (cotizacionId: string, numero: number) =>
  migrador.$queryRaw<Record<string, unknown>[]>`
    SELECT to_jsonb(v) AS fila FROM cotizacion_version v WHERE cotizacion_id = ${cotizacionId}::uuid AND numero = ${numero}`;

beforeAll(async () => {
  org = { organizacionId: (await cargarDemo(prisma, { codigo: "DEMO-COT", nombre: "[DEMO] Cotizaciones" })).organizacionId };
  await cargarDemo(prisma, { codigo: "DEMO-COT-B", nombre: "[DEMO] Cotizaciones B" });
  orgH = { organizacionId: (await cargarDemo(prisma, { codigo: "DEMO-COT-H", nombre: "[DEMO] Historial" })).organizacionId };
  orgS = { organizacionId: (await cargarDemo(prisma, { codigo: "DEMO-COT-S", nombre: "[DEMO] Selecciones" })).organizacionId };
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-COT", [
      cuenta("preparador.cot@softarq.test", "[DEMO] Preparador Cot", "PREPARADOR"),
      cuenta("revisor.cot@softarq.test", "[DEMO] Revisor Cot", "REVISOR"),
    ]),
    await crearCuentas(migrador, "DEMO-COT-B", [cuenta("preparador.cotb@softarq.test", "[DEMO] Preparador B", "PREPARADOR")]),
    await crearCuentas(migrador, "DEMO-COT-H", [cuenta("preparador.coth@softarq.test", "[DEMO] Preparador H", "PREPARADOR")]),
    await crearCuentas(migrador, "DEMO-COT-S", [cuenta("preparador.cots@softarq.test", "[DEMO] Preparador S", "PREPARADOR")]),
  );
  app = await crearAplicacion(leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }), {
    reloj: new RelojFijo(FECHA),
  });
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
});

describe("recorrido completo: cliente → proyecto → cotización → borrador → versión", () => {
  it("guarda y recupera el borrador, rechaza versionar una captura incompleta y guarda v1 calculada en el servidor", async () => {
    const c = await preparador();
    const { cliente, proyecto } = await crearClienteProyecto(c, "Recorrido");
    expect(cliente.codigo).toMatch(/^CLI-\d{5}$/);
    expect(proyecto.codigo).toMatch(/^PRY-\d{5}$/);
    expect(proyecto.cliente.id).toBe(cliente.id);

    const cot = await crearCotizacion(c, proyecto.id);
    expect(cot.cotizacion.folio).toMatch(/^COT-2026-\d{5}$/);
    expect(cot.cotizacion.origen).toBe("WEB_DEMO");
    expect(cot.cotizacion.cliente.id).toBe(cliente.id);
    expect(cot.cotizacion.ultimaVersion).toBeNull();
    expect(cot.borrador).toMatchObject({ revision: 0, completitud: { lista: false } });
    const id = cot.cotizacion.id;

    // Borrador incompleto: se guarda, sin total ni versión.
    const incompleta = borradorDesdeEntrada(R1.entrada);
    const p0 = incompleta.partidas[0] as { mediciones: { piezas: string | null }[] };
    p0.mediciones[0]!.piezas = null;
    const g1 = await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: incompleta });
    expect(g1.status, g1.texto).toBe(200);
    expect(g1.cuerpo.revision).toBe(1);
    expect(g1.cuerpo.completitud.lista).toBe(false);
    expect(g1.cuerpo.completitud.pendientes[0].ruta).toBe("partidas[0].mediciones[0].piezas");
    expect(JSON.stringify(g1.cuerpo)).not.toMatch(/total/i);

    const v0 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem());
    expect(v0.status, v0.texto).toBe(422);
    expect(v0.cuerpo.error.codigo).toBe("CAPTURA_INCOMPLETA");
    expect(v0.cuerpo.error.campos[0].ruta).toBe("partidas[0].mediciones[0].piezas");
    const [sinVersion] = await migrador.$queryRaw<{ ultima: number; versiones: bigint }[]>`
      SELECT q.ultima_version AS ultima, (SELECT count(*) FROM cotizacion_version v WHERE v.cotizacion_id = q.id) AS versiones
        FROM cotizacion q WHERE q.id = ${id}::uuid`;
    expect(sinVersion).toEqual({ ultima: 0, versiones: 0n });

    // Al recargar, se recupera lo persistido.
    const recargada = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    expect(recargada.borrador.revision).toBe(1);
    expect(recargada.borrador.captura).toEqual(incompleta);

    // Captura completa → v1 calculada y guardada por el servidor.
    const g2 = await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 1, captura: borradorDesdeEntrada(R1.entrada) });
    expect(g2.status).toBe(200);
    expect(g2.cuerpo.completitud).toEqual({ lista: true, pendientes: [] });
    const v1 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 2 }, idem());
    expect(v1.status, v1.texto).toBe(201);
    const version = EsquemaVersion.parse(v1.cuerpo);
    expect(version.version).toMatchObject({
      numero: 1,
      idVersion: `${cot.cotizacion.folio}-v1`,
      estado: "BORRADOR",
      revisionBorrador: 2,
      fechaCalculo: FECHA,
      autor: "[DEMO] Preparador Cot",
      total: R1.esperado.total,
    });
    expect(version.cotizacion.total).toBe(R1.esperado.total);
    expect(version.cliente).toEqual({ codigo: cliente.codigo, nombre: cliente.nombre });
    expect(version.proyecto).toMatchObject({ codigo: proyecto.codigo, ubicacion: "Querétaro, Querétaro" });
    expect(version.cambios.versionAnterior).toBeNull();
    expect(version.huellaCalculo).toMatch(/^[0-9a-f]{64}$/);
    sinDatosInternos(v1.cuerpo);

    // Consultar la versión devuelve exactamente lo guardado.
    const leida = await c.get(`/api/v1/cotizaciones/${id}/versiones/1`);
    expect(leida.status).toBe(200);
    expect(leida.cuerpo).toEqual(v1.cuerpo);

    const detalle = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    expect(detalle.versiones.map((v) => v.numero)).toEqual([1]);
    expect(detalle.cotizacion.ultimaVersion?.total).toBe(R1.esperado.total);
    expect(detalle.eventos.map((e) => e.tipo)).toEqual(["VERSION_CREADA", "BORRADOR_GUARDADO", "BORRADOR_GUARDADO", "COTIZACION_CREADA"]);
    expect(JSON.stringify(detalle.eventos)).not.toMatch(/contrasena|token|cookie|captura/i);
    sinDatosInternos(detalle);

    const lista = await c.get(`/api/v1/cotizaciones?buscar=${encodeURIComponent(cot.cotizacion.folio)}`);
    expect(lista.cuerpo.cotizaciones.map((x: { id: string }) => x.id)).toEqual([id]);
  });
});

describe("escenarios principales guardados como versiones (totales de las fuentes)", () => {
  it.each(PRINCIPALES)("%s: la versión guarda el total de referencia y la misma proyección comercial", async (idEscenario) => {
    const e = escenario(idEscenario);
    const c = await preparador();
    const { proyecto } = await crearClienteProyecto(c, idEscenario);
    const cot = await crearCotizacion(c, proyecto.id, borradorDesdeEntrada(e.entrada));
    expect(cot.borrador.completitud.lista, JSON.stringify(cot.borrador.completitud)).toBe(true);
    const r = await c.post(`/api/v1/cotizaciones/${cot.cotizacion.id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(r.status, r.texto).toBe(201);
    const v = EsquemaVersion.parse(r.cuerpo);
    expect(v.cotizacion.subtotal).toBe(e.esperado.subtotal);
    expect(v.cotizacion.impuesto.importe).toBe(e.esperado.impuestos);
    expect(v.cotizacion.total).toBe(e.esperado.total);
    const referencia = calcularCotizacion(e.entrada);
    if (referencia.estado !== "CALCULADO") throw new Error("fixture no calculado");
    expect(v.cotizacion).toEqual(aVistaComercial(referencia));
    sinDatosInternos(r.cuerpo);
  });
});

describe("versiones inmutables e historial", () => {
  it("editar la captura y guardar v2 deja v1 intacta (respuesta y fila idénticas)", async () => {
    const c = await preparador();
    const { proyecto } = await crearClienteProyecto(c, "V2");
    const cot = await crearCotizacion(c, proyecto.id, borradorDesdeEntrada(R1.entrada));
    const id = cot.cotizacion.id;
    const v1 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(v1.status).toBe(201);
    const filaAntes = await filaVersion(id, 1);

    const editada = borradorDesdeEntrada(R1.entrada);
    const p0 = editada.partidas[0] as { mediciones: { piezas: string | null }[] };
    p0.mediciones[0]!.piezas = "3";
    expect((await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: editada })).status).toBe(200);

    // Revisión obsoleta: 409 y ninguna versión.
    const obsoleta = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(obsoleta.status).toBe(409);
    expect(obsoleta.cuerpo.error.codigo).toBe("BORRADOR_DESACTUALIZADO");

    const v2 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1, motivo: "Más piezas en el eje A" }, idem());
    expect(v2.status, v2.texto).toBe(201);
    const version2 = EsquemaVersion.parse(v2.cuerpo);
    expect(version2.version).toMatchObject({ numero: 2, motivo: "Más piezas en el eje A", revisionBorrador: 1 });
    expect(version2.cotizacion.total).not.toBe(R1.esperado.total);
    expect(version2.cambios).toMatchObject({
      versionAnterior: 1,
      partidasModificadas: [expect.stringMatching(/^1\. /)],
      partidasAgregadas: [],
      partidasQuitadas: [],
      condicionesCambiadas: false,
      totalAnterior: R1.esperado.total,
      totalNuevo: version2.cotizacion.total,
    });

    // Contenido guardado idéntico. El estado derivado (`esUltima`, `estado`, `revisionVigente`,
    // módulo 7) cambia porque ya existe v2; la fila de la versión no cambia.
    const leidaV1 = (await c.get(`/api/v1/cotizaciones/${id}/versiones/1`)).cuerpo;
    expect(leidaV1).toEqual({ ...v1.cuerpo, version: { ...v1.cuerpo.version, esUltima: false } });
    expect(await filaVersion(id, 1)).toEqual(filaAntes);
  });

  it("cambiar precios, parámetros y nombres no altera ni impide consultar v1; las condiciones inválidas bloquean v2 sin escribir", async () => {
    const c = await preparadorH();
    const { cliente, proyecto } = await crearClienteProyecto(c, "Historial");
    const cot = await crearCotizacion(c, proyecto.id, borradorDesdeEntrada(R1.entrada));
    const id = cot.cotizacion.id;
    const v1 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(v1.status).toBe(201);
    const filaAntes = await filaVersion(id, 1);

    // Cambios posteriores: nombres, recargo y el precio elegido anulado (catálogo propio de DEMO-COT-H).
    expect((await c.patch(`/api/v1/clientes/${cliente.id}`, { revision: cliente.revision, nombre: "[DEMO] Cliente renombrado" })).status).toBe(200);
    expect((await c.patch(`/api/v1/proyectos/${proyecto.id}`, { revision: proyecto.revision, nombre: "[DEMO] Obra renombrada" })).status).toBe(200);
    await repo.actualizarParametros(orgH, { ...PARAMETROS_DEMO, recargoSobreCosto: "0.40" });
    await repo.anularPrecio(orgH, R1.entrada.selecciones[0]!.precioId);

    const leida = await c.get(`/api/v1/cotizaciones/${id}/versiones/1`);
    expect(leida.status).toBe(200);
    expect(leida.cuerpo).toEqual(v1.cuerpo);
    expect(leida.cuerpo.cliente.nombre).toBe("[DEMO] Cliente Historial");
    expect(await filaVersion(id, 1)).toEqual(filaAntes);

    // Recalcular usa las condiciones vigentes: el precio anulado bloquea (BL-08) y no se escribe nada.
    const bloqueada = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(bloqueada.status, bloqueada.texto).toBe(422);
    expect(bloqueada.cuerpo.error.codigo).toBe("CALCULO_BLOQUEADO");
    expect(bloqueada.cuerpo.error.problemas.map((p: { codigo: string }) => p.codigo)).toContain("BL-08");
    expect(JSON.stringify(bloqueada.cuerpo)).not.toMatch(/"total"|subtotal/);
    const detalle = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    expect(detalle.versiones.map((v) => v.numero)).toEqual([1]);
    expect(detalle.borrador.revision).toBe(0);
    expect(detalle.eventos[0]).toMatchObject({ tipo: "CALCULO_BLOQUEADO", detalle: { codigos: ["BL-08"] } });
  });

  it("un cliente desactivado no se ofrece para cotizaciones nuevas; su borrador sigue editable y versionar queda bloqueado (BL-01)", async () => {
    const c = await preparador();
    const { cliente, proyecto } = await crearClienteProyecto(c, "Inactivo");
    const cot = await crearCotizacion(c, proyecto.id, borradorDesdeEntrada(R1.entrada));
    const id = cot.cotizacion.id;

    const antes = await c.get(`/api/v1/clientes/${cliente.id}`);
    expect(antes.cuerpo.borradoresAbiertos).toBe(1);
    const des = await c.patch(`/api/v1/clientes/${cliente.id}`, { revision: cliente.revision, activo: false });
    expect(des.status, des.texto).toBe(200);
    expect(des.cuerpo).toMatchObject({ activo: false, revision: cliente.revision + 1 });

    const activos = await c.get(`/api/v1/clientes?buscar=${encodeURIComponent("Cliente Inactivo")}`);
    expect(activos.cuerpo.clientes).toEqual([]);
    const todos = await c.get(`/api/v1/clientes?buscar=${encodeURIComponent("Cliente Inactivo")}&incluirInactivos=true`);
    expect(todos.cuerpo.clientes.map((x: { id: string }) => x.id)).toEqual([cliente.id]);
    expect((await c.get(`/api/v1/proyectos?clienteId=${cliente.id}`)).cuerpo.proyectos).toEqual([]);

    const nueva = await c.post("/api/v1/cotizaciones", { proyectoId: proyecto.id }, idem());
    expect(nueva.status).toBe(422);
    expect(nueva.cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    const otroProyecto = await c.post("/api/v1/proyectos", { clienteId: cliente.id, nombre: "[DEMO] Otra" }, idem());
    expect(otroProyecto.status).toBe(422);

    expect((await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: borradorDesdeEntrada(R1.entrada) })).status).toBe(200);
    const v = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem());
    expect(v.status).toBe(422);
    expect(v.cuerpo.error).toMatchObject({ codigo: "CALCULO_BLOQUEADO", problemas: [expect.objectContaining({ codigo: "BL-01" })] });

    const re = await c.patch(`/api/v1/clientes/${cliente.id}`, { revision: cliente.revision + 1, activo: true });
    expect(re.status).toBe(200);
    expect((await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem())).status).toBe(201);

    // Edición obsoleta del cliente: 409 con el estado vigente; no sobrescribe.
    const obsoleta = await c.patch(`/api/v1/clientes/${cliente.id}`, { revision: cliente.revision, nombre: "[DEMO] Pisado" });
    expect(obsoleta.status).toBe(409);
    expect(obsoleta.cuerpo.error).toMatchObject({ codigo: "CONFLICTO_EDICION", actual: { revision: cliente.revision + 2 } });
    expect((await c.get(`/api/v1/clientes/${cliente.id}`)).cuerpo.cliente.nombre).toBe(cliente.nombre);
  });
});

describe("conservar lo capturado cuando una referencia deja de estar disponible (catálogo real)", () => {
  /** Dos conceptos con sus selecciones completas (DEMO-COT-S, catálogo propio de esta prueba). */
  const captura = (): CapturaBorrador => ({
    consolidarCompras: false,
    partidas: [
      {
        tipo: "CONCEPTO",
        conceptoCodigo: "CON-00007",
        descripcion: "Faldón norte",
        mediciones: [{ descripcion: "", signo: "+", piezas: "1", largo: "10", ancho: "4", alto: null, segundaMedida: "ancho" }],
      },
      {
        tipo: "CONCEPTO",
        conceptoCodigo: "CON-00008",
        descripcion: "Losa",
        mediciones: [{ descripcion: "", signo: "+", piezas: "1", largo: "4", ancho: "4", alto: "0.12", segundaMedida: "ancho" }],
      },
    ],
    seleccion: [
      { insumoCodigo: "INS-00004", precioCodigo: "PRE-000007" },
      { insumoCodigo: "INS-00005", precioCodigo: "PRE-000008" },
      { insumoCodigo: "INS-00006", precioCodigo: "PRE-000009" },
      { insumoCodigo: "INS-00007", precioCodigo: "PRE-000011" },
      { insumoCodigo: "INS-00008", precioCodigo: "PRE-000013" },
      { insumoCodigo: "INS-00009", precioCodigo: "PRE-000014" },
    ],
  });
  const ordenar = (s: CapturaBorrador["seleccion"]) => [...s].sort((a, b) => a.insumoCodigo.localeCompare(b.insumoCodigo));

  it("guardar, recargar, modificar otra partida y recuperar conserva partida, medidas y selecciones; las versiones no cambian", async () => {
    const c = await preparadorS();
    const { proyecto } = await crearClienteProyecto(c, "Selecciones");
    const cot = await crearCotizacion(c, proyecto.id, captura());
    const id = cot.cotizacion.id;
    const v1 = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem());
    expect(v1.status, v1.texto).toBe(201);
    const filaAntes = await filaVersion(id, 1);

    // El concepto CON-00007 deja de estar disponible y un precio de CON-00008 se anula (catálogo real).
    await repo.cambiarEstadoConcepto(orgS, "CON-00007", "Borrador");
    await repo.anularPrecio(orgS, "PRE-000011");

    // Recargar: el servidor informa la indisponibilidad sin cambiar la captura.
    const recargada = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    // Módulo 8: al crear la cotización se copian los textos DEMO de la versión (la captura no los traía).
    expect(recargada.borrador.captura).toEqual({ ...captura(), textos: TEXTOS_DEMO });
    expect(recargada.borrador.referencias.conceptos).toEqual([
      { codigo: "CON-00007", disponible: false, motivo: "el concepto no está aprobado (estado Borrador)", insumos: ["INS-00004", "INS-00005", "INS-00006"] },
      { codigo: "CON-00008", disponible: true, motivo: null, insumos: ["INS-00007", "INS-00008", "INS-00009"] },
    ]);
    expect(recargada.borrador.referencias.selecciones.find((x) => x.precioCodigo === "PRE-000011")).toMatchObject({
      disponible: false,
      motivo: "el precio está anulado",
    });

    // Modificar OTRA partida y guardar con las referencias conservadas: se acepta y no se pierde nada.
    const editada = captura();
    (editada.partidas[1] as { mediciones: { largo: string | null }[] }).mediciones[0]!.largo = "5";
    const g = await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: editada });
    expect(g.status, g.texto).toBe(200);

    // Recuperar: idéntico a lo guardado, con las seis selecciones.
    const recuperada = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    expect(recuperada.borrador.revision).toBe(1);
    expect(recuperada.borrador.captura).toEqual(editada);
    expect(ordenar(recuperada.borrador.captura.seleccion)).toEqual(ordenar(captura().seleccion));
    // Calcular queda bloqueado por sus reglas (BL-04 concepto no aprobado, BL-08 precio anulado)
    // hasta que el usuario decida; no se escribe ninguna versión.
    const bloqueada = await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 1 }, idem());
    expect(bloqueada.status, bloqueada.texto).toBe(422);
    expect(new Set(bloqueada.cuerpo.error.problemas.map((p: { codigo: string }) => p.codigo))).toEqual(new Set(["BL-04", "BL-08"]));
    expect(EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo).versiones).toHaveLength(1);

    // La versión histórica y su total no cambian.
    expect(await filaVersion(id, 1)).toEqual(filaAntes);
    expect((await c.get(`/api/v1/cotizaciones/${id}/versiones/1`)).cuerpo).toEqual(v1.cuerpo);
  });

  it("una referencia NUEVA inexistente, de otra organización o no disponible se rechaza (422) sin guardar", async () => {
    const c = await preparadorS();
    const { proyecto } = await crearClienteProyecto(c, "Nuevas");
    // Mismo estado del catálogo que la prueba anterior (idempotente: no depende del orden).
    await repo.cambiarEstadoConcepto(orgS, "CON-00007", "Borrador");
    await repo.anularPrecio(orgS, "PRE-000011");
    const base: CapturaBorrador = { consolidarCompras: false, partidas: [], seleccion: [] };
    const cot = await crearCotizacion(c, proyecto.id, base);
    const id = cot.cotizacion.id;

    const casos: [CapturaBorrador, string][] = [
      // Precio anulado (en esta organización) elegido por primera vez.
      [{ ...base, seleccion: [{ insumoCodigo: "INS-00007", precioCodigo: "PRE-000011" }] }, "seleccion[0].precioCodigo"],
      // Precio de otro insumo.
      [{ ...base, seleccion: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-000008" }] }, "seleccion[0].precioCodigo"],
      // Código que no existe en esta organización (como uno de otra).
      [{ ...base, seleccion: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-999999" }] }, "seleccion[0].precioCodigo"],
      // Concepto no aprobado agregado ahora.
      [{ ...base, partidas: [{ tipo: "CONCEPTO", conceptoCodigo: "CON-00007", descripcion: "", mediciones: [] }] }, "partidas[0].conceptoCodigo"],
    ];
    for (const [cap, ruta] of casos) {
      const r = await c.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: cap });
      expect(r.status, r.texto).toBe(422);
      expect(r.cuerpo.error.codigo).toBe("REFERENCIA_NO_DISPONIBLE");
      expect(r.cuerpo.error.campos.map((x: { ruta: string }) => x.ruta)).toEqual([ruta]);
    }
    const sin = EsquemaDetalleCotizacion.parse((await c.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    expect(sin.borrador.revision).toBe(0);
    expect(sin.borrador.captura).toEqual({ ...base, textos: TEXTOS_DEMO }); // textos DEMO copiados al crear (módulo 8)

    // Una referencia disponible sí se guarda.
    const ok = await c.put(`/api/v1/cotizaciones/${id}/borrador`, {
      revision: 0,
      captura: { ...base, seleccion: [{ insumoCodigo: "INS-00007", precioCodigo: "PRE-000012" }] },
    });
    expect(ok.status, ok.texto).toBe(200);
  });
});

describe("permisos: el Revisor consulta pero no crea, edita ni calcula (intentos directos)", () => {
  it("403 SIN_PERMISO en cada escritura; 200 en las consultas", async () => {
    const p = await preparador();
    const { cliente, proyecto } = await crearClienteProyecto(p, "Permisos");
    const cot = await crearCotizacion(p, proyecto.id, borradorDesdeEntrada(R1.entrada));
    const id = cot.cotizacion.id;
    expect((await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem())).status).toBe(201);

    const r = await revisor();
    const intentos = [
      await r.post("/api/v1/clientes", { nombre: "[DEMO] X" }, idem()),
      await r.patch(`/api/v1/clientes/${cliente.id}`, { revision: 0, activo: false }),
      await r.post("/api/v1/proyectos", { clienteId: cliente.id, nombre: "[DEMO] X" }, idem()),
      await r.patch(`/api/v1/proyectos/${proyecto.id}`, { revision: 0, nombre: "[DEMO] X" }),
      await r.post("/api/v1/cotizaciones", { proyectoId: proyecto.id }, idem()),
      await r.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: borradorDesdeEntrada(R1.entrada) }),
      await r.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem()),
    ];
    for (const x of intentos) {
      expect(x.status, x.texto).toBe(403);
      expect(x.cuerpo.error.codigo).toBe("SIN_PERMISO");
    }
    for (const ruta of [
      "/api/v1/clientes",
      `/api/v1/clientes/${cliente.id}`,
      "/api/v1/proyectos",
      `/api/v1/proyectos/${proyecto.id}`,
      "/api/v1/cotizaciones",
      `/api/v1/cotizaciones/${id}`,
      `/api/v1/cotizaciones/${id}/versiones/1`,
    ]) {
      const x = await r.get(ruta);
      expect(x.status, ruta).toBe(200);
      sinDatosInternos(x.cuerpo);
    }
    const conteo = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM cotizacion_version WHERE cotizacion_id = ${id}::uuid`;
    expect(conteo[0]!.n).toBe(1n);
  });
});

describe("aislamiento entre organizaciones", () => {
  it("los ids de otra organización responden 404 (sin revelar su existencia) y los cuerpos no aceptan organizacionId", async () => {
    const a = await preparador();
    const { cliente, proyecto } = await crearClienteProyecto(a, "Aislado");
    const cot = await crearCotizacion(a, proyecto.id, borradorDesdeEntrada(R1.entrada));
    const id = cot.cotizacion.id;
    expect((await a.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem())).status).toBe(201);

    const b = await preparadorB();
    const inexistente = randomUUID();
    const pares: [string, string][] = [
      [`/api/v1/clientes/${cliente.id}`, `/api/v1/clientes/${inexistente}`],
      [`/api/v1/proyectos/${proyecto.id}`, `/api/v1/proyectos/${inexistente}`],
      [`/api/v1/cotizaciones/${id}`, `/api/v1/cotizaciones/${inexistente}`],
      [`/api/v1/cotizaciones/${id}/versiones/1`, `/api/v1/cotizaciones/${inexistente}/versiones/1`],
    ];
    for (const [ajeno, noExiste] of pares) {
      const x = await b.get(ajeno);
      const y = await b.get(noExiste);
      expect(x.status, ajeno).toBe(404);
      expect({ ...x.cuerpo.error, solicitudId: "" }).toEqual({ ...y.cuerpo.error, solicitudId: "" });
    }
    const escrituras = [
      await b.patch(`/api/v1/clientes/${cliente.id}`, { revision: 0, nombre: "[DEMO] Robado" }),
      await b.patch(`/api/v1/proyectos/${proyecto.id}`, { revision: 0, nombre: "[DEMO] Robado" }),
      await b.post("/api/v1/proyectos", { clienteId: cliente.id, nombre: "[DEMO] Intruso" }, idem()),
      await b.post("/api/v1/cotizaciones", { proyectoId: proyecto.id }, idem()),
      await b.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: 0, captura: borradorDesdeEntrada(R1.entrada) }),
      await b.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem()),
    ];
    for (const x of escrituras) expect(x.status, x.texto).toBe(404);
    expect((await b.get(`/api/v1/cotizaciones?buscar=${encodeURIComponent(cot.cotizacion.folio)}`)).cuerpo.cotizaciones).toEqual([]);
    expect((await b.get("/api/v1/clientes?buscar=Aislado&incluirInactivos=true")).cuerpo.clientes).toEqual([]);

    const conOrg = await b.post("/api/v1/clientes", { nombre: "[DEMO] Y", organizacionId: org.organizacionId }, idem());
    expect(conOrg.status).toBe(400);
    expect((await a.get(`/api/v1/cotizaciones/${id}`)).cuerpo.borrador.revision).toBe(0);
  });

  it("PostgreSQL impide una cotización con un proyecto de otro cliente (FK compuesta)", async () => {
    const a = await preparador();
    const uno = await crearClienteProyecto(a, "FK uno");
    const dos = await crearClienteProyecto(a, "FK dos");
    const [m] = await prisma.$queryRaw<{ usuario_id: string }[]>`
      SELECT m.usuario_id::text FROM membresia m JOIN usuario u ON u.id = m.usuario_id WHERE u.correo = 'preparador.cot@softarq.test'`;
    await expect(
      prisma.$executeRaw`
        INSERT INTO cotizacion (organizacion_id, folio, anio_folio, origen, cliente_id, proyecto_id, creado_por)
        VALUES (${org.organizacionId}::uuid, 'COT-2026-99999', 2026, 'WEB_DEMO', ${uno.cliente.id}::uuid, ${dos.proyecto.id}::uuid, ${m!.usuario_id}::uuid)`,
    ).rejects.toThrow(/23503|foreign key|llave foránea/i);
  });
});

describe("inmutabilidad y permisos de la base", () => {
  it("softarq_app no puede modificar ni borrar versiones, bitácora ni idempotencia, ni cambiar folios o códigos", async () => {
    const c = await preparador();
    const { proyecto } = await crearClienteProyecto(c, "Inmutable");
    const cot = await crearCotizacion(c, proyecto.id, borradorDesdeEntrada(R1.entrada));
    const id = cot.cotizacion.id;
    expect((await c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0 }, idem())).status).toBe(201);
    const filaAntes = await filaVersion(id, 1);

    const denegado = /42501|permission denied|permiso denegado/i;
    await expect(prisma.$executeRaw`UPDATE cotizacion_version SET total = 0 WHERE cotizacion_id = ${id}::uuid`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`DELETE FROM cotizacion_version WHERE cotizacion_id = ${id}::uuid`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`UPDATE bitacora SET tipo = 'X_X' WHERE entidad_id = ${id}::uuid`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`DELETE FROM bitacora WHERE entidad_id = ${id}::uuid`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`UPDATE idempotencia SET operacion = 'otra'`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`UPDATE cotizacion SET folio = 'COT-2026-00000' WHERE id = ${id}::uuid`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`UPDATE cliente SET codigo = 'CLI-99999'`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`UPDATE proyecto SET cliente_id = cliente_id`).rejects.toThrow(denegado);
    await expect(prisma.$executeRaw`DELETE FROM cotizacion WHERE id = ${id}::uuid`).rejects.toThrow(denegado);

    // Ni el propietario (rol migrador) puede alterar una versión guardada: lo impide el trigger.
    await expect(migrador.$executeRaw`UPDATE cotizacion_version SET motivo = 'alterado' WHERE cotizacion_id = ${id}::uuid`).rejects.toThrow(
      /VERSION_INMUTABLE/,
    );
    await expect(migrador.$executeRaw`DELETE FROM cotizacion_version WHERE cotizacion_id = ${id}::uuid`).rejects.toThrow(/VERSION_INMUTABLE/);
    expect(await filaVersion(id, 1)).toEqual(filaAntes);
  });
});
