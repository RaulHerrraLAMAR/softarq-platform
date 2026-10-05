/**
 * Persistencia de las decisiones sobre excepciones (módulo 10, ADR-0014). Las excepciones viven en
 * la captura congelada de la versión; aquí solo se leen y se escribe la decisión con UNA sentencia
 * (`softarq_decidir_excepcion`: idempotencia, decisión y bitácora).
 */
import type { CapturaBorrador, DecisionExcepcion, EntradaCalculo } from "@softarq/contracts";
import type { ContextoOrganizacion, Db } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Idempotencia, RegistroIdempotencia } from "../aplicacion/idempotencia.js";
import type { Autor } from "./repositorio-cotizaciones.js";

export interface FilaDecisionExcepcion {
  numero: number;
  decision: DecisionExcepcion;
  comentario: string | null;
  decididoNombre: string;
  decididoEn: Date;
  revisionId: string;
}

export interface VersionConExcepciones {
  id: string;
  cotizacionId: string;
  numero: number;
  folio: string;
  autorId: string;
  captura: CapturaBorrador;
  entradaCalculo: EntradaCalculo;
  /** Revisión PENDIENTE de esta versión (si la hay): la única en la que se decide. */
  revisionPendiente: { id: string; preparadorId: string } | null;
}

export class RepositorioExcepciones {
  constructor(private readonly db: Db) {}

  async version(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<VersionConExcepciones | null> {
    const v = await this.db.cotizacionVersion.findFirst({
      where: { organizacionId: ctx.organizacionId, cotizacionId, numero },
      select: {
        id: true,
        cotizacionId: true,
        numero: true,
        autorId: true,
        captura: true,
        entradaCalculo: true,
        cotizacion: { select: { folio: true } },
        revisiones: { where: { estado: "PENDIENTE" }, select: { id: true, preparadorId: true }, take: 1 },
      },
    });
    if (!v) return null;
    return {
      id: v.id,
      cotizacionId: v.cotizacionId,
      numero: v.numero,
      folio: v.cotizacion.folio,
      autorId: v.autorId,
      captura: v.captura as CapturaBorrador,
      entradaCalculo: v.entradaCalculo as unknown as EntradaCalculo,
      revisionPendiente: v.revisiones[0] ?? null,
    };
  }

  /** Versión de una revisión de la organización (para decidir desde la ruta de la revisión). */
  async revision(ctx: ContextoOrganizacion, revisionId: string) {
    return this.db.revision.findFirst({
      where: { organizacionId: ctx.organizacionId, id: revisionId },
      select: { id: true, cotizacionId: true, versionId: true, versionNumero: true, estado: true, preparadorId: true },
    });
  }

  async decisiones(ctx: ContextoOrganizacion, versionId: string): Promise<FilaDecisionExcepcion[]> {
    const filas = await this.db.excepcionDecision.findMany({
      where: { organizacionId: ctx.organizacionId, versionId },
      orderBy: { numero: "asc" },
      select: { numero: true, decision: true, comentario: true, decididoNombre: true, decididoEn: true, revisionId: true },
    });
    return filas.map((f) => ({ ...f, decision: f.decision as DecisionExcepcion }));
  }

  /** Decisión por número (mapa para la verificación). */
  async mapaDecisiones(ctx: ContextoOrganizacion, versionId: string): Promise<Map<number, DecisionExcepcion>> {
    return new Map((await this.decisiones(ctx, versionId)).map((d) => [d.numero, d.decision]));
  }

  buscarIdempotencia(ctx: ContextoOrganizacion, autor: Autor, clave: string): Promise<RegistroIdempotencia | null> {
    return this.db.idempotencia.findUnique({
      where: { organizacionId_usuarioId_clave: { organizacionId: ctx.organizacionId, usuarioId: autor.usuarioId, clave } },
    });
  }

  async decidir(
    ctx: ContextoOrganizacion,
    autor: Autor,
    revisionId: string,
    versionId: string,
    numero: number,
    decision: DecisionExcepcion,
    comentario: string | null,
    idem: Idempotencia,
  ): Promise<string> {
    const r = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_decidir_excepcion(${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${revisionId}::uuid,
        ${versionId}::uuid, ${numero}::int, ${decision}, ${comentario}, ${idem.clave}::uuid, ${idem.operacion},
        ${idem.huella}, ${idem.expiraEn}::timestamptz)::text AS id`;
    return r[0]!.id;
  }
}
