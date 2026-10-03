/**
 * Versión de las reglas del motor que se guarda en cada versión de cotización (ADR-0008).
 *
 * Identifica con qué reglas se calculó un registro histórico. Debe cambiarse (y documentarse en
 * docs/calculo/matriz-reglas.md) cuando cambie cualquier regla, redondeo o validación del motor;
 * no cambia por modificar catálogos, que se guardan aparte en la propia versión.
 */
export const VERSION_MOTOR = "motor-1 (libro 1.0.0-F1)";
