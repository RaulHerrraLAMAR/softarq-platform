/**
 * Códigos de fallo de la administración de catálogos (módulo 11, ADR-0015). Viven en esta carpeta
 * porque nombran datos internos (tarifas) que la prueba `sin-datos-internos` solo admite aquí.
 */
export const CODIGOS_FALLO_CATALOGO = [
  "DUPLICADO",
  "SOLAPE_VIGENCIA",
  "PRODUCTO_CON_PRECIOS",
  "UNIDAD_INCOMPATIBLE",
  "CONFLICTO_TARIFA",
  "VIGENCIA_INVALIDA",
  "PRECIO_ANULADO",
  "VALOR_INVALIDO",
] as const;
export type CodigoFalloCatalogo = (typeof CODIGOS_FALLO_CATALOGO)[number];

/** 409: el registro vigente cambió o ya existe; 422: el dato no se admite. */
export const FALLOS_CATALOGO_409: ReadonlySet<string> = new Set(["DUPLICADO", "SOLAPE_VIGENCIA", "CONFLICTO_TARIFA", "PRECIO_ANULADO"]);
export const FALLOS_CATALOGO_422: ReadonlySet<string> = new Set(["PRODUCTO_CON_PRECIOS", "UNIDAD_INCOMPATIBLE", "VIGENCIA_INVALIDA", "VALOR_INVALIDO"]);

export const esCodigoFalloCatalogo = (c: string): c is CodigoFalloCatalogo => (CODIGOS_FALLO_CATALOGO as readonly string[]).includes(c);
