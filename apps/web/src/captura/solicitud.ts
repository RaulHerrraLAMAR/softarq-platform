/**
 * Captura → `SolicitudCalculoDemo` (solo los campos permitidos por el contrato).
 *
 * La validación local solo comprueba que la captura esté completa y con formato válido, para dar
 * respuesta inmediata. Las reglas de negocio y la validación definitiva son del servidor.
 * Las claves de error usan el mismo formato de ruta que la API (`partidas[0].mediciones[1].piezas`),
 * así los errores locales y los del servidor se muestran en el mismo campo.
 */
import {
  DIMENSIONES_POR_FORMULA,
  EsquemaSolicitudCalculoDemo,
  LIMITES_API,
  PATRON_DECIMAL_TEXTO,
  type SolicitudCalculoDemo,
} from "@softarq/contracts";
import type { InsumoConOpciones } from "../api/servicios.ts";
import { insumosParaElegir, type Captura, type PartidaConcepto, type RenglonCaptura } from "./estado.ts";

export type ErroresCampo = Record<string, string>;

export const AYUDA_DECIMAL = "Use punto decimal, por ejemplo 0.12 (sin comas ni espacios).";

type PartidaSolicitud = SolicitudCalculoDemo["partidas"][number];
type Medicion = Extract<PartidaSolicitud, { tipo: "CONCEPTO" }>["mediciones"][number];

/** Dimensiones que se capturan en un renglón (AREA: largo y la segunda medida elegida). */
export function dimensionesDelRenglon(p: PartidaConcepto, r: RenglonCaptura): ("largo" | "ancho" | "alto")[] {
  const tipo = p.concepto.tipoFormula;
  if (tipo === "AREA") return ["largo", r.segundaMedida];
  return [...DIMENSIONES_POR_FORMULA[tipo]];
}

function medicion(p: PartidaConcepto, r: RenglonCaptura): Medicion {
  const usadas = dimensionesDelRenglon(p, r);
  const valor = (d: "largo" | "ancho" | "alto") => (usadas.includes(d) ? r[d].trim() : null);
  return {
    descripcion: r.descripcion.trim(),
    signo: r.signo,
    piezas: r.piezas.trim(),
    largo: valor("largo"),
    ancho: valor("ancho"),
    alto: valor("alto"),
  };
}

/** Precios elegidos SOLO para los insumos de los conceptos actuales disponibles, en orden estable. */
function preciosElegidos(c: Captura): string[] {
  const lista: string[] = [];
  for (const ins of insumosParaElegir(c)) {
    const p = c.seleccion[ins];
    if (p !== undefined && !lista.includes(p)) lista.push(p);
  }
  return lista;
}

/** Arma la solicitud exactamente con los campos del contrato (los ids se numeran P001, P002…). */
export function armarSolicitud(c: Captura): SolicitudCalculoDemo {
  return {
    consolidarCompras: c.consolidarCompras === true,
    partidas: c.partidas.map((p, i): PartidaSolicitud => {
      const id = `P${String(i + 1).padStart(3, "0")}`;
      if (p.tipo === "ADICIONAL") {
        return {
          id,
          tipo: "ADICIONAL",
          tipoAdicionalCodigo: p.tipoAdicionalCodigo,
          descripcion: p.descripcion.trim(),
          cantidad: p.cantidad.trim(),
          monto: p.monto.trim(),
        };
      }
      const descripcion = p.descripcion.trim();
      return {
        id,
        tipo: "CONCEPTO",
        conceptoCodigo: p.concepto.codigo,
        ...(descripcion ? { descripcion } : {}),
        mediciones: p.renglones.map((r) => medicion(p, r)),
      };
    }),
    preciosElegidos: preciosElegidos(c),
  };
}

/** Huella de lo que se enviaría: dos capturas con la misma huella producen el mismo cálculo. */
export function huellaCaptura(c: Captura): string {
  return JSON.stringify({
    consolidar: c.consolidarCompras,
    solicitud: armarSolicitud(c),
  });
}

const NOMBRE_DIMENSION = { largo: "el largo", ancho: "el ancho", alto: "el alto" } as const;

function decimal(errores: ErroresCampo, ruta: string, valor: string, falta: string): void {
  const v = valor.trim();
  if (!v) errores[ruta] = falta;
  else if (!PATRON_DECIMAL_TEXTO.test(v)) errores[ruta] = AYUDA_DECIMAL;
}

/**
 * Comprueba que la captura esté completa. `opciones` es la lista vigente de opciones (o `null`
 * mientras se cargan). Devuelve un objeto vacío si se puede enviar.
 */
export function validarCaptura(c: Captura, opciones: readonly InsumoConOpciones[] | null): ErroresCampo {
  const e: ErroresCampo = {};
  if (c.consolidarCompras === null) e["consolidarCompras"] = "Indique si se consolidan las compras.";
  if (c.partidas.length === 0) e["partidas"] = "Agregue al menos una partida.";
  if (c.partidas.length > LIMITES_API.partidas) e["partidas"] = `Máximo ${LIMITES_API.partidas} partidas.`;

  c.partidas.forEach((p, i) => {
    const r = `partidas[${i}]`;
    if (p.tipo === "ADICIONAL") {
      if (!p.tipoAdicionalCodigo) e[`${r}.tipoAdicionalCodigo`] = "Elija el tipo de costo adicional.";
      if (!p.descripcion.trim()) e[`${r}.descripcion`] = "Escriba una descripción.";
      decimal(e, `${r}.cantidad`, p.cantidad, "Indique la cantidad.");
      decimal(e, `${r}.monto`, p.monto, "Indique el monto.");
      return;
    }
    if (p.noDisponible !== null) {
      e[`${r}.conceptoCodigo`] =
        `El concepto ${p.concepto.codigo} ya no está disponible: ${p.noDisponible}. Quite la partida para poder calcular.`;
    }
    if (p.renglones.length === 0) e[`${r}.mediciones`] = "Agregue al menos un renglón de medidas.";
    p.renglones.forEach((rg, n) => {
      const rr = `${r}.mediciones[${n}]`;
      decimal(e, `${rr}.piezas`, rg.piezas, "Indique las piezas.");
      for (const d of dimensionesDelRenglon(p, rg)) decimal(e, `${rr}.${d}`, rg[d], `Indique ${NOMBRE_DIMENSION[d]}.`);
    });
  });

  const insumos = insumosParaElegir(c);
  if (insumos.length > 0) {
    if (opciones === null) {
      e["preciosElegidos"] = "Espere a que se carguen las opciones disponibles.";
    } else {
      const vigentes = new Map(opciones.map((o) => [o.insumoCodigo, new Set(o.opciones.map((x) => x.precioCodigo))]));
      for (const ins of insumos) {
        const elegido = c.seleccion[ins];
        if (elegido === undefined) e[`seleccion.${ins}`] = "Elija una opción para este insumo.";
        else if (vigentes.has(ins) && !vigentes.get(ins)!.has(elegido)) {
          // Selección conservada que ya no se puede elegir: decide el usuario, no la web.
          e[`seleccion.${ins}`] = `La opción ${elegido} ya no está disponible. Elija otra o quite la selección.`;
        }
      }
    }
  }

  if (Object.keys(e).length === 0) {
    const r = EsquemaSolicitudCalculoDemo.safeParse(armarSolicitud(c));
    if (!r.success) {
      for (const issue of r.error.issues) {
        const ruta = issue.path.map((s) => (typeof s === "number" ? `[${s}]` : `.${String(s)}`)).join("").replace(/^\./, "");
        e[ruta || "partidas"] ??= issue.message;
      }
    }
  }
  return e;
}

/** Identificador DOM estable para una ruta de error («partidas[0].mediciones[1].piezas»). */
export function idCampo(ruta: string): string {
  return `campo-${ruta.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+$/, "")}`;
}
