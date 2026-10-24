/**
 * Guardia global de autenticación y autorización (ADR-0007). **Niega por omisión.**
 *
 * Para cada ruta, según sus metadatos:
 * - `@Publico()`: sin sesión (salud, OpenAPI, token CSRF previo).
 * - `@ConSesionPrevia()`: exige la sesión previa de la cookie y su token CSRF (inicio de sesión).
 * - Cualquier otra: exige una sesión de usuario vigente y las capacidades de `@Requiere(...)`. Una ruta
 *   sin `@Requiere` se rechaza.
 * - Módulo 13 (ADR-0017): con una contraseña temporal pendiente de cambio solo pasan las rutas marcadas
 *   con `@PermitidaConCambioPendiente()` (consultar la sesión, cambiar la contraseña y cerrar); el resto
 *   responde 403 CAMBIO_CONTRASENA_REQUERIDO aunque el cliente lo intente.
 *
 * En todo método con efectos (POST, PUT, PATCH, DELETE), incluidas las rutas públicas:
 * - la cabecera `Origin` debe estar en la lista permitida (defensa además de SameSite y CORS);
 * - con sesión, la cabecera `X-CSRF-Token` debe corresponder a esa sesión.
 *
 * Canal móvil (módulo 16, ADR-0020), separado del anterior:
 * - `@AccesoMovil()`: inicio de sesión de la app. No lleva cookie ni sesión previa; se rechaza si trae
 *   `Origin` (las solicitudes de un navegador siempre lo llevan) o `Authorization`.
 * - `Authorization: Bearer <token>`: el token es una sesión de tipo MOVIL, que `resolverMovil` valida
 *   en cada solicitud (revocación, expiración, inactividad, usuario y pertenencia activos). No es una
 *   credencial ambiental, así que no hay CSRF ni requisito de `Origin`. La cookie se ignora.
 * - Lista blanca: con Bearer solo pasan las rutas marcadas con `@PermitidaEnMovil()`; el resto responde
 *   403. Ninguna cabecera "soy móvil" concede nada: manda el token y las capacidades de la pertenencia.
 * - Un token de cookie web no sirve como Bearer ni uno móvil como cookie (tipos de sesión distintos).
 */
import { Logger, SetMetadata, type CanActivate, type ExecutionContext, type Type } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { CABECERA_CSRF, type Capacidad } from "@softarq/contracts";
import type { Request, Response } from "express";
import type { ContextoSesion, ServicioAutenticacion } from "../modules/autenticacion/aplicacion/servicio-autenticacion.js";
import { fijarSesion } from "./contexto.js";
import { borrarCookieSesion, leerCookieSesion } from "./cookies.js";
import { ErrorApi, solicitudIdDe } from "./errores.js";

const META_ACCESO = "softarq:acceso";
const META_CAPACIDAD = "softarq:capacidad";
const META_CAMBIO_PENDIENTE = "softarq:cambio-pendiente";
const METODOS_CON_EFECTOS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CABECERA_CSRF_MINUSCULAS = CABECERA_CSRF.toLowerCase();

const META_MOVIL = "softarq:movil";

type Acceso = "publico" | "previa" | "movil";

/** Ruta sin sesión. */
export const Publico = () => SetMetadata(META_ACCESO, "publico" satisfies Acceso);
/** Inicio de sesión del canal móvil: sin cookie ni sesión previa; solo para clientes que no son navegadores (ADR-0020). */
export const AccesoMovil = () => SetMetadata(META_ACCESO, "movil" satisfies Acceso);
/** Ruta que una sesión móvil (Bearer) puede usar. Lista blanca explícita: sin esta marca, el Bearer recibe 403. */
export const PermitidaEnMovil = () => SetMetadata(META_MOVIL, true);

/** Token del `Authorization: Bearer`. `undefined` = sin cabecera; `null` = cabecera presente pero que no es un Bearer con token. */
export function leerBearer(req: Request): string | null | undefined {
  const cabecera = req.headers.authorization;
  if (cabecera === undefined) return undefined;
  const m = /^Bearer ([A-Za-z0-9_-]{1,128})$/.exec(cabecera);
  return m?.[1] ?? null;
}
/** Ruta que exige la sesión previa al acceso y su token CSRF (solo el inicio de sesión). */
export const ConSesionPrevia = () => SetMetadata(META_ACCESO, "previa" satisfies Acceso);
/**
 * Capacidades que exige la ruta (matriz de ADR-0007 y ADR-0008); con varias, se exigen TODAS.
 * La del método sustituye a la del controlador.
 */
export const Requiere = (...capacidades: [Capacidad, ...Capacidad[]]) => SetMetadata(META_CAPACIDAD, capacidades);

/** Ruta que una sesión con contraseña temporal pendiente sí puede usar (módulo 13). */
export const PermitidaConCambioPendiente = () => SetMetadata(META_CAMBIO_PENDIENTE, true);

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

    if (acceso === "movil") {
      // Inicio de sesión móvil: nada ambiental. Un navegador siempre envía Origin en un POST.
      if (typeof req.headers.origin === "string" || req.headers.authorization !== undefined) {
        throw new ErrorApi(403, "ACCESO_MOVIL_NO_PERMITIDO", "Este acceso es solo para la app móvil.");
      }
      return true;
    }
    const bearer = leerBearer(req);
    if (bearer !== undefined) return this.autorizarMovil(req, res, objetivos, acceso, bearer);

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
    this.completar(req, objetivos, r.sesion);
    return true;
  }

  /** Solicitud con `Authorization: Bearer` (canal móvil, ADR-0020). */
  private async autorizarMovil(
    req: Request,
    res: Response,
    objetivos: (Function | Type<unknown>)[],
    acceso: Acceso | undefined,
    bearer: string | null,
  ): Promise<boolean> {
    if (acceso === "publico") return true; // salud y OpenAPI no usan la sesión
    if (acceso === "previa" || this.reflector.getAllAndOverride<boolean | undefined>(META_MOVIL, objetivos) !== true) {
      throw new ErrorApi(403, "RUTA_NO_DISPONIBLE_EN_MOVIL", "Esta operación no está disponible en la app móvil.");
    }
    if (bearer === null) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicie sesión para continuar.");
    const r = await this.servicio.resolverMovil(bearer);
    if (r.estado !== "VIGENTE") {
      const motivo = r.estado === "NO_VALIDA" ? r.motivo : "SIN_TOKEN";
      this.registro?.log(`[${solicitudIdDe(res)}] SESION_MOVIL_NO_VALIDA motivo=${motivo}`);
      throw new ErrorApi(401, "SESION_NO_VALIDA", "La sesión venció o se cerró; inicie sesión de nuevo.");
    }
    this.completar(req, objetivos, r.sesion);
    return true;
  }

  /** Contraseña temporal pendiente, capacidades exigidas y contexto de la solicitud (comunes a ambos canales). */
  private completar(req: Request, objetivos: (Function | Type<unknown>)[], sesion: ContextoSesion): void {
    if (sesion.cambioContrasenaRequerido && this.reflector.getAllAndOverride<boolean | undefined>(META_CAMBIO_PENDIENTE, objetivos) !== true) {
      throw new ErrorApi(403, "CAMBIO_CONTRASENA_REQUERIDO", "Cambie su contraseña temporal antes de continuar.");
    }
    const exigidas = this.reflector.getAllAndOverride<readonly Capacidad[] | undefined>(META_CAPACIDAD, objetivos);
    if (exigidas === undefined || exigidas.length === 0 || !exigidas.every((c) => sesion.capacidades.includes(c))) {
      throw new ErrorApi(403, "SIN_PERMISO", "Su función no permite esta operación.");
    }
    fijarSesion(req, sesion);
  }
}
