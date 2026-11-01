/**
 * Catálogo técnico (módulo 12, ADR-0016) contra la web compilada, la API real y softarq_test (fecha
 * fija 25/09/2026): tipo de estructura, insumo con conversión, concepto con componentes y aprobación
 * por el propio Administrador, vuelta a Borrador por un cambio técnico y concepto personalizado sin
 * aprobar recorrido con su excepción hasta la aprobación de la versión. Solo crea registros nuevos
 * marcados [DEMO]: no altera los conceptos de referencia que usan las demás pruebas.
 * Pruebas AUTOMATIZADAS: no equivalen a la revisión personal ni a la ejecución formal de la guía.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "modulo12");

test.describe.configure({ mode: "serial" });

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 7);
/** Etiqueta exacta de un campo: el texto visible más « *» (obligatorio) o «(opcional)». */
const etiqueta = (texto: string) => new RegExp(`^${texto.replace(/[()]/g, "\\$&")}( \\*| \\(opcional\\))?$`);

async function otraPersona(browser: Browser, cuenta: CuentaE2E): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: 1440, height: 900 } });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta);
  return p;
}

async function irACatalogo(p: Page, vista: "Insumos y conversiones" | "Tipos de estructura" | "Conceptos y componentes"): Promise<void> {
  await p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Catálogo" }).click();
  await p.getByRole("navigation", { name: "Secciones del catálogo" }).getByRole("link", { name: vista, exact: true }).click();
}

/** Selector con búsqueda: busca el código en el servidor y elige su resultado. */
async function elegir(p: Page, grupo: RegExp, codigo: string): Promise<void> {
  const g = p.getByRole("group", { name: grupo });
  await g.getByRole("searchbox").fill(codigo);
  await g.getByRole("button", { name: "Buscar" }).click();
  await g.getByRole("radio", { name: new RegExp(codigo) }).check();
  await expect(g).toContainText(`Seleccionado: ${codigo}`);
}

async function codigoCreado(p: Page, patron: RegExp, prefijo: string): Promise<string> {
  const mensaje = p.getByText(patron).first();
  await expect(mensaje).toBeVisible();
  return new RegExp(`${prefijo}-\\d{5}`).exec((await mensaje.textContent()) ?? "")![0];
}

/** Concepto nuevo por la interfaz; queda abierto su detalle. */
async function nuevoConcepto(p: Page, o: { tipo: string; descripcion: string; clase: "ESTANDAR" | "PERSONALIZADO" }): Promise<string> {
  await irACatalogo(p, "Conceptos y componentes");
  await p.getByRole("button", { name: "Nuevo concepto" }).click();
  await elegir(p, /^Tipo de estructura \(activo\)/, o.tipo);
  await p.getByLabel(etiqueta("Descripción del concepto")).fill(o.descripcion);
  await p.getByLabel(etiqueta("Tipo de fórmula de medición")).selectOption("AREA");
  await p.getByLabel(etiqueta("Unidad del concepto")).selectOption("m2");
  await p.getByLabel(etiqueta("Regla de medición")).fill("[DEMO] Área = piezas x largo x alto de cada muro (regla ilustrativa de la prueba).");
  await p.getByLabel(etiqueta("Clase")).selectOption(o.clase);
  await p.getByLabel(etiqueta("Tarifa de mano de obra")).selectOption("TMO-00005");
  await p.getByRole("button", { name: "Crear concepto en Borrador" }).click();
  return codigoCreado(p, /Concepto CON-\d{5} creado en Borrador/, "CON");
}

async function agregarComponente(p: Page, o: { insumo: string; rendimiento: string; unidad: string; desperdicio?: string; trazable?: boolean }): Promise<void> {
  await p.getByRole("button", { name: "Agregar componente" }).click();
  await elegir(p, /^Insumo técnico \(activo\)/, o.insumo);
  await p.getByLabel(/^Rendimiento \(por m2/).fill(o.rendimiento);
  await p.getByLabel(etiqueta("Unidad del rendimiento")).selectOption(o.unidad);
  await p.getByLabel(etiqueta("Desperdicio (fracción 0 a <1)")).fill(o.desperdicio ?? "0.05");
  if (o.trazable !== false) {
    await p.getByLabel(etiqueta("Fuente del rendimiento")).fill("[DEMO] Ficha ficticia de la prueba");
    await p.getByLabel(etiqueta("Fecha de la fuente")).fill("2026-09-25");
    await p.getByLabel(etiqueta("Responsable técnico")).fill("[DEMO] Responsable ficticio");
  }
  await p.getByRole("button", { name: "Agregar componente" }).last().click();
  await expect(p.getByText(/Componente agregado a CON-\d{5}/)).toBeVisible();
}

test("tipo, insumo con conversión, concepto con componentes aprobado por su creador y vuelta a Borrador por un cambio técnico", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().administrador);
  const n = sufijo();

  // Tipos de estructura: los seis genéricos del libro y uno nuevo.
  await irACatalogo(page, "Tipos de estructura");
  await expect(page.getByRole("row", { name: /TES-00006.*Conceptos personalizados/ })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo tipo" }).click();
  await page.getByLabel(etiqueta("Familia")).selectOption("Mampostería reforzada");
  await page.getByLabel(etiqueta("Nombre del tipo")).fill(`Muros E2E ${n}`);
  await page.getByRole("button", { name: "Crear tipo" }).click();
  const tes = await codigoCreado(page, /Tipo TES-\d{5} creado/, "TES");
  await evidencia(page, info, "01-tipos-estructura", true);

  // Insumo y conversión: el origen excluye la unidad base.
  await irACatalogo(page, "Insumos y conversiones");
  await page.getByRole("button", { name: "Nuevo insumo" }).click();
  await page.getByLabel(etiqueta("Descripción técnica")).fill(`[DEMO] Varilla E2E ${n} (kg)`);
  await page.getByLabel(etiqueta("Unidad base")).selectOption("kg");
  await page.getByRole("button", { name: "Crear insumo" }).click();
  const ins = await codigoCreado(page, /Insumo INS-\d{5} creado/, "INS");
  await page.getByRole("searchbox", { name: /Buscar por código/ }).fill(ins);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("row", { name: new RegExp(ins) }).getByRole("button", { name: "Gestionar" }).click();
  await page.getByRole("button", { name: "Nueva conversión" }).click();
  await expect(page.getByLabel(etiqueta("Unidad de origen")).locator("option[value=kg]")).toHaveCount(0);
  await page.getByLabel(etiqueta("Unidad de origen")).selectOption("m");
  await page.getByLabel(/^Factor \(1 m = factor × kg\)/).fill("0.56");
  await page.getByLabel(etiqueta("Fuente del factor")).fill("[DEMO] Factor ficticio de la prueba");
  await page.getByRole("button", { name: "Registrar conversión" }).click();
  await expect(page.getByText("1 m = 0.56 kg")).toBeVisible();
  await evidencia(page, info, "02-insumo-conversion", true);

  // Concepto nuevo con dos componentes (uno medido en m con la conversión) y aprobación por su creador.
  const con = await nuevoConcepto(page, { tipo: tes, descripcion: `[DEMO] Muro E2E ${n}`, clase: "ESTANDAR" });
  await expect(page.getByText("El concepto no tiene componentes activos.")).toBeVisible();
  await agregarComponente(page, { insumo: "INS-00010", rendimiento: "12.5", unidad: "pza", trazable: false });
  await expect(page.getByText("Falta: fuente, fecha, responsable técnico")).toBeVisible();
  await expect(page.getByRole("list", { name: "Requisitos para aprobar" })).toContainText(/no tiene fuente/);
  await page.getByRole("button", { name: /^Editar CMP-\d{5}$/ }).click();
  await page.getByLabel(etiqueta("Fuente del rendimiento")).fill("[DEMO] Ficha ficticia de la prueba");
  await page.getByLabel(etiqueta("Fecha de la fuente")).fill("2026-09-25");
  await page.getByLabel(etiqueta("Responsable técnico")).fill("[DEMO] Responsable ficticio");
  await page.getByRole("button", { name: "Guardar componente" }).click();
  await agregarComponente(page, { insumo: ins, rendimiento: "3.2", unidad: "m" });
  await expect(page.getByText("Convierte: 1 m = 0.56 kg")).toBeVisible();
  await expect(page.getByText("Cumple todos los requisitos del servidor.")).toBeVisible();
  await evidencia(page, info, "03-concepto-listo-para-aprobar", true);
  await page.getByRole("button", { name: "Aprobar concepto" }).click();
  await page.getByRole("group", { name: /Confirmar: Aprobar concepto/ }).getByRole("button", { name: "Aprobar concepto" }).click();
  await expect(page.getByText(new RegExp(`Concepto ${con} aprobado`))).toBeVisible();
  await expect(page.getByText(/Aprobado por \[DEMO\]/)).toBeVisible();

  // Cambio técnico: aviso antes de confirmar y vuelta a Borrador.
  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByLabel(etiqueta("Regla de medición")).fill("[DEMO] Regla corregida en la prueba.");
  await expect(page.getByText("Al guardar, el concepto aprobado vuelve a Borrador")).toBeVisible();
  await page.getByRole("button", { name: "Revisar y confirmar" }).click();
  const confirmar = page.getByRole("group", { name: /Confirmar: Guardar y volver a Borrador/ });
  await expect(confirmar).toContainText("perderá la aprobación");
  await evidencia(page, info, "04-aviso-vuelve-a-borrador", true);
  await confirmar.getByRole("button", { name: "Guardar y volver a Borrador" }).click();
  await expect(page.getByText(new RegExp(`Concepto ${con} guardado: volvió a Borrador`))).toBeVisible();
});

test("concepto personalizado sin aprobar: el Preparador lo cotiza con su excepción y el Revisor la autoriza (AV-04) antes de aprobar", async ({ page, browser }, info) => {
  const cuentas = cuentasE2E();
  await abrirConSesion(page, cuentas.administrador);
  const n = sufijo();
  const con = await nuevoConcepto(page, { tipo: "TES-00006", descripcion: `[DEMO] Muro personalizado E2E ${n}`, clase: "PERSONALIZADO" });
  await agregarComponente(page, { insumo: "INS-00010", rendimiento: "12.5", unidad: "pza" });
  await agregarComponente(page, { insumo: "INS-00011", rendimiento: "27", unidad: "kg" });
  await agregarComponente(page, { insumo: "INS-00008", rendimiento: "3.2", unidad: "m" });
  await expect(page.getByText("Cumple todos los requisitos del servidor.")).toBeVisible();
  await evidencia(page, info, "05-personalizado-sin-aprobar", true);

  // Preparador: captura propia con el personalizado, guardada como cotización.
  const prep = await otraPersona(browser, cuentas.preparador);
  await prep.getByRole("button", { name: "Iniciar captura propia" }).click();
  await prep.getByLabel("Buscar concepto por código o descripción").fill(con);
  await prep.getByRole("button", { name: new RegExp(`Agregar ${con}`) }).click();
  await prep.getByLabel("Largo del renglón 1", { exact: false }).fill("9.8");
  await prep.getByLabel("Ancho del renglón 1", { exact: false }).fill("2.7");
  await prep.getByRole("radio", { name: "Consolidar compras" }).check();
  await prep.getByRole("radio", { name: /PRE-000016/ }).check();
  await prep.getByRole("radio", { name: /PRE-000017/ }).check();
  await prep.getByRole("radio", { name: /PRE-000013/ }).check();
  await prep.getByRole("button", { name: "Guardar como cotización" }).click();
  await prep.getByRole("button", { name: "Nuevo cliente" }).click();
  await prep.getByLabel("Nombre o razón social").fill(`[DEMO] Cliente personalizado ${n}`);
  await prep.getByRole("button", { name: "Crear cliente" }).click();
  await prep.getByRole("button", { name: "Nuevo proyecto" }).click();
  await prep.getByLabel("Nombre del proyecto").fill(`[DEMO] Obra personalizada ${n}`);
  await prep.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(prep.getByRole("radio", { name: new RegExp(`Obra personalizada ${n}`) })).toBeChecked();
  await prep.getByRole("button", { name: "Crear cotización" }).click();
  const titulo = prep.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ });
  await expect(titulo).toBeVisible();
  const folio = /COT-2026-\d{5}/.exec((await titulo.textContent()) ?? "")![0];

  // Excepción de concepto personalizado (no se autoriza sola).
  const seccion = prep.locator(".seccion-excepciones");
  await seccion.getByRole("button", { name: "Registrar excepción…" }).click();
  await seccion.getByRole("radio", { name: "Concepto personalizado" }).check();
  await seccion.getByLabel("Concepto personalizado", { exact: true }).selectOption(con);
  await seccion.getByLabel("Motivo (obligatorio)").fill("Muro especial solicitado por el cliente ficticio.");
  await seccion.getByRole("button", { name: "Revisar excepción" }).click();
  await seccion.getByRole("button", { name: "Agregar al borrador" }).click();
  await expect(seccion.getByText("Registrada · pendiente de autorización")).toBeVisible();
  await prep.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(prep.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await prep.getByRole("button", { name: `Enviar ${folio}-v1 a revisión…` }).click();
  await prep.getByRole("button", { name: `Confirmar envío de ${folio}-v1` }).click();
  await expect(prep.getByText(`${folio}-v1 está en revisión`)).toBeVisible();
  await evidencia(prep, info, "06-personalizado-enviado", true);

  // Revisor: BL-04 hasta autorizar; después AV-04 y aprobación.
  const revisor = await otraPersona(browser, cuentas.revisor);
  await revisor.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Revisiones" }).click();
  await revisor.getByRole("button", { name: "Actualizar" }).click();
  await revisor.getByRole("link", { name: `${folio}-v1` }).click();
  await expect(revisor.getByText(/sin excepción autorizada|no está autorizada por el revisor/).first()).toBeVisible();
  const panelExc = revisor.locator(".seccion-excepciones");
  await panelExc.getByRole("button", { name: "Autorizar excepción 1…" }).click();
  await panelExc.getByRole("button", { name: "Confirmar autorización de la excepción 1" }).click();
  await expect(panelExc.getByText("Excepción 1 autorizada.")).toBeVisible();
  await expect(revisor.getByText(/AV-04/).first()).toBeVisible();
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  await revisor.getByRole("button", { name: `Confirmar aprobación de ${folio}-v1` }).click();
  await expect(revisor.getByText(new RegExp(`${folio}-v1 aprobada por`)).first()).toBeVisible();
  await evidencia(revisor, info, "07-personalizado-aprobado-av04", true);
  await revisor.context().close();
  await prep.context().close();

  // El concepto sigue en Borrador: aprobar la versión no aprueba el concepto.
  await page.reload();
  await irACatalogo(page, "Conceptos y componentes");
  await page.getByRole("searchbox", { name: /Buscar por código/ }).fill(con);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(con) })).toContainText("Borrador");
});

test("catálogo técnico a 390 px con teclado: concepto y componentes sin desborde @movil", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().administrador);
  await page.goto("/#/catalogo/conceptos");
  await expect(page.getByRole("heading", { level: 2, name: "Conceptos y componentes" })).toBeVisible();
  await sinDesbordeHorizontal(page);
  const nuevo = page.getByRole("button", { name: "Nuevo concepto" });
  await nuevo.focus();
  await page.keyboard.press("Enter");
  const tipo = page.getByRole("group", { name: /Tipo de estructura/ });
  await expect(tipo.getByRole("searchbox")).toBeFocused();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "08-movil-nuevo-concepto", true);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("searchbox", { name: /Buscar por código/ }).fill("CON-00009");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("row", { name: /CON-00009/ }).getByRole("button", { name: "Gestionar" }).click();
  await expect(page.getByRole("table", { name: /Componentes de CON-00009/ })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "09-movil-componentes", true);
});
