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
  cliente: { select: { nombre: true } },
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
  cliente: { nombre: string };
  cotizacion: { id: string; folio: string } | null;
};

function aFila(f: Fila): SolicitudFila {
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
  };
}

export class RepositorioEquipo {
  constructor(private readonly db: PrismaClient) {}

  async listar(ctx: ContextoOrganizacion, estados: readonly string[], limite: number): Promise<SolicitudFila[]> {
    const filas = await this.db.solicitudCliente.findMany({
      where: { organizacionId: ctx.organizacionId, estado: { in: estados.filter((e) => e !== "BORRADOR") } },
      orderBy: [{ enviadaEn: "asc" }, { creadaEn: "asc" }],
      take: limite,
      select: seleccion,
    });
    return filas.map((f) => aFila(f as unknown as Fila));
  }

  async obtener(ctx: ContextoOrganizacion, id: string): Promise<SolicitudFila | null> {
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
