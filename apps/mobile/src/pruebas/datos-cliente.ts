/**
 * Datos de prueba de la app del cliente (Node): un catálogo como el que ofrece el servidor y un servidor falso
 * con la misma lógica de revisiones. No es código de la app y no usa red.
 */
import {
  EsquemaEstimacionCliente,
  EsquemaSolicitudDelCliente,
  ROTULO_ESTIMACION,
  type CapturaSolicitud,
  type EstimacionCliente,
  type SolicitudDelCliente,
  type TrabajoCliente,
} from "@softarq/contracts/cliente";
import { FalloApi } from "../api/errores";
import type { ResumenSolicitud, ServiciosCliente } from "../servicios/cliente";

export const CATALOGO: TrabajoCliente[] = [
  {
    codigo: "CUBIERTA",
    nombre: "Cubierta",
    descripcion: "Techo de lámina sobre estructura ligera.",
    ilustracion: "cubierta",
    opciones: [
      {
        codigo: "LAMINA",
        nombre: "Lámina",
        descripcion: "Lámina galvanizada.",
        medidas: [
          { clave: "largo", etiqueta: "Largo", ayuda: "De borde a borde." },
          { clave: "ancho", etiqueta: "Ancho", ayuda: "En la otra dirección." },
        ],
        admiteHuecos: false,
        unidadResultado: "m²",
      },
    ],
  },
  {
    codigo: "LOSA",
    nombre: "Losa",
    descripcion: "Piso o entrepiso de concreto reforzado.",
    ilustracion: "losa",
    opciones: [
      {
        codigo: "CONCRETO",
        nombre: "Concreto armado",
        descripcion: "Losa sólida.",
        medidas: [
          { clave: "largo", etiqueta: "Largo", ayuda: "De borde a borde." },
          { clave: "ancho", etiqueta: "Ancho", ayuda: "En la otra dirección." },
          { clave: "alto", etiqueta: "Espesor", ayuda: "Grueso de la losa." },
        ],
        admiteHuecos: false,
        unidadResultado: "m³",
      },
    ],
  },
  {
    codigo: "MURO",
    nombre: "Muro",
    descripcion: "Muro de tabique, con o sin huecos.",
    ilustracion: "muro",
    opciones: [
      {
        codigo: "TABIQUE",
        nombre: "Tabique",
        descripcion: "Muro de tabique rojo.",
        medidas: [
          { clave: "largo", etiqueta: "Largo", ayuda: "De borde a borde." },
          { clave: "alto", etiqueta: "Alto", ayuda: "De la base a la parte superior." },
        ],
        admiteHuecos: true,
        unidadResultado: "m²",
      },
    ],
  },
];

export const ID_SOLICITUD = "5b0f6f0e-3c1a-4f8e-9a52-6d8f8b2f0a11";

export function solicitudDe(p: Partial<SolicitudDelCliente> = {}): SolicitudDelCliente {
  return EsquemaSolicitudDelCliente.parse({
    id: ID_SOLICITUD,
    folio: "SOL-2026-00001",
    estado: "BORRADOR",
    proyecto: { id: "9d2c3e20-1111-4222-8333-444455556666", nombre: "Casa Tlalpan", municipio: "Tlalpan", entidadFederativa: "Ciudad de México", descripcion: null },
    captura: { trabajos: [], notas: null },
    revision: 1,
    creadaEn: "2026-10-24T10:00:00.000Z",
    actualizadaEn: "2026-10-24T10:00:00.000Z",
    enviadaEn: null,
    editable: true,
    pendientes: [],
    ultimaEstimacion: null,
    cotizacionFormal: null,
    ...p,
  });
}

export function estimacionDe(revisionCaptura: number, total = "54190.68", p: Partial<EstimacionCliente> = {}): EstimacionCliente {
  return EsquemaEstimacionCliente.parse({
    id: "7a1b2c3d-0000-4000-8000-000000000001",
    numero: 1,
    estado: "ESTIMADA",
    rotulo: ROTULO_ESTIMACION,
    calculadaEn: "2026-10-24T10:05:00.000Z",
    fechaCalculo: "2026-10-24",
    revisionCaptura,
    desactualizada: false,
    comercial: {
      ambiente: "DEMO",
      moneda: "MXN",
      leyenda: "DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL",
      partidas: [{ numero: 1, descripcion: "Cubierta, Lámina", unidad: "m²", cantidad: "36", precioUnitario: "1297.64", importe: "46715.04" }],
      subtotal: "46715.04",
      impuesto: { nombre: "IVA", tasa: "0.16", importe: "7475.64" },
      total,
    },
    motivo: null,
    avisos: [],
    ...p,
  });
}

/** Una captura de cubierta completa (largo 6, ancho 6). */
export const CAPTURA_CUBIERTA: CapturaSolicitud = {
  trabajos: [{ id: "t1", trabajoCodigo: "CUBIERTA", opcionCodigo: "LAMINA", secciones: [{ nombre: "", piezas: "1", largo: "6", ancho: "6", alto: null }], huecos: [] }],
  notas: null,
};

export const conflicto = () => new FalloApi("conflicto", "Hay cambios más recientes en tu solicitud; vuelve a abrirla.", { estado: 409, codigo: "CONFLICTO_EDICION" });
export const noEditable = () => new FalloApi("conflicto", "La solicitud ya se envió: no se edita.", { estado: 409, codigo: "SOLICITUD_NO_EDITABLE" });
export const sinRed = () => new FalloApi("red", "Sin conexión con el servidor.");

export type Operacion = "solicitud" | "guardar" | "estimar" | "enviar" | "retirar";

/**
 * Servidor falso con la lógica de revisiones de la API: guardar y enviar exigen la revisión vigente, cada guardado la
 * incrementa y la estimación queda ligada a la revisión que la produjo.
 */
export class ServidorFalso {
  solicitud: SolicitudDelCliente;
  llamadas: { operacion: Operacion; revision?: number; captura?: CapturaSolicitud }[] = [];
  /** Respuestas que se retienen hasta resolver la promesa (para probar respuestas tardías). */
  retener: Partial<Record<Operacion, Promise<void>>> = {};
  /** Fallos a lanzar en la siguiente llamada de cada operación. */
  fallos: Partial<Record<Operacion, FalloApi[]>> = {};
  /** Si es verdadero, la operación se aplica en el servidor pero la respuesta se pierde (lanza `sinRed`). */
  perderRespuesta: Partial<Record<Operacion, boolean>> = {};
  totalEstimacion = "54190.68";
  private numeroEstimacion = 0;

  constructor(inicial: SolicitudDelCliente = solicitudDe()) {
    this.solicitud = inicial;
  }

  private async paso(o: Operacion): Promise<void> {
    const espera = this.retener[o];
    if (espera) await espera;
    const f = this.fallos[o]?.shift();
    if (f) throw f;
  }

  /** Lo que otra pantalla o dispositivo guardó: sube la revisión sin que esta pantalla lo sepa. */
  guardadoExterno(captura: CapturaSolicitud): void {
    this.solicitud = { ...this.solicitud, captura, revision: this.solicitud.revision + 1 };
  }

  readonly servicios: ServiciosCliente = {
    trabajos: async () => CATALOGO,
    proyectos: async () => [],
    crearProyecto: async () => {
      throw new Error("no usado");
    },
    solicitudes: async (): Promise<ResumenSolicitud[]> => [],
    crearSolicitud: async () => this.solicitud,
    solicitud: async () => {
      this.llamadas.push({ operacion: "solicitud" });
      await this.paso("solicitud");
      return this.solicitud;
    },
    guardar: async (_id, revision, captura) => {
      this.llamadas.push({ operacion: "guardar", revision, captura });
      await this.paso("guardar");
      if (!this.solicitud.editable) throw noEditable();
      if (revision !== this.solicitud.revision) throw conflicto();
      this.solicitud = { ...this.solicitud, captura, revision: revision + 1 };
      if (this.perderRespuesta.guardar) throw sinRed();
      return this.solicitud;
    },
    estimar: async (_id, revision) => {
      this.llamadas.push({ operacion: "estimar", revision });
      await this.paso("estimar");
      if (revision !== this.solicitud.revision) throw conflicto();
      this.numeroEstimacion++;
      const e = estimacionDe(revision, this.totalEstimacion, { numero: this.numeroEstimacion });
      this.solicitud = { ...this.solicitud, ultimaEstimacion: e };
      return e;
    },
    enviar: async (_id, revision) => {
      this.llamadas.push({ operacion: "enviar", revision });
      await this.paso("enviar");
      const repetida = this.solicitud.estado !== "BORRADOR";
      if (!repetida) {
        if (revision !== this.solicitud.revision) throw conflicto();
        this.solicitud = { ...this.solicitud, estado: "ENVIADA", editable: false, enviadaEn: "2026-10-24T11:00:00.000Z" };
      }
      if (this.perderRespuesta.enviar) throw sinRed();
      return { repetida, solicitud: this.solicitud };
    },
    retirar: async () => {
      this.llamadas.push({ operacion: "retirar" });
      this.solicitud = { ...this.solicitud, estado: "RETIRADA", editable: false };
      return this.solicitud;
    },
    cotizaciones: async () => [],
    cotizacion: async () => {
      throw new Error("no usado");
    },
    documento: async () => new Uint8Array(),
  };

  contar(o: Operacion): number {
    return this.llamadas.filter((l) => l.operacion === o).length;
  }
}
