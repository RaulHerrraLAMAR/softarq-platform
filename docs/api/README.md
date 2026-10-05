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
| GET | `/api/v1/emisiones/{id}/seguimiento?antesDe=N` | `cotizaciones.consultar` | Fecha/zona del servidor, vigencia, respuesta vigente, historial paginado de 50 y acciones permitidas/motivos |
| POST | `/api/v1/emisiones/{id}/respuestas` | `respuestas.registrar` (Preparador) | Registro interno sobre emisión exacta; resultado, fecha recibida y nota opcional; CSRF e Idempotency-Key |
| POST | `/api/v1/emisiones/{id}/respuestas/{eventoId}/correcciones` | `respuestas.corregir` (Preparador) | Nuevo evento que corrige la cabeza, con motivo obligatorio; conserva historia; CSRF e Idempotency-Key |
| GET | `/api/v1/excepciones/componentes?conceptos=CON-00009` | `cotizaciones.preparar` + `excepciones.consultar` (Preparador) | Componentes activos de los conceptos (1 a 20) con rendimiento y desperdicio de catálogo, para registrar una excepción. Contrato interno: sin costos, tarifas ni traslape (ADR-0014) |
| GET | `/api/v1/cotizaciones/{id}/versiones/{numero}/excepciones` | `cotizaciones.consultar` + `excepciones.consultar` (Preparador y Revisor) | Excepciones congeladas en la versión: tipo, referencia, valor de catálogo con el que se calculó, valor aplicado, motivo, estado (PENDIENTE, AUTORIZADA, RECHAZADA), decisión y `acciones.decidir` con su motivo |
| POST | `/api/v1/revisiones/{id}/excepciones/{numero}/decision` | `revisiones.decidir` + `excepciones.consultar` (Revisor ≠ preparador) + `Idempotency-Key` | `{ versionId, decision: AUTORIZADA\|RECHAZADA, comentario? }` durante la revisión PENDIENTE de esa versión. Una decisión por excepción, inmutable. 409 `CONFLICTO_EXCEPCION` con `excepcionesVigentes` o `CONFLICTO_REVISION`; 422 `DECISION_BLOQUEADA` (BL-17) (200) |
| GET | `/health` | Público | `200 {"estado":"ok","baseDeDatos":"disponible"}` o `503 {"estado":"degradado","baseDeDatos":"no disponible"}` |
| GET | `/api/v1/auth/csrf` | Público | Crea la sesión previa (cookie) y devuelve `{ csrfToken }` para el acceso |
| POST | `/api/v1/auth/sesion` | Sesión previa + `X-CSRF-Token` + `Origin` | Inicio de sesión `{ correo, contrasena }`. Devuelve identidad, organización, funciones, capacidades, `expiraEn`, `inactividadMinutos` y un `csrfToken` nuevo; cookie nueva |
| GET | `/api/v1/auth/sesion` | Sesión | La misma respuesta (restaurar la sesión tras recargar la página) |
| DELETE | `/api/v1/auth/sesion` | Sesión + `X-CSRF-Token` + `Origin` | Cierra la sesión (revocación en el servidor); `204` |
| GET | `/api/v1/catalogos/conceptos?buscar=&limite=` | `catalogos.consultar` | Conceptos activos y aprobados (y personalizados activos, que exigen excepción; módulo 10): código, `clase`, descripción, unidad, fórmula, si admite descuento e insumos que requieren precio. Sin rendimientos, desperdicios, tarifas ni costos. `limite` de 1 a 100 (50 por omisión); `buscar` ≤ 60 caracteres |
| GET | `/api/v1/catalogos/opciones-precio?conceptos=CON-00007,CON-00009` | `catalogos.consultar` | Para cada insumo de los conceptos (de 1 a 20), las opciones vigentes a la fecha del servidor: código de precio, producto, presentación, proveedor, vigencia y `esMenorPrecio`. **Sin precio ni contenido** |
| GET | `/api/v1/catalogos/tipos-adicional?limite=` | `catalogos.consultar` | Tipos de costo adicional (CAD-…) |
| POST | `/api/v1/calculos/demo` | `calculo.ejecutar` (Preparador) + `X-CSRF-Token` + `Origin` | Calcula con los datos de PostgreSQL y devuelve **solo** la proyección comercial |
| GET | `/api/v1/clientes?buscar=&incluirInactivos=&limite=` | `clientes.consultar` | Clientes (activos por omisión) |
| GET | `/api/v1/clientes/{id}` | `clientes.consultar` | Cliente, sus proyectos y número de cotizaciones abiertas |
| POST | `/api/v1/clientes` | `clientes.gestionar` + `Idempotency-Key` | Crea un cliente `{ nombre, contactoNombre?, contactoTelefono?, contactoCorreo? }` con código `CLI-NNNNN` (el contacto lo exige la emisión, BL-01) |
| PATCH | `/api/v1/clientes/{id}` | `clientes.gestionar` | `{ revision, nombre?, contacto…?, activo? }`; desactivar no borra; revisión obsoleta: 409 |
| GET | `/api/v1/proyectos?clienteId=&buscar=&incluirInactivos=&limite=` | `clientes.consultar` | Proyectos (activos con cliente activo, por omisión) |
| GET | `/api/v1/proyectos/{id}` | `clientes.consultar` | Proyecto |
| POST | `/api/v1/proyectos` | `clientes.gestionar` + `Idempotency-Key` | `{ clienteId, nombre, municipio?, entidadFederativa?, descripcion? }`; el cliente debe estar activo |
| PATCH | `/api/v1/proyectos/{id}` | `clientes.gestionar` | `{ revision, …campos?, activo? }`; el cliente no cambia |
| GET | `/api/v1/cotizaciones?buscar=&clienteId=&proyectoId=&limite=` | `cotizaciones.consultar` | Cotizaciones con folio WEB DEMO y última versión |
| POST | `/api/v1/cotizaciones` | `cotizaciones.preparar` + `Idempotency-Key` | `{ proyectoId, captura? }`: reserva el folio `COT-AAAA-NNNNN` y crea el borrador (revisión 0) |
| GET | `/api/v1/cotizaciones/{id}` | `cotizaciones.consultar` | Cotización, borrador (captura, revisión, autor y completitud), versiones y eventos recientes |
| PUT | `/api/v1/cotizaciones/{id}/borrador` | `cotizaciones.preparar` | `{ revision, captura }`; puede estar incompleto; revisión obsoleta: 409 `CONFLICTO_EDICION` con `actual`. Las referencias ya guardadas se conservan aunque dejen de estar disponibles; una referencia nueva no disponible: 422 `REFERENCIA_NO_DISPONIBLE` con `campos`. `captura.excepciones` (opcional, módulo 10): excepciones B-22 con motivo; una que no corresponde a la captura o al catálogo, o fuera de rango: 422 `EXCEPCION_INVALIDA` con `campos`. El detalle solo devuelve las excepciones a quien tiene `excepciones.consultar`. El detalle devuelve `borrador.referencias` (disponibilidad hoy) |
| POST | `/api/v1/cotizaciones/{id}/versiones` | `cotizaciones.preparar` + `calculo.ejecutar` + `Idempotency-Key` | `{ revisionBorrador, motivo? }`: el servidor calcula con el borrador guardado y guarda una versión inmutable (201). Sin captura ni importes del navegador |
| GET | `/api/v1/cotizaciones/{id}/versiones/{numero}` | `cotizaciones.consultar` | La versión tal como se guardó (nunca se recalcula). `version.estado` (BORRADOR, EN_REVISION, APROBADA) se deriva de su última revisión |
| POST | `/api/v1/cotizaciones/{id}/versiones/{numero}/revisiones` | `revisiones.enviar` (Preparador) + `Idempotency-Key` | `{ revisionBorrador }`: envía a revisión la **última** versión si corresponde al borrador guardado. Verifica las condiciones vigentes sin modificar la versión. 409 `REVISION_PENDIENTE`, `VERSION_NO_VIGENTE` o `BORRADOR_DESACTUALIZADO`; 422 `ENVIO_BLOQUEADO` con `problemas` (201) |
| GET | `/api/v1/revisiones?estado=&limite=` | `cotizaciones.consultar` | Bandeja (por omisión PENDIENTE, las más antiguas primero), con `acciones` permitidas a la sesión |
| GET | `/api/v1/revisiones/{id}` | `cotizaciones.consultar` | Revisión, versión revisada (proyección comercial guardada), `verificacion` vigente (si está pendiente) y `eventos` |
| POST | `/api/v1/revisiones/{id}/decision` | `revisiones.decidir` (Revisor) + `Idempotency-Key` | `{ decision: APROBAR\|SOLICITAR_CAMBIOS, versionId, revision, observaciones? }`. Observaciones obligatorias (≥ 10 caracteres) para solicitar cambios. 409 `CONFLICTO_REVISION` con `revisionVigente`; 422 `DECISION_BLOQUEADA` (BL-17: quien aprueba no puede ser el autor) o `APROBACION_BLOQUEADA` con `problemas`. **La aprobación no es una emisión** (200) |
| POST | `/api/v1/revisiones/{id}/retiro` | `revisiones.enviar` (Preparador) + `Idempotency-Key` | `{ revision, motivo? }`: retira una revisión pendiente para corregir (200) |
| POST | `/api/v1/revisiones/{id}/anulacion` | `revisiones.decidir` (Revisor) + `Idempotency-Key` | `{ revision, motivo }` (motivo ≥ 10 caracteres): anula una aprobación **antes de emitir** con un evento nuevo; la aprobación original se conserva. 409 `CONFLICTO_REVISION` o `VERSION_EMITIDA` (200) |
| GET | `/api/v1/cotizaciones/{id}/versiones/{numero}/emision/validacion` | `cotizaciones.consultar` | Lo que se emitiría hoy: fecha de emisión y vigencia (CR-16), aprobación vigente, destinatario (cliente, proyecto y contacto), emisor, textos, `bloqueos` (BL-01 a BL-20), `avisos`, `puedeEmitir` y `motivoNoEmitir` para la sesión, y la emisión si ya existe |
| POST | `/api/v1/cotizaciones/{id}/versiones/{numero}/emision` | `emisiones.emitir` (Preparador, o Revisor distinto del autor) + `Idempotency-Key` | `{ versionId, revisionId }`: vuelve a comprobarlo todo, genera el PDF DEMO, lo guarda y registra la emisión (201 solo con archivo y registro). 422 `EMISION_BLOQUEADA` con `problemas`; 409 `VERSION_EMITIDA`, `APROBACION_NO_VIGENTE`, `CONFLICTO_EMISION`, `FOLIO_NO_ACTIVO`, `BORRADOR_DESACTUALIZADO`; 500 `DOCUMENTO_NO_GENERADO` (no hay emisión; reintente con la misma clave). No recalcula importes |
| GET | `/api/v1/emisiones/{id}` | `cotizaciones.consultar` | Registro de la emisión (quién preparó, aprobó y emitió; fechas; archivo con tamaño y SHA-256) y el contenido exacto del documento |
| GET | `/api/v1/emisiones/{id}/documento` | `cotizaciones.consultar` | El PDF emitido (`application/pdf`, `Content-Disposition: attachment; filename="COT-AAAA-NNNNN-vN.pdf"`, `Repr-Digest`). Mismos bytes siempre; si falta o no coincide con su registro: 500 `DOCUMENTO_NO_DISPONIBLE` (nunca se regenera) |
| GET | `/api/v1/emisor` | `cotizaciones.consultar` | Datos del emisor (BL-15), lo que falta y si la sesión puede editarlos |
| PUT | `/api/v1/emisor` | `emisor.configurar` (Administrador del sistema) | `{ revision, nombre, domicilio, telefono, correo, logo, motivo }`; revisión obsoleta: 409. No altera documentos emitidos |
| POST | `/api/v1/cotizaciones/{id}/descarte` | `cotizaciones.preparar` (Preparador) + `Idempotency-Key` | `{ motivo }`: descarta la cotización (folio DESCARTADO, sin reutilizarse) solo sin emisiones, revisión pendiente ni aprobación vigente; si no, 422 `DESCARTE_BLOQUEADO` con el motivo (200) |
| GET | `/api/v1/openapi.json` | Público | Especificación |

**Funciones y capacidades** (matriz completa en [`docs/modelo-conceptual.md`](../modelo-conceptual.md) §6):
- **Preparador:** consulta, calcula, gestiona clientes y proyectos, prepara, envía, retira, descarta y emite.
- **Revisor:** consulta, decide, autoriza o rechaza excepciones, anula aprobaciones y emite versiones que no preparó.
- **Administrador del catálogo:** también gestiona clientes y proyectos.
- **Administrador del sistema:** configura el emisor.

**Escrituras:** toda solicitud `POST`, `PUT`, `PATCH` o `DELETE` exige `X-CSRF-Token` y un `Origin` permitido. Las altas exigen además `Idempotency-Key` (UUID por intención): repetirla con el mismo contenido devuelve el recurso creado con `Idempotent-Replayed: true`; con otra operación u otro contenido, 422. Las claves duran 24 h (ADR-0008 §6).

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

Según el error, el sobre lleva además `campos` (400, 422 `CAPTURA_INCOMPLETA` y 422 `REFERENCIA_NO_DISPONIBLE`), `faltantes` (404), `problemas` (422 `CALCULO_BLOQUEADO`) o `actual` (409 `CONFLICTO_EDICION`: revisión, autor, hora y, en borradores, la captura vigente).

| HTTP | Código | Cuándo |
|---|---|---|
| 400 | `SOLICITUD_INVALIDA` | No cumple el contrato, JSON mal formado o reglas de captura (por ejemplo AREA con ancho y alto) |
| 401 | `NO_AUTENTICADO` | Sin cookie de sesión |
| 401 | `SESION_NO_VALIDA` | Sesión desconocida, vencida (30 min sin actividad u 8 h), revocada, o usuario o pertenencia desactivados; borra la cookie |
| 401 | `CREDENCIALES_INVALIDAS` | Acceso fallido, siempre con el mismo mensaje (no revela si la cuenta existe) |
| 403 | `SIN_PERMISO` | La función no permite la operación (p. ej., Revisor al calcular) |
| 403 | `CSRF_NO_VALIDO` | `X-CSRF-Token` ausente o de otra sesión |
| 403 | `ORIGEN_NO_PERMITIDO` | `POST`, `PUT`, `PATCH` o `DELETE` sin `Origin` permitido |
| 404 | `NO_ENCONTRADO` | Ruta, id o códigos inexistentes en la organización de la sesión (los de otra organización responden igual) |
| 409 | `CONFLICTO_EDICION` | Revisión obsoleta de borrador, cliente o proyecto: no se sobrescribió nada |
| 409 | `BORRADOR_DESACTUALIZADO` | El borrador cambió después de la revisión indicada al guardar versión: no se guardó ninguna versión |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Más de `API_LIMITE_CUERPO_KB` |
| 415 | `TIPO_DE_CONTENIDO_NO_ADMITIDO` | POST sin `application/json` |
| 422 | `CALCULO_BLOQUEADO` | Bloqueos de negocio (BL-01, BL-02, BL-03, BL-04, BL-08, BL-12, BL-13…), sin importes; al guardar versión, ninguna versión |
| 422 | `CAPTURA_INCOMPLETA` | El borrador no está completo para calcular: ninguna versión |
| 422 | `REGISTRO_INACTIVO` | Cliente o proyecto inactivo para un registro nuevo |
| 422 | `IDEMPOTENCIA_CONFLICTO` / `IDEMPOTENCIA_CADUCADA` | Clave reutilizada para otra operación o contenido, o con más de 24 h |
| 409 | `REVISION_PENDIENTE` / `VERSION_NO_VIGENTE` / `CONFLICTO_REVISION` | Hay una versión en revisión (no se edita ni se calcula), no es la última versión, o la revisión cambió o ya se decidió (`revisionVigente`) |
| 422 | `ENVIO_BLOQUEADO` / `APROBACION_BLOQUEADA` / `DECISION_BLOQUEADA` | Bloqueos de la verificación vigente o BL-17/BL-19 (`problemas`); el estado no cambió |
| 422 | `REFERENCIA_NO_DISPONIBLE` | Concepto, tipo de adicional o precio nuevo en la captura que no existe en la organización o no está disponible hoy; `campos` lleva la ruta |
| 409 | `VERSION_EMITIDA` / `APROBACION_NO_VIGENTE` / `CONFLICTO_EMISION` / `FOLIO_NO_ACTIVO` | La versión ya se emitió; la aprobación se anuló o cambió; la versión o la aprobación confirmadas ya no son las vigentes; o la cotización está descartada. Nada cambió |
| 422 | `EMISION_BLOQUEADA` / `DESCARTE_BLOQUEADO` | Bloqueos de emisión a la fecha de emisión (`problemas`), o un estado que no permite descartar (revisión pendiente, aprobación vigente, emisión) |
| 500 | `DOCUMENTO_NO_GENERADO` | No se generó o guardó el PDF: no hay emisión ni archivo; reintente con la misma clave |
| 500 | `DOCUMENTO_NO_DISPONIBLE` | El archivo emitido falta o no coincide con su tamaño o SHA-256: se restaura desde el respaldo (nunca se regenera) |
| 429 | `DEMASIADAS_SOLICITUDES` | Límite general, de cálculo o de intentos de acceso (`Retry-After`) |
| 503 | `SERVICIO_NO_DISPONIBLE` | PostgreSQL no disponible |
| 500 | `ERROR_INTERNO` | Error inesperado (sin detalles internos) |

## Ejemplos reproducibles (datos DEMO)

Los cuerpos de [`ejemplos/`](ejemplos) reproducen los cuatro escenarios verificados. Una prueba exige que coincidan con los fixtures del motor.

**Use `scripts/http/api-json.mjs`** (módulo 8). Recorre el mismo flujo que el navegador (cookie, CSRF y `Origin`) y lee cada cuerpo JSON de un **archivo UTF-8**: nada viaja como argumento.

En los módulos 6 y 7, pasar el JSON como argumento de `curl` en Git Bash dañó los acentos de `COT-2026-00001` y de la copia de la v1 de `COT-2026-00003`. Esos registros históricos no se reparan.

Desde la raíz del repositorio, con la API en marcha:

```
H="node scripts/http/api-json.mjs --api http://localhost:3000 --origen http://localhost:5173"
P="$H --estado ../_work/tmp/sesion-prep.json"; R="$H --estado ../_work/tmp/sesion-rev.json"
# Credenciales en archivos (nunca en la línea de comandos), desde el archivo local de accesos:
node -e 'const a=require("D:/Proyecto_SoftArq/_work/secrets/accesos-demo-softarq_dev.json").cuentas,fs=require("fs");
  for (const [f,c] of [["prep","preparador.demo@softarq.test"],["rev","revisor.demo@softarq.test"]])
    fs.writeFileSync(`../_work/tmp/cred-${f}.json`, JSON.stringify({correo:c,contrasena:a[c].contrasena}))'
$P entrar ../_work/tmp/cred-prep.json
$R entrar ../_work/tmp/cred-rev.json
$P comprobar-acentos          # OBLIGATORIO antes de crear datos de prueba: ida y vuelta de «Construcción Peñasco — Ñandú…»
$P post /api/v1/calculos/demo docs/api/ejemplos/calculo-r1-faldones-10m.json                         # total 54190.68
# Cuerpos con acentos: escríbalos en archivos UTF-8 (p. ej. ../_work/tmp/cliente.json) y páselos por ruta.
$P post /api/v1/clientes ../_work/tmp/cliente.json      # {"nombre":"[DEMO] …","contactoNombre":"…","contactoTelefono":"…"}
$P post /api/v1/proyectos ../_work/tmp/proyecto.json    # {"clienteId":"…","nombre":"…","municipio":"…","entidadFederativa":"…","descripcion":"…"}
$P post /api/v1/cotizaciones ../_work/tmp/cotizacion.json   # {"proyectoId":"…","captura":<docs/api/ejemplos/borrador-r1-faldones-10m.json>}
$P post /api/v1/cotizaciones/<id>/versiones ../_work/tmp/version.json            # {"revisionBorrador":0}
$P post /api/v1/cotizaciones/<id>/versiones/1/revisiones ../_work/tmp/envio.json # {"revisionBorrador":0}
$R post /api/v1/revisiones/<revisionId>/decision ../_work/tmp/decision.json      # {"decision":"APROBAR","versionId":"…","revision":0}
$P get  /api/v1/cotizaciones/<id>/versiones/1/emision/validacion
$P post /api/v1/cotizaciones/<id>/versiones/1/emision ../_work/tmp/emision.json --idem <uuid>   # {"versionId":"…","revisionId":"…"}
$P descargar /api/v1/emisiones/<emisionId>/documento ../_work/tmp/COT-AAAA-NNNNN-v1.pdf          # imprime tamaño y SHA-256
$P salir; $R salir; rm -f ../_work/tmp/cred-*.json ../_work/tmp/sesion-*.json
```

- Repetir un `post` con la misma `--idem` reproduce el resultado (`Idempotent-Replayed: true`).
- La prueba de humo del módulo 8 (`_work/tmp/m8/humo-emision.mjs`) automatiza este recorrido.

`docs/api/ejemplos/borrador-r1-faldones-10m.json` es la captura en borrador (`EsquemaCapturaBorrador`) del escenario R1: `null` = sin capturar, la selección es por insumo y no lleva resultados.

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
