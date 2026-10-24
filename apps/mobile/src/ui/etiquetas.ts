/**
 * Términos y estados de la web, para consulta (`apps/web/src/cotizaciones/{componentes,revisiones}.tsx`).
 * Solo texto: la app no decide estados; los deriva el servidor.
 */
import type { EventoRevision, ResumenCambios, ResumenVersion } from "@softarq/contracts/movil";

export type Tono = "neutro" | "info" | "correcto" | "aviso" | "demo" | "error";

export interface EtiquetaEstado {
  readonly texto: string;
  readonly tono: Tono;
}

/** Estado de una versión con su motivo (derivado por el servidor de su última revisión). */
export function estadoDeVersion(v: Pick<ResumenVersion, "estado" | "revisionVigente">): EtiquetaEstado {
  const r = v.revisionVigente;
  if (v.estado === "EMITIDA") return { texto: "Emitida", tono: "correcto" };
  if (v.estado === "SUSTITUIDA") return { texto: "Emitida · sustituida por una posterior", tono: "neutro" };
  if (v.estado === "EN_REVISION") return { texto: "En revisión", tono: "info" };
  if (r?.estado === "APROBADA" && r.anulacion) return { texto: "Borrador · aprobación anulada", tono: "aviso" };
  if (v.estado === "APROBADA") return { texto: `Aprobada${r?.resueltaPor ? ` por ${r.resueltaPor}` : ""}`, tono: "correcto" };
  if (r?.estado === "CAMBIOS_SOLICITADOS") return { texto: "Borrador · cambios solicitados", tono: "aviso" };
  if (r?.estado === "RETIRADA") return { texto: "Borrador · revisión retirada", tono: "neutro" };
  return { texto: "Borrador calculado · sin enviar a revisión", tono: "neutro" };
}

export const NOMBRE_EVENTO_REVISION: Record<EventoRevision["tipo"], string> = {
  ENVIADA: "Enviada a revisión",
  APROBADA: "Aprobada",
  CAMBIOS_SOLICITADOS: "Cambios solicitados",
  RETIRADA: "Revisión retirada",
  APROBACION_ANULADA: "Aprobación anulada",
};

export const NOMBRE_EVENTO_COTIZACION: Record<string, string> = {
  COTIZACION_CREADA: "Cotización creada (folio reservado)",
  BORRADOR_GUARDADO: "Borrador guardado",
  VERSION_CREADA: "Versión calculada y guardada",
  CALCULO_BLOQUEADO: "Intento de versión bloqueado (sin guardar)",
  REVISION_ENVIADA: "Versión enviada a revisión",
  REVISION_RETIRADA: "Revisión retirada",
  CAMBIOS_SOLICITADOS: "Cambios solicitados por el revisor",
  VERSION_APROBADA: "Versión aprobada (no es emisión)",
  ENVIO_BLOQUEADO: "Intento de envío bloqueado (sin cambios)",
  APROBACION_BLOQUEADA: "Intento de aprobación bloqueado (sin cambios)",
  APROBACION_ANULADA: "Aprobación anulada antes de emitir",
  VERSION_EMITIDA: "Versión emitida (documento PDF DEMO)",
  EMISION_BLOQUEADA: "Intento de emisión bloqueado (sin emitir)",
  COTIZACION_DESCARTADA: "Cotización descartada",
  COTIZACION_DUPLICADA: "Cotización duplicada",
  NUEVA_VERSION_PREPARADA: "Versión nueva preparada",
  VISTA_PREVIA: "Vista previa BORRADOR generada",
};

export const nombreDeEvento = (tipo: string): string => NOMBRE_EVENTO_COTIZACION[tipo] ?? tipo;

const NOMBRE_DATO: Record<string, string> = {
  "cliente.nombre": "nombre del cliente",
  "proyecto.nombre": "nombre del proyecto",
  "proyecto.ubicacion": "ubicación del proyecto",
  "proyecto.descripcion": "descripción del proyecto",
};

/**
 * Resumen comercial de los cambios frente a la versión anterior (el cálculo lo hace el servidor). A
 * diferencia de la web, NO enumera los insumos de las opciones de precio cambiadas: en el móvil solo se
 * dice que cambiaron, sin datos de compra.
 */
export function lineasDeCambios(c: ResumenCambios): string[] {
  if (c.versionAnterior === null) return ["Primera versión de la cotización."];
  const lineas: string[] = [];
  if (c.partidasAgregadas.length) lineas.push(`Partidas agregadas: ${c.partidasAgregadas.join("; ")}.`);
  if (c.partidasQuitadas.length) lineas.push(`Partidas quitadas: ${c.partidasQuitadas.join("; ")}.`);
  if (c.partidasModificadas.length) lineas.push(`Partidas modificadas: ${c.partidasModificadas.join("; ")}.`);
  if (c.seleccionCambiada.length) lineas.push("Cambió alguna opción de precio elegida.");
  if (c.consolidacionCambiada) lineas.push("Cambió la decisión de consolidar compras.");
  if (c.datosDescriptivosCambiados.length) lineas.push(`Datos descriptivos actualizados: ${c.datosDescriptivosCambiados.map((d) => NOMBRE_DATO[d] ?? d).join(", ")}.`);
  if (c.textosCambiados?.length) lineas.push(`Textos actualizados: ${c.textosCambiados.join(", ")}.`);
  if (c.condicionesCambiadas) lineas.push("Cambiaron los datos vigentes del catálogo o las opciones elegidas.");
  if (lineas.length === 0) lineas.push("Misma captura y mismas condiciones que la versión anterior (recálculo).");
  return lineas;
}

export const ESTADO_FOLIO: Record<"ACTIVO" | "DESCARTADO", EtiquetaEstado> = {
  ACTIVO: { texto: "Activa", tono: "neutro" },
  DESCARTADO: { texto: "Descartada", tono: "error" },
};
