/**
 * Contraseñas con Argon2id mediante `@node-rs/argon2` (ADR-0007 §3). Sin algoritmos propios.
 *
 * Parámetros: segunda recomendación de RFC 9106 §4 (m = 64 MiB, t = 3, p = 4), por encima del
 * mínimo de OWASP (m = 19 MiB, t = 2, p = 1). Medido en el equipo de desarrollo: unos 56 ms por
 * operación. Las pruebas usan exactamente los mismos parámetros.
 *
 * Memoria: como mucho `maxSimultaneas` operaciones a la vez (64 MiB cada una); si la cola supera
 * `maxEnCola`, se rechaza con `ErrorContrasenasSaturado` (la API responde 429).
 */
import { hash, verify, type Algorithm, type Options } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

/** `Algorithm.Argon2id` (enum constante de la biblioteca, no accesible con verbatimModuleSyntax). */
const ARGON2ID = 2 as Algorithm.Argon2id;

export const PARAMETROS_ARGON2ID = {
  algorithm: ARGON2ID,
  memoryCost: 65_536, // KiB = 64 MiB
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const satisfies Options;

/** Prefijo PHC que producen estos parámetros (también lo exige el CHECK de la tabla usuario). */
export const PREFIJO_PHC = "$argon2id$v=19$m=65536,t=3,p=4$";

export class ErrorContrasenasSaturado extends Error {
  constructor() {
    super("Demasiadas verificaciones de contraseña en curso.");
    this.name = "ErrorContrasenasSaturado";
  }
}

export class ServicioContrasenas {
  private enCurso = 0;
  private readonly cola: Array<() => void> = [];
  private hashFicticio: string | null = null;

  constructor(
    private readonly maxSimultaneas = 2,
    private readonly maxEnCola = 8,
  ) {}

  /** Cadena PHC de Argon2id para guardar en `usuario.hash_contrasena`. */
  async crearHash(contrasena: string): Promise<string> {
    return this.limitar(() => hash(contrasena, PARAMETROS_ARGON2ID));
  }

  /** `false` ante una contraseña distinta o un hash con otro formato. Nunca lanza por la contraseña. */
  async verificar(hashGuardado: string, contrasena: string): Promise<boolean> {
    return this.limitar(async () => {
      try {
        return await verify(hashGuardado, contrasena);
      } catch {
        return false;
      }
    });
  }

  /**
   * Verificación contra un hash ficticio con los mismos parámetros, para que una cuenta
   * inexistente tarde lo mismo que una existente. Siempre devuelve `false`.
   */
  async verificarFicticio(contrasena: string): Promise<false> {
    this.hashFicticio ??= await hash(randomBytes(32).toString("base64url"), PARAMETROS_ARGON2ID);
    await this.verificar(this.hashFicticio, contrasena);
    return false;
  }

  /** Calcula el hash ficticio por adelantado (al arrancar). */
  async preparar(): Promise<void> {
    await this.verificarFicticio("preparar");
  }

  private async limitar<T>(tarea: () => Promise<T>): Promise<T> {
    if (this.enCurso < this.maxSimultaneas) {
      this.enCurso++;
    } else {
      if (this.cola.length >= this.maxEnCola) throw new ErrorContrasenasSaturado();
      // Al liberarse, el turno se transfiere directamente: `enCurso` no baja ni sube.
      await new Promise<void>((liberar) => this.cola.push(liberar));
    }
    try {
      return await tarea();
    } finally {
      const siguiente = this.cola.shift();
      if (siguiente) siguiente();
      else this.enCurso--;
    }
  }
}
