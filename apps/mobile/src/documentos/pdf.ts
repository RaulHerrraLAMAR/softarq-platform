/**
 * Guardar y abrir el PDF emitido (ADR-0021). Único módulo que escribe archivos.
 *
 * - Los bytes son los que entregó la API, sin regenerar ni transformar. El archivo se escribe en la caché PRIVADA de la
 *   app (nunca en almacenamiento compartido) y se abre con el selector del sistema.
 * - Se borra todo al cerrar o perder la sesión y al abrir la app: no queda ninguna cotización en el teléfono después de
 *   cambiar de cuenta.
 * - Nada de esto viaja con el token ni lo conoce.
 */
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { nombreDePdf } from "./nombre";

export class ErrorDocumento extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDocumento";
  }
}

const carpeta = () => new Directory(Paths.cache, "documentos");

/** Escribe el PDF en la caché privada y devuelve su dirección local. */
export async function guardarPdf(bytes: Uint8Array, folio: string): Promise<string> {
  try {
    const dir = carpeta();
    dir.create({ intermediates: true, idempotent: true });
    const archivo = new File(dir, nombreDePdf(folio));
    archivo.create({ overwrite: true });
    await archivo.write(bytes);
    return archivo.uri;
  } catch {
    throw new ErrorDocumento("No pudimos guardar el PDF en este teléfono.");
  }
}

/** Guarda el PDF y lo abre con el selector del sistema (ver, guardar en Archivos, compartir). */
export async function guardarYAbrirPdf(bytes: Uint8Array, folio: string): Promise<void> {
  const uri = await guardarPdf(bytes, folio);
  try {
    if (!(await Sharing.isAvailableAsync())) throw new ErrorDocumento("Este teléfono no tiene con qué abrir el PDF.");
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Cotización ${folio}`, UTI: "com.adobe.pdf" });
  } catch (e) {
    if (e instanceof ErrorDocumento) throw e;
    throw new ErrorDocumento("No pudimos abrir el PDF. Intenta de nuevo.");
  }
}

/** Borra los PDF guardados (cierre de sesión, cambio de cuenta o apertura de la app). */
export function limpiarDocumentos(): void {
  try {
    const dir = carpeta();
    if (dir.exists) dir.delete();
  } catch {
    // Si no se pudo borrar ahora, se intentará en la siguiente apertura.
  }
}
