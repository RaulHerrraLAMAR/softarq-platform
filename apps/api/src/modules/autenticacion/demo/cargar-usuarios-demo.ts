/**
 * Carga idempotente de las cuentas DEMO (ADR-0007 §6). Se ejecuta con el ROL MIGRADOR: la
 * aplicación no puede crear ni modificar usuarios ni pertenencias.
 *
 * - Solo para organizaciones DEMO con parámetros en ambiente DEMO.
 * - Una cuenta que ya existe se conserva TAL CUAL (nunca se cambia su contraseña en silencio).
 * - `restablecer` (explícito) genera una contraseña nueva para cuentas DEMO existentes y revoca
 *   sus sesiones.
 * - Las contraseñas se generan con `randomBytes` y solo se devuelven al llamador; en la base
 *   únicamente queda su hash Argon2id.
 */
import { randomBytes } from "node:crypto";
import type { FuncionUsuario } from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { normalizarCorreo } from "../dominio/politica.js";
import type { ServicioContrasenas } from "../infraestructura/contrasenas.js";

export interface CuentaDemo {
  readonly correo: string;
  readonly nombre: string;
  readonly funciones: readonly FuncionUsuario[];
}

/**
 * Cuentas del libro (modBuild.bas): `[DEMO] Preparador 1`, `[DEMO] Revisor 1` y, desde el módulo 8,
 * `[DEMO] Administrador` (FN_ADMCAT y FN_ADMSIS en el libro): configura los datos del emisor.
 * `.test`: RFC 2606. El orden se conserva (las pruebas E2E citan las dos primeras por posición).
 */
export const CUENTAS_DEMO: readonly CuentaDemo[] = [
  { correo: "preparador.demo@softarq.test", nombre: "[DEMO] Preparador 1", funciones: ["PREPARADOR"] },
  { correo: "revisor.demo@softarq.test", nombre: "[DEMO] Revisor 1", funciones: ["REVISOR"] },
  { correo: "administrador.demo@softarq.test", nombre: "[DEMO] Administrador", funciones: ["ADMIN_CATALOGO", "ADMIN_SISTEMA"] },
];

export interface CredencialGenerada {
  readonly correo: string;
  readonly nombre: string;
  readonly funciones: readonly FuncionUsuario[];
  readonly contrasena: string;
}

export interface ResumenCargaUsuarios {
  readonly creadas: CredencialGenerada[];
  readonly restablecidas: CredencialGenerada[];
  readonly conservadas: string[];
  /** Pertenencias añadidas a cuentas que ya existían (sin tocar su contraseña). */
  readonly pertenenciasAgregadas: string[];
}

export class ErrorCargaUsuarios extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCargaUsuarios";
  }
}

/** 18 bytes aleatorios en base64url: 24 caracteres. */
export const generarContrasena = (): string => randomBytes(18).toString("base64url");

export async function cargarUsuariosDemo(
  migrador: PrismaClient,
  contrasenas: ServicioContrasenas,
  opciones: { organizacion: string; cuentas?: readonly CuentaDemo[]; restablecer?: readonly string[] },
): Promise<ResumenCargaUsuarios> {
  const cuentas = opciones.cuentas ?? CUENTAS_DEMO;
  const restablecer = new Set((opciones.restablecer ?? []).map(normalizarCorreo));
  for (const c of restablecer) {
    if (!cuentas.some((x) => normalizarCorreo(x.correo) === c)) {
      throw new ErrorCargaUsuarios(`Solo se pueden restablecer cuentas DEMO de la lista; ${c} no lo es.`);
    }
  }

  const org = await migrador.organizacion.findUnique({
    where: { codigo: opciones.organizacion },
    select: { id: true, esDemo: true, parametros: { select: { ambiente: true } } },
  });
  if (!org) throw new ErrorCargaUsuarios(`No existe la organización ${opciones.organizacion}. Ejecute db:cargar-demo.`);
  if (!org.esDemo || org.parametros?.ambiente !== "DEMO") {
    throw new ErrorCargaUsuarios(`La organización ${opciones.organizacion} no es DEMO: no se cargan cuentas DEMO.`);
  }

  // Los hashes se calculan fuera de la transacción (Argon2id tarda decenas de milisegundos).
  const resumen: ResumenCargaUsuarios = { creadas: [], restablecidas: [], conservadas: [], pertenenciasAgregadas: [] };
  for (const cuenta of cuentas) {
    const correo = normalizarCorreo(cuenta.correo);
    const existente = await migrador.usuario.findUnique({
      where: { correo },
      select: { id: true, esDemo: true, membresias: { where: { organizacionId: org.id }, select: { id: true } } },
    });

    if (!existente) {
      const contrasena = generarContrasena();
      const hashContrasena = await contrasenas.crearHash(contrasena);
      // Una sola sentencia anidada: usuario y pertenencia se crean juntos o ninguno.
      await migrador.usuario.create({
        data: {
          correo,
          nombre: cuenta.nombre,
          hashContrasena,
          esDemo: true,
          membresias: { create: { organizacionId: org.id, funciones: [...cuenta.funciones] } },
        },
        select: { id: true },
      });
      resumen.creadas.push({ correo, nombre: cuenta.nombre, funciones: cuenta.funciones, contrasena });
      continue;
    }

    if (!existente.esDemo) throw new ErrorCargaUsuarios(`La cuenta ${correo} existe y no es DEMO: no se modifica.`);
    if (existente.membresias.length === 0) {
      await migrador.membresia.create({
        data: { organizacionId: org.id, usuarioId: existente.id, funciones: [...cuenta.funciones] },
      });
      resumen.pertenenciasAgregadas.push(correo);
    }
    if (restablecer.has(correo)) {
      const contrasena = generarContrasena();
      const hashContrasena = await contrasenas.crearHash(contrasena);
      const ahora = new Date();
      await migrador.$transaction([
        migrador.usuario.update({ where: { id: existente.id }, data: { hashContrasena, contrasenaCambiadaEn: ahora } }),
        migrador.sesion.updateMany({
          where: { usuarioId: existente.id, revocadaEn: null },
          data: { revocadaEn: ahora, motivoRevocacion: "RESTABLECIMIENTO" },
        }),
      ]);
      resumen.restablecidas.push({ correo, nombre: cuenta.nombre, funciones: cuenta.funciones, contrasena });
    } else {
      resumen.conservadas.push(correo);
    }
  }
  return resumen;
}
