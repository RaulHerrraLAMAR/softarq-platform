/**
 * Textos legibles de los estados que ve el cliente (nunca códigos crudos). Una prueba obliga a que cada estado del
 * contrato tenga su texto.
 */
import type { EstadoSolicitud } from "@softarq/contracts/cliente";
import type { Tono } from "./paletas";

export const ESTADOS: Record<EstadoSolicitud, { texto: string; tono: Tono; explicacion: string }> = {
  BORRADOR: { texto: "Borrador", tono: "aviso", explicacion: "Todavía puedes cambiar lo que quieras. Nadie del equipo la ve hasta que la envíes." },
  ENVIADA: { texto: "Enviada", tono: "info", explicacion: "El equipo recibió tu solicitud. En breve la revisará y preparará tu cotización." },
  EN_PREPARACION: { texto: "En preparación", tono: "info", explicacion: "El equipo está preparando tu cotización formal." },
  COTIZADA: { texto: "Cotización lista", tono: "correcto", explicacion: "Tu cotización formal ya está emitida. Puedes revisarla y descargar el PDF." },
  RETIRADA: { texto: "Retirada", tono: "neutro", explicacion: "Retiraste esta solicitud. Ya no la atiende el equipo." },
};

export const etiquetaEstado = (e: EstadoSolicitud): string => ESTADOS[e].texto;

/** Pasos del seguimiento, en orden, para mostrar dónde va la solicitud. */
export const PASOS_SEGUIMIENTO: readonly { estado: EstadoSolicitud; texto: string }[] = [
  { estado: "BORRADOR", texto: "Borrador" },
  { estado: "ENVIADA", texto: "Enviada" },
  { estado: "EN_PREPARACION", texto: "En preparación" },
  { estado: "COTIZADA", texto: "Cotización lista" },
];
