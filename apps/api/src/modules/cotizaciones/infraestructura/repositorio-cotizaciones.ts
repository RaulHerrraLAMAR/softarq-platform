/**
 * Repositorio de clientes, proyectos y cotizaciones (ADR-0008).
 *
 * - Toda consulta lleva `organizacion_id` de la sesión DENTRO del `where`: un id de otra
 *   organización se comporta igual que uno inexistente.
 * - Lecturas con Prisma (parametrizadas). Escrituras con las funciones PL/pgSQL de la migración,
 *   invocadas con `$queryRaw` de plantilla (parámetros enlazados, nunca texto concatenado): cada
 *   alta o edición es UNA sentencia atómica con su evento y su registro de idempotencia.
 * - Las columnas internas de las versiones (entrada y resultado del cálculo) solo se leen para el
 *   servidor; ningún método de consulta comercial las devuelve. La única excepción es
 *   `obtenerVersionInterna`, para el contrato interno de salidas (`salidas.consultar`, ADR-0018).
 */
import type {
  CapturaBorrador,
  Clasificacion,
  Cliente,
  CotizacionComercial,
  Evento,
  FiltroClasificacion,
  ModoPrecios,
  NuevaVersion,
  Proyecto,
  ResumenCambios,
  ResumenCotizacion,
  ResumenEmision,
  ResumenVersion,
  RevisionDeVersion,
} from "@softarq/contracts";
import { EsquemaCapturaBorrador } from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion, Db } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Idempotencia, RegistroIdempotencia } from "../aplicacion/idempotencia.js";
import type { VersionParaSalidas } from "../dominio/salidas-internas.js";
import { RepositorioEmisiones } from "./repositorio-emisiones.js";

export interface Autor {
  readonly usuarioId: string;
}

const nombreDeAutor = { select: { usuario: { select: { nombre: true } } } } as const;

const seleccionCliente = {
  id: true,
  codigo: true,
  nombre: true,
  contactoNombre: true,
  contactoTelefono: true,
  contactoCorreo: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDeAutor,
  clasificacion: { select: { categoria: true, motivo: true } },
} satisfies Prisma.ClienteSelect;

const seleccionProyecto = {
  id: true,
  codigo: true,
  nombre: true,
  municipio: true,
  entidadFederativa: true,
  descripcion: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDeAutor,
  cliente: { select: { id: true, codigo: true, nombre: true, activo: true } },
} satisfies Prisma.ProyectoSelect;

const seleccionResumenVersion = {
  id: true,
  numero: true,
  revisionBorrador: true,
  fechaCalculo: true,
  creadoEn: true,
  autorNombre: true,
  total: true,
  motivo: true,
  modoPrecios: true,
  versionOrigen: true,
} satisfies Prisma.CotizacionVersionSelect;

const seleccionCotizacion = {
  id: true,
  folio: true,
  origen: true,
  estadoFolio: true,
  descartadaEn: true,
  motivoDescarte: true,
  descartador: nombreDeAutor,
  ultimaVersion: true,
  creadoEn: true,
  autor: nombreDeAutor,
  proyecto: {
    select: { id: true, codigo: true, nombre: true, activo: true, cliente: { select: { id: true, codigo: true, nombre: true, activo: true, clasificacion: { select: { categoria: true } } } } },
  },
  borrador: { select: { revision: true, actualizadoEn: true } },
  solicitud: { select: { id: true, folio: true } },
} satisfies Prisma.CotizacionSelect;

type FilaCliente = Prisma.ClienteGetPayload<{ select: typeof seleccionCliente }>;
type FilaProyecto = Prisma.ProyectoGetPayload<{ select: typeof seleccionProyecto }>;
type FilaResumenVersion = Prisma.CotizacionVersionGetPayload<{ select: typeof seleccionResumenVersion }>;
type FilaCotizacion = Prisma.CotizacionGetPayload<{ select: typeof seleccionCotizacion }>;

/** Datos que la fase A (lectura coherente) necesita para calcular una versión. */
export interface DatosParaVersion {
  folio: string;
  ultimaVersion: number;
  borrador: { revision: number; captura: CapturaBorrador };
  cliente: { codigo: string; nombre: string; activo: boolean };
  proyecto: {
    codigo: string;
    nombre: string;
    municipio: string | null;
    entidadFederativa: string | null;
    descripcion: string | null;
    activo: boolean;
  };
  anterior: {
    numero: number;
    captura: CapturaBorrador;
    comercial: CotizacionComercial;
    huellaReferenciaHex: string;
    clienteNombre: string;
    proyectoNombre: string;
    proyectoUbicacion: string | null;
    proyectoDescripcion: string | null;
  } | null;
}

/** Contenido que la fase B guarda (claves en camelCase: las lee `softarq_crear_version`). */
export interface DatosVersion {
  captura: CapturaBorrador;
  solicitudCalculo: unknown;
  entradaCalculo: unknown;
  resultadoInterno: unknown;
  proyeccionComercial: CotizacionComercial;
  avisos: unknown[];
  total: string;
  fechaCalculo: string;
  versionMotor: string;
  huellaCalculo: string;
  huellaReferencia: string;
  clienteCodigo: string;
  clienteNombre: string;
  proyectoCodigo: string;
  proyectoNombre: string;
  proyectoUbicacion: string | null;
  proyectoDescripcion: string | null;
  autorNombre: string;
  motivo: string | null;
  resumenCambios: ResumenCambios;
  /** Módulo 14 (ADR-0018): nombres y vigencias del catálogo en la instantánea del cálculo. Interno. */
  referenciasInternas: unknown;
}

export interface VersionGuardada {
  folio: string;
  resumen: ResumenVersion;
  cliente: { codigo: string; nombre: string };
  proyecto: { codigo: string; nombre: string; ubicacion: string | null; descripcion: string | null };
  versionMotor: string;
  huellaCalculo: string;
  captura: CapturaBorrador;
  cotizacion: CotizacionComercial;
  avisos: { codigo: "AV-01" | "AV-03"; mensaje: string }[];
  cambios: ResumenCambios;
}

/** Ubicación como en el libro (`municipio, entidad`), con lo que haya capturado. */
export function ubicacionDe(municipio: string | null, entidad: string | null): string | null {
  const partes = [municipio, entidad].filter((x): x is string => !!x);
  return partes.length > 0 ? partes.join(", ") : null;
}

function iso(d: Date): string {
  return d.toISOString();
}

function fechaIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function aCliente(f: FilaCliente): Cliente {
  return {
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    contactoNombre: f.contactoNombre,
    contactoTelefono: f.contactoTelefono,
    contactoCorreo: f.contactoCorreo,
    activo: f.activo,
    revision: f.revision,
    creadoEn: iso(f.creadoEn),
    modificadoEn: iso(f.modificadoEn),
    modificadoPor: f.modificador.usuario.nombre,
    clasificacion: (f.clasificacion?.categoria as Clasificacion | undefined) ?? null,
    clasificacionMotivo: f.clasificacion?.motivo ?? null,
  };
}

/** Filtro de Prisma para la clasificación del cliente (`SIN_CLASIFICAR` = sin fila). Sin filtro no se excluye nada. */
function dondeClasificacion(f: FiltroClasificacion): { clasificacion?: { is: null } | { is: { categoria: string } } } {
  if (f === undefined) return {};
  return f === "SIN_CLASIFICAR" ? { clasificacion: { is: null } } : { clasificacion: { is: { categoria: f } } };
}

function aProyecto(f: FilaProyecto): Proyecto {
  return {
    id: f.id,
    codigo: f.codigo,
    cliente: { ...f.cliente },
    nombre: f.nombre,
    municipio: f.municipio,
    entidadFederativa: f.entidadFederativa,
    descripcion: f.descripcion,
    activo: f.activo,
    revision: f.revision,
    creadoEn: iso(f.creadoEn),
    modificadoEn: iso(f.modificadoEn),
    modificadoPor: f.modificador.usuario.nombre,
  };
}

/**
 * Estado de la versión DERIVADO (ADR-0009, ADR-0010); la versión no cambia. Con emisión: Emitida
 * (o Sustituida si después se emitió otra). Si no, el de su última revisión: En revisión, Aprobada
 * (si la aprobación no se anuló) o Borrador (sin revisión, cambios solicitados, retirada o
 * aprobación anulada), como en el libro.
 */
export function estadoDeVersion(
  r: { readonly estado: RevisionDeVersion["estado"]; readonly anulacion: unknown } | null,
  emision: Pick<ResumenEmision, "sustituida"> | null = null,
): ResumenVersion["estado"] {
  if (emision) return emision.sustituida ? "SUSTITUIDA" : "EMITIDA";
  if (r?.estado === "PENDIENTE") return "EN_REVISION";
  if (r?.estado === "APROBADA" && !r.anulacion) return "APROBADA";
  return "BORRADOR";
}

/** Revisiones por versión: la más reciente de cada una. */
export type RevisionesPorVersion = ReadonlyMap<string, RevisionDeVersion>;
/** Emisiones por versión. */
export type EmisionesPorVersion = ReadonlyMap<string, ResumenEmision>;
const SIN_EMISIONES: EmisionesPorVersion = new Map();

const seleccionRevisionDeVersion = {
  id: true,
  versionId: true,
  estado: true,
  revision: true,
  enviadoEn: true,
  resueltaEn: true,
  observaciones: true,
  emisor: nombreDeAutor,
  resolutor: nombreDeAutor,
  eventos: {
    where: { tipo: "APROBACION_ANULADA" },
    select: { usuarioNombre: true, ocurridoEn: true, observaciones: true },
  },
} satisfies Prisma.RevisionSelect;

function aResumenVersion(
  folio: string,
  v: FilaResumenVersion,
  ultima: number,
  revisiones: RevisionesPorVersion,
  emisiones: EmisionesPorVersion = SIN_EMISIONES,
): ResumenVersion {
  const r = revisiones.get(v.id) ?? null;
  const emision = emisiones.get(v.id) ?? null;
  return {
    id: v.id,
    numero: v.numero,
    idVersion: `${folio}-v${v.numero}`,
    estado: estadoDeVersion(r, emision),
    esUltima: v.numero === ultima,
    revisionVigente: r,
    emision,
    revisionBorrador: v.revisionBorrador,
    fechaCalculo: fechaIso(v.fechaCalculo),
    creadoEn: iso(v.creadoEn),
    autor: v.autorNombre,
    total: v.total.toFixed(2),
    motivo: v.motivo,
    modoPrecios: (v.modoPrecios as ModoPrecios | null) ?? null,
    versionOrigen: v.versionOrigen ?? null,
  };
}

/**
 * Ciclo de la versión nueva (B-34, módulo 15) a partir de la última emisión, la última versión y el
 * ciclo guardado en el borrador. Misma regla que `softarq_requiere_nueva_version`.
 */
export function cicloNuevaVersion(
  ultimaVersion: number,
  emisiones: EmisionesPorVersion,
  ciclo: { versionOrigen: number | null; modo: string | null; motivo: string | null; por: string | null; en: Date | null },
): NuevaVersion | null {
  const emitida = Math.max(0, ...[...emisiones.values()].map((e) => e.versionNumero));
  if (emitida === 0) return null;
  const preparada =
    ciclo.versionOrigen === emitida && ciclo.modo && ciclo.motivo && ciclo.por && ciclo.en
      ? { modo: ciclo.modo as ModoPrecios, motivo: ciclo.motivo, por: ciclo.por, en: iso(ciclo.en) }
      : null;
  if (emitida !== ultimaVersion && !preparada) return null;
  return { requerida: emitida === ultimaVersion && !preparada, versionOrigen: emitida, preparada };
}

function aResumenCotizacion(
  f: FilaCotizacion,
  ultima: FilaResumenVersion | undefined,
  revisiones: RevisionesPorVersion,
  emisiones: EmisionesPorVersion,
): ResumenCotizacion {
  return {
    id: f.id,
    folio: f.folio,
    origen: "WEB_DEMO",
    estadoFolio: f.estadoFolio === "DESCARTADO" ? "DESCARTADO" : "ACTIVO",
    descarte:
      f.estadoFolio === "DESCARTADO" && f.descartadaEn && f.descartador
        ? { por: f.descartador.usuario.nombre, en: iso(f.descartadaEn), motivo: f.motivoDescarte ?? "" }
        : null,
    cliente: {
      id: f.proyecto.cliente.id,
      codigo: f.proyecto.cliente.codigo,
      nombre: f.proyecto.cliente.nombre,
      activo: f.proyecto.cliente.activo,
      clasificacion: (f.proyecto.cliente.clasificacion?.categoria as Clasificacion | undefined) ?? null,
    },
    proyecto: { id: f.proyecto.id, codigo: f.proyecto.codigo, nombre: f.proyecto.nombre, activo: f.proyecto.activo },
    solicitud: f.solicitud ? { id: f.solicitud.id, folio: f.solicitud.folio } : null,
    creadoEn: iso(f.creadoEn),
    creadoPor: f.autor.usuario.nombre,
    revisionBorrador: f.borrador?.revision ?? 0,
    borradorActualizadoEn: iso(f.borrador?.actualizadoEn ?? f.creadoEn),
    ultimaVersion: ultima ? aResumenVersion(f.folio, ultima, f.ultimaVersion, revisiones, emisiones) : null,
  };
}

/** La captura guardada pasó por el contrato al escribirse; se vuelve a validar al leer. */
function capturaDe(valor: unknown): CapturaBorrador {
  return EsquemaCapturaBorrador.parse(valor);
}

const contiene = (texto: string) => ({ contains: texto, mode: "insensitive" as const });

export class RepositorioCotizaciones {
  constructor(private readonly db: Db) {}

  // ------------------------------- clientes -------------------------------

  async listarClientes(
    ctx: ContextoOrganizacion,
    filtro: { buscar?: string; incluirInactivos?: boolean; clasificacion?: FiltroClasificacion; limite: number },
  ): Promise<Cliente[]> {
    const filas = await this.db.cliente.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(filtro.incluirInactivos ? {} : { activo: true }),
        ...dondeClasificacion(filtro.clasificacion),
        ...(filtro.buscar ? { OR: [{ nombre: contiene(filtro.buscar) }, { codigo: contiene(filtro.buscar) }] } : {}),
      },
      select: seleccionCliente,
      orderBy: [{ nombre: "asc" }, { codigo: "asc" }],
      take: filtro.limite,
    });
    return filas.map(aCliente);
  }

  /** Precios no anulados cuya vigencia termina entre hoy y hoy + `dias` (aviso de renovación). */
  async contarPreciosPorVencer(ctx: ContextoOrganizacion, hoy: string, dias: number): Promise<number> {
    const desde = new Date(`${hoy}T00:00:00.000Z`);
    const hasta = new Date(desde.getTime() + dias * 86_400_000);
    return this.db.precio.count({ where: { organizacionId: ctx.organizacionId, anulado: false, vigenteHasta: { gte: desde, lte: hasta } } });
  }

  /** Clasifica (o retira la clasificación de) un cliente: única escritura, con la función protegida (exige ADMIN_SISTEMA). */
  async clasificarCliente(ctx: ContextoOrganizacion, adminId: string, clienteId: string, categoria: Clasificacion | null, motivo: string): Promise<void> {
    await this.db.$queryRaw`
      SELECT softarq_clasificar_cliente(${ctx.organizacionId}::uuid, ${adminId}::uuid, ${clienteId}::uuid, ${categoria}, ${motivo})`;
  }

  async obtenerCliente(ctx: ContextoOrganizacion, id: string): Promise<Cliente | null> {
    const f = await this.db.cliente.findFirst({ where: { id, organizacionId: ctx.organizacionId }, select: seleccionCliente });
    return f ? aCliente(f) : null;
  }

  /** Cotizaciones activas del cliente: su borrador sigue editable (como `Cliente_BorradoresAbiertos`). */
  async contarCotizacionesAbiertas(ctx: ContextoOrganizacion, clienteId: string): Promise<number> {
    return this.db.cotizacion.count({
      where: { organizacionId: ctx.organizacionId, clienteId, estadoFolio: "ACTIVO" },
    });
  }

  async crearCliente(
    ctx: ContextoOrganizacion,
    autor: Autor,
    datos: { nombre: string; contactoNombre: string | null; contactoTelefono: string | null; contactoCorreo: string | null },
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_cliente(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarCliente(
    ctx: ContextoOrganizacion,
    autor: Autor,
    id: string,
    revision: number,
    cambios: Record<string, unknown>,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_cliente(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${id}::uuid, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  // ------------------------------- proyectos ------------------------------

  async listarProyectos(
    ctx: ContextoOrganizacion,
    filtro: { clienteId?: string; buscar?: string; incluirInactivos?: boolean; limite: number },
  ): Promise<Proyecto[]> {
    const filas = await this.db.proyecto.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.incluirInactivos ? {} : { activo: true, cliente: { activo: true } }),
        ...(filtro.buscar
          ? {
              OR: [
                { nombre: contiene(filtro.buscar) },
                { codigo: contiene(filtro.buscar) },
                { municipio: contiene(filtro.buscar) },
                { cliente: { nombre: contiene(filtro.buscar) } },
              ],
            }
          : {}),
      },
      select: seleccionProyecto,
      orderBy: [{ nombre: "asc" }, { codigo: "asc" }],
      take: filtro.limite,
    });
    return filas.map(aProyecto);
  }

  async obtenerProyecto(ctx: ContextoOrganizacion, id: string): Promise<Proyecto | null> {
    const f = await this.db.proyecto.findFirst({ where: { id, organizacionId: ctx.organizacionId }, select: seleccionProyecto });
    return f ? aProyecto(f) : null;
  }

  async crearProyecto(
    ctx: ContextoOrganizacion,
    autor: Autor,
    clienteId: string,
    datos: { nombre: string; municipio: string | null; entidadFederativa: string | null; descripcion: string | null },
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_proyecto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${clienteId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarProyecto(
    ctx: ContextoOrganizacion,
    autor: Autor,
    id: string,
    revision: number,
    cambios: Record<string, unknown>,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_proyecto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${id}::uuid, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  // ------------------------------ cotizaciones ----------------------------

  async listarCotizaciones(
    ctx: ContextoOrganizacion,
    filtro: { buscar?: string; clienteId?: string; proyectoId?: string; clasificacion?: FiltroClasificacion; limite: number },
  ): Promise<ResumenCotizacion[]> {
    const filas = await this.db.cotizacion.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(filtro.clasificacion !== undefined ? { proyecto: { cliente: dondeClasificacion(filtro.clasificacion) } } : {}),
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.proyectoId ? { proyectoId: filtro.proyectoId } : {}),
        ...(filtro.buscar
          ? {
              OR: [
                { folio: contiene(filtro.buscar) },
                { proyecto: { nombre: contiene(filtro.buscar) } },
                { proyecto: { cliente: { nombre: contiene(filtro.buscar) } } },
              ],
            }
          : {}),
      },
      select: seleccionCotizacion,
      orderBy: [{ creadoEn: "desc" }, { folio: "desc" }],
      take: filtro.limite,
    });
    const ultimas = await this.ultimasVersiones(ctx, filas);
    const revisiones = await this.revisionesDeVersiones(ctx, [...ultimas.values()].map((v) => v.id));
    const emisiones = await new RepositorioEmisiones(this.db).emisionesDeCotizaciones(ctx, filas.map((f) => f.id));
    return filas.map((f) => aResumenCotizacion(f, ultimas.get(f.id), revisiones, emisiones));
  }

  private async ultimasVersiones(ctx: ContextoOrganizacion, filas: readonly FilaCotizacion[]) {
    const conVersion = filas.filter((f) => f.ultimaVersion > 0);
    const mapa = new Map<string, FilaResumenVersion>();
    if (conVersion.length === 0) return mapa;
    const versiones = await this.db.cotizacionVersion.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        OR: conVersion.map((f) => ({ cotizacionId: f.id, numero: f.ultimaVersion })),
      },
      select: { ...seleccionResumenVersion, cotizacionId: true },
    });
    for (const v of versiones) mapa.set(v.cotizacionId, v);
    return mapa;
  }

  async obtenerCotizacion(ctx: ContextoOrganizacion, id: string, eventos: number) {
    const f = await this.db.cotizacion.findFirst({
      where: { id, organizacionId: ctx.organizacionId },
      select: {
        ...seleccionCotizacion,
        borrador: {
          select: {
            revision: true,
            actualizadoEn: true,
            captura: true,
            autor: nombreDeAutor,
            cicloVersionOrigen: true,
            cicloModoPrecios: true,
            cicloMotivo: true,
            cicloPreparadoEn: true,
            preparadorCiclo: nombreDeAutor,
          },
        },
        versiones: { select: seleccionResumenVersion, orderBy: { numero: "desc" } },
        duplicadaDeId: true,
        duplicadaDeVersion: true,
        duplicadaDeRevision: true,
        duplicadaDe: { select: { folio: true } },
      },
    });
    if (!f || !f.borrador) return null;
    const bitacora = await this.db.bitacora.findMany({
      where: { organizacionId: ctx.organizacionId, entidad: "cotizacion", entidadId: id },
      select: { tipo: true, detalle: true, ocurridoEn: true, usuario: nombreDeAutor },
      orderBy: { ocurridoEn: "desc" },
      take: eventos,
    });
    const revisiones = await this.revisionesDeVersiones(ctx, f.versiones.map((v) => v.id));
    const emisiones = await new RepositorioEmisiones(this.db).emisionesDeCotizaciones(ctx, [f.id]);
    const versiones = f.versiones.map((v) => aResumenVersion(f.folio, v, f.ultimaVersion, revisiones, emisiones));
    const b = f.borrador;
    return {
      duplicadaDe:
        f.duplicadaDeId && f.duplicadaDe
          ? { cotizacionId: f.duplicadaDeId, folio: f.duplicadaDe.folio, version: f.duplicadaDeVersion, revision: f.duplicadaDeRevision }
          : null,
      nuevaVersion: cicloNuevaVersion(f.ultimaVersion, emisiones, {
        versionOrigen: b.cicloVersionOrigen,
        modo: b.cicloModoPrecios,
        motivo: b.cicloMotivo,
        por: b.preparadorCiclo?.usuario.nombre ?? null,
        en: b.cicloPreparadoEn,
      }),
      cotizacion: aResumenCotizacion(f, f.versiones[0], revisiones, emisiones),
      borrador: {
        revision: f.borrador.revision,
        captura: capturaDe(f.borrador.captura),
        actualizadoPor: f.borrador.autor.usuario.nombre,
        actualizadoEn: iso(f.borrador.actualizadoEn),
      },
      versiones,
      eventos: bitacora.map(
        (e): Evento => ({
          tipo: e.tipo,
          usuario: e.usuario.usuario.nombre,
          ocurridoEn: iso(e.ocurridoEn),
          detalle: (e.detalle ?? {}) as Record<string, unknown>,
        }),
      ),
    };
  }

  async crearCotizacion(
    ctx: ContextoOrganizacion,
    autor: Autor,
    proyectoId: string,
    anio: number,
    captura: CapturaBorrador,
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_cotizacion(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${proyectoId}::uuid, ${anio}::integer, ${JSON.stringify(captura)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  /** B-35 (módulo 15): una sola sentencia (`softarq_duplicar_cotizacion`), con folio nuevo. */
  async duplicarCotizacion(
    ctx: ContextoOrganizacion,
    autor: Autor,
    origenId: string,
    origen: { version: number | null; revision: number | null },
    proyectoId: string,
    anio: number,
    captura: CapturaBorrador,
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_duplicar_cotizacion(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${origenId}::uuid, ${origen.version}::integer, ${origen.revision}::integer,
        ${proyectoId}::uuid, ${anio}::integer, ${JSON.stringify(captura)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  /** ¿La última versión está emitida sin ciclo preparado? (`softarq_requiere_nueva_version`, B-34). */
  async requiereNuevaVersion(ctx: ContextoOrganizacion, cotizacionId: string): Promise<boolean> {
    const f = await this.db.$queryRaw<{ r: boolean | null }[]>`
      SELECT softarq_requiere_nueva_version(${ctx.organizacionId}::uuid, ${cotizacionId}::uuid) AS r`;
    return f[0]?.r === true;
  }

  /** Captura congelada de una versión de la organización (origen de una duplicación). */
  async capturaDeVersion(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<CapturaBorrador | null> {
    const v = await this.db.cotizacionVersion.findFirst({
      where: { organizacionId: ctx.organizacionId, cotizacionId, numero },
      select: { captura: true },
    });
    return v ? capturaDe(v.captura) : null;
  }

  /** Proyecto de una cotización de la organización y si está disponible para registros nuevos. */
  async proyectoDeCotizacion(ctx: ContextoOrganizacion, cotizacionId: string) {
    return this.db.cotizacion.findFirst({
      where: { organizacionId: ctx.organizacionId, id: cotizacionId },
      select: { folio: true, proyectoId: true, proyecto: { select: { activo: true, cliente: { select: { activo: true } } } } },
    });
  }

  /** B-34 (módulo 15): una sola sentencia (`softarq_preparar_nueva_version`). */
  async prepararNuevaVersion(
    ctx: ContextoOrganizacion,
    autor: Autor,
    cotizacionId: string,
    revision: number,
    versionOrigen: number,
    modo: ModoPrecios,
    motivo: string,
    seleccion: CapturaBorrador["seleccion"],
    idem: Idempotencia,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_preparar_nueva_version(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${revision}::integer, ${versionOrigen}::integer,
        ${modo}, ${motivo}, ${JSON.stringify(seleccion)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      ) AS revision`;
    return filas[0]!.revision;
  }

  /** B-25 (módulo 15): auditoría VISTA_PREVIA idempotente (`softarq_registrar_vista_previa`). */
  async registrarVistaPrevia(ctx: ContextoOrganizacion, autor: Autor, cotizacionId: string, versionId: string, idem: Idempotencia): Promise<void> {
    await this.db.$queryRaw`
      SELECT softarq_registrar_vista_previa(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${versionId}::uuid,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS ok`;
  }

  async guardarBorrador(
    ctx: ContextoOrganizacion,
    autor: Autor,
    cotizacionId: string,
    revision: number,
    captura: CapturaBorrador,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_guardar_borrador(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${revision}::integer, ${JSON.stringify(captura)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  async obtenerBorrador(ctx: ContextoOrganizacion, cotizacionId: string) {
    const b = await this.db.cotizacionBorrador.findFirst({
      where: { cotizacionId, organizacionId: ctx.organizacionId },
      select: { revision: true, captura: true, actualizadoEn: true, autor: nombreDeAutor },
    });
    if (!b) return null;
    return {
      revision: b.revision,
      captura: capturaDe(b.captura),
      actualizadoPor: b.autor.usuario.nombre,
      actualizadoEn: iso(b.actualizadoEn),
    };
  }

  /** Fase A: se llama con el cliente de la transacción de solo lectura (una sola instantánea). */
  async leerParaVersion(ctx: ContextoOrganizacion, cotizacionId: string): Promise<DatosParaVersion | null> {
    const f = await this.db.cotizacion.findFirst({
      where: { id: cotizacionId, organizacionId: ctx.organizacionId },
      select: {
        folio: true,
        ultimaVersion: true,
        borrador: { select: { revision: true, captura: true } },
        proyecto: {
          select: {
            codigo: true,
            nombre: true,
            municipio: true,
            entidadFederativa: true,
            descripcion: true,
            activo: true,
            cliente: { select: { codigo: true, nombre: true, activo: true } },
          },
        },
      },
    });
    if (!f || !f.borrador) return null;
    const anterior =
      f.ultimaVersion > 0
        ? await this.db.cotizacionVersion.findFirst({
            where: { organizacionId: ctx.organizacionId, cotizacionId, numero: f.ultimaVersion },
            select: {
              numero: true,
              captura: true,
              proyeccionComercial: true,
              huellaReferencia: true,
              clienteNombre: true,
              proyectoNombre: true,
              proyectoUbicacion: true,
              proyectoDescripcion: true,
            },
          })
        : null;
    const { cliente, ...proyecto } = f.proyecto;
    return {
      folio: f.folio,
      ultimaVersion: f.ultimaVersion,
      borrador: { revision: f.borrador.revision, captura: capturaDe(f.borrador.captura) },
      cliente,
      proyecto,
      anterior: anterior
        ? {
            numero: anterior.numero,
            captura: capturaDe(anterior.captura),
            comercial: anterior.proyeccionComercial as CotizacionComercial,
            huellaReferenciaHex: Buffer.from(anterior.huellaReferencia).toString("hex"),
            clienteNombre: anterior.clienteNombre,
            proyectoNombre: anterior.proyectoNombre,
            proyectoUbicacion: anterior.proyectoUbicacion,
            proyectoDescripcion: anterior.proyectoDescripcion,
          }
        : null,
    };
  }

  /** Fase B: una sola sentencia (`softarq_crear_version`). */
  async crearVersion(
    ctx: ContextoOrganizacion,
    autor: Autor,
    cotizacionId: string,
    revision: number,
    numeroAnterior: number,
    datos: DatosVersion,
    idem: Idempotencia,
  ): Promise<{ id: string; numero: number }> {
    const filas = await this.db.$queryRaw<{ id: string; numero: number }[]>`
      SELECT id::text AS id, numero FROM softarq_crear_version(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${revision}::integer,
        ${numeroAnterior}::integer, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )`;
    return filas[0]!;
  }

  /** Versión guardada tal como se almacenó (nunca se recalcula). Sin datos internos. */
  async obtenerVersion(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<VersionGuardada | null> {
    const v = await this.db.cotizacionVersion.findFirst({
      where: { organizacionId: ctx.organizacionId, cotizacionId, numero },
      select: {
        ...seleccionResumenVersion,
        cotizacion: { select: { folio: true, ultimaVersion: true } },
        clienteCodigo: true,
        clienteNombre: true,
        proyectoCodigo: true,
        proyectoNombre: true,
        proyectoUbicacion: true,
        proyectoDescripcion: true,
        versionMotor: true,
        huellaCalculo: true,
        captura: true,
        proyeccionComercial: true,
        avisos: true,
        resumenCambios: true,
      },
    });
    if (!v) return null;
    const revisiones = await this.revisionesDeVersiones(ctx, [v.id]);
    const emisiones = await new RepositorioEmisiones(this.db).emisionesDeCotizaciones(ctx, [cotizacionId]);
    return {
      folio: v.cotizacion.folio,
      resumen: aResumenVersion(v.cotizacion.folio, v, v.cotizacion.ultimaVersion, revisiones, emisiones),
      cliente: { codigo: v.clienteCodigo, nombre: v.clienteNombre },
      proyecto: {
        codigo: v.proyectoCodigo,
        nombre: v.proyectoNombre,
        ubicacion: v.proyectoUbicacion,
        descripcion: v.proyectoDescripcion,
      },
      versionMotor: v.versionMotor,
      huellaCalculo: Buffer.from(v.huellaCalculo).toString("hex"),
      captura: capturaDe(v.captura),
      cotizacion: v.proyeccionComercial as CotizacionComercial,
      avisos: v.avisos as VersionGuardada["avisos"],
      cambios: v.resumenCambios as ResumenCambios,
    };
  }

  /**
   * Versión con su instantánea interna (módulo 14, ADR-0018), para las salidas internas. Solo
   * lectura y solo de la organización; consultas fijas por versión. Nunca toca el catálogo.
   */
  async obtenerVersionInterna(
    ctx: ContextoOrganizacion,
    cotizacionId: string,
    numero: number,
  ): Promise<VersionParaSalidas | null> {
    // Consultas planas y en serie: dentro de una transacción interactiva, Prisma resolvería las
    // relaciones anidadas en paralelo sobre la misma conexión (aviso de `pg`).
    const org = ctx.organizacionId;
    const q = await this.db.cotizacion.findFirst({ where: { organizacionId: org, id: cotizacionId }, select: { folio: true, origen: true, ultimaVersion: true } });
    if (!q) return null;
    const v = await this.db.cotizacionVersion.findFirst({
      where: { organizacionId: org, cotizacionId, numero },
      select: {
        id: true,
        numero: true,
        fechaCalculo: true,
        creadoEn: true,
        autorNombre: true,
        versionMotor: true,
        entradaCalculo: true,
        resultadoInterno: true,
        solicitudCalculo: true,
        referenciasInternas: true,
      },
    });
    if (!v) return null;
    // Estado derivado (`estadoDeVersion`): última revisión de la versión, su anulación y su emisión.
    const revision = await this.db.revision.findFirst({
      where: { organizacionId: org, versionId: v.id },
      orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
      select: { id: true, estado: true },
    });
    const anulada = revision
      ? (await this.db.revisionEvento.count({ where: { organizacionId: org, revisionId: revision.id, tipo: "APROBACION_ANULADA" } })) > 0
      : false;
    const emitida = (await this.db.emision.count({ where: { organizacionId: org, versionId: v.id } })) > 0;
    const sustituida = emitida && (await this.db.emision.count({ where: { organizacionId: org, cotizacionId, versionNumero: { gt: v.numero } } })) > 0;
    const decisiones = await this.db.excepcionDecision.findMany({
      where: { organizacionId: org, versionId: v.id },
      select: { numero: true, decision: true },
    });
    const estado = estadoDeVersion(
      revision ? { estado: revision.estado as RevisionDeVersion["estado"], anulacion: anulada ? true : null } : null,
      emitida ? { sustituida } : null,
    );
    return {
      versionId: v.id,
      folio: q.folio,
      numero: v.numero,
      origen: q.origen,
      resumen: { estado, esUltima: v.numero === q.ultimaVersion },
      fechaCalculo: fechaIso(v.fechaCalculo),
      versionMotor: v.versionMotor,
      autorNombre: v.autorNombre,
      creadoEn: iso(v.creadoEn),
      entradaCalculo: v.entradaCalculo,
      resultadoInterno: v.resultadoInterno,
      solicitudCalculo: v.solicitudCalculo,
      referenciasInternas: v.referenciasInternas,
      decisiones: new Map(decisiones.map((d) => [d.numero, d.decision as "AUTORIZADA" | "RECHAZADA"])),
    };
  }

  async idDeVersion(ctx: ContextoOrganizacion, versionId: string): Promise<{ cotizacionId: string; numero: number } | null> {
    return this.db.cotizacionVersion.findFirst({
      where: { id: versionId, organizacionId: ctx.organizacionId },
      select: { cotizacionId: true, numero: true },
    });
  }

  /** Última revisión de cada versión indicada (solo lectura; módulo 7). */
  async revisionesDeVersiones(ctx: ContextoOrganizacion, versionIds: readonly string[]): Promise<Map<string, RevisionDeVersion>> {
    const mapa = new Map<string, RevisionDeVersion>();
    if (versionIds.length === 0) return mapa;
    const filas = await this.db.revision.findMany({
      where: { organizacionId: ctx.organizacionId, versionId: { in: [...versionIds] } },
      select: seleccionRevisionDeVersion,
      orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
    });
    for (const r of filas) {
      if (mapa.has(r.versionId)) continue;
      mapa.set(r.versionId, {
        id: r.id,
        estado: r.estado as RevisionDeVersion["estado"],
        revision: r.revision,
        enviadoPor: r.emisor.usuario.nombre,
        enviadoEn: iso(r.enviadoEn),
        resueltaPor: r.resolutor?.usuario.nombre ?? null,
        resueltaEn: r.resueltaEn ? iso(r.resueltaEn) : null,
        observaciones: r.observaciones,
        anulacion: r.eventos[0]
          ? { por: r.eventos[0].usuarioNombre, en: iso(r.eventos[0].ocurridoEn), motivo: r.eventos[0].observaciones ?? "" }
          : null,
      });
    }
    return mapa;
  }

  // ------------------------------ idempotencia -----------------------------

  async buscarIdempotencia(ctx: ContextoOrganizacion, autor: Autor, clave: string): Promise<RegistroIdempotencia | null> {
    return this.db.idempotencia.findUnique({
      where: { organizacionId_usuarioId_clave: { organizacionId: ctx.organizacionId, usuarioId: autor.usuarioId, clave } },
      select: { operacion: true, huellaSolicitud: true, recursoId: true, expiraEn: true },
    });
  }

  // -------------------------------- bitácora -------------------------------

  async registrarEvento(
    ctx: ContextoOrganizacion,
    autor: Autor,
    entidad: "cliente" | "proyecto" | "cotizacion" | "emisor",
    entidadId: string,
    tipo: string,
    detalle: Record<string, unknown>,
  ): Promise<void> {
    await this.db.bitacora.create({
      data: {
        organizacionId: ctx.organizacionId,
        entidad,
        entidadId,
        tipo,
        usuarioId: autor.usuarioId,
        detalle: detalle as Prisma.InputJsonValue,
      },
    });
  }
}
