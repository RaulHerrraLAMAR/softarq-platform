#!/usr/bin/env node
/**
 * Genera apps/api/.env y apps/api/.env.test con contraseñas aleatorias para los roles
 * softarq_migrator y softarq_app. Solo crea los archivos que NO existen (nunca sobrescribe)
 * y no imprime ningún secreto. Ambos archivos están excluidos de Git (.env, .env.*).
 *
 * Uso (desde apps/api):  node scripts/db/generar-credenciales.mjs
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const archivoDev = join(raiz, ".env");
const archivoTest = join(raiz, ".env.test");

const HOST = "localhost";
const PUERTO = 5432;

/** Contraseña de 32 bytes en base64url: no requiere codificación en una URL. */
const nueva = () => randomBytes(32).toString("base64url");

/** Reutiliza las contraseñas de un archivo existente para que dev y test usen las mismas. */
function leerContrasenas(archivo) {
  if (!existsSync(archivo)) return null;
  const texto = readFileSync(archivo, "utf8");
  const buscar = (rol) => texto.match(new RegExp(`postgresql://${rol}:([A-Za-z0-9_-]+)@`))?.[1] ?? null;
  const migrador = buscar("softarq_migrator");
  const app = buscar("softarq_app");
  return migrador && app ? { migrador, app } : null;
}

const url = (rol, clave, base) => `postgresql://${rol}:${clave}@${HOST}:${PUERTO}/${base}`;

const existentes = leerContrasenas(archivoDev) ?? leerContrasenas(archivoTest);
const claves = existentes ?? { migrador: nueva(), app: nueva() };

const cabecera = (que) =>
  [
    `# ${que} — generado por scripts/db/generar-credenciales.mjs. NO VERSIONAR.`,
    "# DATABASE_URL: rol de la aplicación (sin DDL ni DELETE).",
    "# MIGRATION_DATABASE_URL: rol migrador (solo CLI de Prisma y scripts de permisos).",
  ].join("\n");

const contenidoDev = [
  cabecera("Desarrollo (softarq_dev)"),
  `DATABASE_URL=${url("softarq_app", claves.app, "softarq_dev")}`,
  `MIGRATION_DATABASE_URL=${url("softarq_migrator", claves.migrador, "softarq_dev")}`,
  "# Base sombra: solo para `prisma migrate dev --create-only` (generar migraciones nuevas).",
  `SHADOW_DATABASE_URL=${url("softarq_migrator", claves.migrador, "softarq_shadow")}`,
  "",
].join("\n");

const contenidoTest = [
  cabecera("Integración (softarq_test). Las pruebas pueden vaciar ESTA base y solo esta."),
  `DATABASE_URL=${url("softarq_app", claves.app, "softarq_test")}`,
  `MIGRATION_DATABASE_URL=${url("softarq_migrator", claves.migrador, "softarq_test")}`,
  "",
].join("\n");

for (const [archivo, contenido] of [
  [archivoDev, contenidoDev],
  [archivoTest, contenidoTest],
]) {
  if (existsSync(archivo)) {
    console.log(`Se conserva ${archivo} (ya existía).`);
  } else {
    writeFileSync(archivo, contenido, { encoding: "utf8", flag: "wx", mode: 0o600 });
    console.log(`Creado ${archivo}.`);
  }
}
console.log(existentes ? "Contraseñas reutilizadas del archivo existente." : "Contraseñas nuevas generadas (no se muestran).");
