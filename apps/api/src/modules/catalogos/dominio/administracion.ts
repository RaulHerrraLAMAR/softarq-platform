/**
 * Reglas puras de la administración de catálogos (módulo 11, ADR-0015). Sin base de datos ni HTTP.
 * PostgreSQL vuelve a imponer las mismas reglas (funciones, índices y disparadores): aquí solo se
 * dan mensajes claros antes de escribir y se derivan estados para mostrarlos.
 */
import type { EstadoPrecio, FechaISO } from "@softarq/contracts";

const ACENTOS_MAYUSCULAS = "ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛ";
const ACENTOS_MINUSCULAS = "áéíóúüñàèìòùâêîôû";
const ORIGEN = `${ACENTOS_MINUSCULAS}.,;:-_'"`;
const DESTINO = "aeiouunaeiouaeiou        ";

/**
 * `Normalizar` del libro (modApp.bas), idéntica a `softarq_normalizar` de la migración: minúsculas,
 * sin acentos, la puntuación . , ; : - _ ' " convertida en espacio y espacios simples. Sirve para
 * detectar duplicados de proveedores y productos (`Cat_Duplicado`).
 */
export function normalizar(texto: string): string {
  let s = "";
  for (const c of texto.trim()) {
    const i = ACENTOS_MAYUSCULAS.indexOf(c);
    s += i >= 0 ? ACENTOS_MINUSCULAS[i] : c;
  }
  s = s.toLowerCase();
  let r = "";
  for (const c of s) {
    const i = ORIGEN.indexOf(c);
    r += i >= 0 ? DESTINO[i] : c;
  }
  return r.replace(/ {2,}/g, " ").trim();
}

/** Estado de un precio a la fecha de negocio del servidor (vigencias inclusivas, CR-07). */
export function estadoPrecio(p: { anulado: boolean; vigenteDesde: FechaISO; vigenteHasta: FechaISO }, hoy: FechaISO): EstadoPrecio {
  if (p.anulado) return "ANULADO";
  if (hoy < p.vigenteDesde) return "FUTURO";
  if (hoy > p.vigenteHasta) return "VENCIDO";
  return "VIGENTE";
}

/** Una tarifa es utilizable hoy si está activa y vigente (BL-10). */
export function tarifaVigente(t: { vigenteDesde: FechaISO; vigenteHasta: FechaISO }, hoy: FechaISO): boolean {
  return t.vigenteDesde <= hoy && hoy <= t.vigenteHasta;
}

/**
 * Comprobación previa del cierre de vigencia (adaptación autorizada; P3 pendiente con el cliente).
 * Devuelve el motivo del rechazo o `null`. La función de la base lo vuelve a comprobar.
 */
export function motivoCierreInvalido(
  actual: { anulado: boolean; vigenteDesde: FechaISO; vigenteHasta: FechaISO },
  nuevaHasta: FechaISO,
  sucesorDesde: FechaISO,
  hoy: FechaISO,
): string | null {
  if (actual.anulado) return "El precio está anulado.";
  if (nuevaHasta < hoy) return `La nueva fecha final no puede ser anterior a hoy (${hoy}); no se cierra retroactivamente.`;
  if (nuevaHasta < actual.vigenteDesde) return `La nueva fecha final no puede ser anterior al inicio de la vigencia (${actual.vigenteDesde}).`;
  if (nuevaHasta >= actual.vigenteHasta) return `La vigencia solo puede acortarse: la fecha final actual es ${actual.vigenteHasta}.`;
  if (sucesorDesde <= nuevaHasta) return "El sucesor debe empezar después del último día del precio que se cierra.";
  return null;
}

/** Día siguiente de una fecha AAAA-MM-DD (sin zona horaria). */
export function diaSiguiente(fecha: FechaISO): FechaISO {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
