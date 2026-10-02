/**
 * Escenarios principales verificados (DEMO), como ENTRADAS públicas de la API.
 *
 * Son copia de `docs/api/ejemplos/*.json` (una prueba exige que coincidan). No contienen totales,
 * precios ni importes: el resultado solo aparece al calcular con la API.
 */
import type { SolicitudCalculoDemo } from "@softarq/contracts";

export interface Ejemplo {
  id: string;
  titulo: string;
  resumen: string;
  /** Archivo de `docs/api/ejemplos` del que procede. */
  archivo: string;
  solicitud: SolicitudCalculoDemo;
}

export const EJEMPLOS: readonly Ejemplo[] = [
  {
    id: "r1",
    titulo: "Ejemplo 1 · Cubierta con faldones de 10 m",
    resumen: "Cubierta ligera de lámina sobre largueros: dos faldones de 10 m × 4.5 m, se descuenta un tragaluz; transporte.",
    archivo: "calculo-r1-faldones-10m.json",
    solicitud: {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00007",
          descripcion: "[DEMO] Cubierta ligera de lámina sobre largueros",
          mediciones: [
            { descripcion: "Faldón norte", signo: "+", piezas: "1", largo: "10", ancho: "4.5", alto: null },
            { descripcion: "Faldón sur", signo: "+", piezas: "1", largo: "10", ancho: "4.5", alto: null },
            { descripcion: "Tragaluz (se descuenta)", signo: "-", piezas: "1", largo: "1.2", ancho: "1", alto: null },
          ],
        },
        { id: "P002", tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001", descripcion: "Transporte de lámina y largueros", cantidad: "1", monto: "900" },
      ],
      preciosElegidos: ["PRE-000007", "PRE-000008", "PRE-000009"],
    },
  },
  {
    id: "r2",
    titulo: "Ejemplo 2 · Losa con espesor de 0.12 m",
    resumen: "Losa de concreto reforzado: tablero de 6 m × 5 m y volado de 2 m × 1.2 m, espesor 0.12 m; bomba para colado.",
    archivo: "calculo-r2-espesor-012.json",
    solicitud: {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00008",
          descripcion: "[DEMO] Losa de concreto reforzado",
          mediciones: [
            { descripcion: "Tablero de entrepiso", signo: "+", piezas: "1", largo: "6", ancho: "5", alto: "0.12" },
            { descripcion: "Volado de balcón", signo: "+", piezas: "1", largo: "2", ancho: "1.2", alto: "0.12" },
          ],
        },
        { id: "P002", tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00002", descripcion: "Bomba para colado", cantidad: "1", monto: "1500" },
      ],
      preciosElegidos: ["PRE-000012", "PRE-000013", "PRE-000014"],
    },
  },
  {
    id: "r3",
    titulo: "Ejemplo 3 · Muro sin la ventana",
    resumen: "Muro de block de concreto: ejes de 6 m y 4.5 m con 2.7 m de alto, se descuenta una puerta; transporte.",
    archivo: "calculo-r3-sin-ventana.json",
    solicitud: {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00009",
          descripcion: "[DEMO] Muro de block de concreto reforzado",
          mediciones: [
            { descripcion: "Muro eje 1", signo: "+", piezas: "1", largo: "6", ancho: null, alto: "2.7" },
            { descripcion: "Muro eje 2", signo: "+", piezas: "1", largo: "4.5", ancho: null, alto: "2.7" },
            { descripcion: "Puerta (se descuenta)", signo: "-", piezas: "1", largo: "0.9", ancho: null, alto: "2.1" },
          ],
        },
        { id: "P002", tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001", descripcion: "Transporte de block y mortero", cantidad: "1", monto: "700" },
      ],
      preciosElegidos: ["PRE-000016", "PRE-000017", "PRE-000013"],
    },
  },
  {
    id: "propia",
    titulo: "Cotización propia de referencia · CON-00001",
    resumen: "Concepto X ilustrativo: un renglón de 4 m × 2.5 m, sin costos adicionales.",
    archivo: "calculo-propia-con-00001.json",
    solicitud: {
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00001",
          descripcion: "[DEMO] Concepto X (ilustrativo, m2)",
          mediciones: [{ descripcion: "Renglón propio", signo: "+", piezas: "1", largo: "4", ancho: "2.5", alto: null }],
        },
      ],
      preciosElegidos: ["PRE-000001", "PRE-000002"],
    },
  },
];
