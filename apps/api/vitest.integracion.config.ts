import { defineConfig } from "vitest/config";

// Pruebas de integración contra PostgreSQL local (solo softarq_test). Ver README.
export default defineConfig({
  test: {
    include: ["src/**/*.integracion.test.ts"],
    environment: "node",
    globals: false,
    globalSetup: ["src/pruebas-integracion/preparar-base.ts"],
    setupFiles: ["src/pruebas-integracion/setup-entorno.ts"],
    // Una sola base compartida: los archivos se ejecutan en serie.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
