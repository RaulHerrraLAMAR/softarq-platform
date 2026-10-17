#!/usr/bin/env node
/**
 * Aplica las migraciones versionadas (prisma migrate deploy) y los permisos de softarq_app.
 * Nunca reinicia ni borra datos.
 *
 * En `softarq_dev` (ADR-0017 §1) crea ANTES un respaldo y lo verifica (manifiesto, base.dump y
 * documentos con sus hashes); si cualquiera de los dos falla, se detiene sin migrar. No hay opción
 * para saltarlo. `--test` (softarq_test, base desechable) migra directamente, como antes.
 *
 * Uso (desde apps/api):
 *   node scripts/db/migrar.mjs            # softarq_dev   (archivo .env)
 *   node scripts/db/migrar.mjs --test     # softarq_test  (archivo .env.test)
 */
import { cargarEntorno, exigirBase, migrarYOtorgarPermisos } from "./prisma-seguro.mjs";
import { migrarConRespaldo } from "./secuencia-migracion.mjs";

const esTest = process.argv.includes("--test");
const archivo = esTest ? ".env.test" : ".env";
process.env.SOFTARQ_ENV_FILE = archivo;
cargarEntorno(archivo);
const base = exigirBase("MIGRATION_DATABASE_URL", [esTest ? "softarq_test" : "softarq_dev"]);
if (esTest) {
  console.log(`Migrando ${base} con el rol migrador...`);
  migrarYOtorgarPermisos();
} else {
  // Import diferido: los scripts de respaldo leen su propio entorno (.env) al cargarse.
  const { crearRespaldo } = await import("../respaldo/respaldar.mjs");
  const { exigirRespaldoValido } = await import("../respaldo/verificar.mjs");
  try {
    await migrarConRespaldo({
      crear: () => crearRespaldo(),
      verificar: (carpeta) => exigirRespaldoValido(carpeta),
      migrar: () => {
        console.log(`Migrando ${base} con el rol migrador...`);
        migrarYOtorgarPermisos();
      },
      registrar: (t) => console.log(t),
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
console.log(`Migraciones y permisos aplicados en ${base}.`);
