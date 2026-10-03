#!/usr/bin/env node
/**
 * Mantenimiento: borra claves de idempotencia caducadas hace más de 7 días (ADR-0008), con el rol
 * migrador. La aplicación no tiene permiso DELETE en ninguna tabla.
 *
 * Uso (desde apps/api):
 *   node scripts/db/purgar-idempotencia.mjs          # softarq_dev  (archivo .env)
 *   node scripts/db/purgar-idempotencia.mjs --test   # softarq_test (archivo .env.test)
 */
import { join } from "node:path";
import { cargarEntorno, exigirBase, prisma } from "./prisma-seguro.mjs";

const esTest = process.argv.includes("--test");
const archivo = esTest ? ".env.test" : ".env";
process.env.SOFTARQ_ENV_FILE = archivo;
cargarEntorno(archivo);
const base = exigirBase("MIGRATION_DATABASE_URL", [esTest ? "softarq_test" : "softarq_dev"]);
console.log(`Purgando claves de idempotencia caducadas en ${base}...`);
prisma(["db", "execute", "--file", join("scripts", "db", "purgar-idempotencia.sql")]);
console.log("Purga terminada.");
