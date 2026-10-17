/**
 * Revisión y aprobación de versiones (módulo 7, ADR-0009). Capa de aplicación: sin Nest ni HTTP.
 *
 * Fuentes: `BTN_EnviarRevision`/`Rev_Enviar` (B-26), `BTN_Observaciones`/`Rev_Observar` (B-28) y
 * `BTN_Aprobar`/`Rev_Aprobar` (B-29) de `modRevision.bas`; `Validar` de `modValidacion.bas`.
 *
 * Cada operación con efectos sigue el esquema de ADR-0008 §6:
 * 1. atajo de idempotencia (una clave ya usada reproduce el resultado);
 * 2. comprobaciones previas de solo lectura para responder con el error más útil (no garantizan
 *    nada: la base vuelve a comprobarlo todo);
 * 3. al enviar y aprobar, verificación de condiciones vigentes en una transacción REPEATABLE READ
 *    de solo lectura (recalcula EN MEMORIA para comparar; nunca guarda ni reemplaza importes);
 * 4. UNA sentencia atómica (`softarq_*_revision`) que comprueba permisos vigentes, versión
 *    objetivo, estado y ficha, y escribe la transición con su evento.
 * Ninguna transacción queda abierta mientras la persona lee o confirma.
 */
import type {
  AnulacionAprobacion,
  Capacidad,
  ConsultaRevisiones,
  CotizacionComercial,
  DecisionRevisionSolicitud,
  DetalleRevision,
  EstadoRevision,
  FechaISO,
  RespuestaRevisiones,
  ResumenRevision,
  RetiroRevision,
  SolicitudEnvioRevision,
  VerificacionRevision,
} from "@softarq/contracts";
import { LIMITES_API } from "@softarq/contracts";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { calcularSolicitud } from "../../calculo/aplicacion/calculo-demo.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { VERSION_MOTOR } from "../../calculo/domain/version-motor.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import {
  av02,
  av05,
  bl07,
  bl09,
  bl14,
  bl16,
  bl18,
  insumosDeEntrada,
  ordenarAvisos,
  problemasDeFaltantes,
  type Aviso,
  type Problema,
} from "../dominio/verificacion.js";
import { RepositorioCotizaciones, type Autor } from "../infraestructura/repositorio-cotizaciones.js";
import { RepositorioEmisiones } from "../infraestructura/repositorio-emisiones.js";
import { RepositorioRevisiones, type FilaRevision } from "../infraestructura/repositorio-revisiones.js";
import { bl20 } from "../dominio/textos.js";
import { av04, bloqueosExcepciones, preciosConExcepcion, sinExcepciones } from "../dominio/excepciones.js";
import { RepositorioExcepciones } from "../infraestructura/repositorio-excepciones.js";
import { ErrorNegocio, reconocerErrorBase } from "./errores.js";
import { prepararIdempotencia, reproducible, type RegistroIdempotencia } from "./idempotencia.js";
import type { RelojInstante } from "./servicio-clientes.js";

/** Tiempo máximo de la lectura de verificación (misma cota que la fase A de las versiones). */
const TIEMPO_MAXIMO_VERIFICACION_MS = 15_000;
const ESPERA_MAXIMA_CONEXION_MS = 10_000;

/** Quién consulta o actúa: identidad, nombre y capacidades de la sesión (nunca del cuerpo). */
export interface Actor extends Autor {
  readonly nombre: string;
  readonly capacidades: readonly Capacidad[];
}

const NO_ENCONTRADA = () => new ErrorNegocio("NO_ENCONTRADO", "La revisión no existe en su organización.");
const MENSAJE_BL17 = "BL-17: usted preparó esta versión; la aprobación corresponde a otra persona con la función de revisor.";

function iso(d: Date): string {
  return d.toISOString();
}

export class ServicioRevisiones {
  private readonly repo: RepositorioRevisiones;
  private readonly cotizaciones: RepositorioCotizaciones;
  private readonly emisiones: RepositorioEmisiones;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: Reloj,
    private readonly relojInstante: RelojInstante,
  ) {
    this.repo = new RepositorioRevisiones(prisma);
    this.cotizaciones = new RepositorioCotizaciones(prisma);
    this.emisiones = new RepositorioEmisiones(prisma);
  }

  // ------------------------------- consultas --------------------------------

  async listar(ctx: ContextoOrganizacion, actor: Actor, c: ConsultaRevisiones): Promise<RespuestaRevisiones> {
    const limite = c.limite ?? LIMITES_API.limiteListadoPorOmision;
    const filas = await this.repo.listar(ctx, c.estado ?? "PENDIENTE", limite);
    return { revisiones: filas.map((f) => aResumen(f, actor)), limite };
  }

  async detalle(ctx: ContextoOrganizacion, actor: Actor, id: string): Promise<DetalleRevision> {
    const f = await this.repo.obtener(ctx, id);
    if (!f) throw NO_ENCONTRADA();
    const version = await this.cotizaciones.obtenerVersion(ctx, f.cotizacionId, f.versionNumero);
    if (!version) throw NO_ENCONTRADA();
    const verificacion = f.estado === "PENDIENTE" ? sinVigencia(await this.verificar(ctx, f.cotizacionId, f.versionNumero)) : null;
    return {
      revision: aResumen(f, actor),
      version: {
        folio: version.folio,
        origen: "WEB_DEMO",
        version: version.resumen,
        cliente: version.cliente,
        proyecto: version.proyecto,
        versionMotor: version.versionMotor,
        huellaCalculo: version.huellaCalculo,
        // Sin excepciones: el Revisor las consulta con su ruta y permiso propios (módulo 10).
        captura: sinExcepciones(version.captura),
        cotizacion: version.cotizacion,
        avisos: version.avisos,
        cambios: version.cambios,
      },
      verificacion,
      eventos: await this.repo.eventos(ctx, id),
    };
  }

  /**
   * Verificación de condiciones vigentes (B-27) en UNA instantánea de solo lectura: estado de
   * cliente y proyecto, catálogos y parámetros de `hoy` (al emitir, la fecha de emisión). Recalcula
   * en memoria SOLO para comparar con la entrada guardada; la versión no se modifica. Incluye
   * BL-20 (textos de la versión, módulo 8) y la vigencia comercial vigente (CR-16 al emitir).
   *
   * Excepciones (módulo 10, W §3.10): `estricto` = false solo al ENVIAR (basta registrada con
   * motivo); al verificar en revisión, aprobar y emitir deben estar AUTORIZADAS. Una rechazada
   * bloquea siempre. AV-04 informa las autorizadas.
   */
  async verificar(
    ctx: ContextoOrganizacion,
    cotizacionId: string,
    numero: number,
    hoy: FechaISO = this.reloj.hoy(),
    estricto = true,
  ): Promise<VerificacionRevision & { vigenciaDias: number | null }> {
    const r = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const v = await new RepositorioRevisiones(tx).versionParaVerificar(ctx, cotizacionId, numero);
        if (!v) return null;
        const catalogos = new RepositorioCatalogos(tx);
        const bloqueos: Problema[] = [];
        if (!v.clienteActivo) bloqueos.push({ codigo: "BL-01", referencia: v.clienteCodigo, mensaje: `El cliente ${v.clienteCodigo} está inactivo.` });
        if (!v.proyectoActivo) bloqueos.push({ codigo: "BL-02", referencia: v.proyectoCodigo, mensaje: `El proyecto ${v.proyectoCodigo} está inactivo.` });

        const calculo = await calcularSolicitud(catalogos, ctx, v.solicitudCalculo, hoy);
        let entradaActual = null;
        switch (calculo.estado) {
          case "BLOQUEADO":
            bloqueos.push(...calculo.problemas);
            break;
          case "NO_ENCONTRADO":
            bloqueos.push(...problemasDeFaltantes(calculo.faltantes));
            break;
          case "ENTRADA_INVALIDA":
            bloqueos.push({
              codigo: "BL-16",
              referencia: "captura",
              mensaje: "La captura de esta versión ya no se puede calcular con las reglas vigentes. Genere una versión nueva.",
            });
            break;
          case "CALCULADO":
            entradaActual = calculo.entrada;
            break;
        }
        bloqueos.push(...bl16(v.entradaCalculo, v.versionMotor, entradaActual, VERSION_MOTOR));

        const e = v.entradaCalculo;
        const codigosConcepto = [...new Set(e.partidas.flatMap((p) => (p.tipo === "CONCEPTO" ? [p.concepto.id] : [])))];
        const [conProducto, precios, parametros, conceptos] = await Promise.all([
          catalogos.insumosConProductoActivo(ctx, insumosDeEntrada(e)),
          catalogos.obtenerPrecios(ctx, e.selecciones.map((s) => s.precioId)),
          catalogos.obtenerParametros(ctx),
          catalogos.obtenerConceptos(ctx, codigosConcepto),
        ]);
        const vigenciaDias = parametros?.vigenciaDias ?? null;
        const excepciones = v.captura.excepciones ?? [];
        const decisiones = await new RepositorioExcepciones(tx).mapaDecisiones(ctx, v.id);
        bloqueos.push(...bloqueosExcepciones(excepciones, decisiones, estricto, `v${v.numero}`));
        const eximidos = preciosConExcepcion(excepciones, decisiones, estricto);
        bloqueos.push(...bl07(insumosDeEntrada(e), conProducto), ...bl09(e, precios, hoy, eximidos), ...bl14(vigenciaDias));
        bloqueos.push(...bl18(v.proyeccionComercial as CotizacionComercial));
        bloqueos.push(...bl20(v.captura, `v${v.numero}`));

        const avisos: Aviso[] = [
          ...(v.avisos as Aviso[]),
          ...av02(e, precios, hoy, vigenciaDias),
          ...av04(excepciones, decisiones),
          ...av05(e, conceptos),
        ];
        return { bloqueos: unicos(bloqueos), avisos: ordenarAvisos(avisos), vigenciaDias };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: TIEMPO_MAXIMO_VERIFICACION_MS,
        maxWait: ESPERA_MAXIMA_CONEXION_MS,
      },
    );
    if (!r) throw new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");
    return { fechaReferencia: hoy, ...r };
  }

  /**
   * Verificación vigente de una versión para el editor del borrador (módulo 11, ADR-0015): indica si
   * el catálogo cambió después de calcularla (BL-16, BL-08, BL-09, BL-10…) para no presentarla como
   * vigente. Es la misma comprobación que al enviar (`estricto` = false); no escribe nada.
   */
  async verificacionDeVersion(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<VerificacionRevision> {
    return sinVigencia(await this.verificar(ctx, cotizacionId, numero, this.reloj.hoy(), false));
  }

  // ------------------------------- escrituras -------------------------------

  /** Enviar a revisión (B-26) la última versión, que debe corresponder a la captura guardada. */
  async enviar(
    ctx: ContextoOrganizacion,
    actor: Actor,
    cotizacionId: string,
    numero: number,
    s: SolicitudEnvioRevision,
    clave: string,
  ): Promise<{ detalle: DetalleRevision; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "enviar_revision", { cotizacionId, numero: String(numero) }, s, ahora);
    const previo = await this.cotizaciones.buscarIdempotencia(ctx, actor, idem.clave);
    if (previo) return this.reproducir(ctx, actor, previo, idem, ahora);

    // Comprobaciones previas (mensajes claros; la sentencia vuelve a comprobarlo todo).
    const d = await this.cotizaciones.obtenerCotizacion(ctx, cotizacionId, 0);
    if (!d) throw new ErrorNegocio("NO_ENCONTRADO", "La cotización no existe en su organización.");
    const v = d.versiones.find((x) => x.numero === numero);
    if (!v) throw new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");
    const pendiente = d.versiones.find((x) => x.revisionVigente?.estado === "PENDIENTE");
    if (pendiente) {
      throw new ErrorNegocio("REVISION_PENDIENTE", `La versión v${pendiente.numero} ya está en revisión; retírela antes de enviar otra.`);
    }
    if (!v.esUltima) {
      throw new ErrorNegocio("VERSION_NO_VIGENTE", `Solo se envía la última versión; v${numero} no lo es.`);
    }
    if (d.borrador.revision !== v.revisionBorrador || s.revisionBorrador !== d.borrador.revision) {
      throw new ErrorNegocio(
        "BORRADOR_DESACTUALIZADO",
        `El borrador tiene cambios guardados después de calcular v${numero} (revisión ${d.borrador.revision}). Calcule una versión nueva antes de enviar.`,
        { actual: { revision: d.borrador.revision, actualizadoPor: d.borrador.actualizadoPor, actualizadoEn: d.borrador.actualizadoEn } },
      );
    }
    if (v.estado === "APROBADA" || v.estado === "EMITIDA" || v.estado === "SUSTITUIDA") {
      const estado = v.estado === "APROBADA" ? "aprobada" : "emitida";
      throw new ErrorNegocio("ENVIO_BLOQUEADO", `La versión v${numero} ya está ${estado}.`, {
        problemas: [{ codigo: "BL-19", referencia: v.idVersion, mensaje: `La versión ${v.idVersion} ya está ${estado}: el estado no permite enviarla.` }],
      });
    }
    if (d.cotizacion.estadoFolio !== "ACTIVO") {
      throw new ErrorNegocio("FOLIO_NO_ACTIVO", "La cotización está descartada; no se envía a revisión.");
    }

    // W §3.10: al enviar basta con que las excepciones estén registradas con motivo.
    const verificacion = await this.verificar(ctx, cotizacionId, numero, this.reloj.hoy(), false);
    if (verificacion.bloqueos.length > 0) {
      await this.cotizaciones.registrarEvento(ctx, actor, "cotizacion", cotizacionId, "ENVIO_BLOQUEADO", {
        numero,
        codigos: [...new Set(verificacion.bloqueos.map((p) => p.codigo))],
      });
      throw new ErrorNegocio("ENVIO_BLOQUEADO", "No se puede enviar a revisión; el estado no cambió.", { problemas: verificacion.bloqueos });
    }

    try {
      const id = await this.repo.enviar(ctx, actor, cotizacionId, numero, s.revisionBorrador, codigos(verificacion.avisos), idem);
      return { detalle: await this.detalle(ctx, actor, id), reproducida: false };
    } catch (e) {
      return this.traducir(ctx, actor, e, idem, ahora);
    }
  }

  /** Aprobar o solicitar cambios (B-28, B-29) sobre la versión y la ficha que la persona vio. */
  async decidir(
    ctx: ContextoOrganizacion,
    actor: Actor,
    id: string,
    s: DecisionRevisionSolicitud,
    clave: string,
  ): Promise<{ detalle: DetalleRevision; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "decidir_revision", { revisionId: id }, s, ahora);
    const previo = await this.repo_buscar(ctx, actor, idem.clave);
    if (previo) return this.reproducir(ctx, actor, previo, idem, ahora);

    const f = await this.repo.obtener(ctx, id);
    if (!f) throw NO_ENCONTRADA();
    if (f.versionId !== s.versionId || f.estado !== "PENDIENTE" || f.revision !== s.revision) {
      throw this.conflicto(f, actor);
    }
    let avisos: string[] = [];
    if (s.decision === "APROBAR") {
      if (actor.usuarioId === f.version.autorId || actor.usuarioId === f.preparadorId) {
        throw new ErrorNegocio("DECISION_BLOQUEADA", MENSAJE_BL17, {
          problemas: [{ codigo: "BL-17", referencia: `${f.folio}-v${f.versionNumero}`, mensaje: MENSAJE_BL17 }],
        });
      }
      const verificacion = await this.verificar(ctx, f.cotizacionId, f.versionNumero);
      if (verificacion.bloqueos.length > 0) {
        await this.cotizaciones.registrarEvento(ctx, actor, "cotizacion", f.cotizacionId, "APROBACION_BLOQUEADA", {
          revisionId: f.id,
          numero: f.versionNumero,
          codigos: [...new Set(verificacion.bloqueos.map((p) => p.codigo))],
        });
        throw new ErrorNegocio("APROBACION_BLOQUEADA", "No se puede aprobar; el estado no cambió.", { problemas: verificacion.bloqueos });
      }
      avisos = codigos(verificacion.avisos);
    }

    try {
      await this.repo.decidir(ctx, actor, id, s.versionId, s.revision, s.decision, s.observaciones ?? null, avisos, idem);
      return { detalle: await this.detalle(ctx, actor, id), reproducida: false };
    } catch (e) {
      return this.traducir(ctx, actor, e, idem, ahora, id);
    }
  }

  /** Retirar una revisión pendiente para corregir (adaptación de la web; motivo opcional). */
  async retirar(
    ctx: ContextoOrganizacion,
    actor: Actor,
    id: string,
    s: RetiroRevision,
    clave: string,
  ): Promise<{ detalle: DetalleRevision; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "retirar_revision", { revisionId: id }, s, ahora);
    const previo = await this.repo_buscar(ctx, actor, idem.clave);
    if (previo) return this.reproducir(ctx, actor, previo, idem, ahora);

    const f = await this.repo.obtener(ctx, id);
    if (!f) throw NO_ENCONTRADA();
    if (f.estado !== "PENDIENTE" || f.revision !== s.revision) throw this.conflicto(f, actor);
    try {
      await this.repo.retirar(ctx, actor, id, s.revision, s.motivo ?? null, idem);
      return { detalle: await this.detalle(ctx, actor, id), reproducida: false };
    } catch (e) {
      return this.traducir(ctx, actor, e, idem, ahora, id);
    }
  }

  /**
   * Anular una aprobación ANTES de emitir (módulo 8, ADR-0010; adaptación de `Rev_Observar` sobre
   * una versión Aprobada): solo un Revisor, con motivo, sobre la revisión aprobada que vio. Crea un
   * evento nuevo; la revisión y su evento de aprobación no cambian.
   */
  async anular(
    ctx: ContextoOrganizacion,
    actor: Actor,
    id: string,
    s: AnulacionAprobacion,
    clave: string,
  ): Promise<{ detalle: DetalleRevision; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "anular_aprobacion", { revisionId: id }, s, ahora);
    const previo = await this.repo_buscar(ctx, actor, idem.clave);
    if (previo) return this.reproducir(ctx, actor, previo, idem, ahora);

    const f = await this.repo.obtener(ctx, id);
    if (!f) throw NO_ENCONTRADA();
    if (f.emisiones.length > 0) {
      throw new ErrorNegocio("VERSION_EMITIDA", "La versión ya se emitió: su aprobación no se puede anular (el documento emitido no se altera).");
    }
    if (f.estado !== "APROBADA" || f.revision !== s.revision || f.eventos.length > 0) throw this.conflicto(f, actor);
    try {
      await this.emisiones.anular(ctx, actor, id, s.revision, s.motivo ?? "", idem);
      return { detalle: await this.detalle(ctx, actor, id), reproducida: false };
    } catch (e) {
      return this.traducir(ctx, actor, e, idem, ahora, id);
    }
  }

  // -------------------------------- apoyo -----------------------------------

  private repo_buscar(ctx: ContextoOrganizacion, actor: Actor, clave: string) {
    return this.cotizaciones.buscarIdempotencia(ctx, actor, clave);
  }

  private async reproducir(
    ctx: ContextoOrganizacion,
    actor: Actor,
    registro: RegistroIdempotencia,
    idem: ReturnType<typeof prepararIdempotencia>,
    ahora: Date,
  ) {
    const id = reproducible(registro, idem, ahora);
    return { detalle: await this.detalle(ctx, actor, id), reproducida: true };
  }

  private conflicto(f: FilaRevision, actor: Actor): ErrorNegocio {
    const resumen = aResumen(f, actor);
    const mensaje = resumen.anulacion
      ? `La aprobación ya se anuló (por ${resumen.anulacion.por}). Actualice para ver el estado vigente.`
      : f.estado === "PENDIENTE"
        ? "La revisión cambió desde que la abrió; actualice para ver su estado vigente."
        : `La revisión ya no está pendiente: ${textoEstado(f.estado)}${resumen.resueltaPor ? ` por ${resumen.resueltaPor}` : ""}. Actualice para ver el estado vigente.`;
    return new ErrorNegocio("CONFLICTO_REVISION", mensaje, { revisionVigente: resumen });
  }

  /** Errores de la sentencia atómica → errores de negocio (o reproducción idempotente). */
  private async traducir(
    ctx: ContextoOrganizacion,
    actor: Actor,
    e: unknown,
    idem: ReturnType<typeof prepararIdempotencia>,
    ahora: Date,
    revisionId?: string,
  ): Promise<{ detalle: DetalleRevision; reproducida: boolean }> {
    const r = reconocerErrorBase(e);
    if (r?.tipo === "idempotencia_repetida") {
      const otro = await this.repo_buscar(ctx, actor, idem.clave);
      if (otro) return this.reproducir(ctx, actor, otro, idem, ahora);
    }
    if (r?.tipo === "negocio") {
      switch (r.codigo) {
        case "NO_ENCONTRADO":
          throw new ErrorNegocio("NO_ENCONTRADO", "La versión o la revisión no existe en su organización.");
        case "SIN_PERMISO":
          throw new ErrorNegocio("SIN_PERMISO", "Su pertenencia ya no tiene la función necesaria para esta operación.");
        case "REVISION_PENDIENTE":
          throw new ErrorNegocio("REVISION_PENDIENTE", "Otra versión de esta cotización ya está en revisión.");
        case "VERSION_NO_VIGENTE":
          throw new ErrorNegocio("VERSION_NO_VIGENTE", "Se guardó una versión más reciente; solo se envía la última.");
        case "BORRADOR_DESACTUALIZADO":
          throw new ErrorNegocio("BORRADOR_DESACTUALIZADO", "El borrador cambió después de calcular esta versión; calcule una versión nueva.");
        case "VERSION_EMITIDA":
          throw new ErrorNegocio("VERSION_EMITIDA", "La versión ya se emitió; su estado no cambia.");
        case "MOTIVO_REQUERIDO":
          throw new ErrorNegocio("DECISION_BLOQUEADA", "Indique el motivo.");
        case "FOLIO_NO_ACTIVO":
        case "VERSION_YA_APROBADA":
          throw new ErrorNegocio("ENVIO_BLOQUEADO", "El estado no permite enviar esta versión.", {
            problemas: [{ codigo: "BL-19", referencia: r.codigo, mensaje: "El estado no permite enviar esta versión a revisión." }],
          });
        case "AUTOAPROBACION":
          throw new ErrorNegocio("DECISION_BLOQUEADA", MENSAJE_BL17, {
            problemas: [{ codigo: "BL-17", referencia: revisionId ?? "", mensaje: MENSAJE_BL17 }],
          });
        case "EXCEPCIONES_SIN_AUTORIZAR":
          throw new ErrorNegocio("APROBACION_BLOQUEADA", "No se puede aprobar: hay excepciones sin autorizar; el estado no cambió.", {
            problemas: [{
              codigo: "BL-05",
              referencia: revisionId ?? "",
              mensaje: "Todas las excepciones de la versión deben estar autorizadas por un revisor antes de aprobar (W §3.10).",
            }],
          });
        case "OBSERVACIONES_REQUERIDAS":
        case "DECISION_INVALIDA":
          throw new ErrorNegocio("DECISION_BLOQUEADA", "Indique una decisión válida y, para solicitar cambios, sus observaciones.");
        case "CONFLICTO_REVISION": {
          const f = revisionId ? await this.repo.obtener(ctx, revisionId) : null;
          if (f) throw this.conflicto(f, actor);
          throw new ErrorNegocio("CONFLICTO_REVISION", "La revisión cambió; actualice para ver su estado vigente.");
        }
      }
    }
    throw e;
  }
}

function codigos(avisos: readonly { codigo: string }[]): string[] {
  return [...new Set(avisos.map((a) => a.codigo))].sort();
}

function unicos(p: readonly Problema[]): Problema[] {
  const vistos = new Set<string>();
  return p.filter((x) => {
    const k = `${x.codigo}|${x.referencia}|${x.mensaje}`;
    return vistos.has(k) ? false : (vistos.add(k), true);
  });
}

/** La verificación para HTTP (el contrato no incluye la vigencia interna). */
function sinVigencia(v: VerificacionRevision & { vigenciaDias: number | null }): VerificacionRevision {
  const { vigenciaDias: _, ...resto } = v;
  return resto;
}

function textoEstado(e: string): string {
  return e === "APROBADA" ? "aprobada" : e === "CAMBIOS_SOLICITADOS" ? "con cambios solicitados" : e === "RETIRADA" ? "retirada" : "pendiente";
}

/** Resumen con las acciones que la sesión puede realizar (las decide el servidor). */
export function aResumen(f: FilaRevision, actor: Actor): ResumenRevision {
  const pendiente = f.estado === "PENDIENTE";
  const revisor = actor.capacidades.includes("revisiones.decidir");
  const esAutor = actor.usuarioId === f.version.autorId || actor.usuarioId === f.preparadorId;
  const anulada = f.eventos[0] ?? null;
  const emitida = f.emisiones.length > 0;
  return {
    id: f.id,
    estado: f.estado as EstadoRevision,
    revision: f.revision,
    cotizacionId: f.cotizacionId,
    folio: f.folio,
    origen: "WEB_DEMO",
    version: {
      id: f.versionId,
      numero: f.versionNumero,
      idVersion: `${f.folio}-v${f.versionNumero}`,
      total: f.total.toFixed(2),
      fechaCalculo: f.version.fechaCalculo.toISOString().slice(0, 10),
    },
    cliente: { codigo: f.version.clienteCodigo, nombre: f.version.clienteNombre },
    proyecto: { codigo: f.version.proyectoCodigo, nombre: f.version.proyectoNombre },
    preparador: f.version.autorNombre,
    enviadoPor: f.emisor.usuario.nombre,
    enviadoEn: iso(f.enviadoEn),
    resueltaPor: f.resolutor?.usuario.nombre ?? null,
    resueltaEn: f.resueltaEn ? iso(f.resueltaEn) : null,
    observaciones: f.observaciones,
    anulacion: anulada ? { por: anulada.usuarioNombre, en: iso(anulada.ocurridoEn), motivo: anulada.observaciones ?? "" } : null,
    emitida,
    acciones: {
      aprobar: pendiente && revisor && !esAutor,
      solicitarCambios: pendiente && revisor,
      retirar: pendiente && actor.capacidades.includes("revisiones.enviar"),
      anularAprobacion: f.estado === "APROBADA" && !anulada && !emitida && revisor,
      motivoNoAprobar: pendiente && revisor && esAutor ? MENSAJE_BL17 : null,
    },
  };
}
