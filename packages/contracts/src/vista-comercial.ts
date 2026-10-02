/**
 * Vista comercial de una cotización calculada (D-16, Word maestro §3.13).
 *
 * Es lo único del cálculo que pueden recibir los clientes web y móvil.
 * Nunca contiene costos directos, de compra, de mano de obra o por partida; proveedores,
 * precios de proveedor, productos, presentaciones ni unidades compradas; consumos,
 * rendimientos, desperdicios ni sobrantes; recargo, margen ni excepciones.
 *
 * Definición única: `EsquemaCotizacionComercial` (api/esquemas.ts).
 */
import type { z } from "zod";
import type { EsquemaCotizacionComercial } from "./api/esquemas.js";

/** Marca obligatoria de toda salida en ambiente DEMO (Word maestro §3.13). */
export const LEYENDA_DEMO = "DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL";

export type CotizacionComercial = z.infer<typeof EsquemaCotizacionComercial>;
export type PartidaComercial = CotizacionComercial["partidas"][number];
