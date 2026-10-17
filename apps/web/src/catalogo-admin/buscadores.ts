/**
 * Buscadores del selector de registros (módulos 11 y 12): adaptan los listados `/admin` (búsqueda en
 * el servidor y cursor por código) a las opciones del selector. Solo registros activos se ofrecen;
 * la selección actual inactiva la muestra el propio selector.
 */
import type { ResultadoApi } from "../api/cliente.ts";
import type { BuscarRegistros, OpcionRegistro } from "./SelectorRegistro.tsx";
import type { ServiciosCatalogoAdmin } from "./servicios.ts";

type Pagina = { opciones: OpcionRegistro[]; siguiente: string | null };

function adaptar<T>(r: ResultadoApi<T>, a: (d: T) => Pagina): ResultadoApi<Pagina> {
  return r.ok ? { ok: true, datos: a(r.datos) } : r;
}

const filtro = (texto: string, despuesDe: string | undefined) => ({
  ...(texto ? { buscar: texto } : {}),
  ...(despuesDe ? { despuesDe } : {}),
});

export function buscarProductos(s: ServiciosCatalogoAdmin): BuscarRegistros {
  return async (texto, despuesDe, signal) =>
    adaptar(await s.listarProductos(filtro(texto, despuesDe), signal), (d) => ({
      opciones: d.productos.map((p) => ({ codigo: p.codigo, texto: `${p.codigo} · ${p.descripcion} · ${p.presentacion}`, disponible: p.activo, detalle: p.unidadCompra })),
      siguiente: d.siguiente,
    }));
}

export function buscarProveedores(s: ServiciosCatalogoAdmin): BuscarRegistros {
  return async (texto, despuesDe, signal) =>
    adaptar(await s.listarProveedores(filtro(texto, despuesDe), signal), (d) => ({
      opciones: d.proveedores.map((p) => ({ codigo: p.codigo, texto: `${p.codigo} · ${p.nombre}`, disponible: p.activo })),
      siguiente: d.siguiente,
    }));
}

export function buscarInsumos(s: ServiciosCatalogoAdmin): BuscarRegistros {
  return async (texto, despuesDe, signal) =>
    adaptar(await s.listarInsumos(filtro(texto, despuesDe), signal), (d) => ({
      opciones: d.insumos.map((i) => ({ codigo: i.codigo, texto: `${i.codigo} · ${i.descripcion} (${i.unidadBase})`, disponible: i.activo, detalle: i.unidadBase })),
      siguiente: d.siguiente,
    }));
}
