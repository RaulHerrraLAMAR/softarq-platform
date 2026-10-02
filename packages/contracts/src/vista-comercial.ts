/**
 * Vista comercial de una cotización calculada (D-16, Word maestro §3.13).
 *
 * Es lo único del cálculo que pueden recibir los clientes web y móvil.
 * Nunca contiene costos directos, de compra, de mano de obra o por partida; proveedores,
 * precios de proveedor, productos, presentaciones ni unidades compradas; consumos,
 * rendimientos, desperdicios ni sobrantes; recargo, margen ni excepciones.
 */
import type { DecimalTexto } from "./decimal.js";
import type { Ambiente, Moneda } from "./calculo.js";

/** Marca obligatoria de toda salida en ambiente DEMO (Word maestro §3.13). */
export const LEYENDA_DEMO = "DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL";

export interface PartidaComercial {
  numero: number;
  descripcion: string;
  unidad: string;
  cantidad: DecimalTexto;
  precioUnitario: DecimalTexto;
  importe: DecimalTexto;
}

export interface CotizacionComercial {
  ambiente: Ambiente;
  moneda: Moneda;
  /** `LEYENDA_DEMO` en ambiente DEMO; `null` en PRODUCCION. */
  leyenda: string | null;
  partidas: PartidaComercial[];
  subtotal: DecimalTexto;
  impuesto: {
    nombre: string;
    tasa: DecimalTexto;
    importe: DecimalTexto;
  };
  total: DecimalTexto;
}
