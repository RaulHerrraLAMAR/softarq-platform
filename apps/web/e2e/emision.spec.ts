/**
 * Emisión, PDF DEMO, anulación y descarte (módulo 8, ADR-0010) contra la web compilada, la API real,
 * softarq_test y la carpeta de documentos EXCLUSIVA de estas pruebas (_work\pruebas\documentos-e2e).
 * Preparador y Revisor inician sesión con el formulario normal, cada uno en su propio contexto.
 * Pruebas de navegador AUTOMATIZADAS: no equivalen a la revisión personal del propietario ni a la
 * ejecución formal de la guía manual.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { URL_API_E2E, abrirConSesion, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const RAIZ_REPO = join(import.meta.dirname, "..", "..", "..");
const CARPETA_M8 = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo8");
const DOCUMENTOS_E2E = join(RAIZ_REPO, "..", "_work", "pruebas", "documentos-e2e");

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_M8, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA_M8, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 7);
const navegar = (p: Page, seccion: "Calculadora DEMO" | "Cotizaciones" | "Revisiones" | "Emisor") =>
  p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion }).click();
const totalGuardado = (p: Page) => p.locator(".resultado-guardado [data-prueba=total]");
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function otraPersona(browser: Browser, cuenta: CuentaE2E, ancho = 1440): Promise<Page> {
  const contexto = await browser.newContext({
    baseURL: "http://localhost:4173",
    locale: "es-MX",
    viewport: { width: ancho, height: ancho > 500 ? 900 : 844 },
    acceptDownloads: true,
  });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta);
  return p;
}

/**
 * Ejemplo 1 → «Guardar como cotización» con cliente (con o sin contacto) y proyecto completo → v1.
 * Los textos DEMO de la versión los copia el servidor al crear la cotización.
 */
async function cotizacionConV1(pagina: Page, nombre: string, conContacto = true): Promise<{ id: string; folio: string }> {
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
  if (conContacto) {
    await pagina.getByLabel("Nombre del contacto").fill("Begoña Muñoz Íñiguez");
    await pagina.getByLabel("Teléfono").fill("55 1234 5678");
  }
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
  // Textos de la versión: copiados (DEMO) al crear; se ven y se editan en el borrador.
  await expect(pagina.getByLabel("Alcance")).toHaveValue(/^\[DEMO\] Texto ilustrativo de alcance/);
  await pagina.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(pagina.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await expect(totalGuardado(pagina)).toHaveText("$54,190.68");
  return { id, folio };
}

async function enviar(pagina: Page, idVersion: string): Promise<void> {
  await pagina.getByRole("button", { name: `Enviar ${idVersion} a revisión…` }).click();
  await pagina.getByRole("button", { name: `Confirmar envío de ${idVersion}` }).click();
  await expect(pagina.getByText(`${idVersion} está en revisión`)).toBeVisible();
}

async function aprobarComo(revisor: Page, idVersion: string, info?: TestInfo): Promise<void> {
  await navegar(revisor, "Revisiones");
  await revisor.getByRole("button", { name: "Pendientes" }).click();
  await revisor.getByRole("button", { name: "Actualizar" }).click();
  await revisor.getByRole("link", { name: idVersion }).click();
  await expect(revisor.getByRole("heading", { level: 1, name: `Revisión de ${idVersion}` })).toBeVisible();
  // El revisor ve los textos de la versión antes de aprobar.
  await expect(revisor.getByRole("heading", { name: /Textos de la versión/ })).toBeVisible();
  await expect(revisor.getByText(/^\[DEMO\] Texto ilustrativo de alcance/)).toBeVisible();
  if (info) await evidencia(revisor, info, "02-revisor-ve-textos-antes-de-aprobar", true);
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  await revisor.getByRole("button", { name: `Confirmar aprobación de ${idVersion}` }).click();
  await expect(revisor.getByText(new RegExp(`${escapar(idVersion)} aprobada por`)).first()).toBeVisible();
}

async function emitirDesde(pagina: Page, idVersion: string, destinatario: RegExp): Promise<void> {
  const emision = pagina.locator(".seccion-emision");
  await expect(emision.getByRole("heading", { name: `Emisión de ${idVersion}` })).toBeVisible();
  await emision.getByRole("button", { name: `Emitir ${idVersion}…` }).click();
  const grupo = emision.getByRole("group", { name: new RegExp(`Emitir ${escapar(idVersion)} por \\$54,190\\.68`) });
  await expect(grupo).toContainText(destinatario);
  await grupo.getByRole("button", { name: `Confirmar emisión de ${idVersion}` }).click();
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

test("recorrido: preparar con textos → aprobar (otra persona) → emitir (Preparador) → descargar el PDF con el hash registrado", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConV1(page, `Emisión ${sufijo()}`);
  await evidencia(page, info, "01-textos-de-la-version", true);
  await enviar(page, `${folio}-v1`);

  const revisor = await otraPersona(browser, cuentasE2E().revisor);
  await aprobarComo(revisor, `${folio}-v1`, info);

  // Aprobada no es emitida: el Preparador ve la emisión pendiente y la validación sin bloqueos.
  await page.reload();
  await expect(page.getByText(`${folio}-v1 aprobada por [DEMO] Revisor 1`)).toBeVisible();
  const seccion = page.locator(".seccion-emision");
  await expect(seccion.getByText(/Fecha de emisión: 25\/09\/2026; vigente hasta 10\/10\/2026 \(15 días naturales\)/)).toBeVisible();
  await expect(seccion.getByText(/Begoña Muñoz Íñiguez · 55 1234 5678/)).toBeVisible();
  await evidencia(page, info, "03-validacion-antes-de-emitir", true);
  await emitirDesde(page, `${folio}-v1`, /Construcción Peñasco.*Begoña Muñoz Íñiguez/);
  const tarjeta = page.getByLabel(`Documento emitido de ${folio}-v1`);
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.getByText("Emitida", { exact: true })).toBeVisible();
  await expect(tarjeta).toContainText("[DEMO] Preparador 1 · [DEMO] Revisor 1 · [DEMO] Preparador 1");
  await expect(page.getByText(`${folio}-v1 emitida por [DEMO] Preparador 1`)).toBeVisible();
  await evidencia(page, info, "04-emitida-con-documento", true);

  // Descarga autenticada: el archivo emitido, con el SHA-256 registrado.
  const espera = page.waitForEvent("download");
  await tarjeta.getByRole("button", { name: "Descargar PDF" }).click();
  const descarga = await espera;
  expect(descarga.suggestedFilename()).toBe(`${folio}-v1.pdf`);
  const destino = join(CARPETA_M8, `${info.project.name}-${folio}-v1.pdf`);
  mkdirSync(CARPETA_M8, { recursive: true });
  await descarga.saveAs(destino);
  const bytes = readFileSync(destino);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const detalle = await page.request.get(`${URL_API_E2E}/api/v1/cotizaciones/${id}`);
  const emision = (await detalle.json()).versiones[0].emision;
  expect(emision.archivo.sha256).toBe(sha256(bytes));
  expect(emision.archivo.bytes).toBe(bytes.length);
  // Sin sesión no se descarga (no hay URL pública).
  const anonima = await (await browser.newContext()).request.get(`${URL_API_E2E}/api/v1/emisiones/${emision.id}/documento`);
  expect(anonima.status()).toBe(401);
});

test("el Revisor anula la aprobación con motivo; se envía otra vez, se aprueba y emite un Revisor distinto del autor", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConV1(page, `Anulación ${sufijo()}`);
  await enviar(page, `${folio}-v1`);
  const revisor = await otraPersona(browser, cuentasE2E().revisor);
  await aprobarComo(revisor, `${folio}-v1`);

  await revisor.getByRole("button", { name: "Anular la aprobación…" }).click();
  await revisor.getByLabel(/Motivo de la anulación/).fill("corto");
  await revisor.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(revisor.getByText(/al menos 10 caracteres/)).toBeVisible();
  await revisor.getByLabel(/Motivo de la anulación/).fill("El cliente pidió revisar el alcance antes de emitir.");
  await revisor.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(revisor.getByText("Aprobación anulada por [DEMO] Revisor 1")).toBeVisible();
  await expect(revisor.getByText("Aprobación anulada", { exact: true })).toBeVisible(); // evento nuevo en el historial
  await evidencia(revisor, info, "05-aprobacion-anulada", true);

  // El Preparador ve la anulación, ya no puede emitir y vuelve a enviar la misma versión.
  await page.reload();
  await expect(page.getByText("Aprobación anulada por [DEMO] Revisor 1")).toBeVisible();
  await expect(page.locator(".seccion-emision")).toHaveCount(0);
  await enviar(page, `${folio}-v1`);
  await aprobarComo(revisor, `${folio}-v1`);

  // Emite el Revisor (no es el autor), desde la cotización en consulta.
  await revisor.getByRole("link", { name: "Abrir la cotización" }).click();
  await emitirDesde(revisor, `${folio}-v1`, /Begoña Muñoz Íñiguez/);
  await expect(revisor.getByLabel(`Documento emitido de ${folio}-v1`)).toContainText("[DEMO] Preparador 1 · [DEMO] Revisor 1 · [DEMO] Revisor 1");
});

test("datos que faltan: sin contacto no se emite; al completarlo en la ficha del cliente se vuelve a validar y se emite", async ({ page, browser }) => {
  await abrirConSesion(page);
  const nombre = `Contacto ${sufijo()}`;
  const { folio } = await cotizacionConV1(page, nombre, false);
  await enviar(page, `${folio}-v1`);
  await aprobarComo(await otraPersona(browser, cuentasE2E().revisor), `${folio}-v1`);
  await page.reload();
  const seccion = page.locator(".seccion-emision");
  await expect(seccion.getByText(/bloqueo\(s\): no se puede emitir/)).toBeVisible();
  await expect(seccion.getByText(/no tiene nombre de contacto/)).toBeVisible();
  await expect(seccion.getByText(/Complete el contacto en la ficha del cliente/).first()).toBeVisible();
  await expect(seccion.getByRole("button", { name: `Emitir ${folio}-v1…` })).toBeDisabled();

  // Completar el contacto (dato actual que se congela al emitir).
  await page.getByRole("link", { name: new RegExp(`Construcción Peñasco ${nombre}`) }).click();
  await page.getByRole("button", { name: "Editar datos y contacto" }).click();
  await page.getByLabel("Nombre del contacto").fill("Íñigo Ñúñez");
  await page.getByLabel("Correo").fill("inigo@ejemplo.invalid");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cliente actualizado.")).toBeVisible();
  await page.goBack();
  await page.locator(".seccion-emision").getByRole("button", { name: "Volver a validar" }).click();
  await emitirDesde(page, `${folio}-v1`, /Íñigo Ñúñez/);
  await expect(page.getByLabel(`Documento emitido de ${folio}-v1`)).toBeVisible();
});

test("un fallo de generación no emite, conserva el contexto y el reintento emite una sola vez", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConV1(page, `Fallo ${sufijo()}`);
  await enviar(page, `${folio}-v1`);
  await aprobarComo(await otraPersona(browser, cuentasE2E().revisor), `${folio}-v1`);
  await page.reload();
  // El servidor de pruebas falla UNA vez la próxima generación si existe esta marca.
  writeFileSync(join(DOCUMENTOS_E2E, "fallar-proxima-generacion"), "1");
  await emitirDesde(page, `${folio}-v1`, /Begoña/);
  const alerta = page.getByRole("alert").filter({ hasText: "No se emitió" });
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText(/la versión sigue aprobada y sin emitir/i);
  await expect(page.getByLabel(`Documento emitido de ${folio}-v1`)).toHaveCount(0);
  await evidencia(page, info, "06-fallo-de-generacion", true);
  await alerta.getByRole("button", { name: "Reintentar (sin duplicar)" }).click();
  await expect(page.getByLabel(`Documento emitido de ${folio}-v1`)).toBeVisible();
  const d = await (await page.request.get(`${URL_API_E2E}/api/v1/cotizaciones/${id}`)).json();
  expect(d.versiones.filter((v: { emision: unknown }) => v.emision)).toHaveLength(1);
});

test("descarte con motivo: el folio se conserva y la cotización queda en solo lectura", async ({ page }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConV1(page, `Descarte ${sufijo()}`);
  await page.getByRole("button", { name: "Descartar la cotización…" }).click();
  await page.getByLabel(/Motivo del descarte/).fill("El cliente desistió del proyecto.");
  await page.getByRole("button", { name: `Confirmar descarte de ${folio}` }).click();
  await expect(page.getByText(`${folio} está descartada`)).toBeVisible();
  await expect(page.getByText("El cliente desistió del proyecto.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calcular y guardar versión" })).toHaveCount(0);
  await expect(page.getByText("Descartado", { exact: true })).toBeVisible();
  await evidencia(page, info, "07-descartada-solo-lectura", true);
});

test("390 px: emisión, documento y descarte sin desbordes @movil", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConV1(page, `Móvil ${sufijo()}`);
  await enviar(page, `${folio}-v1`);
  await aprobarComo(await otraPersona(browser, cuentasE2E().revisor, 390), `${folio}-v1`);
  await page.reload();
  await page.locator(".seccion-emision").scrollIntoViewIfNeeded();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "10-emision-validacion", true);
  await emitirDesde(page, `${folio}-v1`, /Begoña/);
  await expect(page.getByLabel(`Documento emitido de ${folio}-v1`)).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "11-emitida", true);
  await navegar(page, "Emisor");
  await expect(page.getByRole("heading", { level: 1, name: "Emisor" })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "12-emisor", true);
});
