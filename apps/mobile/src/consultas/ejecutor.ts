/**
 * Ejecutor de una consulta de solo lectura (ADR-0020), sin React: se prueba en Node y el hook
 * `usar-consulta.ts` solo lo conecta a la pantalla.
 *
 * - Cada `cargar()` abre una «serie»: una respuesta que llega después de otra carga, de `descartar()`
 *   (la pantalla se cerró) o de un cambio de cuenta nunca pisa el estado vigente.
 * - Con datos ya cargados, un reintento conserva lo que se ve (`actualizando`); si falla, avisa sin borrarlo.
 * - Los errores `cancelada` no se muestran: significan que alguien más ya decidió.
 */
import { FalloApi, esFalloApi } from "../api/errores";

export interface EstadoConsulta<T> {
  readonly fase: "cargando" | "listo" | "error";
  readonly datos: T | null;
  readonly error: FalloApi | null;
  /** Hay datos en pantalla y se está recargando. */
  readonly actualizando: boolean;
}

export class Consulta<T> {
  private serie = 0;
  private control: AbortController | null = null;
  private estado: EstadoConsulta<T> = { fase: "cargando", datos: null, error: null, actualizando: false };
  private readonly oyentes = new Set<() => void>();

  constructor(private readonly cargarDatos: (senal: AbortSignal) => Promise<T>) {}

  obtener = (): EstadoConsulta<T> => this.estado;

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  };

  private poner(e: EstadoConsulta<T>): void {
    this.estado = e;
    for (const o of [...this.oyentes]) o();
  }

  async cargar(): Promise<void> {
    this.control?.abort();
    const miSerie = ++this.serie;
    const control = new AbortController();
    this.control = control;
    const previos = this.estado.datos;
    this.poner(previos === null ? { fase: "cargando", datos: null, error: null, actualizando: false } : { fase: "listo", datos: previos, error: null, actualizando: true });
    try {
      const datos = await this.cargarDatos(control.signal);
      if (miSerie !== this.serie) return;
      this.poner({ fase: "listo", datos, error: null, actualizando: false });
    } catch (e) {
      if (miSerie !== this.serie) return;
      const fallo = esFalloApi(e) ? e : new FalloApi("servidor", "Ocurrió un error inesperado.");
      if (fallo.tipo === "cancelada") return;
      // Con datos previos se conservan a la vista y el error se informa aparte.
      this.poner({ fase: previos === null ? "error" : "listo", datos: previos, error: fallo, actualizando: false });
    }
  }

  reintentar(): Promise<void> {
    return this.cargar();
  }

  /** La pantalla se cerró o cambió la cuenta: aborta y descarta cualquier respuesta pendiente. */
  descartar(): void {
    this.serie++;
    this.control?.abort();
    this.control = null;
  }
}
