/**
 * Catálogo DEMO para las fixtures del motor. TODOS LOS VALORES SON ILUSTRATIVOS (DEMO):
 * no son precios, rendimientos, tarifas ni parámetros reales.
 *
 * Procedencia (lectura del 02/10/2026, sin modificar los archivos):
 * - D:\Proyecto_SoftArq\entrega\Cotizador_Estructuras_F1.xlsm (MD5 b60debc121957b8d8e3f2c2edd9a5b4f),
 *   tablas tblInsumos, tblConversiones, tblProductos, tblPrecios, tblTarifasMO, tblConceptos,
 *   tblComponentes y tblParametros (DEMO_*).
 * - entrega\fuentes\vba\modGuia.bas, Guia_CargarCatalogoDemo (catálogo de los recorridos)
 *   y Guia_Ejemplo (mediciones de los tres ejemplos).
 * - Word maestro v1.3, §3.14 (concepto X/Y, productos PA/PB/PC) y §3.6 (DEMO_RECARGO_PCT, DEMO_IMP_TASA).
 *
 * Nota: el libro guarda `contenido` como double (2.1960000000000002, 2.9769999999999999);
 * su función Dec() lo reconstruye a 15 cifras: 2.196 y 2.977, que son los valores usados aquí.
 */
import type {
  ComponenteCalculo,
  ConversionCalculo,
  InsumoCalculo,
  ParametrosCalculo,
  SeleccionPrecioCalculo,
  TarifaManoObraCalculo,
} from "@softarq/contracts";

/** tblParametros DEMO_* con AMBIENTE = DEMO. Consolidar compras = «Sí» en las versiones de referencia. */
export const PARAMETROS_DEMO: ParametrosCalculo = {
  ambiente: "DEMO",
  moneda: "MXN",
  recargoSobreCosto: "0.2",
  impuesto: {
    tasa: "0.16",
    base: "SUBTOTAL_VENTA",
    tratamiento: "Ilustrativo: impuesto sobre el subtotal de venta",
    nombre: "Impuesto (tasa ilustrativa)",
  },
  consolidarCompras: true,
};

export const INSUMOS: Record<string, InsumoCalculo> = {
  "INS-00001": { id: "INS-00001", unidadBase: "pza" }, // [DEMO] Insumo A
  "INS-00002": { id: "INS-00002", unidadBase: "kg" }, // [DEMO] Insumo B
  "INS-00003": { id: "INS-00003", unidadBase: "m3" }, // [DEMO] Insumo C
  "INS-00004": { id: "INS-00004", unidadBase: "m2" }, // [DEMO] Lámina acanalada
  "INS-00005": { id: "INS-00005", unidadBase: "pza" }, // [DEMO] Tornillo autotaladrante
  "INS-00006": { id: "INS-00006", unidadBase: "kg" }, // [DEMO] Larguero de acero
  "INS-00007": { id: "INS-00007", unidadBase: "m3" }, // [DEMO] Concreto premezclado
  "INS-00008": { id: "INS-00008", unidadBase: "kg" }, // [DEMO] Acero de refuerzo
  "INS-00009": { id: "INS-00009", unidadBase: "m2" }, // [DEMO] Triplay para cimbra
  "INS-00010": { id: "INS-00010", unidadBase: "pza" }, // [DEMO] Block hueco 15x20x40
  "INS-00011": { id: "INS-00011", unidadBase: "kg" }, // [DEMO] Mortero premezclado
};

/** tblConversiones: factores ilustrativos kg/m (no son datos de fabricante). */
export const CONVERSIONES: ConversionCalculo[] = [
  { insumoId: "INS-00006", unidadOrigen: "m", unidadDestino: "kg", factor: "4.2" },
  { insumoId: "INS-00008", unidadOrigen: "m", unidadDestino: "kg", factor: "0.56" },
];

type SeleccionBase = Omit<SeleccionPrecioCalculo, "menorPrecioVigente">;

/** tblProductos + tblPrecios. Clave: id del precio. */
export const PRECIOS: Record<string, SeleccionBase> = {
  // Concepto X / Y (§3.14)
  "PRE-000001": sel("INS-00001", "PCM-00001", "PRV-00001", "PRE-000001", "9.8", "1", false, null), // PA pieza
  "PRE-000002": sel("INS-00002", "PCM-00002", "PRV-00001", "PRE-000002", "145", "25", false, null), // PB bulto 25 kg
  "PRE-000003": sel("INS-00003", "PCM-00003", "PRV-00001", "PRE-000003", "1900", "1", true, "0.25"), // PC m3 cada 0.25
  // Recorrido 1: cubierta ligera
  "PRE-000006": sel("INS-00004", "PCM-00004", "PRV-00001", "PRE-000006", "385", "2.196", false, null),
  "PRE-000007": sel("INS-00004", "PCM-00004", "PRV-00002", "PRE-000007", "362", "2.196", false, null),
  "PRE-000008": sel("INS-00005", "PCM-00005", "PRV-00001", "PRE-000008", "165", "100", false, null),
  "PRE-000009": sel("INS-00006", "PCM-00006", "PRV-00001", "PRE-000009", "610", "25.62", false, null),
  "PRE-000010": sel("INS-00006", "PCM-00006", "PRV-00002", "PRE-000010", "640", "25.62", false, null),
  // Recorrido 2: losa
  "PRE-000011": sel("INS-00007", "PCM-00007", "PRV-00001", "PRE-000011", "2150", "1", true, "0.5"),
  "PRE-000012": sel("INS-00007", "PCM-00007", "PRV-00002", "PRE-000012", "2090", "1", true, "0.5"),
  "PRE-000013": sel("INS-00008", "PCM-00008", "PRV-00001", "PRE-000013", "168", "6.7", false, null),
  "PRE-000014": sel("INS-00009", "PCM-00009", "PRV-00001", "PRE-000014", "520", "2.977", false, null),
  // Recorrido 3: muro
  "PRE-000015": sel("INS-00010", "PCM-00010", "PRV-00001", "PRE-000015", "14.5", "1", false, null),
  "PRE-000016": sel("INS-00010", "PCM-00010", "PRV-00002", "PRE-000016", "13.9", "1", false, null),
  "PRE-000017": sel("INS-00011", "PCM-00011", "PRV-00001", "PRE-000017", "118", "25", false, null),
};

function sel(
  insumoId: string,
  productoId: string,
  proveedorId: string,
  precioId: string,
  precioUnitario: string,
  contenido: string,
  fraccionable: boolean,
  incrementoMinimo: string | null,
): SeleccionBase {
  return { insumoId, productoId, proveedorId, precioId, precioUnitario, contenido, fraccionable, incrementoMinimo };
}

/** Selección confirmada de un precio; `menorPrecioVigente` solo para AV-01. */
export function elegir(precioId: string, menorPrecioVigente: string | null = null): SeleccionPrecioCalculo {
  const p = PRECIOS[precioId];
  if (!p) throw new Error(`Precio DEMO desconocido: ${precioId}`);
  return { ...p, menorPrecioVigente };
}

/** tblTarifasMO. */
export const TARIFAS: Record<string, TarifaManoObraCalculo> = {
  "TMO-00001": tarifa("TMO-00001", "UNIDAD", "m2", "180", null, "2026-09-01", "2027-03-31"),
  "TMO-00002": tarifa("TMO-00002", "JORNADA", "m3", "1500", "0.6", "2026-09-01", "2027-03-31"),
  "TMO-00003": tarifa("TMO-00003", "SUBCONTRATO", "m2", "95", null, "2026-09-01", "2027-09-30"),
  "TMO-00004": tarifa("TMO-00004", "JORNADA", "m3", "2400", "3.5", "2026-09-01", "2027-09-30"),
  "TMO-00005": tarifa("TMO-00005", "UNIDAD", "m2", "210", null, "2026-09-01", "2027-09-30"),
};

function tarifa(
  id: string,
  modalidad: TarifaManoObraCalculo["modalidad"],
  unidad: string,
  importe: string,
  rendimientoJornada: string | null,
  vigenteDesde: string,
  vigenteHasta: string,
): TarifaManoObraCalculo {
  return { id, modalidad, unidad, importe, rendimientoJornada, vigenteDesde, vigenteHasta, activa: true };
}

/** tblComponentes por concepto. */
export const COMPONENTES: Record<string, ComponenteCalculo[]> = {
  // [DEMO] Concepto X (m2, AREA, permite descuento, TMO-00001)
  "CON-00001": [
    comp("CMP-00001", "INS-00001", "12.5", "pza", "0.05", null),
    comp("CMP-00002", "INS-00002", "5", "kg", "0.03", null),
  ],
  // [DEMO] Concepto Y (m3, VOLUMEN, TMO-00002)
  "CON-00002": [
    comp("CMP-00003", "INS-00002", "330", "kg", "0.03", null),
    comp("CMP-00004", "INS-00003", "1", "m3", "0.05", null),
  ],
  // [DEMO] Cubierta ligera (m2, AREA, permite descuento, TMO-00003)
  "CON-00007": [
    comp("CMP-00005", "INS-00004", "1", "m2", "0.05", "0.1"),
    comp("CMP-00006", "INS-00005", "6", "pza", "0.05", null),
    comp("CMP-00007", "INS-00006", "1.25", "m", "0.03", null),
  ],
  // [DEMO] Losa de concreto reforzado (m3, VOLUMEN, TMO-00004)
  "CON-00008": [
    comp("CMP-00008", "INS-00007", "1", "m3", "0.05", null),
    comp("CMP-00009", "INS-00008", "95", "kg", "0.05", null),
    comp("CMP-00010", "INS-00009", "10", "m2", "0.1", null),
  ],
  // [DEMO] Muro de block reforzado (m2, AREA, permite descuento, TMO-00005)
  "CON-00009": [
    comp("CMP-00011", "INS-00010", "12.5", "pza", "0.05", null),
    comp("CMP-00012", "INS-00011", "27", "kg", "0.05", null),
    comp("CMP-00013", "INS-00008", "3.2", "m", "0.05", null),
  ],
};

function comp(
  id: string,
  insumoId: string,
  rendimiento: string,
  unidadRendimiento: string,
  desperdicio: string,
  factorTraslape: string | null,
): ComponenteCalculo {
  return { id, insumoId, rendimiento, unidadRendimiento, desperdicio, factorTraslape };
}

export const CONCEPTOS = {
  "CON-00001": { id: "CON-00001", unidad: "m2", tipoFormula: "AREA", permiteDescuento: true },
  "CON-00002": { id: "CON-00002", unidad: "m3", tipoFormula: "VOLUMEN", permiteDescuento: false },
  "CON-00007": { id: "CON-00007", unidad: "m2", tipoFormula: "AREA", permiteDescuento: true },
  "CON-00008": { id: "CON-00008", unidad: "m3", tipoFormula: "VOLUMEN", permiteDescuento: false },
  "CON-00009": { id: "CON-00009", unidad: "m2", tipoFormula: "AREA", permiteDescuento: true },
} as const;

export const TARIFA_DE_CONCEPTO: Record<keyof typeof CONCEPTOS, string> = {
  "CON-00001": "TMO-00001",
  "CON-00002": "TMO-00002",
  "CON-00007": "TMO-00003",
  "CON-00008": "TMO-00004",
  "CON-00009": "TMO-00005",
};
