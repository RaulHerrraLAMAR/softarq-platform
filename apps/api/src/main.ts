/**
 * Arranque de la API local: `node dist/main.js` (o `pnpm --filter @softarq/api start`).
 * Lee apps/api/.env (o SOFTARQ_ENV_FILE), valida la configuración y escucha SOLO en 127.0.0.1.
 */
import "reflect-metadata";
import { existsSync } from "node:fs";
import { leerConfiguracion } from "./config/entorno.js";
import { crearAplicacion } from "./http/crear-aplicacion.js";

async function principal(): Promise<void> {
  const archivo = process.env["SOFTARQ_ENV_FILE"] ?? ".env";
  if (existsSync(archivo)) process.loadEnvFile(archivo);
  const config = leerConfiguracion(process.env);
  const app = await crearAplicacion(config);
  await app.listen(config.puerto, config.host);
  console.log(`SoftArq API (DEMO) escuchando en http://${config.host}:${config.puerto} — Ctrl+C para detener.`);
}

principal().catch((e: unknown) => {
  // Mensaje claro y sin trazas ni valores secretos.
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : "Error de arranque.");
  process.exitCode = 1;
});
