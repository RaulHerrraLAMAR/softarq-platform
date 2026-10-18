/**
 * Administración de parámetros (B-38) y de personas y funciones (B-39) — módulo 13, ADR-0017. Capa de
 * aplicación: sin Nest ni HTTP. Solo el Administrador del sistema; la base lo vuelve a exigir.
 *
 * - Parámetros: recargo, impuesto, vigencia y plantillas de textos, con motivo y revisión (409). Un
 *   cambio solo afecta a cálculos y cotizaciones NUEVOS; las versiones calculadas quedan bloqueadas
 *   por BL-16 al enviar, aprobar o emitir; versiones y PDF no cambian.
 * - Personas: alta, nombre, funciones, activación y restablecimiento. La contraseña temporal se genera
 *   aquí (`generarContrasena`, 18 bytes aleatorios), se guarda solo su hash Argon2id y se devuelve UNA
 *   vez; un reintento con la misma clave no genera otra. Nunca se registra ni se guarda en claro.
 */
import {
  LIMITES_ADMINISTRACION,
  LIMITES_API,
  LIMITES_CATALOGO_ADMIN,
  type ConsultaPersonas,
  type DetalleParametros,
  type DetallePersona,
  type EdicionParametros,
  type EdicionPersona,
  type PersonaAdmin,
  type RespuestaCredencialTemporal,
  type RespuestaPersonas,
  type SolicitudPersona,
} from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { generarContrasena } from "../../autenticacion/demo/cargar-usuarios-demo.js";
import type { ServicioContrasenas } from "../../autenticacion/infraestructura/contrasenas.js";
import { RepositorioAdministracion, type AutorAdmin } from "../../catalogos/persistencia/repositorio-administracion.js";
import { impactoVersiones } from "../../catalogos/persistencia/impacto-versiones.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "../../cotizaciones/aplicacion/errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import { RepositorioAdministracionSistema } from "../persistencia/repositorio-administracion-sistema.js";

export interface RelojInstanteSistema {
  ahora(): Date;
}

const NO_ENCONTRADO = (que: string) => new ErrorNegocio("NO_ENCONTRADO", `${que} no existe en su organización.`);
const HORA_MS = 60 * 60 * 1000;

function textoDeError(e: unknown): string {
  if (e === null || e === undefined) return "";
  if (typeof e !== "object") return String(e);
  const o = e as { message?: unknown; meta?: unknown; cause?: unknown };
  let t = typeof o.message === "string" ? o.message : "";
  try {
    if (o.meta !== undefined) t += ` ${JSON.stringify(o.meta)}`;
  } catch {
    // meta no serializable
  }
  return `${t} ${o.cause ? textoDeError(o.cause) : ""}`;
}

export class ServicioAdministracionSistema {
  private readonly repo: RepositorioAdministracionSistema;
  private readonly admin: RepositorioAdministracion;

  constructor(
    private readonly db: PrismaClient,
    private readonly contrasenas: ServicioContrasenas,
    private readonly instante: RelojInstanteSistema,
  ) {
    this.repo = new RepositorioAdministracionSistema(db);
    this.admin = new RepositorioAdministracion(db);
  }

  // ------------------------------- parámetros -------------------------------

  async detalleParametros(ctx: ContextoOrganizacion): Promise<DetalleParametros> {
    const parametros = await this.repo.obtenerParametros(ctx);
    if (!parametros) throw NO_ENCONTRADO("La configuración");
    const [impacto, historial] = await Promise.all([
      impactoVersiones(this.db, ctx, { todas: true }),
      this.admin.historial(ctx, "parametros", ctx.organizacionId, LIMITES_CATALOGO_ADMIN.historial),
    ]);
    return { parametros, impacto, historial };
  }

  async editarParametros(ctx: ContextoOrganizacion, autor: AutorAdmin, e: EdicionParametros): Promise<DetalleParametros> {
    const { revision, motivo, ...resto } = e;
    const cambios = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined));
    await this.traducir(() => this.repo.editarParametros(ctx, autor, revision, cambios, motivo), {
      conflicto: () => this.repo.obtenerParametros(ctx),
    });
    return this.detalleParametros(ctx);
  }

  // -------------------------------- personas --------------------------------

  async listarPersonas(ctx: ContextoOrganizacion, c: ConsultaPersonas): Promise<RespuestaPersonas> {
    const limite = c.limite ?? LIMITES_API.limiteListadoPorOmision;
    const r = await this.repo.listarPersonas(ctx, {
      ...(c.buscar !== undefined ? { buscar: c.buscar } : {}),
      ...(c.despuesDe !== undefined ? { despuesDe: c.despuesDe } : {}),
      incluirInactivas: c.incluirInactivas ?? false,
      limite,
    });
    return { personas: r.filas, limite, siguiente: r.siguiente };
  }

  async detallePersona(ctx: ContextoOrganizacion, id: string): Promise<DetallePersona> {
    const persona = await this.repo.obtenerPersona(ctx, id);
    if (!persona) throw NO_ENCONTRADO("La persona");
    return { persona, historial: await this.admin.historial(ctx, "persona", id, LIMITES_CATALOGO_ADMIN.historial) };
  }

  async crearPersona(ctx: ContextoOrganizacion, autor: AutorAdmin, s: SolicitudPersona, clave: string): Promise<RespuestaCredencialTemporal> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "crear_persona", {}, s, ahora);
    const temporalExpiraEn = new Date(ahora.getTime() + LIMITES_ADMINISTRACION.horasContrasenaTemporal * HORA_MS);
    let contrasena: string | null = null;
    const r = await this.traducir(
      () =>
        ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
          if (await this.repo.correoRegistrado(s.correo)) {
            throw new ErrorNegocio("CORREO_EXISTENTE", "Ese correo ya está registrado. Use otro correo.", { campos: [{ ruta: "correo", mensaje: "Ese correo ya está registrado." }] });
          }
          const temporal = generarContrasena();
          const hash = await this.contrasenas.crearHash(temporal);
          const id = await this.repo.crearPersona(ctx, autor, { correo: s.correo, nombre: s.nombre, funciones: s.funciones, motivo: s.motivo }, hash, temporalExpiraEn, idem);
          contrasena = temporal;
          return id;
        }),
      {},
    );
    return this.credencial(ctx, r.id, contrasena);
  }

  async editarPersona(ctx: ContextoOrganizacion, autor: AutorAdmin, id: string, e: EdicionPersona): Promise<PersonaAdmin> {
    const actual = await this.repo.obtenerPersona(ctx, id);
    if (!actual) throw NO_ENCONTRADO("La persona");
    const { revision, motivo, ...resto } = e;
    const cambios = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined));
    await this.traducir(() => this.repo.editarPersona(ctx, autor, id, revision, cambios, motivo), { conflicto: () => this.repo.obtenerPersona(ctx, id) });
    const persona = await this.repo.obtenerPersona(ctx, id);
    if (!persona) throw NO_ENCONTRADO("La persona");
    return persona;
  }

  async restablecerContrasena(ctx: ContextoOrganizacion, autor: AutorAdmin, id: string, motivo: string, clave: string): Promise<RespuestaCredencialTemporal> {
    const ahora = this.instante.ahora();
    const idem = prepararIdempotencia(clave, "restablecer_contrasena", { id }, { motivo }, ahora);
    if (!(await this.repo.obtenerPersona(ctx, id))) throw NO_ENCONTRADO("La persona");
    const temporalExpiraEn = new Date(ahora.getTime() + LIMITES_ADMINISTRACION.horasContrasenaTemporal * HORA_MS);
    let contrasena: string | null = null;
    const r = await this.traducir(
      () =>
        ejecutarIdempotente(this.repo, ctx, autor, idem, ahora, async () => {
          const temporal = generarContrasena();
          const hash = await this.contrasenas.crearHash(temporal);
          const usuario = await this.repo.restablecerContrasena(ctx, autor, id, hash, temporalExpiraEn, motivo, idem);
          contrasena = temporal;
          return usuario;
        }),
      {},
    );
    return this.credencial(ctx, r.id, contrasena);
  }

  /** Respuesta del alta o del restablecimiento: la temporal solo si se acaba de generar. */
  private async credencial(ctx: ContextoOrganizacion, id: string, contrasena: string | null): Promise<RespuestaCredencialTemporal> {
    const persona = await this.repo.obtenerPersona(ctx, id);
    if (!persona) throw NO_ENCONTRADO("La persona");
    return {
      persona,
      contrasenaTemporal: contrasena,
      contrasenaEntregada: contrasena === null,
      temporalExpiraEn: persona.temporalExpiraEn,
    };
  }

  /** Códigos SOFTARQ:* con el registro vigente en los conflictos; violaciones de CHECK como dato inválido. */
  private async traducir<T>(accion: () => Promise<T>, c: { conflicto?: () => Promise<unknown> }): Promise<T> {
    try {
      return await accion();
    } catch (err) {
      const r = err instanceof ErrorNegocio ? { tipo: "negocio" as const, codigo: err.codigo as string } : reconocerErrorBase(err);
      if (r?.tipo === "negocio" && r.codigo === "CONFLICTO_EDICION" && c.conflicto) {
        throw new ErrorNegocio("CONFLICTO_EDICION", "Otra persona o pestaña guardó cambios antes; lo que escribió se conserva. Revise la versión vigente.", {
          registroVigente: (await c.conflicto()) ?? null,
        });
      }
      if (err instanceof ErrorNegocio) throw err;
      const texto = textoDeError(err);
      if (/usuario_correo_key|Unique constraint failed.*correo/.test(texto)) {
        throw new ErrorNegocio("CORREO_EXISTENTE", "Ese correo ya está registrado. Use otro correo.", { campos: [{ ruta: "correo", mensaje: "Ese correo ya está registrado." }] });
      }
      if (/parametros_\w+_ck|usuario_\w+_ck|membresia_\w+_ck/.test(texto)) {
        throw new ErrorNegocio("VALOR_INVALIDO", "Algún valor no es válido para la configuración.");
      }
      throw traducirErrorBase(err);
    }
  }
}
