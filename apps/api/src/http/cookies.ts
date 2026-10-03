/**
 * Cookie de sesión (ADR-0007 §4).
 *
 * - `HttpOnly`: el JavaScript de la página no puede leerla.
 * - Host-only: sin atributo `Domain`; solo la recibe el host que la emitió (`localhost`).
 * - `Path=/api/v1` y `SameSite=Strict`, explícitos.
 * - `Max-Age` igual a lo que falta para la expiración absoluta (el servidor la aplica de todos modos).
 * - **Excepción local de `Secure`:** se omite porque la API solo funciona por HTTP en
 *   127.0.0.1 (`API_HOST` no admite otro valor, los orígenes deben ser http locales y
 *   `NODE_ENV=production` se rechaza al arrancar). Antes de publicar: TLS, `Secure` y prefijo `__Host-`.
 */
import { parse, serialize, type CookieSerializeOptions } from "cookie";
import type { Request, Response } from "express";

export const NOMBRE_COOKIE_SESION = "softarq_sesion";
const RUTA_COOKIE = "/api/v1";

const BASE: CookieSerializeOptions = {
  httpOnly: true,
  sameSite: "strict",
  path: RUTA_COOKIE,
  secure: false,
};

/** Valor de la cookie de sesión de la solicitud, si existe (sin validarlo). */
export function leerCookieSesion(req: Request): string | undefined {
  const cabecera = req.headers.cookie;
  if (!cabecera || cabecera.length > 4096) return undefined;
  const valor = parse(cabecera)[NOMBRE_COOKIE_SESION];
  return valor === undefined || valor === "" ? undefined : valor;
}

export function escribirCookieSesion(res: Response, token: string, expiraEn: Date, ahora: Date): void {
  const maxAge = Math.max(1, Math.floor((expiraEn.getTime() - ahora.getTime()) / 1000));
  agregar(res, serialize(NOMBRE_COOKIE_SESION, token, { ...BASE, maxAge }));
}

export function borrarCookieSesion(res: Response): void {
  agregar(res, serialize(NOMBRE_COOKIE_SESION, "", { ...BASE, maxAge: 0, expires: new Date(0) }));
}

function agregar(res: Response, cookie: string): void {
  // Una sola cookie de sesión por respuesta: la última decisión sustituye a la anterior.
  const previas = res.getHeader("Set-Cookie");
  const lista = (Array.isArray(previas) ? previas : previas ? [String(previas)] : []).filter(
    (c) => !c.startsWith(`${NOMBRE_COOKIE_SESION}=`),
  );
  res.setHeader("Set-Cookie", [...lista, cookie]);
}
