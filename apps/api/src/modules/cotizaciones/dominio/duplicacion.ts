/**
 * Duplicar cotización (módulo 15, ADR-0019; B-35 `His_Duplicar` + `Ver_CopiarContenido` de
 * `modHistorial.bas`).
 *
 * Se copian, desde el origen elegido (captura congelada de una versión o borrador guardado):
 * partidas y mediciones (con su descripción), los textos del origen y la decisión de consolidar
 * compras. NO se copian las selecciones de precio («los precios se eligen de nuevo») ni las
 * excepciones: al omitirlas desaparecen también sus valores técnicos aplicados (un rendimiento
 * excepcional deja de aplicarse); un concepto personalizado se conserva, pero su excepción debe
 * registrarse de nuevo. Si el origen no tiene textos, la copia tampoco: no se completan con las
 * plantillas actuales. Las referencias copiadas no se sustituyen: si dejaron de estar disponibles,
 * el borrador las conserva marcadas y calcular exige resolverlas.
 */
import type { CapturaBorrador, ModoPrecios } from "@softarq/contracts";

export function capturaDuplicada(origen: CapturaBorrador): CapturaBorrador {
  return {
    consolidarCompras: origen.consolidarCompras,
    partidas: origen.partidas.map((p) =>
      p.tipo === "CONCEPTO"
        ? { ...p, mediciones: p.mediciones.map((m) => ({ ...m })) }
        : { ...p },
    ),
    seleccion: [],
    ...(origen.textos ? { textos: { ...origen.textos } } : {}),
  };
}

type Seleccion = CapturaBorrador["seleccion"];

/** Selecciones como conjunto (el orden no importa; un insumo tiene una sola selección). */
export function mismasSelecciones(a: Seleccion, b: Seleccion): boolean {
  const clave = (s: Seleccion) => s.map((x) => `${x.insumoCodigo}|${x.precioCodigo}`).sort().join(";");
  return clave(a) === clave(b);
}

/**
 * Selecciones que deja el modo de precios (B-34, `Ver_CopiarContenido`): CONSERVAR toma las de la
 * versión emitida (mismos códigos y, por ser inmutables, mismos importes); ELEGIR_DE_NUEVO las vacía.
 * Nunca se elige un precio automáticamente.
 */
export function seleccionesDelModo(modo: ModoPrecios, emitida: CapturaBorrador): Seleccion {
  return modo === "CONSERVAR" ? emitida.seleccion.map((x) => ({ ...x })) : [];
}
