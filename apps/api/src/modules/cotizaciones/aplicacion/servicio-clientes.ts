/**
 * Clientes y proyectos (ADR-0008 §2–§3). Capa de aplicación: sin Nest ni HTTP.
 *
 * - Desactivar no borra: el registro deja de ofrecerse para registros nuevos y el historial lo
 *   conserva (`Cat_CambiarActivo` del libro).
 * - La edición usa revisión (concurrencia optimista): una edición obsoleta responde
 *   CONFLICTO_EDICION con el estado vigente, nunca sobrescribe.
 */
import {
  LIMITES_API,
  type Cliente,
  type ConsultaClientes,
  type ConsultaProyectos,
  type DetalleCliente,
  type EdicionCliente,
  type EdicionProyecto,
  type Proyecto,
  type RespuestaClientes,
  type RespuestaProyectos,
  type SolicitudCliente,
  type SolicitudProyecto,
} from "@softarq/contracts";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Autor, RepositorioCotizaciones } from "../infraestructura/repositorio-cotizaciones.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "./errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "./idempotencia.js";

export interface RelojInstante {
  ahora(): Date;
}

const NO_ENCONTRADO = () => new ErrorNegocio("NO_ENCONTRADO", "El registro no existe en su organización.");

/** Solo las claves presentes (las ausentes no cambian; `null` borra un texto opcional). */
function cambiosDe(e: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "revision" && v !== undefined));
}

export class ServicioClientes {
  constructor(
    private readonly repo: RepositorioCotizaciones,
    private readonly reloj: RelojInstante,
  ) {}

  async listarClientes(ctx: ContextoOrganizacion, c: ConsultaClientes): Promise<RespuestaClientes> {
    const limite = c.limite ?? LIMITES_API.limiteListadoPorOmision;
    const clientes = await this.repo.listarClientes(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      incluirInactivos: c.incluirInactivos ?? false,
      limite,
    });
    return { clientes, limite };
  }

  async detalleCliente(ctx: ContextoOrganizacion, id: string): Promise<DetalleCliente> {
    const cliente = await this.repo.obtenerCliente(ctx, id);
    if (!cliente) throw NO_ENCONTRADO();
    const [proyectos, borradoresAbiertos] = await Promise.all([
      this.repo.listarProyectos(ctx, { clienteId: id, incluirInactivos: true, limite: LIMITES_API.limiteListadoMaximo }),
      this.repo.contarCotizacionesAbiertas(ctx, id),
    ]);
    return { cliente, proyectos, borradoresAbiertos };
  }

  async crearCliente(
    ctx: ContextoOrganizacion,
    autor: Autor,
    s: SolicitudCliente,
    clave: string,
  ): Promise<{ cliente: Cliente; reproducida: boolean }> {
    const ahora = this.reloj.ahora();
    const idem = prepararIdempotencia(clave, "crear_cliente", {}, s, ahora);
    const r = await ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.crearCliente(ctx, autor, s.nombre, idem));
    const cliente = await this.repo.obtenerCliente(ctx, r.id);
    if (!cliente) throw NO_ENCONTRADO();
    return { cliente, reproducida: r.reproducida };
  }

  async editarCliente(ctx: ContextoOrganizacion, autor: Autor, id: string, e: EdicionCliente): Promise<Cliente> {
    try {
      await this.repo.editarCliente(ctx, autor, id, e.revision, cambiosDe(e));
    } catch (err) {
      throw await this.conflicto(err, () => this.repo.obtenerCliente(ctx, id));
    }
    const cliente = await this.repo.obtenerCliente(ctx, id);
    if (!cliente) throw NO_ENCONTRADO();
    return cliente;
  }

  async listarProyectos(ctx: ContextoOrganizacion, c: ConsultaProyectos): Promise<RespuestaProyectos> {
    const limite = c.limite ?? LIMITES_API.limiteListadoPorOmision;
    const proyectos = await this.repo.listarProyectos(ctx, {
      ...(c.clienteId !== undefined ? { clienteId: c.clienteId } : {}),
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      incluirInactivos: c.incluirInactivos ?? false,
      limite,
    });
    return { proyectos, limite };
  }

  async detalleProyecto(ctx: ContextoOrganizacion, id: string): Promise<Proyecto> {
    const p = await this.repo.obtenerProyecto(ctx, id);
    if (!p) throw NO_ENCONTRADO();
    return p;
  }

  async crearProyecto(
    ctx: ContextoOrganizacion,
    autor: Autor,
    s: SolicitudProyecto,
    clave: string,
  ): Promise<{ proyecto: Proyecto; reproducida: boolean }> {
    const ahora = this.reloj.ahora();
    const idem = prepararIdempotencia(clave, "crear_proyecto", {}, s, ahora);
    const datos = {
      nombre: s.nombre,
      municipio: s.municipio ?? null,
      entidadFederativa: s.entidadFederativa ?? null,
      descripcion: s.descripcion ?? null,
    };
    const r = await ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () =>
      this.repo.crearProyecto(ctx, autor, s.clienteId, datos, idem),
    );
    const proyecto = await this.repo.obtenerProyecto(ctx, r.id);
    if (!proyecto) throw NO_ENCONTRADO();
    return { proyecto, reproducida: r.reproducida };
  }

  async editarProyecto(ctx: ContextoOrganizacion, autor: Autor, id: string, e: EdicionProyecto): Promise<Proyecto> {
    try {
      await this.repo.editarProyecto(ctx, autor, id, e.revision, cambiosDe(e));
    } catch (err) {
      throw await this.conflicto(err, () => this.repo.obtenerProyecto(ctx, id));
    }
    return this.detalleProyecto(ctx, id);
  }

  /** CONFLICTO_EDICION con el estado vigente (para comparar o recargar); otros errores, traducidos. */
  private async conflicto(
    err: unknown,
    leer: () => Promise<{ revision: number; modificadoPor: string; modificadoEn: string } | null>,
  ): Promise<unknown> {
    const r = reconocerErrorBase(err);
    if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_EDICION") {
      const actual = await leer();
      if (actual) {
        return new ErrorNegocio("CONFLICTO_EDICION", "Otra persona o pestaña guardó cambios antes; revise la versión vigente.", {
          actual: { revision: actual.revision, actualizadoPor: actual.modificadoPor, actualizadoEn: actual.modificadoEn },
        });
      }
    }
    return traducirErrorBase(err);
  }
}
