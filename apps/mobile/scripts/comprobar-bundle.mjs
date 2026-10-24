#!/usr/bin/env node
// Empaqueta la app (Metro, sin bytecode para poder leerla) y comprueba que el bundle no contiene código del
// servidor, credenciales, rutas de la laptop ni contratos internos (ADR-0020 §6).
//
// Uso (desde apps/mobile):  pnpm comprobar:bundle
// Salida en la carpeta _work de la raíz del proyecto; código 0 solo si no hay hallazgos.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buscarProhibidos } from "./bundle-prohibidos.mjs";

const RAIZ_MOVIL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = resolve(RAIZ_MOVIL, "..", "..", "..", "_work", "mobile-bundle-check");

if (!SALIDA.includes(`${join("_work", "mobile-bundle-check")}`)) throw new Error("Carpeta de salida inesperada.");
rmSync(SALIDA, { recursive: true, force: true });

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const r = spawnSync(pnpm, ["exec", "expo", "export", "--platform", "android", "--no-bytecode", "--output-dir", SALIDA], {
  cwd: RAIZ_MOVIL,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
  shell: process.platform === "win32",
});
if (r.status !== 0) {
  console.error("No se pudo empaquetar la app.");
  process.exit(1);
}

const dirJs = join(SALIDA, "_expo", "static", "js", "android");
const archivos = existsSync(dirJs) ? readdirSync(dirJs).filter((n) => n.endsWith(".js")) : [];
if (archivos.length === 0) {
  console.error("No se encontró el bundle de JavaScript.");
  process.exit(1);
}

let hallazgos = 0;
for (const n of archivos) {
  const ruta = join(dirJs, n);
  const texto = readFileSync(ruta, "utf8");
  const encontrados = buscarProhibidos(texto);
  console.log(`${n}: ${(statSync(ruta).size / 1024 / 1024).toFixed(2)} MB · ${encontrados.length === 0 ? "limpio" : `${encontrados.length} hallazgo(s)`}`);
  for (const h of encontrados) console.log(`  [${h.grupo}] ${h.coincidencia}`);
  hallazgos += encontrados.length;
}
process.exit(hallazgos === 0 ? 0 : 1);
