/**
 * Caso de uso «cálculo DEMO» (capa de aplicación, sin Nest ni HTTP).
 *
 * 1. Recibe la captura validada (`SolicitudCalculoDemo`) y la fecha de cálculo decidida por la
 *    aplicación (nunca por el cliente ni por el dominio).
 * 2. Arma la entrada desde PostgreSQL con `construirEntradaCalculo` (precios, consumos y
 *    parámetros salen de la base; la selección de precios es explícita).
 * 3. Calcula con el motor y devuelve SOLO la proyección comercial y avisos sin importes.
 *
 * No escribe cotizaciones ni modifica catálogos.
 */
import type {
  AvisoCalculo,
  FechaISO,
  RespuestaCalculoDemo,
  SolicitudCalculoDemo,
} from "@softarq/contracts";
import type { ContextoOrganizacion, RepositorioCatalogos } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { calcularCotizacion } from "../domain/motor.js";
import { aVistaComercial } from "../domain/vista-comercial.js";
import { construirEntradaCalculo, type SolicitudCalculo } from "./construir-entrada.js";

export type ResultadoCalculoDemo =
  | { estado: "CALCULADO"; respuesta: RespuestaCalculoDemo }
  | { estado: "BLOQUEADO"; problemas: { codigo: string; referencia: string; mensaje: string }[] }
  | { estado: "ENTRADA_INVALIDA"; campos: { ruta: string; mensaje: string }[] }
  | { estado: "NO_ENCONTRADO"; faltantes: { tipo: string; codigo: string }[] };

export async function calcularDemo(
  repo: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  solicitud: SolicitudCalculoDemo,
  fechaCalculo: FechaISO,
): Promise<ResultadoCalculoDemo> {
  const ensamblado = await construirEntradaCalculo(repo, ctx, aSolicitudCalculo(solicitud, fechaCalculo));
  if (ensamblado.estado === "NO_ENCONTRADO") return { estado: "NO_ENCONTRADO", faltantes: ensamblado.faltantes };
  if (ensamblado.estado === "BLOQUEADO") return { estado: "BLOQUEADO", problemas: problemas(ensamblado.problemas) };

  const r = calcularCotizacion(ensamblado.entrada);
  switch (r.estado) {
    case "ENTRADA_INVALIDA":
      // Reglas de captura del motor (p. ej. AREA con ancho y alto): error de la solicitud.
      return { estado: "ENTRADA_INVALIDA", campos: r.errores.map((e) => ({ ruta: e.ruta, mensaje: e.mensaje })) };
    case "BLOQUEADO":
      return { estado: "BLOQUEADO", problemas: problemas(r.problemas) };
    case "CALCULADO":
      return {
        estado: "CALCULADO",
        respuesta: {
          estado: "CALCULADO",
          fechaCalculo,
          cotizacion: aVistaComercial(r),
          avisos: avisosPublicos(r.avisos),
        },
      };
  }
}

/** La captura HTTP solo trae medidas, códigos y opciones editables; el resto lo pone el servidor. */
function aSolicitudCalculo(s: SolicitudCalculoDemo, fechaCalculo: FechaISO): SolicitudCalculo {
  return {
    fechaCalculo,
    consolidarCompras: s.consolidarCompras,
    partidas: s.partidas.map((p) =>
      p.tipo === "CONCEPTO"
        ? {
            id: p.id,
            tipo: "CONCEPTO",
            conceptoCodigo: p.conceptoCodigo,
            ...(p.descripcion !== undefined ? { descripcion: p.descripcion } : {}),
            mediciones: p.mediciones.map((m) => ({ ...m })),
          }
        : {
            id: p.id,
            tipo: "ADICIONAL",
            tipoAdicionalCodigo: p.tipoAdicionalCodigo,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            monto: p.monto,
          },
    ),
    preciosElegidos: [...s.preciosElegidos],
    excepciones: [],
  };
}

/** Lista explícita: código, referencia y mensaje (los mensajes del motor no contienen importes). */
function problemas(lista: readonly { codigo: string; referencia: string; mensaje: string }[]) {
  return lista.map((p) => ({ codigo: p.codigo, referencia: p.referencia, mensaje: p.mensaje }));
}

/**
 * Los avisos internos mencionan precios (AV-01) y productos o sobrantes (AV-03); hacia el cliente
 * se publican reescritos, sin importes ni datos de compra.
 */
function avisosPublicos(avisos: readonly AvisoCalculo[]): RespuestaCalculoDemo["avisos"] {
  const publicos: RespuestaCalculoDemo["avisos"] = [];
  for (const a of avisos) {
    if (a.codigo === "AV-01") {
      publicos.push({ codigo: "AV-01", mensaje: `El precio elegido para el insumo ${a.referencia} no es el menor vigente.` });
    }
  }
  if (avisos.some((a) => a.codigo === "AV-03")) {
    publicos.push({
      codigo: "AV-03",
      mensaje: "Hay sobrante por redondeo de presentaciones de compra; se informa y no se descuenta.",
    });
  }
  return publicos;
}
