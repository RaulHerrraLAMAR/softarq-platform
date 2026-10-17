/**
 * Administración de proveedores, productos, precios y tarifas (módulo 11, ADR-0015). Capa de
 * aplicación: sin Nest ni HTTP.
 *
 * - Desactivar no borra (`Cat_CambiarActivo`): deja de ofrecerse en altas y selecciones nuevas; los
 *   borradores conservan la referencia marcada y las versiones su instantánea.
 * - Los precios no se editan (RF-06): se anulan con motivo o se cierra su vigencia registrando un
 *   sucesor (adaptación autorizada; P3 pendiente). Las tarifas no se editan: se registra una nueva,
 *   se asigna al concepto y se desactiva la anterior (Word §3.5).
 * - Con algún precio, el producto conserva insumo, presentación, unidad, contenido y venta
 *   fraccionada (decisión del propietario).
 * - Concurrencia optimista por revisión (409 con el registro vigente) e idempotencia en las altas y
 *   operaciones POST. Nunca se elige ni se sustituye un precio en un borrador.
 * - La base vuelve a comprobarlo todo, incluida la función Administrador del catálogo (403 si se
 *   perdió durante la sesión).
 */
import {
  CAMPOS_TECNICOS_PRODUCTO,
  LIMITES_API,
  LIMITES_CATALOGO_ADMIN,
  type AnulacionPrecio,
  type AsignacionTarifa,
  type CierreVigenciaPrecio,
  type ConceptoTarifaAdmin,
  type ConsultaConceptosAdmin,
  type ConsultaInsumosAdmin,
  type ConsultaPreciosAdmin,
  type ConsultaProductosAdmin,
  type ConsultaProveedoresAdmin,
  type ConsultaTarifasAdmin,
  type DetallePrecioAdmin,
  type DetalleProductoAdmin,
  type DetalleProveedorAdmin,
  type DetalleTarifaAdmin,
  type EdicionProducto,
  type EdicionProveedor,
  type EdicionTarifa,
  type FechaISO,
  type PrecioAdmin,
  type ProductoAdmin,
  type ProveedorAdmin,
  type RespuestaCierreVigencia,
  type RespuestaConceptosAdmin,
  type RespuestaInsumosAdmin,
  type RespuestaPreciosAdmin,
  type RespuestaProductosAdmin,
  type RespuestaProveedoresAdmin,
  type RespuestaTarifasAdmin,
  type RespuestaUnidades,
  type SolicitudPrecio,
  type SolicitudProducto,
  type SolicitudProveedor,
  type SolicitudTarifa,
  type TarifaAdmin,
} from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { ErrorDecimalColumna } from "../../../infraestructura/prisma/decimales.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "../../cotizaciones/aplicacion/errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import { motivoCierreInvalido } from "../dominio/administracion.js";
import { RepositorioAdministracion, type AutorAdmin } from "../persistencia/repositorio-administracion.js";
import type { ContextoOrganizacion } from "../persistencia/repositorio-catalogos.js";

export interface RelojInstante {
  ahora(): Date;
}

const NO_ENCONTRADO = (que = "El registro") => new ErrorNegocio("NO_ENCONTRADO", `${que} no existe en su organización.`);

/** Solo las claves presentes (las ausentes no cambian; `null` borra un texto opcional). */
function cambiosDe(e: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "revision" && v !== undefined));
}

function textoDeError(e: unknown): string {
  if (e === null || e === undefined) return "";
  if (typeof e !== "object") return String(e);
  const o = e as { message?: unknown; meta?: unknown; cause?: unknown };
  let t = typeof o.message === "string" ? o.message : "";
  try {
    if (o.meta !== undefined) t += ` ${JSON.stringify(o.meta)}`;
  } catch {
    // meta no serializable: se ignora
  }
  return `${t} ${o.cause ? textoDeError(o.cause) : ""}`;
}

const limiteDe = (l: number | undefined) => l ?? LIMITES_API.limiteListadoPorOmision;

export class ServicioAdministracionCatalogos {
  private readonly repo: RepositorioAdministracion;

  constructor(
    db: PrismaClient,
    private readonly reloj: Reloj,
    private readonly instante: RelojInstante,
  ) {
    this.repo = new RepositorioAdministracion(db);
  }

  // ------------------------------- proveedores ------------------------------

  async listarProveedores(ctx: ContextoOrganizacion, c: ConsultaProveedoresAdmin): Promise<RespuestaProveedoresAdmin> {
    const limite = limiteDe(c.limite);
    const r = await this.repo.listarProveedores(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      incluirInactivos: c.incluirInactivos ?? false,
      limite,
    });
    return { proveedores: r.filas, limite, siguiente: r.siguiente };
  }

  async detalleProveedor(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleProveedorAdmin> {
    const p = await this.repo.obtenerProveedor(ctx, codigo);
    if (!p) throw NO_ENCONTRADO("El proveedor");
    const { id, ...proveedor } = p;
    const [impacto, historial] = await Promise.all([
      this.repo.impactoProveedor(ctx, id, this.reloj.hoy()),
      this.repo.historial(ctx, "proveedor", id, LIMITES_CATALOGO_ADMIN.historial),
    ]);
    return { proveedor, impacto, historial };
  }

  async crearProveedor(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudProveedor, clave: string): Promise<{ proveedor: ProveedorAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_proveedor", {}, s, ahora);
    const datos = { nombre: s.nombre, contacto: s.contacto ?? null, telefono: s.telefono ?? null, correo: s.correo ?? null };
    const r = await this.traducir(ctx, () =>
      ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
        await this.exigirProveedorNuevo(ctx, datos.nombre, null);
        return this.repo.crearProveedor(ctx, autor, datos, idem);
      }),
      { nombreProveedor: datos.nombre },
    );
    const proveedor = await this.proveedorPorId(ctx, r.id);
    return { proveedor, reproducida: r.reproducida };
  }

  async editarProveedor(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, e: EdicionProveedor): Promise<ProveedorAdmin> {
    if (e.nombre !== undefined) await this.exigirProveedorNuevo(ctx, e.nombre, codigo);
    await this.traducir(ctx, () => this.repo.editarProveedor(ctx, autor, codigo, e.revision, cambiosDe(e)), {
      conflicto: () => this.repo.obtenerProveedor(ctx, codigo),
      ...(e.nombre !== undefined ? { nombreProveedor: e.nombre } : {}),
    });
    const p = await this.repo.obtenerProveedor(ctx, codigo);
    if (!p) throw NO_ENCONTRADO("El proveedor");
    const { id: _id, ...proveedor } = p;
    return proveedor;
  }

  /** `Val_Proveedor`: «Ya existe el proveedor PRV-…» (TI-004). El índice único lo garantiza en carreras. */
  private async exigirProveedorNuevo(ctx: ContextoOrganizacion, nombre: string, propio: string | null): Promise<void> {
    const existente = await this.repo.proveedorPorNombre(ctx, nombre);
    if (existente && existente.codigo !== propio) {
      throw new ErrorNegocio("DUPLICADO", `Ya existe el proveedor ${existente.codigo}.`, { registroVigente: existente });
    }
  }

  private async proveedorPorId(ctx: ContextoOrganizacion, id: string): Promise<ProveedorAdmin> {
    const codigo = await this.codigoDe(ctx, "proveedor", id);
    const p = codigo ? await this.repo.obtenerProveedor(ctx, codigo) : null;
    if (!p) throw NO_ENCONTRADO("El proveedor");
    const { id: _id, ...proveedor } = p;
    return proveedor;
  }

  // -------------------------------- productos -------------------------------

  async listarProductos(ctx: ContextoOrganizacion, c: ConsultaProductosAdmin): Promise<RespuestaProductosAdmin> {
    const limite = limiteDe(c.limite);
    const r = await this.repo.listarProductos(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.insumoCodigo !== undefined ? { insumoCodigo: c.insumoCodigo } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      incluirInactivos: c.incluirInactivos ?? false,
      limite,
    });
    return { productos: r.filas, limite, siguiente: r.siguiente };
  }

  async detalleProducto(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleProductoAdmin> {
    const p = await this.repo.obtenerProducto(ctx, codigo);
    if (!p) throw NO_ENCONTRADO("El producto");
    const { id, ...producto } = p;
    const [impacto, historial] = await Promise.all([
      this.repo.impactoProducto(ctx, id, this.reloj.hoy()),
      this.repo.historial(ctx, "producto", id, LIMITES_CATALOGO_ADMIN.historial),
    ]);
    return { producto, impacto, historial };
  }

  async crearProducto(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudProducto, clave: string): Promise<{ producto: ProductoAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_producto", {}, s, ahora);
    const r = await this.traducir(
      ctx,
      () =>
        ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
          await this.exigirProductoNuevo(ctx, s.descripcion, s.presentacion, null);
          return this.repo.crearProducto(ctx, autor, { ...s }, idem);
        }),
      { producto: { descripcion: s.descripcion, presentacion: s.presentacion } },
    );
    const codigo = await this.codigoDe(ctx, "producto", r.id);
    const p = codigo ? await this.repo.obtenerProducto(ctx, codigo) : null;
    if (!p) throw NO_ENCONTRADO("El producto");
    const { id: _id, ...producto } = p;
    return { producto, reproducida: r.reproducida };
  }

  async editarProducto(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, e: EdicionProducto): Promise<ProductoAdmin> {
    const actual = await this.repo.obtenerProducto(ctx, codigo);
    if (!actual) throw NO_ENCONTRADO("El producto");
    const cambios = cambiosDe(e);
    // Bloqueo técnico (decisión del propietario): mensaje con los campos; la base lo vuelve a imponer.
    if (actual.revision === e.revision && actual.tienePrecios) {
      const tecnicos = CAMPOS_TECNICOS_PRODUCTO.filter((k) => k in cambios && !mismoValor(k, cambios[k], actual));
      if (tecnicos.length > 0) {
        throw new ErrorNegocio(
          "PRODUCTO_CON_PRECIOS",
          "El producto ya tiene precios registrados: su insumo, presentación, unidad, contenido y venta fraccionada no cambian. Registre un producto nuevo para otra presentación.",
          { campos: tecnicos.map((k) => ({ ruta: k, mensaje: "Bloqueado: el producto tiene precios registrados." })) },
        );
      }
    }
    const fraccionable = (cambios["fraccionable"] as boolean | undefined) ?? actual.fraccionable;
    if (!fraccionable && typeof cambios["incrementoMinimo"] === "string") {
      throw new ErrorNegocio("VALOR_INVALIDO", "El incremento mínimo solo aplica si la venta fraccionada está permitida.", {
        campos: [{ ruta: "incrementoMinimo", mensaje: "Solo aplica si la venta fraccionada está permitida." }],
      });
    }
    const incremento = "incrementoMinimo" in cambios ? (cambios["incrementoMinimo"] as string | null) : actual.incrementoMinimo;
    if (fraccionable && incremento === null) {
      throw new ErrorNegocio("VALOR_INVALIDO", "Indique el incremento mínimo de venta.", {
        campos: [{ ruta: "incrementoMinimo", mensaje: "Indique el incremento mínimo de venta." }],
      });
    }
    const descripcion = (cambios["descripcion"] as string | undefined) ?? actual.descripcion;
    const presentacion = (cambios["presentacion"] as string | undefined) ?? actual.presentacion;
    if ("descripcion" in cambios || "presentacion" in cambios) await this.exigirProductoNuevo(ctx, descripcion, presentacion, codigo);
    await this.traducir(ctx, () => this.repo.editarProducto(ctx, autor, codigo, e.revision, cambios), {
      conflicto: () => this.repo.obtenerProducto(ctx, codigo),
      producto: { descripcion, presentacion },
    });
    const p = await this.repo.obtenerProducto(ctx, codigo);
    if (!p) throw NO_ENCONTRADO("El producto");
    const { id: _id, ...producto } = p;
    return producto;
  }

  private async exigirProductoNuevo(ctx: ContextoOrganizacion, descripcion: string, presentacion: string, propio: string | null): Promise<void> {
    const existente = await this.repo.productoPorDescripcion(ctx, descripcion, presentacion);
    if (existente && existente.codigo !== propio) {
      throw new ErrorNegocio("DUPLICADO", `Ya existe el producto ${existente.codigo} con esa descripción y presentación.`, { registroVigente: existente });
    }
  }

  // --------------------------------- precios --------------------------------

  async listarPrecios(ctx: ContextoOrganizacion, c: ConsultaPreciosAdmin): Promise<RespuestaPreciosAdmin> {
    const limite = limiteDe(c.limite);
    const hoy = this.reloj.hoy();
    const r = await this.repo.listarPrecios(ctx, hoy, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.productoCodigo !== undefined ? { productoCodigo: c.productoCodigo } : {}),
      ...(c.proveedorCodigo !== undefined ? { proveedorCodigo: c.proveedorCodigo } : {}),
      ...(c.estado !== undefined ? { estado: c.estado } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      limite,
    });
    return { precios: r.filas, fechaReferencia: hoy, limite, siguiente: r.siguiente };
  }

  async detallePrecio(ctx: ContextoOrganizacion, codigo: string): Promise<DetallePrecioAdmin> {
    const hoy = this.reloj.hoy();
    const p = await this.repo.obtenerPrecio(ctx, codigo, hoy);
    if (!p) throw NO_ENCONTRADO("El precio");
    const { id, ...precio } = p;
    const [impacto, historial] = await Promise.all([
      this.repo.impactoPrecio(ctx, codigo),
      this.repo.historial(ctx, "precio", id, LIMITES_CATALOGO_ADMIN.historial),
    ]);
    return { precio, fechaReferencia: hoy, impacto, historial };
  }

  async registrarPrecio(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudPrecio, clave: string): Promise<{ precio: PrecioAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const hoy = this.reloj.hoy();
    const idem = prepararIdempotencia(clave, "registrar_precio", {}, s, ahora);
    const r = await this.traducir(ctx, () => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.registrarPrecio(ctx, autor, { ...s }, idem)), {
      solape: { productoCodigo: s.productoCodigo, proveedorCodigo: s.proveedorCodigo, vigenteDesde: s.vigenteDesde, vigenteHasta: s.vigenteHasta },
    });
    return { precio: await this.precioPorId(ctx, r.id, hoy), reproducida: r.reproducida };
  }

  async anularPrecio(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, a: AnulacionPrecio, clave: string): Promise<{ precio: PrecioAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const hoy = this.reloj.hoy();
    const idem = prepararIdempotencia(clave, "anular_precio", { codigo }, a, ahora);
    const r = await this.traducir(ctx, () => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.anularPrecio(ctx, autor, codigo, a.revision, a.motivo, idem)), {
      conflicto: () => this.repo.obtenerPrecio(ctx, codigo, hoy),
    });
    return { precio: await this.precioPorId(ctx, r.id, hoy), reproducida: r.reproducida };
  }

  async cerrarVigencia(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, c: CierreVigenciaPrecio, clave: string): Promise<RespuestaCierreVigencia & { reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const hoy = this.reloj.hoy();
    const idem = prepararIdempotencia(clave, "cerrar_vigencia_precio", { codigo }, c, ahora);
    const actual = await this.repo.obtenerPrecio(ctx, codigo, hoy);
    if (!actual) throw NO_ENCONTRADO("El precio");
    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (!previo && actual.revision === c.revision) {
      const motivo = motivoCierreInvalido({ ...actual, anulado: actual.estado === "ANULADO" }, c.nuevaHasta, c.sucesor.vigenteDesde, hoy);
      if (motivo) {
        throw new ErrorNegocio(actual.estado === "ANULADO" ? "PRECIO_ANULADO" : "VIGENCIA_INVALIDA", motivo, { registroVigente: actual });
      }
    }
    const r = await this.traducir(
      ctx,
      () =>
        ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () =>
          this.repo.cerrarVigenciaPrecio(ctx, autor, codigo, { revision: c.revision, nuevaHasta: c.nuevaHasta, hoy, motivo: c.motivo, sucesor: { ...c.sucesor } }, idem),
        ),
      {
        conflicto: () => this.repo.obtenerPrecio(ctx, codigo, hoy),
        solape: {
          productoCodigo: actual.producto.codigo,
          proveedorCodigo: actual.proveedor.codigo,
          vigenteDesde: c.sucesor.vigenteDesde,
          vigenteHasta: c.sucesor.vigenteHasta,
          excluir: codigo,
        },
      },
    );
    const sucesor = await this.precioPorId(ctx, r.id, hoy);
    const cerrado = await this.repo.obtenerPrecio(ctx, codigo, hoy);
    if (!cerrado) throw NO_ENCONTRADO("El precio");
    const { id: _id, ...precioCerrado } = cerrado;
    return { cerrado: precioCerrado, sucesor, fechaReferencia: hoy, reproducida: r.reproducida };
  }

  private async precioPorId(ctx: ContextoOrganizacion, id: string, hoy: FechaISO): Promise<PrecioAdmin> {
    const p = await this.repo.obtenerPrecioPorId(ctx, id, hoy);
    if (!p) throw NO_ENCONTRADO("El precio");
    return p;
  }

  // --------------------------------- tarifas --------------------------------

  async listarTarifas(ctx: ContextoOrganizacion, c: ConsultaTarifasAdmin): Promise<RespuestaTarifasAdmin> {
    const limite = limiteDe(c.limite);
    const hoy = this.reloj.hoy();
    const r = await this.repo.listarTarifas(ctx, hoy, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.modalidad !== undefined ? { modalidad: c.modalidad } : {}),
      ...(c.unidad !== undefined ? { unidad: c.unidad } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      incluirInactivas: c.incluirInactivas ?? false,
      limite,
    });
    return { tarifas: r.filas, fechaReferencia: hoy, limite, siguiente: r.siguiente };
  }

  async detalleTarifa(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleTarifaAdmin> {
    const hoy = this.reloj.hoy();
    const t = await this.repo.obtenerTarifa(ctx, codigo, hoy);
    if (!t) throw NO_ENCONTRADO("La tarifa");
    const { id, ...tarifa } = t;
    const conceptos = await this.repo.conceptosDeTarifa(ctx, id);
    const [impacto, historial] = await Promise.all([
      this.repo.impactoTarifa(ctx, codigo, conceptos.map((c) => c.codigo)),
      this.repo.historial(ctx, "tarifa", id, LIMITES_CATALOGO_ADMIN.historial),
    ]);
    return { tarifa, fechaReferencia: hoy, conceptos, impacto, historial };
  }

  async registrarTarifa(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudTarifa, clave: string): Promise<{ tarifa: TarifaAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const hoy = this.reloj.hoy();
    const idem = prepararIdempotencia(clave, "registrar_tarifa", {}, s, ahora);
    const r = await this.traducir(ctx, () => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.registrarTarifa(ctx, autor, { ...s }, idem)), {});
    const codigo = await this.codigoDe(ctx, "tarifa", r.id);
    const t = codigo ? await this.repo.obtenerTarifa(ctx, codigo, hoy) : null;
    if (!t) throw NO_ENCONTRADO("La tarifa");
    const { id: _id, ...tarifa } = t;
    return { tarifa, reproducida: r.reproducida };
  }

  async editarTarifa(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, e: EdicionTarifa): Promise<TarifaAdmin> {
    const hoy = this.reloj.hoy();
    await this.traducir(ctx, () => this.repo.cambiarActivaTarifa(ctx, autor, codigo, e.revision, e.activa), {
      conflicto: () => this.repo.obtenerTarifa(ctx, codigo, hoy),
    });
    const t = await this.repo.obtenerTarifa(ctx, codigo, hoy);
    if (!t) throw NO_ENCONTRADO("La tarifa");
    const { id: _id, ...tarifa } = t;
    return tarifa;
  }

  // ---------------------------- conceptos (tarifa) ---------------------------

  async listarConceptos(ctx: ContextoOrganizacion, c: ConsultaConceptosAdmin): Promise<RespuestaConceptosAdmin> {
    const limite = limiteDe(c.limite);
    const r = await this.repo.listarConceptos(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.estado !== undefined ? { estado: c.estado } : {}),
      ...(c.tipoCodigo !== undefined ? { tipoCodigo: c.tipoCodigo } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      soloActivos: c.soloActivos ?? false,
      limite,
    });
    return { conceptos: r.filas, limite, siguiente: r.siguiente };
  }

  async asignarTarifa(ctx: ContextoOrganizacion, autor: AutorAdmin, concepto: string, a: AsignacionTarifa, clave: string): Promise<{ concepto: ConceptoTarifaAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "asignar_tarifa", { concepto }, a, ahora);
    if (!(await this.repo.conceptoId(ctx, concepto))) throw NO_ENCONTRADO("El concepto");
    const leer = async () => (await this.repo.listarConceptos(ctx, { codigos: [concepto], limite: 1 })).filas[0] ?? null;
    const r = await this.traducir(ctx, () => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.asignarTarifa(ctx, autor, concepto, a, idem)), {
      conflictoTarifa: leer,
    });
    const actual = await leer();
    if (!actual) throw NO_ENCONTRADO("El concepto");
    return { concepto: actual, reproducida: r.reproducida };
  }

  // ------------------------------- referencias ------------------------------

  async listarInsumos(ctx: ContextoOrganizacion, c: ConsultaInsumosAdmin): Promise<RespuestaInsumosAdmin> {
    const limite = limiteDe(c.limite);
    const r = await this.repo.listarInsumos(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      incluirInactivos: c.incluirInactivos ?? false,
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      limite,
    });
    return { insumos: r.filas, limite, siguiente: r.siguiente };
  }

  async listarUnidades(): Promise<RespuestaUnidades> {
    return { unidades: await this.repo.listarUnidades() };
  }

  // -------------------------------- utilidades ------------------------------

  private async codigoDe(ctx: ContextoOrganizacion, tipo: "proveedor" | "producto" | "tarifa", id: string): Promise<string | null> {
    return this.repo.codigoPorId(ctx, tipo, id);
  }

  /**
   * Traduce los errores de la base: códigos SOFTARQ:*, conflicto de revisión con el registro
   * vigente, duplicados por el índice normalizado, solape por la exclusión y decimales que no caben.
   */
  private async traducir<T>(
    ctx: ContextoOrganizacion,
    accion: () => Promise<T>,
    c: {
      conflicto?: () => Promise<unknown>;
      conflictoTarifa?: () => Promise<unknown>;
      nombreProveedor?: string;
      producto?: { descripcion: string; presentacion: string };
      solape?: { productoCodigo: string; proveedorCodigo: string; vigenteDesde: FechaISO; vigenteHasta: FechaISO; excluir?: string };
    },
  ): Promise<T> {
    try {
      return await accion();
    } catch (err) {
      if (err instanceof ErrorDecimalColumna) {
        throw new ErrorNegocio("VALOR_INVALIDO", err.message, { campos: [{ ruta: err.campo, mensaje: err.message }] });
      }
      // `ejecutarIdempotente` ya traduce los códigos SOFTARQ:*; aquí se añade el registro vigente.
      const r = err instanceof ErrorNegocio ? { tipo: "negocio" as const, codigo: err.codigo as string } : reconocerErrorBase(err);
      if (err instanceof ErrorNegocio && err.detalle.registroVigente !== undefined) throw err;
      if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_EDICION" && c.conflicto) {
        const vigente = await c.conflicto();
        throw new ErrorNegocio("CONFLICTO_EDICION", "Otra persona o pestaña guardó cambios antes; lo que escribió se conserva. Revise la versión vigente.", {
          registroVigente: vigente ? sinId(vigente) : null,
        });
      }
      if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_TARIFA" && c.conflictoTarifa) {
        throw new ErrorNegocio("CONFLICTO_TARIFA", "Otra persona cambió la tarifa del concepto antes; revise la asignación vigente.", {
          registroVigente: await c.conflictoTarifa(),
        });
      }
      if (err instanceof ErrorNegocio) throw err;
      const texto = textoDeError(err);
      if (texto.includes("proveedor_nombre_normalizado_key") && c.nombreProveedor) {
        const existente = await this.repo.proveedorPorNombre(ctx, c.nombreProveedor);
        throw new ErrorNegocio("DUPLICADO", `Ya existe el proveedor ${existente?.codigo ?? "con ese nombre"}.`, { registroVigente: existente });
      }
      if (texto.includes("producto_descripcion_presentacion_key") && c.producto) {
        const existente = await this.repo.productoPorDescripcion(ctx, c.producto.descripcion, c.producto.presentacion);
        throw new ErrorNegocio("DUPLICADO", `Ya existe el producto ${existente?.codigo ?? ""} con esa descripción y presentación.`, { registroVigente: existente });
      }
      if (texto.includes("precio_sin_solape_ex") && c.solape) {
        const otro = await this.repo.precioSolapado(ctx, c.solape, this.reloj.hoy());
        throw new ErrorNegocio(
          "SOLAPE_VIGENCIA",
          otro
            ? `Ya existe un precio vigente de ese proveedor en el periodo (${otro.codigo}, ${otro.vigenteDesde} a ${otro.vigenteHasta}).`
            : "Ya existe un precio vigente de ese proveedor en el periodo.",
          { registroVigente: otro },
        );
      }
      throw traducirErrorBase(err);
    }
  }
}

function sinId(registro: unknown): unknown {
  if (registro && typeof registro === "object" && "id" in registro) {
    const { id: _id, ...resto } = registro as Record<string, unknown>;
    return resto;
  }
  return registro;
}

function mismoValor(campo: (typeof CAMPOS_TECNICOS_PRODUCTO)[number], valor: unknown, p: ProductoAdmin): boolean {
  switch (campo) {
    case "insumoCodigo":
      return valor === p.insumo.codigo;
    case "presentacion":
      return valor === p.presentacion;
    case "unidadCompra":
      return valor === p.unidadCompra;
    case "fraccionable":
      return valor === p.fraccionable;
    case "contenido":
      return typeof valor === "string" && mismoDecimal(valor, p.contenido);
    case "incrementoMinimo":
      return valor === null ? p.incrementoMinimo === null : typeof valor === "string" && p.incrementoMinimo !== null && mismoDecimal(valor, p.incrementoMinimo);
  }
}

/** Igualdad de decimales en texto sin pasar por `number` ("25" = "25.000"). */
function mismoDecimal(a: string, b: string): boolean {
  const norm = (x: string) => {
    const [e = "0", f = ""] = x.split(".");
    return `${e.replace(/^0+(?=\d)/, "")}.${f.replace(/0+$/, "")}`;
  };
  return norm(a) === norm(b);
}
