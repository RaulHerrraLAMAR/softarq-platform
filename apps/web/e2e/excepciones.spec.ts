/**
 * Excepciones B-22 (módulo 10, ADR-0014) contra la web compilada, la API real y softarq_test.
 * Recorrido 3 del libro con la excepción opcional de la guía («block, con 13 pza/m² y un motivo»):
 * el Preparador la registra; el Revisor ve BL-05 hasta autorizarla, después AV-04, y aprueba.
 * Pruebas AUTOMATIZADAS: no equivalen a la revisión personal ni a la ejecución formal de la guía.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "modulo10");
const MOTIVO = "Block de mayor formato verificado en obra por el residente.";

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 8);
const navegar = (p: Page, seccion: "Calculadora DEMO" | "Cotizaciones" | "Revisiones") =>
  p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion }).click();

async function otraPersona(browser: Browser, cuenta: CuentaE2E): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: 1440, height: 900 } });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta);
  return p;
}

/** Ejemplo 3 (muro de block) → «Guardar como cotización» con cliente y proyecto nuevos. */
async function cotizacionMuro(pagina: Page, nombre: string): Promise<string> {
  await navegar(pagina, "Calculadora DEMO");
  const volver = pagina.getByRole("button", { name: "Volver al inicio" });
  if (await volver.isVisible()) {
    await volver.click();
    await pagina.getByRole("group", { name: "Confirmar salida" }).getByRole("button", { name: "Descartar" }).click();
  }
  await cargarEjemplo(pagina, 3);
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
  return /COT-2026-\d{5}/.exec((await titulo.textContent()) ?? "")![0];
}

/** Registra la excepción de la guía: block (CMP-00011) con 13 pza/m² y motivo. */
async function registrarExcepcionBlock(pagina: Page): Promise<void> {
  const seccion = pagina.locator(".seccion-excepciones");
  await seccion.getByRole("button", { name: "Registrar excepción…" }).click();
  await seccion.getByRole("radio", { name: /Rendimiento o desperdicio de un componente/ }).check();
  const partida = seccion.getByLabel("Partida", { exact: true });
  const valorPartida = await partida.locator("option", { hasText: "Partida 1 · CON-00009" }).getAttribute("value");
  await partida.selectOption(valorPartida!);
  const componente = seccion.getByLabel("Componente", { exact: true });
  await expect(componente.locator("option", { hasText: "CMP-00011" })).toHaveCount(1);
  await componente.selectOption({ value: "CMP-00011" });
  await seccion.getByRole("radio", { name: "Rendimiento", exact: true }).check();
  await seccion.getByLabel("Valor aplicado en esta cotización").fill("13");
  await seccion.getByLabel("Motivo (obligatorio)").fill(MOTIVO);
  await seccion.getByRole("button", { name: "Revisar excepción" }).click();
  await seccion.getByRole("button", { name: "Agregar al borrador" }).click();
  await expect(seccion.getByText("Registrada · pendiente de autorización")).toBeVisible();
}

test("recorrido 3 con excepción: registrada → enviada → BL-05 → autorizada → AV-04 → aprobada por otra persona", async ({ page, browser }, info) => {
  const cuentas = cuentasE2E();
  await abrirConSesion(page, cuentas.preparador);
  const folio = await cotizacionMuro(page, `Excepción ${sufijo()}`);
  await registrarExcepcionBlock(page);
  await evidencia(page, info, "01-preparador-registra-excepcion", true);

  // La versión se calcula en el servidor con la excepción registrada (pendiente).
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await expect(page.locator(".resultado-guardado [data-prueba=total]")).not.toHaveText("$22,405.28");
  await page.getByRole("button", { name: `Enviar ${folio}-v1 a revisión…` }).click();
  await page.getByRole("button", { name: `Confirmar envío de ${folio}-v1` }).click();
  await expect(page.getByText(`${folio}-v1 está en revisión`)).toBeVisible();

  const revisor = await otraPersona(browser, cuentas.revisor);
  await navegar(revisor, "Revisiones");
  await revisor.getByRole("button", { name: "Actualizar" }).click();
  await revisor.getByRole("link", { name: `${folio}-v1` }).click();
  await expect(revisor.getByRole("heading", { level: 1, name: `Revisión de ${folio}-v1` })).toBeVisible();

  // Antes de decidir: la excepción con su valor de catálogo, el aplicado y el motivo; BL-05 vigente.
  const panelExc = revisor.locator(".seccion-excepciones");
  await expect(panelExc.getByRole("heading", { name: "Excepciones de la versión" })).toBeVisible();
  await expect(panelExc.getByText("12.5 pza")).toBeVisible();
  await expect(panelExc.getByText(MOTIVO)).toBeVisible();
  await expect(revisor.getByText(/no está autorizada por el revisor/).first()).toBeVisible();
  await evidencia(revisor, info, "02-revisor-ve-excepcion-y-bl05", true);

  // Aprobar sin autorizar: bloqueado, el estado no cambia.
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  await revisor.getByRole("button", { name: `Confirmar aprobación de ${folio}-v1` }).click();
  // Se espera la respuesta propia de la aprobación (422), no el BL-05 que la verificación ya mostraba:
  // así la autorización empieza después de conocer el resultado de aprobar.
  await expect(revisor.getByRole("alert").filter({ hasText: "No se puede aprobar; el estado no cambió." })).toBeVisible();
  await expect(revisor.getByRole("alert").filter({ hasText: "No se puede aprobar" })).toContainText("BL-05");
  await expect(revisor.getByText(new RegExp(`${folio}-v1 aprobada por`))).toHaveCount(0);

  // Autorizar con confirmación (teclado) y aprobar: AV-04 visible.
  await panelExc.getByRole("button", { name: "Autorizar excepción 1…" }).click();
  const confirmar = panelExc.getByRole("button", { name: "Confirmar autorización de la excepción 1" });
  await expect(confirmar).toBeFocused();
  await revisor.keyboard.press("Enter");
  await expect(panelExc.getByText("Excepción 1 autorizada.")).toBeVisible();
  // El bloqueo mostrado al intentar aprobar antes de autorizar deja de mostrarse (ya no vale).
  await expect(revisor.getByText("No se puede aprobar; el estado no cambió.")).toHaveCount(0);
  await expect(revisor.getByText(/AV-04/).first()).toBeVisible();
  await evidencia(revisor, info, "03-revisor-autoriza-av04", true);
  const cancelar = revisor.getByRole("button", { name: "Cancelar" });
  if (await cancelar.isVisible()) await cancelar.click();
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  await revisor.getByRole("button", { name: `Confirmar aprobación de ${folio}-v1` }).click();
  await expect(revisor.getByText(new RegExp(`${folio}-v1 aprobada por`)).first()).toBeVisible();
  await evidencia(revisor, info, "04-aprobada-con-excepcion", true);
  await revisor.context().close();
});

test("@movil registro de una excepción a 390 px con teclado, sin desbordes", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().preparador);
  await cotizacionMuro(page, `Móvil ${sufijo()}`);
  const seccion = page.locator(".seccion-excepciones");
  await seccion.getByRole("button", { name: "Registrar excepción…" }).focus();
  await page.keyboard.press("Enter");
  // El foco va al primer campo (tipo) y no hay ninguno preseleccionado.
  await expect(seccion.getByRole("radio").first()).toBeFocused();
  for (const r of await seccion.getByRole("radio").all()) await expect(r).not.toBeChecked();
  await seccion.getByRole("button", { name: "Revisar excepción" }).click();
  await expect(seccion.getByText("Revise la excepción; su captura se conserva.")).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "05-movil-formulario-excepcion", true);
  // Cancelar devuelve el foco al botón; después se registra completa.
  await seccion.getByRole("button", { name: "Cancelar" }).click();
  await expect(seccion.getByRole("button", { name: "Registrar excepción…" })).toBeFocused();
  await registrarExcepcionBlock(page);
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "06-movil-excepcion-registrada", true);
});
