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

/**
 * Recorta un decimal de texto a `decimales` posiciones SIN redondear ("343.99447" → "343.9944").
 * Solo para mostrar (Word maestro §3.14: el prorrateo se muestra con cuatro decimales truncados;
 * el valor completo no cambia). Sin `number`.
 */
export function truncarDecimales(texto: string, decimales: number): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", fraccion = ""] = m;
  const corte = fraccion.slice(0, decimales).padEnd(decimales, "0");
  const cero = /^0*$/.test(enteros) && /^0*$/.test(corte);
  return `${cero ? "" : signo}${enteros}${decimales > 0 ? `.${corte}` : ""}`;
}

/**
 * Redondea un decimal de texto a `decimales` posiciones, mitad hacia arriba y simétrico en
 * negativos (CR-15), con aritmética de dígitos sobre el texto (sin `number`). Solo para mostrar:
 * el valor de la API conserva su precisión completa.
 */
export function redondearDecimales(texto: string, decimales: number): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", fraccion = ""] = m;
  const digitos = `${enteros}${fraccion.padEnd(decimales, "0").slice(0, decimales)}`.split("").map((d) => d.charCodeAt(0) - 48);
  if ((fraccion.charCodeAt(decimales) || 48) - 48 >= 5) {
    let i = digitos.length - 1;
    while (i >= 0 && digitos[i] === 9) digitos[i--] = 0;
    if (i >= 0) digitos[i]! += 1;
    else digitos.unshift(1);
  }
  const todos = digitos.join("");
  const ent = todos.slice(0, todos.length - decimales).replace(/^0+(?=\d)/, "") || "0";
  const frac = todos.slice(todos.length - decimales);
  const cero = /^0*$/.test(todos);
  return `${cero ? "" : signo}${ent}${decimales > 0 ? `.${frac}` : ""}`;
}

/** "2026-09-25" → "25/09/2026" (sin crear objetos Date ni depender de la zona horaria). */
export function formatearFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const FORMATO_INSTANTE = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Instante ISO 8601 → «03/10/2026, 14:05» en la hora del centro de México (zona de los folios). */
export function formatearInstante(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FORMATO_INSTANTE.format(d);
}
