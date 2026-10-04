/**
 * Almacén de documentos emitidos (módulo 8, ADR-0010 §5): archivos PDF persistentes en
 * `SOFTARQ_DIR_DOCUMENTOS`, fuera del repositorio y de los temporales. NO es una caché: cada archivo
 * es el original de una emisión y nunca se regenera.
 *
 * - Claves solo del servidor: `emisiones/<organizacion uuid>/<emision uuid>.pdf`. Nada que envíe el
 *   cliente forma parte de una ruta; cada ruta resuelta debe quedar dentro de la raíz.
 * - Escritura en dos pasos: archivo temporal exclusivo en `tmp/` → sincronizado con el disco →
 *   releído y validado (encabezado, fin de archivo, páginas, tamaño) → SHA-256 de lo que quedó en
 *   disco → enlace al nombre definitivo SIN sobrescribir (`link` falla si ya existe) → se borra el
 *   temporal. Solo entonces la API registra la emisión en la base.
 * - Si el registro falla, la API borra el archivo definitivo que acaba de crear. Lo que quede por
 *   una interrupción (temporales o archivos sin registro) lo informa y limpia `revisar()`, que solo
 *   toca archivos con el patrón propio y antigüedad mínima.
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATRON_CLAVE = new RegExp(`^emisiones/(${UUID})/(${UUID})\\.pdf$`);
const PATRON_TEMPORAL = new RegExp(`^${UUID}\\.part$`);
const TAMANO_MINIMO = 800;
const TAMANO_MAXIMO = 20 * 1024 * 1024;

export class ErrorDocumento extends Error {
  constructor(
    readonly tipo: "NO_DISPONIBLE" | "DANADO" | "NO_GENERADO",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorDocumento";
  }
}

export interface ArchivoGuardado {
  clave: string;
  bytes: number;
  sha256: string;
}

/** Puerto del almacén (las pruebas lo sustituyen para provocar fallos de escritura o movimiento). */
export interface AlmacenDocumentos {
  /** Guarda un documento nuevo bajo una clave del servidor; nunca sobrescribe. */
  guardar(clave: string, contenido: Buffer): Promise<ArchivoGuardado>;
  /** Lee el original y comprueba tamaño y SHA-256; si falta o no coincide, lanza ErrorDocumento. */
  leer(clave: string, bytes: number, sha256: string): Promise<Buffer>;
  /** Borra un archivo propio que no llegó a registrarse (solo claves válidas). */
  descartar(clave: string): Promise<void>;
}

export function claveDeEmision(organizacionId: string, emisionId: string): string {
  const clave = `emisiones/${organizacionId}/${emisionId}.pdf`;
  if (!PATRON_CLAVE.test(clave)) throw new Error("Clave de documento inválida.");
  return clave;
}

export function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

/** Comprobación estructural mínima de un PDF completo (no lo interpreta). */
export function validarPdf(b: Buffer): void {
  if (b.length < TAMANO_MINIMO || b.length > TAMANO_MAXIMO) {
    throw new ErrorDocumento("NO_GENERADO", `Tamaño de documento fuera de rango (${b.length} bytes).`);
  }
  if (b.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErrorDocumento("NO_GENERADO", "El documento no empieza como PDF.");
  if (!b.subarray(Math.max(0, b.length - 64)).toString("latin1").includes("%%EOF")) {
    throw new ErrorDocumento("NO_GENERADO", "El documento está incompleto (sin fin de archivo).");
  }
  if (!/\/Type\s*\/Page[^s]/.test(b.toString("latin1"))) throw new ErrorDocumento("NO_GENERADO", "El documento no tiene páginas.");
}

/** ¿Está `ruta` dentro de un repositorio (algún ancestro con pnpm-workspace.yaml o .git)? */
async function dentroDeRepositorio(ruta: string): Promise<boolean> {
  let actual = resolve(ruta);
  for (;;) {
    for (const marca of ["pnpm-workspace.yaml", ".git"]) {
      try {
        await fs.access(join(actual, marca));
        return true;
      } catch {
        // no existe: seguir subiendo
      }
    }
    const padre = dirname(actual);
    if (padre === actual) return false;
    actual = padre;
  }
}

export class AlmacenArchivos implements AlmacenDocumentos {
  private readonly raiz: string;

  constructor(raiz: string) {
    if (!isAbsolute(raiz)) throw new Error("SOFTARQ_DIR_DOCUMENTOS debe ser una ruta absoluta.");
    this.raiz = resolve(raiz);
  }

  /** Crea `tmp/` y `emisiones/` y comprueba que la raíz admite escritura y no está en un repositorio. */
  async preparar(): Promise<void> {
    if (await dentroDeRepositorio(this.raiz)) {
      throw new Error("SOFTARQ_DIR_DOCUMENTOS no puede estar dentro de un repositorio (los PDF emitidos no se versionan).");
    }
    await fs.mkdir(join(this.raiz, "tmp"), { recursive: true });
    await fs.mkdir(join(this.raiz, "emisiones"), { recursive: true });
    const prueba = join(this.raiz, "tmp", `${randomUUID()}.part`);
    await fs.writeFile(prueba, "", { flag: "wx" });
    await fs.unlink(prueba);
  }

  /** Ruta absoluta de una clave válida; nunca fuera de la raíz. */
  private ruta(clave: string): string {
    if (!PATRON_CLAVE.test(clave)) throw new Error("Clave de documento inválida.");
    const r = resolve(this.raiz, ...clave.split("/"));
    const rel = relative(this.raiz, r);
    if (rel.startsWith("..") || isAbsolute(rel) || !rel.startsWith(`emisiones${sep}`)) throw new Error("Ruta fuera del almacén.");
    return r;
  }

  async guardar(clave: string, contenido: Buffer): Promise<ArchivoGuardado> {
    validarPdf(contenido);
    const destino = this.ruta(clave);
    const temporal = join(this.raiz, "tmp", `${randomUUID()}.part`);
    await fs.mkdir(dirname(destino), { recursive: true });
    try {
      const h = await fs.open(temporal, "wx", 0o600);
      try {
        await h.writeFile(contenido);
        await h.sync();
      } finally {
        await h.close();
      }
      // Se valida y se firma lo que QUEDÓ en disco, no lo que se quiso escribir.
      const escrito = await fs.readFile(temporal);
      if (!escrito.equals(contenido)) throw new ErrorDocumento("NO_GENERADO", "El archivo escrito no coincide con el generado.");
      validarPdf(escrito);
      await fs.link(temporal, destino); // EEXIST si ya existe: nunca sobrescribe
      return { clave, bytes: escrito.length, sha256: sha256Hex(escrito) };
    } finally {
      await fs.rm(temporal, { force: true });
    }
  }

  async leer(clave: string, bytes: number, sha256: string): Promise<Buffer> {
    let b: Buffer;
    try {
      b = await fs.readFile(this.ruta(clave));
    } catch {
      throw new ErrorDocumento("NO_DISPONIBLE", "El archivo emitido no está disponible en el almacén.");
    }
    if (b.length !== bytes || sha256Hex(b) !== sha256) {
      throw new ErrorDocumento("DANADO", "El archivo emitido no coincide con su registro (tamaño o SHA-256).");
    }
    return b;
  }

  async descartar(clave: string): Promise<void> {
    await fs.rm(this.ruta(clave), { force: true });
  }

  /**
   * Recuperación (ADR-0010 §5): informa temporales, archivos propios sin registro y registros con
   * archivo ausente o dañado. Con `limpiar`, borra SOLO temporales y archivos sin registro con el
   * patrón propio y una antigüedad mínima; nunca toca archivos registrados ni ajenos, y nunca
   * regenera ni sustituye un documento.
   */
  async revisar(opciones: {
    registradas: readonly { id: string; archivoClave: string; archivoBytes: number; archivoSha256: string }[];
    limpiar: boolean;
    antiguedadMinimaMs: number;
    ahora: Date;
  }): Promise<InformeRevision> {
    const informe: InformeRevision = { temporales: [], sinRegistro: [], ausentes: [], danados: [], ajenos: [], eliminados: [], correctos: 0 };
    const antiguo = async (ruta: string) => opciones.ahora.getTime() - (await fs.stat(ruta)).mtimeMs >= opciones.antiguedadMinimaMs;
    const claves = new Set(opciones.registradas.map((r) => r.archivoClave));

    const dirTmp = join(this.raiz, "tmp");
    for (const nombre of await listar(dirTmp)) {
      const ruta = join(dirTmp, nombre);
      if (!PATRON_TEMPORAL.test(nombre)) {
        informe.ajenos.push(`tmp/${nombre}`);
        continue;
      }
      informe.temporales.push(`tmp/${nombre}`);
      if (opciones.limpiar && (await antiguo(ruta))) {
        await fs.rm(ruta, { force: true });
        informe.eliminados.push(`tmp/${nombre}`);
      }
    }

    const dirEmisiones = join(this.raiz, "emisiones");
    for (const org of await listar(dirEmisiones)) {
      for (const nombre of await listar(join(dirEmisiones, org))) {
        const clave = `emisiones/${org}/${nombre}`;
        if (!PATRON_CLAVE.test(clave)) {
          informe.ajenos.push(clave);
          continue;
        }
        if (claves.has(clave)) continue;
        informe.sinRegistro.push(clave);
        const ruta = this.ruta(clave);
        if (opciones.limpiar && (await antiguo(ruta))) {
          await fs.rm(ruta, { force: true });
          informe.eliminados.push(clave);
        }
      }
    }

    for (const r of opciones.registradas) {
      try {
        await this.leer(r.archivoClave, r.archivoBytes, r.archivoSha256);
        informe.correctos++;
      } catch (e) {
        if (e instanceof ErrorDocumento && e.tipo === "DANADO") informe.danados.push(`${r.id} ${r.archivoClave}`);
        else informe.ausentes.push(`${r.id} ${r.archivoClave}`);
      }
    }
    return informe;
  }
}

export interface InformeRevision {
  temporales: string[];
  sinRegistro: string[];
  ausentes: string[];
  danados: string[];
  ajenos: string[];
  eliminados: string[];
  correctos: number;
}

async function listar(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/** Almacén sin configurar: la emisión responde 503 sin tocar el disco. */
export class AlmacenNoConfigurado implements AlmacenDocumentos {
  private error(): never {
    throw new ErrorDocumento("NO_GENERADO", "El almacén de documentos no está configurado (SOFTARQ_DIR_DOCUMENTOS).");
  }
  async guardar(): Promise<ArchivoGuardado> {
    this.error();
  }
  async leer(): Promise<Buffer> {
    throw new ErrorDocumento("NO_DISPONIBLE", "El almacén de documentos no está configurado (SOFTARQ_DIR_DOCUMENTOS).");
  }
  async descartar(): Promise<void> {
    this.error();
  }
}

