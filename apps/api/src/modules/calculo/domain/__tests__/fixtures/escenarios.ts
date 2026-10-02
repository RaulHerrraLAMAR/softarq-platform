/**
 * Escenarios de referencia con resultados obtenidos INDEPENDIENTEMENTE del motor nuevo.
 * Todos los datos son DEMO (ilustrativos). Ninguno de estos importes es un precio real.
 *
 * Los resultados esperados se copian de la fuente citada en `origen`. Las evidencias hechas
 * sobre copias del libro tienen folios propios: se identifican por archivo, escenario y caso,
 * nunca solo por el folio.
 */
import type { EntradaCalculo } from "@softarq/contracts";
import { adicional, entrada, partidaConcepto, renglon } from "./construir.js";

export interface Origen {
  /** Fuente principal de las cifras esperadas. */
  fuente: string;
  /** Escenario o caso dentro de la fuente. */
  ubicacion: string;
  /** Otras evidencias que reportan las mismas cifras (archivo · caso). */
  corroboracion: string[];
}

export interface Esperado {
  cantidad: string;
  costoDirectoRedondeado: string;
  subtotal: string;
  impuestos: string;
  total: string;
  /** Unidades de compra por producto, cuando la fuente las reporta. */
  unidadesPorProducto?: Record<string, string>;
}

export interface Escenario {
  id: string;
  descripcion: string;
  origen: Origen;
  entrada: EntradaCalculo;
  esperado: Esperado;
}

const GUIA = "entrega\\Guia_de_demostracion.md, «Referencia de resultados» (cálculo independiente del libro)";
const FASE1 = "entrega\\evidencias_pruebas\\fase1.csv (corrida 25/09/2026 sobre una copia del libro)";
const FASE2 = "entrega\\evidencias_pruebas\\fase2.csv (corrida 25/09/2026 sobre una copia del libro)";
const UI =
  "entrega\\evidencias_pruebas\\recorrido_ui\\registro_ui.csv (copia pruebas\\recorrido_ui\\libro\\Recorrido_UI.xlsm; sus folios son de esa copia)";
const LIBRO = "entrega\\Cotizador_Estructuras_F1.xlsm (libro oficial), DATA_VERSIONES y DATA_SELECCIONES";

// --- Recorrido 1: cubierta ligera (Guia_Ejemplo 1; CON-00007; transporte CAD-00001 $900) ---
function cubierta(largo: string, precios: string[]): EntradaCalculo {
  return entrada({
    fechaCalculo: "2026-09-25",
    partidas: [
      partidaConcepto("P001", "CON-00007", "[DEMO] Cubierta ligera de lámina sobre largueros", [
        renglon("Faldón norte", "+", "1", largo, "4.5", null),
        renglon("Faldón sur", "+", "1", largo, "4.5", null),
        renglon("Tragaluz (se descuenta)", "-", "1", "1.2", "1", null),
      ]),
      adicional("P002", "Transporte de lámina y largueros", "Transporte", "viaje", "1", "900"),
    ],
    precios,
  });
}

// --- Recorrido 2: losa (Guia_Ejemplo 2; CON-00008; maquinaria CAD-00002 $1,500) ---
function losa(espesor: string): EntradaCalculo {
  return entrada({
    fechaCalculo: "2026-09-25",
    partidas: [
      partidaConcepto("P001", "CON-00008", "[DEMO] Losa de concreto reforzado", [
        renglon("Tablero de entrepiso", "+", "1", "6", "5", espesor),
        renglon("Volado de balcón", "+", "1", "2", "1.2", espesor),
      ]),
      adicional("P002", "Bomba para colado", "Maquinaria", "dia", "1", "1500"),
    ],
    // Sugerido en la guía: concreto del Proveedor Dos $2,090; varilla y triplay del Proveedor Uno.
    precios: ["PRE-000012", "PRE-000013", "PRE-000014"],
  });
}

// --- Recorrido 3: muro (Guia_Ejemplo 3; CON-00009; transporte CAD-00001 $700) ---
function muro(conVentana: boolean, precioBlock: string): EntradaCalculo {
  const renglones = [
    renglon("Muro eje 1", "+", "1", "6", null, "2.7"),
    renglon("Muro eje 2", "+", "1", "4.5", null, "2.7"),
    renglon("Puerta (se descuenta)", "-", "1", "0.9", null, "2.1"),
  ];
  if (conVentana) renglones.push(renglon("Ventana (se descuenta)", "-", "1", "1.5", null, "1.2"));
  return entrada({
    fechaCalculo: "2026-09-25",
    partidas: [
      partidaConcepto("P001", "CON-00009", "[DEMO] Muro de block de concreto reforzado", renglones),
      adicional("P002", "Transporte de block y mortero", "Transporte", "viaje", "1", "700"),
    ],
    precios: [precioBlock, "PRE-000017", "PRE-000013"],
  });
}

export const ESCENARIOS: Escenario[] = [
  {
    id: "GUIA-R1-LAMINA-362",
    descripcion: "Ejemplo 1 · cubierta 70.80 m²; lámina $362 (Proveedor Dos), tornillos $165 y larguero $610 (Proveedor Uno)",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «1 · cubierta, lámina $362»; pasos 3 y 4 del recorrido 1 (38 hojas, 5 cajas, 15 tramos)",
      corroboracion: [`${FASE1} · TI-304 (totales), TI-305 (compras 38/5/15; larguero 382.8510 kg), TI-306 (subcontrato 6,726.00)`],
    },
    entrada: cubierta("8", ["PRE-000007", "PRE-000008", "PRE-000009"]),
    esperado: {
      cantidad: "70.8",
      costoDirectoRedondeado: "31357.00",
      subtotal: "37628.38",
      impuestos: "6020.54",
      total: "43648.92",
      unidadesPorProducto: { "PCM-00004": "38", "PCM-00005": "5", "PCM-00006": "15" },
    },
  },
  {
    id: "GUIA-R1-LAMINA-385",
    descripcion: "Ejemplo 1 · cubierta 70.80 m²; lámina $385, tornillos $165 y larguero $610 (todo Proveedor Uno)",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «1 · cubierta, lámina $385»",
      corroboracion: [
        `${FASE1} · TI-308 (lámina 14,630.00; CD 32,231.00; total 44,865.23) y TI-309 (AV-01, menor $362)`,
        `${LIBRO} · COT-2026-00016-v1 (uso posterior al cierre; mismas selecciones y total)`,
      ],
    },
    entrada: cubierta("8", ["PRE-000006", "PRE-000008", "PRE-000009"]),
    esperado: {
      cantidad: "70.8",
      costoDirectoRedondeado: "32231.00",
      subtotal: "38676.92",
      impuestos: "6188.31",
      total: "44865.23",
    },
  },
  {
    id: "GUIA-R1-FALDONES-10M",
    descripcion: "Ejemplo 1 con faldones de 10 m: 88.80 m²; lámina $362, tornillos $165, larguero $610",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «1 · cubierta, faldones de 10 m»; paso 6 del recorrido 1 (47 hojas, 6 cajas, 19 tramos)",
      corroboracion: [
        `${FASE1} · TI-311`,
        "entrega\\evidencias_pruebas\\externas.csv · TE-09 (PDF del recorrido 1)",
        `${UI} · paso 37 (folio COT-2026-00016 de la copia)`,
      ],
    },
    entrada: cubierta("10", ["PRE-000007", "PRE-000008", "PRE-000009"]),
    esperado: {
      cantidad: "88.8",
      costoDirectoRedondeado: "38930.00",
      subtotal: "46716.10",
      impuestos: "7474.58",
      total: "54190.68",
      unidadesPorProducto: { "PCM-00004": "47", "PCM-00005": "6", "PCM-00006": "19" },
    },
  },
  {
    id: "LIBRO-COT-2026-00017-v1",
    descripcion: "Ejemplo 1 · 70.80 m² con precio alternativo de larguero $640 (Proveedor Dos); lámina $385, tornillos $165",
    origen: {
      fuente: LIBRO,
      ubicacion: "COT-2026-00017-v1, emitida el 25/09/2026 a las 18:27 (uso posterior al cierre documental)",
      corroboracion: ["BITACORA del libro oficial · BIT-0000210 (Subtotal 39217.13; total 45491.87)"],
    },
    entrada: cubierta("8", ["PRE-000006", "PRE-000008", "PRE-000010"]),
    esperado: {
      cantidad: "70.8",
      costoDirectoRedondeado: "32681.00",
      subtotal: "39217.13",
      impuestos: "6274.74",
      total: "45491.87",
    },
  },
  {
    id: "GUIA-R2-ESPESOR-010",
    descripcion: "Ejemplo 2 · losa 3.24 m³; concreto $2,090 (Proveedor Dos), varilla $168 y triplay $520 (Proveedor Uno)",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «2 · losa, concreto $2,090»; recorrido 2 (3.5 m³ de concreto, 0.9257 jornadas = $2,221.71)",
      corroboracion: [`${FASE1} · TI-313 (3.50 m³, sobrante 0.0980; 0.9257 jornadas = 2,221.71)`],
    },
    entrada: losa("0.1"),
    esperado: {
      cantidad: "3.24",
      costoDirectoRedondeado: "25508.71",
      subtotal: "30610.47",
      impuestos: "4897.68",
      total: "35508.15",
      unidadesPorProducto: { "PCM-00007": "3.5" },
    },
  },
  {
    id: "GUIA-R2-ESPESOR-012",
    descripcion: "Ejemplo 2 con espesor 0.12: 3.888 m³; mismos precios",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «2 · losa, espesor 0.12»; recorrido 2 (4.5 m³ de concreto)",
      corroboracion: [`${FASE1} · TI-314`, `${FASE2} · TI-352`, `${UI} · paso 107 (folio COT-2026-00017 de la copia)`],
    },
    entrada: losa("0.12"),
    esperado: {
      cantidad: "3.888",
      costoDirectoRedondeado: "31115.06",
      subtotal: "37338.07",
      impuestos: "5974.09",
      total: "43312.16",
      unidadesPorProducto: { "PCM-00007": "4.5" },
    },
  },
  {
    id: "GUIA-R3-BLOCK-1390",
    descripcion: "Ejemplo 3 · muro 24.66 m²; block $13.90 (Proveedor Dos), mortero $118 y varilla $168 (Proveedor Uno)",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «3 · muro, block $13.90»; recorrido 3 (324 blocks, 28 bultos, 7 tramos)",
      corroboracion: [`${FASE1} · TI-315 (324 blocks, 28 bultos, 46.4003 kg, 7 tramos)`],
    },
    entrada: muro(true, "PRE-000016"),
    esperado: {
      cantidad: "24.66",
      costoDirectoRedondeado: "14862.20",
      subtotal: "17834.69",
      impuestos: "2853.55",
      total: "20688.24",
      unidadesPorProducto: { "PCM-00010": "324", "PCM-00011": "28", "PCM-00008": "7" },
    },
  },
  {
    id: "GUIA-R3-BLOCK-1450",
    descripcion: "Ejemplo 3 · muro 24.66 m² con precio alternativo de block $14.50 (Proveedor Uno)",
    origen: { fuente: GUIA, ubicacion: "fila «3 · muro, block $14.50»", corroboracion: [`${FASE1} · TI-316`] },
    entrada: muro(true, "PRE-000015"),
    esperado: {
      cantidad: "24.66",
      costoDirectoRedondeado: "15056.60",
      subtotal: "18067.97",
      impuestos: "2890.88",
      total: "20958.85",
    },
  },
  {
    id: "GUIA-R3-SIN-VENTANA",
    descripcion: "Ejemplo 3 sin el renglón de la ventana: 26.46 m²; block $13.90, mortero $118, varilla $168",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «3 · muro sin ventana»",
      corroboracion: [`${FASE1} · TI-317`, `${UI} · paso 175 (folio COT-2026-00018 de la copia)`],
    },
    entrada: muro(false, "PRE-000016"),
    esperado: {
      cantidad: "26.46",
      costoDirectoRedondeado: "16095.80",
      subtotal: "19314.90",
      impuestos: "3090.38",
      total: "22405.28",
    },
  },
  {
    id: "GUIA-PROPIA-CON-00001",
    descripcion: "Cotización propia: CON-00001, 1 × 4.00 × 2.50 = 10 m²; PA $9.80 y PB $145 (Proveedor Uno)",
    origen: {
      fuente: GUIA,
      ubicacion: "fila «Propia · CON-00001, 4.00 × 2.50»; sección «Cotización nueva con mis propios datos»",
      corroboracion: [`${UI} · paso 245 (folio COT-2026-00019 de la copia; sin caso TI)`],
    },
    entrada: entrada({
      fechaCalculo: "2026-09-25",
      partidas: [
        partidaConcepto("P001", "CON-00001", "[DEMO] Concepto X (ilustrativo, m2)", [
          renglon("Renglón propio", "+", "1", "4", "2.5", null),
        ]),
      ],
      precios: ["PRE-000001", "PRE-000002"],
    }),
    esperado: {
      cantidad: "10",
      costoDirectoRedondeado: "3528.60",
      subtotal: "4234.30",
      impuestos: "677.49",
      total: "4911.79",
    },
  },
];
