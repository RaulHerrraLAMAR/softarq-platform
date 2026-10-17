/** Fechas de negocio AAAA-MM-DD sin zona horaria (vigencias inclusivas, módulo 11). */

/** Día siguiente de una fecha AAAA-MM-DD; si no es una fecha, devuelve el texto tal cual. */
export function diaSiguiente(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** La mayor de dos fechas AAAA-MM-DD (comparación de texto, válida en ese formato). */
export function maxima(a: string, b: string): string {
  return a >= b ? a : b;
}
