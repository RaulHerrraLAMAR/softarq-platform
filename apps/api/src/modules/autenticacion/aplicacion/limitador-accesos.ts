/**
 * Límite de intentos de inicio de sesión (ADR-0007 §4). En memoria, como el limitador general
 * (ADR-0005): vale para una instancia; con varias hará falta un almacén compartido.
 *
 * Ventanas fijas por clave; nunca hay bloqueos permanentes (cada ventana caduca sola):
 * - cuenta + IP: fallos; un acceso correcto reinicia este contador;
 * - cuenta (todas las IP): fallos; frena ataques distribuidos;
 * - IP: todos los intentos.
 * Las cuentas inexistentes cuentan igual que las existentes (no revela si una cuenta existe).
 */

export interface PoliticaAccesos {
  readonly ventanaMs: number;
  readonly fallosPorCuentaEIp: number;
  readonly fallosPorCuenta: number;
  readonly intentosPorIp: number;
}

export type ResultadoLimite = { permitido: true } | { permitido: false; reintentarEnSegundos: number };

interface Ventana {
  inicio: number;
  cuenta: number;
}

/** Por encima de este número de claves se purgan las ventanas caducadas (memoria acotada). */
const CLAVES_ANTES_DE_PURGAR = 10_000;

export class LimitadorAccesos {
  private readonly ventanas = new Map<string, Ventana>();

  constructor(
    private readonly politica: PoliticaAccesos,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Comprueba, sin contar, si se admite un intento de `cuenta` desde `ip`. */
  comprobar(cuenta: string, ip: string): ResultadoLimite {
    const t = this.ahora();
    const bloqueos = [
      this.excedida(`ci:${cuenta}\u0000${ip}`, this.politica.fallosPorCuentaEIp, t),
      this.excedida(`c:${cuenta}`, this.politica.fallosPorCuenta, t),
      this.excedida(`i:${ip}`, this.politica.intentosPorIp, t),
    ].filter((r): r is number => r !== null);
    if (bloqueos.length === 0) return { permitido: true };
    return { permitido: false, reintentarEnSegundos: Math.max(1, Math.ceil(Math.max(...bloqueos) / 1000)) };
  }

  /** Cuenta un intento de la IP (correcto o no). */
  registrarIntento(ip: string): void {
    this.sumar(`i:${ip}`);
  }

  registrarFallo(cuenta: string, ip: string): void {
    this.sumar(`ci:${cuenta}\u0000${ip}`);
    this.sumar(`c:${cuenta}`);
  }

  /** Un acceso correcto reinicia solo el contador cuenta + IP. */
  registrarExito(cuenta: string, ip: string): void {
    this.ventanas.delete(`ci:${cuenta}\u0000${ip}`);
  }

  /** Milisegundos hasta el fin de la ventana si la clave alcanzó su límite; si no, `null`. */
  private excedida(clave: string, limite: number, t: number): number | null {
    const v = this.ventanas.get(clave);
    if (!v || t - v.inicio >= this.politica.ventanaMs) return null;
    return v.cuenta >= limite ? v.inicio + this.politica.ventanaMs - t : null;
  }

  private sumar(clave: string): void {
    const t = this.ahora();
    if (this.ventanas.size > CLAVES_ANTES_DE_PURGAR) this.purgar(t);
    const v = this.ventanas.get(clave);
    if (!v || t - v.inicio >= this.politica.ventanaMs) this.ventanas.set(clave, { inicio: t, cuenta: 1 });
    else v.cuenta++;
  }

  private purgar(t: number): void {
    for (const [clave, v] of this.ventanas) {
      if (t - v.inicio >= this.politica.ventanaMs) this.ventanas.delete(clave);
    }
  }
}
