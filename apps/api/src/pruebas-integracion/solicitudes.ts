/** Traduce una entrada de fixture del motor a la captura HTTP (`SolicitudCalculoDemo`). */
import type { EntradaCalculo, SolicitudCalculoDemo } from "@softarq/contracts";

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
