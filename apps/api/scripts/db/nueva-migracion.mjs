#!/usr/bin/env node
/**
 * Genera una migración nueva SIN aplicarla (prisma migrate dev --create-only), usando la base
 * sombra softarq_shadow. Revise y, si hace falta, añada CHECK u otras restricciones al SQL
 * antes de aplicarlo con migrar.mjs.
 *
 * Uso (desde apps/api):  node scripts/db/nueva-migracion.mjs <nombre_en_snake_case>
 */
import { cargarEntorno, exigirBase, prisma } from "./prisma-seguro.mjs";

const nombre = process.argv[2];
if (!nombre || !/^[a-z0-9_]+$/.test(nombre)) {
  throw new Error("Indique un nombre en minúsculas y guiones bajos, p. ej. cotizaciones_iniciales.");
}
process.env.SOFTARQ_ENV_FILE = ".env";
cargarEntorno(".env");
exigirBase("MIGRATION_DATABASE_URL", ["softarq_dev"]);
exigirBase("SHADOW_DATABASE_URL", ["softarq_shadow"]);
prisma(["migrate", "dev", "--create-only", "--name", nombre]);
