import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Pruebas de estado y componentes (jsdom). Las de navegador real están en e2e/ (Playwright).
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // jsdom solo donde hace falta (comentario @vitest-environment en el archivo).
    environment: "node",
    globals: false,
    setupFiles: ["src/pruebas/preparar.ts"],
  },
});
