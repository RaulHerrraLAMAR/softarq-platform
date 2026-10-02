/**
 * Estado del cálculo.
 *
 * - Solo se calcula al llamar a `calcular` (desde el botón), nunca desde un efecto.
 * - Mientras hay un cálculo en curso, otra llamada se ignora (evita duplicados por clics repetidos).
 * - Cada resultado guarda la huella de la captura enviada. Si la captura cambia, el resultado deja de
 *   corresponder (la interfaz lo marca como pendiente de recalcular) y un cálculo en curso se cancela.
 * - Una respuesta solo se aplica si pertenece a la última solicitud (número de solicitud).
 */
import type { RespuestaCalculoDemo, SolicitudCalculoDemo } from "@softarq/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FalloApi } from "../api/cliente.ts";
import type { ServiciosApi } from "../api/servicios.ts";

export type EstadoCalculo =
  | { fase: "sin_calcular" }
  | { fase: "calculando"; huella: string }
  | { fase: "cancelado"; huella: string }
  | { fase: "calculado"; huella: string; respuesta: RespuestaCalculoDemo }
  | { fase: "bloqueado"; huella: string; problemas: { codigo: string; referencia: string; mensaje: string }[] }
  | { fase: "rechazado"; huella: string; campos: { ruta: string; mensaje: string }[] }
  | { fase: "no_encontrado"; huella: string; faltantes: { tipo: string; codigo: string }[] }
  | { fase: "error"; huella: string; fallo: FalloApi };

export function useCalculo(servicios: ServiciosApi, huellaActual: string | null) {
  const [estado, setEstado] = useState<EstadoCalculo>({ fase: "sin_calcular" });
  const ultima = useRef(0);
  const enCurso = useRef<{ id: number; huella: string; control: AbortController } | null>(null);

  const calcular = useCallback(
    async (solicitud: SolicitudCalculoDemo, huella: string): Promise<void> => {
      if (enCurso.current) return;
      const id = ++ultima.current;
      const control = new AbortController();
      enCurso.current = { id, huella, control };
      setEstado({ fase: "calculando", huella });
      try {
        const r = await servicios.calcular(solicitud, control.signal);
        if (id !== ultima.current || control.signal.aborted) return;
        if (r.ok) {
          setEstado({ fase: "calculado", huella, respuesta: r.datos });
          return;
        }
        const f = r.fallo;
        switch (f.tipo) {
          case "bloqueado":
            setEstado({ fase: "bloqueado", huella, problemas: f.problemas });
            break;
          case "invalida":
            setEstado({ fase: "rechazado", huella, campos: f.campos });
            break;
          case "no_encontrado":
            setEstado({ fase: "no_encontrado", huella, faltantes: f.faltantes });
            break;
          case "cancelado":
            break;
          default:
            setEstado({ fase: "error", huella, fallo: f });
        }
      } finally {
        if (enCurso.current?.id === id) enCurso.current = null;
      }
    },
    [servicios],
  );

  /** Cancela el cálculo en curso si la captura cambió después de enviarlo. */
  useEffect(() => {
    const actual = enCurso.current;
    if (actual && huellaActual !== actual.huella) {
      actual.control.abort();
      enCurso.current = null;
      ultima.current++;
      setEstado({ fase: "cancelado", huella: actual.huella });
    }
  }, [huellaActual]);

  /** Al salir de la captura (volver al inicio), se cancela y se olvida el resultado. */
  const reiniciar = useCallback(() => {
    enCurso.current?.control.abort();
    enCurso.current = null;
    ultima.current++;
    setEstado({ fase: "sin_calcular" });
  }, []);

  return { estado, calcular, reiniciar };
}
