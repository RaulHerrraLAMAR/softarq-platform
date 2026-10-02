/**
 * Consultas de catálogo con cancelación y «la última gana»:
 * cada consulta nueva aborta la anterior (`AbortController`) y, además, una respuesta solo se
 * aplica si su número de generación sigue siendo el más reciente.
 */
import { LIMITES_API } from "@softarq/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ConceptoCatalogo, InsumoConOpciones, ServiciosApi, TipoAdicionalCatalogo } from "../api/servicios.ts";

export type EstadoConsulta<T> =
  | { estado: "inactivo" }
  | { estado: "cargando" }
  | { estado: "listo"; datos: T }
  | { estado: "error"; fallo: FalloApi | { tipo: "demasiados_conceptos" } };

/** Ejecuta `consultar` cuando cambia `clave`; descarta respuestas atrasadas. */
function useConsulta<T>(
  clave: string | null,
  consultar: (signal: AbortSignal) => Promise<{ ok: true; datos: T } | { ok: false; fallo: FalloApi }>,
  esperaMs = 0,
): { resultado: EstadoConsulta<T>; reintentar: () => void } {
  const [resultado, setResultado] = useState<EstadoConsulta<T>>({ estado: "inactivo" });
  const [intento, setIntento] = useState(0);
  const generacion = useRef(0);
  const consultarRef = useRef(consultar);
  consultarRef.current = consultar;

  useEffect(() => {
    const mia = ++generacion.current;
    if (clave === null) {
      setResultado({ estado: "inactivo" });
      return;
    }
    const control = new AbortController();
    setResultado({ estado: "cargando" });
    const temporizador = setTimeout(() => {
      void consultarRef.current(control.signal).then((r) => {
        if (mia !== generacion.current || control.signal.aborted) return;
        if (r.ok) setResultado({ estado: "listo", datos: r.datos });
        else if (r.fallo.tipo !== "cancelado") setResultado({ estado: "error", fallo: r.fallo });
      });
    }, esperaMs);
    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [clave, intento, esperaMs]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { resultado, reintentar };
}

/** Búsqueda de conceptos con espera de 250 ms entre pulsaciones. */
export function useBusquedaConceptos(servicios: ServiciosApi, texto: string, activa: boolean) {
  const t = texto.trim().slice(0, LIMITES_API.longitudBusqueda);
  return useConsulta<ConceptoCatalogo[]>(
    activa ? `buscar:${t}` : null,
    async (signal) => {
      const r = await servicios.buscarConceptos(t, signal);
      return r.ok ? { ok: true, datos: r.datos.conceptos } : r;
    },
    250,
  );
}

export function useTiposAdicional(servicios: ServiciosApi) {
  return useConsulta<TipoAdicionalCatalogo[]>("tipos", async (signal) => {
    const r = await servicios.tiposAdicional(signal);
    return r.ok ? { ok: true, datos: r.datos.tiposAdicional } : r;
  });
}

export interface OpcionesCargadas {
  conceptos: readonly string[];
  fechaReferencia: string;
  insumos: readonly InsumoConOpciones[];
}

/**
 * Opciones de precio para los conceptos de la captura. Se vuelven a pedir al cambiar la lista de
 * conceptos; `alCargar` recibe la lista exacta para la que se obtuvieron.
 */
export function useOpcionesPrecio(
  servicios: ServiciosApi,
  conceptos: readonly string[],
  alCargar: (o: OpcionesCargadas) => void,
): { resultado: EstadoConsulta<OpcionesCargadas>; reintentar: () => void } {
  const alCargarRef = useRef(alCargar);
  alCargarRef.current = alCargar;
  const clave = conceptos.length === 0 ? null : conceptos.join(",");
  const demasiados = conceptos.length > LIMITES_API.conceptosPorConsulta;
  const consulta = useConsulta<OpcionesCargadas>(demasiados ? null : clave, async (signal) => {
    const lista = [...conceptos];
    const r = await servicios.opcionesPrecio(lista, signal);
    if (!r.ok) return r;
    const datos: OpcionesCargadas = { conceptos: lista, fechaReferencia: r.datos.fechaReferencia, insumos: r.datos.insumos };
    return { ok: true, datos };
  });

  const { resultado } = consulta;
  useEffect(() => {
    if (resultado.estado === "listo") alCargarRef.current(resultado.datos);
  }, [resultado]);

  if (demasiados) {
    return { resultado: { estado: "error", fallo: { tipo: "demasiados_conceptos" } }, reintentar: consulta.reintentar };
  }
  return consulta;
}

/** Mensaje para el usuario de un fallo de consulta de catálogo. */
export function mensajeDeConsulta(fallo: FalloApi | { tipo: "demasiados_conceptos" }): string {
  return fallo.tipo === "demasiados_conceptos"
    ? `Se pueden consultar opciones para un máximo de ${LIMITES_API.conceptosPorConsulta} conceptos distintos. Quite algún concepto.`
    : mensajeDeFallo(fallo);
}
