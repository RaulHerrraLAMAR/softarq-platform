/**
 * Formato es-MX de cantidades e importes que llegan como TEXTO decimal desde la API (mismo criterio que
 * `apps/web/src/comunes/formato.ts`): nunca se convierten a `number`; solo se agrupan los miles del texto
 * recibido. El valor mostrado es exactamente el recibido.
 */
const PATRON = /^(-?)(\d+)(?:\.(\d+))?$/;

const agruparMiles = (enteros: string): string => enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "88.8" → "88.8"; "12345.5" → "12,345.5". Si el texto no es decimal, se devuelve tal cual. */
export function formatearCantidad(texto: string): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", decimales] = m;
  return `${signo}${agruparMiles(enteros)}${decimales !== undefined ? `.${decimales}` : ""}`;
}

/** "54190.68" con moneda "MXN" → "$54,190.68" (MXN es la única moneda: D-18). */
export function formatearImporte(texto: string, moneda: string = "MXN"): string {
  const m = PATRON.exec(texto);
  if (!m) return texto;
  const [, signo = "", enteros = "", decimales] = m;
  const cuerpo = `${agruparMiles(enteros)}${decimales !== undefined ? `.${decimales}` : ""}`;
  return `${signo}${moneda === "MXN" ? "$" : `${moneda} `}${cuerpo}`;
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

const dos = (n: number): string => String(n).padStart(2, "0");

/** "2026-09-25" → "25/09/2026" (sin pasar por Date: una fecha de negocio no cambia con la zona horaria). */
export function formatearFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Instante ISO → «25/09/2026 14:30», en la hora local del teléfono. */
export function formatearInstante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
