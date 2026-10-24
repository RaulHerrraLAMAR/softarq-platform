/**
 * Panel del equipo (módulo 17, ADR-0021): bandeja de solicitudes de clientes y «atender».
 *
 * - Solo las solicitudes ENVIADAS o posteriores; los borradores del cliente no se ven.
 * - «Atender» (Preparador) crea la cotización formal en borrador con las medidas del cliente y SIN precios elegidos ni compras
 *   consolidadas: el Preparador debe confirmar explícitamente cada precio. Las referencias de la estimación NO se heredan.
 * - La estimación que ve el equipo se rotula como preliminar y nunca se presenta como cotización.
 */
import {
  CAPTURA_SOLICITUD_VACIA,
  EsquemaCotizacionComercial,
  type AtenderSolicitud,
  type DetalleSolicitudEquipo,
  type RespuestaAtencion,
  type RespuestaSolicitudesEquipo,
} from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { ErrorNegocio, traducirErrorBase } from "../../cotizaciones/aplicacion/errores.js";
import { RepositorioEmisiones } from "../../cotizaciones/infraestructura/repositorio-emisiones.js";
import { conTextosIniciales, textosPredeterminados } from "../../cotizaciones/dominio/textos.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { borradorInterno, nombresDeTrabajos, validarCaptura } from "../dominio/captura.js";
import { RepositorioCliente } from "../infraestructura/repositorio-cliente.js";
import { RepositorioEquipo } from "../infraestructura/repositorio-equipo.js";
import { armarCatalogo } from "./catalogo.js";
import { aEstimacionCliente } from "./servicio-cliente.js";

const iso = (d: Date): string => d.toISOString();

export class ServicioEquipo {
  private readonly repo: RepositorioEquipo;
  private readonly cliente: RepositorioCliente;
  private readonly emisiones: RepositorioEmisiones;

  constructor(
    db: PrismaClient,
    private readonly reloj: Reloj,
  ) {
    this.repo = new RepositorioEquipo(db);
    this.cliente = new RepositorioCliente(db);
    this.emisiones = new RepositorioEmisiones(db);
  }

  async listar(ctx: ContextoOrganizacion, estados: readonly ("ENVIADA" | "EN_PREPARACION" | "RETIRADA")[], limite: number): Promise<RespuestaSolicitudesEquipo> {
    const filas = await this.repo.listar(ctx, estados, limite);
    const { mapa } = armarCatalogo(await this.cliente.trabajos(ctx, true), true);
    const ultimas = await this.cliente.ultimasEstimaciones(ctx, filas.map((f) => f.id));
    return {
      solicitudes: filas.map((f) => {
        const est = ultimas.get(f.id);
        const comercial = est?.estado === "ESTIMADA" ? EsquemaCotizacionComercial.nullable().safeParse(est.comercial) : null;
        return {
          id: f.id,
          folio: f.folio,
          estado: f.estado,
          cliente: f.clienteNombre,
          proyecto: f.proyecto.nombre,
          trabajos: nombresDeTrabajos(f.captura, mapa),
          enviadaEn: f.enviadaEn ? iso(f.enviadaEn) : null,
          totalEstimado: comercial?.success && comercial.data ? comercial.data.total : null,
          cotizacionId: f.cotizacionId,
        };
      }),
    };
  }

  async detalle(ctx: ContextoOrganizacion, id: string): Promise<DetalleSolicitudEquipo> {
    const f = await this.repo.obtener(ctx, id);
    if (!f) throw new ErrorNegocio("NO_ENCONTRADO", "La solicitud no existe en su organización.");
    const { mapa } = armarCatalogo(await this.cliente.trabajos(ctx, true), true);
    const est = await this.cliente.ultimaEstimacion(ctx, f.id);
    const comercial = est?.estado === "ESTIMADA" ? EsquemaCotizacionComercial.nullable().safeParse(est.comercial) : null;
    return {
      id: f.id,
      folio: f.folio,
      estado: f.estado,
      cliente: f.clienteNombre,
      proyecto: f.proyecto.nombre,
      trabajos: nombresDeTrabajos(f.captura, mapa),
      enviadaEn: f.enviadaEn ? iso(f.enviadaEn) : null,
      totalEstimado: comercial?.success && comercial.data ? comercial.data.total : null,
      cotizacionId: f.cotizacionId,
      revision: f.revision,
      captura: f.captura ?? CAPTURA_SOLICITUD_VACIA,
      ultimaEstimacion: est ? aEstimacionCliente(est, f.revision) : null,
      folioCotizacion: f.cotizacionFolio,
    };
  }

  /**
   * Crea la cotización formal a partir de la solicitud. Idempotente: si ya se atendió, devuelve la misma cotización con
   * `repetida: true`. El borrador lleva conceptos y medidas y nada más (sin precios, sin consolidar compras).
   */
  async atender(ctx: ContextoOrganizacion, usuarioId: string, id: string, a: AtenderSolicitud): Promise<RespuestaAtencion> {
    const f = await this.repo.obtener(ctx, id);
    if (!f) throw new ErrorNegocio("NO_ENCONTRADO", "La solicitud no existe en su organización.");
    if (f.estado === "ENVIADA") {
      const { mapa } = armarCatalogo(await this.cliente.trabajos(ctx, true), true);
      const v = validarCaptura(f.captura, mapa);
      if (v.pendientes.length > 0) throw new ErrorNegocio("SOLICITUD_INCOMPLETA", "La captura del cliente está incompleta.", { campos: v.pendientes });
      const inicial = conTextosIniciales(borradorInterno(f.captura, mapa), textosPredeterminados(await this.emisiones.plantillaTextos(ctx)));
      const anio = Number(this.reloj.hoy().slice(0, 4));
      try {
        const r = await this.repo.atender(ctx, usuarioId, id, a.revision, anio, inicial);
        return { cotizacionId: r.cotizacionId, folio: r.folio, repetida: r.repetida };
      } catch (e) {
        throw traducirErrorBase(e);
      }
    }
    // Reintento sobre una solicitud ya atendida (o estado que no corresponde): la función de la base decide.
    try {
      const r = await this.repo.atender(ctx, usuarioId, id, a.revision, Number(this.reloj.hoy().slice(0, 4)), { consolidarCompras: null, partidas: [], seleccion: [] });
      return { cotizacionId: r.cotizacionId, folio: r.folio, repetida: r.repetida };
    } catch (e) {
      throw traducirErrorBase(e);
    }
  }
}
