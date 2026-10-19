/**
 * Salidas internas de una versión (módulo 14, ADR-0018) contra la web compilada, la API real y
 * softarq_test: compras calculadas, detalle e indicadores de una versión concreta (Ejemplo 1 del
 * libro, total de referencia 54,190.68), selector de versión, acceso por función y pérdida del
 * permiso con la pantalla abierta. Pruebas AUTOMATIZADAS: no equivalen a la revisión personal ni a
 * la ejecución formal de la guía.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, ajustarBase, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal } from "./apoyo.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "modulo14");

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 8);
const navegar = (p: Page, seccion: "Calculadora DEMO" | "Cotizaciones") =>
  p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion }).click();

/** Ejemplo 1 → «Guardar como cotización» con cliente y proyecto nuevos → v1 calculada por el servidor. */
async function cotizacionConV1(pagina: Page, nombre: string): Promise<{ folio: string; url: string }> {
  await navegar(pagina, "Calculadora DEMO");
  await cargarEjemplo(pagina, 1);
  await pagina.getByRole("button", { name: "Guardar como cotización" }).click();
  await pagina.getByRole("button", { name: "Nuevo cliente" }).click();
  await pagina.getByLabel("Nombre o razón social").fill(`[DEMO] Cliente ${nombre}`);
  await pagina.getByRole("button", { name: "Crear cliente" }).click();
  await expect(pagina.getByRole("radio", { name: new RegExp(`Cliente ${nombre}`) })).toBeChecked();
  await pagina.getByRole("button", { name: "Nuevo proyecto" }).click();
  await pagina.getByLabel("Nombre del proyecto").fill(`[DEMO] Obra ${nombre}`);
  await pagina.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(pagina.getByRole("radio", { name: new RegExp(`Obra ${nombre}`) })).toBeChecked();
  await pagina.getByRole("button", { name: "Crear cotización" }).click();
  const titulo = pagina.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ });
  await expect(titulo).toBeVisible();
  const folio = /COT-2026-\d{5}/.exec((await titulo.textContent()) ?? "")![0];
  await pagina.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(pagina.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  return { folio, url: pagina.url() };
}

test("Preparador: compras, detalle e indicadores de v1 y v2 con selector explícito; total de referencia", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { folio } = await cotizacionConV1(page, `Salidas ${sufijo()}`);
  // v2 sin consolidar compras, para comparar la modalidad.
  await page.getByRole("radio", { name: "Comprar por partida" }).check();
  await page.getByLabel("Motivo de la versión").fill("Compras separadas por partida para comparar");
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v2 guardada`)).toBeVisible();

  await page.getByRole("link", { name: `${folio}-v1`, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Versión ${folio}-v1` })).toBeVisible();
  await page.getByRole("link", { name: "Salidas internas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Salidas internas ${folio}-v1` })).toBeVisible();
  expect(page.url()).toContain("/v/1/interno/compras");
  await expect(page.getByRole("note")).toContainText("No es un documento para el cliente");
  const datos = page.locator("dl.datos-version").first();
  await expect(datos).toContainText("WEB DEMO");
  await expect(datos).toContainText("25/09/2026");
  await expect(datos).toContainText("Consolidadas por producto y proveedor");
  await expect(datos).toContainText("(hay versiones posteriores)");
  const compras = page.getByRole("table", { name: `Compras calculadas de ${folio}-v1` });
  await expect(compras.locator("tbody tr")).toHaveCount(3);
  await expect(compras).toContainText("Consolidada");
  await expect(page.getByRole("table", { name: `Prorrateo de las compras de ${folio}-v1` })).toBeVisible();
  await evidencia(page, info, "01-compras-v1", true);

  await page.getByRole("link", { name: "Detalle del cálculo" }).click();
  expect(page.url()).toContain("/v/1/interno/detalle");
  await expect(page.getByRole("heading", { level: 3, name: /Partida 1\./ })).toBeVisible();
  await evidencia(page, info, "02-detalle-v1", true);

  await page.getByRole("link", { name: "Indicadores" }).click();
  const indicadores = page.locator("dl.totales-internos").first();
  await expect(indicadores).toContainText("$54,190.68");
  await expect(page.getByText("Recargo sobre costo aplicado")).toBeVisible();
  await expect(page.getByText("Margen sobre precio (indicador)")).toBeVisible();
  await evidencia(page, info, "03-indicadores-v1", true);

  // Selector: la versión se elige; la ruta cambia a la elegida.
  await page.getByLabel("Versión consultada").selectOption("2");
  await expect(page.getByRole("heading", { level: 1, name: `Salidas internas ${folio}-v2` })).toBeVisible();
  expect(page.url()).toContain("/v/2/interno/indicadores");
  await page.getByRole("link", { name: "Compras calculadas" }).click();
  await expect(page.locator("dl.datos-version").first()).toContainText("Separadas por partida");
  await expect(page.getByRole("table", { name: `Compras calculadas de ${folio}-v2` })).not.toContainText("Consolidada");
  await evidencia(page, info, "04-compras-v2-por-partida", true);
});

test("administradores sin otra función: sin enlace y sin acceso por la ruta directa", async ({ page, browser }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { folio, url } = await cotizacionConV1(page, `Acceso ${sufijo()}`);
  const id = /#\/cotizaciones\/([0-9a-f-]{36})/.exec(url)![1]!;

  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: 1440, height: 900 } });
  const admin = await contexto.newPage();
  await abrirConSesion(admin, cuentasE2E().administrador);
  await admin.goto(`/#/cotizaciones/${id}/v/1`);
  await expect(admin.getByRole("heading", { level: 1, name: `Versión ${folio}-v1` })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Salidas internas" })).toHaveCount(0);
  await admin.goto(`/#/cotizaciones/${id}/v/1/interno/indicadores`);
  await expect(admin.getByText("Su función no consulta las salidas internas")).toBeVisible();
  await expect(admin.getByText("$54,190.68")).toHaveCount(0);
  // La API también lo rechaza aunque se llame directamente (con la cookie de la sesión).
  const r = await admin.request.get(`http://localhost:3101/api/v1/cotizaciones/${id}/versiones/1/salidas-internas`);
  expect(r.status()).toBe(403);
  await evidencia(admin, info, "05-administrador-sin-permiso");
  await contexto.close();
});

test("función retirada con la pantalla abierta: datos descartados y navegación actualizada", async ({ page }, info) => {
  const cuentas = cuentasE2E();
  await abrirConSesion(page, cuentas.preparador);
  const { url } = await cotizacionConV1(page, `Retiro ${sufijo()}`);
  const id = /#\/cotizaciones\/([0-9a-f-]{36})/.exec(url)![1]!;
  await page.getByLabel("Motivo de la versión").fill("Segunda versión para la prueba de retiro");
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(/-v2 guardada/)).toBeVisible();

  const contexto = await page.context().browser()!.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: 1440, height: 900 } });
  const revisor = await contexto.newPage();
  await abrirConSesion(revisor, cuentas.retiro);
  await revisor.goto(`/#/cotizaciones/${id}/v/1/interno/compras`);
  await expect(revisor.getByRole("table").first()).toBeVisible();
  ajustarBase("funciones", cuentas.retiro.correo, "ADMIN_CATALOGO");
  try {
    await revisor.getByLabel("Versión consultada").selectOption("2");
    await expect(revisor.getByText(/no consulta las salidas internas|ya no permite consultar las salidas internas/)).toBeVisible();
    await expect(revisor.getByRole("table")).toHaveCount(0);
    await evidencia(revisor, info, "06-funcion-retirada");
    await revisor.goto(`/#/cotizaciones/${id}/v/1`);
    await expect(revisor.getByRole("heading", { level: 1, name: /Versión COT-2026-\d{5}-v1/ })).toBeVisible();
    await expect(revisor.getByRole("link", { name: "Salidas internas" })).toHaveCount(0);
  } finally {
    ajustarBase("funciones", cuentas.retiro.correo, "REVISOR");
    await contexto.close();
  }
});

test("390 px: tablas como tarjetas, sin desborde horizontal y navegación con teclado @movil", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { folio, url } = await cotizacionConV1(page, `Movil ${sufijo()}`);
  const id = /#\/cotizaciones\/([0-9a-f-]{36})/.exec(url)![1]!;
  await page.goto(`/#/cotizaciones/${id}/v/1/interno/compras`);
  await expect(page.getByRole("heading", { level: 1, name: `Salidas internas ${folio}-v1` })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "07-compras-movil", true);
  // Teclado: la subnavegación se alcanza con Tab y se activa con Intro.
  const detalle = page.getByRole("link", { name: "Detalle del cálculo" });
  await detalle.focus();
  await expect(detalle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 3, name: /Partida 1\./ })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "08-detalle-movil", true);
  await page.getByRole("link", { name: "Indicadores" }).click();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "09-indicadores-movil", true);
});
