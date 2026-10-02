/**
 * Utilidades de las pruebas de navegador (automatizadas; no equivalen a una prueba hecha por una persona).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

const RAIZ_REPO = join(import.meta.dirname, "..", "..", "..");
export const CARPETA_EVIDENCIAS = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo4");

/** Ajuste reversible de softarq_test (el script exige softarq_test local antes de tocar nada). */
export function ajustarBase(...args: string[]): void {
  execFileSync(process.execPath, [join(RAIZ_REPO, "apps", "api", "dist-e2e", "pruebas-e2e", "ajustar-base.js"), ...args], {
    cwd: join(RAIZ_REPO, "apps", "api"),
    stdio: "pipe",
  });
}

/** Captura de evidencia visual, nombrada por proyecto (escritorio o móvil). */
export async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_EVIDENCIAS, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA_EVIDENCIAS, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

export async function cargarEjemplo(pagina: Page, numero: 1 | 2 | 3 | "propia"): Promise<void> {
  const nombre = numero === "propia" ? /Cargar ejemplo: Cotización propia/ : new RegExp(`Cargar ejemplo: Ejemplo ${numero}`);
  await pagina.getByRole("button", { name: nombre }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).not.toHaveText("Nueva cotización DEMO");
  // Las opciones del ejemplo se comprueban contra las vigentes antes de poder calcular.
  await expect(pagina.getByText(/Opciones vigentes al/)).toBeVisible();
}

export const panel = (pagina: Page) => pagina.locator("#seccion-resultado");
export const total = (pagina: Page) => pagina.locator("[data-prueba=total]");

export async function calcularYTotal(pagina: Page): Promise<string> {
  await pagina.getByRole("button", { name: "Calcular" }).click();
  await expect(total(pagina)).toBeVisible();
  return (await total(pagina).textContent()) ?? "";
}

/** El panel de resultado no muestra ningún importe (bloqueado, pendiente o error). */
export async function sinImportes(pagina: Page): Promise<void> {
  await expect(total(pagina)).toHaveCount(0);
  expect(await panel(pagina).textContent()).not.toMatch(/\$\s?\d/);
}

/** Cuenta las solicitudes POST de cálculo que salen del navegador. */
export function contarCalculos(pagina: Page): { readonly cuenta: number } {
  const contador = { cuenta: 0 };
  pagina.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/v1/calculos/demo")) contador.cuenta++;
  });
  return contador;
}

/** Sin desbordamiento horizontal de la página. */
export async function sinDesbordeHorizontal(pagina: Page): Promise<void> {
  const { ancho, visible } = await pagina.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    visible: document.documentElement.clientWidth,
  }));
  expect(ancho).toBeLessThanOrEqual(visible);
}
