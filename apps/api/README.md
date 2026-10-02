# apps/api — API de SoftArq

**Estado:** carpeta reservada. Aún no se ha inicializado el proyecto NestJS ni hay dependencias instaladas.

**Tecnología prevista:** NestJS + TypeScript, PostgreSQL local para desarrollo.

## Responsabilidades

La API es la **única** dueña de:

- los cálculos de la cotización (cantidades, consumos, compras, mano de obra, recargo, impuestos y total);
- los permisos y la autenticación;
- las reglas de negocio y los bloqueos (equivalentes a CR y BL de la fase 1);
- la validación de toda entrada, aunque el cliente ya la haya validado;
- la inmutabilidad de las versiones emitidas.

Los clientes (web y móvil) solo muestran y capturan datos; no calculan importes oficiales.

## Reglas específicas

- Importes y cantidades con aritmética decimal exacta (nunca `number` de JavaScript para dinero); en PostgreSQL, `numeric`.
- Redondeo a centavos según la regla de la fase 1: mitad hacia arriba y simétrico en negativos (CR-15: 2.675 → 2.68), no el redondeo al par; aplicado solo donde el Word maestro lo indica.
- Una versión emitida no se actualiza ni se borra; los cambios generan una versión nueva con motivo.
- Configuración por variables de entorno (ver `.env.example` en la raíz); sin secretos en el código.
