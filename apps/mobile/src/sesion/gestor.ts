/**
 * Gestor de la sesión móvil (ADR-0020). Sin React ni módulos nativos: se prueba en Node.
 *
 * Fases:
 * - `iniciando`: leyendo el almacén seguro y revalidando el token con la API.
 * - `sin_conexion`: hay token guardado pero no se pudo comprobar (red); la persona decide reintentar.
 * - `anonima`: sin sesión (con un aviso opcional: vencida, contraseña cambiada…).
 * - `cambio_contrasena`: sesión con contraseña temporal; solo se puede cambiar la contraseña o cerrar.
 * - `activa`: sesión vigente; identidad, funciones y capacidades SIEMPRE las dicta el servidor.
 *
 * Reglas:
 * - El servidor decide. La app revalida al volver a primer plano (como mucho una vez por minuto) y
 *   reacciona a cualquier 401/403 de la API; no consulta en bucle.
 * - Al cerrar, vencer, perder acceso o cambiar la contraseña: se borra el token del almacén seguro, se
 *   cancelan las solicitudes pendientes (la «generación» cambia: ninguna respuesta tardía de la cuenta
 *   anterior llega a una pantalla) y se avisa a los oyentes para que vacíen sus cachés.
 * - El token solo se guarda en el almacén seguro y se conserva en memoria mientras dura la sesión.
 */
import { EsquemaRespuestaAccesoMovil, EsquemaRespuestaSesionMovil, type RespuestaSesionMovil } from "@softarq/contracts/movil";
import { ClienteApi, type OpcionesCliente } from "../api/cliente";
import { FalloApi, esFalloApi } from "../api/errores";
import type { AlmacenToken } from "./almacen";

export type FaseSesion = "iniciando" | "sin_conexion" | "anonima" | "cambio_contrasena" | "activa";

export type AvisoSesion = { tipo: "vencida" | "sin_acceso" | "contrasena_cambiada"; mensaje: string };

export interface EstadoSesion {
  readonly fase: FaseSesion;
  /** Identidad y capacidades vigentes; solo en `activa` y `cambio_contrasena`. */
  readonly sesion: RespuestaSesionMovil | null;
  readonly aviso: AvisoSesion | null;
  /** Cambia con cada acceso, cierre o pérdida de sesión: las pantallas la usan como `key`. */
  readonly generacion: number;
}

export interface OpcionesGestor {
  baseUrl: string;
  almacen: AlmacenToken;
  fetch?: typeof fetch;
  ahora?: () => number;
  /** Mínimo entre revalidaciones al volver a primer plano. */
  minimoRevalidarMs?: number;
  tiempoMaximoMs?: number;
}

export const MINIMO_REVALIDAR_MS = 60_000;

const AVISOS: Record<AvisoSesion["tipo"], string> = {
  vencida: "La sesión venció o se cerró. Inicie sesión de nuevo.",
  sin_acceso: "Su cuenta ya no tiene acceso. Si cree que es un error, consulte al Administrador del sistema.",
  contrasena_cambiada: "Contraseña actualizada. Inicie sesión con la contraseña nueva.",
};

export class GestorSesion {
  readonly cliente: ClienteApi;
  private token: string | null = null;
  private estado: EstadoSesion = { fase: "iniciando", sesion: null, aviso: null, generacion: 0 };
  private readonly oyentes = new Set<() => void>();
  private readonly alLimpiar = new Set<() => void>();
  private ultimaValidacion = 0;
  private revalidando: Promise<void> | null = null;
  private cerrando = false;
  private readonly ahora: () => number;
  private readonly minimo: number;

  constructor(private readonly opciones: OpcionesGestor) {
    this.ahora = opciones.ahora ?? Date.now;
    this.minimo = opciones.minimoRevalidarMs ?? MINIMO_REVALIDAR_MS;
    const cliente: OpcionesCliente = {
      baseUrl: opciones.baseUrl,
      token: () => this.token,
      alFalloDeSesion: (f) => this.alFalloDeSesion(f),
      ...(opciones.fetch ? { fetch: opciones.fetch } : {}),
      ...(opciones.tiempoMaximoMs ? { tiempoMaximoMs: opciones.tiempoMaximoMs } : {}),
    };
    this.cliente = new ClienteApi(cliente);
  }

  // --- Suscripción (useSyncExternalStore) -------------------------------------------------------

  obtenerEstado = (): EstadoSesion => this.estado;

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  };

  /** Registra qué vaciar al perder la sesión (cachés de consultas, formularios). Devuelve cómo quitarlo. */
  alPerderSesion(limpiar: () => void): () => void {
    this.alLimpiar.add(limpiar);
    return () => this.alLimpiar.delete(limpiar);
  }

  private poner(parcial: Partial<Omit<EstadoSesion, "generacion">>, nuevaGeneracion: boolean): void {
    this.estado = { ...this.estado, ...parcial, generacion: this.estado.generacion + (nuevaGeneracion ? 1 : 0) };
    for (const o of [...this.oyentes]) o();
  }

  /** Corta todo lo de la cuenta anterior: solicitudes pendientes, token en memoria y cachés. */
  private soltarCuenta(): void {
    this.cliente.cancelarTodo();
    this.token = null;
    this.ultimaValidacion = 0;
    for (const l of [...this.alLimpiar]) l();
  }

  // --- Restauración e inicio --------------------------------------------------------------------

  /** Al abrir la app: lee el token guardado y lo revalida con el servidor. */
  async restaurar(): Promise<void> {
    this.poner({ fase: "iniciando" }, false);
    const guardado = await this.opciones.almacen.leer();
    if (guardado === null) {
      this.poner({ fase: "anonima", sesion: null }, false);
      return;
    }
    this.token = guardado;
    await this.comprobar("restaurar");
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<void> {
    this.soltarCuenta();
    this.poner({ aviso: null }, true); // ya nada de la cuenta anterior sobrevive
    const r = await this.cliente.enviar("POST", "/api/v1/auth/movil/sesion", { correo, contrasena }, EsquemaRespuestaAccesoMovil, { conToken: false });
    if (!r) throw new FalloApi("respuesta_invalida", "La respuesta del servidor no es la esperada.");
    const { tokenSesion, ...sesion } = r;
    try {
      await this.opciones.almacen.guardar(tokenSesion);
    } catch {
      // Sin dónde guardarlo de forma segura no se mantiene la sesión: se revoca en el servidor.
      this.token = tokenSesion;
      await this.cerrarEnServidor();
      this.token = null;
      throw new FalloApi("servidor", "No se pudo guardar la sesión de forma segura en este teléfono.");
    }
    this.token = tokenSesion;
    this.ultimaValidacion = this.ahora();
    this.poner({ fase: sesion.cambioContrasenaRequerido ? "cambio_contrasena" : "activa", sesion, aviso: null }, true);
  }

  // --- Revalidación -----------------------------------------------------------------------------

  /** Vuelve a pedir identidad y capacidades al servidor (la decisión final es suya). */
  private async comprobar(origen: "restaurar" | "revalidar"): Promise<void> {
    const generacion = this.estado.generacion;
    try {
      const sesion = await this.cliente.obtener("/api/v1/auth/movil/sesion", EsquemaRespuestaSesionMovil);
      if (generacion !== this.estado.generacion || this.token === null) return;
      this.ultimaValidacion = this.ahora();
      this.poner({ fase: sesion.cambioContrasenaRequerido ? "cambio_contrasena" : "activa", sesion, aviso: null }, origen === "restaurar");
    } catch (e) {
      if (!esFalloApi(e) || e.tipo === "cancelada") return;
      if (e.tipo === "sesion") return void (await this.perderSesion("vencida"));
      if (e.tipo === "red" && origen === "restaurar") {
        this.poner({ fase: "sin_conexion" }, false);
        return;
      }
      // Fallo pasajero al revalidar con la sesión ya abierta: se conserva el estado y se reintenta después.
    }
  }

  /** Al volver la app a primer plano. */
  async alVolverAPrimerPlano(): Promise<void> {
    if (this.token === null) return;
    if (this.estado.fase !== "activa" && this.estado.fase !== "cambio_contrasena") return;
    if (this.ahora() - this.ultimaValidacion < this.minimo) return;
    await this.revalidarYaMismo();
  }

  /** Revalidación inmediata (por ejemplo tras un 403 SIN_PERMISO); una sola a la vez. */
  revalidarYaMismo(): Promise<void> {
    if (this.revalidando) return this.revalidando;
    this.revalidando = this.comprobar("revalidar").finally(() => {
      this.revalidando = null;
    });
    return this.revalidando;
  }

  private alFalloDeSesion(f: FalloApi): void {
    if (this.cerrando) return; // cierre explícito en curso: no se presenta como «sesión vencida»
    if (f.tipo === "sesion") void this.perderSesion("vencida");
    else if (f.tipo === "cambio_contrasena") void this.revalidarYaMismo();
    else if (f.tipo === "sin_permiso") void this.revalidarYaMismo(); // las capacidades pudieron cambiar
  }

  // --- Cierre, pérdida y cambio de contraseña ---------------------------------------------------

  async cerrarSesion(): Promise<void> {
    this.cerrando = true;
    try {
      await this.cerrarEnServidor();
      await this.limpiarLocal(null);
    } finally {
      this.cerrando = false;
    }
  }

  /** La API ya no acepta la sesión (vencida, revocada, cuenta o pertenencia desactivada). */
  private async perderSesion(tipo: AvisoSesion["tipo"]): Promise<void> {
    if (this.token === null && this.estado.fase === "anonima") return;
    await this.limpiarLocal({ tipo, mensaje: AVISOS[tipo] });
  }

  private async cerrarEnServidor(): Promise<void> {
    if (this.token === null) return;
    try {
      await this.cliente.enviar("DELETE", "/api/v1/auth/sesion", undefined, null);
    } catch {
      // Sin red o ya vencida: el servidor la dará de baja por inactividad; localmente se borra igual.
    }
  }

  private async limpiarLocal(aviso: AvisoSesion | null): Promise<void> {
    this.soltarCuenta();
    await this.opciones.almacen.borrar();
    this.poner({ fase: "anonima", sesion: null, aviso }, true);
  }

  /**
   * Cambio propio de contraseña (obligatorio con una temporal). El servidor revoca TODAS las sesiones de
   * la persona, así que se borra el token y se vuelve al acceso.
   */
  async cambiarContrasena(actual: string, nueva: string, confirmacion: string): Promise<void> {
    await this.cliente.enviar("POST", "/api/v1/auth/contrasena", { actual, nueva, confirmacion }, null);
    await this.limpiarLocal({ tipo: "contrasena_cambiada", mensaje: AVISOS.contrasena_cambiada });
  }

  /** Reintento desde la pantalla «sin conexión». */
  async reintentarRestauracion(): Promise<void> {
    this.poner({ fase: "iniciando" }, false);
    await this.comprobar("restaurar");
  }
}
