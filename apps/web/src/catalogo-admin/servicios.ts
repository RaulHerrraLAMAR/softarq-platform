/**
 * Endpoints de la administración de catálogos (módulo 11, ADR-0015): `/api/v1/admin/...`, solo con
 * la capacidad `catalogos.administrar`. Contrato INTERNO (importes de proveedor y tarifas): estas
 * respuestas no se mezclan con la proyección comercial ni con la calculadora.
 *
 * Solo construyen la ruta, eligen el esquema de respuesta y añaden la `Idempotency-Key` que reciben:
 * la clave la crea quien expresa la intención (un botón) y la reutiliza en los reintentos.
 */
import {
  CABECERA_IDEMPOTENCIA,
  EsquemaConceptoTarifaAdmin,
  EsquemaDetallePrecioAdmin,
  EsquemaDetalleProductoAdmin,
  EsquemaDetalleProveedorAdmin,
  EsquemaDetalleTarifaAdmin,
  EsquemaPrecioAdmin,
  EsquemaProductoAdmin,
  EsquemaProveedorAdmin,
  EsquemaRespuestaCierreVigencia,
  EsquemaRespuestaConceptosAdmin,
  EsquemaRespuestaInsumosAdmin,
  EsquemaRespuestaPreciosAdmin,
  EsquemaRespuestaProductosAdmin,
  EsquemaRespuestaProveedoresAdmin,
  EsquemaRespuestaTarifasAdmin,
  EsquemaRespuestaUnidades,
  EsquemaTarifaAdmin,
  type AsignacionTarifa,
  type CierreVigenciaPrecio,
  type ConceptoTarifaAdmin,
  type DetallePrecioAdmin,
  type DetalleProductoAdmin,
  type DetalleProveedorAdmin,
  type DetalleTarifaAdmin,
  type EdicionProducto,
  type EdicionProveedor,
  type EstadoPrecio,
  type ModalidadManoObra,
  type PrecioAdmin,
  type ProductoAdmin,
  type ProveedorAdmin,
  type RespuestaCierreVigencia,
  type RespuestaConceptosAdmin,
  type RespuestaInsumosAdmin,
  type RespuestaPreciosAdmin,
  type RespuestaProductosAdmin,
  type RespuestaProveedoresAdmin,
  type RespuestaTarifasAdmin,
  type RespuestaUnidades,
  type SolicitudPrecio,
  type SolicitudProducto,
  type SolicitudProveedor,
  type SolicitudTarifa,
  type TarifaAdmin,
} from "@softarq/contracts";
import type { ClienteApi, ResultadoApi } from "../api/cliente.ts";

export interface FiltroListado {
  buscar?: string;
  despuesDe?: string;
}

export interface ServiciosCatalogoAdmin {
  listarProveedores(f: FiltroListado & { incluirInactivos?: boolean }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaProveedoresAdmin>>;
  detalleProveedor(codigo: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleProveedorAdmin>>;
  crearProveedor(datos: SolicitudProveedor, clave: string): Promise<ResultadoApi<ProveedorAdmin>>;
  editarProveedor(codigo: string, cambios: EdicionProveedor): Promise<ResultadoApi<ProveedorAdmin>>;
  listarProductos(f: FiltroListado & { incluirInactivos?: boolean; insumoCodigo?: string }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaProductosAdmin>>;
  detalleProducto(codigo: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleProductoAdmin>>;
  crearProducto(datos: SolicitudProducto, clave: string): Promise<ResultadoApi<ProductoAdmin>>;
  editarProducto(codigo: string, cambios: EdicionProducto): Promise<ResultadoApi<ProductoAdmin>>;
  listarPrecios(f: FiltroListado & { estado?: EstadoPrecio; productoCodigo?: string }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaPreciosAdmin>>;
  detallePrecio(codigo: string, signal?: AbortSignal): Promise<ResultadoApi<DetallePrecioAdmin>>;
  registrarPrecio(datos: SolicitudPrecio, clave: string): Promise<ResultadoApi<PrecioAdmin>>;
  anularPrecio(codigo: string, d: { revision: number; motivo: string }, clave: string): Promise<ResultadoApi<PrecioAdmin>>;
  cerrarVigencia(codigo: string, d: CierreVigenciaPrecio, clave: string): Promise<ResultadoApi<RespuestaCierreVigencia>>;
  listarTarifas(f: FiltroListado & { incluirInactivas?: boolean; unidad?: string; modalidad?: ModalidadManoObra }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaTarifasAdmin>>;
  detalleTarifa(codigo: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleTarifaAdmin>>;
  registrarTarifa(datos: SolicitudTarifa, clave: string): Promise<ResultadoApi<TarifaAdmin>>;
  cambiarActivaTarifa(codigo: string, d: { revision: number; activa: boolean }): Promise<ResultadoApi<TarifaAdmin>>;
  listarConceptos(f: FiltroListado, signal?: AbortSignal): Promise<ResultadoApi<RespuestaConceptosAdmin>>;
  asignarTarifa(concepto: string, d: AsignacionTarifa, clave: string): Promise<ResultadoApi<ConceptoTarifaAdmin>>;
  listarInsumos(f: FiltroListado, signal?: AbortSignal): Promise<ResultadoApi<RespuestaInsumosAdmin>>;
  unidades(signal?: AbortSignal): Promise<ResultadoApi<RespuestaUnidades>>;
}

const conClave = (clave: string) => ({ [CABECERA_IDEMPOTENCIA]: clave });
const LIMITE = 50;

function consulta(f: Record<string, string | boolean | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false || v === "") continue;
    q.set(k, String(v));
  }
  return `?${q.toString()}`;
}

const recortar = (t?: string) => (t === undefined ? undefined : t.trim().slice(0, 60));
const ruta = (base: string, codigo: string, resto = "") => `/api/v1/admin/${base}/${encodeURIComponent(codigo)}${resto}`;

export function crearServiciosCatalogoAdmin(cliente: ClienteApi): ServiciosCatalogoAdmin {
  return {
    listarProveedores: (f, signal) =>
      cliente.obtener(
        `/api/v1/admin/proveedores${consulta({ buscar: recortar(f.buscar), incluirInactivos: f.incluirInactivos, despuesDe: f.despuesDe, limite: LIMITE })}`,
        EsquemaRespuestaProveedoresAdmin,
        { signal },
      ),
    detalleProveedor: (codigo, signal) => cliente.obtener(ruta("proveedores", codigo), EsquemaDetalleProveedorAdmin, { signal }),
    crearProveedor: (datos, clave) => cliente.enviar("/api/v1/admin/proveedores", EsquemaProveedorAdmin, { cuerpo: datos, cabeceras: conClave(clave) }),
    editarProveedor: (codigo, cambios) => cliente.enviar(ruta("proveedores", codigo), EsquemaProveedorAdmin, { metodo: "PATCH", cuerpo: cambios }),
    listarProductos: (f, signal) =>
      cliente.obtener(
        `/api/v1/admin/productos${consulta({ buscar: recortar(f.buscar), incluirInactivos: f.incluirInactivos, insumoCodigo: f.insumoCodigo, despuesDe: f.despuesDe, limite: LIMITE })}`,
        EsquemaRespuestaProductosAdmin,
        { signal },
      ),
    detalleProducto: (codigo, signal) => cliente.obtener(ruta("productos", codigo), EsquemaDetalleProductoAdmin, { signal }),
    crearProducto: (datos, clave) => cliente.enviar("/api/v1/admin/productos", EsquemaProductoAdmin, { cuerpo: datos, cabeceras: conClave(clave) }),
    editarProducto: (codigo, cambios) => cliente.enviar(ruta("productos", codigo), EsquemaProductoAdmin, { metodo: "PATCH", cuerpo: cambios }),
    listarPrecios: (f, signal) =>
      cliente.obtener(
        `/api/v1/admin/precios${consulta({ buscar: recortar(f.buscar), estado: f.estado, productoCodigo: f.productoCodigo, despuesDe: f.despuesDe, limite: LIMITE })}`,
        EsquemaRespuestaPreciosAdmin,
        { signal },
      ),
    detallePrecio: (codigo, signal) => cliente.obtener(ruta("precios", codigo), EsquemaDetallePrecioAdmin, { signal }),
    registrarPrecio: (datos, clave) => cliente.enviar("/api/v1/admin/precios", EsquemaPrecioAdmin, { cuerpo: datos, cabeceras: conClave(clave) }),
    anularPrecio: (codigo, d, clave) => cliente.enviar(ruta("precios", codigo, "/anulacion"), EsquemaPrecioAdmin, { cuerpo: d, cabeceras: conClave(clave) }),
    cerrarVigencia: (codigo, d, clave) =>
      cliente.enviar(ruta("precios", codigo, "/cierre-vigencia"), EsquemaRespuestaCierreVigencia, { cuerpo: d, cabeceras: conClave(clave) }),
    listarTarifas: (f, signal) =>
      cliente.obtener(
        `/api/v1/admin/tarifas${consulta({ buscar: recortar(f.buscar), incluirInactivas: f.incluirInactivas, unidad: f.unidad, modalidad: f.modalidad, despuesDe: f.despuesDe, limite: LIMITE })}`,
        EsquemaRespuestaTarifasAdmin,
        { signal },
      ),
    detalleTarifa: (codigo, signal) => cliente.obtener(ruta("tarifas", codigo), EsquemaDetalleTarifaAdmin, { signal }),
    registrarTarifa: (datos, clave) => cliente.enviar("/api/v1/admin/tarifas", EsquemaTarifaAdmin, { cuerpo: datos, cabeceras: conClave(clave) }),
    cambiarActivaTarifa: (codigo, d) => cliente.enviar(ruta("tarifas", codigo), EsquemaTarifaAdmin, { metodo: "PATCH", cuerpo: d }),
    listarConceptos: (f, signal) =>
      cliente.obtener(`/api/v1/admin/conceptos${consulta({ buscar: recortar(f.buscar), despuesDe: f.despuesDe, limite: LIMITE })}`, EsquemaRespuestaConceptosAdmin, { signal }),
    asignarTarifa: (concepto, d, clave) =>
      cliente.enviar(ruta("conceptos", concepto, "/tarifa"), EsquemaConceptoTarifaAdmin, { cuerpo: d, cabeceras: conClave(clave) }),
    listarInsumos: (f, signal) =>
      cliente.obtener(`/api/v1/admin/insumos${consulta({ buscar: recortar(f.buscar), despuesDe: f.despuesDe, limite: 100 })}`, EsquemaRespuestaInsumosAdmin, { signal }),
    unidades: (signal) => cliente.obtener("/api/v1/admin/unidades", EsquemaRespuestaUnidades, { signal }),
  };
}
