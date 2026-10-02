# apps/api — API de SoftArq

**Estado (02/10/2026):** solo existe el **dominio de cálculo** (`src/modules/calculo/domain`). NestJS, los endpoints, la autenticación y la persistencia (Prisma/PostgreSQL) todavía no están inicializados (ADR-0003).

**Tecnología:** TypeScript 7 (ESM), decimal.js 10.6.0 y Vitest 5. Prevista: NestJS y PostgreSQL.

## Responsabilidades

La API es la **única** dueña de:

- los cálculos de la cotización (cantidades, consumos, compras, mano de obra, recargo, impuestos y total);
- los permisos y la autenticación;
- las reglas de negocio y los bloqueos (equivalentes a CR y BL de la fase 1);
- la validación de toda entrada, aunque el cliente ya la haya validado;
- la inmutabilidad de las versiones emitidas.

Los clientes (web y móvil) solo muestran y capturan datos; no calculan importes oficiales.

## Motor de cálculo

```ts
import { calcularCotizacion, aVistaComercial } from "./src/modules/calculo/domain/index.js";

const r = calcularCotizacion(entrada); // EntradaCalculo de @softarq/contracts
if (r.estado === "CALCULADO") {
  const paraElCliente = aVistaComercial(r); // sin costos internos (D-16)
}
// r.estado === "BLOQUEADO"        → r.problemas (BL-03, 05, 06, 08, 10, 11, 12, 13, 18), sin importes
// r.estado === "ENTRADA_INVALIDA" → r.errores con la ruta de cada campo
```

| Archivo | Contenido |
|---|---|
| `decimal.ts` | Instancia local de decimal.js (40 cifras) y redondeo CR-15 |
| `medicion.ts` | CR-01 y reglas de captura de renglones |
| `consumo.ts` | CR-02 a CR-04 |
| `compras.ts` | CR-05, CR-06 y CR-08 |
| `mano-obra.ts` | CR-09 |
| `precio-venta.ts` | CR-11 a CR-14 y margen |
| `vigencias.ts` | CR-07 y CR-16 (fechas explícitas) |
| `unidades.ts` | Catálogo de unidades de la fase 1 |
| `validar-entrada.ts` | Forma, formato decimal, referencias y límites |
| `motor.ts` | Orquestación, bloqueos, avisos AV-01/AV-03 y verificación BL-18 |
| `vista-comercial.ts` | Proyección para clientes |
| `__tests__/` | Pruebas y fixtures DEMO con su origen |

Las reglas, sus fuentes y sus pruebas están en [`docs/calculo/matriz-reglas.md`](../../docs/calculo/matriz-reglas.md).

## Comandos

Desde la raíz del repositorio:

```
pnpm --filter @softarq/api run typecheck
pnpm --filter @softarq/api test
pnpm --filter @softarq/api run build      # requiere @softarq/contracts compilado: use "pnpm build" en la raíz
```

## Reglas específicas

- Importes y cantidades con aritmética decimal exacta (nunca `number` de JavaScript para dinero); en PostgreSQL, `numeric`.
- Redondeo a centavos según la regla de la fase 1: mitad hacia arriba y simétrico en negativos (CR-15: 2.675 → 2.68), no el redondeo al par; aplicado solo donde el Word maestro lo indica.
- La ausencia de un parámetro nunca se convierte en cero: recargo o impuesto `null` bloquean (BL-12, BL-13).
- Una versión emitida no se actualiza ni se borra; los cambios generan una versión nueva con motivo.
- Configuración por variables de entorno (ver `.env.example` en la raíz); sin secretos en el código.
