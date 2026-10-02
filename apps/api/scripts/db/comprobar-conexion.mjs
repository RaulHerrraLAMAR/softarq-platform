#!/usr/bin/env node
/**
 * Comprueba las conexiones de los roles del proyecto (sin mostrar URL ni contraseñas):
 * base, usuario y atributos privilegiados de cada conexión de .env y .env.test.
 *
 * Uso (desde apps/api):  node scripts/db/comprobar-conexion.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import pg from "pg";
import { RAIZ_API } from "./prisma-seguro.mjs";

const SQL = `SELECT current_database() AS base, current_user AS usuario,
  r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls
  FROM pg_roles r WHERE r.rolname = current_user`;

let fallos = 0;
for (const archivo of [".env", ".env.test"]) {
  const ruta = join(RAIZ_API, archivo);
  if (!existsSync(ruta)) {
    console.log(`${archivo}: no existe (ejecute generar-credenciales.mjs).`);
    fallos++;
    continue;
  }
  const vars = parseEnv(readFileSync(ruta, "utf8"));
  for (const nombre of ["DATABASE_URL", "MIGRATION_DATABASE_URL", "SHADOW_DATABASE_URL"]) {
    const url = vars[nombre];
    if (!url) continue;
    const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      await cliente.connect();
      const { rows } = await cliente.query(SQL);
      const f = rows[0];
      const privilegiado = f.rolsuper || f.rolcreatedb || f.rolcreaterole || f.rolbypassrls;
      console.log(
        `${archivo} ${nombre}: OK · base ${f.base} · rol ${f.usuario} · ${privilegiado ? "¡PRIVILEGIADO!" : "sin privilegios especiales"}`,
      );
      if (privilegiado) fallos++;
    } catch (e) {
      const u = new URL(url);
      console.log(`${archivo} ${nombre}: ERROR (${u.username} → ${u.pathname.slice(1)}): ${e.code ?? ""} ${e.message}`);
      fallos++;
    } finally {
      await cliente.end().catch(() => {});
    }
  }
}
process.exitCode = fallos > 0 ? 1 : 0;
