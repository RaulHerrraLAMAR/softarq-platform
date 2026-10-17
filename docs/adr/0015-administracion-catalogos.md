# ADR-0015 — Administración de proveedores, productos, precios y tarifas

- **Fecha:** 17/10/2026.
- **Estado:** aceptado para el DEMO local. Plan aprobado por el propietario en esta sesión (módulo 11), con tres adaptaciones autorizadas (§2).
- **Relación con otros ADR:**
  - complementa el ADR-0004 (persistencia de catálogos), el ADR-0007 (matriz de permisos), el ADR-0008 (borrador y versiones), el ADR-0009 (revisión), el ADR-0012 (respaldo) y el ADR-0014 (excepciones);
  - sustituye en el ADR-0004 la consecuencia «las correcciones administrativas futuras necesitarán un flujo explícito»: ese flujo es este ADR.

## 1. Fuentes

Todas en `D:\Proyecto_SoftArq\entrega\` y leídas sin modificar. El MD5 del libro coincide antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`.

| Abreviatura | Fuente | Qué aporta |
|---|---|---|
| W §1.6 | Word maestro v1.3, funciones | **Administrador del catálogo:** altas y ediciones de catálogos, precios, tarifas, conceptos y componentes |
| RF-03, RF-05, RF-06, RF-07 | Word, requisitos | Proveedor `PRV-` activo o inactivo; producto con presentación, unidad de compra, contenido, venta fraccionada e incremento; varios precios por producto y proveedor, con vigencia y fuente, «sin sobrescribir el historial»; tarifas por unidad, jornada o subcontrato |
| W §3.5 | Mano de obra | «Cada concepto apunta a una tarifa. Las tarifas no se editan: se registra una nueva y se asigna al concepto. Cambiar solo la tarifa de un concepto no anula su aprobación y queda en bitácora». BL-10 y BL-06 |
| W §5.6 | Uso de catálogos | «Registrar precio» sin solape para el mismo producto y proveedor; «Anular precio erróneo» con motivo, y el registro se conserva |
| W, tabla de datos | tblProveedores, tblProductos, tblPrecios, tblTarifasMO | Campos: contacto, teléfono y correo del proveedor; `motivo_anulacion`; `id_proveedor` (subcontratista) de la tarifa; autoría |
| W cap. 8, dato 12 (P3) | Datos pendientes | «Política de edición de la vigencia»: **pendiente con el cliente** |
| VBA `modCatalogos.bas` | `Cat_Campos`, `Cat_Guardar`, `Val_Proveedor`, `Val_Producto`, `Val_Precio`, `Val_Tarifa`, `Precio_Anular`, `Cat_CambiarActivo`, `Cat_RequiereFuncion` | Campos y validaciones exactas; mensajes; botones (Nuevo, Editar, Desactivar/reactivar, Registrar, Anular); función `FN_ADMCAT`; prefijos `PRV`, `PCM`, `PRE` (6 dígitos) y `TMO` |
| VBA `modApp.bas` | `Normalizar` | Comparación de duplicados (minúsculas, sin acentos, puntuación como espacio) |
| `fase1.csv` | TI-002 a TI-004, TI-060 | Alta con código consecutivo; proveedor duplicado; solape rechazado con el precio en conflicto y sus fechas |

## 2. Decisiones del propietario (adaptaciones frente al libro)

1. **Bloqueo técnico del producto.**
   - **Libro:** `Editar producto` permite cambiar todos los campos.
   - **Decisión:** insumo, presentación, unidad de compra, contenido, fraccionable e incremento solo se editan mientras el producto no tenga **ningún** precio: ni vigente, ni vencido, ni anulado. Desactivar o anular precios no permite eludirlo.
   - **Lo que sigue permitido:** corregir la descripción comercial y activar o desactivar el producto.
   - **Otra presentación** exige un producto nuevo, con su propio código y sus propios precios.
   - **Sin cambios automáticos:** no se copian precios ni se sustituyen productos en los borradores.
   - **Motivo:** el contenido y la unidad cambian el cálculo. Editarlos alteraría en silencio el significado de los borradores abiertos que eligieron un precio de ese producto.
   - **Dónde se impone:**
     - la API, con un 422 `PRODUCTO_CON_PRECIOS` que indica los campos;
     - la web, que deshabilita los campos y explica el bloqueo;
     - PostgreSQL, con el disparador `producto_proteger_trg`.
   - **Carrera:** registrar un precio bloquea el producto (`FOR SHARE`, disparador `precio_bloquear_producto_trg`). La edición lo bloquea con `FOR UPDATE` y comprueba después.
   - **Interpretación declarada:** «presentación» describe el contenido, así que se bloquea con los campos técnicos.
2. **«Cerrar vigencia y registrar sucesor»** (adaptación del DEMO; **P3 sigue pendiente con el cliente**).
   - **Libro:** solo «Registrar precio» sin solape y «Anular precio erróneo».
   - **Decisión:** el Administrador del catálogo puede **acortar** la vigencia de un precio no anulado, con motivo obligatorio, registrando a la vez el sucesor del mismo producto y proveedor.
   - **Reglas de la nueva fecha final:**
     - igual o posterior a la fecha inicial;
     - igual o posterior a **hoy**, como fecha de negocio del servidor en `America/Mexico_City`;
     - anterior a la fecha final actual: nunca se amplía.
   - **El importe no cambia.**
   - **Vigencias inclusivas:** el sucesor empieza **después** del último día del precio cerrado. Cerrar hoy permite empezar mañana; no se cierra ayer para empezar hoy.
   - **Una sola sentencia** (`softarq_cerrar_vigencia_precio`): si el sucesor falla (solape, inactivo, fechas), la vigencia anterior no se acorta.
   - **Bitácora:** fecha final anterior y nueva, motivo, usuario, fecha de registro, fecha de negocio y sucesor.
   - **«Anular precio erróneo» sigue aparte:** es para errores de captura, no para actualizaciones comerciales.
3. **Asignar tarifa a un concepto** (dependencia mínima del bloque de conceptos).
   - Cambia **solo** `concepto.tarifa_id`.
   - **Requisitos:**
     - la tarifa existe en la organización y está activa;
     - su unidad es igual a la del concepto (BL-06);
     - se envía la tarifa que se veía asignada (`tarifaActual`); si cambió, la respuesta es 409 `CONFLICTO_TARIFA` y no se sobrescribe.
   - Motivo obligatorio.
   - Conserva la aprobación técnica del concepto (W §3.5). Esto no aprueba ninguna cotización.
   - **Bitácora:** concepto, tarifa anterior y nueva, usuario, fecha, motivo y estado del concepto.
   - **Queda para el bloque de conceptos y componentes:** la edición general de conceptos (componentes, fórmula, rendimientos y clase).

## 3. Reglas implementadas

| Regla | Fuente | Dónde |
|---|---|---|
| Proveedor: nombre obligatorio; correo válido si se captura; duplicado por `Normalizar(nombre)` → «Ya existe el proveedor PRV-…» | `Val_Proveedor`, TI-004 | Contrato; `softarq_normalizar` (copia de `Normalizar`) e índice único `proveedor_nombre_normalizado_key`; servicio (mensaje) |
| Producto: insumo **activo** de la organización; contenido > 0; incremento > 0 solo si es fraccionable (`null` no es cero); duplicado por descripción y presentación normalizadas | `Val_Producto` | Contrato (escala 6, sin redondeo); función; CHECK `producto_incremento_ck`; índice `producto_descripcion_presentacion_key` |
| Precio: producto y proveedor activos; precio > 0; desde ≤ hasta; fuente obligatoria; sin solape con otro **no anulado** del mismo producto y proveedor; **no se edita** | `Val_Precio`, RF-06, TI-060 | Contrato; `softarq_registrar_precio`; exclusión `precio_sin_solape_ex` → 409 `SOLAPE_VIGENCIA` con el precio en conflicto; disparador `precio_proteger_trg` |
| Anular: motivo obligatorio; definitivo; el registro se conserva | `Precio_Anular` | `softarq_anular_precio`; CHECK `precio_anulacion_ck`; disparador (no se reactiva ni cambia) |
| Tarifa: modalidades UNIDAD, JORNADA y SUBCONTRATO (ninguna nueva); unidad de magnitud longitud, área, volumen, conteo o masa; importe > 0; rendimiento por jornada solo en JORNADA; subcontratista opcional activo; **no se edita**; desactivar y reactivar; sin regla de solape (el libro no la tiene) | `Val_Tarifa`, `Cat_Campos` «TARIFA», RF-07 | Contrato; `softarq_registrar_tarifa`; `softarq_cambiar_activa_tarifa`; disparador `tarifa_proteger_trg` |
| Desactivar no borra; deja de ofrecerse para registros y selecciones nuevas; las versiones conservan su instantánea | `Cat_CambiarActivo` | Funciones de edición; `softarq_app` sin DELETE; disparadores que impiden DELETE de precios y tarifas |
| Códigos estables por organización (`PRV-NNNNN`, `PCM-NNNNN`, `PRE-NNNNNN`, `TMO-NNNNN`), sin MAX + 1 y sin reutilizar | `Id_Nuevo` | `softarq_codigo_catalogo`: contador atómico que salta los códigos ya cargados por la carga DEMO |
| Solo el Administrador del catálogo | `Cat_RequiereFuncion` (`Req_Funcion FN_ADMCAT`), `BTN_PrecioAnular` | Capacidad `catalogos.administrar`; cada función SQL llama a `softarq_exigir_funcion(…, 'ADMIN_CATALOGO')` |

## 4. Historial: qué se edita y cómo se corrige

| Registro | Se edita | Corrección de un dato equivocado | Desactivación |
|---|---|---|---|
| Proveedor | Nombre, contacto, teléfono y correo (datos descriptivos) | Editar | Activo/inactivo; sus precios dejan de ofrecerse |
| Producto | Sin precios: todo. Con precios: solo la descripción comercial | Sin precios: editar. Con precios: producto nuevo y desactivar el anterior | Activo/inactivo |
| Precio | Nada, salvo acortar su vigencia al registrar un sucesor | Anular con motivo y registrar uno nuevo | No se desactiva: se anula (definitivo) |
| Tarifa | Nada | Registrar una nueva, asignarla al concepto y desactivar la anterior | Activa/inactiva |

**Trazabilidad:**
- `registrado_por` y `_en` (precios y tarifas);
- `creado_*` y `modificado_*` (proveedores y productos);
- `anulado_por`, `anulado_en` y `motivo_anulacion`;
- un evento de bitácora por cada cambio, con usuario e instante del servidor.

En los registros de la carga DEMO, la autoría es NULL porque no tienen persona. Ningún importe histórico se sobrescribe.

## 5. Efecto en el cotizador

- **Ninguna selección automática.**
  - `opciones-precio` ofrece solo precios no anulados, vigentes y de producto y proveedor activos.
  - Crear una opción no la elige; desactivar o anular otra no la sustituye.
- **Borradores.** Conservan la referencia marcada como no disponible (corrección `97e69d5`) y guardar otro campo no la borra.
  - **Al calcular:**
    - BL-08: anulado o inactivo;
    - BL-09: fuera de vigencia, salvo excepción PRECIO_VENCIDO;
    - BL-10 y BL-06: tarifa.
- **Versiones, aprobaciones, emisiones y PDF.** No cambian: la versión guarda su instantánea, que es inmutable.
  - **Al enviar, aprobar o emitir:** la verificación recalcula en memoria y BL-16 detecta cualquier cambio de catálogo frente a la instantánea (tarifa asignada, contenido, precio). Esa versión se bloquea y hace falta una versión nueva.
  - **Excepciones:** se conservan los tres tipos, la autorización por versión y AV-04 (ADR-0014). La administración no permite saltarse una excepción.
- **Editor del borrador (web).** Al mostrar la última versión consulta `GET /cotizaciones/{id}/versiones/{n}/verificacion`, que es la misma verificación que al enviar, de solo lectura.
  - Si hay bloqueos de catálogo (BL-04 a BL-10 o BL-16), avisa: «El catálogo cambió después de calcular la vN: su resultado ya no es vigente».
  - El resultado anterior no se presenta como vigente.

## 6. Separación de información

- **Contrato interno.** Las rutas `/api/v1/admin/...` (contrato `contracts/src/api/catalogos-admin.ts`) llevan importes de proveedor, contenidos y tarifas, y solo se sirven con `catalogos.administrar`.
- **Contratos comerciales sin cambios.** Proyección comercial, versión, revisión, emisión, verificación, opciones de precio y PDF: una prueba de OpenAPI lo comprueba.
- **Web.** Los importes internos solo aparecen en `src/catalogo-admin/`, la única carpeta exceptuada por la prueba `sin-datos-internos` (fijada por prueba). Ahí siguen prohibidos costos, consumos, márgenes, recargos, desperdicios, traslapes y sobrantes.

## 7. Persistencia (migración `20261017120000_administracion_catalogos`)

- **Columnas nuevas:**
  - contacto, revisión y autoría del proveedor;
  - revisión y autoría del producto;
  - registro, anulación y revisión del precio;
  - subcontratista, revisión y autoría de la tarifa.

  Todas las FK son compuestas, con `map:` en `schema.prisma`, y la prueba `migrate diff --exit-code` no detecta diferencias.
- **Restricciones e índices:**
  - CHECK de textos, correo y anulación;
  - `contador_entidad_ck`, `bitacora_entidad_ck` e `idempotencia_recurso_ck` amplían las entidades;
  - índices de expresión para los duplicados normalizados.
- **Disparadores:** `producto_proteger_trg`, `precio_bloquear_producto_trg`, `precio_proteger_trg` y `tarifa_proteger_trg`.
- **Funciones** (SECURITY INVOKER, una sentencia cada una, con idempotencia y bitácora):
  - `softarq_crear_proveedor` y `softarq_editar_proveedor`;
  - `softarq_crear_producto` y `softarq_editar_producto`;
  - `softarq_registrar_precio`, `softarq_anular_precio` y `softarq_cerrar_vigencia_precio`;
  - `softarq_registrar_tarifa` y `softarq_cambiar_activa_tarifa`;
  - `softarq_asignar_tarifa_concepto`;
  - las auxiliares `softarq_codigo_catalogo` y `softarq_normalizar`.
- **`softarq_app`** (`permisos-app.sql`, bloque condicional para restaurar respaldos anteriores): UPDATE solo de columnas editables.
  - **Nunca:** código, organización, importe, inicio de vigencia, fuente ni datos de alta.
  - **Sin** DELETE ni DDL.
  - En `concepto`, el permiso actual se mantiene y se restringirá con el bloque de conceptos.
- **Respaldo:** `softarq_respaldo` ya lee todas las tablas (no hay tablas nuevas). `probar-restauracion.mjs` comprueba coherencia, permisos, disparadores, índices y que los registros administrativos y su historial sean idénticos tras restaurar.

## 8. Concurrencia, idempotencia y límites

- **Concurrencia:** revisión optimista en proveedores, productos, precios y tarifas, con 409 `CONFLICTO_EDICION` y el registro vigente en `registroVigente`. La web conserva lo escrito y ofrece «Recargar el registro vigente».
- **Idempotencia** (`Idempotency-Key`, ADR-0008 §5): altas, anulación, cierre con sucesor y asignación de tarifa.
- **Listados:** paginación por código (`despuesDe`) con un límite de 100; la búsqueda la hace el servidor.

## 9. Consecuencias

- El DEMO puede mantener proveedores, productos, precios y tarifas sin la carga fija. La carga DEMO repetida no revierte ediciones: informa diferencias sin corregirlas.
- **P3 (política de vigencias)** sigue pendiente con el cliente. Si se define otra, se cambia `softarq_cerrar_vigencia_precio` y su disparador.
- **Dependencia mínima de conceptos:** solo la asignación de tarifa. La edición de conceptos y componentes, la trazabilidad de BL-05 en pantalla, los insumos y las conversiones quedan para el bloque siguiente.
- **Límite de los formularios:** el de precios ofrece la primera página de productos y proveedores activos, hasta 50. Basta para el DEMO; con catálogos reales hará falta un selector con búsqueda.
