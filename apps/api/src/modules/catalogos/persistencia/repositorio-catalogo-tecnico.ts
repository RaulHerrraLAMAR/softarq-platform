/**
 * Repositorio del catálogo técnico (módulo 12, ADR-0016): tipos de estructura, insumos,
 * conversiones, conceptos y componentes.
 *
 * - La organización de la sesión va DENTRO de cada `where`: un código de otra organización se
 *   comporta como uno inexistente.
 * - Lecturas con Prisma. Escrituras con las funciones PL/pgSQL de la migración
 *   `20261018120000_administracion_conceptos` (`$queryRaw` de plantilla, parámetros enlazados): cada
 *   alta o cambio es UNA sentencia con su revisión, su bitácora y su idempotencia; los disparadores
 *   devuelven a Borrador y retiran la aprobación.
 * - Los requisitos de aprobación salen de `softarq_problemas_concepto`, la misma función que usa
 *   «Aprobar»: la pantalla y el servidor no pueden discrepar.
 * - Devuelve datos técnicos internos: solo lo usa la administración (`catalogos.administrar`).
 */
import type {
  ComponenteAdmin,
  ConversionAdmin,
  FamiliaEstructura,
  RequisitoConcepto,
  TipoEstructuraAdmin,
} from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import { textoDeDecimal, textoDeDecimalOpcional } from "../../../infraestructura/prisma/decimales.js";
import { fechaDeColumna } from "../../../infraestructura/prisma/fechas.js";
import type { Idempotencia, RegistroIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import { aConcepto, aInsumo, seleccionConcepto, seleccionInsumo, type AutorAdmin } from "./repositorio-administracion.js";
import { impactoVersiones, type CriterioImpacto } from "./impacto-versiones.js";
import type { ContextoOrganizacion, Db } from "./repositorio-catalogos.js";

interface Pagina {
  despuesDe?: string;
  limite: number;
}

const contiene = (texto: string) => ({ contains: texto, mode: "insensitive" as const });
const nombreDe = { select: { usuario: { select: { nombre: true } } } } as const;

function paginar<T extends { codigo: string }>(filas: T[], limite: number): { filas: T[]; siguiente: string | null } {
  if (filas.length <= limite) return { filas, siguiente: null };
  const pagina = filas.slice(0, limite);
  return { filas: pagina, siguiente: pagina[pagina.length - 1]!.codigo };
}

const seleccionTipo = {
  id: true,
  codigo: true,
  familia: true,
  nombre: true,
  prioritario: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDe,
  _count: { select: { conceptos: true } },
} satisfies Prisma.TipoEstructuraSelect;

type FilaTipo = Prisma.TipoEstructuraGetPayload<{ select: typeof seleccionTipo }>;

function aTipo(f: FilaTipo): TipoEstructuraAdmin {
  return {
    codigo: f.codigo,
    familia: f.familia as FamiliaEstructura,
    nombre: f.nombre,
    prioritario: f.prioritario,
    activo: f.activo,
    revision: f.revision,
    conceptos: f._count.conceptos,
    creadoEn: f.creadoEn.toISOString(),
    modificadoEn: f.modificadoEn.toISOString(),
    modificadoPor: f.modificador?.usuario.nombre ?? null,
  };
}

export interface DetalleConceptoLeido {
  id: string;
  fila: Prisma.ConceptoGetPayload<{ select: typeof seleccionConcepto }>;
  permiteDescuento: boolean;
  reglaMedicion: string | null;
  criterios: string | null;
  creadoPor: string | null;
  creadoEn: string;
  cambioTecnicoPor: string | null;
  cambioTecnicoEn: string | null;
  componentes: ComponenteAdmin[];
}

export class RepositorioCatalogoTecnico {
  constructor(private readonly db: Db) {}

  // ---------------------------- tipos de estructura ---------------------------

  async listarTipos(
    ctx: ContextoOrganizacion,
    f: Pagina & { buscar?: string; familia?: string; incluirInactivos: boolean },
  ): Promise<{ filas: TipoEstructuraAdmin[]; siguiente: string | null }> {
    const filas = await this.db.tipoEstructura.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(f.incluirInactivos ? {} : { activo: true }),
        ...(f.familia ? { familia: f.familia } : {}),
        ...(f.buscar ? { OR: [{ codigo: contiene(f.buscar) }, { nombre: contiene(f.buscar) }, { familia: contiene(f.buscar) }] } : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionTipo,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    return { filas: p.filas.map(aTipo), siguiente: p.siguiente };
  }

  async obtenerTipo(ctx: ContextoOrganizacion, codigo: string): Promise<(TipoEstructuraAdmin & { id: string }) | null> {
    const f = await this.db.tipoEstructura.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: seleccionTipo });
    return f ? { ...aTipo(f), id: f.id } : null;
  }

  async obtenerTipoPorId(ctx: ContextoOrganizacion, id: string): Promise<TipoEstructuraAdmin | null> {
    const f = await this.db.tipoEstructura.findFirst({ where: { organizacionId: ctx.organizacionId, id }, select: seleccionTipo });
    return f ? aTipo(f) : null;
  }

  /** Tipo con la misma familia y nombre normalizado (`Cat_Duplicado`). */
  async tipoPorNombre(ctx: ContextoOrganizacion, familia: string, nombre: string): Promise<TipoEstructuraAdmin | null> {
    const filas = await this.db.$queryRaw<{ codigo: string }[]>`
      SELECT codigo FROM tipo_estructura
       WHERE organizacion_id = ${ctx.organizacionId}::uuid AND familia = ${familia}
         AND softarq_normalizar(nombre) = softarq_normalizar(${nombre})`;
    if (!filas[0]) return null;
    const t = await this.obtenerTipo(ctx, filas[0].codigo);
    if (!t) return null;
    const { id: _id, ...tipo } = t;
    return tipo;
  }

  async crearTipo(ctx: ContextoOrganizacion, autor: AutorAdmin, datos: { familia: string; nombre: string; prioritario: boolean }, idem: Idempotencia): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_tipo_estructura(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarTipo(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, cambios: Record<string, unknown>): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_tipo_estructura(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  // ---------------------------------- insumos ---------------------------------

  async obtenerInsumo(ctx: ContextoOrganizacion, codigo: string) {
    const f = await this.db.insumo.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: seleccionInsumo });
    return f ? { ...aInsumo(f), id: f.id } : null;
  }

  async obtenerInsumoPorId(ctx: ContextoOrganizacion, id: string) {
    const f = await this.db.insumo.findFirst({ where: { organizacionId: ctx.organizacionId, id }, select: seleccionInsumo });
    return f ? aInsumo(f) : null;
  }

  async insumoPorDescripcion(ctx: ContextoOrganizacion, descripcion: string) {
    const filas = await this.db.$queryRaw<{ codigo: string }[]>`
      SELECT codigo FROM insumo
       WHERE organizacion_id = ${ctx.organizacionId}::uuid AND softarq_normalizar(descripcion) = softarq_normalizar(${descripcion})`;
    if (!filas[0]) return null;
    const i = await this.obtenerInsumo(ctx, filas[0].codigo);
    if (!i) return null;
    const { id: _id, ...insumo } = i;
    return insumo;
  }

  async crearInsumo(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: { descripcion: string; especificacion: string | null; unidadBase: string },
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_insumo(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarInsumo(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, cambios: Record<string, unknown>): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_insumo(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  // -------------------------------- conversiones ------------------------------

  /** Conversiones del insumo con los conceptos que las usan (componente activo en esa unidad). */
  async conversionesDeInsumo(ctx: ContextoOrganizacion, insumoId: string, unidadOrigen?: string): Promise<ConversionAdmin[]> {
    const filas = await this.db.conversion.findMany({
      where: { organizacionId: ctx.organizacionId, insumoId, ...(unidadOrigen ? { unidadOrigen } : {}) },
      select: {
        unidadOrigen: true,
        unidadDestino: true,
        factor: true,
        fuente: true,
        revision: true,
        registradoEn: true,
        modificadoEn: true,
        modificador: nombreDe,
        insumo: { select: { codigo: true } },
      },
      orderBy: { unidadOrigen: "asc" },
    });
    const componentes = await this.db.componente.findMany({
      where: { organizacionId: ctx.organizacionId, insumoId, activo: true },
      select: { unidadRendimiento: true, concepto: { select: { codigo: true, descripcion: true, estado: true, activo: true } } },
      orderBy: { concepto: { codigo: "asc" } },
    });
    return filas.map((f) => ({
      insumoCodigo: f.insumo.codigo,
      unidadOrigen: f.unidadOrigen,
      unidadDestino: f.unidadDestino,
      factor: textoDeDecimal(f.factor),
      fuente: f.fuente,
      revision: f.revision,
      registradoEn: f.registradoEn.toISOString(),
      modificadoEn: f.modificadoEn.toISOString(),
      modificadoPor: f.modificador?.usuario.nombre ?? null,
      conceptos: componentes.filter((k) => k.unidadRendimiento === f.unidadOrigen).map((k) => ({ ...k.concepto })),
    }));
  }

  async conversionId(ctx: ContextoOrganizacion, insumoId: string, unidadOrigen: string): Promise<string | null> {
    const c = await this.db.conversion.findFirst({ where: { organizacionId: ctx.organizacionId, insumoId, unidadOrigen }, select: { id: true } });
    return c?.id ?? null;
  }

  async crearConversion(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: { insumoCodigo: string; unidadOrigen: string; factor: string; fuente: string },
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_conversion(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarConversion(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    insumo: string,
    origen: string,
    revision: number,
    cambios: Record<string, unknown>,
    motivo: string,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_conversion(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${insumo}, ${origen}, ${revision}::integer,
        ${JSON.stringify(cambios)}::jsonb, ${motivo}
      ) AS revision`;
    return filas[0]!.revision;
  }

  // --------------------------------- conceptos --------------------------------

  async obtenerConcepto(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleConceptoLeido | null> {
    const f = await this.db.concepto.findFirst({
      where: { organizacionId: ctx.organizacionId, codigo },
      select: {
        ...seleccionConcepto,
        permiteDescuento: true,
        reglaMedicion: true,
        criterios: true,
        creadoEn: true,
        cambioTecnicoEn: true,
        autor: nombreDe,
        editorTecnico: nombreDe,
      },
    });
    if (!f) return null;
    return {
      id: f.id,
      fila: f,
      permiteDescuento: f.permiteDescuento,
      reglaMedicion: f.reglaMedicion,
      criterios: f.criterios,
      creadoPor: f.autor?.usuario.nombre ?? null,
      creadoEn: f.creadoEn.toISOString(),
      cambioTecnicoPor: f.editorTecnico?.usuario.nombre ?? null,
      cambioTecnicoEn: f.cambioTecnicoEn ? f.cambioTecnicoEn.toISOString() : null,
      componentes: await this.componentesDe(ctx, f.id),
    };
  }

  /** Concepto en la forma del listado (módulos 11 y 12), con sus borradores abiertos. */
  aConceptoListado(f: DetalleConceptoLeido["fila"], borradoresAbiertos: number) {
    return aConcepto(f, borradoresAbiertos);
  }

  async componentesDe(ctx: ContextoOrganizacion, conceptoId: string): Promise<ComponenteAdmin[]> {
    const filas = await this.db.componente.findMany({
      where: { organizacionId: ctx.organizacionId, conceptoId },
      select: {
        codigo: true,
        orden: true,
        rendimiento: true,
        unidadRendimiento: true,
        desperdicio: true,
        factorTraslape: true,
        fuente: true,
        fecha: true,
        responsable: true,
        activo: true,
        revision: true,
        modificadoEn: true,
        modificador: nombreDe,
        insumo: {
          select: { codigo: true, descripcion: true, unidadBase: true, activo: true, conversiones: { select: { unidadOrigen: true, unidadDestino: true, factor: true } } },
        },
      },
      orderBy: { orden: "asc" },
    });
    return filas.map((k) => {
      const conversion = k.insumo.conversiones.find((c) => c.unidadOrigen === k.unidadRendimiento && c.unidadDestino === k.insumo.unidadBase);
      return {
        codigo: k.codigo,
        orden: k.orden,
        insumo: { codigo: k.insumo.codigo, descripcion: k.insumo.descripcion, unidadBase: k.insumo.unidadBase, activo: k.insumo.activo },
        rendimiento: textoDeDecimal(k.rendimiento),
        unidadRendimiento: k.unidadRendimiento,
        desperdicio: textoDeDecimal(k.desperdicio),
        factorTraslape: textoDeDecimalOpcional(k.factorTraslape),
        fuente: k.fuente,
        fecha: k.fecha ? fechaDeColumna(k.fecha) : null,
        responsable: k.responsable,
        activo: k.activo,
        revision: k.revision,
        convertibilidad:
          k.unidadRendimiento === k.insumo.unidadBase
            ? { estado: "BASE" as const, factor: null }
            : conversion
              ? { estado: "CONVERSION" as const, factor: textoDeDecimal(conversion.factor) }
              : { estado: "FALTA" as const, factor: null },
        trazable: k.fuente !== null && k.fecha !== null && k.responsable !== null,
        modificadoEn: k.modificadoEn.toISOString(),
        modificadoPor: k.modificador?.usuario.nombre ?? null,
      };
    });
  }

  async requisitos(ctx: ContextoOrganizacion, conceptoId: string): Promise<RequisitoConcepto[]> {
    return this.db.$queryRaw<RequisitoConcepto[]>`
      SELECT codigo, referencia, mensaje FROM softarq_problemas_concepto(${ctx.organizacionId}::uuid, ${conceptoId}::uuid)`;
  }

  /** Concepto con el mismo tipo y descripción normalizada (`Cat_Duplicado`). */
  async conceptoPorDescripcion(ctx: ContextoOrganizacion, tipoCodigo: string, descripcion: string): Promise<string | null> {
    const filas = await this.db.$queryRaw<{ codigo: string }[]>`
      SELECT c.codigo FROM concepto c JOIN tipo_estructura t ON t.organizacion_id = c.organizacion_id AND t.id = c.tipo_id
       WHERE c.organizacion_id = ${ctx.organizacionId}::uuid AND t.codigo = ${tipoCodigo}
         AND softarq_normalizar(c.descripcion) = softarq_normalizar(${descripcion})`;
    return filas[0]?.codigo ?? null;
  }

  async crearConcepto(ctx: ContextoOrganizacion, autor: AutorAdmin, datos: Record<string, unknown>, idem: Idempotencia): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_concepto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarConcepto(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, cambios: Record<string, unknown>): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_concepto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  async aprobarConcepto(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revisionTecnica: number, idem: Idempotencia): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_aprobar_concepto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revisionTecnica}::integer,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  // -------------------------------- componentes -------------------------------

  async crearComponente(ctx: ContextoOrganizacion, autor: AutorAdmin, concepto: string, datos: Record<string, unknown>, idem: Idempotencia): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_componente(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${concepto}, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarComponente(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    concepto: string,
    codigo: string,
    revision: number,
    cambios: Record<string, unknown>,
  ): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_componente(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${concepto}, ${codigo}, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  async componentePorCodigo(ctx: ContextoOrganizacion, concepto: string, codigo: string): Promise<ComponenteAdmin | null> {
    const c = await this.db.concepto.findFirst({ where: { organizacionId: ctx.organizacionId, codigo: concepto }, select: { id: true } });
    if (!c) return null;
    return (await this.componentesDe(ctx, c.id)).find((k) => k.codigo === codigo) ?? null;
  }

  async componentePorId(ctx: ContextoOrganizacion, id: string): Promise<{ concepto: string; codigo: string } | null> {
    const k = await this.db.componente.findFirst({
      where: { organizacionId: ctx.organizacionId, id },
      select: { codigo: true, concepto: { select: { codigo: true } } },
    });
    return k ? { concepto: k.concepto.codigo, codigo: k.codigo } : null;
  }

  /** Componente del concepto con ese insumo (`Cat_Duplicado` por concepto e insumo). */
  async componentePorInsumo(ctx: ContextoOrganizacion, concepto: string, insumo: string): Promise<string | null> {
    const k = await this.db.componente.findFirst({
      where: { organizacionId: ctx.organizacionId, concepto: { codigo: concepto }, insumo: { codigo: insumo } },
      select: { codigo: true },
    });
    return k?.codigo ?? null;
  }

  // -------------------------------- utilidades --------------------------------

  /** Impacto en cotizaciones abiertas (ADR-0017 §1.3). Solo lee. */
  impacto(ctx: ContextoOrganizacion, c: CriterioImpacto) {
    return impactoVersiones(this.db, ctx, c);
  }

  /** Conceptos con un componente activo del insumo (sus borradores se recalcularían con el cambio). */
  async conceptosConInsumo(ctx: ContextoOrganizacion, insumoId: string): Promise<string[]> {
    const filas = await this.db.componente.findMany({
      where: { organizacionId: ctx.organizacionId, insumoId, activo: true },
      select: { concepto: { select: { codigo: true } } },
      distinct: ["conceptoId"],
    });
    return filas.map((f) => f.concepto.codigo);
  }

  async codigoPorId(ctx: ContextoOrganizacion, tipo: "tipo" | "insumo" | "concepto", id: string): Promise<string | null> {
    const w = { where: { organizacionId: ctx.organizacionId, id }, select: { codigo: true } };
    const f =
      tipo === "tipo" ? await this.db.tipoEstructura.findFirst(w) : tipo === "insumo" ? await this.db.insumo.findFirst(w) : await this.db.concepto.findFirst(w);
    return f?.codigo ?? null;
  }

  async buscarIdempotencia(ctx: ContextoOrganizacion, autor: AutorAdmin, clave: string): Promise<RegistroIdempotencia | null> {
    return this.db.idempotencia.findUnique({
      where: { organizacionId_usuarioId_clave: { organizacionId: ctx.organizacionId, usuarioId: autor.usuarioId, clave } },
      select: { operacion: true, huellaSolicitud: true, recursoId: true, expiraEn: true },
    });
  }
}
