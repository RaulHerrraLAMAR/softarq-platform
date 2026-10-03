/**
 * Clientes, proyectos y cotizaciones con folio, borrador y versiones (módulo 6, ADR-0008), contra
 * la web compilada, la API real y softarq_test. Pruebas de navegador AUTOMATIZADAS: no equivalen a
 * la revisión personal del propietario ni a la ejecución formal de la guía manual.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { CORS, URL_API_E2E, abrirConSesion, ajustarBase, cargarEjemplo, cuentasE2E, sinDesbordeHorizontal } from "./apoyo.ts";

const RAIZ_REPO = join(import.meta.dirname, "..", "..", "..");
const CARPETA_M6 = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo6");
const CARPETA_M7 = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo7");
const ORIGEN_WEB = "http://localhost:4173";

async function evidenciaM6(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_M6, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA_M6, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

async function evidenciaM7(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_M7, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA_M7, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 8);
const estadoBorrador = (p: Page) => p.locator(".estado-borrador-linea");
const totalGuardado = (p: Page) => p.locator(".resultado-guardado [data-prueba=total]");
const navegar = (p: Page, seccion: "Calculadora DEMO" | "Cotizaciones" | "Clientes" | "Proyectos") =>
  p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion }).click();

/** Ejemplo 1 en la calculadora → «Guardar como cotización» con cliente y proyecto nuevos. Devuelve el id. */
async function cotizacionConEjemplo1(pagina: Page, nombre: string): Promise<{ id: string; folio: string }> {
  await navegar(pagina, "Calculadora DEMO");
  await cargarEjemplo(pagina, 1);
  await pagina.getByRole("button", { name: "Guardar como cotización" }).click();
  await expect(pagina.getByRole("heading", { name: "Nueva cotización" })).toBeVisible();
  await expect(pagina.getByText("Se guardará la captura de la calculadora")).toBeVisible();

  await pagina.getByRole("button", { name: "Nuevo cliente" }).click();
  await pagina.getByLabel("Nombre o razón social").fill(`[DEMO] Cliente ${nombre}`);
  await pagina.getByRole("button", { name: "Crear cliente" }).click();
  await expect(pagina.getByRole("radio", { name: new RegExp(`Cliente ${nombre}`) })).toBeChecked();

  await pagina.getByRole("button", { name: "Nuevo proyecto" }).click();
  await pagina.getByLabel("Nombre del proyecto").fill(`[DEMO] Obra ${nombre}`);
  await pagina.getByLabel("Municipio").fill("Querétaro");
  await pagina.getByLabel("Entidad federativa").fill("Querétaro");
  await pagina.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(pagina.getByRole("radio", { name: new RegExp(`Obra ${nombre}`) })).toBeChecked();

  await pagina.getByRole("button", { name: "Crear cotización" }).click();
  const titulo = pagina.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ });
  await expect(titulo).toBeVisible();
  await expect(estadoBorrador(pagina)).toContainText("Guardado · revisión 0");
  const folio = /COT-2026-\d{5}/.exec((await titulo.textContent()) ?? "")![0];
  const id = /#\/cotizaciones\/([0-9a-f-]{36})/.exec(pagina.url())![1]!;
  return { id, folio };
}

/** Token CSRF de la sesión del contexto (para intentos directos contra la API). */
async function csrfDe(api: APIRequestContext): Promise<string> {
  const r = await api.get(`${URL_API_E2E}/api/v1/auth/sesion`);
  expect(r.status()).toBe(200);
  return ((await r.json()) as { csrfToken: string }).csrfToken;
}

test("recorrido: captura de la calculadora → cliente, proyecto y folio → borrador al recargar → v1 → edición → v2 con v1 intacta", async ({ page }, info) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConEjemplo1(page, `Recorrido ${sufijo()}`);
  await expect(page.getByText("WEB DEMO").first()).toBeVisible();
  await evidenciaM6(page, info, "01-borrador-creado", true);

  // Recargar: se recupera lo persistido (misma ruta, misma captura, sin cambios pendientes).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: `Cotización ${folio}` })).toBeVisible();
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 0");
  // La captura del Ejemplo 1 se recuperó del servidor (la descripción del renglón es el valor de un campo).
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "Faldón norte")))
    .toBe(true);

  // v1: el servidor calcula con el borrador guardado y devuelve lo almacenado.
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await expect(totalGuardado(page)).toHaveText("$54,190.68");
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 0");
  await evidenciaM6(page, info, "02-v1-guardada", true);

  // Edición: cambios sin guardar; guardar versión guarda antes el borrador y crea v2.
  const piezas = page.getByLabel(/Piezas del renglón 1/).first();
  await piezas.fill("3");
  await expect(estadoBorrador(page)).toHaveText("Cambios sin guardar.");
  await expect(page.getByText(/no incluyen los cambios sin guardar/)).toBeVisible();
  await page.getByLabel("Motivo de la versión").fill("Tres faldones en el eje norte");
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v2 guardada`)).toBeVisible();
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 1");
  const totalV2 = await totalGuardado(page).textContent();
  expect(totalV2).not.toBe("$54,190.68");
  await expect(page.getByRole("link", { name: `${folio}-v1`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `${folio}-v2`, exact: true })).toBeVisible();
  await evidenciaM6(page, info, "03-v2-guardada", true);

  // v1 sigue igual y se muestra sin recalcular.
  await page.getByRole("link", { name: `${folio}-v1`, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Versión ${folio}-v1` })).toBeVisible();
  await expect(page.getByText("Registro histórico: se muestra tal como se guardó")).toBeVisible();
  await expect(page.locator(".panel-resultado [data-prueba=total]")).toHaveText("$54,190.68");
  await evidenciaM6(page, info, "04-v1-consultada", true);
  await page.getByRole("link", { name: "Volver a la cotización" }).click();
  await expect(page.getByText(/La v2 corresponde a la captura guardada \(revisión 1\)/)).toBeVisible();

  // La lista de cotizaciones muestra el folio con su origen y la última versión.
  await navegar(page, "Cotizaciones");
  await page.getByLabel("Buscar por folio, cliente o proyecto").fill(folio);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("link", { name: folio })).toBeVisible();
  await expect(page.locator("tbody")).toContainText(`v2 · ${totalV2}`);
  await evidenciaM6(page, info, "05-lista-cotizaciones");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
});

test("borrador incompleto: se guarda y se recupera sin total; versionarlo no crea ninguna versión", async ({ page }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConEjemplo1(page, `Incompleto ${sufijo()}`);
  await page.getByLabel(/Piezas del renglón 1/).first().fill("");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 1");
  await expect(page.getByText(/A lo guardado le faltan 1 datos para calcular/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: `Cotización ${folio}` })).toBeVisible();
  await expect(page.getByLabel(/Piezas del renglón 1/).first()).toHaveValue("");
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText("Captura incompleta: no se guardó ninguna versión")).toBeVisible();
  await expect(page.getByText("Aún no hay versiones. Una versión se guarda")).toBeVisible();
  await expect(page.locator(".panel-guardar [data-prueba=total]")).toHaveCount(0);
  await evidenciaM6(page, info, "06-incompleta", true);
});

test("dos pestañas: la edición obsoleta da conflicto recuperable, sin pérdida silenciosa", async ({ page, context }, info) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConEjemplo1(page, `Pestañas ${sufijo()}`);
  const otra = await context.newPage();
  await otra.goto(`/#/cotizaciones/${id}`);
  await expect(otra.getByRole("heading", { level: 1, name: `Cotización ${folio}` })).toBeVisible();
  await expect(estadoBorrador(otra)).toContainText("Guardado · revisión 0");

  // Pestaña A guarda primero.
  await page.getByLabel(/Piezas del renglón 1/).first().fill("4");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 1");

  // Pestaña B, con la revisión 0, intenta guardar otro cambio: conflicto y sus cambios siguen.
  await otra.getByLabel(/Piezas del renglón 1/).first().fill("7");
  await otra.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(otra.getByText("Otra pestaña o persona guardó este borrador antes")).toBeVisible();
  await expect(otra.getByLabel(/Piezas del renglón 1/).first()).toHaveValue("7");
  await otra.getByRole("button", { name: "Comparar" }).click();
  await expect(otra.getByRole("list", { name: /Diferencias/ })).toContainText("Partida 1: datos distintos");
  await evidenciaM6(otra, info, "07-conflicto");

  // Recargar la versión guardada (con confirmación) muestra lo de la pestaña A.
  await otra.getByRole("button", { name: "Recargar la versión guardada" }).click();
  await otra.getByRole("button", { name: "Descartar y recargar" }).click();
  await expect(estadoBorrador(otra)).toContainText("Guardado · revisión 1");
  await expect(otra.getByLabel(/Piezas del renglón 1/).first()).toHaveValue("4");
  await otra.close();
});

test("doble envío y respuesta perdida: el reintento con la misma clave no duplica la versión", async ({ page }) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConEjemplo1(page, `Reintento ${sufijo()}`);
  const claves: string[] = [];
  // La solicitud llega al servidor y se guarda, pero la respuesta no llega al navegador.
  await page.route("**/api/v1/cotizaciones/*/versiones", async (ruta) => {
    claves.push(ruta.request().headers()["idempotency-key"] ?? "");
    await ruta.fetch();
    await ruta.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Calcular y guardar versión" }).dblclick();
  await expect(page.getByRole("button", { name: "Reintentar (sin duplicar)" })).toBeVisible();
  await page.unroute("**/api/v1/cotizaciones/*/versiones");
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/versiones")) claves.push(r.headers()["idempotency-key"] ?? "");
  });
  await page.getByRole("button", { name: "Reintentar (sin duplicar)" }).click();
  await expect(page.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  expect(new Set(claves).size).toBe(1);
  expect(claves[0]).toMatch(/^[0-9a-f-]{36}$/);

  const detalle = await page.request.get(`${URL_API_E2E}/api/v1/cotizaciones/${id}`);
  expect(((await detalle.json()) as { versiones: unknown[] }).versiones).toHaveLength(1);
});

test("token CSRF caducado: se renueva y se reintenta una vez con la misma clave, sin duplicar", async ({ page }) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConEjemplo1(page, `CSRF ${sufijo()}`);
  const claves: string[] = [];
  let primera = true;
  await page.route("**/api/v1/cotizaciones/*/versiones", async (ruta) => {
    if (ruta.request().method() !== "POST") return ruta.fallback();
    claves.push(ruta.request().headers()["idempotency-key"] ?? "");
    if (primera) {
      primera = false;
      // Como tras un reinicio de la API: el token CSRF ya no es válido.
      return ruta.fulfill({
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: { codigo: "CSRF_NO_VALIDO", mensaje: "CSRF", solicitudId: "e2e" } }),
      });
    }
    return ruta.continue();
  });
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  expect(claves).toHaveLength(2);
  expect(claves[0]).toBe(claves[1]);
  const detalle = await page.request.get(`${URL_API_E2E}/api/v1/cotizaciones/${id}`);
  expect(((await detalle.json()) as { versiones: unknown[] }).versiones).toHaveLength(1);
});

test("Revisor: consulta cotizaciones y versiones sin controles; la API rechaza sus escrituras directas", async ({ page, browser }, info) => {
  await abrirConSesion(page);
  const { id, folio } = await cotizacionConEjemplo1(page, `Revisor ${sufijo()}`);
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();

  const contexto = await browser.newContext({ baseURL: ORIGEN_WEB, locale: "es-MX" });
  const revisor = await contexto.newPage();
  await abrirConSesion(revisor, cuentasE2E().revisor);
  await navegar(revisor, "Cotizaciones");
  await expect(revisor.getByRole("link", { name: "Nueva cotización" })).toHaveCount(0);
  await revisor.getByLabel("Buscar por folio, cliente o proyecto").fill(folio);
  await revisor.getByRole("button", { name: "Buscar" }).click();
  await revisor.getByRole("link", { name: folio }).click();
  await expect(revisor.getByText(/su función permite ver la cotización y sus versiones/)).toBeVisible();
  await expect(revisor.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
  await expect(revisor.getByRole("button", { name: /Calcular/ })).toHaveCount(0);
  await expect(revisor.getByRole("link", { name: `${folio}-v1`, exact: true })).toBeVisible();
  await evidenciaM6(revisor, info, "08-revisor-consulta", true);
  await revisor.getByRole("link", { name: `${folio}-v1`, exact: true }).click();
  await expect(revisor.locator(".panel-resultado [data-prueba=total]")).toHaveText("$54,190.68");

  // Intentos directos con su sesión y su token CSRF: 403 SIN_PERMISO.
  const token = await csrfDe(contexto.request);
  const cabeceras = { Origin: ORIGEN_WEB, "X-CSRF-Token": token, "Content-Type": "application/json" };
  const put = await contexto.request.put(`${URL_API_E2E}/api/v1/cotizaciones/${id}/borrador`, {
    headers: cabeceras,
    data: { revision: 0, captura: { consolidarCompras: null, partidas: [], seleccion: [] } },
  });
  expect(put.status()).toBe(403);
  const version = await contexto.request.post(`${URL_API_E2E}/api/v1/cotizaciones/${id}/versiones`, {
    headers: { ...cabeceras, "Idempotency-Key": crypto.randomUUID() },
    data: { revisionBorrador: 0 },
  });
  expect(version.status()).toBe(403);
  expect(((await version.json()) as { error: { codigo: string } }).error.codigo).toBe("SIN_PERMISO");
  await contexto.close();
});

test("cerrar sesión descarta el borrador en pantalla; al volver a entrar se recupera del servidor", async ({ page }) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConEjemplo1(page, `Cierre ${sufijo()}`);
  await page.getByLabel(/Piezas del renglón 1/).first().fill("9");
  await expect(estadoBorrador(page)).toHaveText("Cambios sin guardar.");
  // Navegar con cambios sin guardar pide confirmación (no se descarta en silencio).
  await navegar(page, "Clientes");
  await expect(page.getByText("Hay cambios sin guardar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page.getByLabel(/Piezas del renglón 1/).first()).toHaveValue("9");

  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByText(folio)).toHaveCount(0);
  await abrirConSesion(page);
  await navegar(page, "Cotizaciones");
  await page.getByLabel("Buscar por folio, cliente o proyecto").fill(folio);
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("link", { name: folio }).click();
  await expect(estadoBorrador(page)).toContainText("Guardado · revisión 0");
  await expect(page.getByLabel(/Piezas del renglón 1/).first()).not.toHaveValue("9");
});

test("pantalla estrecha: clientes, cotización y versión sin desbordamiento horizontal @movil", async ({ page }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConEjemplo1(page, `Movil ${sufijo()}`);
  await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
  await expect(page.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidenciaM6(page, info, "01-cotizacion", true);
  await page.getByRole("link", { name: `${folio}-v1`, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: `Versión ${folio}-v1` })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidenciaM6(page, info, "02-version", true);
  await navegar(page, "Clientes");
  await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidenciaM6(page, info, "03-clientes", true);
});

test("referencias que dejan de estar disponibles: guardar otra partida, recargar y recuperar conserva partida y selecciones", async ({ page }, info) => {
  await abrirConSesion(page);
  const { folio } = await cotizacionConEjemplo1(page, `Conservar ${sufijo()}`);
  const monto = () => page.getByLabel(/^Monto/).first();
  const guardarYRecargar = async (revision: number) => {
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(estadoBorrador(page)).toContainText(`Guardado · revisión ${revision}`);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: `Cotización ${folio}` })).toBeVisible();
    await expect(estadoBorrador(page)).toContainText(`Guardado · revisión ${revision}`);
  };

  // 1) El concepto deja de estar aprobado en el catálogo real (softarq_test).
  ajustarBase("concepto", "CON-00007", "borrador");
  try {
    await page.reload();
    await expect(page.getByText(/El concepto CON-00007 ya no está disponible/)).toBeVisible();
    const conservadas = page.getByRole("group", { name: "Selecciones guardadas de conceptos no disponibles" });
    for (const [ins, pre] of [["INS-00004", "PRE-000007"], ["INS-00005", "PRE-000008"], ["INS-00006", "PRE-000009"]]) {
      await expect(conservadas).toContainText(`${ins} · opción ${pre}`);
    }
    await evidenciaM7(page, info, "00a-concepto-no-disponible-conservado", true);
    // Modificar OTRA partida (el costo adicional) y guardar.
    await monto().fill("950");
    await guardarYRecargar(1);
    await expect(monto()).toHaveValue("950");
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "Faldón norte"))).toBe(true);
    for (const pre of ["PRE-000007", "PRE-000008", "PRE-000009"]) await expect(conservadas).toContainText(pre);
  } finally {
    ajustarBase("concepto", "CON-00007", "aprobado");
  }

  // 2) La opción elegida deja de estar disponible (proveedor inactivo): se conserva marcada, sin sustituto.
  ajustarBase("proveedor", "PRV-00002", "inactivo");
  try {
    await page.reload();
    const lamina = page.getByRole("group", { name: /INS-00004/ });
    await expect(lamina).toContainText("La opción PRE-000007 ya no está disponible (el proveedor está inactivo)");
    await expect(lamina.getByRole("radio", { name: /PRE-000006/ })).not.toBeChecked();
    await monto().fill("975");
    await guardarYRecargar(2);
    await expect(lamina).toContainText("La opción PRE-000007 ya no está disponible");
    await evidenciaM7(page, info, "00b-opcion-no-disponible-conservada");
    // Solo el usuario decide: quitar la selección y elegir otra.
    await lamina.getByRole("button", { name: "Quitar selección de INS-00004" }).click();
    await expect(lamina).not.toContainText("ya no está disponible");
    await lamina.getByRole("radio", { name: /PRE-000006/ }).check();
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(estadoBorrador(page)).toContainText("Guardado · revisión 3");
  } finally {
    ajustarBase("proveedor", "PRV-00002", "activo");
  }
});
