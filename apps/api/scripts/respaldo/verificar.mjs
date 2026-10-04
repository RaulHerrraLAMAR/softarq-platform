#!/usr/bin/env node
/**
 * Verifica un respaldo contra su manifiesto (ADR-0012): estructura, estado, SHA-256 del volcado y
 * de cada documento, legibilidad del volcado (pg_restore --list) y archivos de más.
 *
 * Uso (desde apps/api):  pnpm respaldo:verificar <carpeta del respaldo>
 * Código de salida 0 solo si el respaldo está COMPLETO y todo coincide.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { ErrorRespaldo, herramientaPg, rutaDeClave, sha256Archivo, validarManifiesto } from "./comun.mjs";

function listarArchivos(dir) {
  if (!existsSync(dir)) return [];
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...listarArchivos(ruta));
    else salida.push(ruta);
  }
  return salida;
}

/** Devuelve { ok, manifiesto, errores }. No modifica nada. */
export async function verificarRespaldo(carpeta) {
  const errores = [];
  const archivoManifiesto = join(carpeta, "manifiesto.json");
  if (!existsSync(archivoManifiesto)) return { ok: false, manifiesto: null, errores: ["No hay manifiesto.json: no es un respaldo o está en curso."] };
  let m;
  try {
    m = JSON.parse(readFileSync(archivoManifiesto, "utf8"));
  } catch {
    return { ok: false, manifiesto: null, errores: ["manifiesto.json no es JSON válido."] };
  }
  errores.push(...validarManifiesto(m));
  const nombre = basename(carpeta);
  if (m.estado !== "COMPLETO") errores.push(`El respaldo está ${m.estado}: no sirve para restaurar (${(m.problemas ?? []).map((p) => p.tipo).join(", ")}).`);
  if (nombre !== m.id) errores.push(`La carpeta «${nombre}» no corresponde a un respaldo completo con id ${m.id}.`);
  if (errores.length) return { ok: false, manifiesto: m, errores };

  const dump = join(carpeta, "base.dump");
  if (!existsSync(dump)) errores.push("Falta base.dump.");
  else {
    if (statSync(dump).size !== m.base.bytes) errores.push("El tamaño de base.dump no coincide con el manifiesto.");
    if ((await sha256Archivo(dump)) !== m.base.sha256) errores.push("El SHA-256 de base.dump no coincide con el manifiesto.");
    else {
      try {
        herramientaPg("pg_restore", ["--list", dump], process.env);
      } catch (e) {
        errores.push(`pg_restore no puede leer base.dump: ${e.message}`);
      }
    }
  }

  const dirDocs = join(carpeta, "documentos");
  const esperados = new Set();
  for (const d of m.documentos.lista) {
    let ruta;
    try {
      ruta = rutaDeClave(dirDocs, d.clave);
    } catch (e) {
      errores.push(e.message);
      continue;
    }
    esperados.add(ruta.toLowerCase());
    if (!existsSync(ruta)) {
      errores.push(`Falta el documento ${d.clave} (${d.folio}-v${d.version}).`);
      continue;
    }
    if (statSync(ruta).size !== d.bytes) errores.push(`Tamaño distinto en ${d.clave}.`);
    else if ((await sha256Archivo(ruta)) !== d.sha256) errores.push(`SHA-256 distinto en ${d.clave} (documento dañado).`);
  }
  for (const f of listarArchivos(dirDocs)) {
    if (!esperados.has(f.toLowerCase())) errores.push(`Archivo no descrito en el manifiesto: documentos/${relative(dirDocs, f).split("\\").join("/")}.`);
  }
  return { ok: errores.length === 0, manifiesto: m, errores };
}

export async function exigirRespaldoValido(carpeta) {
  const r = await verificarRespaldo(carpeta);
  if (!r.ok) throw new ErrorRespaldo(`Respaldo NO válido (${carpeta}):\n  - ${r.errores.join("\n  - ")}`);
  return r.manifiesto;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.error("Uso: pnpm respaldo:verificar <carpeta del respaldo>");
    process.exitCode = 2;
  } else {
    const r = await verificarRespaldo(carpeta);
    if (r.ok) {
      const m = r.manifiesto;
      console.log(`Respaldo VÁLIDO: ${m.id} · ${m.creadoEn} · esquema ${m.esquema.ultimaMigracion} · commit ${m.aplicacion.commit?.slice(0, 7)}`);
      console.log(`  base.dump ${m.base.bytes} bytes (SHA-256 coincide) · documentos ${m.documentos.total} (SHA-256 coinciden)`);
    } else {
      console.error(`Respaldo NO válido: ${carpeta}`);
      for (const e of r.errores) console.error(`  - ${e}`);
      process.exitCode = 1;
    }
  }
}
