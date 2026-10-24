/**
 * Navegación según las capacidades que entrega el servidor (ADR-0020 §4).
 *
 * La app no deduce permisos de las funciones: solo mira `capacidades` de la sesión. Ocultar una pestaña
 * es presentación; la API comprueba la capacidad en cada solicitud. Las funciones administrativas no
 * implican acciones del Preparador o del Revisor: cuentan únicamente las capacidades combinadas.
 */
import type { Capacidad, FuncionUsuario } from "@softarq/contracts/movil";

export interface Secciones {
  /** Listado y detalle de clientes (`clientes.consultar`). */
  readonly clientes: boolean;
  /** Listado y detalle de proyectos (`clientes.consultar`). */
  readonly proyectos: boolean;
  /** Listado y detalle de cotizaciones, versiones e historial (`cotizaciones.consultar`). */
  readonly cotizaciones: boolean;
}

export const tiene = (capacidades: readonly Capacidad[], c: Capacidad): boolean => capacidades.includes(c);

export function seccionesDe(capacidades: readonly Capacidad[]): Secciones {
  const clientes = tiene(capacidades, "clientes.consultar");
  return { clientes, proyectos: clientes, cotizaciones: tiene(capacidades, "cotizaciones.consultar") };
}

export const hayAlgoQueConsultar = (s: Secciones): boolean => s.clientes || s.proyectos || s.cotizaciones;

const NOMBRE_FUNCION: Record<FuncionUsuario, string> = {
  PREPARADOR: "Preparador",
  REVISOR: "Revisor",
  ADMIN_CATALOGO: "Administrador del catálogo",
  ADMIN_SISTEMA: "Administrador del sistema",
};

export const textoFunciones = (funciones: readonly FuncionUsuario[]): string => funciones.map((f) => NOMBRE_FUNCION[f]).join(" · ");
