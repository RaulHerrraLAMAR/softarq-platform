/**
 * Estimación preliminar (módulo 17, ADR-0021 §3). Usa el motor EXISTENTE con los precios de referencia que designó el
 * Administrador del catálogo; no cambia ninguna regla de cálculo.
 *
 * - Una referencia por insumo. Se vuelve a comprobar al estimar: el precio debe seguir vigente a la fecha de cálculo, sin anular,
 *   con producto y proveedor activos. Nunca se sustituye por otro ni se elige el menor.
 * - Si falta una referencia válida (o el motor bloquea), NO hay importe: la estimación queda `SIN_ESTIMACION` con un motivo
 *   comprensible. Jamás un cero ni un importe inventado. BL-08 y las demás validaciones del motor no se tocan.
 * - Al cliente solo viaja la proyección comercial (D-16). `entrada` y `resultado` (con costos) se guardan para poder explicar la
 *   estimación y nunca salen de la API.
 */
import type { CapturaSolicitud, CotizacionComercial, FechaISO, MOTIVOS_SIN_ESTIMACION } from "@softarq/contracts";
import { calcularSolicitud } from "../../calculo/aplicacion/calculo-demo.js";
import type { ContextoOrganizacion, RepositorioCatalogos } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { insumosDeCaptura, solicitudDeCalculo, type CatalogoCliente } from "../dominio/captura.js";

export type MotivoSinEstimacion = (typeof MOTIVOS_SIN_ESTIMACION)[number];

/** Textos para el cliente. Sin códigos, costos ni datos internos. */
export const MENSAJE_MOTIVO: Record<MotivoSinEstimacion, string> = {
  FALTA_REFERENCIA: "El equipo completará la valoración de este trabajo: todavía falta un precio de referencia para alguno de sus materiales.",
  CONFIGURACION: "El equipo completará la valoración de este trabajo.",
  PARAMETROS: "El equipo completará la valoración: faltan datos de venta por definir.",
  MEDIDAS: "Revisa las medidas: el cálculo no pudo usarlas. Si todo está bien, envía tu solicitud y el equipo la valorará.",
  NO_DISPONIBLE: "No pudimos calcular la estimación ahora. Puedes enviar tu solicitud y el equipo la valorará.",
};

export interface ReferenciaActiva {
  readonly insumoCodigo: string;
  readonly precioCodigo: string;
}

export interface ResultadoEstimacion {
  readonly estado: "ESTIMADA" | "SIN_ESTIMACION";
  readonly motivoCodigo: MotivoSinEstimacion | null;
  readonly comercial: CotizacionComercial | null;
  readonly avisos: { codigo: string; mensaje: string }[];
  /** Referencias efectivamente usadas (o encontradas, si faltó alguna). */
  readonly referencias: ReferenciaActiva[];
  /** Interno: parámetros aplicados (ambiente, recargo, impuesto). */
  readonly parametros: unknown;
  readonly entrada: unknown;
  readonly resultado: unknown;
  readonly fechaCalculo: FechaISO;
}

function sinEstimacion(motivo: MotivoSinEstimacion, fecha: FechaISO, referencias: ReferenciaActiva[], interno: unknown = null): ResultadoEstimacion {
  return { estado: "SIN_ESTIMACION", motivoCodigo: motivo, comercial: null, avisos: [], referencias, parametros: null, entrada: null, resultado: interno, fechaCalculo: fecha };
}

function motivoDeBloqueo(problemas: readonly { codigo: string }[]): MotivoSinEstimacion {
  if (problemas.some((p) => p.codigo === "BL-08")) return "FALTA_REFERENCIA";
  if (problemas.some((p) => p.codigo === "BL-12" || p.codigo === "BL-13")) return "PARAMETROS";
  return "CONFIGURACION";
}

export async function estimar(
  catalogos: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  referenciasActivas: readonly ReferenciaActiva[],
  captura: CapturaSolicitud,
  catalogo: CatalogoCliente,
  fecha: FechaISO,
): Promise<ResultadoEstimacion> {
  const insumos = insumosDeCaptura(captura, catalogo);
  const porInsumo = new Map(referenciasActivas.map((r) => [r.insumoCodigo, r.precioCodigo]));
  const candidatas = insumos.flatMap((i) => (porInsumo.has(i) ? [{ insumoCodigo: i, precioCodigo: porInsumo.get(i)! }] : []));

  // Vigencia y estado de cada referencia, a la fecha de cálculo (no se usa un precio que dejó de ser válido).
  const precios = candidatas.length > 0 ? await catalogos.obtenerPrecios(ctx, candidatas.map((c) => c.precioCodigo)) : [];
  const precioPorCodigo = new Map(precios.map((p) => [p.codigo, p]));
  const validas: ReferenciaActiva[] = [];
  for (const c of candidatas) {
    const p = precioPorCodigo.get(c.precioCodigo);
    if (p && !p.anulado && p.producto.activo && p.proveedor.activo && p.producto.insumoCodigo === c.insumoCodigo && p.vigenteDesde <= fecha && fecha <= p.vigenteHasta) {
      validas.push(c);
    }
  }
  if (validas.length < insumos.length) return sinEstimacion("FALTA_REFERENCIA", fecha, validas, { faltantes: insumos.filter((i) => !validas.some((v) => v.insumoCodigo === i)) });

  const solicitud = solicitudDeCalculo(captura, catalogo, { porInsumo: new Map(validas.map((v) => [v.insumoCodigo, v.precioCodigo])) });
  const r = await calcularSolicitud(catalogos, ctx, solicitud, fecha);
  switch (r.estado) {
    case "CALCULADO":
      return {
        estado: "ESTIMADA",
        motivoCodigo: null,
        comercial: r.respuesta.cotizacion,
        // Los avisos del cálculo mencionan precios y compras: no son para el cliente.
        avisos: [],
        referencias: validas,
        parametros: { ...r.entrada.parametros },
        entrada: r.entrada,
        resultado: r.resultado,
        fechaCalculo: fecha,
      };
    case "BLOQUEADO":
      return sinEstimacion(motivoDeBloqueo(r.problemas), fecha, validas, { problemas: r.problemas });
    case "ENTRADA_INVALIDA":
      return sinEstimacion("MEDIDAS", fecha, validas, { campos: r.campos });
    case "NO_ENCONTRADO":
      return sinEstimacion("CONFIGURACION", fecha, validas, { faltantes: r.faltantes });
  }
}
