/**
 * Ejemplo ilustrativo del Word maestro v1.3, §3.14 (ILUSTRATIVO/DEMO: inventado para explicar
 * y probar las reglas; no es un precio). Los comentarios VBA lo citan como «sección 9.13» de la
 * especificación v0.2: son los mismos datos.
 *
 * Corroboración: casos internos PC-07 a PC-39 (entrega\fuentes\vba\modPruebas.bas,
 * Pru_ModeloEjemplo) y versión COT-2026-00001-v1 del libro oficial (total 18,790.94).
 */
import type { EntradaCalculo } from "@softarq/contracts";
import { adicional, entrada, partidaConcepto, renglon } from "./construir.js";

export function ejemplo314(consolidarCompras = true): EntradaCalculo {
  return entrada({
    fechaCalculo: "2026-09-23",
    parametros: { consolidarCompras },
    partidas: [
      partidaConcepto("P001", "CON-00001", "[DEMO] Concepto X (ilustrativo, m2)", [
        renglon("Muro", "+", "1", "5.00", "2.50", null),
        renglon("Vano", "-", "1", "1.00", "1.20", null),
      ]),
      partidaConcepto("P002", "CON-00002", "[DEMO] Concepto Y (ilustrativo, m3)", [
        renglon("Columnas", "+", "3", "0.40", "0.40", "2.50"),
      ]),
      adicional("P003", "Transporte", "Transporte", "viaje", "1", "600.00"),
      adicional("P004", "Maquinaria", "Maquinaria", "dia", "1", "800.00"),
    ],
    precios: ["PRE-000001", "PRE-000002", "PRE-000003"],
  });
}

/** Cifras de las tablas de §3.14 (y de PC-21 a PC-39). */
export const ESPERADO_3_14 = {
  cantidades: { P001: "11.3", P002: "1.2" },
  consumos: {
    // [partida, insumo]: [neto, con desperdicio]
    "P001|INS-00001": ["141.25", "148.3125"],
    "P001|INS-00002": ["56.5", "58.195"],
    "P002|INS-00002": ["396", "407.88"],
    "P002|INS-00003": ["1.2", "1.26"],
  },
  compras: {
    "PCM-00001": { unidades: "149", costo: "1460.2" },
    "PCM-00002": { unidades: "19", costo: "2755" },
    "PCM-00003": { unidades: "1.5", costo: "2850" },
  },
  /** Prorrateo de K02 mostrado con 4 decimales truncados; la suma es exacta. */
  prorrateoPB: { P001: "343.9944", P002: "2411.0055" },
  partidas: {
    P001: { materiales4: "1804.1945", manoObra: "2034", pu: "407.60", importe: "4605.88" },
    P002: { materiales4: "5261.0055", manoObra: "3000", jornadas: "2", pu: "8261.01", importe: "9913.21" },
    P003: { pu: "720.00", importe: "720.00" },
    P004: { pu: "960.00", importe: "960.00" },
  },
  totales: {
    costoDirectoRedondeado: "13499.20",
    subtotal: "16199.09",
    impuestos: "2591.85",
    total: "18790.94",
    margen4: "0.1667",
  },
  /** PC-39: sin consolidar, B se compra por separado. */
  sinConsolidarPB: { unidades: "20", costo: "2900" },
  /** §3.14: «Sin consolidar, B se compraría por separado: 3 bultos para P001 y 17 para P002». */
  sinConsolidarPBPorPartida: { P001: "3", P002: "17" },
} as const;
