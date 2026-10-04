/**
 * Emisión de versiones aprobadas, PDF y emisor (módulo 8, ADR-0010). Capa de aplicación: sin Nest
 * ni HTTP.
 *
 * Emitir sigue el esquema de ADR-0008 §6, ampliado con el archivo (la base y el disco no comparten
 * transacción):
 * 1. atajo de idempotencia (una clave ya usada reproduce la emisión registrada, mismos bytes);
 *    en el mismo proceso, una misma clave en vuelo espera a la primera (doble clic);
 * 2. fase A de solo lectura: verificación vigente del módulo 7 con la fecha de emisión y las
 *    reglas propias de la emisión (BL-01, 02, 15, 17, 19 y 20); si hay bloqueos, 422 y nada cambia;
 * 3. generación del PDF en memoria (sin transacción abierta) desde la estructura comercial;
 * 4. archivo temporal → validado → hash → nombre definitivo sin sobrescribir;
 * 5. UNA sentencia (`softarq_emitir_version`) que vuelve a comprobarlo todo con las filas
 *    bloqueadas y registra la emisión con tamaño y SHA-256. Si falla, se borra el archivo creado.
 * Solo después del paso 5 se responde éxito.
 */
import { randomUUID } from "node:crypto";
import type {
  CotizacionComercial,
  DetalleEmision,
  DocumentoCotizacion,
  EdicionEmisor,
  Emisor,
  FechaISO,
  FuncionUsuario,
  SolicitudEmision,
  TextosCotizacion,
  ValidacionEmision,
} from "@softarq/contracts";
import { EsquemaCapturaBorrador, EsquemaDocumentoCotizacion } from "@softarq/contracts";
import { existsSync } from "node:fs";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { cr16VigenteHasta } from "../../calculo/domain/vigencias.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { bl01, bl02, bl15, bl17, bl19, construirDocumento, faltantesEmisor, puedeEmitirPersona, PLANTILLA_PDF } from "../dominio/emision.js";
import { ErrorGeneracionPdf, LOGOS, type GeneradorPdf } from "../dominio/pdf/generador-pdf.js";
import { bl20 } from "../dominio/textos.js";
import type { Problema } from "../dominio/verificacion.js";
import { ErrorDocumento, claveDeEmision, type AlmacenDocumentos } from "../infraestructura/almacen-documentos.js";
import { RepositorioCotizaciones } from "../infraestructura/repositorio-cotizaciones.js";
import { RepositorioEmisiones, aResumenEmision, nombreArchivo } from "../infraestructura/repositorio-emisiones.js";
import { ErrorNegocio, reconocerErrorBase } from "./errores.js";
import { prepararIdempotencia, reproducible } from "./idempotencia.js";
import type { RelojInstante } from "./servicio-clientes.js";
import type { Actor, ServicioRevisiones } from "./servicio-revisiones.js";

/** Quién emite: identidad, nombre y funciones de la sesión (nunca del cuerpo). */
export interface ActorEmision extends Actor {
  readonly funciones: readonly FuncionUsuario[];
}

/** Sustituciones para pruebas: observar o provocar fallos entre el archivo y el registro. */
export interface GanchosEmision {
  /** Se llama con el archivo ya definitivo y antes de la sentencia de registro. */
  antesDeRegistrar?: (contexto: { emisionId: string; clave: string }) => Promise<void>;
}

const NO_ENCONTRADA = () => new ErrorNegocio("NO_ENCONTRADO", "La emisión no existe en su organización.");

function logoDisponible(clave: string): boolean {
  const ruta = LOGOS[clave];
  return !!ruta && existsSync(ruta);
}

export class ServicioEmisiones {
  private readonly repo: RepositorioEmisiones;
  private readonly cotizaciones: RepositorioCotizaciones;
  /** Emisiones en curso por organización + usuario + clave (doble clic en el mismo proceso). */
  private readonly enVuelo = new Map<string, Promise<{ detalle: DetalleEmision; reproducida: boolean }>>();

  constructor(
    prisma: PrismaClient,
    private readonly reloj: Reloj,
    private readonly relojInstante: RelojInstante,
    private readonly revisiones: ServicioRevisiones,
    private readonly almacen: AlmacenDocumentos,
    private readonly generador: GeneradorPdf,
    private readonly ganchos: GanchosEmision = {},
  ) {
    this.repo = new RepositorioEmisiones(prisma);
    this.cotizaciones = new RepositorioCotizaciones(prisma);
  }

  // --------------------------------- emisor ---------------------------------

  async emisor(ctx: ContextoOrganizacion, actor: Actor): Promise<Emisor> {
    const e = await this.repo.obtenerEmisor(ctx);
    return {
      nombre: e?.nombre ?? null,
      domicilio: e?.domicilio ?? null,
      telefono: e?.telefono ?? null,
      correo: e?.correo ?? null,
      logo: e?.logoClave === "DEMO" ? "DEMO" : null,
      esDemo: e?.esDemo ?? false,
      revision: e?.revision ?? 0,
      modificadoPor: e?.modificador?.usuario.nombre ?? (e ? "Carga DEMO" : null),
      modificadoEn: e ? e.modificadoEn.toISOString() : null,
      faltantes: faltantesEmisor(e, logoDisponible),
      editable: actor.capacidades.includes("emisor.configurar"),
    };
  }

  async guardarEmisor(ctx: ContextoOrganizacion, actor: Actor, s: EdicionEmisor): Promise<Emisor> {
    try {
      await this.repo.guardarEmisor(
        ctx,
        actor,
        s.revision,
        { nombre: s.nombre, domicilio: s.domicilio, telefono: s.telefono, correo: s.correo, logoClave: s.logo },
        s.motivo,
      );
    } catch (e) {
      const r = reconocerErrorBase(e);
      if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_EDICION") {
        const actual = await this.repo.obtenerEmisor(ctx);
        throw new ErrorNegocio("CONFLICTO_EDICION", "Otra persona guardó los datos del emisor antes; revise los vigentes.", {
          actual: {
            revision: actual?.revision ?? 0,
            actualizadoPor: actual?.modificador?.usuario.nombre ?? "Carga DEMO",
            actualizadoEn: actual?.modificadoEn.toISOString() ?? new Date(0).toISOString(),
          },
        });
      }
      if (r?.tipo === "negocio" && r.codigo === "SIN_PERMISO") {
        throw new ErrorNegocio("SIN_PERMISO", "Su pertenencia ya no tiene la función necesaria para esta operación.");
      }
      throw e;
    }
    return this.emisor(ctx, actor);
  }

  // ------------------------------- validación -------------------------------

  /** Lo que se emitiría hoy y lo que lo impide (solo lectura; nada cambia). */
  async validar(ctx: ContextoOrganizacion, actor: ActorEmision, cotizacionId: string, numero: number): Promise<ValidacionEmision> {
    return (await this.evaluar(ctx, actor, cotizacionId, numero)).validacion;
  }

  private async evaluar(ctx: ContextoOrganizacion, actor: ActorEmision, cotizacionId: string, numero: number) {
    const hoy: FechaISO = this.reloj.hoy();
    const d = await this.repo.leerParaEmitir(ctx, cotizacionId, numero);
    if (!d) throw new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");
    const idVersion = `${d.folio}-v${d.numero}`;
    const [emisionFila, aprobacion, emisorFila, ambiente] = await Promise.all([
      this.repo.deVersion(ctx, d.versionId),
      this.repo.aprobacionDeVersion(ctx, d.versionId),
      this.repo.obtenerEmisor(ctx),
      this.repo.ambiente(ctx),
    ]);
    const emision = emisionFila ? aResumenEmision(emisionFila, await this.repo.sustituida(ctx, emisionFila)) : null;
    const captura = EsquemaCapturaBorrador.parse(d.captura);
    const textos = captura.textos ?? null;

    const bloqueos: Problema[] = [...bl19(d, !!emision)];
    let avisos: ValidacionEmision["avisos"] = [];
    let vigenciaDias: number | null = null;
    if (!emision) {
      // Verificación vigente del módulo 7 (BL-04 a BL-14, 16 y 18; AV-01/02/03/05) con la fecha de
      // emisión. Solo lee: nunca recalcula importes guardados.
      const v = await this.revisiones.verificar(ctx, cotizacionId, numero, hoy);
      bloqueos.push(...v.bloqueos);
      avisos = v.avisos;
      vigenciaDias = v.vigenciaDias;
      bloqueos.push(...bl01(d), ...bl02(d), ...bl15(faltantesEmisor(emisorFila, logoDisponible)), ...bl17(aprobacion, d.autorId, idVersion));
      bloqueos.push(...bl20(captura, idVersion));
    }
    const persona = puedeEmitirPersona(actor.funciones, actor.usuarioId, d.autorId);
    const unicos = sinDuplicados(bloqueos);
    const vigenteHasta = vigenciaDias && vigenciaDias > 0 ? cr16VigenteHasta(hoy, vigenciaDias) : null;
    const aprobacionVigente =
      aprobacion && aprobacion.estado === "APROBADA" && !aprobacion.anulada && aprobacion.aprobadaPor && aprobacion.aprobadaEn
        ? { revisionId: aprobacion.revisionId, aprobadaPor: aprobacion.aprobadaPor, aprobadaEn: aprobacion.aprobadaEn.toISOString() }
        : null;
    const validacion: ValidacionEmision = {
      fechaEmision: hoy,
      vigenciaDias,
      vigenteHasta,
      version: { id: d.versionId, numero: d.numero, idVersion, total: d.total, esUltima: d.numero === d.ultimaVersion },
      aprobacion: aprobacionVigente,
      preparador: d.autorNombre,
      destinatario: {
        cliente: { codigo: d.version.clienteCodigo, nombre: d.version.clienteNombre },
        proyecto: {
          codigo: d.version.proyectoCodigo,
          nombre: d.version.proyectoNombre,
          ubicacion: d.version.proyectoUbicacion,
          descripcion: d.version.proyectoDescripcion,
        },
        contacto: { nombre: d.cliente.contactoNombre, telefono: d.cliente.contactoTelefono, correo: d.cliente.contactoCorreo },
      },
      emisor: {
        nombre: emisorFila?.nombre ?? null,
        domicilio: emisorFila?.domicilio ?? null,
        telefono: emisorFila?.telefono ?? null,
        correo: emisorFila?.correo ?? null,
        logo: emisorFila?.logoClave === "DEMO" ? "DEMO" : null,
      },
      textos,
      bloqueos: unicos,
      avisos,
      puedeEmitir: !emision && unicos.length === 0 && persona.permitido && actor.capacidades.includes("emisiones.emitir"),
      motivoNoEmitir: actor.capacidades.includes("emisiones.emitir") ? persona.motivo : "Su función no permite emitir.",
      emision,
    };
    return { validacion, datos: d, captura, textos, emisorFila, ambiente, aprobacion };
  }

  // --------------------------------- emitir ---------------------------------

  async emitir(
    ctx: ContextoOrganizacion,
    actor: ActorEmision,
    cotizacionId: string,
    numero: number,
    s: SolicitudEmision,
    clave: string,
  ): Promise<{ detalle: DetalleEmision; reproducida: boolean }> {
    const llave = `${ctx.organizacionId}|${actor.usuarioId}|${clave}`;
    const enCurso = this.enVuelo.get(llave);
    if (enCurso) {
      // Doble clic: la segunda solicitud espera a la primera y reproduce su resultado.
      await enCurso.catch(() => undefined);
    } else {
      const p = this.emitirUnaVez(ctx, actor, cotizacionId, numero, s, clave);
      this.enVuelo.set(llave, p);
      try {
        return await p;
      } finally {
        this.enVuelo.delete(llave);
      }
    }
    return this.emitirUnaVez(ctx, actor, cotizacionId, numero, s, clave);
  }

  private async emitirUnaVez(
    ctx: ContextoOrganizacion,
    actor: ActorEmision,
    cotizacionId: string,
    numero: number,
    s: SolicitudEmision,
    clave: string,
  ): Promise<{ detalle: DetalleEmision; reproducida: boolean }> {
    const ahora = this.relojInstante.ahora();
    const idem = prepararIdempotencia(clave, "emitir_version", { cotizacionId, numero: String(numero) }, s, ahora);
    const previo = await this.cotizaciones.buscarIdempotencia(ctx, actor, idem.clave);
    if (previo) return { detalle: await this.detalle(ctx, reproducible(previo, idem, ahora)), reproducida: true };

    const e = await this.evaluar(ctx, actor, cotizacionId, numero);
    const v = e.validacion;
    if (v.emision) {
      throw new ErrorNegocio("VERSION_EMITIDA", `La versión ${v.version.idVersion} ya se emitió; descargue el documento registrado.`);
    }
    if (!actor.capacidades.includes("emisiones.emitir")) throw new ErrorNegocio("SIN_PERMISO", "Su función no permite emitir.");
    const persona = puedeEmitirPersona(actor.funciones, actor.usuarioId, e.datos.autorId);
    if (!persona.permitido) throw new ErrorNegocio("SIN_PERMISO", persona.motivo ?? "No puede emitir esta versión.");
    if (v.bloqueos.length > 0) {
      await this.cotizaciones.registrarEvento(ctx, actor, "cotizacion", cotizacionId, "EMISION_BLOQUEADA", {
        numero,
        codigos: [...new Set(v.bloqueos.map((p) => p.codigo))],
      });
      throw new ErrorNegocio("EMISION_BLOQUEADA", "No se puede emitir; nada cambió.", { problemas: v.bloqueos });
    }
    // La persona confirmó una versión y una aprobación concretas: si ya no son las vigentes, nada.
    if (s.versionId !== v.version.id || !v.aprobacion || s.revisionId !== v.aprobacion.revisionId) {
      throw new ErrorNegocio(
        "CONFLICTO_EMISION",
        "La versión o su aprobación cambiaron desde que abrió la pantalla; actualice para ver el estado vigente.",
      );
    }

    const documento = this.documento(e, actor);
    let pdf: Buffer;
    try {
      pdf = await this.generador(documento);
    } catch (err) {
      throw new ErrorNegocio(
        "DOCUMENTO_NO_GENERADO",
        `No se generó el documento; la versión sigue aprobada y sin emitir. ${err instanceof ErrorGeneracionPdf ? err.message : "Intente de nuevo."}`,
      );
    }
    const emisionId = randomUUID();
    const claveArchivo = claveDeEmision(ctx.organizacionId, emisionId);
    let archivo;
    try {
      archivo = await this.almacen.guardar(claveArchivo, pdf);
    } catch (err) {
      throw new ErrorNegocio(
        "DOCUMENTO_NO_GENERADO",
        `No se pudo guardar el documento; la versión sigue aprobada y sin emitir. ${err instanceof ErrorDocumento ? err.message : "Intente de nuevo."}`,
      );
    }

    try {
      await this.ganchos.antesDeRegistrar?.({ emisionId, clave: claveArchivo });
      await this.repo.emitir(
        ctx,
        actor,
        cotizacionId,
        numero,
        s.versionId,
        s.revisionId,
        {
          id: emisionId,
          ambiente: documento.ambiente,
          fechaEmision: documento.fechaEmision,
          vigenciaDias: documento.vigenciaDias,
          vigenteHasta: documento.vigenteHasta,
          total: v.version.total,
          contenido: documento,
          plantillaVersion: PLANTILLA_PDF,
          archivoClave: archivo.clave,
          archivoBytes: archivo.bytes,
          archivoSha256: archivo.sha256,
        },
        idem,
      );
    } catch (err) {
      // El archivo no llegó a registrarse: se borra (si el proceso se interrumpe aquí, lo limpia
      // `documentos:revisar`). Nunca se anuncia una emisión sin registro.
      await this.almacen.descartar(claveArchivo).catch(() => undefined);
      return this.traducir(ctx, actor, err, idem, ahora);
    }
    return { detalle: await this.detalle(ctx, emisionId), reproducida: false };
  }

  private documento(e: Awaited<ReturnType<ServicioEmisiones["evaluar"]>>, actor: ActorEmision): DocumentoCotizacion {
    const v = e.validacion;
    const em = e.emisorFila!;
    const doc = construirDocumento({
      datos: e.datos,
      comercial: e.datos.proyeccionComercial as CotizacionComercial,
      textos: e.textos as TextosCotizacion,
      emisor: { nombre: em.nombre!, domicilio: em.domicilio!, telefono: em.telefono!, correo: em.correo!, logo: "DEMO" },
      ambiente: e.ambiente ?? "PRODUCCION",
      fechaEmision: v.fechaEmision,
      vigenciaDias: v.vigenciaDias!,
      vigenteHasta: v.vigenteHasta!,
      aprobo: v.aprobacion!.aprobadaPor,
      emitio: actor.nombre,
    });
    // La estructura pasa por su contrato estricto: ningún campo fuera de la lista blanca.
    return EsquemaDocumentoCotizacion.parse(doc);
  }

  private async traducir(
    ctx: ContextoOrganizacion,
    actor: ActorEmision,
    e: unknown,
    idem: ReturnType<typeof prepararIdempotencia>,
    ahora: Date,
  ): Promise<{ detalle: DetalleEmision; reproducida: boolean }> {
    const r = reconocerErrorBase(e);
    if (r?.tipo === "idempotencia_repetida") {
      const otro = await this.cotizaciones.buscarIdempotencia(ctx, actor, idem.clave);
      if (otro) return { detalle: await this.detalle(ctx, reproducible(otro, idem, ahora)), reproducida: true };
    }
    if (r?.tipo === "negocio") {
      switch (r.codigo) {
        case "NO_ENCONTRADO":
          throw new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");
        case "SIN_PERMISO":
          throw new ErrorNegocio("SIN_PERMISO", "Su pertenencia ya no tiene la función necesaria para emitir.");
        case "EMISOR_ES_AUTOR":
          throw new ErrorNegocio("SIN_PERMISO", "Usted preparó esta versión: con la función de Revisor no puede emitirla (BL-17).");
        case "VERSION_EMITIDA":
          throw new ErrorNegocio("VERSION_EMITIDA", "La versión ya se emitió (otra solicitud se confirmó antes).");
        case "APROBACION_NO_VIGENTE":
        case "AUTOAPROBACION":
          throw new ErrorNegocio("APROBACION_NO_VIGENTE", "La aprobación de esta versión ya no está vigente (se anuló o cambió). Actualice.");
        case "FOLIO_NO_ACTIVO":
          throw new ErrorNegocio("FOLIO_NO_ACTIVO", "La cotización se descartó; no se emitió.");
        case "REVISION_PENDIENTE":
          throw new ErrorNegocio("REVISION_PENDIENTE", "Hay una versión en revisión; no se emitió.");
        case "VERSION_NO_VIGENTE":
          throw new ErrorNegocio("VERSION_NO_VIGENTE", "Se guardó una versión más reciente; solo se emite la última.");
        case "BORRADOR_DESACTUALIZADO":
          throw new ErrorNegocio("BORRADOR_DESACTUALIZADO", "El borrador cambió después de calcular esta versión; genere una versión nueva.");
        case "CONFLICTO_EMISION":
        case "EMISION_INCOHERENTE":
          throw new ErrorNegocio("CONFLICTO_EMISION", "La versión o su aprobación cambiaron; actualice para ver el estado vigente.");
      }
    }
    throw e;
  }

  // -------------------------------- consultas --------------------------------

  async detalle(ctx: ContextoOrganizacion, id: string): Promise<DetalleEmision> {
    const f = await this.repo.obtener(ctx, id);
    if (!f) throw NO_ENCONTRADA();
    return {
      emision: aResumenEmision(f, await this.repo.sustituida(ctx, f)),
      documento: EsquemaDocumentoCotizacion.parse(f.contenido),
    };
  }

  /** El archivo emitido, tal como se registró (tamaño y SHA-256 comprobados). Nunca se regenera. */
  async archivo(ctx: ContextoOrganizacion, id: string): Promise<{ nombre: string; contenido: Buffer; sha256: string }> {
    const f = await this.repo.obtener(ctx, id);
    if (!f) throw NO_ENCONTRADA();
    const sha256 = Buffer.from(f.archivoSha256).toString("hex");
    try {
      const contenido = await this.almacen.leer(f.archivoClave, f.archivoBytes, sha256);
      return { nombre: nombreArchivo(f.folio, f.versionNumero), contenido, sha256 };
    } catch (e) {
      if (e instanceof ErrorDocumento) {
        throw new ErrorNegocio(
          "DOCUMENTO_NO_DISPONIBLE",
          "El documento emitido no está disponible o no coincide con su registro. No se sustituye por otro: avise al responsable de los respaldos.",
        );
      }
      throw e;
    }
  }
}

function sinDuplicados(p: readonly Problema[]): Problema[] {
  const vistos = new Set<string>();
  return p.filter((x) => {
    const k = `${x.codigo}|${x.referencia}|${x.mensaje}`;
    return vistos.has(k) ? false : (vistos.add(k), true);
  });
}
