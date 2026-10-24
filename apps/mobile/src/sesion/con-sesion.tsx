import type { ReactNode } from "react";
import type { RespuestaSesionMovil } from "@softarq/contracts/movil";
import { useSesion } from "./uso";

/**
 * Entrega la sesión vigente a una pantalla protegida. Durante el cierre o la pérdida de sesión React puede
 * renderizar una vez más antes de que la navegación desmonte el grupo: sin sesión no se pinta nada
 * (ni datos de la cuenta anterior ni errores).
 */
export function ConSesion({ hijos }: { hijos: (sesion: RespuestaSesionMovil, generacion: number) => ReactNode }) {
  const { sesion, generacion } = useSesion();
  return sesion ? <>{hijos(sesion, generacion)}</> : null;
}
