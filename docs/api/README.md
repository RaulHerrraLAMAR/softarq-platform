# API HTTP local de SoftArq (v1, DEMO)

- **Servicio:** NestJS 12; escucha solo en `127.0.0.1:3000`. Los clientes la llaman como `http://localhost:3000` (mismo *site* que la web, para la cookie de sesión).
- **Decisiones:** [ADR-0005](../adr/0005-api-http-local.md) (API) y [ADR-0007](../adr/0007-autenticacion-sesiones.md) (sesiones y permisos).
- **Especificación:**
  - [`openapi.json`](openapi.json) (OpenAPI 3.1, generada desde los contratos);
  - también en `GET /api/v1/openapi.json`.

> Todos los datos son **DEMO** y no tienen validez comercial. Desde el módulo 5 todo endpoint funcional exige una **sesión** (cookie HttpOnly `softarq_sesion`); la organización, la identidad y las funciones salen de la sesión, nunca de la solicitud.

## Arranque

```
# desde la raíz del repositorio; requiere PostgreSQL preparado (apps/api/README.md)
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start          # node dist/main.js (lee apps/api/.env)
```

Variables (con sus valores por omisión) en [`.env.example`](../../.env.example).

## Endpoints

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/health` | Público | `200 {"estado":"ok","baseDeDatos":"disponible"}` o `503 {"estado":"degradado","baseDeDatos":"no disponible"}` |
| GET | `/api/v1/auth/csrf` | Público | Crea la sesión previa (cookie) y devuelve `{ csrfToken }` para el acceso |
| POST | `/api/v1/auth/sesion` | Sesión previa + `X-CSRF-Token` + `Origin` | Inicio de sesión `{ correo, contrasena }`. Devuelve identidad, organización, funciones, capacidades, `expiraEn`, `inactividadMinutos` y un `csrfToken` nuevo; cookie nueva |
| GET | `/api/v1/auth/sesion` | Sesión | La misma respuesta (restaurar la sesión tras recargar la página) |
| DELETE | `/api/v1/auth/sesion` | Sesión + `X-CSRF-Token` + `Origin` | Cierra la sesión (revocación en el servidor); `204` |
| GET | `/api/v1/catalogos/conceptos?buscar=&limite=` | `catalogos.consultar` | Conceptos activos y aprobados: código, descripción, unidad, fórmula, si admite descuento e insumos que requieren precio. Sin rendimientos, desperdicios, tarifas ni costos. `limite` de 1 a 100 (50 por omisión); `buscar` ≤ 60 caracteres |
| GET | `/api/v1/catalogos/opciones-precio?conceptos=CON-00007,CON-00009` | `catalogos.consultar` | Para cada insumo de los conceptos (de 1 a 20), las opciones vigentes a la fecha del servidor: código de precio, producto, presentación, proveedor, vigencia y `esMenorPrecio`. **Sin precio ni contenido** |
| GET | `/api/v1/catalogos/tipos-adicional?limite=` | `catalogos.consultar` | Tipos de costo adicional (CAD-…) |
| POST | `/api/v1/calculos/demo` | `calculo.ejecutar` (Preparador) + `X-CSRF-Token` + `Origin` | Calcula con los datos de PostgreSQL y devuelve **solo** la proyección comercial |
| GET | `/api/v1/openapi.json` | Público | Especificación |

**Funciones y capacidades** (matriz completa en ADR-0007 §2): Preparador consulta y calcula; Revisor consulta, pero el cálculo le responde 403 (en el libro, `BTN_Calcular` exige la función Preparador).

### Cuerpo de `POST /api/v1/calculos/demo`

- **`consolidarCompras`:** obligatorio.
- **Partidas `CONCEPTO`:** `id`, `conceptoCodigo`, `descripcion` opcional y `mediciones` (renglones con `signo`, `piezas`, `largo`, `ancho` y `alto`; las dimensiones que la fórmula no usa van en `null`).
- **Partidas `ADICIONAL`:** `id`, `tipoAdicionalCodigo`, `descripcion`, `cantidad` y `monto`.
- **`preciosElegidos`:** códigos de precio, uno por insumo. El servidor nunca elige por el cliente.

Reglas del cuerpo:
- Los decimales van como **texto** (`"4.5"`, no `4.5`).
- No se admiten campos adicionales: `fechaCalculo`, `organizacionId`, precios o parámetros dan 400. Las cabeceras de organización o de función que envíe el cliente se ignoran.

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
| 401 | `NO_AUTENTICADO` | Sin cookie de sesión |
| 401 | `SESION_NO_VALIDA` | Sesión desconocida, vencida (30 min sin actividad u 8 h), revocada, o usuario o pertenencia desactivados; borra la cookie |
| 401 | `CREDENCIALES_INVALIDAS` | Acceso fallido, siempre con el mismo mensaje (no revela si la cuenta existe) |
| 403 | `SIN_PERMISO` | La función no permite la operación (p. ej., Revisor al calcular) |
| 403 | `CSRF_NO_VALIDO` | `X-CSRF-Token` ausente o de otra sesión |
| 403 | `ORIGEN_NO_PERMITIDO` | `POST` o `DELETE` sin `Origin` permitido |
| 404 | `NO_ENCONTRADO` | Ruta o códigos inexistentes en la organización de la sesión (los de otra organización responden igual) |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Más de `API_LIMITE_CUERPO_KB` |
| 415 | `TIPO_DE_CONTENIDO_NO_ADMITIDO` | POST sin `application/json` |
| 422 | `CALCULO_BLOQUEADO` | Bloqueos de negocio (BL-03, BL-04, BL-08, BL-12, BL-13…), sin importes |
| 429 | `DEMASIADAS_SOLICITUDES` | Límite general, de cálculo o de intentos de acceso (`Retry-After`) |
| 503 | `SERVICIO_NO_DISPONIBLE` | PostgreSQL no disponible |
| 500 | `ERROR_INTERNO` | Error inesperado (sin detalles internos) |

## Ejemplos reproducibles (datos DEMO)

Los cuerpos de [`ejemplos/`](ejemplos) reproducen los cuatro escenarios verificados. Una prueba exige que coincidan con los fixtures del motor.

Con `curl` hay que recorrer el mismo flujo que el navegador: archivo de cookies, token CSRF y `Origin`. Git Bash, desde la raíz del repositorio. La contraseña se lee del archivo local de accesos y **no se escribe en la línea de comandos ni aquí**:

```
API=http://localhost:3000
ORIGEN="Origin: http://localhost:5173"
JAR=../_work/tmp/cookies-curl.txt
JSON='JSON.parse(require("fs").readFileSync(0,"utf8"))'
SOFTARQ_CLAVE=$(node -p 'require("D:/Proyecto_SoftArq/_work/secrets/accesos-demo-softarq_dev.json").cuentas["preparador.demo@softarq.test"].contrasena')

curl -s $API/health
CSRF=$(curl -s -c $JAR $API/api/v1/auth/csrf | node -p "$JSON.csrfToken")
CSRF=$(curl -s -b $JAR -c $JAR -X POST $API/api/v1/auth/sesion -H "$ORIGEN" -H "X-CSRF-Token: $CSRF" \
       -H "Content-Type: application/json" \
       --data "{\"correo\":\"preparador.demo@softarq.test\",\"contrasena\":\"$SOFTARQ_CLAVE\"}" | node -p "$JSON.csrfToken")
curl -s -b $JAR "$API/api/v1/catalogos/conceptos?limite=10"
curl -s -b $JAR "$API/api/v1/catalogos/opciones-precio?conceptos=CON-00007"
curl -s -b $JAR -X POST $API/api/v1/calculos/demo -H "$ORIGEN" -H "X-CSRF-Token: $CSRF" \
     -H "Content-Type: application/json" --data @docs/api/ejemplos/calculo-r1-faldones-10m.json
curl -s -b $JAR -c $JAR -X DELETE $API/api/v1/auth/sesion -H "$ORIGEN" -H "X-CSRF-Token: $CSRF" -o /dev/null -w "%{http_code}\n"   # 204
rm -f $JAR; unset SOFTARQ_CLAVE
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
| Intentos de acceso | 5 fallos por cuenta e IP, 20 fallos por cuenta y 30 intentos por IP, en ventanas de 15 min |
| Contraseña en el acceso | 1 a 128 caracteres |

Los limitadores son en memoria y valen para una sola instancia; los bloqueos de acceso son temporales.
