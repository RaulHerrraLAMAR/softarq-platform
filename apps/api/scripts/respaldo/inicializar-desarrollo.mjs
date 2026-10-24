#!/usr/bin/env node
/**
 * Inicialización de softarq_dev en una instalación nueva a partir de un respaldo verificado
 * (ADR-0012; docs/operacion/respaldo-y-restauracion.md §5.1). NO es la restauración de prueba
 * (restaurar.mjs, que solo admite softarq_restauracion y no se modifica) ni reemplaza una base existente.
 *
 * Uso (desde apps/api):
 *   pnpm respaldo:inicializar-desarrollo <carpeta del respaldo> --confirmar softarq_dev
 *
 * Orden (cada paso solo si el anterior terminó bien):
 * 1. Guardas sin conectar: confirmación explícita con el nombre exacto de la base; destino fijo.
 * 2. Verificación completa del respaldo (verificar.mjs).
 * 3. Conexión como softarq_migrator; current_database() y propietario comprobados en cliente y servidor.
 * 4. Rechazo si el esquema public contiene CUALQUIER objeto (tabla, vista, secuencia, función o tipo).
 *    No hay DROP SCHEMA: solo se restaura sobre una base nueva y vacía.
 * 5. pg_restore --no-owner --single-transaction --exit-on-error; permisos-app.sql; sesiones revocadas.
 * 6. Historial de migraciones comprobado contra el manifiesto y prisma/migrations (no se aplica ninguna).
 * 7. Documentos: los de SOFTARQ_DIR_DOCUMENTOS deben coincidir con el manifiesto; los que falten se copian
 *    sin sobrescribir; uno distinto detiene el proceso.
 * 8. documentos:revisar contra softarq_dev (requiere `pnpm --filter @softarq/api build`).
 */
import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { BASE_ORIGEN, ErrorRespaldo, RAIZ_API, conArchivoDeContrasena, dirDocumentosDesarrollo, herramientaPg, rutaDeClave, sha256Archivo, urlDeRol } from "./comun.mjs";
import { exigirRespaldoValido } from "./verificar.mjs";

export const DESTINO_INICIALIZACION = BASE_ORIGEN; // softarq_dev, fijo

/** El destino no se elige: solo se acepta la confirmación literal del nombre de la base. */
export function validarConfirmacion(confirmar) {
  if (confirmar !== DESTINO_INICIALIZACION) {
    throw new ErrorRespaldo(`Falta la confirmación: añada «--confirmar ${DESTINO_INICIALIZACION}». El destino es fijo y no se puede cambiar.`);
  }
  return DESTINO_INICIALIZACION;
}

/** Cuenta los objetos del esquema public; la inicialización exige 0. */
export const CONSULTA_OBJETOS_PUBLIC = `
  SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public')
       + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
       + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')) AS objetos`;

export function exigirBaseVacia(objetos) {
  if (Number(objetos) !== 0) {
    throw new ErrorRespaldo(`El destino ya contiene ${objetos} objeto(s) en public: no se sobrescribe. Use una base nueva y vacía.`);
  }
}

/** Nombres de las carpetas de migración del repositorio, ordenados. */
export function migracionesDelRepositorio(dir = join(RAIZ_API, "prisma", "migrations")) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function compararMigraciones({ aplicadas, manifiesto, repositorio }) {
  const problemas = [];
  if (aplicadas.at(-1) !== manifiesto.ultimaMigracion) problemas.push(`última migración aplicada ${aplicadas.at(-1)} ≠ manifiesto ${manifiesto.ultimaMigracion}`);
  if (JSON.stringify(aplicadas) !== JSON.stringify([...repositorio])) problemas.push("las migraciones aplicadas no coinciden con prisma/migrations (hay pendientes o de más)");
  return problemas;
}

export async function inicializarDesarrollo(carpetaRespaldo, opciones = {}) {
  const destino = validarConfirmacion(opciones.confirmar);
  const carpetaDocs = dirDocumentosDesarrollo();

  const m = await exigirRespaldoValido(carpetaRespaldo);
  const informe = { respaldo: m.id, destino, carpetaDocumentos: carpetaDocs, inicio: new Date().toISOString(), pasos: [] };
  const paso = (t) => {
    informe.pasos.push(t);
    if (!opciones.silencioso) console.log(`  · ${t}`);
  };

  const migrador = urlDeRol("MIGRATION_DATABASE_URL", "softarq_migrator", destino);
  const abrir = async () => {
    const c = new pg.Client({ connectionString: migrador.cadena, connectionTimeoutMillis: 10_000, application_name: "softarq-inicializacion" });
    await c.connect();
    return c;
  };

  let cliente = await abrir();
  try {
    const { rows: [c] } = await cliente.query(
      "SELECT current_database() AS base, current_user AS rol, pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database())) AS propietario",
    );
    if (c.base !== destino || c.rol !== "softarq_migrator" || c.propietario !== "softarq_migrator") {
      throw new ErrorRespaldo(`Destino inesperado (${c.base}/${c.rol}, propietario ${c.propietario}); se detiene.`);
    }
    await cliente.query(`DO $$ BEGIN
      IF current_database() <> '${DESTINO_INICIALIZACION}' THEN RAISE EXCEPTION 'Destino no permitido: %', current_database(); END IF;
    END $$`);
    paso(`destino ${destino} y propietario softarq_migrator comprobados`);
    const { rows: [o] } = await cliente.query(CONSULTA_OBJETOS_PUBLIC);
    exigirBaseVacia(o.objetos);
    paso("el esquema public está vacío");
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
    herramientaPg(
      "psql",
      ["-h", migrador.host, "-p", migrador.puerto, "-U", migrador.usuario, "-d", destino, "--no-password", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", join(RAIZ_API, "scripts", "db", "permisos-app.sql")],
      entorno,
    );
    paso("permisos de softarq_app reaplicados (permisos-app.sql)");
  });

  cliente = await abrir();
  try {
    const { rows: [c] } = await cliente.query("SELECT current_database() AS base");
    if (c.base !== destino) throw new ErrorRespaldo("Conexión inesperada; se detiene.");
    const r = await cliente.query("UPDATE public.sesion SET revocada_en = now(), motivo_revocacion = 'RESTAURACION' WHERE revocada_en IS NULL");
    informe.sesionesRevocadas = r.rowCount;
    paso(`sesiones restauradas revocadas: ${r.rowCount}`);
    const { rows } = await cliente.query("SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name");
    const problemas = compararMigraciones({ aplicadas: rows.map((x) => x.migration_name), manifiesto: m.esquema, repositorio: migracionesDelRepositorio() });
    if (problemas.length) throw new ErrorRespaldo(`Historial de migraciones incoherente: ${problemas.join("; ")}. No se aplicó ninguna migración.`);
    informe.ultimaMigracion = m.esquema.ultimaMigracion;
    paso(`migraciones: ${rows.length} aplicadas, última ${m.esquema.ultimaMigracion}, iguales al repositorio (no se aplicó ninguna)`);
  } finally {
    await cliente.end().catch(() => {});
  }

  // Documentos: comprobar los existentes, copiar los ausentes sin sobrescribir.
  let copiados = 0;
  for (const d of m.documentos.lista) {
    const origen = rutaDeClave(join(carpetaRespaldo, "documentos"), d.clave);
    const destinoArchivo = rutaDeClave(carpetaDocs, d.clave);
    if (existsSync(destinoArchivo)) {
      if (statSync(destinoArchivo).size !== d.bytes || (await sha256Archivo(destinoArchivo)) !== d.sha256) {
        throw new ErrorRespaldo(`El documento existente ${d.clave} no coincide con el manifiesto; no se sobrescribe.`);
      }
      continue;
    }
    mkdirSync(dirname(destinoArchivo), { recursive: true });
    copyFileSync(origen, destinoArchivo, constants.COPYFILE_EXCL);
    if ((await sha256Archivo(destinoArchivo)) !== d.sha256) throw new ErrorRespaldo(`La copia de ${d.clave} no coincide con el manifiesto.`);
    copiados += 1;
  }
  informe.documentosCopiados = copiados;
  paso(`documentos comprobados: ${m.documentos.total} (copiados por faltar: ${copiados})`);

  const revisar = join(RAIZ_API, "dist", "modules", "cotizaciones", "mantenimiento", "revisar-documentos.js");
  if (!existsSync(revisar)) throw new ErrorRespaldo("Falta la API compilada: ejecute pnpm --filter @softarq/api build.");
  const rev = spawnSync(process.execPath, [revisar], { cwd: RAIZ_API, encoding: "utf8", windowsHide: true });
  informe.documentosRevisar = { codigo: rev.status, salida: rev.stdout.trim() };
  if (rev.status !== 0) throw new ErrorRespaldo(`documentos:revisar terminó con código ${rev.status}:\n${rev.stdout}${rev.stderr}`);
  paso("documentos:revisar contra softarq_dev: sin ausentes ni dañados");

  informe.fin = new Date().toISOString();
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
  const confirmar = leerOpcion(args, "--confirmar");
  const carpeta = args[0];
  try {
    if (!carpeta) throw new ErrorRespaldo("Uso: pnpm respaldo:inicializar-desarrollo <carpeta del respaldo> --confirmar softarq_dev");
    validarConfirmacion(confirmar);
    console.log(`Inicializando ${DESTINO_INICIALIZACION} desde ${carpeta}...`);
    const r = await inicializarDesarrollo(carpeta, { confirmar });
    console.log(`Inicialización COMPLETA de ${r.destino}; documentos en ${r.carpetaDocumentos}.`);
  } catch (error) {
    console.error(`Inicialización detenida: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
