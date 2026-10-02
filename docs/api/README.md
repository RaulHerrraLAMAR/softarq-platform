# API HTTP local de SoftArq (v1, DEMO)

- **Servicio:** NestJS 12, en `http://127.0.0.1:3000`, solo local.
- **Decisiones:** [ADR-0005](../adr/0005-api-http-local.md).
- **Especificación:**
  - [`openapi.json`](openapi.json) (OpenAPI 3.1, generada desde los contratos);
  - también en `GET /api/v1/openapi.json`.

> Todos los datos son **DEMO** y no tienen validez comercial. No hay autenticación: el servidor usa una organización DEMO fija (no es un control de acceso).

## Arranque

```
# desde la raíz del repositorio; requiere PostgreSQL preparado (apps/api/README.md)
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start          # node dist/main.js (lee apps/api/.env)
```

Variables (con sus valores por omisión) en [`.env.example`](../../.env.example).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | `200 {"estado":"ok","baseDeDatos":"disponible"}` o `503 {"estado":"degradado","baseDeDatos":"no disponible"}` |
| GET | `/api/v1/catalogos/conceptos?buscar=&limite=` | Conceptos activos y aprobados: código, descripción, unidad, fórmula, si admite descuento e insumos que requieren precio. Sin rendimientos, desperdicios, tarifas ni costos. `limite` de 1 a 100 (50 por omisión); `buscar` ≤ 60 caracteres |
| GET | `/api/v1/catalogos/opciones-precio?conceptos=CON-00007,CON-00009` | Para cada insumo de los conceptos (de 1 a 20), las opciones vigentes a la fecha del servidor: código de precio, producto, presentación, proveedor, vigencia y `esMenorPrecio`. **Sin precio ni contenido** |
| GET | `/api/v1/catalogos/tipos-adicional?limite=` | Tipos de costo adicional (CAD-…) |
| POST | `/api/v1/calculos/demo` | Calcula con los datos de PostgreSQL y devuelve **solo** la proyección comercial |
| GET | `/api/v1/openapi.json` | Especificación |

### Cuerpo de `POST /api/v1/calculos/demo`

- **`consolidarCompras`:** obligatorio.
- **Partidas `CONCEPTO`:** `id`, `conceptoCodigo`, `descripcion` opcional y `mediciones` (renglones con `signo`, `piezas`, `largo`, `ancho` y `alto`; las dimensiones que la fórmula no usa van en `null`).
- **Partidas `ADICIONAL`:** `id`, `tipoAdicionalCodigo`, `descripcion`, `cantidad` y `monto`.
- **`preciosElegidos`:** códigos de precio, uno por insumo. El servidor nunca elige por el cliente.

Reglas del cuerpo:
- Los decimales van como **texto** (`"4.5"`, no `4.5`).
- No se admiten campos adicionales: `fechaCalculo`, `organizacionId`, precios o parámetros dan 400.

La respuesta 200 tiene esta forma:

```json
{
  "estado": "CALCULADO",
  "fechaCalculo": "2026-10-02",
  "cotizacion": {
    "ambiente": "DEMO", "moneda": "MXN",
    "leyenda": "DEMOSTRACIÓN — DATOS ILUSTRATIVOS, SIN VALIDEZ COMERCIAL",
    "partidas": [{ "numero": 1, "descripcion": "…", "unidad": "m2", "cantidad": "88.8", "precioUnitario": "513.92", "importe": "45636.10" }],
    "subtotal": "46716.10",
    "impuesto": { "nombre": "Impuesto (tasa ilustrativa)", "tasa": "0.16", "importe": "7474.58" },
    "total": "54190.68"
  },
  "avisos": [{ "codigo": "AV-03", "mensaje": "Hay sobrante por redondeo de presentaciones de compra; se informa y no se descuenta." }]
}
```

## Errores

Todos los errores usan el mismo sobre:

```json
{ "error": { "codigo": "CALCULO_BLOQUEADO", "mensaje": "…", "solicitudId": "uuid",
             "problemas": [{ "codigo": "BL-03", "referencia": "version", "mensaje": "…" }] } }
```

Según el error, el sobre lleva además `campos` (400), `faltantes` (404) o `problemas` (422).

| HTTP | Código | Cuándo |
|---|---|---|
| 400 | `SOLICITUD_INVALIDA` | No cumple el contrato, JSON mal formado o reglas de captura (por ejemplo AREA con ancho y alto) |
| 404 | `NO_ENCONTRADO` | Ruta o códigos inexistentes en la organización |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Más de `API_LIMITE_CUERPO_KB` |
| 415 | `TIPO_DE_CONTENIDO_NO_ADMITIDO` | POST sin `application/json` |
| 422 | `CALCULO_BLOQUEADO` | Bloqueos de negocio (BL-03, BL-04, BL-08, BL-12, BL-13…), sin importes |
| 429 | `DEMASIADAS_SOLICITUDES` | Límite general o de cálculo (`Retry-After`) |
| 503 | `SERVICIO_NO_DISPONIBLE` | PostgreSQL no disponible |
| 500 | `ERROR_INTERNO` | Error inesperado (sin detalles internos) |

## Ejemplos reproducibles (datos DEMO)

Los cuerpos de [`ejemplos/`](ejemplos) reproducen los cuatro escenarios verificados. Una prueba exige que coincidan con los fixtures del motor.

```
curl -s http://127.0.0.1:3000/health
curl -s "http://127.0.0.1:3000/api/v1/catalogos/conceptos?limite=10"
curl -s "http://127.0.0.1:3000/api/v1/catalogos/opciones-precio?conceptos=CON-00007"
curl -s -X POST http://127.0.0.1:3000/api/v1/calculos/demo \
     -H "Content-Type: application/json" --data @docs/api/ejemplos/calculo-r1-faldones-10m.json
```

| Ejemplo | Total esperado (MXN, DEMO) |
|---|---|
| `calculo-r1-faldones-10m.json` | 54190.68 |
| `calculo-r2-espesor-012.json` | 43312.16 |
| `calculo-r3-sin-ventana.json` | 22405.28 |
| `calculo-propia-con-00001.json` | 4911.79 |

Origen de cada escenario: [`docs/calculo/matriz-reglas.md`](../calculo/matriz-reglas.md) §2.

## Límites

| Elemento | Límite |
|---|---|
| Cuerpo | 128 KB |
| Partidas | 100 |
| Renglones por partida | 200 |
| Renglones en total | 1000 |
| Precios elegidos | 100 |
| Descripciones | 200 caracteres |
| Búsqueda | 60 caracteres |
| Listados | 100 |
| Conceptos por consulta de opciones | 20 |
| Peticiones | 120 por minuto en general y 30 por minuto de cálculo, por IP |

El limitador es en memoria y vale para una sola instancia.
