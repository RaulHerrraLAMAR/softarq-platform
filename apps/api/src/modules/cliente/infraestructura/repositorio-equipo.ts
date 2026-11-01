/**
 * Lecturas y la escritura de atención del panel del equipo (módulo 17). Solo solicitudes ya enviadas: el equipo no ve los
 * borradores de los clientes. La atención usa la función `softarq_atender_solicitud`, que exige la función PREPARADOR en la base.
 */
import { EsquemaCapturaSolicitud, type CapturaBorrador } from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { ProyectoFila, SolicitudFila } from "./repositorio-cliente.js";

const seleccion = {
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
  cliente: { select: { nombre: true, clasificacion: { select: { categoria: true } } } },
  cotizacion: { select: { id: true, folio: true } },
} as const;

type Fila = {
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
  cliente: { nombre: string; clasificacion: { categoria: string } | null };
  cotizacion: { id: string; folio: string } | null;
};

/** La fila de la solicitud más la clasificación de su cliente (solo la ve el equipo). */
export type SolicitudFilaEquipo = SolicitudFila & { clasificacion: "PRESENTACION" | "QA" | "HUMO" | null };

function aFila(f: Fila): SolicitudFilaEquipo {
  const c = EsquemaCapturaSolicitud.safeParse(f.captura);
  return {
    id: f.id,
    folio: f.folio,
    estado: f.estado as SolicitudFila["estado"],
    revision: f.revision,
    captura: c.success ? c.data : { trabajos: [], notas: null },
    proyecto: f.proyecto,
    clienteId: f.clienteId,
    clienteNombre: f.cliente.nombre,
    creadaEn: f.creadaEn,
    actualizadaEn: f.actualizadaEn,
    enviadaEn: f.enviadaEn,
    cotizacionId: f.cotizacion?.id ?? null,
    cotizacionFolio: f.cotizacion?.folio ?? null,
    clasificacion: (f.cliente.clasificacion?.categoria as SolicitudFilaEquipo["clasificacion"]) ?? null,
  };
}

export class RepositorioEquipo {
  constructor(private readonly db: PrismaClient) {}

  async listar(ctx: ContextoOrganizacion, estados: readonly string[], limite: number, clasificacion?: string): Promise<SolicitudFilaEquipo[]> {
    const dondeClasificacion = clasificacion === undefined ? {} : { cliente: { clasificacion: clasificacion === "SIN_CLASIFICAR" ? { is: null } : { is: { categoria: clasificacion } } } };
    const filas = await this.db.solicitudCliente.findMany({
      where: { organizacionId: ctx.organizacionId, estado: { in: estados.filter((e) => e !== "BORRADOR") }, ...dondeClasificacion },
      orderBy: [{ enviadaEn: "asc" }, { creadaEn: "asc" }],
      take: limite,
      select: seleccion,
    });
    return filas.map((f) => aFila(f as unknown as Fila));
  }

  /** Cotizaciones (de las dadas) que ya tienen una emisión: la solicitud de la que nacieron figura como «cotizada». */
  async cotizacionesEmitidas(ctx: ContextoOrganizacion, cotizacionIds: readonly string[]): Promise<Set<string>> {
    if (cotizacionIds.length === 0) return new Set();
    const filas = await this.db.emision.findMany({
      where: { organizacionId: ctx.organizacionId, cotizacionId: { in: [...cotizacionIds] }, cotizacion: { estadoFolio: "ACTIVO" } },
      select: { cotizacionId: true },
      distinct: ["cotizacionId"],
    });
    return new Set(filas.map((f) => f.cotizacionId));
  }

  async obtener(ctx: ContextoOrganizacion, id: string): Promise<SolicitudFilaEquipo | null> {
    const f = await this.db.solicitudCliente.findFirst({ where: { organizacionId: ctx.organizacionId, id, estado: { not: "BORRADOR" } }, select: seleccion });
    return f ? aFila(f as unknown as Fila) : null;
  }

  async atender(ctx: ContextoOrganizacion, usuarioId: string, id: string, revision: number, anio: number, borrador: CapturaBorrador): Promise<{ cotizacionId: string; folio: string; repetida: boolean }> {
    const filas = await this.db.$queryRaw<{ cotizacion_id: string; folio: string; repetida: boolean }[]>`
      SELECT cotizacion_id::text AS cotizacion_id, folio, repetida FROM softarq_atender_solicitud(
        ${ctx.organizacionId}::uuid, ${usuarioId}::uuid, ${id}::uuid, ${revision}::integer, ${anio}::integer, ${JSON.stringify(borrador)}::jsonb)`;
    const r = filas[0]!;
    return { cotizacionId: r.cotizacion_id, folio: r.folio, repetida: r.repetida };
  }
}
