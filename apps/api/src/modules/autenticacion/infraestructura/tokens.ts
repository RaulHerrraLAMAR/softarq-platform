/**
 * Tokens opacos de sesión (ADR-0007 §4).
 *
 * - 32 bytes de `crypto.randomBytes` (CSPRNG del sistema), en base64url (43 caracteres).
 * - En la base solo se guarda SHA-256 del token: con 256 bits de entropía no hace falta un hash
 *   lento ni sal (OWASP Session Management). El token utilizable solo viaja en la cookie o en la
 *   respuesta al cliente. La búsqueda por hash se hace con el índice único de la base.
 */
import { createHash, randomBytes } from "node:crypto";

const BYTES_TOKEN = 32;
const PATRON_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface TokenGenerado {
  /** Valor utilizable: nunca se guarda ni se registra. */
  readonly token: string;
  /** SHA-256 del token (32 bytes). */
  readonly hash: Buffer;
}

export function generarToken(): TokenGenerado {
  const token = randomBytes(BYTES_TOKEN).toString("base64url");
  return { token, hash: hashDeToken(token) };
}

/** `true` si el texto tiene la forma de un token emitido (evita consultas con basura). */
export function tieneFormaDeToken(valor: unknown): valor is string {
  return typeof valor === "string" && PATRON_TOKEN.test(valor);
}

export function hashDeToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
