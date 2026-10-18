/**
 * Textos comerciales de la versión (alcance, condiciones y exclusiones; BL-20) — módulo 8,
 * ADR-0010. Funciones puras.
 *
 * Fuente: en el libro son campos de cada versión (`Ver_Crear` copia `TEXTO_ALCANCE`,
 * `TEXTO_CONDICIONES` y `TEXTO_EXCLUSIONES` de 17 CONFIG; con AMBIENTE = DEMO, los `DEMO_TEXTO_*` de
 * `modBuild.bas`). Aquí se COPIAN a la captura al crear la cotización; nunca son una referencia
 * dinámica. Desde el módulo 13 (ADR-0017) son plantillas editables de la configuración de cada
 * organización (`parametros_calculo.texto_*`); `TEXTOS_DEMO` es su valor inicial en DEMO (los del
 * libro con los acentos restaurados; ilustrativos y con la marca [DEMO]).
 */
import type { CapturaBorrador, TextosCotizacion } from "@softarq/contracts";
import type { Problema } from "./verificacion.js";

export const TEXTOS_DEMO: TextosCotizacion = Object.freeze({
  alcance:
    "[DEMO] Texto ilustrativo de alcance: ejecución de los conceptos listados según las mediciones indicadas en esta cotización.",
  condiciones:
    "[DEMO] Condiciones ilustrativas: precios en MXN, vigentes hasta la fecha indicada; sujetos a la aceptación del cliente.",
  exclusiones: "[DEMO] Exclusiones ilustrativas: cálculo estructural, planos, permisos y cualquier concepto no listado.",
});

/** Plantillas de la organización (copia); `null` si no hay (en PRODUCCION, TEXTO_* sigue PENDIENTE). */
export function textosPredeterminados(plantilla: TextosCotizacion | null): TextosCotizacion | null {
  return plantilla ? { ...plantilla } : null;
}

/** Captura con los textos predeterminados copiados, solo si aún no trae textos. */
export function conTextosIniciales(captura: CapturaBorrador, predeterminados: TextosCotizacion | null): CapturaBorrador {
  if (captura.textos || !predeterminados) return captura;
  return { ...captura, textos: { ...predeterminados } };
}

const CAMPOS: readonly { clave: keyof TextosCotizacion; nombre: string }[] = [
  { clave: "alcance", nombre: "alcance" },
  { clave: "condiciones", nombre: "condiciones" },
  { clave: "exclusiones", nombre: "exclusiones" },
];

/**
 * BL-20: alcance, condiciones o exclusiones vacíos. `referencia` identifica la versión (o el
 * borrador). Una versión anterior sin textos se informa igual: hace falta una versión nueva.
 */
export function bl20(captura: CapturaBorrador, referencia: string): Problema[] {
  const t = captura.textos;
  const vacios = CAMPOS.filter((c) => !t || t[c.clave].trim() === "").map((c) => c.nombre);
  if (vacios.length === 0) return [];
  const mensaje = t
    ? `Complete los textos de la versión: ${vacios.join(", ")}.`
    : "Esta versión no tiene textos de alcance, condiciones y exclusiones. Complételos en el borrador y genere una versión nueva.";
  return [{ codigo: "BL-20", referencia, mensaje }];
}
