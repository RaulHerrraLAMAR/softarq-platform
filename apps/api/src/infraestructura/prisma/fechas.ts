/**
 * Fechas de calendario (columnas DATE) sin desplazamientos por zona horaria.
 *
 * Prisma representa DATE como `Date` a las 00:00 UTC. Se escribe y se lee siempre en UTC,
 * de modo que el resultado no depende de la zona horaria del proceso ni del servidor
 * (el servidor local usa America/Mexico_City).
 */
import type { FechaISO } from "@softarq/contracts";
import { PATRON_FECHA_ISO } from "@softarq/contracts";

export function fechaParaColumna(fecha: FechaISO, campo: string): Date {
  if (!PATRON_FECHA_ISO.test(fecha)) throw new Error(`${campo}: fecha inválida (${fecha}); use AAAA-MM-DD.`);
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const valor = new Date(Date.UTC(a, m - 1, d));
  if (valor.getUTCFullYear() !== a || valor.getUTCMonth() !== m - 1 || valor.getUTCDate() !== d) {
    throw new Error(`${campo}: fecha inexistente (${fecha}).`);
  }
  return valor;
}

export function fechaDeColumna(valor: Date): FechaISO {
  return valor.toISOString().slice(0, 10);
}
