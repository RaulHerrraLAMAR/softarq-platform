/**
 * globalSetup de las pruebas de integración:
 *   1. carga .env.test y exige que ambas URL apunten a softarq_test local;
 *   2. confirma `current_database()` = softarq_test con el rol migrador;
 *   3. SOLO ENTONCES vacía el esquema public (sentencias constantes);
 *   4. aplica las migraciones versionadas y los permisos de softarq_app.
 * Nunca se ejecuta contra softarq_dev ni contra otra base.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { crearPrisma } from "../infraestructura/prisma/cliente.js";
import { BASE_DE_PRUEBA, RAIZ_API, cargarEntornoDePrueba, confirmarBase, urlDePrueba } from "./entorno.js";

function prismaCli(args: string[]): void {
  const cli = join(RAIZ_API, "node_modules", "prisma", "build", "index.js");
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: RAIZ_API,
    stdio: "inherit",
    env: { ...process.env, SOFTARQ_ENV_FILE: ".env.test", CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
  if (r.status !== 0) throw new Error(`prisma ${args.join(" ")} terminó con código ${r.status}.`);
}

export default async function prepararBase(): Promise<void> {
  cargarEntornoDePrueba();
  urlDePrueba("DATABASE_URL");
  const urlMigrador = urlDePrueba("MIGRATION_DATABASE_URL");

  const migrador = crearPrisma(urlMigrador);
  try {
    await confirmarBase(migrador);
    // Base confirmada: se vacía el esquema para probar las migraciones sobre una base vacía.
    await migrador.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await migrador.$executeRawUnsafe("CREATE SCHEMA public");
    await migrador.$executeRawUnsafe("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await migrador.$executeRawUnsafe("GRANT USAGE ON SCHEMA public TO softarq_app");
  } finally {
    await migrador.$disconnect();
  }

  prismaCli(["migrate", "deploy"]);
  prismaCli(["db", "execute", "--file", join("scripts", "db", "permisos-app.sql")]);
  console.log(`[integración] ${BASE_DE_PRUEBA} preparada: esquema vacío + migraciones + permisos.`);
}
