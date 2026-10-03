/**
 * Contexto de cada solicitud (ADR-0007): sustituye al contexto DEMO fijo de ADR-0005.
 *
 * La identidad, la organización y las funciones las deja la guardia de sesión en `res.locals`
 * tras validar la cookie contra la base; nunca proceden del cuerpo, la query ni las cabeceras.
 * Sin sesión válida no hay contexto (la guardia ya respondió 401).
 */
import type { Request } from "express";
import type { ContextoSesion } from "../modules/autenticacion/aplicacion/servicio-autenticacion.js";
import type { ServicioBaseDeDatos } from "./base-de-datos.js";
import type { ContextoOrganizacion } from "../modules/catalogos/persistencia/repositorio-catalogos.js";

const CLAVE_SESION = "sesion";

export function fijarSesion(req: Request, sesion: ContextoSesion): void {
  if (req.res) req.res.locals[CLAVE_SESION] = sesion;
}

/** Sesión validada de la solicitud. Lanza si una ruta protegida llega sin ella (error de programación). */
export function sesionDe(req: Request): ContextoSesion {
  const s = req.res?.locals[CLAVE_SESION] as ContextoSesion | undefined;
  if (!s) throw new Error("La ruta exige sesión, pero la guardia no dejó ningún contexto.");
  return s;
}

/** Organización de la sesión, para filtrar las consultas de catálogo. */
export function organizacionDe(req: Request): ContextoOrganizacion {
  return { organizacionId: sesionDe(req).organizacion.id };
}

export class ErrorArranque extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorArranque";
  }
}

/**
 * Validación al iniciar el servicio (falla el arranque si no se cumple): el rol de la conexión no
 * tiene privilegios especiales, ni `CREATE` en el esquema, ni es propietario de la base.
 */
export async function comprobarRolAplicacion(bd: ServicioBaseDeDatos): Promise<void> {
  const roles = await bd.cliente.$queryRaw<
    {
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
      crea_en_esquema: boolean;
      es_propietario: boolean;
    }[]
  >`SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
           has_schema_privilege(current_user, 'public', 'CREATE') AS crea_en_esquema,
           (SELECT d.datdba FROM pg_database d WHERE d.datname = current_database()) = r.oid AS es_propietario
      FROM pg_roles r WHERE r.rolname = current_user`;
  const rol = roles[0];
  if (
    !rol ||
    rol.rolsuper ||
    rol.rolcreatedb ||
    rol.rolcreaterole ||
    rol.rolbypassrls ||
    rol.crea_en_esquema ||
    rol.es_propietario
  ) {
    throw new ErrorArranque(
      "El rol de DATABASE_URL tiene privilegios de administración o de esquema; el servidor debe usar softarq_app.",
    );
  }
}
