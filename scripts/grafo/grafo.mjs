#!/usr/bin/env node
/**
 * Grafo de código local con Graphify (solo AST, sin modelos ni servicios externos).
 * Ver docs/herramientas/graphify.md y ADR-0011.
 *
 * Uso (desde la raíz del repositorio):
 *   node scripts/grafo/grafo.mjs actualizar [--segundo-plano]
 *                                                   reconstruye el grafo (graphify update .); --segundo-plano lo
 *                                                   lanza desacoplado y regresa de inmediato (hooks de Git)
 *   node scripts/grafo/grafo.mjs estado [--breve] [--hook]
 *                                                   compara el grafo con los archivos actuales (no reconstruye)
 *   node scripts/grafo/grafo.mjs archivos          lista los archivos que Graphify indexa realmente
 *   node scripts/grafo/grafo.mjs instalar-hooks    instala los hooks de Git post-checkout y post-merge
 *
 * Seguridad:
 * - Graphify se ejecuta sin variables de proveedores (claves de API y tokens): `graphify update`
 *   solo extrae AST, y así ningún paso puede activar un pase semántico por tener una clave a mano.
 * - Salida y cachés en graphify-out/ (dentro del repositorio, en D:, ignorado por Git).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SALIDA = join(RAIZ, "graphify-out");
const ESTADO = join(SALIDA, "softarq-estado.json");
const CANDADO = join(SALIDA, ".actualizando");
const CANDADO_CADUCA_MS = 15 * 60 * 1000;
/** Entorno virtual del proyecto (../_work/graphify-venv), si existe; si no, `graphify` y `python` del PATH. */
const VENV = join(RAIZ, "..", "_work", "graphify-venv", "Scripts");
const delVenv = (exe) => (existsSync(join(VENV, exe)) ? join(VENV, exe) : null);
const GRAPHIFY = process.env.GRAPHIFY_EXE || delVenv("graphify.exe") || "graphify";
const PYTHON = process.env.GRAPHIFY_PYTHON || delVenv("python.exe") || "python";
/** Menos archivos que esto indica una configuración rota (raíz equivocada, exclusiones excesivas). */
const MINIMO_ARCHIVOS = 50;
/** Extensiones que Graphify 0.8.5 trata como código (subconjunto presente en este repositorio). */
const EXTENSIONES_CODIGO = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".ps1", ".sh", ".json", ".py"]);
const MARCA_HOOK = "# softarq-grafo-hook";

/** Entorno sin claves de proveedores ni tokens. */
function entornoSeguro() {
  const env = { ...process.env };
  for (const nombre of Object.keys(env)) {
    if (/API_KEY|_TOKEN$|ACCESS_KEY|SECRET/i.test(nombre)) delete env[nombre];
  }
  env.GRAPHIFY_NO_TIPS = "1";
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.PYTHONIOENCODING = "utf-8";
  return env;
}

const aRelativa = (ruta) => relative(RAIZ, resolve(RAIZ, ruta)).split("\\").join("/");
const sha256 = (ruta) => createHash("sha256").update(readFileSync(join(RAIZ, ruta))).digest("hex");

function ejecutar(comando, args, opciones = {}) {
  return spawnSync(comando, args, { cwd: RAIZ, env: entornoSeguro(), encoding: "utf8", windowsHide: true, ...opciones });
}

/** Conjunto real de archivos de código que detecta Graphify (aplica .graphifyignore y su filtro de sensibles). */
function detectar() {
  const programa = [
    "import json, importlib.metadata as m",
    "from pathlib import Path",
    "from graphify.detect import detect",
    "r = detect(Path('.'))",
    "print(json.dumps({'version': m.version('graphifyy'), 'codigo': r['files'].get('code', []),",
    " 'otros': {k: v for k, v in r['files'].items() if k != 'code'}, 'sensibles': r.get('skipped_sensitive', [])}))",
  ].join("\n");
  const r = ejecutar(PYTHON, ["-c", programa]);
  if (r.error || r.status !== 0) {
    throw new Error(`No se pudo ejecutar la detección de Graphify con ${PYTHON}: ${r.error?.message ?? r.stderr.trim()}`);
  }
  const d = JSON.parse(r.stdout);
  return {
    version: d.version,
    codigo: d.codigo.map(aRelativa).sort(),
    otros: Object.fromEntries(Object.entries(d.otros).map(([k, v]) => [k, v.map(aRelativa).sort()])),
    sensibles: (Array.isArray(d.sensibles) ? d.sensibles : []).map(aRelativa).sort(),
  };
}

/** Archivos con extensión de código conocidos por Git (versionados o nuevos no ignorados). */
function candidatosGit() {
  const r = ejecutar("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (r.status !== 0) return null;
  return r.stdout
    .split("\0")
    .filter((f) => f && EXTENSIONES_CODIGO.has(extname(f).toLowerCase()) && existsSync(join(RAIZ, f)))
    .sort();
}

function commitActual() {
  const r = ejecutar("git", ["rev-parse", "--short", "HEAD"]);
  return r.status === 0 ? r.stdout.trim() : null;
}

function leerEstado() {
  if (!existsSync(ESTADO)) return null;
  try {
    return JSON.parse(readFileSync(ESTADO, "utf8"));
  } catch {
    return null;
  }
}

function escribirEstado(estado) {
  mkdirSync(SALIDA, { recursive: true });
  const tmp = `${ESTADO}.tmp`;
  writeFileSync(tmp, JSON.stringify(estado, null, 2) + "\n", "utf8");
  renameSync(tmp, ESTADO);
}

/** Un solo `actualizar` a la vez (hooks de Git seguidos o una ejecución manual simultánea). */
function conCandado(fn) {
  mkdirSync(SALIDA, { recursive: true });
  try {
    if (existsSync(CANDADO) && Date.now() - statSync(CANDADO).mtimeMs > CANDADO_CADUCA_MS) rmSync(CANDADO);
    closeSync(openSync(CANDADO, "wx"));
  } catch {
    console.log("[grafo] Ya hay una actualización en curso; el estado seguirá PENDIENTE hasta que termine.");
    return;
  }
  try {
    fn();
  } finally {
    rmSync(CANDADO, { force: true });
  }
}

/** Lanza una sola actualización desacoplada (para hooks de Git: no bloquea `git switch`/`git merge`). */
function actualizarEnSegundoPlano() {
  mkdirSync(SALIDA, { recursive: true });
  const previo = leerEstado();
  if (previo) escribirEstado({ ...previo, estado: "PENDIENTE", pendienteDesde: new Date().toISOString() });
  const registro = openSync(join(SALIDA, "ultima-actualizacion.log"), "a");
  const hijo = spawn(process.execPath, [fileURLToPath(import.meta.url), "actualizar"], {
    cwd: RAIZ,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", registro, registro],
  });
  hijo.unref();
  console.log("[grafo] Actualización del grafo lanzada en segundo plano (graphify-out/ultima-actualizacion.log).");
}

function actualizar() {
  const inicio = Date.now();
  const detectado = detectar();
  if (detectado.codigo.length < MINIMO_ARCHIVOS) {
    throw new Error(`Solo se detectaron ${detectado.codigo.length} archivos de código; revisa .graphifyignore antes de reconstruir.`);
  }
  // Huellas tomadas ANTES de extraer: si un archivo cambia durante la reconstrucción, `estado` lo
  // verá distinto y marcará el grafo como desactualizado (nunca al revés).
  const archivos = Object.fromEntries(detectado.codigo.map((f) => [f, sha256(f)]));
  const exclusiones = sha256(".graphifyignore");
  const previo = leerEstado();
  // Marca la reconstrucción como pendiente ANTES de ejecutarla: si falla o se interrumpe, nunca queda «vigente».
  escribirEstado({ ...(previo ?? {}), estado: "PENDIENTE", pendienteDesde: new Date().toISOString() });

  // Reconstrucción limpia: en Graphify 0.8.5, `graphify update .` CONSERVA los nodos y aristas del
  // graph.json anterior (pensado para preservar nodos semánticos), así que un import eliminado o un
  // archivo borrado seguirían en el grafo. Aquí no hay nodos semánticos: se aparta graph.json y se
  // reconstruye; la caché AST (graphify-out/cache) se conserva y solo se reextraen archivos cambiados.
  // Comprobado en docs/herramientas/graphify.md §6.
  const grafo = join(SALIDA, "graph.json");
  const anterior = join(SALIDA, "graph.anterior.json");
  if (existsSync(grafo)) renameSync(grafo, anterior);
  // --force: sin grafo previo no aplica la comprobación de encogimiento; se deja explícito igualmente.
  const r = ejecutar(GRAPHIFY, ["update", ".", "--force"], { stdio: ["ignore", "pipe", "pipe"] });
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.error || r.status !== 0 || !existsSync(grafo)) {
    // Se restaura el grafo anterior para seguir pudiendo consultarlo, pero el estado queda PENDIENTE.
    if (existsSync(anterior)) renameSync(anterior, grafo);
    console.error(salida.trim());
    throw new Error(`graphify update falló (código ${r.status ?? r.error?.message}); el grafo queda PENDIENTE.`);
  }
  if (existsSync(anterior)) rmSync(anterior);

  const candidatos = candidatosGit() ?? [];
  const indexados = new Set(detectado.codigo);
  const resumen = salida.match(/Rebuilt: ([^\n]+)/)?.[1] ?? "";
  escribirEstado({
    estado: "VIGENTE",
    graphify: detectado.version,
    commit: commitActual(),
    actualizadoEn: new Date().toISOString(),
    duracionMs: Date.now() - inicio,
    resumen,
    exclusiones,
    archivos,
    // Candidatos que Graphify excluye a propósito: no deben marcar el grafo como desactualizado.
    excluidos: candidatos.filter((f) => !indexados.has(f)),
    sensiblesOmitidos: detectado.sensibles,
  });
  console.log(`Grafo actualizado: ${detectado.codigo.length} archivos de código (${resumen || "sin resumen"}), ${Date.now() - inicio} ms.`);
}

function evaluarEstado() {
  const estado = leerEstado();
  if (!existsSync(join(SALIDA, "graph.json")) || !estado) {
    return { codigo: "AUSENTE", detalle: ["No existe graphify-out/graph.json o su estado. Ejecuta: pnpm grafo:actualizar"] };
  }
  if (existsSync(CANDADO)) {
    return { codigo: "PENDIENTE", detalle: ["Actualización en curso (graphify-out/ultima-actualizacion.log); usa búsquedas dirigidas mientras termina."] };
  }
  if (estado.estado !== "VIGENTE") {
    return { codigo: "PENDIENTE", detalle: [`Reconstrucción pendiente desde ${estado.pendienteDesde ?? "?"}. Ejecuta: pnpm grafo:actualizar`] };
  }
  const cambiados = [];
  const eliminados = [];
  for (const [f, hash] of Object.entries(estado.archivos ?? {})) {
    if (!existsSync(join(RAIZ, f))) eliminados.push(f);
    else if (sha256(f) !== hash) cambiados.push(f);
  }
  const conocidos = new Set([...Object.keys(estado.archivos ?? {}), ...(estado.excluidos ?? [])]);
  let nuevos = (candidatosGit() ?? []).filter((f) => !conocidos.has(f));
  // Un archivo nuevo puede quedar fuera por .graphifyignore: solo cuenta si Graphify lo indexaría.
  if (nuevos.length) {
    const indexables = new Set(detectar().codigo);
    nuevos = nuevos.filter((f) => indexables.has(f));
  }
  const exclusionesCambiadas = existsSync(join(RAIZ, ".graphifyignore")) && sha256(".graphifyignore") !== estado.exclusiones;
  const total = cambiados.length + eliminados.length + nuevos.length + (exclusionesCambiadas ? 1 : 0);
  const detalle = [
    ...(exclusionesCambiadas ? ["cambiado: .graphifyignore (alcance del grafo)"] : []),
    ...cambiados.map((f) => `cambiado: ${f}`),
    ...eliminados.map((f) => `eliminado: ${f}`),
    ...nuevos.map((f) => `nuevo: ${f}`),
  ];
  return { codigo: total === 0 ? "VIGENTE" : "DESACTUALIZADO", detalle, estado, total };
}

function estado(args) {
  const breve = args.includes("--breve") || args.includes("--hook");
  const r = evaluarEstado();
  const e = r.estado;
  const base =
    r.codigo === "VIGENTE"
      ? `Grafo Graphify VIGENTE (${Object.keys(e.archivos).length} archivos, Graphify ${e.graphify}, commit ${e.commit}, ${e.actualizadoEn}).`
      : r.codigo === "DESACTUALIZADO"
        ? `Grafo Graphify DESACTUALIZADO: ${r.total} archivo(s) distintos del último grafo. Ejecuta pnpm grafo:actualizar o usa búsquedas dirigidas.`
        : `Grafo Graphify ${r.codigo}. ${r.detalle[0]}`;
  console.log(base);
  if (!breve && r.codigo === "DESACTUALIZADO") for (const linea of r.detalle) console.log(`  ${linea}`);
  if (args.includes("--hook")) return 0; // nunca bloquea el inicio de sesión
  return r.codigo === "VIGENTE" ? 0 : 1;
}

function archivos() {
  const d = detectar();
  console.log(`Graphify ${d.version}: ${d.codigo.length} archivos de código indexados.`);
  for (const f of d.codigo) console.log(`  ${f}`);
  for (const [tipo, lista] of Object.entries(d.otros)) {
    if (lista.length) console.log(`No se procesan sin modelo (${tipo}): ${lista.join(", ")}`);
  }
  if (d.sensibles.length) console.log(`Omitidos por Graphify como sensibles: ${d.sensibles.join(", ")}`);
}

const HOOKS = {
  "post-checkout": `#!/bin/sh
${MARCA_HOOK} (scripts/grafo/grafo.mjs instalar-hooks). Actualiza el grafo al cambiar de rama.
# Solo en cambios de rama ($3 = 1) y si el grafo ya se construyó. Nunca hace fallar Git.
[ "$3" = "1" ] || exit 0
[ -d graphify-out ] || exit 0
node scripts/grafo/grafo.mjs actualizar --segundo-plano || echo "[grafo] No se pudo lanzar la actualización; ejecuta pnpm grafo:actualizar."
exit 0
`,
  "post-merge": `#!/bin/sh
${MARCA_HOOK} (scripts/grafo/grafo.mjs instalar-hooks). Actualiza el grafo tras integrar cambios.
[ -d graphify-out ] || exit 0
node scripts/grafo/grafo.mjs actualizar --segundo-plano || echo "[grafo] No se pudo lanzar la actualización; ejecuta pnpm grafo:actualizar."
exit 0
`,
};

function instalarHooks() {
  const r = ejecutar("git", ["rev-parse", "--git-path", "hooks"]);
  if (r.status !== 0) throw new Error("No es un repositorio Git.");
  const dir = resolve(RAIZ, r.stdout.trim());
  mkdirSync(dir, { recursive: true });
  for (const [nombre, contenido] of Object.entries(HOOKS)) {
    const destino = join(dir, nombre);
    if (existsSync(destino) && !readFileSync(destino, "utf8").includes(MARCA_HOOK)) {
      console.log(`Se conserva ${nombre}: ya existe un hook ajeno. Integra a mano la llamada a scripts/grafo/grafo.mjs.`);
      continue;
    }
    writeFileSync(destino, contenido, { encoding: "utf8", mode: 0o755 });
    console.log(`Hook ${nombre} instalado en ${destino}.`);
  }
}

const [comando, ...args] = process.argv.slice(2);
try {
  if (comando === "actualizar") {
    if (args.includes("--segundo-plano")) actualizarEnSegundoPlano();
    else conCandado(actualizar);
  }
  else if (comando === "estado") process.exitCode = estado(args);
  else if (comando === "archivos") archivos();
  else if (comando === "instalar-hooks") instalarHooks();
  else {
    console.error("Uso: node scripts/grafo/grafo.mjs <actualizar|estado [--breve|--hook]|archivos|instalar-hooks>");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`[grafo] ${error.message}`);
  process.exitCode = 1;
}
