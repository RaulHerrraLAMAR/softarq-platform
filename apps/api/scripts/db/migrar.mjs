#!/usr/bin/env node
/**
 * Aplica las migraciones versionadas (prisma migrate deploy) y los permisos de softarq_app.
 * Nunca reinicia ni borra datos.
 *
 * Uso (desde apps/api):
 *   node scripts/db/migrar.mjs            # softarq_dev   (archivo .env)
 *   node scripts/db/migrar.mjs --test     # softarq_test  (archivo .env.test)
 */
import { cargarEntorno, exigirBase, migrarYOtorgarPermisos } from "./prisma-seguro.mjs";

const esTest = process.argv.includes("--test");
const archivo = esTest ? ".env.test" : ".env";
process.env.SOFTARQ_ENV_FILE = archivo;
cargarEntorno(archivo);
const base = exigirBase("MIGRATION_DATABASE_URL", [esTest ? "softarq_test" : "softarq_dev"]);
console.log(`Migrando ${base} con el rol migrador...`);
migrarYOtorgarPermisos();
console.log(`Migraciones y permisos aplicados en ${base}.`);
