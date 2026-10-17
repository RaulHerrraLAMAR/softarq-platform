/**
 * Administración de catálogos (módulo 11, ADR-0015) contra la web compilada, la API real y
 * softarq_test (fecha fija 25/09/2026). Solo crea registros nuevos marcados [DEMO]; al terminar deja
 * inactivo el proveedor de prueba y devuelve la tarifa original al concepto, para no alterar los
 * ejemplos de referencia que usan las demás pruebas.
 * Pruebas AUTOMATIZADAS: no equivalen a la revisión personal ni a la ejecución formal de la guía.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "modulo11");
const HOY = "2026-09-25";
const MOTIVO = "[DEMO] Lista nueva del proveedor ficticio de comprobación";

test.describe.configure({ mode: "serial" });

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 7);

/** Etiqueta exacta de un campo: el texto visible más « *» (obligatorio) o «(opcional)». */
const etiqueta = (texto: string) => new RegExp(`^${texto.replace(/[()]/g, "\\$&")}( \\*| \\(opcional\\))?$`);

async function otraPersona(browser: Browser, cuenta: CuentaE2E, ancho = 1440): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: ancho, height: 900 } });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta);
  return p;
}

async function irACatalogo(p: Page, vista: "Proveedores" | "Productos" | "Precios" | "Mano de obra" | "Tarifa de conceptos"): Promise<void> {
  await p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Catálogo" }).click();
  await p.getByRole("navigation", { name: "Secciones del catálogo" }).getByRole("link", { name: vista }).click();
}

/** Mensaje de confirmación con el código creado. */
async function codigoCreado(p: Page, patron: RegExp): Promise<string> {
  const mensaje = p.getByText(patron);
  await expect(mensaje).toBeVisible();
  return /(PRV|PCM|PRE|TMO)-\d{5,6}/.exec((await mensaje.textContent()) ?? "")![0];
}

test("el Preparador no ve el catálogo; el Administrador registra proveedor, producto, precio y sucesor, y la opción deja de ofrecerse al desactivar", async ({ page, browser }, info) => {
  const cuentas = cuentasE2E();
  // Navegación según permisos: el Preparador no administra el catálogo (y la API lo rechaza).
  const prep = await otraPersona(browser, cuentas.preparador);
  await expect(prep.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Catálogo" })).toHaveCount(0);
  await prep.goto("/#/catalogo/precios");
  await expect(prep.getByRole("heading", { name: "Sin permiso" })).toBeVisible();

  await abrirConSesion(page, cuentas.administrador);
  const s = sufijo();

  await irACatalogo(page, "Proveedores");
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByLabel(etiqueta("Nombre del proveedor")).fill(`[DEMO] Proveedor E2E ${s}`);
  await page.getByLabel(etiqueta("Contacto")).fill("[DEMO] Contacto ficticio");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  const prv = await codigoCreado(page, /Proveedor PRV-\d{5} creado/);
  // Duplicado normalizado (TI-004): otras mayúsculas y espacios.
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByLabel(etiqueta("Nombre del proveedor")).fill(`  [demo]  proveedor e2e ${s.toUpperCase()} `);
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("alert")).toContainText(`Ya existe el proveedor ${prv}.`);
  await page.getByRole("button", { name: "Cancelar" }).click();

  await irACatalogo(page, "Productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel(etiqueta("Insumo que cubre")).selectOption("INS-00010");
  await page.getByLabel(etiqueta("Descripción comercial")).fill(`[DEMO] Block E2E ${s}`);
  await page.getByLabel(etiqueta("Presentación")).fill("pieza");
  await page.getByLabel(etiqueta("Unidad de compra")).selectOption("pza");
  await expect(page.getByLabel(/Contenido por unidad de compra \(en pza\)/)).toBeVisible();
  await page.getByLabel(/Contenido por unidad de compra/).fill("1");
  await evidencia(page, info, "01-nuevo-producto", true);
  await page.getByRole("button", { name: "Crear producto" }).click();
  const pcm = await codigoCreado(page, /Producto PCM-\d{5} creado/);

  await irACatalogo(page, "Precios");
  await page.getByRole("button", { name: "Registrar precio" }).click();
  await page.getByLabel("Producto comercial (activo)").selectOption(pcm);
  await page.getByLabel("Proveedor (activo)").selectOption(prv);
  await page.getByLabel(/Precio en MXN por pza/).fill("13.7");
  await expect(page.getByLabel(etiqueta("Vigente desde"))).toHaveValue(HOY);
  await page.getByLabel(etiqueta("Vigente hasta")).fill("2027-03-31");
  await page.getByLabel(etiqueta("Fuente")).fill("[DEMO] Lista ficticia de comprobación");
  await page.getByRole("button", { name: "Registrar precio" }).click();
  const pre = await codigoCreado(page, /Precio PRE-\d{6} registrado/);

  // Cerrar vigencia hoy y registrar el sucesor desde mañana.
  await page.getByRole("searchbox", { name: /Buscar por código/ }).fill(pre);
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("row", { name: new RegExp(pre) }).getByRole("button", { name: "Gestionar" }).click();
  await page.getByRole("button", { name: "Cerrar vigencia y registrar sucesor" }).click();
  await expect(page.getByLabel("Nuevo último día del precio actual")).toHaveValue(HOY);
  await expect(page.getByLabel("El sucesor empieza")).toHaveValue("2026-09-26");
  await page.getByLabel(/Precio del sucesor/).fill("13.8");
  await page.getByLabel(etiqueta("Fuente del sucesor")).fill("[DEMO] Lista nueva ficticia");
  await page.getByLabel(etiqueta("Motivo")).fill(MOTIVO);
  await page.getByRole("button", { name: "Revisar y confirmar" }).click();
  const confirmacion = page.getByRole("group", { name: /Confirmar: Cerrar vigencia/ });
  await expect(confirmacion).toContainText("vigente hasta el 25/09/2026 y el sucesor desde el 26/09/2026");
  await evidencia(page, info, "02-cierre-vigencia", true);
  await confirmacion.getByRole("button", { name: "Cerrar vigencia y registrar sucesor" }).click();
  await expect(page.getByText(new RegExp(`Vigencia de ${pre} cerrada el 25/09/2026; sucesor PRE-\\d{6} desde el 26/09/2026`))).toBeVisible();

  // El Preparador ve la opción vigente hoy en el ejemplo 3, sin que se elija por él.
  await prep.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Calculadora DEMO" }).click();
  await cargarEjemplo(prep, 3);
  const block = prep.getByRole("group", { name: /INS-00010/ });
  await expect(block.getByRole("radio", { name: new RegExp(pre) })).toBeVisible();
  await expect(block.getByRole("radio", { name: new RegExp(pre) })).not.toBeChecked();

  // Desactivar el proveedor: se muestra el impacto y la opción deja de ofrecerse.
  await irACatalogo(page, "Proveedores");
  await page.getByRole("searchbox", { name: /Buscar por nombre/ }).fill(prv);
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("row", { name: new RegExp(prv) }).getByRole("button", { name: "Gestionar" }).click();
  await page.getByRole("button", { name: "Desactivar proveedor" }).click();
  const grupo = page.getByRole("group", { name: /Confirmar: Desactivar/ });
  await expect(grupo).toContainText("1 precio(s) vigente(s) hoy dejarán de ofrecerse");
  await expect(grupo).toContainText("No se borra");
  await grupo.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByText(`Proveedor ${prv} desactivado`)).toBeVisible();
  await prep.reload();
  await cargarEjemplo(prep, 3);
  await expect(prep.getByRole("group", { name: /INS-00010/ }).getByRole("radio")).not.toHaveCount(0);
  await expect(prep.getByRole("radio", { name: new RegExp(pre) })).toHaveCount(0);
  await prep.context().close();
});

test("asignar otra tarifa al concepto: el editor avisa que la v1 ya no es vigente (BL-16) y se restaura la tarifa", async ({ page, browser }, info) => {
  const cuentas = cuentasE2E();
  await abrirConSesion(page, cuentas.administrador);
  await irACatalogo(page, "Mano de obra");
  await page.getByRole("button", { name: "Registrar tarifa" }).click();
  await page.getByLabel(etiqueta("Modalidad")).selectOption("UNIDAD");
  await page.getByLabel("Unidad del concepto a la que aplica").selectOption("m2");
  await page.getByLabel(etiqueta("Descripción")).fill(`[DEMO] Mano de obra de muro E2E ${sufijo()}`);
  await page.getByLabel(/Importe por m2/).fill("210");
  await expect(page.getByLabel(etiqueta("Vigente desde"))).toHaveValue(HOY);
  await page.getByLabel(etiqueta("Vigente hasta")).fill("2027-09-30");
  await page.getByLabel(etiqueta("Fuente")).fill("[DEMO] Comprobación del módulo 11");
  await page.getByRole("button", { name: "Registrar tarifa" }).click();
  const tmo = await codigoCreado(page, /Tarifa TMO-\d{5} registrada/);

  // Preparador: cotización del ejemplo 3 con su v1.
  const prep = await otraPersona(browser, cuentas.preparador);
  await prep.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Calculadora DEMO" }).click();
  await cargarEjemplo(prep, 3);
  await prep.getByRole("button", { name: "Guardar como cotización" }).click();
  const n = sufijo();
  await prep.getByRole("button", { name: "Nuevo cliente" }).click();
  await prep.getByLabel("Nombre o razón social").fill(`[DEMO] Cliente tarifa ${n}`);
  await prep.getByRole("button", { name: "Crear cliente" }).click();
  await prep.getByRole("button", { name: "Nuevo proyecto" }).click();
  await prep.getByLabel("Nombre del proyecto").fill(`[DEMO] Obra tarifa ${n}`);
  await prep.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(prep.getByRole("radio", { name: new RegExp(`Obra tarifa ${n}`) })).toBeChecked();
  await prep.getByRole("button", { name: "Crear cotización" }).click();
  await expect(prep.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ })).toBeVisible();
  await prep.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(prep.getByText(/La v1 corresponde a la captura guardada/)).toBeVisible();
  await expect(prep.getByText(/El catálogo cambió después de calcular/)).toHaveCount(0);

  // Administrador: asigna la tarifa nueva al concepto del muro.
  await irACatalogo(page, "Tarifa de conceptos");
  await page.getByRole("searchbox", { name: /Buscar por código/ }).fill("CON-00009");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("row", { name: /CON-00009/ }).getByRole("button", { name: "Asignar tarifa" }).click();
  await page.getByLabel(/Tarifa nueva \(activas en m2\)/).selectOption(tmo);
  await page.getByLabel(etiqueta("Motivo")).fill(MOTIVO);
  await page.getByRole("button", { name: "Revisar y confirmar" }).click();
  const confirmar = page.getByRole("group", { name: /Confirmar: Asignar tarifa/ });
  await expect(confirmar).toContainText(`CON-00009 pasará de TMO-00005 a ${tmo}`);
  await expect(confirmar).toContainText("La aprobación técnica del concepto se conserva");
  await evidencia(page, info, "03-asignar-tarifa", true);
  await confirmar.getByRole("button", { name: "Asignar tarifa" }).click();
  await expect(page.getByText(`Tarifa ${tmo} asignada a CON-00009`)).toBeVisible();
  try {
    await prep.reload();
    const aviso = prep.getByRole("status").filter({ hasText: "El catálogo cambió después de calcular la v1" });
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("BL-16");
    await evidencia(prep, info, "04-editor-catalogo-cambiado", true);
  } finally {
    // Restaurar la tarifa de referencia del concepto (los ejemplos de las demás pruebas la usan).
    await page.getByRole("row", { name: /CON-00009/ }).getByRole("button", { name: "Asignar tarifa" }).click();
    await page.getByLabel(/Tarifa nueva \(activas en m2\)/).selectOption("TMO-00005");
    await page.getByLabel(etiqueta("Motivo")).fill("[DEMO] Restaurar la tarifa de referencia");
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();
    await page.getByRole("group", { name: /Confirmar: Asignar tarifa/ }).getByRole("button", { name: "Asignar tarifa" }).click();
    await expect(page.getByText("Tarifa TMO-00005 asignada a CON-00009")).toBeVisible();
    await prep.context().close();
  }
});

test("catálogo a 390 px con teclado: precios, foco visible y sin desborde @movil", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().administrador);
  await page.goto("/#/catalogo/precios");
  await expect(page.getByRole("heading", { level: 2, name: "Precios por proveedor" })).toBeVisible();
  await sinDesbordeHorizontal(page);
  const registrar = page.getByRole("button", { name: "Registrar precio" });
  // Se habilita al conocer la fecha del servidor (estado de los precios).
  await expect(registrar).toBeEnabled();
  await registrar.focus();
  await expect(registrar).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form", { name: "Registrar precio" })).toBeVisible();
  // Al abrir el formulario, el foco pasa a su primer campo; Tab avanza al siguiente.
  await expect(page.getByLabel("Producto comercial (activo)")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Proveedor (activo)")).toBeFocused();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "05-movil-registrar-precio", true);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Gestionar" }).first().click();
  await expect(page.locator(".panel-registro")).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "06-movil-gestionar-precio", true);
});
