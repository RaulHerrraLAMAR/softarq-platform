/**
 * Aislamiento entre organizaciones con sesiones reales (ADR-0007): la organización de cada
 * consulta sale de la sesión, nunca del cliente, y los datos de otra organización responden igual
 * que si no existieran. Solo softarq_test.
 */
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { PARAMETROS_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { generarToken } from "../modules/autenticacion/infraestructura/tokens.js";
import { prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { solicitudDemoDesdeEntrada } from "./solicitudes.js";

const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const prisma = prismaApp();
const repo = new RepositorioCatalogos(prisma);
let migrador: ClientePrisma;
let api: { app: INestApplication; url: string };
let orgA: ContextoOrganizacion;
let orgB: ContextoOrganizacion;
let credA: Credencial;
let credB: Credencial;
let credNoDemo: Credencial;

// Módulo 12: un concepto propio se crea completo (tipo, regla, tarifa y un componente trazable) y se
// aprueba con la misma comprobación de requisitos que la operación Aprobar.
const conceptoPropio = (codigo: string, descripcion: string) => ({
  codigo,
  tipo: "TES-00004",
  descripcion,
  unidad: "m2",
  tipoFormula: "AREA" as const,
  permiteDescuento: false,
  clase: "ESTANDAR",
  tarifa: "TMO-00001",
  reglaMedicion: "[DEMO] Regla de prueba de aislamiento",
  criterios: null,
});

async function conceptoAprobado(ctx: ContextoOrganizacion, codigo: string, descripcion: string): Promise<void> {
  await repo.asegurarConcepto(ctx, conceptoPropio(codigo, descripcion));
  await repo.asegurarComponente(ctx, {
    codigo: `CMP-${codigo.slice(4)}`,
    concepto: codigo,
    orden: 1,
    insumo: "INS-00001",
    rendimiento: "1",
    unidadRendimiento: "pza",
    desperdicio: "0",
    factorTraslape: null,
    fuente: "[DEMO] Prueba de aislamiento",
    fecha: "2026-09-01",
    responsable: "[DEMO] Responsable de prueba",
  });
  await repo.cambiarEstadoConcepto(ctx, codigo, "Aprobado");
}

beforeAll(async () => {
  orgA = { organizacionId: (await cargarDemo(prisma, { codigo: "DEMO-ISO-A", nombre: "[DEMO] Organización A" })).organizacionId };
  orgB = { organizacionId: (await cargarDemo(prisma, { codigo: "DEMO-ISO-B", nombre: "[DEMO] Organización B" })).organizacionId };
  await conceptoAprobado(orgA, "CON-ISO-A1", "[DEMO] Aislamiento exclusivo de A");
  await conceptoAprobado(orgB, "CON-ISO-B1", "[DEMO] Aislamiento exclusivo de B");
  migrador = await prismaMigrador();
  credA = (await crearCuentas(migrador, "DEMO-ISO-A", [cuenta("preparador.a@softarq.test", "[DEMO] Preparador A", "PREPARADOR")]))[
    "preparador.a@softarq.test"
  ]!;
  credB = (await crearCuentas(migrador, "DEMO-ISO-B", [cuenta("preparador.b@softarq.test", "[DEMO] Preparador B", "PREPARADOR")]))[
    "preparador.b@softarq.test"
  ]!;

  // Organización que no es DEMO: el cargador DEMO se niega, así que la cuenta se crea aquí.
  const noDemo = await repo.asegurarOrganizacion("PRUEBA-ISO-NODEMO", "[PRUEBA] Organización no DEMO", false);
  credNoDemo = { correo: "preparador.nodemo@softarq.test", contrasena: generarToken().token };
  const u = await migrador.usuario.create({
    data: {
      correo: credNoDemo.correo,
      nombre: "[PRUEBA] Preparador no DEMO",
      hashContrasena: await new ServicioContrasenas().crearHash(credNoDemo.contrasena),
      esDemo: false,
    },
  });
  await migrador.membresia.create({ data: { organizacionId: noDemo.id, usuarioId: u.id, funciones: ["PREPARADOR"] } });

  const app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno" }),
    { reloj: new RelojFijo("2026-09-25") },
  );
  await app.listen(0, "127.0.0.1");
  api = { app, url: (await app.getUrl()).replace("[::1]", "127.0.0.1") };
});

afterAll(async () => {
  await api.app.close();
  await prisma.$disconnect();
  await migrador.$disconnect();
});

const entrar = (cr: Credencial) => new ClienteHttp(api.url).entrar(cr);

describe("cada sesión ve solo su organización", () => {
  it("la sesión informa su propia organización", async () => {
    expect((await (await entrar(credA)).get("/api/v1/auth/sesion")).cuerpo.organizacion.codigo).toBe("DEMO-ISO-A");
    expect((await (await entrar(credB)).get("/api/v1/auth/sesion")).cuerpo.organizacion.codigo).toBe("DEMO-ISO-B");
  });

  it("los listados solo muestran los conceptos de la organización de la sesión", async () => {
    const a = await (await entrar(credA)).get("/api/v1/catalogos/conceptos?buscar=Aislamiento");
    const b = await (await entrar(credB)).get("/api/v1/catalogos/conceptos?buscar=Aislamiento");
    expect(a.cuerpo.conceptos.map((x: { codigo: string }) => x.codigo)).toEqual(["CON-ISO-A1"]);
    expect(b.cuerpo.conceptos.map((x: { codigo: string }) => x.codigo)).toEqual(["CON-ISO-B1"]);
  });

  it("un código de la otra organización responde igual que uno inexistente (404, sin revelar nada)", async () => {
    const a = await entrar(credA);
    const ajeno = await a.get("/api/v1/catalogos/opciones-precio?conceptos=CON-ISO-B1");
    const inexistente = await a.get("/api/v1/catalogos/opciones-precio?conceptos=CON-ISO-ZZ");
    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(ajeno.cuerpo.error.mensaje).toBe(inexistente.cuerpo.error.mensaje);
    expect(ajeno.cuerpo.error.faltantes).toEqual([{ tipo: "concepto", codigo: "CON-ISO-B1" }]);

    const calc = await a.post("/api/v1/calculos/demo", {
      consolidarCompras: true,
      partidas: [{ id: "P1", tipo: "CONCEPTO", conceptoCodigo: "CON-ISO-B1", mediciones: [] }],
      preciosElegidos: [],
    });
    expect(calc.status).toBe(404);
    expect(calc.texto).not.toContain("Aislamiento exclusivo de B");
  });

  it("los parámetros de cada organización se aplican según la sesión", async () => {
    await repo.actualizarParametros(orgB, { ...PARAMETROS_DEMO, impuestoTasa: null, impuestoBase: null, impuestoTratamiento: null, impuestoNombre: null });
    try {
      const a = await (await entrar(credA)).post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada));
      const b = await (await entrar(credB)).post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada));
      expect(a.status).toBe(200);
      expect(a.cuerpo.cotizacion.total).toBe(R1.esperado.total);
      expect(b.status).toBe(422);
      expect(b.cuerpo.error.problemas.map((p: { codigo: string }) => p.codigo)).toContain("BL-13");
    } finally {
      await repo.actualizarParametros(orgB, { ...PARAMETROS_DEMO });
    }
  });
});

describe("el cliente no puede elegir la organización", () => {
  it("cabeceras con otra organización se ignoran", async () => {
    const a = await entrar(credA);
    const r = await a.get("/api/v1/catalogos/conceptos?buscar=Aislamiento", {
      cabeceras: { "X-Organizacion": "DEMO-ISO-B", "X-Organizacion-Id": orgB.organizacionId },
    });
    expect(r.cuerpo.conceptos.map((x: { codigo: string }) => x.codigo)).toEqual(["CON-ISO-A1"]);
  });

  it("la organización en la query o en el cuerpo se rechaza (contratos estrictos)", async () => {
    const a = await entrar(credA);
    expect((await a.get(`/api/v1/catalogos/conceptos?organizacion=DEMO-ISO-B`)).status).toBe(400);
    const r = await a.post("/api/v1/calculos/demo", { ...solicitudDemoDesdeEntrada(R1.entrada), organizacionId: orgB.organizacionId });
    expect(r.status).toBe(400);
  });

  it("una organización que no es DEMO no puede usar el cálculo DEMO (403)", async () => {
    const r = await (await entrar(credNoDemo)).post("/api/v1/calculos/demo", solicitudDemoDesdeEntrada(R1.entrada));
    expect(r.status).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
  });
});

describe("restricciones en PostgreSQL", () => {
  it("una sesión no puede unir un usuario con una organización a la que no pertenece (FK compuesta)", async () => {
    const usuarioA = await migrador.usuario.findUniqueOrThrow({ where: { correo: credA.correo } });
    const ahora = new Date();
    await expect(
      prisma.sesion.create({
        data: {
          tipo: "USUARIO",
          tokenHash: new Uint8Array(generarToken().hash),
          usuarioId: usuarioA.id,
          organizacionId: orgB.organizacionId,
          creadaEn: ahora,
          ultimaActividadEn: ahora,
          expiraEn: new Date(ahora.getTime() + 60_000),
        },
      }),
    ).rejects.toThrow(/foreign key|sesion_organizacion_id_usuario_id_fkey/i);
  });
});
