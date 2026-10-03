/**
 * Duplicados, fallos de la API y respuestas atrasadas. Los fallos y retrasos se provocan en el
 * navegador con `page.route` (interceptación de Playwright); la API y la base son las reales.
 */
import { expect, test } from "@playwright/test";
import { CORS, abrirConSesion, calcularYTotal, cargarEjemplo, contarCalculos, evidencia, panel, sinImportes, total } from "./apoyo.ts";

const RUTA_CALCULO = "**/api/v1/calculos/demo";

test("clics repetidos en Calcular envían una sola solicitud", async ({ page }) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  const calculos = contarCalculos(page);
  await page.route(RUTA_CALCULO, async (ruta) => {
    await new Promise((r) => setTimeout(r, 1200));
    await ruta.continue();
  });
  const boton = page.getByRole("button", { name: "Calcular" });
  await boton.dblclick();
  // Mientras el cálculo sigue pendiente: más clics y Enter sobre el botón.
  await expect(page.getByRole("button", { name: "Calculando…" })).toBeDisabled();
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>(".boton-calcular");
    for (let i = 0; i < 3; i++) b?.click();
  });
  await page.keyboard.press("Enter");
  await expect(total(page)).toHaveText("$54,190.68");
  expect(calculos.cuenta).toBe(1);
});

test("fallo de conexión: conserva la captura y se recupera con Reintentar", async ({ page }, info) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  const calculos = contarCalculos(page);
  let primera = true;
  await page.route(RUTA_CALCULO, async (ruta) => {
    if (primera) {
      primera = false;
      await ruta.abort("connectionrefused");
    } else {
      await ruta.continue();
    }
  });
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(panel(page)).toContainText("No hay conexión con el servicio");
  await sinImportes(page);
  await expect(page.getByLabel("Largo del renglón 1", { exact: false })).toHaveValue("10");
  await evidencia(page, info, "12-error-conexion");
  // Sin reintentos automáticos.
  await page.waitForTimeout(1500);
  expect(calculos.cuenta).toBe(1);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(total(page)).toHaveText("$54,190.68");
  expect(calculos.cuenta).toBe(2);
});

test("servicio no disponible (503) y límite de solicitudes (429) se explican sin detalles técnicos", async ({ page }) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  const cuerpo = (codigo: string) => JSON.stringify({ error: { codigo, mensaje: "x", solicitudId: "e2e" } });
  await page.route(RUTA_CALCULO, (ruta) =>
    ruta.fulfill({ status: 503, contentType: "application/json", headers: CORS, body: cuerpo("SERVICIO_NO_DISPONIBLE") }),
  );
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(panel(page)).toContainText("no está disponible en este momento");
  await page.unroute(RUTA_CALCULO);
  // Igual que la API real (ADR-0005): CORS para el origen de la web y Retry-After expuesto.
  await page.route(RUTA_CALCULO, (ruta) =>
    ruta.fulfill({
      status: 429,
      contentType: "application/json",
      headers: {
        "Retry-After": "30",
        ...CORS,
      },
      body: cuerpo("DEMASIADAS_SOLICITUDES"),
    }),
  );
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(panel(page)).toContainText("Espere 30 s");
  await sinImportes(page);
  expect(await panel(page).textContent()).not.toMatch(/SERVICIO_NO_DISPONIBLE|e2e|503|429/);
});

test("respuesta incompatible con el contrato: no se muestra", async ({ page }) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  await page.route(RUTA_CALCULO, (ruta) =>
    ruta.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ estado: "CALCULADO", total: "1.00" }) }),
  );
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(panel(page)).toContainText("no tiene el formato esperado");
  await sinImportes(page);
});

test("respuesta atrasada: un cálculo que llega después de editar no sobrescribe la captura nueva", async ({ page }, info) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  let liberar!: () => void;
  const retenida = new Promise<void>((r) => (liberar = r));
  await page.route(RUTA_CALCULO, async (ruta) => {
    await retenida;
    await ruta.continue().catch(() => undefined);
  });
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByRole("button", { name: "Calculando…" })).toBeDisabled();
  await page.getByLabel("Largo del renglón 1", { exact: false }).fill("11");
  liberar();
  await page.waitForTimeout(1500);
  await expect(panel(page)).toContainText(/Pendiente de recalcular|Cálculo cancelado/);
  await sinImportes(page);
  await evidencia(page, info, "13-respuesta-atrasada");
  await page.unroute(RUTA_CALCULO);
  const nuevo = await calcularYTotal(page);
  expect(nuevo).not.toBe("$54,190.68");
});

test("búsqueda: una respuesta atrasada no reemplaza la búsqueda más reciente", async ({ page }) => {
  await abrirConSesion(page);
  await page.getByRole("button", { name: "Iniciar captura propia" }).click();
  // Retiene la búsqueda «Cubierta» y deja pasar «Losa».
  await page.route("**/api/v1/catalogos/conceptos?*", async (ruta) => {
    if (ruta.request().url().includes("buscar=Cubierta")) await new Promise((r) => setTimeout(r, 2000));
    await ruta.continue().catch(() => undefined);
  });
  const buscar = page.getByLabel("Buscar concepto por código o descripción");
  await buscar.fill("Cubierta");
  await page.waitForTimeout(400);
  await buscar.fill("Losa");
  await expect(page.getByRole("button", { name: /Agregar CON-00008/ })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByRole("button", { name: /Agregar CON-00007/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Agregar CON-00008/ })).toBeVisible();
});
