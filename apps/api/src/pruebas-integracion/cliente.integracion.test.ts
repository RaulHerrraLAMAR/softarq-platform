/**
 * Cliente externo de la app (módulo 17, ADR-0021) por HTTP contra la API real y PostgreSQL (solo softarq_test):
 * acceso y contraseña temporal, aislamiento entre canales, captura de la solicitud con huecos, estimación preliminar con
 * precios de referencia (usa el motor existente), referencias ausentes, envío idempotente, propiedad de los registros entre
 * clientes y organizaciones, pérdida de permisos con la sesión abierta, bandeja del equipo, atención sin heredar precios y
 * consulta de las cotizaciones EMITIDAS (incluidas las preparadas desde el panel) con su PDF.
 *
 * Reemplaza las comprobaciones de la etapa 1 (ADR-0020) que probaban el acceso de cuentas internas a la consulta móvil:
 * ahora una cuenta interna recibe 403 CUENTA_INTERNA_USE_PANEL y las rutas internas no están disponibles para el canal móvil.
 */
import type { INestApplication } from "@nestjs/common";
import {
  EsquemaCotizacionComercial,
  EsquemaDetalleCotizacion,
  EsquemaDetalleCotizacionCliente,
  EsquemaDetalleRevision,
  EsquemaDetalleSolicitudEquipo,
  EsquemaEstimacionCliente,
  EsquemaRespuestaAccesoMovil,
  EsquemaRespuestaCotizacionesCliente,
  EsquemaRespuestaEnvioSolicitud,
  EsquemaRespuestaSolicitudesCliente,
  EsquemaRespuestaSolicitudesEquipo,
  EsquemaRespuestaTrabajosCliente,
  EsquemaSolicitudDelCliente,
  ROTULO_ESTIMACION,
  type CapturaSolicitud,
  type TrabajoCapturado,
} from "@softarq/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarClientesDemo, type CredencialCliente } from "../modules/cliente/demo/cargar-clientes-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, ClienteMovil, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada, solicitudDemoDesdeEntrada } from "./solicitudes.js";

const FECHA = "2026-09-25";
const NUEVA = "contrasena-definitiva-de-prueba-1";
const DIR = directorioDocumentosPrueba("cliente");
const R1 = ESCENARIOS.find((e) => e.id === "GUIA-R1-FALDONES-10M")!;
const R2 = ESCENARIOS.find((e) => e.id === "GUIA-R2-ESPESOR-012")!;
/** Claves que solo existen en los contratos internos: nunca en una respuesta al cliente. */
const INTERNAS = /costoProrrateado|costoCompra|costoDirecto|costoMateriales|margen|recargo|sobrante|consumoBase|proveedor|referenciasInternas|resultadoInterno|entradaCalculo|tokenHash|precioId|productoId|insumoCodigo|conceptoCodigo/i;

const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const cred: Record<string, Credencial> = {};
const temporales: Record<string, string> = {};
const ids: Record<string, string> = {};

const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const web = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const movil = (correo: string) => new ClienteMovil(url).entrar(cred[correo]!);

// Cuentas internas de la organización A y de la B
const PREP = "prep@cli-a.softarq.test";
const REV = "rev@cli-a.softarq.test";
const CAT = "cat@cli-a.softarq.test";
const SIS = "sis@cli-a.softarq.test";
// Accesos de clientes (se crean con la carga de presentación y cambian su contraseña temporal)
const LAURA = "laura.mendez@cli-a.softarq.test";
const HECTOR = "hector.rios@cli-a.softarq.test";
const SILVIA = "silvia.aranda@cli-a.softarq.test";
const LAURA_B = "laura.mendez@cli-b.softarq.test";

const losa = (id = "t1"): TrabajoCapturado => ({
  id,
  trabajoCodigo: "LOSA",
  opcionCodigo: "CONCRETO",
  secciones: [
    { nombre: "Tablero", piezas: "1", largo: "6", ancho: "5", alto: "0.12" },
    { nombre: "Volado", piezas: "1", largo: "2", ancho: "1.2", alto: "0.12" },
  ],
  huecos: [],
});
const cubierta = (id = "t2"): TrabajoCapturado => ({
  id,
  trabajoCodigo: "CUBIERTA",
  opcionCodigo: "LAMINA",
  secciones: [
    { nombre: "Faldón norte", piezas: "1", largo: "10", ancho: "4.5", alto: null },
    { nombre: "Faldón sur", piezas: "1", largo: "10", ancho: "4.5", alto: null },
  ],
  huecos: [{ nombre: "Tragaluz", piezas: "1", largo: "1.2", ancho: "1", alto: null }],
});
const muro = (id = "t3"): TrabajoCapturado => ({
  id,
  trabajoCodigo: "MURO",
  opcionCodigo: "BLOCK",
  secciones: [{ nombre: "Colindancia", piezas: "1", largo: "9", ancho: null, alto: "2.4" }],
  huecos: [{ nombre: "Ventana", piezas: "2", largo: "1.2", ancho: null, alto: "1" }],
});
const captura = (...trabajos: TrabajoCapturado[]): CapturaSolicitud => ({ trabajos, notas: null });

/** Cambia la contraseña temporal por una definitiva (como lo hace la app) y devuelve una sesión nueva. */
async function activar(correo: string): Promise<ClienteMovil> {
  const temporal = temporales[correo]!;
  const t = await new ClienteMovil(url).entrar({ correo, contrasena: temporal });
  const r = await t.post("/api/v1/auth/contrasena", { actual: temporal, nueva: NUEVA, confirmacion: NUEVA });
  expect(r.status, r.texto).toBe(204);
  cred[correo] = { correo, contrasena: NUEVA };
  return movil(correo);
}

async function proyectoDe(c: ClienteMovil, nombre: string): Promise<string> {
  const r = await c.get("/api/v1/cliente/proyectos");
  expect(r.status, r.texto).toBe(200);
  const p = (r.cuerpo.proyectos as { id: string; nombre: string }[]).find((x) => x.nombre === nombre);
  expect(p, `proyecto ${nombre}`).toBeDefined();
  return p!.id;
}

const nuevaSolicitud = async (c: ClienteMovil, proyectoId: string, cap: CapturaSolicitud) => {
  const r = await c.post("/api/v1/cliente/solicitudes", { proyectoId, captura: cap });
  expect(r.status, r.texto).toBe(201);
  return EsquemaSolicitudDelCliente.parse(r.cuerpo);
};
const guardar = (c: ClienteMovil, id: string, revision: number, cap: CapturaSolicitud) => c.put(`/api/v1/cliente/solicitudes/${id}`, { revision, captura: cap });
const estimar = (c: ClienteMovil, id: string, revision: number) => c.post(`/api/v1/cliente/solicitudes/${id}/estimaciones`, { revision });
const enviar = (c: ClienteMovil, id: string, revision: number) => c.post(`/api/v1/cliente/solicitudes/${id}/envio`, { revision });
const obtener = async (c: ClienteMovil, id: string) => EsquemaSolicitudDelCliente.parse((await c.get(`/api/v1/cliente/solicitudes/${id}`)).cuerpo);

const tiposBitacora = async (entidadId: string): Promise<string[]> =>
  (await migrador.$queryRaw<{ tipo: string }[]>`SELECT tipo FROM bitacora WHERE entidad_id = ${entidadId}::uuid ORDER BY ocurrido_en, id`).map((f) => f.tipo);

beforeAll(async () => {
  vaciarDocumentosPrueba(DIR);
  const orgA = (await cargarDemo(prisma, { codigo: "DEMO-CLI-A", nombre: "[DEMO] Cliente A" })).organizacionId;
  await cargarEmisorDemo(prisma, orgA);
  await cargarDemo(prisma, { codigo: "DEMO-CLI-B", nombre: "[DEMO] Cliente B" });
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-CLI-A", [
      cuenta(PREP, "[DEMO] Preparador Cliente", "PREPARADOR"),
      cuenta(REV, "[DEMO] Revisor Cliente", "REVISOR"),
      cuenta(CAT, "[DEMO] Administrador del catálogo Cliente", "ADMIN_CATALOGO"),
      cuenta(SIS, "[DEMO] Administrador del sistema Cliente", "ADMIN_SISTEMA"),
    ]),
    await crearCuentas(migrador, "DEMO-CLI-B", [
      cuenta("prep@cli-b.softarq.test", "[DEMO] Preparador B", "PREPARADOR"),
      cuenta("cat@cli-b.softarq.test", "[DEMO] Catálogo B", "ADMIN_CATALOGO"),
      cuenta("sis@cli-b.softarq.test", "[DEMO] Sistema B", "ADMIN_SISTEMA"),
    ]),
  );
  const contrasenas = new ServicioContrasenas();
  const a = await cargarClientesDemo(migrador, contrasenas, { organizacion: "DEMO-CLI-A", fecha: FECHA, dominioCorreo: "cli-a.softarq.test" });
  const b = await cargarClientesDemo(migrador, contrasenas, { organizacion: "DEMO-CLI-B", fecha: FECHA, dominioCorreo: "cli-b.softarq.test" });
  for (const c of [...a.accesosCreados, ...b.accesosCreados] as CredencialCliente[]) temporales[c.correo] = c.contrasena;

  app = await crearAplicacion(
    leerConfiguracion({
      DATABASE_URL: urlDePrueba("DATABASE_URL"),
      API_REGISTRO: "ninguno",
      SOFTARQ_DIR_DOCUMENTOS: DIR,
      API_ACCESO_INTENTOS_IP: "1000",
      API_ACCESO_FALLOS_CUENTA: "1000",
      API_ACCESO_FALLOS_CUENTA_IP: "100",
      API_LIMITE_GENERAL_POR_MINUTO: "5000",
      API_LIMITE_CALCULO_POR_MINUTO: "1000",
      API_PANEL_URL: "http://localhost:5173",
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

describe("carga de presentación", () => {
  it("crea 3 trabajos, referencias, 3 clientes ficticios con proyectos y accesos; no repite nada al volver a ejecutarla ni restablece contraseñas", async () => {
    const otra = await cargarClientesDemo(migrador, new ServicioContrasenas(), { organizacion: "DEMO-CLI-A", fecha: FECHA, dominioCorreo: "cli-a.softarq.test" });
    expect(otra).toMatchObject({ trabajosGuardados: [], referenciasDesignadas: [], clientesCreados: [], proyectosCreados: [], accesosCreados: [] });
    expect(otra.accesosConservados).toHaveLength(3);
    const n = await migrador.$queryRaw<{ c: bigint; p: bigint; a: bigint; t: bigint; r: bigint }[]>`
      SELECT (SELECT count(*) FROM cliente c JOIN organizacion o ON o.id = c.organizacion_id WHERE o.codigo = 'DEMO-CLI-A') AS c,
             (SELECT count(*) FROM proyecto p JOIN organizacion o ON o.id = p.organizacion_id WHERE o.codigo = 'DEMO-CLI-A') AS p,
             (SELECT count(*) FROM acceso_cliente a JOIN organizacion o ON o.id = a.organizacion_id WHERE o.codigo = 'DEMO-CLI-A') AS a,
             (SELECT count(*) FROM trabajo_cliente t JOIN organizacion o ON o.id = t.organizacion_id WHERE o.codigo = 'DEMO-CLI-A') AS t,
             (SELECT count(*) FROM referencia_estimacion r JOIN organizacion o ON o.id = r.organizacion_id WHERE o.codigo = 'DEMO-CLI-A' AND r.retirada_en IS NULL) AS r`;
    expect(n.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Number(v)])))[0]).toEqual({ c: 3, p: 4, a: 3, t: 3, r: 8 });
  });
});

describe("acceso, contraseña temporal y canales", () => {
  it("el acceso con la contraseña temporal queda restringido a lo propio y la app debe cambiarla antes de usar nada", async () => {
    const m = new ClienteMovil(url);
    const r = await m.iniciarSesion({ correo: LAURA, contrasena: temporales[LAURA]! });
    expect(r.status, r.texto).toBe(200);
    const s = EsquemaRespuestaAccesoMovil.parse(r.cuerpo);
    expect(s).toMatchObject({ funciones: ["CLIENTE"], capacidades: ["sesion.propia"], cambioContrasenaRequerido: true, organizacion: { codigo: "DEMO-CLI-A" } });
    const t = await m.get("/api/v1/cliente/solicitudes");
    expect(t.status).toBe(403);
    expect(t.cuerpo.error.codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
  });

  it("al cambiar la contraseña desde la app se revocan las sesiones; entra con la definitiva y la temporal ya no sirve", async () => {
    const viejo = await new ClienteMovil(url).entrar({ correo: LAURA, contrasena: temporales[LAURA]! });
    const c = await viejo.post("/api/v1/auth/contrasena", { actual: temporales[LAURA]!, nueva: NUEVA, confirmacion: NUEVA });
    expect(c.status, c.texto).toBe(204);
    expect((await viejo.get("/api/v1/auth/movil/sesion")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion({ correo: LAURA, contrasena: temporales[LAURA]! })).status).toBe(401);
    cred[LAURA] = { correo: LAURA, contrasena: NUEVA };
    const nueva = await new ClienteMovil(url).iniciarSesion(cred[LAURA]);
    expect(nueva.status).toBe(200);
    expect(EsquemaRespuestaAccesoMovil.parse(nueva.cuerpo)).toMatchObject({ cambioContrasenaRequerido: false, capacidades: ["sesion.propia", "cliente.solicitudes", "cliente.cotizaciones"] });
    // El resto de los clientes también cambian su temporal ahora.
    for (const otro of [HECTOR, SILVIA, LAURA_B]) await activar(otro);
  });

  it("una contraseña temporal CADUCADA no permite entrar", async () => {
    // Un acceso nuevo de otro cliente de la B no existe: se adelanta la caducidad de uno ya cargado y se restaura.
    const correo = "silvia.aranda@cli-b.softarq.test";
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() - interval '1 hour' WHERE correo = ${correo}`;
    const r = await new ClienteMovil(url).iniciarSesion({ correo, contrasena: temporales[correo]! });
    expect(r.status).toBe(401);
    expect(r.cuerpo.error.codigo).toBe("CONTRASENA_TEMPORAL_CADUCADA");
  });

  it("una cuenta INTERNA recibe 403 CUENTA_INTERNA_USE_PANEL con la dirección del panel; no obtiene sesión ni acceso como cliente", async () => {
    const r = await new ClienteMovil(url).iniciarSesion(cred[PREP]!);
    expect(r.status).toBe(403);
    expect(r.cuerpo.error).toMatchObject({ codigo: "CUENTA_INTERNA_USE_PANEL", panelUrl: "http://localhost:5173" });
    expect(r.cuerpo.tokenSesion).toBeUndefined();
    const sesiones = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM sesion s JOIN usuario u ON u.id = s.usuario_id WHERE u.correo = ${PREP} AND s.tipo = 'MOVIL'`;
    expect(Number(sesiones[0]!.n)).toBe(0);
    // Con una contraseña incorrecta no se revela que la cuenta existe ni que es interna.
    const mala = await new ClienteMovil(url).iniciarSesion({ correo: PREP, contrasena: "incorrecta-0123456789" });
    expect(mala.status).toBe(401);
  });

  it("una cuenta de cliente no entra por la web (credenciales inválidas) y sus rutas internas no existen para el canal móvil", async () => {
    const w = new ClienteHttp(url);
    expect((await w.iniciarSesion(cred[LAURA]!)).status).toBe(401);
    const c = await movil(LAURA);
    for (const ruta of ["/api/v1/clientes", "/api/v1/proyectos", "/api/v1/cotizaciones", "/api/v1/solicitudes", "/api/v1/admin/referencias-estimacion", "/api/v1/catalogos/conceptos"]) {
      const r = await c.get(ruta);
      expect(r.status, ruta).toBe(403);
      expect(r.cuerpo.error.codigo, ruta).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("trabajos y proyectos del cliente", () => {
  it("la API dicta las medidas de cada trabajo (de la fórmula del concepto) y admite huecos solo donde el concepto los permite", async () => {
    const c = await movil(LAURA);
    const r = await c.get("/api/v1/cliente/trabajos");
    expect(r.status, r.texto).toBe(200);
    const t = EsquemaRespuestaTrabajosCliente.parse(r.cuerpo).trabajos;
    expect(t.map((x) => x.codigo)).toEqual(["CUBIERTA", "LOSA", "MURO"]);
    const op = (cod: string) => t.find((x) => x.codigo === cod)!.opciones[0]!;
    expect(op("CUBIERTA")).toMatchObject({ admiteHuecos: true, unidadResultado: "m2" });
    expect(op("CUBIERTA").medidas.map((m) => m.clave)).toEqual(["largo", "ancho"]);
    expect(op("LOSA")).toMatchObject({ admiteHuecos: false, unidadResultado: "m3" });
    expect(op("LOSA").medidas.map((m) => `${m.clave}:${m.etiqueta}`)).toEqual(["largo:Largo", "ancho:Ancho", "alto:Espesor"]);
    expect(op("MURO").medidas.map((m) => m.clave)).toEqual(["largo", "alto"]);
    expect(r.texto).not.toMatch(INTERNAS);
  });

  it("lista sus proyectos, crea uno propio y nunca ve los de otro cliente ni los de otra organización", async () => {
    const c = await movil(LAURA);
    const p = await c.get("/api/v1/cliente/proyectos");
    expect((p.cuerpo.proyectos as { nombre: string }[]).map((x) => x.nombre).sort()).toEqual(["Bodega Ixtapaluca", "Casa Tlalpan"]);
    const nuevo = await c.post("/api/v1/cliente/proyectos", { nombre: "Patio trasero", municipio: "Tlalpan", entidadFederativa: "Ciudad de México", descripcion: null });
    expect(nuevo.status, nuevo.texto).toBe(201);
    expect(nuevo.cuerpo).toMatchObject({ nombre: "Patio trasero", municipio: "Tlalpan" });
    const h = await (await movil(HECTOR)).get("/api/v1/cliente/proyectos");
    expect((h.cuerpo.proyectos as { nombre: string }[]).map((x) => x.nombre)).toEqual(["Nave industrial Querétaro"]);
    // El cuerpo no puede traer el cliente: se rechaza (contrato estricto) y nada se crea.
    const fraude = await c.post("/api/v1/cliente/proyectos", { nombre: "Ajeno", municipio: "x", entidadFederativa: "y", descripcion: null, clienteId: randomUUID() });
    expect(fraude.status).toBe(400);
    // La proyección sale del cliente de la sesión: el proyecto nuevo quedó en SU cliente.
    const fila = await migrador.$queryRaw<{ cliente: string }[]>`SELECT c.nombre AS cliente FROM proyecto p JOIN cliente c ON c.id = p.cliente_id WHERE p.id = ${nuevo.cuerpo.id}::uuid`;
    expect(fila[0]!.cliente).toBe("Laura Méndez");
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("solicitud y estimación preliminar (motor existente con precios de referencia)", () => {
  let laura: ClienteMovil;
  let casa: string;
  const s: { id: string; revision: number; folio: string } = { id: "", revision: 0, folio: "" };

  beforeAll(async () => {
    laura = await movil(LAURA);
    casa = await proyectoDe(laura, "Casa Tlalpan");
  });

  it("crea una solicitud en borrador desde cero (captura vacía) con folio SOL-AAAA-NNNNN y no la deja estimar ni enviar", async () => {
    const sol = await nuevaSolicitud(laura, casa, { trabajos: [], notas: null });
    expect(sol).toMatchObject({ estado: "BORRADOR", editable: true, revision: 0, ultimaEstimacion: null, cotizacionFormal: null });
    expect(sol.folio).toMatch(/^SOL-2026-\d{5}$/);
    expect(sol.pendientes.map((p) => p.ruta)).toEqual(["trabajos"]);
    Object.assign(s, { id: sol.id, revision: sol.revision, folio: sol.folio });
    const e = await estimar(laura, s.id, 0);
    expect(e.status).toBe(422);
    expect(e.cuerpo.error.codigo).toBe("SOLICITUD_INCOMPLETA");
    const v = await enviar(laura, s.id, 0);
    expect(v.status).toBe(422);
    expect(v.cuerpo.error.codigo).toBe("SOLICITUD_INCOMPLETA");
  });

  it("guarda capturas incompletas (progreso) pero rechaza las inválidas; la revisión protege de ediciones paralelas", async () => {
    const parcial = captura({ ...losa(), secciones: [{ nombre: "", piezas: "1", largo: "6", ancho: null, alto: null }] });
    const g = await guardar(laura, s.id, s.revision, parcial);
    expect(g.status, g.texto).toBe(200);
    const sol = EsquemaSolicitudDelCliente.parse(g.cuerpo);
    expect(sol.revision).toBe(1);
    expect(sol.pendientes.map((p) => p.ruta)).toEqual(["trabajos[0].secciones[0].ancho", "trabajos[0].secciones[0].alto"]);
    // Revisión vieja: 409 sin perder lo guardado.
    const viejo = await guardar(laura, s.id, 0, captura(losa()));
    expect(viejo.status).toBe(409);
    expect(viejo.cuerpo.error.codigo).toBe("CONFLICTO_EDICION");
    // Valores no positivos, dimensiones que el trabajo no pide, opción inexistente y hueco en un trabajo que no los admite.
    const cero = await guardar(laura, s.id, 1, captura({ ...losa(), secciones: [{ nombre: "", piezas: "1", largo: "0", ancho: "5", alto: "0.12" }] }));
    expect(cero.status).toBe(422);
    expect(cero.cuerpo.error.campos[0].ruta).toBe("trabajos[0].secciones[0].largo");
    const sobra = await guardar(laura, s.id, 1, captura({ ...cubierta(), secciones: [{ nombre: "", piezas: "1", largo: "10", ancho: "4", alto: "2" }], huecos: [] }));
    expect(sobra.status).toBe(422);
    const falsa = await guardar(laura, s.id, 1, captura({ ...losa(), opcionCodigo: "INEXISTENTE" }));
    expect(falsa.status).toBe(422);
    const huecoEnLosa = await guardar(laura, s.id, 1, captura({ ...losa(), huecos: [{ nombre: "Registro", piezas: "1", largo: "1", ancho: "1", alto: "0.12" }] }));
    expect(huecoEnLosa.status).toBe(422);
    expect(huecoEnLosa.cuerpo.error.campos[0]).toMatchObject({ ruta: "trabajos[0].huecos", mensaje: "Este trabajo no admite huecos." });
    s.revision = 1;
  });

  it("calcular NO envía: la estimación coincide con el motor aplicado a las referencias (losa), se rotula como preliminar y no expone datos internos", async () => {
    const g = await guardar(laura, s.id, s.revision, captura(losa()));
    expect(g.status, g.texto).toBe(200);
    s.revision = g.cuerpo.revision;
    const e = await estimar(laura, s.id, s.revision);
    expect(e.status, e.texto).toBe(201);
    const est = EsquemaEstimacionCliente.parse(e.cuerpo);
    expect(est).toMatchObject({ estado: "ESTIMADA", numero: 1, rotulo: ROTULO_ESTIMACION, desactualizada: false, motivo: null, revisionCaptura: s.revision });
    expect(est.comercial?.ambiente).toBe("DEMO");
    expect(est.comercial?.leyenda).toContain("DEMOSTRACIÓN");
    expect(e.texto).not.toMatch(INTERNAS);
    // Referencia: el mismo cálculo por la calculadora del Preparador con las referencias como precios elegidos.
    const p = await web(PREP);
    const directo = await p.post("/api/v1/calculos/demo", {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00008",
          mediciones: losa().secciones.map((x) => ({ descripcion: x.nombre, signo: "+", piezas: x.piezas, largo: x.largo, ancho: x.ancho, alto: x.alto })),
        },
      ],
      preciosElegidos: R2.entrada.selecciones.map((x) => x.precioId),
    });
    expect(directo.status, directo.texto).toBe(200);
    expect(est.comercial?.total).toBe(directo.cuerpo.cotizacion.total);
    expect(est.comercial?.subtotal).toBe(directo.cuerpo.cotizacion.subtotal);
    expect(Number(est.comercial?.total)).toBeGreaterThan(0);
    // La solicitud sigue en borrador: calcular no la envió.
    const sol = await obtener(laura, s.id);
    expect(sol.estado).toBe("BORRADOR");
    expect(sol.enviadaEn).toBeNull();
    expect(sol.ultimaEstimacion).toMatchObject({ id: est.id, desactualizada: false });
    expect(await tiposBitacora(s.id)).not.toContain("SOLICITUD_ENVIADA");
  });

  it("varios trabajos con huecos: cubierta con tragaluz y muro con ventanas coinciden con el motor (CR de descuentos) y los huecos RESTAN", async () => {
    const sol = await nuevaSolicitud(laura, casa, captura(cubierta("t1"), muro("t2")));
    const e = await estimar(laura, sol.id, sol.revision);
    expect(e.status, e.texto).toBe(201);
    const est = EsquemaEstimacionCliente.parse(e.cuerpo);
    expect(est.estado).toBe("ESTIMADA");
    const p = await web(PREP);
    const directo = await p.post("/api/v1/calculos/demo", {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00007",
          mediciones: [
            { descripcion: "Faldón norte", signo: "+", piezas: "1", largo: "10", ancho: "4.5", alto: null },
            { descripcion: "Faldón sur", signo: "+", piezas: "1", largo: "10", ancho: "4.5", alto: null },
            { descripcion: "Tragaluz", signo: "-", piezas: "1", largo: "1.2", ancho: "1", alto: null },
          ],
        },
        {
          id: "P002",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00009",
          mediciones: [
            { descripcion: "Colindancia", signo: "+", piezas: "1", largo: "9", ancho: null, alto: "2.4" },
            { descripcion: "Ventana", signo: "-", piezas: "2", largo: "1.2", ancho: null, alto: "1" },
          ],
        },
      ],
      preciosElegidos: [...new Set([...R1.entrada.selecciones.map((x) => x.precioId), "PRE-000016", "PRE-000017", "PRE-000013"])],
    });
    expect(directo.status, directo.texto).toBe(200);
    expect(est.comercial?.total).toBe(directo.cuerpo.cotizacion.total);
    expect(est.comercial?.partidas).toHaveLength(2);
    // Sin los huecos el importe sería mayor: se restan de la medición.
    const sinHuecos = await nuevaSolicitud(laura, casa, captura({ ...cubierta("t1"), huecos: [] }, { ...muro("t2"), huecos: [] }));
    const e2 = EsquemaEstimacionCliente.parse((await estimar(laura, sinHuecos.id, sinHuecos.revision)).cuerpo);
    expect(Number(e2.comercial!.total)).toBeGreaterThan(Number(est.comercial!.total));
  });

  it("estimar de nuevo crea otra instantánea inmutable; tras editar la captura, la anterior queda desactualizada", async () => {
    const e2 = EsquemaEstimacionCliente.parse((await estimar(laura, s.id, s.revision)).cuerpo);
    expect(e2.numero).toBe(2);
    const g = await guardar(laura, s.id, s.revision, captura({ ...losa(), secciones: [{ nombre: "Tablero", piezas: "1", largo: "6", ancho: "5", alto: "0.15" }] }));
    expect(g.status).toBe(200);
    s.revision = g.cuerpo.revision;
    expect(g.cuerpo.ultimaEstimacion).toMatchObject({ numero: 2, desactualizada: true });
    // Estimar con la revisión vieja se rechaza: la estimación siempre corresponde a la captura vigente.
    expect((await estimar(laura, s.id, s.revision - 1)).status).toBe(409);
    const n = await migrador.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM estimacion_solicitud WHERE solicitud_id = ${s.id}::uuid`;
    expect(Number(n[0]!.n)).toBe(2);
    await expect(migrador.$executeRaw`UPDATE estimacion_solicitud SET estado = 'ESTIMADA' WHERE solicitud_id = ${s.id}::uuid`).rejects.toThrow();
    await expect(migrador.$executeRaw`DELETE FROM estimacion_solicitud WHERE solicitud_id = ${s.id}::uuid`).rejects.toThrow();
  });

  it("sin referencia válida NO hay importe (nunca un cero): SIN_ESTIMACION con su motivo, y la solicitud se puede enviar igual", async () => {
    const cat = await web(CAT);
    const ret = await cat.post("/api/v1/admin/referencias-estimacion/INS-00009/retiro", { motivo: "Prueba: falta una referencia" }, idem());
    expect(ret.status, ret.texto).toBe(200);
    expect(ret.cuerpo.pendientes.map((x: { insumoCodigo: string }) => x.insumoCodigo)).toContain("INS-00009");
    const sol = await nuevaSolicitud(laura, casa, captura(losa()));
    const e = await estimar(laura, sol.id, sol.revision);
    expect(e.status, e.texto).toBe(201);
    const est = EsquemaEstimacionCliente.parse(e.cuerpo);
    expect(est).toMatchObject({ estado: "SIN_ESTIMACION", comercial: null, motivo: { codigo: "FALTA_REFERENCIA" } });
    expect(est.motivo?.mensaje).toContain("El equipo completará la valoración");
    expect(e.texto).not.toMatch(/"total"|\b0\.00\b/);
    const env = await enviar(laura, sol.id, sol.revision);
    expect(env.status, env.texto).toBe(200);
    expect(EsquemaRespuestaEnvioSolicitud.parse(env.cuerpo)).toMatchObject({ repetida: false, solicitud: { estado: "ENVIADA" } });
    // Se restaura la referencia con el mismo precio (nada se sustituye por otro ni por el menor).
    const des = await cat.solicitar("PUT", "/api/v1/admin/referencias-estimacion/INS-00009", { cuerpo: { precioCodigo: "PRE-000014", motivo: "Prueba: se restablece" }, cabeceras: idem().cabeceras });
    expect(des.status, des.texto).toBe(200);
    ids["solSinReferencia"] = sol.id;
  });

  it("una referencia que deja de ser válida (producto inactivo) se detecta al estimar: no se usa y tampoco se reemplaza", async () => {
    const baja = (activo: boolean) =>
      migrador.$executeRaw`UPDATE producto SET activo = ${activo} WHERE organizacion_id = (SELECT id FROM organizacion WHERE codigo = 'DEMO-CLI-A') AND id = (SELECT producto_id FROM precio WHERE codigo = 'PRE-000014' AND organizacion_id = (SELECT id FROM organizacion WHERE codigo = 'DEMO-CLI-A'))`;
    await baja(false);
    try {
      const sol = await nuevaSolicitud(laura, casa, captura(losa()));
      const est = EsquemaEstimacionCliente.parse((await estimar(laura, sol.id, sol.revision)).cuerpo);
      expect(est).toMatchObject({ estado: "SIN_ESTIMACION", comercial: null, motivo: { codigo: "FALTA_REFERENCIA" } });
    } finally {
      await baja(true);
    }
  });

  it("enviar: idempotente (reintento y doble toque simultáneo no duplican), deja la solicitud inmutable y no se puede retirar tras la atención", async () => {
    const [a, b] = await Promise.all([enviar(laura, s.id, s.revision), enviar(laura, s.id, s.revision)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const repetidas = [a, b].map((x) => EsquemaRespuestaEnvioSolicitud.parse(x.cuerpo).repetida).sort();
    expect(repetidas).toEqual([false, true]);
    const otra = await enviar(laura, s.id, s.revision);
    expect(EsquemaRespuestaEnvioSolicitud.parse(otra.cuerpo)).toMatchObject({ repetida: true, solicitud: { estado: "ENVIADA", editable: false, pendientes: [] } });
    expect((await tiposBitacora(s.id)).filter((t) => t === "SOLICITUD_ENVIADA")).toHaveLength(1);
    const sol = await obtener(laura, s.id);
    expect(sol.enviadaEn).not.toBeNull();
    // Enviada: no se edita ni se vuelve a estimar; la captura enviada es inmutable también en la base.
    expect((await guardar(laura, s.id, s.revision, captura(losa()))).cuerpo.error.codigo).toBe("SOLICITUD_NO_EDITABLE");
    expect((await estimar(laura, s.id, s.revision)).status).toBe(409);
    await expect(migrador.$executeRaw`UPDATE solicitud_cliente SET captura = '{"trabajos":[],"notas":null}'::jsonb WHERE id = ${s.id}::uuid`).rejects.toThrow();
    ids["solEnviada"] = s.id;
  });

  it("retirar: un borrador o una solicitud enviada sin atender se retira (idempotente); una retirada no se envía", async () => {
    const sol = await nuevaSolicitud(laura, casa, captura(muro()));
    const r1 = await laura.post(`/api/v1/cliente/solicitudes/${sol.id}/retiro`, {});
    expect(r1.status, r1.texto).toBe(200);
    expect(EsquemaSolicitudDelCliente.parse(r1.cuerpo).estado).toBe("RETIRADA");
    expect((await laura.post(`/api/v1/cliente/solicitudes/${sol.id}/retiro`, { motivo: "otra vez" })).status).toBe(200);
    const env = await enviar(laura, sol.id, sol.revision);
    expect(env.status).toBe(409);
    expect(env.cuerpo.error.codigo).toBe("ESTADO_SOLICITUD_NO_PERMITE");
    const lista = EsquemaRespuestaSolicitudesCliente.parse((await laura.get("/api/v1/cliente/solicitudes")).cuerpo);
    expect(lista.solicitudes.find((x) => x.id === sol.id)?.estado).toBe("RETIRADA");
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("propiedad de los registros: cada cliente solo ve y toca lo suyo", () => {
  it("otro cliente de la misma organización no ve, edita, estima, envía ni retira la solicitud ajena (404); tampoco la lista", async () => {
    const hector = await movil(HECTOR);
    const sol = ids["solEnviada"]!;
    for (const [metodo, ruta, cuerpo] of [
      ["GET", `/api/v1/cliente/solicitudes/${sol}`, undefined],
      ["PUT", `/api/v1/cliente/solicitudes/${sol}`, { revision: 3, captura: captura(losa()) }],
      ["POST", `/api/v1/cliente/solicitudes/${sol}/estimaciones`, { revision: 3 }],
      ["POST", `/api/v1/cliente/solicitudes/${sol}/envio`, { revision: 3 }],
      ["POST", `/api/v1/cliente/solicitudes/${sol}/retiro`, {}],
    ] as const) {
      const r = await hector.solicitar(metodo, ruta, cuerpo === undefined ? {} : { cuerpo });
      expect(r.status, `${metodo} ${ruta}`).toBe(404);
      expect(r.cuerpo.error.codigo).toBe("NO_ENCONTRADO");
    }
    const lista = EsquemaRespuestaSolicitudesCliente.parse((await hector.get("/api/v1/cliente/solicitudes")).cuerpo);
    expect(lista.solicitudes).toEqual([]);
  });

  it("no se puede crear una solicitud sobre el proyecto de otro cliente ni de otra organización, ni fijar cliente o estado desde el teléfono", async () => {
    const hector = await movil(HECTOR);
    const laura = await movil(LAURA);
    const casa = await proyectoDe(laura, "Casa Tlalpan");
    const ajeno = await hector.post("/api/v1/cliente/solicitudes", { proyectoId: casa, captura: captura(losa()) });
    expect(ajeno.status).toBe(404);
    const lauraB = await movil(LAURA_B);
    const deB = await proyectoDe(lauraB, "Casa Tlalpan");
    expect((await laura.post("/api/v1/cliente/solicitudes", { proyectoId: deB, captura: captura(losa()) })).status).toBe(404);
    for (const extra of [{ clienteId: randomUUID() }, { estado: "ENVIADA" }, { organizacionId: randomUUID() }, { funciones: ["PREPARADOR"] }]) {
      const r = await laura.post("/api/v1/cliente/solicitudes", { proyectoId: casa, captura: captura(losa()), ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }
    // Un id de otra organización responde igual que uno inexistente.
    const ajenaB = (await (await movil(LAURA_B)).get("/api/v1/cliente/solicitudes")).cuerpo.solicitudes;
    expect(ajenaB).toEqual([]);
    expect((await laura.get(`/api/v1/cliente/solicitudes/${randomUUID()}`)).status).toBe(404);
  });

  it("los accesos de otra organización no tocan datos de esta, aunque usen identificadores válidos", async () => {
    const lauraB = await movil(LAURA_B);
    const r = await lauraB.get(`/api/v1/cliente/solicitudes/${ids["solEnviada"]}`);
    expect(r.status).toBe(404);
    expect((await lauraB.get("/api/v1/cliente/cotizaciones")).cuerpo.cotizaciones).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("bandeja del equipo y atención de la solicitud", () => {
  it("el Preparador ve las solicitudes enviadas (no los borradores) con la estimación rotulada como preliminar; otras funciones y el cliente no", async () => {
    const p = await web(PREP);
    const r = await p.get("/api/v1/solicitudes");
    expect(r.status, r.texto).toBe(200);
    const lista = EsquemaRespuestaSolicitudesEquipo.parse(r.cuerpo).solicitudes;
    expect(lista.map((x) => x.id)).toContain(ids["solEnviada"]);
    expect(lista.every((x) => x.estado === "ENVIADA" || x.estado === "EN_PREPARACION")).toBe(true);
    expect(lista.find((x) => x.id === ids["solEnviada"])).toMatchObject({ cliente: "Laura Méndez", proyecto: "Casa Tlalpan", trabajos: ["Losa"] });
    const d = EsquemaDetalleSolicitudEquipo.parse((await p.get(`/api/v1/solicitudes/${ids["solEnviada"]}`)).cuerpo);
    expect(d.ultimaEstimacion?.rotulo).toBe(ROTULO_ESTIMACION);
    expect(d.captura.trabajos[0]!.secciones).toHaveLength(1);
    // Un borrador del cliente no aparece para el equipo.
    const laura = await movil(LAURA);
    const borrador = await nuevaSolicitud(laura, await proyectoDe(laura, "Casa Tlalpan"), captura(losa()));
    expect((await p.get(`/api/v1/solicitudes/${borrador.id}`)).status).toBe(404);
    for (const correo of [REV, CAT, SIS]) expect((await (await web(correo)).get("/api/v1/solicitudes")).status, correo).toBe(403);
    const c = await laura.get("/api/v1/solicitudes");
    expect(c.status).toBe(403);
    expect(c.cuerpo.error.codigo).toBe("RUTA_NO_DISPONIBLE_EN_MOVIL");
  });

  it("atender crea la cotización formal en borrador con las medidas del cliente y SIN precios elegidos ni compras consolidadas; es idempotente", async () => {
    const p = await web(PREP);
    const sol = ids["solEnviada"]!;
    const det = EsquemaDetalleSolicitudEquipo.parse((await p.get(`/api/v1/solicitudes/${sol}`)).cuerpo);
    const mala = await p.post(`/api/v1/solicitudes/${sol}/atencion`, { revision: det.revision + 7 }, idem());
    expect(mala.status).toBe(409);
    const r = await p.post(`/api/v1/solicitudes/${sol}/atencion`, { revision: det.revision }, idem());
    expect(r.status, r.texto).toBe(201);
    expect(r.cuerpo).toMatchObject({ repetida: false });
    expect(r.cuerpo.folio).toMatch(/^COT-2026-\d{5}$/);
    ids["cotizacion"] = r.cuerpo.cotizacionId;
    const otra = await p.post(`/api/v1/solicitudes/${sol}/atencion`, { revision: det.revision }, idem());
    expect(otra.status).toBe(200);
    expect(otra.cuerpo).toMatchObject({ repetida: true, cotizacionId: r.cuerpo.cotizacionId, folio: r.cuerpo.folio });
    const cot = EsquemaDetalleCotizacion.parse((await p.get(`/api/v1/cotizaciones/${r.cuerpo.cotizacionId}`)).cuerpo);
    expect(cot.borrador.captura.seleccion).toEqual([]);
    expect(cot.borrador.captura.consolidarCompras).toBeNull();
    expect(cot.borrador.captura.partidas).toHaveLength(1);
    const partida = cot.borrador.captura.partidas[0]!;
    expect(partida.tipo === "CONCEPTO" && partida.conceptoCodigo).toBe("CON-00008");
    expect(partida.tipo === "CONCEPTO" && partida.mediciones.map((m) => `${m.largo}x${m.ancho}x${m.alto}`)).toEqual(["6x5x0.15"]);
    expect(cot.borrador.captura.textos).toBeDefined();
    expect(cot.cotizacion.folio).toBe(r.cuerpo.folio);
    expect(await tiposBitacora(sol)).toEqual(expect.arrayContaining(["SOLICITUD_ENVIADA", "SOLICITUD_ATENDIDA"]));
    // El cliente ve que ya la atienden; ya no puede retirarla.
    const laura = await movil(LAURA);
    expect((await obtener(laura, sol)).estado).toBe("EN_PREPARACION");
    expect((await laura.post(`/api/v1/cliente/solicitudes/${sol}/retiro`, {})).status).toBe(409);
    // Las referencias de la estimación NO quedan como selecciones aprobadas de la cotización.
    const selecciones = await migrador.$queryRaw<{ n: bigint }[]>`SELECT jsonb_array_length(captura->'seleccion') AS n FROM cotizacion_borrador WHERE cotizacion_id = ${r.cuerpo.cotizacionId}::uuid`;
    expect(Number(selecciones[0]!.n)).toBe(0);
  });

  it("solo el Preparador atiende, y una solicitud retirada no se atiende", async () => {
    const laura = await movil(LAURA);
    const sol = await nuevaSolicitud(laura, await proyectoDe(laura, "Casa Tlalpan"), captura(muro()));
    await enviar(laura, sol.id, sol.revision);
    await laura.post(`/api/v1/cliente/solicitudes/${sol.id}/retiro`, {});
    const p = await web(PREP);
    const r = await p.post(`/api/v1/solicitudes/${sol.id}/atencion`, { revision: sol.revision }, idem());
    expect(r.status).toBe(409);
    const rev = await web(REV);
    expect((await rev.post(`/api/v1/solicitudes/${ids["solEnviada"]}/atencion`, { revision: 1 }, idem())).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("cotización formal emitida: el cliente la ve, con su PDF, y solo las suyas", () => {
  async function emitirDesde(prepCot: ClienteHttp, revCot: ClienteHttp, id: string): Promise<{ emisionId: string; total: string; folio: string }> {
    const det = EsquemaDetalleCotizacion.parse((await prepCot.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    const v = await prepCot.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: det.borrador.revision }, idem());
    expect(v.status, v.texto).toBe(201);
    const env = await prepCot.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: det.borrador.revision }, idem());
    expect(env.status, env.texto).toBe(201);
    const rev = EsquemaDetalleRevision.parse(env.cuerpo);
    const ok = await revCot.post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId: rev.revision.version.id, revision: rev.revision.revision }, idem());
    expect(ok.status, ok.texto).toBe(200);
    const aprobada = EsquemaDetalleRevision.parse(ok.cuerpo);
    const em = await prepCot.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId: aprobada.revision.version.id, revisionId: aprobada.revision.id }, idem());
    expect(em.status, em.texto).toBe(201);
    return { emisionId: em.cuerpo.emision.id, total: em.cuerpo.documento.total, folio: em.cuerpo.emision.folio };
  }

  it("flujo completo: el Preparador confirma explícitamente los precios, se revisa, se aprueba y se emite; el cliente ve su cotización y descarga el PDF", async () => {
    const p = await web(PREP);
    const r = await web(REV);
    const id = ids["cotizacion"]!;
    const det = EsquemaDetalleCotizacion.parse((await p.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    // Confirmación explícita de precios y de consolidar compras (lo que la atención dejó sin decidir).
    const seleccion = R2.entrada.selecciones.map((x) => ({ insumoCodigo: x.insumoId, precioCodigo: x.precioId }));
    const g = await p.put(`/api/v1/cotizaciones/${id}/borrador`, { revision: det.borrador.revision, captura: { ...det.borrador.captura, consolidarCompras: true, seleccion } }, idem());
    expect(g.status, g.texto).toBe(200);
    const e = await emitirDesde(p, r, id);
    ids["emision"] = e.emisionId;
    const laura = await movil(LAURA);
    const sol = await obtener(laura, ids["solEnviada"]!);
    expect(sol.estado).toBe("COTIZADA");
    expect(sol.cotizacionFormal).toMatchObject({ emisionId: e.emisionId, folio: e.folio, total: e.total, solicitudFolio: sol.folio, vigente: true });
    const lista = EsquemaRespuestaCotizacionesCliente.parse((await laura.get("/api/v1/cliente/cotizaciones")).cuerpo);
    expect(lista.cotizaciones.map((x) => x.emisionId)).toContain(e.emisionId);
    const d = await laura.get(`/api/v1/cliente/cotizaciones/${e.emisionId}`);
    expect(d.status, d.texto).toBe(200);
    const detalle = EsquemaDetalleCotizacionCliente.parse(d.cuerpo);
    expect(EsquemaCotizacionComercial.parse(detalle.comercial).total).toBe(e.total);
    expect(detalle.comercial.leyenda).toContain("DEMOSTRACIÓN");
    // Nada interno: ni quién preparó, aprobó y emitió, ni identificadores de versión, ni textos técnicos.
    expect(d.texto).not.toMatch(INTERNAS);
    expect(d.texto).not.toMatch(/personas|preparo|aprobo|emitio|idVersion|leyendaTecnica|\[DEMO\] (Preparador|Revisor)/);
    // PDF: los mismos bytes registrados.
    const pdf = await fetch(`${url}/api/v1/cliente/cotizaciones/${e.emisionId}/documento`, { headers: { Authorization: `Bearer ${laura.token}` } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // El equipo ve lo mismo que el cliente: tras emitir, la solicitud figura como cotizada (derivado, no guardado) y sale de «en preparación».
    const enPreparacion = EsquemaRespuestaSolicitudesEquipo.parse((await p.get("/api/v1/solicitudes?estado=EN_PREPARACION")).cuerpo);
    expect(enPreparacion.solicitudes.map((x) => x.id)).not.toContain(ids["solEnviada"]);
    const cotizadas = EsquemaRespuestaSolicitudesEquipo.parse((await p.get("/api/v1/solicitudes?estado=COTIZADA")).cuerpo);
    const suya = cotizadas.solicitudes.find((x) => x.id === ids["solEnviada"]);
    expect(suya, "la solicitud cotizada aparece en el filtro COTIZADA").toBeTruthy();
    expect(suya!.estado).toBe("COTIZADA");
    expect(suya!.cotizacionId).toBe(ids["cotizacion"]);
    const detalleEquipo = EsquemaDetalleSolicitudEquipo.parse((await p.get(`/api/v1/solicitudes/${ids["solEnviada"]}`)).cuerpo);
    expect(detalleEquipo.estado).toBe("COTIZADA");
    expect((await p.get("/api/v1/solicitudes?estado=NO_EXISTE")).status).toBe(400);
  });

  it("las cotizaciones de OTRO cliente o de otra organización no se ven ni se descargan, aunque se conozca el identificador de la emisión", async () => {
    const e = ids["emision"]!;
    for (const correo of [HECTOR, SILVIA, LAURA_B]) {
      const c = await movil(correo);
      expect((await c.get(`/api/v1/cliente/cotizaciones/${e}`)).status, correo).toBe(404);
      const pdf = await fetch(`${url}/api/v1/cliente/cotizaciones/${e}/documento`, { headers: { Authorization: `Bearer ${c.token}` } });
      expect(pdf.status, correo).toBe(404);
      expect((await c.get("/api/v1/cliente/cotizaciones")).cuerpo.cotizaciones.map((x: { emisionId: string }) => x.emisionId)).not.toContain(e);
    }
  });

  it("política: las cotizaciones emitidas de su Cliente se ven aunque se hayan preparado desde el panel (sin solicitud); borradores y versiones de trabajo nunca", async () => {
    const p = await web(PREP);
    const r = await web(REV);
    const laura = await movil(LAURA);
    const filas = await migrador.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM proyecto p JOIN cliente c ON c.id = p.cliente_id JOIN organizacion o ON o.id = c.organizacion_id
       WHERE o.codigo = 'DEMO-CLI-A' AND c.nombre = 'Laura Méndez' AND p.nombre = 'Bodega Ixtapaluca'`;
    const cot = await p.post("/api/v1/cotizaciones", { proyectoId: filas[0]!.id, captura: borradorDesdeEntrada(R1.entrada) }, idem());
    expect(cot.status, cot.texto).toBe(201);
    const id = cot.cuerpo.cotizacion.id as string;
    // Con la cotización solo en borrador, el cliente no ve nada de ella.
    let lista = EsquemaRespuestaCotizacionesCliente.parse((await laura.get("/api/v1/cliente/cotizaciones")).cuerpo).cotizaciones;
    expect(lista.map((x) => x.folio)).not.toContain(cot.cuerpo.cotizacion.folio);
    const det = EsquemaDetalleCotizacion.parse((await p.get(`/api/v1/cotizaciones/${id}`)).cuerpo);
    const v = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: det.borrador.revision }, idem());
    expect(v.status, v.texto).toBe(201);
    lista = EsquemaRespuestaCotizacionesCliente.parse((await laura.get("/api/v1/cliente/cotizaciones")).cuerpo).cotizaciones;
    expect(lista.map((x) => x.folio)).not.toContain(cot.cuerpo.cotizacion.folio);
    const e = await emitirDesdeVersionLista(p, r, id, det.borrador.revision);
    lista = EsquemaRespuestaCotizacionesCliente.parse((await laura.get("/api/v1/cliente/cotizaciones")).cuerpo).cotizaciones;
    const propia = lista.find((x) => x.emisionId === e.emisionId);
    expect(propia).toMatchObject({ folio: cot.cuerpo.cotizacion.folio, solicitudFolio: null, total: R1.esperado.total });
    expect(lista.length).toBeGreaterThanOrEqual(2);
  });
});

/** Aprobar y emitir la versión 1 ya calculada. */
async function emitirDesdeVersionLista(p: ClienteHttp, r: ClienteHttp, id: string, revisionBorrador: number): Promise<{ emisionId: string }> {
  const env = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador }, idem());
  expect(env.status, env.texto).toBe(201);
  const rev = EsquemaDetalleRevision.parse(env.cuerpo);
  const ok = await r.post(`/api/v1/revisiones/${rev.revision.id}/decision`, { decision: "APROBAR", versionId: rev.revision.version.id, revision: rev.revision.revision }, idem());
  expect(ok.status, ok.texto).toBe(200);
  const aprobada = EsquemaDetalleRevision.parse(ok.cuerpo);
  const em = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId: aprobada.revision.version.id, revisionId: aprobada.revision.id }, idem());
  expect(em.status, em.texto).toBe(201);
  return { emisionId: em.cuerpo.emision.id as string };
}

// ---------------------------------------------------------------------------------------------------------------------

describe("pérdida de permisos con la sesión abierta", () => {
  it("al desactivar el acceso (Administrador del sistema) se revocan sus sesiones y la siguiente solicitud falla; reactivarlo no revive la sesión", async () => {
    const silvia = await movil(SILVIA);
    expect((await silvia.get("/api/v1/cliente/solicitudes")).status).toBe(200);
    const acceso = await migrador.$queryRaw<{ id: string }[]>`SELECT u.id FROM usuario u WHERE u.correo = ${SILVIA}`;
    const sis = await web(SIS);
    const baja = await sis.put(`/api/v1/admin/accesos-cliente/${acceso[0]!.id}/estado`, { activo: false, motivo: "Prueba de baja del acceso" }, idem());
    expect(baja.status, baja.texto).toBe(200);
    expect(baja.cuerpo).toMatchObject({ activo: false });
    expect((await silvia.get("/api/v1/cliente/solicitudes")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion(cred[SILVIA]!)).status).toBe(401);
    const alta = await sis.put(`/api/v1/admin/accesos-cliente/${acceso[0]!.id}/estado`, { activo: true, motivo: "Prueba de alta del acceso" }, idem());
    expect(alta.status).toBe(200);
    expect((await silvia.get("/api/v1/cliente/solicitudes")).status).toBe(401);
    expect((await new ClienteMovil(url).iniciarSesion(cred[SILVIA]!)).status).toBe(200);
  });

  it("si la base deja de reconocer el acceso (cliente desactivado) cada operación del cliente se rechaza con 403, aunque el token siga vigente", async () => {
    const hector = await movil(HECTOR);
    expect((await hector.get("/api/v1/cliente/proyectos")).status).toBe(200);
    await migrador.$executeRaw`UPDATE acceso_cliente SET activo = false WHERE usuario_id = (SELECT id FROM usuario WHERE correo = ${HECTOR})`;
    try {
      // La sesión no se revocó (solo cambió el vínculo): las funciones de la base niegan cada operación.
      for (const r of [await hector.get("/api/v1/cliente/proyectos"), await hector.get("/api/v1/cliente/solicitudes"), await hector.post("/api/v1/cliente/proyectos", { nombre: "X", municipio: "x", entidadFederativa: "y", descripcion: null })]) {
        expect(r.status).toBe(403);
        expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
      }
    } finally {
      await migrador.$executeRaw`UPDATE acceso_cliente SET activo = true WHERE usuario_id = (SELECT id FROM usuario WHERE correo = ${HECTOR})`;
    }
    expect((await hector.get("/api/v1/cliente/proyectos")).status).toBe(200);
  });

  it("una cuenta de cliente no puede recibir funciones internas, ni siquiera con el rol migrador (disparador de coherencia); sigue siendo de cliente", async () => {
    const lauraB = await movil(LAURA_B);
    expect((await lauraB.get("/api/v1/cliente/trabajos")).status).toBe(200);
    await expect(migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['PREPARADOR']::varchar[] WHERE usuario_id = (SELECT id FROM usuario WHERE correo = ${LAURA_B})`).rejects.toThrow();
    await expect(migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['CLIENTE', 'PREPARADOR']::varchar[] WHERE usuario_id = (SELECT id FROM usuario WHERE correo = ${LAURA_B})`).rejects.toThrow();
    expect((await lauraB.get("/api/v1/cliente/trabajos")).status).toBe(200);
  });
});
