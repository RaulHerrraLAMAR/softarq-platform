/**
 * Errores de negocio del módulo de cotizaciones. La capa HTTP los traduce a respuestas
 * (`http/controladores-cotizaciones.ts`); la aplicación no conoce HTTP.
 */
import type { CapturaBorrador } from "@softarq/contracts";

export type CodigoNegocio =
  | "NO_ENCONTRADO"
  | "CONFLICTO_EDICION"
  | "BORRADOR_DESACTUALIZADO"
  | "CAPTURA_INCOMPLETA"
  | "CALCULO_BLOQUEADO"
  | "REGISTRO_INACTIVO"
  | "IDEMPOTENCIA_CONFLICTO"
  | "IDEMPOTENCIA_CADUCADA"
  | "SIN_PERMISO";

export interface DetalleError {
  campos?: { ruta: string; mensaje: string }[];
  problemas?: { codigo: string; referencia: string; mensaje: string }[];
  actual?: { revision: number; actualizadoPor: string; actualizadoEn: string; captura?: CapturaBorrador };
}

export class ErrorNegocio extends Error {
  constructor(
    readonly codigo: CodigoNegocio,
    mensaje: string,
    readonly detalle: DetalleError = {},
  ) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}

/** Error de la base reconocido: código SOFTARQ:* de las funciones o clave de idempotencia repetida. */
export type ErrorBaseReconocido = { tipo: "negocio"; codigo: string } | { tipo: "idempotencia_repetida" };

/**
 * Reconoce los errores que lanzan las funciones PL/pgSQL (`SOFTARQ:<CODIGO>`) y la violación de
 * la clave primaria de `idempotencia`, sin depender de cómo los envuelva el cliente de Prisma.
 */
export function reconocerErrorBase(e: unknown): ErrorBaseReconocido | null {
  const texto = textoDeError(e);
  const negocio = /SOFTARQ:([A-Z_]+)/.exec(texto);
  if (negocio) return { tipo: "negocio", codigo: negocio[1]! };
  if (texto.includes("idempotencia_pkey")) return { tipo: "idempotencia_repetida" };
  return null;
}

function textoDeError(e: unknown, profundidad = 0): string {
  if (e === null || e === undefined || profundidad > 4) return "";
  if (typeof e === "string") return e;
  if (typeof e !== "object") return String(e);
  const o = e as { message?: unknown; meta?: unknown; cause?: unknown };
  let t = typeof o.message === "string" ? o.message : "";
  try {
    if (o.meta !== undefined) t += ` ${JSON.stringify(o.meta)}`;
  } catch {
    // meta no serializable: se ignora
  }
  return `${t} ${textoDeError(o.cause, profundidad + 1)}`;
}

const MENSAJES: Record<string, [CodigoNegocio, string]> = {
  NO_ENCONTRADO: ["NO_ENCONTRADO", "El registro no existe en su organización."],
  CONFLICTO_EDICION: ["CONFLICTO_EDICION", "Otra persona o pestaña guardó cambios antes; revise la versión vigente."],
  BORRADOR_DESACTUALIZADO: [
    "BORRADOR_DESACTUALIZADO",
    "El borrador cambió después de la revisión indicada; guarde o recargue antes de calcular.",
  ],
  CLIENTE_INACTIVO: ["REGISTRO_INACTIVO", "El cliente está inactivo: no se ofrece para registros nuevos."],
  PROYECTO_INACTIVO: ["REGISTRO_INACTIVO", "El proyecto está inactivo: no se ofrece para cotizaciones nuevas."],
};

/** Traduce un error de las funciones de la base a `ErrorNegocio`; si no lo reconoce, lo devuelve igual. */
export function traducirErrorBase(e: unknown): unknown {
  const r = reconocerErrorBase(e);
  if (r?.tipo !== "negocio") return e;
  const m = MENSAJES[r.codigo];
  return m ? new ErrorNegocio(m[0], m[1]) : e;
}
