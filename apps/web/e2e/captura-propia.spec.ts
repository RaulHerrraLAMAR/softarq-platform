/**
 * Captura propia desde cero contra la API real: buscar, agregar, medir, elegir opciones a mano,
 * agregar y quitar partidas, renglones y adicionales. La captura de referencia (CON-00001,
 * 4 m × 2.5 m, PRE-000001 y PRE-000002, compras consolidadas) debe dar $4,911.79.
 */
import { expect, test } from "@playwright/test";
import { calcularYTotal, evidencia, panel, sinImportes } from "./apoyo.ts";

test("captura propia completa con opciones elegidas por el usuario", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Iniciar captura propia" }).click();
  await expect(page.getByRole("heading", { name: "Captura propia" })).toBeVisible();

  // Búsqueda sin resultados y búsqueda con resultado.
  const buscar = page.getByLabel("Buscar concepto por código o descripción");
  await buscar.fill("NO-EXISTE-XYZ");
  await expect(page.getByText(/Sin resultados para «NO-EXISTE-XYZ»/)).toBeVisible();
  await buscar.fill("CON-00001");
  await page.getByRole("button", { name: /Agregar CON-00001/ }).click();

  // Calcular con la captura incompleta no envía nada y señala los campos.
  await page.getByRole("button", { name: "Calcular" }).click();
  const resumen = page.getByRole("alert").filter({ hasText: "Faltan datos para calcular" });
  await expect(resumen).toBeVisible();
  await expect(resumen).toBeFocused();
  await expect(page.getByLabel("Largo del renglón 1", { exact: false })).toHaveAttribute("aria-invalid", "true");
  await evidencia(page, info, "05-captura-incompleta", true);

  await page.getByLabel("Largo del renglón 1", { exact: false }).fill("4");
  await page.getByLabel("Ancho del renglón 1", { exact: false }).fill("2.5");
  await page.getByRole("radio", { name: "Consolidar compras" }).check();

  // Ninguna opción preseleccionada, aunque una tenga la marca de menor precio.
  const insumo2 = page.getByRole("group", { name: /INS-00002/ });
  await expect(insumo2.getByText("Menor precio vigente")).toHaveCount(1);
  for (const radio of await page.locator("fieldset.insumo input[type=radio]").all()) await expect(radio).not.toBeChecked();
  await page.getByRole("radio", { name: /PRE-000001/ }).check();
  await page.getByRole("radio", { name: /PRE-000002/ }).check();
  await evidencia(page, info, "06-opciones-elegidas", true);

  // Agregar y quitar un renglón, otro concepto y un costo adicional no altera el resultado final.
  await page.getByRole("button", { name: "Agregar renglón de medidas a la partida 1" }).click();
  await expect(page.getByLabel("Piezas del renglón 2", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Quitar el renglón 2 de la partida 1" }).click();
  await expect(page.getByLabel("Piezas del renglón 2", { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "Agregar concepto" }).click();
  await page.getByLabel("Buscar concepto por código o descripción").fill("Losa");
  await page.getByRole("button", { name: /Agregar CON-00008/ }).click();
  await expect(page.getByRole("heading", { name: /Partida 2 · CON-00008/ })).toBeVisible();
  await page.getByRole("button", { name: "Quitar la partida 2 (CON-00008)" }).click();
  await expect(page.getByRole("heading", { name: /CON-00008/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Agregar costo adicional" }).click();
  await page.getByLabel("Tipo").selectOption({ label: "[DEMO] Transporte de materiales (viaje)" });
  await page.getByLabel("Descripción", { exact: true }).fill("Flete");
  await page.getByLabel("Monto", { exact: false }).fill("350");
  await page.getByRole("button", { name: "Quitar la partida 2 (costo adicional)" }).click();

  expect(await calcularYTotal(page)).toBe("$4,911.79");
  await evidencia(page, info, "07-captura-propia-resultado", true);
});

test("costo adicional con monto cero: bloqueo del servidor sin importes", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Cargar ejemplo: Ejemplo 1/ }).click();
  await expect(page.getByText(/Opciones vigentes al/)).toBeVisible();
  await page.getByLabel("Monto", { exact: false }).fill("0");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(panel(page)).toContainText("Cálculo bloqueado");
  await expect(panel(page)).toContainText("BL-11");
  await sinImportes(page);
  await evidencia(page, info, "08-bloqueo-monto-cero");
});

test("piezas no enteras: el servidor rechaza y el mensaje queda junto al campo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Cargar ejemplo: Ejemplo 1/ }).click();
  await expect(page.getByText(/Opciones vigentes al/)).toBeVisible();
  const piezas = page.getByLabel("Piezas del renglón 1", { exact: false });
  await piezas.fill("1.5");
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(panel(page)).toContainText("El servicio no aceptó algunos datos");
  await expect(piezas).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("p.error-campo").first()).toContainText(/entero/);
  await sinImportes(page);
});
