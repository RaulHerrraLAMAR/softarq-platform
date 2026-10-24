/**
 * Acceso a usuarios, pertenencias y sesiones (ADR-0007). Solo consultas de Prisma (parametrizadas).
 *
 * Con el rol de la aplicación:
 * - `usuario` y `membresia` solo se leen; el cambio propio de contraseña usa la función SECURITY
 *   DEFINER `softarq_cambiar_contrasena_propia` (módulo 13, ADR-0017);
 * - en `sesion` se inserta y se actualizan únicamente la actividad y la revocación (permisos por
 *   columna en PostgreSQL). No hay DELETE.
 */
import { FUNCIONES_SESION, type FuncionSesion } from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";

export interface CuentaParaAcceso {
  readonly usuarioId: string;
  readonly hashContrasena: string;
  readonly activo: boolean;
  /** Caducidad de la contraseña temporal vigente (`null` = definitiva). Módulo 13. */
  readonly temporalExpiraEn: Date | null;
  /** Pertenencias activas (en esta etapa el acceso exige exactamente una). */
  readonly membresiasActivas: readonly { organizacionId: string; funciones: readonly FuncionSesion[] }[];
}

/** PREVIA: formulario de acceso web. USUARIO: cookie web. MOVIL: Bearer del canal móvil (ADR-0020). */
export type TipoSesion = "PREVIA" | "USUARIO" | "MOVIL";

export interface SesionCompleta {
  readonly id: string;
  readonly tipo: TipoSesion;
  readonly creadaEn: Date;
  readonly ultimaActividadEn: Date;
  readonly expiraEn: Date;
  readonly revocadaEn: Date | null;
  /** Solo en sesiones de usuario: titular y pertenencia vigentes en la base en este momento. */
  readonly titular: {
    readonly usuarioId: string;
    readonly nombre: string;
    readonly correo: string;
    readonly usuarioActivo: boolean;
    readonly membresiaActiva: boolean;
    /** La contraseña vigente es temporal: la sesión queda restringida al cambio (módulo 13). */
    readonly temporalExpiraEn: Date | null;
    readonly funciones: readonly FuncionSesion[];
    readonly organizacion: { readonly id: string; readonly codigo: string; readonly nombre: string; readonly esDemo: boolean };
  } | null;
}

export interface NuevaSesion {
  readonly tipo: TipoSesion;
  readonly tokenHash: Buffer;
  readonly titular: { usuarioId: string; organizacionId: string } | null;
  readonly creadaEn: Date;
  readonly expiraEn: Date;
}

export type MotivoRevocacion =
  | "CIERRE"
  | "AUTENTICADA"
  | "REEMPLAZADA"
  | "USUARIO_INACTIVO"
  | "MEMBRESIA_INACTIVA"
  | "RESTABLECIMIENTO"
  // Módulo 13 (ADR-0017): los escriben las funciones de personas en la base.
  | "DESACTIVADA"
  | "CAMBIO_CONTRASENA";

const FUNCIONES_VALIDAS = new Set<string>(FUNCIONES_SESION);

export class RepositorioSesiones {
  constructor(private readonly prisma: PrismaClient) {}

  async cuentaPorCorreo(correoNormalizado: string): Promise<CuentaParaAcceso | null> {
    const u = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
      select: {
        id: true,
        hashContrasena: true,
        activo: true,
        contrasenaTemporalExpiraEn: true,
        membresias: { where: { activa: true }, select: { organizacionId: true, funciones: true } },
      },
    });
    if (!u) return null;
    return {
      usuarioId: u.id,
      hashContrasena: u.hashContrasena,
      activo: u.activo,
      temporalExpiraEn: u.contrasenaTemporalExpiraEn,
      membresiasActivas: u.membresias.map((m) => ({ organizacionId: m.organizacionId, funciones: m.funciones.filter((f): f is FuncionSesion => FUNCIONES_VALIDAS.has(f)) })),
    };
  }

  /** Sesión por hash de token, con su titular y pertenencia leídos en la misma consulta. */
  async sesionPorHash(tokenHash: Buffer): Promise<SesionCompleta | null> {
    const s = await this.prisma.sesion.findUnique({
      where: { tokenHash: new Uint8Array(tokenHash) },
      select: {
        id: true,
        tipo: true,
        creadaEn: true,
        ultimaActividadEn: true,
        expiraEn: true,
        revocadaEn: true,
        membresia: {
          select: {
            activa: true,
            funciones: true,
            usuario: { select: { id: true, nombre: true, correo: true, activo: true, contrasenaTemporalExpiraEn: true } },
            organizacion: { select: { id: true, codigo: true, nombre: true, esDemo: true } },
          },
        },
      },
    });
    if (!s) return null;
    const m = s.membresia;
    return {
      id: s.id,
      tipo: s.tipo === "USUARIO" || s.tipo === "MOVIL" ? s.tipo : "PREVIA",
      creadaEn: s.creadaEn,
      ultimaActividadEn: s.ultimaActividadEn,
      expiraEn: s.expiraEn,
      revocadaEn: s.revocadaEn,
      titular: m
        ? {
            usuarioId: m.usuario.id,
            nombre: m.usuario.nombre,
            correo: m.usuario.correo,
            usuarioActivo: m.usuario.activo,
            membresiaActiva: m.activa,
            temporalExpiraEn: m.usuario.contrasenaTemporalExpiraEn,
            funciones: m.funciones.filter((f): f is FuncionSesion => FUNCIONES_VALIDAS.has(f)),
            organizacion: m.organizacion,
          }
        : null,
    };
  }

  /** Hash vigente de la contraseña de un usuario activo (para verificar la actual en el cambio propio). */
  async hashDe(usuarioId: string): Promise<{ hash: string; temporalExpiraEn: Date | null } | null> {
    const u = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { hashContrasena: true, contrasenaTemporalExpiraEn: true, activo: true } });
    return u && u.activo ? { hash: u.hashContrasena, temporalExpiraEn: u.contrasenaTemporalExpiraEn } : null;
  }

  /** Cambio propio (función SECURITY DEFINER): contraseña definitiva y TODAS sus sesiones revocadas. */
  async cambiarContrasenaPropia(organizacionId: string, usuarioId: string, hash: string): Promise<void> {
    await this.prisma.$queryRaw`SELECT softarq_cambiar_contrasena_propia(${organizacionId}::uuid, ${usuarioId}::uuid, ${hash})::text AS r`;
  }

  async crear(n: NuevaSesion): Promise<string> {
    const s = await this.prisma.sesion.create({
      data: {
        tipo: n.tipo,
        tokenHash: new Uint8Array(n.tokenHash),
        organizacionId: n.titular?.organizacionId ?? null,
        usuarioId: n.titular?.usuarioId ?? null,
        creadaEn: n.creadaEn,
        ultimaActividadEn: n.creadaEn,
        expiraEn: n.expiraEn,
      },
      select: { id: true },
    });
    return s.id;
  }

  /**
   * Sustituye una sesión por otra de forma atómica (renovación al autenticar). Transacción por
   * lotes, no interactiva: dos sentencias sin lógica intermedia y sin el tiempo máximo de 5 s de las
   * transacciones interactivas, que un COMMIT lento del disco puede superar.
   */
  async reemplazar(anteriorId: string | null, motivo: MotivoRevocacion, nueva: NuevaSesion, ahora: Date): Promise<string> {
    const crear = this.prisma.sesion.create({
      data: {
        tipo: nueva.tipo,
        tokenHash: new Uint8Array(nueva.tokenHash),
        organizacionId: nueva.titular?.organizacionId ?? null,
        usuarioId: nueva.titular?.usuarioId ?? null,
        creadaEn: nueva.creadaEn,
        ultimaActividadEn: nueva.creadaEn,
        expiraEn: nueva.expiraEn,
      },
      select: { id: true },
    });
    if (!anteriorId) return (await crear).id;
    const [, creada] = await this.prisma.$transaction([
      this.prisma.sesion.updateMany({
        where: { id: anteriorId, revocadaEn: null },
        data: { revocadaEn: ahora, motivoRevocacion: motivo },
      }),
      crear,
    ]);
    return creada.id;
  }

  async registrarActividad(id: string, ahora: Date): Promise<void> {
    await this.prisma.sesion.updateMany({ where: { id, revocadaEn: null }, data: { ultimaActividadEn: ahora } });
  }

  async revocar(id: string, motivo: MotivoRevocacion, ahora: Date): Promise<void> {
    await this.prisma.sesion.updateMany({ where: { id, revocadaEn: null }, data: { revocadaEn: ahora, motivoRevocacion: motivo } });
  }
}
