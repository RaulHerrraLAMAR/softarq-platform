/**
 * Repositorio de clientes, proyectos y cotizaciones (ADR-0008).
 *
 * - Toda consulta lleva `organizacion_id` de la sesión DENTRO del `where`: un id de otra
 *   organización se comporta igual que uno inexistente.
 * - Lecturas con Prisma (parametrizadas). Escrituras con las funciones PL/pgSQL de la migración,
 *   invocadas con `$queryRaw` de plantilla (parámetros enlazados, nunca texto concatenado): cada
 *   alta o edición es UNA sentencia atómica con su evento y su registro de idempotencia.
 * - Las columnas internas de las versiones (entrada y resultado del cálculo) solo se leen para el
 *   servidor; ningún método de consulta para HTTP las devuelve.
 */
import type {
  CapturaBorrador,
  Cliente,
  CotizacionComercial,
  Evento,
  Proyecto,
  ResumenCambios,
  ResumenCotizacion,
  ResumenVersion,
} from "@softarq/contracts";
import { EsquemaCapturaBorrador } from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion, Db } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Idempotencia, RegistroIdempotencia } from "../aplicacion/idempotencia.js";

export interface Autor {
  readonly usuarioId: string;
}

const nombreDeAutor = { select: { usuario: { select: { nombre: true } } } } as const;

const seleccionCliente = {
  id: true,
  codigo: true,
  nombre: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDeAutor,
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
  numero: true,
  revisionBorrador: true,
  fechaCalculo: true,
  creadoEn: true,
  autorNombre: true,
  total: true,
  motivo: true,
} satisfies Prisma.CotizacionVersionSelect;

const seleccionCotizacion = {
  id: true,
  folio: true,
  origen: true,
  estadoFolio: true,
  ultimaVersion: true,
  creadoEn: true,
  autor: nombreDeAutor,
  proyecto: {
    select: { id: true, codigo: true, nombre: true, activo: true, cliente: { select: { id: true, codigo: true, nombre: true, activo: true } } },
  },
  borrador: { select: { revision: true, actualizadoEn: true } },
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
    activo: f.activo,
    revision: f.revision,
    creadoEn: iso(f.creadoEn),
    modificadoEn: iso(f.modificadoEn),
    modificadoPor: f.modificador.usuario.nombre,
  };
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

function aResumenVersion(folio: string, v: FilaResumenVersion): ResumenVersion {
  return {
    numero: v.numero,
    idVersion: `${folio}-v${v.numero}`,
    estado: "BORRADOR",
    revisionBorrador: v.revisionBorrador,
    fechaCalculo: fechaIso(v.fechaCalculo),
    creadoEn: iso(v.creadoEn),
    autor: v.autorNombre,
    total: v.total.toFixed(2),
    motivo: v.motivo,
  };
}

function aResumenCotizacion(f: FilaCotizacion, ultima: FilaResumenVersion | undefined): ResumenCotizacion {
  return {
    id: f.id,
    folio: f.folio,
    origen: "WEB_DEMO",
    estadoFolio: "ACTIVO",
    cliente: { ...f.proyecto.cliente },
    proyecto: { id: f.proyecto.id, codigo: f.proyecto.codigo, nombre: f.proyecto.nombre, activo: f.proyecto.activo },
    creadoEn: iso(f.creadoEn),
    creadoPor: f.autor.usuario.nombre,
    revisionBorrador: f.borrador?.revision ?? 0,
    borradorActualizadoEn: iso(f.borrador?.actualizadoEn ?? f.creadoEn),
    ultimaVersion: ultima ? aResumenVersion(f.folio, ultima) : null,
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
    filtro: { buscar?: string; incluirInactivos?: boolean; limite: number },
  ): Promise<Cliente[]> {
    const filas = await this.db.cliente.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(filtro.incluirInactivos ? {} : { activo: true }),
        ...(filtro.buscar ? { OR: [{ nombre: contiene(filtro.buscar) }, { codigo: contiene(filtro.buscar) }] } : {}),
      },
      select: seleccionCliente,
      orderBy: [{ nombre: "asc" }, { codigo: "asc" }],
      take: filtro.limite,
    });
    return filas.map(aCliente);
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

  async crearCliente(ctx: ContextoOrganizacion, autor: Autor, nombre: string, idem: Idempotencia): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_cliente(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${nombre},
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
    filtro: { buscar?: string; clienteId?: string; proyectoId?: string; limite: number },
  ): Promise<ResumenCotizacion[]> {
    const filas = await this.db.cotizacion.findMany({
      where: {
        organizacionId: ctx.organizacionId,
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
    return filas.map((f) => aResumenCotizacion(f, ultimas.get(f.id)));
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
        borrador: { select: { revision: true, actualizadoEn: true, captura: true, autor: nombreDeAutor } },
        versiones: { select: seleccionResumenVersion, orderBy: { numero: "desc" } },
      },
    });
    if (!f || !f.borrador) return null;
    const bitacora = await this.db.bitacora.findMany({
      where: { organizacionId: ctx.organizacionId, entidad: "cotizacion", entidadId: id },
      select: { tipo: true, detalle: true, ocurridoEn: true, usuario: nombreDeAutor },
      orderBy: { ocurridoEn: "desc" },
      take: eventos,
    });
    const versiones = f.versiones.map((v) => aResumenVersion(f.folio, v));
    return {
      cotizacion: aResumenCotizacion(f, f.versiones[0]),
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
        cotizacion: { select: { folio: true } },
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
    return {
      folio: v.cotizacion.folio,
      resumen: aResumenVersion(v.cotizacion.folio, v),
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

  async idDeVersion(ctx: ContextoOrganizacion, versionId: string): Promise<{ cotizacionId: string; numero: number } | null> {
    return this.db.cotizacionVersion.findFirst({
      where: { id: versionId, organizacionId: ctx.organizacionId },
      select: { cotizacionId: true, numero: true },
    });
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
    entidad: "cliente" | "proyecto" | "cotizacion",
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
