/**
 * Proyección comercial del resultado (D-16, Word maestro §3.13): lo único que pueden
 * recibir los clientes web y móvil. Se construye campo por campo (lista blanca), nunca
 * copiando el resultado interno, para no filtrar costos por accidente.
 */
import { LEYENDA_DEMO, type CotizacionComercial, type ResultadoCalculado } from "@softarq/contracts";

export function aVistaComercial(r: ResultadoCalculado): CotizacionComercial {
  return {
    ambiente: r.parametros.ambiente,
    moneda: r.parametros.moneda,
    leyenda: r.parametros.ambiente === "DEMO" ? LEYENDA_DEMO : null,
    partidas: r.partidas.map((p, i) => ({
      numero: i + 1,
      descripcion: p.descripcion,
      unidad: p.unidad,
      cantidad: p.cantidad,
      precioUnitario: p.precioUnitarioVenta,
      importe: p.importe,
    })),
    subtotal: r.totales.subtotal,
    impuesto: {
      nombre: r.parametros.impuesto.nombre,
      tasa: r.parametros.impuesto.tasa,
      importe: r.totales.impuestos,
    },
    total: r.totales.total,
  };
}
