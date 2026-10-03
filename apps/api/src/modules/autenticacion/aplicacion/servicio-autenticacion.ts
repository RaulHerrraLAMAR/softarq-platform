/**
 * Casos de uso de autenticación (ADR-0007), sin Nest: sesión previa con token CSRF, inicio de
 * sesión, resolución de la sesión de cada solicitud y cierre.
 *
 * Reglas:
 * - la identidad, la organización y las funciones salen de la sesión y de la pertenencia vigente
 *   en la base; nada de esto procede del cliente;
 * - un acceso fallido no revela si la cuenta existe, está inactiva o la contraseña es incorrecta;
 * - al autenticar se emite siempre un token nuevo y se revoca la sesión previa;
 * - la desactivación del usuario o de su pertenencia afecta a la siguiente solicitud.
 */
import type { Capacidad, FuncionUsuario } from "@softarq/contracts";
import { capacidadesDe } from "../dominio/capacidades.js";
import { POLITICA_SESION, debeActualizarActividad, estadoTemporal, normalizarCorreo } from "../dominio/politica.js";
import type { ServicioContrasenas } from "../infraestructura/contrasenas.js";
import type { GeneradorCsrf } from "../infraestructura/csrf.js";
import type { MotivoRevocacion, RepositorioSesiones } from "../infraestructura/repositorio-sesiones.js";
import { generarToken, hashDeToken, tieneFormaDeToken } from "../infraestructura/tokens.js";
import type { LimitadorAccesos } from "./limitador-accesos.js";

/** Instante actual para la política de sesiones (independiente de la fecha de negocio). */
export interface RelojSesiones {
  ahora(): Date;
}

export const RELOJ_SESIONES_DEL_SISTEMA: RelojSesiones = { ahora: () => new Date() };

/** Contexto autenticado de una solicitud. */
export interface ContextoSesion {
  readonly sesionId: string;
  readonly usuario: { readonly id: string; readonly nombre: string; readonly correo: string };
  readonly organizacion: { readonly id: string; readonly codigo: string; readonly nombre: string; readonly esDemo: boolean };
  readonly funciones: readonly FuncionUsuario[];
  readonly capacidades: readonly Capacidad[];
  readonly expiraEn: Date;
}

export interface SesionPrevia {
  readonly sesionId: string;
}

export interface TokensEmitidos {
  /** Va solo en la cookie HttpOnly. */
  readonly tokenSesion: string;
  /** Va en el cuerpo de la respuesta; el cliente lo guarda en memoria. */
  readonly csrfToken: string;
  readonly expiraEn: Date;
}

export type ResultadoResolucion<T> =
  | { estado: "SIN_COOKIE" }
  | { estado: "NO_VALIDA"; motivo: string }
  | { estado: "VIGENTE"; sesion: T };

export type ResultadoAcceso =
  | { estado: "CORRECTO"; tokens: TokensEmitidos; contexto: ContextoSesion }
  | { estado: "CREDENCIALES_INVALIDAS" }
  | { estado: "LIMITE"; reintentarEnSegundos: number };

export class ServicioAutenticacion {
  constructor(
    private readonly repo: RepositorioSesiones,
    private readonly contrasenas: ServicioContrasenas,
    private readonly limitador: LimitadorAccesos,
    private readonly csrf: GeneradorCsrf,
    private readonly reloj: RelojSesiones,
  ) {}

  /**
   * Crea una sesión previa (cookie + token CSRF) para el formulario de acceso. Si la cookie
   * actual es otra sesión vigente, la revoca: una cookie corresponde a una sola sesión viva.
   */
  async crearSesionPrevia(tokenActual: string | undefined): Promise<TokensEmitidos> {
    const ahora = this.reloj.ahora();
    const anterior = tieneFormaDeToken(tokenActual) ? await this.repo.sesionPorHash(hashDeToken(tokenActual)) : null;
    const sesion = generarToken();
    const expiraEn = new Date(ahora.getTime() + POLITICA_SESION.previaMs);
    const id = await this.repo.reemplazar(
      anterior && anterior.revocadaEn === null ? anterior.id : null,
      "REEMPLAZADA",
      { tipo: "PREVIA", tokenHash: sesion.hash, titular: null, creadaEn: ahora, expiraEn },
      ahora,
    );
    return { tokenSesion: sesion.token, csrfToken: this.csrf.tokenPara(id), expiraEn };
  }

  /** Sesión previa vigente de la cookie (para comprobar el CSRF del inicio de sesión). */
  async resolverPrevia(token: string | undefined): Promise<ResultadoResolucion<SesionPrevia>> {
    if (token === undefined) return { estado: "SIN_COOKIE" };
    if (!tieneFormaDeToken(token)) return { estado: "NO_VALIDA", motivo: "FORMATO" };
    const s = await this.repo.sesionPorHash(hashDeToken(token));
    if (!s || s.tipo !== "PREVIA") return { estado: "NO_VALIDA", motivo: "DESCONOCIDA" };
    const estado = estadoTemporal(s, this.reloj.ahora());
    if (estado !== "VIGENTE") return { estado: "NO_VALIDA", motivo: estado };
    return { estado: "VIGENTE", sesion: { sesionId: s.id } };
  }

  /**
   * Inicio de sesión. La sesión previa ya se comprobó (cookie y CSRF) en la guardia HTTP.
   * Devuelve un resultado genérico ante cualquier fallo de credenciales.
   */
  async iniciarSesion(previa: SesionPrevia, correo: string, contrasena: string, ip: string): Promise<ResultadoAcceso> {
    const cuenta = normalizarCorreo(correo);
    const limite = this.limitador.comprobar(cuenta, ip);
    if (!limite.permitido) return { estado: "LIMITE", reintentarEnSegundos: limite.reintentarEnSegundos };
    this.limitador.registrarIntento(ip);

    const datos = await this.repo.cuentaPorCorreo(cuenta);
    const coincide = datos
      ? await this.contrasenas.verificar(datos.hashContrasena, contrasena)
      : await this.contrasenas.verificarFicticio(contrasena);
    // Una sola pertenencia activa: la selección de organización aún no existe (ADR-0007 §2).
    const membresia = datos?.membresiasActivas.length === 1 ? datos.membresiasActivas[0] : undefined;
    if (!datos || !coincide || !datos.activo || !membresia) {
      this.limitador.registrarFallo(cuenta, ip);
      return { estado: "CREDENCIALES_INVALIDAS" };
    }

    const ahora = this.reloj.ahora();
    const sesion = generarToken();
    const expiraEn = new Date(ahora.getTime() + POLITICA_SESION.absolutaMs);
    const id = await this.repo.reemplazar(
      previa.sesionId,
      "AUTENTICADA",
      {
        tipo: "USUARIO",
        tokenHash: sesion.hash,
        titular: { usuarioId: datos.usuarioId, organizacionId: membresia.organizacionId },
        creadaEn: ahora,
        expiraEn,
      },
      ahora,
    );
    this.limitador.registrarExito(cuenta, ip);
    const resuelta = await this.resolver(sesion.token);
    if (resuelta.estado !== "VIGENTE") return { estado: "CREDENCIALES_INVALIDAS" }; // la cuenta cambió a la vez
    return {
      estado: "CORRECTO",
      tokens: { tokenSesion: sesion.token, csrfToken: this.csrf.tokenPara(id), expiraEn },
      contexto: resuelta.sesion,
    };
  }

  /**
   * Sesión de usuario de la cookie. Comprueba revocación, expiración absoluta, inactividad y que
   * el usuario y su pertenencia sigan activos; registra la actividad (como mucho una vez por minuto).
   */
  async resolver(token: string | undefined): Promise<ResultadoResolucion<ContextoSesion>> {
    if (token === undefined) return { estado: "SIN_COOKIE" };
    if (!tieneFormaDeToken(token)) return { estado: "NO_VALIDA", motivo: "FORMATO" };
    const s = await this.repo.sesionPorHash(hashDeToken(token));
    if (!s || s.tipo !== "USUARIO" || !s.titular) return { estado: "NO_VALIDA", motivo: "DESCONOCIDA" };
    const ahora = this.reloj.ahora();
    const estado = estadoTemporal(s, ahora);
    if (estado !== "VIGENTE") return { estado: "NO_VALIDA", motivo: estado };

    const t = s.titular;
    const motivoInactiva: MotivoRevocacion | null = !t.usuarioActivo
      ? "USUARIO_INACTIVO"
      : !t.membresiaActiva
        ? "MEMBRESIA_INACTIVA"
        : null;
    if (motivoInactiva) {
      await this.repo.revocar(s.id, motivoInactiva, ahora);
      return { estado: "NO_VALIDA", motivo: motivoInactiva };
    }

    if (debeActualizarActividad(s.ultimaActividadEn, ahora)) await this.repo.registrarActividad(s.id, ahora);
    return {
      estado: "VIGENTE",
      sesion: {
        sesionId: s.id,
        usuario: { id: t.usuarioId, nombre: t.nombre, correo: t.correo },
        organizacion: t.organizacion,
        funciones: t.funciones,
        capacidades: capacidadesDe(t.funciones),
        expiraEn: s.expiraEn,
      },
    };
  }

  /** Token CSRF de la sesión (se recalcula; no se guarda). */
  csrfDe(sesionId: string): string {
    return this.csrf.tokenPara(sesionId);
  }

  /** `true` si el token CSRF recibido corresponde a la sesión. */
  csrfValido(recibido: unknown, sesionId: string): boolean {
    return this.csrf.esValido(recibido, sesionId);
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    await this.repo.revocar(sesionId, "CIERRE", this.reloj.ahora());
  }
}
