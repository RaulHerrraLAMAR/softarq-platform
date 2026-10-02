/**
 * CR-01: números generadores (Word maestro §3.3; modCalculo.CR01_Renglon y modMedicion.Med_Guardar).
 */
import { DIMENSIONES_POR_FORMULA, type RenglonMedicion, type TipoFormula } from "@softarq/contracts";
import { CERO, Dec, dec, sumar } from "./decimal.js";

type Dimension = "largo" | "ancho" | "alto";

/** Resultado de un renglón: signo × piezas × dimensiones según la fórmula. */
export function cr01Renglon(
  tipo: TipoFormula,
  signo: "+" | "-",
  piezas: Dec,
  largo: Dec | null,
  ancho: Dec | null,
  alto: Dec | null,
): Dec {
  const s = signo === "-" ? new Dec(-1) : new Dec(1);
  switch (tipo) {
    case "CONTEO":
      return s.times(piezas);
    case "LONGITUD":
      return s.times(piezas).times(requerida(largo, "largo"));
    case "AREA": {
      // Ancho o alto, nunca ambos (la validación lo impide antes de llegar aquí).
      const superficie = ancho ?? requerida(alto, "alto");
      return s.times(piezas).times(requerida(largo, "largo")).times(superficie);
    }
    case "VOLUMEN":
      return s
        .times(piezas)
        .times(requerida(largo, "largo"))
        .times(requerida(ancho, "ancho"))
        .times(requerida(alto, "alto"));
  }
}

function requerida(valor: Dec | null, nombre: Dimension): Dec {
  if (valor === null) {
    throw new Error(`Dimensión ${nombre} ausente: la entrada debió validarse antes de calcular.`);
  }
  return valor;
}

/**
 * Reglas de captura de un renglón (Med_Guardar y Word §3.3). Devuelve mensajes en español;
 * vacío si el renglón es válido. Supone que los textos decimales ya tienen formato válido.
 */
export function validarRenglon(
  tipo: TipoFormula,
  permiteDescuento: boolean,
  renglon: RenglonMedicion,
): { campo: string; mensaje: string }[] {
  const errores: { campo: string; mensaje: string }[] = [];
  if (renglon.signo === "-" && !permiteDescuento) {
    errores.push({ campo: "signo", mensaje: "La regla del concepto no permite descuentos (signo −)." });
  }
  const piezas = dec(renglon.piezas);
  if (!piezas.isInteger() || piezas.lte(0)) {
    errores.push({ campo: "piezas", mensaje: "Las piezas deben ser un entero mayor que cero." });
  }
  const usadas: Record<TipoFormula, readonly Dimension[]> = DIMENSIONES_POR_FORMULA;
  for (const d of ["largo", "ancho", "alto"] as const) {
    const v = renglon[d];
    if (v === null) continue;
    if (!usadas[tipo].includes(d)) {
      errores.push({ campo: d, mensaje: `La fórmula ${tipo} no usa ${d}; déjelo vacío.` });
    } else if (dec(v).lte(0)) {
      errores.push({ campo: d, mensaje: `El ${d} debe ser mayor que cero (use el signo − para descuentos).` });
    }
  }
  const faltan = (d: Dimension) => renglon[d] === null;
  if (tipo !== "CONTEO" && faltan("largo")) {
    errores.push({ campo: "largo", mensaje: "Falta el largo." });
  }
  if (tipo === "VOLUMEN") {
    if (faltan("ancho")) errores.push({ campo: "ancho", mensaje: "Falta el ancho." });
    if (faltan("alto")) errores.push({ campo: "alto", mensaje: "Falta el alto." });
  }
  if (tipo === "AREA") {
    if (faltan("ancho") && faltan("alto")) {
      errores.push({ campo: "ancho", mensaje: "Para AREA capture el ancho o el alto." });
    } else if (!faltan("ancho") && !faltan("alto")) {
      errores.push({ campo: "alto", mensaje: "Para AREA capture ancho o alto, no ambos." });
    }
  }
  if (errores.length === 0) {
    const r = calcularRenglon(tipo, renglon);
    if (r.isZero()) errores.push({ campo: "resultado", mensaje: "El resultado del renglón es cero." });
  }
  return errores;
}

export function calcularRenglon(tipo: TipoFormula, renglon: RenglonMedicion): Dec {
  const opcional = (t: string | null) => (t === null ? null : dec(t));
  return cr01Renglon(
    tipo,
    renglon.signo,
    dec(renglon.piezas),
    opcional(renglon.largo),
    opcional(renglon.ancho),
    opcional(renglon.alto),
  );
}

/** Cantidad de la partida = suma de renglones (debe ser > 0, BL-03). */
export function cantidadDePartida(tipo: TipoFormula, renglones: readonly RenglonMedicion[]): {
  renglones: Dec[];
  cantidad: Dec;
} {
  const resultados = renglones.map((r) => calcularRenglon(tipo, r));
  return { renglones: resultados, cantidad: resultados.length === 0 ? CERO : sumar(resultados) };
}
