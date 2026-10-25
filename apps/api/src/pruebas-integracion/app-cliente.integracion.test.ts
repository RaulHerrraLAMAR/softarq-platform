/**
 * La app del cliente contra la API REAL y PostgreSQL (solo softarq_test), con el CÓDIGO de la app (`apps/mobile`): su
 * gestor de sesión, su cliente HTTP, sus servicios y el controlador de la solicitud. No hay respuestas simuladas: lo que
 * se prueba es que la app y la API se entienden de verdad (contratos, errores, revisiones, estimación, envío, PDF).
 *
 * Lo que NO prueba (se verifica en el teléfono): pantallas, teclado, croquis, animaciones, SecureStore, el selector del
 * sistema para abrir el PDF ni la lectura de bytes binarios con el `fetch` de React Native.
 *
 * Complementa las pruebas unitarias de la app (que usan un servidor falso) y `cliente.integracion.test.ts` (que prueba la
 * API con un cliente HTTP genérico).
 */
import type { INestApplication } from "@nestjs/common";
import { EsquemaDetalleCotizacion, EsquemaDetalleRevision } from "@softarq/contracts";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarClientesDemo, type CredencialCliente } from "../modules/cliente/demo/cargar-clientes-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba, vaciarDocumentosPrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
// Código de la app que se ejercita (importaciones sin extensión: así están escritas en la app).
import { esFalloApi, type FalloApi } from "../../../mobile/src/api/errores";
import { agregarRenglon, agregarTrabajo, cambiarNotas, cambiarRenglon } from "../../../mobile/src/captura/modelo";
import { ControladorSolicitud } from "../../../mobile/src/captura/controlador";
import { AlmacenMemoria } from "../../../mobile/src/sesion/almacen";
import { GestorSesion } from "../../../mobile/src/sesion/gestor";
import { crearServicios, type ServiciosCliente } from "../../../mobile/src/servicios/cliente";
import type { TrabajoCliente } from "@softarq/contracts/cliente";

const FECHA = "2026-09-25";
const NUEVA = "contrasena-definitiva-de-prueba-1";
const DIR = directorioDocumentosPrueba("app-cliente");
const R2 = ESCENARIOS.find((e) => e.id === "GUIA-R2-ESPESOR-012")!;
const DOMINIO = "app-a.softarq.test";

const PREP = `prep@${DOMINIO}`;
const REV = `rev@${DOMINIO}`;
const CAT = `cat@${DOMINIO}`;
const SIS = `sis@${DOMINIO}`;
const LAURA = `laura.mendez@${DOMINIO}`;
const HECTOR = `hector.rios@${DOMINIO}`;

const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const cred: Record<string, Credencial> = {};
const temporales: Record<string, string> = {};
const ids: Record<string, string> = {};

const idem = () => ({ cabeceras: { "Idempotency-Key": randomUUID() } });
const web = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("base64");

/** Una «instalación» de la app: gestor de sesión (con almacén en memoria), cliente HTTP y servicios reales. */
function instalarApp() {
  const almacen = new AlmacenMemoria(null);
  const gestor = new GestorSesion({ baseUrl: url, almacen });
  return { gestor, almacen, servicios: crearServicios(gestor.cliente) };
}
type App = ReturnType<typeof instalarApp>;

async function capturar<T>(f: Promise<T>): Promise<FalloApi> {
  try {
    await f;
  } catch (e) {
    if (esFalloApi(e)) return e;
    throw e;
  }
  throw new Error("Se esperaba un fallo de la API y no ocurrió.");
}

async function abrir(a: App, id: string, catalogo: readonly TrabajoCliente[]) {
  // Sin temporizador: el autoguardado se dispara a mano con `guardarAhora()`.
  const c = new ControladorSolicitud({ id, servicios: a.servicios, catalogo, programar: () => () => {} });
  await c.cargar();
  return c;
}

/** La losa de las pruebas de E1 (R2): «Tablero» 6 × 5 × 0.12 y «Volado» 2 × 1.2 × 0.12, escrita con las operaciones de la app. */
function escribirLosa(c: ControladorSolicitud) {
  c.modificar((x) => agregarTrabajo(x, "LOSA", "CONCRETO").captura);
  c.modificar((x) => agregarRenglon(x, "t1", "secciones"));
  const campos: [number, "nombre" | "largo" | "ancho" | "alto", string][] = [
    [0, "nombre", "Tablero"],
    [0, "largo", "6"],
    [0, "ancho", "5"],
    [0, "alto", "0.12"],
    [1, "nombre", "Volado"],
    [1, "largo", "2"],
    [1, "ancho", "1.2"],
    [1, "alto", "0.12"],
  ];
  for (const [i, campo, valor] of campos) c.modificar((x) => cambiarRenglon(x, "t1", "secciones", i, campo, valor));
}

const tiposBitacora = async (entidadId: string): Promise<string[]> =>
  (await migrador.$queryRaw<{ tipo: string }[]>`SELECT tipo FROM bitacora WHERE entidad_id = ${entidadId}::uuid ORDER BY ocurrido_en, id`).map((f) => f.tipo);

beforeAll(async () => {
  vaciarDocumentosPrueba(DIR);
  const orgA = (await cargarDemo(prisma, { codigo: "DEMO-APP-A", nombre: "[DEMO] App cliente A" })).organizacionId;
  await cargarEmisorDemo(prisma, orgA);
  migrador = await prismaMigrador();
  Object.assign(
    cred,
    await crearCuentas(migrador, "DEMO-APP-A", [
      cuenta(PREP, "[DEMO] Preparador App", "PREPARADOR"),
      cuenta(REV, "[DEMO] Revisor App", "REVISOR"),
      cuenta(CAT, "[DEMO] Administrador del catálogo App", "ADMIN_CATALOGO"),
      cuenta(SIS, "[DEMO] Administrador del sistema App", "ADMIN_SISTEMA"),
    ]),
  );
  const a = await cargarClientesDemo(migrador, new ServicioContrasenas(), { organizacion: "DEMO-APP-A", fecha: FECHA, dominioCorreo: DOMINIO });
  for (const c of a.accesosCreados as CredencialCliente[]) temporales[c.correo] = c.contrasena;

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

describe("acceso con el gestor de sesión de la app", () => {
  it("contraseña temporal → cambio obligatorio → acceso con la definitiva; el token solo queda en el almacén", async () => {
    const a = instalarApp();
    await a.gestor.restaurar();
    expect(a.gestor.obtenerEstado().fase).toBe("anonima");
    await a.gestor.iniciarSesion(LAURA, temporales[LAURA]!);
    expect(a.gestor.obtenerEstado()).toMatchObject({ fase: "cambio_contrasena", sesion: { funciones: ["CLIENTE"] } });
    // Con la temporal, la API solo deja cambiar la contraseña: el resto responde 403 y la app lo clasifica.
    const bloqueada = await capturar(a.servicios.solicitudes());
    expect(bloqueada.tipo).toBe("cambio_contrasena");
    await a.gestor.cambiarContrasena(temporales[LAURA]!, NUEVA, NUEVA);
    expect(a.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", aviso: { tipo: "contrasena_cambiada" } });
    expect(await a.almacen.leer()).toBeNull();
    cred[LAURA] = { correo: LAURA, contrasena: NUEVA };

    await a.gestor.iniciarSesion(LAURA, NUEVA);
    const e = a.gestor.obtenerEstado();
    expect(e.fase).toBe("activa");
    expect(e.sesion?.capacidades).toEqual(["sesion.propia", "cliente.solicitudes", "cliente.cotizaciones"]);
    const token = await a.almacen.leer();
    expect(token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(JSON.stringify(e)).not.toContain(token!);

    // Otro cliente activa su cuenta igual (para las pruebas de aislamiento).
    const h = instalarApp();
    await h.gestor.iniciarSesion(HECTOR, temporales[HECTOR]!);
    await h.gestor.cambiarContrasena(temporales[HECTOR]!, NUEVA, NUEVA);
    cred[HECTOR] = { correo: HECTOR, contrasena: NUEVA };
  });

  it("restaurar: una instalación nueva con el token guardado revalida con el servidor y vuelve a estar activa", async () => {
    const a = instalarApp();
    await a.gestor.iniciarSesion(LAURA, NUEVA);
    const token = (await a.almacen.leer())!;
    const b = { almacen: new AlmacenMemoria(token) };
    const gestor = new GestorSesion({ baseUrl: url, almacen: b.almacen });
    await gestor.restaurar();
    expect(gestor.obtenerEstado()).toMatchObject({ fase: "activa", sesion: { usuario: { correo: LAURA } } });
  });

  it("una cuenta del equipo recibe la dirección del panel y no queda ninguna sesión", async () => {
    const a = instalarApp();
    await a.gestor.restaurar(); // la app siempre restaura antes de mostrar el acceso
    const f = await capturar(a.gestor.iniciarSesion(PREP, cred[PREP]!.contrasena));
    expect(f.tipo).toBe("cuenta_interna");
    expect(f.detalle).toMatchObject({ estado: 403, codigo: "CUENTA_INTERNA_USE_PANEL", panelUrl: "http://localhost:5173" });
    expect(a.gestor.obtenerEstado().fase).toBe("anonima");
    expect(await a.almacen.leer()).toBeNull();
  });

  it("contraseña incorrecta: credenciales, sin detalles de la cuenta", async () => {
    const a = instalarApp();
    await a.gestor.restaurar();
    const f = await capturar(a.gestor.iniciarSesion(LAURA, "equivocada-equivocada"));
    expect(f.tipo).toBe("credenciales");
    expect(a.gestor.obtenerEstado().fase).toBe("anonima");
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("recorrido de la solicitud con el controlador de la app", () => {
  let laura: App;
  let catalogo: readonly TrabajoCliente[];
  let ctrl: ControladorSolicitud;

  beforeAll(async () => {
    laura = instalarApp();
    await laura.gestor.iniciarSesion(LAURA, NUEVA);
  });

  it("trabajos, proyectos y borrador: el catálogo del servidor y un proyecto nuevo registrado desde la app", async () => {
    catalogo = await laura.servicios.trabajos();
    expect(catalogo.map((t) => t.codigo).sort()).toEqual(["CUBIERTA", "LOSA", "MURO"]);
    expect(catalogo.find((t) => t.codigo === "LOSA")!.opciones[0]!.medidas.map((m) => m.etiqueta)).toEqual(["Largo", "Ancho", "Espesor"]);
    expect(catalogo.find((t) => t.codigo === "MURO")!.opciones[0]!.admiteHuecos).toBe(true);
    expect(catalogo.find((t) => t.codigo === "LOSA")!.opciones[0]!.admiteHuecos).toBe(false);

    const casa = (await laura.servicios.proyectos()).find((p) => p.nombre === "Casa Tlalpan");
    expect(casa).toBeDefined();
    const nuevo = await laura.servicios.crearProyecto({ nombre: "Obra nueva desde la app", municipio: "Coyoacán", entidadFederativa: "Ciudad de México", descripcion: "Ampliación de una casa habitación" });
    expect(nuevo).toMatchObject({ nombre: "Obra nueva desde la app", municipio: "Coyoacán" });
    expect((await laura.servicios.proyectos()).map((p) => p.id)).toContain(nuevo.id);

    const s = await laura.servicios.crearSolicitud(nuevo.id);
    ids["sol"] = s.id;
    expect(s).toMatchObject({ estado: "BORRADOR", editable: true, revision: 0, proyecto: { nombre: "Obra nueva desde la app" } });
  });

  it("autoguardado: lo escrito se guarda con la revisión vigente y el servidor lo devuelve igual; las medidas mal escritas quedan pendientes", async () => {
    ctrl = await abrir(laura, ids["sol"]!, catalogo);
    escribirLosa(ctrl);
    expect(ctrl.obtenerEstado().guardado).toBe("pendiente");
    expect(await ctrl.guardarAhora()).toBe(true);
    expect(ctrl.obtenerEstado().guardado).toBe("limpio");
    const delServidor = await laura.servicios.solicitud(ids["sol"]!);
    expect(delServidor.revision).toBe(1);
    expect(delServidor.captura.trabajos[0]!.secciones.map((s) => [s.nombre, s.largo, s.ancho, s.alto])).toEqual([
      ["Tablero", "6", "5", "0.12"],
      ["Volado", "2", "1.2", "0.12"],
    ]);
    // Una medida mal escrita no se rechaza: el servidor la recibe como pendiente y el campo conserva lo escrito.
    ctrl.modificar((x) => cambiarRenglon(x, "t1", "secciones", 1, "largo", "abc"));
    expect(await ctrl.guardarAhora()).toBe(true);
    expect((await laura.servicios.solicitud(ids["sol"]!)).captura.trabajos[0]!.secciones[1]!.largo).toBeNull();
    expect(ctrl.obtenerEstado().local.trabajos[0]!.secciones[1]!.largo).toBe("abc");
    ctrl.modificar((x) => cambiarRenglon(x, "t1", "secciones", 1, "largo", "2"));
    expect(await ctrl.guardarAhora()).toBe(true);
  });

  it("estimación: la calcula la API con el motor; coincide con la calculadora del Preparador y la app no la muestra como vigente al cambiar una medida", async () => {
    await ctrl.estimar();
    let e = ctrl.obtenerEstado();
    expect(e.estimacion).toBe("vigente");
    expect(e.datosEstimacion).toMatchObject({ estado: "ESTIMADA", desactualizada: false });
    const p = await web(PREP);
    const directo = await p.post("/api/v1/calculos/demo", {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00008",
          mediciones: [
            { descripcion: "Tablero", signo: "+", piezas: "1", largo: "6", ancho: "5", alto: "0.12" },
            { descripcion: "Volado", signo: "+", piezas: "1", largo: "2", ancho: "1.2", alto: "0.12" },
          ],
        },
      ],
      preciosElegidos: R2.entrada.selecciones.map((x) => x.precioId),
    });
    expect(directo.status, directo.texto).toBe(200);
    expect(e.datosEstimacion?.comercial?.total).toBe(directo.cuerpo.cotizacion.total);
    const totalAntes = e.datosEstimacion!.comercial!.total;
    expect(Number(totalAntes)).toBeGreaterThan(0);

    // Cambia el espesor: la estimación anterior deja de ser vigente de inmediato, sin llamar a la API.
    ctrl.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "alto", "0.15"));
    e = ctrl.obtenerEstado();
    expect(e.estimacion).toBe("desactualizada");
    await ctrl.estimar();
    e = ctrl.obtenerEstado();
    expect(e.estimacion).toBe("vigente");
    expect(Number(e.datosEstimacion!.comercial!.total)).toBeGreaterThan(Number(totalAntes));
    expect(e.datosEstimacion!.numero).toBe(2);
    // Calcular nunca envía.
    expect((await laura.servicios.solicitud(ids["sol"]!)).estado).toBe("BORRADOR");
    expect(await tiposBitacora(ids["sol"]!)).not.toContain("SOLICITUD_ENVIADA");
  });

  it("conflicto: otro dispositivo guarda antes; la app no sobrescribe, ofrece las dos salidas y conservar los cambios es decisión de la persona", async () => {
    const otro = instalarApp();
    await otro.gestor.iniciarSesion(LAURA, NUEVA);
    const ctrlOtro = await abrir(otro, ids["sol"]!, catalogo);
    ctrlOtro.modificar((x) => cambiarNotas(x, "Escrito desde el otro teléfono"));
    expect(await ctrlOtro.guardarAhora()).toBe(true);

    ctrl.modificar((x) => cambiarRenglon(x, "t1", "secciones", 1, "ancho", "1.5"));
    expect(await ctrl.guardarAhora()).toBe(false);
    const e = ctrl.obtenerEstado();
    expect(e.guardado).toBe("conflicto");
    expect(e.conflicto?.captura.notas).toBe("Escrito desde el otro teléfono");
    // El servidor conserva lo del otro dispositivo: nada se sobrescribió.
    expect((await laura.servicios.solicitud(ids["sol"]!)).captura.trabajos[0]!.secciones[1]!.ancho).toBe("1.2");

    expect(await ctrl.conservarMisCambios()).toBe(true);
    const guardado = await laura.servicios.solicitud(ids["sol"]!);
    expect(guardado.captura.trabajos[0]!.secciones[1]!.ancho).toBe("1.5");
    expect(ctrl.obtenerEstado().guardado).toBe("limpio");
    // La app que perdió el choque puede elegir lo guardado: se adopta la versión más reciente.
    ctrlOtro.modificar((x) => cambiarNotas(x, "Otra nota"));
    expect(await ctrlOtro.guardarAhora()).toBe(false);
    ctrlOtro.usarVersionGuardada();
    expect(ctrlOtro.obtenerEstado().local.trabajos[0]!.secciones[1]!.ancho).toBe("1.5");
    expect(ctrlOtro.obtenerEstado().guardado).toBe("limpio");
  });

  it("envío: dos pulsaciones y un reintento posterior producen UN solo envío; después la solicitud es de solo lectura", async () => {
    // Estimación vigente de la captura final antes de enviar.
    await ctrl.estimar();
    expect(ctrl.obtenerEstado().estimacion).toBe("vigente");
    await Promise.all([ctrl.enviar(), ctrl.enviar()]);
    const e = ctrl.obtenerEstado();
    expect(e.envio).toBe("enviada");
    expect(e.soloLectura).toBe(true);
    expect(e.solicitud).toMatchObject({ estado: "ENVIADA", editable: false });
    // Un reintento (por ejemplo, tras perder la respuesta) es idempotente en el servidor.
    const otra = await laura.servicios.enviar(ids["sol"]!, e.solicitud!.revision);
    expect(otra.repetida).toBe(true);
    expect((await tiposBitacora(ids["sol"]!)).filter((t) => t === "SOLICITUD_ENVIADA")).toHaveLength(1);
    // Lo enviado no se edita: ni desde el controlador ni directamente.
    ctrl.modificar((x) => cambiarNotas(x, "no debe guardarse"));
    expect(ctrl.obtenerEstado().guardado).toBe("limpio");
    const f = await capturar(laura.servicios.guardar(ids["sol"]!, e.solicitud!.revision, e.solicitud!.captura));
    expect(f).toMatchObject({ tipo: "conflicto", detalle: { estado: 409, codigo: "SOLICITUD_NO_EDITABLE" } });
    // Está en el listado del cliente.
    const lista = await laura.servicios.solicitudes();
    expect(lista.find((x) => x.id === ids["sol"])).toMatchObject({ estado: "ENVIADA", proyecto: "Obra nueva desde la app", trabajos: ["Losa"] });
  });

  it("sin referencia de precio no hay importe (nunca un cero) y la solicitud se puede enviar igual", async () => {
    const cat = await web(CAT);
    const retiro = await cat.post("/api/v1/admin/referencias-estimacion/INS-00009/retiro", { motivo: "Prueba: falta una referencia" }, idem());
    expect(retiro.status, retiro.texto).toBe(200);
    try {
      const s = await laura.servicios.crearSolicitud((await laura.servicios.proyectos())[0]!.id);
      const c = await abrir(laura, s.id, catalogo);
      escribirLosa(c);
      await c.estimar();
      const e = c.obtenerEstado();
      // Es la respuesta vigente para esta captura, pero sin importe: la app no inventa un total ni lo muestra en cero.
      expect(e.estimacion).toBe("vigente");
      expect(e.datosEstimacion).toMatchObject({ estado: "SIN_ESTIMACION", comercial: null, motivo: { codigo: "FALTA_REFERENCIA" } });
      expect(e.datosEstimacion?.motivo?.mensaje).toContain("El equipo completará la valoración");
      expect(JSON.stringify(e.datosEstimacion)).not.toMatch(/"total"|\b0\.00\b/);
      await c.enviar();
      expect(c.obtenerEstado()).toMatchObject({ envio: "enviada", soloLectura: true });
    } finally {
      // Se restablece la misma referencia (nada se sustituye por otro precio ni por el menor).
      const des = await cat.solicitar("PUT", "/api/v1/admin/referencias-estimacion/INS-00009", { cuerpo: { precioCodigo: "PRE-000014", motivo: "Prueba: se restablece" }, cabeceras: idem().cabeceras });
      expect(des.status, des.texto).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("cotización formal y PDF desde la app", () => {
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

  it("el equipo atiende y emite; la app muestra la solicitud como cotizada, la cotización con la misma proyección comercial y el PDF con los mismos bytes", async () => {
    const p = await web(PREP);
    const r = await web(REV);
    const sol = ids["sol"]!;
    const det = (await p.get(`/api/v1/solicitudes/${sol}`)).cuerpo;
    const at = await p.post(`/api/v1/solicitudes/${sol}/atencion`, { revision: det.revision }, idem());
    expect(at.status, at.texto).toBe(201);
    const cotId = at.cuerpo.cotizacionId as string;
    const borrador = EsquemaDetalleCotizacion.parse((await p.get(`/api/v1/cotizaciones/${cotId}`)).cuerpo);
    const seleccion = R2.entrada.selecciones.map((x) => ({ insumoCodigo: x.insumoId, precioCodigo: x.precioId }));
    const g = await p.put(`/api/v1/cotizaciones/${cotId}/borrador`, { revision: borrador.borrador.revision, captura: { ...borrador.borrador.captura, consolidarCompras: true, seleccion } }, idem());
    expect(g.status, g.texto).toBe(200);
    const e = await emitirDesde(p, r, cotId);
    ids["emision"] = e.emisionId;

    // La app (instalación nueva, como al abrirla de nuevo) ve el avance.
    const laura = instalarApp();
    await laura.gestor.iniciarSesion(LAURA, NUEVA);
    const s = await laura.servicios.solicitud(sol);
    expect(s.estado).toBe("COTIZADA");
    expect(s.cotizacionFormal).toMatchObject({ emisionId: e.emisionId, folio: e.folio, total: e.total, solicitudFolio: s.folio, vigente: true });
    const lista = await laura.servicios.cotizaciones();
    expect(lista.map((c) => c.emisionId)).toContain(e.emisionId);
    const detalle = await laura.servicios.cotizacion(e.emisionId);
    expect(detalle.comercial.total).toBe(e.total);
    expect(detalle.comercial.leyenda).toContain("DEMOSTRACIÓN");
    expect(JSON.stringify(detalle)).not.toMatch(/costoProrrateado|costoCompra|proveedor|margen|recargo|preparo|aprobo|emitio|idVersion/i);

    // PDF: los bytes que baja la app son los mismos que registró la API (huella SHA-256 que ella misma publica).
    const bytes = await laura.servicios.documento(e.emisionId);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const token = (await laura.almacen.leer())!;
    const crudo = await fetch(`${url}/api/v1/cliente/cotizaciones/${e.emisionId}/documento`, { headers: { Authorization: `Bearer ${token}` } });
    expect(crudo.status).toBe(200);
    expect(crudo.headers.get("repr-digest")).toBe(`sha-256=:${sha256(bytes)}:`);
    expect(Buffer.from(await crudo.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
  });

  it("aislamiento: otro cliente, desde su propia app, no ve la solicitud ni la cotización ni su PDF", async () => {
    const h = instalarApp();
    await h.gestor.iniciarSesion(HECTOR, NUEVA);
    expect((await capturar(h.servicios.solicitud(ids["sol"]!))).tipo).toBe("no_encontrado");
    expect((await capturar(h.servicios.cotizacion(ids["emision"]!))).tipo).toBe("no_encontrado");
    expect((await capturar(h.servicios.documento(ids["emision"]!))).tipo).toBe("no_encontrado");
    expect((await h.servicios.cotizaciones()).map((c) => c.emisionId)).not.toContain(ids["emision"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("pérdida de acceso con la app abierta", () => {
  it("al desactivar el acceso desde el panel, la siguiente consulta de la app cierra la sesión local con un aviso y vacía las cachés", async () => {
    const laura = instalarApp();
    await laura.gestor.iniciarSesion(LAURA, NUEVA);
    let limpiado = 0;
    laura.gestor.alPerderSesion(() => limpiado++);
    expect((await laura.servicios.solicitudes()).length).toBeGreaterThan(0);

    const usuario = await migrador.$queryRaw<{ id: string }[]>`SELECT u.id FROM usuario u WHERE u.correo = ${LAURA}`;
    const sis = await web(SIS);
    const baja = await sis.put(`/api/v1/admin/accesos-cliente/${usuario[0]!.id}/estado`, { activo: false, motivo: "Prueba de baja del acceso" }, idem());
    expect(baja.status, baja.texto).toBe(200);

    const f = await capturar(laura.servicios.solicitudes());
    expect(f.tipo).toBe("sesion");
    await new Promise((r) => setTimeout(r, 50));
    expect(laura.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", sesion: null, aviso: { tipo: "vencida" } });
    expect(limpiado).toBeGreaterThan(0);
    expect(await laura.almacen.leer()).toBeNull();
    // Y no puede volver a entrar hasta que el equipo reactive el acceso.
    const nuevo = await capturar(laura.gestor.iniciarSesion(LAURA, NUEVA));
    expect(["credenciales", "sin_permiso", "sesion"]).toContain(nuevo.tipo);
  });
});
