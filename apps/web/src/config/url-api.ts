/**
 * Validación de la URL pública de la API (VITE_API_URL). La usan `vite.config.ts` (falla la
 * compilación o el arranque) y la aplicación en ejecución. Sin dependencias del navegador.
 *
 * Solo se admite la API local: http sobre `localhost`, con puerto y sin ruta, credenciales,
 * consulta ni fragmento. Nunca contiene secretos.
 *
 * Por qué `localhost` y no `127.0.0.1` (ADR-0007): la web se abre en http://localhost:5173 y la
 * cookie de sesión es `SameSite=Strict` y host-only. Con la API en 127.0.0.1 serían *sites*
 * distintos y el navegador no enviaría la cookie. La API sigue escuchando solo en 127.0.0.1.
 */
export const URL_API_POR_OMISION = "http://localhost:3000";

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
  if (url.hostname !== "localhost") {
    return {
      ok: false,
      motivo: "VITE_API_URL debe usar el host localhost (el mismo site que la web, para la cookie de sesión).",
    };
  }
  if (url.username || url.password) return { ok: false, motivo: "VITE_API_URL no puede llevar credenciales." };
  if (url.pathname !== "/" || url.search || url.hash) {
    return { ok: false, motivo: "VITE_API_URL debe ser solo el origen, sin ruta ni consulta." };
  }
  if (!url.port) return { ok: false, motivo: "VITE_API_URL debe indicar el puerto." };
  return { ok: true, url: url.origin };
}
