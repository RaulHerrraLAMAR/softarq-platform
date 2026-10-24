import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Consulta } from "./ejecutor";

/**
 * Conecta una consulta a la pantalla. Cambiar `clave` (otro registro, otra búsqueda) abre una consulta
 * nueva y descarta la anterior; al salir de la pantalla se aborta lo pendiente. Las pantallas se
 * desmontan al cambiar la cuenta (generación de sesión), así que nada de una cuenta anterior sobrevive.
 */
export function useConsulta<T>(clave: string, cargar: (senal: AbortSignal) => Promise<T>) {
  const ultima = useRef(cargar);
  ultima.current = cargar;
  // `clave` es la identidad de la consulta: cambiarla abre una nueva.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const consulta = useMemo(() => new Consulta<T>((senal) => ultima.current(senal)), [clave]);
  useEffect(() => {
    void consulta.cargar();
    return () => consulta.descartar();
  }, [consulta]);
  const estado = useSyncExternalStore(consulta.suscribir, consulta.obtener, consulta.obtener);
  return { estado, reintentar: () => void consulta.reintentar() };
}

/** Valor con retardo (búsquedas): evita una solicitud por cada letra. */
export function useRetardado(valor: string, ms = 400): string {
  const [retardado, poner] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => poner(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return retardado;
}
