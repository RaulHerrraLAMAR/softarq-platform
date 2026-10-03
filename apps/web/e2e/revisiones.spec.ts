/**
 * Revisión y aprobación (módulo 7, ADR-0009) contra la web compilada, la API real y softarq_test.
 * Preparador y Revisor inician sesión con el formulario normal, cada uno en su propio contexto.
 * Pruebas de navegador AUTOMATIZADAS: no equivalen a la revisión personal del propietario ni a la
 * ejecución formal de la guía manual.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { URL_API_E2E, abrirConSesion, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const RAIZ_REPO = join(import.meta.dirname, "..", "..", "..");
const CARPETA_M7 = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo7");

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_M7, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA_M7, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 8);
const navegar = (p: Page, seccion: "Calculadora DEMO" | "Cotizaciones" | "Revisiones") =>
  p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion }).click();
const estadoBorrador = (p: Page) => p.locator(".estado-borrador-linea");
const totalGuardado = (p: Page) => p.locator(".resultado-guardado [data-prueba=total]");

async function otraPersona(browser: Browser, cuenta: CuentaE2E): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: 1440, height: 900 } });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta);
  return p;
}

/** Ejemplo 1 → «Guardar como cotización» con cliente y proyecto nuevos → v1. Devuelve folio e id. */
async function cotizacionConV1(pagina: Page, nombre: string): Promise<{ id: string; folio: string }> {
  await navegar(pagina, "Calculadora DEMO");
  // La calculadora conserva su captura al navegar: si quedó una, se vuelve al inicio.
  const volver = pagina.getByRole("button", { name: "Volver al inicio" });
  if (await volver.isVisible()) {
    await volver.click();
    await pagina.getByRole("group", { name: "Confirmar salida" }).getByRole("button", { name: "Descartar" }).click();
  }
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
  const id = /#\/cotizaciones\/([0-9a-f-]{36})/.exec(pagina.url())![1]!;
  await pagina.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(pagina.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await expect(totalGuardado(pagina)).toHaveText("$54,190.68");
  return { id, folio };
}

async function enviar(pagina: Page, idVersion: string, total: string): Promise<void> {
  await pagina.getByRole("button", { name: `Enviar ${idVersion} a revisión…` }).click();
  const grupo = pagina.getByRole("group", { name: new RegExp(`Enviar ${idVersion} por ${total.replace(/[$.]/g, "\\$&")} a revisión`) });
  await expect(grupo).toBeVisible();
  await grupo.getByRole("button", { name: `Confirmar envío de ${idVersion}` }).click();
  await expect(pagina.getByText(`${idVersion} está en revisión`)).toBeVisible();
}

/** Abre una revisión desde la bandeja de pendientes. */
async function abrirDesdeBandeja(pagina: Page, idVersion: string): Promise<void> {
  await navegar(pagina, "Revisiones");
  await expect(pagina.getByRole("heading", { level: 1, name: "Revisiones" })).toBeVisible();
  await pagina.getByRole("button", { name: "Actualizar" }).click();
  await pagina.getByRole("link", { name: idVersion }).click();
  await expect(pagina.getByRole("heading", { level: 1, name: `Revisión de ${idVersion}` })).toBeVisible();
}

test("recorrido: captura pendiente → v2 → enviar → cambios solicitados → v3 → enviar → aprobación por otra persona", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConV1(page, `Revisión ${sufijo()}`);

  // Un cambio sin guardar, o guardado sin calcular, impide enviar: la v1 no lo incluye.
  const piezas = page.getByLabel(/Piezas del renglón 1/).first();
  await piezas.fill("2");
  const enviarV1 = page.getByRole("button", { name: `Enviar ${folio}-v1 a revisión…` });
  await expect(enviarV1).toBeDisabled();
  await expect(page.getByText("Hay cambios sin guardar: guárdelos y calcule una versión nueva antes de enviar.")).toBeVisible();
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 1");
  await expect(enviarV1).toBeDisabled();
  await expect(page.getByText(new RegExp(`cambió después de ${folio}-v1: calcule una versión nueva`))).toBeVisible();
  await evidencia(page, info, "01-envio-deshabilitado-pendiente-recalcular", true);
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v2 guardada`)).toBeVisible();
  const totalV2 = (await totalGuardado(page).textContent())!;

  // Enviar v2: la confirmación identifica folio, versión y total.
  await enviar(page, `${folio}-v2`, totalV2);
  await expect(page.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
  await evidencia(page, info, "02-en-revision-solo-lectura", true);

  // Revisor: bandeja → detalle → solicitar cambios.
  const revisor = await otraPersona(browser, cuentasE2E().revisor);
  await abrirDesdeBandeja(revisor, `${folio}-v2`);
  await expect(revisor.getByText("Sin bloqueos")).toBeVisible();
  await expect(revisor.locator("[data-prueba=total]").first()).toHaveText(totalV2);
  await evidencia(revisor, info, "03-revisor-detalle", true);
  await revisor.getByRole("button", { name: "Solicitar cambios…" }).click();
  await revisor.getByLabel(/Observaciones para el preparador/).fill("Revise las piezas del faldón norte: deben ser 3.");
  await revisor.getByRole("button", { name: "Confirmar solicitud de cambios" }).click();
  await expect(revisor.getByText(`Cambios solicitados en ${folio}-v2`)).toBeVisible();

  // Preparador: ve la decisión, corrige y envía v3.
  await page.reload();
  await expect(page.getByText("Cambios solicitados por [DEMO] Revisor 1")).toBeVisible();
  await expect(page.getByText("Revise las piezas del faldón norte: deben ser 3.").first()).toBeVisible();
  await evidencia(page, info, "04-preparador-cambios-solicitados", true);
  await page.getByLabel(/Piezas del renglón 1/).first().fill("3");
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v3 guardada`)).toBeVisible();
  const totalV3 = (await totalGuardado(page).textContent())!;
  await enviar(page, `${folio}-v3`, totalV3);

  // Revisor aprueba v3 tras confirmar folio, versión y total.
  await abrirDesdeBandeja(revisor, `${folio}-v3`);
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  const confirmacion = revisor.getByRole("group", { name: new RegExp(`Va a aprobar ${folio}-v3 por ${totalV3.replace(/[$.]/g, "\\$&")}`) });
  await expect(confirmacion).toContainText("La aprobación no es una emisión ni una entrega al cliente.");
  await evidencia(revisor, info, "05-confirmar-aprobacion");
  await confirmacion.getByRole("button", { name: `Confirmar aprobación de ${folio}-v3` }).click();
  await expect(revisor.getByText(`${folio}-v3 aprobada por [DEMO] Revisor 1`)).toBeVisible();
  await evidencia(revisor, info, "06-aprobada", true);

  // Preparador: estado exacto de cada versión.
  await page.reload();
  await expect(page.getByText(`${folio}-v3 aprobada por [DEMO] Revisor 1`)).toBeVisible();
  const filas = page.locator(".panel-guardar table tbody tr");
  await expect(filas.nth(0)).toContainText("Aprobada por [DEMO] Revisor 1");
  await expect(filas.nth(1)).toContainText("Borrador · cambios solicitados");
  await expect(filas.nth(2)).toContainText("Borrador calculado · sin enviar a revisión");
  await evidencia(page, info, "07-preparador-aprobada", true);
  await revisor.context().close();
});

test("BL-17: quien preparó la versión no puede aprobarla aunque tenga la función de Revisor; otra persona sí", async ({ page, browser }, info) => {
  const ambas = cuentasE2E().ambas;
  await abrirConSesion(page, ambas);
  const { folio } = await cotizacionConV1(page, `BL17 ${sufijo()}`);
  await enviar(page, `${folio}-v1`, "$54,190.68");
  await page.getByRole("link", { name: "Abrir la revisión" }).first().click();
  await expect(page.getByText("No puede aprobar esta versión")).toBeVisible();
  await expect(page.getByText(/BL-17: usted preparó esta versión/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar…" })).toHaveCount(0);
  await evidencia(page, info, "08-bl17-sin-aprobar", true);

  // Intento directo contra la API con su propia sesión: 422 BL-17.
  const sesion = await page.request.get(`${URL_API_E2E}/api/v1/auth/sesion`);
  const csrf = ((await sesion.json()) as { csrfToken: string }).csrfToken;
  const id = /#\/revisiones\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  const det = (await (await page.request.get(`${URL_API_E2E}/api/v1/revisiones/${id}`)).json()) as {
    revision: { revision: number; version: { id: string } };
  };
  const directo = await page.request.post(`${URL_API_E2E}/api/v1/revisiones/${id}/decision`, {
    headers: { "X-CSRF-Token": csrf, Origin: "http://localhost:4173", "Idempotency-Key": crypto.randomUUID() },
    data: { decision: "APROBAR", versionId: det.revision.version.id, revision: det.revision.revision },
  });
  expect(directo.status()).toBe(422);
  expect(((await directo.json()) as { error: { codigo: string } }).error.codigo).toBe("DECISION_BLOQUEADA");

  const revisor = await otraPersona(browser, cuentasE2E().revisor);
  await abrirDesdeBandeja(revisor, `${folio}-v1`);
  await revisor.getByRole("button", { name: "Aprobar…" }).click();
  await revisor.getByRole("button", { name: `Confirmar aprobación de ${folio}-v1` }).click();
  await expect(revisor.getByText(`${folio}-v1 aprobada por [DEMO] Revisor 1`)).toBeVisible();
  await revisor.context().close();
});

test("pantalla obsoleta: otra persona decidió antes; el conflicto conserva lo escrito y permite actualizar", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConV1(page, `Obsoleta ${sufijo()}`);
  await enviar(page, `${folio}-v1`, "$54,190.68");

  const revisorA = await otraPersona(browser, cuentasE2E().revisor);
  await abrirDesdeBandeja(revisorA, `${folio}-v1`);
  // Otra persona con función de revisor aprueba primero.
  const revisorB = await otraPersona(browser, cuentasE2E().ambas);
  await abrirDesdeBandeja(revisorB, `${folio}-v1`);
  await revisorB.getByRole("button", { name: "Aprobar…" }).click();
  await revisorB.getByRole("button", { name: `Confirmar aprobación de ${folio}-v1` }).click();
  await expect(revisorB.getByText(`${folio}-v1 aprobada por [DEMO] Preparador y revisor E2E`)).toBeVisible();

  // La primera pantalla sigue mostrando «pendiente»: su decisión recibe 409.
  await revisorA.getByRole("button", { name: "Solicitar cambios…" }).click();
  await revisorA.getByLabel(/Observaciones para el preparador/).fill("Falta el transporte del segundo viaje.");
  await revisorA.getByRole("button", { name: "Confirmar solicitud de cambios" }).click();
  const alerta = revisorA.getByRole("alert").filter({ hasText: "La revisión cambió mientras la tenía abierta" });
  await expect(alerta).toContainText("Aprobada");
  await expect(alerta).toContainText("Sus observaciones se conservan");
  await expect(revisorA.getByLabel(/Observaciones para el preparador/)).toHaveValue("Falta el transporte del segundo viaje.");
  await evidencia(revisorA, info, "09-conflicto-pantalla-obsoleta", true);
  await alerta.getByRole("button", { name: "Actualizar" }).click();
  await expect(revisorA.getByText("Aprobada por [DEMO] Preparador y revisor E2E")).toBeVisible();
  await revisorA.context().close();
  await revisorB.context().close();
});

test("respuesta atrasada de otra revisión: no reemplaza la pantalla actual", async ({ page }) => {
  await abrirConSesion(page);
  const a = await cotizacionConV1(page, `Atrasada A ${sufijo()}`);
  await enviar(page, `${a.folio}-v1`, "$54,190.68");
  const b = await cotizacionConV1(page, `Atrasada B ${sufijo()}`);
  await enviar(page, `${b.folio}-v1`, "$54,190.68");
  await navegar(page, "Revisiones");
  const enlaceA = page.getByRole("link", { name: `${a.folio}-v1` });
  const enlaceB = page.getByRole("link", { name: `${b.folio}-v1` });
  await expect(enlaceA).toBeVisible();
  // La respuesta del detalle de A llega tarde (2 s); mientras tanto se abre B.
  await page.route(/\/api\/v1\/revisiones\/[0-9a-f-]{36}$/, async (ruta) => {
    const respuesta = await ruta.fetch();
    const cuerpo = await respuesta.text();
    if (cuerpo.includes(`${a.folio}-v1`)) await new Promise((r) => setTimeout(r, 2000));
    // Si la página ya canceló la solicitud, no hay nada que responder.
    await ruta.fulfill({ response: respuesta, body: cuerpo }).catch(() => undefined);
  });
  await enlaceA.click();
  await page.goBack();
  await enlaceB.click();
  await expect(page.getByRole("heading", { level: 1, name: `Revisión de ${b.folio}-v1` })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByRole("heading", { level: 1, name: `Revisión de ${b.folio}-v1` })).toBeVisible();
  await expect(page.getByText(`${a.folio}-v1`)).toHaveCount(0);
});

test("pantalla estrecha: bandeja y detalle de revisión sin desbordamiento horizontal @movil", async ({ page }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConV1(page, `Movil ${sufijo()}`);
  await enviar(page, `${folio}-v1`, "$54,190.68");
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "10-cotizacion-en-revision", true);
  await navegar(page, "Revisiones");
  await expect(page.getByRole("link", { name: `${folio}-v1` })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "11-bandeja", true);
  await page.getByRole("link", { name: `${folio}-v1` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Revisión de ${folio}-v1` })).toBeVisible();
  await page.getByRole("button", { name: "Retirar la revisión…" }).click();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "12-detalle-retirar", true);
  await page.getByRole("button", { name: "Confirmar retirada" }).click();
  await expect(page.getByText(`Revisión de ${folio}-v1 retirada`)).toBeVisible();
});
