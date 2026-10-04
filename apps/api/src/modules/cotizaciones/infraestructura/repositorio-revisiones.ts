/**
 * Repositorio de revisiones (módulo 7, ADR-0009).
 *
 * - Escrituras: UNA sentencia por operación (`softarq_enviar_revision`, `softarq_decidir_revision`,
 *   `softarq_retirar_revision`). Cada función comprueba en la misma sentencia permisos vigentes,
 *   versión objetivo, estado y ficha, y registra evento, bitácora e idempotencia.
 * - Lecturas: siempre con `organizacion_id` de la sesión dentro del `where`.
 * - La versión revisada se lee tal como se guardó; las columnas internas (entrada y resultado del
 *   cálculo) solo las usa la verificación vigente del servidor, nunca una respuesta HTTP.
 */
import type { CapturaBorrador, EventoRevision, HistorialRevision, SolicitudCalculoDemo } from "@softarq/contracts";
import type { EntradaCalculo } from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion, Db } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Idempotencia } from "../aplicacion/idempotencia.js";
import type { Autor } from "./repositorio-cotizaciones.js";

const nombre = { select: { usuario: { select: { nombre: true } } } } as const;

const seleccionRevision = {
  id: true,
  estado: true,
  revision: true,
  cotizacionId: true,
  folio: true,
  versionId: true,
  versionNumero: true,
  total: true,
  preparadorId: true,
  enviadoEn: true,
  resueltaEn: true,
  observaciones: true,
  preparador: nombre,
  emisor: nombre,
  resolutor: nombre,
  // Anulación de la aprobación (módulo 8): a lo sumo un evento; y si la versión ya se emitió.
  eventos: {
    where: { tipo: "APROBACION_ANULADA" },
    select: { usuarioNombre: true, ocurridoEn: true, observaciones: true },
  },
  emisiones: { select: { id: true } },
  version: {
    select: {
      fechaCalculo: true,
      autorId: true,
      autorNombre: true,
      clienteCodigo: true,
      clienteNombre: true,
      proyectoCodigo: true,
      proyectoNombre: true,
    },
  },
} satisfies Prisma.RevisionSelect;

export type FilaRevision = Prisma.RevisionGetPayload<{ select: typeof seleccionRevision }>;

const seleccionEvento = {
  secuencia: true,
  tipo: true,
  estadoAnterior: true,
  estadoNuevo: true,
  usuarioNombre: true,
  ocurridoEn: true,
  observaciones: true,
  avisos: true,
} satisfies Prisma.RevisionEventoSelect;

function aEvento(e: Prisma.RevisionEventoGetPayload<{ select: typeof seleccionEvento }>): EventoRevision {
  return {
    secuencia: e.secuencia,
    tipo: e.tipo as EventoRevision["tipo"],
    estadoAnterior: e.estadoAnterior as EventoRevision["estadoAnterior"],
    estadoNuevo: e.estadoNuevo as EventoRevision["estadoNuevo"],
    usuario: e.usuarioNombre,
    ocurridoEn: e.ocurridoEn.toISOString(),
    observaciones: e.observaciones,
    avisos: Array.isArray(e.avisos) ? (e.avisos as unknown[]).map(String) : [],
  };
}

/** Lo que la verificación vigente necesita de la versión (solo para el servidor). */
export interface VersionParaVerificar {
  id: string;
  cotizacionId: string;
  numero: number;
  autorId: string;
  versionMotor: string;
  captura: CapturaBorrador;
  solicitudCalculo: SolicitudCalculoDemo;
  entradaCalculo: EntradaCalculo;
  proyeccionComercial: unknown;
  avisos: { codigo: string; mensaje: string }[];
  clienteActivo: boolean;
  clienteCodigo: string;
  proyectoActivo: boolean;
  proyectoCodigo: string;
}

export class RepositorioRevisiones {
  constructor(private readonly db: Db) {}

  // ------------------------------- escrituras -------------------------------

  async enviar(
    ctx: ContextoOrganizacion,
    autor: Autor,
    cotizacionId: string,
    numero: number,
    revisionBorrador: number,
    avisos: readonly string[],
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_enviar_revision(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${numero}::integer,
        ${revisionBorrador}::integer, ${JSON.stringify(avisos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async decidir(
    ctx: ContextoOrganizacion,
    autor: Autor,
    revisionId: string,
    versionId: string,
    esperada: number,
    decision: "APROBAR" | "SOLICITAR_CAMBIOS",
    observaciones: string | null,
    avisos: readonly string[],
    idem: Idempotencia,
  ): Promise<void> {
    await this.db.$queryRaw`
      SELECT softarq_decidir_revision(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${revisionId}::uuid, ${versionId}::uuid,
        ${esperada}::integer, ${decision}, ${observaciones}, ${JSON.stringify(avisos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
  }

  async retirar(
    ctx: ContextoOrganizacion,
    autor: Autor,
    revisionId: string,
    esperada: number,
    motivo: string | null,
    idem: Idempotencia,
  ): Promise<void> {
    await this.db.$queryRaw`
      SELECT softarq_retirar_revision(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${revisionId}::uuid, ${esperada}::integer, ${motivo},
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
  }

  // -------------------------------- lecturas --------------------------------

  async obtener(ctx: ContextoOrganizacion, id: string): Promise<FilaRevision | null> {
    return this.db.revision.findFirst({ where: { id, organizacionId: ctx.organizacionId }, select: seleccionRevision });
  }

  async listar(ctx: ContextoOrganizacion, estado: string, limite: number): Promise<FilaRevision[]> {
    return this.db.revision.findMany({
      where: { organizacionId: ctx.organizacionId, estado },
      select: seleccionRevision,
      // Bandeja: la más antigua primero (orden de llegada).
      orderBy: [{ enviadoEn: estado === "PENDIENTE" ? "asc" : "desc" }, { id: "asc" }],
      take: limite,
    });
  }

  async eventos(ctx: ContextoOrganizacion, revisionId: string): Promise<EventoRevision[]> {
    const filas = await this.db.revisionEvento.findMany({
      where: { organizacionId: ctx.organizacionId, revisionId },
      select: seleccionEvento,
      orderBy: { secuencia: "asc" },
    });
    return filas.map(aEvento);
  }

  /** Revisiones de todas las versiones de una cotización, con sus eventos (la más reciente primero). */
  async historialDeCotizacion(ctx: ContextoOrganizacion, cotizacionId: string): Promise<HistorialRevision[]> {
    const filas = await this.db.revision.findMany({
      where: { organizacionId: ctx.organizacionId, cotizacionId },
      select: {
        id: true,
        versionNumero: true,
        estado: true,
        eventos: { select: seleccionEvento, orderBy: { secuencia: "asc" } },
      },
      orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
    });
    return filas.map((r) => ({
      id: r.id,
      versionNumero: r.versionNumero,
      estado: r.estado as HistorialRevision["estado"],
      eventos: r.eventos.map(aEvento),
    }));
  }

  /**
   * Versión y estado de cliente y proyecto para la verificación vigente. Se llama con el cliente
   * de una transacción REPEATABLE READ de solo lectura (una sola instantánea con los catálogos).
   */
  async versionParaVerificar(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<VersionParaVerificar | null> {
    const v = await this.db.cotizacionVersion.findFirst({
      where: { organizacionId: ctx.organizacionId, cotizacionId, numero },
      select: {
        id: true,
        cotizacionId: true,
        numero: true,
        autorId: true,
        versionMotor: true,
        captura: true,
        solicitudCalculo: true,
        entradaCalculo: true,
        proyeccionComercial: true,
        avisos: true,
        cotizacion: {
          select: {
            proyecto: { select: { codigo: true, activo: true, cliente: { select: { codigo: true, activo: true } } } },
          },
        },
      },
    });
    if (!v) return null;
    return {
      id: v.id,
      cotizacionId: v.cotizacionId,
      numero: v.numero,
      autorId: v.autorId,
      versionMotor: v.versionMotor,
      captura: v.captura as CapturaBorrador,
      solicitudCalculo: v.solicitudCalculo as SolicitudCalculoDemo,
      entradaCalculo: v.entradaCalculo as unknown as EntradaCalculo,
      proyeccionComercial: v.proyeccionComercial,
      avisos: v.avisos as { codigo: string; mensaje: string }[],
      clienteActivo: v.cotizacion.proyecto.cliente.activo,
      clienteCodigo: v.cotizacion.proyecto.cliente.codigo,
      proyectoActivo: v.cotizacion.proyecto.activo,
      proyectoCodigo: v.cotizacion.proyecto.codigo,
    };
  }
}
