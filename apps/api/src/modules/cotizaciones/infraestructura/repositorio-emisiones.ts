/**
 * Repositorio de emisiones, emisor, anulación de aprobaciones y descarte (módulo 8, ADR-0010).
 *
 * - Escrituras: UNA sentencia por operación (`softarq_emitir_version`, `softarq_anular_aprobacion`,
 *   `softarq_descartar_cotizacion`, `softarq_guardar_emisor`), que vuelve a comprobar en la base
 *   permisos vigentes, versión, aprobación y estado con las filas bloqueadas.
 * - Lecturas: siempre con `organizacion_id` de la sesión dentro del `where`.
 * - Las columnas internas de la versión (entrada y resultado del cálculo) nunca salen de aquí hacia
 *   HTTP; el contenido del documento es la estructura comercial ya filtrada.
 */
import type { DocumentoCotizacion, ResumenEmision } from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion, Db } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Idempotencia } from "../aplicacion/idempotencia.js";
import type { Autor } from "./repositorio-cotizaciones.js";

export const seleccionEmision = {
  id: true,
  cotizacionId: true,
  folio: true,
  versionId: true,
  versionNumero: true,
  revisionId: true,
  fechaEmision: true,
  vigenciaDias: true,
  vigenteHasta: true,
  total: true,
  preparadoNombre: true,
  aprobadoNombre: true,
  emitidoNombre: true,
  emitidoEn: true,
  plantillaVersion: true,
  archivoClave: true,
  archivoBytes: true,
  archivoSha256: true,
} satisfies Prisma.EmisionSelect;

export type FilaEmision = Prisma.EmisionGetPayload<{ select: typeof seleccionEmision }>;

function fechaIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Nombre de descarga: solo el folio validado y el número (nunca datos del cliente ni rutas). */
export function nombreArchivo(folio: string, numero: number): string {
  if (!/^COT-\d{4}-\d{5}$/.test(folio) || !Number.isInteger(numero) || numero < 1) {
    throw new Error("Folio o número de versión inválidos para el nombre del archivo.");
  }
  return `${folio}-v${numero}.pdf`;
}

export function aResumenEmision(f: FilaEmision, sustituida: boolean): ResumenEmision {
  return {
    id: f.id,
    folio: f.folio,
    versionNumero: f.versionNumero,
    idVersion: `${f.folio}-v${f.versionNumero}`,
    origen: "WEB_DEMO",
    fechaEmision: fechaIso(f.fechaEmision),
    vigenciaDias: f.vigenciaDias,
    vigenteHasta: fechaIso(f.vigenteHasta),
    total: f.total.toFixed(2),
    preparadoPor: f.preparadoNombre,
    aprobadoPor: f.aprobadoNombre,
    emitidoPor: f.emitidoNombre,
    emitidoEn: f.emitidoEn.toISOString(),
    plantillaVersion: f.plantillaVersion,
    sustituida,
    archivo: {
      nombre: nombreArchivo(f.folio, f.versionNumero),
      bytes: f.archivoBytes,
      sha256: Buffer.from(f.archivoSha256).toString("hex"),
    },
  };
}

/** Lo que `softarq_emitir_version` registra (claves camelCase; las lee la función). */
export interface DatosEmision {
  id: string;
  ambiente: "DEMO" | "PRODUCCION";
  fechaEmision: string;
  vigenciaDias: number;
  vigenteHasta: string;
  total: string;
  contenido: DocumentoCotizacion;
  plantillaVersion: string;
  archivoClave: string;
  archivoBytes: number;
  archivoSha256: string;
}

/** Datos para emitir (fase A, dentro de la lectura de solo lectura). */
export interface DatosParaEmitir {
  versionId: string;
  cotizacionId: string;
  folio: string;
  numero: number;
  ultimaVersion: number;
  estadoFolio: string;
  revisionBorrador: number;
  borradorRevision: number;
  autorId: string;
  autorNombre: string;
  total: string;
  captura: unknown;
  proyeccionComercial: unknown;
  version: {
    clienteCodigo: string;
    clienteNombre: string;
    proyectoCodigo: string;
    proyectoNombre: string;
    proyectoUbicacion: string | null;
    proyectoDescripcion: string | null;
  };
  cliente: {
    codigo: string;
    nombre: string;
    activo: boolean;
    contactoNombre: string | null;
    contactoTelefono: string | null;
    contactoCorreo: string | null;
  };
  proyecto: {
    codigo: string;
    nombre: string;
    activo: boolean;
    municipio: string | null;
    entidadFederativa: string | null;
    descripcion: string | null;
    clienteId: string;
  };
  clienteIdCotizacion: string;
  pendiente: boolean;
}

export interface FilaEmisor {
  nombre: string | null;
  domicilio: string | null;
  telefono: string | null;
  correo: string | null;
  logoClave: string | null;
  esDemo: boolean;
  revision: number;
  modificadoEn: Date;
  modificador: { usuario: { nombre: string } } | null;
}

/** Aprobación más reciente de una versión, con su anulación si la hubo. */
export interface AprobacionDeVersion {
  revisionId: string;
  estado: string;
  revision: number;
  resueltaPor: string | null;
  aprobadaPor: string | null;
  aprobadaEn: Date | null;
  anulada: boolean;
}

export class RepositorioEmisiones {
  constructor(private readonly db: Db) {}

  // ------------------------------- escrituras -------------------------------

  async emitir(
    ctx: ContextoOrganizacion,
    autor: Autor,
    cotizacionId: string,
    numero: number,
    versionId: string,
    revisionId: string,
    datos: DatosEmision,
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_emitir_version(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${numero}::integer,
        ${versionId}::uuid, ${revisionId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async anular(
    ctx: ContextoOrganizacion,
    autor: Autor,
    revisionId: string,
    esperada: number,
    motivo: string,
    idem: Idempotencia,
  ): Promise<void> {
    await this.db.$queryRaw`
      SELECT softarq_anular_aprobacion(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${revisionId}::uuid, ${esperada}::integer, ${motivo},
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
  }

  async descartar(ctx: ContextoOrganizacion, autor: Autor, cotizacionId: string, motivo: string, idem: Idempotencia): Promise<void> {
    await this.db.$queryRaw`
      SELECT softarq_descartar_cotizacion(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${cotizacionId}::uuid, ${motivo},
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
  }

  async guardarEmisor(
    ctx: ContextoOrganizacion,
    autor: Autor,
    revision: number,
    datos: { nombre: string | null; domicilio: string | null; telefono: string | null; correo: string | null; logoClave: string | null },
    motivo: string,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_guardar_emisor(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${revision}::integer, ${JSON.stringify(datos)}::jsonb, ${motivo}
      ) AS revision`;
    return filas[0]!.revision;
  }

  // -------------------------------- lecturas --------------------------------

  async obtenerEmisor(ctx: ContextoOrganizacion): Promise<FilaEmisor | null> {
    return this.db.emisor.findUnique({
      where: { organizacionId: ctx.organizacionId },
      select: {
        nombre: true,
        domicilio: true,
        telefono: true,
        correo: true,
        logoClave: true,
        esDemo: true,
        revision: true,
        modificadoEn: true,
        modificador: { select: { usuario: { select: { nombre: true } } } },
      },
    });
  }

  async ambiente(ctx: ContextoOrganizacion): Promise<"DEMO" | "PRODUCCION" | null> {
    const p = await this.db.parametrosCalculo.findUnique({ where: { organizacionId: ctx.organizacionId }, select: { ambiente: true } });
    return p ? (p.ambiente === "DEMO" ? "DEMO" : "PRODUCCION") : null;
  }

  async obtener(ctx: ContextoOrganizacion, id: string): Promise<(FilaEmision & { contenido: unknown; organizacionId: string }) | null> {
    return this.db.emision.findFirst({
      where: { id, organizacionId: ctx.organizacionId },
      select: { ...seleccionEmision, contenido: true, organizacionId: true },
    });
  }

  async deVersion(ctx: ContextoOrganizacion, versionId: string): Promise<FilaEmision | null> {
    return this.db.emision.findFirst({ where: { versionId, organizacionId: ctx.organizacionId }, select: seleccionEmision });
  }

  /** ¿Se emitió después una versión posterior de la misma cotización? */
  async sustituida(ctx: ContextoOrganizacion, f: { cotizacionId: string; versionNumero: number }): Promise<boolean> {
    const n = await this.db.emision.count({
      where: { organizacionId: ctx.organizacionId, cotizacionId: f.cotizacionId, versionNumero: { gt: f.versionNumero } },
    });
    return n > 0;
  }

  /** Emisiones de las cotizaciones indicadas, por versión (con «sustituida» ya calculada). */
  async emisionesDeCotizaciones(ctx: ContextoOrganizacion, cotizacionIds: readonly string[]): Promise<Map<string, ResumenEmision>> {
    const mapa = new Map<string, ResumenEmision>();
    if (cotizacionIds.length === 0) return mapa;
    const filas = await this.db.emision.findMany({
      where: { organizacionId: ctx.organizacionId, cotizacionId: { in: [...cotizacionIds] } },
      select: seleccionEmision,
    });
    const maxima = new Map<string, number>();
    for (const f of filas) maxima.set(f.cotizacionId, Math.max(maxima.get(f.cotizacionId) ?? 0, f.versionNumero));
    for (const f of filas) mapa.set(f.versionId, aResumenEmision(f, f.versionNumero < (maxima.get(f.cotizacionId) ?? 0)));
    return mapa;
  }

  /** Revisión más reciente de la versión: la única que puede ser la aprobación vigente. */
  async aprobacionDeVersion(ctx: ContextoOrganizacion, versionId: string): Promise<AprobacionDeVersion | null> {
    const r = await this.db.revision.findFirst({
      where: { organizacionId: ctx.organizacionId, versionId },
      select: {
        id: true,
        estado: true,
        revision: true,
        resueltaPor: true,
        resueltaEn: true,
        eventos: { where: { tipo: { in: ["APROBADA", "APROBACION_ANULADA"] } }, select: { tipo: true, usuarioNombre: true } },
      },
      orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
    });
    if (!r) return null;
    return {
      revisionId: r.id,
      estado: r.estado,
      revision: r.revision,
      resueltaPor: r.resueltaPor,
      aprobadaPor: r.eventos.find((e) => e.tipo === "APROBADA")?.usuarioNombre ?? null,
      aprobadaEn: r.estado === "APROBADA" ? r.resueltaEn : null,
      anulada: r.eventos.some((e) => e.tipo === "APROBACION_ANULADA"),
    };
  }

  /** Fase A de la emisión: versión, cotización, borrador, cliente y proyecto ACTUALES. */
  async leerParaEmitir(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<DatosParaEmitir | null> {
    const v = await this.db.cotizacionVersion.findFirst({
      where: { organizacionId: ctx.organizacionId, cotizacionId, numero },
      select: {
        id: true,
        numero: true,
        revisionBorrador: true,
        autorId: true,
        autorNombre: true,
        total: true,
        captura: true,
        proyeccionComercial: true,
        clienteCodigo: true,
        clienteNombre: true,
        proyectoCodigo: true,
        proyectoNombre: true,
        proyectoUbicacion: true,
        proyectoDescripcion: true,
        cotizacion: {
          select: {
            folio: true,
            ultimaVersion: true,
            estadoFolio: true,
            clienteId: true,
            borrador: { select: { revision: true } },
            proyecto: {
              select: {
                codigo: true,
                nombre: true,
                activo: true,
                municipio: true,
                entidadFederativa: true,
                descripcion: true,
                clienteId: true,
                cliente: {
                  select: { codigo: true, nombre: true, activo: true, contactoNombre: true, contactoTelefono: true, contactoCorreo: true },
                },
              },
            },
          },
        },
      },
    });
    if (!v || !v.cotizacion.borrador) return null;
    const pendientes = await this.db.revision.count({
      where: { organizacionId: ctx.organizacionId, cotizacionId, estado: "PENDIENTE" },
    });
    const q = v.cotizacion;
    const { cliente, ...proyecto } = q.proyecto;
    return {
      versionId: v.id,
      cotizacionId,
      folio: q.folio,
      numero: v.numero,
      ultimaVersion: q.ultimaVersion,
      estadoFolio: q.estadoFolio,
      revisionBorrador: v.revisionBorrador,
      borradorRevision: q.borrador!.revision,
      autorId: v.autorId,
      autorNombre: v.autorNombre,
      total: v.total.toFixed(2),
      captura: v.captura,
      proyeccionComercial: v.proyeccionComercial,
      version: {
        clienteCodigo: v.clienteCodigo,
        clienteNombre: v.clienteNombre,
        proyectoCodigo: v.proyectoCodigo,
        proyectoNombre: v.proyectoNombre,
        proyectoUbicacion: v.proyectoUbicacion,
        proyectoDescripcion: v.proyectoDescripcion,
      },
      cliente,
      proyecto,
      clienteIdCotizacion: q.clienteId,
      pendiente: pendientes > 0,
    };
  }

  /** Claves de archivo registradas (recuperación: distinguir archivos propios sin registro). */
  async clavesRegistradas(): Promise<Set<string>> {
    const filas = await this.db.emision.findMany({ select: { archivoClave: true } });
    return new Set(filas.map((f) => f.archivoClave));
  }

  /** Todas las emisiones (recuperación: comprobar tamaño y hash de cada archivo). */
  async todasParaRevisar(): Promise<{ id: string; archivoClave: string; archivoBytes: number; archivoSha256: Uint8Array }[]> {
    return this.db.emision.findMany({ select: { id: true, archivoClave: true, archivoBytes: true, archivoSha256: true } });
  }
}
