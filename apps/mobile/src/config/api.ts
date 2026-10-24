/**
 * URL de la API (ADR-0020). `EXPO_PUBLIC_API_URL` es PÚBLICA: Expo la incorpora al código de la app,
 * así que solo puede contener una dirección, nunca credenciales.
 *
 * Se acepta únicamente:
 * - `http://localhost:PUERTO` o `http://127.0.0.1:PUERTO` (DEMO local; el teléfono llega a la laptop con
 *   `adb reverse`, así que "localhost" es la propia laptop; el HTTP en claro está permitido por Android
 *   solo hacia esos dos nombres, ver `plugins/red-local.js`);
 * - `https://…` (una etapa futura con TLS).
 *
 * Cualquier otra cosa (una IP de la red, `http` hacia un host remoto, rutas, usuario y contraseña, consulta
 * o fragmento) hace fallar el arranque: no se aceptan direcciones arbitrarias por accidente.
 */
export const URL_API_POR_OMISION = "http://localhost:3000";

export class ErrorConfiguracion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorConfiguracion";
  }
}

const HOSTS_HTTP_LOCALES = new Set(["localhost", "127.0.0.1"]);

export function validarUrlApi(valor: string | undefined): string {
  const bruto = (valor ?? "").trim() === "" ? URL_API_POR_OMISION : (valor as string).trim();
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new ErrorConfiguracion("EXPO_PUBLIC_API_URL no es una URL válida.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new ErrorConfiguracion("EXPO_PUBLIC_API_URL no puede llevar usuario ni contraseña.");
  }
  if (url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new ErrorConfiguracion("EXPO_PUBLIC_API_URL debe ser solo el origen (sin ruta, consulta ni fragmento).");
  }
  if (url.protocol === "http:") {
    if (!HOSTS_HTTP_LOCALES.has(url.hostname) || url.port === "") {
      throw new ErrorConfiguracion("Por http solo se admite localhost o 127.0.0.1 con puerto (DEMO local por USB).");
    }
  } else if (url.protocol !== "https:") {
    throw new ErrorConfiguracion("EXPO_PUBLIC_API_URL debe usar http (solo localhost) o https.");
  }
  return url.origin;
}
