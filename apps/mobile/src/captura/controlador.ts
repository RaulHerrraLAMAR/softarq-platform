/**
 * Controlador de una solicitud abierta (ADR-0021). Sin React ni módulos nativos: se prueba en Node.
 *
 * Qué garantiza:
 * - **Autoguardado de un solo vuelo.** Los cambios se guardan tras una pausa corta, nunca dos peticiones a la vez y
 *   siempre con la revisión vigente. Lo que se guarda no tiene errores (ver `aContrato`).
 * - **Conflicto sin sobrescribir.** Si otra pantalla o dispositivo guardó antes (409 `CONFLICTO_EDICION`), se detiene el
 *   guardado y la persona decide: usar lo guardado o conservar sus cambios. Si lo guardado ya coincide con lo que se
 *   iba a guardar (respuesta perdida), se adopta la revisión sin preguntar.
 * - **Una estimación solo vale para la captura que la produjo.** Si cambia algo que afecta al cálculo, o llega una
 *   respuesta de una captura anterior, se descarta y se pide recalcular; nunca se muestra como vigente.
 * - **Envío con una sola acción en curso** y recuperación si se pierde la respuesta: se vuelve a consultar la
 *   solicitud y, si ya está enviada, se da por enviada. El reintento del servidor es idempotente.
 * - Todo importe viene de la API. Aquí no se calcula nada.
 */
import type { EstimacionCliente, SolicitudDelCliente, TrabajoCliente } from "@softarq/contracts/cliente";
import { esConflictoDeEdicion, esFalloApi, esNoEditable, FalloApi, type CampoInvalido } from "../api/errores";
import type { ServiciosCliente } from "../servicios/cliente";
import { aContrato, desdeContrato, huellaCalculo, mismaCaptura, validarLocal, type CapturaLocal } from "./modelo";

export type EstadoGuardado = "limpio" | "pendiente" | "guardando" | "error" | "conflicto";
export type EstadoEstimacion = "ninguna" | "calculando" | "vigente" | "desactualizada" | "error";
export type EstadoEnvio = "inactivo" | "enviando" | "enviada" | "error";

export interface EstadoControlador {
  carga: "cargando" | "lista" | "error";
  errorCarga: FalloApi | null;
  /** Última versión conocida del servidor. */
  solicitud: SolicitudDelCliente | null;
  /** Lo que la persona ve y edita. */
  local: CapturaLocal;
  guardado: EstadoGuardado;
  errorGuardado: FalloApi | null;
  /** Versión del servidor que choca con los cambios locales (solo en `guardado: "conflicto"`). */
  conflicto: SolicitudDelCliente | null;
  /** `true` cuando la solicitud ya no se edita (enviada, retirada o atendida). */
  soloLectura: boolean;
  estimacion: EstadoEstimacion;
  /** La estimación recibida; solo se presenta como resultado si `estimacion === "vigente"`. */
  datosEstimacion: EstimacionCliente | null;
  errorEstimacion: FalloApi | null;
  envio: EstadoEnvio;
  errorEnvio: FalloApi | null;
  /** Campos que el servidor señaló como pendientes o inválidos al estimar o enviar. */
  camposServidor: CampoInvalido[];
}

export interface OpcionesControlador {
  id: string;
  servicios: ServiciosCliente;
  catalogo: readonly TrabajoCliente[];
  /** Pausa antes de guardar tras un cambio (ms). */
  esperaGuardado?: number;
  /** Programa una función; devuelve cómo cancelarla. Las pruebas lo reemplazan. */
  programar?: (f: () => void, ms: number) => () => void;
}

export const ESPERA_GUARDADO_MS = 800;

const programarPorOmision = (f: () => void, ms: number): (() => void) => {
  const h = setTimeout(f, ms);
  return () => clearTimeout(h);
};

export class ControladorSolicitud {
  private estado: EstadoControlador = {
    carga: "cargando",
    errorCarga: null,
    solicitud: null,
    local: { trabajos: [], notas: "" },
    guardado: "limpio",
    errorGuardado: null,
    conflicto: null,
    soloLectura: false,
    estimacion: "ninguna",
    datosEstimacion: null,
    errorEstimacion: null,
    envio: "inactivo",
    errorEnvio: null,
    camposServidor: [],
  };
  private readonly oyentes = new Set<() => void>();
  private readonly programar: (f: () => void, ms: number) => () => void;
  private readonly espera: number;
  private cancelarTemporizador: (() => void) | null = null;
  private revision = 0;
  private guardadoEnServidor = JSON.stringify({ trabajos: [], notas: null });
  private enVueloGuardar: Promise<boolean> | null = null;
  private enVueloEstimar: Promise<void> | null = null;
  private enVueloEnviar: Promise<void> | null = null;
  private fichaEstimacion = 0;
  private huellaEstimada: string | null = null;
  private liberado = false;

  constructor(private readonly o: OpcionesControlador) {
    this.programar = o.programar ?? programarPorOmision;
    this.espera = o.esperaGuardado ?? ESPERA_GUARDADO_MS;
  }

  // --- Suscripción (useSyncExternalStore) ---------------------------------------------------------

  obtenerEstado = (): EstadoControlador => this.estado;

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  };

  private poner(parcial: Partial<EstadoControlador>): void {
    if (this.liberado) return;
    this.estado = { ...this.estado, ...parcial };
    // La estimación se deriva siempre del estado, para no dejar nunca un resultado viejo como vigente.
    const derivada = this.derivarEstimacion();
    if (derivada !== this.estado.estimacion) this.estado = { ...this.estado, estimacion: derivada };
    for (const f of [...this.oyentes]) f();
  }

  private derivarEstimacion(): EstadoEstimacion {
    const e = this.estado;
    if (e.estimacion === "calculando") return "calculando";
    if (e.estimacion === "error" && e.errorEstimacion) return "error";
    if (!e.datosEstimacion) return "ninguna";
    const vigente = e.datosEstimacion.revisionCaptura === this.revision && this.huellaEstimada !== null && this.huellaEstimada === huellaCalculo(e.local, this.o.catalogo) && e.guardado === "limpio";
    return vigente ? "vigente" : "desactualizada";
  }

  /** Libera temporizadores y deja de avisar a las pantallas (al salir de la solicitud). */
  liberar(): void {
    this.liberado = true;
    this.cancelarTemporizador?.();
    this.cancelarTemporizador = null;
    this.oyentes.clear();
  }

  // --- Carga --------------------------------------------------------------------------------------

  async cargar(): Promise<void> {
    this.poner({ carga: "cargando", errorCarga: null });
    try {
      const s = await this.o.servicios.solicitud(this.o.id);
      this.adoptar(s);
      this.poner({ carga: "lista" });
    } catch (e) {
      if (esFalloApi(e) && e.tipo === "cancelada") return;
      this.poner({ carga: "error", errorCarga: aFallo(e) });
    }
  }

  /** Toma la versión del servidor como la verdad (carga, conflicto resuelto o envío). */
  private adoptar(s: SolicitudDelCliente, conservarLocal = false): void {
    this.revision = s.revision;
    this.guardadoEnServidor = JSON.stringify(s.captura);
    const local = conservarLocal ? this.estado.local : desdeContrato(s.captura);
    const e = s.ultimaEstimacion;
    this.huellaEstimada = e && e.revisionCaptura === s.revision ? huellaCalculo(local, this.o.catalogo) : null;
    this.poner({
      solicitud: s,
      local,
      soloLectura: !s.editable,
      guardado: "limpio",
      errorGuardado: null,
      conflicto: null,
      datosEstimacion: e,
      ...(this.estado.estimacion === "calculando" ? {} : { estimacion: "ninguna" as const, errorEstimacion: null }),
    });
  }

  // --- Edición y guardado -------------------------------------------------------------------------

  /** Aplica un cambio a la captura local y programa el guardado. */
  modificar(cambio: (c: CapturaLocal) => CapturaLocal): void {
    if (this.estado.soloLectura) return;
    const local = cambio(this.estado.local);
    if (local === this.estado.local) return;
    const sinGuardar = this.estado.guardado === "conflicto" ? "conflicto" : "pendiente";
    // Cualquier edición vuelve a pedir el cálculo: un cambio en curso o un error anterior ya no aplican.
    this.poner({ local, guardado: sinGuardar, errorGuardado: null, camposServidor: [], errorEstimacion: null, errorEnvio: null, ...(this.estado.estimacion === "error" ? { estimacion: "ninguna" as const } : {}) });
    if (sinGuardar === "pendiente") this.programarGuardado();
  }

  private programarGuardado(): void {
    this.cancelarTemporizador?.();
    this.cancelarTemporizador = this.programar(() => {
      this.cancelarTemporizador = null;
      void this.guardarAhora();
    }, this.espera);
  }

  /** `true` si hay cambios locales que todavía no están en el servidor. */
  get haySinGuardar(): boolean {
    return this.estado.guardado !== "limpio";
  }

  /**
   * Guarda ya lo pendiente y espera. Devuelve `true` si al terminar todo está guardado. Si ya hay un guardado en curso,
   * se une a él (y repite si hubo más cambios), así nunca hay dos peticiones a la vez.
   */
  guardarAhora(): Promise<boolean> {
    this.cancelarTemporizador?.();
    this.cancelarTemporizador = null;
    if (this.enVueloGuardar) return this.enVueloGuardar;
    this.enVueloGuardar = this.ciclosDeGuardado().finally(() => {
      this.enVueloGuardar = null;
    });
    return this.enVueloGuardar;
  }

  private async ciclosDeGuardado(): Promise<boolean> {
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      if (this.estado.soloLectura) return false;
      if (this.estado.guardado === "conflicto") return false;
      const captura = aContrato(this.estado.local, this.o.catalogo);
      const texto = JSON.stringify(captura);
      if (texto === this.guardadoEnServidor) {
        if (this.estado.guardado !== "limpio") this.poner({ guardado: "limpio", errorGuardado: null });
        return true;
      }
      this.poner({ guardado: "guardando", errorGuardado: null });
      try {
        const s = await this.o.servicios.guardar(this.o.id, this.revision, captura);
        this.revision = s.revision;
        this.guardadoEnServidor = JSON.stringify(s.captura);
        // Si mientras se guardaba hubo más cambios, otra vuelta; si no, queda limpio.
        const hayMas = JSON.stringify(aContrato(this.estado.local, this.o.catalogo)) !== this.guardadoEnServidor;
        this.poner({ solicitud: s, guardado: hayMas ? "pendiente" : "limpio", errorGuardado: null, soloLectura: !s.editable });
        if (!hayMas) return true;
      } catch (e) {
        if (esFalloApi(e) && e.tipo === "cancelada") {
          this.poner({ guardado: "pendiente" });
          return false;
        }
        const f = aFallo(e);
        if (esConflictoDeEdicion(f)) return await this.resolverPorServidor(captura);
        if (esNoEditable(f)) {
          await this.recargarComoSoloLectura();
          return false;
        }
        this.poner({ guardado: "error", errorGuardado: f, camposServidor: f.detalle.campos ?? [] });
        return false;
      }
    }
    return false;
  }

  /** 409 al guardar: ve qué hay en el servidor. Si ya es lo mismo, sigue; si no, pregunta. */
  private async resolverPorServidor(intentada: ReturnType<typeof aContrato>): Promise<boolean> {
    try {
      const s = await this.o.servicios.solicitud(this.o.id);
      if (!s.editable) {
        this.adoptar(s);
        return false;
      }
      if (mismaCaptura(s.captura, intentada)) {
        // La respuesta del guardado anterior se perdió: el servidor ya tiene exactamente esto.
        this.revision = s.revision;
        this.guardadoEnServidor = JSON.stringify(s.captura);
        this.poner({ solicitud: s, guardado: "limpio", errorGuardado: null });
        return true;
      }
      this.poner({ guardado: "conflicto", conflicto: s, errorGuardado: null });
    } catch (e) {
      if (!(esFalloApi(e) && e.tipo === "cancelada")) this.poner({ guardado: "error", errorGuardado: aFallo(e) });
    }
    return false;
  }

  private async recargarComoSoloLectura(): Promise<void> {
    try {
      this.adoptar(await this.o.servicios.solicitud(this.o.id));
    } catch (e) {
      if (!(esFalloApi(e) && e.tipo === "cancelada")) this.poner({ soloLectura: true, guardado: "error", errorGuardado: aFallo(e) });
    }
  }

  /** Conflicto: descartar lo local y usar lo guardado. */
  usarVersionGuardada(): void {
    const s = this.estado.conflicto;
    if (!s) return;
    this.adoptar(s);
  }

  /** Conflicto: conservar lo que escribió y guardarlo sobre la versión más reciente. Es una decisión explícita de la persona. */
  async conservarMisCambios(): Promise<boolean> {
    const s = this.estado.conflicto;
    if (!s) return false;
    this.revision = s.revision;
    this.guardadoEnServidor = JSON.stringify(s.captura);
    this.poner({ solicitud: s, conflicto: null, guardado: "pendiente", errorGuardado: null });
    return this.guardarAhora();
  }

  // --- Estimación ---------------------------------------------------------------------------------

  /** Hay algo por completar o corregir antes de calcular o enviar. */
  get faltantes(): ReturnType<typeof validarLocal> {
    return validarLocal(this.estado.local, this.o.catalogo);
  }

  estimar(): Promise<void> {
    if (this.enVueloEstimar) return this.enVueloEstimar;
    this.enVueloEstimar = this.hacerEstimar().finally(() => {
      this.enVueloEstimar = null;
    });
    return this.enVueloEstimar;
  }

  private async hacerEstimar(): Promise<void> {
    if (this.estado.soloLectura) return;
    const v = this.faltantes;
    if (v.errores.length > 0 || v.pendientes.length > 0) return;
    // Se muestra actividad desde el primer momento: guardar antes de calcular puede tardar o fallar (sin red).
    this.poner({ estimacion: "calculando", errorEstimacion: null, camposServidor: [] });
    if (!(await this.guardarAhora())) {
      // Un conflicto, una solicitud ya no editable o una cancelación se resuelven en sus propias hojas; un fallo de guardado se dice aquí.
      const fallo = this.estado.guardado === "error" ? this.estado.errorGuardado : null;
      this.poner(fallo ? { estimacion: "error", errorEstimacion: fallo, camposServidor: [] } : { estimacion: "ninguna" });
      return;
    }
    const ficha = ++this.fichaEstimacion;
    const huella = huellaCalculo(this.estado.local, this.o.catalogo);
    const revision = this.revision;
    try {
      const e = await this.o.servicios.estimar(this.o.id, revision);
      // Respuesta de otra captura o de un cálculo anterior: se descarta.
      if (ficha !== this.fichaEstimacion || huella !== huellaCalculo(this.estado.local, this.o.catalogo) || revision !== this.revision) {
        this.poner({ estimacion: "ninguna" });
        return;
      }
      this.huellaEstimada = huella;
      this.poner({ estimacion: "ninguna", datosEstimacion: e, errorEstimacion: null });
    } catch (err) {
      if (ficha !== this.fichaEstimacion) return;
      if (esFalloApi(err) && err.tipo === "cancelada") {
        this.poner({ estimacion: "ninguna" });
        return;
      }
      const f = aFallo(err);
      if (esConflictoDeEdicion(f)) {
        this.poner({ estimacion: "ninguna" });
        await this.resolverPorServidor(aContrato(this.estado.local, this.o.catalogo));
        return;
      }
      if (esNoEditable(f)) {
        this.poner({ estimacion: "ninguna" });
        await this.recargarComoSoloLectura();
        return;
      }
      this.poner({ estimacion: "error", errorEstimacion: f, camposServidor: f.detalle.campos ?? [] });
    }
  }

  // --- Envío y retiro -----------------------------------------------------------------------------

  enviar(): Promise<void> {
    if (this.enVueloEnviar) return this.enVueloEnviar;
    this.enVueloEnviar = this.hacerEnviar().finally(() => {
      this.enVueloEnviar = null;
    });
    return this.enVueloEnviar;
  }

  private async hacerEnviar(): Promise<void> {
    if (this.estado.envio === "enviada" || this.estado.soloLectura) return;
    const v = this.faltantes;
    if (v.errores.length > 0 || v.pendientes.length > 0) return;
    this.poner({ envio: "enviando", errorEnvio: null, camposServidor: [] });
    if (!(await this.guardarAhora())) {
      const fallo = this.estado.guardado === "error" ? this.estado.errorGuardado : null;
      this.poner(fallo ? { envio: "error", errorEnvio: fallo, camposServidor: [] } : { envio: "inactivo" });
      return;
    }
    try {
      const r = await this.o.servicios.enviar(this.o.id, this.revision);
      this.adoptar(r.solicitud);
      this.poner({ envio: "enviada" });
    } catch (err) {
      if (esFalloApi(err) && err.tipo === "cancelada") {
        this.poner({ envio: "inactivo" });
        return;
      }
      const f = aFallo(err);
      if (f.tipo === "red" || f.tipo === "servidor") {
        // Quizá el servidor sí la recibió y se perdió la respuesta: se consulta antes de decir que falló.
        if (await this.confirmarEnvio()) return;
      }
      if (esConflictoDeEdicion(f)) {
        this.poner({ envio: "inactivo" });
        await this.resolverPorServidor(aContrato(this.estado.local, this.o.catalogo));
        return;
      }
      if (esNoEditable(f)) {
        if (await this.confirmarEnvio()) return;
      }
      this.poner({ envio: "error", errorEnvio: f, camposServidor: f.detalle.campos ?? [] });
    }
  }

  /** Vuelve a consultar: si la solicitud ya no es un borrador, el envío ocurrió. */
  private async confirmarEnvio(): Promise<boolean> {
    try {
      const s = await this.o.servicios.solicitud(this.o.id);
      if (s.estado === "ENVIADA" || s.estado === "EN_PREPARACION" || s.estado === "COTIZADA") {
        this.adoptar(s);
        this.poner({ envio: "enviada" });
        return true;
      }
    } catch {
      // Sin respuesta: se muestra el error original y la persona puede reintentar (el envío es idempotente).
    }
    return false;
  }

  /** Retira una solicitud enviada que el equipo aún no atiende. */
  async retirar(): Promise<boolean> {
    try {
      this.adoptar(await this.o.servicios.retirar(this.o.id));
      return true;
    } catch (e) {
      if (!(esFalloApi(e) && e.tipo === "cancelada")) this.poner({ errorEnvio: aFallo(e) });
      return false;
    }
  }
}

function aFallo(e: unknown): FalloApi {
  return esFalloApi(e) ? e : new FalloApi("servidor", "El servidor tuvo un problema. Intente de nuevo en un momento.");
}
