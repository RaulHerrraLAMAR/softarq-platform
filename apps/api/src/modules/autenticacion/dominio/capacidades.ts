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
 * - Módulo 7 (ADR-0009): `BTN_EnviarRevision` exige `FN_PREP` → `revisiones.enviar` (también
 *   retirar, adaptación de la web). `BTN_Observaciones` y `BTN_Aprobar` exigen `FN_REV` →
 *   `revisiones.decidir`. BL-17 (quien aprueba ≠ autor de la versión) se comprueba por identidad,
 *   no por función: lo decide la API y la base, no esta matriz.
 * - Módulo 8 (ADR-0010): `BTN_Emitir` exige `FN_REV` y, en `Rev_Emitir`, quien emite ≠ preparador.
 *   Adaptación autorizada por el propietario: `emisiones.emitir` para Preparador y Revisor; la API y
 *   la base exigen además, por identidad, que un Revisor no emita su propia versión y que exista una
 *   aprobación vigente de otra persona (poder emitir no concede aprobar). Los parámetros del emisor
 *   (17 CONFIG) los cambia el Administrador del sistema → `emisor.configurar`.
 * - Módulo 11 (ADR-0015): altas, ediciones, anulación, cierre de vigencia y activación de
 *   proveedores, productos, precios y tarifas, y asignar la tarifa de un concepto, exigen
 *   `Req_Funcion FN_ADMCAT` (`Cat_RequiereFuncion`, `BTN_PrecioAnular`) → `catalogos.administrar`,
 *   solo para el Administrador del catálogo. Consultar datos técnicos no la concede a Preparador
 *   ni a Revisor. La base lo vuelve a exigir (`softarq_exigir_funcion`).
 * - Módulo 13 (ADR-0017): parámetros (`BTN_Parametros`, B-38) y personas y funciones
 *   (`BTN_Personas`, B-39) exigen `Req_Funcion FN_ADMSIS` → `parametros.administrar` y
 *   `personas.administrar`, solo para el Administrador del sistema.
 * - Módulo 14 (ADR-0018): las hojas 12 COMPRAS, 13 DETALLE_CALCULO y 14 REVISION no exigen función
 *   en el libro (D-20). Decisión del propietario: `salidas.consultar` solo para Preparador (prepara
 *   y usa 12 y 13) y Revisor (indicadores internos de 14, §5.5). Cambio intencionado frente a la
 *   protección de costos de ADR-0009: el Revisor ya consulta costos e indicadores. Los
 *   administradores no la reciben. Consultar no concede calcular, aprobar ni emitir.
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
    "revisiones.enviar",
    // Word maestro §1.6, B-36; corrección con historial autorizada en ADR-0013.
    "respuestas.registrar",
    "respuestas.corregir",
    "emisiones.emitir",
    // Módulo 10 (ADR-0014): datos técnicos de las excepciones que registra (B-22).
    "excepciones.consultar",
    // Módulo 14 (ADR-0018): compras calculadas, detalle e indicadores (12 y 13 del libro).
    "salidas.consultar",
  ],
  REVISOR: [
    "sesion.propia",
    "catalogos.consultar",
    "clientes.consultar",
    "cotizaciones.consultar",
    "revisiones.decidir",
    "emisiones.emitir",
    // Módulo 10 (ADR-0014): ver las excepciones que autoriza o rechaza (B-29).
    "excepciones.consultar",
    // Módulo 14 (ADR-0018): costos e indicadores internos para revisar (14 REVISION, §5.5).
    "salidas.consultar",
  ],
  ADMIN_CATALOGO: [
    "sesion.propia",
    "catalogos.consultar",
    "clientes.consultar",
    "clientes.gestionar",
    "cotizaciones.consultar",
    "catalogos.administrar",
  ],
  ADMIN_SISTEMA: [
    "sesion.propia",
    "catalogos.consultar",
    "clientes.consultar",
    "cotizaciones.consultar",
    "emisor.configurar",
    // Módulo 13 (ADR-0017): B-38 y B-39 (`Req_Funcion FN_ADMSIS`). El Administrador del catálogo no
    // las recibe: administrar productos no concede administrar personas.
    "parametros.administrar",
    "personas.administrar",
  ],
};

/** Unión de las capacidades de las funciones, en el orden de `CAPACIDADES`. */
export function capacidadesDe(funciones: readonly FuncionUsuario[]): Capacidad[] {
  const concedidas = new Set(funciones.flatMap((f) => CAPACIDADES_POR_FUNCION[f]));
  return CAPACIDADES.filter((c) => concedidas.has(c));
}
