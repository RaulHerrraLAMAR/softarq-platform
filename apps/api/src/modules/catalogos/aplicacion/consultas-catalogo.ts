/**
 * Consultas de catálogo para preparar una cotización (capa de aplicación, sin Nest ni HTTP).
 * Las respuestas se construyen campo por campo (lista explícita): nunca se serializan filas de
 * la base ni se publican precios, contenidos, rendimientos, desperdicios, tarifas o costos.
 */
import type {
  FechaISO,
  RespuestaConceptos,
  RespuestaOpcionesPrecio,
  RespuestaTiposAdicional,
} from "@softarq/contracts";
import { LIMITES_API } from "@softarq/contracts";
import { Dec } from "../../calculo/domain/decimal.js";
import type {
  ContextoOrganizacion,
  OpcionPrecioLeida,
  RepositorioCatalogos,
} from "../persistencia/repositorio-catalogos.js";

/** Tope de opciones de precio leídas por consulta (protección del servidor). */
const MAXIMO_OPCIONES = 500;

export async function consultarConceptos(
  repo: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  consulta: { buscar?: string | undefined; limite?: number | undefined },
): Promise<RespuestaConceptos> {
  const limite = consulta.limite ?? LIMITES_API.limiteListadoPorOmision;
  const conceptos = await repo.listarConceptosDisponibles(ctx, {
    ...(consulta.buscar ? { buscar: consulta.buscar } : {}),
    limite,
  });
  return {
    conceptos: conceptos.map((c) => ({
      codigo: c.codigo,
      clase: c.clase,
      descripcion: c.descripcion,
      unidad: c.unidad,
      tipoFormula: c.tipoFormula,
      permiteDescuento: c.permiteDescuento,
      insumos: unicosPorCodigo(c.insumos).map((i) => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidadBase: i.unidadBase,
      })),
    })),
    limite,
  };
}

export type ResultadoOpcionesPrecio =
  | { estado: "OK"; respuesta: RespuestaOpcionesPrecio }
  | { estado: "NO_ENCONTRADO"; faltantes: { tipo: string; codigo: string }[] };

export async function consultarOpcionesPrecio(
  repo: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  conceptoCodigos: readonly string[],
  fecha: FechaISO,
): Promise<ResultadoOpcionesPrecio> {
  const conceptos = await repo.listarConceptosDisponibles(ctx, {
    codigos: conceptoCodigos,
    limite: LIMITES_API.conceptosPorConsulta,
  });
  const encontrados = new Set(conceptos.map((c) => c.codigo));
  const faltantes = conceptoCodigos.filter((c) => !encontrados.has(c)).map((codigo) => ({ tipo: "concepto", codigo }));
  if (faltantes.length > 0) return { estado: "NO_ENCONTRADO", faltantes };

  // Insumos requeridos (en el orden de los conceptos) y conceptos que usan cada uno.
  const insumos = new Map<string, { descripcion: string; unidadBase: string; conceptos: string[] }>();
  for (const c of conceptos) {
    for (const i of c.insumos) {
      const actual = insumos.get(i.codigo) ?? { descripcion: i.descripcion, unidadBase: i.unidadBase, conceptos: [] };
      if (!actual.conceptos.includes(c.codigo)) actual.conceptos.push(c.codigo);
      insumos.set(i.codigo, actual);
    }
  }
  const opciones = await repo.obtenerOpcionesPrecio(ctx, [...insumos.keys()], fecha, MAXIMO_OPCIONES);
  const menorPorProducto = menorPrecioPorProducto(opciones);

  return {
    estado: "OK",
    respuesta: {
      fechaReferencia: fecha,
      insumos: [...insumos.entries()].map(([codigo, i]) => ({
        insumoCodigo: codigo,
        insumoDescripcion: i.descripcion,
        unidadBase: i.unidadBase,
        conceptos: i.conceptos,
        opciones: opciones
          .filter((o) => o.insumoCodigo === codigo)
          .map((o) => ({
            precioCodigo: o.precioCodigo,
            productoCodigo: o.productoCodigo,
            producto: o.producto,
            presentacion: o.presentacion,
            unidadCompra: o.unidadCompra,
            proveedorCodigo: o.proveedorCodigo,
            proveedor: o.proveedor,
            vigenteHasta: o.vigenteHasta,
            // Marcador «(*)» del libro: el precio en sí no se publica.
            esMenorPrecio: new Dec(o.precioUnitario).eq(menorPorProducto.get(o.productoCodigo)!),
          })),
      })),
    },
  };
}

export async function consultarTiposAdicional(
  repo: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  consulta: { limite?: number | undefined },
): Promise<RespuestaTiposAdicional> {
  const limite = consulta.limite ?? LIMITES_API.limiteListadoPorOmision;
  const tipos = await repo.listarTiposAdicional(ctx, limite);
  return {
    tiposAdicional: tipos.map((t) => ({
      codigo: t.codigo,
      categoria: t.categoria,
      descripcion: t.descripcion,
      unidad: t.unidad,
    })),
    limite,
  };
}

/** Menor precio vigente de cada producto (Compras_MenorPrecio del libro). */
function menorPrecioPorProducto(opciones: readonly OpcionPrecioLeida[]): Map<string, InstanceType<typeof Dec>> {
  const menor = new Map<string, InstanceType<typeof Dec>>();
  for (const o of opciones) {
    const p = new Dec(o.precioUnitario);
    const actual = menor.get(o.productoCodigo);
    if (!actual || p.lt(actual)) menor.set(o.productoCodigo, p);
  }
  return menor;
}

function unicosPorCodigo<T extends { codigo: string }>(lista: readonly T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((x) => (vistos.has(x.codigo) ? false : (vistos.add(x.codigo), true)));
}
