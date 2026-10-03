/** Traduce una entrada de fixture del motor a la captura HTTP (`SolicitudCalculoDemo`). */
import type { CapturaBorrador, EntradaCalculo, SolicitudCalculoDemo } from "@softarq/contracts";

/** Tipos de costo adicional del catálogo DEMO por categoría (CAD-00001 a CAD-00003). */
export const TIPO_ADICIONAL_POR_CATEGORIA: Record<string, string> = {
  Transporte: "CAD-00001",
  Maquinaria: "CAD-00002",
  Otro: "CAD-00003",
};

export function solicitudDemoDesdeEntrada(e: EntradaCalculo): SolicitudCalculoDemo {
  return {
    consolidarCompras: e.parametros.consolidarCompras,
    partidas: e.partidas.map((p) =>
      p.tipo === "CONCEPTO"
        ? {
            id: p.id,
            tipo: "CONCEPTO" as const,
            conceptoCodigo: p.concepto.id,
            descripcion: p.descripcion,
            mediciones: p.mediciones.map((m) => ({ ...m })),
          }
        : {
            id: p.id,
            tipo: "ADICIONAL" as const,
            tipoAdicionalCodigo: TIPO_ADICIONAL_POR_CATEGORIA[p.categoria]!,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            monto: p.monto,
          },
    ),
    preciosElegidos: e.selecciones.map((s) => s.precioId),
  };
}

/**
 * Traduce una entrada de fixture del motor a un borrador de cotización (módulo 6): los mismos
 * códigos, medidas y precios elegidos, con la selección por insumo.
 */
export function borradorDesdeEntrada(e: EntradaCalculo): CapturaBorrador {
  return {
    consolidarCompras: e.parametros.consolidarCompras,
    partidas: e.partidas.map((p) =>
      p.tipo === "CONCEPTO"
        ? {
            tipo: "CONCEPTO" as const,
            conceptoCodigo: p.concepto.id,
            descripcion: p.descripcion,
            mediciones: p.mediciones.map((m) => ({
              descripcion: m.descripcion,
              signo: m.signo,
              piezas: m.piezas,
              largo: m.largo,
              ancho: m.ancho,
              alto: m.alto,
              segundaMedida: m.alto !== null && m.ancho === null ? ("alto" as const) : ("ancho" as const),
            })),
          }
        : {
            tipo: "ADICIONAL" as const,
            tipoAdicionalCodigo: TIPO_ADICIONAL_POR_CATEGORIA[p.categoria]!,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            monto: p.monto,
          },
    ),
    seleccion: e.selecciones.map((s) => ({ insumoCodigo: s.insumoId, precioCodigo: s.precioId })),
  };
}
