/**
 * Reglas de emisión de una versión aprobada (módulo 8, ADR-0010). Funciones puras.
 *
 * Fuentes: `Rev_Emitir` (B-30) de `modRevision.bas`, `Validar(idv, "EMITIR")` y
 * `Emisor_Faltantes` de `modValidacion.bas`, `Pdf_Datos` de `modPdf.bas` y el Word maestro §3.11
 * a §3.13: al emitir se vuelven a evaluar BL-01 a BL-20; BL-15 y BL-17 solo impiden la emisión.
 *
 * Adaptaciones autorizadas (ADR-0010):
 * - Quién emite: en el libro, el Revisor distinto del preparador. En la web puede emitir un
 *   Preparador o un Revisor que no sea el autor; SIEMPRE con una aprobación vigente de esa versión
 *   hecha por otra persona (BL-17 sobre la aprobación).
 * - Datos descriptivos: la versión ya guarda copias del cliente y del proyecto (se aprobaron con
 *   ella). Si los datos actuales difieren, se bloquea: no se mezclan nombres históricos y datos
 *   actuales en silencio. El contacto del cliente y el emisor se copian al emitir.
 */
import type { CotizacionComercial, DocumentoCotizacion, FuncionUsuario, TextosCotizacion } from "@softarq/contracts";
import type { DatosParaEmitir, FilaEmisor, AprobacionDeVersion } from "../infraestructura/repositorio-emisiones.js";
import { ubicacionDe } from "../infraestructura/repositorio-cotizaciones.js";
import type { Problema } from "./verificacion.js";

/** Versión de la plantilla del documento (cambia si cambia el diseño o el contenido del PDF). */
export const PLANTILLA_PDF = "cotizacion-web-demo/1";

/** Leyenda técnica del libro (`LEYENDA_TECNICA` de `modPdf.bas`), con los acentos restaurados. */
export const LEYENDA_TECNICA =
  "Esta cotización no constituye un plano estructural aprobado, un cálculo de resistencia ni un documento apto por sí solo para construir.";

const VERSION_NUEVA = "Genere una versión nueva (con su revisión y aprobación) para emitir con los datos actuales.";

/**
 * BL-01: cliente activo con nombre y contacto (nombre y teléfono o correo). Además, el nombre
 * actual debe coincidir con la copia de la versión aprobada.
 */
export function bl01(d: DatosParaEmitir): Problema[] {
  const c = d.cliente;
  const p: Problema[] = [];
  if (!c.activo) p.push({ codigo: "BL-01", referencia: c.codigo, mensaje: `El cliente ${c.codigo} está inactivo.` });
  if (!c.contactoNombre) {
    p.push({ codigo: "BL-01", referencia: c.codigo, mensaje: `El cliente ${c.codigo} no tiene nombre de contacto.` });
  }
  if (!c.contactoTelefono && !c.contactoCorreo) {
    p.push({ codigo: "BL-01", referencia: c.codigo, mensaje: `El cliente ${c.codigo} no tiene medio de contacto (teléfono o correo).` });
  }
  if (c.nombre !== d.version.clienteNombre) {
    p.push({
      codigo: "BL-01",
      referencia: c.codigo,
      mensaje: `El nombre del cliente cambió después de calcular v${d.numero} («${d.version.clienteNombre}» → «${c.nombre}»). ${VERSION_NUEVA}`,
    });
  }
  return p;
}

/**
 * BL-02: proyecto activo, del cliente de la cotización, con nombre, municipio, entidad y
 * descripción. Además, sus datos actuales deben coincidir con las copias de la versión.
 */
export function bl02(d: DatosParaEmitir): Problema[] {
  const r = d.proyecto;
  const p: Problema[] = [];
  if (!r.activo) p.push({ codigo: "BL-02", referencia: r.codigo, mensaje: `El proyecto ${r.codigo} está inactivo.` });
  if (r.clienteId !== d.clienteIdCotizacion) {
    p.push({ codigo: "BL-02", referencia: r.codigo, mensaje: "El proyecto no pertenece al cliente de la cotización." });
  }
  if (!r.municipio || !r.entidadFederativa || !r.descripcion) {
    p.push({
      codigo: "BL-02",
      referencia: r.codigo,
      mensaje: `El proyecto ${r.codigo} no tiene ubicación (municipio y entidad) o descripción.`,
    });
  }
  const ubicacion = ubicacionDe(r.municipio, r.entidadFederativa);
  const v = d.version;
  if (r.nombre !== v.proyectoNombre || ubicacion !== v.proyectoUbicacion || r.descripcion !== v.proyectoDescripcion) {
    p.push({
      codigo: "BL-02",
      referencia: r.codigo,
      mensaje: `Los datos del proyecto (nombre, ubicación o descripción) cambiaron después de calcular v${d.numero}. ${VERSION_NUEVA}`,
    });
  } else if (!v.proyectoUbicacion || !v.proyectoDescripcion) {
    p.push({
      codigo: "BL-02",
      referencia: r.codigo,
      mensaje: `La versión v${d.numero} se calculó sin ubicación o descripción del proyecto. ${VERSION_NUEVA}`,
    });
  }
  return p;
}

/** Datos del emisor que faltan (BL-15, como `Emisor_Faltantes`). */
export function faltantesEmisor(e: FilaEmisor | null, logoDisponible: (clave: string) => boolean): string[] {
  const f: string[] = [];
  if (!e?.nombre) f.push("nombre o razón social");
  if (!e?.domicilio) f.push("domicilio");
  if (!e?.telefono) f.push("teléfono");
  if (!e?.correo) f.push("correo");
  if (!e?.logoClave) f.push("logotipo");
  else if (!logoDisponible(e.logoClave)) f.push("logotipo (archivo no encontrado)");
  return f;
}

export function bl15(faltantes: readonly string[]): Problema[] {
  return faltantes.length === 0
    ? []
    : [{ codigo: "BL-15", referencia: "EMISOR", mensaje: `Datos del emisor incompletos: ${faltantes.join(", ")}.` }];
}

/** BL-17 al emitir: aprobación vigente de ESTA versión, registrada y de otra persona. */
export function bl17(a: AprobacionDeVersion | null, autorId: string, idVersion: string): Problema[] {
  if (!a || a.estado !== "APROBADA") {
    return [{ codigo: "BL-17", referencia: idVersion, mensaje: `La versión ${idVersion} no está aprobada por un revisor.` }];
  }
  if (a.anulada) {
    return [
      {
        codigo: "BL-17",
        referencia: idVersion,
        mensaje: `La aprobación de ${idVersion} se anuló. Envíela de nuevo a revisión y obtenga otra aprobación.`,
      },
    ];
  }
  if (!a.resueltaPor) return [{ codigo: "BL-17", referencia: idVersion, mensaje: "La aprobación no tiene revisor registrado." }];
  if (a.resueltaPor === autorId) {
    return [{ codigo: "BL-17", referencia: idVersion, mensaje: "El revisor debe ser distinto del preparador." }];
  }
  return [];
}

/** BL-19 al emitir: el estado del folio, de la versión y del borrador permiten emitir. */
export function bl19(d: DatosParaEmitir, yaEmitida: boolean): Problema[] {
  const id = `${d.folio}-v${d.numero}`;
  const p: Problema[] = [];
  if (d.estadoFolio !== "ACTIVO") p.push({ codigo: "BL-19", referencia: d.folio, mensaje: "La cotización está descartada." });
  if (yaEmitida) p.push({ codigo: "BL-19", referencia: id, mensaje: `La versión ${id} ya está emitida.` });
  if (d.numero !== d.ultimaVersion) {
    p.push({ codigo: "BL-19", referencia: id, mensaje: `Solo se emite la última versión; ${id} no lo es (última: v${d.ultimaVersion}).` });
  }
  if (d.pendiente) p.push({ codigo: "BL-19", referencia: d.folio, mensaje: "Hay una versión en revisión." });
  if (d.borradorRevision !== d.revisionBorrador) {
    p.push({
      codigo: "BL-16",
      referencia: id,
      mensaje: `El borrador tiene cambios guardados después de calcular v${d.numero}. ${VERSION_NUEVA}`,
    });
  }
  return p;
}

/**
 * Quién puede emitir (decisión autorizada, ADR-0010): un Preparador de la organización, o un
 * Revisor que no sea el autor de la versión. Poder emitir no concede aprobar.
 */
export function puedeEmitirPersona(
  funciones: readonly FuncionUsuario[],
  usuarioId: string,
  autorId: string,
): { permitido: boolean; motivo: string | null } {
  if (funciones.includes("PREPARADOR")) return { permitido: true, motivo: null };
  if (funciones.includes("REVISOR")) {
    return usuarioId === autorId
      ? { permitido: false, motivo: "Usted preparó esta versión: con la función de Revisor no puede emitirla (BL-17)." }
      : { permitido: true, motivo: null };
  }
  return { permitido: false, motivo: "Emiten un Preparador o un Revisor distinto de quien preparó la versión." };
}

export interface EntradaDocumento {
  datos: DatosParaEmitir;
  comercial: CotizacionComercial;
  textos: TextosCotizacion;
  emisor: { nombre: string; domicilio: string; telefono: string; correo: string; logo: "DEMO" };
  ambiente: "DEMO" | "PRODUCCION";
  fechaEmision: string;
  vigenciaDias: number;
  vigenteHasta: string;
  aprobo: string;
  emitio: string;
}

/**
 * Estructura comercial del documento, campo por campo (lista blanca). Nada de la entrada ni del
 * resultado interno del cálculo; de la versión solo la proyección comercial y sus copias.
 */
export function construirDocumento(e: EntradaDocumento): DocumentoCotizacion {
  const d = e.datos;
  const c = e.comercial;
  return {
    plantilla: PLANTILLA_PDF,
    ambiente: e.ambiente,
    origen: "WEB_DEMO",
    folio: d.folio,
    versionNumero: d.numero,
    idVersion: `${d.folio}-v${d.numero}`,
    fechaEmision: e.fechaEmision,
    vigenciaDias: e.vigenciaDias,
    vigenteHasta: e.vigenteHasta,
    emisor: { ...e.emisor },
    cliente: { codigo: d.version.clienteCodigo, nombre: d.version.clienteNombre },
    contacto: {
      nombre: d.cliente.contactoNombre ?? "",
      telefono: d.cliente.contactoTelefono,
      correo: d.cliente.contactoCorreo,
    },
    proyecto: {
      codigo: d.version.proyectoCodigo,
      nombre: d.version.proyectoNombre,
      ubicacion: d.version.proyectoUbicacion ?? "",
      descripcion: d.version.proyectoDescripcion ?? "",
    },
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
    textos: { alcance: e.textos.alcance, condiciones: e.textos.condiciones, exclusiones: e.textos.exclusiones },
    leyendaTecnica: LEYENDA_TECNICA,
    personas: { preparo: d.autorNombre, aprobo: e.aprobo, emitio: e.emitio },
  };
}
