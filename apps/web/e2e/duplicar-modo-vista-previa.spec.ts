/**
 * Módulo 15 (ADR-0019) contra la web compilada, la API real y softarq_test: vista previa PDF
 * BORRADOR (B-25), duplicar (B-35) y preparar la versión nueva con modo de precios (B-34).
 * Pruebas AUTOMATIZADAS: no equivalen a la revisión personal ni a la ejecución formal de la guía.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "modulo15");

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 8);
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const navegar = (p: Page, seccion: "Calculadora DEMO" | "Cotizaciones" | "Revisiones") =>
  p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion }).click();

async function otraPersona(browser: Browser, cuenta: CuentaE2E): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta);
  return p;
}

/** Ejemplo 1 → «Guardar como cotización» con cliente (con contacto) y proyecto completo → v1. */
async function cotizacionConV1(pagina: Page, nombre: string): Promise<{ id: string; folio: string }> {
  await navegar(pagina, "Calculadora DEMO");
  const volver = pagina.getByRole("button", { name: "Volver al inicio" });
  if (await volver.isVisible()) {
    await volver.click();
    await pagina.getByRole("group", { name: "Confirmar salida" }).getByRole("button", { name: "Descartar" }).click();
  }
  await cargarEjemplo(pagina, 1);
  await pagina.getByRole("button", { name: "Guardar como cotización" }).click();
  await pagina.getByRole("button", { name: "Nuevo cliente" }).click();
  await pagina.getByLabel("Nombre o razón social").fill(`[DEMO] Construcción Peñasco ${nombre}`);
  await pagina.getByLabel("Nombre del contacto").fill("Begoña Muñoz Íñiguez");
  await pagina.getByLabel("Teléfono").fill("55 1234 5678");
  await pagina.getByRole("button", { name: "Crear cliente" }).click();
  await expect(pagina.getByRole("radio", { name: new RegExp(`Peñasco ${nombre}`) })).toBeChecked();
  await pagina.getByRole("button", { name: "Nuevo proyecto" }).click();
  await pagina.getByLabel("Nombre del proyecto").fill(`[DEMO] Bodega «El Águila» ${nombre}`);
  await pagina.getByLabel("Municipio").fill("Mérida");
  await pagina.getByLabel("Entidad federativa").fill("Yucatán");
  await pagina.getByLabel("Descripción").fill("Ampliación de nave con cubierta ligera.");
  await pagina.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(pagina.getByRole("radio", { name: new RegExp(`Águila» ${nombre}`) })).toBeChecked();
  await pagina.getByRole("button", { name: "Crear cotización" }).click();
  const titulo = pagina.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ });
  await expect(titulo).toBeVisible();
  const folio = /COT-2026-\d{5}/.exec((await titulo.textContent()) ?? "")![0];
  const id = /#\/cotizaciones\/([0-9a-f-]{36})/.exec(pagina.url())![1]!;
  await pagina.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(pagina.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  return { id, folio };
}

async function emitirV1(page: Page, browser: Browser, folio: string): Promise<void> {
  const idVersion = `${folio}-v1`;
  await page.getByRole("button", { name: `Enviar ${idVersion} a revisión…` }).click();
  await page.getByRole("button", { name: `Confirmar envío de ${idVersion}` }).click();
  await expect(page.getByText(`${idVersion} está en revisión`)).toBeVisible();
  const revisor = await otraPersona(browser, cuentasE2E().revisor);
  await navegar(revisor, "Revisiones");
  await revisor.getByRole("button", { name: "Pendientes" }).click();
  await revisor.getByRole("button", { name: "Actualizar" }).click();
  await revisor.getByRole("link", { name: idVersion }).click();
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  await revisor.getByRole("button", { name: `Confirmar aprobación de ${idVersion}` }).click();
  await expect(revisor.getByText(new RegExp(`${escapar(idVersion)} aprobada por`)).first()).toBeVisible();
  await revisor.context().close();
  await page.reload();
  const emision = page.locator(".seccion-emision");
  await emision.getByRole("button", { name: `Emitir ${idVersion}…` }).click();
  await emision.getByRole("button", { name: `Confirmar emisión de ${idVersion}` }).click();
  await expect(page.getByLabel(`Documento emitido de ${idVersion}`)).toBeVisible();
}

test("vista previa BORRADOR de la versión vigente y duplicar el borrador guardado", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { folio } = await cotizacionConV1(page, `M15 ${sufijo()}`);
  const vista = page.locator(".vista-previa-pdf");
  await expect(vista.getByRole("heading", { name: new RegExp(`Vista previa PDF \\(BORRADOR\\) de ${folio}-v1`) })).toBeVisible();
  await expect(vista).toContainText("No es un documento emitido");
  const descarga = page.waitForEvent("download");
  await vista.getByRole("button", { name: "Descargar BORRADOR (PDF)" }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toBe(`${folio}-v1-BORRADOR.pdf`);
  const ruta = join(CARPETA, `${info.project.name}-borrador-${folio}.pdf`);
  mkdirSync(CARPETA, { recursive: true });
  await d.saveAs(ruta);
  expect(readFileSync(ruta).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  // No aparece como documento emitido.
  await expect(page.getByLabel(`Documento emitido de ${folio}-v1`)).toHaveCount(0);
  await evidencia(page, info, "01-vista-previa-en-el-editor", true);

  // Duplicar el borrador guardado (revisión exacta) con el mismo proyecto.
  await page.getByRole("button", { name: "Duplicar el borrador guardado…" }).click();
  const grupo = page.getByRole("group", { name: /Duplicar el borrador guardado \(revisión \d+\) en una cotización nueva/ });
  await expect(grupo).toContainText("los precios elegidos (se eligen de nuevo)");
  await evidencia(page, info, "02-duplicar-panel", true);
  await grupo.getByRole("button", { name: "Confirmar duplicado" }).click();
  const titulo = page.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ });
  await expect(titulo).not.toHaveText(new RegExp(folio));
  await expect(page.getByText(new RegExp(`Duplicada de el borrador guardado de ${folio}`))).toBeVisible();
  await expect(page.getByText(/elija los precios de cada insumo/)).toBeVisible();
  await evidencia(page, info, "03-cotizacion-duplicada", true);
});

test("tras emitir: preparar la versión nueva (conservar precios), calcular v2; duplicar la versión emitida", async ({ page, browser }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { id, folio } = await cotizacionConV1(page, `M15 emitida ${sufijo()}`);
  await emitirV1(page, browser, folio);
  await page.reload();
  const panel = page.locator(".panel-nueva-version");
  await expect(panel.getByRole("heading", { name: "Preparar la versión nueva" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calcular y guardar versión" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Preparar la versión nueva" }).click();
  await expect(panel.getByRole("alert")).toContainText("Elija el modo de precios");
  await panel.getByRole("radio", { name: /Conservar los precios de la versión emitida/ }).check();
  await panel.getByLabel(/Motivo de la versión nueva/).fill("Ajuste solicitado por el cliente tras la emisión.");
  await evidencia(page, info, "04-preparar-version-nueva", true);
  await panel.getByRole("button", { name: "Preparar la versión nueva" }).click();
  await expect(page.getByText(new RegExp(`Versión nueva preparada desde ${folio}-v1`))).toBeVisible();
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v2 guardada`)).toBeVisible();
  await evidencia(page, info, "05-v2-con-modo", true);

  // La versión emitida: sin vista previa (se descarga el original); duplicarla abre otra cotización.
  await page.goto(`/#/cotizaciones/${id}/v/1`);
  await expect(page.getByRole("heading", { level: 1, name: `Versión ${folio}-v1` })).toBeVisible();
  await expect(page.locator(".vista-previa-pdf")).toHaveCount(0);
  await page.getByRole("button", { name: "Duplicar esta versión…" }).click();
  await page.getByRole("button", { name: "Confirmar duplicado" }).click();
  await expect(page.getByText(new RegExp(`Duplicada de la versión ${folio}-v1`))).toBeVisible();
});

test("administradores: consultan la vista previa, pero no duplican", async ({ page, browser }) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { id, folio } = await cotizacionConV1(page, `M15 admin ${sufijo()}`);
  const admin = await otraPersona(browser, cuentasE2E().administrador);
  await admin.goto(`/#/cotizaciones/${id}/v/1`);
  await expect(admin.getByRole("heading", { level: 1, name: `Versión ${folio}-v1` })).toBeVisible();
  const descarga = admin.waitForEvent("download");
  await admin.locator(".vista-previa-pdf").getByRole("button", { name: "Descargar BORRADOR (PDF)" }).click();
  expect((await descarga).suggestedFilename()).toBe(`${folio}-v1-BORRADOR.pdf`);
  await expect(admin.getByRole("button", { name: "Duplicar esta versión…" })).toHaveCount(0);
  await admin.context().close();
});

test("390 px: preparar la versión nueva, duplicar y vista previa sin desborde, con teclado @movil", async ({ page, browser }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  const { folio } = await cotizacionConV1(page, `M15 movil ${sufijo()}`);
  await sinDesbordeHorizontal(page);
  await page.getByRole("button", { name: "Duplicar el borrador guardado…" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: /Duplicar el borrador guardado/ })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "06-duplicar-movil", true);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await emitirV1(page, browser, folio);
  await page.reload();
  await expect(page.locator(".panel-nueva-version")).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "07-preparar-movil", true);
});
