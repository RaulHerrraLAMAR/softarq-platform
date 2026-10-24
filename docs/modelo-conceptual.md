# Modelo conceptual de SoftArq (DEMO)

- **Fecha:** 05/10/2026
- **Estado:**
  - **Implementado (módulo 2, ADR-0004):** `organizacion` y los catálogos que alimentan el cálculo, persistidos en PostgreSQL y aislados por organización (ver §4).
  - **Implementado (módulo 5, ADR-0007):** `usuario`, `membresia` (pertenencia con funciones) y `sesion`; matriz de permisos en §6.
  - **Implementado (módulo 6, ADR-0008):** `cliente`, `proyecto`, `cotizacion` (folio WEB DEMO), `cotizacion_borrador` (captura editable con revisión), `cotizacion_version` (inmutable), `contador`, `bitacora` e `idempotencia` (§7).
  - **Implementado (módulo 7, ADR-0009):** `revision` (una por envío de una versión concreta, con estado y ficha) y `revision_evento` (historial de solo alta) (§8).
  - **Implementado (módulo 8, ADR-0010):** emisión y PDF original (§9).
  - **Implementado (módulo 9, ADR-0013):** eventos internos de respuesta por emisión; vigencia calculada al consultar (§10).
  - **Sin implementar:** CRUD de usuarios, partidas y excepciones como tablas propias (viven en la captura y en la instantánea de la versión; las decisiones del Revisor sí son tabla propia desde el módulo 10, §11), suscripciones.

## 1. Entidades y relaciones

```
Organización N ── N Usuario        (por Membresía, con funciones; hoy una activa por usuario)
Usuario      1 ── N Sesión         (opaca; solo el hash del token)
Organización 1 ── N Cliente        (recibe la cotización; con la app del cliente puede tener acceso propio, ADR-0021)
Cliente      1 ── N Proyecto
Organización 1 ── N Catálogo       (insumos, productos, proveedores, precios, tarifas, conceptos)
Cotización (folio) N ── 1 Cliente
Cotización (folio) N ── 1 Proyecto (del mismo cliente)
Cotización   1 ── 1 Borrador       (captura editable con revisión; módulo 6)
Cotización   1 ── N Versión        (v1, v2…; inmutables desde su creación en la web)
Versión      1 ── N Revisión       (módulo 7; una sola PENDIENTE por cotización)
Revisión     1 ── N Evento de revisión (solo alta)
Versión      1 ── 0..1 Emisión     (documento/PDF originales)
Emisión      1 ── N Respuesta registrada (cadena de eventos inmutables)
Membresía    1 ── N Respuesta registrada (actor interno)
Versión      1 ── N Partida        (CONCEPTO con renglones de medición, o ADICIONAL)
Versión      1 ── N Selección de precio (una por insumo)
Versión      1 ── N Excepción      (rendimiento, precio vencido, concepto personalizado)
```

- **Organización:** posee sus usuarios, clientes, proyectos, catálogos y cotizaciones. Al principio solo habrá una organización **DEMO**. Toda consulta futura se filtrará por organización en el servidor.
- **Usuario:** persona que prepara o revisa. Sustituye a la «persona en turno» del Excel, que era un registro operativo sin autenticación (D-20). Es global: la organización la aporta la pertenencia.
- **Membresía (pertenencia):** une un usuario con una organización y guarda sus funciones del libro (Preparador, Revisor, Administrador del catálogo, Administrador del sistema), que la API traduce a capacidades en cada solicitud. El modelo admite varias pertenencias; en esta etapa el acceso exige una sola activa.
- **Sesión:** sesión opaca en PostgreSQL ligada a una pertenencia (FK compuesta, sin mezclar organizaciones). Expira por inactividad (30 min) y de forma absoluta (8 h) y se revoca al cerrar.
- **Cliente:** quien recibe la cotización. En el panel es un registro; **desde el ADR-0021** puede tener un acceso propio a la app móvil (invitación del equipo, sin funciones internas), limitado a sus propios proyectos, solicitudes y cotizaciones emitidas. Hasta implementarlo (E1) sigue sin cuenta.
- **Proyecto:** trabajo de un cliente; pertenece a uno solo y no cambia de cliente.
- **Cotización:** folio `COT-AAAA-NNNNN` con origen WEB DEMO, reservado al crearla; fija cliente y proyecto.
- **Borrador:** la captura editable de la cotización (medidas, códigos y selecciones; sin resultados). Puede estar incompleto. Lleva un número de revisión para detectar ediciones simultáneas.
- **Versión:** registro histórico **inmutable** de un cálculo válido hecho por el servidor con el borrador guardado: captura, instantánea de referencia (interna), proyección comercial, autor, fechas, motor, huellas y copias de cliente y proyecto.

## 2. Contraste con el libro 1.0.0-F1

| Libro (tabla y columnas) | Modelo | Observación |
|---|---|---|
| — | Organización | No existe en el Excel (un solo archivo maestro, D-15). Es nueva. |
| `tblPersonas` (17 CONFIG): `id_persona`, `nombre`, `funciones` (varias, separadas por «;»), `activo`; «persona en turno» | Usuario + Membresía (`funciones`) + Sesión | En el Excel no hay autenticación ni permisos reales; aquí la sesión sustituye a la persona en turno. |
| `tblClientes`: `id_cliente`, `nombre_razon_social`, contacto, `activo` | Cliente | Sin cuenta. BL-01: cliente con campos mínimos y activo. |
| `tblProyectos`: `id_proyecto`, **`id_cliente`**, nombre, municipio, entidad, descripción, `activo` | Proyecto | Pertenece a un solo cliente. BL-02 bloquea un proyecto «de otro cliente». |
| `tblCotizaciones`: `folio`, **`id_cliente`**, **`id_proyecto`**, `estado_folio`, `origen_duplicado` | Cotización (`cotizacion`) | El folio fija cliente y proyecto. Solo se cambian en una v1 (duplicar crea folio nuevo, §3.8). Folio COT-AAAA-NNNNN no reutilizable (D-14). En la web: contador propio por organización y año, origen WEB_DEMO; cliente y proyecto fijos desde la creación (ADR-0008 §5). |
| `tblVersiones`: `id_version`, `folio`, `num_version`, `estado`, preparador, revisor, parámetros copiados, **`cli_*` y `pry_*`** copiados, totales, `sello_calculo` | Borrador (`cotizacion_borrador`) + Versión (`cotizacion_version`) | Al emitir se **copian** los datos de cliente, proyecto, emisor y parámetros. La emitida no cambia aunque cambie el catálogo (§3.12, D-17). En la web la parte editable es el borrador y **cada versión guardada ya es inmutable** y lleva sus copias (ADR-0008 §1). |
| `tblContadores` | `contador` | Identificadores CLI, PRY y COT-AAAA por organización; nunca MAX + 1. |
| `tblBitacora` | `bitacora` | Eventos mínimos de creación, edición y versionado. |
| `tblPartidas`: `tipo` (CONCEPTO/ADICIONAL), `id_concepto`, `id_tipo_adic`, `cantidad`, `monto_capturado`, `id_tarifa_mo` y copias | Partida | Entrada del motor: `PartidaConceptoEntrada` y `PartidaAdicionalEntrada`. |
| `tblMediciones`: signo, piezas, largo, ancho, alto | Renglón de medición | `RenglonMedicion` (CR-01). |
| `tblSelecciones`: uno por (`id_version`, `id_insumo`), precio copiado, quién y cuándo confirmó | Selección de precio | `SeleccionPrecioCalculo` (CR-07). |
| `tblExcepciones`: tipo, partida, referencia, campo, valor aplicado, estado | Excepción (módulo 10) | `captura.excepciones` del borrador y de la versión; el estado es la decisión en `excepcion_decision` (§11). El motor usa las de RENDIMIENTO. |
| `tblConsumos`, `tblCompras` | Resultado interno del cálculo | Lo produce el motor; nunca se envía al cliente (D-16). |

## 3. Reglas que el modelo debe conservar

1. Un proyecto pertenece a un solo cliente, y una cotización usa un cliente y un proyecto de ese cliente.
2. Los folios no se reutilizan, aunque la cotización se descarte.
3. Una versión emitida es inalterable; los cambios generan vN+1 con motivo. En la web, toda versión guardada es inalterable (permisos y trigger en PostgreSQL).
4. La cotización emitida guarda copias (no referencias vivas) de cliente, proyecto, emisor, parámetros y precios.
5. Todo dato de la organización DEMO lleva marca DEMO y las salidas llevan la leyenda de demostración.
6. Los costos internos, proveedores y márgenes solo los ven usuarios de la organización con el permiso correspondiente; nunca el cliente.

## 4. Qué es común y qué pertenece a cada organización (módulo 2)

| Datos | Alcance | Tabla | Motivo |
|---|---|---|---|
| Unidades y su magnitud | **Común** | `unidad` | Referencia fija del sistema (modBuild.bas); la aplicación solo la lee. Se carga en la migración. |
| Parámetros de venta: ambiente, moneda, recargo, impuesto y vigencia | Propio | `parametros_calculo` | Política comercial y fiscal de cada organización. NULL = no definido. |
| Insumos y conversiones | Propio | `insumo`, `conversion` | Rendimientos y factores con fuente y responsable propios. |
| Proveedores, productos y precios | Propio | `proveedor`, `producto`, `precio` | Costos internos: solo salen por las rutas `/admin` del Administrador del catálogo (módulo 11, §12), nunca hacia el cliente. |
| Tarifas de mano de obra | Propio | `tarifa_mano_obra` | Costos internos (mismo criterio). |
| Conceptos y componentes | Propio | `concepto`, `componente` | Reglas técnicas aprobadas por cada organización. |
| Tipos de costo adicional | Propio | `tipo_adicional` | Catálogo de cada organización. |

Toda relación entre datos propios es una FK compuesta con `organizacion_id`, de modo que la base impide mezclar organizaciones. Inicialmente solo existe la organización `DEMO`; las pruebas crean otras para comprobar el aislamiento.

## 5. Pendiente de decidir (módulos posteriores)

- Selección o cambio de organización para usuarios con varias pertenencias.
- Capacidades de administración de personas, parámetros, insumos, conversiones, conceptos y componentes. Las de revisión y emisión están en §6 (módulos 7 y 8); proveedores, productos, precios y tarifas, en §12 (módulo 11).
- Si los catálogos se comparten entre organizaciones o son siempre propios.
- Planes o suscripciones (fuera del DEMO).
- Esquema de PostgreSQL y migración desde los CSV del libro (Prisma, según ADR-0003).
- Duplicar cotizaciones y «precios anteriores» en una versión nueva. Descarte, contacto y emisor: módulo 8 (§9); respuestas y vigencia: módulo 9 (§10); excepciones: módulo 10 (§11).

## 6. Matriz de permisos vigente (módulo 5, ADR-0007 §2)

| Capacidad | Endpoints | Preparador | Revisor | Adm. catálogo | Adm. sistema | Fuente en el libro |
|---|---|---|---|---|---|---|
| `sesion.propia` | `GET` y `DELETE /api/v1/auth/sesion`; módulo 13: `POST /api/v1/auth/contrasena` (cambio propio); módulo 16: `POST` y `GET /api/v1/auth/movil/sesion` | ✓ | ✓ | ✓ | ✓ | — ⁴ |
| `catalogos.consultar` | `GET /api/v1/catalogos/*` | ✓ | ✓ | ✓ | ✓ | Las hojas de catálogo se abren sin función |
| `calculo.ejecutar` | `POST /api/v1/calculos/demo` | ✓ | ✗ | ✗ | ✗ | `BTN_Calcular` exige `Req_Funcion FN_PREP` (`modMotor.bas`) |
| `clientes.consultar` | `GET /clientes`, `/clientes/{id}`, `/proyectos`, `/proyectos/{id}` | ✓ | ✓ | ✓ | ✓ | Las hojas 01 CLIENTES y 02 PROYECTOS se abren sin función |
| `clientes.gestionar` | `POST /clientes`, `PATCH /clientes/{id}`, `POST /proyectos`, `PATCH /proyectos/{id}` | ✓ | ✗ | ✓ | ✗ | `Cat_RequiereFuncion` (`modCatalogos.bas`): Preparador o Administrador del catálogo |
| `cotizaciones.consultar` | `GET /cotizaciones`, `/cotizaciones/{id}`, `/cotizaciones/{id}/versiones/{n}` | ✓ | ✓ | ✓ | ✓ | La hoja 16 HISTORIAL se abre sin función |
| `cotizaciones.preparar` | `POST /cotizaciones`, `PUT /cotizaciones/{id}/borrador` | ✓ | ✗ | ✗ | ✗ | `Cot_Nueva` y `BTN_GuardarBorrador` exigen `FN_PREP` |
| `cotizaciones.preparar` **y** `calculo.ejecutar` | `POST /cotizaciones/{id}/versiones` (organización DEMO) | ✓ | ✗ | ✗ | ✗ | Guardar versión = calcular (`BTN_Calcular`) |
| `revisiones.enviar` | `POST /cotizaciones/{id}/versiones/{n}/revisiones`, `POST /revisiones/{id}/retiro` | ✓ | ✗ | ✗ | ✗ | `BTN_EnviarRevision`: `FN_PREP` (retirar es una adaptación de la web) |
| `revisiones.decidir` | `POST /revisiones/{id}/decision` (aprobar o solicitar cambios) | ✗ | ✓ | ✗ | ✗ | `BTN_Observaciones` y `BTN_Aprobar`: `FN_REV` |
| `cotizaciones.consultar` | `GET /revisiones`, `GET /revisiones/{id}` | ✓ | ✓ | ✓ | ✓ | La hoja 14 REVISION se abre sin función |
| `revisiones.decidir` | `POST /revisiones/{id}/anulacion` (anular una aprobación antes de emitir, con motivo) | ✗ | ✓ | ✗ | ✗ | `Rev_Observar` admite una versión Aprobada: `FN_REV` (módulo 8) |
| `emisiones.emitir` | `POST /cotizaciones/{id}/versiones/{n}/emision` | ✓ | ✓ ¹ | ✗ | ✗ | `BTN_Emitir`: `FN_REV` ≠ preparador. **Adaptación autorizada** (ADR-0010 §2): también el Preparador |
| `cotizaciones.preparar` | `POST /cotizaciones/{id}/descarte` | ✓ | ✗ | ✗ | ✗ | `BTN_Descartar` (B-37): `FN_PREP` |
| `cotizaciones.consultar` | `GET /cotizaciones/{id}/versiones/{n}/emision/validacion`, `GET /emisiones/{id}`, `GET /emisiones/{id}/documento`, `GET /emisor` | ✓ | ✓ | ✓ | ✓ | «Abrir PDF» no exige función |
| `emisor.configurar` | `PUT /emisor` | ✗ | ✗ | ✗ | ✓ | 17 CONFIG (`EMISOR_*`): el Administrador del sistema cambia los parámetros |
| `cotizaciones.consultar` | `GET /emisiones/{id}/seguimiento` | ✓ | ✓ | ✓ | ✓ | Historial de la cotización; solo organización de la sesión |
| `respuestas.registrar` | `POST /emisiones/{id}/respuestas` | ✓ | ✗ | ✗ | ✗ | Word §1.6 Preparador; `BTN_Respuesta`, `Req_Funcion FN_PREP` |
| `respuestas.corregir` | `POST /emisiones/{id}/respuestas/{eventoId}/correcciones` | ✓ | ✗ | ✗ | ✗ | Adaptación autorizada: nuevo evento con motivo (ADR-0013) |
| `cotizaciones.preparar` | Registrar excepciones en `PUT /cotizaciones/{id}/borrador` (`captura.excepciones`) | ✓ | ✗ | ✗ | ✗ | `BTN_RegistrarExcepcion`: `FN_PREP` (B-22) |
| `cotizaciones.preparar` **y** `excepciones.consultar` | `GET /excepciones/componentes` | ✓ | ✗ | ✗ | ✗ | Lista de componentes de `BTN_RegistrarExcepcion` |
| `cotizaciones.consultar` **y** `excepciones.consultar` | `GET /cotizaciones/{id}/versiones/{n}/excepciones` | ✓ | ✓ | ✗ | ✗ | Tabla «EXCEPCIONES DE LA VERSION» de 14 REVISION. Capacidad nueva para el contrato interno (ADR-0014) |
| `revisiones.decidir` **y** `excepciones.consultar` | `POST /revisiones/{id}/excepciones/{n}/decision` | ✗ | ✓ ² | ✗ | ✗ | `BTN_AutorizarExcepcion`: `FN_REV` ≠ preparador (B-29) |
| `cotizaciones.consultar` | `GET /cotizaciones/{id}/versiones/{n}/verificacion` (si el catálogo cambió después del cálculo; sin importes) | ✓ | ✓ | ✓ | ✓ | Módulo 11: misma verificación que al enviar (`Validar`), de solo lectura |
| `catalogos.administrar` | `GET`, `POST` y `PATCH /api/v1/admin/{proveedores,productos,precios,tarifas}`; `POST /admin/precios/{c}/anulacion` y `/cierre-vigencia`; `GET /admin/unidades`; módulo 12: `GET`, `POST` y `PATCH /admin/{tipos-estructura,insumos,conceptos}`, `POST /admin/insumos/{c}/conversiones`, `PATCH /admin/insumos/{c}/conversiones/{u}`, `POST /admin/conceptos/{c}/{tarifa,aprobacion,componentes}`, `PATCH /admin/conceptos/{c}/componentes/{k}` | ✗ | ✗ | ✓ ³ | ✗ | `Cat_RequiereFuncion` y `BTN_PrecioAnular`: `Req_Funcion FN_ADMCAT` (módulo 11, ADR-0015) |

| `parametros.administrar` | `GET` y `PATCH /api/v1/admin/parametros` | ✗ | ✗ | ✗ | ✓ | `BTN_Parametros`, `Param_Guardar`: `Req_Funcion FN_ADMSIS` (módulo 13, ADR-0017) |
| `personas.administrar` | `GET` y `POST /admin/personas`; `GET` y `PATCH /admin/personas/{id}`; `POST /admin/personas/{id}/restablecimiento` | ✗ | ✗ | ✗ | ✓ | `BTN_Personas`, `Persona_Guardar`: `Req_Funcion FN_ADMSIS` (módulo 13, ADR-0017) |
| `cotizaciones.consultar` **y** `salidas.consultar` | `GET /cotizaciones/{id}/versiones/{n}/salidas-internas` (compras calculadas, detalle e indicadores; solo lectura) | ✓ | ✓ | ✗ | ✗ | Hojas 12 COMPRAS, 13 DETALLE_CALCULO e indicadores de 14 REVISION; en el libro se abren sin función (D-20). **Decisión del propietario** (módulo 14, ADR-0018 §2.1); cambio intencionado frente a la protección de costos del ADR-0009 |
| `cotizaciones.preparar` | `POST /cotizaciones/{id}/duplicados` (folio nuevo desde una versión o desde el borrador guardado) | ✓ | ✗ | ✗ | ✗ | `BTN_Duplicar` (B-35): `Req_Funcion FN_PREP` (módulo 15, ADR-0019 §3) |
| `cotizaciones.preparar` | `POST /cotizaciones/{id}/nueva-version` (modo de precios y motivo tras una emisión) | ✓ | ✗ | ✗ | ✗ | `BTN_NuevaVersion` (B-34): `Req_Funcion FN_PREP` (módulo 15, ADR-0019 §4) |
| `cotizaciones.consultar` | `POST /cotizaciones/{id}/versiones/{n}/vista-previa` (PDF BORRADOR; registra VISTA_PREVIA) | ✓ | ✓ | ✓ | ✓ | `BTN_VistaPrevia` (B-25) no exige función (módulo 15, ADR-0019 §5) |

¹ Por identidad, además de la capacidad: un Revisor no emite una versión que él preparó. Y siempre hace falta una aprobación vigente de esa versión, hecha por una persona distinta de su autor. Poder emitir no concede aprobar.

**BL-17 no es una capacidad:** quien aprueba no puede ser el autor de la versión (identidad), aunque tenga o reciba después la función Revisor. Lo comprueban la API, la función de la base y un CHECK (ADR-0009 §5).

² Por identidad: quien preparó la versión no autoriza ni rechaza sus excepciones (API, función de la base y CHECK). La decisión solo se toma con una revisión PENDIENTE de esa versión.

³ Además, cada función de la base vuelve a exigir la función Administrador del catálogo en la pertenencia vigente (`softarq_exigir_funcion`): si se pierde durante la sesión, 403 sin escribir. Consultar datos técnicos o decidir excepciones no concede administrar el catálogo.

⁴ Con una contraseña temporal vigente, la sesión solo tiene `sesion.propia`, y la guardia solo admite consultar la sesión, cambiar la contraseña y cerrar la sesión (403 `CAMBIO_CONTRASENA_REQUERIDO` en todo lo demás; ADR-0017 §2.1).

Desde el módulo 14, `salidas.consultar` solo da lectura: no concede calcular, aprobar ni emitir, y los administradores no la reciben salvo que tengan además la función Preparador o Revisor.

Desde el módulo 13, cada función queda con su propia administración: el Administrador del catálogo no administra parámetros ni personas, y el Administrador del sistema no administra el catálogo. Una persona puede tener ambas funciones.

**Canal móvil (módulo 16, ADR-0020).** La matriz de capacidades **no cambia**: la app móvil no es una función ni concede accesos. Una sesión de tipo `MOVIL` tiene las mismas capacidades que la misma persona en la web, pero solo puede usar las rutas de consulta marcadas (`@PermitidaEnMovil()`; etapa 1: sesión, clientes, proyectos y cotizaciones con su versión); el resto responde 403 aunque la persona tenga la capacidad. Entidad `sesion`: `tipo` ∈ {`PREVIA`, `USUARIO`, `MOVIL`}.

## 7. Clientes, proyectos y cotizaciones (módulo 6, ADR-0008)

| Tabla | Clave y relaciones | Notas |
|---|---|---|
| `cliente` | `CLI-NNNNN` por organización | Nombre o razón social, `activo` y, desde el módulo 8, contacto (nombre, teléfono, correo; BL-01). Sin datos fiscales |
| `proyecto` | `PRY-NNNNN`; FK (organización, cliente) | Nombre, municipio, entidad y descripción (opcionales salvo el nombre) |
| `cotizacion` | Folio por organización; **FK (organización, cliente, proyecto) → proyecto** | Origen `WEB_DEMO`, estado del folio `ACTIVO`, último número de versión |
| `cotizacion_borrador` | 1:1 con la cotización | Captura (`jsonb`), revisión, quién y cuándo |
| `cotizacion_version` | UNIQUE (cotización, número) | Inmutable (sin UPDATE/DELETE para la aplicación y trigger para el propietario). Entrada y resultado internos solo en el servidor |
| `contador`, `bitacora`, `idempotencia` | Por organización | Folios y códigos atómicos; eventos mínimos; claves de idempotencia de 24 h |

Estados alcanzables: folio **ACTIVO** o **DESCARTADO** (módulo 8); versión **BORRADOR**, **EN_REVISION**, **APROBADA**, **EMITIDA** o **SUSTITUIDA**, derivados de su última revisión (§8) y de su emisión (§9).

## 8. Revisión y aprobación (módulo 7, ADR-0009)

| Tabla | Clave y relaciones | Notas |
|---|---|---|
| `revision` | FK (organización, cotización, número, id) → `cotizacion_version`; FK (organización, cotización, folio) → `cotizacion`; índice único parcial: una PENDIENTE por cotización | Estado PENDIENTE → APROBADA, CAMBIOS_SOLICITADOS o RETIRADA (terminales, trigger). `preparador_id` = autor de la versión. `total` copiado por la base. Ficha `revision` para la concurrencia. CHECK BL-17 |
| `revision_evento` | FK (organización, revisión) | Solo alta (trigger para todos los roles): tipo, estados, persona y nombre copiado, observaciones, códigos de aviso presentes, instante |

| Libro | Web |
|---|---|
| `tblVersiones.estado` (Borrador, En revisión, Aprobada…) escrito en la versión | Estado de la versión **derivado** de su última revisión; la versión no cambia |
| `tblVersiones.revisor`, `fecha_aprobacion` | `revision.resuelta_por`, `resuelta_en` |
| `tblRevisiones` (`id_revision`, `id_version`, `fecha_hora`, `persona`, `tipo`, `texto`) | `revision_evento` (con estados anterior y nuevo y códigos de aviso) |

## 9. Emisión, emisor, anulación y descarte (módulo 8, ADR-0010)

| Tabla o columna | Clave y relaciones | Notas |
|---|---|---|
| `emision` | UNIQUE(`version_id`), UNIQUE(`archivo_clave`); FK (organización, cotización, número, id) → versión; FK (organización, id, versión) → `revision` | Inmutable (trigger). Aprobación usada; quién preparó, aprobó y emitió (ids y nombres); fecha de emisión, vigencia (CR-16); total; `contenido` = estructura comercial exacta del PDF; versión de la plantilla; clave, tamaño y SHA-256 del archivo. CHECK BL-17 |
| `emisor` | Una fila por organización | Nombre, domicilio, teléfono, correo, logotipo (`DEMO`), `es_demo`, ficha de concurrencia. BL-15 |
| `cliente.contacto_*` | — | Nombre, teléfono y correo del contacto (BL-01) |
| `cotizacion.descartada_*`, `motivo_descarte` | — | Descarte (B-37): solo ACTIVO → DESCARTADO (trigger) |
| `revision_evento` tipo `APROBACION_ANULADA` | Una por revisión (índice parcial) | Anulación antes de emitir; la aprobación original se conserva |
| `captura.textos` (borrador y versión) | — | Alcance, condiciones y exclusiones de la versión (BL-20); fuera del cálculo |

| Libro | Web |
|---|---|
| `tblVersiones.estado = Emitida`, `fecha_emision`, `vigente_hasta`, `emisor_*`, `cli_*`, `pry_*`, `emitido_por`, `archivo_pdf` | Fila de `emision` aparte; la versión no cambia. Nombres del cliente y del proyecto: los de la versión. Contacto y emisor: copiados al emitir |
| `Sustituida` al emitir vN+1 | Estado derivado `SUSTITUIDA` |
| `Regenerar PDF` desde los datos congelados | **No se regenera**: se descarga el archivo emitido, cuyo hash se comprueba |
| `Descartada` (versión en Borrador), folio `Descartado` | Folio `DESCARTADO` con motivo; las versiones se conservan |
| `Rev_Observar` sobre una Aprobada | Anulación con motivo (evento nuevo) |
| `EMISOR_*`, `DEMO_EMISOR_*` en 17 CONFIG | Tabla `emisor` (datos DEMO de la carga, editables por el Administrador del sistema) |
| `TEXTO_*`, `DEMO_TEXTO_*` copiados a cada versión | `captura.textos`, copiados al crear la cotización |

## 10. Seguimiento interno de emisiones (módulo 9, ADR-0013)

`respuesta_cliente_evento`: FK compuesta (organización, emisión) → `emision`, FK (organización, registrador) → `membresia`, y FK del evento anterior dentro de la misma emisión. Conserva número, tipo REGISTRADA/CORREGIDA, resultado ACEPTADA/RECHAZADA, fecha recibida, nota, identidad/nombre interno, instante y fecha del registro y motivo de corrección.

Una raíz por emisión; correcciones consecutivas sin bifurcaciones. La cabeza representa el registro vigente. SELECT/INSERT para softarq_app, sin UPDATE/DELETE ni DDL; disparadores de validación e inmutabilidad. Bitácora mínima e idempotencia en la misma sentencia de alta. softarq_respaldo dispone de SELECT mediante los permisos por defecto del migrador.

La emisión fija su cotización y versión; la respuesta nunca se copia a otra emisión. Sustitución y vigencia se consultan por separado del estado interno de revisión y del resultado comercial. El último día es inclusivo, según la fecha del servidor en la zona configurada. Una aceptación histórica sigue visible después de vencer. Se permite capturar después del plazo una respuesta recibida dentro de él, y corregir con motivo una respuesta existente, decisiones expresamente autorizadas para el DEMO. Fuentes y diferencias: [módulo 9](cotizaciones/seguimiento-respuestas.md).

## 11. Excepciones B-22 (módulo 10, ADR-0014)

- **Excepción**: parte del borrador (`captura.excepciones`), congelada en la versión que se calcula. Tipos RENDIMIENTO (rendimiento o desperdicio de un componente de una partida), PRECIO_VENCIDO y CONCEPTO_PERSONALIZADO, siempre con motivo. Su número es su posición en la versión.
- **Decisión** (`excepcion_decision`): una por excepción y versión, AUTORIZADA o RECHAZADA, inmutable, tomada por un Revisor distinto del preparador durante una revisión PENDIENTE de esa versión, con comentario opcional. Conserva la revisión, la persona y el instante.
- **Relaciones**: `Versión 1 ── N Excepción (en la captura)`; `Revisión 1 ── N Decisión`; `Versión 1 ── N Decisión` (UNIQUE por número). Una versión nueva no hereda decisiones.
- **Efecto**: las de rendimiento se aplican al calcular (pendientes o autorizadas); aprobar y emitir exigen todas autorizadas; una rechazada bloquea esa versión. El contenido comercial y el PDF no las incluyen.

## 12. Administración de proveedores, productos, precios y tarifas (módulo 11, ADR-0015)

| Tabla | Clave y relaciones | Notas |
|---|---|---|
| `proveedor` | `PRV-NNNNN`; nombre único normalizado por organización | Contacto, teléfono y correo; revisión; autoría (`creado_*`, `modificado_*`; NULL en la carga DEMO); activo |
| `producto` | `PCM-NNNNN`; FK (organización, insumo); descripción y presentación únicas normalizadas | Presentación, unidad de compra, contenido (en la unidad base del insumo), fraccionable e incremento. **Con algún precio, los campos técnicos ya no cambian** (decisión del propietario; disparador) |
| `precio` | `PRE-NNNNNN`; FK (organización, producto) y (organización, proveedor); exclusión de vigencias solapadas no anuladas | No se edita. Anulación definitiva con motivo, persona e instante. La única otra modificación: acortar `vigente_hasta` al registrar un sucesor (adaptación; P3 pendiente) |
| `tarifa_mano_obra` | `TMO-NNNNN`; FK opcional (organización, proveedor) = subcontratista | No se edita: solo `activa`. Se asigna a `concepto.tarifa_id` (solo esa columna; la aprobación del concepto se conserva) |
| `bitacora` | Entidades `proveedor`, `producto`, `precio`, `tarifa`, `concepto` | Altas, ediciones (campos), activación, anulación, cierre de vigencia (fechas anterior y nueva, motivo, sucesor) y asignación de tarifa (anterior, nueva, motivo) |

| Libro | Web |
|---|---|
| `Editar producto` cambia todos los campos | Con precios solo la descripción comercial; otra presentación = producto nuevo |
| «Registrar precio» y «Anular precio erróneo» | Igual, más «Cerrar vigencia y registrar sucesor» en una operación (adaptación del DEMO; P3 pendiente) |
| `Val_Tarifa`: «registre una tarifa nueva y asígnela al concepto» | Registrar tarifa y «Asignar tarifa» al concepto (dependencia mínima del bloque de conceptos) |
| Persona en turno y bitácora del libro | Usuario de la sesión, autoría por columnas y bitácora por evento |

Las versiones, aprobaciones, emisiones y PDF no cambian por la administración. Un cambio posterior al cálculo bloquea por BL-16 al enviar, aprobar o emitir esa versión. El editor avisa que la versión ya no es vigente.

## 13. Catálogo técnico y aprobación de conceptos (módulo 12, ADR-0016)

| Tabla | Clave y relaciones | Notas |
|---|---|---|
| `tipo_estructura` | `TES-NNNNN`; única por (familia, nombre normalizado) | Seis familias de `tblListas.FAMILIA` y seis genéricos del libro (datos base). Con conceptos, la familia no cambia; inactivo no se ofrece para conceptos nuevos y no permite aprobarlos |
| `insumo` | `INS-NNNNN`; descripción única normalizada | Especificación, revisión y autoría. Con productos, conversiones o componentes, la unidad base no cambia |
| `conversion` | Única por (insumo, unidad de origen); destino = unidad base | Solo cambian factor y fuente, con motivo; los conceptos aprobados que la usan vuelven a Borrador |
| `concepto` | `CON-NNNNN`; FK (organización, tipo); única por (tipo, descripción normalizada) | Regla de medición, criterios, `heredado`, `revision_tecnica`, aprobación (quién y cuándo) y último cambio técnico. Aprobar solo con `softarq_aprobar_concepto` |
| `componente` | `CMP-NNNNN`; único por (concepto, insumo) | Trazabilidad opcional al guardar, obligatoria para aprobar y calcular (BL-05). Cualquier cambio sube la revisión técnica del concepto |
| `bitacora` | Entidades `tipo_estructura`, `insumo`, `conversion`, `componente` y `concepto` | Altas, ediciones, activación, aprobación, vuelta a Borrador (motivo y aprobación anterior) y conversión editada (factores y conceptos afectados) |

| Libro | Web |
|---|---|
| `Val_Insumo`: la unidad base no cambia con productos o conversiones | También con componentes (más estricto) |
| Concepto «Inactivo» como estado | `activo = false` conserva el estado; reactivar vuelve a Borrador (mismo efecto) |
| `Concepto_Problemas` | La misma lista, más la convertibilidad de cada componente (la exige el motor) |
| `Concepto_Aprobar` (cualquier `FN_ADMCAT`) | Igual, ligado a la revisión técnica revisada (409 si cambió) |
| Conceptos cargados sin tipo ni regla | No existen en el libro: marca `heredado` transitoria para los cinco conceptos de la carga anterior |

## 14. Parámetros, personas y permisos efectivos (módulo 13, ADR-0017)

| Tabla | Cambio | Notas |
|---|---|---|
| `parametros_calculo` | `texto_alcance`, `texto_condiciones`, `texto_exclusiones` (los tres o ninguno), `revision`, `modificado_por/en` | Plantillas: se COPIAN a cada cotización nueva; el borrador las edita y la versión las congela. Ambiente y moneda no se editan. Se edita con `softarq_editar_parametros` (bitácora `PARAMETROS_EDITADOS` con anterior y nuevo) |
| `usuario` | `contrasena_temporal_expira_en` (`null` = sin temporal) | Correo global, único y no editable. Solo hash Argon2id; la temporal nunca se guarda en claro |
| `membresia` | `revision`, `modificada_por/en`; disparador del último Administrador del sistema | Funciones y `activa` por organización. Altas y cambios solo con funciones SECURITY DEFINER; la aplicación no tiene INSERT ni UPDATE |
| `bitacora` | Entidades `parametros` y `persona` | `PERSONA_CREADA`, `_EDITADA`, `_FUNCIONES` (anteriores y nuevas), `_DESACTIVADA`, `_REACTIVADA`, `_CONTRASENA_RESTABLECIDA`, `_CONTRASENA_CAMBIADA`; nunca credenciales |
| `idempotencia` | Recurso `persona` | El reintento del alta o del restablecimiento no genera otra contraseña ni la devuelve |

**Revocación de sesiones:** desactivar revoca las de la persona en esa organización; restablecer y el cambio propio revocan todas; retirar funciones no revoca, pero surte efecto en la petición siguiente.

**Permisos efectivos del rol de la aplicación:** matriz de garantías y capacidad residual en ADR-0017 §4. Sin UPDATE en `organizacion` ni `tipo_adicional`; en `parametros_calculo` solo las columnas editables; aprobar conceptos solo dentro de funciones DEFINER. Límite no resuelto: las funciones confían en el usuario que reciben.

## 15. Salidas internas de solo lectura (módulo 14, ADR-0018)

| Tabla | Cambio | Notas |
|---|---|---|
| `cotizacion_version` | `referencias_internas` (JSONB, `NULL` en versiones anteriores; CHECK de objeto) | Nombres y vigencias del catálogo leídos en la misma instantánea del cálculo (`esquema: 1`). Se escribe solo en `softarq_crear_version`; inmutable como el resto de la versión. Dato interno |

**Salidas** (`GET /cotizaciones/{id}/versiones/{n}/salidas-internas`, `salidas.consultar`), armadas solo con la versión congelada (`entrada_calculo`, `resultado_interno`, `solicitud_calculo`, `referencias_internas`) y las decisiones de sus excepciones:
- **compras calculadas** (12 COMPRAS): presentación, regla de compra, consumo total, cantidad comprada, unidades, sobrante informativo, precio y costo, consolidadas o por partida, con su prorrateo;
- **detalle del cálculo** (13 DETALLE_CALCULO): medición, consumos con valores del catálogo copiados frente a los aplicados y sus excepciones, mano de obra o subcontrato, adicionales, costos, P.U. e importe;
- **indicadores de la versión**: desglose del costo directo, subtotal, impuestos, total, recargo sobre costo y margen sobre precio (solo indicador), con fórmula, base y redondeo en ADR-0018 §5.

**Detalle histórico:** las versiones anteriores al módulo muestran sus cifras y solo los códigos (`SIN_NOMBRES`); nunca se completan con el catálogo actual. Consultar no escribe nada.

## 16. Duplicar, modo de precios y vista previa BORRADOR (módulo 15, ADR-0019)

| Tabla | Cambio | Notas |
|---|---|---|
| `cotizacion` | `duplicada_de_id` (FK compuesta con la organización), `duplicada_de_version` y `duplicada_de_revision` (CHECK: sin origen, o con origen y exactamente uno de los dos números) | Origen de un duplicado: versión concreta o revisión del borrador guardado. Se escribe solo en `softarq_duplicar_cotizacion` |
| `cotizacion_borrador` | `ciclo_version_origen`, `ciclo_modo_precios` (`CONSERVAR` \| `ELEGIR_DE_NUEVO`), `ciclo_motivo`, `ciclo_preparado_por` y `ciclo_preparado_en` (CHECK de todo o nada) | Ciclo de la versión nueva tras una emisión. `softarq_guardar_borrador` y `softarq_crear_version` responden `NUEVA_VERSION_SIN_PREPARAR` mientras la última versión sea la emitida y el ciclo no corresponda a esa emisión |
| `cotizacion_version` | `modo_precios` y `version_origen` (NULL si no aplica; CHECK conjunto) | Copiados del ciclo al calcular; inmutables como el resto de la versión |
| `idempotencia` | Recursos `nueva_version` y `vista_previa` | La duplicación usa el recurso `cotizacion` |
| `bitacora` | Eventos `COTIZACION_DUPLICADA`, `NUEVA_VERSION_PREPARADA` y `VISTA_PREVIA` | La vista previa se registra después de generar el PDF, una vez por clave; el PDF no se guarda |

**Duplicar** copia partidas, mediciones, textos del origen y consolidación; no copia selecciones de precio, excepciones, aprobaciones, emisiones ni respuestas. **Preparar la versión nueva** solo cambia las selecciones del borrador: CONSERVAR = las de la versión emitida; ELEGIR_DE_NUEVO = ninguna. **La vista previa** combina los datos congelados de la versión con los actuales del emisor, el cliente y el proyecto; solo para versiones Borrador, En revisión o Aprobada con cálculo vigente (BL-16, BL-19).
