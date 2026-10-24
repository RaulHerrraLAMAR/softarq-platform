import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * `true` si la persona pidió reducir el movimiento en el sistema (Android: «Quitar animaciones»). Con eso las
 * transiciones se sustituyen por cambios directos de estado: lo que se ve es lo mismo, sin animar.
 */
export function useMovimientoReducido(): boolean {
  const [reducido, poner] = useState(false);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (vivo) poner(v);
      })
      .catch(() => {});
    const suscripcion = AccessibilityInfo.addEventListener("reduceMotionChanged", poner);
    return () => {
      vivo = false;
      suscripcion.remove();
    };
  }, []);
  return reducido;
}
