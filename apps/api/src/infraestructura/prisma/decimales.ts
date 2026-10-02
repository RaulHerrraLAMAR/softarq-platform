/**
 * Conversión entre `DecimalTexto` (contratos) y las columnas NUMERIC de PostgreSQL.
 *
 * - Escritura: se valida el formato del contrato y que el valor quepa en la columna
 *   (precisión y escala). Un valor con más decimales se RECHAZA: nunca se deja que
 *   PostgreSQL redondee en silencio.
 * - Lectura: `Prisma.Decimal` → texto con `toFixed()` (sin exponente), sin pasar por `number`.
 */
import { esDecimalTexto, type DecimalTexto } from "@softarq/contracts";

/** Precisión y escala de cada clase de dato (ADR-0004). */
export const COLUMNAS_DECIMALES = {
  /** Precio unitario de catálogo e importe de tarifa (MXN). */
  dinero: { precision: 18, escala: 6 },
  /** Contenido, incremento, rendimiento y rendimiento por jornada. */
  cantidad: { precision: 20, escala: 6 },
  /** Factor de conversión entre unidades. */
  factor: { precision: 20, escala: 10 },
  /** Desperdicio, recargo y tasa de impuesto: [0,1]. */
  fraccion: { precision: 7, escala: 6 },
  /** Factor de traslape (>= 0, puede superar 1). */
  traslape: { precision: 9, escala: 6 },
} as const;

export type ClaseDecimal = keyof typeof COLUMNAS_DECIMALES;

export class ErrorDecimalColumna extends Error {
  constructor(
    readonly campo: string,
    mensaje: string,
  ) {
    super(`${campo}: ${mensaje}`);
    this.name = "ErrorDecimalColumna";
  }
}

/**
 * Valida un `DecimalTexto` para la columna de su clase y lo devuelve tal cual
 * (Prisma acepta texto para columnas Decimal sin pasar por `number`).
 */
export function decimalParaColumna(valor: string, clase: ClaseDecimal, campo: string): string {
  if (!esDecimalTexto(valor)) {
    throw new ErrorDecimalColumna(campo, `formato decimal inválido (${JSON.stringify(valor)}).`);
  }
  const { precision, escala } = COLUMNAS_DECIMALES[clase];
  const sinSigno = valor.startsWith("-") ? valor.slice(1) : valor;
  const [entera = "", fraccion = ""] = sinSigno.split(".");
  const fraccionSignificativa = fraccion.replace(/0+$/, "");
  if (fraccionSignificativa.length > escala) {
    throw new ErrorDecimalColumna(
      campo,
      `tiene ${fraccionSignificativa.length} decimales y la columna admite ${escala}; no se redondea.`,
    );
  }
  const enteros = entera.replace(/^0+(?=\d)/, "");
  if (enteros !== "0" && enteros.length > precision - escala) {
    throw new ErrorDecimalColumna(campo, `excede ${precision - escala} dígitos enteros.`);
  }
  return valor;
}

export function decimalOpcionalParaColumna(
  valor: string | null,
  clase: ClaseDecimal,
  campo: string,
): string | null {
  return valor === null ? null : decimalParaColumna(valor, clase, campo);
}

/** Interfaz mínima de `Prisma.Decimal` (decimal.js) que se usa al leer. */
interface DecimalLeido {
  toFixed(): string;
}

/** NUMERIC leído → `DecimalTexto` normalizado (sin ceros de relleno ni exponente). */
export function textoDeDecimal(valor: DecimalLeido): DecimalTexto {
  const t = valor.toFixed();
  if (!t.includes(".")) return t === "-0" ? "0" : t;
  const sinCeros = t.replace(/0+$/, "").replace(/\.$/, "");
  return sinCeros === "-0" ? "0" : sinCeros;
}

export function textoDeDecimalOpcional(valor: DecimalLeido | null): DecimalTexto | null {
  return valor === null ? null : textoDeDecimal(valor);
}
