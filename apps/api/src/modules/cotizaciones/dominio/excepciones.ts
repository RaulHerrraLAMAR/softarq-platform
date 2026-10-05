/**
 * Excepciones B-22 (módulo 10, ADR-0014). Funciones puras.
 *
 * Fuentes: Word maestro v1.3 §3.10/§3.11; `Exc_Registrar` (registro y rangos), `Exc_Resolver`
 * (autorización) de `modRevision.bas`; `Validar` (modos ENVIAR y estricto) y `Avisos` (AV-04) de
 * `modValidacion.bas`; `Motor_Modelo` (aplicación al calcular) de `modMotor.bas`.
 *
 * - Viven en el borrador y se congelan en la versión calculada (`captura.excepciones`). Su número
 *   es la posición (1…n) dentro de esa versión, inmutable.
 * - Al calcular se aplican como registradas (pendientes): el motor aplica pendientes y autorizadas.
 * - Enviar exige que estén registradas con motivo; aprobar y emitir, que estén AUTORIZADAS por un
 *   Revisor distinto del preparador. Una RECHAZADA impide aprobar esa versión (inmutable): se
 *   corrige en el borrador y se calcula una versión nueva.
 */
import {
  type CapturaBorrador,
  type DecisionExcepcion,
  type ExcepcionBorrador,
  type ExcepcionCalculo,
  type TipoExcepcion,
} from "@softarq/contracts";
import { dec } from "../../calculo/domain/decimal.js";
import type { ConceptoLeido } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Aviso, Problema } from "./verificacion.js";

export interface CampoInvalido {
  ruta: string;
  mensaje: string;
}

/** Identificador de la excepción N dentro de una versión (y de la partida, como `aSolicitudCalculo`). */
export const idExcepcion = (numero: number) => `EXC-${numero}`;
export const idPartida = (numero: number) => `P${String(numero).padStart(3, "0")}`;

/** Rango del valor aplicado (`Exc_Registrar`): rendimiento > 0; 0 <= desperdicio < 1. */
export function errorDeRango(x: ExcepcionBorrador): string | null {
  if (x.tipo !== "RENDIMIENTO") return null;
  const v = dec(x.valorAplicado);
  if (x.campo === "RENDIMIENTO") return v.gt(0) ? null : "El rendimiento aplicado debe ser mayor que cero.";
  return v.gte(0) && v.lt(1) ? null : "El desperdicio aplicado debe cumplir 0 <= d < 1.";
}

/**
 * Comprueba las excepciones de una captura frente a la propia captura y al catálogo.
 * - Siempre: rango, partida existente con ese concepto, precio elegido en la captura y concepto
 *   personalizado presente en las partidas (referencias huérfanas tras quitar una partida o un precio).
 * - Solo las NUEVAS (no presentes en `anterior`): componente activo del concepto y concepto de clase
 *   PERSONALIZADO. Una ya guardada se conserva aunque el catálogo cambie: el cálculo la bloquea (BL-05).
 */
export function validarExcepciones(
  c: CapturaBorrador,
  anterior: CapturaBorrador | null,
  conceptos: ReadonlyMap<string, ConceptoLeido>,
): CampoInvalido[] {
  const lista = c.excepciones ?? [];
  const previas = new Set((anterior?.excepciones ?? []).map((x) => JSON.stringify(x)));
  const errores: CampoInvalido[] = [];
  lista.forEach((x, i) => {
    const ruta = `excepciones.${i}`;
    const nueva = !previas.has(JSON.stringify(x));
    switch (x.tipo) {
      case "RENDIMIENTO": {
        const rango = errorDeRango(x);
        if (rango) errores.push({ ruta: `${ruta}.valorAplicado`, mensaje: rango });
        const p = c.partidas[x.partida - 1];
        if (!p || p.tipo !== "CONCEPTO" || p.conceptoCodigo !== x.conceptoCodigo) {
          errores.push({ ruta: `${ruta}.partida`, mensaje: `La partida ${x.partida} no existe o no es del concepto ${x.conceptoCodigo}.` });
          break;
        }
        const k = conceptos.get(x.conceptoCodigo);
        if (nueva && !k?.componentes.some((m) => m.activo && m.codigo === x.componenteCodigo)) {
          errores.push({ ruta: `${ruta}.componenteCodigo`, mensaje: `El componente ${x.componenteCodigo} no pertenece al concepto ${x.conceptoCodigo}.` });
        }
        break;
      }
      case "PRECIO_VENCIDO":
        if (!c.seleccion.some((s) => s.insumoCodigo === x.insumoCodigo && s.precioCodigo === x.precioCodigo)) {
          errores.push({ ruta: `${ruta}.precioCodigo`, mensaje: `El precio ${x.precioCodigo} no está elegido para el insumo ${x.insumoCodigo}.` });
        }
        break;
      case "CONCEPTO_PERSONALIZADO": {
        if (!c.partidas.some((p) => p.tipo === "CONCEPTO" && p.conceptoCodigo === x.conceptoCodigo)) {
          errores.push({ ruta: `${ruta}.conceptoCodigo`, mensaje: `La captura no usa el concepto ${x.conceptoCodigo}.` });
          break;
        }
        if (nueva && conceptos.get(x.conceptoCodigo)?.clase !== "PERSONALIZADO") {
          errores.push({ ruta: `${ruta}.conceptoCodigo`, mensaje: `El concepto ${x.conceptoCodigo} no es personalizado: no requiere excepción.` });
        }
        break;
      }
    }
  });
  return errores;
}

/** Excepciones que afectan al cálculo, con los identificadores de la solicitud (EXC-n, P00n). */
export function excepcionesParaCalculo(c: CapturaBorrador): ExcepcionCalculo[] {
  return (c.excepciones ?? []).flatMap((x, i): ExcepcionCalculo[] => {
    const id = idExcepcion(i + 1);
    if (x.tipo === "RENDIMIENTO") {
      return [{ tipo: "RENDIMIENTO", id, partidaId: idPartida(x.partida), componenteCodigo: x.componenteCodigo, campo: x.campo, valorAplicado: x.valorAplicado }];
    }
    if (x.tipo === "CONCEPTO_PERSONALIZADO") return [{ tipo: "CONCEPTO_PERSONALIZADO", id, conceptoCodigo: x.conceptoCodigo }];
    return [];
  });
}

/** La captura sin las excepciones (para quien no tiene `excepciones.consultar` y para vistas compartidas). */
export function sinExcepciones(c: CapturaBorrador): CapturaBorrador {
  if (c.excepciones === undefined) return c;
  const { excepciones: _, ...resto } = c;
  return resto;
}

/** Código de bloqueo de cada tipo cuando no está autorizada (`Validar`, modo estricto). */
const CODIGO_BLOQUEO: Record<TipoExcepcion, string> = {
  RENDIMIENTO: "BL-05",
  PRECIO_VENCIDO: "BL-09",
  CONCEPTO_PERSONALIZADO: "BL-04",
};

export function describirExcepcion(x: ExcepcionBorrador): string {
  switch (x.tipo) {
    case "RENDIMIENTO":
      return `${x.campo === "RENDIMIENTO" ? "rendimiento" : "desperdicio"} del componente ${x.componenteCodigo} en la partida ${x.partida} (${x.conceptoCodigo})`;
    case "PRECIO_VENCIDO":
      return `precio vencido ${x.precioCodigo} del insumo ${x.insumoCodigo}`;
    case "CONCEPTO_PERSONALIZADO":
      return `concepto personalizado ${x.conceptoCodigo}`;
  }
}

/**
 * Etiqueta sin datos técnicos para avisos y bloqueos: la verificación la ven también funciones sin
 * `excepciones.consultar`. El detalle (componente, campo y valores) está en la ruta interna.
 */
export function etiquetaExcepcion(x: ExcepcionBorrador): string {
  switch (x.tipo) {
    case "RENDIMIENTO":
      return `ajuste técnico de la partida ${x.partida}`;
    case "PRECIO_VENCIDO":
      return `precio vencido ${x.precioCodigo}`;
    case "CONCEPTO_PERSONALIZADO":
      return `concepto personalizado ${x.conceptoCodigo}`;
  }
}

/**
 * Bloqueos por el estado de las excepciones de una versión.
 * - Rechazada: bloquea en todos los modos (la versión no puede aprobarse; hace falta vN+1).
 * - Sin decisión: bloquea solo en modo estricto (aprobar, verificar en revisión y emitir).
 * El motivo lo garantiza el contrato (no hay excepciones sin motivo que comprobar aquí).
 */
export function bloqueosExcepciones(
  excepciones: readonly ExcepcionBorrador[],
  decisiones: ReadonlyMap<number, DecisionExcepcion>,
  estricto: boolean,
  idVersion: string,
): Problema[] {
  const r: Problema[] = [];
  excepciones.forEach((x, i) => {
    const n = i + 1;
    const d = decisiones.get(n);
    const codigo = CODIGO_BLOQUEO[x.tipo];
    if (d === "RECHAZADA") {
      r.push({
        codigo,
        referencia: idExcepcion(n),
        mensaje: `La excepción ${n} (${etiquetaExcepcion(x)}) fue rechazada por el revisor: corrija el borrador y calcule una versión nueva de ${idVersion}.`,
      });
    } else if (estricto && d !== "AUTORIZADA") {
      r.push({
        codigo,
        referencia: idExcepcion(n),
        mensaje: `La excepción ${n} (${etiquetaExcepcion(x)}) no está autorizada por el revisor.`,
      });
    }
  });
  return r;
}

/**
 * Precios eximidos de BL-09: con excepción PRECIO_VENCIDO autorizada (modo estricto) o registrada
 * y no rechazada (al enviar). D-11: «precio vencido bloquea salvo excepción».
 */
export function preciosConExcepcion(
  excepciones: readonly ExcepcionBorrador[],
  decisiones: ReadonlyMap<number, DecisionExcepcion>,
  estricto: boolean,
): Set<string> {
  const s = new Set<string>();
  excepciones.forEach((x, i) => {
    const d = decisiones.get(i + 1);
    if (x.tipo === "PRECIO_VENCIDO" && (d === "AUTORIZADA" || (!estricto && d === undefined))) s.add(x.precioCodigo);
  });
  return s;
}

/** AV-04: la versión tiene excepciones autorizadas (sin el motivo ni valores técnicos en el texto). */
export function av04(excepciones: readonly ExcepcionBorrador[], decisiones: ReadonlyMap<number, DecisionExcepcion>): Aviso[] {
  return excepciones.flatMap((x, i) =>
    decisiones.get(i + 1) === "AUTORIZADA"
      ? [{ codigo: "AV-04" as const, mensaje: `Excepción autorizada ${i + 1}: ${etiquetaExcepcion(x)}. Consulte su detalle y motivo en «Excepciones de la versión».` }]
      : [],
  );
}
