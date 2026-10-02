/**
 * Catálogo DEMO para la carga en PostgreSQL. TODOS LOS DATOS SON ILUSTRATIVOS (DEMO):
 * no son precios, rendimientos, tarifas, impuestos ni parámetros reales.
 *
 * Procedencia (lectura del 02/10/2026, sin modificar los archivos):
 * - D:\Proyecto_SoftArq\entrega\Cotizador_Estructuras_F1.xlsm (MD5 b60debc121957b8d8e3f2c2edd9a5b4f):
 *   tblInsumos, tblConversiones, tblProveedores, tblProductos, tblPrecios, tblTarifasMO,
 *   tblConceptos, tblComponentes, tblTiposAdicional y tblParametros (DEMO_*).
 * - entrega\fuentes\vba\modGuia.bas (Guia_CargarCatalogoDemo).
 *
 * Se excluyen: las plantillas CON-00003 a CON-00006 (sin reglas aprobadas) y CAD-00004
 * (tipo creado por el usuario del libro, no es dato DEMO).
 *
 * El libro guarda `contenido` como double (2.1960000000000002); aquí se usa el decimal
 * que reconstruye su función Dec(): 2.196 y 2.977.
 *
 * La prueba de integración compara la entrada armada desde estos datos con los fixtures
 * verificados del motor (__tests__/fixtures/catalogo-demo.ts) para detectar desviaciones.
 */

export const ORGANIZACION_DEMO = {
  codigo: "DEMO",
  nombre: "[DEMO] Organización de demostración (ficticia)",
} as const;

/** tblParametros con AMBIENTE = DEMO (DEMO_RECARGO_PCT, DEMO_IMP_*), Word §3.6. */
export const PARAMETROS_DEMO = {
  ambiente: "DEMO",
  moneda: "MXN",
  recargoSobreCosto: "0.2",
  impuestoTasa: "0.16",
  impuestoBase: "SUBTOTAL_VENTA",
  impuestoTratamiento: "Ilustrativo: impuesto sobre el subtotal de venta",
  impuestoNombre: "Impuesto (tasa ilustrativa)",
  vigenciaDias: 15,
} as const;

export const INSUMOS_DEMO = [
  { codigo: "INS-00001", descripcion: "[DEMO] Insumo A (pieza)", unidadBase: "pza" },
  { codigo: "INS-00002", descripcion: "[DEMO] Insumo B (kg)", unidadBase: "kg" },
  { codigo: "INS-00003", descripcion: "[DEMO] Insumo C (m3)", unidadBase: "m3" },
  { codigo: "INS-00004", descripcion: "[DEMO] Lamina acanalada galvanizada (m2)", unidadBase: "m2" },
  { codigo: "INS-00005", descripcion: "[DEMO] Tornillo autotaladrante con arandela (pza)", unidadBase: "pza" },
  { codigo: "INS-00006", descripcion: "[DEMO] Larguero de acero (kg)", unidadBase: "kg" },
  { codigo: "INS-00007", descripcion: "[DEMO] Concreto premezclado (m3)", unidadBase: "m3" },
  { codigo: "INS-00008", descripcion: "[DEMO] Acero de refuerzo (kg)", unidadBase: "kg" },
  { codigo: "INS-00009", descripcion: "[DEMO] Triplay para cimbra (m2)", unidadBase: "m2" },
  { codigo: "INS-00010", descripcion: "[DEMO] Block hueco de concreto 15x20x40 (pza)", unidadBase: "pza" },
  { codigo: "INS-00011", descripcion: "[DEMO] Mortero premezclado en seco (kg)", unidadBase: "kg" },
] as const;

export const CONVERSIONES_DEMO = [
  {
    insumo: "INS-00006",
    unidadOrigen: "m",
    unidadDestino: "kg",
    factor: "4.2",
    fuente: "[DEMO] Factor ilustrativo kg/m del larguero (no es dato de fabricante)",
  },
  {
    insumo: "INS-00008",
    unidadOrigen: "m",
    unidadDestino: "kg",
    factor: "0.56",
    fuente: "[DEMO] Factor ilustrativo kg/m de la varilla (no es dato de fabricante)",
  },
] as const;

export const PROVEEDORES_DEMO = [
  { codigo: "PRV-00001", nombre: "[DEMO] Proveedor Uno (ficticio)" },
  { codigo: "PRV-00002", nombre: "[DEMO] Proveedor Dos (ficticio)" },
] as const;

export const PRODUCTOS_DEMO = [
  p("PCM-00001", "INS-00001", "[DEMO] Producto PA", "pieza", "pza", "1", false, null),
  p("PCM-00002", "INS-00002", "[DEMO] Producto PB", "bulto 25 kg", "bulto", "25", false, null),
  p("PCM-00003", "INS-00003", "[DEMO] Producto PC", "m3, venta fraccionada cada 0.25", "m3", "1", true, "0.25"),
  p("PCM-00004", "INS-00004", "[DEMO] Hoja de lamina 0.72 x 3.05 m", "hoja de 2.196 m2 utiles", "pza", "2.196", false, null),
  p("PCM-00005", "INS-00005", "[DEMO] Caja de tornillos", "caja con 100 piezas", "lote", "100", false, null),
  p("PCM-00006", "INS-00006", "[DEMO] Larguero en tramo de 6.10 m", "tramo 6.10 m = 25.62 kg", "pza", "25.62", false, null),
  p("PCM-00007", "INS-00007", "[DEMO] Concreto premezclado", "m3, venta fraccionada cada 0.5 m3", "m3", "1", true, "0.5"),
  p("PCM-00008", "INS-00008", "[DEMO] Varilla en tramo de 12 m", "tramo 12 m = 6.70 kg", "pza", "6.7", false, null),
  p("PCM-00009", "INS-00009", "[DEMO] Hoja de triplay 1.22 x 2.44 m", "hoja de 2.977 m2", "pza", "2.977", false, null),
  p("PCM-00010", "INS-00010", "[DEMO] Block hueco 15x20x40", "pieza", "pza", "1", false, null),
  p("PCM-00011", "INS-00011", "[DEMO] Mortero premezclado", "bulto 25 kg", "bulto", "25", false, null),
] as const;

function p(
  codigo: string,
  insumo: string,
  descripcion: string,
  presentacion: string,
  unidadCompra: string,
  contenido: string,
  fraccionable: boolean,
  incrementoMinimo: string | null,
) {
  return { codigo, insumo, descripcion, presentacion, unidadCompra, contenido, fraccionable, incrementoMinimo };
}

const F_913 = "ILUSTRATIVO seccion 9.13";
const F_REC = "ILUSTRATIVO: recorrido guiado DEMO";

/** tblPrecios. PRE-000005 está vencido desde el 15/09/2026 (en el libro sirve para probar BL-09). */
export const PRECIOS_DEMO = [
  pr("PRE-000001", "PCM-00001", "PRV-00001", "9.8", "2026-09-01", "2027-03-31", F_913),
  pr("PRE-000002", "PCM-00002", "PRV-00001", "145", "2026-09-01", "2027-03-31", F_913),
  pr("PRE-000003", "PCM-00003", "PRV-00001", "1900", "2026-09-01", "2027-03-31", F_913),
  pr("PRE-000004", "PCM-00002", "PRV-00002", "150", "2026-09-01", "2027-03-31", "ILUSTRATIVO: segundo proveedor para comparar (D-12)"),
  pr("PRE-000005", "PCM-00003", "PRV-00002", "1850", "2026-08-01", "2026-09-15", "ILUSTRATIVO: precio ya vencido (prueba BL-09)"),
  pr("PRE-000006", "PCM-00004", "PRV-00001", "385", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000007", "PCM-00004", "PRV-00002", "362", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000008", "PCM-00005", "PRV-00001", "165", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000009", "PCM-00006", "PRV-00001", "610", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000010", "PCM-00006", "PRV-00002", "640", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000011", "PCM-00007", "PRV-00001", "2150", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000012", "PCM-00007", "PRV-00002", "2090", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000013", "PCM-00008", "PRV-00001", "168", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000014", "PCM-00009", "PRV-00001", "520", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000015", "PCM-00010", "PRV-00001", "14.5", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000016", "PCM-00010", "PRV-00002", "13.9", "2026-09-01", "2027-09-30", F_REC),
  pr("PRE-000017", "PCM-00011", "PRV-00001", "118", "2026-09-01", "2027-09-30", F_REC),
] as const;

function pr(
  codigo: string,
  producto: string,
  proveedor: string,
  precioUnitario: string,
  vigenteDesde: string,
  vigenteHasta: string,
  fuente: string,
) {
  return { codigo, producto, proveedor, precioUnitario, vigenteDesde, vigenteHasta, fuente };
}

export const TARIFAS_DEMO = [
  t("TMO-00001", "UNIDAD", "[DEMO] MO concepto X por m2", "m2", "180", null, "2026-09-01", "2027-03-31", F_913),
  t("TMO-00002", "JORNADA", "[DEMO] Cuadrilla concepto Y", "m3", "1500", "0.6", "2026-09-01", "2027-03-31", F_913),
  t("TMO-00003", "SUBCONTRATO", "[DEMO] Subcontrato de montaje de cubierta ligera por m2", "m2", "95", null, "2026-09-01", "2027-09-30", F_REC),
  t("TMO-00004", "JORNADA", "[DEMO] Cuadrilla de colado de losa", "m3", "2400", "3.5", "2026-09-01", "2027-09-30", F_REC),
  t("TMO-00005", "UNIDAD", "[DEMO] Mano de obra de muro de block por m2", "m2", "210", null, "2026-09-01", "2027-09-30", F_REC),
] as const;

function t(
  codigo: string,
  modalidad: "UNIDAD" | "JORNADA" | "SUBCONTRATO",
  descripcion: string,
  unidad: string,
  importe: string,
  rendimientoJornada: string | null,
  vigenteDesde: string,
  vigenteHasta: string,
  fuente: string,
) {
  return { codigo, modalidad, descripcion, unidad, importe, rendimientoJornada, vigenteDesde, vigenteHasta, fuente };
}

export const CONCEPTOS_DEMO = [
  c("CON-00001", "[DEMO] Concepto X (ilustrativo, m2)", "m2", "AREA", true, "TMO-00001"),
  c("CON-00002", "[DEMO] Concepto Y (ilustrativo, m3)", "m3", "VOLUMEN", false, "TMO-00002"),
  c("CON-00007", "[DEMO] Cubierta ligera de lamina sobre largueros (ilustrativa, m2)", "m2", "AREA", true, "TMO-00003"),
  c("CON-00008", "[DEMO] Losa de concreto reforzado (ilustrativa, m3)", "m3", "VOLUMEN", false, "TMO-00004"),
  c("CON-00009", "[DEMO] Muro de block de concreto reforzado (ilustrativo, m2)", "m2", "AREA", true, "TMO-00005"),
] as const;

function c(
  codigo: string,
  descripcion: string,
  unidad: string,
  tipoFormula: "CONTEO" | "LONGITUD" | "AREA" | "VOLUMEN",
  permiteDescuento: boolean,
  tarifa: string,
) {
  return { codigo, descripcion, unidad, tipoFormula, permiteDescuento, clase: "ESTANDAR", estado: "Aprobado", tarifa };
}

const FC_913 = "Ejemplo ilustrativo seccion 9.13 (no tecnico)";
const FC_REC = "[DEMO] Valor ilustrativo del recorrido guiado (no tecnico)";
const RESP = "[DEMO] Pendiente del cliente";

/** tblComponentes; `orden` sigue el orden del libro dentro de cada concepto. */
export const COMPONENTES_DEMO = [
  k("CMP-00001", "CON-00001", 1, "INS-00001", "12.5", "pza", "0.05", null, FC_913, "2026-09-22"),
  k("CMP-00002", "CON-00001", 2, "INS-00002", "5", "kg", "0.03", null, FC_913, "2026-09-22"),
  k("CMP-00003", "CON-00002", 1, "INS-00002", "330", "kg", "0.03", null, FC_913, "2026-09-22"),
  k("CMP-00004", "CON-00002", 2, "INS-00003", "1", "m3", "0.05", null, FC_913, "2026-09-22"),
  k("CMP-00005", "CON-00007", 1, "INS-00004", "1", "m2", "0.05", "0.1", FC_REC, "2026-09-25"),
  k("CMP-00006", "CON-00007", 2, "INS-00005", "6", "pza", "0.05", null, FC_REC, "2026-09-25"),
  k("CMP-00007", "CON-00007", 3, "INS-00006", "1.25", "m", "0.03", null, FC_REC, "2026-09-25"),
  k("CMP-00008", "CON-00008", 1, "INS-00007", "1", "m3", "0.05", null, FC_REC, "2026-09-25"),
  k("CMP-00009", "CON-00008", 2, "INS-00008", "95", "kg", "0.05", null, FC_REC, "2026-09-25"),
  k("CMP-00010", "CON-00008", 3, "INS-00009", "10", "m2", "0.1", null, FC_REC, "2026-09-25"),
  k("CMP-00011", "CON-00009", 1, "INS-00010", "12.5", "pza", "0.05", null, FC_REC, "2026-09-25"),
  k("CMP-00012", "CON-00009", 2, "INS-00011", "27", "kg", "0.05", null, FC_REC, "2026-09-25"),
  k("CMP-00013", "CON-00009", 3, "INS-00008", "3.2", "m", "0.05", null, FC_REC, "2026-09-25"),
] as const;

function k(
  codigo: string,
  concepto: string,
  orden: number,
  insumo: string,
  rendimiento: string,
  unidadRendimiento: string,
  desperdicio: string,
  factorTraslape: string | null,
  fuente: string,
  fecha: string,
) {
  return {
    codigo,
    concepto,
    orden,
    insumo,
    rendimiento,
    unidadRendimiento,
    desperdicio,
    factorTraslape,
    fuente,
    fecha,
    responsable: RESP,
  };
}

export const TIPOS_ADICIONAL_DEMO = [
  { codigo: "CAD-00001", categoria: "Transporte", descripcion: "[DEMO] Transporte de materiales", unidad: "viaje" },
  { codigo: "CAD-00002", categoria: "Maquinaria", descripcion: "[DEMO] Maquinaria y equipo", unidad: "dia" },
  { codigo: "CAD-00003", categoria: "Otro", descripcion: "[DEMO] Otros gastos", unidad: "serv" },
] as const;
