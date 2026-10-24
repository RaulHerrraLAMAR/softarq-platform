/**
 * Proveedor de una solicitud abierta (ADR-0021): carga el catálogo de trabajos del servidor y la solicitud, crea el
 * controlador y lo entrega a las pantallas del recorrido. Al salir del recorrido o pasar la app a segundo plano guarda
 * lo pendiente; al cerrar sesión las pantallas se desmontan (el cliente HTTP ya canceló lo que había en curso).
 */
import type { TrabajoCliente } from "@softarq/contracts/cliente";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";
import { useConsulta } from "../consultas/usar-consulta";
import { servicios } from "../servicios/instancia";
import { Cargando, ErrorConsulta, Pantalla } from "../ui/componentes";
import { ControladorSolicitud, type EstadoControlador } from "./controlador";

interface ValorSolicitud {
  controlador: ControladorSolicitud;
  catalogo: readonly TrabajoCliente[];
}

const Contexto = createContext<ValorSolicitud | null>(null);

export function useSolicitud(): { controlador: ControladorSolicitud; catalogo: readonly TrabajoCliente[]; estado: EstadoControlador } {
  const v = useContext(Contexto);
  if (!v) throw new Error("useSolicitud se usa dentro de ProveedorSolicitud.");
  const estado = useSyncExternalStore(v.controlador.suscribir, v.controlador.obtenerEstado, v.controlador.obtenerEstado);
  return { ...v, estado };
}

export function ProveedorSolicitud({ id, children }: { id: string; children: ReactNode }) {
  const catalogo = useConsulta("catalogo", (senal) => servicios.trabajos({ senal }));
  const datos = catalogo.estado.datos;

  const controlador = useMemo(() => (datos ? new ControladorSolicitud({ id, servicios, catalogo: datos }) : null), [id, datos]);

  useEffect(() => {
    if (!controlador) return;
    void controlador.cargar();
    // Al pasar a segundo plano se guarda lo pendiente: la app puede cerrarse sin avisar.
    const suscripcion = AppState.addEventListener("change", (e) => {
      if (e !== "active") void controlador.guardarAhora();
    });
    return () => {
      suscripcion.remove();
      void controlador.guardarAhora().finally(() => controlador.liberar());
    };
  }, [controlador]);

  const estado = useSyncExternalStore<EstadoControlador | null>(
    controlador ? controlador.suscribir : sinSuscripcion,
    controlador ? controlador.obtenerEstado : sinEstado,
    controlador ? controlador.obtenerEstado : sinEstado,
  );

  if (!controlador || !datos) {
    return (
      <Pantalla>
        {catalogo.estado.fase === "error" && catalogo.estado.error ? <ErrorConsulta fallo={catalogo.estado.error} alReintentar={catalogo.reintentar} /> : <Cargando texto="Preparando tu cotización…" />}
      </Pantalla>
    );
  }
  if (estado === null || estado.carga === "cargando") {
    return (
      <Pantalla>
        <Cargando texto="Abriendo tu solicitud…" />
      </Pantalla>
    );
  }
  if (estado.carga === "error" && estado.errorCarga) {
    return (
      <Pantalla>
        <ErrorConsulta fallo={estado.errorCarga} alReintentar={() => void controlador.cargar()} />
      </Pantalla>
    );
  }
  return <Contexto.Provider value={{ controlador, catalogo: datos }}>{children}</Contexto.Provider>;
}

const sinSuscripcion = () => () => {};
const sinEstado = (): EstadoControlador | null => null;
