import { defineConfig } from "vitest/config";

// Pruebas de la lógica de la app (cliente HTTP, sesión, capacidades, consultas, formato) en Node, sin
// React Native ni módulos nativos: las pantallas son una capa fina sobre esta lógica.
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "scripts/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
