/**
 * Contratos del motor de cálculo (CR-01 a CR-16 del Word maestro v1.3).
 *
 * La entrada contiene costos internos y solo la arma la API a partir de sus datos.
 * El resultado `ResultadoCalculado` es INTERNO (costos, proveedores, consumos, margen):
 * los clientes web y móvil deben recibir `CotizacionComercial` (ver vista-comercial.ts).
 */
import type { DecimalTexto, FechaISO } from "./decimal.js";

export const TIPOS_FORMULA = ["CONTEO", "LONGITUD", "AREA", "VOLUMEN"] as const;
export type TipoFormula = (typeof TIPOS_FORMULA)[number];

export const MODALIDADES_MANO_OBRA = ["UNIDAD", "JORNADA", "SUBCONTRATO"] as const;
export type ModalidadManoObra = (typeof MODALIDADES_MANO_OBRA)[number];

export const AMBIENTES = ["DEMO", "PRODUCCION"] as const;
export type Ambiente = (typeof AMBIENTES)[number];

/** Única base de impuesto que existe en la fase 1 (DEMO_IMP_BASE). Otras bases no están definidas. */
export const BASES_IMPUESTO = ["SUBTOTAL_VENTA"] as const;
export type BaseImpuesto = (typeof BASES_IMPUESTO)[number];

export const ESTADOS_EXCEPCION = ["Pendiente", "Autorizada", "Rechazada"] as const;
export type EstadoExcepcion = (typeof ESTADOS_EXCEPCION)[number];

export const CAMPOS_EXCEPCION = ["RENDIMIENTO", "DESPERDICIO"] as const;
export type CampoExcepcion = (typeof CAMPOS_EXCEPCION)[number];

export type Signo = "+" | "-";
export type Moneda = "MXN";

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface ImpuestoCalculo {
  /** Fracción entre 0 y 1 (0.16 = 16 %). */
  tasa: DecimalTexto;
  /** Solo `SUBTOTAL_VENTA`; cualquier otro valor bloquea (BL-13). */
  base: string;
  tratamiento: string;
  nombre: string;
}

export interface ParametrosCalculo {
  ambiente: Ambiente;
  moneda: Moneda;
  /**
   * Recargo sobre costo k como fracción entre 0 y 1 (0.20 = 20 %).
   * `null` = no definido: bloquea (BL-12). `"0"` es un valor definido y distinto de `null`.
   */
  recargoSobreCosto: DecimalTexto | null;
  /** `null` = definición fiscal no capturada: bloquea (BL-13). */
  impuesto: ImpuestoCalculo | null;
  /** CR-05. Obligatorio: no hay valor por omisión. */
  consolidarCompras: boolean;
}

export interface InsumoCalculo {
  id: string;
  unidadBase: string;
}

/** Conversión registrada de una unidad a la unidad base del insumo (CR-04). */
export interface ConversionCalculo {
  insumoId: string;
  unidadOrigen: string;
  unidadDestino: string;
  /** Unidades de destino por unidad de origen; mayor que 0. */
  factor: DecimalTexto;
}

/** Renglón de números generadores (CR-01). Las dimensiones que la fórmula no usa van en `null`. */
export interface RenglonMedicion {
  descripcion: string;
  signo: Signo;
  /** Entero mayor que cero. */
  piezas: DecimalTexto;
  largo: DecimalTexto | null;
  ancho: DecimalTexto | null;
  alto: DecimalTexto | null;
}

export interface ConceptoCalculo {
  id: string;
  unidad: string;
  tipoFormula: TipoFormula;
  /** Admite renglones con signo «−» (descuentos de vanos). */
  permiteDescuento: boolean;
}

export interface ComponenteCalculo {
  id: string;
  insumoId: string;
  /** Unidades del rendimiento por unidad del concepto; mayor que 0. */
  rendimiento: DecimalTexto;
  unidadRendimiento: string;
  /** Fracción 0 <= desperdicio < 1. */
  desperdicio: DecimalTexto;
  /** Factor de traslape aprobado (>= 0) o `null` si no aplica. */
  factorTraslape: DecimalTexto | null;
}

export interface TarifaManoObraCalculo {
  id: string;
  modalidad: ModalidadManoObra;
  unidad: string;
  /** Importe por unidad, por jornada o precio del subcontratista; mayor que 0. */
  importe: DecimalTexto;
  /** Solo en JORNADA (mayor que 0); `null` en las demás modalidades. */
  rendimientoJornada: DecimalTexto | null;
  vigenteDesde: FechaISO;
  vigenteHasta: FechaISO;
  activa: boolean;
}

export interface PartidaConceptoEntrada {
  id: string;
  tipo: "CONCEPTO";
  descripcion: string;
  concepto: ConceptoCalculo;
  mediciones: RenglonMedicion[];
  componentes: ComponenteCalculo[];
  /** `null` = el concepto no tiene tarifa asignada (BL-10). */
  tarifaManoObra: TarifaManoObraCalculo | null;
}

/** Transporte, maquinaria u otros gastos (CR-10): monto de costo capturado. */
export interface PartidaAdicionalEntrada {
  id: string;
  tipo: "ADICIONAL";
  descripcion: string;
  categoria: string;
  unidad: string;
  cantidad: DecimalTexto;
  monto: DecimalTexto;
}

export type PartidaEntrada = PartidaConceptoEntrada | PartidaAdicionalEntrada;

/** Precio elegido y confirmado por el preparador para un insumo (CR-07). Uno por insumo. */
export interface SeleccionPrecioCalculo {
  insumoId: string;
  productoId: string;
  proveedorId: string;
  precioId: string;
  /** Precio por unidad de compra; mayor que 0. */
  precioUnitario: DecimalTexto;
  /** Contenido de una unidad de compra en la unidad base del insumo; mayor que 0. */
  contenido: DecimalTexto;
  fraccionable: boolean;
  /** Incremento mínimo en unidad base; obligatorio (> 0) si es fraccionable, `null` si no. */
  incrementoMinimo: DecimalTexto | null;
  /**
   * Menor precio vigente del mismo producto a la fecha, si el llamador lo conoce.
   * Solo sirve para el aviso AV-01; el motor nunca cambia la selección.
   */
  menorPrecioVigente: DecimalTexto | null;
}

/** Excepción de rendimiento o desperdicio de un componente solo en esta versión (D-04, §3.10). */
export interface ExcepcionRendimientoCalculo {
  id: string;
  partidaId: string;
  componenteId: string;
  campo: CampoExcepcion;
  valorAplicado: DecimalTexto;
  estado: EstadoExcepcion;
}

export interface EntradaCalculo {
  /** Fecha explícita para comprobar la vigencia de las tarifas; el motor no lee el reloj. */
  fechaCalculo: FechaISO;
  parametros: ParametrosCalculo;
  insumos: InsumoCalculo[];
  conversiones: ConversionCalculo[];
  /** El orden importa: define el orden de agrupación de compras y el remanente del prorrateo (CR-08). */
  partidas: PartidaEntrada[];
  selecciones: SeleccionPrecioCalculo[];
  excepciones: ExcepcionRendimientoCalculo[];
}

/** Límites técnicos de tamaño de la entrada (protección del servidor). */
export const LIMITES_ENTRADA_CALCULO = {
  partidas: 500,
  /** Igual que la cuadrícula de 11 MEDICION del Excel. */
  renglonesPorPartida: 200,
  componentesPorPartida: 50,
  insumos: 1000,
  selecciones: 1000,
  conversiones: 1000,
  excepciones: 500,
  longitudTexto: 500,
} as const;

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export const CODIGOS_BLOQUEO_MOTOR = [
  "BL-03",
  "BL-05",
  "BL-06",
  "BL-08",
  "BL-10",
  "BL-11",
  "BL-12",
  "BL-13",
  "BL-18",
] as const;
export type CodigoBloqueoMotor = (typeof CODIGOS_BLOQUEO_MOTOR)[number];

export const CODIGOS_AVISO_MOTOR = ["AV-01", "AV-03"] as const;
export type CodigoAvisoMotor = (typeof CODIGOS_AVISO_MOTOR)[number];

export interface ProblemaCalculo {
  codigo: CodigoBloqueoMotor;
  /** ID de la partida, componente, insumo o parámetro afectado. */
  referencia: string;
  mensaje: string;
}

export interface AvisoCalculo {
  codigo: CodigoAvisoMotor;
  referencia: string;
  mensaje: string;
}

export interface ErrorEntradaCalculo {
  /** Ruta del campo, p. ej. `partidas[0].mediciones[2].largo`. */
  ruta: string;
  mensaje: string;
}

export interface RenglonCalculado {
  numero: number;
  resultado: DecimalTexto;
}

export interface ConsumoCalculado {
  partidaId: string;
  componenteId: string;
  insumoId: string;
  rendimientoUsado: DecimalTexto;
  desperdicioUsado: DecimalTexto;
  traslapeUsado: DecimalTexto;
  unidadRendimiento: string;
  unidadBase: string;
  excepcionIds: string[];
  consumoNeto: DecimalTexto;
  consumoConDesperdicio: DecimalTexto;
  factorConversion: DecimalTexto;
  consumoBase: DecimalTexto;
  compraNumero: number;
  /** Precisión completa (CR-08). */
  costoProrrateado: DecimalTexto;
}

export interface CompraCalculada {
  numero: number;
  productoId: string;
  proveedorId: string;
  precioId: string;
  /** `null` si la compra está consolidada entre partidas. */
  partidaId: string | null;
  consumoTotal: DecimalTexto;
  contenido: DecimalTexto;
  fraccionable: boolean;
  incrementoMinimo: DecimalTexto | null;
  /** Cantidad comprada en unidad base. */
  cantidadComprada: DecimalTexto;
  unidades: DecimalTexto;
  /** Se informa (AV-03) pero no se descuenta. */
  sobrante: DecimalTexto;
  precioUnitario: DecimalTexto;
  costoCompra: DecimalTexto;
}

export interface ManoObraCalculada {
  tarifaId: string;
  modalidad: ModalidadManoObra;
  importe: DecimalTexto;
  rendimientoJornada: DecimalTexto | null;
}

export interface PartidaCalculada {
  id: string;
  tipo: "CONCEPTO" | "ADICIONAL";
  descripcion: string;
  unidad: string;
  cantidad: DecimalTexto;
  renglones: RenglonCalculado[];
  categoria: string | null;
  manoObra: ManoObraCalculada | null;
  jornadas: DecimalTexto | null;
  costoMateriales: DecimalTexto;
  costoManoObra: DecimalTexto;
  costoSubcontrato: DecimalTexto;
  costoAdicional: DecimalTexto;
  /** Precisión completa. */
  costoDirecto: DecimalTexto;
  /** 2 decimales (CR-11). */
  precioUnitarioVenta: DecimalTexto;
  /** 2 decimales (CR-12). */
  importe: DecimalTexto;
}

export interface TotalesCalculo {
  costoDirecto: DecimalTexto;
  costoDirectoRedondeado: DecimalTexto;
  subtotal: DecimalTexto;
  impuestos: DecimalTexto;
  total: DecimalTexto;
  /** Indicador interno (venta − costo) ÷ venta; `null` si la venta es 0. */
  margen: DecimalTexto | null;
}

export interface ParametrosUsados {
  ambiente: Ambiente;
  moneda: Moneda;
  recargoSobreCosto: DecimalTexto;
  impuesto: ImpuestoCalculo & { base: BaseImpuesto };
  consolidarCompras: boolean;
}

export interface ResultadoCalculado {
  estado: "CALCULADO";
  parametros: ParametrosUsados;
  partidas: PartidaCalculada[];
  consumos: ConsumoCalculado[];
  compras: CompraCalculada[];
  totales: TotalesCalculo;
  avisos: AvisoCalculo[];
}

/** El cálculo no puede completarse; no se entregan importes parciales. */
export interface ResultadoBloqueado {
  estado: "BLOQUEADO";
  problemas: ProblemaCalculo[];
}

/** La entrada no tiene la forma, el formato o los límites requeridos. */
export interface ResultadoEntradaInvalida {
  estado: "ENTRADA_INVALIDA";
  errores: ErrorEntradaCalculo[];
}

export type ResultadoCalculo = ResultadoCalculado | ResultadoBloqueado | ResultadoEntradaInvalida;
