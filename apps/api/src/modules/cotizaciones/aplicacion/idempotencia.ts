/**
 * Idempotencia de las altas (ADR-0008 §5).
 *
 * - Clave: cabecera `Idempotency-Key` (UUID) que el cliente genera para cada intención y reutiliza
 *   al reintentar (doble clic, respuesta perdida, recuperación del token CSRF).
 * - Ámbito: organización + usuario + clave. Duración: 24 h.
 * - Huella: SHA-256 de la operación, los parámetros de ruta y el cuerpo canónico. La misma clave
 *   con otra operación u otro cuerpo se rechaza (IDEMPOTENCIA_CONFLICTO); nunca se reutiliza una
 *   clave para una operación distinta.
 * - Solo se registran los éxitos, en la misma sentencia que crea el recurso: si la operación
 *   falla no queda registro y se puede reintentar con la misma clave.
 */
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "./errores.js";
import { sha256 } from "../dominio/huella.js";

export const DURACION_IDEMPOTENCIA_MS = 24 * 60 * 60 * 1000;

export type OperacionIdempotente =
  | "crear_cliente"
  | "crear_proyecto"
  | "crear_cotizacion"
  | "crear_version"
  // Módulo 7 (ADR-0009): envíos, decisiones y retiradas de revisión.
  | "enviar_revision"
  | "decidir_revision"
  | "retirar_revision"
  // Módulo 8 (ADR-0010): emisiones, anulaciones de aprobación y descartes.
  | "emitir_version"
  | "anular_aprobacion"
  | "descartar_cotizacion"
  | "registrar_respuesta"
  | "corregir_respuesta"
  // Módulo 10 (ADR-0014): autorizar o rechazar una excepción.
  | "decidir_excepcion"
  // Módulo 11 (ADR-0015): administración de catálogos.
  | "crear_proveedor"
  | "crear_producto"
  | "registrar_precio"
  | "anular_precio"
  | "cerrar_vigencia_precio"
  | "registrar_tarifa"
  | "asignar_tarifa"
  // Módulo 12 (ADR-0016): catálogo técnico y aprobación de conceptos.
  | "crear_tipo_estructura"
  | "crear_insumo"
  | "crear_conversion"
  | "crear_concepto"
  | "crear_componente"
  | "aprobar_concepto"
  // Módulo 13 (ADR-0017): alta de personas y restablecimiento de contraseñas.
  | "crear_persona"
  | "restablecer_contrasena"
  // Módulo 15 (ADR-0019): duplicar, preparar la versión nueva y vista previa BORRADOR.
  | "duplicar_cotizacion"
  | "preparar_nueva_version"
  | "vista_previa";

export interface Idempotencia {
  readonly clave: string;
  readonly operacion: OperacionIdempotente;
  readonly huella: Buffer;
  readonly expiraEn: Date;
}

export interface RegistroIdempotencia {
  operacion: string;
  huellaSolicitud: Uint8Array;
  recursoId: string;
  expiraEn: Date;
}

export function prepararIdempotencia(
  clave: string,
  operacion: OperacionIdempotente,
  parametros: Readonly<Record<string, string>>,
  cuerpo: unknown,
  ahora: Date,
): Idempotencia {
  return {
    clave,
    operacion,
    huella: sha256({ operacion, parametros, cuerpo }),
    expiraEn: new Date(ahora.getTime() + DURACION_IDEMPOTENCIA_MS),
  };
}

/**
 * Decide qué hacer con un registro existente de la misma clave: devuelve el recurso que se debe
 * reproducir, o lanza si la clave caducó o se usó para otra operación o contenido.
 */
export function reproducible(registro: RegistroIdempotencia, solicitud: Idempotencia, ahora: Date): string {
  if (registro.expiraEn.getTime() <= ahora.getTime()) {
    throw new ErrorNegocio(
      "IDEMPOTENCIA_CADUCADA",
      "La clave de idempotencia caducó (24 h). Genere una clave nueva para repetir la operación.",
    );
  }
  if (registro.operacion !== solicitud.operacion || !Buffer.from(registro.huellaSolicitud).equals(solicitud.huella)) {
    throw new ErrorNegocio(
      "IDEMPOTENCIA_CONFLICTO",
      "La clave de idempotencia ya se usó para otra operación o con otro contenido.",
    );
  }
  return registro.recursoId;
}

export interface FuenteIdempotencia {
  buscarIdempotencia(
    ctx: { readonly organizacionId: string },
    autor: { readonly usuarioId: string },
    clave: string,
  ): Promise<RegistroIdempotencia | null>;
}

/**
 * Ejecuta un alta idempotente:
 * 1. si la clave ya tiene un éxito registrado, lo reproduce sin volver a crear;
 * 2. si no, crea (la función de la base registra la clave en la misma sentencia);
 * 3. si otra solicitud con la misma clave se confirmó entre tanto (clave primaria repetida),
 *    reproduce su resultado tras validar operación y contenido.
 */
export async function ejecutarIdempotente(
  fuente: FuenteIdempotencia,
  ctx: { readonly organizacionId: string },
  autor: { readonly usuarioId: string },
  idem: Idempotencia,
  ahora: Date,
  crear: () => Promise<string>,
): Promise<{ id: string; reproducida: boolean }> {
  const previo = await fuente.buscarIdempotencia(ctx, autor, idem.clave);
  if (previo) return { id: reproducible(previo, idem, ahora), reproducida: true };
  try {
    return { id: await crear(), reproducida: false };
  } catch (e) {
    if (reconocerErrorBase(e)?.tipo === "idempotencia_repetida") {
      const otro = await fuente.buscarIdempotencia(ctx, autor, idem.clave);
      if (otro) return { id: reproducible(otro, idem, ahora), reproducida: true };
    }
    throw traducirErrorBase(e);
  }
}
