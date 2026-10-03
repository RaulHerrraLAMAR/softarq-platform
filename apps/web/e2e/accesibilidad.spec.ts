/**
 * Teclado, foco visible, objetivos táctiles y pantallas estrechas (comprobaciones automatizadas).
 */
import { expect, test, type Page } from "@playwright/test";
import { abrirConSesion, cargarEjemplo, evidencia, panel, sinDesbordeHorizontal, total } from "./apoyo.ts";

async function focoVisible(pagina: Page): Promise<void> {
  const estilo = await pagina.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e) return null;
    const s = getComputedStyle(e);
    const contenedor = e.closest(".opcion");
    const c = contenedor ? getComputedStyle(contenedor) : null;
    return { propio: s.outlineStyle !== "none" && s.outlineWidth !== "0px", contenedor: c ? c.outlineStyle !== "none" : false };
  });
  expect(estilo && (estilo.propio || estilo.contenedor)).toBe(true);
}

test("recorrido completo con teclado y foco visible", async ({ page }, info) => {
  await abrirConSesion(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await focoVisible(page);
  await page.keyboard.press("Enter");

  // Llegar a «Cargar ejemplo» del ejemplo 1 solo con Tab.
  const cargar = page.getByRole("button", { name: /Cargar ejemplo: Ejemplo 1/ });
  for (let i = 0; i < 10 && !(await cargar.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(cargar).toBeFocused();
  await focoVisible(page);
  await evidencia(page, info, "14-foco-teclado");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Opciones vigentes al/)).toBeVisible();

  // Cambiar una opción con flechas dentro del grupo de radios.
  const elegida = page.getByRole("radio", { name: /PRE-000007/ });
  await elegida.focus();
  await focoVisible(page);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("radio", { name: /PRE-000006/ })).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(elegida).toBeChecked();

  // Calcular con el teclado y abrir el detalle.
  await page.getByRole("button", { name: "Calcular" }).focus();
  await page.keyboard.press("Enter");
  await expect(total(page)).toHaveText("$54,190.68");
  const resumen = page.locator(".detalle summary");
  await resumen.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table", { name: "Detalle de la cotización" })).toBeVisible();
  await expect(panel(page).locator("[aria-live=polite]")).toHaveCount(1);
});

test("objetivos de clic de al menos 44 px", async ({ page }) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  const pequenos = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, select, input:not([type=radio]), summary, .opcion, .opcion-simple, .paso a")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ e: e.outerHTML.slice(0, 80), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44 || r.width < 44)
      .map(({ e, r }) => `${Math.round(r.width)}x${Math.round(r.height)} ${e}`),
  );
  expect(pequenos).toEqual([]);
});

test("movimiento reducido: sin animaciones", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abrirConSesion(page);
  await page.route("**/api/v1/calculos/demo", async (r) => {
    await new Promise((x) => setTimeout(x, 800));
    await r.continue();
  });
  await cargarEjemplo(page, 1);
  await page.getByRole("button", { name: "Calcular" }).click();
  const animacion = await page.locator(".esqueleto-linea").first().evaluate((e) => getComputedStyle(e).animationName);
  expect(animacion).toBe("none");
  await expect(total(page)).toHaveText("$54,190.68");
});

test("pantalla estrecha: recorrido, sin desbordes y tablas legibles @movil", async ({ page }, info) => {
  await abrirConSesion(page);
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "01-inicio", true);
  await cargarEjemplo(page, 1);
  await sinDesbordeHorizontal(page);
  // En pantalla estrecha cada renglón muestra sus etiquetas.
  await expect(page.getByText("Largo del renglón 1", { exact: false }).first()).toBeVisible();
  await evidencia(page, info, "02-captura-arriba");
  await page.getByRole("heading", { name: /Opciones disponibles/ }).scrollIntoViewIfNeeded();
  await evidencia(page, info, "03-opciones");
  await page.getByRole("link", { name: "Ir a Calcular y resultado" }).click();
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(total(page)).toHaveText("$54,190.68");
  await page.locator(".detalle summary").click();
  await sinDesbordeHorizontal(page);
  await panel(page).scrollIntoViewIfNeeded();
  await evidencia(page, info, "04-resultado");
  await page.locator(".detalle").scrollIntoViewIfNeeded();
  await evidencia(page, info, "05-detalle");
  await evidencia(page, info, "06-completa", true);
});
