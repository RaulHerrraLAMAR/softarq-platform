/**
 * Tokens CSRF ligados a la sesión: patrón «HMAC CSRF token» de OWASP (CSRF Prevention Cheat
 * Sheet), con `node:crypto`. Sin criptografía propia.
 *
 *   token = base64url(HMAC-SHA256(clave, "softarq-csrf-v1:" + idSesion))
 *
 * - La clave son 32 bytes aleatorios generados al arrancar el proceso; no se guarda ni se registra.
 * - El token no se almacena: se recalcula, de modo que `GET /auth/sesion` puede devolverlo tras
 *   recargar la página sin guardar un secreto en la base.
 * - Cada sesión (previa o de usuario) tiene su propio token; al autenticar cambia con la sesión.
 * - Si el proceso se reinicia, los tokens anteriores dejan de valer (403 CSRF_NO_VALIDO) y el
 *   cliente obtiene uno nuevo con `GET /auth/sesion`.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { tieneFormaDeToken } from "./tokens.js";

const CONTEXTO = "softarq-csrf-v1:";

export class GeneradorCsrf {
  private readonly clave: Buffer;

  constructor(clave: Buffer = randomBytes(32)) {
    if (clave.length < 32) throw new Error("La clave CSRF debe tener al menos 32 bytes.");
    this.clave = clave;
  }

  tokenPara(sesionId: string): string {
    return this.mac(sesionId).toString("base64url");
  }

  /** Comparación en tiempo constante. */
  esValido(recibido: unknown, sesionId: string): boolean {
    if (!tieneFormaDeToken(recibido)) return false;
    const esperado = this.mac(sesionId);
    const dado = Buffer.from(recibido, "base64url");
    return dado.length === esperado.length && timingSafeEqual(dado, esperado);
  }

  private mac(sesionId: string): Buffer {
    return createHmac("sha256", this.clave).update(CONTEXTO + sesionId, "utf8").digest();
  }
}
