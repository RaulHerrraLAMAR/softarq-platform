/**
 * Punto de entrada de `pnpm --filter @softarq/api db:cargar-demo`.
 * Carga el catálogo DEMO en la base de DATABASE_URL (rol softarq_app) del archivo indicado por
 * SOFTARQ_ENV_FILE (por omisión `.env`, es decir, softarq_dev). Solo muestra el nombre de la base.
 */
import { existsSync } from "node:fs";
import { crearPrisma, hostDeBase, nombreDeBase } from "../../../infraestructura/prisma/cliente.js";
import { cargarDemo } from "./cargar-demo.js";

const BASES_PERMITIDAS = new Set(["softarq_dev", "softarq_test"]);

async function principal(): Promise<void> {
  const archivo = process.env["SOFTARQ_ENV_FILE"] ?? ".env";
  if (existsSync(archivo)) process.loadEnvFile(archivo);
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error(`Falta DATABASE_URL (archivo ${archivo}). Ejecute scripts/db/generar-credenciales.mjs.`);
  const base = nombreDeBase(url);
  if (!BASES_PERMITIDAS.has(base)) throw new Error(`Base no permitida para la carga DEMO: ${base}.`);
  console.log(`Cargando catálogo DEMO en ${base} (${hostDeBase(url)})...`);

  const prisma = crearPrisma(url);
  try {
    const r = await cargarDemo(prisma);
    console.log("Creados:", JSON.stringify(r.creados));
    console.log("Ya existentes (conservados):", JSON.stringify(r.existentes));
    if (r.diferencias.length > 0) {
      console.warn("Registros DEMO con valores distintos a los esperados (no se modificaron):");
      for (const d of r.diferencias) console.warn(`  - ${d}`);
    } else {
      console.log("Los valores DEMO coinciden con los esperados.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
