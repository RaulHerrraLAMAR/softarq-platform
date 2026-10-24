/**
 * Resumen de la captura para las pantallas (ADR-0021). Funciones puras: qué se muestra de cada trabajo, sus secciones y
 * huecos, y si está completo, incompleto o con errores. No calcula cantidades ni importes: eso es de la API.
 */
import type { TrabajoCliente } from "@softarq/contracts/cliente";
import { buscarOpcion, buscarTrabajo, etiquetaDe, leerMedida, validarLocal, type CampoLocal, type CapturaLocal, type RenglonLocal, type TrabajoLocal } from "./modelo";

export type EstadoTrabajo = "completo" | "incompleto" | "con_errores";

export interface ResumenDeTrabajo {
  id: string;
  indice: number;
  /** Ilustración y nombre del tipo de trabajo («Cubierta»). */
  tipo: "cubierta" | "losa" | "muro";
  nombre: string;
  opcion: string;
  /** Hay más de una opción en el catálogo para este trabajo. */
  variasOpciones: boolean;
  secciones: string[];
  huecos: string[];
  estado: EstadoTrabajo;
  /** Campos por completar o corregir de este trabajo, en orden. */
  campos: CampoLocal[];
  disponible: boolean;
}

/** «Largo 6 m · Ancho 6 m», o «Largo: falta» / «Largo: revisar» si aún no es válida. */
export function lineaDeRenglon(r: RenglonLocal, claves: readonly ("largo" | "ancho" | "alto")[], etiqueta: (c: "largo" | "ancho" | "alto") => string): string {
  const partes = claves.map((c) => {
    const l = leerMedida(r[c]);
    if (l.estado === "ok") return `${etiqueta(c)} ${l.valor} m`;
    return `${etiqueta(c)}: ${l.estado === "pend" ? "falta" : "revisar"}`;
  });
  const piezas = r.piezas.trim() !== "" && r.piezas.trim() !== "1" ? ` · ${r.piezas.trim()} piezas` : "";
  const nombre = r.nombre.trim() !== "" ? `${r.nombre.trim()}: ` : "";
  return `${nombre}${partes.join(" · ")}${piezas}`;
}

const esDeTrabajo = (c: CampoLocal, i: number) => c.ruta.startsWith(`trabajos[${i}]`);

export function resumirTrabajos(local: CapturaLocal, catalogo: readonly TrabajoCliente[]): ResumenDeTrabajo[] {
  const v = validarLocal(local, catalogo);
  return local.trabajos.map((t: TrabajoLocal, i) => {
    const trabajo = buscarTrabajo(catalogo, t.trabajoCodigo);
    const opcion = buscarOpcion(catalogo, t.trabajoCodigo, t.opcionCodigo);
    const errores = v.errores.filter((c) => esDeTrabajo(c, i));
    const pendientes = v.pendientes.filter((c) => esDeTrabajo(c, i));
    const claves = opcion?.medidas.map((m) => m.clave) ?? [];
    const et = (c: "largo" | "ancho" | "alto") => (opcion ? etiquetaDe(opcion, c) : c);
    return {
      id: t.id,
      indice: i,
      tipo: trabajo?.ilustracion ?? "cubierta",
      nombre: trabajo?.nombre ?? t.trabajoCodigo,
      opcion: opcion?.nombre ?? t.opcionCodigo,
      variasOpciones: (trabajo?.opciones.length ?? 0) > 1,
      secciones: t.secciones.map((r) => lineaDeRenglon(r, claves, et)),
      huecos: opcion?.admiteHuecos ? t.huecos.map((r) => lineaDeRenglon(r, claves, et)) : [],
      estado: errores.length > 0 ? "con_errores" : pendientes.length > 0 ? "incompleto" : "completo",
      campos: [...errores, ...pendientes],
      disponible: opcion !== undefined,
    };
  });
}

/** Cuántos trabajos están completos (para el avance del resumen). */
export const trabajosCompletos = (r: readonly ResumenDeTrabajo[]): number => r.filter((x) => x.estado === "completo").length;

/** Texto del avance: «2 de 3 trabajos completos». */
export function textoDeAvance(r: readonly ResumenDeTrabajo[]): string {
  const n = trabajosCompletos(r);
  return `${n} de ${r.length} ${r.length === 1 ? "trabajo completo" : "trabajos completos"}`;
}

/** Índice del trabajo al que pertenece una ruta del servidor o local («trabajos[1].secciones[0].largo» → 1). */
export function indiceDeRuta(ruta: string): number | null {
  const m = /^trabajos\[(\d+)\]/.exec(ruta);
  return m ? Number(m[1]) : null;
}

/** Cuántas medidas faltan o están mal en todo el borrador (para el pie de la pantalla de medidas). */
export function textoDeFaltantes(local: CapturaLocal, catalogo: readonly TrabajoCliente[], idTrabajo?: string): string {
  const v = validarLocal(local, catalogo);
  const i = idTrabajo === undefined ? null : local.trabajos.findIndex((t) => t.id === idTrabajo);
  const filtra = (c: CampoLocal) => i === null || i < 0 || esDeTrabajo(c, i);
  const falta = v.pendientes.filter(filtra).length;
  const mal = v.errores.filter(filtra).length;
  if (falta === 0 && mal === 0) return "Todo listo";
  const partes: string[] = [];
  if (mal > 0) partes.push(mal === 1 ? "1 medida por corregir" : `${mal} medidas por corregir`);
  if (falta > 0) partes.push(falta === 1 ? "falta 1 dato" : `faltan ${falta} datos`);
  return partes.join(" · ");
}
