/**
 * Utilidades de las pruebas de navegador (automatizadas; no equivalen a una prueba hecha por una persona).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

const RAIZ_REPO = join(import.meta.dirname, "..", "..", "..");
export const CARPETA_EVIDENCIAS = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo4");
export const CARPETA_EVIDENCIAS_M5 = join(RAIZ_REPO, "..", "_work", "evidencias", "modulo5");
export const URL_API_E2E = "http://localhost:3101";

/**
 * Cabeceras CORS de la API real (ADR-0005 y ADR-0007) para las respuestas simuladas con
 * `page.route`: con `credentials: "include"` el navegador exige el origen exacto y
 * `Access-Control-Allow-Credentials`.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "http://localhost:4173",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Expose-Headers": "X-Request-Id, Retry-After",
} as const;

export interface CuentaE2E {
  correo: string;
  contrasena: string;
  nombre: string;
}

/**
 * Cuentas creadas por el servidor de pruebas en softarq_test en cada corrida
 * (D:\Proyecto_SoftArq\_work\secrets\accesos-e2e.json, fuera del repositorio).
 */
export function cuentasE2E(): { preparador: CuentaE2E; revisor: CuentaE2E; ambas: CuentaE2E; administrador: CuentaE2E; retiro: CuentaE2E } {
  return JSON.parse(readFileSync(join(RAIZ_REPO, "..", "_work", "secrets", "accesos-e2e.json"), "utf8")) as {
    preparador: CuentaE2E;
    revisor: CuentaE2E;
    /** Preparador y Revisor a la vez (módulo 7, BL-17). */
    ambas: CuentaE2E;
    /** Administrador del catálogo y del sistema (módulos 8 y 11). */
    administrador: CuentaE2E;
    /** Revisor al que se retira la función con la pantalla abierta (módulo 14). */
    retiro: CuentaE2E;
  };
}

/** Inicia sesión en la pantalla de acceso (sin atajos: el mismo formulario que una persona). */
export async function iniciarSesion(pagina: Page, cuenta: CuentaE2E = cuentasE2E().preparador): Promise<void> {
  await pagina.getByLabel("Correo").fill(cuenta.correo);
  await pagina.getByLabel("Contraseña", { exact: true }).fill(cuenta.contrasena);
  await pagina.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(pagina.getByRole("group", { name: "Sesión actual" })).toContainText(cuenta.nombre);
}

/**
 * Abre la web e inicia sesión (por omisión, como Preparador). Desde E3.2 la dirección vacía abre «Mi trabajo»: las pruebas de la
 * calculadora piden `destino = "calculadora"` (valor por omisión) y las del panel por tareas piden `"inicio"`.
 */
export async function abrirConSesion(pagina: Page, cuenta?: CuentaE2E, destino: "calculadora" | "inicio" = "calculadora"): Promise<void> {
  await pagina.goto(destino === "calculadora" ? "/#/calculadora" : "/");
  await expect(pagina.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await iniciarSesion(pagina, cuenta);
}

/** Captura de evidencia del módulo 5. */
export async function evidenciaM5(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_EVIDENCIAS_M5, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA_EVIDENCIAS_M5, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

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
