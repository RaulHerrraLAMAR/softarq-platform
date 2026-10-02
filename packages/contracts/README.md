# packages/contracts — Contratos compartidos

**Estado:** carpeta reservada. Sin código ni dependencias.

## Qué va aquí

- Tipos y esquemas de las peticiones y respuestas de la API (DTO).
- Enumeraciones compartidas (por ejemplo, los estados de una versión de la fase 1: Borrador, En revisión, Aprobada, Emitida, Aceptada, Rechazada, Vencida, Sustituida y Descartada; Word maestro v1.3, sección 3.9).
- Códigos de bloqueo y aviso que la API devuelve, para que los clientes los muestren.

## Qué NO va aquí

- Cálculos, redondeos ni fórmulas de cotización.
- Permisos o reglas de negocio.
- Acceso a base de datos, secretos o configuración de entorno.

Los importes se transmiten como **cadenas decimales** (por ejemplo `"18790.94"`), nunca como `number`, para no perder precisión.
