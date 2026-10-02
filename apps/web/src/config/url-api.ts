/**
 * Validación de la URL pública de la API (VITE_API_URL). La usan `vite.config.ts` (falla la
 * compilación o el arranque) y la aplicación en ejecución. Sin dependencias del navegador.
 *
 * Solo se admite la API local: http sobre 127.0.0.1 o localhost, con puerto y sin ruta,
 * credenciales, consulta ni fragmento. Nunca contiene secretos.
 */
export const URL_API_POR_OMISION = "http://127.0.0.1:3000";

const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost"]);

export type ResultadoUrlApi = { ok: true; url: string } | { ok: false; motivo: string };

export function validarUrlApi(valor: string | undefined): ResultadoUrlApi {
  const texto = (valor ?? "").trim() || URL_API_POR_OMISION;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, motivo: "VITE_API_URL no es una URL válida." };
  }
  if (url.protocol !== "http:") return { ok: false, motivo: "VITE_API_URL debe usar http (API local)." };
  if (!HOSTS_LOCALES.has(url.hostname)) {
    return { ok: false, motivo: "VITE_API_URL debe apuntar a 127.0.0.1 o localhost." };
  }
  if (url.username || url.password) return { ok: false, motivo: "VITE_API_URL no puede llevar credenciales." };
  if (url.pathname !== "/" || url.search || url.hash) {
    return { ok: false, motivo: "VITE_API_URL debe ser solo el origen, sin ruta ni consulta." };
  }
  if (!url.port) return { ok: false, motivo: "VITE_API_URL debe indicar el puerto." };
  return { ok: true, url: url.origin };
}
