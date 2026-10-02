import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pruebas unitarias: sin base de datos. Las de integración (*.integracion.test.ts)
    // se ejecutan con vitest.integracion.config.ts.
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integracion.test.ts", "node_modules/**"],
    environment: "node",
    // Sin variables globales: cada prueba importa describe/it/expect.
    globals: false,
  },
});
