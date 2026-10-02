# packages/contracts — Contratos compartidos

**Estado (02/10/2026):** contratos del motor de cálculo y de la API HTTP; los usan la API y la web. Paquete ESM que se compila a `dist/` con `pnpm --filter @softarq/contracts run build`.

| Archivo | Contenido |
|---|---|
| `src/decimal.ts` | `DecimalTexto` (formato documentado), `PATRON_DECIMAL_TEXTO`, `esDecimalTexto`, `FechaISO` |
| `src/calculo.ts` | `EntradaCalculo`, `ResultadoCalculo` (`CALCULADO`, `BLOQUEADO` o `ENTRADA_INVALIDA`), fórmulas, modalidades, códigos BL/AV, `LIMITES_ENTRADA_CALCULO` y `DIMENSIONES_POR_FORMULA` (qué medidas se capturan por fórmula; la usan el motor y la web, ADR-0006) |
| `src/vista-comercial.ts` | `CotizacionComercial` y `LEYENDA_DEMO`: lo que pueden recibir web y móvil |
| `src/api/esquemas.ts` | Contratos HTTP v1 como **esquemas Zod** (definición única: tipos con `z.infer`, validación en la API y OpenAPI): solicitud de cálculo DEMO, consultas, respuestas, sobre de error y `LIMITES_API`. `RenglonMedicion` y `CotizacionComercial` se derivan de aquí |

Dependencia de ejecución: `zod` (4.6.5). Ninguna dependencia del servidor (Nest, Prisma, Express).

## Qué va aquí

- Tipos y esquemas de las peticiones y respuestas de la API (DTO).
- Enumeraciones compartidas (por ejemplo, los estados de una versión de la fase 1: Borrador, En revisión, Aprobada, Emitida, Aceptada, Rechazada, Vencida, Sustituida y Descartada; Word maestro v1.3, sección 3.9).
- Códigos de bloqueo y aviso que la API devuelve, para que los clientes los muestren.

## Qué NO va aquí

- Cálculos, redondeos ni fórmulas de cotización (viven en `apps/api`).
- Permisos o reglas de negocio.
- Acceso a base de datos, secretos o configuración de entorno.

## Precisión

Los importes y cantidades se transmiten como **cadenas decimales**, nunca como `number`:

- **Entrada:** `^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$`, por ejemplo `"18790.94"`, `"12.5"` o `"-1.2"`.
- **Salida:**
  - importes de venta con 2 decimales exactos;
  - cantidades y costos intermedios con precisión completa, sin exponente.

`ResultadoCalculado` contiene costos internos: **no** debe enviarse a web ni móvil. Para ellos existe `CotizacionComercial`.
