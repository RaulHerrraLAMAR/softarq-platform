/**
 * Bloqueos y opciones no disponibles con cambios REALES en softarq_test (reversibles):
 * proveedor inactivo y parámetros sin impuesto. Cada prueba restaura la base al terminar.
 */
import { expect, test } from "@playwright/test";
import { abrirConSesion, ajustarBase, calcularYTotal, cargarEjemplo, evidencia, panel, sinImportes } from "./apoyo.ts";

test.describe.configure({ mode: "serial" });

test("opción de un ejemplo que dejó de estar disponible: se explica y se elige otra", async ({ page }, info) => {
  ajustarBase("proveedor", "PRV-00002", "inactivo");
  try {
    await abrirConSesion(page);
    await cargarEjemplo(page, 3);
    const block = page.getByRole("group", { name: /INS-00010/ });
    await expect(block).toContainText("La opción indicada en el ejemplo ya no está disponible");
    await expect(block.getByRole("radio")).toHaveCount(1);
    await expect(block.getByRole("radio")).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /PRE-000016/ })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Hay opciones que ya no están disponibles" })).toContainText("INS-00010");
    await evidencia(page, info, "09a-opcion-no-disponible-aviso");
    await block.scrollIntoViewIfNeeded();
    await evidencia(page, info, "09b-opcion-no-disponible-insumo");
    // Sin elegir, no se envía.
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Faltan datos para calcular" })).toContainText("Opción para INS-00010");
    await block.getByRole("radio", { name: /PRE-000015/ }).check();
    await expect(block).not.toContainText("ya no está disponible");
    expect(await calcularYTotal(page)).toMatch(/^\$[\d,]+\.\d{2}$/);
  } finally {
    ajustarBase("proveedor", "PRV-00002", "activo");
  }
});

test("precio que deja de ser válido después de elegirlo: BL-08 sin importes ni sustituto", async ({ page }, info) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 1);
  await expect(page.getByRole("radio", { name: /PRE-000007/ })).toBeChecked();
  ajustarBase("proveedor", "PRV-00002", "inactivo");
  try {
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(panel(page)).toContainText("Cálculo bloqueado");
    await expect(panel(page)).toContainText("BL-08");
    await sinImportes(page);
    // La selección del usuario se conserva: el servidor no la sustituye y la web tampoco.
    await expect(page.getByRole("radio", { name: /PRE-000007/ })).toBeChecked();
    await evidencia(page, info, "10-bloqueo-bl08", true);
    // Al actualizar las opciones, la que dejó de ser válida desaparece y se pide elegir otra.
    await page.getByRole("button", { name: "Actualizar opciones disponibles" }).click();
    await expect(page.getByRole("radio", { name: /PRE-000007/ })).toHaveCount(0);
    const lamina = page.getByRole("group", { name: /INS-00004/ });
    await expect(lamina).toContainText("La opción PRE-000007 ya no está disponible");
    await expect(lamina.getByRole("radio", { name: /PRE-000006/ })).not.toBeChecked();
    await sinImportes(page);
  } finally {
    ajustarBase("proveedor", "PRV-00002", "activo");
  }
});

test("parámetros sin impuesto en la base: BL-13 sin importes; al restaurarlos, el total vuelve", async ({ page }, info) => {
  await abrirConSesion(page);
  await cargarEjemplo(page, 2);
  expect(await calcularYTotal(page)).toBe("$43,312.16");
  ajustarBase("parametros", "sin-impuesto");
  try {
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(panel(page)).toContainText("BL-13");
    // El total anterior no se conserva como válido.
    await sinImportes(page);
    await evidencia(page, info, "11-bloqueo-bl13");
  } finally {
    ajustarBase("parametros", "demo");
  }
  expect(await calcularYTotal(page)).toBe("$43,312.16");
});
