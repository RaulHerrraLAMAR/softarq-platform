# ADR-0009 — Revisión y aprobación de versiones por un revisor distinto del preparador

- **Fecha:** 03/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `apps/api/src/modules/cotizaciones/` (`aplicacion/servicio-revisiones.ts`, `dominio/verificacion.ts`, `infraestructura/repositorio-revisiones.ts`);
  - `apps/api/src/http/controladores-cotizaciones.ts` (`EnvioRevisionController`, `RevisionesController`);
  - la migración `20261003160000_revisiones` y `scripts/db/permisos-app.sql`;
  - `packages/contracts/src/api/revisiones.ts` y los estados de `cotizaciones.ts`;
  - `apps/web/src/cotizaciones/revisiones.tsx` y `EditorCotizacion.tsx`.

## Contexto

Hasta el módulo 6, una versión calculada quedaba en Borrador para siempre. El libro de la fase 1 exige revisión humana por una persona distinta del preparador antes de emitir (D-13, BL-17). Este módulo añade el envío a revisión, la solicitud de cambios, la retirada y la aprobación, **sin modificar las versiones calculadas**.

**Fuera de alcance:** emisión, PDF, correo, duplicar o descartar cotizaciones, excepciones (B-22), Expo y despliegue. **La aprobación no es una emisión ni una entrega al cliente.**

## Decisiones

### 1. Contraste con las fuentes (solo lectura)

Fuentes: `modRevision.bas` (B-26 a B-29), `modValidacion.bas` (`Validar`, `Avisos`), `modCotizacion.bas` (`Ver_PrepararEdicion`, `Cot_Nueva`) y `modGuia.bas`; Word maestro v1.3 §3.9, §3.10, §3.11 y §5.5.

| Fuente | Libro | Web |
|---|---|---|
| `BTN_EnviarRevision` / `Rev_Enviar` (B-26) | `FN_PREP`. Solo desde Borrador. Recalcula y valida en modo ENVIAR; con bloqueos el estado no cambia y queda `ENVIO_BLOQUEADO` en bitácora | `revisiones.enviar` (Preparador). Solo la **última** versión, que debe corresponder a la captura guardada. **No recalcula**: la versión es inmutable; se **verifica** (§4). Con bloqueos: 422 `ENVIO_BLOQUEADO` y evento `ENVIO_BLOQUEADO` |
| `BTN_Observaciones` / `Rev_Observar` (B-28) | `FN_REV`. Texto obligatorio. En revisión **o Aprobada** → Borrador. No comprueba revisor ≠ preparador | `revisiones.decidir` (Revisor). Observaciones obligatorias y útiles (§5). Solo desde PENDIENTE. Sin BL-17, como en el libro |
| `BTN_Aprobar` / `Rev_Aprobar` (B-29) | `FN_REV`; `Usuario() ≠ v.preparador` («BL-17»); `Validar(APROBAR)`; si falla, `APROBACION_BLOQUEADA` | `revisiones.decidir`; quien aprueba ≠ autor de la versión (identidad, en la API y en la base); verificación vigente; si falla, 422 `APROBACION_BLOQUEADA` y evento |
| `v("preparador")` (`modCotizacion.bas:169`) | Quien creó la versión; no cambia | `cotizacion_version.autor_id` (inmutable), copiado en `revision.preparador_id` |
| `Ver_PrepararEdicion` | En revisión: no se edita (BL-19). Aprobada: editar anula la aprobación | En revisión: 409 `REVISION_PENDIENTE` al guardar el borrador o calcular. Aprobada: la aprobación queda en el historial de **esa** versión; el cambio crea vN+1, que nace en Borrador (§3) |
| 14 REVISION («Verificar bloqueos», B-27) | Bloqueos, avisos, excepciones, precios frente al menor e **indicadores internos** | Bloqueos y avisos vigentes y proyección **comercial**. Los costos internos no se muestran (D-16 y protección de costos) |
| Confirmación de avisos | No existe: los avisos se muestran | No se exige. Los códigos de aviso presentes se registran en el evento, sin marcarlos como atendidos |

**Adaptaciones documentadas:**
1. **Retirar** una revisión pendiente (Preparador) no existe en el libro, donde solo el revisor la devuelve. Se añade para corregir sin esperar al revisor. El motivo es opcional (las fuentes no lo exigen).
2. **Observar una versión Aprobada** (`Rev_Observar` lo permite) no se implementa: la aprobación es terminal para esa versión. Anular una aprobación antes de emitir queda para el módulo de emisión.
3. **Enviar no recalcula:** se verifica sin escribir. Si algo exige recalcular, la corrección es una versión nueva.

### 2. Clasificación de los pendientes

| Código | Módulo 7 | Emisión |
|---|---|---|
| BL-07 (insumo sin producto activo) | Se evalúa al enviar y aprobar, con el catálogo vigente | Se vuelve a evaluar |
| BL-09 (precio no vigente) | Se evalúa con la fecha del servidor. Sin excepciones en la web, siempre bloquea | Con la fecha de emisión y excepciones autorizadas |
| AV-02 (precio vence antes del fin de la vigencia comercial) | Aviso con la fecha del servidor como referencia | Con la fecha real de emisión |
| AV-05 (concepto genérico o personalizado) | Aviso (clase del concepto en el catálogo vigente) | — |
| AV-04 (excepciones autorizadas) | No aplica: la web no tiene excepciones | Con el módulo de excepciones |
| BL-17 | Identidad al aprobar (autor ≠ quien aprueba) | Revisor registrado ≠ preparador al emitir |
| BL-15, BL-20, BL-01/BL-02 completos | No (no existen datos del emisor, textos ni contacto) | Sí |

### 3. Modelo y estados

| Tabla | Contenido | Garantías en la base |
|---|---|---|
| `revision` | Una por envío. Versión exacta (`version_id`, `version_numero`), `folio`, `total` copiado de la versión por la base, `preparador_id` (autor de la versión), `estado`, `revision` (ficha), envío y resolución, observaciones | FK (organización, cotización, número, id) → `cotizacion_version` y (organización, cotización, folio) → `cotizacion`: id, organización, folio y número no pueden discrepar. CHECK de estado, resolución, observaciones y **BL-17** (`NOT (APROBADA AND resuelta_por = preparador_id)`). **Índice único parcial:** una sola PENDIENTE por cotización. **Trigger** `revision_transicion_trg`: solo PENDIENTE → {APROBADA, CAMBIOS_SOLICITADOS, RETIRADA} con ficha + 1; la identidad y el envío no cambian; sin DELETE (también para el propietario) |
| `revision_evento` | Historial: secuencia, tipo, estados, persona (id y nombre copiado), observaciones, códigos de aviso, instante | **Solo alta:** trigger `revision_evento_inmutable_trg` para todos los roles; `softarq_app` solo SELECT/INSERT |

**Máquina de estados (por revisión):**

```
(sin revisión) --enviar--> PENDIENTE
PENDIENTE --aprobar (Revisor ≠ autor)-------------> APROBADA             (terminal)
PENDIENTE --solicitar cambios (Revisor, motivo)---> CAMBIOS_SOLICITADOS  (terminal)
PENDIENTE --retirar (Preparador)------------------> RETIRADA             (terminal)
```

Volver a enviar crea **otra** revisión, de la misma versión si sigue siendo la última y la captura no cambió, o de vN+1.

**Estado de la versión:** se deriva de su última revisión y nunca se escribe en la versión.

| Última revisión de la versión | Estado de la versión |
|---|---|
| Ninguna | `BORRADOR` (sin enviar) |
| `PENDIENTE` | `EN_REVISION` |
| `CAMBIOS_SOLICITADOS` o `RETIRADA` | `BORRADOR` |
| `APROBADA` | `APROBADA` |

- `esUltima` indica si es la última versión de la cotización.
- **La aprobación de v1 nunca se aplica a v2.**

### 4. Qué versión se envía y verificación vigente

**Enviar exige:**
- la versión es la última de la cotización (si no, 409 `VERSION_NO_VIGENTE`);
- `borrador.revision = version.revision_borrador = revisionBorrador` del cuerpo, que es la revisión que la persona veía (si no, 409 `BORRADOR_DESACTUALIZADO`: hay cambios guardados que esa versión no incluye);
- la web, además, deshabilita el envío con cambios sin guardar;
- no hay otra revisión PENDIENTE (409 `REVISION_PENDIENTE`) y la versión no está ya aprobada (422 `ENVIO_BLOQUEADO` con BL-19).

**Verificación vigente (B-27),** al consultar una revisión pendiente, al enviar y al aprobar. Se hace en una transacción `REPEATABLE READ READ ONLY` (máximo 15 s):
- reejecuta el ensamblador y el motor **en memoria** con la `solicitud_calculo` guardada y la fecha del servidor, solo para comparar;
- BL-01/BL-02 (activos), BL-04, BL-08, BL-10 a BL-13 del ensamblador y el motor, y BL-07, BL-09 y BL-14 explícitos;
- **BL-16:** la huella de la entrada recalculada sin `fechaCalculo` ni `menorPrecioVigente` difiere de la guardada, o cambió el motor;
- **BL-18:** verificación cruzada de la proyección guardada;
- **avisos:** AV-01 y AV-03 guardados, más AV-02 y AV-05 evaluados hoy.

**Nunca se escribe ni se reemplaza un importe.** El catálogo puede cambiar entre la verificación y la sentencia de escritura; la verificación refleja el instante de su lectura (como la fase A de ADR-0008 §6).

### 5. Reglas y permisos

| Capacidad | Endpoints | Preparador | Revisor | Adm. catálogo | Adm. sistema | Fuente |
|---|---|---|---|---|---|---|
| `revisiones.enviar` | `POST /cotizaciones/{id}/versiones/{n}/revisiones`, `POST /revisiones/{id}/retiro` | ✓ | ✗ | ✗ | ✗ | `BTN_EnviarRevision`: `FN_PREP` |
| `revisiones.decidir` | `POST /revisiones/{id}/decision` | ✗ | ✓ | ✗ | ✗ | `BTN_Observaciones`, `BTN_Aprobar`: `FN_REV` |
| `cotizaciones.consultar` | `GET /revisiones`, `GET /revisiones/{id}` | ✓ | ✓ | ✓ | ✓ | La hoja 14 REVISION se abre sin función |

- **BL-17 por identidad:** quien aprueba no puede ser el autor de la versión, aunque tenga (o reciba después) la función Revisor. Se comprueba en la API, en la función de la base y en un CHECK. La revisión expone `acciones.motivoNoAprobar`.
- **Permisos vigentes en la misma sentencia:** cada función de escritura vuelve a leer la pertenencia activa, la cuenta activa y la función requerida (`softarq_exigir_funcion`).
- **Identidad:** sale de la sesión; los cuerpos estrictos rechazan cualquier preparador, revisor u organización.
- **Solicitud de cambios:** al menos 10 caracteres con al menos una letra. Es un requisito del propietario («explicación útil»); el libro solo exige que no esté vacía.
- **Aprobación:** observaciones opcionales; la confirmación de la web identifica folio, versión y total.

### 6. Concurrencia e idempotencia

- **Decidir y retirar:** `SELECT … FOR UPDATE` de la revisión y `UPDATE … WHERE estado = 'PENDIENTE' AND revision = $ficha`.
  - Aprobar y retirar a la vez, o dos decisiones distintas: la segunda espera el bloqueo, relee y responde 409 `CONFLICTO_REVISION` con `revisionVigente`. Solo un evento.
  - Una pantalla obsoleta (otra ficha u otra `versionId`) recibe el mismo 409.
- **Enviar:** bloquea la fila del borrador, igual que guardar y crear versiones, que ahora comprueban la revisión pendiente después de bloquearla. Envío y guardado simultáneos nunca se confirman los dos. El índice parcial es la última garantía.
- **Idempotencia:** la de ADR-0008 (`Idempotency-Key`, 24 h, misma sentencia), con las operaciones `enviar_revision`, `decidir_revision` y `retirar_revision`. Doble clic y reintento tras perder la respuesta reproducen el resultado (`Idempotent-Replayed: true`) sin otro evento.
- **Sin transacciones abiertas mientras la persona lee:** verificación de solo lectura y una sentencia de escritura.

### 7. Permisos en PostgreSQL (migración y `permisos-app.sql`)

| Objeto | `softarq_app` |
|---|---|
| `revision` | SELECT, INSERT; UPDATE solo de `estado`, `revision`, `resuelta_por`, `resuelta_en` y `observaciones`; sin DELETE |
| `revision_evento` | SELECT, INSERT |
| `softarq_exigir_funcion`, `softarq_enviar_revision`, `softarq_decidir_revision`, `softarq_retirar_revision` | EXECUTE (revocado a PUBLIC); `SECURITY INVOKER` |

- `softarq_guardar_borrador` y `softarq_crear_version` se reemplazan con la misma firma (conservan sus permisos) para añadir BL-19.
- La CHECK de `idempotencia.recurso_tipo` admite `revision`.

**Generación:** `migrate dev --create-only` no admite sin terminal los avisos de los índices únicos nuevos. El SQL se generó con `prisma migrate diff --from-migrations --to-schema --script` contra la base sombra y se completó a mano.

### 8. API y web

| Método y ruta | Uso |
|---|---|
| `POST /cotizaciones/{id}/versiones/{numero}/revisiones` | Enviar `{ revisionBorrador }` (201) |
| `GET /revisiones?estado=` | Bandeja; por omisión, PENDIENTE y las más antiguas primero |
| `GET /revisiones/{id}` | Revisión, versión guardada (comercial), verificación vigente (si está pendiente) y eventos |
| `POST /revisiones/{id}/decision` | `{ decision, versionId, revision, observaciones? }` (200) |
| `POST /revisiones/{id}/retiro` | `{ revision, motivo? }` (200) |

- **Detalle de la cotización:** cada versión trae `id`, `estado`, `esUltima` y `revisionVigente`, y la cotización trae `revisiones` (historial con eventos).
- **Web: navegación «Revisiones»** con bandeja (`#/revisiones`) y detalle (`#/revisiones/{id}`).
- **Editor:**
  - estado exacto por versión;
  - «Enviar vN a revisión…», deshabilitado con su motivo si hay cambios sin guardar o un borrador posterior sin calcular;
  - confirmación con folio, versión y total;
  - con una revisión pendiente, la cotización se muestra en solo lectura con «Retirar la revisión para corregir…».
- **Decisión:**
  - nada se anuncia antes de la respuesta del servidor;
  - una respuesta atrasada o de otra revisión se descarta (número de solicitud);
  - un 409 conserva las observaciones escritas, muestra el estado vigente y ofrece «Actualizar».
- **Corrección en el editor del módulo 6:** varias consultas del detalle (tras guardar y tras crear la versión) podían responder fuera de orden, y una atrasada borraba v2 de la tabla. Se detectó como fallo intermitente de una prueba E2E existente. Ahora solo se aplica la última consulta, con una prueba unitaria que falla sin la corrección.

## Cambios en pruebas existentes

- `cotizaciones.integracion.test.ts`: consultar v1 después de crear v2 ya no devuelve una respuesta idéntica a la de su creación. Cambia el estado **derivado** `esUltima` (de `true` a `false`); la fila de la versión sigue siendo idéntica y así se comprueba.
- `autenticacion.integracion.test.ts`: las capacidades del Preparador incluyen `revisiones.enviar`.
- `migraciones.integracion.test.ts`: el inventario de funciones `softarq_*` incluye las cuatro nuevas, y se añadió la comprobación de permisos de `revision` y `revision_evento`.
- `errores.test.ts` (OpenAPI): la lista de rutas incluye las cinco nuevas; se añadió una prueba de CSRF, idempotencia y ausencia de identidad y de datos internos en los cuerpos.
- Pruebas de la web: los datos simulados incluyen los campos nuevos del contrato (`id`, `esUltima`, `revisionVigente`, `revisiones`) y los servicios de revisión.
- El subtítulo de la consulta de solo lectura ya no dice «ni aprobarla» (el Revisor aprueba desde «Revisiones»). Conserva el texto que comprueba la prueba E2E existente.

## Consecuencias

- **Positivas:**
  - aprobación ligada a una versión inmutable concreta, con historial de solo alta;
  - BL-17 por identidad en tres capas (API, función y CHECK);
  - ningún importe se recalcula ni se reemplaza;
  - concurrencia sin historial contradictorio.
- **Riesgos y pendientes:**
  - la verificación vigente recalcula en memoria (el mismo trabajo que la fase A de ADR-0008; no se midió aparte) en cada consulta de una revisión pendiente;
  - una aprobación no se puede anular antes de emitir (módulo de emisión);
  - sin excepciones (B-22): BL-09 siempre bloquea y AV-04 no aplica;
  - listados limitados a 100, sin paginación.
