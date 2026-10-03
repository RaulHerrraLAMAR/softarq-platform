/**
 * Los cuatro escenarios verificados, calculados por la API real sobre softarq_test (fecha fija del
 * servidor 2026-09-25). Los totales esperados proceden de las fuentes (docs/api/README.md).
 */
import { expect, test } from "@playwright/test";
import { abrirConSesion, calcularYTotal, cargarEjemplo, evidencia, panel, sinDesbordeHorizontal, sinImportes } from "./apoyo.ts";

const ESCENARIOS = [
  { ejemplo: 1, total: "$54,190.68" },
  { ejemplo: 2, total: "$43,312.16" },
  { ejemplo: 3, total: "$22,405.28" },
  { ejemplo: "propia", total: "$4,911.79" },
] as const;

test.describe("ejemplos verificados", () => {
  for (const e of ESCENARIOS) {
    test(`ejemplo ${e.ejemplo} → ${e.total}`, async ({ page }, info) => {
      await abrirConSesion(page);
      if (e.ejemplo === 1) await evidencia(page, info, "01-inicio");
      await cargarEjemplo(page, e.ejemplo);
      // Antes de calcular no hay resultado.
      await expect(panel(page)).toContainText("Sin calcular");
      await sinImportes(page);
      if (e.ejemplo === 1) await evidencia(page, info, "02-ejemplo1-captura", true);
      expect(await calcularYTotal(page)).toBe(e.total);
      await expect(panel(page)).toContainText("DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL");
      await expect(panel(page)).toContainText("25/09/2026");
      await page.locator(".detalle summary").click();
      await expect(page.getByRole("table", { name: "Detalle de la cotización" })).toBeVisible();
      await evidencia(page, info, `03-ejemplo-${e.ejemplo}-resultado`, true);
      await page.locator(".tabla-detalle tfoot").scrollIntoViewIfNeeded();
      await expect(page.locator(".tabla-detalle tfoot")).toBeInViewport();
      if (e.ejemplo === 1) await evidencia(page, info, "03b-ejemplo-1-detalle-desplazado");
      await sinDesbordeHorizontal(page);
    });
  }

  test("modificar una medida marca pendiente y recalcula", async ({ page }, info) => {
    await abrirConSesion(page);
    await cargarEjemplo(page, 1);
    expect(await calcularYTotal(page)).toBe("$54,190.68");
    const largo = page.getByLabel("Largo del renglón 1", { exact: false });
    await largo.fill("12");
    await expect(panel(page)).toContainText("Pendiente de recalcular");
    await sinImportes(page);
    await expect(page.getByRole("navigation", { name: "Progreso de la cotización" })).toContainText("pendiente de recalcular");
    await evidencia(page, info, "04-pendiente-de-recalcular");
    const nuevo = await calcularYTotal(page);
    expect(nuevo).toMatch(/^\$[\d,]+\.\d{2}$/);
    expect(nuevo).not.toBe("$54,190.68");
    // Volver a la medida original reproduce el total verificado.
    await largo.fill("10");
    await sinImportes(page);
    expect(await calcularYTotal(page)).toBe("$54,190.68");
  });
});
