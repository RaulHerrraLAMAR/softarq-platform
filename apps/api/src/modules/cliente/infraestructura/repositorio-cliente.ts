/**
 * Acceso a datos del cliente externo (módulo 17, ADR-0021). Lecturas con Prisma (parametrizadas) y escrituras SOLO con las
 * funciones SECURITY DEFINER de la migración `20261024200000_cliente_solicitudes`, que vuelven a comprobar la identidad
 * en la base. Con el rol de la aplicación las tablas nuevas no admiten INSERT ni UPDATE directos.
 *
 * Regla de propiedad: toda lectura de un cliente lleva `clienteId` y `organizacionId` obtenidos de la identidad de la
 * sesión (`clienteDe`), nunca de la solicitud HTTP. Un registro ajeno no aparece (no se distingue de uno inexistente).
 */
import {
  EsquemaCapturaSolicitud,
  EsquemaMedidaPedida,
  type CapturaSolicitud,
  type DimensionCliente,
} from "@softarq/contracts";
import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { OpcionCatalogo } from "../dominio/captura.js";

export interface Identidad {
  readonly organizacionId: string;
  readonly usuarioId: string;
}

export interface OpcionTrabajoFila {
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly consolidarCompras: boolean;
  readonly medidas: { clave: DimensionCliente; etiqueta: string; ayuda: string }[] | null;
  readonly concepto: {
    readonly codigo: string;
    readonly tipoFormula: "CONTEO" | "LONGITUD" | "AREA" | "VOLUMEN";
    readonly permiteDescuento: boolean;
    readonly unidad: string;
    readonly disponible: boolean;
    readonly insumos: string[];
  };
}

export interface TrabajoFila {
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly ilustracion: "cubierta" | "losa" | "muro";
  readonly orden: number;
  readonly activo: boolean;
  readonly opciones: OpcionTrabajoFila[];
}

export interface ProyectoFila {
  readonly id: string;
  readonly nombre: string;
  readonly municipio: string | null;
  readonly entidadFederativa: string | null;
  readonly descripcion: string | null;
}

export interface EstimacionFila {
  readonly id: string;
  readonly numero: number;
  readonly estado: "ESTIMADA" | "SIN_ESTIMACION";
  readonly revisionCaptura: number;
  readonly motivoCodigo: string | null;
  readonly comercial: unknown;
  readonly avisos: unknown;
  readonly fechaCalculo: string;
  readonly calculadaEn: Date;
}

export interface EmisionResumenFila {
  readonly emisionId: string;
  readonly cotizacionId: string;
  readonly folio: string;
  readonly fechaEmision: string;
  readonly vigenteHasta: string;
  readonly total: string;
  readonly proyecto: string;
  readonly solicitudFolio: string | null;
  readonly emitidoEn: Date;
}

export interface SolicitudFila {
  readonly id: string;
  readonly folio: string;
  readonly estado: "BORRADOR" | "ENVIADA" | "EN_PREPARACION" | "RETIRADA";
  readonly revision: number;
  readonly captura: CapturaSolicitud;
  readonly proyecto: ProyectoFila;
  readonly clienteId: string;
  readonly clienteNombre: string;
  readonly creadaEn: Date;
  readonly actualizadaEn: Date;
  readonly enviadaEn: Date | null;
  readonly cotizacionId: string | null;
  readonly cotizacionFolio: string | null;
}

const EsquemaMedidasFila = z.array(EsquemaMedidaPedida);
const dia = (d: Date): string => d.toISOString().slice(0, 10);

function aEmision(e: {
  id: string;
  cotizacionId: string;
  folio: string;
  fechaEmision: Date;
  vigenteHasta: Date;
  total: { toFixed(n: number): string };
  emitidoEn: Date;
  cotizacion: { proyecto: { nombre: string }; solicitud: { folio: string } | null };
}): EmisionResumenFila {
  return {
    emisionId: e.id,
    cotizacionId: e.cotizacionId,
    folio: e.folio,
    fechaEmision: dia(e.fechaEmision),
    vigenteHasta: dia(e.vigenteHasta),
    total: e.total.toFixed(2),
    proyecto: e.cotizacion.proyecto.nombre,
    solicitudFolio: e.cotizacion.solicitud?.folio ?? null,
    emitidoEn: e.emitidoEn,
  };
}

const seleccionSolicitud = {
  id: true,
  folio: true,
  estado: true,
  revision: true,
  captura: true,
  clienteId: true,
  creadaEn: true,
  actualizadaEn: true,
  enviadaEn: true,
  proyecto: { select: { id: true, nombre: true, municipio: true, entidadFederativa: true, descripcion: true } },
  cliente: { select: { nombre: true } },
  cotizacion: { select: { id: true, folio: true } },
} as const;

type FilaPrisma = {
  id: string;
  folio: string;
  estado: string;
  revision: number;
  captura: unknown;
  clienteId: string;
  creadaEn: Date;
  actualizadaEn: Date;
  enviadaEn: Date | null;
  proyecto: ProyectoFila;
  cliente: { nombre: string };
  cotizacion: { id: string; folio: string } | null;
};

function aSolicitud(f: FilaPrisma): SolicitudFila {
  // La captura se guardó validada por el contrato; si alguna fila antigua no cumpliera, se muestra vacía y no rompe la lista.
  const captura = EsquemaCapturaSolicitud.safeParse(f.captura);
  return {
    id: f.id,
    folio: f.folio,
    estado: f.estado as SolicitudFila["estado"],
    revision: f.revision,
    captura: captura.success ? captura.data : { trabajos: [], notas: null },
    proyecto: f.proyecto,
    clienteId: f.clienteId,
    clienteNombre: f.cliente.nombre,
    creadaEn: f.creadaEn,
    actualizadaEn: f.actualizadaEn,
    enviadaEn: f.enviadaEn,
    cotizacionId: f.cotizacion?.id ?? null,
    cotizacionFolio: f.cotizacion?.folio ?? null,
  };
}

export class RepositorioCliente {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Cliente de la cuenta. Lo calcula la base (cuenta, pertenencia y cliente activos y función exclusiva CLIENTE);
   * si la cuenta ya no tiene acceso, lanza el error `SOFTARQ:SIN_PERMISO` (403), aunque la sesión siga abierta.
   */
  async clienteDe(id: Identidad): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`SELECT softarq_exigir_cliente(${id.organizacionId}::uuid, ${id.usuarioId}::uuid)::text AS id`;
    return filas[0]!.id;
  }

  // ------------------------------- catálogo -------------------------------

  /** Trabajos y opciones vigentes de la organización (los inactivos se omiten). Orden: el que fijó el equipo. */
  async trabajos(ctx: ContextoOrganizacion, incluirInactivos = false): Promise<TrabajoFila[]> {
    const filas = await this.db.trabajoCliente.findMany({
      where: { organizacionId: ctx.organizacionId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: [{ orden: "asc" }, { codigo: "asc" }],
      include: {
        opciones: {
          ...(incluirInactivos ? {} : { where: { activa: true } }),
          orderBy: [{ orden: "asc" }, { codigo: "asc" }],
          include: {
            concepto: {
              select: {
                codigo: true,
                tipoFormula: true,
                permiteDescuento: true,
                unidad: true,
                clase: true,
                estado: true,
                activo: true,
                componentes: { where: { activo: true }, orderBy: { orden: "asc" }, select: { insumo: { select: { codigo: true } } } },
              },
            },
          },
        },
      },
    });
    return filas.map((t) => ({
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion,
      ilustracion: t.ilustracion as TrabajoFila["ilustracion"],
      orden: t.orden,
      activo: t.activo,
      opciones: t.opciones.map((o) => {
        const medidas = EsquemaMedidasFila.safeParse(o.medidas);
        return {
          codigo: o.codigo,
          nombre: o.nombre,
          descripcion: o.descripcion,
          orden: o.orden,
          activa: o.activa,
          consolidarCompras: o.consolidarCompras,
          medidas: medidas.success ? medidas.data : null,
          concepto: {
            codigo: o.concepto.codigo,
            tipoFormula: o.concepto.tipoFormula as OpcionTrabajoFila["concepto"]["tipoFormula"],
            permiteDescuento: o.concepto.permiteDescuento,
            unidad: o.concepto.unidad,
            // BL-04: solo conceptos activos y aprobados; un concepto personalizado nunca se ofrece a un cliente.
            disponible: o.concepto.activo && o.concepto.estado === "Aprobado" && o.concepto.clase !== "PERSONALIZADO",
            insumos: [...new Set(o.concepto.componentes.map((k) => k.insumo.codigo))],
          },
        };
      }),
    }));
  }

  /** Referencia ACTIVA de cada insumo (una por insumo). Se vuelve a validar al estimar (vigencia, anulación, activos). */
  async referenciasActivas(ctx: ContextoOrganizacion): Promise<{ insumoCodigo: string; precioCodigo: string }[]> {
    const filas = await this.db.referenciaEstimacion.findMany({
      where: { organizacionId: ctx.organizacionId, retiradaEn: null },
      select: { insumo: { select: { codigo: true } }, precio: { select: { codigo: true } } },
    });
    return filas.map((f) => ({ insumoCodigo: f.insumo.codigo, precioCodigo: f.precio.codigo }));
  }

  // ------------------------------- proyectos -------------------------------

  async proyectos(ctx: ContextoOrganizacion, clienteId: string): Promise<ProyectoFila[]> {
    return this.db.proyecto.findMany({
      where: { organizacionId: ctx.organizacionId, clienteId, activo: true },
      orderBy: { creadoEn: "desc" },
      select: { id: true, nombre: true, municipio: true, entidadFederativa: true, descripcion: true },
      take: 100,
    });
  }

  async proyecto(ctx: ContextoOrganizacion, clienteId: string, id: string): Promise<ProyectoFila | null> {
    return this.db.proyecto.findFirst({
      where: { organizacionId: ctx.organizacionId, clienteId, id, activo: true },
      select: { id: true, nombre: true, municipio: true, entidadFederativa: true, descripcion: true },
    });
  }

  async crearProyecto(id: Identidad, datos: { nombre: string; municipio: string; entidadFederativa: string; descripcion: string | null }): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_cliente_crear_proyecto(${id.organizacionId}::uuid, ${id.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb)::text AS id`;
    return filas[0]!.id;
  }

  // ------------------------------- solicitudes -------------------------------

  async solicitudes(ctx: ContextoOrganizacion, clienteId: string, limite: number): Promise<SolicitudFila[]> {
    const filas = await this.db.solicitudCliente.findMany({
      where: { organizacionId: ctx.organizacionId, clienteId },
      orderBy: { actualizadaEn: "desc" },
      take: limite,
      select: seleccionSolicitud,
    });
    return filas.map((f) => aSolicitud(f as unknown as FilaPrisma));
  }

  async solicitud(ctx: ContextoOrganizacion, clienteId: string, id: string): Promise<SolicitudFila | null> {
    const f = await this.db.solicitudCliente.findFirst({ where: { organizacionId: ctx.organizacionId, clienteId, id }, select: seleccionSolicitud });
    return f ? aSolicitud(f as unknown as FilaPrisma) : null;
  }

  async crearSolicitud(id: Identidad, proyectoId: string, anio: number, captura: CapturaSolicitud): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_cliente_crear_solicitud(${id.organizacionId}::uuid, ${id.usuarioId}::uuid, ${proyectoId}::uuid, ${anio}::integer, ${JSON.stringify(captura)}::jsonb)::text AS id`;
    return filas[0]!.id;
  }

  async guardarSolicitud(id: Identidad, solicitudId: string, revision: number, captura: CapturaSolicitud): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_cliente_guardar_solicitud(${id.organizacionId}::uuid, ${id.usuarioId}::uuid, ${solicitudId}::uuid, ${revision}::integer, ${JSON.stringify(captura)}::jsonb) AS revision`;
    return filas[0]!.revision;
  }

  /** `true` si la solicitud ya estaba enviada (reintento idempotente). */
  async enviarSolicitud(id: Identidad, solicitudId: string, revision: number): Promise<boolean> {
    const filas = await this.db.$queryRaw<{ repetida: boolean }[]>`
      SELECT softarq_cliente_enviar_solicitud(${id.organizacionId}::uuid, ${id.usuarioId}::uuid, ${solicitudId}::uuid, ${revision}::integer) AS repetida`;
    return filas[0]!.repetida;
  }

  async retirarSolicitud(id: Identidad, solicitudId: string, motivo: string): Promise<boolean> {
    const filas = await this.db.$queryRaw<{ repetida: boolean }[]>`
      SELECT softarq_cliente_retirar_solicitud(${id.organizacionId}::uuid, ${id.usuarioId}::uuid, ${solicitudId}::uuid, ${motivo}) AS repetida`;
    return filas[0]!.repetida;
  }

  // ------------------------------- estimaciones -------------------------------

  async registrarEstimacion(id: Identidad, solicitudId: string, revision: number, datos: Record<string, unknown>, huella: Buffer): Promise<{ id: string; numero: number }> {
    const filas = await this.db.$queryRaw<{ id: string; numero: number }[]>`
      SELECT id::text AS id, numero FROM softarq_cliente_registrar_estimacion(
        ${id.organizacionId}::uuid, ${id.usuarioId}::uuid, ${solicitudId}::uuid, ${revision}::integer, ${JSON.stringify(datos)}::jsonb, ${huella})`;
    return filas[0]!;
  }

  /** Última estimación de la solicitud (la de mayor número). Nunca incluye `entrada` ni `resultado` (internos). */
  async ultimaEstimacion(ctx: ContextoOrganizacion, solicitudId: string): Promise<EstimacionFila | null> {
    const e = await this.db.estimacionSolicitud.findFirst({
      where: { organizacionId: ctx.organizacionId, solicitudId },
      orderBy: { numero: "desc" },
      select: { id: true, numero: true, estado: true, revisionCaptura: true, motivoCodigo: true, comercial: true, avisos: true, fechaCalculo: true, calculadaEn: true },
    });
    return e ? { ...e, estado: e.estado as EstimacionFila["estado"], fechaCalculo: dia(e.fechaCalculo) } : null;
  }

  /** Última estimación de cada solicitud dada (para los listados). */
  async ultimasEstimaciones(ctx: ContextoOrganizacion, solicitudIds: readonly string[]): Promise<Map<string, EstimacionFila>> {
    if (solicitudIds.length === 0) return new Map();
    const filas = await this.db.estimacionSolicitud.findMany({
      where: { organizacionId: ctx.organizacionId, solicitudId: { in: [...solicitudIds] } },
      orderBy: { numero: "desc" },
      select: { id: true, solicitudId: true, numero: true, estado: true, revisionCaptura: true, motivoCodigo: true, comercial: true, avisos: true, fechaCalculo: true, calculadaEn: true },
    });
    const m = new Map<string, EstimacionFila>();
    for (const { solicitudId, ...e } of filas) {
      if (!m.has(solicitudId)) m.set(solicitudId, { ...e, estado: e.estado as EstimacionFila["estado"], fechaCalculo: dia(e.fechaCalculo) });
    }
    return m;
  }

  // ------------------------------- cotizaciones emitidas -------------------------------

  /** Última emisión de cada cotización ACTIVA del cliente (la vigente de cada folio). */
  async emisionesDelCliente(ctx: ContextoOrganizacion, clienteId: string): Promise<EmisionResumenFila[]> {
    const filas = await this.db.emision.findMany({
      where: { organizacionId: ctx.organizacionId, cotizacion: { clienteId, estadoFolio: "ACTIVO" } },
      orderBy: { emitidoEn: "desc" },
      take: 200,
      select: {
        id: true,
        cotizacionId: true,
        folio: true,
        fechaEmision: true,
        vigenteHasta: true,
        total: true,
        emitidoEn: true,
        cotizacion: { select: { proyecto: { select: { nombre: true } }, solicitud: { select: { folio: true } } } },
      },
    });
    const vistas = new Set<string>();
    const ultimas: EmisionResumenFila[] = [];
    for (const f of filas) {
      if (vistas.has(f.cotizacionId)) continue;
      vistas.add(f.cotizacionId);
      ultimas.push(aEmision(f));
    }
    return ultimas;
  }

  /** Emisión por identificador, solo si su cotización es del cliente y sigue activa. */
  async emisionDelCliente(ctx: ContextoOrganizacion, clienteId: string, emisionId: string): Promise<(EmisionResumenFila & { contenido: unknown }) | null> {
    const f = await this.db.emision.findFirst({
      where: { organizacionId: ctx.organizacionId, id: emisionId, cotizacion: { clienteId, estadoFolio: "ACTIVO" } },
      select: {
        id: true,
        cotizacionId: true,
        folio: true,
        fechaEmision: true,
        vigenteHasta: true,
        total: true,
        emitidoEn: true,
        contenido: true,
        cotizacion: { select: { proyecto: { select: { nombre: true } }, solicitud: { select: { folio: true } } } },
      },
    });
    return f ? { ...aEmision(f), contenido: f.contenido } : null;
  }

  /** Última emisión de las cotizaciones que nacieron de las solicitudes dadas (para el seguimiento). */
  async emisionesDeSolicitudes(ctx: ContextoOrganizacion, clienteId: string, cotizacionIds: readonly string[]): Promise<Map<string, EmisionResumenFila>> {
    if (cotizacionIds.length === 0) return new Map();
    const filas = await this.db.emision.findMany({
      where: { organizacionId: ctx.organizacionId, cotizacionId: { in: [...cotizacionIds] }, cotizacion: { clienteId, estadoFolio: "ACTIVO" } },
      orderBy: { emitidoEn: "desc" },
      select: {
        id: true,
        cotizacionId: true,
        folio: true,
        fechaEmision: true,
        vigenteHasta: true,
        total: true,
        emitidoEn: true,
        cotizacion: { select: { proyecto: { select: { nombre: true } }, solicitud: { select: { folio: true } } } },
      },
    });
    const m = new Map<string, EmisionResumenFila>();
    for (const f of filas) if (!m.has(f.cotizacionId)) m.set(f.cotizacionId, aEmision(f));
    return m;
  }
}

/** Reexporta para que la capa de aplicación arme el catálogo sin importar el módulo de dominio por separado. */
export type { OpcionCatalogo };
