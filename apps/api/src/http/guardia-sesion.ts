/**
 * Guardia global de autenticación y autorización (ADR-0007). **Niega por omisión.**
 *
 * Para cada ruta, según sus metadatos:
 * - `@Publico()`: sin sesión (salud, OpenAPI, token CSRF previo).
 * - `@ConSesionPrevia()`: exige la sesión previa de la cookie y su token CSRF (inicio de sesión).
 * - Cualquier otra: exige una sesión de usuario vigente y las capacidades de `@Requiere(...)`. Una ruta
 *   sin `@Requiere` se rechaza.
 *
 * En todo método con efectos (POST, PUT, PATCH, DELETE), incluidas las rutas públicas:
 * - la cabecera `Origin` debe estar en la lista permitida (defensa además de SameSite y CORS);
 * - con sesión, la cabecera `X-CSRF-Token` debe corresponder a esa sesión.
 */
import { Logger, SetMetadata, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { CABECERA_CSRF, type Capacidad } from "@softarq/contracts";
import type { Request, Response } from "express";
import type { ServicioAutenticacion } from "../modules/autenticacion/aplicacion/servicio-autenticacion.js";
import { fijarSesion } from "./contexto.js";
import { borrarCookieSesion, leerCookieSesion } from "./cookies.js";
import { ErrorApi, solicitudIdDe } from "./errores.js";

const META_ACCESO = "softarq:acceso";
const META_CAPACIDAD = "softarq:capacidad";
const METODOS_CON_EFECTOS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CABECERA_CSRF_MINUSCULAS = CABECERA_CSRF.toLowerCase();

type Acceso = "publico" | "previa";

/** Ruta sin sesión. */
export const Publico = () => SetMetadata(META_ACCESO, "publico" satisfies Acceso);
/** Ruta que exige la sesión previa al acceso y su token CSRF (solo el inicio de sesión). */
export const ConSesionPrevia = () => SetMetadata(META_ACCESO, "previa" satisfies Acceso);
/**
 * Capacidades que exige la ruta (matriz de ADR-0007 y ADR-0008); con varias, se exigen TODAS.
 * La del método sustituye a la del controlador.
 */
export const Requiere = (...capacidades: [Capacidad, ...Capacidad[]]) => SetMetadata(META_CAPACIDAD, capacidades);

const CLAVE_PREVIA = "sesionPrevia";

/** Sesión previa validada (solo en rutas `@ConSesionPrevia`). */
export function sesionPreviaDe(req: Request): { sesionId: string } {
  const s = req.res?.locals[CLAVE_PREVIA] as { sesionId: string } | undefined;
  if (!s) throw new Error("La ruta exige sesión previa, pero la guardia no la dejó.");
  return s;
}

export class GuardiaSesion implements CanActivate {
  private readonly registro: Logger | null;

  constructor(
    private readonly reflector: Reflector,
    private readonly servicio: ServicioAutenticacion,
    private readonly origenesPermitidos: readonly string[],
    registrar: boolean,
  ) {
    this.registro = registrar ? new Logger("Seguridad") : null;
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const res = contexto.switchToHttp().getResponse<Response>();
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    const acceso = this.reflector.getAllAndOverride<Acceso | undefined>(META_ACCESO, objetivos);
    const conEfectos = METODOS_CON_EFECTOS.has(req.method);

    if (conEfectos) {
      const origen = req.headers.origin;
      if (typeof origen !== "string" || !this.origenesPermitidos.includes(origen)) {
        throw new ErrorApi(403, "ORIGEN_NO_PERMITIDO", "El origen de la solicitud no está permitido.");
      }
    }
    if (acceso === "publico") return true;

    const token = leerCookieSesion(req);
    const csrf = req.headers[CABECERA_CSRF_MINUSCULAS];

    if (acceso === "previa") {
      const r = await this.servicio.resolverPrevia(token);
      if (r.estado !== "VIGENTE" || !this.servicio.csrfValido(csrf, r.sesion.sesionId)) {
        throw new ErrorApi(403, "CSRF_NO_VALIDO", "El formulario de acceso caducó o no es válido; vuelva a intentarlo.");
      }
      res.locals[CLAVE_PREVIA] = r.sesion;
      return true;
    }

    const r = await this.servicio.resolver(token);
    if (r.estado === "SIN_COOKIE") {
      throw new ErrorApi(401, "NO_AUTENTICADO", "Inicie sesión para continuar.");
    }
    if (r.estado === "NO_VALIDA") {
      borrarCookieSesion(res);
      this.registro?.log(`[${solicitudIdDe(res)}] SESION_NO_VALIDA motivo=${r.motivo}`);
      throw new ErrorApi(401, "SESION_NO_VALIDA", "La sesión venció o se cerró; inicie sesión de nuevo.");
    }
    if (conEfectos && !this.servicio.csrfValido(csrf, r.sesion.sesionId)) {
      throw new ErrorApi(403, "CSRF_NO_VALIDO", "La solicitud no lleva un token CSRF válido para esta sesión.");
    }
    const exigidas = this.reflector.getAllAndOverride<readonly Capacidad[] | undefined>(META_CAPACIDAD, objetivos);
    if (exigidas === undefined || exigidas.length === 0 || !exigidas.every((c) => r.sesion.capacidades.includes(c))) {
      throw new ErrorApi(403, "SIN_PERMISO", "Su función no permite esta operación.");
    }
    fijarSesion(req, r.sesion);
    return true;
  }
}
