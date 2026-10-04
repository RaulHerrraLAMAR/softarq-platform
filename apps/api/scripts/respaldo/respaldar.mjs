#!/usr/bin/env node
/**
 * Respaldo local de softarq_dev con sus documentos originales (ADR-0012).
 *
 * Uso (desde apps/api):  pnpm respaldo:crear
 *   Opcional, solo para pruebas: SOFTARQ_DIR_RESPALDOS y SOFTARQ_DIR_DOCUMENTOS_ORIGEN (otra carpeta).
 *
 * Coherencia base ↔ archivos:
 * 1. Transacción REPEATABLE READ READ ONLY con el rol softarq_respaldo y pg_export_snapshot().
 * 2. pg_dump --snapshot=<id> vuelca EXACTAMENTE esa instantánea; en la misma transacción se leen
 *    las emisiones (clave, tamaño, SHA-256), la última migración y los conteos por tabla.
 * 3. La API escribe y sincroniza el PDF ANTES de registrar la emisión (ADR-0010 §6), así que toda
 *    emisión de la instantánea ya tiene su archivo; las emisiones posteriores no están en el volcado
 *    ni se copian. Los archivos registrados nunca se modifican ni los borra documentos:revisar.
 * 4. Se copian solo los archivos referenciados, sin sobrescribir, y se comprueba tamaño y SHA-256 en
 *    origen y en copia. Si falta o no coincide alguno, el respaldo queda INCOMPLETO.
 *
 * Resultado: <carpeta>\<ID>\ (COMPLETO) o <carpeta>\<ID>.INCOMPLETO\, con base.dump, documentos\ y
 * manifiesto.json. Mientras se crea, <ID>.en-curso\. Nunca sobrescribe ni borra respaldos ni originales.
 */
import { constants, copyFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  BASE_ORIGEN,
  DIR_RESPALDOS_POR_OMISION,
  ErrorRespaldo,
  FORMATO_MANIFIESTO,
  PATRON_CLAVE,
  conArchivoDeContrasena,
  dirDocumentosDesarrollo,
  escribirJson,
  estadoGit,
  herramientaPg,
  nuevoIdentificador,
  rutaDeClave,
  sha256Archivo,
  urlRespaldo,
  validarCarpetaRespaldos,
  versionHerramienta,
} from "./comun.mjs";

/**
 * Crea un respaldo. Devuelve { id, ruta, estado, problemas, manifiesto }.
 * Nunca lanza después de crear la carpeta: un fallo deja <ID>.INCOMPLETO con su motivo.
 */
export async function crearRespaldo(opciones = {}) {
  const dirDocsDesarrollo = dirDocumentosDesarrollo();
  const dirDocumentos = opciones.dirDocumentos ?? process.env.SOFTARQ_DIR_DOCUMENTOS_ORIGEN ?? dirDocsDesarrollo;
  const dirRespaldos = validarCarpetaRespaldos(opciones.dirRespaldos ?? process.env.SOFTARQ_DIR_RESPALDOS ?? DIR_RESPALDOS_POR_OMISION, {
    dirDocumentosDesarrollo: dirDocsDesarrollo,
  });
  const conexion = urlRespaldo();
  if (!existsSync(dirDocumentos)) throw new ErrorRespaldo(`No existe la carpeta de documentos de origen: ${dirDocumentos}`);

  const id = nuevoIdentificador();
  mkdirSync(dirRespaldos, { recursive: true });
  const enCurso = join(dirRespaldos, `${id}.en-curso`);
  for (const r of [enCurso, join(dirRespaldos, id), join(dirRespaldos, `${id}.INCOMPLETO`)]) {
    if (existsSync(r)) throw new ErrorRespaldo(`Ya existe ${r}; no se sobrescribe.`);
  }
  mkdirSync(enCurso); // sin recursive: falla si apareció entre medias
  const inicio = new Date();
  const problemas = [];
  const manifiesto = {
    formato: FORMATO_MANIFIESTO,
    id,
    creadoEn: inicio.toISOString(),
    estado: "INCOMPLETO",
    problemas,
    origen: { base: BASE_ORIGEN, rol: conexion.usuario, servidor: null, pgDump: versionHerramienta("pg_dump"), carpetaDocumentos: dirDocumentos },
    aplicacion: estadoGit(),
    esquema: { ultimaMigracion: null, migraciones: [] },
    base: { archivo: "base.dump", formato: "custom (pg_dump -Fc)", instantanea: null, bytes: null, sha256: null },
    documentos: { total: 0, bytesTotales: 0, lista: [] },
    conteos: {},
    duracionMs: null,
  };

  try {
    const cliente = new pg.Client({ connectionString: conexion.cadena, connectionTimeoutMillis: 10_000, application_name: "softarq-respaldo" });
    await cliente.connect();
    let emisiones;
    try {
      await cliente.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { rows: [inst] } = await cliente.query("SELECT pg_export_snapshot() AS id, current_database() AS base, current_user AS rol, version() AS version");
      if (inst.base !== BASE_ORIGEN || inst.rol !== "softarq_respaldo") throw new ErrorRespaldo("La conexión no es softarq_respaldo → softarq_dev.");
      manifiesto.origen.servidor = inst.version;
      manifiesto.base.instantanea = "pg_export_snapshot (REPEATABLE READ, solo lectura)";

      const { rows: migraciones } = await cliente.query(
        `SELECT migration_name AS nombre FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
      );
      manifiesto.esquema.migraciones = migraciones.map((m) => m.nombre);
      manifiesto.esquema.ultimaMigracion = migraciones.at(-1)?.nombre ?? null;

      const { rows: tablas } = await cliente.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
      );
      for (const { tablename } of tablas) {
        const { rows } = await cliente.query(`SELECT count(*)::int AS n FROM public.${cliente.escapeIdentifier(tablename)}`);
        manifiesto.conteos[tablename] = rows[0].n;
      }

      ({ rows: emisiones } = await cliente.query(
        `SELECT e.id, e.organizacion_id, e.folio, e.version_numero, e.archivo_clave, e.archivo_bytes, encode(e.archivo_sha256, 'hex') AS sha256
           FROM public.emision e ORDER BY e.emitido_en, e.id`,
      ));

      // pg_dump de la MISMA instantánea mientras la transacción sigue abierta.
      const destinoDump = join(enCurso, "base.dump");
      conArchivoDeContrasena(conexion, (entorno) =>
        herramientaPg(
          "pg_dump",
          ["-h", conexion.host, "-p", conexion.puerto, "-U", conexion.usuario, "-d", conexion.base, "--no-password", "-Fc", `--snapshot=${inst.id}`, "-f", destinoDump],
          entorno,
        ),
      );
      await cliente.query("COMMIT");
    } finally {
      await cliente.end().catch(() => {});
    }

    const dump = join(enCurso, "base.dump");
    manifiesto.base.bytes = statSync(dump).size;
    manifiesto.base.sha256 = await sha256Archivo(dump);
    conArchivoDeContrasena(conexion, (entorno) => herramientaPg("pg_restore", ["--list", dump], entorno)); // legible

    // Documentos referenciados por la instantánea.
    for (const e of emisiones) {
      const desc = { emisionId: e.id, organizacionId: e.organizacion_id, folio: e.folio, version: e.version_numero, clave: e.archivo_clave, bytes: e.archivo_bytes, sha256: e.sha256 };
      if (!PATRON_CLAVE.test(e.archivo_clave)) {
        problemas.push({ tipo: "CLAVE_INVALIDA", clave: e.archivo_clave, emisionId: e.id });
        continue;
      }
      const origen = rutaDeClave(dirDocumentos, e.archivo_clave);
      if (!existsSync(origen)) {
        problemas.push({ tipo: "AUSENTE", clave: e.archivo_clave, emisionId: e.id, folio: `${e.folio}-v${e.version_numero}` });
        continue;
      }
      const bytesOrigen = statSync(origen).size;
      const shaOrigen = await sha256Archivo(origen);
      if (bytesOrigen !== e.archivo_bytes || shaOrigen !== e.sha256) {
        problemas.push({ tipo: "DANADO", clave: e.archivo_clave, emisionId: e.id, folio: `${e.folio}-v${e.version_numero}`, esperado: { bytes: e.archivo_bytes, sha256: e.sha256 }, encontrado: { bytes: bytesOrigen, sha256: shaOrigen } });
        continue;
      }
      const destino = rutaDeClave(join(enCurso, "documentos"), e.archivo_clave);
      mkdirSync(dirname(destino), { recursive: true });
      copyFileSync(origen, destino, constants.COPYFILE_EXCL);
      if ((await sha256Archivo(destino)) !== e.sha256 || statSync(destino).size !== e.archivo_bytes) {
        problemas.push({ tipo: "COPIA_DISTINTA", clave: e.archivo_clave, emisionId: e.id });
        continue;
      }
      manifiesto.documentos.lista.push(desc);
      manifiesto.documentos.bytesTotales += e.archivo_bytes;
    }
    manifiesto.documentos.total = manifiesto.documentos.lista.length;
    manifiesto.documentos.referenciados = emisiones.length;
  } catch (error) {
    problemas.push({ tipo: "ERROR", mensaje: error instanceof Error ? error.message : String(error) });
  }

  manifiesto.estado = problemas.length === 0 ? "COMPLETO" : "INCOMPLETO";
  manifiesto.duracionMs = Date.now() - inicio.getTime();
  escribirJson(join(enCurso, "manifiesto.json"), manifiesto);
  const final = join(dirRespaldos, manifiesto.estado === "COMPLETO" ? id : `${id}.INCOMPLETO`);
  renameSync(enCurso, final);
  return { id, ruta: final, estado: manifiesto.estado, problemas, manifiesto };
}

function describirProblema(p) {
  switch (p.tipo) {
    case "AUSENTE":
      return `falta el PDF de ${p.folio} (${p.clave})`;
    case "DANADO":
      return `el PDF de ${p.folio} no coincide con su registro (tamaño o SHA-256): ${p.clave}`;
    case "COPIA_DISTINTA":
      return `la copia de ${p.clave} no coincide con el original`;
    case "CLAVE_INVALIDA":
      return `clave de documento inválida en la base: ${p.clave}`;
    default:
      return p.mensaje;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const r = await crearRespaldo();
    const m = r.manifiesto;
    if (r.estado === "COMPLETO") {
      console.log(`Respaldo COMPLETO: ${r.ruta}`);
      console.log(`  base: ${m.base.bytes} bytes, SHA-256 ${m.base.sha256}`);
      console.log(`  esquema: ${m.esquema.ultimaMigracion} · commit ${m.aplicacion.commit?.slice(0, 7)}${m.aplicacion.arbolConCambios ? " (con cambios sin commit)" : ""}`);
      console.log(`  documentos: ${m.documentos.total}/${m.documentos.referenciados} (${m.documentos.bytesTotales} bytes)`);
    } else {
      console.error(`Respaldo INCOMPLETO (no sirve para restaurar): ${r.ruta}`);
      for (const p of r.problemas) console.error(`  - ${describirProblema(p)}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`No se creó el respaldo: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
