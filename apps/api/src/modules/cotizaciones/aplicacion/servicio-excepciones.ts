/**
 * Excepciones B-22 (módulo 10, ADR-0014). Capa de aplicación: sin Nest ni HTTP.
 *
 * - Consulta interna de las excepciones de una versión con sus decisiones y valores técnicos
 *   (capacidad `excepciones.consultar`; nunca en la proyección comercial ni en el PDF).
 * - Componentes de catálogo para registrar una excepción de rendimiento (Preparador).
 * - Autorizar o rechazar (B-29, `Exc_Resolver`): Revisor distinto del preparador, durante la
 *   revisión PENDIENTE de esa versión; una decisión por excepción, inmutable. La sentencia atómica
 *   vuelve a comprobarlo todo con la revisión bloqueada.
 */
import type {
  DecisionExcepcionSolicitud,
  ExcepcionBorrador,
  ExcepcionVersion,
  ExcepcionesVersion,
  RespuestaComponentesExcepcion,
} from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { describirExcepcion } from "../dominio/excepciones.js";
import { RepositorioExcepciones, type FilaDecisionExcepcion, type VersionConExcepciones } from "../infraestructura/repositorio-excepciones.js";
import { ErrorNegocio, reconocerErrorBase } from "./errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "./idempotencia.js";
import type { RelojInstante } from "./servicio-clientes.js";
import type { Actor } from "./servicio-revisiones.js";

const NO_ENCONTRADA = () => new ErrorNegocio("NO_ENCONTRADO", "La versión, la revisión o la excepción no existe en su organización.");
const MENSAJE_BL17 = "BL-17: usted preparó esta versión; las excepciones las autoriza otra persona con la función de revisor.";

export class ServicioExcepciones {
  private readonly repo: RepositorioExcepciones;
  private readonly catalogos: RepositorioCatalogos;

  constructor(
    db: PrismaClient,
    private readonly instante: RelojInstante,
  ) {
    this.repo = new RepositorioExcepciones(db);
    this.catalogos = new RepositorioCatalogos(db);
  }

  /** Componentes activos (rendimiento y desperdicio de catálogo) de los conceptos indicados. */
  async componentes(ctx: ContextoOrganizacion, codigos: readonly string[]): Promise<RespuestaComponentesExcepcion> {
    return { conceptos: await this.catalogos.componentesParaExcepcion(ctx, codigos) };
  }

  async consultar(ctx: ContextoOrganizacion, actor: Actor, cotizacionId: string, numero: number): Promise<ExcepcionesVersion> {
    const v = await this.repo.version(ctx, cotizacionId, numero);
    if (!v) throw NO_ENCONTRADA();
    return this.presentar(ctx, actor, v, await this.repo.decisiones(ctx, v.id));
  }

  async decidir(
    ctx: ContextoOrganizacion,
    actor: Actor,
    revisionId: string,
    numero: number,
    s: DecisionExcepcionSolicitud,
    clave: string,
  ): Promise<{ excepciones: ExcepcionesVersion; reproducida: boolean }> {
    if (!actor.capacidades.includes("revisiones.decidir")) {
      throw new ErrorNegocio("SIN_PERMISO", "Solo un Revisor autoriza o rechaza excepciones.");
    }
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "decidir_excepcion", { revisionId, numero: String(numero) }, s, ahora);
    const r = await this.repo.revision(ctx, revisionId);
    if (!r) throw NO_ENCONTRADA();
    const v = await this.repo.version(ctx, r.cotizacionId, r.versionNumero);
    if (!v) throw NO_ENCONTRADA();
    try {
      const resultado = await ejecutarIdempotente(this.repo, ctx, actor, idem, ahora, async () => {
        // Comprobaciones previas con mensajes claros; la sentencia vuelve a comprobarlo todo.
        if (numero < 1 || numero > (v.captura.excepciones?.length ?? 0)) throw NO_ENCONTRADA();
        if (r.versionId !== s.versionId || r.estado !== "PENDIENTE") {
          throw new ErrorNegocio("CONFLICTO_REVISION", "La revisión cambió desde que la abrió; actualice para ver su estado vigente.");
        }
        if (actor.usuarioId === v.autorId || actor.usuarioId === r.preparadorId) {
          throw new ErrorNegocio("DECISION_BLOQUEADA", MENSAJE_BL17, {
            problemas: [{ codigo: "BL-17", referencia: `${v.folio}-v${v.numero}`, mensaje: MENSAJE_BL17 }],
          });
        }
        return this.repo.decidir(ctx, actor, revisionId, s.versionId, numero, s.decision, s.comentario ?? null, idem);
      });
      return { excepciones: await this.consultar(ctx, actor, v.cotizacionId, v.numero), reproducida: resultado.reproducida };
    } catch (e) {
      throw await this.traducir(ctx, actor, v, e);
    }
  }

  private async traducir(ctx: ContextoOrganizacion, actor: Actor, v: VersionConExcepciones, e: unknown): Promise<unknown> {
    const r = e instanceof ErrorNegocio ? { tipo: "negocio" as const, codigo: e.codigo as string } : reconocerErrorBase(e);
    if (r?.tipo !== "negocio") return e;
    switch (r.codigo) {
      case "CONFLICTO_EXCEPCION":
        return new ErrorNegocio("CONFLICTO_EXCEPCION", "Otra persona ya decidió esta excepción. Revise la decisión vigente; su comentario se conserva.", {
          excepcionesVigentes: await this.consultar(ctx, actor, v.cotizacionId, v.numero),
        });
      case "CONFLICTO_REVISION":
        return new ErrorNegocio("CONFLICTO_REVISION", "La revisión ya no está pendiente o cambió de versión; actualice para ver su estado vigente.", {
          excepcionesVigentes: await this.consultar(ctx, actor, v.cotizacionId, v.numero),
        });
      case "AUTOAPROBACION":
        return new ErrorNegocio("DECISION_BLOQUEADA", MENSAJE_BL17, {
          problemas: [{ codigo: "BL-17", referencia: `${v.folio}-v${v.numero}`, mensaje: MENSAJE_BL17 }],
        });
      case "NO_ENCONTRADO":
        return NO_ENCONTRADA();
      case "SIN_PERMISO":
        return new ErrorNegocio("SIN_PERMISO", "Su pertenencia ya no tiene la función necesaria para esta operación.");
    }
    return e;
  }

  private presentar(
    _ctx: ContextoOrganizacion,
    actor: Actor,
    v: VersionConExcepciones,
    decisiones: readonly FilaDecisionExcepcion[],
  ): ExcepcionesVersion {
    const porNumero = new Map(decisiones.map((d) => [d.numero, d]));
    const pendiente = v.revisionPendiente;
    const motivo = !actor.capacidades.includes("revisiones.decidir")
      ? "Solo un Revisor autoriza o rechaza excepciones."
      : !pendiente
        ? "Las excepciones se autorizan mientras la versión está en revisión."
        : actor.usuarioId === v.autorId || actor.usuarioId === pendiente.preparadorId
          ? MENSAJE_BL17
          : null;
    return {
      versionId: v.id,
      idVersion: `${v.folio}-v${v.numero}`,
      revisionId: pendiente?.id ?? null,
      excepciones: (v.captura.excepciones ?? []).map((x, i) => presentarExcepcion(x, i + 1, v, porNumero.get(i + 1))),
      acciones: { decidir: { permitida: motivo === null, motivo } },
    };
  }
}

/** Valor del catálogo con el que se calculó la versión (copiado en su entrada interna). */
function valorDeCatalogo(x: ExcepcionBorrador, v: VersionConExcepciones): string | null {
  if (x.tipo !== "RENDIMIENTO") return null;
  const p = v.entradaCalculo.partidas[x.partida - 1];
  const k = p?.tipo === "CONCEPTO" ? p.componentes.find((c) => c.id === x.componenteCodigo) : undefined;
  if (!k) return null;
  return x.campo === "RENDIMIENTO" ? `${k.rendimiento} ${k.unidadRendimiento}` : k.desperdicio;
}

function presentarExcepcion(
  x: ExcepcionBorrador,
  numero: number,
  v: VersionConExcepciones,
  d: FilaDecisionExcepcion | undefined,
): ExcepcionVersion {
  return {
    numero,
    tipo: x.tipo,
    referencia: describirExcepcion(x),
    campo: x.tipo === "RENDIMIENTO" ? x.campo : null,
    valorOriginal: valorDeCatalogo(x, v),
    valorAplicado: x.tipo === "RENDIMIENTO" ? x.valorAplicado : null,
    motivo: x.motivo,
    estado: d ? d.decision : "PENDIENTE",
    decision: d ? { por: d.decididoNombre, en: d.decididoEn.toISOString(), comentario: d.comentario } : null,
  };
}
