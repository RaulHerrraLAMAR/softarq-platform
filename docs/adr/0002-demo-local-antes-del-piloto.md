# ADR-0002 — DEMO local antes del piloto PR-44

- **Fecha:** 02/10/2026
- **Estado:** aceptada (decisión del propietario)
- **Relación:** aclara el alcance de [ADR-0001](0001-monorepo-y-stack.md); no lo sustituye.

## Contexto

El Word maestro v1.3 (§10.3) coloca la compuerta hacia la fase 2 después del piloto de la fase 1 (PR-44), que sigue pendiente. ADR-0001 registró que el desarrollo empezaba antes de esa compuerta, pero no precisó qué se construye ni con qué validez.

El propietario probó personalmente el libro oficial y declaró que funcionó correctamente. **Esa declaración no equivale a la ejecución de PR-41 (prueba guiada con una persona según el procedimiento) ni de PR-44 (piloto).** Ambas siguen pendientes.

## Decisión

1. Se autoriza desarrollar un **DEMO local** de la aplicación antes del piloto PR-44.
2. El DEMO cubrirá de forma progresiva el flujo funcional del libro `Cotizador_Estructuras_F1.xlsm`. El primer módulo es el motor de cálculo del servidor (ADR-0003).
3. Los datos del DEMO pueden ser ficticios y deben estar marcados como DEMO. Las fórmulas y validaciones tienen que funcionar de verdad: no se simulan resultados.
4. El DEMO se ejecuta solo en local. No hay despliegue, repositorio remoto ni datos reales de clientes.
5. Nada del DEMO convierte en reales los parámetros DEMO (recargo 20 %, tasa 16 %, precios y rendimientos). Los 12 datos pendientes del Word (capítulo 8) siguen siendo necesarios para usarlo en producción.

## Fuentes de verdad vigentes

- **Libro oficial:** `entrega\Cotizador_Estructuras_F1.xlsm`. `H.xlsm` se eliminó y queda fuera del proyecto.
- **Datos de uso posteriores al cierre documental:** `COT-2026-00016`, `COT-2026-00017` y la persona en turno `[DEMO] Revisor 1` se conservan sin cambios.
- **Evidencias sobre copias:** tienen historiales de folios independientes. Se citan por archivo de origen, escenario y caso de prueba; el folio solo no identifica una prueba.
- **Protección de la fase 1:** no se restauran respaldos ni se modifican el Excel, el Word ni sus PDF.

## Consecuencias

- El desarrollo puede avanzar en paralelo a las validaciones de la fase 1.
- Si PR-41, PR-42, PR-43 o PR-44 cambian una regla, el cambio se aplica primero al Word y al libro (o se documenta como decisión) y después al motor, con nuevas fixtures.
- La aprobación del DEMO por el revisor no sustituye al piloto de la fase 1.
