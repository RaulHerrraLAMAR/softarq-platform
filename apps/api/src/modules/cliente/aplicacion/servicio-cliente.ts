/**
 * Casos de uso del cliente de la app (módulo 17, ADR-0021). Sin Nest ni HTTP.
 *
 * Propiedad y permisos:
 * - El cliente sale SIEMPRE de la base (`clienteDe`: cuenta, pertenencia y cliente activos con función exclusiva CLIENTE). Ningún
 *   identificador de cliente, organización, función o estado llega del teléfono. Un registro ajeno responde 404.
 * - Cada escritura pasa por una función de la base que vuelve a comprobarlo: una cuenta que pierde el acceso con la sesión abierta
 *   recibe 403 en la siguiente operación.
 *
 * Flujo: calcular (estimar) y enviar son acciones SEPARADAS. Estimar nunca envía; se puede enviar sin estimación. La estimación es
 * preliminar y no equivale a una cotización formal, aprobación ni emisión.
 */
import {
  EsquemaCotizacionComercial,
  EsquemaDocumentoCotizacion,
  ROTULO_ESTIMACION,
  type CapturaSolicitud,
  type DetalleCotizacionCliente,
  type EstadoSolicitud,
  type EstimacionCliente,
  type GuardarSolicitudCliente,
  type NuevaSolicitudCliente,
  type NuevoProyectoCliente,
  type ProyectoCliente,
  type RespuestaCotizacionesCliente,
  type RespuestaEnvioSolicitud,
  type RespuestaProyectosCliente,
  type RespuestaSolicitudesCliente,
  type RespuestaTrabajosCliente,
  type SolicitudDelCliente,
  type CotizacionResumenCliente,
} from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { RepositorioCatalogos } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { ErrorNegocio, traducirErrorBase } from "../../cotizaciones/aplicacion/errores.js";
import type { ServicioEmisiones } from "../../cotizaciones/aplicacion/servicio-emisiones.js";
import { sha256 } from "../../cotizaciones/dominio/huella.js";
import { nombresDeTrabajos, validarCaptura, type CampoInvalido, type CatalogoCliente } from "../dominio/captura.js";
import {
  RepositorioCliente,
  type EmisionResumenFila,
  type EstimacionFila,
  type Identidad,
  type ProyectoFila,
  type SolicitudFila,
} from "../infraestructura/repositorio-cliente.js";
import { armarCatalogo, type CatalogoArmado } from "./catalogo.js";
import { estimar, MENSAJE_MOTIVO, type MotivoSinEstimacion } from "./estimacion.js";

const NO_ENCONTRADO = () => new ErrorNegocio("NO_ENCONTRADO", "No encontramos ese registro en tu cuenta.");
const LIMITE_SOLICITUDES = 100;
const iso = (d: Date): string => d.toISOString();

export interface RelojInstanteCliente {
  ahora(): Date;
}

function aProyecto(p: ProyectoFila): ProyectoCliente {
  return { id: p.id, nombre: p.nombre, municipio: p.municipio, entidadFederativa: p.entidadFederativa, descripcion: p.descripcion };
}

/** Estado que ve el cliente: «cotizada» se deriva de que su cotización ya tenga una emisión. */
function estadoVisible(s: SolicitudFila, emision: EmisionResumenFila | undefined): EstadoSolicitud {
  return s.estado === "EN_PREPARACION" && emision ? "COTIZADA" : s.estado;
}

function resumenEmision(e: EmisionResumenFila, hoy: string): CotizacionResumenCliente {
  return {
    emisionId: e.emisionId,
    folio: e.folio,
    fechaEmision: e.fechaEmision,
    vigenteHasta: e.vigenteHasta,
    vigente: e.vigenteHasta >= hoy,
    total: e.total,
    proyecto: e.proyecto,
    solicitudFolio: e.solicitudFolio,
  };
}

/** Estimación para el cliente. Solo la proyección comercial: sin costos, referencias ni datos internos. */
export function aEstimacionCliente(e: EstimacionFila, revisionSolicitud: number): EstimacionCliente {
  const comercial = EsquemaCotizacionComercial.nullable().safeParse(e.comercial);
  const motivo = e.estado === "SIN_ESTIMACION" ? ((e.motivoCodigo ?? "NO_DISPONIBLE") as MotivoSinEstimacion) : null;
  return {
    id: e.id,
    numero: e.numero,
    estado: e.estado,
    rotulo: ROTULO_ESTIMACION,
    calculadaEn: iso(e.calculadaEn),
    fechaCalculo: e.fechaCalculo,
    revisionCaptura: e.revisionCaptura,
    desactualizada: e.revisionCaptura < revisionSolicitud,
    comercial: comercial.success ? comercial.data : null,
    motivo: motivo ? { codigo: motivo, mensaje: MENSAJE_MOTIVO[motivo] ?? MENSAJE_MOTIVO.NO_DISPONIBLE } : null,
    avisos: [],
  };
}

export class ServicioCliente {
  private readonly repo: RepositorioCliente;
  private readonly catalogos: RepositorioCatalogos;

  constructor(
    private readonly db: PrismaClient,
    private readonly reloj: Reloj,
    private readonly instante: RelojInstanteCliente,
    private readonly emisiones: Pick<ServicioEmisiones, "archivo">,
  ) {
    this.repo = new RepositorioCliente(db);
    this.catalogos = new RepositorioCatalogos(db);
  }

  /** Ejecuta una operación de la base traduciendo los códigos `SOFTARQ:*` a errores de negocio. */
  private async base<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (e) {
      throw traducirErrorBase(e);
    }
  }

  private async cliente(id: Identidad): Promise<string> {
    return this.base(() => this.repo.clienteDe(id));
  }

  private async catalogo(id: Identidad): Promise<CatalogoArmado> {
    return armarCatalogo(await this.repo.trabajos({ organizacionId: id.organizacionId }));
  }

  // ------------------------------- trabajos y proyectos -------------------------------

  async trabajos(id: Identidad): Promise<RespuestaTrabajosCliente> {
    await this.cliente(id);
    return { trabajos: (await this.catalogo(id)).trabajos };
  }

  async proyectos(id: Identidad): Promise<RespuestaProyectosCliente> {
    const cliente = await this.cliente(id);
    return { proyectos: (await this.repo.proyectos({ organizacionId: id.organizacionId }, cliente)).map(aProyecto) };
  }

  async crearProyecto(id: Identidad, d: NuevoProyectoCliente): Promise<ProyectoCliente> {
    const cliente = await this.cliente(id);
    const nuevo = await this.base(() => this.repo.crearProyecto(id, { nombre: d.nombre, municipio: d.municipio, entidadFederativa: d.entidadFederativa, descripcion: d.descripcion }));
    const p = await this.repo.proyecto({ organizacionId: id.organizacionId }, cliente, nuevo);
    if (!p) throw NO_ENCONTRADO();
    return aProyecto(p);
  }

  // ------------------------------- solicitudes -------------------------------

  async solicitudes(id: Identidad): Promise<RespuestaSolicitudesCliente> {
    const cliente = await this.cliente(id);
    const ctx = { organizacionId: id.organizacionId };
    const filas = await this.repo.solicitudes(ctx, cliente, LIMITE_SOLICITUDES);
    const { mapa } = armarCatalogo(await this.repo.trabajos(ctx), true);
    const emisiones = await this.repo.emisionesDeSolicitudes(ctx, cliente, filas.flatMap((f) => (f.cotizacionId ? [f.cotizacionId] : [])));
    const ultimas = await this.repo.ultimasEstimaciones(ctx, filas.map((f) => f.id));
    return {
      solicitudes: filas.map((f) => {
        const est = ultimas.get(f.id);
        const comercial = est && est.estado === "ESTIMADA" && est.revisionCaptura >= f.revision ? EsquemaCotizacionComercial.nullable().safeParse(est.comercial) : null;
        return {
          id: f.id,
          folio: f.folio,
          estado: estadoVisible(f, f.cotizacionId ? emisiones.get(f.cotizacionId) : undefined),
          proyecto: f.proyecto.nombre,
          trabajos: nombresDeTrabajos(f.captura, mapa),
          actualizadaEn: iso(f.actualizadaEn),
          totalEstimado: comercial?.success && comercial.data ? comercial.data.total : null,
        };
      }),
    };
  }

  async solicitud(id: Identidad, solicitudId: string): Promise<SolicitudDelCliente> {
    const cliente = await this.cliente(id);
    return this.armar(id, cliente, solicitudId);
  }

  /** Solicitud propia con su estimación y su cotización formal; 404 si no es del cliente. */
  private async armar(id: Identidad, cliente: string, solicitudId: string): Promise<SolicitudDelCliente> {
    const ctx = { organizacionId: id.organizacionId };
    const s = await this.repo.solicitud(ctx, cliente, solicitudId);
    if (!s) throw NO_ENCONTRADO();
    const { mapa } = armarCatalogo(await this.repo.trabajos(ctx));
    const est = await this.repo.ultimaEstimacion(ctx, s.id);
    const emision = s.cotizacionId ? (await this.repo.emisionesDeSolicitudes(ctx, cliente, [s.cotizacionId])).get(s.cotizacionId) : undefined;
    const editable = s.estado === "BORRADOR";
    const v = validarCaptura(s.captura, mapa);
    return {
      id: s.id,
      folio: s.folio,
      estado: estadoVisible(s, emision),
      proyecto: aProyecto(s.proyecto),
      captura: s.captura,
      revision: s.revision,
      creadaEn: iso(s.creadaEn),
      actualizadaEn: iso(s.actualizadaEn),
      enviadaEn: s.enviadaEn ? iso(s.enviadaEn) : null,
      editable,
      pendientes: editable ? [...v.errores, ...v.pendientes] : [],
      ultimaEstimacion: est ? aEstimacionCliente(est, s.revision) : null,
      cotizacionFormal: emision ? resumenEmision(emision, this.reloj.hoy()) : null,
    };
  }

  /** La captura debe ser válida (opciones existentes, medidas que corresponden y positivas); puede estar incompleta. */
  private exigirValida(captura: CapturaSolicitud, mapa: CatalogoCliente): void {
    const { errores } = validarCaptura(captura, mapa);
    if (errores.length > 0) throw new ErrorNegocio("VALOR_INVALIDO", "Revisa los datos de la solicitud.", { campos: errores.map(aCampo) });
  }

  async crearSolicitud(id: Identidad, s: NuevaSolicitudCliente): Promise<SolicitudDelCliente> {
    const cliente = await this.cliente(id);
    const { mapa } = await this.catalogo(id);
    this.exigirValida(s.captura, mapa);
    const anio = Number(this.reloj.hoy().slice(0, 4));
    const nueva = await this.base(() => this.repo.crearSolicitud(id, s.proyectoId, anio, s.captura));
    return this.armar(id, cliente, nueva);
  }

  async guardar(id: Identidad, solicitudId: string, g: GuardarSolicitudCliente): Promise<SolicitudDelCliente> {
    const cliente = await this.cliente(id);
    const { mapa } = await this.catalogo(id);
    this.exigirValida(g.captura, mapa);
    await this.base(() => this.repo.guardarSolicitud(id, solicitudId, g.revision, g.captura));
    return this.armar(id, cliente, solicitudId);
  }

  /** Estima la captura guardada en la revisión indicada. No envía nada. */
  async estimar(id: Identidad, solicitudId: string, revision: number): Promise<EstimacionCliente> {
    const cliente = await this.cliente(id);
    const ctx = { organizacionId: id.organizacionId };
    const s = await this.repo.solicitud(ctx, cliente, solicitudId);
    if (!s) throw NO_ENCONTRADO();
    if (s.estado !== "BORRADOR") throw new ErrorNegocio("SOLICITUD_NO_EDITABLE", "La solicitud ya se envió: no se vuelve a estimar.");
    if (s.revision !== revision) throw new ErrorNegocio("CONFLICTO_EDICION", "Hay cambios más recientes en tu solicitud; vuelve a abrirla.");
    const { mapa } = await this.catalogo(id);
    const v = validarCaptura(s.captura, mapa);
    if (v.errores.length > 0 || v.pendientes.length > 0) {
      throw new ErrorNegocio("SOLICITUD_INCOMPLETA", "Completa tu solicitud para poder estimarla.", { campos: [...v.errores, ...v.pendientes].map(aCampo) });
    }
    const referencias = await this.repo.referenciasActivas(ctx);
    const r = await estimar(this.catalogos, ctx, referencias, s.captura, mapa, this.reloj.hoy());
    const datos = {
      estado: r.estado,
      motivoCodigo: r.motivoCodigo,
      comercial: r.comercial,
      avisos: r.avisos,
      referencias: r.referencias,
      parametros: r.parametros,
      entrada: r.entrada,
      resultado: r.resultado,
      fechaCalculo: r.fechaCalculo,
    };
    const huella = sha256({ captura: s.captura, referencias: r.referencias, fechaCalculo: r.fechaCalculo, estado: r.estado, comercial: r.comercial });
    const nueva = await this.base(() => this.repo.registrarEstimacion(id, solicitudId, revision, datos, huella));
    const fila = await this.repo.ultimaEstimacion(ctx, solicitudId);
    if (!fila || fila.id !== nueva.id) throw new ErrorNegocio("CONFLICTO_EDICION", "Hay una estimación más reciente de tu solicitud.");
    return aEstimacionCliente(fila, s.revision);
  }

  /**
   * Envía la solicitud al equipo. Es idempotente: reintentar (doble toque, respuesta perdida) devuelve la solicitud ya enviada con
   * `repetida: true` y no repite el evento ni crea nada nuevo. Se puede enviar con o sin estimación, pero no con la captura incompleta.
   */
  async enviar(id: Identidad, solicitudId: string, revision: number): Promise<RespuestaEnvioSolicitud> {
    const cliente = await this.cliente(id);
    const ctx = { organizacionId: id.organizacionId };
    const s = await this.repo.solicitud(ctx, cliente, solicitudId);
    if (!s) throw NO_ENCONTRADO();
    if (s.estado === "BORRADOR") {
      const { mapa } = await this.catalogo(id);
      const v = validarCaptura(s.captura, mapa);
      if (v.errores.length > 0 || v.pendientes.length > 0) {
        throw new ErrorNegocio("SOLICITUD_INCOMPLETA", "Completa tu solicitud antes de enviarla.", { campos: [...v.errores, ...v.pendientes].map(aCampo) });
      }
    }
    const repetida = await this.base(() => this.repo.enviarSolicitud(id, solicitudId, revision));
    return { repetida, solicitud: await this.armar(id, cliente, solicitudId) };
  }

  async retirar(id: Identidad, solicitudId: string, motivo: string): Promise<SolicitudDelCliente> {
    const cliente = await this.cliente(id);
    await this.base(() => this.repo.retirarSolicitud(id, solicitudId, motivo));
    return this.armar(id, cliente, solicitudId);
  }

  // ------------------------------- cotizaciones emitidas -------------------------------

  /** Cotizaciones EMITIDAS vinculadas a su Cliente (incluidas las preparadas desde el panel). Nada de borradores ni versiones de trabajo. */
  async cotizaciones(id: Identidad): Promise<RespuestaCotizacionesCliente> {
    const cliente = await this.cliente(id);
    const hoy = this.reloj.hoy();
    return { cotizaciones: (await this.repo.emisionesDelCliente({ organizacionId: id.organizacionId }, cliente)).map((e) => resumenEmision(e, hoy)) };
  }

  async cotizacion(id: Identidad, emisionId: string): Promise<DetalleCotizacionCliente> {
    const cliente = await this.cliente(id);
    const e = await this.repo.emisionDelCliente({ organizacionId: id.organizacionId }, cliente, emisionId);
    if (!e) throw NO_ENCONTRADO();
    const doc = EsquemaDocumentoCotizacion.safeParse(e.contenido);
    if (!doc.success) throw new ErrorNegocio("DOCUMENTO_NO_DISPONIBLE", "No pudimos mostrar esta cotización. Avisa al equipo.");
    const d = doc.data;
    // Proyección comercial: sin las personas que la prepararon, aprobaron y emitieron, sin identificadores internos ni leyenda técnica.
    const comercial = {
      ambiente: d.ambiente,
      moneda: d.moneda,
      leyenda: d.ambiente === "DEMO" ? "DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL" : null,
      partidas: d.partidas,
      subtotal: d.subtotal,
      impuesto: d.impuesto,
      total: d.total,
    };
    return { ...resumenEmision(e, this.reloj.hoy()), comercial };
  }

  /** PDF emitido: los mismos bytes registrados, solo si la emisión es de una cotización del cliente. */
  async documento(id: Identidad, emisionId: string) {
    const cliente = await this.cliente(id);
    const e = await this.repo.emisionDelCliente({ organizacionId: id.organizacionId }, cliente, emisionId);
    if (!e) throw NO_ENCONTRADO();
    return this.emisiones.archivo({ organizacionId: id.organizacionId }, emisionId);
  }

  /** Instante de servidor (para respuestas y pruebas). */
  ahora(): Date {
    return this.instante.ahora();
  }
}

const aCampo = (c: CampoInvalido) => ({ ruta: c.ruta, mensaje: c.mensaje });
