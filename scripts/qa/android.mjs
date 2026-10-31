// Conductor mínimo de Android para pruebas locales del DEMO (solo `adb` y `uiautomator`, sin instalar nada).
//
// - Las acciones se basan en elementos identificables (texto o descripción) que se leen de la jerarquía actual; las
//   coordenadas salen siempre del centro del elemento observado, nunca de secuencias fijas.
// - Antes de actuar comprueba que la app en primer plano es SoftArq. Si no, se detiene: no toca otras aplicaciones.
// - El texto escrito viaja por la entrada estándar de `adb shell`, no por argumentos de esta laptop, para no dejar
//   contraseñas en la línea de comandos. Nunca se imprime lo escrito.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..", "..", "..");
export const ADB = resolve(RAIZ, "_work", "tools", "platform-tools", "adb.exe");
export const PAQUETE = "com.softarq.demo";
const SALIDA = resolve(RAIZ, "_work", "tmp", "ui");
mkdirSync(SALIDA, { recursive: true });

export const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 1 << 26, windowsHide: true });
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function enPrimerPlano() {
  const f = adb("shell", "dumpsys", "window").split("\n").find((l) => l.includes("mCurrentFocus")) ?? "";
  return f.includes(PAQUETE);
}
export function exigirApp() {
  if (!enPrimerPlano()) throw new Error("SoftArq no está en primer plano: se detiene la automatización (no se toca otra aplicación).");
}

/** Elementos con texto o descripción de la pantalla actual. */
export function nodos() {
  adb("shell", "uiautomator", "dump", "/sdcard/qa.xml");
  const xml = adb("exec-out", "cat", "/sdcard/qa.xml");
  const lista = [];
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a.bounds ?? "");
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    const texto = decodificar(a.text || a["content-desc"] || "");
    lista.push({ texto, clase: (a.class ?? "").split(".").pop(), clic: a.clickable === "true", enfocable: a.focusable === "true", activo: a.enabled === "true", x1, y1, x2, y2, cx: (x1 + x2) >> 1, cy: (y1 + y2) >> 1 });
  }
  return lista;
}
const decodificar = (t) => t.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, "\n").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function ver() {
  return nodos().filter((n) => n.texto !== "");
}
export const textos = () => ver().map((n) => n.texto);
export const hay = (frag) => textos().some((t) => t.toLowerCase().includes(frag.toLowerCase()));

export function buscar(frag, { exacto = false, clase = null, indice = 0 } = {}) {
  const f = frag.toLowerCase();
  const c = ver().filter((n) => (exacto ? n.texto.toLowerCase() === f : n.texto.toLowerCase().includes(f)) && (clase ? n.clase === clase : true));
  return c[indice] ?? null;
}

export function tocar(frag, opciones = {}) {
  exigirApp();
  const n = buscar(frag, opciones);
  if (!n) throw new Error(`No se encontró en pantalla: «${frag}».`);
  adb("shell", "input", "tap", String(n.cx), String(n.cy));
  return n;
}

export function escribir(texto) {
  exigirApp();
  const codificado = texto.replace(/ /g, "%s").replace(/([&|;<>()$`\\"'*?\[\]{}#~^!])/g, "\\$1");
  const r = spawnSync(ADB, ["shell", 'read -r t; input text "$t"'], { input: `${codificado}\n`, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("No se pudo escribir en el teléfono.");
}
export const borrarCampo = () => {
  exigirApp();
  adb("shell", "input", "keyevent", "KEYCODE_MOVE_END");
  adb("shell", "input", "keyevent", ...Array(60).fill("KEYCODE_DEL"));
};
export const tecla = (codigo) => {
  exigirApp();
  adb("shell", "input", "keyevent", codigo);
};
export const atras = () => tecla("KEYCODE_BACK");
export const tecladoAbierto = () => /mInputShown=true/.test(adb("shell", "dumpsys", "input_method"));
/** Cierra el teclado solo si está abierto (la tecla Atrás no se usa si no lo está: saldría de la pantalla). */
export async function cerrarTeclado() {
  if (!tecladoAbierto()) return false;
  tecla("KEYCODE_BACK");
  await esperar(500);
  return !tecladoAbierto();
}
/** Alto de pantalla y zona libre: un elemento es tocable solo si está dentro de la pantalla y no bajo el teclado. */
export function tocableAhora(n) {
  const teclado = tecladoAbierto();
  return n.cy > 0 && n.cy < 2200 && !teclado;
}
export function deslizar(dir = "abajo", dist = 700) {
  exigirApp();
  const ancho = 540;
  const [y1, y2] = dir === "abajo" ? [1500, 1500 - dist] : [700, 700 + dist];
  adb("shell", "input", "swipe", String(ancho), String(y1), String(ancho), String(y2), "300");
}
export function captura(nombre) {
  exigirApp();
  const r = spawnSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 1 << 26, windowsHide: true });
  const ruta = resolve(SALIDA, `${nombre}.png`);
  import("node:fs").then((fs) => fs.writeFileSync(ruta, r.stdout));
  return ruta;
}

export async function esperarTexto(frag, ms = 10_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (hay(frag)) return true;
    await esperar(500);
  }
  return false;
}
export async function esperarSinTexto(frag, ms = 10_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (!hay(frag)) return true;
    await esperar(500);
  }
  return false;
}

export function abrirApp() {
  adb("shell", "monkey", "-p", PAQUETE, "-c", "android.intent.category.LAUNCHER", "1");
}
/** Muestra lo visible de forma compacta (para diagnóstico). */
export function mostrar() {
  for (const n of ver()) console.log(`${n.clase.padEnd(10)} (${n.cx},${n.cy})${n.clic ? " [clic]" : ""}${n.activo ? "" : " [inactivo]"} ${n.texto.slice(0, 110)}`);
}

// Uso desde la línea de comandos:  node scripts/qa/android.mjs ver | captura <nombre> | tocar <texto> | atras | abrir
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const [orden, ...resto] = process.argv.slice(2);
  switch (orden) {
    case "ver":
      exigirApp();
      mostrar();
      break;
    case "captura":
      console.log(captura(resto[0] ?? "captura"));
      break;
    case "tocar":
      console.log(tocar(resto.join(" ")).texto);
      break;
    case "atras":
      atras();
      break;
    case "abrir":
      abrirApp();
      break;
    default:
      console.error("Órdenes: ver, captura <nombre>, tocar <texto>, atras, abrir.");
      process.exitCode = 2;
  }
}
