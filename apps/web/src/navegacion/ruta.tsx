/**
 * Enrutador mínimo por hash (sin dependencias): cada pantalla tiene una URL (`#/cotizaciones/…`),
 * de modo que al recargar se vuelve a la misma pantalla y sus datos se piden al servidor.
 *
 * - Los enlaces internos de la página (`#seccion-resultado`, `#campo-…`) no son rutas: se
 *   desplazan al elemento sin cambiar la ruta.
 * - Guarda de cambios sin guardar: si una pantalla la registra, salir (enlace, pestaña o botón
 *   «atrás») queda pendiente de confirmar; nada se descarta en silencio.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

export type Ruta =
  | { pantalla: "inicio" }
  | { pantalla: "solicitudes" }
  | { pantalla: "exportaciones" }
  | { pantalla: "solicitud"; id: string }
  | { pantalla: "calculadora" }
  | { pantalla: "cotizaciones" }
  | { pantalla: "nueva-cotizacion"; proyectoId: string | null }
  | { pantalla: "cotizacion"; id: string }
  | { pantalla: "version"; id: string; numero: number }
  | { pantalla: "salidas"; id: string; numero: number; vista: VistaSalidas }
  | { pantalla: "clientes" }
  | { pantalla: "cliente"; id: string }
  | { pantalla: "proyectos" }
  | { pantalla: "revisiones" }
  | { pantalla: "revision"; id: string }
  | { pantalla: "emisor" }
  | { pantalla: "catalogo"; vista: VistaCatalogo }
  | { pantalla: "administracion"; vista: VistaAdministracion }
  | { pantalla: "persona"; id: string }
  | { pantalla: "no-encontrada" };

/** Vistas de las salidas internas de una versión (módulo 14). */
export const VISTAS_SALIDAS_RUTA = ["compras", "detalle", "indicadores"] as const;
export type VistaSalidas = (typeof VISTAS_SALIDAS_RUTA)[number];

/** Vistas del Administrador del sistema (módulo 13). */
export const VISTAS_ADMINISTRACION_RUTA = ["parametros", "personas"] as const;
export type VistaAdministracion = (typeof VISTAS_ADMINISTRACION_RUTA)[number];

/** Vistas de la administración de catálogos (módulo 11). */
export const VISTAS_CATALOGO_RUTA = ["proveedores", "productos", "precios", "mano-de-obra", "insumos", "tipos-estructura", "conceptos", "referencias"] as const;
export type VistaCatalogo = (typeof VISTAS_CATALOGO_RUTA)[number];

const UUID = "[0-9a-fA-F-]{36}";

/** `null` si el hash no es una ruta (p. ej., un ancla de la página). */
export function interpretarHash(hash: string): Ruta | null {
  const h = hash.replace(/^#/, "");
  if (h === "" || h === "/") return { pantalla: "inicio" };
  if (!h.startsWith("/")) return null;
  const [camino = "", consulta = ""] = h.split("?");
  const parametros = new URLSearchParams(consulta);
  let m: RegExpExecArray | null;
  if (camino === "/inicio") return { pantalla: "inicio" };
  if (camino === "/solicitudes") return { pantalla: "solicitudes" };
  if (camino === "/exportaciones") return { pantalla: "exportaciones" };
  if ((m = new RegExp(`^/solicitudes/(${UUID})$`).exec(camino))) return { pantalla: "solicitud", id: m[1]! };
  if (camino === "/calculadora") return { pantalla: "calculadora" };
  if (camino === "/cotizaciones") return { pantalla: "cotizaciones" };
  if (camino === "/cotizaciones/nueva") {
    const p = parametros.get("proyecto");
    return { pantalla: "nueva-cotizacion", proyectoId: p && new RegExp(`^${UUID}$`).test(p) ? p : null };
  }
  if ((m = new RegExp(`^/cotizaciones/(${UUID})$`).exec(camino))) return { pantalla: "cotizacion", id: m[1]! };
  if ((m = new RegExp(`^/cotizaciones/(${UUID})/v/([1-9]\\d{0,5})$`).exec(camino))) {
    return { pantalla: "version", id: m[1]!, numero: Number(m[2]) };
  }
  if ((m = new RegExp(`^/cotizaciones/(${UUID})/v/([1-9]\\d{0,5})/interno(?:/([a-z]+))?$`).exec(camino))) {
    const vista = m[3] ?? "compras";
    if ((VISTAS_SALIDAS_RUTA as readonly string[]).includes(vista)) {
      return { pantalla: "salidas", id: m[1]!, numero: Number(m[2]), vista: vista as VistaSalidas };
    }
  }
  if (camino === "/clientes") return { pantalla: "clientes" };
  if ((m = new RegExp(`^/clientes/(${UUID})$`).exec(camino))) return { pantalla: "cliente", id: m[1]! };
  if (camino === "/proyectos") return { pantalla: "proyectos" };
  if (camino === "/revisiones") return { pantalla: "revisiones" };
  if ((m = new RegExp(`^/revisiones/(${UUID})$`).exec(camino))) return { pantalla: "revision", id: m[1]! };
  if (camino === "/emisor") return { pantalla: "emisor" };
  if (camino === "/catalogo") return { pantalla: "catalogo", vista: "proveedores" };
  if ((m = /^\/catalogo\/([a-z-]+)$/.exec(camino)) && (VISTAS_CATALOGO_RUTA as readonly string[]).includes(m[1]!)) {
    return { pantalla: "catalogo", vista: m[1] as VistaCatalogo };
  }
  if (camino === "/administracion") return { pantalla: "administracion", vista: "parametros" };
  if ((m = /^\/administracion\/([a-z-]+)$/.exec(camino)) && (VISTAS_ADMINISTRACION_RUTA as readonly string[]).includes(m[1]!)) {
    return { pantalla: "administracion", vista: m[1] as VistaAdministracion };
  }
  if ((m = new RegExp(`^/administracion/personas/(${UUID})$`).exec(camino))) return { pantalla: "persona", id: m[1]! };
  return { pantalla: "no-encontrada" };
}

export function hashDe(r: Ruta): string {
  switch (r.pantalla) {
    case "inicio":
      return "#/inicio";
    case "solicitudes":
      return "#/solicitudes";
    case "exportaciones":
      return "#/exportaciones";
    case "solicitud":
      return `#/solicitudes/${r.id}`;
    case "calculadora":
      return "#/calculadora";
    case "cotizaciones":
      return "#/cotizaciones";
    case "nueva-cotizacion":
      return r.proyectoId ? `#/cotizaciones/nueva?proyecto=${r.proyectoId}` : "#/cotizaciones/nueva";
    case "cotizacion":
      return `#/cotizaciones/${r.id}`;
    case "version":
      return `#/cotizaciones/${r.id}/v/${r.numero}`;
    case "salidas":
      return `#/cotizaciones/${r.id}/v/${r.numero}/interno/${r.vista}`;
    case "clientes":
      return "#/clientes";
    case "cliente":
      return `#/clientes/${r.id}`;
    case "proyectos":
      return "#/proyectos";
    case "revisiones":
      return "#/revisiones";
    case "revision":
      return `#/revisiones/${r.id}`;
    case "emisor":
      return "#/emisor";
    case "catalogo":
      return `#/catalogo/${r.vista}`;
    case "administracion":
      return `#/administracion/${r.vista}`;
    case "persona":
      return `#/administracion/personas/${r.id}`;
    case "no-encontrada":
      return "#/no-encontrada";
  }
}

/** Sección de la navegación principal a la que pertenece una ruta. */
export function seccionDe(r: Ruta): "inicio" | "solicitudes" | "exportaciones" | "calculadora" | "cotizaciones" | "revisiones" | "clientes" | "proyectos" | "emisor" | "catalogo" | "administracion" | null {
  switch (r.pantalla) {
    case "inicio":
      return "inicio";
    case "solicitudes":
    case "solicitud":
      return "solicitudes";
    case "exportaciones":
      return "exportaciones";
    case "calculadora":
      return "calculadora";
    case "cotizaciones":
    case "nueva-cotizacion":
    case "cotizacion":
    case "version":
    case "salidas":
      return "cotizaciones";
    case "clientes":
    case "cliente":
      return "clientes";
    case "proyectos":
      return "proyectos";
    case "revisiones":
    case "revision":
      return "revisiones";
    case "emisor":
      return "emisor";
    case "catalogo":
      return "catalogo";
    case "administracion":
    case "persona":
      return "administracion";
    default:
      return null;
  }
}

/** Devuelve `true` si salir de la pantalla actual perdería cambios. */
export type Guarda = () => boolean;

interface ValorRuta {
  ruta: Ruta;
  navegar(r: Ruta): void;
  /** Registra (o retira con `null`) la guarda de cambios sin guardar de la pantalla actual. */
  registrarGuarda(g: Guarda | null): void;
  /** Destino pendiente de confirmar porque hay cambios sin guardar. */
  pendiente: Ruta | null;
  confirmarSalida(): void;
  cancelarSalida(): void;
}

const ContextoRuta = createContext<ValorRuta | null>(null);

export function useRuta(): ValorRuta {
  const v = useContext(ContextoRuta);
  if (!v) throw new Error("useRuta fuera de ProveedorRuta.");
  return v;
}

function desplazarAAncla(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView?.({ block: "center" });
  if (typeof el.focus === "function") el.focus({ preventScroll: true });
}

export function ProveedorRuta({ children }: { children: ReactNode }) {
  const [ruta, setRuta] = useState<Ruta>(() => interpretarHash(window.location.hash) ?? { pantalla: "inicio" });
  const [pendiente, setPendiente] = useState<Ruta | null>(null);
  const guarda = useRef<Guarda | null>(null);
  const rutaActual = useRef(ruta);
  rutaActual.current = ruta;

  const restaurarHash = () => window.history.replaceState(null, "", hashDe(rutaActual.current));

  useEffect(() => {
    const alCambiar = () => {
      const nueva = interpretarHash(window.location.hash);
      if (nueva === null) {
        // Ancla de la página: no cambia la ruta.
        const id = window.location.hash.slice(1);
        restaurarHash();
        desplazarAAncla(id);
        return;
      }
      if (hashDe(nueva) === hashDe(rutaActual.current)) return;
      if (guarda.current?.()) {
        restaurarHash();
        setPendiente(nueva);
        return;
      }
      setRuta(nueva);
    };
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  // Clic en un ancla interna (`#seccion-…`, `#campo-…`): desplaza sin tocar el hash de la ruta.
  useEffect(() => {
    const alClic = (e: globalThis.MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='#']");
      const href = a?.getAttribute("href");
      if (!href || href.startsWith("#/") || href === "#") return;
      e.preventDefault();
      desplazarAAncla(href.slice(1));
    };
    document.addEventListener("click", alClic);
    return () => document.removeEventListener("click", alClic);
  }, []);

  const navegar = useCallback((r: Ruta) => {
    if (hashDe(r) === hashDe(rutaActual.current)) return;
    if (guarda.current?.()) {
      setPendiente(r);
      return;
    }
    window.history.pushState(null, "", hashDe(r));
    setRuta(r);
  }, []);

  const valor = useMemo<ValorRuta>(
    () => ({
      ruta,
      navegar,
      registrarGuarda: (g) => {
        guarda.current = g;
      },
      pendiente,
      confirmarSalida: () => {
        if (!pendiente) return;
        guarda.current = null;
        window.history.pushState(null, "", hashDe(pendiente));
        setRuta(pendiente);
        setPendiente(null);
      },
      cancelarSalida: () => setPendiente(null),
    }),
    [ruta, navegar, pendiente],
  );
  return <ContextoRuta.Provider value={valor}>{children}</ContextoRuta.Provider>;
}

/** Enlace interno: navega sin recargar y respeta la guarda de cambios sin guardar. */
export function Enlace({
  a,
  children,
  className,
  actual,
}: {
  a: Ruta;
  children: ReactNode;
  className?: string;
  /** Marca el enlace como la página actual (`aria-current="page"`). */
  actual?: boolean;
}) {
  const { navegar } = useRuta();
  return (
    <a
      href={hashDe(a)}
      className={className}
      aria-current={actual ? "page" : undefined}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navegar(a);
      }}
    >
      {children}
    </a>
  );
}
