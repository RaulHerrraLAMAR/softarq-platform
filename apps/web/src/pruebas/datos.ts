/**
 * Datos de prueba con la forma PÚBLICA de las respuestas de la API (sin precios ni costos).
 * Solo para pruebas de estado y componentes; las pruebas de navegador usan la API real.
 */
import type { RespuestaCalculoDemo } from "@softarq/contracts";
import type { ResultadoApi } from "../api/cliente.ts";
import type { ConceptoCatalogo, InsumoConOpciones, ServiciosApi, TipoAdicionalCatalogo } from "../api/servicios.ts";

export const CON_AREA: ConceptoCatalogo = {
  codigo: "CON-00007",
  descripcion: "[DEMO] Cubierta ligera",
  unidad: "m2",
  tipoFormula: "AREA",
  permiteDescuento: true,
  insumos: [
    { codigo: "INS-00004", descripcion: "[DEMO] Lámina", unidadBase: "m2" },
    { codigo: "INS-00005", descripcion: "[DEMO] Tornillo", unidadBase: "pza" },
  ],
};

export const CON_VOLUMEN: ConceptoCatalogo = {
  codigo: "CON-00008",
  descripcion: "[DEMO] Losa",
  unidad: "m3",
  tipoFormula: "VOLUMEN",
  permiteDescuento: false,
  insumos: [{ codigo: "INS-00007", descripcion: "[DEMO] Concreto", unidadBase: "m3" }],
};

const opcion = (precioCodigo: string, proveedor: string, esMenorPrecio: boolean) => ({
  precioCodigo,
  productoCodigo: `PCM-${precioCodigo.slice(-3)}`,
  producto: `[DEMO] Producto ${precioCodigo}`,
  presentacion: "pieza",
  unidadCompra: "pza",
  proveedorCodigo: proveedor,
  proveedor: `[DEMO] ${proveedor}`,
  vigenteHasta: "2027-09-30",
  esMenorPrecio,
});

export const OPCIONES_AREA: InsumoConOpciones[] = [
  {
    insumoCodigo: "INS-00004",
    insumoDescripcion: "[DEMO] Lámina",
    unidadBase: "m2",
    conceptos: ["CON-00007"],
    opciones: [opcion("PRE-000006", "PRV-00001", false), opcion("PRE-000007", "PRV-00002", true)],
  },
  {
    insumoCodigo: "INS-00005",
    insumoDescripcion: "[DEMO] Tornillo",
    unidadBase: "pza",
    conceptos: ["CON-00007"],
    opciones: [opcion("PRE-000008", "PRV-00001", true)],
  },
];

export const TIPOS: TipoAdicionalCatalogo[] = [
  { codigo: "CAD-00001", categoria: "Transporte", descripcion: "[DEMO] Transporte", unidad: "viaje" },
];

export const RESPUESTA_CALCULADA: RespuestaCalculoDemo = {
  estado: "CALCULADO",
  fechaCalculo: "2026-09-25",
  cotizacion: {
    ambiente: "DEMO",
    moneda: "MXN",
    leyenda: "DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL",
    partidas: [{ numero: 1, descripcion: "Cubierta", unidad: "m2", cantidad: "10", precioUnitario: "100.00", importe: "1000.00" }],
    subtotal: "1000.00",
    impuesto: { nombre: "Impuesto (tasa ilustrativa)", tasa: "0.16", importe: "160.00" },
    total: "1160.00",
  },
  avisos: [],
};

/** Promesa controlable desde la prueba. */
export function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

export function serviciosFalsos(sobrescribir: Partial<ServiciosApi> = {}): ServiciosApi {
  const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true, datos });
  return {
    buscarConceptos: (texto) =>
      ok({ conceptos: [CON_AREA, CON_VOLUMEN].filter((c) => !texto || c.codigo.includes(texto) || c.descripcion.includes(texto)), limite: 20 }),
    opcionesPrecio: (conceptos) =>
      ok({ fechaReferencia: "2026-09-25", insumos: OPCIONES_AREA.filter((i) => i.conceptos.some((c) => conceptos.includes(c))) }),
    tiposAdicional: () => ok({ tiposAdicional: TIPOS, limite: 100 }),
    calcular: () => ok(RESPUESTA_CALCULADA),
    ...sobrescribir,
  };
}
