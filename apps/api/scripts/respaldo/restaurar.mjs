#!/usr/bin/env node
/**
 * Restauración de PRUEBA de un respaldo en un destino aislado (ADR-0012). Nunca en softarq_dev.
 *
 * Uso (desde apps/api):
 *   pnpm respaldo:restaurar <carpeta del respaldo> [--destino softarq_restauracion] [--documentos <carpeta>]
 *
 * Orden (cada paso solo si el anterior terminó bien):
 * 1. Guardas, SIN conectar: destino en la lista blanca (solo softarq_restauracion; softarq_dev,
 *    softarq_test, softarq_shadow y las bases del sistema se rechazan explícitamente) y carpeta de
 *    documentos de destino que no se solape con los originales ni con los respaldos.
 * 2. Verificación completa del respaldo (verificar.mjs): manifiesto, SHA-256 del volcado y documentos.
 * 3. Conexión como softarq_migrator a la base de destino y comprobación de current_database().
 * 4. Esquema public del destino vaciado (DROP SCHEMA public CASCADE; solo en el destino comprobado)
 *    y pg_restore --no-owner --single-transaction --exit-on-error.
 * 5. Permisos de softarq_app reaplicados (scripts/db/permisos-app.sql) y TODAS las sesiones
 *    restauradas revocadas (motivo RESTAURACION): ninguna cookie anterior sirve en el destino.
 * 6. Documentos copiados a la carpeta de destino (marcada con .softarq-restauracion) y comprobados.
 * 7. documentos:revisar contra el destino (requiere `pnpm --filter @softarq/api build`).
 */
import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  DESTINOS_PERMITIDOS,
  DIR_DOCUMENTOS_RESTAURACION_POR_OMISION,
  DIR_RESPALDOS_POR_OMISION,
  ErrorRespaldo,
  MARCA_DESTINO,
  RAIZ_API,
  conArchivoDeContrasena,
  dirDocumentosDesarrollo,
  herramientaPg,
  rutaDeClave,
  sha256Archivo,
  urlDeRol,
  validarCarpetaDocumentosDestino,
  validarDestino,
} from "./comun.mjs";
import { exigirRespaldoValido } from "./verificar.mjs";

/** Prepara la carpeta de documentos de destino: vacía o marcada por una restauración anterior. */
function prepararCarpetaDocumentos(carpeta) {
  if (existsSync(carpeta)) {
    const contenido = readdirSync(carpeta);
    if (contenido.length > 0 && !contenido.includes(MARCA_DESTINO)) {
      throw new ErrorRespaldo(`La carpeta de destino ${carpeta} tiene contenido sin la marca ${MARCA_DESTINO}; no se toca.`);
    }
    rmSync(carpeta, { recursive: true, force: true }); // solo carpetas creadas por esta herramienta
  }
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, MARCA_DESTINO), "Carpeta desechable de prueba de restauración (scripts/respaldo/restaurar.mjs).\n", "utf8");
}

export async function restaurarRespaldo(carpetaRespaldo, opciones = {}) {
  // 1. Guardas antes de cualquier conexión o escritura.
  const destino = validarDestino(opciones.destino ?? DESTINOS_PERMITIDOS[0]);
  const dirDocsDesarrollo = dirDocumentosDesarrollo();
  const carpetaDocs = validarCarpetaDocumentosDestino(opciones.documentos ?? DIR_DOCUMENTOS_RESTAURACION_POR_OMISION, {
    dirDocumentosDesarrollo: dirDocsDesarrollo,
    dirRespaldos: DIR_RESPALDOS_POR_OMISION,
  });

  // 2. Respaldo íntegro.
  const m = await exigirRespaldoValido(carpetaRespaldo);
  const informe = { respaldo: m.id, destino, carpetaDocumentos: carpetaDocs, inicio: new Date().toISOString(), pasos: [] };
  const paso = (texto) => {
    informe.pasos.push(texto);
    if (!opciones.silencioso) console.log(`  · ${texto}`);
  };

  // 3. Conexión al destino comprobado.
  const migrador = urlDeRol("MIGRATION_DATABASE_URL", "softarq_migrator", destino);
  const cliente = new pg.Client({ connectionString: migrador.cadena, connectionTimeoutMillis: 10_000, application_name: "softarq-restauracion" });
  await cliente.connect();
  try {
    const { rows: [c] } = await cliente.query("SELECT current_database() AS base, current_user AS rol");
    if (c.base !== destino || c.rol !== "softarq_migrator") throw new ErrorRespaldo(`Conexión inesperada (${c.base}/${c.rol}); se detiene.`);
    if (DESTINOS_PERMITIDOS.includes(c.base) === false) throw new ErrorRespaldo("Destino no permitido tras conectar; se detiene.");

    // 4. Vaciar el esquema del destino (doble comprobación en el servidor) y restaurar.
    await cliente.query(`DO $$ BEGIN
      IF current_database() <> 'softarq_restauracion' THEN RAISE EXCEPTION 'Destino no permitido: %', current_database(); END IF;
    END $$`);
    await cliente.query("DROP SCHEMA IF EXISTS public CASCADE");
    await cliente.query("CREATE SCHEMA public AUTHORIZATION softarq_migrator");
    await cliente.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await cliente.query("GRANT USAGE ON SCHEMA public TO softarq_app");
    paso(`esquema public de ${destino} vaciado`);
  } finally {
    await cliente.end().catch(() => {});
  }

  conArchivoDeContrasena(migrador, (entorno) => {
    herramientaPg(
      "pg_restore",
      ["-h", migrador.host, "-p", migrador.puerto, "-U", migrador.usuario, "-d", destino, "--no-password", "--no-owner", "--single-transaction", "--exit-on-error", join(carpetaRespaldo, "base.dump")],
      entorno,
    );
    paso("pg_restore --no-owner --single-transaction terminado");
    // 5. Permisos de la aplicación (mismo script que tras cada migración).
    herramientaPg(
      "psql",
      ["-h", migrador.host, "-p", migrador.puerto, "-U", migrador.usuario, "-d", destino, "--no-password", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", join(RAIZ_API, "scripts", "db", "permisos-app.sql")],
      entorno,
    );
    paso("permisos de softarq_app reaplicados (permisos-app.sql)");
  });

  const cliente2 = new pg.Client({ connectionString: migrador.cadena, connectionTimeoutMillis: 10_000, application_name: "softarq-restauracion" });
  await cliente2.connect();
  try {
    const { rows: [c] } = await cliente2.query("SELECT current_database() AS base");
    if (c.base !== destino) throw new ErrorRespaldo("Conexión inesperada; se detiene.");
    const r = await cliente2.query(
      "UPDATE public.sesion SET revocada_en = now(), motivo_revocacion = 'RESTAURACION' WHERE revocada_en IS NULL",
    );
    informe.sesionesRevocadas = r.rowCount;
    paso(`sesiones restauradas revocadas: ${r.rowCount}`);
  } finally {
    await cliente2.end().catch(() => {});
  }

  // 6. Documentos.
  prepararCarpetaDocumentos(carpetaDocs);
  for (const d of m.documentos.lista) {
    const origen = rutaDeClave(join(carpetaRespaldo, "documentos"), d.clave);
    const destinoArchivo = rutaDeClave(carpetaDocs, d.clave);
    mkdirSync(dirname(destinoArchivo), { recursive: true });
    copyFileSync(origen, destinoArchivo, constants.COPYFILE_EXCL);
    if (statSync(destinoArchivo).size !== d.bytes || (await sha256Archivo(destinoArchivo)) !== d.sha256) {
      throw new ErrorRespaldo(`La copia restaurada de ${d.clave} no coincide con el manifiesto.`);
    }
  }
  paso(`documentos restaurados y comprobados: ${m.documentos.total}`);

  // 7. documentos:revisar contra el destino (código compilado de la API).
  const revisar = join(RAIZ_API, "dist", "modules", "cotizaciones", "mantenimiento", "revisar-documentos.js");
  if (!existsSync(revisar)) throw new ErrorRespaldo("Falta la API compilada: ejecute pnpm --filter @softarq/api build.");
  const app = urlDeRol("DATABASE_URL", "softarq_app", destino);
  const entorno = { ...process.env, SOFTARQ_ENV_FILE: join(dirname(carpetaDocs), "sin-archivo.env"), DATABASE_URL: app.cadena, SOFTARQ_DIR_DOCUMENTOS: carpetaDocs };
  for (const n of ["MIGRATION_DATABASE_URL", "SHADOW_DATABASE_URL", "RESPALDO_DATABASE_URL", "PGPASSWORD"]) delete entorno[n];
  const rev = spawnSync(process.execPath, [revisar], { cwd: RAIZ_API, env: entorno, encoding: "utf8", windowsHide: true });
  informe.documentosRevisar = { codigo: rev.status, salida: rev.stdout.trim() };
  if (rev.status !== 0) throw new ErrorRespaldo(`documentos:revisar en el destino terminó con código ${rev.status}:\n${rev.stdout}${rev.stderr}`);
  paso("documentos:revisar en el destino: sin ausentes ni dañados");

  informe.fin = new Date().toISOString();
  writeFileSync(join(dirname(carpetaDocs), "ultima-restauracion.json"), JSON.stringify(informe, null, 2) + "\n", "utf8");
  return informe;
}

function leerOpcion(args, nombre) {
  const i = args.indexOf(nombre);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const destino = leerOpcion(args, "--destino");
  const documentos = leerOpcion(args, "--documentos");
  const carpeta = args[0];
  try {
    if (!carpeta) throw new ErrorRespaldo("Uso: pnpm respaldo:restaurar <carpeta del respaldo> [--destino softarq_restauracion] [--documentos <carpeta>]");
    validarDestino(destino ?? DESTINOS_PERMITIDOS[0]); // antes de leer nada más
    console.log(`Restaurando ${carpeta} en ${destino ?? DESTINOS_PERMITIDOS[0]}...`);
    const r = await restaurarRespaldo(carpeta, { destino, documentos });
    console.log(`Restauración de prueba COMPLETA en ${r.destino}; documentos en ${r.carpetaDocumentos}.`);
  } catch (error) {
    console.error(`Restauración detenida: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
