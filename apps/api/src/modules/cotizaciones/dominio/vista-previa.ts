/**
 * Vista previa PDF marcada BORRADOR (módulo 15, ADR-0019; B-25 `BTN_VistaPrevia` → `Pdf_Generar`
 * de `modPdf.bas`, Word maestro §3.13).
 *
 * Reglas (las comprueba el servidor en cada solicitud):
 * - Solo versiones en Borrador, En revisión o Aprobada de un folio activo (BL-19). Una emitida o
 *   sustituida conserva su PDF original; no se regenera.
 * - Cálculo vigente (BL-16): la versión es la última, corresponde al borrador guardado (misma
 *   revisión) y el motor reproduce su entrada con el catálogo y los parámetros de hoy. Los datos
 *   administrativos (emisor, cliente, proyecto, contacto, vigencia) se toman vigentes y NO
 *   invalidan el cálculo. Nada se recalcula ni se reemplaza.
 * - No exige emisor completo, revisor ni textos (no es la emisión): lo que falte se indica tal cual.
 *
 * Composición: partidas, importes y textos CONGELADOS de la versión; emisor, cliente, proyecto,
 * contacto y días de vigencia ACTUALES (como el libro, que usa los catálogos vivos). Por eso dos
 * vistas previas de la misma versión pueden diferir en esos datos.
 */
import type { CotizacionComercial, DocumentoBorrador, ResumenVersion, TextosCotizacion } from "@softarq/contracts";
import { LEYENDA_TECNICA, PLANTILLA_PDF } from "./emision.js";
import type { Problema } from "./verificacion.js";

/** Estados de versión que admiten vista previa (§3.13: Borrador, En revisión y Aprobada). */
export const ESTADOS_VISTA_PREVIA: readonly ResumenVersion["estado"][] = ["BORRADOR", "EN_REVISION", "APROBADA"];

export interface EstadoParaVistaPrevia {
  idVersion: string;
  estado: ResumenVersion["estado"];
  esUltima: boolean;
  folioActivo: boolean;
  revisionBorradorVersion: number;
  revisionBorrador: number;
}

/** Bloqueos por estado (BL-19) y por correspondencia con el borrador guardado (BL-16). */
export function bloqueosEstadoVistaPrevia(e: EstadoParaVistaPrevia): Problema[] {
  if (!e.folioActivo) {
    return [{ codigo: "BL-19", referencia: e.idVersion, mensaje: "La cotización está descartada: no admite vista previa." }];
  }
  if (!ESTADOS_VISTA_PREVIA.includes(e.estado)) {
    return [
      {
        codigo: "BL-19",
        referencia: e.idVersion,
        mensaje: "La versión ya está emitida (o sustituida): descargue su documento emitido; la vista previa es solo para versiones sin emitir.",
      },
    ];
  }
  if (!e.esUltima || e.revisionBorrador !== e.revisionBorradorVersion) {
    return [
      {
        codigo: "BL-16",
        referencia: e.idVersion,
        mensaje: "El borrador guardado cambió después de calcular esta versión: calcule y guarde una versión nueva para ver su vista previa.",
      },
    ];
  }
  return [];
}

export interface EntradaBorrador {
  ambiente: "DEMO" | "PRODUCCION";
  folio: string;
  numero: number;
  fechaCalculo: string;
  fechaGeneracion: string;
  comercial: CotizacionComercial;
  textos: TextosCotizacion | null;
  emisor: { nombre: string | null; domicilio: string | null; telefono: string | null; correo: string | null; logo: "DEMO" | null } | null;
  cliente: { codigo: string; nombre: string; contactoNombre: string | null; contactoTelefono: string | null; contactoCorreo: string | null };
  proyecto: { codigo: string; nombre: string; ubicacion: string | null; descripcion: string | null };
  vigenciaDias: number | null;
  preparo: string;
  aprobo: string | null;
}

export function construirDocumentoBorrador(e: EntradaBorrador): DocumentoBorrador {
  const c = e.comercial;
  return {
    tipo: "BORRADOR",
    plantilla: PLANTILLA_PDF,
    ambiente: e.ambiente,
    origen: "WEB_DEMO",
    folio: e.folio,
    versionNumero: e.numero,
    idVersion: `${e.folio}-v${e.numero}`,
    fechaCalculo: e.fechaCalculo,
    fechaGeneracion: e.fechaGeneracion,
    vigenciaDias: e.vigenciaDias,
    emisor: e.emisor ? { ...e.emisor } : { nombre: null, domicilio: null, telefono: null, correo: null, logo: null },
    cliente: { codigo: e.cliente.codigo, nombre: e.cliente.nombre },
    contacto: { nombre: e.cliente.contactoNombre, telefono: e.cliente.contactoTelefono, correo: e.cliente.contactoCorreo },
    proyecto: { ...e.proyecto },
    moneda: "MXN",
    partidas: c.partidas.map((p) => ({
      numero: p.numero,
      descripcion: p.descripcion,
      unidad: p.unidad,
      cantidad: p.cantidad,
      precioUnitario: p.precioUnitario,
      importe: p.importe,
    })),
    subtotal: c.subtotal,
    impuesto: { nombre: c.impuesto.nombre, tasa: c.impuesto.tasa, importe: c.impuesto.importe },
    total: c.total,
    textos: e.textos ? { alcance: e.textos.alcance, condiciones: e.textos.condiciones, exclusiones: e.textos.exclusiones } : null,
    leyendaTecnica: LEYENDA_TECNICA,
    personas: { preparo: e.preparo, aprobo: e.aprobo },
  };
}
