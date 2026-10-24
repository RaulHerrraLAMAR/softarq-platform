import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Vuelve a cargar una pantalla cuando recupera el foco (por ejemplo al volver del recorrido a las listas), sin repetir la
 * carga inicial. Siempre llama a la versión más reciente de `recargar`.
 */
export function useRecargarAlEnfocar(recargar: () => void): void {
  const ultima = useRef(recargar);
  ultima.current = recargar;
  const primera = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primera.current) {
        primera.current = false;
        return;
      }
      ultima.current();
    }, []),
  );
}
