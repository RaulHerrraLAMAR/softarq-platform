/**
 * Utilidades compartidas por los scripts de base de datos: carga del archivo de entorno,
 * comprobación de la base de destino y ejecución de la CLI de Prisma sin shell.
 * Nunca imprime URLs completas ni contraseñas.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ_API = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI_PRISMA = join(RAIZ_API, "node_modules", "prisma", "build", "index.js");
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Carga el archivo de entorno (no sobrescribe variables ya definidas en el proceso). */
export function cargarEntorno(archivo) {
  const ruta = join(RAIZ_API, archivo);
  if (!existsSync(ruta)) {
    throw new Error(`No existe ${archivo}. Ejecute: node scripts/db/generar-credenciales.mjs`);
  }
  process.loadEnvFile(ruta);
  return ruta;
}

/** Nombre de la base y host de una URL, comprobando que sea local y esté permitida. */
export function exigirBase(variable, permitidas) {
  const valor = process.env[variable];
  if (!valor) throw new Error(`Falta ${variable}.`);
  const url = new URL(valor);
  const base = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!HOSTS_LOCALES.has(url.hostname)) throw new Error(`${variable} no apunta a localhost (${url.hostname}).`);
  if (!permitidas.includes(base)) {
    throw new Error(`${variable} apunta a la base «${base}»; solo se permite: ${permitidas.join(", ")}.`);
  }
  return base;
}

/** Ejecuta la CLI de Prisma del proyecto con el entorno actual. Lanza si falla. */
export function prisma(args) {
  const r = spawnSync(process.execPath, [CLI_PRISMA, ...args], {
    cwd: RAIZ_API,
    stdio: "inherit",
    env: { ...process.env, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
  if (r.status !== 0) throw new Error(`prisma ${args[0]} ${args[1] ?? ""} terminó con código ${r.status}.`);
}

/** Aplica las migraciones pendientes y los permisos del rol de la aplicación. */
export function migrarYOtorgarPermisos() {
  prisma(["migrate", "deploy"]);
  prisma(["db", "execute", "--file", join("scripts", "db", "permisos-app.sql")]);
}
