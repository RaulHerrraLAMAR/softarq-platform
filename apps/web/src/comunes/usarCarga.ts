/**
 * Carga asíncrona con cancelación: al cambiar las dependencias o desmontar, la solicitud anterior
 * se cancela y su respuesta se descarta (nunca reaparecen datos de otra pantalla o identidad).
 */
import { useCallback, useEffect, useState } from "react";
import type { FalloApi, ResultadoApi } from "../api/cliente.ts";

export type EstadoCarga<T> = { fase: "cargando" } | { fase: "listo"; datos: T } | { fase: "error"; fallo: FalloApi };

export function useCarga<T>(cargar: (signal: AbortSignal) => Promise<ResultadoApi<T>>, dependencias: readonly unknown[]) {
  const [estado, setEstado] = useState<EstadoCarga<T>>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setEstado({ fase: "cargando" });
    void cargar(control.signal).then((r) => {
      if (control.signal.aborted) return;
      if (r.ok) setEstado({ fase: "listo", datos: r.datos });
      else if (r.fallo.tipo !== "cancelado") setEstado({ fase: "error", fallo: r.fallo });
    });
    return () => control.abort();
  }, [...dependencias, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);
  return { estado, recargar, setEstado };
}
