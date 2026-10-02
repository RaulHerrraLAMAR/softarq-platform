/** Ayudas para armar entradas DEMO explícitas a partir del catálogo de fixtures. */
import type {
  EntradaCalculo,
  ExcepcionRendimientoCalculo,
  ParametrosCalculo,
  PartidaAdicionalEntrada,
  PartidaConceptoEntrada,
  RenglonMedicion,
  SeleccionPrecioCalculo,
} from "@softarq/contracts";
import {
  COMPONENTES,
  CONCEPTOS,
  CONVERSIONES,
  INSUMOS,
  PARAMETROS_DEMO,
  TARIFAS,
  TARIFA_DE_CONCEPTO,
  elegir,
} from "./catalogo-demo.js";

export function renglon(
  descripcion: string,
  signo: "+" | "-",
  piezas: string,
  largo: string | null,
  ancho: string | null,
  alto: string | null,
): RenglonMedicion {
  return { descripcion, signo, piezas, largo, ancho, alto };
}

export function partidaConcepto(
  id: string,
  conceptoId: keyof typeof CONCEPTOS,
  descripcion: string,
  mediciones: RenglonMedicion[],
): PartidaConceptoEntrada {
  const tarifa = TARIFAS[TARIFA_DE_CONCEPTO[conceptoId]];
  return {
    id,
    tipo: "CONCEPTO",
    descripcion,
    concepto: { ...CONCEPTOS[conceptoId] },
    mediciones,
    componentes: (COMPONENTES[conceptoId] ?? []).map((c) => ({ ...c })),
    tarifaManoObra: tarifa ? { ...tarifa } : null,
  };
}

export function adicional(
  id: string,
  descripcion: string,
  categoria: string,
  unidad: string,
  cantidad: string,
  monto: string,
): PartidaAdicionalEntrada {
  return { id, tipo: "ADICIONAL", descripcion, categoria, unidad, cantidad, monto };
}

export function entrada(opciones: {
  fechaCalculo: string;
  partidas: (PartidaConceptoEntrada | PartidaAdicionalEntrada)[];
  precios: (string | SeleccionPrecioCalculo)[];
  parametros?: Partial<ParametrosCalculo>;
  excepciones?: ExcepcionRendimientoCalculo[];
}): EntradaCalculo {
  return {
    fechaCalculo: opciones.fechaCalculo,
    parametros: { ...PARAMETROS_DEMO, ...opciones.parametros },
    insumos: Object.values(INSUMOS).map((i) => ({ ...i })),
    conversiones: CONVERSIONES.map((c) => ({ ...c })),
    partidas: opciones.partidas,
    selecciones: opciones.precios.map((p) => (typeof p === "string" ? elegir(p) : p)),
    excepciones: opciones.excepciones ?? [],
  };
}
