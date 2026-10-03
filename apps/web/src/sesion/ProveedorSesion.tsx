/**
 * Estado de la sesión en la web (ADR-0007). La autorización real está en la API: aquí solo se
 * decide qué pantalla mostrar y se limpian los datos al cambiar de identidad.
 *
 * - Al abrir la página, la sesión se restaura consultando al servidor (`GET /auth/sesion`).
 * - El token CSRF vive solo en memoria (una ref); nunca en almacenamiento del navegador.
 * - Al iniciar, cerrar o vencer la sesión se incrementa la generación: el cotizador se vuelve a
 *   montar desde cero (sin captura, resultados ni consultas) y el cliente cancela y descarta todo
 *   lo pendiente de la identidad anterior.
 */
import type { RespuestaSesion } from "@softarq/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { crearClienteApi, type FalloApi } from "../api/cliente.ts";
import { crearServicios, type ServiciosApi } from "../api/servicios.ts";
import { crearServiciosCotizaciones, type ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { crearServiciosSesion, type ServiciosSesion } from "./servicios.ts";

export type MotivoAcceso = null | "cerrada" | "vencida";

export type EstadoSesion =
  | { fase: "verificando" }
  | { fase: "sin_conexion"; fallo: FalloApi }
  | { fase: "anonimo"; motivo: MotivoAcceso }
  | { fase: "autenticado"; sesion: RespuestaSesion; generacion: number };

export type ResultadoInicio = { ok: true } | { ok: false; fallo: FalloApi };

export interface ValorSesion {
  estado: EstadoSesion;
  /** Servicios de catálogo y cálculo (mismo cliente, con cookie y CSRF). */
  servicios: ServiciosApi;
  /** Clientes, proyectos y cotizaciones (mismo cliente). */
  cotizaciones: ServiciosCotizaciones;
  iniciar(correo: string, contrasena: string): Promise<ResultadoInicio>;
  cerrar(): Promise<ResultadoInicio>;
  reintentarVerificacion(): void;
}

const ContextoSesion = createContext<ValorSesion | null>(null);

export function useSesion(): ValorSesion {
  const v = useContext(ContextoSesion);
  if (!v) throw new Error("useSesion fuera de ProveedorSesion.");
  return v;
}

export interface PropsProveedor {
  urlApi: string;
  children: ReactNode;
  /** Solo pruebas: sustituye `fetch`. */
  hacerFetch?: typeof fetch;
}

export function ProveedorSesion({ urlApi, children, hacerFetch }: PropsProveedor) {
  const [estado, setEstado] = useState<EstadoSesion>({ fase: "verificando" });
  const csrf = useRef<string | null>(null);
  const generacion = useRef(0);
  const vencer = useRef<() => void>(() => {});
  const renovarCsrf = useRef<() => Promise<boolean>>(async () => false);

  const { cliente, servicios, cotizaciones, sesion } = useMemo(() => {
    const cliente = crearClienteApi(urlApi, hacerFetch, {
      csrf: () => csrf.current,
      alNoAutenticado: () => vencer.current(),
      renovarCsrf: () => renovarCsrf.current(),
    });
    return {
      cliente,
      servicios: crearServicios(cliente),
      cotizaciones: crearServiciosCotizaciones(cliente),
      sesion: crearServiciosSesion(cliente) as ServiciosSesion,
    };
  }, [urlApi, hacerFetch]);

  /** Olvida todo lo de la identidad anterior. */
  const olvidar = useCallback(() => {
    cliente.cancelarTodo();
    csrf.current = null;
    generacion.current++;
  }, [cliente]);

  const estadoActual = useRef(estado);
  estadoActual.current = estado;
  vencer.current = () => {
    if (estadoActual.current.fase !== "autenticado") return;
    olvidar();
    setEstado({ fase: "anonimo", motivo: "vencida" });
  };

  /** Token CSRF nuevo de la sesión vigente (p. ej., tras reiniciarse la API); solo en memoria. */
  renovarCsrf.current = async () => {
    if (estadoActual.current.fase !== "autenticado") return false;
    const r = await sesion.consultar();
    if (r.ok) csrf.current = r.datos.csrfToken;
    return r.ok;
  };

  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setEstado({ fase: "verificando" });
    void sesion.consultar(control.signal).then((r) => {
      if (control.signal.aborted) return;
      if (r.ok) {
        csrf.current = r.datos.csrfToken;
        setEstado({ fase: "autenticado", sesion: r.datos, generacion: ++generacion.current });
      } else if (r.fallo.tipo === "no_autenticado") {
        setEstado({ fase: "anonimo", motivo: null });
      } else if (r.fallo.tipo !== "cancelado") {
        setEstado({ fase: "sin_conexion", fallo: r.fallo });
      }
    });
    return () => control.abort();
  }, [sesion, intento]);

  const iniciar = useCallback(
    async (correo: string, contrasena: string): Promise<ResultadoInicio> => {
      olvidar();
      const previa = await sesion.prepararAcceso();
      if (!previa.ok) return { ok: false, fallo: previa.fallo };
      csrf.current = previa.datos.csrfToken;
      const r = await sesion.iniciar(correo, contrasena);
      if (!r.ok) {
        csrf.current = null;
        return { ok: false, fallo: r.fallo };
      }
      olvidar();
      csrf.current = r.datos.csrfToken;
      setEstado({ fase: "autenticado", sesion: r.datos, generacion: generacion.current });
      return { ok: true };
    },
    [sesion, olvidar],
  );

  const cerrar = useCallback(async (): Promise<ResultadoInicio> => {
    cliente.cancelarTodo(); // nada pendiente de esta identidad debe volver a la pantalla
    const r = await sesion.cerrar();
    if (!r.ok && r.fallo.tipo !== "no_autenticado") return { ok: false, fallo: r.fallo };
    olvidar();
    setEstado({ fase: "anonimo", motivo: "cerrada" });
    return { ok: true };
  }, [cliente, sesion, olvidar]);

  const valor = useMemo<ValorSesion>(
    () => ({ estado, servicios, cotizaciones, iniciar, cerrar, reintentarVerificacion: () => setIntento((n) => n + 1) }),
    [estado, servicios, cotizaciones, iniciar, cerrar],
  );
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

const NOMBRES_FUNCION: Record<string, string> = {
  PREPARADOR: "Preparador",
  REVISOR: "Revisor",
  ADMIN_CATALOGO: "Administrador del catálogo",
  ADMIN_SISTEMA: "Administrador del sistema",
};

export function nombreFunciones(funciones: readonly string[]): string {
  return funciones.map((f) => NOMBRES_FUNCION[f] ?? f).join(", ");
}
