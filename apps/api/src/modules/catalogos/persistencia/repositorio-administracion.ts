/**
 * Repositorio de la administración de catálogos (módulo 11, ADR-0015).
 *
 * - Toda consulta lleva la organización de la sesión DENTRO del `where`: un código de otra
 *   organización se comporta igual que uno inexistente.
 * - Lecturas con Prisma (parametrizadas). Escrituras con las funciones PL/pgSQL de la migración
 *   `20261017120000_administracion_catalogos`, con `$queryRaw` de plantilla (parámetros enlazados):
 *   cada alta o cambio es UNA sentencia con su revisión, su bitácora y su idempotencia.
 * - Listados por código con paginación keyset (`despuesDe`) y límite.
 * - Devuelve importes internos: solo lo usa el servicio de administración (`catalogos.administrar`).
 */
import type {
  ConceptoTarifaAdmin,
  EstadoPrecio,
  EventoCatalogo,
  FechaISO,
  ImpactoCatalogo,
  InsumoAdmin,
  ModalidadManoObra,
  PrecioAdmin,
  ProductoAdmin,
  ProveedorAdmin,
  TarifaAdmin,
} from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import { decimalOpcionalParaColumna, decimalParaColumna, textoDeDecimal, textoDeDecimalOpcional } from "../../../infraestructura/prisma/decimales.js";
import { fechaDeColumna, fechaParaColumna } from "../../../infraestructura/prisma/fechas.js";
import type { Idempotencia, RegistroIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import { estadoPrecio, tarifaVigente } from "../dominio/administracion.js";
import { impactoVersiones, SIN_IMPACTO_VERSIONES } from "./impacto-versiones.js";
import type { ContextoOrganizacion, Db } from "./repositorio-catalogos.js";

export interface AutorAdmin {
  readonly usuarioId: string;
}

export type EntidadBitacoraCatalogo =
  | "proveedor"
  | "producto"
  | "precio"
  | "tarifa"
  | "concepto"
  | "tipo_estructura"
  | "insumo"
  | "conversion"
  | "componente"
  | "parametros"
  | "persona";

interface Pagina {
  despuesDe?: string;
  limite: number;
}

const contiene = (texto: string) => ({ contains: texto, mode: "insensitive" as const });
const nombreDe = { select: { usuario: { select: { nombre: true } } } } as const;

/** Toma `limite + 1` filas y devuelve la página y el cursor de la siguiente (último código). */
function paginar<T extends { codigo: string }>(filas: T[], limite: number): { filas: T[]; siguiente: string | null } {
  if (filas.length <= limite) return { filas, siguiente: null };
  const pagina = filas.slice(0, limite);
  return { filas: pagina, siguiente: pagina[pagina.length - 1]!.codigo };
}

const seleccionProveedor = {
  id: true,
  codigo: true,
  nombre: true,
  contacto: true,
  telefono: true,
  correo: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDe,
} satisfies Prisma.ProveedorSelect;

const seleccionProducto = {
  id: true,
  codigo: true,
  descripcion: true,
  presentacion: true,
  unidadCompra: true,
  contenido: true,
  fraccionable: true,
  incrementoMinimo: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDe,
  insumo: { select: { codigo: true, descripcion: true, unidadBase: true, activo: true } },
  _count: { select: { precios: true } },
} satisfies Prisma.ProductoSelect;

const seleccionPrecio = {
  id: true,
  codigo: true,
  precioUnitario: true,
  vigenteDesde: true,
  vigenteHasta: true,
  anulado: true,
  fuente: true,
  motivoAnulacion: true,
  anuladoEn: true,
  revision: true,
  registradoEn: true,
  registrador: nombreDe,
  anulador: nombreDe,
  producto: { select: { codigo: true, descripcion: true, presentacion: true, unidadCompra: true, activo: true } },
  proveedor: { select: { codigo: true, nombre: true, activo: true } },
} satisfies Prisma.PrecioSelect;

const seleccionTarifa = {
  id: true,
  codigo: true,
  modalidad: true,
  descripcion: true,
  unidad: true,
  importe: true,
  rendimientoJornada: true,
  vigenteDesde: true,
  vigenteHasta: true,
  activa: true,
  fuente: true,
  revision: true,
  registradoEn: true,
  modificadoEn: true,
  registrador: nombreDe,
  proveedor: { select: { codigo: true, nombre: true, activo: true } },
} satisfies Prisma.TarifaManoObraSelect;

type FilaProveedor = Prisma.ProveedorGetPayload<{ select: typeof seleccionProveedor }>;
type FilaProducto = Prisma.ProductoGetPayload<{ select: typeof seleccionProducto }>;
type FilaPrecio = Prisma.PrecioGetPayload<{ select: typeof seleccionPrecio }>;
type FilaTarifa = Prisma.TarifaManoObraGetPayload<{ select: typeof seleccionTarifa }>;

function aProveedor(f: FilaProveedor): ProveedorAdmin {
  return {
    codigo: f.codigo,
    nombre: f.nombre,
    contacto: f.contacto,
    telefono: f.telefono,
    correo: f.correo,
    activo: f.activo,
    revision: f.revision,
    creadoEn: f.creadoEn.toISOString(),
    modificadoEn: f.modificadoEn.toISOString(),
    modificadoPor: f.modificador?.usuario.nombre ?? null,
  };
}

function aProducto(f: FilaProducto): ProductoAdmin {
  return {
    codigo: f.codigo,
    insumo: { ...f.insumo },
    descripcion: f.descripcion,
    presentacion: f.presentacion,
    unidadCompra: f.unidadCompra,
    contenido: textoDeDecimal(f.contenido),
    fraccionable: f.fraccionable,
    incrementoMinimo: textoDeDecimalOpcional(f.incrementoMinimo),
    activo: f.activo,
    revision: f.revision,
    tienePrecios: f._count.precios > 0,
    creadoEn: f.creadoEn.toISOString(),
    modificadoEn: f.modificadoEn.toISOString(),
    modificadoPor: f.modificador?.usuario.nombre ?? null,
  };
}

function aPrecio(f: FilaPrecio, hoy: FechaISO): PrecioAdmin {
  const vigenteDesde = fechaDeColumna(f.vigenteDesde);
  const vigenteHasta = fechaDeColumna(f.vigenteHasta);
  return {
    codigo: f.codigo,
    producto: { ...f.producto },
    proveedor: { ...f.proveedor },
    precioUnitario: textoDeDecimal(f.precioUnitario),
    vigenteDesde,
    vigenteHasta,
    estado: estadoPrecio({ anulado: f.anulado, vigenteDesde, vigenteHasta }, hoy),
    fuente: f.fuente,
    motivoAnulacion: f.motivoAnulacion,
    anuladoPor: f.anulado ? (f.anulador?.usuario.nombre ?? null) : null,
    anuladoEn: f.anuladoEn ? f.anuladoEn.toISOString() : null,
    revision: f.revision,
    registradoPor: f.registrador?.usuario.nombre ?? null,
    registradoEn: f.registradoEn.toISOString(),
  };
}

function aTarifa(f: FilaTarifa, hoy: FechaISO): TarifaAdmin {
  const vigenteDesde = fechaDeColumna(f.vigenteDesde);
  const vigenteHasta = fechaDeColumna(f.vigenteHasta);
  return {
    codigo: f.codigo,
    modalidad: f.modalidad as ModalidadManoObra,
    descripcion: f.descripcion,
    unidad: f.unidad,
    importe: textoDeDecimal(f.importe),
    rendimientoJornada: textoDeDecimalOpcional(f.rendimientoJornada),
    proveedor: f.proveedor ? { ...f.proveedor } : null,
    vigenteDesde,
    vigenteHasta,
    vigenteHoy: tarifaVigente({ vigenteDesde, vigenteHasta }, hoy),
    activa: f.activa,
    fuente: f.fuente,
    revision: f.revision,
    registradoPor: f.registrador?.usuario.nombre ?? null,
    registradoEn: f.registradoEn.toISOString(),
    modificadoEn: f.modificadoEn.toISOString(),
  };
}

function filtroEstadoPrecio(estado: EstadoPrecio | undefined, hoy: Date): Prisma.PrecioWhereInput {
  switch (estado) {
    case "ANULADO":
      return { anulado: true };
    case "VIGENTE":
      return { anulado: false, vigenteDesde: { lte: hoy }, vigenteHasta: { gte: hoy } };
    case "FUTURO":
      return { anulado: false, vigenteDesde: { gt: hoy } };
    case "VENCIDO":
      return { anulado: false, vigenteHasta: { lt: hoy } };
    default:
      return {};
  }
}

/** Concepto en la administración (módulos 11 y 12). */
export const seleccionConcepto = {
  id: true,
  codigo: true,
  descripcion: true,
  unidad: true,
  tipoFormula: true,
  clase: true,
  estado: true,
  activo: true,
  heredado: true,
  revision: true,
  revisionTecnica: true,
  aprobadoEn: true,
  aprobador: nombreDe,
  tipo: { select: { codigo: true, familia: true, nombre: true, activo: true } },
  tarifa: {
    select: { codigo: true, modalidad: true, descripcion: true, unidad: true, importe: true, activa: true, vigenteDesde: true, vigenteHasta: true },
  },
} satisfies Prisma.ConceptoSelect;

export type FilaConcepto = Prisma.ConceptoGetPayload<{ select: typeof seleccionConcepto }>;

export function aConcepto(c: FilaConcepto, borradoresAbiertos: number): ConceptoTarifaAdmin {
  return {
    codigo: c.codigo,
    descripcion: c.descripcion,
    unidad: c.unidad,
    tipoFormula: c.tipoFormula,
    clase: c.clase,
    estado: c.estado,
    activo: c.activo,
    tipo: c.tipo ? { ...c.tipo } : null,
    heredado: c.heredado,
    revision: c.revision,
    revisionTecnica: c.revisionTecnica,
    aprobadoPor: c.aprobador?.usuario.nombre ?? null,
    aprobadoEn: c.aprobadoEn ? c.aprobadoEn.toISOString() : null,
    tarifa: c.tarifa
      ? {
          codigo: c.tarifa.codigo,
          modalidad: c.tarifa.modalidad as ModalidadManoObra,
          descripcion: c.tarifa.descripcion,
          unidad: c.tarifa.unidad,
          importe: textoDeDecimal(c.tarifa.importe),
          activa: c.tarifa.activa,
          vigenteDesde: fechaDeColumna(c.tarifa.vigenteDesde),
          vigenteHasta: fechaDeColumna(c.tarifa.vigenteHasta),
        }
      : null,
    borradoresAbiertos,
  };
}

/** Insumo en la administración (módulos 11 y 12), con sus referencias. */
export const seleccionInsumo = {
  id: true,
  codigo: true,
  descripcion: true,
  especificacion: true,
  unidadBase: true,
  activo: true,
  revision: true,
  creadoEn: true,
  modificadoEn: true,
  modificador: nombreDe,
  _count: { select: { productos: true, conversiones: true, componentes: true } },
} satisfies Prisma.InsumoSelect;

export type FilaInsumo = Prisma.InsumoGetPayload<{ select: typeof seleccionInsumo }>;

export function aInsumo(f: FilaInsumo): InsumoAdmin {
  return {
    codigo: f.codigo,
    descripcion: f.descripcion,
    especificacion: f.especificacion,
    unidadBase: f.unidadBase,
    activo: f.activo,
    revision: f.revision,
    referencias: { ...f._count },
    creadoEn: f.creadoEn.toISOString(),
    modificadoEn: f.modificadoEn.toISOString(),
    modificadoPor: f.modificador?.usuario.nombre ?? null,
  };
}

const SIN_IMPACTO: ImpactoCatalogo = { preciosVigentes: 0, tarifas: 0, conceptos: 0, borradoresAbiertos: 0, versiones: SIN_IMPACTO_VERSIONES };

export class RepositorioAdministracion {
  constructor(private readonly db: Db) {}

  // ------------------------------- proveedores ------------------------------

  async listarProveedores(
    ctx: ContextoOrganizacion,
    f: Pagina & { buscar?: string; incluirInactivos: boolean },
  ): Promise<{ filas: ProveedorAdmin[]; siguiente: string | null }> {
    const filas = await this.db.proveedor.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(f.incluirInactivos ? {} : { activo: true }),
        ...(f.buscar ? { OR: [{ nombre: contiene(f.buscar) }, { codigo: contiene(f.buscar) }] } : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionProveedor,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    return { filas: p.filas.map(aProveedor), siguiente: p.siguiente };
  }

  async obtenerProveedor(ctx: ContextoOrganizacion, codigo: string): Promise<(ProveedorAdmin & { id: string }) | null> {
    const f = await this.db.proveedor.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: seleccionProveedor });
    return f ? { ...aProveedor(f), id: f.id } : null;
  }

  /** Proveedor con el mismo nombre normalizado (`Cat_Duplicado`), para informar el duplicado. */
  async proveedorPorNombre(ctx: ContextoOrganizacion, nombre: string): Promise<ProveedorAdmin | null> {
    const filas = await this.db.$queryRaw<{ codigo: string }[]>`
      SELECT codigo FROM proveedor
       WHERE organizacion_id = ${ctx.organizacionId}::uuid AND softarq_normalizar(nombre) = softarq_normalizar(${nombre})`;
    return filas[0] ? this.obtenerProveedor(ctx, filas[0].codigo) : null;
  }

  async impactoProveedor(ctx: ContextoOrganizacion, proveedorId: string, hoy: FechaISO): Promise<ImpactoCatalogo> {
    const dia = fechaParaColumna(hoy, "hoy");
    const [preciosVigentes, tarifas, codigos] = await Promise.all([
      this.db.precio.count({
        where: { organizacionId: ctx.organizacionId, proveedorId, anulado: false, vigenteDesde: { lte: dia }, vigenteHasta: { gte: dia } },
      }),
      this.db.tarifaManoObra.count({ where: { organizacionId: ctx.organizacionId, proveedorId, activa: true } }),
      this.db.precio.findMany({ where: { organizacionId: ctx.organizacionId, proveedorId }, select: { codigo: true } }),
    ]);
    const precios = codigos.map((c) => c.codigo);
    const [borradoresAbiertos, versiones] = await Promise.all([this.borradoresConPrecios(ctx, precios), impactoVersiones(this.db, ctx, { precios })]);
    return { ...SIN_IMPACTO, preciosVigentes, tarifas, borradoresAbiertos, versiones };
  }

  async crearProveedor(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: { nombre: string; contacto: string | null; telefono: string | null; correo: string | null },
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_proveedor(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarProveedor(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, cambios: Record<string, unknown>): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_proveedor(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  // -------------------------------- productos -------------------------------

  async listarProductos(
    ctx: ContextoOrganizacion,
    f: Pagina & { buscar?: string; insumoCodigo?: string; incluirInactivos: boolean },
  ): Promise<{ filas: ProductoAdmin[]; siguiente: string | null }> {
    const filas = await this.db.producto.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(f.incluirInactivos ? {} : { activo: true }),
        ...(f.insumoCodigo ? { insumo: { codigo: f.insumoCodigo } } : {}),
        ...(f.buscar
          ? { OR: [{ codigo: contiene(f.buscar) }, { descripcion: contiene(f.buscar) }, { presentacion: contiene(f.buscar) }] }
          : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionProducto,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    return { filas: p.filas.map(aProducto), siguiente: p.siguiente };
  }

  async obtenerProducto(ctx: ContextoOrganizacion, codigo: string): Promise<(ProductoAdmin & { id: string }) | null> {
    const f = await this.db.producto.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: seleccionProducto });
    return f ? { ...aProducto(f), id: f.id } : null;
  }

  async productoPorDescripcion(ctx: ContextoOrganizacion, descripcion: string, presentacion: string): Promise<ProductoAdmin | null> {
    const filas = await this.db.$queryRaw<{ codigo: string }[]>`
      SELECT codigo FROM producto
       WHERE organizacion_id = ${ctx.organizacionId}::uuid
         AND softarq_normalizar(descripcion) = softarq_normalizar(${descripcion})
         AND softarq_normalizar(presentacion) = softarq_normalizar(${presentacion})`;
    return filas[0] ? this.obtenerProducto(ctx, filas[0].codigo) : null;
  }

  async impactoProducto(ctx: ContextoOrganizacion, productoId: string, hoy: FechaISO): Promise<ImpactoCatalogo> {
    const dia = fechaParaColumna(hoy, "hoy");
    const [preciosVigentes, codigos] = await Promise.all([
      this.db.precio.count({
        where: { organizacionId: ctx.organizacionId, productoId, anulado: false, vigenteDesde: { lte: dia }, vigenteHasta: { gte: dia } },
      }),
      this.db.precio.findMany({ where: { organizacionId: ctx.organizacionId, productoId }, select: { codigo: true } }),
    ]);
    const precios = codigos.map((c) => c.codigo);
    const [borradoresAbiertos, versiones] = await Promise.all([this.borradoresConPrecios(ctx, precios), impactoVersiones(this.db, ctx, { precios })]);
    return { ...SIN_IMPACTO, preciosVigentes, borradoresAbiertos, versiones };
  }

  async crearProducto(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: {
      insumoCodigo: string;
      descripcion: string;
      presentacion: string;
      unidadCompra: string;
      contenido: string;
      fraccionable: boolean;
      incrementoMinimo: string | null;
    },
    idem: Idempotencia,
  ): Promise<string> {
    // Escala de la columna comprobada antes de llegar a ::NUMERIC (nunca un redondeo silencioso).
    decimalParaColumna(datos.contenido, "cantidad", "contenido");
    decimalOpcionalParaColumna(datos.incrementoMinimo, "cantidad", "incrementoMinimo");
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_producto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarProducto(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, cambios: Record<string, unknown>): Promise<number> {
    if (typeof cambios["contenido"] === "string") decimalParaColumna(cambios["contenido"], "cantidad", "contenido");
    if (typeof cambios["incrementoMinimo"] === "string") decimalParaColumna(cambios["incrementoMinimo"], "cantidad", "incrementoMinimo");
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_producto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb
      ) AS revision`;
    return filas[0]!.revision;
  }

  // --------------------------------- precios --------------------------------

  async listarPrecios(
    ctx: ContextoOrganizacion,
    hoy: FechaISO,
    f: Pagina & { buscar?: string; productoCodigo?: string; proveedorCodigo?: string; estado?: EstadoPrecio },
  ): Promise<{ filas: PrecioAdmin[]; siguiente: string | null }> {
    const filas = await this.db.precio.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...filtroEstadoPrecio(f.estado, fechaParaColumna(hoy, "hoy")),
        ...(f.productoCodigo ? { producto: { codigo: f.productoCodigo } } : {}),
        ...(f.proveedorCodigo ? { proveedor: { codigo: f.proveedorCodigo } } : {}),
        ...(f.buscar
          ? {
              OR: [
                { codigo: contiene(f.buscar) },
                { producto: { descripcion: contiene(f.buscar) } },
                { proveedor: { nombre: contiene(f.buscar) } },
              ],
            }
          : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionPrecio,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    return { filas: p.filas.map((x) => aPrecio(x, hoy)), siguiente: p.siguiente };
  }

  async obtenerPrecio(ctx: ContextoOrganizacion, codigo: string, hoy: FechaISO): Promise<(PrecioAdmin & { id: string }) | null> {
    const f = await this.db.precio.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: seleccionPrecio });
    return f ? { ...aPrecio(f, hoy), id: f.id } : null;
  }

  async obtenerPrecioPorId(ctx: ContextoOrganizacion, id: string, hoy: FechaISO): Promise<PrecioAdmin | null> {
    const f = await this.db.precio.findFirst({ where: { organizacionId: ctx.organizacionId, id }, select: seleccionPrecio });
    return f ? aPrecio(f, hoy) : null;
  }

  /** Precio no anulado del mismo producto y proveedor cuya vigencia se cruza (para el mensaje de TI-060). */
  async precioSolapado(
    ctx: ContextoOrganizacion,
    d: { productoCodigo: string; proveedorCodigo: string; vigenteDesde: FechaISO; vigenteHasta: FechaISO; excluir?: string },
    hoy: FechaISO,
  ): Promise<PrecioAdmin | null> {
    const f = await this.db.precio.findFirst({
      where: {
        organizacionId: ctx.organizacionId,
        anulado: false,
        producto: { codigo: d.productoCodigo },
        proveedor: { codigo: d.proveedorCodigo },
        vigenteDesde: { lte: fechaParaColumna(d.vigenteHasta, "vigenteHasta") },
        vigenteHasta: { gte: fechaParaColumna(d.vigenteDesde, "vigenteDesde") },
        ...(d.excluir ? { codigo: { not: d.excluir } } : {}),
      },
      select: seleccionPrecio,
      orderBy: { vigenteDesde: "asc" },
    });
    return f ? aPrecio(f, hoy) : null;
  }

  async impactoPrecio(ctx: ContextoOrganizacion, codigo: string): Promise<ImpactoCatalogo> {
    const [borradoresAbiertos, versiones] = await Promise.all([this.borradoresConPrecios(ctx, [codigo]), impactoVersiones(this.db, ctx, { precios: [codigo] })]);
    return { ...SIN_IMPACTO, borradoresAbiertos, versiones };
  }

  async registrarPrecio(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: { productoCodigo: string; proveedorCodigo: string; precioUnitario: string; vigenteDesde: FechaISO; vigenteHasta: FechaISO; fuente: string },
    idem: Idempotencia,
  ): Promise<string> {
    decimalParaColumna(datos.precioUnitario, "dinero", "precioUnitario");
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_registrar_precio(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async anularPrecio(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, motivo: string, idem: Idempotencia): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_anular_precio(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${motivo},
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async cerrarVigenciaPrecio(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    codigo: string,
    c: { revision: number; nuevaHasta: FechaISO; hoy: FechaISO; motivo: string; sucesor: { precioUnitario: string; vigenteDesde: FechaISO; vigenteHasta: FechaISO; fuente: string } },
    idem: Idempotencia,
  ): Promise<string> {
    decimalParaColumna(c.sucesor.precioUnitario, "dinero", "precioUnitario");
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_cerrar_vigencia_precio(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${c.revision}::integer,
        ${c.nuevaHasta}::date, ${c.hoy}::date, ${c.motivo}, ${JSON.stringify(c.sucesor)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  // --------------------------------- tarifas --------------------------------

  async listarTarifas(
    ctx: ContextoOrganizacion,
    hoy: FechaISO,
    f: Pagina & { buscar?: string; modalidad?: ModalidadManoObra; unidad?: string; incluirInactivas: boolean },
  ): Promise<{ filas: TarifaAdmin[]; siguiente: string | null }> {
    const filas = await this.db.tarifaManoObra.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(f.incluirInactivas ? {} : { activa: true }),
        ...(f.modalidad ? { modalidad: f.modalidad } : {}),
        ...(f.unidad ? { unidad: f.unidad } : {}),
        ...(f.buscar ? { OR: [{ codigo: contiene(f.buscar) }, { descripcion: contiene(f.buscar) }] } : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionTarifa,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    return { filas: p.filas.map((x) => aTarifa(x, hoy)), siguiente: p.siguiente };
  }

  async obtenerTarifa(ctx: ContextoOrganizacion, codigo: string, hoy: FechaISO): Promise<(TarifaAdmin & { id: string }) | null> {
    const f = await this.db.tarifaManoObra.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: seleccionTarifa });
    return f ? { ...aTarifa(f, hoy), id: f.id } : null;
  }

  async conceptosDeTarifa(ctx: ContextoOrganizacion, tarifaId: string): Promise<{ codigo: string; descripcion: string; activo: boolean }[]> {
    return this.db.concepto.findMany({
      where: { organizacionId: ctx.organizacionId, tarifaId },
      select: { codigo: true, descripcion: true, activo: true },
      orderBy: { codigo: "asc" },
    });
  }

  async impactoTarifa(ctx: ContextoOrganizacion, tarifa: string, conceptos: readonly string[]): Promise<ImpactoCatalogo> {
    // Borradores: por los conceptos que la usan (la tarifa sale del concepto al calcular); versiones: tarifa congelada.
    const [porConcepto, versiones] = await Promise.all([
      this.borradoresPorConcepto(ctx, conceptos),
      impactoVersiones(this.db, ctx, { conceptosBorrador: conceptos, tarifas: [tarifa] }),
    ]);
    return { ...SIN_IMPACTO, conceptos: conceptos.length, borradoresAbiertos: porConcepto.total, versiones };
  }

  async registrarTarifa(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: {
      modalidad: ModalidadManoObra;
      descripcion: string;
      unidad: string;
      importe: string;
      rendimientoJornada: string | null;
      proveedorCodigo: string | null;
      vigenteDesde: FechaISO;
      vigenteHasta: FechaISO;
      fuente: string;
    },
    idem: Idempotencia,
  ): Promise<string> {
    decimalParaColumna(datos.importe, "dinero", "importe");
    decimalOpcionalParaColumna(datos.rendimientoJornada, "cantidad", "rendimientoJornada");
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_registrar_tarifa(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async cambiarActivaTarifa(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, revision: number, activa: boolean): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_cambiar_activa_tarifa(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${codigo}, ${revision}::integer, ${activa}::boolean
      ) AS revision`;
    return filas[0]!.revision;
  }

  // ---------------------------- conceptos (tarifa) ---------------------------

  async listarConceptos(
    ctx: ContextoOrganizacion,
    f: Pagina & { buscar?: string; codigos?: readonly string[]; estado?: "Borrador" | "Aprobado"; tipoCodigo?: string; soloActivos?: boolean },
  ): Promise<{ filas: ConceptoTarifaAdmin[]; siguiente: string | null }> {
    const filas = await this.db.concepto.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(f.codigos ? { codigo: { in: [...f.codigos] } } : {}),
        ...(f.estado ? { estado: f.estado } : {}),
        ...(f.tipoCodigo ? { tipo: { codigo: f.tipoCodigo } } : {}),
        ...(f.soloActivos ? { activo: true } : {}),
        ...(f.buscar ? { OR: [{ codigo: contiene(f.buscar) }, { descripcion: contiene(f.buscar) }] } : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionConcepto,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    const borradores = await this.borradoresPorConcepto(ctx, p.filas.map((c) => c.codigo));
    return { filas: p.filas.map((c) => aConcepto(c, borradores.porCodigo.get(c.codigo) ?? 0)), siguiente: p.siguiente };
  }

  async conceptoId(ctx: ContextoOrganizacion, codigo: string): Promise<string | null> {
    const c = await this.db.concepto.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: { id: true } });
    return c?.id ?? null;
  }

  async asignarTarifa(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    concepto: string,
    a: { tarifaActual: string | null; tarifaNueva: string; motivo: string },
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_asignar_tarifa_concepto(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${concepto}, ${a.tarifaActual}, ${a.tarifaNueva}, ${a.motivo},
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async codigoConceptoPorId(ctx: ContextoOrganizacion, id: string): Promise<string | null> {
    const c = await this.db.concepto.findFirst({ where: { organizacionId: ctx.organizacionId, id }, select: { codigo: true } });
    return c?.codigo ?? null;
  }

  /** Código de un registro recién creado por su id (las funciones de alta devuelven el id). */
  async codigoPorId(ctx: ContextoOrganizacion, tipo: "proveedor" | "producto" | "tarifa", id: string): Promise<string | null> {
    const w = { where: { organizacionId: ctx.organizacionId, id }, select: { codigo: true } };
    const f =
      tipo === "proveedor"
        ? await this.db.proveedor.findFirst(w)
        : tipo === "producto"
          ? await this.db.producto.findFirst(w)
          : await this.db.tarifaManoObra.findFirst(w);
    return f?.codigo ?? null;
  }

  // ------------------------------- referencias ------------------------------

  async listarInsumos(ctx: ContextoOrganizacion, f: Pagina & { buscar?: string; incluirInactivos?: boolean }): Promise<{ filas: InsumoAdmin[]; siguiente: string | null }> {
    const filas = await this.db.insumo.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        ...(f.incluirInactivos ? {} : { activo: true }),
        ...(f.buscar ? { OR: [{ codigo: contiene(f.buscar) }, { descripcion: contiene(f.buscar) }] } : {}),
        ...(f.despuesDe ? { codigo: { gt: f.despuesDe } } : {}),
      },
      select: seleccionInsumo,
      orderBy: { codigo: "asc" },
      take: f.limite + 1,
    });
    const p = paginar(filas, f.limite);
    return { filas: p.filas.map(aInsumo), siguiente: p.siguiente };
  }

  async listarUnidades(): Promise<{ clave: string; nombre: string; magnitud: string }[]> {
    return this.db.unidad.findMany({ select: { clave: true, nombre: true, magnitud: true }, orderBy: [{ magnitud: "asc" }, { clave: "asc" }] });
  }

  // ------------------------------- bitácora ---------------------------------

  async historial(ctx: ContextoOrganizacion, entidad: EntidadBitacoraCatalogo, entidadId: string, limite: number): Promise<EventoCatalogo[]> {
    const filas = await this.db.bitacora.findMany({
      where: { organizacionId: ctx.organizacionId, entidad, entidadId },
      select: { tipo: true, ocurridoEn: true, detalle: true, usuario: nombreDe },
      orderBy: [{ ocurridoEn: "desc" }, { id: "desc" }],
      take: limite,
    });
    return filas.map((f) => ({
      tipo: f.tipo,
      ocurridoEn: f.ocurridoEn.toISOString(),
      usuario: f.usuario.usuario.nombre,
      detalle: (f.detalle && typeof f.detalle === "object" && !Array.isArray(f.detalle) ? f.detalle : {}) as Record<string, unknown>,
    }));
  }

  async buscarIdempotencia(ctx: ContextoOrganizacion, autor: AutorAdmin, clave: string): Promise<RegistroIdempotencia | null> {
    return this.db.idempotencia.findUnique({
      where: { organizacionId_usuarioId_clave: { organizacionId: ctx.organizacionId, usuarioId: autor.usuarioId, clave } },
      select: { operacion: true, huellaSolicitud: true, recursoId: true, expiraEn: true },
    });
  }

  // ------------------------- borradores afectados ---------------------------

  /** Cotizaciones activas cuyo borrador guardado elige alguno de esos precios. */
  async borradoresConPrecios(ctx: ContextoOrganizacion, precios: readonly string[]): Promise<number> {
    if (precios.length === 0) return 0;
    const filas = await this.db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM cotizacion_borrador b
        JOIN cotizacion c ON c.organizacion_id = b.organizacion_id AND c.id = b.cotizacion_id
       WHERE b.organizacion_id = ${ctx.organizacionId}::uuid AND c.estado_folio = 'ACTIVO'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.captura->'seleccion') e WHERE e->>'precioCodigo' = ANY(${[...precios]}::text[]))`;
    return filas[0]?.n ?? 0;
  }

  /** Cotizaciones activas cuyo borrador usa cada concepto (y el total sin repetir cotizaciones). */
  async borradoresPorConcepto(ctx: ContextoOrganizacion, conceptos: readonly string[]): Promise<{ porCodigo: Map<string, number>; total: number }> {
    if (conceptos.length === 0) return { porCodigo: new Map(), total: 0 };
    const filas = await this.db.$queryRaw<{ codigo: string; cotizacion: string }[]>`
      SELECT DISTINCT e->>'conceptoCodigo' AS codigo, b.cotizacion_id::text AS cotizacion
        FROM cotizacion_borrador b
        JOIN cotizacion c ON c.organizacion_id = b.organizacion_id AND c.id = b.cotizacion_id
        CROSS JOIN LATERAL jsonb_array_elements(b.captura->'partidas') e
       WHERE b.organizacion_id = ${ctx.organizacionId}::uuid AND c.estado_folio = 'ACTIVO'
         AND e->>'tipo' = 'CONCEPTO' AND e->>'conceptoCodigo' = ANY(${[...conceptos]}::text[])`;
    const porCodigo = new Map<string, number>();
    for (const f of filas) porCodigo.set(f.codigo, (porCodigo.get(f.codigo) ?? 0) + 1);
    return { porCodigo, total: new Set(filas.map((f) => f.cotizacion)).size };
  }
}
