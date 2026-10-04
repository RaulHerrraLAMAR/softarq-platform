/**
 * Cotizaciones con folio, borrador y versiones (ADR-0008). Capa de aplicación: sin Nest ni HTTP.
 *
 * «Calcular y guardar versión» (§5):
 * - Fase A, lectura coherente: UNA transacción REPEATABLE READ y READ ONLY lee el borrador (en la
 *   revisión pedida), la cotización, cliente, proyecto, la versión anterior y todos los catálogos
 *   con el ensamblador existente, y calcula con el motor en memoria. Una sola instantánea: nunca
 *   se mezclan precios o parámetros leídos en momentos distintos. Al ser de solo lectura, su
 *   COMMIT no escribe WAL (evita los COMMIT lentos observados en el módulo 5).
 * - Fase B, escritura atómica: UNA sentencia (`softarq_crear_version`) que comprueba que el
 *   borrador sigue en esa revisión, asigna el número con UPDATE … RETURNING, guarda la instantánea
 *   de la fase A con su evento y registra la clave de idempotencia. Si otra versión se creó entre
 *   las dos fases (VERSION_CONCURRENTE), se repite la fase A.
 * Ninguna transacción queda abierta mientras el usuario interactúa. Un cálculo bloqueado o una
 * captura incompleta no escribe ninguna versión.
 */
import {
  CAPTURA_BORRADOR_VACIA,
  LIMITES_API,
  LIMITES_COTIZACIONES,
  type CapturaBorrador,
  type ConsultaCotizaciones,
  type DescarteCotizacion,
  type ReferenciasBorrador,
  type DetalleCotizacion,
  type RespuestaBorradorGuardado,
  type RespuestaCotizaciones,
  type SolicitudBorrador,
  type SolicitudCotizacion,
  type SolicitudVersion,
  type Version,
} from "@softarq/contracts";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { calcularSolicitud } from "../../calculo/aplicacion/calculo-demo.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { VERSION_MOTOR } from "../../calculo/domain/version-motor.js";
import {
  RepositorioCatalogos,
  type ContextoOrganizacion,
} from "../../catalogos/persistencia/repositorio-catalogos.js";
import { aSolicitudCalculo, evaluarCompletitud, type ConceptoParaCaptura } from "../dominio/borrador.js";
import { huellaReferencia, sha256 } from "../dominio/huella.js";
import { codigosReferenciados, evaluarReferencias, referenciasNuevasInvalidas } from "../dominio/referencias.js";
import { resumirCambios } from "../dominio/resumen-cambios.js";
import { conTextosIniciales, textosPredeterminados } from "../dominio/textos.js";
import { RepositorioEmisiones } from "../infraestructura/repositorio-emisiones.js";
import { RepositorioRevisiones } from "../infraestructura/repositorio-revisiones.js";
import {
  RepositorioCotizaciones,
  ubicacionDe,
  type Autor,
  type DatosVersion,
  type VersionGuardada,
} from "../infraestructura/repositorio-cotizaciones.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "./errores.js";
import { ejecutarIdempotente, prepararIdempotencia, reproducible } from "./idempotencia.js";
import type { RelojInstante } from "./servicio-clientes.js";

/** Tiempo máximo de la fase A (lectura y cálculo). Medición real en ADR-0008 §5. */
export const TIEMPO_MAXIMO_FASE_A_MS = 15_000;
const ESPERA_MAXIMA_CONEXION_MS = 10_000;
/** Con N versiones simultáneas de la misma cotización, cada ronda confirma al menos una. */
const INTENTOS_VERSION = 5;

export interface AutorConNombre extends Autor {
  readonly nombre: string;
}

/** Observador opcional de tiempos (las pruebas lo usan para medir las fases). */
export type MedidorTiempos = (fase: "A" | "B", ms: number) => void;

type ResultadoFaseA =
  | { estado: "LISTA"; datos: DatosVersion; numeroAnterior: number }
  | { estado: "BLOQUEADO"; problemas: { codigo: string; referencia: string; mensaje: string }[] }
  | { estado: "INCOMPLETA"; campos: { ruta: string; mensaje: string }[] };

const NO_ENCONTRADO = () => new ErrorNegocio("NO_ENCONTRADO", "La cotización no existe en su organización.");

/** Conceptos de la captura con los datos que necesita la completitud (cualquier estado: BL-04 lo decide el ensamblador). */
export async function conceptosParaCaptura(
  catalogos: RepositorioCatalogos,
  ctx: ContextoOrganizacion,
  captura: CapturaBorrador,
): Promise<Map<string, ConceptoParaCaptura>> {
  const codigos = [...new Set(captura.partidas.flatMap((p) => (p.tipo === "CONCEPTO" ? [p.conceptoCodigo] : [])))];
  const conceptos = codigos.length > 0 ? await catalogos.obtenerConceptos(ctx, codigos) : [];
  return new Map(
    conceptos.map((c) => [
      c.codigo,
      { tipoFormula: c.tipoFormula, insumos: [...new Set(c.componentes.filter((k) => k.activo).map((k) => k.insumoCodigo))] },
    ]),
  );
}

export class ServicioCotizaciones {
  private readonly repo: RepositorioCotizaciones;
  private readonly catalogos: RepositorioCatalogos;
  private readonly revisiones: RepositorioRevisiones;
  private readonly emisiones: RepositorioEmisiones;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: Reloj,
    private readonly relojInstante: RelojInstante,
    private readonly medir: MedidorTiempos = () => {},
  ) {
    this.repo = new RepositorioCotizaciones(prisma);
    this.catalogos = new RepositorioCatalogos(prisma);
    this.revisiones = new RepositorioRevisiones(prisma);
    this.emisiones = new RepositorioEmisiones(prisma);
  }

  async listar(ctx: ContextoOrganizacion, c: ConsultaCotizaciones): Promise<RespuestaCotizaciones> {
    const limite = c.limite ?? LIMITES_API.limiteListadoPorOmision;
    const cotizaciones = await this.repo.listarCotizaciones(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.clienteId !== undefined ? { clienteId: c.clienteId } : {}),
      ...(c.proyectoId !== undefined ? { proyectoId: c.proyectoId } : {}),
      limite,
    });
    return { cotizaciones, limite };
  }

  async detalle(ctx: ContextoOrganizacion, id: string): Promise<DetalleCotizacion> {
    const d = await this.repo.obtenerCotizacion(ctx, id, LIMITES_COTIZACIONES.eventosRecientes);
    if (!d) throw NO_ENCONTRADO();
    const conceptos = await conceptosParaCaptura(this.catalogos, ctx, d.borrador.captura);
    return {
      ...d,
      descartar: descartePermitido(d),
      revisiones: await this.revisiones.historialDeCotizacion(ctx, id),
      borrador: {
        ...d.borrador,
        textosPredeterminados: textosPredeterminados(await this.emisiones.ambiente(ctx)),
        completitud: evaluarCompletitud(d.borrador.captura, conceptos),
        referencias: await this.referencias(ctx, d.borrador.captura),
      },
    };
  }

  /**
   * Descartar la cotización (B-37, adaptado al folio; ADR-0010): con motivo, solo un Preparador y
   * solo si no hay emisiones, revisión pendiente ni aprobación vigente. El folio, las versiones y
   * los eventos se conservan; el folio no se reutiliza.
   */
  async descartar(
    ctx: ContextoOrganizacion,
    autor: Autor,
    id: string,
    s: DescarteCotizacion,
    clave: string,
  ): Promise<{ detalle: DetalleCotizacion; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "descartar_cotizacion", { cotizacionId: id }, s, ahora);
    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (previo) return { detalle: await this.detalle(ctx, reproducible(previo, idem, ahora)), reproducida: true };

    const d = await this.repo.obtenerCotizacion(ctx, id, 0);
    if (!d) throw NO_ENCONTRADO();
    const permiso = descartePermitido(d);
    if (!permiso.permitido) {
      throw new ErrorNegocio("DESCARTE_BLOQUEADO", permiso.motivoNoPermitido ?? "El estado no permite descartar la cotización.");
    }
    try {
      await this.emisiones.descartar(ctx, autor, id, s.motivo, idem);
    } catch (e) {
      const r = reconocerErrorBase(e);
      if (r?.tipo === "idempotencia_repetida") {
        const otro = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
        if (otro) return { detalle: await this.detalle(ctx, reproducible(otro, idem, ahora)), reproducida: true };
      }
      if (r?.tipo === "negocio") {
        const motivos: Record<string, string> = {
          DESCARTE_EMITIDA: "Tiene una versión emitida: no se descarta (el documento emitido se conserva).",
          DESCARTE_APROBADA: "Tiene una aprobación vigente: un Revisor debe anularla antes de descartar.",
          REVISION_PENDIENTE: "Hay una versión en revisión: retírela antes de descartar.",
          FOLIO_NO_ACTIVO: "La cotización ya está descartada.",
          MOTIVO_REQUERIDO: "Indique el motivo del descarte.",
        };
        if (motivos[r.codigo]) throw new ErrorNegocio("DESCARTE_BLOQUEADO", motivos[r.codigo]!);
        if (r.codigo === "SIN_PERMISO") throw new ErrorNegocio("SIN_PERMISO", "Su pertenencia ya no tiene la función necesaria para descartar.");
      }
      throw traducirErrorBase(e);
    }
    return { detalle: await this.detalle(ctx, id), reproducida: false };
  }

  /** Disponibilidad hoy de las referencias de una captura (solo lectura; la captura no cambia). */
  private async referencias(ctx: ContextoOrganizacion, captura: CapturaBorrador): Promise<ReferenciasBorrador> {
    const cods = codigosReferenciados(captura);
    const [conceptos, precios, tiposAdicional] = await Promise.all([
      cods.conceptos.length > 0 ? this.catalogos.obtenerConceptos(ctx, cods.conceptos) : [],
      cods.precios.length > 0 ? this.catalogos.obtenerPrecios(ctx, cods.precios) : [],
      cods.tiposAdicional.length > 0 ? this.catalogos.obtenerTiposAdicional(ctx, cods.tiposAdicional) : [],
    ]);
    return evaluarReferencias(captura, { conceptos, precios, tiposAdicional }, this.reloj.hoy());
  }

  async crear(
    ctx: ContextoOrganizacion,
    autor: Autor,
    s: SolicitudCotizacion,
    clave: string,
  ): Promise<{ detalle: DetalleCotizacion; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "crear_cotizacion", {}, s, ahora);
    // Año del folio: el de la fecha civil del servidor (zona configurada), como Year(Hoy()) del libro.
    const anio = Number(this.reloj.hoy().slice(0, 4));
    // La validación va dentro del alta: una reproducción idempotente devuelve lo ya creado.
    const r = await ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
      // Captura inicial (p. ej. desde la calculadora): todas sus referencias son nuevas.
      if (s.captura) {
        const invalidas = referenciasNuevasInvalidas(s.captura, CAPTURA_BORRADOR_VACIA, await this.referencias(ctx, s.captura));
        if (invalidas.length > 0) {
          throw new ErrorNegocio(
            "REFERENCIA_NO_DISPONIBLE",
            "La cotización no se creó: la captura tiene referencias que no existen o no están disponibles hoy.",
            { campos: invalidas.map((x) => ({ ...x, ruta: `captura.${x.ruta}` })) },
          );
        }
      }
      // Textos de la versión (BL-20): se COPIAN los predeterminados del ambiente si la captura no
      // trae los suyos; después son del borrador y el Preparador los edita.
      const inicial = conTextosIniciales(s.captura ?? CAPTURA_BORRADOR_VACIA, textosPredeterminados(await this.emisiones.ambiente(ctx)));
      return this.repo.crearCotizacion(ctx, autor, s.proyectoId, anio, inicial, idem);
    });
    return { detalle: await this.detalle(ctx, r.id), reproducida: r.reproducida };
  }

  async guardarBorrador(
    ctx: ContextoOrganizacion,
    autor: Autor,
    id: string,
    s: SolicitudBorrador,
  ): Promise<RespuestaBorradorGuardado> {
    // Referencias nuevas: deben estar disponibles hoy. Las ya guardadas en la revisión sobre la
    // que se editó se conservan aunque hayan dejado de estarlo (el usuario decide quitarlas).
    // Si la revisión ya no es esa, se omite: la sentencia de guardado responderá el conflicto.
    const previo = await this.repo.obtenerBorrador(ctx, id);
    if (!previo) throw NO_ENCONTRADO();
    if (previo.revision === s.revision) {
      const invalidas = referenciasNuevasInvalidas(s.captura, previo.captura, await this.referencias(ctx, s.captura));
      if (invalidas.length > 0) {
        throw new ErrorNegocio(
          "REFERENCIA_NO_DISPONIBLE",
          "El borrador no se guardó: hay referencias nuevas que no existen o no están disponibles hoy.",
          { campos: invalidas },
        );
      }
    }
    try {
      await this.repo.guardarBorrador(ctx, autor, id, s.revision, s.captura);
    } catch (e) {
      const r = reconocerErrorBase(e);
      if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_EDICION") {
        const actual = await this.repo.obtenerBorrador(ctx, id);
        if (actual) {
          throw new ErrorNegocio(
            "CONFLICTO_EDICION",
            `El borrador cambió: ${actual.actualizadoPor} guardó la revisión ${actual.revision}. Sus cambios no se perdieron; compárelos o recargue.`,
            { actual },
          );
        }
      }
      throw traducirErrorBase(e);
    }
    const b = await this.repo.obtenerBorrador(ctx, id);
    if (!b) throw NO_ENCONTRADO();
    const conceptos = await conceptosParaCaptura(this.catalogos, ctx, b.captura);
    return {
      revision: b.revision,
      actualizadoPor: b.actualizadoPor,
      actualizadoEn: b.actualizadoEn,
      completitud: evaluarCompletitud(b.captura, conceptos),
      referencias: await this.referencias(ctx, b.captura),
    };
  }

  async consultarVersion(ctx: ContextoOrganizacion, id: string, numero: number): Promise<Version> {
    const v = await this.repo.obtenerVersion(ctx, id, numero);
    if (!v) throw new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");
    return aVersion(v);
  }

  async crearVersion(
    ctx: ContextoOrganizacion,
    autor: AutorConNombre,
    id: string,
    s: SolicitudVersion,
    clave: string,
  ): Promise<{ version: Version; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "crear_version", { cotizacionId: id }, s, ahora);
    const reproducir = async (versionId: string) => {
      const ref = await this.repo.idDeVersion(ctx, versionId);
      if (!ref) throw NO_ENCONTRADO();
      return { version: await this.consultarVersion(ctx, ref.cotizacionId, ref.numero), reproducida: true };
    };

    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (previo) return reproducir(reproducible(previo, idem, ahora));

    for (let intento = 1; ; intento++) {
      const a = await this.faseA(ctx, autor, id, s);
      if (a.estado === "INCOMPLETA") {
        throw new ErrorNegocio(
          "CAPTURA_INCOMPLETA",
          "La captura está incompleta: no se guardó ninguna versión. Complete los datos señalados.",
          { campos: a.campos },
        );
      }
      if (a.estado === "BLOQUEADO") {
        await this.repo.registrarEvento(ctx, autor, "cotizacion", id, "CALCULO_BLOQUEADO", {
          revisionBorrador: s.revisionBorrador,
          codigos: [...new Set(a.problemas.map((p) => p.codigo))],
        });
        throw new ErrorNegocio(
          "CALCULO_BLOQUEADO",
          "El cálculo está bloqueado por reglas de negocio: no se guardó ninguna versión.",
          { problemas: a.problemas },
        );
      }
      const inicioB = performance.now();
      try {
        const r = await this.repo.crearVersion(ctx, autor, id, s.revisionBorrador, a.numeroAnterior, a.datos, idem);
        this.medir("B", performance.now() - inicioB);
        return { version: await this.consultarVersion(ctx, id, r.numero), reproducida: false };
      } catch (e) {
        const r = reconocerErrorBase(e);
        if (r?.tipo === "idempotencia_repetida") {
          const otro = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
          if (otro) return reproducir(reproducible(otro, idem, ahora));
        }
        if (r?.tipo === "negocio") {
          if (r.codigo === "VERSION_CONCURRENTE") {
            if (intento < INTENTOS_VERSION) continue;
            throw new ErrorNegocio("CONFLICTO_EDICION", "Se guardaron otras versiones al mismo tiempo; vuelva a intentarlo.");
          }
          if (r.codigo === "CLIENTE_INACTIVO" || r.codigo === "PROYECTO_INACTIVO") {
            throw new ErrorNegocio("CALCULO_BLOQUEADO", "El cálculo está bloqueado por reglas de negocio: no se guardó ninguna versión.", {
              problemas: [problemaInactivo(r.codigo === "CLIENTE_INACTIVO" ? "BL-01" : "BL-02", a.datos)],
            });
          }
        }
        throw traducirErrorBase(e);
      }
    }
  }

  private async faseA(
    ctx: ContextoOrganizacion,
    autor: AutorConNombre,
    id: string,
    s: SolicitudVersion,
  ): Promise<ResultadoFaseA> {
    const inicio = performance.now();
    const r = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const repo = new RepositorioCotizaciones(tx);
        const catalogos = new RepositorioCatalogos(tx);
        const d = await repo.leerParaVersion(ctx, id);
        if (!d) return null;
        if (d.borrador.revision !== s.revisionBorrador) return "DESACTUALIZADO" as const;

        const problemas: { codigo: string; referencia: string; mensaje: string }[] = [];
        if (!d.cliente.activo) {
          problemas.push({ codigo: "BL-01", referencia: d.cliente.codigo, mensaje: `El cliente ${d.cliente.codigo} está inactivo.` });
        }
        if (!d.proyecto.activo) {
          problemas.push({ codigo: "BL-02", referencia: d.proyecto.codigo, mensaje: `El proyecto ${d.proyecto.codigo} está inactivo.` });
        }
        if (problemas.length > 0) return { estado: "BLOQUEADO", problemas } satisfies ResultadoFaseA;

        const conceptos = await conceptosParaCaptura(catalogos, ctx, d.borrador.captura);
        const completitud = evaluarCompletitud(d.borrador.captura, conceptos);
        if (!completitud.lista) return { estado: "INCOMPLETA", campos: completitud.pendientes } satisfies ResultadoFaseA;

        const solicitud = aSolicitudCalculo(d.borrador.captura, conceptos);
        const fechaCalculo = this.reloj.hoy();
        const calculo = await calcularSolicitud(catalogos, ctx, solicitud, fechaCalculo);
        switch (calculo.estado) {
          case "BLOQUEADO":
            return { estado: "BLOQUEADO", problemas: calculo.problemas } satisfies ResultadoFaseA;
          case "ENTRADA_INVALIDA":
            return { estado: "INCOMPLETA", campos: calculo.campos } satisfies ResultadoFaseA;
          case "NO_ENCONTRADO":
            return {
              estado: "INCOMPLETA",
              campos: calculo.faltantes.map((f) => ({
                ruta: f.tipo === "precio" ? "seleccion" : "partidas",
                mensaje: `No existe ${f.tipo} ${f.codigo} en el catálogo vigente; elija de nuevo.`,
              })),
            } satisfies ResultadoFaseA;
          case "CALCULADO":
            break;
        }

        const ubicacion = ubicacionDe(d.proyecto.municipio, d.proyecto.entidadFederativa);
        const descriptivos = {
          clienteNombre: d.cliente.nombre,
          proyectoNombre: d.proyecto.nombre,
          proyectoUbicacion: ubicacion,
          proyectoDescripcion: d.proyecto.descripcion,
        };
        const referencia = huellaReferencia(calculo.entrada).toString("hex");
        const comercial = calculo.respuesta.cotizacion;
        const datos: DatosVersion = {
          captura: d.borrador.captura,
          solicitudCalculo: solicitud,
          entradaCalculo: calculo.entrada,
          resultadoInterno: calculo.resultado,
          proyeccionComercial: comercial,
          avisos: calculo.respuesta.avisos,
          total: comercial.total,
          fechaCalculo,
          versionMotor: VERSION_MOTOR,
          huellaCalculo: sha256({ entrada: calculo.entrada, resultado: calculo.resultado }).toString("hex"),
          huellaReferencia: referencia,
          clienteCodigo: d.cliente.codigo,
          clienteNombre: d.cliente.nombre,
          proyectoCodigo: d.proyecto.codigo,
          proyectoNombre: d.proyecto.nombre,
          proyectoUbicacion: ubicacion,
          proyectoDescripcion: d.proyecto.descripcion,
          autorNombre: autor.nombre,
          motivo: s.motivo ?? null,
          resumenCambios: resumirCambios(
            d.anterior
              ? {
                  numero: d.anterior.numero,
                  captura: d.anterior.captura,
                  comercial: d.anterior.comercial,
                  huellaReferenciaHex: d.anterior.huellaReferenciaHex,
                  descriptivos: {
                    clienteNombre: d.anterior.clienteNombre,
                    proyectoNombre: d.anterior.proyectoNombre,
                    proyectoUbicacion: d.anterior.proyectoUbicacion,
                    proyectoDescripcion: d.anterior.proyectoDescripcion,
                  },
                }
              : null,
            { captura: d.borrador.captura, comercial, huellaReferenciaHex: referencia, descriptivos },
          ),
        };
        return { estado: "LISTA", datos, numeroAnterior: d.ultimaVersion } satisfies ResultadoFaseA;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: TIEMPO_MAXIMO_FASE_A_MS,
        maxWait: ESPERA_MAXIMA_CONEXION_MS,
      },
    );
    this.medir("A", performance.now() - inicio);
    if (r === null) throw NO_ENCONTRADO();
    if (r === "DESACTUALIZADO") {
      const actual = await this.repo.obtenerBorrador(ctx, id);
      throw new ErrorNegocio(
        "BORRADOR_DESACTUALIZADO",
        "El borrador cambió después de la revisión indicada: no se guardó ninguna versión. Guarde o recargue antes de calcular.",
        actual ? { actual } : {},
      );
    }
    return r;
  }
}

type CotizacionLeida = NonNullable<Awaited<ReturnType<RepositorioCotizaciones["obtenerCotizacion"]>>>;

/** ¿El estado permite descartar? (no se eluden revisiones pendientes ni aprobaciones vigentes). */
function descartePermitido(d: CotizacionLeida): { permitido: boolean; motivoNoPermitido: string | null } {
  const no = (motivo: string) => ({ permitido: false, motivoNoPermitido: motivo });
  if (d.cotizacion.estadoFolio !== "ACTIVO") return no("La cotización ya está descartada.");
  if (d.versiones.some((v) => v.emision)) return no("Tiene una versión emitida: no se descarta (el documento emitido se conserva).");
  const pendiente = d.versiones.find((v) => v.revisionVigente?.estado === "PENDIENTE");
  if (pendiente) return no(`La versión v${pendiente.numero} está en revisión: retírela antes de descartar.`);
  const aprobada = d.versiones.find((v) => v.revisionVigente?.estado === "APROBADA" && !v.revisionVigente.anulacion);
  if (aprobada) return no(`La versión v${aprobada.numero} está aprobada: un Revisor debe anular la aprobación antes de descartar.`);
  return { permitido: true, motivoNoPermitido: null };
}

function problemaInactivo(codigo: "BL-01" | "BL-02", d: DatosVersion) {
  return codigo === "BL-01"
    ? { codigo, referencia: d.clienteCodigo, mensaje: `El cliente ${d.clienteCodigo} está inactivo.` }
    : { codigo, referencia: d.proyectoCodigo, mensaje: `El proyecto ${d.proyectoCodigo} está inactivo.` };
}

function aVersion(v: VersionGuardada): Version {
  return {
    folio: v.folio,
    origen: "WEB_DEMO",
    version: v.resumen,
    cliente: v.cliente,
    proyecto: v.proyecto,
    versionMotor: v.versionMotor,
    huellaCalculo: v.huellaCalculo,
    captura: v.captura,
    cotizacion: v.cotizacion,
    avisos: v.avisos,
    cambios: v.cambios,
  };
}
