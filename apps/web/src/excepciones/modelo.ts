/**
 * Excepciones B-22 en la captura de una cotización (módulo 10, ADR-0014). Funciones puras.
 *
 * Única carpeta de la web donde aparecen los términos técnicos «rendimiento» y «desperdicio»
 * (prueba `sin-datos-internos`): forman parte del contrato interno de excepciones, con su capacidad
 * propia. Los demás datos internos del cálculo siguen prohibidos también en esta carpeta.
 *
 * - La partida se identifica con la clave local de la captura; al guardar se convierte en su
 *   número (posición 1…n), que es como la cita el servidor.
 * - Al quitar una partida, o dejar de elegir un precio, se quitan las excepciones que la citan
 *   (como `Partida_Quitar` del libro): una excepción huérfana no tiene sentido y el servidor la rechaza.
 * - La web no decide si una excepción es válida ni si está autorizada: lo hace la API.
 */
import type { CampoExcepcion, ExcepcionBorrador, ExcepcionCalculo, TipoExcepcion } from "@softarq/contracts";

export type ExcepcionCaptura =
  | {
      clave: string;
      tipo: "RENDIMIENTO";
      partidaClave: string;
      conceptoCodigo: string;
      componenteCodigo: string;
      campo: CampoExcepcion;
      valorAplicado: string;
      motivo: string;
    }
  | { clave: string; tipo: "PRECIO_VENCIDO"; insumoCodigo: string; precioCodigo: string; motivo: string }
  | { clave: string; tipo: "CONCEPTO_PERSONALIZADO"; conceptoCodigo: string; motivo: string };

/** Lo mínimo de una partida que estas funciones necesitan (evita depender del estado completo). */
export interface PartidaReferida {
  clave: string;
  tipo: "CONCEPTO" | "ADICIONAL";
  conceptoCodigo?: string;
}

export const NOMBRE_TIPO: Record<TipoExcepcion, string> = {
  RENDIMIENTO: "Rendimiento o desperdicio de un componente",
  PRECIO_VENCIDO: "Precio vencido",
  CONCEPTO_PERSONALIZADO: "Concepto personalizado",
};

export const EXPLICACION_TIPO: Record<TipoExcepcion, string> = {
  RENDIMIENTO:
    "Cambia el rendimiento o el desperdicio de un componente solo en esta cotización. El catálogo no cambia y el cálculo usa el valor indicado.",
  PRECIO_VENCIDO:
    "Permite emitir con un precio elegido que ya no está vigente. Sin esta excepción autorizada, el precio vencido bloquea (BL-09).",
  CONCEPTO_PERSONALIZADO:
    "Permite usar un concepto personalizado que no está aprobado en el catálogo. Sin esta excepción autorizada, bloquea (BL-04).",
};

export const NOMBRE_CAMPO: Record<CampoExcepcion, string> = { RENDIMIENTO: "Rendimiento", DESPERDICIO: "Desperdicio" };

const numeroDePartida = (partidas: readonly PartidaReferida[], clave: string) => partidas.findIndex((p) => p.clave === clave) + 1;

/** Excepciones de la captura en el formato del borrador (partida por número). */
export function aBorrador(lista: readonly ExcepcionCaptura[], partidas: readonly PartidaReferida[]): ExcepcionBorrador[] {
  return lista.flatMap((x): ExcepcionBorrador[] => {
    switch (x.tipo) {
      case "RENDIMIENTO": {
        const partida = numeroDePartida(partidas, x.partidaClave);
        if (partida === 0) return [];
        const { clave: _, partidaClave: __, ...resto } = x;
        return [{ ...resto, partida, valorAplicado: x.valorAplicado.trim(), motivo: x.motivo.trim() }];
      }
      case "PRECIO_VENCIDO":
        return [{ tipo: x.tipo, insumoCodigo: x.insumoCodigo, precioCodigo: x.precioCodigo, motivo: x.motivo.trim() }];
      case "CONCEPTO_PERSONALIZADO":
        return [{ tipo: x.tipo, conceptoCodigo: x.conceptoCodigo, motivo: x.motivo.trim() }];
    }
  });
}

/** Excepciones del borrador guardado → captura (la partida N pasa a su clave local). */
export function desdeBorrador(lista: readonly ExcepcionBorrador[], partidas: readonly PartidaReferida[], clave: () => string): ExcepcionCaptura[] {
  return lista.map((x): ExcepcionCaptura => {
    if (x.tipo === "RENDIMIENTO") {
      const { partida, ...resto } = x;
      // Si el número no existe, la clave vacía la deja visible como huérfana: el servidor la rechazará.
      return { ...resto, clave: clave(), partidaClave: partidas[partida - 1]?.clave ?? "" };
    }
    return { ...x, clave: clave() };
  });
}

/** Excepciones que afectan al cálculo de la vista previa (mismos ids que el servidor: EXC-n, P00n). */
export function paraCalculo(lista: readonly ExcepcionCaptura[], partidas: readonly PartidaReferida[]): ExcepcionCalculo[] {
  return lista.flatMap((x, i): ExcepcionCalculo[] => {
    const id = `EXC-${i + 1}`;
    if (x.tipo === "RENDIMIENTO") {
      const n = numeroDePartida(partidas, x.partidaClave);
      if (n === 0) return [];
      return [{ tipo: "RENDIMIENTO", id, partidaId: `P${String(n).padStart(3, "0")}`, componenteCodigo: x.componenteCodigo, campo: x.campo, valorAplicado: x.valorAplicado.trim() }];
    }
    if (x.tipo === "CONCEPTO_PERSONALIZADO") return [{ tipo: "CONCEPTO_PERSONALIZADO", id, conceptoCodigo: x.conceptoCodigo }];
    return [];
  });
}

/**
 * Quita las excepciones que ya no citan nada de la captura: partida quitada, precio que dejó de estar
 * elegido para ese insumo o concepto personalizado que ya no usa ninguna partida.
 */
export function depurar(
  lista: readonly ExcepcionCaptura[],
  partidas: readonly PartidaReferida[],
  seleccion: Readonly<Record<string, string>>,
): ExcepcionCaptura[] {
  const claves = new Set(partidas.map((p) => p.clave));
  const conceptos = new Set(partidas.flatMap((p) => (p.tipo === "CONCEPTO" && p.conceptoCodigo ? [p.conceptoCodigo] : [])));
  return lista.filter((x) => {
    if (x.tipo === "RENDIMIENTO") return claves.has(x.partidaClave);
    if (x.tipo === "PRECIO_VENCIDO") return seleccion[x.insumoCodigo] === x.precioCodigo;
    return conceptos.has(x.conceptoCodigo);
  });
}

/** Texto breve de lo que se exceptúa (para listas y confirmaciones). */
export function describir(x: ExcepcionCaptura, partidas: readonly PartidaReferida[]): string {
  switch (x.tipo) {
    case "RENDIMIENTO":
      return `${NOMBRE_CAMPO[x.campo]} del componente ${x.componenteCodigo} en la partida ${numeroDePartida(partidas, x.partidaClave) || "?"} (${x.conceptoCodigo}): ${x.valorAplicado}`;
    case "PRECIO_VENCIDO":
      return `Precio ${x.precioCodigo} del insumo ${x.insumoCodigo}`;
    case "CONCEPTO_PERSONALIZADO":
      return `Concepto ${x.conceptoCodigo}`;
  }
}

/** Mismo criterio de duplicado que el servidor (`Exc_Registrar`): tipo, referencia, partida y campo. */
export function claveDuplicado(x: ExcepcionCaptura): string {
  switch (x.tipo) {
    case "RENDIMIENTO":
      return `R|${x.partidaClave}|${x.componenteCodigo}|${x.campo}`;
    case "PRECIO_VENCIDO":
      return `P|${x.precioCodigo}`;
    case "CONCEPTO_PERSONALIZADO":
      return `C|${x.conceptoCodigo}`;
  }
}
