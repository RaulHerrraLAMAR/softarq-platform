import { validarUrlApi } from "./api";

/**
 * Expo sustituye `process.env.EXPO_PUBLIC_*` por su valor al empaquetar; hay que escribirlo literalmente.
 * Es configuración pública (una URL), nunca un secreto.
 */
export const URL_API = validarUrlApi(process.env.EXPO_PUBLIC_API_URL);
