import { useSyncExternalStore } from "react";
import type { ClienteApi } from "../api/cliente";
import { gestor } from "./instancia";
import type { EstadoSesion } from "./gestor";

/** Estado vigente de la sesión (la fuente es el gestor; la identidad y las capacidades las dicta el servidor). */
export function useSesion(): EstadoSesion {
  return useSyncExternalStore(gestor.suscribir, gestor.obtenerEstado, gestor.obtenerEstado);
}

export const useApi = (): ClienteApi => gestor.cliente;
export { gestor };
