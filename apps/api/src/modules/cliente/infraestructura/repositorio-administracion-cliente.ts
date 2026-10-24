/**
 * Administración del cliente externo (módulo 17): accesos (Administrador del sistema), precios de referencia y trabajos para
 * clientes (Administrador del catálogo). Escrituras SOLO con funciones SECURITY DEFINER que exigen la función en la base.
 */
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";

export interface AccesoFila {
  readonly usuarioId: string;
  readonly clienteId: string;
  readonly correo: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly contrasenaTemporal: boolean;
  readonly creadoEn: Date;
}

export interface ReferenciaFila {
  readonly insumoCodigo: string;
  readonly insumo: string;
  readonly precioCodigo: string;
  readonly producto: string;
  readonly proveedor: string;
  readonly vigenteDesde: string;
  readonly vigenteHasta: string;
  readonly anulado: boolean;
  readonly productoActivo: boolean;
  readonly proveedorActivo: boolean;
  readonly designadaEn: Date;
  readonly motivo: string;
}

export interface DefinicionFila {
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly ilustracion: "cubierta" | "losa" | "muro";
  readonly orden: number;
  readonly activo: boolean;
  readonly opciones: {
    codigo: string;
    nombre: string;
    descripcion: string;
    conceptoCodigo: string;
    consolidarCompras: boolean;
    medidas: unknown;
    orden: number;
    activa: boolean;
  }[];
}

const dia = (d: Date): string => d.toISOString().slice(0, 10);

const seleccionAcceso = {
  usuarioId: true,
  clienteId: true,
  activo: true,
  creadoEn: true,
  membresia: { select: { usuario: { select: { correo: true, nombre: true, contrasenaTemporalExpiraEn: true } } } },
} as const;

type FilaAcceso = {
  usuarioId: string;
  clienteId: string;
  activo: boolean;
  creadoEn: Date;
  membresia: { usuario: { correo: string; nombre: string; contrasenaTemporalExpiraEn: Date | null } };
};

const aAcceso = (a: FilaAcceso): AccesoFila => ({
  usuarioId: a.usuarioId,
  clienteId: a.clienteId,
  correo: a.membresia.usuario.correo,
  nombre: a.membresia.usuario.nombre,
  activo: a.activo,
  contrasenaTemporal: a.membresia.usuario.contrasenaTemporalExpiraEn !== null,
  creadoEn: a.creadoEn,
});

export class RepositorioAdministracionCliente {
  constructor(private readonly db: PrismaClient) {}

  // ---------------------------------- accesos ----------------------------------

  async accesoDeCliente(ctx: ContextoOrganizacion, clienteId: string): Promise<AccesoFila | null> {
    const a = await this.db.accesoCliente.findFirst({ where: { organizacionId: ctx.organizacionId, clienteId }, select: seleccionAcceso });
    return a ? aAcceso(a as unknown as FilaAcceso) : null;
  }

  async accesoDeUsuario(ctx: ContextoOrganizacion, usuarioId: string): Promise<AccesoFila | null> {
    const a = await this.db.accesoCliente.findFirst({ where: { organizacionId: ctx.organizacionId, usuarioId }, select: seleccionAcceso });
    return a ? aAcceso(a as unknown as FilaAcceso) : null;
  }

  async clienteActivo(ctx: ContextoOrganizacion, clienteId: string): Promise<boolean> {
    return (await this.db.cliente.count({ where: { organizacionId: ctx.organizacionId, id: clienteId } })) > 0;
  }

  async crearAcceso(ctx: ContextoOrganizacion, adminId: string, clienteId: string, datos: { correo: string; nombre: string; motivo: string }, hash: string, temporalExpiraEn: Date): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_acceso_cliente(${ctx.organizacionId}::uuid, ${adminId}::uuid, ${clienteId}::uuid, ${JSON.stringify(datos)}::jsonb, ${hash}, ${temporalExpiraEn}::timestamptz)::text AS id`;
    return filas[0]!.id;
  }

  async cambiarEstado(ctx: ContextoOrganizacion, adminId: string, usuarioId: string, activo: boolean, motivo: string): Promise<void> {
    await this.db.$queryRaw`SELECT softarq_estado_acceso_cliente(${ctx.organizacionId}::uuid, ${adminId}::uuid, ${usuarioId}::uuid, ${activo}, ${motivo})::text AS r`;
  }

  // ---------------------------------- referencias ----------------------------------

  async referencias(ctx: ContextoOrganizacion): Promise<ReferenciaFila[]> {
    const filas = await this.db.referenciaEstimacion.findMany({
      where: { organizacionId: ctx.organizacionId, retiradaEn: null },
      orderBy: { insumo: { codigo: "asc" } },
      select: {
        motivo: true,
        designadaEn: true,
        insumo: { select: { codigo: true, descripcion: true } },
        precio: {
          select: {
            codigo: true,
            vigenteDesde: true,
            vigenteHasta: true,
            anulado: true,
            producto: { select: { descripcion: true, presentacion: true, activo: true } },
            proveedor: { select: { nombre: true, activo: true } },
          },
        },
      },
    });
    return filas.map((f) => ({
      insumoCodigo: f.insumo.codigo,
      insumo: f.insumo.descripcion,
      precioCodigo: f.precio.codigo,
      producto: `${f.precio.producto.descripcion} (${f.precio.producto.presentacion})`,
      proveedor: f.precio.proveedor.nombre,
      vigenteDesde: dia(f.precio.vigenteDesde),
      vigenteHasta: dia(f.precio.vigenteHasta),
      anulado: f.precio.anulado,
      productoActivo: f.precio.producto.activo,
      proveedorActivo: f.precio.proveedor.activo,
      designadaEn: f.designadaEn,
      motivo: f.motivo,
    }));
  }

  /** Insumos de los conceptos que usan las opciones activas de los trabajos para clientes (los que necesitan referencia). */
  async insumosNecesarios(ctx: ContextoOrganizacion): Promise<{ codigo: string; descripcion: string }[]> {
    const filas = await this.db.insumo.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        activo: true,
        componentes: { some: { activo: true, concepto: { opcionesCliente: { some: { activa: true, trabajo: { activo: true } } } } } },
      },
      orderBy: { codigo: "asc" },
      select: { codigo: true, descripcion: true },
    });
    return filas;
  }

  async insumoId(ctx: ContextoOrganizacion, codigo: string): Promise<string | null> {
    return (await this.db.insumo.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: { id: true } }))?.id ?? null;
  }

  async precioId(ctx: ContextoOrganizacion, codigo: string): Promise<string | null> {
    return (await this.db.precio.findFirst({ where: { organizacionId: ctx.organizacionId, codigo }, select: { id: true } }))?.id ?? null;
  }

  async designar(ctx: ContextoOrganizacion, adminId: string, insumoId: string, precioId: string, fecha: string, motivo: string): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_designar_referencia(${ctx.organizacionId}::uuid, ${adminId}::uuid, ${insumoId}::uuid, ${precioId}::uuid, ${fecha}::date, ${motivo})::text AS id`;
    return filas[0]!.id;
  }

  async retirar(ctx: ContextoOrganizacion, adminId: string, insumoId: string, motivo: string): Promise<void> {
    await this.db.$queryRaw`SELECT softarq_retirar_referencia(${ctx.organizacionId}::uuid, ${adminId}::uuid, ${insumoId}::uuid, ${motivo})::text AS id`;
  }

  // ---------------------------------- trabajos ----------------------------------

  async trabajos(ctx: ContextoOrganizacion): Promise<DefinicionFila[]> {
    const filas = await this.db.trabajoCliente.findMany({
      where: { organizacionId: ctx.organizacionId },
      orderBy: [{ orden: "asc" }, { codigo: "asc" }],
      include: { opciones: { orderBy: [{ orden: "asc" }, { codigo: "asc" }], include: { concepto: { select: { codigo: true } } } } },
    });
    return filas.map((t) => ({
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion,
      ilustracion: t.ilustracion as DefinicionFila["ilustracion"],
      orden: t.orden,
      activo: t.activo,
      opciones: t.opciones.map((o) => ({
        codigo: o.codigo,
        nombre: o.nombre,
        descripcion: o.descripcion,
        conceptoCodigo: o.concepto.codigo,
        consolidarCompras: o.consolidarCompras,
        medidas: o.medidas,
        orden: o.orden,
        activa: o.activa,
      })),
    }));
  }

  async guardarTrabajo(ctx: ContextoOrganizacion, adminId: string, datos: unknown): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_guardar_trabajo_cliente(${ctx.organizacionId}::uuid, ${adminId}::uuid, ${JSON.stringify(datos)}::jsonb)::text AS id`;
    return filas[0]!.id;
  }
}
