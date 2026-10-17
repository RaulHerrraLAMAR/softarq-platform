/**
 * Administración del catálogo técnico (módulo 12, ADR-0016): tipos de estructura, insumos,
 * conversiones, conceptos y componentes, y la aprobación de conceptos. Capa de aplicación: sin Nest
 * ni HTTP.
 *
 * - Reglas del libro (`Val_TipoEst`, `Val_Insumo`, `Val_Conversion`, `Val_Concepto`,
 *   `Val_Componente`, `Concepto_Problemas`): aquí se comprueban antes de escribir para dar el mensaje
 *   del libro; PostgreSQL las vuelve a imponer (funciones, índices y disparadores), también la función
 *   Administrador del catálogo (403 si se perdió durante la sesión).
 * - Un cambio técnico devuelve el concepto a Borrador y retira la aprobación; asignar tarifa (módulo
 *   11) y desactivar la conservan; reactivar vuelve a Borrador.
 * - Aprobar: cualquier Administrador del catálogo, también quien creó o editó el concepto (regla del
 *   libro; BL-17 no cambia). La aprobación corresponde a la revisión técnica revisada (409 si cambió).
 * - Conceptos heredados de la carga anterior: conservan su aprobación y su cálculo; editarlos exige
 *   completarlos (tipo y regla) y les retira la aprobación hasta una nueva.
 */
import {
  CAMPOS_TECNICOS_CONCEPTO,
  LIMITES_API,
  LIMITES_CATALOGO_ADMIN,
  type AprobacionConcepto,
  type ComponenteAdmin,
  type ConsultaTiposEstructura,
  type DetalleConceptoAdmin,
  type DetalleInsumoAdmin,
  type DetalleTipoEstructura,
  type EdicionComponente,
  type EdicionConcepto,
  type EdicionConversion,
  type EdicionInsumo,
  type EdicionTipoEstructura,
  type InsumoAdmin,
  type RespuestaTiposEstructura,
  type SolicitudComponente,
  type SolicitudConcepto,
  type SolicitudConversion,
  type SolicitudInsumo,
  type SolicitudTipoEstructura,
  type TipoEstructuraAdmin,
} from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "../../cotizaciones/aplicacion/errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import { RepositorioAdministracion, type AutorAdmin } from "../persistencia/repositorio-administracion.js";
import { RepositorioCatalogoTecnico } from "../persistencia/repositorio-catalogo-tecnico.js";
import type { ContextoOrganizacion } from "../persistencia/repositorio-catalogos.js";
import type { RelojInstante } from "./servicio-administracion.js";

const NO_ENCONTRADO = (que = "El registro") => new ErrorNegocio("NO_ENCONTRADO", `${que} no existe en su organización.`);
const limiteDe = (l: number | undefined) => l ?? LIMITES_API.limiteListadoPorOmision;

/** Solo las claves presentes (las ausentes no cambian; `null` borra un opcional). */
function cambiosDe(e: Record<string, unknown>, fuera: readonly string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "revision" && !fuera.includes(k) && v !== undefined));
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

function sinId<T extends { id: string }>(r: T): Omit<T, "id"> {
  const { id: _id, ...resto } = r;
  return resto;
}

/** Índices únicos de la migración y el registro existente que se informa (`Cat_Duplicado`). */
type Duplicado = { indice: string; leer: () => Promise<{ mensaje: string; registro: unknown }> };

export class ServicioCatalogoTecnico {
  private readonly repo: RepositorioCatalogoTecnico;
  private readonly admin: RepositorioAdministracion;

  constructor(
    db: PrismaClient,
    private readonly reloj: Reloj,
    private readonly instante: RelojInstante,
  ) {
    this.repo = new RepositorioCatalogoTecnico(db);
    this.admin = new RepositorioAdministracion(db);
  }

  // ---------------------------- tipos de estructura ---------------------------

  async listarTipos(ctx: ContextoOrganizacion, c: ConsultaTiposEstructura): Promise<RespuestaTiposEstructura> {
    const limite = limiteDe(c.limite);
    const r = await this.repo.listarTipos(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.familia !== undefined ? { familia: c.familia } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      incluirInactivos: c.incluirInactivos ?? false,
      limite,
    });
    return { tipos: r.filas, limite, siguiente: r.siguiente };
  }

  async detalleTipo(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleTipoEstructura> {
    const t = await this.repo.obtenerTipo(ctx, codigo);
    if (!t) throw NO_ENCONTRADO("El tipo de estructura");
    return { tipo: sinId(t), historial: await this.admin.historial(ctx, "tipo_estructura", t.id, LIMITES_CATALOGO_ADMIN.historial) };
  }

  async crearTipo(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudTipoEstructura, clave: string): Promise<{ tipo: TipoEstructuraAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_tipo_estructura", {}, s, ahora);
    const datos = { familia: s.familia, nombre: s.nombre, prioritario: s.prioritario ?? false };
    const r = await this.traducir(
      () =>
        ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
          await this.exigirTipoNuevo(ctx, datos.familia, datos.nombre, null);
          return this.repo.crearTipo(ctx, autor, datos, idem);
        }),
      { duplicados: [this.duplicadoTipo(ctx, datos.familia, datos.nombre)] },
    );
    const tipo = await this.repo.obtenerTipoPorId(ctx, r.id);
    if (!tipo) throw NO_ENCONTRADO("El tipo de estructura");
    return { tipo, reproducida: r.reproducida };
  }

  async editarTipo(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, e: EdicionTipoEstructura): Promise<TipoEstructuraAdmin> {
    const actual = await this.repo.obtenerTipo(ctx, codigo);
    if (!actual) throw NO_ENCONTRADO("El tipo de estructura");
    const familia = e.familia ?? actual.familia;
    const nombre = e.nombre ?? actual.nombre;
    if (actual.revision === e.revision && familia !== actual.familia && actual.conceptos > 0) {
      throw new ErrorNegocio(
        "TIPO_CON_CONCEPTOS",
        `El tipo ${codigo} ya tiene ${actual.conceptos} concepto(s): su familia no cambia. Registre otro tipo para la nueva familia; los conceptos no se trasladan solos.`,
        { campos: [{ ruta: "familia", mensaje: "Bloqueada: el tipo ya tiene conceptos." }] },
      );
    }
    if (e.familia !== undefined || e.nombre !== undefined) await this.exigirTipoNuevo(ctx, familia, nombre, codigo);
    await this.traducir(() => this.repo.editarTipo(ctx, autor, codigo, e.revision, cambiosDe(e)), {
      conflicto: async () => sinId((await this.repo.obtenerTipo(ctx, codigo))!),
      duplicados: [this.duplicadoTipo(ctx, familia, nombre)],
    });
    const t = await this.repo.obtenerTipo(ctx, codigo);
    if (!t) throw NO_ENCONTRADO("El tipo de estructura");
    return sinId(t);
  }

  private async exigirTipoNuevo(ctx: ContextoOrganizacion, familia: string, nombre: string, propio: string | null): Promise<void> {
    const existente = await this.repo.tipoPorNombre(ctx, familia, nombre);
    if (existente && existente.codigo !== propio) {
      throw new ErrorNegocio("DUPLICADO", `Ya existe el tipo ${existente.codigo}.`, { registroVigente: existente });
    }
  }

  private duplicadoTipo(ctx: ContextoOrganizacion, familia: string, nombre: string): Duplicado {
    return {
      indice: "tipo_estructura_familia_nombre_key",
      leer: async () => {
        const t = await this.repo.tipoPorNombre(ctx, familia, nombre);
        return { mensaje: `Ya existe el tipo ${t?.codigo ?? "con esa familia y nombre"}.`, registro: t };
      },
    };
  }

  // ---------------------------------- insumos ---------------------------------

  async detalleInsumo(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleInsumoAdmin> {
    const i = await this.repo.obtenerInsumo(ctx, codigo);
    if (!i) throw NO_ENCONTRADO("El insumo");
    const [conversiones, historial, conceptos] = await Promise.all([
      this.repo.conversionesDeInsumo(ctx, i.id),
      this.admin.historial(ctx, "insumo", i.id, LIMITES_CATALOGO_ADMIN.historial),
      this.repo.conceptosConInsumo(ctx, i.id),
    ]);
    const impacto = await this.repo.impacto(ctx, { conceptosBorrador: conceptos, insumos: [codigo] });
    return { insumo: sinId(i), conversiones, impacto, historial };
  }

  async crearInsumo(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudInsumo, clave: string): Promise<{ insumo: InsumoAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_insumo", {}, s, ahora);
    const datos = { descripcion: s.descripcion, especificacion: s.especificacion ?? null, unidadBase: s.unidadBase };
    const r = await this.traducir(
      () =>
        ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
          await this.exigirInsumoNuevo(ctx, datos.descripcion, null);
          return this.repo.crearInsumo(ctx, autor, datos, idem);
        }),
      { duplicados: [this.duplicadoInsumo(ctx, datos.descripcion)] },
    );
    const insumo = await this.repo.obtenerInsumoPorId(ctx, r.id);
    if (!insumo) throw NO_ENCONTRADO("El insumo");
    return { insumo, reproducida: r.reproducida };
  }

  async editarInsumo(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, e: EdicionInsumo): Promise<InsumoAdmin> {
    const actual = await this.repo.obtenerInsumo(ctx, codigo);
    if (!actual) throw NO_ENCONTRADO("El insumo");
    const ref = actual.referencias;
    if (actual.revision === e.revision && e.unidadBase !== undefined && e.unidadBase !== actual.unidadBase && ref.productos + ref.conversiones + ref.componentes > 0) {
      throw new ErrorNegocio(
        "INSUMO_CON_REFERENCIAS",
        `No puede cambiar la unidad base: el insumo tiene ${ref.productos} producto(s), ${ref.conversiones} conversión(es) y ${ref.componentes} componente(s). Registre un insumo nuevo.`,
        { campos: [{ ruta: "unidadBase", mensaje: "Bloqueada: el insumo ya tiene productos, conversiones o componentes." }] },
      );
    }
    if (e.descripcion !== undefined) await this.exigirInsumoNuevo(ctx, e.descripcion, codigo);
    await this.traducir(() => this.repo.editarInsumo(ctx, autor, codigo, e.revision, cambiosDe(e)), {
      conflicto: async () => sinId((await this.repo.obtenerInsumo(ctx, codigo))!),
      duplicados: e.descripcion !== undefined ? [this.duplicadoInsumo(ctx, e.descripcion)] : [],
    });
    const i = await this.repo.obtenerInsumo(ctx, codigo);
    if (!i) throw NO_ENCONTRADO("El insumo");
    return sinId(i);
  }

  private async exigirInsumoNuevo(ctx: ContextoOrganizacion, descripcion: string, propio: string | null): Promise<void> {
    const existente = await this.repo.insumoPorDescripcion(ctx, descripcion);
    if (existente && existente.codigo !== propio) {
      throw new ErrorNegocio("DUPLICADO", `Ya existe el insumo ${existente.codigo}.`, { registroVigente: existente });
    }
  }

  private duplicadoInsumo(ctx: ContextoOrganizacion, descripcion: string): Duplicado {
    return {
      indice: "insumo_descripcion_normalizada_key",
      leer: async () => {
        const i = await this.repo.insumoPorDescripcion(ctx, descripcion);
        return { mensaje: `Ya existe el insumo ${i?.codigo ?? "con esa descripción"}.`, registro: i };
      },
    };
  }

  // -------------------------------- conversiones ------------------------------

  async crearConversion(ctx: ContextoOrganizacion, autor: AutorAdmin, insumo: string, s: SolicitudConversion, clave: string): Promise<{ detalle: DetalleInsumoAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_conversion", { insumo }, s, ahora);
    const actual = await this.repo.obtenerInsumo(ctx, insumo);
    if (!actual) throw NO_ENCONTRADO("El insumo");
    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (!previo) {
      if (s.unidadOrigen === actual.unidadBase) {
        throw new ErrorNegocio("VALOR_INVALIDO", "La unidad de origen es igual a la unidad base; no requiere conversión.", {
          campos: [{ ruta: "unidadOrigen", mensaje: `Elija una unidad distinta de ${actual.unidadBase}, la unidad base del insumo.` }],
        });
      }
      const existente = (await this.repo.conversionesDeInsumo(ctx, actual.id, s.unidadOrigen))[0];
      if (existente) {
        throw new ErrorNegocio("DUPLICADO", `Ya existe la conversión ${s.unidadOrigen} → ${actual.unidadBase} para ese insumo. Edítela.`, { registroVigente: existente });
      }
    }
    const r = await this.traducir(
      () => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.crearConversion(ctx, autor, { insumoCodigo: insumo, ...s }, idem)),
      {
        duplicados: ["conversion_insumo_origen_key", "conversion_insumo_id_unidad_origen_unidad_destino_key"].map((indice) => ({
          indice,
          leer: async () => ({
            mensaje: `Ya existe la conversión ${s.unidadOrigen} → ${actual.unidadBase} para ese insumo. Edítela.`,
            registro: (await this.repo.conversionesDeInsumo(ctx, actual.id, s.unidadOrigen))[0] ?? null,
          }),
        })),
      },
    );
    return { detalle: await this.detalleInsumo(ctx, insumo), reproducida: r.reproducida };
  }

  /** Factor o fuente con motivo. Los conceptos aprobados que la usan vuelven a Borrador (decisión 1). */
  async editarConversion(ctx: ContextoOrganizacion, autor: AutorAdmin, insumo: string, origen: string, e: EdicionConversion): Promise<DetalleInsumoAdmin> {
    const actual = await this.repo.obtenerInsumo(ctx, insumo);
    if (!actual) throw NO_ENCONTRADO("El insumo");
    await this.traducir(() => this.repo.editarConversion(ctx, autor, insumo, origen, e.revision, cambiosDe(e, ["motivo"]), e.motivo), {
      conflicto: async () => (await this.repo.conversionesDeInsumo(ctx, actual.id, origen))[0] ?? null,
    });
    return this.detalleInsumo(ctx, insumo);
  }

  // --------------------------------- conceptos --------------------------------

  async detalleConcepto(ctx: ContextoOrganizacion, codigo: string): Promise<DetalleConceptoAdmin> {
    const d = await this.repo.obtenerConcepto(ctx, codigo);
    if (!d) throw NO_ENCONTRADO("El concepto");
    const [borradores, requisitos, historial, impacto] = await Promise.all([
      this.admin.borradoresPorConcepto(ctx, [codigo]),
      this.repo.requisitos(ctx, d.id),
      this.admin.historial(ctx, "concepto", d.id, LIMITES_CATALOGO_ADMIN.historial),
      this.repo.impacto(ctx, { conceptos: [codigo] }),
    ]);
    return {
      concepto: this.repo.aConceptoListado(d.fila, borradores.porCodigo.get(codigo) ?? 0),
      permiteDescuento: d.permiteDescuento,
      reglaMedicion: d.reglaMedicion,
      criterios: d.criterios,
      creadoPor: d.creadoPor,
      creadoEn: d.creadoEn,
      cambioTecnicoPor: d.cambioTecnicoPor,
      cambioTecnicoEn: d.cambioTecnicoEn,
      componentes: d.componentes,
      requisitos,
      impacto,
      historial,
    };
  }

  async crearConcepto(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudConcepto, clave: string): Promise<{ detalle: DetalleConceptoAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_concepto", {}, s, ahora);
    const datos = { ...s, criterios: s.criterios ?? null, tarifaCodigo: s.tarifaCodigo ?? null };
    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (!previo) {
      await this.exigirTipoActivo(ctx, s.tipoCodigo, null);
      await this.exigirUnidadDeFormula(s.unidad, s.tipoFormula);
      if (datos.tarifaCodigo) await this.exigirTarifaCompatible(ctx, datos.tarifaCodigo, s.unidad, true);
      await this.exigirConceptoNuevo(ctx, s.tipoCodigo, s.descripcion, null);
    }
    const r = await this.traducir(
      () => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.crearConcepto(ctx, autor, datos, idem)),
      { duplicados: [this.duplicadoConcepto(ctx, s.tipoCodigo, s.descripcion)] },
    );
    const codigo = await this.repo.codigoPorId(ctx, "concepto", r.id);
    if (!codigo) throw NO_ENCONTRADO("El concepto");
    return { detalle: await this.detalleConcepto(ctx, codigo), reproducida: r.reproducida };
  }

  async editarConcepto(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, e: EdicionConcepto): Promise<DetalleConceptoAdmin> {
    const actual = await this.detalleConcepto(ctx, codigo);
    const c = actual.concepto;
    const cambios = cambiosDe(e);
    if (c.revision === e.revision) {
      const tecnico = CAMPOS_TECNICOS_CONCEPTO.some((k) => k in cambios);
      const tipoCodigo = e.tipoCodigo ?? c.tipo?.codigo ?? null;
      const regla = e.reglaMedicion ?? actual.reglaMedicion;
      // Heredado: toda edición técnica exige completar tipo y regla de medición.
      if (c.heredado && tecnico && (tipoCodigo === null || regla === null)) {
        const campos = [
          ...(tipoCodigo === null ? [{ ruta: "tipoCodigo", mensaje: "Seleccione el tipo de estructura (falta en la carga anterior)." }] : []),
          ...(regla === null ? [{ ruta: "reglaMedicion", mensaje: "Escriba la regla de medición (falta en la carga anterior)." }] : []),
        ];
        throw new ErrorNegocio("CONCEPTO_INCOMPLETO", "Datos incompletos de la carga anterior: complete el tipo de estructura y la regla de medición para editar el concepto.", { campos });
      }
      if (e.tipoCodigo !== undefined && e.tipoCodigo !== c.tipo?.codigo) await this.exigirTipoActivo(ctx, e.tipoCodigo, "tipoCodigo");
      const unidad = e.unidad ?? c.unidad;
      const formula = e.tipoFormula ?? c.tipoFormula;
      if (e.unidad !== undefined || e.tipoFormula !== undefined) await this.exigirUnidadDeFormula(unidad, formula);
      if (e.unidad !== undefined && c.tarifa && c.tarifa.unidad !== unidad) {
        throw new ErrorNegocio("UNIDAD_INCOMPATIBLE", `La tarifa ${c.tarifa.codigo} es por ${c.tarifa.unidad} y el concepto se mediría en ${unidad} (BL-06). Asigne primero una tarifa de esa unidad.`, {
          campos: [{ ruta: "unidad", mensaje: `La tarifa asignada es por ${c.tarifa.unidad}.` }],
        });
      }
      if (tipoCodigo !== null && (e.tipoCodigo !== undefined || e.descripcion !== undefined)) {
        await this.exigirConceptoNuevo(ctx, tipoCodigo, e.descripcion ?? c.descripcion, codigo);
      }
    }
    await this.traducir(() => this.repo.editarConcepto(ctx, autor, codigo, e.revision, cambios), {
      conflicto: () => this.detalleConcepto(ctx, codigo),
      duplicados: [this.duplicadoConcepto(ctx, e.tipoCodigo ?? c.tipo?.codigo ?? "", e.descripcion ?? c.descripcion)],
    });
    return this.detalleConcepto(ctx, codigo);
  }

  async aprobarConcepto(ctx: ContextoOrganizacion, autor: AutorAdmin, codigo: string, a: AprobacionConcepto, clave: string): Promise<{ detalle: DetalleConceptoAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "aprobar_concepto", { codigo }, a, ahora);
    const actual = await this.detalleConcepto(ctx, codigo);
    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (!previo) {
      if (actual.concepto.estado === "Aprobado") {
        throw new ErrorNegocio("CONFLICTO_APROBACION", "El concepto ya está aprobado.", { registroVigente: actual });
      }
      if (actual.concepto.revisionTecnica !== a.revisionTecnica) {
        throw new ErrorNegocio("CONFLICTO_APROBACION", "El contenido técnico del concepto cambió mientras lo revisaba: revise la versión vigente antes de aprobar.", {
          registroVigente: actual,
        });
      }
      if (actual.requisitos.length > 0) {
        throw new ErrorNegocio("REQUISITOS_INCOMPLETOS", `No se puede aprobar ${codigo}: faltan requisitos.`, { problemas: actual.requisitos });
      }
    }
    const r = await this.traducir(() => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.aprobarConcepto(ctx, autor, codigo, a.revisionTecnica, idem)), {
      conflictoAprobacion: () => this.detalleConcepto(ctx, codigo),
      requisitos: async () => (await this.detalleConcepto(ctx, codigo)).requisitos,
    });
    return { detalle: await this.detalleConcepto(ctx, codigo), reproducida: r.reproducida };
  }

  private async exigirTipoActivo(ctx: ContextoOrganizacion, tipoCodigo: string, ruta: string | null): Promise<void> {
    const t = await this.repo.obtenerTipo(ctx, tipoCodigo);
    if (!t) throw NO_ENCONTRADO("El tipo de estructura");
    if (!t.activo) {
      throw new ErrorNegocio("REGISTRO_INACTIVO", `El tipo de estructura ${tipoCodigo} está inactivo: no se ofrece para conceptos nuevos ni para reclasificar.`, {
        campos: [{ ruta: ruta ?? "tipoCodigo", mensaje: "Seleccione un tipo activo." }],
      });
    }
  }

  /** `MagnitudDeFormula`: la magnitud de la unidad debe ser la de la fórmula. */
  private async exigirUnidadDeFormula(unidad: string, formula: string): Promise<void> {
    const u = (await this.admin.listarUnidades()).find((x) => x.clave === unidad);
    if (!u) throw new ErrorNegocio("VALOR_INVALIDO", "Seleccione la unidad del concepto.", { campos: [{ ruta: "unidad", mensaje: "Unidad inexistente." }] });
    if (u.magnitud !== formula.toLowerCase()) {
      throw new ErrorNegocio("VALOR_INVALIDO", `La unidad ${unidad} (${u.magnitud}) no corresponde al tipo de fórmula ${formula}.`, {
        campos: [{ ruta: "unidad", mensaje: `Elija una unidad de ${formula.toLowerCase()}.` }],
      });
    }
  }

  private async exigirTarifaCompatible(ctx: ContextoOrganizacion, tarifa: string, unidad: string, nueva: boolean): Promise<void> {
    const t = await this.admin.obtenerTarifa(ctx, tarifa, this.reloj.hoy());
    if (!t) throw NO_ENCONTRADO("La tarifa");
    if (nueva && !t.activa) {
      throw new ErrorNegocio("REGISTRO_INACTIVO", "La tarifa está inactiva: no se puede asignar.", { campos: [{ ruta: "tarifaCodigo", mensaje: "Elija una tarifa activa." }] });
    }
    if (t.unidad !== unidad) {
      throw new ErrorNegocio("UNIDAD_INCOMPATIBLE", `La tarifa ${tarifa} es por ${t.unidad} y el concepto se mide en ${unidad} (BL-06).`, {
        campos: [{ ruta: "tarifaCodigo", mensaje: `Elija una tarifa por ${unidad}.` }],
      });
    }
  }

  private async exigirConceptoNuevo(ctx: ContextoOrganizacion, tipoCodigo: string, descripcion: string, propio: string | null): Promise<void> {
    const existente = await this.repo.conceptoPorDescripcion(ctx, tipoCodigo, descripcion);
    if (existente && existente !== propio) {
      throw new ErrorNegocio("DUPLICADO", `Ya existe el concepto ${existente} en ese tipo.`, { registroVigente: { codigo: existente } });
    }
  }

  private duplicadoConcepto(ctx: ContextoOrganizacion, tipoCodigo: string, descripcion: string): Duplicado {
    return {
      indice: "concepto_tipo_descripcion_key",
      leer: async () => {
        const c = await this.repo.conceptoPorDescripcion(ctx, tipoCodigo, descripcion);
        return { mensaje: `Ya existe el concepto ${c ?? ""} en ese tipo.`, registro: c ? { codigo: c } : null };
      },
    };
  }

  // -------------------------------- componentes -------------------------------

  async crearComponente(ctx: ContextoOrganizacion, autor: AutorAdmin, concepto: string, s: SolicitudComponente, clave: string): Promise<{ detalle: DetalleConceptoAdmin; reproducida: boolean }> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_componente", { concepto }, s, ahora);
    const actual = await this.detalleConcepto(ctx, concepto);
    const previo = await this.repo.buscarIdempotencia(ctx, autor, idem.clave);
    if (!previo) {
      this.exigirConceptoCompleto(actual);
      await this.exigirInsumoActivo(ctx, s.insumoCodigo);
      const existente = await this.repo.componentePorInsumo(ctx, concepto, s.insumoCodigo);
      if (existente) {
        throw new ErrorNegocio("DUPLICADO", `El concepto ya tiene el componente ${existente} con ese insumo. Edítelo.`, { registroVigente: { codigo: existente } });
      }
    }
    const datos = { ...s, fuente: s.fuente ?? null, fecha: s.fecha ?? null, responsable: s.responsable ?? null };
    const r = await this.traducir(() => ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, () => this.repo.crearComponente(ctx, autor, concepto, datos, idem)), {
      duplicados: [this.duplicadoComponente(ctx, concepto, s.insumoCodigo)],
    });
    const ref = await this.repo.componentePorId(ctx, r.id);
    return { detalle: await this.detalleConcepto(ctx, ref?.concepto ?? concepto), reproducida: r.reproducida };
  }

  async editarComponente(ctx: ContextoOrganizacion, autor: AutorAdmin, concepto: string, componente: string, e: EdicionComponente): Promise<DetalleConceptoAdmin> {
    const actual = await this.detalleConcepto(ctx, concepto);
    const k = actual.componentes.find((x) => x.codigo === componente);
    if (!k) throw NO_ENCONTRADO("El componente");
    if (k.revision === e.revision) {
      this.exigirConceptoCompleto(actual);
      if (e.insumoCodigo !== undefined && e.insumoCodigo !== k.insumo.codigo) {
        await this.exigirInsumoActivo(ctx, e.insumoCodigo);
        const existente = await this.repo.componentePorInsumo(ctx, concepto, e.insumoCodigo);
        if (existente && existente !== componente) {
          throw new ErrorNegocio("DUPLICADO", `El concepto ya tiene el componente ${existente} con ese insumo. Edítelo.`, { registroVigente: { codigo: existente } });
        }
      }
    }
    await this.traducir(() => this.repo.editarComponente(ctx, autor, concepto, componente, e.revision, cambiosDe(e)), {
      conflicto: () => this.repo.componentePorCodigo(ctx, concepto, componente),
      duplicados: e.insumoCodigo !== undefined ? [this.duplicadoComponente(ctx, concepto, e.insumoCodigo)] : [],
    });
    return this.detalleConcepto(ctx, concepto);
  }

  private exigirConceptoCompleto(d: DetalleConceptoAdmin): void {
    if (d.concepto.heredado) {
      throw new ErrorNegocio(
        "CONCEPTO_INCOMPLETO",
        "Datos incompletos de la carga anterior: complete el tipo de estructura y la regla de medición del concepto antes de cambiar sus componentes.",
      );
    }
  }

  private async exigirInsumoActivo(ctx: ContextoOrganizacion, insumo: string): Promise<void> {
    const i = await this.repo.obtenerInsumo(ctx, insumo);
    if (!i) throw NO_ENCONTRADO("El insumo");
    if (!i.activo) throw new ErrorNegocio("REGISTRO_INACTIVO", "El insumo está inactivo.", { campos: [{ ruta: "insumoCodigo", mensaje: "Seleccione un insumo activo." }] });
  }

  private duplicadoComponente(ctx: ContextoOrganizacion, concepto: string, insumo: string): Duplicado {
    return {
      indice: "componente_concepto_insumo_key",
      leer: async () => {
        const c = await this.repo.componentePorInsumo(ctx, concepto, insumo);
        return { mensaje: `El concepto ya tiene el componente ${c ?? ""} con ese insumo. Edítelo.`, registro: c ? { codigo: c } : null };
      },
    };
  }

  // -------------------------------- utilidades --------------------------------

  /**
   * Traduce los errores de la base: códigos SOFTARQ:*, conflictos con el registro vigente, requisitos
   * de aprobación y duplicados por los índices normalizados (`Cat_Duplicado`).
   */
  private async traducir<T>(
    accion: () => Promise<T>,
    c: {
      conflicto?: () => Promise<unknown>;
      conflictoAprobacion?: () => Promise<unknown>;
      requisitos?: () => Promise<ComponenteAdmin[] | DetalleConceptoAdmin["requisitos"]>;
      duplicados?: Duplicado[];
    },
  ): Promise<T> {
    try {
      return await accion();
    } catch (err) {
      if (err instanceof ErrorNegocio && (err.detalle.registroVigente !== undefined || err.detalle.problemas !== undefined || err.detalle.campos !== undefined)) throw err;
      const r = err instanceof ErrorNegocio ? { tipo: "negocio" as const, codigo: err.codigo as string } : reconocerErrorBase(err);
      if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_EDICION" && c.conflicto) {
        throw new ErrorNegocio("CONFLICTO_EDICION", "Otra persona o pestaña guardó cambios antes; lo que escribió se conserva. Revise la versión vigente.", {
          registroVigente: (await c.conflicto()) ?? null,
        });
      }
      if (r?.tipo === "negocio" && (r.codigo === "CONFLICTO_APROBACION" || r.codigo === "YA_APROBADO") && c.conflictoAprobacion) {
        const base = traducirErrorBase(err);
        throw new ErrorNegocio("CONFLICTO_APROBACION", base instanceof Error ? base.message : "El concepto cambió; revise la versión vigente.", {
          registroVigente: await c.conflictoAprobacion(),
        });
      }
      if (r?.tipo === "negocio" && r.codigo === "REQUISITOS_INCOMPLETOS" && c.requisitos) {
        throw new ErrorNegocio("REQUISITOS_INCOMPLETOS", "No se puede aprobar: faltan requisitos.", {
          problemas: (await c.requisitos()) as DetalleConceptoAdmin["requisitos"],
        });
      }
      if (err instanceof ErrorNegocio) throw err;
      const texto = textoDeError(err);
      for (const d of c.duplicados ?? []) {
        if (texto.includes(d.indice)) {
          const { mensaje, registro } = await d.leer();
          throw new ErrorNegocio("DUPLICADO", mensaje, { registroVigente: registro });
        }
      }
      throw traducirErrorBase(err);
    }
  }
}
