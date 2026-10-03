# Modelo conceptual de SoftArq (DEMO)

- **Fecha:** 03/10/2026
- **Estado:**
  - **Implementado (módulo 2, ADR-0004):** `organizacion` y los catálogos que alimentan el cálculo, persistidos en PostgreSQL y aislados por organización (ver §4).
  - **Implementado (módulo 5, ADR-0007):** `usuario`, `membresia` (pertenencia con funciones) y `sesion`; matriz de permisos en §6.
  - **Implementado (módulo 6, ADR-0008):** `cliente`, `proyecto`, `cotizacion` (folio WEB DEMO), `cotizacion_borrador` (captura editable con revisión), `cotizacion_version` (inmutable), `contador`, `bitacora` e `idempotencia` (§7).
  - **Sin implementar:** CRUD de usuarios, partidas y excepciones como tablas propias (hoy viven en la captura y en la instantánea de la versión), revisión, aprobación, emisión, PDF ni suscripciones.

## 1. Entidades y relaciones

```
Organización N ── N Usuario        (por Membresía, con funciones; hoy una activa por usuario)
Usuario      1 ── N Sesión         (opaca; solo el hash del token)
Organización 1 ── N Cliente        (recibe la cotización; no tiene cuenta)
Cliente      1 ── N Proyecto
Organización 1 ── N Catálogo       (insumos, productos, proveedores, precios, tarifas, conceptos)
Cotización (folio) N ── 1 Cliente
Cotización (folio) N ── 1 Proyecto (del mismo cliente)
Cotización   1 ── 1 Borrador       (captura editable con revisión; módulo 6)
Cotización   1 ── N Versión        (v1, v2…; inmutables desde su creación en la web)
Versión      1 ── N Partida        (CONCEPTO con renglones de medición, o ADICIONAL)
Versión      1 ── N Selección de precio (una por insumo)
Versión      1 ── N Excepción      (rendimiento, precio vencido, concepto personalizado)
```

- **Organización:** posee sus usuarios, clientes, proyectos, catálogos y cotizaciones. Al principio solo habrá una organización **DEMO**. Toda consulta futura se filtrará por organización en el servidor.
- **Usuario:** persona que prepara o revisa. Sustituye a la «persona en turno» del Excel, que era un registro operativo sin autenticación (D-20). Es global: la organización la aporta la pertenencia.
- **Membresía (pertenencia):** une un usuario con una organización y guarda sus funciones del libro (Preparador, Revisor, Administrador del catálogo, Administrador del sistema), que la API traduce a capacidades en cada solicitud. El modelo admite varias pertenencias; en esta etapa el acceso exige una sola activa.
- **Sesión:** sesión opaca en PostgreSQL ligada a una pertenencia (FK compuesta, sin mezclar organizaciones). Expira por inactividad (30 min) y de forma absoluta (8 h) y se revoca al cerrar.
- **Cliente:** quien recibe la cotización. **No requiere cuenta** ni accede al sistema.
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
| `tblExcepciones`: tipo, partida, referencia, campo, valor aplicado, estado | Excepción | El motor usa las de RENDIMIENTO; las demás pertenecen a revisión. |
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
| Proveedores, productos y precios | Propio | `proveedor`, `producto`, `precio` | Costos internos: nunca salen del servidor ni se comparten. |
| Tarifas de mano de obra | Propio | `tarifa_mano_obra` | Costos internos. |
| Conceptos y componentes | Propio | `concepto`, `componente` | Reglas técnicas aprobadas por cada organización. |
| Tipos de costo adicional | Propio | `tipo_adicional` | Catálogo de cada organización. |

Toda relación entre datos propios es una FK compuesta con `organizacion_id`, de modo que la base impide mezclar organizaciones. Inicialmente solo existe la organización `DEMO`; las pruebas crean otras para comprobar el aislamiento.

## 5. Pendiente de decidir (módulos posteriores)

- Selección o cambio de organización para usuarios con varias pertenencias.
- Capacidades de revisión, aprobación, emisión y administración (módulos posteriores).
- Si los catálogos se comparten entre organizaciones o son siempre propios.
- Planes o suscripciones (fuera del DEMO).
- Esquema de PostgreSQL y migración desde los CSV del libro (Prisma, según ADR-0003).
- Descartar y duplicar cotizaciones, «precios anteriores» en una versión nueva, contacto del cliente y datos del emisor (con la emisión).

## 6. Matriz de permisos vigente (módulo 5, ADR-0007 §2)

| Capacidad | Endpoints | Preparador | Revisor | Adm. catálogo | Adm. sistema | Fuente en el libro |
|---|---|---|---|---|---|---|
| `sesion.propia` | `GET` y `DELETE /api/v1/auth/sesion` | ✓ | ✓ | ✓ | ✓ | — |
| `catalogos.consultar` | `GET /api/v1/catalogos/*` | ✓ | ✓ | ✓ | ✓ | Las hojas de catálogo se abren sin función |
| `calculo.ejecutar` | `POST /api/v1/calculos/demo` | ✓ | ✗ | ✗ | ✗ | `BTN_Calcular` exige `Req_Funcion FN_PREP` (`modMotor.bas`) |
| `clientes.consultar` | `GET /clientes`, `/clientes/{id}`, `/proyectos`, `/proyectos/{id}` | ✓ | ✓ | ✓ | ✓ | Las hojas 01 CLIENTES y 02 PROYECTOS se abren sin función |
| `clientes.gestionar` | `POST /clientes`, `PATCH /clientes/{id}`, `POST /proyectos`, `PATCH /proyectos/{id}` | ✓ | ✗ | ✓ | ✗ | `Cat_RequiereFuncion` (`modCatalogos.bas`): Preparador o Administrador del catálogo |
| `cotizaciones.consultar` | `GET /cotizaciones`, `/cotizaciones/{id}`, `/cotizaciones/{id}/versiones/{n}` | ✓ | ✓ | ✓ | ✓ | La hoja 16 HISTORIAL se abre sin función |
| `cotizaciones.preparar` | `POST /cotizaciones`, `PUT /cotizaciones/{id}/borrador` | ✓ | ✗ | ✗ | ✗ | `Cot_Nueva` y `BTN_GuardarBorrador` exigen `FN_PREP` |
| `cotizaciones.preparar` **y** `calculo.ejecutar` | `POST /cotizaciones/{id}/versiones` (organización DEMO) | ✓ | ✗ | ✗ | ✗ | Guardar versión = calcular (`BTN_Calcular`) |

**Previsto para módulos posteriores** (no implementado): registrar excepciones y enviar a revisión (Preparador); observaciones, autorizar excepciones, aprobar y emitir con un revisor **distinto del preparador** (Revisor, BL-17 y D-13); editar catálogos y aprobar conceptos (Administrador del catálogo); parámetros y personas (Administrador del sistema).

## 7. Clientes, proyectos y cotizaciones (módulo 6, ADR-0008)

| Tabla | Clave y relaciones | Notas |
|---|---|---|
| `cliente` | `CLI-NNNNN` por organización | Nombre o razón social y `activo`; sin datos fiscales ni de contacto |
| `proyecto` | `PRY-NNNNN`; FK (organización, cliente) | Nombre, municipio, entidad y descripción (opcionales salvo el nombre) |
| `cotizacion` | Folio por organización; **FK (organización, cliente, proyecto) → proyecto** | Origen `WEB_DEMO`, estado del folio `ACTIVO`, último número de versión |
| `cotizacion_borrador` | 1:1 con la cotización | Captura (`jsonb`), revisión, quién y cuándo |
| `cotizacion_version` | UNIQUE (cotización, número) | Inmutable (sin UPDATE/DELETE para la aplicación y trigger para el propietario). Entrada y resultado internos solo en el servidor |
| `contador`, `bitacora`, `idempotencia` | Por organización | Folios y códigos atómicos; eventos mínimos; claves de idempotencia de 24 h |

Estados alcanzables: folio **ACTIVO** y versión **BORRADOR** («Borrador calculado · sin enviar a revisión»). Revisión, aprobación y emisión añadirán estados en una tabla aparte de solo inserción.
