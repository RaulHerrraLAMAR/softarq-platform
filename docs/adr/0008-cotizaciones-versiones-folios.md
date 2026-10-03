# ADR-0008 — Clientes, proyectos y cotizaciones con folio, borrador y versiones

- **Fecha:** 03/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `apps/api/src/modules/cotizaciones` (dominio, aplicación e infraestructura);
  - `apps/api/src/http/controladores-cotizaciones.ts`;
  - la migración `20261003062244_cotizaciones` (tablas, CHECK, trigger y funciones) y `scripts/db/permisos-app.sql`;
  - `packages/contracts/src/api/cotizaciones.ts`;
  - `apps/web/src/cotizaciones`, `apps/web/src/clientes`, `apps/web/src/navegacion`, `apps/web/src/captura` (borrador y hook común).

## Contexto

Hasta el módulo 5 la web solo calculaba en memoria. Este módulo permite que el Preparador cree cliente, proyecto y una cotización con folio, guarde un borrador y genere versiones calculadas en el servidor que **no cambian después**, y que el Revisor las consulte.

**Fuera de alcance:** aprobación, rechazo de revisión, emisión, PDF, correo, facturación, suscripciones, Expo y despliegue.

## Decisiones

### 1. Contraste con el libro (VBA de `entrega/fuentes/vba`, solo lectura)

| Fuente | Libro | Web |
|---|---|---|
| `modIds.Id_NuevoFolio` | `COT-AAAA-NNNNN`, contador por año (`Year(Hoy())`) en `tblContadores`; se reserva **al crear el borrador** y nunca se reutiliza (D-14) | Mismo formato y mismo momento. Contador propio por organización y año (§5) |
| `modIds.Id_Version` | `folio-vN` | Igual |
| `tblClientes` | `nombre_razon_social`, `contacto_*`, `activo`, `notas` | Solo nombre y `activo`. El contacto lo exige BL-01 **para emitir**; se añadirá con la emisión |
| `tblProyectos` | `id_cliente`, nombre, municipio, entidad, descripción, `activo` | Los mismos; solo el nombre es obligatorio (BL-02 exige el resto para emitir) |
| `modCatalogos.Cat_RequiereFuncion` | Clientes y proyectos: Preparador o Administrador del catálogo | `clientes.gestionar` para esas dos funciones |
| `Cat_CambiarActivo`, `Cliente_BorradoresAbiertos` | Desactivar no borra; deja de ofrecerse; avisa de los borradores abiertos | Igual (§3) |
| `Cot_Nueva`, `BTN_GuardarBorrador`, `BTN_Calcular` | `Req_Funcion FN_PREP` | `cotizaciones.preparar` y `calculo.ejecutar` |
| `EST_*`, `estado_folio` | 9 estados de versión; folio Activo o Descartado | Alcanzables: folio **ACTIVO** y versión **BORRADOR** (§3) |
| `Motor_CalcularVersion`, `Calc_Sello` | Un cálculo con problemas no escribe resultados; sello de entradas y resultados (BL-16) | Un bloqueo no crea versión; huella SHA-256 |
| `modRevision` (emitir) | Copia `cli_*`, `pry_*`, parámetros y precios | Se copian **en cada versión** |
| `His_NuevaVersion` (B-34) | vN+1 con modo de precios y motivo, solo tras emitir | **Diferencia:** cada cálculo guardado es una versión; el motivo es opcional y el servidor calcula el resumen de cambios. Duplicar y «precios anteriores» quedan para la emisión |

### 2. Modelo relacional

Todas las tablas llevan `organizacion_id`; las relaciones son **FK compuestas** con la organización.

| Tabla | Contenido | Garantías en la base |
|---|---|---|
| `cliente` | `codigo` (`CLI-NNNNN`), `nombre`, `activo`, `revision`, autoría | UNIQUE (organización, código); CHECK de formato y nombre sin espacios sobrantes |
| `proyecto` | `cliente_id`, `codigo` (`PRY-NNNNN`), nombre, municipio, entidad, descripción, `activo`, `revision` | FK (organización, cliente) → `cliente`; UNIQUE (organización, cliente, id) como destino de la FK de la cotización |
| `cotizacion` | `folio`, `anio_folio`, `origen` = `WEB_DEMO`, `estado_folio`, `cliente_id`, `proyecto_id`, `ultima_version` | **FK (organización, cliente, proyecto) → `proyecto`**: imposible combinar un proyecto de otro cliente u organización. UNIQUE (organización, folio); CHECK de formato y de que el año del folio sea `anio_folio` |
| `cotizacion_borrador` | `captura jsonb`, `revision`, quién y cuándo | 1:1 con la cotización; CHECK de objeto JSON |
| `cotizacion_version` | número, revisión del borrador de origen, captura, solicitud del motor, **entrada y resultado internos**, proyección comercial, avisos, total, fecha de cálculo, versión del motor, huellas, copias de cliente y proyecto, autor (id y nombre copiado), motivo y resumen de cambios | UNIQUE (cotización, número); CHECK de tipos JSON y huellas de 32 bytes; **trigger** que impide UPDATE y DELETE |
| `contador` | (organización, entidad: `CLI`, `PRY`, `COT-AAAA`), `ultimo` | PK compuesta; CHECK 1–99999 |
| `bitacora` | entidad, id, tipo, usuario, `detalle jsonb` mínimo | Solo alta |
| `idempotencia` | (organización, usuario, clave), operación, huella de la solicitud, recurso, caducidad | PK compuesta; CHECK de huella |

- **Autoría:** toda columna de autor tiene FK (organización, usuario) → `membresia`: el autor pertenece a la organización.
- **Datos internos:** `entrada_calculo` y `resultado_interno` guardan parámetros, precios elegidos copiados, consumos, conversiones, tarifas y compras. Explican el cálculo y **nunca salen de la API**.
- **Captura:** lo escrito por el preparador (medidas, códigos, montos capturados de adicionales). La ven los miembros con `cotizaciones.consultar`; no es un dato para el cliente final.

### 3. Estados, desactivación y permisos

- **Estados alcanzables:** folio `ACTIVO`; versión `BORRADOR`, que la web rotula «Borrador calculado · sin enviar a revisión». En el libro, una versión calculada y no enviada sigue en Borrador. Los contratos solo enumeran estos estados: APROBADA y EMITIDA no son alcanzables.
- **Estados futuros:** revisión y emisión se registrarán en una tabla aparte de solo inserción; nunca con UPDATE sobre la versión.
- **Cliente o proyecto desactivado:**
  - se consulta con «incluir inactivos» y en el historial;
  - no se ofrece para cotizaciones ni proyectos nuevos (422 `REGISTRO_INACTIVO`);
  - sus borradores se pueden abrir, editar y guardar;
  - **crear una versión** responde 422 `CALCULO_BLOQUEADO` con BL-01 o BL-02 hasta reactivarlo;
  - las versiones guardadas no cambian;
  - al desactivar se avisa de las cotizaciones abiertas (`Cliente_BorradoresAbiertos`).
- **Cliente y proyecto de una cotización:** fijos desde la creación (el cliente sale del proyecto). Para otra obra, otra cotización.

| Capacidad | Preparador | Revisor | Adm. catálogo | Adm. sistema |
|---|---|---|---|---|
| `clientes.consultar`, `cotizaciones.consultar` | ✓ | ✓ | ✓ | ✓ |
| `clientes.gestionar` | ✓ | ✗ | ✓ | ✗ |
| `cotizaciones.preparar` | ✓ | ✗ | ✗ | ✗ |
| Crear versión (`cotizaciones.preparar` **y** `calculo.ejecutar`, organización DEMO) | ✓ | ✗ | ✗ | ✗ |

La guardia exige todas las capacidades de `@Requiere(...)`. Un id de otra organización responde **404 como uno inexistente**; los cuerpos estrictos rechazan `organizacionId`.

### 4. Borrador, vista previa y versión

- **Contrato del borrador** (`EsquemaCapturaBorrador`): códigos y textos, sin objetos de catálogo ni resultados.
  - `null` = sin capturar; `"0"` = cero (un valor, que el cálculo rechaza después con su regla);
  - un decimal con formato inválido se rechaza (400 con la ruta) y el borrador no se guarda; la web conserva el cambio local marcado;
  - `segundaMedida` conserva la elección de las fórmulas AREA; la selección es por insumo.
- **Completitud:** el servidor la calcula con las mismas rutas y mensajes que la web y, al final, con el esquema de la solicitud de cálculo. Un borrador incompleto **no tiene total**.
- **Vista previa:** `POST /calculos/demo` sin cambios, rotulada «no se guarda» y ligada a la huella de la captura.
- **Versión:** la calcula el servidor con el **borrador guardado** en la revisión indicada; el navegador no envía captura, resultados ni importes.
- **Recalcular** crea una versión nueva con las condiciones vigentes; abrir una versión nunca recalcula.
- **Bloqueo:** responde 422 con los bloqueos, sin importes; solo se registra el evento `CALCULO_BLOQUEADO`.

### 5. Folios e historial

- **Formato:** `COT-AAAA-NNNNN`, el del libro. La columna `origen = 'WEB_DEMO'` y la web lo muestran siempre junto al folio («WEB DEMO»).
- **Coincidencias con el libro:** el número puede coincidir con folios del libro (p. ej., `COT-2026-00001` existe en el Excel). Como en la decisión D2 de [`fase1-estado-verificado.md`](../fase1-estado-verificado.md), un folio se identifica por **origen + organización + folio**. No se importan folios ni se continúa el contador del libro.
- **Ámbito:** organización y año. **Año:** el de la fecha civil del servidor en `SOFTARQ_ZONA_HORARIA` (America/Mexico_City) al reservar, como `Year(Hoy())`. Los instantes se guardan en `timestamptz` y se muestran en esa zona.
- **Asignación:** `INSERT … ON CONFLICT (organizacion_id, entidad) DO UPDATE SET ultimo = ultimo + 1 RETURNING`, dentro de la misma sentencia que crea la cotización. Nunca `MAX + 1`. Las restricciones únicas son la última garantía.
- **Saltos:** no se exige numeración continua (ninguna regla verificada lo pide). En la práctica no hay saltos porque contador y alta se confirman juntos; los números nunca se reutilizan.
- **Versiones:** v1, v2…, por cotización, con `UPDATE cotizacion SET ultima_version = ultima_version + 1 … RETURNING` sobre la fila bloqueada; UNIQUE (cotización, número).

### 6. Consistencia y concurrencia

**Crear versión (`POST /cotizaciones/{id}/versiones`):**

1. **Atajo de idempotencia:** si la clave ya tiene un éxito, se devuelve la versión guardada sin recalcular.
2. **Fase A, lectura coherente:** una transacción interactiva `REPEATABLE READ` y `READ ONLY` (máximo 15 s) lee borrador (en la revisión pedida; si no, 409), cotización, cliente, proyecto, versión anterior y **todos** los catálogos con el ensamblador existente (`RepositorioCatalogos` sobre el cliente de la transacción). El motor calcula en memoria dentro de ella.
   - Una sola instantánea: imposible mezclar precios o parámetros leídos en momentos distintos.
   - Al ser de solo lectura, su `COMMIT` no escribe WAL: evita los `COMMIT` lentos del módulo 5.
3. **Fase B, escritura atómica:** **una sola sentencia** (`softarq_crear_version`, PL/pgSQL `SECURITY INVOKER`, `READ COMMITTED`) que:
   - registra la clave de idempotencia (si otra solicitud igual ya se confirmó, `unique_violation` y se reproduce su resultado);
   - bloquea el borrador (`FOR UPDATE`) y exige la revisión calculada (si no, `BORRADOR_DESACTUALIZADO`, 409);
   - comprueba con `FOR SHARE` que cliente y proyecto siguen activos (si no, BL-01/BL-02);
   - asigna el número y exige que la versión anterior sea la usada en el resumen de cambios (si no, `VERSION_CONCURRENTE` y se repite la fase A, hasta 5 intentos);
   - inserta la versión con la instantánea de la fase A y el evento.
4. **Garantía:** la versión guarda exactamente la captura de la revisión calculada y la instantánea de referencia que usó el motor. Si el catálogo cambia entre A y B, la versión sigue siendo coherente: refleja el instante de su lectura. Ninguna transacción queda abierta mientras el usuario interactúa.

**Borrador (`PUT /cotizaciones/{id}/borrador`):** `softarq_guardar_borrador` hace `UPDATE … SET revision = revision + 1 WHERE … AND revision = $esperada`. Dos guardados simultáneos: el segundo espera el bloqueo de fila, reevalúa la condición y responde **409 `CONFLICTO_EDICION`** con la revisión, la captura, el autor y la hora vigentes. La web conserva los cambios locales y ofrece comparar, recargar o guardar sobre la revisión vigente (solo por decisión explícita); si la captura del servidor es idéntica a la local (reintento cuya respuesta se perdió), adopta la revisión. Clientes y proyectos usan el mismo esquema con `revision` en `PATCH`.

**Idempotencia:**
- cabecera `Idempotency-Key` (UUID) **obligatoria** en `POST /clientes`, `/proyectos`, `/cotizaciones` y `/versiones`;
- ámbito: organización + usuario + clave; duración: 24 h (después, 422 `IDEMPOTENCIA_CADUCADA`);
- huella: SHA-256 de la operación, los parámetros de ruta y el cuerpo canónico; misma clave con otra operación u otro cuerpo: 422 `IDEMPOTENCIA_CONFLICTO`;
- solo se registran éxitos, en la misma sentencia que el recurso: un fallo no deja registro y se puede reintentar;
- reproducción: el recurso creado con la cabecera `Idempotent-Replayed: true`;
- la web crea una clave por intención (operación y contenido) y la reutiliza en doble clic, respuesta perdida y renovación del token CSRF; las claves viven en memoria y se descartan con la sesión;
- purga de claves caducadas: `db:purgar-idempotencia` con el rol migrador.

**Tiempos medidos (softarq_test, este equipo, 03/10/2026):**

| Medición | n | p50 | p95 | máx. |
|---|---|---|---|---|
| Fase A (lectura + cálculo), integración, primera corrida | 14 | 81.5 ms | 182.1 ms | 182.1 ms |
| Fase B (sentencia de escritura), primera corrida | 6 | 4.9 ms | 14.8 ms | 14.8 ms |
| Fase A, segunda corrida | 14 | 48.9 ms | 114.7 ms | 114.7 ms |
| Fase B, segunda corrida | 6 | 4.4 ms | 11.1 ms | 11.1 ms |

Los valores se escriben en `_work/registros/modulo6/tiempos-fases-integracion.json` en cada corrida. El máximo de la fase A queda dos órdenes por debajo de su límite (15 s).

### 7. Inmutabilidad y permisos en PostgreSQL

| Tabla | `softarq_app` |
|---|---|
| `cotizacion_version`, `bitacora`, `idempotencia` | `SELECT` e `INSERT`; sin `UPDATE` ni `DELETE` |
| `cliente` | `UPDATE` solo de `nombre`, `activo`, `revision`, `modificado_por`, `modificado_en` |
| `proyecto` | `UPDATE` de datos descriptivos, `activo`, `revision` y modificación; **nunca `cliente_id`** |
| `cotizacion` | `UPDATE (ultima_version)` |
| `cotizacion_borrador` | `UPDATE (captura, revision, actualizado_por, actualizado_en)` |
| `contador` | `UPDATE (ultimo)` |

- El trigger `cotizacion_version_inmutable_trg` impide UPDATE y DELETE **también al propietario** (rol migrador).
- Las funciones son `SECURITY INVOKER`: actúan con los permisos anteriores. `EXECUTE` solo para `softarq_app` (revocado a `PUBLIC`).
- Sin superusuario, DDL ni permisos globales nuevos.

### 8. Eventos

`bitacora` registra `CLIENTE_CREADO`, `CLIENTE_EDITADO` (nombres de campos), `CLIENTE_DESACTIVADO`/`REACTIVADO`, lo mismo para proyectos, `COTIZACION_CREADA` (folio), `BORRADOR_GUARDADO` (revisión), `VERSION_CREADA` (número y revisión) y `CALCULO_BLOQUEADO` (códigos BL). Nunca capturas, contraseñas, tokens ni importes.

### 9. Web

- **Rutas por hash**, sin dependencias: `#/cotizaciones`, `#/cotizaciones/nueva`, `#/cotizaciones/{id}`, `#/cotizaciones/{id}/v/{n}`, `#/clientes`, `#/clientes/{id}`, `#/proyectos` y `#/calculadora` (la calculadora DEMO, que sigue siendo la página inicial). Al recargar se vuelve a la misma pantalla y se pide lo persistido.
- **Un solo formulario:** `useCaptura` y `VistaCaptura` se extrajeron de la calculadora; el editor de cotización usa las mismas secciones, la misma validación y la misma conversión a la solicitud de cálculo.
- **Hidratación sin pérdida:** si un concepto del borrador ya no está en el catálogo, su partida se conserva con un concepto provisional y un aviso. Desde la corrección del 03/10/2026 también se conservan sus selecciones (ver «Corrección posterior»).
- **Cambios sin guardar:** se comparan con la huella de lo guardado; salir pide confirmación y cerrar la pestaña avisa (`beforeunload`).
- **La calculadora sigue montada** al navegar; «Guardar como cotización» lleva su captura como borrador inicial.
- **CSRF:** ante 403 `CSRF_NO_VALIDO` se renueva el token y se reintenta **una** vez con las mismas cabeceras, incluida la clave de idempotencia.
- **Revisor:** listas, detalle, historial y versiones sin controles de alta, edición, guardado ni cálculo.

## Cambios en pruebas existentes

- `errores.test.ts` (OpenAPI): la lista de rutas incluye las nuevas; se añadió una prueba de seguridad e idempotencia de las escrituras.
- `autenticacion.integracion.test.ts`: las capacidades del Preparador incluyen las nuevas de la matriz (§3).
- `cliente.test.ts` (web): `alCsrfNoValido` se sustituyó por `renovarCsrf`; se añadieron el reintento con la misma clave y la clasificación de 409/422.
- `autenticacion.test.ts` (módulo 5): la prueba de CSRF alterado cambiaba el **último** carácter del token, que en base64url de 32 bytes solo lleva 4 bits de datos; con «A» → «B» los bytes no cambian y la prueba fallaba al azar. Ahora altera el primer carácter. La expectativa (token alterado = inválido) no cambió.
- Las 27 pruebas de navegador anteriores no cambiaron: la calculadora sigue en la ruta inicial.

## Consecuencias

- **Positivas:** historial inmutable y explicable (entrada, resultado, motor y huellas) sin exponer costos; concurrencia sin pérdidas silenciosas; reintentos seguros; aislamiento garantizado también por la base.
- **Riesgos y pendientes:**
  - sin descartar cotizaciones ni duplicarlas (B-34/B-35 del libro);
  - el contacto del cliente y los datos del emisor se añadirán con la emisión (BL-01);
  - la purga de idempotencia es manual;
  - las listas se limitan a 100 resultados, sin paginación;
  - ~~la selección de precios guardada para un concepto que deja de existir no se conserva al guardar de nuevo~~ — corregido (ver «Corrección posterior»).

## Corrección posterior (03/10/2026, antes del módulo 7): conservar lo capturado

**Defecto reproducido** con una prueba que fallaba antes del cambio (`apps/web/src/captura/__tests__/conservar-seleccion.test.ts`; registro en `_work/registros/modulo7/01-reproduccion-antes.log`):
- `serializarBorrador` solo guardaba las selecciones de los insumos de las partidas; el concepto provisional no tenía insumos, así que sus selecciones se perdían al guardar;
- al conciliar las opciones vigentes, la web **borraba** la selección que ya no figuraba entre ellas.

**Regla:** guardar nunca elimina en silencio medidas ni selecciones porque un concepto, proveedor o precio dejó de estar disponible. La web no elige otra opción por el usuario.

- **API:**
  - el detalle del borrador incluye `referencias`: disponibilidad hoy de cada concepto (con los insumos de sus componentes activos), selección y tipo de adicional, con su motivo. Se calcula con el catálogo de la organización de la sesión y no cambia la captura;
  - al guardar (y al crear la cotización con captura inicial), una referencia **nueva** debe existir en esa organización y estar ofrecida hoy. Para un precio: no anulado, vigente, con producto y proveedor activos y del mismo insumo. Si no, 422 `REFERENCIA_NO_DISPONIBLE` con la ruta;
  - una referencia **ya guardada** en la revisión sobre la que se editó se acepta aunque ya no esté disponible;
  - un código de otra organización no existe en esta: es una referencia nueva inválida;
  - en el alta, la validación va dentro de la operación idempotente, así que una reproducción devuelve lo ya creado;
  - la completitud no cambia: depende de la forma de la captura. Calcular sigue bloqueado por sus reglas (BL-04, BL-08).
- **Web:**
  - el concepto no disponible conserva sus insumos reales, tomados de `referencias`;
  - las selecciones sin partida conocida se conservan (`seleccionConservada`);
  - una opción que deja de ofrecerse queda marcada «ya no está disponible… Se conserva hasta que elija otra o la quite»;
  - calcular exige decidir: elegir otra opción o «Quitar selección» (acción `QUITAR_SELECCION`);
  - no se piden opciones para conceptos no disponibles.

**Cambios en pruebas existentes (comportamiento cambiado a propósito):**
- `estado-solicitud.test.ts`: «una selección que desaparece de las opciones vigentes se retira con aviso» pasa a «se conserva con aviso (no se retira ni se sustituye)», y comprueba que calcular exige decidir y que «Quitar selección» la retira;
- `bloqueos.spec.ts` (E2E): además de lo anterior, comprueba que la selección no disponible ofrece «Quitar selección»;
- los datos de prueba del detalle del borrador incluyen `referencias`.
