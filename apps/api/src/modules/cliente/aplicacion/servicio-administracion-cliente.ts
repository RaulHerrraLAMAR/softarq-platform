/**
 * Administración del cliente externo (módulo 17, ADR-0021): acceso del cliente a la app, precios de referencia de las
 * estimaciones y trabajos para clientes.
 *
 * - El acceso lo crea el Administrador del sistema desde un Cliente existente, con contraseña temporal de 72 h y cambio
 *   obligatorio al entrar (mismo mecanismo que las personas). Sin autorregistro, correo ni enlaces de invitación. La contraseña
 *   temporal se devuelve UNA sola vez y nunca se registra.
 * - Las referencias las designa y retira el Administrador del catálogo, con motivo y bitácora. La base valida que el precio sea del
 *   insumo, esté vigente hoy, no esté anulado y tenga producto y proveedor activos; la estimación lo vuelve a comprobar.
 * - Una referencia NO es una selección aprobada de ninguna cotización.
 */
import {
  type AccesoCliente,
  type DefinicionTrabajo,
  type DesignarReferencia,
  type EstadoAccesoCliente,
  type NuevoAccesoCliente,
  type RespuestaAltaAcceso,
  type RespuestaReferencias,
  EsquemaMedidaPedida,
  LIMITES_ADMINISTRACION,
} from "@softarq/contracts";
import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { generarContrasena } from "../../autenticacion/demo/cargar-usuarios-demo.js";
import type { ServicioContrasenas } from "../../autenticacion/infraestructura/contrasenas.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { ErrorNegocio, traducirErrorBase } from "../../cotizaciones/aplicacion/errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import { RepositorioAdministracionSistema } from "../../administracion/persistencia/repositorio-administracion-sistema.js";
import { problemaDeConfiguracion } from "../dominio/captura.js";
import { RepositorioAdministracionCliente, type AccesoFila } from "../infraestructura/repositorio-administracion-cliente.js";

const HORA_MS = 60 * 60 * 1000;
const NO_ENCONTRADO = (que: string) => new ErrorNegocio("NO_ENCONTRADO", `${que} no existe en su organización.`);

const aAcceso = (a: AccesoFila): AccesoCliente => ({
  usuarioId: a.usuarioId,
  clienteId: a.clienteId,
  correo: a.correo,
  nombre: a.nombre,
  activo: a.activo,
  contrasenaTemporal: a.contrasenaTemporal,
  creadoEn: a.creadoEn.toISOString(),
});

export interface RelojInstanteAdmin {
  ahora(): Date;
}

export class ServicioAdministracionCliente {
  private readonly repo: RepositorioAdministracionCliente;
  private readonly catalogos: RepositorioCatalogos;
  private readonly sistema: RepositorioAdministracionSistema;

  constructor(
    db: PrismaClient,
    private readonly contrasenas: ServicioContrasenas,
    private readonly reloj: Reloj,
    private readonly instante: RelojInstanteAdmin,
  ) {
    this.repo = new RepositorioAdministracionCliente(db);
    this.catalogos = new RepositorioCatalogos(db);
    this.sistema = new RepositorioAdministracionSistema(db);
  }

  private async base<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (e) {
      throw traducirErrorBase(e);
    }
  }

  // ---------------------------------- accesos ----------------------------------

  async acceso(ctx: ContextoOrganizacion, clienteId: string): Promise<AccesoCliente> {
    const a = await this.repo.accesoDeCliente(ctx, clienteId);
    if (!a) throw NO_ENCONTRADO("El acceso de este cliente");
    return aAcceso(a);
  }

  async crearAcceso(ctx: ContextoOrganizacion, adminId: string, clienteId: string, s: NuevoAccesoCliente): Promise<RespuestaAltaAcceso> {
    if (!(await this.repo.clienteActivo(ctx, clienteId))) throw NO_ENCONTRADO("El cliente");
    const temporal = generarContrasena();
    const hash = await this.contrasenas.crearHash(temporal);
    const expira = new Date(this.instante.ahora().getTime() + LIMITES_ADMINISTRACION.horasContrasenaTemporal * HORA_MS);
    const usuarioId = await this.base(() => this.repo.crearAcceso(ctx, adminId, clienteId, { correo: s.correo, nombre: s.nombre, motivo: s.motivo }, hash, expira));
    const a = await this.repo.accesoDeUsuario(ctx, usuarioId);
    if (!a) throw NO_ENCONTRADO("El acceso");
    return { acceso: aAcceso(a), contrasenaTemporal: temporal, temporalExpiraEn: expira.toISOString() };
  }

  async cambiarEstado(ctx: ContextoOrganizacion, adminId: string, usuarioId: string, e: EstadoAccesoCliente): Promise<AccesoCliente> {
    await this.base(() => this.repo.cambiarEstado(ctx, adminId, usuarioId, e.activo, e.motivo));
    const a = await this.repo.accesoDeUsuario(ctx, usuarioId);
    if (!a) throw NO_ENCONTRADO("El acceso");
    return aAcceso(a);
  }

  /**
   * Restablece la contraseña del cliente: temporal nueva (72 h), invalida la anterior y revoca todas sus sesiones. Idempotente con
   * `Idempotency-Key`: un reintento no entrega otra contraseña (`contrasenaTemporal: null`).
   */
  async restablecer(ctx: ContextoOrganizacion, adminId: string, usuarioId: string, motivo: string, clave: string): Promise<RespuestaAltaAcceso> {
    const ahora = this.instante.ahora();
    if (!(await this.repo.accesoDeUsuario(ctx, usuarioId))) throw NO_ENCONTRADO("El acceso");
    const idem = prepararIdempotencia(clave, "restablecer_contrasena", { id: usuarioId }, { motivo }, ahora);
    const expira = new Date(ahora.getTime() + LIMITES_ADMINISTRACION.horasContrasenaTemporal * HORA_MS);
    let temporal: string | null = null;
    await this.base(() =>
      ejecutarIdempotente(this.sistema, ctx, { usuarioId: adminId }, idem, ahora, async () => {
        const nueva = generarContrasena();
        const hash = await this.contrasenas.crearHash(nueva);
        const id = await this.sistema.restablecerContrasena(ctx, { usuarioId: adminId }, usuarioId, hash, expira, motivo, idem);
        temporal = nueva;
        return id;
      }),
    );
    const a = await this.repo.accesoDeUsuario(ctx, usuarioId);
    if (!a) throw NO_ENCONTRADO("El acceso");
    return { acceso: aAcceso(a), contrasenaTemporal: temporal, temporalExpiraEn: expira.toISOString() };
  }

  // ---------------------------------- referencias ----------------------------------

  async referencias(ctx: ContextoOrganizacion): Promise<RespuestaReferencias> {
    const hoy = this.reloj.hoy();
    const filas = await this.repo.referencias(ctx);
    const conReferencia = new Set(filas.map((f) => f.insumoCodigo));
    const necesarios = await this.repo.insumosNecesarios(ctx);
    return {
      referencias: filas.map((f) => ({
        insumoCodigo: f.insumoCodigo,
        insumo: f.insumo,
        precioCodigo: f.precioCodigo,
        producto: f.producto,
        proveedor: f.proveedor,
        vigenteHasta: f.vigenteHasta,
        vigente: !f.anulado && f.productoActivo && f.proveedorActivo && f.vigenteDesde <= hoy && hoy <= f.vigenteHasta,
        designadaEn: f.designadaEn.toISOString(),
        motivo: f.motivo,
      })),
      pendientes: necesarios.filter((i) => !conReferencia.has(i.codigo)).map((i) => ({ insumoCodigo: i.codigo, insumo: i.descripcion })),
    };
  }

  async designar(ctx: ContextoOrganizacion, adminId: string, insumoCodigo: string, d: DesignarReferencia): Promise<RespuestaReferencias> {
    const insumo = await this.repo.insumoId(ctx, insumoCodigo);
    const precio = await this.repo.precioId(ctx, d.precioCodigo);
    if (!insumo) throw NO_ENCONTRADO("El insumo");
    if (!precio) throw NO_ENCONTRADO("El precio");
    await this.base(() => this.repo.designar(ctx, adminId, insumo, precio, this.reloj.hoy(), d.motivo));
    return this.referencias(ctx);
  }

  async retirar(ctx: ContextoOrganizacion, adminId: string, insumoCodigo: string, motivo: string): Promise<RespuestaReferencias> {
    const insumo = await this.repo.insumoId(ctx, insumoCodigo);
    if (!insumo) throw NO_ENCONTRADO("El insumo");
    await this.base(() => this.repo.retirar(ctx, adminId, insumo, motivo));
    return this.referencias(ctx);
  }

  // ---------------------------------- trabajos para clientes ----------------------------------

  async trabajos(ctx: ContextoOrganizacion): Promise<{ trabajos: Omit<DefinicionTrabajo, "motivo">[] }> {
    const filas = await this.repo.trabajos(ctx);
    return {
      trabajos: filas.map((t) => ({
        ...t,
        opciones: t.opciones.map((o) => ({ ...o, medidas: z.array(EsquemaMedidaPedida).catch([]).parse(o.medidas) })),
      })),
    };
  }

  /**
   * Alta o edición de un trabajo con sus opciones. Cada opción apunta a un concepto existente; sus medidas deben ser EXACTAMENTE
   * las que el motor acepta para la fórmula de ese concepto (`problemaDeConfiguracion`). La aprobación del concepto se exige al
   * estimar, no aquí: así un concepto pendiente puede prepararse sin ofrecerse todavía.
   */
  async guardarTrabajo(ctx: ContextoOrganizacion, adminId: string, d: DefinicionTrabajo): Promise<{ trabajos: Omit<DefinicionTrabajo, "motivo">[] }> {
    const conceptos = await this.catalogos.obtenerConceptos(ctx, [...new Set(d.opciones.map((o) => o.conceptoCodigo))]);
    const porCodigo = new Map(conceptos.map((c) => [c.codigo, c]));
    const campos: { ruta: string; mensaje: string }[] = [];
    const codigos = new Set<string>();
    d.opciones.forEach((o, i) => {
      const c = porCodigo.get(o.conceptoCodigo);
      if (!c) {
        campos.push({ ruta: `opciones[${i}].conceptoCodigo`, mensaje: `El concepto ${o.conceptoCodigo} no existe.` });
        return;
      }
      const problema = problemaDeConfiguracion(c.tipoFormula, o.medidas.map((m) => m.clave));
      if (problema) campos.push({ ruta: `opciones[${i}].medidas`, mensaje: problema });
      if (codigos.has(o.codigo)) campos.push({ ruta: `opciones[${i}].codigo`, mensaje: "Código de opción repetido." });
      codigos.add(o.codigo);
    });
    if (campos.length > 0) throw new ErrorNegocio("VALOR_INVALIDO", "Revise la definición del trabajo.", { campos });
    await this.base(() => this.repo.guardarTrabajo(ctx, adminId, d));
    return this.trabajos(ctx);
  }
}
