/**
 * Pruebas de navegador (ADR-0006): web COMPILADA + API real + PostgreSQL (solo softarq_test).
 *
 * - Navegador: Microsoft Edge instalado en el equipo (canal `msedge`); no se descarga Chromium.
 * - Un solo worker: una base compartida y un equipo modesto.
 * - Salidas (informe, trazas, capturas de evidencia) en D:\Proyecto_SoftArq\_work, fuera de Git.
 *
 * Requisitos previos (los hace `pnpm verificar:e2e` desde la raíz): contracts compilado y
 * `pnpm --filter @softarq/api build:e2e`.
 */
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const RAIZ_REPO = join(import.meta.dirname, "..", "..");
const TRABAJO = join(RAIZ_REPO, "..", "_work");
/**
 * El navegador llama a la API por `localhost` (mismo site que la web en localhost:4173, para la
 * cookie de sesión SameSite=Strict; ADR-0007). La API escucha en 127.0.0.1, así que la espera del
 * arranque se hace contra 127.0.0.1.
 */
const URL_API_E2E = "http://localhost:3101";
const SALUD_API_E2E = "http://127.0.0.1:3101/health";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: join(TRABAJO, "playwright", "resultados"),
  reporter: [["list"], ["html", { outputFolder: join(TRABAJO, "playwright", "informe"), open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    channel: "msedge",
    locale: "es-MX",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { viewport: { width: 1440, height: 900 } }, grepInvert: /@movil/ },
    { name: "movil", use: { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true }, grep: /@movil/ },
  ],
  webServer: [
    {
      command: "node dist-e2e/pruebas-e2e/servidor-e2e.js",
      cwd: join(RAIZ_REPO, "apps", "api"),
      url: SALUD_API_E2E,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm run build:e2e && pnpm run preview:e2e",
      cwd: import.meta.dirname,
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: URL_API_E2E },
    },
  ],
});
