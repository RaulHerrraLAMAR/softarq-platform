/**
 * Matriz de permisos de esta etapa (ADR-0007 §2; módulo 6: ADR-0008 §3). Constante pura: la API es la única que decide
 * qué capacidades concede cada función; el cliente solo muestra el resultado.
 *
 * Contraste con el libro 1.0.0-F1 (D-20):
 * - `modConfig.bas` define las funciones Preparador, Revisor, Administrador del catálogo y
 *   Administrador del sistema; una persona puede tener varias (`tblPersonas.funciones`).
 * - `BTN_Calcular` (`modMotor.bas`) exige `Req_Funcion FN_PREP`: solo el Preparador calcula.
 * - Abrir las hojas de catálogo no exige ninguna función: cualquier miembro consulta catálogos.
 * - Clientes y proyectos (`Cat_RequiereFuncion`, modCatalogos.bas): Preparador o Administrador del
 *   catálogo. Abrir las hojas 01 CLIENTES, 02 PROYECTOS y 16 HISTORIAL no exige función.
 * - Nueva cotización y guardar borrador (`Cot_Nueva`, `BTN_GuardarBorrador`): solo Preparador.
 *   Crear una versión exige además `calculo.ejecutar` (lo comprueba el controlador).
 * Revisión, aprobación y emisión (Revisor distinto del preparador, BL-17) son de un módulo futuro.
 */
import { CAPACIDADES, type Capacidad, type FuncionUsuario } from "@softarq/contracts";

export const CAPACIDADES_POR_FUNCION: Readonly<Record<FuncionUsuario, readonly Capacidad[]>> = {
  PREPARADOR: [
    "sesion.propia",
    "catalogos.consultar",
    "calculo.ejecutar",
    "clientes.consultar",
    "clientes.gestionar",
    "cotizaciones.consultar",
    "cotizaciones.preparar",
  ],
  REVISOR: ["sesion.propia", "catalogos.consultar", "clientes.consultar", "cotizaciones.consultar"],
  ADMIN_CATALOGO: ["sesion.propia", "catalogos.consultar", "clientes.consultar", "clientes.gestionar", "cotizaciones.consultar"],
  ADMIN_SISTEMA: ["sesion.propia", "catalogos.consultar", "clientes.consultar", "cotizaciones.consultar"],
};

/** Unión de las capacidades de las funciones, en el orden de `CAPACIDADES`. */
export function capacidadesDe(funciones: readonly FuncionUsuario[]): Capacidad[] {
  const concedidas = new Set(funciones.flatMap((f) => CAPACIDADES_POR_FUNCION[f]));
  return CAPACIDADES.filter((c) => concedidas.has(c));
}
