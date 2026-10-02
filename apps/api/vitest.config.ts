import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Sin variables globales: cada prueba importa describe/it/expect.
    globals: false,
  },
});
