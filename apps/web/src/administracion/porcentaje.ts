/**
 * Porcentajes de los parámetros (módulo 13, ADR-0017). El libro guarda fracciones (PCT, 0..1: 0.2 =
 * 20 %); la pantalla captura en % y muestra la fracción guardada. La conversión es de texto a texto
 * (desplazar la coma dos lugares), sin pasar por `number`, para no redondear nada.
 */

/** Hasta 4 decimales en % = hasta 6 decimales en la fracción (NUMERIC 7,6). */
const PATRON_PORCENTAJE = /^(\d{1,3})(?:\.(\d{1,4}))?$/;

/** "20" → "0.2"; "12.5" → "0.125"; "100" → "1". `null` si no es un porcentaje válido entre 0 y 100. */
export function fraccionDePorcentaje(texto: string): string | null {
  const m = PATRON_PORCENTAJE.exec(texto.trim());
  if (!m) return null;
  const entero = m[1]!.replace(/^0+(?=\d)/, "");
  const decimales = m[2] ?? "";
  if (Number(entero) > 100 || (entero === "100" && /[1-9]/.test(decimales))) return null;
  // Dividir entre 100: los dos últimos dígitos enteros pasan a la parte decimal.
  const relleno = entero.padStart(3, "0");
  const enteroFraccion = relleno.slice(0, -2).replace(/^0+(?=\d)/, "");
  const resto = `${relleno.slice(-2)}${decimales}`.replace(/0+$/, "");
  return resto ? `${enteroFraccion}.${resto}` : enteroFraccion;
}

/** "0.2" → "20"; "0.125" → "12.5"; "1" → "100". Texto sin cambios si no es una fracción. */
export function porcentajeDeFraccion(fraccion: string): string {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(fraccion);
  if (!m) return fraccion;
  const digitos = `${m[1]}${(m[2] ?? "").padEnd(2, "0")}`;
  const corte = m[1]!.length + 2;
  const entero = digitos.slice(0, corte).replace(/^0+(?=\d)/, "");
  const resto = digitos.slice(corte).replace(/0+$/, "");
  return resto ? `${entero}.${resto}` : entero;
}
