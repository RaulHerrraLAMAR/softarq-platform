/**
 * Formato es-MX de cantidades e importes que llegan como TEXTO decimal desde la API.
 *
 * Nunca se convierten a `number`: solo se agrupan los miles del texto recibido y se añade el
 * símbolo de la moneda que indica la respuesta. El valor mostrado es exactamente el recibido.
 */
const PATRON = /^(-?)(\d+)(?:\.(\d+))?$/;

function agruparMiles(enteros: string): string {
  return enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "88.8" → "88.8"; "12345.5" → "12,345.5". Si el texto no es decimal, se devuelve tal cual. */
export function formatearCantidad(texto: string): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", decimales] = m;
  return `${signo}${agruparMiles(enteros)}${decimales !== undefined ? `.${decimales}` : ""}`;
}

/**
 * "54190.68" con moneda "MXN" → "$54,190.68". El símbolo y su posición salen de
 * `Intl.NumberFormat("es-MX")` aplicado a cero, no del valor.
 */
export function formatearImporte(texto: string, moneda: string): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", decimales] = m;
  const cuerpo = `${agruparMiles(enteros)}${decimales !== undefined ? `.${decimales}` : ""}`;
  const partes = new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).formatToParts(0);
  const iSimbolo = partes.findIndex((p) => p.type === "currency");
  const iNumero = partes.findIndex((p) => p.type === "integer");
  const simbolo = partes[iSimbolo]?.value ?? moneda;
  const conMoneda = iSimbolo !== -1 && iSimbolo > iNumero ? `${cuerpo} ${simbolo}` : `${simbolo}${cuerpo}`;
  return `${signo}${conMoneda}`;
}

/** "0.16" → "16 %" sin aritmética de punto flotante (desplaza el punto decimal dos lugares). */
export function formatearTasa(texto: string): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", decimales = ""] = m;
  const digitos = `${enteros}${decimales.padEnd(2, "0")}`;
  const corte = enteros.length + 2;
  const entero = digitos.slice(0, corte).replace(/^0+(?=\d)/, "");
  const resto = digitos.slice(corte).replace(/0+$/, "");
  return `${signo}${entero}${resto ? `.${resto}` : ""} %`;
}

/** "2026-09-25" → "25/09/2026" (sin crear objetos Date ni depender de la zona horaria). */
export function formatearFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
