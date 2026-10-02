/**
 * Repositorio de catálogos (ADR-0004).
 *
 * Reglas:
 * - Todo método sobre datos propios exige `ContextoOrganizacion` y lo aplica DENTRO del `where`
 *   de la consulta (nunca se filtra después de leer).
 * - Solo consultas de Prisma (parametrizadas); no hay SQL construido con entradas.
 * - Los decimales viajan como texto: se validan contra la precisión de su columna al escribir
 *   (sin redondeos silenciosos) y se leen con `toFixed()`.
 * - Las altas son idempotentes por (organización, código) y nunca sobrescriben ni borran:
 *   si el código ya existe, se devuelve el registro existente sin modificarlo.
 * - El repositorio no elige precios: devuelve exactamente los solicitados.
 */
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import {
  decimalOpcionalParaColumna,
  decimalParaColumna,
  textoDeDecimal,
  textoDeDecimalOpcional,
} from "../../../infraestructura/prisma/decimales.js";
import { fechaDeColumna, fechaParaColumna } from "../../../infraestructura/prisma/fechas.js";

export interface ContextoOrganizacion {
  readonly organizacionId: string;
}

export type Db = PrismaClient | Prisma.TransactionClient;

export class ErrorReferenciaCatalogo extends Error {
  constructor(
    readonly tipo: string,
    readonly codigo: string,
  ) {
    super(`No existe ${tipo} ${codigo} en la organización.`);
    this.name = "ErrorReferenciaCatalogo";
  }
}

export interface Alta {
  id: string;
  creado: boolean;
}

// ---------------------------------------------------------------------------
// Tipos de lectura (texto decimal y fechas ISO; sin tipos de Prisma)
// ---------------------------------------------------------------------------

export interface ParametrosLeidos {
  ambiente: "DEMO" | "PRODUCCION";
  moneda: "MXN";
  recargoSobreCosto: string | null;
  impuesto: { tasa: string; base: string; tratamiento: string; nombre: string } | null;
  vigenciaDias: number | null;
}

export interface TarifaLeida {
  codigo: string;
  modalidad: "UNIDAD" | "JORNADA" | "SUBCONTRATO";
  unidad: string;
  importe: string;
  rendimientoJornada: string | null;
  vigenteDesde: string;
  vigenteHasta: string;
  activa: boolean;
}

export interface ComponenteLeido {
  codigo: string;
  orden: number;
  insumoCodigo: string;
  rendimiento: string;
  unidadRendimiento: string;
  desperdicio: string;
  factorTraslape: string | null;
  activo: boolean;
}

export interface ConceptoLeido {
  codigo: string;
  descripcion: string;
  unidad: string;
  tipoFormula: "CONTEO" | "LONGITUD" | "AREA" | "VOLUMEN";
  permiteDescuento: boolean;
  clase: string;
  estado: string;
  activo: boolean;
  tarifa: TarifaLeida | null;
  componentes: ComponenteLeido[];
}

export interface InsumoLeido {
  codigo: string;
  unidadBase: string;
  activo: boolean;
}

export interface ConversionLeida {
  insumoCodigo: string;
  unidadOrigen: string;
  unidadDestino: string;
  factor: string;
}

export interface PrecioLeido {
  codigo: string;
  precioUnitario: string;
  vigenteDesde: string;
  vigenteHasta: string;
  anulado: boolean;
  producto: {
    codigo: string;
    insumoCodigo: string;
    contenido: string;
    fraccionable: boolean;
    incrementoMinimo: string | null;
    activo: boolean;
  };
  proveedor: { codigo: string; activo: boolean };
}

export interface TipoAdicionalLeido {
  codigo: string;
  categoria: string;
  descripcion: string;
  unidad: string;
  activo: boolean;
}

// ---------------------------------------------------------------------------
// Datos de alta (por código; las referencias se resuelven dentro de la organización)
// ---------------------------------------------------------------------------

export interface DatosParametros {
  ambiente: "DEMO" | "PRODUCCION";
  moneda: "MXN";
  recargoSobreCosto: string | null;
  impuestoTasa: string | null;
  impuestoBase: string | null;
  impuestoTratamiento: string | null;
  impuestoNombre: string | null;
  vigenciaDias: number | null;
}

export class RepositorioCatalogos {
  constructor(private readonly db: Db) {}

  // ----------------------------- organización -----------------------------

  async organizacionPorCodigo(codigo: string): Promise<{ id: string; codigo: string; esDemo: boolean } | null> {
    return this.db.organizacion.findUnique({ where: { codigo }, select: { id: true, codigo: true, esDemo: true } });
  }

  async asegurarOrganizacion(codigo: string, nombre: string, esDemo: boolean): Promise<Alta> {
    const existente = await this.db.organizacion.findUnique({ where: { codigo }, select: { id: true } });
    if (existente) return { id: existente.id, creado: false };
    const nueva = await this.db.organizacion.create({ data: { codigo, nombre, esDemo }, select: { id: true } });
    return { id: nueva.id, creado: true };
  }

  // ------------------------------ parámetros ------------------------------

  async obtenerParametros(ctx: ContextoOrganizacion): Promise<ParametrosLeidos | null> {
    const p = await this.db.parametrosCalculo.findUnique({ where: { organizacionId: ctx.organizacionId } });
    if (!p) return null;
    const impuesto =
      p.impuestoTasa === null ||
      p.impuestoBase === null ||
      p.impuestoTratamiento === null ||
      p.impuestoNombre === null
        ? null
        : {
            tasa: textoDeDecimal(p.impuestoTasa),
            base: p.impuestoBase,
            tratamiento: p.impuestoTratamiento,
            nombre: p.impuestoNombre,
          };
    return {
      ambiente: p.ambiente as ParametrosLeidos["ambiente"],
      moneda: p.moneda as "MXN",
      recargoSobreCosto: textoDeDecimalOpcional(p.recargoSobreCosto),
      impuesto,
      vigenciaDias: p.vigenciaDias,
    };
  }

  async asegurarParametros(ctx: ContextoOrganizacion, d: DatosParametros): Promise<Alta> {
    const existente = await this.db.parametrosCalculo.findUnique({
      where: { organizacionId: ctx.organizacionId },
      select: { organizacionId: true },
    });
    if (existente) return { id: existente.organizacionId, creado: false };
    await this.db.parametrosCalculo.create({ data: { organizacionId: ctx.organizacionId, ...datosParametros(d) } });
    return { id: ctx.organizacionId, creado: true };
  }

  /** Reemplaza los parámetros de venta (uso administrativo; queda para el módulo de configuración). */
  async actualizarParametros(ctx: ContextoOrganizacion, d: DatosParametros): Promise<void> {
    await this.db.parametrosCalculo.update({
      where: { organizacionId: ctx.organizacionId },
      data: datosParametros(d),
    });
  }

  // --------------------------------- altas --------------------------------

  async asegurarInsumo(
    ctx: ContextoOrganizacion,
    d: { codigo: string; descripcion: string; unidadBase: string },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.insumo.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.insumo.create({
      data: { organizacionId: org, codigo: d.codigo, descripcion: d.descripcion, unidadBase: d.unidadBase },
    });
    return { id: n.id, creado: true };
  }

  async asegurarConversion(
    ctx: ContextoOrganizacion,
    d: { insumo: string; unidadOrigen: string; unidadDestino: string; factor: string; fuente: string },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const insumoId = await this.idInsumo(ctx, d.insumo);
    const e = await this.db.conversion.findFirst({
      where: { organizacionId: org, insumoId, unidadOrigen: d.unidadOrigen, unidadDestino: d.unidadDestino },
    });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.conversion.create({
      data: {
        organizacionId: org,
        insumoId,
        unidadOrigen: d.unidadOrigen,
        unidadDestino: d.unidadDestino,
        factor: decimalParaColumna(d.factor, "factor", "factor"),
        fuente: d.fuente,
      },
    });
    return { id: n.id, creado: true };
  }

  async asegurarProveedor(ctx: ContextoOrganizacion, d: { codigo: string; nombre: string }): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.proveedor.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.proveedor.create({ data: { organizacionId: org, codigo: d.codigo, nombre: d.nombre } });
    return { id: n.id, creado: true };
  }

  async asegurarProducto(
    ctx: ContextoOrganizacion,
    d: {
      codigo: string;
      insumo: string;
      descripcion: string;
      presentacion: string;
      unidadCompra: string;
      contenido: string;
      fraccionable: boolean;
      incrementoMinimo: string | null;
    },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.producto.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.producto.create({
      data: {
        organizacionId: org,
        codigo: d.codigo,
        insumoId: await this.idInsumo(ctx, d.insumo),
        descripcion: d.descripcion,
        presentacion: d.presentacion,
        unidadCompra: d.unidadCompra,
        contenido: decimalParaColumna(d.contenido, "cantidad", "contenido"),
        fraccionable: d.fraccionable,
        incrementoMinimo: decimalOpcionalParaColumna(d.incrementoMinimo, "cantidad", "incrementoMinimo"),
      },
    });
    return { id: n.id, creado: true };
  }

  /** Registra un precio. Los precios no se editan: uno existente con el mismo código se conserva. */
  async asegurarPrecio(
    ctx: ContextoOrganizacion,
    d: {
      codigo: string;
      producto: string;
      proveedor: string;
      precioUnitario: string;
      vigenteDesde: string;
      vigenteHasta: string;
      fuente: string;
    },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.precio.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.precio.create({
      data: {
        organizacionId: org,
        codigo: d.codigo,
        productoId: await this.idProducto(ctx, d.producto),
        proveedorId: await this.idProveedor(ctx, d.proveedor),
        precioUnitario: decimalParaColumna(d.precioUnitario, "dinero", "precioUnitario"),
        vigenteDesde: fechaParaColumna(d.vigenteDesde, "vigenteDesde"),
        vigenteHasta: fechaParaColumna(d.vigenteHasta, "vigenteHasta"),
        fuente: d.fuente,
      },
    });
    return { id: n.id, creado: true };
  }

  /** Anula un precio (nunca se borra). */
  async anularPrecio(ctx: ContextoOrganizacion, codigo: string): Promise<void> {
    const r = await this.db.precio.updateMany({
      where: { organizacionId: ctx.organizacionId, codigo },
      data: { anulado: true },
    });
    if (r.count !== 1) throw new ErrorReferenciaCatalogo("el precio", codigo);
  }

  async cambiarActivoProveedor(ctx: ContextoOrganizacion, codigo: string, activo: boolean): Promise<void> {
    const r = await this.db.proveedor.updateMany({ where: { organizacionId: ctx.organizacionId, codigo }, data: { activo } });
    if (r.count !== 1) throw new ErrorReferenciaCatalogo("el proveedor", codigo);
  }

  async cambiarActivoProducto(ctx: ContextoOrganizacion, codigo: string, activo: boolean): Promise<void> {
    const r = await this.db.producto.updateMany({ where: { organizacionId: ctx.organizacionId, codigo }, data: { activo } });
    if (r.count !== 1) throw new ErrorReferenciaCatalogo("el producto", codigo);
  }

  async cambiarEstadoConcepto(ctx: ContextoOrganizacion, codigo: string, estado: "Borrador" | "Aprobado"): Promise<void> {
    const r = await this.db.concepto.updateMany({ where: { organizacionId: ctx.organizacionId, codigo }, data: { estado } });
    if (r.count !== 1) throw new ErrorReferenciaCatalogo("el concepto", codigo);
  }

  async asegurarTarifa(
    ctx: ContextoOrganizacion,
    d: {
      codigo: string;
      modalidad: "UNIDAD" | "JORNADA" | "SUBCONTRATO";
      descripcion: string;
      unidad: string;
      importe: string;
      rendimientoJornada: string | null;
      vigenteDesde: string;
      vigenteHasta: string;
      fuente: string;
    },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.tarifaManoObra.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.tarifaManoObra.create({
      data: {
        organizacionId: org,
        codigo: d.codigo,
        modalidad: d.modalidad,
        descripcion: d.descripcion,
        unidad: d.unidad,
        importe: decimalParaColumna(d.importe, "dinero", "importe"),
        rendimientoJornada: decimalOpcionalParaColumna(d.rendimientoJornada, "cantidad", "rendimientoJornada"),
        vigenteDesde: fechaParaColumna(d.vigenteDesde, "vigenteDesde"),
        vigenteHasta: fechaParaColumna(d.vigenteHasta, "vigenteHasta"),
        fuente: d.fuente,
      },
    });
    return { id: n.id, creado: true };
  }

  async asegurarConcepto(
    ctx: ContextoOrganizacion,
    d: {
      codigo: string;
      descripcion: string;
      unidad: string;
      tipoFormula: "CONTEO" | "LONGITUD" | "AREA" | "VOLUMEN";
      permiteDescuento: boolean;
      clase: string;
      estado: string;
      tarifa: string | null;
    },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.concepto.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.concepto.create({
      data: {
        organizacionId: org,
        codigo: d.codigo,
        descripcion: d.descripcion,
        unidad: d.unidad,
        tipoFormula: d.tipoFormula,
        permiteDescuento: d.permiteDescuento,
        clase: d.clase,
        estado: d.estado,
        tarifaId: d.tarifa === null ? null : await this.idTarifa(ctx, d.tarifa),
      },
    });
    return { id: n.id, creado: true };
  }

  async asegurarComponente(
    ctx: ContextoOrganizacion,
    d: {
      codigo: string;
      concepto: string;
      orden: number;
      insumo: string;
      rendimiento: string;
      unidadRendimiento: string;
      desperdicio: string;
      factorTraslape: string | null;
      fuente: string;
      fecha: string;
      responsable: string;
    },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.componente.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.componente.create({
      data: {
        organizacionId: org,
        codigo: d.codigo,
        conceptoId: await this.idConcepto(ctx, d.concepto),
        insumoId: await this.idInsumo(ctx, d.insumo),
        orden: d.orden,
        rendimiento: decimalParaColumna(d.rendimiento, "cantidad", "rendimiento"),
        unidadRendimiento: d.unidadRendimiento,
        desperdicio: decimalParaColumna(d.desperdicio, "fraccion", "desperdicio"),
        factorTraslape: decimalOpcionalParaColumna(d.factorTraslape, "traslape", "factorTraslape"),
        fuente: d.fuente,
        fecha: fechaParaColumna(d.fecha, "fecha"),
        responsable: d.responsable,
      },
    });
    return { id: n.id, creado: true };
  }

  async asegurarTipoAdicional(
    ctx: ContextoOrganizacion,
    d: { codigo: string; categoria: string; descripcion: string; unidad: string },
  ): Promise<Alta> {
    const org = ctx.organizacionId;
    const e = await this.db.tipoAdicional.findUnique({ where: { organizacionId_codigo: { organizacionId: org, codigo: d.codigo } } });
    if (e) return { id: e.id, creado: false };
    const n = await this.db.tipoAdicional.create({
      data: {
        organizacionId: org,
        codigo: d.codigo,
        categoria: d.categoria,
        descripcion: d.descripcion,
        unidad: d.unidad,
        regla: "MONTO_CAPTURADO",
      },
    });
    return { id: n.id, creado: true };
  }

  // -------------------------------- lecturas -------------------------------

  async obtenerConceptos(ctx: ContextoOrganizacion, codigos: readonly string[]): Promise<ConceptoLeido[]> {
    const filas = await this.db.concepto.findMany({
      where: { organizacionId: ctx.organizacionId, codigo: { in: [...codigos] } },
      include: {
        tarifa: true,
        componentes: {
          where: { organizacionId: ctx.organizacionId },
          orderBy: { orden: "asc" },
          include: { insumo: { select: { codigo: true } } },
        },
      },
    });
    return filas.map((f) => ({
      codigo: f.codigo,
      descripcion: f.descripcion,
      unidad: f.unidad,
      tipoFormula: f.tipoFormula as ConceptoLeido["tipoFormula"],
      permiteDescuento: f.permiteDescuento,
      clase: f.clase,
      estado: f.estado,
      activo: f.activo,
      tarifa: f.tarifa
        ? {
            codigo: f.tarifa.codigo,
            modalidad: f.tarifa.modalidad as TarifaLeida["modalidad"],
            unidad: f.tarifa.unidad,
            importe: textoDeDecimal(f.tarifa.importe),
            rendimientoJornada: textoDeDecimalOpcional(f.tarifa.rendimientoJornada),
            vigenteDesde: fechaDeColumna(f.tarifa.vigenteDesde),
            vigenteHasta: fechaDeColumna(f.tarifa.vigenteHasta),
            activa: f.tarifa.activa,
          }
        : null,
      componentes: f.componentes.map((c) => ({
        codigo: c.codigo,
        orden: c.orden,
        insumoCodigo: c.insumo.codigo,
        rendimiento: textoDeDecimal(c.rendimiento),
        unidadRendimiento: c.unidadRendimiento,
        desperdicio: textoDeDecimal(c.desperdicio),
        factorTraslape: textoDeDecimalOpcional(c.factorTraslape),
        activo: c.activo,
      })),
    }));
  }

  async obtenerInsumos(ctx: ContextoOrganizacion, codigos: readonly string[]): Promise<InsumoLeido[]> {
    const filas = await this.db.insumo.findMany({
      where: { organizacionId: ctx.organizacionId, codigo: { in: [...codigos] } },
      orderBy: { codigo: "asc" },
    });
    return filas.map((f) => ({ codigo: f.codigo, unidadBase: f.unidadBase, activo: f.activo }));
  }

  async obtenerConversiones(ctx: ContextoOrganizacion, insumoCodigos: readonly string[]): Promise<ConversionLeida[]> {
    const filas = await this.db.conversion.findMany({
      where: { organizacionId: ctx.organizacionId, insumo: { codigo: { in: [...insumoCodigos] } } },
      include: { insumo: { select: { codigo: true } } },
      orderBy: [{ insumo: { codigo: "asc" } }, { unidadOrigen: "asc" }],
    });
    return filas.map((f) => ({
      insumoCodigo: f.insumo.codigo,
      unidadOrigen: f.unidadOrigen,
      unidadDestino: f.unidadDestino,
      factor: textoDeDecimal(f.factor),
    }));
  }

  /** Devuelve exactamente los precios pedidos por código (no elige ni sustituye). */
  async obtenerPrecios(ctx: ContextoOrganizacion, codigos: readonly string[]): Promise<PrecioLeido[]> {
    const filas = await this.db.precio.findMany({
      where: { organizacionId: ctx.organizacionId, codigo: { in: [...codigos] } },
      include: {
        producto: { include: { insumo: { select: { codigo: true } } } },
        proveedor: { select: { codigo: true, activo: true } },
      },
    });
    return filas.map(precioLeido);
  }

  /**
   * Precios de los productos indicados que están vigentes a `fecha` y no anulados, con proveedor
   * activo (Compras_MenorPrecio del libro). Solo sirve para informar el menor precio (AV-01).
   */
  async obtenerPreciosVigentesDeProductos(
    ctx: ContextoOrganizacion,
    productoCodigos: readonly string[],
    fecha: string,
  ): Promise<PrecioLeido[]> {
    const dia = fechaParaColumna(fecha, "fecha");
    const filas = await this.db.precio.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        anulado: false,
        vigenteDesde: { lte: dia },
        vigenteHasta: { gte: dia },
        producto: { codigo: { in: [...productoCodigos] } },
        proveedor: { activo: true },
      },
      include: {
        producto: { include: { insumo: { select: { codigo: true } } } },
        proveedor: { select: { codigo: true, activo: true } },
      },
      orderBy: { codigo: "asc" },
    });
    return filas.map(precioLeido);
  }

  async obtenerTiposAdicional(ctx: ContextoOrganizacion, codigos: readonly string[]): Promise<TipoAdicionalLeido[]> {
    const filas = await this.db.tipoAdicional.findMany({
      where: { organizacionId: ctx.organizacionId, codigo: { in: [...codigos] } },
    });
    return filas.map((f) => ({
      codigo: f.codigo,
      categoria: f.categoria,
      descripcion: f.descripcion,
      unidad: f.unidad,
      activo: f.activo,
    }));
  }

  /** Conteo de registros propios de la organización por tabla (verificación de cargas). */
  async contar(ctx: ContextoOrganizacion): Promise<Record<string, number>> {
    const w = { where: { organizacionId: ctx.organizacionId } };
    const [insumos, conversiones, proveedores, productos, precios, tarifas, conceptos, componentes, tiposAdicional, parametros] =
      await Promise.all([
        this.db.insumo.count(w),
        this.db.conversion.count(w),
        this.db.proveedor.count(w),
        this.db.producto.count(w),
        this.db.precio.count(w),
        this.db.tarifaManoObra.count(w),
        this.db.concepto.count(w),
        this.db.componente.count(w),
        this.db.tipoAdicional.count(w),
        this.db.parametrosCalculo.count(w),
      ]);
    return { insumos, conversiones, proveedores, productos, precios, tarifas, conceptos, componentes, tiposAdicional, parametros };
  }

  // ------------------------- resolución de códigos -------------------------

  private async idInsumo(ctx: ContextoOrganizacion, codigo: string): Promise<string> {
    const r = await this.db.insumo.findUnique({
      where: { organizacionId_codigo: { organizacionId: ctx.organizacionId, codigo } },
      select: { id: true },
    });
    if (!r) throw new ErrorReferenciaCatalogo("el insumo", codigo);
    return r.id;
  }

  private async idProducto(ctx: ContextoOrganizacion, codigo: string): Promise<string> {
    const r = await this.db.producto.findUnique({
      where: { organizacionId_codigo: { organizacionId: ctx.organizacionId, codigo } },
      select: { id: true },
    });
    if (!r) throw new ErrorReferenciaCatalogo("el producto", codigo);
    return r.id;
  }

  private async idProveedor(ctx: ContextoOrganizacion, codigo: string): Promise<string> {
    const r = await this.db.proveedor.findUnique({
      where: { organizacionId_codigo: { organizacionId: ctx.organizacionId, codigo } },
      select: { id: true },
    });
    if (!r) throw new ErrorReferenciaCatalogo("el proveedor", codigo);
    return r.id;
  }

  private async idTarifa(ctx: ContextoOrganizacion, codigo: string): Promise<string> {
    const r = await this.db.tarifaManoObra.findUnique({
      where: { organizacionId_codigo: { organizacionId: ctx.organizacionId, codigo } },
      select: { id: true },
    });
    if (!r) throw new ErrorReferenciaCatalogo("la tarifa", codigo);
    return r.id;
  }

  private async idConcepto(ctx: ContextoOrganizacion, codigo: string): Promise<string> {
    const r = await this.db.concepto.findUnique({
      where: { organizacionId_codigo: { organizacionId: ctx.organizacionId, codigo } },
      select: { id: true },
    });
    if (!r) throw new ErrorReferenciaCatalogo("el concepto", codigo);
    return r.id;
  }
}

function datosParametros(d: DatosParametros) {
  return {
    ambiente: d.ambiente,
    moneda: d.moneda,
    recargoSobreCosto: decimalOpcionalParaColumna(d.recargoSobreCosto, "fraccion", "recargoSobreCosto"),
    impuestoTasa: decimalOpcionalParaColumna(d.impuestoTasa, "fraccion", "impuestoTasa"),
    impuestoBase: d.impuestoBase,
    impuestoTratamiento: d.impuestoTratamiento,
    impuestoNombre: d.impuestoNombre,
    vigenciaDias: d.vigenciaDias,
  };
}

type FilaPrecio = Prisma.PrecioGetPayload<{
  include: {
    producto: { include: { insumo: { select: { codigo: true } } } };
    proveedor: { select: { codigo: true; activo: true } };
  };
}>;

function precioLeido(f: FilaPrecio): PrecioLeido {
  return {
    codigo: f.codigo,
    precioUnitario: textoDeDecimal(f.precioUnitario),
    vigenteDesde: fechaDeColumna(f.vigenteDesde),
    vigenteHasta: fechaDeColumna(f.vigenteHasta),
    anulado: f.anulado,
    producto: {
      codigo: f.producto.codigo,
      insumoCodigo: f.producto.insumo.codigo,
      contenido: textoDeDecimal(f.producto.contenido),
      fraccionable: f.producto.fraccionable,
      incrementoMinimo: textoDeDecimalOpcional(f.producto.incrementoMinimo),
      activo: f.producto.activo,
    },
    proveedor: { codigo: f.proveedor.codigo, activo: f.proveedor.activo },
  };
}
