/**
 * Contexto de organización de cada solicitud.
 *
 * En este módulo es FIJO: la organización DEMO configurada en el servidor
 * (SOFTARQ_ORGANIZACION_DEMO). No proviene del cuerpo, la query ni las cabeceras del cliente.
 * NO es autenticación ni autorización: es el punto único que se sustituirá por el contexto del
 * usuario autenticado (ADR-0005).
 */
import type { Request } from "express";
import type {
  ContextoOrganizacion,
  RepositorioCatalogos,
} from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import type { ServicioBaseDeDatos } from "./base-de-datos.js";

export interface ContextoSolicitud {
  /** Contexto de organización para la solicitud. Hoy ignora la solicitud y devuelve la DEMO. */
  de(req: Request): ContextoOrganizacion;
}

export class ContextoDemoFijo implements ContextoSolicitud {
  constructor(private readonly ctx: ContextoOrganizacion) {}
  de(_req: Request): ContextoOrganizacion {
    return this.ctx;
  }
}

export class ErrorArranque extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorArranque";
  }
}

/**
 * Validaciones al iniciar el servicio (falla el arranque si no se cumplen):
 * - el rol de la conexión no tiene privilegios especiales;
 * - la organización configurada existe, es DEMO y sus parámetros están en ambiente DEMO.
 */
export async function resolverContextoDemo(
  bd: ServicioBaseDeDatos,
  repo: RepositorioCatalogos,
  codigoOrganizacion: string,
): Promise<ContextoSolicitud> {
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
  const org = await repo.organizacionPorCodigo(codigoOrganizacion);
  if (!org) throw new ErrorArranque(`No existe la organización ${codigoOrganizacion}. Ejecute db:cargar-demo.`);
  if (!org.esDemo) throw new ErrorArranque(`La organización ${codigoOrganizacion} no es DEMO.`);
  const ctx = { organizacionId: org.id };
  const parametros = await repo.obtenerParametros(ctx);
  if (parametros?.ambiente !== "DEMO") {
    throw new ErrorArranque(`Los parámetros de ${codigoOrganizacion} no están en ambiente DEMO.`);
  }
  return new ContextoDemoFijo(ctx);
}
