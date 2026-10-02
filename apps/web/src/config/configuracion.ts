/**
 * Configuración pública de la web en ejecución. `vite.config.ts` ya validó VITE_API_URL al
 * compilar; aquí se vuelve a validar por defensa (y para las pruebas).
 */
import { validarUrlApi, type ResultadoUrlApi } from "./url-api.ts";

export function leerConfiguracion(): ResultadoUrlApi {
  return validarUrlApi(import.meta.env.VITE_API_URL as string | undefined);
}
