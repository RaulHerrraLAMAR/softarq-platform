/**
 * Vista previa PDF marcada BORRADOR (módulo 15, ADR-0019; B-25). Reglas y composición en
 * `dominio/vista-previa.ts`.
 *
 * - Genera el PDF en memoria con el generador comercial existente: no lo guarda en la carpeta de
 *   documentos ni crea una emisión, no consume folios y no cambia estados ni versiones.
 * - Única escritura: la auditoría VISTA_PREVIA (bitácora), solo cuando la generación terminó bien y
 *   una sola vez por clave de idempotencia (un reintento devuelve el documento sin otro evento).
 * - La comprobación del cálculo recalcula en memoria SOLO para comparar con la entrada guardada
 *   (BL-16), dentro de una lectura READ ONLY; los importes del documento son los de la versión.
 */
import { EsquemaDocumentoBorrador, type CotizacionComercial } from "@softarq/contracts";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { calcularSolicitud } from "../../calculo/aplicacion/calculo-demo.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { VERSION_MOTOR } from "../../calculo/domain/version-motor.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { ErrorGeneracionPdf, type GeneradorPdf } from "../dominio/pdf/generador-pdf.js";
import { bl16, problemasDeFaltantes, type Problema } from "../dominio/verificacion.js";
import { bloqueosEstadoVistaPrevia, construirDocumentoBorrador } from "../dominio/vista-previa.js";
import { RepositorioCotizaciones, ubicacionDe, type Autor } from "../infraestructura/repositorio-cotizaciones.js";
import { RepositorioEmisiones } from "../infraestructura/repositorio-emisiones.js";
import { RepositorioRevisiones } from "../infraestructura/repositorio-revisiones.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "./errores.js";
import { prepararIdempotencia, reproducible } from "./idempotencia.js";
import type { RelojInstante } from "./servicio-clientes.js";

const NO_ENCONTRADA = () => new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");

export class ServicioVistaPrevia {
  private readonly repo: RepositorioCotizaciones;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: Reloj,
    private readonly instante: RelojInstante,
    private readonly generador: GeneradorPdf,
  ) {
    this.repo = new RepositorioCotizaciones(prisma);
  }

  async generar(
    ctx: ContextoOrganizacion,
    actor: Autor,
    cotizacionId: string,
    numero: number,
    clave: string,
  ): Promise<{ pdf: Buffer; nombre: string; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const hoy = this.reloj.hoy();
    const idem = prepararIdempotencia(clave, "vista_previa", { cotizacionId, numero: String(numero) }, {}, ahora);
    const previo = await this.repo.buscarIdempotencia(ctx, actor, idem.clave);
    let reproducida = false;
    if (previo) {
      reproducible(previo, idem, ahora);
      reproducida = true;
    }

    // Estado de la versión (lecturas planas, fuera de la transacción: ver HANDOFF §6, relaciones
    // anidadas dentro de `$transaction`).
    const v = await this.repo.obtenerVersion(ctx, cotizacionId, numero);
    if (!v) throw NO_ENCONTRADA();

    const r = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const q = await tx.cotizacion.findFirst({
          where: { organizacionId: ctx.organizacionId, id: cotizacionId },
          select: {
            folio: true,
            estadoFolio: true,
            borrador: { select: { revision: true } },
            proyecto: {
              select: {
                codigo: true,
                nombre: true,
                municipio: true,
                entidadFederativa: true,
                descripcion: true,
                cliente: { select: { codigo: true, nombre: true, contactoNombre: true, contactoTelefono: true, contactoCorreo: true } },
              },
            },
          },
        });
        if (!q?.borrador) return null;
        const bloqueos: Problema[] = bloqueosEstadoVistaPrevia({
          idVersion: v.resumen.idVersion,
          estado: v.resumen.estado,
          esUltima: v.resumen.esUltima,
          folioActivo: q.estadoFolio === "ACTIVO",
          revisionBorradorVersion: v.resumen.revisionBorrador,
          revisionBorrador: q.borrador.revision,
        });
        if (bloqueos.length > 0) return { bloqueos } as const;

        // ¿El motor reproduce la entrada guardada con el catálogo y los parámetros de hoy? (BL-16)
        const rv = await new RepositorioRevisiones(tx).versionParaVerificar(ctx, cotizacionId, numero);
        if (!rv) return null;
        const catalogos = new RepositorioCatalogos(tx);
        const calculo = await calcularSolicitud(catalogos, ctx, rv.solicitudCalculo, hoy);
        let entradaActual = null;
        if (calculo.estado === "BLOQUEADO") bloqueos.push(...calculo.problemas);
        else if (calculo.estado === "NO_ENCONTRADO") bloqueos.push(...problemasDeFaltantes(calculo.faltantes));
        else if (calculo.estado === "ENTRADA_INVALIDA") {
          bloqueos.push({ codigo: "BL-16", referencia: "captura", mensaje: "La captura de esta versión ya no se puede calcular con las reglas vigentes." });
        } else entradaActual = calculo.entrada;
        bloqueos.push(...bl16(rv.entradaCalculo, rv.versionMotor, entradaActual, VERSION_MOTOR));
        if (bloqueos.length > 0) return { bloqueos } as const;

        const parametros = await catalogos.obtenerParametros(ctx);
        const emisor = await new RepositorioEmisiones(tx).obtenerEmisor(ctx);
        return { q, parametros, emisor } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000, maxWait: 10_000 },
    );
    if (!r) throw NO_ENCONTRADA();
    if ("bloqueos" in r) {
      throw new ErrorNegocio(
        "VISTA_PREVIA_BLOQUEADA",
        "No se generó la vista previa: el cálculo de esta versión no está vigente o su estado no la admite.",
        { problemas: r.bloqueos.map((p) => ({ codigo: p.codigo, referencia: p.referencia, mensaje: p.mensaje })) },
      );
    }

    const p = r.q.proyecto;
    const aprobada = v.resumen.estado === "APROBADA" ? (v.resumen.revisionVigente?.resueltaPor ?? null) : null;
    const documento = EsquemaDocumentoBorrador.parse(
      construirDocumentoBorrador({
        ambiente: r.parametros?.ambiente ?? "DEMO",
        folio: v.folio,
        numero: v.resumen.numero,
        fechaCalculo: v.resumen.fechaCalculo,
        fechaGeneracion: hoy,
        comercial: v.cotizacion as CotizacionComercial,
        textos: v.captura.textos ?? null,
        emisor: r.emisor
          ? {
              nombre: r.emisor.nombre,
              domicilio: r.emisor.domicilio,
              telefono: r.emisor.telefono,
              correo: r.emisor.correo,
              logo: r.emisor.logoClave === "DEMO" ? "DEMO" : null,
            }
          : null,
        cliente: { ...p.cliente },
        proyecto: { codigo: p.codigo, nombre: p.nombre, ubicacion: ubicacionDe(p.municipio, p.entidadFederativa), descripcion: p.descripcion },
        vigenciaDias: r.parametros?.vigenciaDias ?? null,
        preparo: v.resumen.autor,
        aprobo: aprobada,
      }),
    );
    let pdf: Buffer;
    try {
      pdf = await this.generador(documento);
    } catch (e) {
      if (e instanceof ErrorGeneracionPdf) throw new ErrorNegocio("DOCUMENTO_NO_GENERADO", e.message);
      throw e;
    }

    // Auditoría (B-25, `Bit_Registrar "VISTA_PREVIA"`), solo tras generar correctamente.
    if (!reproducida) {
      try {
        await this.repo.registrarVistaPrevia(ctx, actor, cotizacionId, v.resumen.id, idem);
      } catch (e) {
        if (reconocerErrorBase(e)?.tipo !== "idempotencia_repetida") throw traducirErrorBase(e);
        const otro = await this.repo.buscarIdempotencia(ctx, actor, idem.clave);
        if (!otro) throw e;
        reproducible(otro, idem, ahora);
        reproducida = true;
      }
    }
    return { pdf, nombre: `${v.resumen.idVersion}-BORRADOR.pdf`, reproducida };
  }
}
