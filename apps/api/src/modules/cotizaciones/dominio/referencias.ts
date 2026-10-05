/**
 * Disponibilidad de las referencias de una captura (corrección previa al módulo 7). Funciones puras.
 *
 * Principio: guardar un borrador nunca elimina en silencio lo capturado porque un concepto, un
 * proveedor o un precio dejó de estar disponible. Las referencias YA GUARDADAS se conservan y se
 * informan como no disponibles; el usuario decide cuándo sustituirlas o quitarlas, y el cálculo
 * las bloquea con su regla (BL-04, BL-08…). Las referencias NUEVAS (que no estaban en la revisión
 * guardada) deben estar disponibles hoy: así se distingue un dato conservado de un código nuevo
 * inválido. Los códigos se resuelven SOLO en el catálogo de la organización de la sesión, por lo
 * que un código de otra organización es, para esta, inexistente.
 */
import type { CapturaBorrador, ReferenciasBorrador } from "@softarq/contracts";
import type { ConceptoLeido, PrecioLeido, TipoAdicionalLeido } from "../../catalogos/persistencia/repositorio-catalogos.js";

export interface CatalogoDeReferencias {
  readonly conceptos: readonly ConceptoLeido[];
  readonly precios: readonly PrecioLeido[];
  readonly tiposAdicional: readonly TipoAdicionalLeido[];
}

const NO_EXISTE = "no existe en el catálogo de su organización";

/** Códigos que la captura referencia (para leer el catálogo una sola vez). */
export function codigosReferenciados(c: CapturaBorrador) {
  const conceptos = new Set<string>();
  const adicionales = new Set<string>();
  for (const p of c.partidas) {
    if (p.tipo === "CONCEPTO") conceptos.add(p.conceptoCodigo);
    else if (p.tipoAdicionalCodigo !== null) adicionales.add(p.tipoAdicionalCodigo);
  }
  return {
    conceptos: [...conceptos],
    tiposAdicional: [...adicionales],
    precios: [...new Set(c.seleccion.map((s) => s.precioCodigo))],
  };
}

function motivoConcepto(c: ConceptoLeido | undefined): string | null {
  if (!c) return NO_EXISTE;
  if (!c.activo) return "el concepto está inactivo";
  // Un personalizado puede usarse en Borrador; su excepción la exigen el cálculo y la revisión (BL-04).
  if (c.clase === "PERSONALIZADO") return null;
  if (c.estado !== "Aprobado") return `el concepto no está aprobado (estado ${c.estado})`;
  return null;
}

/** Motivo por el que un precio no es elegible HOY para ese insumo (mismas reglas que las opciones vigentes). */
function motivoPrecio(p: PrecioLeido | undefined, insumoCodigo: string, hoy: string): string | null {
  if (!p) return NO_EXISTE;
  if (p.producto.insumoCodigo !== insumoCodigo) return `corresponde a otro insumo (${p.producto.insumoCodigo})`;
  if (p.anulado) return "el precio está anulado";
  if (!p.producto.activo) return "el producto está inactivo";
  if (!p.proveedor.activo) return "el proveedor está inactivo";
  if (p.vigenteDesde > hoy || p.vigenteHasta < hoy) return `el precio no está vigente hoy (vigencia ${p.vigenteDesde} a ${p.vigenteHasta})`;
  return null;
}

function motivoAdicional(t: TipoAdicionalLeido | undefined): string | null {
  if (!t) return NO_EXISTE;
  if (!t.activo) return "el tipo de costo adicional está inactivo";
  return null;
}

/** Disponibilidad hoy de cada referencia de la captura (en orden de aparición). */
export function evaluarReferencias(c: CapturaBorrador, cat: CatalogoDeReferencias, hoy: string): ReferenciasBorrador {
  const conceptos = new Map(cat.conceptos.map((x) => [x.codigo, x]));
  const precios = new Map(cat.precios.map((x) => [x.codigo, x]));
  const adicionales = new Map(cat.tiposAdicional.map((x) => [x.codigo, x]));
  const cods = codigosReferenciados(c);
  return {
    conceptos: cods.conceptos.map((codigo) => {
      const k = conceptos.get(codigo);
      const motivo = motivoConcepto(k);
      return {
        codigo,
        disponible: motivo === null,
        motivo,
        insumos: k ? [...new Set(k.componentes.filter((x) => x.activo).map((x) => x.insumoCodigo))] : [],
      };
    }),
    selecciones: c.seleccion.map((s) => {
      const motivo = motivoPrecio(precios.get(s.precioCodigo), s.insumoCodigo, hoy);
      return { insumoCodigo: s.insumoCodigo, precioCodigo: s.precioCodigo, disponible: motivo === null, motivo };
    }),
    tiposAdicional: cods.tiposAdicional.map((codigo) => {
      const motivo = motivoAdicional(adicionales.get(codigo));
      return { codigo, disponible: motivo === null, motivo };
    }),
  };
}

/**
 * Referencias NUEVAS no disponibles: las que no estaban en la captura guardada (`anterior`) y no
 * se pueden elegir hoy. Las ya guardadas se aceptan aunque hayan dejado de estar disponibles.
 * Devuelve rutas del contrato del borrador.
 */
export function referenciasNuevasInvalidas(
  nueva: CapturaBorrador,
  anterior: CapturaBorrador,
  refs: ReferenciasBorrador,
): { ruta: string; mensaje: string }[] {
  const previos = codigosReferenciados(anterior);
  const conceptosPrevios = new Set(previos.conceptos);
  const adicionalesPrevios = new Set(previos.tiposAdicional);
  const paresPrevios = new Set(anterior.seleccion.map((s) => `${s.insumoCodigo}\u0000${s.precioCodigo}`));
  const motivoConcepto = new Map(refs.conceptos.map((r) => [r.codigo, r.motivo]));
  const motivoAdicional = new Map(refs.tiposAdicional.map((r) => [r.codigo, r.motivo]));

  const errores: { ruta: string; mensaje: string }[] = [];
  nueva.partidas.forEach((p, i) => {
    if (p.tipo === "CONCEPTO") {
      const m = motivoConcepto.get(p.conceptoCodigo);
      if (m && !conceptosPrevios.has(p.conceptoCodigo)) {
        errores.push({ ruta: `partidas[${i}].conceptoCodigo`, mensaje: `El concepto ${p.conceptoCodigo} no se puede agregar: ${m}.` });
      }
    } else if (p.tipoAdicionalCodigo !== null) {
      const m = motivoAdicional.get(p.tipoAdicionalCodigo);
      if (m && !adicionalesPrevios.has(p.tipoAdicionalCodigo)) {
        errores.push({
          ruta: `partidas[${i}].tipoAdicionalCodigo`,
          mensaje: `El tipo de costo adicional ${p.tipoAdicionalCodigo} no se puede elegir: ${m}.`,
        });
      }
    }
  });
  nueva.seleccion.forEach((s, i) => {
    const r = refs.selecciones[i];
    if (r && r.motivo && !paresPrevios.has(`${s.insumoCodigo}\u0000${s.precioCodigo}`)) {
      errores.push({
        ruta: `seleccion[${i}].precioCodigo`,
        mensaje: `La opción ${s.precioCodigo} no se puede elegir para ${s.insumoCodigo}: ${r.motivo}.`,
      });
    }
  });
  return errores;
}
