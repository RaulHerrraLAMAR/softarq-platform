/**
 * Utilidades compartidas del respaldo y la restauración local (ADR-0012,
 * docs/operacion/respaldo-y-restauracion.md).
 *
 * Seguridad:
 * - Las contraseñas solo salen de los archivos locales (.env, .env.respaldo) hacia un PGPASSFILE
 *   temporal en _work\tmp (borrado en finally) o hacia el cliente `pg` en memoria. Nunca van en
 *   argumentos, registros, manifiestos ni mensajes de error.
 * - Guardas explícitas: el destino de restauración solo puede ser `softarq_restauracion`, y las
 *   carpetas de destino nunca pueden coincidir con la de documentos de desarrollo.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const RAIZ_API = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RAIZ_REPOSITORIO = resolve(RAIZ_API, "..", "..");
export const RAIZ_PROYECTO = resolve(RAIZ_REPOSITORIO, "..");
export const DIR_WORK = join(RAIZ_PROYECTO, "_work");

/** Carpeta dedicada de respaldos: fuera del repositorio y de _work. */
export const DIR_RESPALDOS_POR_OMISION = join(RAIZ_PROYECTO, "respaldos", "softarq_dev");
/** Carpeta de documentos del destino de prueba de restauración (desechable, en _work). */
export const DIR_DOCUMENTOS_RESTAURACION_POR_OMISION = join(DIR_WORK, "restauracion", "softarq_restauracion", "documentos");
export const PG_BIN = process.env.SOFTARQ_PG_BIN ?? "D:\\Postgres18\\bin";

export const BASE_ORIGEN = "softarq_dev";
/** Única base que acepta la restauración de prueba. */
export const DESTINOS_PERMITIDOS = Object.freeze(["softarq_restauracion"]);
/** Bases que nunca pueden ser destino (mensaje explícito, aunque la lista blanca ya las excluye). */
export const DESTINOS_PROHIBIDOS = Object.freeze(["softarq_dev", "softarq_test", "softarq_shadow", "postgres", "template0", "template1"]);
export const FORMATO_MANIFIESTO = "softarq-respaldo/1";
export const MARCA_DESTINO = ".softarq-restauracion";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const PATRON_CLAVE = new RegExp(`^emisiones/(${UUID})/(${UUID})\\.pdf$`);
export const PATRON_ID = /^softarq_dev-\d{8}T\d{6}Z-[0-9a-f]{6}$/;

export class ErrorRespaldo extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorRespaldo";
  }
}

// ---------------------------------------------------------------------------------------------
// Identificadores, rutas y guardas
// ---------------------------------------------------------------------------------------------

/** `softarq_dev-AAAAMMDDTHHMMSSZ-xxxxxx` (UTC + 3 bytes aleatorios: único aunque coincida el segundo). */
export function nuevoIdentificador(fecha = new Date(), aleatorio = randomBytes(3).toString("hex")) {
  const iso = fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${BASE_ORIGEN}-${iso}-${aleatorio}`;
}

const normalizar = (ruta) => resolve(ruta).toLowerCase();

/** ¿`hija` es `padre` o está dentro de él? (sin distinguir mayúsculas, como NTFS). */
export function estaDentro(hija, padre) {
  const r = relative(normalizar(padre), normalizar(hija));
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** ¿Algún ancestro de `ruta` es un repositorio (pnpm-workspace.yaml o .git)? */
export function dentroDeRepositorio(ruta) {
  let actual = resolve(ruta);
  for (;;) {
    if (existsSync(join(actual, "pnpm-workspace.yaml")) || existsSync(join(actual, ".git"))) return true;
    const padre = dirname(actual);
    if (padre === actual) return false;
    actual = padre;
  }
}

/** Lista blanca del destino de restauración. Se comprueba ANTES de cualquier conexión. */
export function validarDestino(destino) {
  if (typeof destino !== "string" || !destino) throw new ErrorRespaldo("Falta el destino de restauración (--destino).");
  if (DESTINOS_PROHIBIDOS.includes(destino.toLowerCase())) {
    throw new ErrorRespaldo(
      `Destino PROHIBIDO: «${destino}». La restauración de prueba nunca escribe en desarrollo, pruebas, sombra ni bases del sistema. Use: ${DESTINOS_PERMITIDOS.join(", ")}.`,
    );
  }
  if (!DESTINOS_PERMITIDOS.includes(destino)) {
    throw new ErrorRespaldo(`Destino no permitido: «${destino}». Solo se admite: ${DESTINOS_PERMITIDOS.join(", ")}.`);
  }
  return destino;
}

/** Carpeta de documentos restaurados: fuera del repositorio y sin solaparse con los originales ni con los respaldos. */
export function validarCarpetaDocumentosDestino(carpeta, { dirDocumentosDesarrollo, dirRespaldos }) {
  if (!carpeta || !isAbsolute(carpeta)) throw new ErrorRespaldo("La carpeta de documentos de destino debe ser una ruta absoluta.");
  for (const [nombre, protegida] of [
    ["los documentos de desarrollo", dirDocumentosDesarrollo],
    ["los respaldos", dirRespaldos],
  ]) {
    if (protegida && (estaDentro(carpeta, protegida) || estaDentro(protegida, carpeta))) {
      throw new ErrorRespaldo(`Carpeta de destino PROHIBIDA: se solapa con ${nombre}. Use una carpeta desechable en _work.`);
    }
  }
  if (dentroDeRepositorio(carpeta)) throw new ErrorRespaldo("La carpeta de documentos de destino no puede estar dentro de un repositorio.");
  return resolve(carpeta);
}

/** Carpeta de respaldos: absoluta, fuera del repositorio y sin solaparse con los documentos originales. */
export function validarCarpetaRespaldos(carpeta, { dirDocumentosDesarrollo }) {
  if (!carpeta || !isAbsolute(carpeta)) throw new ErrorRespaldo("La carpeta de respaldos debe ser una ruta absoluta.");
  if (dentroDeRepositorio(carpeta)) throw new ErrorRespaldo("La carpeta de respaldos no puede estar dentro de un repositorio.");
  if (dirDocumentosDesarrollo && (estaDentro(carpeta, dirDocumentosDesarrollo) || estaDentro(dirDocumentosDesarrollo, carpeta))) {
    throw new ErrorRespaldo("La carpeta de respaldos no puede solaparse con la de documentos.");
  }
  return resolve(carpeta);
}

/** Ruta de una clave de documento dentro de `raiz` (patrón propio; nunca fuera de la raíz). */
export function rutaDeClave(raiz, clave) {
  if (!PATRON_CLAVE.test(clave)) throw new ErrorRespaldo(`Clave de documento inválida: ${clave}`);
  const ruta = resolve(raiz, ...clave.split("/"));
  if (!estaDentro(ruta, raiz) || ruta === resolve(raiz)) throw new ErrorRespaldo("Clave de documento fuera de la carpeta.");
  return ruta;
}

// ---------------------------------------------------------------------------------------------
// Configuración local y credenciales (sin imprimir secretos)
// ---------------------------------------------------------------------------------------------

function leerArchivoEnv(nombre) {
  const ruta = join(RAIZ_API, nombre);
  return existsSync(ruta) ? parseEnv(readFileSync(ruta, "utf8")) : null;
}

/** Carpeta de documentos de desarrollo (SOFTARQ_DIR_DOCUMENTOS de apps/api/.env). */
export function dirDocumentosDesarrollo() {
  const v = leerArchivoEnv(".env")?.SOFTARQ_DIR_DOCUMENTOS;
  if (!v) throw new ErrorRespaldo("Falta SOFTARQ_DIR_DOCUMENTOS en apps/api/.env.");
  return resolve(v);
}

/** URL del rol de solo lectura softarq_respaldo (apps/api/.env.respaldo). */
export function urlRespaldo() {
  const v = process.env.RESPALDO_DATABASE_URL ?? leerArchivoEnv(".env.respaldo")?.RESPALDO_DATABASE_URL;
  if (!v) {
    throw new ErrorRespaldo(
      "Falta la credencial del rol softarq_respaldo (apps/api/.env.respaldo). Ejecute una vez, como administrador local: powershell -ExecutionPolicy Bypass -File apps\\api\\scripts\\db\\aprovisionar-respaldo.ps1",
    );
  }
  return exigirLocal(v, "softarq_respaldo", [BASE_ORIGEN]);
}

/** URL de un rol del proyecto (de apps/api/.env) apuntando a la base `base`. */
export function urlDeRol(variable, rolEsperado, base) {
  const v = leerArchivoEnv(".env")?.[variable];
  if (!v) throw new ErrorRespaldo(`Falta ${variable} en apps/api/.env.`);
  const url = new URL(v);
  url.pathname = `/${base}`;
  return exigirLocal(url.toString(), rolEsperado, [base]);
}

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Comprueba host local, rol y base; devuelve las partes (la contraseña nunca se imprime). */
function exigirLocal(cadena, rolEsperado, basesPermitidas) {
  const url = new URL(cadena);
  const base = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const usuario = decodeURIComponent(url.username);
  if (!HOSTS_LOCALES.has(url.hostname)) throw new ErrorRespaldo("La conexión debe ser a PostgreSQL local.");
  if (usuario !== rolEsperado) throw new ErrorRespaldo(`La conexión debe usar el rol ${rolEsperado} (usa ${usuario}).`);
  if (!basesPermitidas.includes(base)) throw new ErrorRespaldo(`Base no permitida para el rol ${rolEsperado}: ${base}.`);
  return {
    cadena: url.toString(),
    host: url.hostname,
    puerto: url.port || "5432",
    usuario,
    contrasena: decodeURIComponent(url.password),
    base,
  };
}

/**
 * Ejecuta `fn(entorno)` con un PGPASSFILE temporal (permisos restringidos, borrado en finally).
 * El entorno devuelto no contiene PGPASSWORD ni las URL del proyecto.
 */
export function conArchivoDeContrasena(conexion, fn) {
  const dir = join(DIR_WORK, "tmp");
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, `pgpass-${randomUUID()}.conf`);
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  writeFileSync(ruta, `${esc(conexion.host)}:${esc(conexion.puerto)}:${esc(conexion.base)}:${esc(conexion.usuario)}:${esc(conexion.contrasena)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const entorno = { ...process.env, PGPASSFILE: ruta, PGCONNECT_TIMEOUT: "10" };
  for (const n of ["PGPASSWORD", "DATABASE_URL", "MIGRATION_DATABASE_URL", "SHADOW_DATABASE_URL", "RESPALDO_DATABASE_URL"]) delete entorno[n];
  try {
    return fn(entorno);
  } finally {
    rmSync(ruta, { force: true });
  }
}

/** Ejecuta una herramienta de PostgreSQL sin shell. Lanza con stderr (que no contiene contraseñas: van por PGPASSFILE). */
export function herramientaPg(nombre, args, entorno) {
  const exe = join(PG_BIN, `${nombre}.exe`);
  if (!existsSync(exe)) throw new ErrorRespaldo(`No se encontró ${exe} (ajuste SOFTARQ_PG_BIN).`);
  const r = spawnSync(exe, args, { env: entorno, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new ErrorRespaldo(`${nombre} no pudo ejecutarse: ${r.error.message}`);
  if (r.status !== 0) throw new ErrorRespaldo(`${nombre} terminó con código ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 2000)}`);
  return r.stdout;
}

export function versionHerramienta(nombre) {
  const r = spawnSync(join(PG_BIN, `${nombre}.exe`), ["--version"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

// ---------------------------------------------------------------------------------------------
// Hash y Git
// ---------------------------------------------------------------------------------------------

export function sha256Archivo(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash("sha256");
    createReadStream(ruta)
      .on("data", (d) => h.update(d))
      .on("error", mal)
      .on("end", () => ok(h.digest("hex")));
  });
}

export const sha256Buffer = (b) => createHash("sha256").update(b).digest("hex");

export function estadoGit() {
  const git = (args) => spawnSync("git", args, { cwd: RAIZ_REPOSITORIO, encoding: "utf8", windowsHide: true });
  const head = git(["rev-parse", "HEAD"]);
  const sucio = git(["status", "--porcelain"]);
  return {
    commit: head.status === 0 ? head.stdout.trim() : null,
    arbolConCambios: sucio.status === 0 ? sucio.stdout.trim().length > 0 : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Manifiesto
// ---------------------------------------------------------------------------------------------

/** Validación estructural del manifiesto (no comprueba bytes; eso lo hace verificar). */
export function validarManifiesto(m) {
  const errores = [];
  if (!m || typeof m !== "object") return ["El manifiesto no es un objeto JSON."];
  if (m.formato !== FORMATO_MANIFIESTO) errores.push(`Formato desconocido: ${m.formato}.`);
  if (!PATRON_ID.test(m.id ?? "")) errores.push("Identificador inválido.");
  if (!["COMPLETO", "INCOMPLETO"].includes(m.estado)) errores.push(`Estado inválido: ${m.estado}.`);
  if (m.estado === "COMPLETO" && Array.isArray(m.problemas) && m.problemas.length) errores.push("Un respaldo COMPLETO no puede tener problemas.");
  if (!m.base || m.base.archivo !== "base.dump" || !/^[0-9a-f]{64}$/.test(m.base.sha256 ?? "")) errores.push("Falta el volcado o su SHA-256.");
  if (!m.esquema?.ultimaMigracion) errores.push("Falta la versión del esquema (última migración).");
  if (!Array.isArray(m.documentos?.lista)) errores.push("Falta la lista de documentos.");
  else {
    for (const d of m.documentos.lista) {
      if (!PATRON_CLAVE.test(d.clave ?? "") || !/^[0-9a-f]{64}$/.test(d.sha256 ?? "") || !Number.isInteger(d.bytes)) {
        errores.push(`Documento mal descrito: ${d.clave ?? "?"}.`);
      }
    }
    if (m.documentos.total !== m.documentos.lista.length) errores.push("El total de documentos no coincide con la lista.");
  }
  // Nunca deben aparecer secretos: ni URL con contraseña ni campos de credenciales.
  if (/postgres(ql)?:\/\/[^\s"]*:[^\s"]*@/i.test(JSON.stringify(m))) errores.push("El manifiesto contiene una URL con credenciales.");
  return errores;
}

export function escribirJson(ruta, datos) {
  writeFileSync(ruta, JSON.stringify(datos, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
}
