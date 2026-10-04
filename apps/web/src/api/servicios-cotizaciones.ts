/**
 * Endpoints de clientes, proyectos y cotizaciones (ADR-0008). Solo construyen la ruta, eligen el
 * esquema de respuesta y añaden la `Idempotency-Key` que reciben: la clave la crea quien expresa la
 * intención (un botón) y la reutiliza en los reintentos; nunca se genera aquí por solicitud.
 */
import {
  CABECERA_IDEMPOTENCIA,
  EsquemaCliente,
  EsquemaDetalleCliente,
  EsquemaDetalleCotizacion,
  EsquemaProyecto,
  EsquemaRespuestaBorradorGuardado,
  EsquemaRespuestaClientes,
  EsquemaRespuestaCotizaciones,
  EsquemaRespuestaProyectos,
  EsquemaVersion,
  EsquemaDetalleRevision,
  EsquemaRespuestaRevisiones,
  EsquemaDetalleEmision,
  EsquemaEmisor,
  EsquemaValidacionEmision,
  type DetalleEmision,
  type EdicionEmisor,
  type Emisor,
  type ValidacionEmision,
  type CapturaBorrador,
  type DecisionRevision,
  type DetalleRevision,
  type EstadoRevision,
  type RespuestaRevisiones,
  type Cliente,
  type DetalleCliente,
  type DetalleCotizacion,
  type Proyecto,
  type RespuestaBorradorGuardado,
  type RespuestaClientes,
  type RespuestaCotizaciones,
  type RespuestaProyectos,
  type Version,
} from "@softarq/contracts";
import type { ClienteApi, ResultadoApi } from "./cliente.ts";

export interface DatosProyecto {
  nombre: string;
  municipio: string | null;
  entidadFederativa: string | null;
  descripcion: string | null;
}

/** Contacto del cliente (BL-01; módulo 8): `null` = sin capturar. */
export interface DatosContacto {
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoCorreo: string | null;
}

export interface ServiciosCotizaciones {
  listarClientes(f: { buscar?: string; incluirInactivos?: boolean }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaClientes>>;
  detalleCliente(id: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleCliente>>;
  crearCliente(datos: { nombre: string } & Partial<DatosContacto>, clave: string): Promise<ResultadoApi<Cliente>>;
  editarCliente(
    id: string,
    cambios: { revision: number; nombre?: string; activo?: boolean } & Partial<DatosContacto>,
  ): Promise<ResultadoApi<Cliente>>;
  listarProyectos(
    f: { clienteId?: string; buscar?: string; incluirInactivos?: boolean },
    signal?: AbortSignal,
  ): Promise<ResultadoApi<RespuestaProyectos>>;
  crearProyecto(clienteId: string, datos: DatosProyecto, clave: string): Promise<ResultadoApi<Proyecto>>;
  editarProyecto(id: string, cambios: Partial<DatosProyecto> & { revision: number; activo?: boolean }): Promise<ResultadoApi<Proyecto>>;
  listarCotizaciones(f: { buscar?: string }, signal?: AbortSignal): Promise<ResultadoApi<RespuestaCotizaciones>>;
  crearCotizacion(proyectoId: string, captura: CapturaBorrador | null, clave: string): Promise<ResultadoApi<DetalleCotizacion>>;
  detalleCotizacion(id: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleCotizacion>>;
  guardarBorrador(id: string, revision: number, captura: CapturaBorrador): Promise<ResultadoApi<RespuestaBorradorGuardado>>;
  crearVersion(id: string, revisionBorrador: number, motivo: string | null, clave: string): Promise<ResultadoApi<Version>>;
  consultarVersion(id: string, numero: number, signal?: AbortSignal): Promise<ResultadoApi<Version>>;
  // Revisión (módulo 7, ADR-0009). La identidad sale de la sesión: los cuerpos no la llevan.
  enviarRevision(id: string, numero: number, revisionBorrador: number, clave: string): Promise<ResultadoApi<DetalleRevision>>;
  listarRevisiones(estado: EstadoRevision, signal?: AbortSignal): Promise<ResultadoApi<RespuestaRevisiones>>;
  detalleRevision(id: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleRevision>>;
  decidirRevision(
    id: string,
    d: { decision: DecisionRevision; versionId: string; revision: number; observaciones: string | null },
    clave: string,
  ): Promise<ResultadoApi<DetalleRevision>>;
  retirarRevision(id: string, revision: number, motivo: string | null, clave: string): Promise<ResultadoApi<DetalleRevision>>;
  // Emisión, anulación, descarte y emisor (módulo 8, ADR-0010).
  anularAprobacion(id: string, revision: number, motivo: string, clave: string): Promise<ResultadoApi<DetalleRevision>>;
  descartarCotizacion(id: string, motivo: string, clave: string): Promise<ResultadoApi<DetalleCotizacion>>;
  validarEmision(id: string, numero: number, signal?: AbortSignal): Promise<ResultadoApi<ValidacionEmision>>;
  emitir(id: string, numero: number, d: { versionId: string; revisionId: string }, clave: string): Promise<ResultadoApi<DetalleEmision>>;
  detalleEmision(id: string, signal?: AbortSignal): Promise<ResultadoApi<DetalleEmision>>;
  descargarDocumento(emisionId: string): Promise<ResultadoApi<Blob>>;
  emisor(signal?: AbortSignal): Promise<ResultadoApi<Emisor>>;
  guardarEmisor(datos: EdicionEmisor): Promise<ResultadoApi<Emisor>>;
}

const conClave = (clave: string) => ({ [CABECERA_IDEMPOTENCIA]: clave });

function consulta(f: Record<string, string | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false || v === "") continue;
    q.set(k, String(v));
  }
  const t = q.toString();
  return t ? `?${t}` : "";
}

const recortar = (t?: string) => (t === undefined ? undefined : t.trim().slice(0, 60));

export function crearServiciosCotizaciones(cliente: ClienteApi): ServiciosCotizaciones {
  return {
    listarClientes: (f, signal) =>
      cliente.obtener(
        `/api/v1/clientes${consulta({ buscar: recortar(f.buscar), incluirInactivos: f.incluirInactivos })}`,
        EsquemaRespuestaClientes,
        { signal },
      ),
    detalleCliente: (id, signal) => cliente.obtener(`/api/v1/clientes/${encodeURIComponent(id)}`, EsquemaDetalleCliente, { signal }),
    crearCliente: (datos, clave) => cliente.enviar("/api/v1/clientes", EsquemaCliente, { cuerpo: datos, cabeceras: conClave(clave) }),
    editarCliente: (id, cambios) =>
      cliente.enviar(`/api/v1/clientes/${encodeURIComponent(id)}`, EsquemaCliente, { metodo: "PATCH", cuerpo: cambios }),
    listarProyectos: (f, signal) =>
      cliente.obtener(
        `/api/v1/proyectos${consulta({ clienteId: f.clienteId, buscar: recortar(f.buscar), incluirInactivos: f.incluirInactivos })}`,
        EsquemaRespuestaProyectos,
        { signal },
      ),
    crearProyecto: (clienteId, datos, clave) =>
      cliente.enviar("/api/v1/proyectos", EsquemaProyecto, { cuerpo: { clienteId, ...datos }, cabeceras: conClave(clave) }),
    editarProyecto: (id, cambios) =>
      cliente.enviar(`/api/v1/proyectos/${encodeURIComponent(id)}`, EsquemaProyecto, { metodo: "PATCH", cuerpo: cambios }),
    listarCotizaciones: (f, signal) =>
      cliente.obtener(`/api/v1/cotizaciones${consulta({ buscar: recortar(f.buscar) })}`, EsquemaRespuestaCotizaciones, { signal }),
    crearCotizacion: (proyectoId, captura, clave) =>
      cliente.enviar("/api/v1/cotizaciones", EsquemaDetalleCotizacion, {
        cuerpo: { proyectoId, ...(captura ? { captura } : {}) },
        cabeceras: conClave(clave),
      }),
    detalleCotizacion: (id, signal) =>
      cliente.obtener(`/api/v1/cotizaciones/${encodeURIComponent(id)}`, EsquemaDetalleCotizacion, { signal }),
    guardarBorrador: (id, revision, captura) =>
      cliente.enviar(`/api/v1/cotizaciones/${encodeURIComponent(id)}/borrador`, EsquemaRespuestaBorradorGuardado, {
        metodo: "PUT",
        cuerpo: { revision, captura },
      }),
    crearVersion: (id, revisionBorrador, motivo, clave) =>
      cliente.enviar(`/api/v1/cotizaciones/${encodeURIComponent(id)}/versiones`, EsquemaVersion, {
        cuerpo: { revisionBorrador, ...(motivo ? { motivo } : {}) },
        cabeceras: conClave(clave),
        tiempoMaximo: 30_000,
      }),
    consultarVersion: (id, numero, signal) =>
      cliente.obtener(`/api/v1/cotizaciones/${encodeURIComponent(id)}/versiones/${numero}`, EsquemaVersion, { signal }),
    enviarRevision: (id, numero, revisionBorrador, clave) =>
      cliente.enviar(`/api/v1/cotizaciones/${encodeURIComponent(id)}/versiones/${numero}/revisiones`, EsquemaDetalleRevision, {
        cuerpo: { revisionBorrador },
        cabeceras: conClave(clave),
        tiempoMaximo: 30_000,
      }),
    listarRevisiones: (estado, signal) =>
      cliente.obtener(`/api/v1/revisiones${consulta({ estado })}`, EsquemaRespuestaRevisiones, { signal }),
    detalleRevision: (id, signal) =>
      cliente.obtener(`/api/v1/revisiones/${encodeURIComponent(id)}`, EsquemaDetalleRevision, { signal, tiempoMaximo: 30_000 }),
    decidirRevision: (id, d, clave) =>
      cliente.enviar(`/api/v1/revisiones/${encodeURIComponent(id)}/decision`, EsquemaDetalleRevision, {
        cuerpo: { decision: d.decision, versionId: d.versionId, revision: d.revision, ...(d.observaciones ? { observaciones: d.observaciones } : {}) },
        cabeceras: conClave(clave),
        tiempoMaximo: 30_000,
      }),
    retirarRevision: (id, revision, motivo, clave) =>
      cliente.enviar(`/api/v1/revisiones/${encodeURIComponent(id)}/retiro`, EsquemaDetalleRevision, {
        cuerpo: { revision, ...(motivo ? { motivo } : {}) },
        cabeceras: conClave(clave),
      }),
    anularAprobacion: (id, revision, motivo, clave) =>
      cliente.enviar(`/api/v1/revisiones/${encodeURIComponent(id)}/anulacion`, EsquemaDetalleRevision, {
        cuerpo: { revision, motivo },
        cabeceras: conClave(clave),
      }),
    descartarCotizacion: (id, motivo, clave) =>
      cliente.enviar(`/api/v1/cotizaciones/${encodeURIComponent(id)}/descarte`, EsquemaDetalleCotizacion, {
        cuerpo: { motivo },
        cabeceras: conClave(clave),
      }),
    validarEmision: (id, numero, signal) =>
      cliente.obtener(`/api/v1/cotizaciones/${encodeURIComponent(id)}/versiones/${numero}/emision/validacion`, EsquemaValidacionEmision, {
        signal,
        tiempoMaximo: 30_000,
      }),
    emitir: (id, numero, d, clave) =>
      cliente.enviar(`/api/v1/cotizaciones/${encodeURIComponent(id)}/versiones/${numero}/emision`, EsquemaDetalleEmision, {
        cuerpo: { versionId: d.versionId, revisionId: d.revisionId },
        cabeceras: conClave(clave),
        tiempoMaximo: 60_000,
      }),
    detalleEmision: (id, signal) => cliente.obtener(`/api/v1/emisiones/${encodeURIComponent(id)}`, EsquemaDetalleEmision, { signal }),
    descargarDocumento: (emisionId) =>
      cliente.descargar(`/api/v1/emisiones/${encodeURIComponent(emisionId)}/documento`, "application/pdf", { tiempoMaximo: 30_000 }),
    emisor: (signal) => cliente.obtener("/api/v1/emisor", EsquemaEmisor, { signal }),
    guardarEmisor: (datos) => cliente.enviar("/api/v1/emisor", EsquemaEmisor, { metodo: "PUT", cuerpo: datos }),
  };
}
