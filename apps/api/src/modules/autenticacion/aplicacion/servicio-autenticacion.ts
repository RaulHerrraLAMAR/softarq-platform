/**
 * Casos de uso de autenticación (ADR-0007), sin Nest: sesión previa con token CSRF, inicio de
 * sesión, resolución de la sesión de cada solicitud y cierre.
 *
 * Reglas:
 * - la identidad, la organización y las funciones salen de la sesión y de la pertenencia vigente
 *   en la base; nada de esto procede del cliente;
 * - un acceso fallido no revela si la cuenta existe, está inactiva o la contraseña es incorrecta;
 * - al autenticar se emite siempre un token nuevo y se revoca la sesión previa;
 * - la desactivación del usuario o de su pertenencia afecta a la siguiente solicitud;
 * - módulo 13 (ADR-0017): con una contraseña temporal la sesión queda restringida (solo consultar la
 *   sesión, cambiar la contraseña y cerrar); una temporal caducada no permite entrar.
 */
import type { Capacidad, FuncionSesion } from "@softarq/contracts";
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
  readonly funciones: readonly FuncionSesion[];
  readonly capacidades: readonly Capacidad[];
  readonly expiraEn: Date;
  /** Contraseña temporal pendiente de cambio: la guardia solo deja las rutas del cambio. */
  readonly cambioContrasenaRequerido: boolean;
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
  | { estado: "TEMPORAL_CADUCADA" }
  /** Módulo 17: la contraseña es correcta pero la cuenta es interna; la app es solo para clientes (se dirige al panel). */
  | { estado: "CUENTA_INTERNA" }
  | { estado: "LIMITE"; reintentarEnSegundos: number };

export type ResultadoCambioContrasena =
  | { estado: "CAMBIADA" }
  | { estado: "ACTUAL_INCORRECTA" }
  | { estado: "TEMPORAL_CADUCADA" }
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
    return this.iniciar(previa.sesionId, "USUARIO", correo, contrasena, ip);
  }

  /**
   * Inicio de sesión del canal móvil (ADR-0020): mismas comprobaciones, limitador y política que el
   * web, pero sin sesión previa ni CSRF (la credencial viaja como Bearer, no es ambiental) y con una
   * sesión de tipo MOVIL que la cookie no acepta.
   */
  async iniciarSesionMovil(correo: string, contrasena: string, ip: string): Promise<ResultadoAcceso> {
    return this.iniciar(null, "MOVIL", correo, contrasena, ip);
  }

  private async iniciar(previaId: string | null, tipo: "USUARIO" | "MOVIL", correo: string, contrasena: string, ip: string): Promise<ResultadoAcceso> {
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
    // Módulo 17 (ADR-0021): una cuenta de cliente no abre una sesión web y una interna no abre una móvil. La web responde
    // como una credencial inválida (no revela que la cuenta existe); la app, con la contraseña correcta, explica y dirige al panel.
    const esCliente = membresia?.funciones.includes("CLIENTE") === true;
    if (!datos || !coincide || !datos.activo || !membresia || (tipo === "USUARIO" && esCliente)) {
      this.limitador.registrarFallo(cuenta, ip);
      return { estado: "CREDENCIALES_INVALIDAS" };
    }
    if (tipo === "MOVIL" && !esCliente) {
      this.limitador.registrarExito(cuenta, ip);
      return { estado: "CUENTA_INTERNA" };
    }

    const ahora = this.reloj.ahora();
    // La contraseña era correcta, así que informar la caducidad no revela si la cuenta existe.
    if (datos.temporalExpiraEn !== null && datos.temporalExpiraEn.getTime() <= ahora.getTime()) {
      this.limitador.registrarExito(cuenta, ip);
      return { estado: "TEMPORAL_CADUCADA" };
    }
    const sesion = generarToken();
    const expiraEn = new Date(ahora.getTime() + POLITICA_SESION.absolutaMs);
    const id = await this.repo.reemplazar(
      previaId,
      "AUTENTICADA",
      {
        tipo,
        tokenHash: sesion.hash,
        titular: { usuarioId: datos.usuarioId, organizacionId: membresia.organizacionId },
        creadaEn: ahora,
        expiraEn,
      },
      ahora,
    );
    this.limitador.registrarExito(cuenta, ip);
    const resuelta = await this.resolverTipo(sesion.token, tipo);
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
    return this.resolverTipo(token, "USUARIO");
  }

  /**
   * Sesión móvil del Bearer (ADR-0020). Las mismas comprobaciones que `resolver`; solo acepta sesiones
   * de tipo MOVIL, así que un token de cookie web no sirve aquí (ni uno móvil como cookie).
   */
  async resolverMovil(token: string | undefined): Promise<ResultadoResolucion<ContextoSesion>> {
    return this.resolverTipo(token, "MOVIL");
  }

  private async resolverTipo(token: string | undefined, tipo: "USUARIO" | "MOVIL"): Promise<ResultadoResolucion<ContextoSesion>> {
    if (token === undefined) return { estado: "SIN_COOKIE" };
    if (!tieneFormaDeToken(token)) return { estado: "NO_VALIDA", motivo: "FORMATO" };
    const s = await this.repo.sesionPorHash(hashDeToken(token));
    if (!s || s.tipo !== tipo || !s.titular) return { estado: "NO_VALIDA", motivo: "DESCONOCIDA" };
    const ahora = this.reloj.ahora();
    const estado = estadoTemporal(s, ahora);
    if (estado !== "VIGENTE") return { estado: "NO_VALIDA", motivo: estado };

    const t = s.titular;
    // Módulo 17: aislamiento de canales por tipo de cuenta (una sesión móvil solo de clientes; la web, solo de internos).
    const cuentaCliente = t.funciones.includes("CLIENTE");
    if (tipo === "MOVIL" ? !cuentaCliente : cuentaCliente) {
      await this.repo.revocar(s.id, "MEMBRESIA_INACTIVA", ahora);
      return { estado: "NO_VALIDA", motivo: tipo === "MOVIL" ? "CUENTA_INTERNA" : "CUENTA_CLIENTE" };
    }
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
    const restringida = t.temporalExpiraEn !== null;
    return {
      estado: "VIGENTE",
      sesion: {
        sesionId: s.id,
        usuario: { id: t.usuarioId, nombre: t.nombre, correo: t.correo },
        organizacion: t.organizacion,
        funciones: t.funciones,
        // Con la temporal pendiente no se concede ninguna capacidad de trabajo, aunque la guardia
        // ya limite las rutas: el cliente no puede deducir permisos de las funciones.
        capacidades: restringida ? ["sesion.propia"] : capacidadesDe(t.funciones),
        expiraEn: s.expiraEn,
        cambioContrasenaRequerido: restringida,
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

  /**
   * Cambio propio de contraseña (módulo 13, ADR-0017): exige la actual (también la temporal vigente),
   * con el mismo limitador que el acceso. Al terminar, la base revoca TODAS las sesiones de la persona
   * (incluida la actual): hay que volver a entrar con la contraseña nueva.
   */
  async cambiarContrasena(s: ContextoSesion, actual: string, nueva: string, ip: string): Promise<ResultadoCambioContrasena> {
    const cuenta = normalizarCorreo(s.usuario.correo);
    const limite = this.limitador.comprobar(cuenta, ip);
    if (!limite.permitido) return { estado: "LIMITE", reintentarEnSegundos: limite.reintentarEnSegundos };
    this.limitador.registrarIntento(ip);
    const vigente = await this.repo.hashDe(s.usuario.id);
    const coincide = vigente ? await this.contrasenas.verificar(vigente.hash, actual) : await this.contrasenas.verificarFicticio(actual);
    if (!vigente || !coincide) {
      this.limitador.registrarFallo(cuenta, ip);
      return { estado: "ACTUAL_INCORRECTA" };
    }
    if (vigente.temporalExpiraEn !== null && vigente.temporalExpiraEn.getTime() <= this.reloj.ahora().getTime()) {
      return { estado: "TEMPORAL_CADUCADA" };
    }
    const hash = await this.contrasenas.crearHash(nueva);
    await this.repo.cambiarContrasenaPropia(s.organizacion.id, s.usuario.id, hash);
    this.limitador.registrarExito(cuenta, ip);
    return { estado: "CAMBIADA" };
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    await this.repo.revocar(sesionId, "CIERRE", this.reloj.ahora());
  }
}
