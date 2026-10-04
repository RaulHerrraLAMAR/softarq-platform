/**
 * `pnpm --filter @softarq/api documentos:revisar [-- --limpiar] [--antiguedad-minutos=60]`
 * (módulo 8, ADR-0010 §5): coherencia entre la base y la carpeta de documentos emitidos.
 *
 * - Informa: temporales (`tmp/*.part`), archivos propios sin registro (interrupción entre el
 *   archivo y el registro), registros con archivo ausente o dañado (tamaño o SHA-256 distintos) y
 *   archivos ajenos al patrón.
 * - Con `--limpiar`: borra SOLO temporales y archivos propios sin registro con la antigüedad mínima
 *   (por omisión 60 min, para no tocar una emisión en curso). Nunca borra archivos registrados ni
 *   ajenos y nunca regenera ni sustituye un documento: un registro con archivo ausente o dañado se
 *   restaura desde el respaldo (ver apps/api/README.md).
 * Lee DATABASE_URL (rol de la aplicación, solo SELECT de `emision`) y SOFTARQ_DIR_DOCUMENTOS del
 * archivo de entorno (SOFTARQ_ENV_FILE o `.env`). No imprime URL ni secretos.
 */
import { existsSync } from "node:fs";
import { leerConfiguracion } from "../../../config/entorno.js";
import { crearPrisma, nombreDeBase } from "../../../infraestructura/prisma/cliente.js";
import { AlmacenArchivos } from "../infraestructura/almacen-documentos.js";
import { RepositorioEmisiones } from "../infraestructura/repositorio-emisiones.js";

async function principal(): Promise<void> {
  const archivo = process.env["SOFTARQ_ENV_FILE"] ?? ".env";
  if (existsSync(archivo)) process.loadEnvFile(archivo);
  const config = leerConfiguracion(process.env);
  if (!config.dirDocumentos) throw new Error("Falta SOFTARQ_DIR_DOCUMENTOS.");
  const limpiar = process.argv.includes("--limpiar");
  const minutos = Number(/^--antiguedad-minutos=(\d+)$/.exec(process.argv.find((a) => a.startsWith("--antiguedad-minutos=")) ?? "")?.[1] ?? 60);

  const prisma = crearPrisma(config.databaseUrl);
  try {
    const registradas = (await new RepositorioEmisiones(prisma).todasParaRevisar()).map((r) => ({
      id: r.id,
      archivoClave: r.archivoClave,
      archivoBytes: r.archivoBytes,
      archivoSha256: Buffer.from(r.archivoSha256).toString("hex"),
    }));
    const almacen = new AlmacenArchivos(config.dirDocumentos);
    const informe = await almacen.revisar({ registradas, limpiar, antiguedadMinimaMs: minutos * 60_000, ahora: new Date() });
    console.log(`Base: ${nombreDeBase(config.databaseUrl)} · carpeta: ${config.dirDocumentos}`);
    console.log(`Emisiones registradas con archivo correcto: ${informe.correctos}/${registradas.length}`);
    const lista = (titulo: string, xs: string[]) => {
      console.log(`${titulo}: ${xs.length}`);
      for (const x of xs) console.log(`  - ${x}`);
    };
    lista("Registros con archivo AUSENTE (restaurar desde el respaldo)", informe.ausentes);
    lista("Registros con archivo DAÑADO (restaurar desde el respaldo)", informe.danados);
    lista("Temporales", informe.temporales);
    lista("Archivos propios sin registro", informe.sinRegistro);
    lista("Archivos ajenos (no se tocan)", informe.ajenos);
    lista(limpiar ? `Eliminados (antigüedad ≥ ${minutos} min)` : "Eliminados (use --limpiar para limpiar)", informe.eliminados);
    if (informe.ausentes.length > 0 || informe.danados.length > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error en la revisión de documentos.");
  process.exitCode = 1;
});
