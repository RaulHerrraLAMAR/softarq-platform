/**
 * Catálogo técnico (módulo 12, ADR-0016) por HTTP con sesiones reales contra softarq_test: tipos de
 * estructura, insumos, conversiones, conceptos, componentes y aprobación; conceptos heredados; BL-05
 * de trazabilidad y concepto personalizado hasta la emisión.
 *
 * Fuentes: `modCatalogos.bas` (Val_TipoEst, Val_Insumo, Val_Conversion, Val_Concepto, Val_Componente,
 * Concepto_Problemas, Concepto_Aprobar, Concepto_ABorrador, BTN_ConceptoActivo), `modValidacion.bas`
 * (`Validar`, BL-05) y `tblTiposEstructura`/`tblConceptos` del libro. Decisiones del propietario:
 * conversión editable que devuelve a Borrador, tipos base del libro, heredados sin completar
 * automáticamente y aprobación por cualquier Administrador del catálogo. Cifra esperada de la fuente:
 * 22,405.28 (GUIA-R3-SIN-VENTANA), no del motor.
 */
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EsquemaDetalleConceptoAdmin, EsquemaDetalleRevision, type CapturaBorrador, type DetalleConceptoAdmin, type EntradaCalculo } from "@softarq/contracts";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import type { ClientePrisma } from "../infraestructura/prisma/cliente.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { ESCENARIOS } from "../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { ServicioCatalogoTecnico } from "../modules/catalogos/aplicacion/servicio-catalogo-tecnico.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { TIPOS_ESTRUCTURA_BASE } from "../modules/catalogos/demo/datos-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { directorioDocumentosPrueba, prismaApp, urlDePrueba } from "./entorno.js";
import { ClienteHttp, crearCuentas, cuenta, prismaMigrador, type Credencial } from "./sesiones.js";
import { borradorDesdeEntrada } from "./solicitudes.js";

const HOY = "2026-10-17";
const SV = ESCENARIOS.find((e) => e.id === "GUIA-R3-SIN-VENTANA")!;
const DOCUMENTOS = join(directorioDocumentosPrueba("integracion"), "..", "documentos-catalogo-tecnico");
const MOTIVO = "[DEMO] Ficha técnica nueva del fabricante ficticio.";

const prisma = prismaApp();
let migrador: ClientePrisma;
let app: INestApplication;
let url: string;
const org: Record<string, string> = {};
const cred: Record<string, Credencial> = {};

const entrar = (correo: string) => new ClienteHttp(url).entrar(cred[correo]!);
const admin = (o = "m12") => entrar(`admin.${o}@softarq.test`);
const idem = (clave: string = randomUUID()) => ({ cabeceras: { "Idempotency-Key": clave } });
const sufijo = () => randomUUID().slice(0, 8);
const detalle = (r: { cuerpo: unknown }) => EsquemaDetalleConceptoAdmin.parse(r.cuerpo);

async function concepto(c: ClienteHttp, codigo: string): Promise<DetalleConceptoAdmin> {
  const r = await c.get(`/api/v1/admin/conceptos/${codigo}`);
  expect(r.status, r.texto).toBe(200);
  return detalle(r);
}

const solicitudConcepto = (over: Record<string, unknown> = {}) => ({
  tipoCodigo: "TES-00004",
  descripcion: `[DEMO] Muro de comprobación ${sufijo()}`,
  unidad: "m2",
  tipoFormula: "AREA",
  permiteDescuento: true,
  reglaMedicion: "[DEMO] Área = piezas x largo x alto de cada muro (regla ilustrativa de prueba).",
  clase: "ESTANDAR",
  tarifaCodigo: "TMO-00005",
  ...over,
});
const componente = (over: Record<string, unknown> = {}) => ({
  insumoCodigo: "INS-00010",
  rendimiento: "12.5",
  unidadRendimiento: "pza",
  desperdicio: "0.05",
  factorTraslape: null,
  fuente: "[DEMO] Ficha ficticia de prueba",
  fecha: "2026-09-25",
  responsable: "[DEMO] Responsable técnico ficticio",
  ...over,
});

async function conceptoCreado(c: ClienteHttp, over: Record<string, unknown> = {}): Promise<DetalleConceptoAdmin> {
  const r = await c.post("/api/v1/admin/conceptos", solicitudConcepto(over), idem());
  expect(r.status, r.texto).toBe(201);
  return detalle(r);
}
async function conComponente(c: ClienteHttp, codigo: string, over: Record<string, unknown> = {}): Promise<DetalleConceptoAdmin> {
  const r = await c.post(`/api/v1/admin/conceptos/${codigo}/componentes`, componente(over), idem());
  expect(r.status, r.texto).toBe(201);
  return detalle(r);
}
const aprobar = (c: ClienteHttp, codigo: string, revisionTecnica: number, clave?: string) =>
  c.post(`/api/v1/admin/conceptos/${codigo}/aprobacion`, { revisionTecnica }, idem(clave));

async function intentarCotizacion(c: ClienteHttp, captura: CapturaBorrador) {
  const s = sufijo();
  const cli = await c.post("/api/v1/clientes", { nombre: `[DEMO] Cliente M12 ${s}`, contactoNombre: "Contacto", contactoTelefono: "55 1234 5678" }, idem());
  const pry = await c.post("/api/v1/proyectos", { clienteId: cli.cuerpo.id, nombre: `[DEMO] Obra M12 ${s}`, municipio: "Mérida", entidadFederativa: "Yucatán", descripcion: "Muro." }, idem());
  return c.post("/api/v1/cotizaciones", { proyectoId: pry.cuerpo.id, captura }, idem());
}
async function cotizacion(c: ClienteHttp, captura: CapturaBorrador) {
  const cot = await intentarCotizacion(c, captura);
  expect(cot.status, cot.texto).toBe(201);
  return cot.cuerpo.cotizacion.id as string;
}
/** Un concepto en Borrador deja de ofrecerse para partidas nuevas (regla vigente del cotizador). */
async function noSeOfrece(c: ClienteHttp, captura: CapturaBorrador, codigo: string) {
  const r = await intentarCotizacion(c, captura);
  expect(r.status, r.texto).toBe(422);
  expect(r.cuerpo.error.codigo).toBe("REFERENCIA_NO_DISPONIBLE");
  expect(r.cuerpo.error.campos[0].mensaje).toContain(codigo);
}
const version = (c: ClienteHttp, id: string, revisionBorrador: number) => c.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador }, idem());

/** Captura de un muro (26.46 m², la del ejemplo 3) con el concepto indicado. */
const capturaMuro = (conceptoCodigo: string, excepciones: CapturaBorrador["excepciones"] = []): CapturaBorrador => ({
  ...borradorDesdeEntrada(SV.entrada as EntradaCalculo),
  partidas: borradorDesdeEntrada(SV.entrada as EntradaCalculo).partidas.map((p) => (p.tipo === "CONCEPTO" ? { ...p, conceptoCodigo } : p)),
  excepciones,
});

const estadoEnBase = async (o: string, codigo: string) =>
  (await migrador.$queryRaw<{ estado: string; heredado: boolean; revision_tecnica: number; aprobado_por: string | null; aprobado_en: Date | null }[]>`
    SELECT estado, heredado, revision_tecnica, aprobado_por::text, aprobado_en FROM concepto WHERE organizacion_id = ${o}::uuid AND codigo = ${codigo}`)[0]!;

/**
 * Simula el estado que la migración deja en los conceptos que ya existían (sin tipo ni regla,
 * `heredado`): el propietario desactiva el disparador solo para preparar la fila de prueba.
 */
async function comoHeredado(o: string, codigo: string): Promise<void> {
  await migrador.$transaction([
    migrador.$executeRaw`ALTER TABLE concepto DISABLE TRIGGER concepto_proteger_trg`,
    migrador.$executeRaw`UPDATE concepto SET heredado = true, tipo_id = NULL, regla_medicion = NULL, criterios = NULL, aprobado_en = NULL
                          WHERE organizacion_id = ${o}::uuid AND codigo = ${codigo}`,
    migrador.$executeRaw`ALTER TABLE concepto ENABLE TRIGGER concepto_proteger_trg`,
  ]);
}

beforeAll(async () => {
  for (const [clave, codigo] of [
    ["m12", "DEMO-M12"],
    ["cnv", "DEMO-M12-CNV"],
    ["her", "DEMO-M12-HER"],
    ["b", "DEMO-M12-B"],
  ] as const) {
    org[clave] = (await cargarDemo(prisma, { codigo, nombre: `[DEMO] Módulo 12 ${clave}` })).organizacionId;
  }
  migrador = await prismaMigrador();
  for (const [clave, codigo] of [
    ["m12", "DEMO-M12"],
    ["cnv", "DEMO-M12-CNV"],
    ["her", "DEMO-M12-HER"],
    ["b", "DEMO-M12-B"],
  ] as const) {
    Object.assign(
      cred,
      await crearCuentas(migrador, codigo, [
        cuenta(`admin.${clave}@softarq.test`, `[DEMO] Administradora del catálogo ${clave}`, "ADMIN_CATALOGO"),
        cuenta(`admin2.${clave}@softarq.test`, `[DEMO] Segundo administrador ${clave}`, "ADMIN_CATALOGO"),
        cuenta(`prep.${clave}@softarq.test`, `[DEMO] Preparador ${clave}`, "PREPARADOR"),
        cuenta(`rev.${clave}@softarq.test`, `[DEMO] Revisora ${clave}`, "REVISOR"),
      ]),
    );
  }
  await cargarEmisorDemo(prisma, org["m12"]!);
  app = await crearAplicacion(
    leerConfiguracion({ DATABASE_URL: urlDePrueba("DATABASE_URL"), API_REGISTRO: "ninguno", API_LIMITE_GENERAL_POR_MINUTO: "5000", SOFTARQ_DIR_DOCUMENTOS: DOCUMENTOS }),
    { reloj: new RelojFijo(HOY) },
  );
  await app.listen(0, "127.0.0.1");
  url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await migrador?.$disconnect();
  await prisma.$disconnect();
});

describe("tipos de estructura (tblTiposEstructura, datos base del libro)", () => {
  it("la carga crea los seis genéricos con sus códigos y familias; repetirla no los duplica ni sobrescribe ediciones", async () => {
    const a = await admin();
    const r = await a.get("/api/v1/admin/tipos-estructura?incluirInactivos=true");
    expect(r.status, r.texto).toBe(200);
    expect(r.cuerpo.tipos.map((t: { codigo: string; familia: string; nombre: string }) => [t.codigo, t.familia, t.nombre])).toEqual(
      TIPOS_ESTRUCTURA_BASE.map((t) => [t.codigo, t.familia, t.nombre]),
    );
    const t3 = (await a.get("/api/v1/admin/tipos-estructura/TES-00003")).cuerpo.tipo;
    const editado = await a.patch("/api/v1/admin/tipos-estructura/TES-00003", { revision: t3.revision, nombre: "Genérico - Acero estructural (editado)" });
    expect(editado.status, editado.texto).toBe(200);
    const resumen = await cargarDemo(prisma, { codigo: "DEMO-M12", nombre: "[DEMO] Módulo 12 m12" });
    expect(resumen.creados["tipoEstructura"]).toBeUndefined();
    expect(resumen.creados["concepto"]).toBeUndefined();
    expect((await a.get("/api/v1/admin/tipos-estructura/TES-00003")).cuerpo.tipo.nombre).toBe("Genérico - Acero estructural (editado)");
  });

  it("alta con código TES consecutivo, duplicado normalizado en la familia rechazado; el mismo nombre en otra familia se admite", async () => {
    const a = await admin();
    const n = `Muros de contención ${sufijo()}`;
    const r = await a.post("/api/v1/admin/tipos-estructura", { familia: "Mampostería reforzada", nombre: n }, idem());
    expect(r.status, r.texto).toBe(201);
    expect(r.cuerpo.codigo).toMatch(/^TES-\d{5}$/);
    expect(r.cuerpo.codigo > "TES-00006").toBe(true);
    const dup = await a.post("/api/v1/admin/tipos-estructura", { familia: "Mampostería reforzada", nombre: ` ${n.toUpperCase().replace("O", "Ó")}.` }, idem());
    expect(dup.status, dup.texto).toBe(409);
    expect(dup.cuerpo.error.codigo).toBe("DUPLICADO");
    expect(dup.cuerpo.error.registroVigente.codigo).toBe(r.cuerpo.codigo);
    expect((await a.post("/api/v1/admin/tipos-estructura", { familia: "Cimentaciones", nombre: n }, idem())).status).toBe(201);
    expect((await a.post("/api/v1/admin/tipos-estructura", { familia: "Inventada", nombre: "x" }, idem())).status).toBe(400);
  });

  it("con conceptos, la familia no cambia (API y PostgreSQL); sin conceptos sí; desactivar conserva sus conceptos", async () => {
    const a = await admin();
    const t4 = (await a.get("/api/v1/admin/tipos-estructura/TES-00004")).cuerpo.tipo;
    expect(t4.conceptos).toBeGreaterThan(0);
    const bloqueado = await a.patch("/api/v1/admin/tipos-estructura/TES-00004", { revision: t4.revision, familia: "Cimentaciones" });
    expect(bloqueado.status, bloqueado.texto).toBe(422);
    expect(bloqueado.cuerpo.error.codigo).toBe("TIPO_CON_CONCEPTOS");
    await expect(prisma.$executeRaw`UPDATE tipo_estructura SET familia = 'Cimentaciones' WHERE organizacion_id = ${org["m12"]}::uuid AND codigo = 'TES-00004'`).rejects.toThrow(
      /TIPO_CON_CONCEPTOS/,
    );
    const nuevo = (await a.post("/api/v1/admin/tipos-estructura", { familia: "Cimentaciones", nombre: `Zapatas ${sufijo()}` }, idem())).cuerpo;
    const movido = await a.patch(`/api/v1/admin/tipos-estructura/${nuevo.codigo}`, { revision: nuevo.revision, familia: "Concreto reforzado" });
    expect(movido.status, movido.texto).toBe(200);
    expect(movido.cuerpo.familia).toBe("Concreto reforzado");
  });

  it("un tipo inactivo no se ofrece para conceptos nuevos ni para reclasificar, impide aprobar y no bloquea el cálculo", async () => {
    const a = await admin("cnv");
    const t = (await a.post("/api/v1/admin/tipos-estructura", { familia: "Mampostería reforzada", nombre: `Tipo a desactivar ${sufijo()}` }, idem())).cuerpo;
    const c = await conceptoCreado(a, { tipoCodigo: t.codigo });
    const d = await conComponente(a, c.concepto.codigo);
    const off = await a.patch(`/api/v1/admin/tipos-estructura/${t.codigo}`, { revision: t.revision, activo: false });
    expect(off.status, off.texto).toBe(200);
    const listado = (await a.get("/api/v1/admin/tipos-estructura")).cuerpo.tipos.map((x: { codigo: string }) => x.codigo);
    expect(listado).not.toContain(t.codigo);
    const alta = await a.post("/api/v1/admin/conceptos", solicitudConcepto({ tipoCodigo: t.codigo }), idem());
    expect(alta.status, alta.texto).toBe(422);
    expect(alta.cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    const otro = await conceptoCreado(a);
    const reclasificar = await a.patch(`/api/v1/admin/conceptos/${otro.concepto.codigo}`, { revision: otro.concepto.revision, tipoCodigo: t.codigo });
    expect(reclasificar.status).toBe(422);
    const vista = await concepto(a, c.concepto.codigo);
    expect(vista.concepto.tipo).toMatchObject({ codigo: t.codigo, activo: false });
    expect(vista.requisitos.map((x) => x.codigo)).toEqual(["TIPO_INACTIVO"]);
    const intento = await aprobar(a, c.concepto.codigo, d.concepto.revisionTecnica);
    expect(intento.status).toBe(422);
    expect(intento.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toEqual(["TIPO_INACTIVO"]);
    // El cálculo no depende del tipo: CON-00009 (TES-00004 activo) y el concepto conservan su tipo.
    expect((await prisma.concepto.findFirstOrThrow({ where: { organizacionId: org["cnv"]!, codigo: c.concepto.codigo }, select: { tipoId: true } })).tipoId).not.toBeNull();
  });
});

describe("insumos y conversiones (Val_Insumo, Val_Conversion)", () => {
  it("alta con código INS, duplicado normalizado rechazado; la unidad base cambia sin referencias y no con ellas (API y PostgreSQL)", async () => {
    const a = await admin();
    const desc = `[DEMO] Malla electrosoldada ${sufijo()}`;
    const r = await a.post("/api/v1/admin/insumos", { descripcion: desc, especificacion: "[DEMO] 6x6-10/10 ilustrativa", unidadBase: "m2" }, idem());
    expect(r.status, r.texto).toBe(201);
    expect(r.cuerpo).toMatchObject({ codigo: expect.stringMatching(/^INS-\d{5}$/), unidadBase: "m2", referencias: { productos: 0, conversiones: 0, componentes: 0 } });
    const dup = await a.post("/api/v1/admin/insumos", { descripcion: `  ${desc.toLowerCase()}. `, unidadBase: "kg" }, idem());
    expect(dup.status).toBe(409);
    expect(dup.cuerpo.error.registroVigente.codigo).toBe(r.cuerpo.codigo);
    const cambio = await a.patch(`/api/v1/admin/insumos/${r.cuerpo.codigo}`, { revision: r.cuerpo.revision, unidadBase: "kg" });
    expect(cambio.status, cambio.texto).toBe(200);
    const i6 = (await a.get("/api/v1/admin/insumos/INS-00006")).cuerpo.insumo;
    expect(i6.referencias.conversiones).toBe(1);
    const bloqueado = await a.patch("/api/v1/admin/insumos/INS-00006", { revision: i6.revision, unidadBase: "m" });
    expect(bloqueado.status).toBe(422);
    expect(bloqueado.cuerpo.error.codigo).toBe("INSUMO_CON_REFERENCIAS");
    await expect(prisma.$executeRaw`UPDATE insumo SET unidad_base = 'm' WHERE organizacion_id = ${org["m12"]}::uuid AND codigo = 'INS-00006'`).rejects.toThrow(/INSUMO_CON_REFERENCIAS/);
  });

  it("conversión: origen igual a la base, factor no positivo o con más de 10 decimales y duplicado se rechazan; el destino es la base", async () => {
    const a = await admin();
    const i = (await a.post("/api/v1/admin/insumos", { descripcion: `[DEMO] Cable de prueba ${sufijo()}`, unidadBase: "kg" }, idem())).cuerpo;
    const ruta = `/api/v1/admin/insumos/${i.codigo}/conversiones`;
    expect((await a.post(ruta, { unidadOrigen: "kg", factor: "1", fuente: "[DEMO] x" }, idem())).status).toBe(422);
    expect((await a.post(ruta, { unidadOrigen: "m", factor: "0", fuente: "[DEMO] x" }, idem())).status).toBe(400);
    expect((await a.post(ruta, { unidadOrigen: "m", factor: "0.12345678901", fuente: "[DEMO] x" }, idem())).status).toBe(400);
    expect((await a.post(ruta, { unidadOrigen: "m", factor: 0.5, fuente: "[DEMO] x" }, idem())).status).toBe(400);
    const ok = await a.post(ruta, { unidadOrigen: "m", factor: "0.1234567891", fuente: "[DEMO] Ficha ficticia" }, idem());
    expect(ok.status, ok.texto).toBe(201);
    expect(ok.cuerpo.conversiones).toEqual([expect.objectContaining({ unidadOrigen: "m", unidadDestino: "kg", factor: "0.1234567891" })]);
    const dup = await a.post(ruta, { unidadOrigen: "m", factor: "2", fuente: "[DEMO] y" }, idem());
    expect(dup.status).toBe(409);
    expect(dup.cuerpo.error.codigo).toBe("DUPLICADO");
    await expect(
      prisma.$executeRaw`UPDATE conversion SET unidad_origen = 'pza' WHERE organizacion_id = ${org["m12"]}::uuid AND insumo_id = (SELECT id FROM insumo WHERE organizacion_id = ${org["m12"]}::uuid AND codigo = ${i.codigo})`,
    ).rejects.toThrow();
  });

  it("editar el factor (decisión 1): antes se ven los conceptos afectados; los aprobados vuelven a Borrador con bitácora; la versión no cambia", async () => {
    const a = await admin("cnv");
    const p = await entrar("prep.cnv@softarq.test");
    // Versión con CON-00007 (larguero en m convertido a kg) antes del cambio.
    const capturaCubierta: CapturaBorrador = {
      consolidarCompras: true,
      partidas: [
        { tipo: "CONCEPTO", conceptoCodigo: "CON-00007", descripcion: "", mediciones: [{ descripcion: "Faldón", signo: "+", piezas: "1", largo: "10", ancho: "6", alto: null, segundaMedida: "ancho" }] },
      ],
      seleccion: [
        { insumoCodigo: "INS-00004", precioCodigo: "PRE-000007" },
        { insumoCodigo: "INS-00005", precioCodigo: "PRE-000008" },
        { insumoCodigo: "INS-00006", precioCodigo: "PRE-000009" },
      ],
      excepciones: [],
    };
    const id = await cotizacion(p, capturaCubierta);
    const v1 = await version(p, id, 0);
    expect(v1.status, v1.texto).toBe(201);
    const filaAntes = (await migrador.$queryRaw<{ f: unknown }[]>`SELECT to_jsonb(v) AS f FROM cotizacion_version v WHERE cotizacion_id = ${id}::uuid`)[0]!.f;

    const det = (await a.get("/api/v1/admin/insumos/INS-00006")).cuerpo;
    const cnv = det.conversiones.find((x: { unidadOrigen: string }) => x.unidadOrigen === "m");
    expect(cnv.conceptos).toEqual([expect.objectContaining({ codigo: "CON-00007", estado: "Aprobado" })]);
    const antes = await estadoEnBase(org["cnv"]!, "CON-00007");
    const sinMotivo = await a.patch("/api/v1/admin/insumos/INS-00006/conversiones/m", { revision: cnv.revision, factor: "4.3" });
    expect(sinMotivo.status).toBe(400);
    const r = await a.patch("/api/v1/admin/insumos/INS-00006/conversiones/m", { revision: cnv.revision, factor: "4.3", motivo: MOTIVO });
    expect(r.status, r.texto).toBe(200);
    const despues = await estadoEnBase(org["cnv"]!, "CON-00007");
    expect(despues).toMatchObject({ estado: "Borrador", aprobado_por: null, aprobado_en: null });
    expect(despues.revision_tecnica).toBe(antes.revision_tecnica + 1);
    const hist = (await concepto(a, "CON-00007")).historial;
    expect(hist[0]).toMatchObject({ tipo: "CONCEPTO_A_BORRADOR" });
    expect(String(hist[0]!.detalle["motivo"])).toContain(MOTIVO);
    // Conflicto de revisión: lo escrito no se aplica y se devuelve la conversión vigente.
    const viejo = await a.patch("/api/v1/admin/insumos/INS-00006/conversiones/m", { revision: cnv.revision, factor: "9", motivo: MOTIVO });
    expect(viejo.status).toBe(409);
    expect(viejo.cuerpo.error.registroVigente.factor).toBe("4.3");
    // La versión calculada no cambia; la verificación detecta el cambio de catálogo.
    const filaDespues = (await migrador.$queryRaw<{ f: unknown }[]>`SELECT to_jsonb(v) AS f FROM cotizacion_version v WHERE cotizacion_id = ${id}::uuid`)[0]!.f;
    expect(filaDespues).toEqual(filaAntes);
    const verif = await p.get(`/api/v1/cotizaciones/${id}/versiones/1/verificacion`);
    expect(verif.cuerpo.bloqueos.map((b: { codigo: string }) => b.codigo)).toEqual(expect.arrayContaining(["BL-04"]));
    // En Borrador deja de ofrecerse para cotizaciones nuevas; el borrador existente lo conserva y
    // el cálculo lo bloquea por BL-04.
    await noSeOfrece(p, capturaCubierta, "CON-00007");
    const recalculo = await p.post(`/api/v1/cotizaciones/${id}/versiones`, { revisionBorrador: 0, motivo: "Recalcular tras el cambio de factor." }, idem());
    expect(recalculo.status).toBe(422);
    expect(recalculo.cuerpo.error.problemas.map((x: { codigo: string }) => x.codigo)).toContain("BL-04");
  });
});

describe("conceptos y componentes (Val_Concepto, Val_Componente)", () => {
  it("validaciones: unidad acorde a la fórmula, regla obligatoria, tarifa de la misma unidad y descripción única dentro del tipo", async () => {
    const a = await admin();
    const formula = await a.post("/api/v1/admin/conceptos", solicitudConcepto({ unidad: "m3" }), idem());
    expect(formula.status).toBe(422);
    expect(formula.cuerpo.error.campos[0].ruta).toBe("unidad");
    expect((await a.post("/api/v1/admin/conceptos", solicitudConcepto({ reglaMedicion: "  " }), idem())).status).toBe(400);
    const tarifa = await a.post("/api/v1/admin/conceptos", solicitudConcepto({ tarifaCodigo: "TMO-00004" }), idem());
    expect(tarifa.status).toBe(422);
    expect(tarifa.cuerpo.error.codigo).toBe("UNIDAD_INCOMPATIBLE");
    const desc = `[DEMO] Muro único ${sufijo()}`;
    const c = await conceptoCreado(a, { descripcion: desc });
    expect(c.concepto).toMatchObject({ estado: "Borrador", heredado: false, tipo: { codigo: "TES-00004" } });
    const dup = await a.post("/api/v1/admin/conceptos", solicitudConcepto({ descripcion: desc.toUpperCase() }), idem());
    expect(dup.status).toBe(409);
    expect(dup.cuerpo.error.registroVigente.codigo).toBe(c.concepto.codigo);
    expect((await a.post("/api/v1/admin/conceptos", solicitudConcepto({ descripcion: desc, tipoCodigo: "TES-00002" }), idem())).status).toBe(201);
    // La API no acepta datos de aprobación, marca de heredado ni organización desde el navegador.
    for (const extra of [{ estado: "Aprobado" }, { heredado: true }, { organizacionId: org["b"] }]) {
      expect((await a.post("/api/v1/admin/conceptos", solicitudConcepto(extra), idem())).status).toBe(400);
    }
  });

  it("aprobación por el propio creador con la lista completa del servidor; trazabilidad y conversión son requisitos; 409 si la revisión técnica cambió", async () => {
    const a = await admin();
    const c = await conceptoCreado(a);
    const codigo = c.concepto.codigo;
    expect(c.requisitos.map((x) => x.codigo)).toEqual(["SIN_COMPONENTES"]);
    // Componente sin trazabilidad: se guarda (como el libro) pero no permite aprobar.
    const sinTraza = await conComponente(a, codigo, { fuente: null, fecha: null, responsable: null });
    expect(sinTraza.componentes[0]).toMatchObject({ trazable: false, convertibilidad: { estado: "BASE", factor: null } });
    expect(sinTraza.requisitos.map((x) => x.codigo)).toEqual(["COMPONENTE_SIN_FUENTE", "COMPONENTE_SIN_FECHA", "COMPONENTE_SIN_RESPONSABLE"]);
    const incompleto = await aprobar(a, codigo, sinTraza.concepto.revisionTecnica);
    expect(incompleto.status).toBe(422);
    expect(incompleto.cuerpo.error.codigo).toBe("REQUISITOS_INCOMPLETOS");
    // Varilla medida en m (con conversión) y mortero en pza (sin conversión a kg).
    const varilla = await conComponente(a, codigo, { insumoCodigo: "INS-00008", rendimiento: "3.2", unidadRendimiento: "m" });
    expect(varilla.componentes.find((k) => k.insumo.codigo === "INS-00008")!.convertibilidad).toEqual({ estado: "CONVERSION", factor: "0.56" });
    const mortero = await conComponente(a, codigo, { insumoCodigo: "INS-00011", unidadRendimiento: "pza" });
    expect(mortero.requisitos.map((x) => x.codigo)).toContain("COMPONENTE_SIN_CONVERSION");
    const cmpBlock = mortero.componentes.find((k) => k.insumo.codigo === "INS-00010")!;
    const cmpMortero = mortero.componentes.find((k) => k.insumo.codigo === "INS-00011")!;
    await a.patch(`/api/v1/admin/conceptos/${codigo}/componentes/${cmpBlock.codigo}`, { revision: cmpBlock.revision, ...componente({ insumoCodigo: undefined }) });
    const completo = detalle(await a.patch(`/api/v1/admin/conceptos/${codigo}/componentes/${cmpMortero.codigo}`, { revision: cmpMortero.revision, unidadRendimiento: "kg", rendimiento: "27" }));
    expect(completo.requisitos).toEqual([]);
    expect(completo.componentes.map((k) => k.orden)).toEqual([1, 2, 3]);
    // Revisión técnica anterior: 409 con el contenido vigente, sin aprobar.
    const viejo = await aprobar(a, codigo, sinTraza.concepto.revisionTecnica);
    expect(viejo.status).toBe(409);
    expect(viejo.cuerpo.error.codigo).toBe("CONFLICTO_APROBACION");
    expect(viejo.cuerpo.error.registroVigente.concepto.revisionTecnica).toBe(completo.concepto.revisionTecnica);
    const clave = randomUUID();
    const ok = await aprobar(a, codigo, completo.concepto.revisionTecnica, clave);
    expect(ok.status, ok.texto).toBe(200);
    const aprobado = detalle(ok);
    expect(aprobado.concepto).toMatchObject({ estado: "Aprobado", aprobadoPor: "[DEMO] Administradora del catálogo m12" });
    expect(aprobado.creadoPor).toBe("[DEMO] Administradora del catálogo m12");
    expect(aprobado.cambioTecnicoPor).toBe("[DEMO] Administradora del catálogo m12");
    expect(aprobado.historial[0]).toMatchObject({ tipo: "CONCEPTO_APROBADO", detalle: { revisionTecnica: completo.concepto.revisionTecnica } });
    // Doble clic: reproduce sin aprobar dos veces.
    const repetido = await aprobar(a, codigo, completo.concepto.revisionTecnica, clave);
    expect(repetido.status).toBe(200);
    expect(repetido.headers.get("idempotent-replayed")).toBe("true");
    expect((await concepto(a, codigo)).historial.filter((e) => e.tipo === "CONCEPTO_APROBADO")).toHaveLength(1);
    // Ya aprobado: otra aprobación responde 409.
    expect((await aprobar(await admin(), codigo, completo.concepto.revisionTecnica)).status).toBe(409);
  });

  it("un cambio técnico retira la aprobación; asignar tarifa y desactivar la conservan; reactivar vuelve a Borrador", async () => {
    const a = await admin();
    const c = await conComponente(a, (await conceptoCreado(a)).concepto.codigo);
    const codigo = c.concepto.codigo;
    expect((await aprobar(a, codigo, c.concepto.revisionTecnica)).status).toBe(200);
    // Tarifa compatible (excepción del módulo 11): conserva la aprobación.
    const nuevaTarifa = await a.post(
      "/api/v1/admin/tarifas",
      { modalidad: "UNIDAD", descripcion: `[DEMO] MO muro ${sufijo()}`, unidad: "m2", importe: "220", rendimientoJornada: null, proveedorCodigo: null, vigenteDesde: "2026-09-01", vigenteHasta: "2027-09-30", fuente: "[DEMO] prueba" },
      idem(),
    );
    const asignada = await a.post(`/api/v1/admin/conceptos/${codigo}/tarifa`, { tarifaActual: "TMO-00005", tarifaNueva: nuevaTarifa.cuerpo.codigo, motivo: MOTIVO }, idem());
    expect(asignada.status, asignada.texto).toBe(200);
    let v = await concepto(a, codigo);
    expect(v.concepto.estado).toBe("Aprobado");
    // Desactivar conserva; reactivar devuelve a Borrador (BTN_ConceptoActivo).
    v = detalle(await a.patch(`/api/v1/admin/conceptos/${codigo}`, { revision: v.concepto.revision, activo: false }));
    expect(v.concepto).toMatchObject({ activo: false, estado: "Aprobado" });
    v = detalle(await a.patch(`/api/v1/admin/conceptos/${codigo}`, { revision: v.concepto.revision, activo: true }));
    expect(v.concepto).toMatchObject({ activo: true, estado: "Borrador", aprobadoPor: null });
    expect((await aprobar(a, codigo, v.concepto.revisionTecnica)).status).toBe(200);
    v = await concepto(a, codigo);
    // Regla de medición: técnica; vuelve a Borrador con la bitácora de la aprobación anterior.
    const editado = await a.patch(`/api/v1/admin/conceptos/${codigo}`, { revision: v.concepto.revision, reglaMedicion: "[DEMO] Regla corregida (prueba)." });
    expect(editado.status, editado.texto).toBe(200);
    const d = detalle(editado);
    expect(d.concepto).toMatchObject({ estado: "Borrador", aprobadoPor: null, aprobadoEn: null });
    expect(d.concepto.revisionTecnica).toBeGreaterThan(v.concepto.revisionTecnica);
    expect(d.historial.map((e) => e.tipo)).toEqual(expect.arrayContaining(["CONCEPTO_A_BORRADOR", "CONCEPTO_EDITADO"]));
    // Un componente desactivado también es un cambio técnico (Concepto_ABorrador).
    expect((await aprobar(a, codigo, d.concepto.revisionTecnica)).status).toBe(200);
    const k = (await concepto(a, codigo)).componentes[0]!;
    const off = detalle(await a.patch(`/api/v1/admin/conceptos/${codigo}/componentes/${k.codigo}`, { revision: k.revision, activo: false }));
    expect(off.concepto.estado).toBe("Borrador");
    expect(off.requisitos.map((x) => x.codigo)).toEqual(["SIN_COMPONENTES"]);
  });

  it("duplicado de insumo en el concepto, insumo inactivo y rangos de rendimiento, desperdicio y traslape", async () => {
    const a = await admin();
    const codigo = (await conComponente(a, (await conceptoCreado(a)).concepto.codigo)).concepto.codigo;
    const ruta = `/api/v1/admin/conceptos/${codigo}/componentes`;
    const dup = await a.post(ruta, componente(), idem());
    expect(dup.status).toBe(409);
    expect(dup.cuerpo.error.codigo).toBe("DUPLICADO");
    for (const malo of [{ rendimiento: "0" }, { desperdicio: "1" }, { desperdicio: "-0.1" }, { factorTraslape: "-1" }, { desperdicio: "0.1234567" }, { fecha: "2026-02-30" }]) {
      expect((await a.post(ruta, componente({ insumoCodigo: "INS-00001", ...malo }), idem())).status, JSON.stringify(malo)).toBe(400);
    }
    const ins = (await a.post("/api/v1/admin/insumos", { descripcion: `[DEMO] Inactivo ${sufijo()}`, unidadBase: "pza" }, idem())).cuerpo;
    await a.patch(`/api/v1/admin/insumos/${ins.codigo}`, { revision: ins.revision, activo: false });
    const inactivo = await a.post(ruta, componente({ insumoCodigo: ins.codigo }), idem());
    expect(inactivo.status).toBe(422);
    expect(inactivo.cuerpo.error.codigo).toBe("REGISTRO_INACTIVO");
    const traslape = await a.post(ruta, componente({ insumoCodigo: "INS-00001", desperdicio: "0", factorTraslape: "0" }), idem());
    expect(traslape.status, traslape.texto).toBe(201);
    expect(detalle(traslape).componentes.find((k) => k.insumo.codigo === "INS-00001")).toMatchObject({ desperdicio: "0", factorTraslape: "0" });
  });

  it("concurrencia: dos aprobaciones a la vez dejan una sola; editar mientras se aprueba nunca deja aprobado un contenido no revisado", async () => {
    const a = await admin();
    const b = await entrar("admin2.m12@softarq.test");
    const c = await conComponente(a, (await conceptoCreado(a)).concepto.codigo);
    const codigo = c.concepto.codigo;
    const [r1, r2] = await Promise.all([aprobar(a, codigo, c.concepto.revisionTecnica), aprobar(b, codigo, c.concepto.revisionTecnica)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await concepto(a, codigo)).historial.filter((e) => e.tipo === "CONCEPTO_APROBADO")).toHaveLength(1);

    const c2 = await conComponente(a, (await conceptoCreado(a)).concepto.codigo);
    const k = c2.componentes[0]!;
    await Promise.all([
      aprobar(b, c2.concepto.codigo, c2.concepto.revisionTecnica),
      a.patch(`/api/v1/admin/conceptos/${c2.concepto.codigo}/componentes/${k.codigo}`, { revision: k.revision, rendimiento: "13" }),
    ]);
    // En cualquier orden el concepto termina en Borrador: o la edición llegó después y retiró la
    // aprobación, o llegó antes y la aprobación de la revisión vieja respondió 409.
    expect((await estadoEnBase(org["m12"]!, c2.concepto.codigo)).estado).toBe("Borrador");
  });

  it("pérdida de la función durante la sesión: 403 sin escribir; otra organización responde 404", async () => {
    const a = await admin();
    const usuario = await migrador.usuario.findUniqueOrThrow({ where: { correo: "admin2.m12@softarq.test" } });
    const c = await conComponente(a, (await conceptoCreado(a)).concepto.codigo);
    const b = await entrar("admin2.m12@softarq.test");
    await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['PREPARADOR']::varchar[] WHERE usuario_id = ${usuario.id}::uuid AND organizacion_id = ${org["m12"]}::uuid`;
    try {
      const r = await aprobar(b, c.concepto.codigo, c.concepto.revisionTecnica);
      expect(r.status).toBe(403);
      const servicio = new ServicioCatalogoTecnico(prisma, new RelojFijo(HOY), { ahora: () => new Date() });
      await expect(
        servicio.aprobarConcepto({ organizacionId: org["m12"]! }, { usuarioId: usuario.id }, c.concepto.codigo, { revisionTecnica: c.concepto.revisionTecnica }, randomUUID()),
      ).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
      expect((await estadoEnBase(org["m12"]!, c.concepto.codigo)).estado).toBe("Borrador");
    } finally {
      await migrador.$executeRaw`UPDATE membresia SET funciones = ARRAY['ADMIN_CATALOGO']::varchar[] WHERE usuario_id = ${usuario.id}::uuid AND organizacion_id = ${org["m12"]}::uuid`;
    }
    const ajeno = await admin("b");
    expect((await ajeno.get(`/api/v1/admin/conceptos/${c.concepto.codigo}`)).status).toBe(404);
    expect((await aprobar(ajeno, c.concepto.codigo, c.concepto.revisionTecnica)).status).toBe(404);
  });
});

describe("PostgreSQL impone las reglas aunque se escriba con SQL directo (rol de la aplicación)", () => {
  it("no se aprueba sin la operación, no se marca ni desmarca heredado, y un alta empieza en Borrador", async () => {
    const o = org["m12"]!;
    await expect(prisma.$executeRaw`UPDATE concepto SET estado = 'Aprobado', aprobado_en = now() WHERE organizacion_id = ${o}::uuid AND estado = 'Borrador'`).rejects.toThrow(
      /APROBACION_DIRECTA/,
    );
    await expect(prisma.$executeRaw`UPDATE concepto SET heredado = true WHERE organizacion_id = ${o}::uuid AND codigo = 'CON-00001'`).rejects.toThrow(/permission denied|permiso denegado/i);
    await expect(prisma.$executeRaw`UPDATE concepto SET codigo = 'CON-99999' WHERE organizacion_id = ${o}::uuid AND codigo = 'CON-00001'`).rejects.toThrow(/permission denied|permiso denegado/i);
    const tipo = (await prisma.tipoEstructura.findFirstOrThrow({ where: { organizacionId: o, codigo: "TES-00004" } })).id;
    const base = { organizacionId: o, descripcion: `[DEMO] SQL directo ${sufijo()}`, unidad: "m2", tipoFormula: "AREA", permiteDescuento: false, clase: "ESTANDAR", tipoId: tipo, reglaMedicion: "[DEMO] r" };
    await expect(prisma.concepto.create({ data: { ...base, codigo: `CON-SQL-${sufijo()}`, estado: "Borrador", heredado: true } })).rejects.toThrow(/REGISTRO_INMUTABLE|heredado/);
    await expect(prisma.concepto.create({ data: { ...base, codigo: `CON-SQL-${sufijo()}`, estado: "Aprobado", aprobadoEn: new Date() } })).rejects.toThrow(/APROBACION_DIRECTA/);
    await expect(prisma.concepto.create({ data: { ...base, codigo: `CON-SQL-${sufijo()}`, estado: "Borrador", unidad: "m3" } })).rejects.toThrow(/UNIDAD_FORMULA/);
    const columnas = await migrador.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE grantee = 'softarq_app' AND table_name = 'concepto' AND privilege_type = 'UPDATE' ORDER BY 1`;
    const editables = columnas.map((c) => c.column_name);
    for (const fija of ["heredado", "codigo", "organizacion_id", "id", "creado_por", "creado_en"]) expect(editables).not.toContain(fija);
    expect(editables).toEqual(expect.arrayContaining(["estado", "aprobado_por", "aprobado_en", "revision_tecnica", "tipo_id", "regla_medicion"]));
  });
});

describe("conceptos heredados de la carga anterior (decisión 3)", () => {
  it("siguen calculando igual (22,405.28); la pantalla explica qué falta; editarlos exige completarlos y retira la aprobación", async () => {
    const o = org["her"]!;
    await comoHeredado(o, "CON-00009");
    const a = await admin("her");
    const p = await entrar("prep.her@softarq.test");
    const v = await concepto(a, "CON-00009");
    expect(v.concepto).toMatchObject({ heredado: true, estado: "Aprobado", tipo: null, aprobadoEn: null });
    expect(v.reglaMedicion).toBeNull();
    expect(v.requisitos.map((x) => x.codigo)).toEqual(["HEREDADO", "SIN_REGLA", "SIN_TIPO"]);
    // Funcionamiento previo intacto.
    const id = await cotizacion(p, borradorDesdeEntrada(SV.entrada as EntradaCalculo));
    const v1 = await version(p, id, 0);
    expect(v1.status, v1.texto).toBe(201);
    expect(v1.cuerpo.cotizacion.total).toBe("22405.28");
    // Asignar tarifa (excepción del módulo 11) y desactivar/reactivar no son ediciones técnicas.
    const sinTipo = await a.patch("/api/v1/admin/conceptos/CON-00009", { revision: v.concepto.revision, descripcion: "[DEMO] Muro editado" });
    expect(sinTipo.status).toBe(422);
    expect(sinTipo.cuerpo.error.codigo).toBe("CONCEPTO_INCOMPLETO");
    expect(sinTipo.cuerpo.error.campos.map((c: { ruta: string }) => c.ruta)).toEqual(["tipoCodigo", "reglaMedicion"]);
    const cmp = v.componentes[0]!;
    const componenteBloqueado = await a.patch(`/api/v1/admin/conceptos/CON-00009/componentes/${cmp.codigo}`, { revision: cmp.revision, rendimiento: "13" });
    expect(componenteBloqueado.status).toBe(422);
    expect(componenteBloqueado.cuerpo.error.codigo).toBe("CONCEPTO_INCOMPLETO");
    // El SQL directo tampoco lo permite.
    await expect(prisma.$executeRaw`UPDATE concepto SET descripcion = 'x' WHERE organizacion_id = ${o}::uuid AND codigo = 'CON-00009'`).rejects.toThrow(/CONCEPTO_INCOMPLETO/);
    expect((await estadoEnBase(o, "CON-00009")).heredado).toBe(true);
    // Completar (mapeo documentado: CON-00009 → TES-00004) lo regulariza y retira la aprobación.
    const completo = await a.patch("/api/v1/admin/conceptos/CON-00009", {
      revision: v.concepto.revision,
      tipoCodigo: "TES-00004",
      reglaMedicion: "[DEMO] Área = piezas x largo x alto de cada muro (completada en la prueba).",
    });
    expect(completo.status, completo.texto).toBe(200);
    const d = detalle(completo);
    expect(d.concepto).toMatchObject({ heredado: false, estado: "Borrador", aprobadoPor: null, tipo: { codigo: "TES-00004" } });
    expect(d.historial.find((e) => e.tipo === "CONCEPTO_EDITADO")!.detalle).toMatchObject({ completadoHeredado: true });
    expect(d.requisitos).toEqual([]);
    // La carga DEMO repetida no completa, no restaura la aprobación ni vuelve a marcarlo.
    await cargarDemo(prisma, { codigo: "DEMO-M12-HER", nombre: "[DEMO] Módulo 12 her" });
    expect(await estadoEnBase(o, "CON-00009")).toMatchObject({ estado: "Borrador", heredado: false });
    // Hasta una nueva aprobación no se ofrece para cotizaciones nuevas.
    await noSeOfrece(p, borradorDesdeEntrada(SV.entrada as EntradaCalculo), "CON-00009");
    const aprobado = await aprobar(a, "CON-00009", d.concepto.revisionTecnica);
    expect(aprobado.status, aprobado.texto).toBe(200);
    const id3 = await cotizacion(p, borradorDesdeEntrada(SV.entrada as EntradaCalculo));
    expect((await version(p, id3, 0)).cuerpo.cotizacion.total).toBe("22405.28");
  });
});

describe("integración con el cotizador", () => {
  it("BL-05 (`Validar`): un componente activo sin fuente, fecha o responsable bloquea el cálculo", async () => {
    const a = await admin("cnv");
    const p = await entrar("prep.cnv@softarq.test");
    const c = await conceptoCreado(a, { clase: "PERSONALIZADO", tipoCodigo: "TES-00006" });
    await conComponente(a, c.concepto.codigo, { responsable: null });
    await conComponente(a, c.concepto.codigo, { insumoCodigo: "INS-00011", rendimiento: "27", unidadRendimiento: "kg" });
    const id = await cotizacion(p, capturaMuro(c.concepto.codigo, [{ tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: c.concepto.codigo, motivo: "Muro especial solicitado por el cliente." }]));
    const r = await version(p, id, 0);
    expect(r.status).toBe(422);
    expect(r.cuerpo.error.problemas).toEqual([expect.objectContaining({ codigo: "BL-05" })]);
    expect(r.cuerpo.error.problemas[0].mensaje).toMatch(/fuente, fecha y responsable técnico/);
  });

  it("concepto personalizado creado en la administración, sin aprobar, hasta la emisión con la excepción autorizada (AV-04)", async () => {
    const a = await admin();
    const p = await entrar("prep.m12@softarq.test");
    const r = await entrar("rev.m12@softarq.test");
    const c = await conceptoCreado(a, { clase: "PERSONALIZADO", tipoCodigo: "TES-00006", descripcion: `[DEMO] Muro personalizado M12 ${sufijo()}` });
    await conComponente(a, c.concepto.codigo);
    await conComponente(a, c.concepto.codigo, { insumoCodigo: "INS-00011", rendimiento: "27", unidadRendimiento: "kg" });
    await conComponente(a, c.concepto.codigo, { insumoCodigo: "INS-00008", rendimiento: "3.2", unidadRendimiento: "m" });
    const codigo = c.concepto.codigo;
    const visible = await p.get(`/api/v1/catalogos/conceptos?buscar=${codigo}`);
    expect(visible.cuerpo.conceptos).toEqual([expect.objectContaining({ codigo, clase: "PERSONALIZADO" })]);
    // Sin excepción: BL-04.
    const id = await cotizacion(p, capturaMuro(codigo));
    const sin = await version(p, id, 0);
    expect(sin.status).toBe(422);
    expect(sin.cuerpo.error.problemas).toEqual([expect.objectContaining({ codigo: "BL-04", referencia: codigo })]);
    // Con la excepción registrada: calcula con los mismos importes del ejemplo (mismo rendimiento).
    const b = (await p.get(`/api/v1/cotizaciones/${id}`)).cuerpo.borrador;
    const g = await p.put(`/api/v1/cotizaciones/${id}/borrador`, {
      revision: b.revision,
      captura: { ...b.captura, excepciones: [{ tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: codigo, motivo: "Muro especial solicitado por el cliente." }] },
    });
    expect(g.status, g.texto).toBe(200);
    const v1 = await version(p, id, g.cuerpo.revision);
    expect(v1.status, v1.texto).toBe(201);
    expect(v1.cuerpo.cotizacion.total).toBe("22405.28");
    // Al enviar basta con que esté registrada; el Revisor la autoriza y aparece AV-04.
    const env = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`, { revisionBorrador: g.cuerpo.revision }, idem());
    expect(env.status, env.texto).toBe(201);
    const vista = EsquemaDetalleRevision.parse((await r.get(`/api/v1/revisiones/${env.cuerpo.revision.id}`)).cuerpo);
    expect(vista.verificacion!.bloqueos.map((x) => x.codigo)).toEqual(["BL-04"]);
    const dec = await r.post(`/api/v1/revisiones/${vista.revision.id}/excepciones/1/decision`, { versionId: vista.revision.version.id, decision: "AUTORIZADA" }, idem());
    expect(dec.status, dec.texto).toBe(200);
    const vista2 = EsquemaDetalleRevision.parse((await r.get(`/api/v1/revisiones/${env.cuerpo.revision.id}`)).cuerpo);
    expect(vista2.verificacion!.bloqueos).toEqual([]);
    expect(vista2.verificacion!.avisos.map((x) => x.codigo)).toContain("AV-04");
    const ap = await r.post(`/api/v1/revisiones/${vista2.revision.id}/decision`, { decision: "APROBAR", versionId: vista2.revision.version.id, revision: vista2.revision.revision }, idem());
    expect(ap.status, ap.texto).toBe(200);
    const e = await p.post(`/api/v1/cotizaciones/${id}/versiones/1/emision`, { versionId: vista2.revision.version.id, revisionId: vista2.revision.id }, idem());
    expect(e.status, e.texto).toBe(201);
    // El concepto sigue sin aprobar: se distingue concepto aprobado, personalizado y excepción autorizada.
    expect((await estadoEnBase(org["m12"]!, codigo)).estado).toBe("Borrador");
  });
});
