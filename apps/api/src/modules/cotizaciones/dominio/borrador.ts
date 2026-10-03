/**
 * Borrador → solicitud de cálculo y completitud (ADR-0008 §4). Funciones puras.
 *
 * - El borrador guarda lo capturado: `null` = sin capturar, `"0"` = cero (un valor). Nunca tiene
 *   resultado ni total.
 * - La conversión replica la de la web (`armarSolicitud`): partidas numeradas P001, P002…,
 *   descripción vacía = la del concepto, dimensiones que la fórmula no usa en `null` y precios
 *   elegidos solo para los insumos de los conceptos de la captura.
 * - La completitud usa las mismas rutas y mensajes que la validación local de la web, y al final
 *   el esquema de la solicitud de cálculo. Las reglas de negocio (BL-*) siguen en el ensamblador
 *   y el motor: una captura «lista» aún puede quedar bloqueada al calcular.
 */
import {
  DIMENSIONES_POR_FORMULA,
  EsquemaSolicitudCalculoDemo,
  type CapturaBorrador,
  type Completitud,
  type DimensionMedicion,
  type SolicitudCalculoDemo,
  type TipoFormula,
} from "@softarq/contracts";

/** Datos del catálogo que la completitud necesita de cada concepto disponible. */
export interface ConceptoParaCaptura {
  readonly tipoFormula: TipoFormula;
  /** Insumos de sus componentes activos, en orden. */
  readonly insumos: readonly string[];
}

type RenglonBorrador = Extract<CapturaBorrador["partidas"][number], { tipo: "CONCEPTO" }>["mediciones"][number];

const NOMBRE_DIMENSION: Record<DimensionMedicion, string> = { largo: "el largo", ancho: "el ancho", alto: "el alto" };

export function dimensionesDelRenglon(tipo: TipoFormula, r: RenglonBorrador): DimensionMedicion[] {
  if (tipo === "AREA") return ["largo", r.segundaMedida];
  return [...DIMENSIONES_POR_FORMULA[tipo]];
}

/** Insumos que necesitan precio elegido, en orden de aparición. */
export function insumosEnUso(c: CapturaBorrador, conceptos: ReadonlyMap<string, ConceptoParaCaptura>): string[] {
  const vistos = new Set<string>();
  for (const p of c.partidas) {
    if (p.tipo !== "CONCEPTO") continue;
    for (const i of conceptos.get(p.conceptoCodigo)?.insumos ?? []) vistos.add(i);
  }
  return [...vistos];
}

export function evaluarCompletitud(c: CapturaBorrador, conceptos: ReadonlyMap<string, ConceptoParaCaptura>): Completitud {
  const pendientes: { ruta: string; mensaje: string }[] = [];
  const falta = (ruta: string, mensaje: string) => pendientes.push({ ruta, mensaje });

  if (c.consolidarCompras === null) falta("consolidarCompras", "Indique si se consolidan las compras.");
  if (c.partidas.length === 0) falta("partidas", "Agregue al menos una partida.");

  c.partidas.forEach((p, i) => {
    const r = `partidas[${i}]`;
    if (p.tipo === "ADICIONAL") {
      if (p.tipoAdicionalCodigo === null) falta(`${r}.tipoAdicionalCodigo`, "Elija el tipo de costo adicional.");
      if (!p.descripcion.trim()) falta(`${r}.descripcion`, "Escriba una descripción.");
      if (p.cantidad === null) falta(`${r}.cantidad`, "Indique la cantidad.");
      if (p.monto === null) falta(`${r}.monto`, "Indique el monto.");
      return;
    }
    const concepto = conceptos.get(p.conceptoCodigo);
    if (!concepto) {
      falta(`${r}.conceptoCodigo`, `El concepto ${p.conceptoCodigo} no existe o no está disponible.`);
      return;
    }
    if (p.mediciones.length === 0) falta(`${r}.mediciones`, "Agregue al menos un renglón de medidas.");
    p.mediciones.forEach((m, n) => {
      const rr = `${r}.mediciones[${n}]`;
      if (m.piezas === null) falta(`${rr}.piezas`, "Indique las piezas.");
      for (const d of dimensionesDelRenglon(concepto.tipoFormula, m)) {
        if (m[d] === null) falta(`${rr}.${d}`, `Indique ${NOMBRE_DIMENSION[d]}.`);
      }
    });
  });

  const elegidos = new Map(c.seleccion.map((s) => [s.insumoCodigo, s.precioCodigo]));
  for (const ins of insumosEnUso(c, conceptos)) {
    if (!elegidos.has(ins)) falta(`seleccion.${ins}`, "Elija una opción para este insumo.");
  }

  if (pendientes.length === 0) {
    const r = EsquemaSolicitudCalculoDemo.safeParse(aSolicitudCalculo(c, conceptos));
    if (!r.success) {
      for (const issue of r.error.issues) {
        const ruta = issue.path.map((s) => (typeof s === "number" ? `[${s}]` : `.${String(s)}`)).join("").replace(/^\./, "");
        falta(ruta || "partidas", issue.message);
      }
    }
  }
  return { lista: pendientes.length === 0, pendientes };
}

/**
 * Solicitud de cálculo de una captura COMPLETA (comprobar antes con `evaluarCompletitud`).
 * Las ausencias que pudieran quedar se convierten en texto vacío, que el esquema rechaza.
 */
export function aSolicitudCalculo(
  c: CapturaBorrador,
  conceptos: ReadonlyMap<string, ConceptoParaCaptura>,
): SolicitudCalculoDemo {
  const elegidos = new Map(c.seleccion.map((s) => [s.insumoCodigo, s.precioCodigo]));
  const precios: string[] = [];
  for (const ins of insumosEnUso(c, conceptos)) {
    const p = elegidos.get(ins);
    if (p !== undefined && !precios.includes(p)) precios.push(p);
  }
  return {
    consolidarCompras: c.consolidarCompras === true,
    partidas: c.partidas.map((p, i) => {
      const id = `P${String(i + 1).padStart(3, "0")}`;
      if (p.tipo === "ADICIONAL") {
        return {
          id,
          tipo: "ADICIONAL" as const,
          tipoAdicionalCodigo: p.tipoAdicionalCodigo ?? "",
          descripcion: p.descripcion.trim(),
          cantidad: p.cantidad ?? "",
          monto: p.monto ?? "",
        };
      }
      const tipo = conceptos.get(p.conceptoCodigo)?.tipoFormula ?? "CONTEO";
      const descripcion = p.descripcion.trim();
      return {
        id,
        tipo: "CONCEPTO" as const,
        conceptoCodigo: p.conceptoCodigo,
        ...(descripcion ? { descripcion } : {}),
        mediciones: p.mediciones.map((m) => {
          const usadas = dimensionesDelRenglon(tipo, m);
          const valor = (d: DimensionMedicion) => (usadas.includes(d) ? (m[d] ?? "") : null);
          return {
            descripcion: m.descripcion.trim(),
            signo: m.signo,
            piezas: m.piezas ?? "",
            largo: valor("largo"),
            ancho: valor("ancho"),
            alto: valor("alto"),
          };
        }),
      };
    }),
    preciosElegidos: precios,
  };
}
