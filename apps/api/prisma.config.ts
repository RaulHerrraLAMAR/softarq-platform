/**
 * Configuración de la CLI de Prisma (migraciones). La CLI se conecta SIEMPRE con el rol
 * migrador (MIGRATION_DATABASE_URL); la aplicación usa DATABASE_URL con el rol softarq_app.
 *
 * Archivo de entorno: SOFTARQ_ENV_FILE (por omisión `.env`; las pruebas usan `.env.test`).
 * Prisma 7 no carga `.env` por sí mismo; se usa process.loadEnvFile de Node, que no
 * sobrescribe variables ya definidas en el proceso.
 */
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

const archivoEntorno = process.env["SOFTARQ_ENV_FILE"] ?? ".env";
if (existsSync(archivoEntorno)) process.loadEnvFile(archivoEntorno);

const url = process.env["MIGRATION_DATABASE_URL"];
const sombra = process.env["SHADOW_DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` no necesita base de datos: sin URL no se declara datasource.
  ...(url ? { datasource: { url, ...(sombra ? { shadowDatabaseUrl: sombra } : {}) } } : {}),
});
