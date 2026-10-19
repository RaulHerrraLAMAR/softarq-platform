/**
 * Salidas internas de solo lectura de una versión (módulo 14, ADR-0018): 12 COMPRAS,
 * 13 DETALLE_CALCULO e indicadores de 14 REVISION. Fuente: Word maestro v1.3 §1.3, RF-16,
 * §3.4–3.6, §3.14 y §5.5. Solo esquemas: el armado y las sumas los hace la API.
 *
 * - Contrato INTERNO con su propia capacidad (`salidas.consultar`): costos, consumos, proveedores,
 *   recargo y margen. Nunca forma parte de la proyección comercial, del PDF ni de mensajes al
 *   cliente (D-16).
 * - Todo sale de la versión congelada (entrada, resultado y referencias del cálculo). Nada se lee
 *   del catálogo ni de los parámetros vigentes.
 * - Decimales como texto, con la precisión que guardó el motor (sin redondeos añadidos).
 * - `null` en un nombre significa «no congelado en esta versión», nunca «vacío».
 */
import { z } from "zod";
import { CAMPOS_EXCEPCION, MODALIDADES_MANO_OBRA } from "../calculo.js";
import { ESTADOS_VERSION } from "./cotizaciones.js";
import { DECISIONES_EXCEPCION } from "./excepciones.js";

/**
 * Disponibilidad del detalle histórico:
 * - COMPLETO: versión con referencias congeladas (desde el módulo 14);
 * - SIN_NOMBRES: versión anterior; cifras completas, pero nombres y vigencias no se congelaron
 *   (se muestran solo los códigos);
 * - NO_DISPONIBLE: la instantánea no tiene la forma esperada; no se muestran cifras parciales.
 */
export const DISPONIBILIDADES_SALIDA = ["COMPLETO", "SIN_NOMBRES", "NO_DISPONIBLE"] as const;
export type DisponibilidadSalida = (typeof DISPONIBILIDADES_SALIDA)[number];

/** Regla de compra (CR-06): presentación completa o venta fraccionada por incremento. */
export const REGLAS_COMPRA = ["PAQUETE_COMPLETO", "FRACCIONABLE"] as const;

const EsquemaReferencia = z.strictObject({ codigo: z.string(), nombre: z.string().nullable() });

/**
 * Indicador: valor (texto decimal) o la razón de no tenerlo. NO_APLICA: el denominador es 0
 * (p. ej. margen sin venta). NO_DISPONIBLE: faltan datos en la versión. Ninguno equivale a 0.
 */
export const EsquemaIndicador = z.discriminatedUnion("estado", [
  z.strictObject({ estado: z.literal("VALOR"), valor: z.string() }),
  z.strictObject({ estado: z.literal("NO_APLICA"), motivo: z.string() }),
  z.strictObject({ estado: z.literal("NO_DISPONIBLE"), motivo: z.string() }),
]);
export type Indicador = z.infer<typeof EsquemaIndicador>;

export const EsquemaProrrateoCompra = z.strictObject({
  partidaId: z.string(),
  partidaNumero: z.number().int().positive(),
  componenteCodigo: z.string(),
  consumoBase: z.string(),
  /** Precisión completa (CR-08); la web la muestra con 4 decimales truncados (§3.14). */
  costoProrrateado: z.string(),
});

/** Compra por presentación (12 COMPRAS B60:N64). */
export const EsquemaCompraInterna = z.strictObject({
  numero: z.number().int().positive(),
  insumo: EsquemaReferencia,
  unidadBase: z.string().nullable(),
  producto: EsquemaReferencia,
  presentacion: z.string().nullable(),
  unidadCompra: z.string().nullable(),
  proveedor: EsquemaReferencia,
  precio: z.strictObject({ codigo: z.string(), vigenteDesde: z.string().nullable(), vigenteHasta: z.string().nullable() }),
  /** `null` = consolidada entre partidas (CR-05). */
  partida: z.strictObject({ id: z.string(), numero: z.number().int().positive(), descripcion: z.string() }).nullable(),
  regla: z.enum(REGLAS_COMPRA),
  consumoTotal: z.string(),
  contenido: z.string(),
  incrementoMinimo: z.string().nullable(),
  cantidadComprada: z.string(),
  unidades: z.string(),
  /** Se informa (AV-03, D-10) y no se descuenta. */
  sobrante: z.string(),
  precioUnitario: z.string(),
  costoCompra: z.string(),
  prorrateo: z.array(EsquemaProrrateoCompra),
});
export type CompraInterna = z.infer<typeof EsquemaCompraInterna>;

/** Excepción de rendimiento o desperdicio aplicada a un consumo, con su decisión vigente. */
export const EsquemaAjusteConsumo = z.strictObject({
  numero: z.number().int().positive(),
  campo: z.enum(CAMPOS_EXCEPCION),
  valorAplicado: z.string(),
  estado: z.enum(["PENDIENTE", ...DECISIONES_EXCEPCION]),
});

/** Consumo de un componente (13 DETALLE_CALCULO A6:M6). */
export const EsquemaConsumoInterno = z.strictObject({
  componenteCodigo: z.string(),
  insumo: EsquemaReferencia,
  /** Valores del catálogo copiados en la versión al calcular. */
  catalogo: z.strictObject({ rendimiento: z.string(), desperdicio: z.string(), traslape: z.string().nullable() }).nullable(),
  rendimientoUsado: z.string(),
  desperdicioUsado: z.string(),
  traslapeUsado: z.string(),
  unidadRendimiento: z.string(),
  unidadBase: z.string(),
  consumoNeto: z.string(),
  consumoConDesperdicio: z.string(),
  factorConversion: z.string(),
  consumoBase: z.string(),
  compraNumero: z.number().int().positive(),
  costoProrrateado: z.string(),
  ajustes: z.array(EsquemaAjusteConsumo),
});

export const EsquemaManoObraInterna = z.strictObject({
  tarifa: EsquemaReferencia,
  modalidad: z.enum(MODALIDADES_MANO_OBRA),
  unidad: z.string().nullable(),
  /** Importe de la tarifa por unidad, por jornada o del subcontratista. */
  importeTarifa: z.string(),
  rendimientoJornada: z.string().nullable(),
  jornadas: z.string().nullable(),
});

/** Partida con su desglose (13 DETALLE_CALCULO, una cabecera y sus filas). */
export const EsquemaPartidaInterna = z.strictObject({
  id: z.string(),
  numero: z.number().int().positive(),
  tipo: z.enum(["CONCEPTO", "ADICIONAL"]),
  concepto: EsquemaReferencia.nullable(),
  tipoAdicional: EsquemaReferencia.nullable(),
  categoria: z.string().nullable(),
  descripcion: z.string(),
  unidad: z.string(),
  cantidad: z.string(),
  renglones: z.array(z.strictObject({ numero: z.number().int().positive(), resultado: z.string() })),
  consumos: z.array(EsquemaConsumoInterno),
  manoObra: EsquemaManoObraInterna.nullable(),
  costoMateriales: z.string(),
  costoManoObra: z.string(),
  costoSubcontrato: z.string(),
  costoAdicional: z.string(),
  costoDirecto: z.string(),
  precioUnitarioVenta: z.string(),
  importe: z.string(),
});
export type PartidaInterna = z.infer<typeof EsquemaPartidaInterna>;

/** Indicadores de la versión (10 COTIZAR Q6:R19, 13 B18:L23, 14 A7). Ver ADR-0018 §5. */
export const EsquemaIndicadoresVersion = z.strictObject({
  costoMateriales: EsquemaIndicador,
  costoManoObra: EsquemaIndicador,
  costoSubcontrato: EsquemaIndicador,
  /** Costos adicionales por categoría, en el orden de la primera partida de cada una. */
  costosAdicionales: z.array(z.strictObject({ categoria: z.string(), valor: z.string() })),
  costoAdicional: EsquemaIndicador,
  costoDirecto: EsquemaIndicador,
  costoDirectoRedondeado: EsquemaIndicador,
  subtotal: EsquemaIndicador,
  impuesto: z.strictObject({ nombre: z.string().nullable(), tasa: EsquemaIndicador, base: z.string().nullable(), importe: EsquemaIndicador }),
  total: EsquemaIndicador,
  /** k, fracción (0.20 = 20 %): se suma al costo para obtener el precio (CR-11). */
  recargoSobreCosto: EsquemaIndicador,
  /** (venta − costo) ÷ venta, fracción; solo indicador (D-07). No equivale a k. */
  margenSobrePrecio: EsquemaIndicador,
});
export type IndicadoresVersion = z.infer<typeof EsquemaIndicadoresVersion>;

/** Comprobaciones de cuadre sobre los valores congelados (no corrigen nada si fallan). */
export const EsquemaConciliacion = z.strictObject({
  /** Materiales + mano de obra + subcontrato + adicionales = costo directo (precisión completa). */
  categorias: z.boolean(),
  /** Suma de importes de las partidas = subtotal (CR-12). */
  importes: z.boolean(),
  /** En cada compra, la suma de su prorrateo = su costo (CR-08). */
  prorrateo: z.boolean(),
});

export const EsquemaSalidasInternasVersion = z.strictObject({
  encabezado: z.strictObject({
    versionId: z.uuid(),
    idVersion: z.string(),
    folio: z.string(),
    numero: z.number().int().positive(),
    origen: z.string(),
    ambiente: z.string().nullable(),
    moneda: z.string().nullable(),
    estado: z.enum(ESTADOS_VERSION),
    esUltima: z.boolean(),
    fechaCalculo: z.string(),
    /** CR-05, fijado por versión (D-09); `null` si no está disponible. */
    consolidarCompras: z.boolean().nullable(),
    versionMotor: z.string(),
    autorNombre: z.string(),
    creadoEn: z.string(),
  }),
  disponibilidad: z.strictObject({ estado: z.enum(DISPONIBILIDADES_SALIDA), motivo: z.string().nullable() }),
  compras: z.array(EsquemaCompraInterna),
  partidas: z.array(EsquemaPartidaInterna),
  indicadores: EsquemaIndicadoresVersion,
  conciliacion: EsquemaConciliacion.nullable(),
  /** Avisos internos del cálculo (AV-01 con precios, AV-03 con sobrante). */
  avisos: z.array(z.strictObject({ codigo: z.string(), referencia: z.string(), mensaje: z.string() })),
});
export type SalidasInternasVersion = z.infer<typeof EsquemaSalidasInternasVersion>;
