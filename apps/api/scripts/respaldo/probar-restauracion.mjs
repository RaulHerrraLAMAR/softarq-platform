#!/usr/bin/env node
/**
 * Prueba completa y reproducible de respaldo y recuperación (ADR-0012). No basta con que pg_dump
 * termine: se restaura en el destino aislado y se comprueba que el sistema funciona.
 *
 * Uso (desde apps/api, con la API compilada: pnpm --filter @softarq/api build):
 *   pnpm respaldo:probar-restauracion
 *
 * Pasos:
 *  1. Huella de softarq_dev (conteos por tabla, solo lectura) y de su carpeta de documentos
 *     (tamaño y SHA-256 de cada archivo, solo lectura).
 *  2. Respaldo real en D:\Proyecto_SoftArq\respaldos\softarq_dev y verificación.
 *  3. Restauración en softarq_restauracion (+ documentos en _work\restauracion).
 *  4. Comprobaciones en el destino: conteos, esquema, relaciones de organización, versiones,
 *     revisiones, aprobaciones y emisiones, permisos de softarq_app y sesiones revocadas.
 *  5. API temporal aislada en 127.0.0.1:3100 contra el destino: inicio de sesión DEMO y descarga de
 *     cada PDF; mismos bytes que el original. Se detiene al terminar.
 *  6. Casos de fallo SOLO con copias en _work\pruebas\respaldo-fallos (nunca los originales):
 *     PDF ausente y PDF dañado al respaldar, respaldo alterado al verificar y restaurar, destinos
 *     prohibidos (softarq_dev, softarq_test) y carpeta de documentos de desarrollo como destino.
 *  7. Huella de softarq_dev y sus documentos otra vez: deben ser idénticas.
 * Informe en _work\evidencias\respaldo-<ID>\informe.json y informe.txt.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import pg from "pg";
import {
  DIR_DOCUMENTOS_RESTAURACION_POR_OMISION,
  DIR_WORK,
  RAIZ_API,
  RAIZ_REPOSITORIO,
  dirDocumentosDesarrollo,
  rutaDeClave,
  sha256Archivo,
  sha256Buffer,
  urlDeRol,
  urlRespaldo,
} from "./comun.mjs";
import { crearRespaldo } from "./respaldar.mjs";
import { restaurarRespaldo } from "./restaurar.mjs";
import { verificarRespaldo } from "./verificar.mjs";

const PUERTO_API = 3100;
const ORIGEN_WEB = "http://localhost:5173";
const DIR_FALLOS = join(DIR_WORK, "pruebas", "respaldo-fallos");
const resultados = [];

function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "OK  " : "FALLO"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

async function esperarRechazo(nombre, fn, patron) {
  try {
    await fn();
    registrar(nombre, false, "no se rechazó");
  } catch (e) {
    const ok = patron.test(e.message);
    registrar(nombre, ok, e.message.split("\n")[0].slice(0, 160));
  }
}

function listarArchivos(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listarArchivos(join(dir, e.name)) : [join(dir, e.name)]));
}

/** Huella de solo lectura de softarq_dev y de sus documentos. */
async function huellaDesarrollo() {
  const c = new pg.Client({ connectionString: urlRespaldo().cadena, application_name: "softarq-huella" });
  await c.connect();
  const conteos = {};
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    for (const { tablename } of rows) {
      conteos[tablename] = (await c.query(`SELECT count(*)::int AS n FROM public.${c.escapeIdentifier(tablename)}`)).rows[0].n;
    }
    await c.query("COMMIT");
  } finally {
    await c.end();
  }
  const dir = dirDocumentosDesarrollo();
  const documentos = {};
  for (const f of listarArchivos(dir)) {
    const s = statSync(f);
    documentos[relative(dir, f).split("\\").join("/")] = { bytes: s.size, sha256: await sha256Archivo(f), mtimeMs: s.mtimeMs };
  }
  return { conteos, documentos };
}

/** Comprobaciones SQL en el destino restaurado (como migrador; solo lectura). */
async function comprobarDestino(manifiesto) {
  const migrador = urlDeRol("MIGRATION_DATABASE_URL", "softarq_migrator", "softarq_restauracion");
  const c = new pg.Client({ connectionString: migrador.cadena, application_name: "softarq-comprobacion" });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const base = (await c.query("SELECT current_database() AS b")).rows[0].b;
    registrar("destino comprobado", base === "softarq_restauracion", base);

    const distintos = [];
    for (const [tabla, n] of Object.entries(manifiesto.conteos)) {
      const r = (await c.query(`SELECT count(*)::int AS n FROM public.${c.escapeIdentifier(tabla)}`)).rows[0].n;
      if (r !== n) distintos.push(`${tabla}: ${r} ≠ ${n}`);
    }
    registrar("conteos por tabla iguales al manifiesto", distintos.length === 0, distintos.join("; ") || `${Object.keys(manifiesto.conteos).length} tablas`);

    const ultima = (await c.query(`SELECT max(migration_name) AS m FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].m;
    registrar("versión del esquema restaurada", ultima === manifiesto.esquema.ultimaMigracion, ultima);

    const relaciones = {
      "proyecto ↔ cliente (organización)": `SELECT count(*)::int n FROM proyecto p JOIN cliente c ON c.id = p.cliente_id WHERE c.organizacion_id <> p.organizacion_id`,
      "cotización ↔ proyecto/cliente": `SELECT count(*)::int n FROM cotizacion q JOIN proyecto p ON p.id = q.proyecto_id WHERE p.organizacion_id <> q.organizacion_id OR p.cliente_id <> q.cliente_id`,
      "versión ↔ cotización": `SELECT count(*)::int n FROM cotizacion_version v LEFT JOIN cotizacion q ON q.id = v.cotizacion_id WHERE q.id IS NULL OR q.organizacion_id <> v.organizacion_id`,
      "revisión ↔ versión": `SELECT count(*)::int n FROM revision r LEFT JOIN cotizacion_version v ON v.id = r.version_id WHERE v.id IS NULL OR v.cotizacion_id <> r.cotizacion_id OR v.organizacion_id <> r.organizacion_id`,
      "evento ↔ revisión": `SELECT count(*)::int n FROM revision_evento e LEFT JOIN revision r ON r.id = e.revision_id WHERE r.id IS NULL OR r.organizacion_id <> e.organizacion_id`,
      "emisión ↔ versión y aprobación": `SELECT count(*)::int n FROM emision e LEFT JOIN cotizacion_version v ON v.id = e.version_id LEFT JOIN revision r ON r.id = e.revision_id
          WHERE v.id IS NULL OR r.id IS NULL OR v.cotizacion_id <> e.cotizacion_id OR r.version_id <> e.version_id OR v.organizacion_id <> e.organizacion_id`,
      "membresía ↔ usuario": `SELECT count(*)::int n FROM membresia m LEFT JOIN usuario u ON u.id = m.usuario_id WHERE u.id IS NULL`,
    };
    for (const [nombre, sql] of Object.entries(relaciones)) {
      const n = (await c.query(sql)).rows[0].n;
      registrar(`relaciones: ${nombre}`, n === 0, `${n} incoherencias`);
    }
    if (Object.hasOwn(manifiesto.conteos, "respuesta_cliente_evento")) {
      const inconsistencias = (await c.query(`SELECT count(*)::int n FROM respuesta_cliente_evento x
        LEFT JOIN emision e ON e.id=x.emision_id AND e.organizacion_id=x.organizacion_id
        LEFT JOIN membresia m ON m.usuario_id=x.registrado_por AND m.organizacion_id=x.organizacion_id
        LEFT JOIN respuesta_cliente_evento a ON a.id=x.anterior_id AND a.emision_id=x.emision_id AND a.organizacion_id=x.organizacion_id
        WHERE e.id IS NULL OR m.usuario_id IS NULL OR x.fecha_respuesta < e.fecha_emision OR x.fecha_respuesta > e.vigente_hasta
          OR x.fecha_respuesta > x.fecha_registro OR (x.anterior_id IS NOT NULL AND (a.id IS NULL OR a.numero+1<>x.numero OR x.motivo IS NULL))`)).rows[0].n;
      registrar("respuestas: organización, emisión, autor, fechas y cadena de correcciones", inconsistencias === 0, `${inconsistencias} incoherencias`);
      const permisos = (await c.query(`SELECT has_table_privilege('softarq_app','public.respuesta_cliente_evento','SELECT') lectura,
        has_table_privilege('softarq_app','public.respuesta_cliente_evento','INSERT') insercion,
        has_table_privilege('softarq_app','public.respuesta_cliente_evento','UPDATE') edicion,
        has_table_privilege('softarq_app','public.respuesta_cliente_evento','DELETE') borrado,
        has_schema_privilege('softarq_app','public','CREATE') ddl,
        (SELECT count(*)::int FROM pg_trigger t JOIN pg_class k ON k.oid=t.tgrelid WHERE k.relname='respuesta_cliente_evento' AND NOT t.tgisinternal) disparadores`)).rows[0];
      registrar("respuestas: permisos mínimos y disparadores restaurados", permisos.lectura && permisos.insercion && !permisos.edicion && !permisos.borrado && !permisos.ddl && permisos.disparadores === 2, JSON.stringify(permisos));
      const origen = new pg.Client({ connectionString: urlRespaldo().cadena }); await origen.connect();
      try {
        const sql = "SELECT to_jsonb(x) fila FROM respuesta_cliente_evento x ORDER BY organizacion_id,emision_id,numero";
        const filasOrigen = (await origen.query(sql)).rows, filasDestino = (await c.query(sql)).rows;
        registrar("respuestas: eventos y notas íntegros tras restaurar", JSON.stringify(filasOrigen) === JSON.stringify(filasDestino), `${filasDestino.length} eventos comparados con origen (solo lectura)`);
      } finally { await origen.end(); }
    }
    // Módulo 10 (ADR-0014): decisiones sobre excepciones. Condicional: respaldos anteriores no la tienen.
    if (Object.hasOwn(manifiesto.conteos, "excepcion_decision")) {
      const inconsistencias = (await c.query(`SELECT count(*)::int n FROM excepcion_decision d
        LEFT JOIN revision r ON r.id=d.revision_id AND r.organizacion_id=d.organizacion_id AND r.version_id=d.version_id
        LEFT JOIN cotizacion_version v ON v.id=d.version_id AND v.organizacion_id=d.organizacion_id
        LEFT JOIN membresia m ON m.usuario_id=d.decidido_por AND m.organizacion_id=d.organizacion_id
        WHERE r.id IS NULL OR v.id IS NULL OR m.usuario_id IS NULL OR d.cotizacion_id<>r.cotizacion_id OR d.preparador_id<>r.preparador_id
          OR d.decidido_por=d.preparador_id OR d.decidido_por=v.autor_id OR d.numero > coalesce(jsonb_array_length(v.captura->'excepciones'),0)`)).rows[0].n;
      registrar("excepciones: revisión, versión, autor, BL-17 y número coherentes", inconsistencias === 0, `${inconsistencias} incoherencias`);
      const permisos = (await c.query(`SELECT has_table_privilege('softarq_app','public.excepcion_decision','SELECT') lectura,
        has_table_privilege('softarq_app','public.excepcion_decision','INSERT') insercion,
        has_table_privilege('softarq_app','public.excepcion_decision','UPDATE') edicion,
        has_table_privilege('softarq_app','public.excepcion_decision','DELETE') borrado,
        has_function_privilege('softarq_app','public.softarq_decidir_excepcion(uuid,uuid,uuid,uuid,integer,text,text,uuid,text,bytea,timestamptz)','EXECUTE') funcion,
        (SELECT count(*)::int FROM pg_trigger t JOIN pg_class k ON k.oid=t.tgrelid WHERE k.relname='excepcion_decision' AND NOT t.tgisinternal) disparadores`)).rows[0];
      registrar("excepciones: permisos mínimos, función y disparadores restaurados", permisos.lectura && permisos.insercion && !permisos.edicion && !permisos.borrado && permisos.funcion && permisos.disparadores === 2, JSON.stringify(permisos));
      const origen = new pg.Client({ connectionString: urlRespaldo().cadena }); await origen.connect();
      try {
        const sql = "SELECT to_jsonb(d) fila FROM excepcion_decision d ORDER BY organizacion_id,version_id,numero";
        const filasOrigen = (await origen.query(sql)).rows, filasDestino = (await c.query(sql)).rows;
        registrar("excepciones: decisiones íntegras tras restaurar", JSON.stringify(filasOrigen) === JSON.stringify(filasDestino), `${filasDestino.length} decisiones comparadas con origen (solo lectura)`);
      } finally { await origen.end(); }
    }
    // Módulo 11 (ADR-0015): catálogos administrados. Condicional: respaldos anteriores no tienen la columna.
    const conAdministracion = (await c.query(`SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema='public' AND table_name='precio' AND column_name='registrado_por'`)).rows[0].n === 1;
    if (conAdministracion) {
      const inconsistencias = (await c.query(`SELECT
          (SELECT count(*) FROM precio x JOIN producto p ON p.id=x.producto_id JOIN proveedor r ON r.id=x.proveedor_id
            WHERE p.organizacion_id<>x.organizacion_id OR r.organizacion_id<>x.organizacion_id)
        + (SELECT count(*) FROM tarifa_mano_obra t JOIN proveedor r ON r.id=t.proveedor_id WHERE r.organizacion_id<>t.organizacion_id)
        + (SELECT count(*) FROM precio x LEFT JOIN membresia m ON m.usuario_id=x.registrado_por AND m.organizacion_id=x.organizacion_id
            WHERE x.registrado_por IS NOT NULL AND m.usuario_id IS NULL)
        + (SELECT count(*) FROM precio x WHERE x.anulado AND (x.motivo_anulacion IS NULL OR x.anulado_en IS NULL))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='precio' AND NOT EXISTS (SELECT 1 FROM precio x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='proveedor' AND NOT EXISTS (SELECT 1 FROM proveedor x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='producto' AND NOT EXISTS (SELECT 1 FROM producto x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='tarifa' AND NOT EXISTS (SELECT 1 FROM tarifa_mano_obra x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        AS n`)).rows[0].n;
      registrar("catálogo administrado: organización, autoría, anulación y bitácora coherentes", Number(inconsistencias) === 0, `${inconsistencias} incoherencias`);
      const permisos = (await c.query(`SELECT
          has_column_privilege('softarq_app','public.precio','vigente_hasta','UPDATE') cierre,
          has_column_privilege('softarq_app','public.precio','precio_unitario','UPDATE') importe,
          has_column_privilege('softarq_app','public.tarifa_mano_obra','importe','UPDATE') tarifa,
          has_table_privilege('softarq_app','public.precio','DELETE') borrado,
          has_function_privilege('softarq_app','public.softarq_cerrar_vigencia_precio(uuid,uuid,text,integer,date,date,text,jsonb,uuid,text,bytea,timestamptz)','EXECUTE') funcion,
          (SELECT count(*)::int FROM pg_trigger t JOIN pg_class k ON k.oid=t.tgrelid
            WHERE k.relname IN ('producto','precio','tarifa_mano_obra') AND NOT t.tgisinternal) disparadores,
          (SELECT count(*)::int FROM pg_indexes WHERE indexname IN ('proveedor_nombre_normalizado_key','producto_descripcion_presentacion_key')) unicos`)).rows[0];
      registrar(
        "catálogo administrado: permisos mínimos, funciones, disparadores e índices restaurados",
        permisos.cierre && !permisos.importe && !permisos.tarifa && !permisos.borrado && permisos.funcion && permisos.disparadores === 4 && permisos.unicos === 2,
        JSON.stringify(permisos),
      );
      const origen = new pg.Client({ connectionString: urlRespaldo().cadena }); await origen.connect();
      try {
        const sql = `SELECT json_build_array(
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM proveedor x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM producto x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM precio x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM tarifa_mano_obra x),
            (SELECT coalesce(json_agg(json_build_array(x.codigo, x.tarifa_id, x.estado) ORDER BY x.organizacion_id, x.codigo), '[]') FROM concepto x),
            (SELECT coalesce(json_agg(to_jsonb(b) ORDER BY b.id), '[]') FROM bitacora b WHERE b.entidad IN ('proveedor','producto','precio','tarifa','concepto'))
          )::text AS f`;
        const a = (await origen.query(sql)).rows[0].f, b = (await c.query(sql)).rows[0].f;
        const eventos = (await c.query("SELECT count(*)::int n FROM bitacora WHERE entidad IN ('proveedor','producto','precio','tarifa','concepto')")).rows[0].n;
        registrar("catálogo administrado: registros, vigencias, asignaciones e historial íntegros tras restaurar", a === b, `${eventos} eventos de catálogo comparados con origen (solo lectura)`);
      } finally { await origen.end(); }
    }
    // Módulo 12 (ADR-0016): catálogo técnico. Condicional: respaldos anteriores no tienen la tabla.
    const conTecnico = (await c.query("SELECT to_regclass('public.tipo_estructura') IS NOT NULL AS t")).rows[0].t;
    if (conTecnico) {
      const inconsistencias = (await c.query(`SELECT
          (SELECT count(*) FROM concepto x JOIN tipo_estructura t ON t.id=x.tipo_id WHERE t.organizacion_id<>x.organizacion_id)
        + (SELECT count(*) FROM concepto x WHERE NOT x.heredado AND (x.tipo_id IS NULL OR x.regla_medicion IS NULL))
        + (SELECT count(*) FROM concepto x WHERE x.estado='Aprobado' AND x.aprobado_en IS NULL AND NOT x.heredado)
        + (SELECT count(*) FROM concepto x WHERE x.estado='Borrador' AND (x.aprobado_por IS NOT NULL OR x.aprobado_en IS NOT NULL))
        + (SELECT count(*) FROM conversion v JOIN insumo i ON i.id=v.insumo_id WHERE v.unidad_destino<>i.unidad_base)
        + (SELECT count(*) FROM componente k JOIN concepto x ON x.id=k.concepto_id WHERE x.organizacion_id<>k.organizacion_id)
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='tipo_estructura' AND NOT EXISTS (SELECT 1 FROM tipo_estructura x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='insumo' AND NOT EXISTS (SELECT 1 FROM insumo x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='conversion' AND NOT EXISTS (SELECT 1 FROM conversion x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        + (SELECT count(*) FROM bitacora b WHERE b.entidad='componente' AND NOT EXISTS (SELECT 1 FROM componente x WHERE x.id=b.entidad_id AND x.organizacion_id=b.organizacion_id))
        AS n`)).rows[0].n;
      registrar("catálogo técnico: tipos, heredados, aprobaciones, conversiones y bitácora coherentes", Number(inconsistencias) === 0, `${inconsistencias} incoherencias`);
      const permisos = (await c.query(`SELECT
          has_column_privilege('softarq_app','public.concepto','estado','UPDATE') estado,
          has_column_privilege('softarq_app','public.concepto','heredado','UPDATE') heredado,
          has_column_privilege('softarq_app','public.concepto','codigo','UPDATE') codigo,
          has_column_privilege('softarq_app','public.componente','concepto_id','UPDATE') componente,
          has_table_privilege('softarq_app','public.concepto','DELETE') borrado,
          has_function_privilege('softarq_app','public.softarq_aprobar_concepto(uuid,uuid,text,integer,uuid,text,bytea,timestamptz)','EXECUTE') funcion,
          (SELECT count(*)::int FROM pg_trigger t JOIN pg_class k ON k.oid=t.tgrelid
            WHERE k.relname IN ('tipo_estructura','insumo','conversion','componente','concepto') AND NOT t.tgisinternal) disparadores,
          (SELECT count(*)::int FROM pg_indexes WHERE indexname IN ('insumo_descripcion_normalizada_key','tipo_estructura_familia_nombre_key',
            'concepto_tipo_descripcion_key','componente_concepto_insumo_key','conversion_insumo_origen_key')) unicos`)).rows[0];
      registrar(
        "catálogo técnico: permisos mínimos, funciones, disparadores e índices restaurados",
        permisos.estado && !permisos.heredado && !permisos.codigo && !permisos.componente && !permisos.borrado && permisos.funcion && permisos.disparadores === 7 && permisos.unicos === 5,
        JSON.stringify(permisos),
      );
      const origen = new pg.Client({ connectionString: urlRespaldo().cadena }); await origen.connect();
      try {
        const sql = `SELECT json_build_array(
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM tipo_estructura x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM insumo x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.insumo_id, x.unidad_origen), '[]') FROM conversion x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM concepto x),
            (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.organizacion_id, x.codigo), '[]') FROM componente x)
          )::text AS f`;
        const a = (await origen.query(sql)).rows[0].f, b = (await c.query(sql)).rows[0].f;
        const heredados = (await c.query("SELECT count(*)::int n FROM concepto WHERE heredado")).rows[0].n;
        registrar("catálogo técnico: registros, marcas de heredado y aprobaciones íntegros tras restaurar", a === b, `${heredados} concepto(s) heredado(s) comparados con origen (solo lectura)`);
      } finally { await origen.end(); }
    }
    const resumen = (await c.query(`SELECT
        (SELECT count(*) FROM organizacion)::int organizaciones, (SELECT count(*) FROM usuario)::int usuarios,
        (SELECT count(*) FROM cotizacion)::int cotizaciones, (SELECT count(*) FROM cotizacion_version)::int versiones,
        (SELECT count(*) FROM revision)::int revisiones, (SELECT count(*) FROM revision WHERE estado = 'APROBADA')::int aprobadas,
        (SELECT count(*) FROM emision)::int emisiones`)).rows[0];
    registrar("datos persistidos presentes", resumen.organizaciones > 0 && resumen.usuarios > 0 && resumen.emisiones === manifiesto.documentos.total, JSON.stringify(resumen));

    const emisiones = (await c.query(`SELECT archivo_clave, archivo_bytes, encode(archivo_sha256, 'hex') sha FROM emision`)).rows;
    const malos = [];
    for (const e of emisiones) {
      const ruta = rutaDeClave(DIR_DOCUMENTOS_RESTAURACION_POR_OMISION, e.archivo_clave);
      if (!existsSync(ruta) || statSync(ruta).size !== e.archivo_bytes || (await sha256Archivo(ruta)) !== e.sha) malos.push(e.archivo_clave);
    }
    registrar("documentos referenciados presentes con su hash", malos.length === 0, `${emisiones.length - malos.length}/${emisiones.length}`);

    const p = (await c.query(`SELECT
        has_table_privilege('softarq_app', 'public.emision', 'SELECT') emision_select,
        has_table_privilege('softarq_app', 'public.emision', 'UPDATE') emision_update,
        has_table_privilege('softarq_app', 'public.emision', 'DELETE') emision_delete,
        has_table_privilege('softarq_app', 'public.cotizacion_version', 'UPDATE') version_update,
        has_table_privilege('softarq_app', 'public._prisma_migrations', 'SELECT') migraciones_select,
        (SELECT count(*) FROM pg_trigger t JOIN pg_class k ON k.oid = t.tgrelid WHERE k.relname = 'emision' AND NOT t.tgisinternal)::int disparadores_emision`)).rows[0];
    registrar(
      "permisos de softarq_app y protección de emisiones restaurados",
      p.emision_select && !p.emision_update && !p.emision_delete && !p.version_update && !p.migraciones_select && p.disparadores_emision > 0,
      JSON.stringify(p),
    );
    const activas = (await c.query("SELECT count(*)::int n FROM sesion WHERE revocada_en IS NULL")).rows[0].n;
    registrar("sesiones restauradas revocadas", activas === 0, `${activas} activas`);
    await c.query("COMMIT");
    return emisiones;
  } finally {
    await c.end();
  }
}

async function esperarSalud(url, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** API temporal aislada contra el destino; inicia sesión y descarga cada PDF. */
async function descargarDesdeApiTemporal(manifiesto, dirEvidencias) {
  const main = join(RAIZ_API, "dist", "main.js");
  if (!existsSync(main)) throw new Error("Falta la API compilada (pnpm --filter @softarq/api build).");
  if (await esperarSalud(`http://127.0.0.1:${PUERTO_API}/health`, 500)) throw new Error(`El puerto ${PUERTO_API} ya está en uso; no se reutiliza otro proceso.`);
  const app = urlDeRol("DATABASE_URL", "softarq_app", "softarq_restauracion");
  const entorno = {
    ...process.env,
    SOFTARQ_ENV_FILE: join(DIR_WORK, "tmp", "sin-archivo.env"),
    DATABASE_URL: app.cadena,
    SOFTARQ_DIR_DOCUMENTOS: DIR_DOCUMENTOS_RESTAURACION_POR_OMISION,
    API_HOST: "127.0.0.1",
    API_PORT: String(PUERTO_API),
    API_CORS_ORIGINS: ORIGEN_WEB,
    API_REGISTRO: "errores",
    APP_ENV: "DEMO",
    NODE_ENV: "development",
  };
  for (const n of ["MIGRATION_DATABASE_URL", "SHADOW_DATABASE_URL", "RESPALDO_DATABASE_URL", "PGPASSWORD"]) delete entorno[n];
  const api = spawn(process.execPath, [main], { cwd: RAIZ_API, env: entorno, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let registroApi = "";
  api.stdout.on("data", (d) => (registroApi += d));
  api.stderr.on("data", (d) => (registroApi += d));
  const tmp = join(DIR_WORK, "tmp");
  const credencial = join(tmp, `cred-restauracion-${randomUUID()}.json`);
  const estado = join(tmp, `sesion-restauracion-${randomUUID()}.json`);
  try {
    const arriba = await esperarSalud(`http://127.0.0.1:${PUERTO_API}/health`, 30_000);
    registrar(`API temporal aislada en 127.0.0.1:${PUERTO_API} (softarq_restauracion)`, arriba, arriba ? `PID ${api.pid}` : registroApi.slice(-400));
    if (!arriba) return;
    const accesos = JSON.parse(readFileSync(join(DIR_WORK, "secrets", "accesos-demo-softarq_dev.json"), "utf8")).cuentas;
    const correo = "preparador.demo@softarq.test";
    writeFileSync(credencial, JSON.stringify({ correo, contrasena: accesos[correo].contrasena }), { encoding: "utf8", mode: 0o600 });
    const h = (...args) =>
      spawnSync(process.execPath, [join(RAIZ_REPOSITORIO, "scripts", "http", "api-json.mjs"), "--api", `http://localhost:${PUERTO_API}`, "--origen", ORIGEN_WEB, "--estado", estado, ...args], {
        cwd: RAIZ_REPOSITORIO,
        encoding: "utf8",
        windowsHide: true,
      });
    const entrar = h("entrar", credencial);
    registrar("inicio de sesión DEMO en la API temporal", entrar.status === 0, entrar.status === 0 ? correo : (entrar.stdout + entrar.stderr).slice(0, 300));
    if (entrar.status !== 0) return;
    for (const d of manifiesto.documentos.lista) {
      const salida = join(dirEvidencias, `descarga-${d.folio}-v${d.version}.pdf`);
      const r = h("descargar", `/api/v1/emisiones/${d.emisionId}/documento`, salida);
      if (r.status !== 0 || !existsSync(salida)) {
        registrar(`descarga del PDF ${d.folio}-v${d.version}`, false, (r.stdout + r.stderr).slice(0, 300));
        continue;
      }
      const descargado = readFileSync(salida);
      const original = readFileSync(rutaDeClave(dirDocumentosDesarrollo(), d.clave)); // solo lectura
      const igual = descargado.equals(original) && sha256Buffer(descargado) === d.sha256;
      registrar(`descarga del PDF ${d.folio}-v${d.version}: mismos bytes que el original`, igual, `${descargado.length} bytes, SHA-256 ${sha256Buffer(descargado).slice(0, 16)}…`);
    }
    h("salir");
  } finally {
    rmSync(credencial, { force: true });
    rmSync(estado, { force: true });
    api.kill();
    await new Promise((r) => (api.exitCode !== null ? r() : api.once("exit", r)));
    const libre = !(await esperarSalud(`http://127.0.0.1:${PUERTO_API}/health`, 500));
    registrar("API temporal detenida", libre, `PID ${api.pid}`);
  }
}

/** Casos de fallo con copias desechables (nunca los documentos de desarrollo). */
async function casosDeFallo(respaldoBueno, manifiesto) {
  rmSync(DIR_FALLOS, { recursive: true, force: true }); // solo la carpeta propia de estas pruebas
  mkdirSync(DIR_FALLOS, { recursive: true });
  const dirRespaldos = join(DIR_FALLOS, "respaldos");
  const doc = manifiesto.documentos.lista[0];
  if (!doc) {
    registrar("casos de fallo de documentos", false, "no hay emisiones que respaldar");
  } else {
    for (const [caso, alterar, tipo] of [
      ["ausente", (ruta) => rmSync(ruta), "AUSENTE"],
      ["danado", (ruta) => {
        const b = readFileSync(ruta);
        b[Math.floor(b.length / 2)] ^= 0xff;
        writeFileSync(ruta, b);
      }, "DANADO"],
    ]) {
      const copia = join(DIR_FALLOS, `documentos-${caso}`);
      cpSync(join(respaldoBueno, "documentos"), copia, { recursive: true }); // copia del respaldo, no de los originales
      alterar(rutaDeClave(copia, doc.clave));
      const r = await crearRespaldo({ dirDocumentos: copia, dirRespaldos });
      const v = await verificarRespaldo(r.ruta);
      registrar(
        `respaldo con PDF ${caso === "ausente" ? "AUSENTE" : "DAÑADO"} → INCOMPLETO y no verificable`,
        r.estado === "INCOMPLETO" && r.ruta.endsWith(".INCOMPLETO") && r.problemas.some((p) => p.tipo === tipo) && !v.ok,
        `${r.problemas.map((p) => p.tipo).join(", ")} · ${relative(DIR_FALLOS, r.ruta)}`,
      );
    }
    const alterado = join(DIR_FALLOS, "alterado", manifiesto.id);
    cpSync(respaldoBueno, alterado, { recursive: true });
    const pdf = rutaDeClave(join(alterado, "documentos"), doc.clave);
    const b = readFileSync(pdf);
    b[b.length - 100] ^= 0x01;
    writeFileSync(pdf, b);
    const v = await verificarRespaldo(alterado);
    registrar("verificar detecta un PDF alterado en un respaldo", !v.ok && v.errores.some((e) => /SHA-256 distinto/.test(e)), v.errores[0] ?? "");
    await esperarRechazo("restaurar rechaza un respaldo alterado antes de conectar", () => restaurarRespaldo(alterado, { silencioso: true }), /NO válido/);
  }
  await esperarRechazo("destino softarq_dev rechazado", () => restaurarRespaldo(respaldoBueno, { destino: "softarq_dev", silencioso: true }), /PROHIBIDO/);
  await esperarRechazo("destino softarq_test rechazado", () => restaurarRespaldo(respaldoBueno, { destino: "softarq_test", silencioso: true }), /PROHIBIDO/);
  await esperarRechazo(
    "carpeta de documentos de desarrollo rechazada como destino",
    () => restaurarRespaldo(respaldoBueno, { documentos: dirDocumentosDesarrollo(), silencioso: true }),
    /PROHIBIDA/,
  );
}

function compararHuellas(antes, despues) {
  const dif = [];
  for (const t of new Set([...Object.keys(antes.conteos), ...Object.keys(despues.conteos)])) {
    if (antes.conteos[t] !== despues.conteos[t]) dif.push(`${t}: ${antes.conteos[t]} → ${despues.conteos[t]}`);
  }
  for (const f of new Set([...Object.keys(antes.documentos), ...Object.keys(despues.documentos)])) {
    const a = antes.documentos[f];
    const d = despues.documentos[f];
    if (!a || !d || a.sha256 !== d.sha256 || a.bytes !== d.bytes || a.mtimeMs !== d.mtimeMs) dif.push(`documento ${f}`);
  }
  return dif;
}

const inicio = new Date();
let id = "sin-respaldo";
let dirEvidencias = join(DIR_WORK, "evidencias", `respaldo-prueba-${inicio.toISOString().replace(/[:.]/g, "")}`);
try {
  console.log("1. Huella de softarq_dev y de sus documentos (solo lectura)");
  const antes = await huellaDesarrollo();
  registrar("huella inicial de softarq_dev", true, `${Object.keys(antes.conteos).length} tablas · ${Object.keys(antes.documentos).length} documentos`);

  console.log("2. Respaldo real y verificación");
  const r = await crearRespaldo();
  id = r.id;
  dirEvidencias = join(DIR_WORK, "evidencias", `respaldo-${id}`);
  mkdirSync(dirEvidencias, { recursive: true });
  registrar("respaldo COMPLETO", r.estado === "COMPLETO", `${r.ruta} · ${r.problemas.map((p) => p.tipo).join(", ")}`);
  if (r.estado !== "COMPLETO") throw new Error("El respaldo no está completo; no se sigue.");
  const v = await verificarRespaldo(r.ruta);
  registrar("verificación del respaldo", v.ok, v.ok ? `dump ${r.manifiesto.base.bytes} bytes · ${r.manifiesto.documentos.total} documentos` : v.errores.join("; "));

  console.log("3. Restauración en softarq_restauracion");
  const rest = await restaurarRespaldo(r.ruta);
  registrar("restauración de prueba", true, rest.pasos.join(" → "));

  console.log("4. Comprobaciones en el destino");
  await comprobarDestino(r.manifiesto);

  console.log("5. API temporal aislada y descarga del PDF");
  await descargarDesdeApiTemporal(r.manifiesto, dirEvidencias);

  console.log("6. Casos de fallo (copias en _work\\pruebas\\respaldo-fallos)");
  await casosDeFallo(r.ruta, r.manifiesto);

  console.log("7. softarq_dev y sus documentos intactos");
  const despues = await huellaDesarrollo();
  const dif = compararHuellas(antes, despues);
  registrar("softarq_dev y sus documentos sin cambios", dif.length === 0, dif.join("; ") || "conteos, tamaños, SHA-256 y fechas iguales");
} catch (error) {
  registrar("ejecución", false, error instanceof Error ? error.message : String(error));
} finally {
  mkdirSync(dirEvidencias, { recursive: true });
  const fallos = resultados.filter((x) => !x.ok).length;
  const informe = { respaldo: id, inicio: inicio.toISOString(), fin: new Date().toISOString(), total: resultados.length, fallos, resultados };
  writeFileSync(join(dirEvidencias, "informe.json"), JSON.stringify(informe, null, 2) + "\n", "utf8");
  writeFileSync(
    join(dirEvidencias, "informe.txt"),
    [`Prueba de respaldo y recuperación · ${informe.inicio} · respaldo ${id}`, ...resultados.map((x) => `${x.ok ? "OK   " : "FALLO"} ${x.nombre}${x.detalle ? ` — ${x.detalle}` : ""}`), `Resultado: ${resultados.length - fallos}/${resultados.length} correctos`].join("\n") + "\n",
    "utf8",
  );
  console.log(`\nResultado: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas. Informe: ${dirEvidencias}`);
  process.exitCode = fallos === 0 ? 0 : 1;
}
