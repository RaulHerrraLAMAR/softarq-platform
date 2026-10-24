/**
 * Repositorio de parámetros y personas (módulo 13, ADR-0017).
 *
 * - Lecturas con Prisma, siempre con la organización de la sesión en el `where`.
 * - Escrituras SOLO con las funciones de la migración `20261019120000_parametros_personas`:
 *   `softarq_editar_parametros` (INVOKER, columnas mínimas) y las de personas (SECURITY DEFINER: la
 *   aplicación no tiene INSERT ni UPDATE en `usuario` ni `membresia`).
 * - Nunca lee ni devuelve hashes de contraseña.
 */
import type { FuncionUsuario, ParametrosAdmin, PersonaAdmin } from "@softarq/contracts";
import { FUNCIONES_USUARIO } from "@softarq/contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import { textoDeDecimalOpcional } from "../../../infraestructura/prisma/decimales.js";
import type { Idempotencia, RegistroIdempotencia } from "../../cotizaciones/aplicacion/idempotencia.js";
import type { AutorAdmin } from "../../catalogos/persistencia/repositorio-administracion.js";
import type { ContextoOrganizacion, Db } from "../../catalogos/persistencia/repositorio-catalogos.js";

const nombreDe = { select: { usuario: { select: { nombre: true } } } } as const;
const FUNCIONES = new Set<string>(FUNCIONES_USUARIO);

const seleccionPersona = {
  usuarioId: true,
  funciones: true,
  activa: true,
  revision: true,
  creadaEn: true,
  modificadaEn: true,
  modificador: nombreDe,
  usuario: { select: { correo: true, nombre: true, contrasenaTemporalExpiraEn: true } },
} satisfies Prisma.MembresiaSelect;

type FilaPersona = Prisma.MembresiaGetPayload<{ select: typeof seleccionPersona }>;

function aPersona(f: FilaPersona): PersonaAdmin {
  return {
    id: f.usuarioId,
    correo: f.usuario.correo,
    nombre: f.usuario.nombre,
    funciones: f.funciones.filter((x): x is FuncionUsuario => FUNCIONES.has(x)),
    activa: f.activa,
    cambioContrasenaPendiente: f.usuario.contrasenaTemporalExpiraEn !== null,
    temporalExpiraEn: f.usuario.contrasenaTemporalExpiraEn ? f.usuario.contrasenaTemporalExpiraEn.toISOString() : null,
    revision: f.revision,
    creadaEn: f.creadaEn.toISOString(),
    modificadaEn: f.modificadaEn.toISOString(),
    modificadaPor: f.modificador?.usuario.nombre ?? null,
  };
}

export class RepositorioAdministracionSistema {
  constructor(private readonly db: Db) {}

  // ------------------------------- parámetros -------------------------------

  async obtenerParametros(ctx: ContextoOrganizacion): Promise<ParametrosAdmin | null> {
    const p = await this.db.parametrosCalculo.findUnique({
      where: { organizacionId: ctx.organizacionId },
      select: {
        ambiente: true,
        moneda: true,
        recargoSobreCosto: true,
        impuestoTasa: true,
        impuestoBase: true,
        impuestoTratamiento: true,
        impuestoNombre: true,
        vigenciaDias: true,
        textoAlcance: true,
        textoCondiciones: true,
        textoExclusiones: true,
        revision: true,
        modificadoEn: true,
        modificador: nombreDe,
      },
    });
    if (!p) return null;
    return {
      ambiente: p.ambiente === "PRODUCCION" ? "PRODUCCION" : "DEMO",
      moneda: "MXN",
      recargoSobreCosto: textoDeDecimalOpcional(p.recargoSobreCosto),
      impuesto:
        p.impuestoTasa === null
          ? null
          : { tasa: textoDeDecimalOpcional(p.impuestoTasa)!, base: p.impuestoBase ?? "", tratamiento: p.impuestoTratamiento ?? "", nombre: p.impuestoNombre ?? "" },
      vigenciaDias: p.vigenciaDias,
      textos:
        p.textoAlcance === null ? null : { alcance: p.textoAlcance, condiciones: p.textoCondiciones ?? "", exclusiones: p.textoExclusiones ?? "" },
      revision: p.revision,
      modificadoEn: p.modificadoEn.toISOString(),
      modificadoPor: p.modificador?.usuario.nombre ?? null,
    };
  }

  async editarParametros(ctx: ContextoOrganizacion, autor: AutorAdmin, revision: number, cambios: Record<string, unknown>, motivo: string): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_parametros(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb, ${motivo}
      ) AS revision`;
    return filas[0]!.revision;
  }

  // -------------------------------- personas --------------------------------

  async listarPersonas(
    ctx: ContextoOrganizacion,
    f: { buscar?: string; incluirInactivas: boolean; despuesDe?: string; limite: number },
  ): Promise<{ filas: PersonaAdmin[]; siguiente: string | null }> {
    const filas = await this.db.membresia.findMany({
      where: {
        organizacionId: ctx.organizacionId,
        // Módulo 17: las cuentas de cliente de la app se administran con sus propias funciones de acceso.
        NOT: { funciones: { has: "CLIENTE" } },
        ...(f.incluirInactivas ? {} : { activa: true }),
        usuario: {
          ...(f.buscar
            ? { OR: [{ correo: { contains: f.buscar, mode: "insensitive" as const } }, { nombre: { contains: f.buscar, mode: "insensitive" as const } }] }
            : {}),
          ...(f.despuesDe ? { correo: { gt: f.despuesDe } } : {}),
        },
      },
      select: seleccionPersona,
      orderBy: { usuario: { correo: "asc" } },
      take: f.limite + 1,
    });
    const pagina = filas.slice(0, f.limite).map(aPersona);
    return { filas: pagina, siguiente: filas.length > f.limite ? pagina[pagina.length - 1]!.correo : null };
  }

  async obtenerPersona(ctx: ContextoOrganizacion, usuarioId: string): Promise<PersonaAdmin | null> {
    const f = await this.db.membresia.findFirst({ where: { organizacionId: ctx.organizacionId, usuarioId, NOT: { funciones: { has: "CLIENTE" } } }, select: seleccionPersona });
    return f ? aPersona(f) : null;
  }

  /** ¿Ya existe el correo? (global: no se dice de qué organización). */
  async correoRegistrado(correo: string): Promise<boolean> {
    return (await this.db.usuario.count({ where: { correo } })) > 0;
  }

  async crearPersona(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    datos: { correo: string; nombre: string; funciones: readonly string[]; motivo: string },
    hash: string,
    temporalExpiraEn: Date,
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_crear_persona(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${JSON.stringify(datos)}::jsonb, ${hash}, ${temporalExpiraEn}::timestamptz,
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async editarPersona(ctx: ContextoOrganizacion, autor: AutorAdmin, usuarioId: string, revision: number, cambios: Record<string, unknown>, motivo: string): Promise<number> {
    const filas = await this.db.$queryRaw<{ revision: number }[]>`
      SELECT softarq_editar_persona(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${usuarioId}::uuid, ${revision}::integer, ${JSON.stringify(cambios)}::jsonb, ${motivo}
      ) AS revision`;
    return filas[0]!.revision;
  }

  async restablecerContrasena(
    ctx: ContextoOrganizacion,
    autor: AutorAdmin,
    usuarioId: string,
    hash: string,
    temporalExpiraEn: Date,
    motivo: string,
    idem: Idempotencia,
  ): Promise<string> {
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_restablecer_contrasena(
        ${ctx.organizacionId}::uuid, ${autor.usuarioId}::uuid, ${usuarioId}::uuid, ${hash}, ${temporalExpiraEn}::timestamptz, ${motivo},
        ${idem.clave}::uuid, ${idem.operacion}, ${idem.huella}, ${idem.expiraEn}::timestamptz
      )::text AS id`;
    return filas[0]!.id;
  }

  async buscarIdempotencia(ctx: ContextoOrganizacion, autor: AutorAdmin, clave: string): Promise<RegistroIdempotencia | null> {
    return this.db.idempotencia.findUnique({
      where: { organizacionId_usuarioId_clave: { organizacionId: ctx.organizacionId, usuarioId: autor.usuarioId, clave } },
      select: { operacion: true, huellaSolicitud: true, recursoId: true, expiraEn: true },
    });
  }
}
