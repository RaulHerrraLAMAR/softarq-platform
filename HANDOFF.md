# HANDOFF — Continuidad entre sesiones y agentes

> Léelo al empezar. Actualízalo al terminar cada tarea (sección por sección, sin borrar el historial de la tabla 4). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

**Última actualización:** 24/10/2026 · Claude Code · **módulo 16, app móvil Android (etapa 1: acceso y consulta)** (§26), sobre `f1367de` (traslado a la laptop, §25) y `31cf626` (módulo 15, §24). Sin cambios de reglas de negocio ni del motor.

## 1. Estado actual

- **Módulo 16 (24/10/2026), etapa 1 de la app móvil:** implementado y verificado con pruebas automatizadas (ADR-0020, §26). Proyecto Expo SDK 58 en `apps/mobile`: acceso, recuperación y cierre de sesión, cambio obligatorio de la contraseña temporal, navegación por capacidades y **consulta comercial** de clientes, proyectos y cotizaciones (versiones, estados, revisiones y eventos). Solo lectura.
  - **API:** sesión de tipo `MOVIL` por `Authorization: Bearer` (migración aditiva `20261024120000_sesion_movil`), con lista blanca de rutas; la web (cookie, CSRF, `Origin`, CORS) no cambió.
  - **Conexión:** la API sigue en `127.0.0.1`; el teléfono llega por USB (`adb reverse`).
  - **Teléfono:** la instalación y el recorrido se registran en `docs/movil/guia-instalacion-y-pruebas.md` §10 solo cuando se ejecutan en el dispositivo (ver §26).
- **App móvil, estado de EAS (24/10/2026):** proyecto `@raulherrera09/softarq-demo` (ID `69326c6d-44f9-4e72-83aa-53dbe4b70905`) vinculado en `app.config.ts` (commit «Módulo 16: vincular la app móvil con el proyecto EAS softarq-demo», `419d953` tras la reescritura de mensajes; antes `7a7b9b3`). **La compilación `development` sigue PENDIENTE** (la primera genera la keystore y es interactiva); las pruebas T1–T10 del teléfono siguen en «Pendiente». Detalle en §26.
- **Entorno actual (24/10/2026):** el proyecto se trasladó a `C:\Proyecto_SoftArq\Proyecto_SoftArq` (repositorio en `...\softarq-platform`; la doble carpeta es intencionada). `softarq_dev` se inicializó desde el respaldo `softarq_dev-20261023T224027Z-22f32d` y las validaciones se repitieron en esta máquina. Las rutas `D:` del resto de este documento describen el equipo original. Detalle y resultados en §25.

- **Módulo 15:** implementado (ADR-0019).
  - **Duplicar** (B-35, Preparador): desde una versión concreta o desde el borrador guardado, a un proyecto activo. Folio nuevo, sin precios elegidos ni excepciones, con el origen registrado.
  - **Preparar la versión nueva** (B-34, Preparador): tras una emisión, editar o calcular exige elegir el modo de precios y el motivo.
    - CONSERVAR toma las selecciones de la versión emitida; ELEGIR_DE_NUEVO las vacía.
    - Los parámetros, el impuesto y la mano de obra vigentes se aplican al calcular.
    - La versión guarda modo y origen.
  - **Vista previa PDF BORRADOR** (B-25, las cuatro funciones): versiones Borrador, En revisión o Aprobada con cálculo vigente (BL-16, BL-19).
    - Combina datos congelados con los actuales del emisor, el cliente y el proyecto.
    - No se guarda; se audita como VISTA_PREVIA.
    - El PDF EMITIDO no cambia (huella SHA-256 en prueba).
  - Detalle y pruebas en §24.

- **Módulo 14:** implementado (ADR-0018). Preparador y Revisor (capacidad nueva `salidas.consultar`) consultan, de una versión concreta y en solo lectura, en «Salidas internas» y en `GET /api/v1/cotizaciones/{id}/versiones/{n}/salidas-internas`:
  - **compras calculadas** (12 COMPRAS): presentación, regla, unidades, sobrante informativo, precio y costo, consolidadas o por partida, con su prorrateo;
  - **detalle del cálculo** (13 DETALLE_CALCULO): medición, consumos (valor de catálogo de la versión frente al aplicado y excepciones), mano de obra, adicionales, costos, P.U. e importe;
  - **indicadores de la versión**: desglose del costo directo, subtotal, impuestos, total, recargo sobre costo y margen sobre precio (solo indicador).
  - Los administradores no la reciben. Sin exportación. Contadores de 00 INICIO pendientes.
  - **Detalle histórico:** las versiones nuevas congelan nombres y vigencias (`referencias_internas`); las anteriores muestran cifras y solo códigos, sin usar el catálogo actual.
  - Detalle y pruebas en §23.

- **Módulo 13:** implementado (ADR-0017). El Administrador del sistema gestiona en «Administración» y en `/api/v1/admin/{parametros,personas}`:
  - **parámetros:** recargo, impuesto, vigencia y plantillas de textos, con motivo, revisión e impacto previo; ambiente y moneda solo lectura; solo afectan a cálculos y cotizaciones nuevos;
  - **personas:** alta con contraseña temporal mostrada una vez (72 h, cambio obligatorio que la API impone), funciones, desactivación que cierra sus sesiones, restablecimiento y regla del último Administrador del sistema.
  - **Antes, en `b3b785d`:** `db:migrar` solo tras un respaldo verificado; permisos del rol de la aplicación reducidos (sin UPDATE en organización, tipos de costo adicional ni estado de concepto; aprobar solo en funciones DEFINER); impacto que distingue borradores, versiones sin enviar, en revisión y aprobadas sin emitir.
  - Detalle y pruebas en §22.

- **Módulo 12:** implementado (ADR-0016). El Administrador del catálogo gestiona en «Catálogo» y en `/api/v1/admin` tipos de estructura, insumos, conversiones, conceptos y componentes, y aprueba conceptos (también el que los creó, como en el libro), ligado a la revisión técnica revisada.
  - **Decisiones del propietario:** conversión editable que devuelve a Borrador los conceptos aprobados; seis tipos genéricos del libro como datos base; conceptos heredados sin tipo ni regla (CON-00001, 00002, 00007–00009 en `softarq_dev`) marcados, sin rellenar y funcionando; aprobación por cualquier Administrador del catálogo.
  - **Cálculo:** BL-05 de trazabilidad en el ensamblador; motor intacto; los cuatro totales de referencia sin cambios.
  - **Personalizados:** se crean en la web y se cotizan con su excepción (sin aprobarse).
  - Antes, en `3599ece`: corrección del fallo intermitente de `excepciones.spec.ts`, selectores con búsqueda y paginación y prueba de acceso por ruta.
  - Detalle y pruebas en §21.

- **Módulo 11:** implementado (ADR-0015). El Administrador del catálogo (`catalogos.administrar`) gestiona en la web «Catálogo» y en `/api/v1/admin` proveedores, productos (presentación y contenido), precios con vigencia y tarifas de mano de obra.
  - **Reglas comunes:** sin borrado; desactivación con impacto previo; historial en bitácora; concurrencia por revisión; idempotencia.
  - **Adaptaciones autorizadas:**
    - bloqueo técnico del producto con precios;
    - «Cerrar vigencia y registrar sucesor» (**P3 sigue pendiente con el cliente**);
    - «Asignar tarifa» a un concepto, como dependencia mínima.
  - **Efecto en las cotizaciones:** versiones, emisiones y PDF intactos. Un cambio posterior al cálculo bloquea por BL-16 y el editor lo avisa.
  - Detalle y pruebas en §20.

- **Módulo 10:** implementado (ADR-0014): el Preparador registra excepciones B-22 (rendimiento o desperdicio de un componente, precio vencido, concepto personalizado) con motivo en el borrador; se congelan en la versión calculada y el cálculo del servidor aplica las de rendimiento. Un Revisor distinto del preparador autoriza o rechaza cada una durante la revisión; aprobar y emitir exigen todas autorizadas (BL-04/05/09), una rechazada bloquea esa versión y AV-04 informa las autorizadas. PDF y contenido comercial sin excepciones. Cobertura del DEMO y estimación: [`docs/cobertura-demo.md`](docs/cobertura-demo.md). Detalle en §19.

- **Módulo 9:** implementado (ADR-0013): Preparador registra Aceptada/Rechazada sobre emisión exacta y corrige mediante evento nuevo con motivo. Fecha recibida dentro de vigencia inclusive; captura posterior permitida si recepción en plazo. Fecha/identidad del registro en servidor; PDF, emisión y versión intactos. Fuentes y diferencias: `docs/cotizaciones/seguimiento-respuestas.md`; verificación de esta sesión en §18.

- **Fase 1 (Excel):**
  - terminada para revisión técnica, con datos DEMO;
  - pendientes: PR-41, PR-42, PR-43, PR-44, los 12 datos reales y la aceptación del profesor;
  - no se modifica desde aquí. La prueba personal del propietario está registrada como declaración, no como PR-41 ni PR-44.
- **Módulo 1, motor de cálculo** (`f0a34da`): CR-01 a CR-16 en `apps/api/src/modules/calculo/domain`.
- **Módulo 2, persistencia de catálogos** (`2543baa`):
  - PostgreSQL 18 local con Prisma 7.10.0;
  - catálogos aislados por organización;
  - catálogo DEMO cargado en `softarq_dev`;
  - ensamblador que arma la entrada del motor desde la base;
  - los 4 escenarios principales se reproducen desde PostgreSQL con los totales de referencia.
- **Módulo 3, API HTTP local** (`185fd26`):
  - NestJS 12 en `127.0.0.1:3000`;
  - catálogos para preparar una cotización DEMO y `POST /api/v1/calculos/demo` con datos de PostgreSQL;
  - devuelve solo la proyección comercial;
  - los 4 escenarios principales se reproducen por HTTP.
- **Módulo 4, cliente web DEMO** (`84f9218`):
  - React 19 y Vite 8 en `http://localhost:5173` (escucha en `127.0.0.1`);
  - cuatro ejemplos verificados y captura propia, con selección explícita de opciones y costos adicionales;
  - el cálculo lo hace la API, y la web muestra el resultado comercial, los avisos y los bloqueos;
  - cada cambio deja el resultado pendiente de recalcular.
- **Módulo 5, usuarios DEMO, sesiones y autorización** (`ff6da0d`):
  - tablas `usuario`, `membresia` (pertenencia con funciones del libro) y `sesion` (opaca; solo SHA-256 del token);
  - contraseñas con Argon2id (`@node-rs/argon2`, m = 64 MiB, t = 3, p = 4);
  - cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/v1` y host-only;
  - CSRF con HMAC ligado a la sesión, comprobación de `Origin` y límites de intentos de acceso;
  - la organización, la identidad y las funciones salen de la sesión; no queda ningún contexto DEMO anónimo;
  - matriz: Preparador consulta y calcula, Revisor consulta (403 al calcular);
  - web con pantalla de acceso, restauración de la sesión, barra de identidad, cierre y sesión vencida, y limpieza de la captura al cambiar de identidad.
- **Módulo 6, clientes, proyectos y cotizaciones (este commit):**
  - clientes (`CLI-NNNNN`) y proyectos (`PRY-NNNNN`) por organización: crear, editar, desactivar y reactivar sin borrar;
  - cotizaciones con folio `COT-AAAA-NNNNN` de origen **WEB DEMO** (contador propio por organización y año; no continúa el del libro), reservado al crearlas;
  - borrador con revisión (concurrencia optimista: 409 recuperable, sin sobrescrituras silenciosas), que puede guardarse incompleto y nunca tiene total;
  - versiones **inmutables** calculadas por el servidor con el borrador guardado: lectura `REPEATABLE READ` de solo lectura + una sentencia atómica de escritura; entrada y resultado internos solo en el servidor;
  - idempotencia en todas las altas (`Idempotency-Key`), eventos mínimos en `bitacora` e historial consultable;
  - permisos: Preparador prepara y calcula; Revisor solo consulta; Administrador del catálogo gestiona clientes y proyectos;
  - web con navegación por secciones y URL por pantalla, editor de cotización sobre el mismo formulario de la calculadora, vista previa, versiones, conflictos entre pestañas y «Guardar como cotización».
- **Módulo 7, revisión y aprobación (ADR-0009, `b58ed43`):**
  - el Preparador envía explícitamente la **última** versión, solo si corresponde al borrador guardado (sin cambios sin guardar ni pendientes de recalcular);
  - el Revisor consulta la bandeja, abre la versión (proyección comercial guardada, verificación vigente y avisos) y **solicita cambios** (con explicación) o **aprueba**;
  - el Preparador puede **retirar** una revisión pendiente para corregir (adaptación de la web);
  - **BL-17 por identidad:** quien aprueba no puede ser el autor de la versión, aunque tenga o reciba la función Revisor (API, función de la base y CHECK);
  - la revisión vive en `revision` (estado por envío, terminal tras decidir o retirar) y `revision_evento` (solo alta). La versión **no cambia**: su estado (`BORRADOR`, `EN_REVISION`, `APROBADA`) se deriva y la aprobación de v1 no se aplica a v2;
  - verificación vigente al enviar y aprobar (BL-01/02, 04, 07, 08, 09, 10–14, 16, 18 y AV-01/02/03/05) en una lectura de solo lectura, **sin recalcular ni reemplazar importes**;
  - concurrencia: una sola transición confirmada (409 `CONFLICTO_REVISION` con el estado vigente); idempotencia de envíos, decisiones y retiradas;
  - con una revisión pendiente no se guarda el borrador ni se calcula (409 `REVISION_PENDIENTE`, BL-19);
  - **la aprobación no es una emisión ni una entrega al cliente.**
- **Módulo 8, emisión, PDF DEMO, anulación y descarte (ADR-0010, este commit):**
  - **Quién emite (adaptación autorizada por el propietario; en el libro emite el Revisor ≠ preparador):** un **Preparador** o un **Revisor que no preparó la versión**. Siempre con una aprobación vigente de **esa** versión hecha por otra persona; poder emitir no concede aprobar. Se registran por separado quién preparó, aprobó y emitió;
  - **reglas al emitir**, con la fecha del servidor (America/Mexico_City):
    - BL-01 y BL-02 completas y coherentes con las copias de la versión;
    - BL-09 y AV-02 con la fecha de emisión;
    - BL-15 (emisor), BL-17, BL-19 y BL-20;
    - CR-16 (vigencia).

    No recalcula ni sustituye importes: si algo exige recalcular, corresponde una vN+1 con su aprobación;
  - **textos de la versión** (alcance, condiciones y exclusiones; decisión del propietario):
    - viven en el borrador y se copian a la versión (inmutable);
    - los valores DEMO del libro se copian al crear la cotización;
    - el revisor los ve antes de aprobar y el PDF usa los de la versión;
    - no tocan el cálculo;
    - las versiones anteriores sin textos necesitan vN+1;
  - **registro `emision` inmutable**, aparte de la versión:
    - aprobación usada y personas;
    - fechas;
    - contenido comercial exacto del PDF;
    - plantilla;
    - clave, tamaño y SHA-256 del archivo;
  - **PDF DEMO con PDFKit** (fuentes Fira locales y logotipo DEMO), de una o varias páginas. Lleva «DEMOSTRACIÓN» en cada página y no incluye costos, proveedores, consumos, margen ni metadatos de autor o título;
  - **archivos:**
    - carpeta persistente `SOFTARQ_DIR_DOCUMENTOS` (desarrollo: `D:\Proyecto_SoftArq\datos\softarq_dev\documentos`, fuera del repositorio y de `_work`);
    - se escriben en temporal, se validan, se calcula el hash, se pasan a definitivo sin sobrescribir y solo entonces se registran (201);
    - la descarga se hace con la sesión, son los mismos bytes y se comprueba el hash; nunca se regenera;
    - recuperación con `documentos:revisar`;
  - **anulación** de la aprobación antes de emitir, por un Revisor y con motivo: evento nuevo; la aprobación original se conserva;
  - **descarte** de la cotización por un Preparador, con motivo: sin emisión, revisión pendiente ni aprobación vigente. Se conservan folio, versiones y eventos y el folio no se reutiliza;
  - **otros cambios:** contacto del cliente, emisor DEMO configurable por el Administrador del sistema (cuenta `[DEMO] Administrador`) y web integrada (textos, «Emisión», «Descargar PDF», anulación, descarte y «Emisor»);
  - **el documento es DEMO:** no hay correo ni envío al cliente y no es una cotización comercial real.
- **Corrección del borrador (commit `97e69d5`):** guardar ya no elimina en silencio las selecciones de un concepto, proveedor o precio que dejó de estar disponible. Se conservan, marcadas, hasta que el usuario las sustituya o quite; las referencias nuevas inválidas se rechazan (422 `REFERENCIA_NO_DISPONIBLE`). Ver ADR-0008, «Corrección posterior».
- **Revisión personal de la web:** el propietario declaró que revisa manualmente los resultados de la web (registrado el 03/10/2026). Es una declaración, sin recorridos, casos ni evidencias atribuidos. La ejecución formal de los casos de la guía (A1–A9, 1–14, C1–C15) sigue sin registro, y ninguna de las dos cuenta como PR-41 ni PR-44 del Excel.
- **Grafo de código local (Graphify 0.8.5, ADR-0011):**
  - solo AST, sin modelos ni servicios externos;
  - indexa el código propio de API, web, contratos y scripts (204 archivos al 04/10/2026);
  - rutina de los agentes en `AGENTS.md` §12; detalle en §16 y en [`docs/herramientas/graphify.md`](docs/herramientas/graphify.md).
- **Respaldo y recuperación local (ADR-0012):**
  - respaldo coherente de `softarq_dev` y sus PDF originales con manifiesto y hashes;
  - restauración solo en `softarq_restauracion`;
  - prueba completa 30/30, con descarga del PDF por una API temporal;
  - detalle en §17.
- **Todavía no existen:** recuperación de contraseña por la propia persona, MFA, alta y edición de tipos de costo adicional, duplicar cotizaciones, modo de precios en versiones nuevas, vista previa PDF BORRADOR, contadores de 00 INICIO, exportación de informes internos, correo, anulación de documentos emitidos ni móvil (lista completa en [`docs/cobertura-demo.md`](docs/cobertura-demo.md)).

## 2. Decisiones vigentes

| ID | Decisión | Dónde |
|---|---|---|
| ADR-0001 | Monorepo pnpm; solo contratos compartidos; PostgreSQL local | [`docs/adr/0001-monorepo-y-stack.md`](docs/adr/0001-monorepo-y-stack.md) |
| ADR-0002 | DEMO local antes de PR-44, que sigue pendiente | [`docs/adr/0002-demo-local-antes-del-piloto.md`](docs/adr/0002-demo-local-antes-del-piloto.md) |
| ADR-0003 | Motor puro; decimal.js; decimales como texto; Vitest; ESM | [`docs/adr/0003-motor-de-calculo.md`](docs/adr/0003-motor-de-calculo.md) |
| ADR-0004 | Prisma 7.10 con adaptador `pg`; roles migrador y aplicación; base sombra; `NUMERIC` por clase de dato; DATE; FK compuestas por organización; CHECK y exclusión; carga DEMO sin sobrescribir ni borrar; pruebas solo en `softarq_test` | [`docs/adr/0004-persistencia-catalogos.md`](docs/adr/0004-persistencia-catalogos.md) |
| ADR-0005 | API HTTP local: NestJS 12 ESM compilado con `tsc`; Zod en `contracts` como definición única (validación, tipos y OpenAPI); sobre de error único (400/404/413/415/422/429/503/500); solo `127.0.0.1`; CORS con lista explícita; rate limit en memoria; contexto DEMO fijo (no es autenticación); fecha de cálculo del servidor | [`docs/adr/0005-api-http-local.md`](docs/adr/0005-api-http-local.md) |
| ADR-0006 | Web DEMO: React 19 + Vite 8 sin router ni librería de estado; solo `@softarq/contracts`; captura en reducer con decimales como texto; huella para «pendiente de recalcular»; sin duplicados ni respuestas atrasadas (abort + número de solicitud); sin preselección; `DIMENSIONES_POR_FORMULA` en contracts; Vite solo en loopback con `strictPort`, sin proxy, CSP y fuentes locales; Playwright con Edge contra la web compilada, la API real y `softarq_test` con `RelojFijo` | [`docs/adr/0006-cliente-web-demo.md`](docs/adr/0006-cliente-web-demo.md) |
| ADR-0007 | Usuarios DEMO y sesiones opacas en PostgreSQL (solo el hash del token); Argon2id m = 64 MiB, t = 3, p = 4 con `@node-rs/argon2`; expiración de 8 h absoluta y 30 min por inactividad, renovación al autenticar y revocación con UPDATE; cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/v1`, host-only, sin `Secure` solo en local; host `localhost` para la web y la API (escucha en 127.0.0.1); CSRF con HMAC por sesión y `Origin`; límites de acceso temporales; guardia que niega por omisión; matriz de funciones del libro (solo el Preparador calcula); `softarq_app` solo lee las tablas de identidad | [`docs/adr/0007-autenticacion-sesiones.md`](docs/adr/0007-autenticacion-sesiones.md) |
| ADR-0008 | Clientes y proyectos por organización; cotización con folio `COT-AAAA-NNNNN` WEB DEMO por organización y año (contador atómico, sin MAX + 1); FK compuesta cotización → (organización, cliente, proyecto); borrador `jsonb` con revisión; versión inmutable (sin UPDATE/DELETE para `softarq_app` y trigger para el propietario) con instantánea interna, copias descriptivas, motor y huellas; estados alcanzables folio ACTIVO y versión BORRADOR; versión en dos fases (lectura RR solo lectura + función de una sentencia); idempotencia de 24 h por organización, usuario y clave; capacidades `clientes.*` y `cotizaciones.*` | [`docs/adr/0008-cotizaciones-versiones-folios.md`](docs/adr/0008-cotizaciones-versiones-folios.md) |
| ADR-0009 | Revisión por versión inmutable en `revision` (PENDIENTE → APROBADA, CAMBIOS_SOLICITADOS o RETIRADA, terminales; trigger e índice parcial) y `revision_evento` (solo alta); estado de la versión derivado; solo se envía la última versión si coincide con el borrador; verificación vigente de solo lectura sin recalcular importes; BL-17 por identidad (API, función y CHECK); retirada por el Preparador; capacidades `revisiones.enviar` y `revisiones.decidir`; 409 por ficha obsoleta; idempotencia; BL-19 en guardar y calcular | [`docs/adr/0009-revision-aprobacion.md`](docs/adr/0009-revision-aprobacion.md) |
| ADR-0010 | Emisión por Preparador o Revisor ≠ autor con aprobación vigente de otra persona (adaptación autorizada); textos por versión copiados al crear; datos descriptivos de la versión y contacto/emisor congelados al emitir (bloqueo si difieren); `emision` inmutable con trigger de coherencia; PDF DEMO con PDFKit y recursos locales; carpeta persistente fuera del repositorio; archivo → validación → hash → definitivo sin sobrescribir → registro; recuperación con `documentos:revisar`; anulación por evento; descarte del folio sin eludir revisión ni aprobación | [`docs/adr/0010-emision-pdf-anulacion-descarte.md`](docs/adr/0010-emision-pdf-anulacion-descarte.md) |
| ADR-0011 | Grafo de código local con Graphify (solo AST), reconstrucción limpia, vigencia verificable y hooks | [`docs/adr/0011-grafo-de-codigo-graphify.md`](docs/adr/0011-grafo-de-codigo-graphify.md) |
| ADR-0012 | Respaldo coherente de `softarq_dev` y PDF, rol de solo lectura, restauración solo en `softarq_restauracion` | [`docs/adr/0012-respaldo-y-restauracion-local.md`](docs/adr/0012-respaldo-y-restauracion-local.md) |
| ADR-0013 | Respuesta interna por emisión exacta, vigencia inclusiva derivada, captura tardía si se recibió en plazo, correcciones como eventos nuevos con motivo | [`docs/adr/0013-seguimiento-respuestas-vigencia.md`](docs/adr/0013-seguimiento-respuestas-vigencia.md) |
| ADR-0015 | Administración de proveedores, productos, precios y tarifas por el Administrador del catálogo: funciones de una sentencia con bitácora, revisión e idempotencia; disparadores (producto con precios, precio inmutable salvo anular o acortar, tarifa inmutable); cierre de vigencia con sucesor (P3 pendiente); asignar tarifa conservando la aprobación; contrato `/admin` interno; capacidad `catalogos.administrar` | [`docs/adr/0015-administracion-catalogos.md`](docs/adr/0015-administracion-catalogos.md) |
| ADR-0016 | Catálogo técnico: tipos de estructura, insumos, conversiones, conceptos y componentes; aprobación de conceptos por cualquier Administrador del catálogo; BL-05 de trazabilidad; conceptos heredados | [`docs/adr/0016-catalogo-tecnico-aprobacion-conceptos.md`](docs/adr/0016-catalogo-tecnico-aprobacion-conceptos.md) |
| ADR-0017 | Parámetros y personas por el Administrador del sistema; contraseña temporal (72 h) con cambio obligatorio en la API; plantillas TEXTO_* copiadas a cotizaciones nuevas; migración protegida; matriz de permisos efectivos con su capacidad residual | [`docs/adr/0017-parametros-personas-permisos.md`](docs/adr/0017-parametros-personas-permisos.md) |
| ADR-0018 | Salidas internas de solo lectura (compras calculadas, detalle e indicadores de una versión) con `salidas.consultar` para Preparador y Revisor (cambio intencionado frente a la protección de costos del ADR-0009); `referencias_internas` congeladas solo en versiones nuevas; sin exportación; tarea propuesta de identidad de las funciones SQL | [`docs/adr/0018-salidas-internas.md`](docs/adr/0018-salidas-internas.md) |
| ADR-0014 | Excepciones B-22 en el borrador, congeladas en la versión; decisión inmutable del Revisor ≠ preparador ligada a la versión; enviar con registradas, aprobar y emitir con autorizadas; rechazada bloquea esa versión (vN+1); AV-04; contrato interno con capacidad `excepciones.consultar`; sin flujo de autorización paralelo | [`docs/adr/0014-excepciones.md`](docs/adr/0014-excepciones.md) |
| Propietario | Libro oficial `entrega\Cotizador_Estructuras_F1.xlsm`; COT-2026-00016/00017 y la persona en turno se conservan; evidencias citadas por archivo, escenario y caso | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) §4 |
| Entorno | Trabajo en `D:\Proyecto_SoftArq`; temporales y cachés en `_work`; sin remoto ni push | `AGENTS.md` §1 |

Pendiente de decidir: selección de organización para usuarios con varias pertenencias, almacén compartido de los limitadores y de los documentos para varias instancias, respaldo automatizado de base y documentos, TLS y proxy antes de publicar, exportación CSV para usuarios y alcance de la app móvil.

## 3. Esquema implementado (migración `20261002000000_catalogos`)

- **Común:**
  - `unidad`: 15 unidades de `modBuild.bas`; la aplicación solo la lee.
- **Propio de cada organización** (todas las tablas con `organizacion_id` y FK compuestas `(organizacion_id, x_id)`):
  - `organizacion` y `parametros_calculo` (NULL = no definido);
  - `insumo` y `conversion`;
  - `proveedor`, `producto` y `precio` (exclusión de vigencias solapadas, `btree_gist`);
  - `tarifa_mano_obra`;
  - `concepto` y `componente`;
  - `tipo_adicional`.
- **Precisión:**
  - dinero `NUMERIC(18,6)`;
  - cantidades `NUMERIC(20,6)`;
  - factores `NUMERIC(20,10)`;
  - fracciones `NUMERIC(7,6)`;
  - traslape `NUMERIC(9,6)`.
- **Vigencias:** `DATE`.

Detalle en ADR-0004 y en [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) §4.

**Migración `20261003014159_autenticacion` (módulo 5, ADR-0007):**
- `usuario`: global, con correo normalizado y único y `CHECK` de hash Argon2id;
- `membresia`: única por (`organizacion_id`, `usuario_id`), con `CHECK` de funciones;
- `sesion`: `token_hash` de 32 bytes, FK compuesta a `membresia` y `CHECK` de coherencia.

Permisos de `softarq_app`: solo `SELECT` en `usuario` y `membresia`; en `sesion`, `SELECT` e `INSERT` y `UPDATE` solo de `ultima_actividad_en`, `revocada_en` y `motivo_revocacion`. Sin DELETE. Aplicada en `softarq_dev` el 02/10/2026 con `db:migrar`.

**Migración `20261003160000_revisiones` (módulo 7, ADR-0009):**
- tablas `revision` y `revision_evento`; UNIQUE nuevos en `cotizacion` (organización, id, folio) y `cotizacion_version` (organización, cotización, número, id) como destino de las FK;
- CHECK (estados, resolución, observaciones, BL-17), índice único parcial `revision_pendiente_unica`, triggers `revision_transicion_trg` y `revision_evento_inmutable_trg`;
- funciones `softarq_exigir_funcion`, `softarq_enviar_revision`, `softarq_decidir_revision` y `softarq_retirar_revision`; `softarq_guardar_borrador` y `softarq_crear_version` reemplazadas (misma firma) para BL-19;
- `softarq_app`: `revision` SELECT/INSERT y UPDATE solo de `estado`, `revision`, `resuelta_por`, `resuelta_en` y `observaciones`; `revision_evento` SELECT/INSERT; sin DELETE.

Aplicada en `softarq_test` (cada corrida de integración) y en `softarq_dev` el 03/10/2026 con `db:migrar` (rol migrador).

**Migración `20261003200000_emision` (módulo 8, ADR-0010):**
- **Tablas y columnas:**
  - tablas `emision` (inmutable) y `emisor`;
  - contacto del cliente (`contacto_*`) y descarte de la cotización (`descartada_*`, `motivo_descarte`);
  - UNIQUE nuevo en `revision` (organización, id, versión);
  - evento `APROBACION_ANULADA`, con un índice único parcial.
- **Triggers:** `emision_inmutable_trg`, `emision_validar_trg`, `revision_evento_validar_trg` y `cotizacion_transicion_trg`.
- **Funciones nuevas:** `softarq_exigir_emisor`, `softarq_emitir_version`, `softarq_anular_aprobacion`, `softarq_descartar_cotizacion` y `softarq_guardar_emisor`.
- **Funciones reemplazadas:** `softarq_crear_cliente` (la firma anterior se elimina), `softarq_editar_cliente`, `softarq_guardar_borrador`, `softarq_crear_version` y `softarq_enviar_revision`.
- **Permisos de `softarq_app`:**
  - `emision`: SELECT e INSERT;
  - `emisor`: SELECT, INSERT y UPDATE de sus columnas;
  - columnas de descarte y de contacto;
  - sin DELETE.

Aplicada en `softarq_dev` el 03/10/2026 con `db:migrar`. `db:cargar-demo` creó el emisor DEMO y `db:cargar-usuarios-demo` creó `administrador.demo@softarq.test`.

**Migración `20261005150000_respuestas_cliente` (módulo 9, ADR-0013):** tabla `respuesta_cliente_evento` (solo alta) y `softarq_registrar_respuesta`; detalle en §18.

**Migración `20261005165028_excepciones` (módulo 10, ADR-0014):**
- tabla `excepcion_decision` (FK compuestas a `revision(org, id, version)` y `membresia`; UNIQUE por organización, versión y número; CHECK de decisión, número, comentario, nombre y BL-17);
- disparadores `excepcion_decision_inmutable_trg` y `excepcion_decision_validar_trg`;
- función `softarq_decidir_excepcion`; `softarq_decidir_revision` reemplazada (misma firma: rechaza APROBAR con excepciones sin autorizar); `idempotencia_recurso_ck` con `excepcion`;
- `softarq_app`: SELECT e INSERT y EXECUTE de la función; sin UPDATE, DELETE ni DDL. Bloque condicional en `permisos-app.sql`.

Aplicada en `softarq_test` (cada corrida) y en `softarq_dev` el 05/10/2026 con `db:migrar`, después de un respaldo verificado.

**Migración `20261017120000_administracion_catalogos` (módulo 11, ADR-0015):**
- **Columnas:** contacto, revisión y autoría del proveedor; revisión y autoría del producto; registro, anulación y revisión del precio; subcontratista, revisión y autoría de la tarifa. Las FK son compuestas, con `map:`.
- **Restricciones e índices:** índices únicos normalizados (`softarq_normalizar`, copia de `Normalizar`); CHECK de textos, correo y anulación; `contador_entidad_ck`, `bitacora_entidad_ck` e `idempotencia_recurso_ck` ampliados.
- **Disparadores:** `producto_proteger_trg`, `precio_bloquear_producto_trg`, `precio_proteger_trg` y `tarifa_proteger_trg`.
- **Funciones:** once `softarq_*` de administración y `softarq_codigo_catalogo`, todas SECURITY INVOKER; cada una exige `ADMIN_CATALOGO`.
- **`softarq_app`:** UPDATE solo de columnas editables y EXECUTE de las funciones (bloque condicional en `permisos-app.sql`). Sin DELETE ni DDL.

Aplicada en `softarq_test` (cada corrida) y en `softarq_dev` el 17/10/2026, después del respaldo verificado `softarq_dev-20261017T142723Z-2d938d`.

**Recursos de PostgreSQL creados (02/10/2026):**

| Recurso | Características |
|---|---|
| Rol `softarq_migrator` | LOGIN; sin SUPERUSER, CREATEDB, CREATEROLE ni BYPASSRLS; propietario de las 3 bases |
| Rol `softarq_app` | LOGIN; sin privilegios especiales; `SELECT/INSERT/UPDATE` en catálogos y solo `SELECT` en `unidad`; sin DELETE, TRUNCATE, CREATE ni acceso a `_prisma_migrations` o `softarq_shadow` |
| Base `softarq_dev` | Migrada; catálogo DEMO cargado |
| Base `softarq_test` | Las pruebas de integración la vacían y migran |
| Base `softarq_shadow` | Base sombra de `migrate dev` |

Credenciales: `apps/api/.env` y `.env.test` (locales, excluidos de Git). La credencial administrativa usada (`_work\secrets\postgres-admin.dpapi`) se **eliminó** al terminar.

## 4. Tareas terminadas

| Fecha | Tarea | Resultado |
|---|---|---|
| 02/10/2026 | Inspección de la fase 1, entorno, estructura y reglas | Commit `e375fce` |
| 02/10/2026 | Módulo 1: motor de cálculo | Commit `f0a34da` (163 pruebas) |
| 02/10/2026 | Módulo 2: esquema, migración, scripts de base de datos, repositorio, ensamblador, carga DEMO, pruebas, ADR-0004 | Ver §5 y §8 |
| 02/10/2026 | Aprovisionamiento y verificación contra PostgreSQL real | Commit `2543baa` |
| 02/10/2026 | Skills del proyecto (ui-ux-pro-max, caveman, grill-me + grilling) para Claude Code y Codex, con reglas de uso | Commit `fdcc8f4`; ver §9 |
| 02/10/2026 | Módulo 3: API HTTP local (NestJS 12, contratos Zod, catálogos, cálculo DEMO, errores, transporte, OpenAPI, ADR-0005) | Commit `185fd26` |
| 02/10/2026 | Módulo 4: cliente web DEMO (React + Vite), sistema visual, pruebas de componentes y de navegador, ADR-0006 | Commit `84f9218` |
| 02/10/2026 | Módulo 5: usuarios DEMO, sesiones, CSRF, permisos y aislamiento por organización; pantalla de acceso; ADR-0007; conflicto de la skill identificado, con alternativa comprobada (no resuelto) | Commit `ff6da0d` |
| 03/10/2026 | Módulo 6: clientes, proyectos y cotizaciones con folio, borrador, versiones inmutables, concurrencia, idempotencia e historial; web integrada; ADR-0008 | Commit `26ce1a5` |
| 03/10/2026 | Corrección del borrador (selecciones no disponibles conservadas) y registro de la revisión personal del propietario | Commit `97e69d5` |
| 03/10/2026 | Módulo 7: revisión y aprobación por un revisor distinto del preparador; ADR-0009 | Commit `b58ed43` |
| 03/10/2026 | Módulo 8: emisión de versiones aprobadas, PDF DEMO, anulación de aprobación, descarte, contacto del cliente, emisor y textos por versión; ayudante UTF-8 para pruebas por HTTP; ADR-0010 | Commit `da4a1ff` |
| 04/10/2026 | Grafo de código local con Graphify (solo AST) para Claude Code y Codex: exclusiones, script de vigencia y actualización, hooks, rutina en `AGENTS.md` §12, ADR-0011 | Commit `3c352b6` |
| 04/10/2026 | Respaldo y recuperación local: rol `softarq_respaldo`, base aislada `softarq_restauracion`, scripts `respaldo:*`, prueba completa 30/30, ADR-0012 | Ver §17 y §8 |
| 05/10/2026 | Módulo 9: respuesta interna por emisión, vigencia y correcciones con historial; ADR-0013; respaldo/restauración de eventos y concurrencia real | 571 unitarias, 238 integración, 51 E2E, 35 restauración y 15 concurrencia; ver §18 y §8 |
| 05/10/2026 | Graphify recuperado (diagnóstico de PATH del entorno restringido) | Commit `abe655d`; grafo VIGENTE |
| 05/10/2026 | Corrección del módulo 9: 403 en lugar de 500 cuando la base rechaza la función | Commit `3412f0b` (regresión en integración) |
| 05/10/2026 | Módulo 10: excepciones B-22, ADR-0014, deriva de `schema.prisma` corregida, matriz de cobertura | 604 unitarias, 252 integración, 53 E2E, 38 restauración, 17 concurrencia; ver §19 |
| 17/10/2026 | Módulo 11: administración de proveedores, productos, precios y tarifas; ADR-0015 | 641 unitarias, 271 integración, 56 E2E, 43 restauración; ver §20 |
| 17/10/2026 | Módulo 12: catálogo técnico y aprobación de conceptos; ADR-0016 | 667 unitarias, 292 integración, 59 E2E, 47 restauración; ver §21 |
| 17/10/2026 | Correcciones previas al módulo 13 (commit `b3b785d`) y módulo 13: parámetros y personas; ADR-0017 | Ver §22 |

## 5. Comandos y resultados reales (02/10/2026)

**Preparación desde cero:** [`apps/api/README.md`](apps/api/README.md#preparar-el-entorno-desde-cero).

| Comando | Resultado |
|---|---|
| `aprovisionar.ps1 -SoloDiagnostico`, antes | 0 roles y 0 bases del proyecto: el `28P01` anterior era por roles inexistentes |
| `aprovisionar.ps1 -ArchivoCredencial …` | 2 roles y 3 bases creados; esquemas y permisos aplicados; código de salida 0 |
| `node scripts/db/comprobar-conexion.mjs` | 5/5 conexiones OK, ninguna con privilegios especiales; `softarq_app` → `softarq_shadow` rechazado (`42501`) |
| `pnpm --filter @softarq/api db:migrar` | Migración `20261002000000_catalogos` aplicada en `softarq_dev`; `migrate status`: «Database schema is up to date!» |
| Privilegios efectivos de `softarq_app` en dev | S/I/U en las 11 tablas de catálogo, solo S en `unidad`; sin DELETE, TRUNCATE ni CREATE; `_prisma_migrations` no visible |
| `pnpm --filter @softarq/api db:cargar-demo`, 1.ª vez | 71 registros creados; los valores coinciden con los esperados |
| `pnpm --filter @softarq/api db:cargar-demo`, 2.ª vez | 0 creados y 71 conservados (idempotente) |
| `pnpm verificar:integracion`, 2 corridas | **3 archivos, 46/46 pruebas aprobadas** en `softarq_test` |
| Causa de los rechazos en la base (comprobada) | `23514` (CHECK desperdicio), `23P01` (solape de precios), `23503` (FK entre organizaciones), `42501` (DELETE) |
| `migrar.mjs --test` y `globalSetup` con una URL de `softarq_dev` | Ambos rechazan el destino («solo se permite: softarq_test»); `softarq_dev` intacta después |
| `pnpm verificar` | Build, typecheck y **200/200 pruebas unitarias** (163 del motor, 28 del adaptador y 9 de protección de destino) |
| MD5 del libro oficial | `b60debc121957b8d8e3f2c2edd9a5b4f`, sin cambios |

**Módulo 3 (API HTTP):**

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | Al día; la instalación de Nest 12.1.2, throttler 6.7.1, Helmet 8.3.0, Express 5.2.1 y Zod 4.6.5 no añadió excepciones ni scripts de instalación |
| `pnpm verificar` | Build (contracts y api), typecheck y **275/275 pruebas unitarias** (200 anteriores y 75 nuevas: entorno, esquemas, errores, OpenAPI y ejemplos) |
| `pnpm verificar:integracion` | **4 archivos, 94/94** en `softarq_test` (46 anteriores y 48 HTTP). También con los archivos en orden aleatorio (`--sequence.shuffle.files`, semillas 7 y 1234): 94/94 |
| `node dist/main.js` con `API_HOST=0.0.0.0`, con `API_CORS_ORIGINS=*` o con la URL del migrador | El arranque falla con código 1 y un mensaje claro, sin valores secretos |
| `node dist/main.js` contra `softarq_dev` y `curl` de los 4 ejemplos de `docs/api/ejemplos` | 54190.68, 43312.16, 22405.28 y 4911.79; `netstat`: escucha solo en `127.0.0.1:3000`; el preflight desde `http://localhost:5173` permitido |
| SIGINT al servidor compilado (simulado en el mismo proceso, porque Windows no envía SIGINT entre procesos) | «Conexiones con PostgreSQL cerradas (SIGINT)»; puerto liberado |
| MD5 del libro oficial | Sin cambios |

**Módulo 4 (web DEMO).** Todas las comprobaciones son **automatizadas**; la prueba en persona sigue pendiente (ver [`docs/web/guia-prueba-manual.md`](docs/web/guia-prueba-manual.md)).

| Comando | Resultado |
|---|---|
| `pnpm install` | React 19.3.0, Vite 8.3.2, plugin-react 6.1.1, Zod 4.6.5, Fira 5.3.0, Vitest 5.0.3 + jsdom 30.1.1, Testing Library y Playwright 1.63.0; sin excepciones de antigüedad ni scripts de instalación nuevos |
| `pnpm verificar` | Build (contracts, api y web), typecheck y **374/374 pruebas unitarias**: 275 de la API (sin cambios) y 99 de la web (8 archivos: formato es-MX sin `number`, configuración, ejemplos frente a `docs/api/ejemplos`, contraste de tokens, reducer, solicitud y huella, cliente HTTP, componentes, ausencia de claves internas) |
| `pnpm verificar:integracion` | **94/94** en `softarq_test` (sin cambios tras mover `DIMENSIONES_POR_FORMULA`) |
| `pnpm verificar:e2e` (2 corridas completas) | **21/21** en Edge 154, con 1 worker: web compilada en `127.0.0.1:4173` y API real en `127.0.0.1:3101` sobre `softarq_test`, fecha fija 2026-09-25 |
| Recorrido en desarrollo: API compilada con `softarq_dev` y `vite` en 5173 | Ejemplo 1 = $54,190.68 con la fecha real; sin errores de consola; `netstat`: solo `127.0.0.1:5173` y `127.0.0.1:3000`. Un segundo `vite` falla con «Port 5173 is already in use» (`strictPort`); `VITE_API_URL=http://192.168.1.5:3000` hace fallar la compilación |
| Revisión del bundle (`dist/assets/*.js`) | Sin claves internas (consumo, rendimiento, desperdicio, margen, recargo, tarifa) ni URL de CDN; «costo» aparece solo en los textos de «costo adicional» |
| MD5 del libro oficial | Sin cambios |

Las 21 pruebas de navegador comprueban:
- **los 4 ejemplos:** $54,190.68, $43,312.16, $22,405.28 y $4,911.79;
- **cambios:** modificar una medida deja el resultado pendiente y sin importes, y al recalcular cambia el total (volver a 10 da otra vez $54,190.68);
- **captura propia:** búsqueda sin resultados, captura incompleta, opciones sin preselección, agregar y quitar renglones, conceptos y adicionales; termina en $4,911.79;
- **bloqueos reales sin importes:** BL-11 (monto 0), BL-08 (proveedor desactivado en la base) y BL-13 (impuesto vacío y luego restaurado);
- **opciones que dejan de estar disponibles:** la de un ejemplo se avisa y se elige otra; tras un BL-08, «Actualizar opciones disponibles» marca la que ya no vale;
- **robustez:** piezas 1.5 rechazadas junto al campo; doble clic y Enter dan un solo POST; red caída y «Reintentar»; 503 y 429 con mensaje humano; respuesta incompatible sin mostrar; respuestas atrasadas de cálculo y de búsqueda descartadas;
- **accesibilidad:** teclado completo con foco visible, objetivos de 44 px o más y movimiento reducido;
- **pantalla de 390 px:** sin desbordes.

**Evidencias visuales** (fuera de Git): `D:\Proyecto_SoftArq\_work\evidencias\modulo4\`, con capturas `escritorio-*` (1440 × 900), `movil-*` (390 × 844) y `desarrollo-ejemplo1-softarq_dev.png`. Se revisaron una por una. Defectos encontrados y corregidos:
- selects recortados;
- campos numéricos de 41 px;
- la tabla de detalle ensanchaba el panel y recortaba el total (ahora se apila con una *container query*);
- el aviso de opción no disponible quedaba bajo el pliegue (ahora también se resume en la cabecera).

**Módulo 5 (usuarios, sesiones y permisos).** Todo automatizado y ejecutado en secuencia: integración y E2E usan `softarq_test`, nunca a la vez.

| Comando | Resultado |
|---|---|
| `pnpm install` | `@node-rs/argon2` 2.2.1 (sin script de instalación; `allowBuilds` sin cambios), `cookie` 0.7.2 (ya en el lockfile) y `@types/cookie` 0.6.0 |
| Medición de Argon2id en este equipo (20 operaciones) | m = 64 MiB, t = 3, p = 4: mediana de 56 ms por hash o verificación; 109 ms con dos simultáneas; RSS de 54 a 248 MiB (detalle en ADR-0007 §3) |
| `pnpm verificar` | Build, typecheck y **419/419 pruebas unitarias**: 297 de la API (275 anteriores y 22 nuevas: 18 de autenticación y 4 de configuración y OpenAPI) y 122 de la web (99 anteriores y 23 nuevas: sesión, cliente con CSRF y generación, URL `localhost`, contraste) |
| `pnpm verificar:integracion` (dos corridas, antes y después de cambiar a transacciones por lotes) | **147/147** en `softarq_test`. Nuevos: `autenticacion.integracion.test.ts` y `aislamiento.integracion.test.ts`, y permisos de identidad en `migraciones`. Las pruebas HTTP anteriores inician sesión como Preparador de `DEMO-HTTP` |
| `pnpm verificar:e2e` | Primera corrida: 24/27, por transacciones interactivas de Prisma que superaban 5 s (`COMMIT` lentos por `WalWrite`, diagnosticados con `pg_stat_activity`) y por un selector de cookie mal escrito en la prueba. Tras corregir: **27/27 en dos corridas completas seguidas** (3.3 y 1.8 min; 21 anteriores, que ahora inician sesión, y 6 nuevas de sesión), Edge con 1 worker y sin errores del servidor |
| Recorrido en desarrollo (`softarq_dev`, API en `127.0.0.1:3200` y Vite en `5273`, porque `3000` y `5173` estaban ocupados por servidores del propietario) | Acceso del Preparador con el archivo local de accesos; Ejemplo 1 = $54,190.68; cookie `HttpOnly`, `Strict`, `/api/v1`, host `localhost`; tras cerrar, la cookie anterior recibe 401; tráfico solo a `localhost:5273` y `localhost:3200`. Único error de consola: el 401 esperado de la comprobación inicial de sesión sin sesión |
| Flujo `curl` documentado en `docs/api/README.md` (API temporal en 3200) | `csrf` → acceso → 5 conceptos → total 54190.68 → `DELETE` 204 → 401 |
| `db:migrar` en `softarq_dev` | Migración `20261003014159_autenticacion` aplicada, con permisos |
| `db:cargar-usuarios-demo`, dos veces | 1.ª: 2 cuentas creadas. 2.ª: 2 conservadas sin cambios (idempotente, sin cambiar contraseñas) |
| `db:purgar-sesiones -- --test` | Ejecutado sin errores con el rol migrador |
| Revisión de secretos | 0 coincidencias de las contraseñas DEMO o E2E ni de las de PostgreSQL en 365 archivos del repositorio; bundle sin contraseñas, `localStorage`, `sessionStorage` ni CDN |
| MD5 del libro oficial | `b60debc121957b8d8e3f2c2edd9a5b4f`, sin cambios |

Las 27 pruebas de navegador comprueban, además de lo del módulo 4:
- **flujo completo:** acceso incorrecto con mensaje genérico, acceso correcto, atributos de la cookie, cálculo de $54,190.68 y cierre. Después, sin cookie y con la cookie anterior, catálogos, sesión y cálculo responden 401;
- **restauración** al recargar la página;
- **Revisor:** «Calcular» deshabilitado con el motivo, y la solicitud directa con su sesión y su CSRF recibe 403 `SIN_PERMISO`;
- **sesión revocada en la base durante el uso:** aparece «Su sesión terminó» y la captura se descarta;
- **respuesta tardía de la sesión anterior** tras cerrar y entrar con otro usuario: no reaparece;
- **pantalla de 390 px** con la pantalla de acceso y la barra de sesión, sin desbordes.

**Evidencias visuales del módulo 5** (fuera de Git): `D:\Proyecto_SoftArq\_work\evidencias\modulo5\`:
- `escritorio-01…07`: acceso, error, sesión iniciada, cálculo, sesión cerrada, Revisor y sesión vencida;
- `movil-01…02`;
- `desarrollo-ejemplo1-softarq_dev.png`.

Se revisaron una por una. Defecto corregido: el botón «Mostrar/Ocultar» tenía un nombre accesible ambiguo; ahora es «Mostrar contraseña» u «Ocultar contraseña».

**Registros:** `D:\Proyecto_SoftArq\_work\registros\modulo5\`.

**Módulo 6 (clientes, proyectos y cotizaciones).** Automatizado y ejecutado en secuencia; integración y E2E usan `softarq_test`, nunca a la vez. Registros en `D:\Proyecto_SoftArq\_work\registros\modulo6\`.

| Comando | Resultado |
|---|---|
| `db:nueva-migracion cotizaciones` | Migración `20261003062244_cotizaciones` generada contra la base sombra y completada a mano (CHECK, trigger y funciones). Un defecto propio (`TEXT[] \|\| 'literal'`) apareció en la primera corrida de integración y se corrigió con `array_append` antes de aplicarla en desarrollo |
| `pnpm verificar` | **470/470**: 318 de la API (297 anteriores y 21 nuevas: 19 del dominio de cotizaciones, 1 de OpenAPI y 1 del ejemplo de borrador) y 152 de la web (122 anteriores y 30 nuevas: 15 de la revisión automática «sin datos internos» de los archivos nuevos, 9 de cotizaciones, 2 del cliente HTTP y 4 de contraste) |
| `pnpm verificar:integracion` | **171/171** (147 anteriores y 24 nuevas: 12 de `cotizaciones`, 9 de `concurrencia-cotizaciones` y 3 de permisos en `migraciones`). Primera corrida del archivo nuevo: 11/12 por el defecto de la migración citado arriba |
| Tiempos reales de «guardar versión» (integración) | Fase A (lectura + cálculo): p50 49–82 ms, p95 115–182 ms; fase B (sentencia de escritura): p50 4–5 ms, p95 11–15 ms. Sin errores de tiempo (ADR-0008 §6) |
| `pnpm verificar:e2e` | Primera corrida: 9 anteriores en verde y 2 nuevas fallidas: una comprobación mal escrita en la prueba («Faldón norte» es el valor de un campo) y un **defecto real**: la calculadora quedaba montada y oculta y repetía los `id` de los campos del editor. Corregido (el estado de la calculadora vive en la aplicación y su vista se desmonta). Después, dos selectores ambiguos en la prueba nueva. Final: **35/35** (27 anteriores sin cambios y 8 nuevas), Edge con 1 worker, 1.8 min |
| Segunda ronda completa, en secuencia y tras las correcciones visuales | `pnpm verificar` 470/470 · `pnpm verificar:integracion` 171/171 · `pnpm verificar:e2e` 35/35 (1.8 min) |
| Revisión de secretos | 0 coincidencias de las 9 contraseñas locales (DEMO, E2E y PostgreSQL) en 414 archivos del repositorio y del bundle E2E; las únicas cadenas `postgresql://` son variables o valores ficticios de pruebas y scripts anteriores; el bundle no usa `localStorage` ni `sessionStorage` |
| Prueba de humo en `softarq_dev` (API temporal en `127.0.0.1:3200`) | `db:migrar` aplicó la migración; flujo `curl` de `docs/api/README.md`: cliente → proyecto → `COT-2026-00002` → v1 = 54190.68 → reintento con la misma clave `Idempotent-Replayed: true` y 1 versión → cierre 204 → 401 |
| Recorrido visual en `softarq_dev` (web temporal en 5273) | Acceso con el archivo local, editor y v1 = $54,190.68; tráfico solo a `localhost`; único error de consola: el 401 esperado de la comprobación inicial de sesión. Capturas `desarrollo-cotizacion-softarq_dev.png` y `desarrollo-version-softarq_dev.png` |
| MD5 del libro oficial | `b60debc121957b8d8e3f2c2edd9a5b4f`, sin cambios |

**Hallazgos de la revisión visual (corregidos):**
- la tabla de versiones se recortaba en la columna lateral del editor; ahora se muestra como tarjetas;
- los botones de la cabecera del editor quedaban pegados;
- la primera cotización de humo (`COT-2026-00001` en `softarq_dev`) quedó con acentos dañados porque el `curl` pasaba el JSON como argumento en Git Bash (Windows lo recodifica). La documentación usa ahora `--data-binary @archivo` (verificado con `COT-2026-00002`). Esa cotización y su v1 son datos DEMO de prueba y no se pueden borrar ni corregir (versiones inmutables, sin DELETE).

**Las 8 pruebas de navegador nuevas** (automatizadas; no son la prueba en persona): recorrido calculadora → cliente, proyecto y folio → recarga → v1 → edición → v2 con v1 intacta; borrador incompleto guardado y recuperado sin versión; dos pestañas con conflicto, comparación y recarga; respuesta perdida con reintento de la misma clave; CSRF caducado con un solo reintento; Revisor en solo lectura y 403 directo; aviso de cambios sin guardar y limpieza al cerrar sesión; pantalla de 390 px sin desbordes.

**Evidencias visuales del módulo 6** (fuera de Git): `D:\Proyecto_SoftArq\_work\evidencias\modulo6\` (`escritorio-01…08`, `movil-01…03` y las dos de desarrollo). Revisadas.

**Prueba intermitente corregida (módulo 5):** `autenticacion.test.ts` alteraba el último carácter del token CSRF, que en base64url de 32 bytes solo lleva 4 bits de datos; a veces el token alterado decodificaba igual. Ahora altera el primero; la expectativa no cambió (ADR-0008, «Cambios en pruebas existentes»).

**Corrección del borrador (03/10/2026).** Automatizado y ejecutado en secuencia; registros en `D:\Proyecto_SoftArq\_work\registros\modulo7\`.

| Comando | Resultado |
|---|---|
| Reproducción antes del cambio (`conservar-seleccion.test.ts`) | 5 de 6 fallaban con el código del módulo 6. La prueba sin datos nuevos del servidor confirma la pérdida: la selección del concepto no disponible no llegaba al borrador guardado (`01-reproduccion-antes.log`) |
| `pnpm verificar` | **481/481**: 323 de la API (318 + 5 de `referencias.test.ts`) y 158 de la web (152 + 6 de conservación; 1 prueba anterior cambiada a propósito, ADR-0008). Primera corrida: solo falló la alineación de OpenAPI, que se regeneró |
| `pnpm verificar:integracion` | **173/173** (171 + 2 con el catálogo real de `softarq_test`: concepto en Borrador y precio anulado → guardar otra partida, recargar y recuperar sin perder selecciones; v1 intacta; referencias nuevas inválidas → 422). En la primera corrida falló 1 prueba nueva por una expectativa equivocada mía: la completitud no depende del catálogo. Ahora comprueba el bloqueo real con BL-04 y BL-08 |
| `pnpm verificar:e2e` | **36/36** (35 + 1: concepto no disponible y opción no disponible conservados tras guardar y recargar; «Quitar selección» y elegir otra solo por decisión del usuario), Edge con 1 worker, 2.1 min |
| Revisión de capturas (`_work/evidencias/modulo7/escritorio-00a/00b`) | Correcto. Defecto de texto corregido: paréntesis anidados en el aviso del concepto no disponible |
| Defecto detectado después (corregido en el commit del módulo 7) | La web clasificaba el 422 `REFERENCIA_NO_DISPONIBLE` como «respuesta incompatible». Ahora muestra los campos marcados |

**Módulo 7 (revisión y aprobación).** Automatizado y ejecutado en secuencia; integración y E2E usan `softarq_test`, nunca a la vez. Registros en `D:\Proyecto_SoftArq\_work\registros\modulo7\` (`05-…` a `13-…`).

| Comando | Resultado |
|---|---|
| Generación de la migración | `migrate dev --create-only` se negó sin terminal por los avisos de índices únicos; el SQL se generó con `prisma migrate diff --from-migrations --to-schema --script` (base sombra) y se completó a mano |
| `revisiones.integracion.test.ts`, primera corrida | 6/14: los 8 fallos tenían una sola causa, mía: Nest respondía 201 en `decision` y `retiro` (se documentó 200). Se añadió `@HttpCode(200)`. Después, 14/14 |
| `concurrencia-revisiones.integracion.test.ts` | 7/7 a la primera, incluida una prueba sin la API: una retirada sin confirmar bloquea la aprobación, que falla con `CONFLICTO_REVISION` al confirmarse la retirada |
| `pnpm verificar:integracion`, primera corrida completa | 191/194. Tres pruebas anteriores, cambiadas a propósito (ADR-0009, «Cambios en pruebas existentes»): capacidades del Preparador, inventario de funciones y `esUltima` derivado de v1 tras crear v2 (la fila de la versión sigue idéntica) |
| `pnpm verificar` (final) | **500/500**: 333 de la API (323 + 10 de `verificacion.test.ts` y OpenAPI) y 167 de la web (158 + 7 de `revisiones.test.tsx`, 1 de respuestas fuera de orden en el editor y 1 de la revisión automática de archivos nuevos) |
| `pnpm verificar:integracion` (final) | **195/195** (173 + 14 de `revisiones` + 7 de `concurrencia-revisiones` + 1 de permisos de `revision`) |
| `pnpm verificar:e2e` | Primera corrida: 39/41. (1) Reescribí un subtítulo que una prueba anterior comprueba; ahora conserva el texto original y solo retira «ni aprobarla». (2) Mi ayudante de la prueba no volvía la calculadora al inicio. Una corrida parcial mostró además un **fallo intermitente real** de la prueba del módulo 6: dos consultas del detalle en vuelo y la más antigua borraba v2 de la tabla. Corregido (solo se aplica la última), con prueba unitaria que falla sin la corrección. Final: **41/41 en dos corridas completas seguidas** (2.6 y 2.7 min; 36 anteriores + 5 nuevas), Edge con 1 worker |
| Humo en `softarq_dev` (API temporal en `127.0.0.1:3200`; 3000, 5173, 3200 y 5273 estaban libres) | `db:migrar` aplicó la migración. Flujo con dos sesiones: `COT-2026-00003` → v1 = 54190.68 → envío (201) → mismo envío con la misma clave `Idempotent-Replayed: true` → guardar en revisión 409 → el Preparador decide 403 → bandeja `COT-2026-00003-v1 PENDIENTE` → verificación sin bloqueos, aviso AV-03 → aprobación por [DEMO] Revisor 1, total 54190.68 → v1 `APROBADA` → cierres 204. API detenida al terminar |
| Revisión de secretos | 0 coincidencias de las 7 contraseñas locales (DEMO, E2E y PostgreSQL) en 416 archivos del repositorio y en el bundle |
| MD5 del libro oficial | `b60debc121957b8d8e3f2c2edd9a5b4f`, sin cambios |

**Incidencia propia en la prueba de humo:** pasé el nombre del cliente y del proyecto con acento como argumento de `curl` en Git Bash, justo lo que `docs/api/README.md` advierte. `CLI-00003` y `PRY-00003` quedaron con U+FFFD; se corrigieron con `PATCH` y cuerpos UTF-8 (comprobado: U+00F3). La v1 de `COT-2026-00003` conserva la copia dañada del nombre en su instantánea, que es inmutable por diseño. Es un dato DEMO de prueba, como `COT-2026-00001`. El script (`_work/tmp/m7/humo-revision.sh`) ya usa archivos.

**Las 5 pruebas de navegador nuevas** (automatizadas; acceso con el formulario normal y un contexto por persona):
- recorrido completo: cambios sin guardar y borrador sin calcular impiden enviar → v2 → envío con confirmación de folio, versión y total → solo lectura → el Revisor solicita cambios → v3 → envío → aprobación → estado exacto de v1, v2 y v3;
- BL-17 con una cuenta E2E que es Preparador y Revisor: sin «Aprobar…», motivo visible y 422 en el intento directo; después aprueba otra persona;
- pantalla obsoleta: otra persona aprueba antes; el 409 conserva las observaciones y «Actualizar» muestra la aprobación;
- respuesta atrasada de otra revisión descartada;
- 390 px sin desbordes (cotización en revisión, bandeja, detalle y retirada).

**Evidencias visuales del módulo 7** (fuera de Git): `D:\Proyecto_SoftArq\_work\evidencias\modulo7\` (`escritorio-00a…09`, `movil-10…12`). Revisadas una por una. Defecto corregido: los botones «Actualizar» y «Retirar la revisión para corregir…» se estiraban a todo el ancho del aviso.

**Módulo 8 (emisión, PDF, anulación y descarte).** Automatizado y ejecutado en secuencia; integración y E2E usan `softarq_test` y carpetas de documentos exclusivas en `_work\pruebas`, nunca a la vez. Registros en `D:\Proyecto_SoftArq\_work\registros\modulo8\` (`01-…` a `22-…`).

| Comando | Resultado |
|---|---|
| Dependencias | PDFKit 0.20.2 (MIT); devDependencies `@types/pdfkit` 0.17.6 y `pdfjs-dist` 6.3.289 (con su lienzo opcional `@napi-rs/canvas`, para extraer y renderizar los PDF en pruebas). Sin scripts de instalación nuevos |
| Migración | Generada con `prisma migrate diff` (base sombra) y completada a mano; aplicada sin errores en `softarq_test` y en `softarq_dev` |
| `pnpm verificar` (dos corridas) | **535/535**: 356 de la API (333 + 23: 6 del PDF, 15 de reglas de emisión, textos y almacén, y 2 de configuración y matriz) y 179 de la web (167 + 12: 10 de emisión, textos, descarga y descarte, 1 de anulación y 1 de la revisión automática de archivos nuevos) |
| `pnpm verificar:integracion` | Primera corrida: 225/226. Fallo **de aislamiento en mi prueba**: la revisión de documentos de `concurrencia-emision` contaba las emisiones de otra organización cuyos archivos había vaciado la carpeta compartida. Ahora se limita a su organización. Después, **226/226 en dos corridas completas** (195 + 19 de `emision` + 12 de `concurrencia-emision`). Tres archivos anteriores cambiaron a propósito (ADR-0010, «Cambios en pruebas existentes») |
| `pnpm verificar:e2e` | Primera corrida completa: 46/47, porque una prueba nueva buscaba un texto que retiré por duplicado (corregida a la frase real). Después, **47/47 en dos corridas completas seguidas** (3.1 y 3.0 min; 41 anteriores + 6 nuevas), Edge con 1 worker |
| Archivo de emisión aislado, antes de la suite | 19/19 a la segunda. En la primera, 8 fallos de la propia prueba: el límite de accesos por IP (30) y una búsqueda de precios internos por subcadena (`13.9` dentro de otros números) |
| `concurrencia-emision` | 12/12. La prueba de bloqueo en la base falló hasta comprobar la espera con el rol de la aplicación: el migrador no ve el texto de las consultas de otro rol en `pg_stat_activity` |
| PDF, texto extraído (pdfjs-dist en pruebas; `pdftotext` en la revisión) | Folio, versión, «WEB DEMO», fechas, acentos y ñ, m² y m³, totales, textos, leyenda técnica, «Preparó · Aprobó · Emitió», «DEMOSTRACIÓN» y «Página X de Y» en cada página. Ningún costo, proveedor, consumo, margen, recargo, credencial ni ruta. Metadatos sin autor ni título; sin adjuntos ni JavaScript |
| Cuatro totales de referencia | Emitidos y leídos del PDF: $54,190.68, $43,312.16, $22,405.28 y $4,911.79 |
| Humo en `softarq_dev` (API temporal en 3200, detenida al terminar) | Ver el detalle debajo de esta tabla |
| `documentos:revisar` en `softarq_dev` | 1/1 emisión con archivo correcto; 0 temporales, sin registro, ausentes o dañados |
| Revisión de secretos | 0 coincidencias de las 9 contraseñas locales (DEMO, E2E y PostgreSQL) en 455 archivos del repositorio y del bundle E2E |
| MD5 del libro y del logotipo original | `b60debc121957b8d8e3f2c2edd9a5b4f` y `8a21af4706c36c2639d985d53ae721fd` (la copia en `apps/api/recursos/pdf` es idéntica), sin cambios |

**Detalle de la prueba de humo en `softarq_dev`:**
- se aplicó la migración y se cargaron el emisor y el administrador;
- la comprobación de acentos con `scripts/http/api-json.mjs` fue correcta (creó el cliente de comprobación `[DEMO] Prueba de acentos…`, `CLI-00004`);
- `COT-2026-00001/00002/00003` quedan sin cambios y bloqueadas con BL-20 (sin textos), BL-01 y BL-02;
- se creó `COT-2026-00004` («[DEMO] humo módulo 8»):
  - v1 = 54190.68;
  - envío y aprobación por `[DEMO] Revisor 1`;
  - validación sin bloqueos (AV-03), con fecha de emisión 2026-10-03 y vigencia hasta 2026-10-18;
  - emisión 201;
  - el reintento con la misma clave respondió `Idempotent-Replayed: true` con la misma emisión;
  - la descarga dio 24 178 bytes, con el SHA-256 y el `Repr-Digest` iguales al registro.

**Revisión visual:**
- Capturas de escritorio y de 390 px en `D:\Proyecto_SoftArq\_work\evidencias\modulo8\`.
- PDF descargados y muestras de una y de varias páginas (60 partidas, descripciones largas), renderizados en `…\modulo8\pdf\png\` y revisados página por página.
- **Defectos encontrados y corregidos:**
  - la línea final del PDF saltaba sola a una página nueva;
  - los textos y la emisión quedaban apretados en la columna lateral fija (se pasaron a la columna principal);
  - botones e insignias estirados;
  - un mensaje de fallo duplicado;
  - el aviso tras anular decía «la aprobación no es una emisión»;
  - el historial mostraba códigos de eventos nuevos sin nombre legible.

**Escenarios desde PostgreSQL** (módulo 2; por HTTP en el módulo 3; en la web en el módulo 4), comparados con los totales de las fuentes, no con el cálculo:

| Escenario | Total |
|---|---|
| `GUIA-R1-FALDONES-10M` | 54,190.68 |
| `GUIA-R2-ESPESOR-012` | 43,312.16 |
| `GUIA-R3-SIN-VENTANA` | 22,405.28 |
| `GUIA-PROPIA-CON-00001` | 4,911.79 |

En los cuatro, el resultado completo es idéntico al calculado con los fixtures del módulo 1.

## 6. Limitaciones, incidencias y riesgos

1. **Escrituras en C: no redirigibles:**
   - Prisma guarda su motor de migraciones (unos 20 MB) en `%APPDATA%\Prisma`;
   - Windows, Node y pnpm pueden escribir en el perfil de usuario.
2. **Restricciones en SQL manual:** los CHECK y la exclusión viven en la migración. Revisa siempre el SQL de `db:nueva-migracion` antes de aplicarlo.
3. **Sin DELETE para la aplicación:** las correcciones de catálogo se hacen desactivando o anulando. Hará falta un flujo administrativo explícito.
4. **Partidas y selecciones** se guardan dentro del borrador y de cada versión (`jsonb`), no como tablas propias (ADR-0008).
5. **Fuera del motor y del ensamblador:** BL-07 y BL-09 (vigencia a la emisión; con excepción PRECIO_VENCIDO desde el módulo 10), en la verificación vigente.
6. **PostgreSQL:** escucha en `*:5432`, pero `pg_hba.conf` solo admite conexiones locales. No se modificó el servicio ni su configuración.
7. **Fase 1:** siguen abiertas la incidencia de cierre de Excel y la observación de hoja activa.
8. **API con sesiones, pero solo local:**
   - solo escucha en `127.0.0.1` y la cookie no lleva `Secure` (HTTP local);
   - no debe exponerse en red, Expo ni despliegue sin TLS, `Secure` y `__Host-`, proxy y almacén compartido de los limitadores (ADR-0007 §5).
9. **Rate limiting en memoria:** vale para una instancia; con varias hará falta un almacén compartido.
10. **Avisos:**
    - AV-01 y AV-03 se publican reescritos sin importes;
    - AV-02 y AV-05 se evalúan en la revisión con la fecha del servidor (AV-02 se volverá a evaluar con la fecha de emisión);
    - AV-04 se evalúa en la verificación (revisión y validación de emisión) desde el módulo 10.
11. **Cierre por señal en Windows:** solo se comprobó dentro del mismo proceso; con Ctrl+C en la terminal funciona el mismo gancho (`enableShutdownHooks`).
12. **Web DEMO:**
    - la calculadora no guarda su captura (para conservarla, «Guardar como cotización»);
    - solo admite punto decimal;
    - hasta 20 conceptos distintos por consulta de opciones;
    - al vencer la sesión, la captura se descarta (es intencionado: no se conservan datos de una identidad anterior).
13. **Pruebas de navegador:**
    - `pnpm verificar:e2e` vacía y recarga `softarq_test`, así que no debe ejecutarse a la vez que `verificar:integracion`;
    - usa el Edge instalado (canal `msedge`); con otro equipo sin Edge habría que configurar otro canal o descargar Chromium en `_work`.
14. **Skills en Claude Code:** si la sesión se abre en `D:\Proyecto_SoftArq` en lugar de `softarq-platform`, la herramienta Skill resuelve los comandos personales homónimos (comprobado). Hay que abrir Claude Code en `softarq-platform` o leer el `SKILL.md` directamente (`docs/herramientas/skills.md` §4).
15. **Revisión en persona:**
    - el propietario declaró que revisa manualmente los resultados de la web (registrado el 03/10/2026, sin detalle de recorridos ni evidencias);
    - la **ejecución formal** de la guía de `docs/web/` (acceso A1–A9, calculadora 1–14 y cotizaciones C1–C15) no tiene registro: se anota en la §5 de la guía;
    - las pruebas de los módulos 4 a 6 y de la corrección son automatizadas;
    - nada de esto equivale a PR-41 ni PR-44 del Excel, que siguen pendientes.
16. **Autenticación (ADR-0007):**
    - los límites de acceso y los limitadores viven en memoria (una instancia; se reinician con el proceso);
    - un tercero puede bloquear una cuenta temporalmente (15 min);
    - la purga de sesiones es manual (`db:purgar-sesiones`);
    - reiniciar la API invalida los tokens CSRF (la web obtiene uno nuevo y pide repetir la acción);
    - sin registro, recuperación, MFA ni selección de organización (el acceso exige una sola pertenencia activa).
17. **Servidores del propietario:**
    - durante el módulo 8 había una API de SoftArq (`node dist/main.js`, 3000) y una web Vite (5173) del propietario en marcha; **no se tocaron**;
    - la prueba de humo usó una API propia en `3200`, ya detenida;
    - esa API de 3000 ejecuta código anterior: tras la migración ya **no puede crear clientes** (cambió la firma de `softarq_crear_cliente`) y la web nueva (Vite recarga el código) espera los contratos nuevos;
    - hay que **recompilar y reiniciar** con `SOFTARQ_DIR_DOCUMENTOS` en `apps/api/.env`, que ya está configurada: `pnpm --filter @softarq/contracts build && pnpm --filter @softarq/api build && pnpm --filter @softarq/api start`, y reiniciar la web.
18. **Disco y PostgreSQL:** se observaron `COMMIT` de más de 1 s (`WalWrite`) durante las pruebas de navegador del módulo 5. Por eso el código de sesiones evita las transacciones interactivas de Prisma; la única del módulo 6 es de solo lectura (sin escritura de WAL al confirmar) y su máximo medido fue 182 ms frente a un límite de 15 s.
19. **Cotizaciones (ADR-0008):**
    - ~~sin duplicar cotizaciones ni «precios anteriores» (B-34/B-35 del libro)~~: incorporados en el módulo 15 (§24); el descarte y el contacto llegaron con el módulo 8;
    - la purga de idempotencia es manual (`db:purgar-idempotencia`);
    - listados limitados a 100 resultados, sin paginación;
    - ~~la selección de un concepto que desaparece del catálogo se perdía al volver a guardar~~: corregido (ADR-0008, «Corrección posterior»);
    - en `softarq_dev` quedan datos DEMO de prueba, ninguno reparado ni modificado:
      - `COT-2026-00001`: acentos dañados por el `curl` de humo;
      - `COT-2026-00002`;
      - `COT-2026-00003`: humo del módulo 7; v1 aprobada, sin textos y con el nombre dañado en su instantánea;
      - `COT-2026-00004`: humo del módulo 8; v1 emitida, PDF en la carpeta de desarrollo;
      - el cliente de comprobación de acentos `CLI-00004`.

      Las tres primeras no se pueden emitir sin una vN+1 (BL-20). Módulo 9 añadió folios DEMO propios `COT-2026-00005` y `00006` para la prueba operativa (§18); siguiente folio observado: `00007`.
20. **Revisión (ADR-0009):**
    - desde el módulo 8, un Revisor puede anular la aprobación antes de emitir. Editar el borrador no la anula (en el libro sí), pero impide emitir la versión;
    - excepciones B-22 desde el módulo 10 (ADR-0014): BL-09 se exime con PRECIO_VENCIDO autorizada; AV-04 informa las autorizadas;
    - la verificación vigente recalcula en memoria al abrir una revisión pendiente, al enviar y al aprobar (el mismo trabajo que la fase A de ADR-0008; no se midió aparte);
    - el catálogo puede cambiar entre la verificación y la sentencia de escritura; la verificación refleja el instante de su lectura;
    - las cuentas DEMO de `softarq_dev` tienen una función cada una; BL-17 en pantalla solo se ve con una cuenta con las dos (las pruebas E2E crean `ambas.e2e@softarq.test` en `softarq_test`).

21. **Emisión (ADR-0010):**
    - **los PDF emitidos son originales**, no caché:
      - viven en `SOFTARQ_DIR_DOCUMENTOS` (desarrollo: `D:\Proyecto_SoftArq\datos\softarq_dev\documentos`);
      - se respaldan **junto con** la base: primero `pg_dump` de `softarq_dev` y después una copia de la carpeta;
      - al restaurar, se restauran ambas y se ejecuta `documentos:revisar`;
      - respaldo y restauración de prueba con `respaldo:*` (§17); no hay tareas programadas;
    - una interrupción entre el archivo y el registro deja un archivo propio sin registro: `documentos:revisar -- --limpiar` lo borra cuando tiene más de 60 min;
    - un archivo ausente o dañado no se regenera (500 `DOCUMENTO_NO_DISPONIBLE`): se restaura desde el respaldo;
    - seguimiento y vigencia incorporados por módulo 9 (§18); sin anulación de documentos emitidos; excepciones desde el módulo 10 (§19);
    - el almacén es local, de una sola instancia;
    - las fuentes del PDF cubren el alfabeto latino: un carácter sin glifo impide generar (`DOCUMENTO_NO_GENERADO`) en lugar de imprimirlo mal;
    - **el documento es DEMO** («DEMOSTRACIÓN» en cada página) y los datos del emisor son ficticios. No es apto para cotizaciones reales mientras falten los datos y validaciones del Word maestro (capítulo 8).
22. **Pruebas por HTTP con acentos:** use `scripts/http/api-json.mjs` (cuerpos JSON desde archivos UTF-8 y `comprobar-acentos` antes de crear datos). No pase JSON como argumento de `curl` en Git Bash.
23. **Grafo de código (Graphify 0.8.5):**
    - no contiene SQL, `schema.prisma`, documentación, cadenas ni comentarios (códigos BL o CR);
    - Graphify omite como «sensibles» los `tokens.ts` de sesión y CSRF;
    - `graphify update .` conserva nodos antiguos, así que se usa siempre `pnpm grafo:actualizar` (reconstrucción limpia);
    - los hooks de Git no se versionan: hay que ejecutar `pnpm grafo:instalar-hooks` en cada clon;
    - el ahorro de tokens no se ha medido.

    Detalle: [`docs/herramientas/graphify.md`](docs/herramientas/graphify.md) §3 y §6.
24. **Salidas internas (ADR-0018):**
    - las 10 versiones de `softarq_dev` anteriores al módulo (`COT-2026-00001` a `00010`) no tienen `referencias_internas`: muestran cifras y solo códigos (`SIN_NOMBRES`). No se rellenan a propósito;
    - sin exportación ni impresión, sin agregados entre cotizaciones y sin los contadores de 00 INICIO;
    - la respuesta no se pagina (la acota una versión: hasta 100 partidas por `LIMITES_API.partidas`, con sus consumos y compras);
    - dentro de una transacción interactiva, Prisma resuelve en paralelo las relaciones anidadas (aviso de `pg`): la lectura del módulo usa consultas planas y en serie. Quien añada lecturas anidadas dentro de `$transaction` debe evitarlo igual;
    - el límite de identidad de las funciones SQL (ADR-0017 §4) sigue sin resolver; el módulo no lo amplía (ADR-0018 §7).
25. **Duplicar, modo de precios y vista previa (ADR-0019):**
    - los borradores con la última versión emitida (seis históricos en `softarq_dev`) piden «Preparar la versión nueva» antes de editar o calcular;
    - la vista previa se entrega sin guardarse, con el limitador de cálculo (30 por minuto por defecto);
    - en `softarq_dev` quedan 40 cotizaciones DEMO del humo (`COT-2026-00015` a `00054`) y una carpeta de respaldo incompleta `….en-curso` (§24);
    - las funciones nuevas confían en `p_usuario` como las demás (ADR-0019 §7).
26. **App móvil, etapa 1 (ADR-0020):**
    - solo consulta; sin TLS (el token viaja por el túnel USB en loopback);
    - un token móvil robado del teléfono sirve hasta que venza (8 h / 30 min de inactividad) o se revoque;
    - una API distinta de la que sirvió la APK (cambio de contratos) puede devolver `respuesta_invalida`: hace falta una APK nueva;
    - `adb reverse` se pierde al reconectar el cable;
    - el límite de identidad de las funciones SQL (ADR-0017 §4) sigue pendiente: no hay escrituras móviles.

## 7. Siguiente tarea

0. **App móvil (§26):** siguiente etapa a acordar con el propietario: captura y cálculo; revisión y decisión; emisión y documentos; salidas internas; operación sin conexión; y TLS antes de exponer la API en red. Antes: completar el registro de la guía del teléfono (`docs/movil/guia-instalacion-y-pruebas.md` §10).
1. **Recompilar y reiniciar** la API y la web del propietario si están en marcha con código anterior: `softarq_dev` ya tiene la migración del módulo 15 (§24).
2. **Regularizar los conceptos heredados** de `softarq_dev` cuando el propietario lo decida, con el mapeo documentado (ADR-0016 §2.3): completar tipo y regla vuelve el concepto a Borrador y exige una nueva aprobación. No se ejecuta automáticamente.
3. **Siguiente módulo:** fijar con el propietario el alcance de la app Expo (bloque 6 de `docs/cobertura-demo.md`: consulta, revisión y decisión, o también captura) antes de instalar nada; si se pospone, el cierre integral (bloque 7). Pendientes aparte:
   - **tarea de seguridad propuesta (no hecha): identidad de las funciones SQL**, con objetivo, límites de confianza y pruebas en ADR-0018 §7 (un id de sesión o una variable que fije la misma credencial no la resuelve);
   - contadores operativos de 00 INICIO (fuente y reglas por definir; ADR-0018 §2.2);
   - exportación de informes internos: mejora opcional, solo si el propietario la pide.
   - Matriz y estimación en [`docs/cobertura-demo.md`](docs/cobertura-demo.md).
4. **Pendiente del cliente:**
   - definir P3, la política de vigencias; la adaptación del DEMO está en ADR-0015 §2.2;
   - entregar los datos reales del capítulo 8 (precios, proveedores y tarifas), que ya se podrán capturar en la web.
5. **Ejecución formal de la guía manual** [`docs/web/guia-prueba-manual.md`](docs/web/guia-prueba-manual.md), con el registro de la §5:
   - bloques A1–A9, 1–14, C1–C15, R1–R10, E1–E12, S1–S10, X1–X8, K1–K10, T1–T10, P1–P6, U1–U8, I1–I8 y D1–D10;
   - complementa la revisión personal ya declarada;
   - no cuenta como PR-41 ni PR-44.
6. **Operación:** repetir el aprovisionamiento administrativo de respaldo cuando haya una credencial local autorizada (no había archivo DPAPI en `_work\secrets`; no se ejecutó). Copia externa periódica de `D:\Proyecto_SoftArq\respaldos` sigue siendo una decisión pendiente.

Alternativas más cortas:
- **web DEMO:** coma decimal, conservar el borrador durante la sesión y más de 20 conceptos por consulta;
- **identidad desde la sesión** en las funciones de la base (ADR-0017 §4).

## 8. Último commit

> **Mensajes reescritos (24/10/2026):** se quitaron de los 27 commits locales los trailers `Co-Authored-By` de asistentes (solo mensajes; árboles idénticos; autor humano intacto; sin remoto ni push). **Los hashes de esta sección y de informes anteriores son los previos a la reescritura.** Correspondencia antiguo → nuevo, respaldo `.bundle` y mensajes originales: `_work\respaldo-historial-git\` (fuera de Git). Regla vigente: los mensajes de commit describen solo el cambio, sin menciones de autoría o generación por IA ni trailers de asistentes.

- `2543baa`: Módulo 2, persistencia de catálogos (sobre `f0a34da`).
- `fdcc8f4`: skills de proyecto y reglas de uso.
- `185fd26`: Módulo 3, API HTTP local.
- `84f9218`: Módulo 4, cliente web DEMO.
- `ff6da0d`: Módulo 5, usuarios DEMO, sesiones y autorización.
- `26ce1a5`: Módulo 6, clientes, proyectos y cotizaciones con versiones.
- `97e69d5`: corrección del borrador (selecciones no disponibles conservadas) y registro de la revisión personal.
- `b58ed43`: Módulo 7, revisión y aprobación.
- `da4a1ff`: Módulo 8, emisión, PDF DEMO, anulación y descarte.
- `3c352b6`: grafo de código local con Graphify.
- `0292c7f`: respaldo y recuperación local verificables.
- `1c9722b`: Módulo 9, respuestas internas por emisión, vigencia e historial de correcciones.
- `abe655d`: Graphify, diagnóstico del entorno restringido (solo documentación).
- `3412f0b`: Módulo 9, 403 cuando la base rechaza la función al registrar respuestas.
- Módulo 10: commit «Módulo 10: excepciones B-22 integradas a cálculo, revisión y emisión» (§19); consultar `git log -1 --oneline` para su hash.
- MD5 del libro oficial al cerrar el módulo 10: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).
- `a454053`: Módulo 10.
- Módulo 11: commit «Módulo 11: administración de proveedores, productos, precios y tarifas» (§20); consultar `git log -1 --oneline` para su hash. MD5 del libro al cerrar: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).

- `3599ece`: correcciones pendientes del módulo 11 (fallo intermitente, selectores, acceso por ruta).
- Módulo 12: commit «Módulo 12: catálogo técnico y aprobación de conceptos» (§21); consultar `git log -1 --oneline` para su hash. MD5 del libro al cerrar: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).

- `b3b785d`: correcciones previas al módulo 13 (migración protegida, permisos efectivos, impacto en versiones).
- Módulo 13: commit «Módulo 13: parámetros y personas del Administrador del sistema» (§22); consultar `git log -1 --oneline` para su hash. MD5 del libro al cerrar: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).
- `7072d13`: Módulo 13.
- Módulo 14: commit «Módulo 14: salidas internas de solo lectura (compras, detalle e indicadores)» (§23); consultar `git log -1 --oneline` para su hash. MD5 del libro al cerrar: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).
- `edf4cd8`: Módulo 14.
- Módulo 15: commit «Módulo 15: duplicar cotización, modo de precios y vista previa PDF BORRADOR» (§24); consultar `git log -1 --oneline` para su hash. MD5 del libro al cerrar: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).

- `f1367de`: traslado a la laptop (§25), sobre `31cf626`.
- Módulo 16: commit local «Módulo 16: app móvil Android, etapa 1 (acceso y consulta)» (§26); consultar `git log -1 --oneline` para su hash. Sobre `f1367de`.

Rama `main`. Sin remoto ni push. Último commit de código: `419d953` (vinculación EAS), sobre `4d37676` (etapa 1 del módulo 16, antes `953ebbe`); el HEAD vigente es `git log -1 --oneline`.

## 9. Skills de agentes

Detalle completo, fuentes, comprobaciones y actualización: [`docs/herramientas/skills.md`](docs/herramientas/skills.md). Reglas de uso: `AGENTS.md` §11.

| Skill | Claude Code | Codex | Verificado (02/10/2026) |
|---|---|---|---|
| `ui-ux-pro-max` (CLI 2.15.0, MIT) | `.claude/skills/ui-ux-pro-max` | `.agents/skills/ui-ux-pro-max` | Ambos agentes la reconocen; `search.py` funciona con Python 3.14.5 |
| `caveman` (commit `b39c908`, Apache-2.0) | `.claude/skills/caveman`, solo explícita | `.agents/skills/caveman`, solo explícita | Ambos agentes aplican lite y citan la skill original |
| `grill-me` + `grilling` (commit `d81f3a1`, MIT) | Literal; delega con la herramienta Skill | `grill-me` adaptada: lee `grilling/SKILL.md` | Delegación comprobada en ambos agentes |

- **Reinstalar o actualizar:** `python scripts/skills/instalar_skills.py [--destino <carpeta>] [--reemplazar]`.
- **Selección:** solo se instaló `ui-ux-pro-max` de las 7 skills que trae su instalador o plugin.
- **Comandos personales:** los `~/.claude/commands/{caveman,grill-me,ui-ux-pro-max}.md` siguen intactos; en este repositorio prevalecen las skills.

## 10. API HTTP local (módulo 3)

Endpoints, errores, límites y ejemplos: [`docs/api/README.md`](docs/api/README.md). Especificación: [`docs/api/openapi.json`](docs/api/openapi.json).

```
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start        # http://127.0.0.1:3000 (lee apps/api/.env)
curl -s http://127.0.0.1:3000/health
pnpm --filter @softarq/api openapi:generar   # tras cambiar un contrato (una prueba lo exige)
```

Desde el módulo 5, el cálculo y los catálogos exigen sesión. El flujo con `curl` (archivo de cookies, CSRF y `Origin`) está en [`docs/api/README.md`](docs/api/README.md#ejemplos-reproducibles-datos-demo).

| Endpoint | Uso |
|---|---|
| `GET /health` | Servicio y PostgreSQL |
| `GET /api/v1/catalogos/conceptos` | Conceptos activos y aprobados |
| `GET /api/v1/catalogos/opciones-precio?conceptos=…` | Opciones vigentes por insumo, sin precios, con `esMenorPrecio` |
| `GET /api/v1/catalogos/tipos-adicional` | Tipos de costo adicional |
| `GET /api/v1/auth/csrf`, `POST/GET/DELETE /api/v1/auth/sesion` | Sesión previa con CSRF, acceso, consulta y cierre (ADR-0007) |
| `POST /api/v1/calculos/demo` | Cálculo DEMO; solo vista comercial; capacidad `calculo.ejecutar` (Preparador) |
| `GET /api/v1/openapi.json` | Especificación |

- **Código:**
  - `apps/api/src/http/` (aplicación, controladores, errores, transporte y OpenAPI);
  - `src/config/entorno.ts`;
  - casos de uso sin Nest en `src/modules/*/aplicacion/`;
  - contratos en `packages/contracts/src/api/esquemas.ts`.
- **Pruebas de integración:** `api-http`, `calculo-desde-base` y `catalogos` usan organizaciones DEMO distintas (`DEMO-HTTP`, `DEMO-CALCULO` y `DEMO`), así que no dependen del orden de ejecución.

## 11. Web DEMO (módulo 4)

Detalle: [`apps/web/README.md`](apps/web/README.md). Diseño: [`docs/web/sistema-visual.md`](docs/web/sistema-visual.md). Decisiones: [ADR-0006](docs/adr/0006-cliente-web-demo.md).

```
# Terminal 1: API (softarq_dev)
pnpm --filter @softarq/api build && pnpm --filter @softarq/api start
# Terminal 2: web → http://localhost:5173 (inicia sesión con una cuenta DEMO, §12)
pnpm --filter @softarq/contracts build && pnpm --filter @softarq/web dev

pnpm --filter @softarq/web test     # Vitest (estado, cliente HTTP, componentes)
pnpm verificar:e2e                  # Playwright: web compilada + API real + softarq_test
```

- **Escenarios implementados:** Ejemplo 1 (faldones de 10 m), Ejemplo 2 (espesor 0.12), Ejemplo 3 (sin la ventana), cotización propia de referencia (CON-00001) y captura propia libre.
- **Arranque de pruebas de la API:** `apps/api/src/pruebas-e2e/` (`servidor-e2e.ts`, `ajustar-base.ts`), compilado con `pnpm --filter @softarq/api build:e2e` en `dist-e2e/` (no versionado). Solo `softarq_test`, con la fecha fija mediante `RelojFijo`.
- **Salidas:** `D:\Proyecto_SoftArq\_work\playwright\` (informe y trazas) y `_work\evidencias\modulo4\` (capturas).

## 12. Accesos DEMO y sesiones (módulo 5)

Decisiones: [ADR-0007](docs/adr/0007-autenticacion-sesiones.md). Matriz de permisos: [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) §6.

**Preparar el entorno** (con PostgreSQL ya preparado según [`apps/api/README.md`](apps/api/README.md#preparar-el-entorno-desde-cero)):

```
pnpm --filter @softarq/api db:migrar                # migración de usuarios y sesiones
pnpm --filter @softarq/api db:cargar-usuarios-demo  # [DEMO] Preparador 1 y [DEMO] Revisor 1
```

**Obtener los accesos locales:**
- abre `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json`, que está fuera del repositorio y nunca se versiona;
- las cuentas son:
  - `preparador.demo@softarq.test` (Preparador: prepara, calcula, envía, emite y descarta);
  - `revisor.demo@softarq.test` (Revisor: aprueba, anula y emite lo que no preparó);
  - desde el módulo 8, `administrador.demo@softarq.test` (`[DEMO] Administrador`: configura el emisor);
- volver a ejecutar la carga conserva las cuentas y sus contraseñas;
- para generar una contraseña nueva de forma explícita (revoca sus sesiones):

  ```
  pnpm --filter @softarq/api db:cargar-usuarios-demo -- --restablecer preparador.demo@softarq.test
  ```

**Usar:**
1. reinicia la API (§10);
2. arranca la web (§11);
3. abre **http://localhost:5173** (con `localhost`, no `127.0.0.1`) e inicia sesión.

La sesión vence tras 30 minutos sin actividad o a las 8 horas.

**Probar:** en secuencia, nunca a la vez (las dos últimas usan `softarq_test`).

```
pnpm verificar
pnpm verificar:integracion
pnpm verificar:e2e
```

El servidor E2E crea cuentas de prueba nuevas en cada corrida (`_work\secrets\accesos-e2e.json`).

**Mantenimiento:** `pnpm --filter @softarq/api db:purgar-sesiones` borra las sesiones vencidas o revocadas hace más de 7 días, con el rol migrador.

**Código:**

| Parte | Ubicación |
|---|---|
| API | `apps/api/src/modules/autenticacion/` (matriz, política, limitador, Argon2id, tokens, CSRF, repositorio y cuentas DEMO) y `apps/api/src/http/{guardia-sesion,cookies,controlador-autenticacion}.ts` |
| Web | `apps/web/src/sesion/` y `apps/web/src/api/cliente.ts` |

**Para continuar:** toda ruta nueva debe declarar `@Requiere(capacidad, …)` (o `@Publico()` con justificación) y filtrar por `organizacionDe(req)`. Las capacidades nuevas se añaden a `CAPACIDADES` (contracts) y a la matriz de `dominio/capacidades.ts`, contrastadas con el libro.

## 13. Clientes, proyectos y cotizaciones (módulo 6)

Decisiones: [ADR-0008](docs/adr/0008-cotizaciones-versiones-folios.md). Modelo y matriz: [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) §6 y §7. Endpoints y `curl`: [`docs/api/README.md`](docs/api/README.md).

**Migración:** `20261003062244_cotizaciones` (tablas `cliente`, `proyecto`, `cotizacion`, `cotizacion_borrador`, `cotizacion_version`, `contador`, `bitacora`, `idempotencia`; CHECK; trigger `cotizacion_version_inmutable_trg`; funciones `softarq_*`). Ya aplicada en `softarq_dev`.

**Usar:**

```
pnpm --filter @softarq/api db:migrar                       # ya aplicado en softarq_dev
pnpm --filter @softarq/api build && pnpm --filter @softarq/api start
pnpm --filter @softarq/contracts build && pnpm --filter @softarq/web dev
```

Abre **http://localhost:5173**, entra como Preparador (accesos en §12) y usa la pestaña **Cotizaciones** o, desde la Calculadora DEMO, «Guardar como cotización».

**Estados:** folio `ACTIVO`; versión `BORRADOR` («Borrador calculado · sin enviar a revisión»). APROBADA y EMITIDA no son alcanzables.

**Garantías de concurrencia:**
- borrador, cliente y proyecto: `UPDATE … WHERE revision = esperada` en una sentencia; obsoleta → 409 `CONFLICTO_EDICION` con el estado vigente;
- versión: lectura coherente en `REPEATABLE READ READ ONLY` y escritura en **una** sentencia que exige la misma revisión del borrador, asigna el número con `UPDATE … RETURNING` y comprueba la versión anterior (reintenta la lectura si otra versión se adelantó);
- folios y códigos: contador por organización y año con `INSERT … ON CONFLICT DO UPDATE` en la misma sentencia que el alta; UNIQUE como última garantía;
- idempotencia: `Idempotency-Key` obligatoria en las altas; ámbito organización + usuario + clave; 24 h; se registra en la misma sentencia que el recurso.

**Mantenimiento:** `pnpm --filter @softarq/api db:purgar-idempotencia` (rol migrador).

**Código:**

| Parte | Ubicación |
|---|---|
| API | `apps/api/src/modules/cotizaciones/` y `apps/api/src/http/controladores-cotizaciones.ts` |
| Base | `apps/api/prisma/migrations/20261003062244_cotizaciones/migration.sql` y `apps/api/scripts/db/permisos-app.sql` |
| Contratos | `packages/contracts/src/api/cotizaciones.ts` |
| Web | `apps/web/src/{Aplicacion.tsx,navegacion,clientes,cotizaciones}`, `apps/web/src/captura/{usarCaptura.ts,VistaCaptura.tsx,borrador.ts}` |

**Para continuar:** los estados de revisión y emisión deben ir en una tabla nueva de solo inserción; nunca concedas UPDATE sobre `cotizacion_version` ni retires su trigger.

## 14. Revisión y aprobación (módulo 7)

Decisiones: [ADR-0009](docs/adr/0009-revision-aprobacion.md). Matriz: [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) §6 y §8. Endpoints y `curl`: [`docs/api/README.md`](docs/api/README.md). Prueba en persona: guía R1–R10.

**Usar** (la migración ya está aplicada en `softarq_dev`):

```
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api build && pnpm --filter @softarq/api start   # http://127.0.0.1:3000
pnpm --filter @softarq/web dev                                         # http://localhost:5173
```

1. Entra como Preparador (accesos en §12), abre una cotización y pulsa «Calcular y guardar versión».
2. Pulsa «Enviar vN a revisión…» y confirma.
3. En otro navegador o ventana privada, entra como Revisor, abre **Revisiones**, abre la versión y elige «Solicitar cambios…» o «Aprobar…».
4. El Preparador ve la decisión al recargar la cotización; con una revisión pendiente puede «Retirar la revisión para corregir…».

**Probar:** `pnpm verificar`, `pnpm verificar:integracion` y `pnpm verificar:e2e`, en secuencia.

**Código:**

| Parte | Ubicación |
|---|---|
| API | `apps/api/src/modules/cotizaciones/{aplicacion/servicio-revisiones.ts,dominio/verificacion.ts,infraestructura/repositorio-revisiones.ts}` y `apps/api/src/http/controladores-cotizaciones.ts` |
| Base | `apps/api/prisma/migrations/20261003160000_revisiones/migration.sql` y `apps/api/scripts/db/permisos-app.sql` |
| Contratos | `packages/contracts/src/api/revisiones.ts` y los estados de `cotizaciones.ts` |
| Web | `apps/web/src/cotizaciones/{revisiones.tsx,EditorCotizacion.tsx,componentes.tsx}` |

**Para continuar:**
- la emisión debe exigir una revisión APROBADA de la **misma** versión (`revision.version_id`) y registrar su estado en otra tabla de solo alta;
- nunca concedas UPDATE sobre `cotizacion_version` ni `revision_evento` ni retires sus triggers;
- toda decisión nueva debe citar la versión y la ficha vistas.

## 15. Emisión, PDF DEMO, anulación y descarte (módulo 8)

Decisiones: [ADR-0010](docs/adr/0010-emision-pdf-anulacion-descarte.md). Matriz: [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) §6 y §9. Endpoints y ayudante HTTP: [`docs/api/README.md`](docs/api/README.md). Prueba en persona: guía E1–E12.

**Usar** (migración, emisor DEMO y cuenta del administrador ya aplicados en `softarq_dev`; `SOFTARQ_DIR_DOCUMENTOS` ya está en `apps/api/.env`):

```
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api build && pnpm --filter @softarq/api start   # http://127.0.0.1:3000
pnpm --filter @softarq/web dev                                         # http://localhost:5173
```

1. **Preparador:**
   - crea o edita el cliente con su **contacto** y el proyecto con municipio, entidad y descripción;
   - en la cotización revisa «Textos de la cotización», pulsa «Calcular y guardar versión» y envía la versión a revisión.
2. **Revisor:** en «Revisiones» ve los textos y aprueba.
3. **Emisión:** el Preparador (o un Revisor que no preparó la versión) abre la cotización. En «Emisión» revisa la validación, pulsa «Emitir vN…», confirma y usa «Descargar PDF».
4. **Anular:** el Revisor puede «Anular la aprobación…» (con motivo) mientras no se emita.
5. **Descartar:** el Preparador puede «Descartar la cotización…» (con motivo) si no hay revisión pendiente, aprobación vigente ni emisión.
6. **Emisor:** el Administrador del sistema edita los datos en la sección «Emisor».

**Mantenimiento de documentos:** `pnpm --filter @softarq/api documentos:revisar [-- --limpiar]`. Para revisar un PDF a ojo: `node apps/api/scripts/pdf/renderizar-pdf.mjs <archivo.pdf> ../_work/tmp/png`.

**Probar:** `pnpm verificar`, `pnpm verificar:integracion` y `pnpm verificar:e2e`, en secuencia.

**Código:**

| Parte | Ubicación |
|---|---|
| API | `apps/api/src/modules/cotizaciones/{aplicacion/servicio-emisiones.ts,dominio/emision.ts,dominio/textos.ts,dominio/pdf/,infraestructura/almacen-documentos.ts,infraestructura/repositorio-emisiones.ts,mantenimiento/,demo/}` y `apps/api/src/http/controladores-cotizaciones.ts` |
| Recursos del PDF | `apps/api/recursos/pdf/` (Fira Sans OFL y logotipo DEMO) |
| Base | `apps/api/prisma/migrations/20261003200000_emision/migration.sql` y `apps/api/scripts/db/permisos-app.sql` |
| Contratos | `packages/contracts/src/api/emisiones.ts` y los cambios de `cotizaciones.ts`, `revisiones.ts` y `esquemas.ts` |
| Web | `apps/web/src/cotizaciones/{emision.tsx,EditorCotizacion.tsx,revisiones.tsx,componentes.tsx}`, `apps/web/src/clientes/`, `apps/web/src/captura/{estado.ts,borrador.ts,VistaCaptura.tsx}` |
| Ayudante HTTP | `scripts/http/api-json.mjs` |

**Para continuar:**
- nunca concedas UPDATE ni DELETE sobre `emision` ni retires sus triggers;
- un documento emitido no se regenera;
- un cambio de diseño del PDF incrementa `PLANTILLA_PDF`;
- toda operación nueva sobre una emisión debe citar la versión y la aprobación vistas.

## 16. Grafo de código local (Graphify)

Guía completa: [`docs/herramientas/graphify.md`](docs/herramientas/graphify.md). Decisión: [ADR-0011](docs/adr/0011-grafo-de-codigo-graphify.md). Rutina: `AGENTS.md` §12.

| Dato | Valor |
|---|---|
| Versión | `graphifyy` 0.8.5 del propietario (`C:\Users\RAUL\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe`). `safishamsi/graphify` redirige a `Graphify-Labs/graphify`: es el mismo proyecto. No se reinstaló. |
| Alcance | `apps/api/src`, `apps/web/src`, `apps/web/e2e`, `packages/contracts/src`, `apps/api/scripts`, `scripts/grafo`, `scripts/http` y `*.config.ts`: **232 archivos, 2.600 nodos y 5.587 aristas** al cerrar el módulo 10 (05/10/2026; 204 archivos el 04/10). Exclusiones en `.graphifyignore`; lista exacta con `pnpm grafo:archivos`. |
| Salida | `softarq-platform\graphify-out\` (D:, ignorada por Git). Se regenera con `pnpm grafo:actualizar` si se borra. |
| Vigencia | `pnpm grafo:estado` → VIGENTE, DESACTUALIZADO (lista los archivos), PENDIENTE (reconstrucción en curso o fallida) o AUSENTE. Solo VIGENTE significa que refleja los archivos actuales. |
| Actualización | `pnpm grafo:actualizar` tras cambios relevantes y al cerrar cada módulo. Los hooks de Git (`pnpm grafo:instalar-hooks`, ya instalados en este clon) la lanzan en segundo plano tras `git switch` o `git merge`. |
| Claude Code | Hook `SessionStart` (`.claude/settings.json`): una línea de estado; no reconstruye. |
| Codex | Sin hook: sigue `AGENTS.md` §12. |

**Comprobado el 04/10/2026:**
- consultas sobre sesiones/CSRF, motor/contratos, revisión/BL-17 y emisión/PDF contrastadas con los `import` reales;
- prueba controlada de añadir, cambiar y eliminar una dependencia, que **descubrió y corrigió** la conservación de nodos de `graphify update`;
- hooks de Git sin bloqueo (1 s) y con candado;
- ninguna escritura fuera de D: (salvo las normales de Python);
- `~/.claude` y `~/.codex` intactos.

## 17. Respaldo y recuperación local

Guía: [`docs/operacion/respaldo-y-restauracion.md`](docs/operacion/respaldo-y-restauracion.md). Decisión: [ADR-0012](docs/adr/0012-respaldo-y-restauracion-local.md).

```
cd apps/api
pnpm respaldo:crear                        # → D:\Proyecto_SoftArq\respaldos\softarq_dev\<ID>
pnpm respaldo:verificar <carpeta>          # 0 solo si es COMPLETO y coinciden todos los SHA-256
pnpm respaldo:restaurar <carpeta>          # solo en softarq_restauracion (+ _work\restauracion)
pnpm respaldo:probar-restauracion          # prueba completa con API temporal en 127.0.0.1:3100
```

| Dato | Valor |
|---|---|
| Respaldos | `D:\Proyecto_SoftArq\respaldos\softarq_dev\` (fuera del repositorio y de `_work`). Primer respaldo: `softarq_dev-20261004T075403Z-e6dcda`, COMPLETO y verificado |
| Rol | `softarq_respaldo`: solo lectura de `softarq_dev`; credencial en `apps/api/.env.respaldo`, excluida de Git |
| Destino de prueba | `softarq_restauracion` (única base permitida) y documentos en `_work\restauracion\softarq_restauracion\documentos` |
| Aprovisionamiento | `aprovisionar-respaldo.ps1`, ya ejecutado con DPAPI y `-EliminarCredencial` (archivo borrado). Solo hace falta repetirlo si se recrean los roles o las bases |
| Resultado | **30/30** comprobaciones (tabla siguiente); `pnpm verificar` 556/556 |
| Conservación | Los 10 últimos COMPLETOS más el primero de cada mes; borrado manual tras verificar uno más reciente. Sin tareas programadas |

**Comandos y resultados reales:**

| Comando | Resultado |
|---|---|
| `aprovisionar-respaldo.ps1 -ArchivoCredencial … -EliminarCredencial` (04/10/2026) | Código 0: rol `softarq_respaldo` (SELECT en 28/28 tablas y secuencias, 0 escrituras, solo lectura, sin atributos especiales) y base `softarq_restauracion`; archivo DPAPI eliminado |
| `pnpm respaldo:probar-restauracion` (04/10/2026) | **30/30**: respaldo COMPLETO y verificado, restauración aislada, 7 relaciones sin incoherencias, permisos y disparadores, sesiones revocadas, descarga del PDF por API temporal (127.0.0.1:3100) con los mismos bytes, 7 casos de fallo rechazados y `softarq_dev` y sus PDF intactos |
| `pnpm verificar` (04/10/2026, con las pruebas de guardas) | 556/556 (api 377, incluidas 21 de guardas de respaldo; web 179) |

- **Límite:** el respaldo está en el mismo disco D:. Protege frente a errores operativos, no frente a la pérdida del disco: copie la carpeta a un medio externo de vez en cuando.
- **No se automatiza** ninguna restauración sobre `softarq_dev`: véase la guía, §5.

## 18. Seguimiento interno por emisión, vigencia y respuesta (módulo 9)

**Sesión:** 05/10/2026, Codex GPT 6.1 Sol. Inicio verificado: directorio correcto, rama `main`, árbol sin cambios previos, HEAD `0292c7f`; commits reales anteriores `3c352b6` y `da4a1ff`. No se restauraron archivos ni se tocaron cambios ajenos. HANDOFF proponía respuesta/vigencia o excepciones; se implementó la primera opción con el plan aprobado por el propietario. Excel y Word consultados en solo lectura; MD5 del libro antes/después `b60debc121957b8d8e3f2c2edd9a5b4f`.

**Reglas y fuentes:** [ADR-0013](docs/adr/0013-seguimiento-respuestas-vigencia.md), [módulo y ubicaciones exactas](docs/cotizaciones/seguimiento-respuestas.md). El propietario decidió (1) permitir captura posterior al vencimiento si la respuesta fue recibida dentro de vigencia, (2) Preparador corrige con evento nuevo, motivo obligatorio e historial. No se atribuyen estas adaptaciones al Excel. Aceptada/Rechazada son resultados comerciales; aprobación del Revisor sigue siendo interna. Emisión/versión/PDF inmutables, sin transferencia de respuesta a otra emisión. Sustitución impide un primer registro sobre el documento antiguo, pero permite corregir su respuesta ya existente como historia.

**Implementación:**

| Parte | Ubicación |
|---|---|
| Contratos | `packages/contracts/src/api/respuestas.ts`: cuerpos estrictos, fecha real, respuesta/evento, seguimiento y paginación; dos capacidades nuevas del Preparador |
| API | `servicio-respuestas.ts`, `repositorio-respuestas.ts`, `dominio/respuesta-cliente.ts`; controlador `/emisiones/:id/seguimiento`, `/respuestas`, `/respuestas/:eventoId/correcciones`; sesión/CSRF/Origin/límites existentes |
| Base | Migración `20261005150000_respuestas_cliente`, aplicada en test y dev. Eventos de solo alta, FK compuestas, cadena/índices únicos y disparadores de validación e inmutabilidad. Idempotencia y bitácora atómicas; bloqueo del borrador serializa por cotización |
| Web | `cotizaciones/respuestas.tsx`, integrado con emisión y vista histórica de versión. Acciones/motivos del servidor, confirmación exacta, conservación de captura e intención ante fallos/conflictos, corrección explícita de la cabeza consultada |
| Respaldo | `permisos-app.sql` y `probar-restauracion.mjs` incluyen nueva tabla; `probar-concurrencia.mjs` y comando `respaldo:probar-concurrencia` verifican una instantánea abierta durante emisión/respuesta/corrección reales |

**Pruebas de ESTA sesión** (los 556/226/47/30 previos son resultados reportados por Claude, conservados en las secciones anteriores):

| Comando/comprobación | Resultado ejecutado |
|---|---|
| `respaldo:crear` + `respaldo:verificar` antes de migrar | COMPLETO y VÁLIDO, `softarq_dev-20261005T143908Z-02ccd5`, esquema anterior, 1/1 PDF |
| `db:migrar:test`, `db:migrar` | Código 0. Primer intento en test detectó CASE sin paréntesis; se corrigió. Se comprobó que no quedó tabla parcial, se marcó solo esa migración fallida como rolled-back y se aplicó. Desarrollo se migró después de 12/12 casos nuevos de integración |
| `openapi:generar` | Código 0; documento versionado coincide con contratos según prueba unitaria |
| `pnpm verificar` (última ejecución, 09:35) | **571/571**: API 385, web 186; compilación y tipos correctos. La comprobación web de no exponer datos internos incluye dinámicamente el archivo nuevo |
| `pnpm verificar:integracion` (09:23) | **238/238**, 13 archivos, un worker; softarq_test, documentos aislados. Fechas, autorización/aislamiento, solo emitidas, identidad de versión/emisión, doble envío, carreras, correcciones, paginación de 52 eventos, y versión/PDF/importes intactos. Medianoche de México comprobada en unitarias |
| `pnpm verificar:e2e` (09:27) | **51/51**, código 0, un worker, después de integración; softarq_test, Edge, web compilada y documentos aislados. Incluye 4 casos nuevos, uno móvil a 390 px. Tras terminar todos los casos, teardown no cerró sus servidores automáticamente: se identificaron y detuvieron solo los PID propios 7760, 24688 y 696 por nombre/hora de inicio; entonces el comando cerró con 0 |
| Cuatro referencias | **54,190.68; 43,312.16; 22,405.28; 4,911.79**, verificadas en integración y E2E; no se cambió el motor ni expectativas de importes |
| `respaldo:probar-concurrencia` | **15/15**. Rol softarq_respaldo lee nueva tabla sin INSERT/DDL, readonly=on. Respaldo `softarq_dev-20261005T151809Z-e27a52`, COMPLETO/VÁLIDO, restaurado en base aislada: la instantánea excluye emisión/respuesta/corrección posteriores. Emisiones/PDF anteriores intactos |
| `node scripts/respaldo/probar-restauracion.mjs` (API ya compilada) | **35/35**. Respaldo `softarq_dev-20261005T151858Z-1e4ecc`, COMPLETO/VÁLIDO, 225.175 bytes, 3/3 PDF. Tres eventos íntegros/notas comparadas, fechas/cadena/permisos/triggers correctos, PDF descargados idénticos; desarrollo intacto durante esta prueba |
| Revisión visual de Codex | 6 capturas examinadas: escritorio 01–04, móvil 01–02 en `_work\evidencias\modulo9`. Resultados e historial legibles, acentos correctos, formulario/conflicto con nota conservada; E2E verifica teclado/foco y ausencia de desborde |
| `git diff --check`, sintaxis scripts Node, MD5 Excel | Correctos. Sin actualización de dependencias ni lockfile |

**Expectativas anteriores modificadas con intención:** inventario OpenAPI añade tres rutas/cuatro esquemas; sesión Preparador añade dos capacidades; inventario SQL añade una función SECURITY INVOKER y mantiene verificación de EXECUTE no público. Mocks web incorporan los nuevos métodos. No se cambiaron expectativas de reglas previas ni importes para eludir fallos.

**Datos/evidencias:** la prueba operativa añadió exclusivamente folios DEMO propios COT-2026-00005 y 00006 en dev; ahora hay 3 emisiones/PDF y 3 eventos de respuesta, incluyendo una corrección. No se repararon ni borraron los registros previos. PDF originales siguen en `D:\Proyecto_SoftArq\datos\softarq_dev\documentos`; respaldos COMPLETOS en `D:\Proyecto_SoftArq\respaldos\softarq_dev`. Evidencias desechables: `_work\evidencias\modulo9`, `concurrencia-respaldo-2026-10-05T15-18-05-612Z` y `respaldo-softarq_dev-20261005T151858Z-1e4ecc`. No hay secretos en los archivos nuevos versionados.

**Graphify — estado real al cierre:** el grafo anterior se consultó selectivamente para emisión, repositorios, idempotencia, controlador y respaldo antes de leer fuentes. No se exploró todo el repositorio ni se usó `graphify update .`. Reconstrucciones con `pnpm grafo:actualizar` fallaron: `python` ENOENT; Python del runtime Codex disponible pero `ModuleNotFoundError: graphify`; acceso al Python original documentado denegado por este entorno. No se actualizó/reinstaló Graphify ni se ejecutaron instaladores/global hooks. Grafo anterior intacto: 0.8.5, fecha 04/10 07:58:38 UTC, 2.295 nodos/4.888 aristas; sus metadatos antiguos dicen VIGENTE, **no describe módulo 9** (23 archivos indexados anteriores cambiaron; 0 nodos del flujo nuevo). `grafo:estado` tampoco puede certificarlo ahora. Pendiente desde el entorno del propietario: `pnpm grafo:actualizar`, luego consultas focalizadas `graphify explain ServicioRespuestas`, `graphify explain PanelRespuesta`, `graphify path RespuestasController ServicioRespuestas` y `pnpm grafo:estado`. No declarar verificadas esas consultas nuevas hasta ejecutarlas. SQL, schema.prisma y tokens.ts siguen requiriendo rg/lecturas dirigidas.

**Entorno:** no se modificó el perfil global. pnpm/Python originales no eran ejecutables desde esta sesión restringida. Se reutilizó pnpm **11.19.0 ya incluido** en Codex solo para scripts (`--pm-on-fail=ignore` evita descarga/cambio de versión); packageManager del proyecto permanece 11.1.3 y dependencias intactas. Lanzadores temporales en `_work\softarq-codex` y caché Node en `_work\tmp`. Buscador local UI UX Pro Max del repositorio ejecutado con Python incluido; foco, errores y conservación de captura aplicados. Conflicto del comando personal sigue abierto. Caveman/grill-me no activados.

**Abrir el módulo** (no reutilizar procesos antiguos sin comprobar qué código ejecutan):

```powershell
Set-Location D:\Proyecto_SoftArq\softarq-platform
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start       # terminal API; http://localhost:3000
pnpm --filter @softarq/web dev        # otra terminal; http://localhost:5173
```

En esta sesión restringida, ante pnpm no disponible, prefijar cada comando con `powershell -NoProfile -ExecutionPolicy Bypass -File D:\Proyecto_SoftArq\_work\softarq-codex\run.ps1`. Si 3000/5173 están ocupados, comprobar y reiniciar los procesos propios en sus terminales o elegir puertos mediante variables locales; no detener procesos ajenos. Preparador → Cotizaciones → emisión → Registrar respuesta/Corregir registro interno; Revisor solo consulta. Credenciales existentes en `_work\secrets`, sin copiarlas al chat.

**Pendientes:** actualizar/certificar Graphify desde el entorno con la instalación existente; repetir realmente aprovisionamiento administrativo de respaldo (no se ejecutó); ejecución formal de guía S1–S10 y anteriores (sin atribuirla al propietario). Revisión personal del propietario sigue siendo únicamente la declaración existente del 03/10/2026; PR-41…PR-44 del Excel continúan pendientes. Sin excepciones, anulación de documentos emitidos, portal o despliegue. Vite advierte un chunk de unos 530 kB; compilación correcta, sin ampliar este módulo para reestructurar bundles.

**Continuación recomendada:** recompilar y revisar personalmente S1–S10, completar esos pendientes operativos, y decidir el siguiente módulo de excepciones conforme al Word y ADR. Commit de este módulo: ver §8 y `git log -1 --oneline`; sin remoto/push/despliegue.

## 19. Excepciones B-22 (módulo 10)

**Sesión:** 05/10/2026, Claude Code (Claude Opus 5.5), relevo de Codex.
- **Inicio verificado:** `D:\Proyecto_SoftArq\softarq-platform`, rama `main`, árbol limpio, HEAD `1c9722b`; no se revirtió nada ajeno.
- **Resultados de Codex conservados como reportados (§18), sin repetirlos al iniciar:** 571, 238, 51, 35 y 15.
- **Fuentes, en solo lectura:** Word v1.3 (copia de texto en `_work\tmp\m10`), VBA y `fase1.csv`.
- **MD5 del libro:** `b60debc121957b8d8e3f2c2edd9a5b4f` antes y después.

**1. Graphify recuperado** (commit `abe655d`, solo documentación; el script no cambia):
- desde este entorno, `graphify.exe` y `python` resuelven al Python 3.14 del propietario con `graphifyy` 0.8.5;
- el fallo de Codex era el PATH de su entorno restringido; la instalación no estaba dañada. Detalle en `docs/herramientas/graphify.md` §7.1, con las variables `GRAPHIFY_EXE` y `GRAPHIFY_PYTHON`;
- reconstrucción limpia sin cambios de procedimiento;
- consultas contrastadas con los `import`: `ServicioRespuestas`, `PanelRespuesta` y `RespuestasController`→`ServicioRespuestas` al inicio; `ServicioExcepciones`, `PanelExcepcionesVersion` y `controladores-cotizaciones`→`servicio-revisiones`→`repositorio-excepciones` al cierre;
- al cierre: **VIGENTE**, con 232 archivos, 2.600 nodos y 5.587 aristas;
- SQL, `schema.prisma` y `tokens.ts` se revisaron con `rg`.

**2. Defectos del traspaso (módulo 9), con reproducción y regresión:**
- **403 en lugar de 500** (commit `3412f0b`).
  - **Defecto:** si `softarq_registrar_respuesta` lanzaba `SOFTARQ:SIN_PERMISO` (pertenencia cambiada después de iniciar la sesión), `traducirErrorBase` no lo reconocía y la API respondía 500.
  - **Reproducción:** prueba que falla antes de la corrección (`_work\registros\modulo10\01-reproduccion-sin-permiso.log`).
  - **Corrección:** `SIN_PERMISO` en `MENSAJES`.
- **Deriva de `schema.prisma`** (en el commit del módulo 10).
  - **Defecto:** las tres FK de `respuesta_cliente_evento` no tenían `map:`; `migrate dev` proponía renombrarlas en la migración siguiente.
  - **Corrección:** `map:` en el esquema, sin cambiar la base.
  - **Regresión:** prueba `migrate diff --exit-code` en `migraciones.integracion.test.ts`.
- **Sin cambio:**
  - reglas de ADR-0013 (vigencia inclusiva, captura tardía con recepción en plazo, correcciones como eventos);
  - diferencias de estilo de la migración del módulo 9;
  - exposición de `registradoPor` (solo anotada).

**3. Reglas y decisiones:** [ADR-0014](docs/adr/0014-excepciones.md) (fuentes exactas, tabla de reglas y diferencias).
- **Tres tipos, solo los del libro:** RENDIMIENTO (rendimiento o desperdicio de un componente), PRECIO_VENCIDO y CONCEPTO_PERSONALIZADO. No hay de precio, impuesto ni permisos.
- **Registro:** el Preparador las registra en el borrador con motivo; se congelan en la versión calculada.
- **Cálculo:** el servidor aplica las de rendimiento con el motor existente.
  - TI-339: 337 piezas con la cifra de la fuente.
  - En `softarq_dev`, el muro con ventana sin transporte y block a 13 pza/m² dio $19,965.28, coherente con el cálculo manual: +13 blocks a $13.90 sobre el R3 sin transporte.
- **Enviar:** basta con registradas.
- **Aprobar, verificar en revisión y emitir:** todas autorizadas.
- **Rechazada:** bloquea esa versión; hace falta vN+1 (adaptación a versiones inmutables, no una regla nueva).
- **AV-04:** por cada autorizada, sin valores técnicos ni motivo en el texto.
- **Autorización:** un Revisor ≠ autor y preparador, durante la revisión PENDIENTE, con una decisión inmutable por excepción y versión. Se reutiliza `revisiones.decidir`, sin un flujo paralelo.
- **Capacidad nueva `excepciones.consultar`** (Preparador y Revisor) para el contrato interno con datos técnicos. Versión, revisión, emisión, proyección comercial y PDF no llevan excepciones.

**4. Implementación:**

| Parte | Ubicación |
|---|---|
| Contratos | `packages/contracts/src/api/excepciones.ts`; `captura.excepciones` opcional; `excepciones` opcional en la solicitud de cálculo; `clase` en conceptos; códigos `EXCEPCION_INVALIDA` y `CONFLICTO_EXCEPCION` |
| API | `dominio/excepciones.ts` (puro), `servicio-excepciones.ts`, `repositorio-excepciones.ts`; `verificar(…, estricto)` en `servicio-revisiones.ts`; `bl09` con exención; personalizado en `construir-entrada.ts`; rutas `GET /excepciones/componentes`, `GET /cotizaciones/{id}/versiones/{n}/excepciones` y `POST /revisiones/{id}/excepciones/{n}/decision` |
| Base | Migración `20261005165028_excepciones` (§3); bloque condicional en `permisos-app.sql`; `probar-restauracion.mjs` comprueba la tabla nueva |
| Web | `src/excepciones/` (`modelo.ts`, `SeccionExcepciones.tsx` en el editor y `PanelExcepcionesVersion.tsx` en la revisión y la consulta de versión); reducer, serialización, huella y diferencias del borrador; vista previa con excepciones; marca «Personalizado» en la búsqueda; insignia `alerta`. La prueba `sin-datos-internos` admite `rendimiento` y `desperdicio` solo en `src/excepciones/` (documentado) |

**5. Pruebas de ESTA sesión** (registros en `D:\Proyecto_SoftArq\_work\registros\modulo10`):

| Comando o comprobación | Resultado |
|---|---|
| `pnpm verificar` | **604/604** (API 404, web 200); compilación y tipos correctos, código 0 |
| `pnpm verificar:integracion` | **252/252**, 14 archivos, un worker, en `softarq_test`: 238 anteriores, 1 de regresión del 403, 1 de deriva del esquema y 12 de excepciones. Incluyen TI-068 a TI-074, TI-088, TI-090, TI-093, TI-339, rangos, referencias, permisos, BL-17 (API y base), aislamiento, inmutabilidad, rechazo → vN+1, excepción tras aprobar (emisión bloqueada), dos revisores a la vez (200/409 con estado vigente), carrera rechazar/aprobar, `EXCEPCIONES_SIN_AUTORIZAR` en la función SQL, PDF y contenido comercial sin excepciones, PDF intacto tras decidir y privilegios mínimos |
| `pnpm verificar:e2e` (después de la integración) | **53/53**, Edge, un worker, código 0: 51 anteriores y 2 nuevas (recorrido 3 con excepción → BL-05 → autorizada → AV-04 → aprobada; registro con teclado a 390 px sin desbordes) |
| Cuatro referencias | 54,190.68, 43,312.16, 22,405.28 y 4,911.79 sin cambios (integración y E2E existentes; no se tocaron expectativas de importes) |
| `respaldo:crear` + `respaldo:verificar` antes de migrar | `softarq_dev-20261005T174447Z-ef228e`, COMPLETO y VÁLIDO, 3/3 PDF |
| `db:migrar` (desarrollo) | Código 0 |
| Humo en `softarq_dev` (API temporal en 3200, detenida al terminar) | `COT-2026-00007`: BL-05 → autorizada (12.5 pza → 13) → AV-04 → APROBADA; acentos correctos |
| `respaldo:probar-restauracion` | **38/38** (35 anteriores y 3 nuevas: relaciones y BL-17, permisos, función y disparadores, y decisiones íntegras) |
| `respaldo:probar-concurrencia` | **17/17**, con emisión y respuesta durante una instantánea abierta; PDF anteriores intactos |
| Revisión visual | Capturas en `_work\evidencias\modulo10`, revisadas una por una |
| Aprovisionamiento administrativo | **No ejecutado:** no hay credencial DPAPI en `_work\secrets`. No bloquea el módulo |

**Defectos propios hallados en la revisión visual y corregidos:**
- tras autorizar, seguía visible el bloqueo anterior «No se puede aprobar»; ahora se limpia y la E2E lo comprueba;
- la insignia «Pendiente» era verde; ahora es neutra, y «Rechazada» usa el tono de alerta.

**Expectativas cambiadas a propósito:**
- inventario OpenAPI: tres rutas y tres esquemas nuevos;
- capacidades del Preparador: `excepciones.consultar`;
- inventario de funciones SQL: `softarq_decidir_excepcion`;
- prueba `sin-datos-internos`: excepción acotada a `src/excepciones/`, con una prueba que fija sus tres archivos;
- simulaciones web con los tres métodos nuevos y `clase` en los conceptos de prueba.

No se cambiaron expectativas de reglas ni de importes.

**Datos de `softarq_dev`:**
- la prueba de humo añadió `COT-2026-00007` (DEMO) y la de concurrencia `COT-2026-00008` y `00009` (DEMO);
- nada se reparó ni se borró;
- respaldos en `D:\Proyecto_SoftArq\respaldos\softarq_dev`; PDF originales en `D:\Proyecto_SoftArq\datos\softarq_dev\documentos`.

**Abrir:**

```powershell
Set-Location D:\Proyecto_SoftArq\softarq-platform
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start   # terminal 1: http://localhost:3000 (127.0.0.1)
pnpm --filter @softarq/web dev     # terminal 2: http://localhost:5173
```

Recorrido: Preparador → Calculadora → Ejemplo 3 → «Guardar como cotización» → «Excepciones» → «Registrar excepción…» → calcular y enviar. Revisor → «Revisiones» → «Excepciones de la versión» → autorizar → aprobar. Guía X1–X8.

**Pendientes:**
- ejecución formal de la guía (todos los bloques; sin atribuirla al propietario: la revisión personal sigue siendo la declaración del 03/10/2026);
- PR-41 a PR-44 del Excel;
- aprovisionamiento administrativo de respaldo;
- en `softarq_dev` no hay conceptos personalizados (no se inventan datos de catálogo): llegarán con la administración de catálogos;
- el aviso de Vite por un chunk de unos 530 kB sigue.

**Cobertura y estimación:** [`docs/cobertura-demo.md`](docs/cobertura-demo.md): de 8 a 9 módulos para el DEMO local completo y de 1 a 2 para preparar Railway. Siguiente recomendado: catálogos (1), precios y proveedores (§7).

## 20. Administración de proveedores, productos, precios y tarifas (módulo 11)

**Sesión:** 17/10/2026, Claude Code (Claude Opus 5.5).
- **Inicio verificado:**
  - `D:\Proyecto_SoftArq\softarq-platform`, rama `main`, árbol limpio, HEAD `a454053` (antes `3412f0b` y `abe655d`); no se tocó nada ajeno;
  - Graphify VIGENTE al empezar (232 archivos), sin necesidad de reconstruir.
- **Resultados anteriores:** se conservan como reportados (604, 252, 53, 38 y 17; §19) y no se repitieron al iniciar.
- **Fuentes, en solo lectura:**
  - copia de texto del Word v1.3 y `modCatalogos.bas` en `_work\tmp\m11`;
  - `modApp.bas` (`Normalizar`).
- **MD5 del libro:** `b60debc121957b8d8e3f2c2edd9a5b4f` antes y después.
- **Plan aprobado por el propietario**, con tres adaptaciones que él mismo decidió (ADR-0015 §2):
  1. bloqueo técnico del producto con precios (vigentes, vencidos o anulados);
  2. «Cerrar vigencia y registrar sucesor» en una operación, nunca retroactiva ni ampliable; **P3 sigue pendiente con el cliente**;
  3. «Asignar tarifa» a un concepto como única dependencia del bloque de conceptos; conserva su aprobación.

**Qué puede hacer el usuario** (cuenta `[DEMO] Administrador`, función Administrador del catálogo; sección «Catálogo»):
- **Proveedores:** alta, edición de datos, desactivar y reactivar (con impacto previo), historial. Duplicado normalizado como en el libro (TI-004).
- **Productos:** alta sobre un insumo activo con presentación, unidad de compra, contenido en la unidad base y venta fraccionada. Edición técnica solo sin precios; con precios, solo la descripción. Desactivar y reactivar.
- **Precios:**
  - registro sin solape (TI-060) y búsqueda por estado (vigente, futuro, vencido o anulado) a la fecha del servidor;
  - «Cerrar vigencia y registrar sucesor», con fechas inclusivas propuestas (hoy y mañana);
  - «Anular precio erróneo» con motivo.
- **Mano de obra:** registro de tarifas UNIDAD, JORNADA o SUBCONTRATO (subcontratista opcional), desactivar y reactivar.
- **Tarifa de conceptos:** asignar otra tarifa activa de la misma unidad, con motivo y aviso del efecto.
- **Preparador:** ve las opciones nuevas sin que se elijan solas. El editor avisa «El catálogo cambió después de calcular la vN» cuando la verificación da BL-16, BL-08, BL-09 o BL-10.

**Implementación:**

| Parte | Ubicación |
|---|---|
| Contratos | `packages/contracts/src/api/catalogos-admin.ts` (interno: decimales con escala de columna, fechas reales, `null` ≠ 0); `catalogos.administrar`; 8 códigos de error nuevos y `registroVigente` en el sobre |
| API | `modules/catalogos/dominio/administracion.ts` (puro); `aplicacion/servicio-administracion.ts`; `persistencia/repositorio-administracion.ts`; `http/controladores-catalogos-admin.ts` (`/api/v1/admin`); `GET /cotizaciones/{id}/versiones/{n}/verificacion` (`servicio-revisiones.verificacionDeVersion`) |
| Base | Migración `20261017120000_administracion_catalogos` (§3); bloque condicional en `permisos-app.sql`; `repositorio-catalogos.anularPrecio` (solo pruebas) ahora exige motivo |
| Web | `src/catalogo-admin/` (servicios, campos, fechas, fallos, pantallas); ruta `#/catalogo/{vista}`; navegación «Catálogo» solo con la capacidad; `AvisoCatalogoCambiado` en `EditorCotizacion.tsx`; tipo de fallo `catalogo` en `api/cliente.ts` |
| Respaldo | `probar-restauracion.mjs`: coherencia, permisos, disparadores e índices, y registros administrativos e historial idénticos tras restaurar |

**Pruebas de ESTA sesión** (registros en `D:\Proyecto_SoftArq\_work\registros\modulo11`):

| Comando o comprobación | Resultado |
|---|---|
| `pnpm verificar` (final) | **641/641** (API 427, web 214); compilación y tipos correctos, código 0 |
| `pnpm verificar:integracion` | **271/271**, 15 archivos, un worker, `softarq_test` (252 anteriores, 18 del módulo y 1 de privilegios). La primera corrida dio 268/270: el inventario de funciones SQL (expectativa cambiada a propósito) y el ayudante `anularPrecio`, que dejó de ser repetible con el CHECK nuevo (corregido) |
| `pnpm verificar:e2e` (después de la integración) | **56/56**, Edge, un worker, código 0: 53 anteriores y 3 nuevas (recorrido del Administrador con el Preparador; asignación de tarifa con aviso BL-16 en el editor y restauración de TMO-00005; 390 px con teclado) |
| Incidencia E2E | **Intermitente, no reproducida:** una corrida completa anterior dio 55/56 con `excepciones.spec.ts:74` («No se puede aprobar» aún visible a los 10 s). Repetida dos veces con `catalogo` + `excepciones` en el mismo orden: 5/5 y 5/5; la corrida completa siguiente, 56/56. Las otras corridas fallidas fueron selectores ambiguos de la prueba nueva (corregidos) |
| Cuatro referencias | 54,190.68; 43,312.16; 22,405.28 y 4,911.79 sin cambios. 22,405.28 también se recalcula con un precio sucesor administrado (integración) |
| `respaldo:crear` + `respaldo:verificar` antes de migrar | `softarq_dev-20261017T142723Z-2d938d`, COMPLETO y VÁLIDO, 5/5 PDF |
| `db:migrar` (desarrollo) | Código 0 |
| Humo con la API real (127.0.0.1:3200, `softarq_dev`, detenida al terminar; `_work\tmp\m11\humo-catalogo.mjs`) | 17 pasos correctos (`humo-dev.log`): 403 del Preparador; alta idempotente; duplicado 409; solape 409; contenido bloqueado 422; cierre con sucesor; opción visible sin importe interno; desactivación que la retira; historial con autor |
| `db:cargar-demo` repetida | Creados `{}`; «Los valores DEMO coinciden»; los registros nuevos se conservan; conceptos con TMO-00001…005 |
| `respaldo:probar-restauracion` | **43/43** (incluye 3 nuevas del catálogo). Respaldo `softarq_dev-20261017T142914Z-48be0b`; 5 PDF con los mismos bytes; `softarq_dev` intacto |
| `respaldo:probar-concurrencia` | **No ejecutado** en esta sesión: el módulo no cambia la emisión ni las respuestas. La restauración cubre las tablas modificadas |
| Revisión visual | Capturas en `_work\evidencias\modulo11`, revisadas (escritorio 01–04, móvil 05–06) |
| `migrate diff --exit-code` | Sin diferencias (prueba de integración) |

**Defectos hallados por las pruebas y corregidos:**
- **Conflicto en el formulario de edición:**
  - **antes:** el formulario no ofrecía «Recargar el registro vigente»;
  - **corrección:** ahora lo ofrece y conserva lo escrito;
  - **regresión:** prueba web.
- **Detalle de los conflictos:** los 409 traducidos por `ejecutarIdempotente` perdían `registroVigente`. Ahora se añade (prueba de integración `CONFLICTO_TARIFA`).
- **Cambios de la revisión visual:**
  - importes internos con al menos 2 decimales, sin pasar por `number`;
  - el botón principal ya no ocupa todo el ancho;
  - el foco va al primer campo al abrir un formulario.

**Expectativas cambiadas a propósito:**
- **Inventario OpenAPI:** 14 rutas `/admin` y la verificación de versión, con sus esquemas.
- **Capacidades:** Preparador y Revisor juntos ya no suman todas las capacidades, porque `catalogos.administrar` es del Administrador del catálogo.
- **Inventario de funciones SQL:** 12 nuevas.
- **Prueba web `sin-datos-internos`:** excepción acotada a `src/catalogo-admin/`, fijada por prueba.
- **Simulaciones web:** con `verificarVersion`.

No se cambiaron expectativas de reglas ni de importes.

**Datos DEMO creados en `softarq_dev`** (solo registros nuevos marcados «[DEMO] … comprobación M11»):
- `PRV-00003`: proveedor, **inactivo** al final;
- `PCM-00012`: producto de block sobre INS-00010;
- `PRE-000018`: cerrado el 17/10/2026;
- `PRE-000019`: sucesor desde el 18/10/2026;
- `TMO-00006`: subcontrato m², **sin asignar**.

No se tocaron los proveedores, precios ni tarifas de los ejemplos, ni se asignaron tarifas a sus conceptos. No se borró ni reparó nada.

**Abrir:**

```powershell
Set-Location D:\Proyecto_SoftArq\softarq-platform
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start   # terminal 1: http://localhost:3000 (127.0.0.1)
pnpm --filter @softarq/web dev     # terminal 2: http://localhost:5173
```

**Recorrido:**
1. `[DEMO] Administrador` → «Catálogo» → Proveedores, Productos, Precios, Mano de obra o Tarifa de conceptos.
2. Preparador → Calculadora → Ejemplo 3 (opciones de INS-00010).

Guía K1–K10 (`docs/web/guia-prueba-manual.md`). Credenciales en `_work\secrets`; no copiarlas al chat.

**Graphify:**
- `pnpm grafo:actualizar` al cerrar: **VIGENTE**, 246 archivos, 3008 nodos y 6396 aristas.
- Consultas contrastadas con los `import`:
  - `explain ServicioAdministracionCatalogos` (importado por `crear-aplicacion`, el controlador y la integración);
  - `path AdministracionCatalogosController → RepositorioAdministracion` (controlador → servicio → repositorio);
  - `explain PantallaCatalogo` (importado por `Aplicacion.tsx` y su prueba).
- SQL, `schema.prisma` y `tokens.ts`, revisados con `rg`.

**Entorno:**
- **C: casi lleno:** 0,88 GB libres al empezar y unos 60 MB al terminar.
  - Mis procesos se ejecutaron con `TMP`/`TEMP` en `_work\tmp`.
  - Lo reciente en `%TEMP%` es sobre todo una descarga de actualización de VS Code (`vscode-stable-user-x64`, unos 230 MB), que no es de este trabajo y no se borró.
  - Conviene liberar espacio en C: antes de la siguiente sesión con E2E.
- **Herramientas:** sin dependencias nuevas, sin Expo, sin remoto ni push.
- **UI UX Pro Max:** se leyó `.claude/skills/ui-ux-pro-max/SKILL.md` del repositorio, no el comando personal, y se aplicó su lista de comprobación (etiquetas visibles, error junto al campo, objetivos de 44 px, sin desborde).

**Pendientes:**
- P3 con el cliente;
- restringir las columnas de `concepto` en el bloque 2;
- selector con búsqueda en «Registrar precio» si el catálogo pasa de 50 productos o proveedores;
- ejecución formal de la guía (K1–K10 y bloques anteriores; no atribuida al propietario);
- PR-41 a PR-44 del Excel;
- aprovisionamiento administrativo de respaldo;
- aviso de Vite por el chunk de unos 530 kB.

**Siguiente módulo recomendado:** catálogos (2) (§7 y `docs/cobertura-demo.md`).

## 21. Catálogo técnico y aprobación de conceptos (módulo 12)

Decisiones y reglas: [ADR-0016](docs/adr/0016-catalogo-tecnico-aprobacion-conceptos.md). Antes del módulo, commit `3599ece` con los pendientes del módulo 11.

**Pendientes del módulo 11 resueltos (`3599ece`):**
- **Fallo intermitente de `excepciones.spec.ts:74`:** causa reproducida con una prueba web de promesas controladas (registro en `_work\registros\modulo12\01-reproduccion-intermitente.log`): `alDecidir` leía un estado de envío antiguo y no limpiaba el bloqueo si la 422 de aprobar llegaba mientras se autorizaba la excepción. Corregido con actualización funcional; la E2E espera el aviso propio de la aprobación, sin esperas añadidas.
- **Selectores:** `SelectorRegistro` con búsqueda en el servidor y cursor, selección actual fuera de la página marcada «no disponible» sin sustituirla y respuestas tardías descartadas.
- **Acceso real:** `acceso-admin.integracion.test.ts` recorre todas las rutas `/admin` de OpenAPI (403 para Preparador, Revisor y Administrador del sistema, sin escrituras; 404 entre organizaciones) y respuestas comerciales reales sin datos técnicos.
- **Permisos de `concepto`:** restringidos por columna en el módulo 12.

**Qué se hizo:**

| Capa | Cambio |
|---|---|
| Base | Migración `20261018120000_administracion_conceptos` (tabla `tipo_estructura`, columnas, CHECK, índices normalizados, 8 disparadores, 13 funciones); bloque de permisos por columna en `permisos-app.sql` |
| API | `servicio-catalogo-tecnico.ts`, `repositorio-catalogo-tecnico.ts`, `controladores-catalogo-tecnico.ts`; listados de insumos y conceptos ampliados; BL-05 de trazabilidad en `construir-entrada.ts`; carga DEMO con tipos base y conceptos completos aprobados solo al crearlos |
| Contratos | `catalogos-tecnicos.ts` (escalas de columna, `null` distinto de cero, fechas reales); 5 códigos de error nuevos |
| Web | `catalogo-tecnico/PantallasTecnicas.tsx` (tres pestañas); piezas comunes en `catalogo-admin/piezas.tsx`; «Tarifa de conceptos» integrada en el detalle del concepto; excepción acotada nueva en `sin-datos-internos` |
| Respaldo | `probar-restauracion.mjs`: coherencia, permisos, 7 disparadores, 5 índices y registros idénticos del catálogo técnico |

**Pruebas de ESTA sesión** (registros en `D:\Proyecto_SoftArq\_work\registros\modulo12`):

| Comando o comprobación | Resultado |
|---|---|
| `pnpm verificar` (antes del commit 1) | API 427, web 222; código 0 |
| `pnpm verificar` (final) | **667/667** (API 436, web 231); código 0. Cambios intencionados de expectativas: inventarios de `sin-datos-internos`, de funciones SQL y de rutas OpenAPI; rutas web del catálogo; fixtures de pruebas que creaban conceptos sin tipo ni regla |
| Integración completa (un worker, `softarq_test`) | **292/292**, 17 archivos (17 nuevas del módulo, 9 unitarias aparte). La primera corrida tuvo 2 fallos esperables (deriva de dos índices sin declarar en `schema.prisma` y el inventario de funciones), corregidos |
| E2E completa (Edge, un worker) | **59/59** (3 nuevas: catálogo técnico con aprobación por el creador y vuelta a Borrador; personalizado cotizado con excepción hasta la aprobación de la versión; 390 px con teclado) |
| Cuatro referencias | 54,190.68; 43,312.16; 22,405.28; 4,911.79 sin cambios (integración y humo) |
| Respaldo antes de migrar `softarq_dev` | `softarq_dev-20261017T194652Z-d315cb`, COMPLETO; **VÁLIDO, pero verificado después de migrar** por un error de orden (faltaba la carpeta en `respaldo:verificar`); el respaldo no cambió |
| `db:migrar` (desarrollo) | Código 0; heredados marcados: exactamente CON-00001, 00002, 00007, 00008 y 00009 (aprobados, sin tipo) |
| `db:cargar-demo` (dos veces) | Primera: creados `{"tipoEstructura":6}`; repetida: `{}`; «Los valores DEMO coinciden» |
| Humo con la API real (127.0.0.1:3200, detenida al terminar; `_work\tmp\m12\humo-m12.mjs`) | **33 pasos correctos**: 403 del Preparador; cuatro totales; heredado con requisitos y edición sin completar 422; TES-00007, INS-00012 y conversión; CON-00003 aprobado por su creador (reintento reproducido) y vuelta a Borrador; personalizado CON-00004 cotizado con excepción, autorizada (AV-04), versión aprobada y **emitida** (`COT-2026-00010`, PDF DEMO); el concepto sigue en Borrador |
| `respaldo:probar-restauracion` | **47/47** (3 nuevas del catálogo técnico); 6 PDF |
| Revisión visual | Capturas en `_work\evidencias\modulo12` revisadas (escritorio 02, 03, 04; móvil 09) |
| Graphify | `pnpm grafo:actualizar`; estado VIGENTE (260 archivos); `explain ServicioCatalogoTecnico` y `path` del controlador al repositorio correctos |
| MD5 del libro | `b60debc121957b8d8e3f2c2edd9a5b4f` antes y después |

**Incidencias y límites:**
- `npx eslint` descargó ESLint en la caché de npm de `_work` (el repositorio no tiene ESLint); no se añadió como dependencia.
- La marca de aprobación del disparador protege de escrituras directas accidentales, no de quien ya ejecuta SQL arbitrario con el rol de la aplicación (ADR-0016 §5).
- El impacto mostrado cuenta cotizaciones abiertas; no cuenta aparte versiones sin enviar.
- Tipos de costo adicional siguen solo con la carga DEMO.

**Datos DEMO creados en `softarq_dev`:** TES-00007, INS-00012, CON-00003 (Borrador tras el cambio técnico), CON-00004 (personalizado, Borrador), `COT-2026-00010` emitida. Ninguno altera los ejemplos de referencia.

## 22. Parámetros y personas (módulo 13)

Decisiones y reglas: [ADR-0017](docs/adr/0017-parametros-personas-permisos.md). Antes del módulo, commit `b3b785d` con tres correcciones previas.

**Correcciones previas (`b3b785d`):**
- **Migración protegida:** `db:migrar` en `softarq_dev` crea un respaldo, lo verifica y solo entonces migra (`secuencia-migracion.mjs`). Si cualquiera de los dos pasos falla, se detiene sin migrar. La prueba con datos reales usa una copia alterada del último respaldo en `_work\tmp`. **Límite:** no impide `prisma migrate deploy` manual ni SQL administrativo.
- **Permisos efectivos:** sin UPDATE en `organizacion` ni `tipo_adicional`; en `parametros_calculo`, solo las columnas editables. Sin UPDATE de `estado` ni `aprobado_*` de `concepto`; la marca GUC desaparece. Aprobar solo en `softarq_aprobar_concepto` y `softarq_aprobar_carga_base` (DEFINER). Los ayudantes de prueba que forzaban estados pasan al rol migrador (cambio intencionado). Matriz y capacidad residual en ADR-0017 §4.
- **Impacto en versiones:** borradores, últimas versiones sin enviar, en revisión y aprobadas sin emitir, más el número de cotizaciones distintas; las emitidas no cuentan. Consulta de solo lectura.

**Qué se hizo en el módulo:**

| Capa | Cambio |
|---|---|
| Base | Migración `20261019120000_parametros_personas`: plantillas `texto_*` (textos DEMO exactos), revisión y autoría en parámetros y pertenencias, `contrasena_temporal_expira_en`, disparador del último Administrador del sistema, `softarq_editar_parametros` (INVOKER) y cuatro funciones DEFINER de identidad; bloque de permisos en `permisos-app.sql` |
| API | `controladores-administracion.ts`, `servicio-administracion-sistema.ts`, `repositorio-administracion-sistema.ts`; `POST /auth/contrasena`; sesión restringida en `GuardiaSesion` (`@PermitidaConCambioPendiente`); `TEMPORAL_CADUCADA` al entrar; textos predeterminados leídos de la configuración |
| Contratos | `administracion.ts` (fracciones en texto, `null` distinto de 0, personas, credencial, cambio de contraseña); capacidades `parametros.administrar` y `personas.administrar`; 6 códigos de error |
| Web | Sección «Administración» (`administracion/`): Parámetros y Personas y funciones; `PantallaCambioContrasena`; excepción acotada nueva en `sin-datos-internos` (solo recargo y costo, en esa carpeta) |
| Respaldo | `probar-restauracion.mjs`: 4 comprobaciones nuevas (coherencia, permisos y funciones, datos idénticos, sin sesiones activas y temporal solo como hash) |

**Qué puede hacer cada función:**
- **Preparador, Revisor:** sin cambios; no ven «Administración» (403 en `/admin`).
- **Administrador del catálogo:** catálogo (módulos 11 y 12); 403 en parámetros y personas.
- **Administrador del sistema:** emisor, parámetros y personas; 403 en el catálogo. La cuenta DEMO `[DEMO] Administrador` tiene ambas funciones.

**Pruebas de ESTA sesión** (registros en `D:\Proyecto_SoftArq\_work\tmp\m13`):

| Comando o comprobación | Resultado |
|---|---|
| `pnpm verificar` (final) | **708/708** (API 452, web 256); código 0 |
| Integración completa (un worker, `softarq_test`) | **307/307**, 19 archivos. Antes de actualizar expectativas: 303/304 (inventario de funciones SQL) y, tras añadir las rutas a OpenAPI, la huella de `acceso-admin` (contaba revocaciones por inicio de sesión; ahora solo las administrativas) |
| E2E completa (Edge, un worker) | **63/63** (4 nuevas: parámetros en % con impacto y vuelta a la referencia; alta con temporal, acceso restringido por la API y cambio; desactivación con sesión abierta en otro navegador; 390 px) |
| Cuatro referencias | 54,190.68; 43,312.16; 22,405.28; 4,911.79 sin cambios (integración y humo) |
| `db:migrar` protegido en `softarq_dev` | Respaldo `softarq_dev-20261018T035605Z-5c0134` creado y **verificado antes** de aplicar `20261019120000_parametros_personas`; código 0 |
| `db:cargar-demo` y `db:cargar-usuarios-demo` repetidos | Creados `{}`; «Los valores DEMO coinciden»; cuentas conservadas sin cambios (ni contraseñas ni funciones) |
| Humo con la API real (127.0.0.1:3200, detenida al terminar; `_work\tmp\m13\humo-m13.mjs`) | **32 pasos correctos**: 403 del Preparador; cuatro totales; recargo 18 % (22,032.08) y vuelta a 20 % (22,405.28) con historial de ambos cambios; 409 por revisión obsoleta; alta con temporal, reintento sin otra contraseña, correo repetido 409; acceso restringido (403), cambio propio (204), sesión revocada, temporal inválida, acceso con la nueva; función Revisor visible en la petición siguiente; desactivación que invalida la sesión abierta; autoprotección 422 |
| `respaldo:probar-restauracion` | **51/51** (4 nuevas) |
| Revisión visual | Capturas en `_work\evidencias\modulo13` revisadas (escritorio: parámetros, confirmación, temporal, cambio obligatorio; móvil: parámetros, personas, alta). Corregido: un correo largo se recortaba a 390 px |
| Graphify | `pnpm grafo:actualizar`: VIGENTE (276 archivos). `explain ServicioAdministracionSistema`, `explain migrarConRespaldo`, `explain impactoVersiones` y `path` del controlador al repositorio correctos; la consulta libre devolvió nodos poco pertinentes |
| MD5 del libro | `b60debc121957b8d8e3f2c2edd9a5b4f` antes y después |

**Datos DEMO creados en `softarq_dev`:** la persona `humo.m13.cdf0d6@softarq.test` («[DEMO] Persona humo M13 …», desactivada) y dos eventos `PARAMETROS_EDITADOS` (20 % → 18 % → 20 %). La configuración de referencia quedó igual.

**Límites y pendientes:**
- Las funciones de la base confían en el `p_usuario` que reciben; una credencial de aplicación comprometida puede suplantar a cualquier miembro. Es un límite de arquitectura, documentado y no resuelto (ADR-0017 §4); sin RLS.
- Si se pierde la contraseña temporal no hay recuperación: hace falta un restablecimiento. Entrega manual, sin correo.
- La guía manual (P1–P6, U1–U8) no se ha ejecutado formalmente; la revisión personal sigue registrada solo como declaración (no cuenta como PR-41 ni PR-44).
- Los cinco conceptos heredados siguen sin regularizar; P3 sigue pendiente con el cliente.

## 23. Salidas internas de solo lectura (módulo 14)

Decisiones y reglas: [ADR-0018](docs/adr/0018-salidas-internas.md). Sobre `7072d13`. Plan aprobado por el propietario con tres decisiones: `salidas.consultar` solo para Preparador y Revisor (cambio intencionado frente a la protección de costos del ADR-0009); indicadores solo de la versión (contadores de 00 INICIO pendientes); sin exportación.

**Fuentes leídas (solo lectura, en memoria):** Word §1.3, RF-16, §3.4–3.6, §3.14 («3 bultos para P001 y 17 para P002 … $2,900.00»; prorrateo con 4 decimales truncados), §5.5, D-07, D-09, D-10, D-19, D-20; libro: 12 COMPRAS, 13 DETALLE_CALCULO, 10 COTIZAR (resumen), 14 REVISION (A7), 00 INICIO. Ninguna fuente restringe quién ve 12, 13 o 14, define indicadores agregados ni exporta informes.

**Qué se hizo:**

| Capa | Cambio |
|---|---|
| Base | Migración `20261020120000_salidas_internas`: `cotizacion_version.referencias_internas` (JSONB NULL, CHECK de objeto) y `softarq_crear_version` con la columna (misma firma y SECURITY INVOKER). Sin permisos nuevos |
| API | `dominio/salidas-internas.ts` (lectura validada de la instantánea, armado, sumas por categoría con `Dec`, conciliación, NO_APLICA/NO_DISPONIBLE); `servicio-salidas-internas.ts` (READ ONLY, REPEATABLE READ); `obtenerVersionInterna` con consultas planas y en serie; `RepositorioCatalogos.leerReferencias` en la fase A; `SalidasInternasController`; capacidad en `capacidades.ts`; OpenAPI |
| Contratos | `api/salidas-internas.ts`; `salidas.consultar` en `CAPACIDADES` |
| Web | `salidas-internas/PantallaSalidasInternas.tsx` (rutas `…/v/{n}/interno/{compras,detalle,indicadores}`, selector de versión, marca «Uso interno», estados); enlaces en la versión y la revisión; `refrescar()` de la sesión tras un 403; `redondearDecimales` y `truncarDecimales` sin `number`; estilos; excepción acotada en `sin-datos-internos` |
| E2E | Cuenta `retiro.e2e@softarq.test` (Revisor) y `ajustar-base funciones <correo> <FUNCIONES>` para retirar funciones con la pantalla abierta |
| Respaldo | `probar-restauracion.mjs`: 2 comprobaciones nuevas (columna, CHECK, función, inmutabilidad y permisos; referencias íntegras) |

**Quién consulta qué:**
- **Preparador y Revisor** (y cualquier persona con alguna de esas funciones): compras, detalle e indicadores de cualquier versión de su organización.
- **Administrador del catálogo y Administrador del sistema** sin otra función: 403 (sin enlace; «Sin permiso» por ruta directa). Conservan sus accesos administrativos.
- Persona desactivada: 401. Función retirada: 403 en la petición siguiente y la web deja de ofrecer el enlace. Temporal pendiente: 403 `CAMBIO_CONTRASENA_REQUERIDO`. Otra organización: 404.

**Datos históricos disponibles:** cifras completas de todas las versiones (entrada y resultado congelados desde el módulo 6). Nombres y vigencias solo en versiones creadas desde este módulo. En `softarq_dev`, `COT-2026-00001` a `00010` (10 versiones) muestran solo códigos y `COT-2026-00011` a `00014` tienen referencias.

**Pruebas de ESTA sesión** (registros en `D:\Proyecto_SoftArq\_work\tmp\m14`):

| Comando o comprobación | Resultado |
|---|---|
| `pnpm verificar` (final) | **742/742** (API 470, web 272); código 0. Tras el último ajuste visual, web repetida: tipos y 272/272 |
| Integración completa (un worker, `softarq_test`) | **327/327**, 20 archivos (20 nuevas del módulo). Primera corrida 323/326: 2 fallos de mi prueba (columna inexistente en la huella; los precios no se editan por disparador) y el inventario de capacidades de `autenticacion.integracion.test.ts` (cambio intencionado: el Preparador recibe `salidas.consultar`) |
| E2E completa (Edge, un worker) | **67/67** (4 nuevas). La primera corrida mostró un aviso de `pg` («client.query() when the client is already executing a query»), reproducido con `--trace-deprecation`. Causa: `revisionesDeVersiones`, con relaciones anidadas, dentro de la transacción interactiva. Corregido con consultas planas; la corrida final no lo muestra. Después, el spec del módulo se repitió (4/4) tras compactar la tabla de compras |
| Unitarias del módulo | 17 de dominio con `ESPERADO_3_14` (K01–K03, prorrateo de K02, 3 + 17 = 20 bultos, $2,900.00, mano de obra UNIDAD/JORNADA, margen 16.67 %, NO_APLICA, SIN_NOMBRES, NO_DISPONIBLE, excepción autorizada); 12 de pantalla; 2 de formato; 1 de capacidades |
| Cuatro referencias | 54,190.68; 43,312.16; 22,405.28; 4,911.79, con unidades por producto de R1 (47/6/19) y R2 (4.5): integración y humo |
| `db:migrar` protegido en `softarq_dev` | Respaldo `softarq_dev-20261019T054402Z-9d6c60` creado y **verificado antes** de aplicar `20261020120000_salidas_internas`; código 0 |
| `db:cargar-demo` repetido | Creados `{}`; «Los valores DEMO coinciden» |
| Humo con la API real (127.0.0.1:3200, detenida al terminar; `humo-m14.mjs`) | **69 pasos correctos**: capacidades por función; `COT-2026-00004-v1` (emitida, anterior al módulo) SIN_NOMBRES con solo códigos; Revisor 200; Administrador 403 sin datos internos; 404; huella del negocio idéntica antes y después de consultar; cuatro cotizaciones DEMO nuevas (`COT-2026-00011` a `00014`) con referencias, totales, unidades, conciliación y versión comercial sin datos internos |
| `respaldo:probar-restauracion` | **53/53** (2 nuevas) |
| Revisión visual | Capturas en `_work\evidencias\modulo14` revisadas (escritorio 01–06, móvil 07–09). Corregido: la tabla de compras cortaba la última columna y partía palabras; la etiqueta de impuestos repetía «Impuesto» |
| Graphify | `pnpm grafo:actualizar`: VIGENTE (284 archivos). `explain ServicioSalidasInternas`, `explain salidas-internas.ts`, `explain PantallaSalidasInternas` y `path SalidasInternasController → construirSalidasInternas` correctos. `salidas.consultar` es una cadena: verificada con `rg` (7 archivos) |
| MD5 del libro | `b60debc121957b8d8e3f2c2edd9a5b4f` antes y después |

**Datos DEMO creados en `softarq_dev`:** clientes, proyectos y cotizaciones `[DEMO] … humo M14` (`COT-2026-00011` a `00014`, v1 sin enviar). Catálogo y parámetros sin cambios.

**Límites y pendientes:**
- Identidad de las funciones SQL (ADR-0017 §4): sin resolver; tarea separada con objetivo, límites y pruebas en ADR-0018 §7. El módulo no amplía la capacidad residual: solo SELECT con `softarq_app`, sin funciones ni concesiones nuevas.
- Contadores de 00 INICIO y exportación de informes: fuera de este módulo (ADR-0018 §2).
- La guía manual (I1–I8) no se ha ejecutado formalmente. La revisión personal sigue registrada solo como declaración y no cuenta como PR-41 ni PR-44, que siguen pendientes.
- Los cinco conceptos heredados siguen sin regularizar; P3 sigue pendiente con el cliente.
- Si el propietario tiene una API o una web en marcha con código anterior, debe recompilar y reiniciar: `softarq_dev` ya tiene la migración del módulo 14. La función `softarq_crear_version` nueva acepta la llamada anterior, que deja `referencias_internas` en NULL.

## 24. Duplicar, modo de precios y vista previa BORRADOR (módulo 15)

Decisiones y reglas: [ADR-0019](docs/adr/0019-duplicar-modo-precios-vista-previa.md). Sobre `edf4cd8` (módulo 14). Plan aprobado por el propietario con cuatro decisiones (ADR-0019 §2):
- **duplicar** desde una versión concreta (cualquier estado) o desde el borrador guardado (ampliación frente al libro);
- **modo de precios** obligatorio para la versión nueva tras una emisión;
- **vista previa** con `cotizaciones.consultar`, solo de versiones Borrador, En revisión o Aprobada con cálculo vigente;
- **datos** congelados de la versión y actuales del emisor, el cliente y el proyecto, con auditoría VISTA_PREVIA.

**Fuentes leídas (solo lectura):** `modHistorial.bas` (`His_Duplicar`, `His_NuevaVersion`, `Ver_CopiarContenido`), `modPdf.bas` (`BTN_VistaPrevia`, `Pdf_Generar`), `modCompras.bas` (`Sel_Estado`), `modValidacion.bas`; Word §1.6, §3.8, §3.9, §3.11–3.13, D-17, RF-20/21/22; TI-130 a TI-137, TI-155, TI-058 y TI-324.

**Corrección de la cobertura:** `docs/cobertura-demo.md` llamaba B-33 a «Duplicar». En el libro, B-33 es «Abrir», B-34 «Nueva versión», B-35 «Duplicar» y B-25 «Vista previa PDF».

**Qué se hizo:**

| Capa | Cambio |
|---|---|
| Base | Migración `20261021120000_duplicar_modo_vista_previa`:<br>• columnas de origen en `cotizacion`, de ciclo en `cotizacion_borrador` y de modo y origen en `cotizacion_version`, con tres CHECK;<br>• `idempotencia_recurso_ck` ampliado;<br>• funciones INVOKER `softarq_ultima_emitida`, `softarq_requiere_nueva_version`, `softarq_duplicar_cotizacion`, `softarq_preparar_nueva_version` y `softarq_registrar_vista_previa`;<br>• `softarq_guardar_borrador` y `softarq_crear_version` reemplazadas con la misma firma.<br>Bloque condicional en `permisos-app.sql`: UPDATE de las columnas `ciclo_*` y EXECUTE de las funciones nuevas |
| Contratos | `EsquemaDocumentoBorrador`; solicitudes de duplicado y versión nueva; `duplicadaDe` y `nuevaVersion` en el detalle; `modoPrecios` y `versionOrigen` en la versión; códigos `NUEVA_VERSION_SIN_PREPARAR`, `NUEVA_VERSION_NO_APLICA`, `SELECCIONES_DIVERGENTES` y `VISTA_PREVIA_BLOQUEADA` |
| PDF | Generador con variante BORRADOR:<br>• franja, marca de agua y pie en cada página;<br>• «[EMISOR PENDIENTE]» y «Sin emitir».<br>**El EMITIDO es byte a byte igual:** `pdf.test.ts` compara su SHA-256 con el calculado antes del cambio (`6bbe7811…24c3a6`) |
| API | `dominio/duplicacion.ts`, `dominio/vista-previa.ts`, `servicio-vista-previa.ts` (estado fuera de la transacción; lectura READ ONLY con `bl16`; auditoría después de generar). Rutas:<br>• `POST /cotizaciones/{id}/duplicados`;<br>• `POST /cotizaciones/{id}/nueva-version`;<br>• `POST /cotizaciones/{id}/versiones/{n}/vista-previa`.<br>Comprobación previa del ciclo al guardar y calcular; OpenAPI |
| Web | `cotizaciones/duplicar-modo-vista-previa.tsx`: panel para duplicar, aviso de duplicada, panel «Preparar la versión nueva» con diferencias, aviso del ciclo y vista previa (descargar y abrir). Integrado en el editor y en la versión. `enviarDescarga` en `cliente.ts` |
| Respaldo | `probar-restauracion.mjs`: 2 comprobaciones nuevas (origen coherente, CHECK, funciones y permisos mínimos; datos íntegros) |

**Pruebas de ESTA sesión** (registros en `D:\Proyecto_SoftArq\_work\tmp\m15`):

| Comando o comprobación | Resultado |
|---|---|
| `pnpm verificar` (final) | **768/768** (API 487, web 281); código 0 |
| Integración completa (un worker, `softarq_test`) | **350/350**, 21 archivos (23 nuevas del módulo). La primera corrida, sin el archivo del módulo, dio 324/327 por tres cambios intencionados: el inventario de columnas y funciones de `migraciones.integracion.test.ts`, y `respuestas.integracion.test.ts`, que calculaba una v2 tras emitir sin preparar la versión nueva. Ahora la prepara |
| E2E completa (Edge, un worker) | **71/71** (4 nuevas). Tras corregir el aviso del panel (ver revisión visual), el spec del módulo se repitió: 4/4 |
| Unitarias del módulo | 4 de PDF: huella del EMITIDO, BORRADOR multipágina, datos ausentes y sin datos internos. 13 de dominio. 8 de pantalla |
| Cuatro referencias | 54,190.68; 43,312.16; 22,405.28; 4,911.79, leídas del texto del PDF BORRADOR en la integración y en el humo |
| `db:migrar` protegido en `softarq_dev` | Respaldo `softarq_dev-20261019T071836Z-70dbfc` creado y **verificado antes** de aplicar la migración; código 0 |
| `db:cargar-demo` (dos veces) | Creados `{}`; «Los valores DEMO coinciden» |
| `respaldo:probar-restauracion` | **55/55** antes del humo. Después, con datos del módulo, **57/57**: 12 duplicadas, 1 versión con modo y 2 PDF más. Una corrida intermedia falló por `EPERM` al renombrar la carpeta del respaldo, por un bloqueo transitorio de Windows; la repetición pasó. Queda la carpeta incompleta `respaldos\softarq_dev\softarq_dev-20261019T072724Z-2fbd68.en-curso`, que no se borró |
| Humo con la API real (127.0.0.1:3200, detenida al terminar; `humo-m15.mjs`) | **108 pasos correctos**:<br>• PDF originales `COT-2026-00004`…`00010` con su SHA-256 antes y después;<br>• huella de las cotizaciones previas sin cambios;<br>• vista previa de las cuatro referencias: cabeceras, importes, marca en cada página, sin datos internos ni metadatos de autor, un evento por clave;<br>• Administrador: vista previa sí, duplicar 403;<br>• duplicar el borrador y la versión: la copia exige elegir precios (`CAPTURA_INCOMPLETA`);<br>• aprobada: nombra a quien aprobó; emitida: BL-19;<br>• `NUEVA_VERSION_SIN_PREPARAR`; CONSERVAR → v2 con 54,190.68, modo y origen; el PDF de v1 no cambió;<br>• ELEGIR_DE_NUEVO deja las selecciones vacías; el paso no se repite en el ciclo.<br>Los seis históricos emitidos piden ahora preparar la versión nueva |
| Revisión visual | Capturas en `_work\evidencias\modulo15` (escritorio 01–05, móvil 06–07) y página del PDF BORRADOR convertida a PNG con pdfjs. **Corregido:** el aviso «Elija el modo de precios» seguía visible después de elegir el modo; ahora se borra al corregir, con una prueba añadida |
| MD5 del libro | `b60debc121957b8d8e3f2c2edd9a5b4f` antes y después |

**Incidencias del humo, sin fallo del producto:**
- La primera corrida arrancó la API con `PORT=3200`, pero la variable correcta es `API_PORT`: escuchó en 3000 unos segundos y se detuvo sin usarse. No había otro servidor en 3000.
- Cinco corridas se interrumpieron por errores del propio script: el campo del proyecto, el código esperado, el límite de 30 cálculos por minuto (después se usó `API_LIMITE_CALCULO_POR_MINUTO=200` solo en la API temporal), la lectura del PDF y la descripción del proyecto exigida por BL-02.

**Datos DEMO creados en `softarq_dev`:** 40 cotizaciones `[DEMO] … humo M15` (`COT-2026-00015` a `00054`), por las seis corridas. De ellas, 12 son duplicadas y 2 tienen la v1 emitida; `COT-2026-00049` tiene la v2 con CONSERVAR. Catálogo y parámetros sin cambios; los ejemplos históricos no se tocaron.

**Límites y pendientes:**
- Identidad de las funciones SQL (ADR-0017 §4): sigue sin resolver. Las tres funciones nuevas confían en `p_usuario` como las demás y no amplían la capacidad residual (ADR-0019 §7).
- **Borradores emitidos antes del módulo:** piden preparar la versión nueva al abrirlos. Si sus selecciones ya difieren de las emitidas, la API muestra las diferencias y no cambia nada sin confirmación.
- La vista previa no se guarda ni se lista; la bitácora registra que se generó, no que alguien la leyera.
- La guía manual (D1–D10) no se ha ejecutado formalmente. La revisión personal sigue registrada solo como declaración y no cuenta como PR-41 ni PR-44, que siguen pendientes.
- Los cinco conceptos heredados siguen sin regularizar; P3 sigue pendiente con el cliente. Contadores de 00 INICIO, RF-26 y exportación de informes: sin cambios (la exportación es una mejora opcional fuera del alcance).
- Si el propietario tiene una API o una web en marcha con código anterior, debe recompilar y reiniciar: `softarq_dev` ya tiene la migración, y la API anterior no puede guardar borradores emitidos sin el ciclo.

## 25. Traslado a la laptop (24/10/2026)

Historial del equipo original (disco `D:`, §1–§24) conservado. Esta sección describe el entorno actual. Sin cambios de reglas de negocio, de Prisma (PostgreSQL) ni del módulo 15.

**Rutas**

| Elemento | Ruta |
|---|---|
| Raíz trasladada | `C:\Proyecto_SoftArq\Proyecto_SoftArq` (la doble carpeta es intencionada) |
| Repositorio | `C:\Proyecto_SoftArq\Proyecto_SoftArq\softarq-platform` |
| Temporales, cachés, almacén de pnpm, evidencias | `<raíz>\_work` (relativas en `pnpm-workspace.yaml` y `.npmrc`) |
| Documentos originales (`SOFTARQ_DIR_DOCUMENTOS`) | `<raíz>\datos\softarq_dev\documentos` |
| Respaldos | `<raíz>\respaldos\softarq_dev` |
| PostgreSQL | `C:\Program Files\PostgreSQL\18` (servicio `postgresql-x64-18`, puerto 5432) |
| Graphify | venv `_work\graphify-venv` |

**Versiones realmente usadas:** Git 2.55.0 (reutilizado), Node 24.11.1 y pnpm 11.1.3 (instalados con winget y `npm i -g pnpm@11.1.3`), PostgreSQL 18.6 (winget `PostgreSQL.PostgreSQL.18` 18.6-5, mismo servidor y `pg_dump` que el origen), Python 3.14.6 (reutilizado), Graphify `graphifyy` 0.8.5, Edge 156 (reutilizado; canal `msedge` de Playwright). MySQL 8.0 (puerto 3306) está instalado y no se usó ni se tocó. No se instalaron Docker, Android Studio, emuladores ni Expo. Dependencias: `node_modules` reconstruido con `pnpm install --frozen-lockfile` desde el almacén copiado (los enlaces y shims apuntaban a `D:`).

**Git:** `main`, árbol limpio al llegar, sin remoto; sin aviso de propiedad dudosa (no hizo falta `safe.directory`).

**Cambios versionados de portabilidad**
- `apps/api/scripts/respaldo/comun.mjs`, `scripts/db/aprovisionar.ps1`, `aprovisionar-respaldo.ps1`: herramientas de PostgreSQL desde `SOFTARQ_PG_BIN`, `%ProgramFiles%\PostgreSQL\18\bin` o, por último, `D:\Postgres18\bin`.
- `scripts/grafo/grafo.mjs`: usa `_work\graphify-venv` si existe.
- Nuevo `apps/api/scripts/respaldo/inicializar-desarrollo.mjs` (+ prueba y script `respaldo:inicializar-desarrollo`): ver `docs/operacion/respaldo-y-restauracion.md` §5.1. `restaurar.mjs` y sus guardas no se modificaron.
- Documentación: `AGENTS.md` §1, `CLAUDE.md`, `README.md`, `apps/api/README.md`, `docs/herramientas/graphify.md` §7.2. Las menciones `D:` en informes, ADR, manifiestos y este historial son históricas y se conservan.

**Credenciales (ubicación, nunca valores)**
- `apps/api/.env`, `.env.test` y `.env.respaldo`: generados en esta laptop (contraseñas nuevas de `softarq_migrator`, `softarq_app` y `softarq_respaldo`); fuera de Git.
- Los `.env` del equipo original se apartaron sin leerlos en `_work\secrets\equipo-original\`.
- Cuentas DEMO de la aplicación: `_work\secrets\accesos-demo-softarq_dev.json` (copiado del origen; sus hashes se restauraron sin cambios y las contraseñas siguen vigentes). No se restableció ninguna.
- La contraseña de `postgres` no se guardó: se capturó con DPAPI (`_work\secrets\postgres-admin.dpapi`) y el archivo se eliminó al terminar (comprobado).

**Aprovisionamiento y restauración ejecutados**
1. Diagnóstico de solo lectura: ningún rol ni base `softarq_*` previos.
2. `aprovisionar.ps1`: roles `softarq_migrator`, `softarq_app`; bases `softarq_dev`, `softarq_test`, `softarq_shadow`. `aprovisionar-respaldo.ps1`: rol `softarq_respaldo` y base `softarq_restauracion`. `comprobar-conexion.mjs`: 5/5 conexiones OK, sin privilegios especiales. `pg_hba.conf` y `postgresql.conf` sin tocar (por defecto: solo conexiones locales con scram-sha-256).
3. `pnpm respaldo:verificar` sobre `respaldos\softarq_dev\softarq_dev-20261023T224027Z-22f32d`: VÁLIDO, código 0 (`base.dump` 522.278 B y SHA-256 coinciden; 8 PDF, 190.761 B, coinciden; commit `31cf626`). El manifiesto no se editó: `origen.carpetaDocumentos` conserva `D:` como procedencia; la verificación resuelve los PDF relativos a la carpeta del respaldo. La carpeta `...072724Z-2fbd68.en-curso` no se usó ni se borró.
4. `respaldo:inicializar-desarrollo`: `softarq_dev` restaurada en una base nueva y vacía; 13 migraciones iguales al repositorio (última `20261021120000_duplicar_modo_vista_previa`); 37 sesiones revocadas; 8 PDF comprobados (0 copiados). Un segundo intento se rechazó (420 objetos en `public`) y sin `--confirmar` también.
5. Estado de `softarq_dev` (consultas de solo lectura): las 30 tablas del manifiesto con los mismos conteos (54 cotizaciones, 8 emisiones, 4 usuarios con hash Argon2id…); `softarq_app` sin UPDATE/DELETE en `emision`, sin UPDATE en `cotizacion_version`, sin acceso a `_prisma_migrations`, sin DELETE/TRUNCATE en ninguna tabla; `softarq_respaldo` con SELECT en las 31 tablas y sin escritura; 2 disparadores de inmutabilidad en `emision`; 0 sesiones activas; tablas del migrador. `softarq_test` y `softarq_shadow` no recibieron datos de desarrollo. No se ejecutó ninguna carga DEMO.

**Pruebas realmente ejecutadas en esta laptop (24/10/2026)**

| Comprobación | Resultado |
|---|---|
| `pnpm verificar` (build, tipos, unitarias) | Final: API **502/502** (487 de referencia + 15 de la inicialización) y web **281/281**; build y tipos sin errores. Dos corridas intermedias fallaron por **tiempo/carga**, no por lógica: la prueba que copia y verifica el último respaldo real superó 5 s en frío (aislada: 1,3 s) y una aserción síncrona de `salidas-internas.test.tsx` falló una vez (aislada 3/3). No se modificaron pruebas ni expectativas; repetidas, pasan. Las dos son sensibles a carga en este equipo |
| Integración (un worker, solo `softarq_test`) | **350/350**, 21 archivos, 369 s |
| E2E (Edge, un worker) | **71/71**, 9,3 min |
| `respaldo:probar-restauracion` | **57/57**. Creó el primer respaldo real de la laptop (`softarq_dev-20261024T023130Z-d11892`, COMPLETO) y comprobó `softarq_dev` y sus documentos intactos |
| Guardas del respaldo e inicialización | 36/36 (dentro de las 502) |
| Humo de solo lectura con la API real en `softarq_dev` (127.0.0.1:3000) | `/health` OK; inicio de sesión de Preparador, Revisor y Administrador (funciones y capacidades esperadas); el Preparador lista las 54 cotizaciones; **descarga autenticada de `COT-2026-00004-v1`: 24.178 B, mismos bytes y SHA-256 que el respaldo**; sin sesión 401; Revisor no puede calcular (403) y consulta la bandeja; Administrador consulta parámetros. Sesiones cerradas |
| Web | `http://localhost:5173` respondió 200 («SoftArq · Cotizador DEMO») |
| Cuatro totales de referencia | Cubiertos por la integración y las unitarias con fecha controlada (`RelojFijo`); no se alteró la fecha del sistema ni datos. El cálculo con la fecha real de hoy depende de las vigencias del catálogo y no se forzó |
| Cotizaciones nuevas | Ninguna en `softarq_dev` (siguen 54). Los recorridos de escritura se validaron solo en `softarq_test` |

**Documentos (8 PDF):** `datos\softarq_dev\documentos\emisiones\<org>\` coincide con el manifiesto y con el respaldo (16/16 tamaños y SHA-256). `documentos:revisar` sin ausentes ni dañados. No se regeneró ni modificó ningún registro. Las rutas absolutas guardadas son claves relativas (`emisiones/<org>/<emisión>.pdf`) resueltas contra `SOFTARQ_DIR_DOCUMENTOS`, así que no hubo que ajustar la base.

**Cómo iniciar el proyecto** (desde `softarq-platform`, con `node` y `pnpm` en el PATH; en una terminal nueva o recargando el PATH)
```
# Terminal 1: API (127.0.0.1:3000, softarq_dev)
pnpm --filter @softarq/contracts build; pnpm --filter @softarq/api build; pnpm --filter @softarq/api start
# Terminal 2: web → http://localhost:5173
pnpm --filter @softarq/web dev
```
Cuentas: `_work\secrets\accesos-demo-softarq_dev.json`. Respaldo antes de migrar o cargar datos: `pnpm --filter @softarq/api respaldo:crear` y `respaldo:verificar <carpeta>`.

**Ajustes para 8 GB (i7-4500U):** un agente; build/tipos/unitarias, integración y E2E en secuencia y con un worker; no ejecutar API, web y pruebas a la vez; `TEMP`/`TMP` apuntan a `_work\tmp`; el motor de Prisma se descarga en `%APPDATA%\Prisma` (limitación conocida, §6.1). La suite completa de unidades tarda ~4 min; la integración ~6 min y la E2E ~9 min.

**Graphify y skills:** Graphify 0.8.5 en el venv; el grafo se reconstruyó desde cero (294 archivos, 3.855 nodos, 8.342 aristas, 0 rutas `D:`; `grafo:estado` VIGENTE). **Al trasladar el proyecto, borrar `graphify-out/` antes de `pnpm grafo:actualizar`** (la caché copiada arrastra rutas viejas; `docs/herramientas/graphify.md` §7.2). SQL, `schema.prisma` y los `tokens.ts` siguen necesitando lectura dirigida. Skills de proyecto (`.claude/skills`, `.agents/skills`: ui-ux-pro-max, caveman, grill-me, grilling) presentes y reconocidas; no se reinstalaron ni se tocaron comandos personales (esta laptop no tiene `~/.claude/commands`).

**Limitaciones y pendientes**
- Conservados: conceptos heredados (CON-00001, 00002, 00007–00009), P3 con el cliente, guía manual formal (A1…D10), contadores de 00 INICIO, RF-26, identidad de las funciones SQL (ADR-0017 §4/ADR-0018 §7), exportación de informes (opcional). **PR-41 a PR-44 del Excel siguen pendientes**; la fase Excel no se modificó.
- `softarq_dev` conserva las 40 cotizaciones DEMO del humo del módulo 15 (`COT-2026-00015` a `00054`), tal como estaban en el origen.
- `listen_addresses = '*'` es el valor por omisión del instalador, pero `pg_hba.conf` solo admite conexiones locales; no se modificó. Revisar si algún día se expone el equipo.
- Copia externa de `respaldos` sigue pendiente (mismo disco que la base).
- Dos pruebas unitarias son sensibles a carga en este equipo (arriba): conviene correr `pnpm verificar` sin otros procesos pesados.
- Expo no se había instalado al cerrar esta sección: se inició en el módulo 16 (§26).

## 26. App móvil Android con Expo, etapa 1: acceso y consulta (módulo 16)

Decisiones: [ADR-0020](docs/adr/0020-app-movil-expo-conexion-y-sesion-movil.md). Guía de instalación y pruebas: [`docs/movil/guia-instalacion-y-pruebas.md`](docs/movil/guia-instalacion-y-pruebas.md). Sobre `f1367de`. Sin cambios de reglas de negocio ni del motor; los cuatro totales de referencia y sus pruebas siguen iguales.

**Alcance realmente implementado:** acceso, recuperación al abrir la app y cierre de sesión; sesión vencida, revocada o sin acceso; cambio obligatorio de la contraseña temporal; navegación por capacidades del servidor (Clientes y Proyectos con `clientes.consultar`, Cotizaciones con `cotizaciones.consultar`); clientes, proyectos, cotizaciones, versiones comerciales, estados, revisiones y eventos; estados de carga, vacío, error con reintento, pérdida de conexión y datos desactualizados. Sin botones de funciones pendientes.

**Versiones:** Expo SDK 58 (`expo` 58.0.17, React Native 0.88.0, React 19.3.0, `expo-router` 58.0.25, `expo-secure-store` 58.0.2, `expo-dev-client` 58.0.14); TypeScript 6.0.3 **solo** en `apps/mobile` (API y web siguen en 7.0.2); `eas-cli` 25.2.0 (`pnpm dlx`); Android Platform Tools 37.0.1 en `_work\tools\platform-tools`. `expo install` propuso excepciones de `minimumReleaseAge` para cinco paquetes de horas de antigüedad: **no se aceptaron** (`pnpm-workspace.yaml` sin cambios); `expo-doctor` queda en 19/20 por diferencias de parche (58.0.19/58.0.15/58.0.26 esperadas), que se corrigen con `expo install --fix` al madurar.

**Conexión y autenticación (resumen):**
- USB con `adb reverse tcp:3000 tcp:3000` (y `tcp:8081` para Metro): la API **sigue en `127.0.0.1`**, sin cambios de `API_HOST`, CORS ni firewall. Wi-Fi quedó documentado como alternativa no aplicada (exige TLS).
- HTTP en claro acotado a `localhost` y `127.0.0.1` con `network_security_config` (plugin `plugins/red-local.js`), comprobado en una prebuild local (en `development`, Android ignora el `usesCleartextTraffic` de la variante de depuración porque existe la configuración de red). Permisos bloqueados: almacenamiento externo y `SYSTEM_ALERT_WINDOW`.
- Sesión móvil: mismo token opaco y misma tabla, **tipo `MOVIL`**, `Authorization: Bearer`, token solo en SecureStore; `POST/GET /auth/movil/sesion` y lista blanca `@PermitidaEnMovil()` (con Bearer, cualquier otra ruta → 403). CSRF, CORS y cookie de la web no cambiaron.
- `softarq_dev` migrada con `db:migrar` **tras un respaldo verificado** (`softarq_dev-20261024T050453Z-c3d38d`): solo se ampliaron dos CHECK de `sesion`; permisos sin cambios; 54 cotizaciones, 8 emisiones y las cuentas intactas.

**Pruebas realmente ejecutadas en esta laptop (24/10/2026):**

| Comprobación | Resultado |
|---|---|
| `pnpm verificar:secuencial` (build, tipos y unitarias, un paquete a la vez) | API **540/540** (28 archivos), app móvil **103/103** (9), web **281/281** (21); sin errores de tipos |
| `pnpm verificar` (paquetes en paralelo) | Falló por **tiempo/carga** (3 pruebas: la copia del respaldo real en la API, `sesion.test.tsx` de la web y un listado de rutas de OpenAPI que sí exigía actualizarse). Las dos de tiempo pasan aisladas (1,3 s) y con `verificar:secuencial`; causa demostrada: `pnpm -r` ejecuta API, web y móvil a la vez en un equipo de 2 núcleos. No se subieron tiempos de espera ni se tocaron expectativas; se añadió `verificar:secuencial` |
| Integración (un worker, solo `softarq_test`) | **373/373** (22 archivos): 350 previas + 23 del canal móvil (acceso, tokens cruzados, lista blanca, organizaciones, revocación, desactivación, temporal, expiración) |
| E2E (Edge, un worker) | **71/71** |
| `respaldo:probar-restauracion` (con la migración nueva) | **57/57** |
| Comprobación del bundle (`comprobar:bundle`) | Limpio: sin `@prisma`, Nest, argon2, `decimal.js`, cadenas de conexión, rutas de la laptop, tokens, cookie web ni contratos internos |
| Empaquetado Metro local (`expo export`) | 1279 módulos; Hermes 3,4 MB |
| Recorrido real con la API sobre `softarq_dev` (solo lectura) | Las 3 cuentas DEMO: acceso móvil sin `Set-Cookie`, revalidación, consultas (50 de 54 cotizaciones por el límite por omisión; ahora la app pide 100), versión de `COT-2026-00004` ($54,190.68), escritura → 403, cierre y token revocado |

Cuatro totales de referencia: cubiertos por las pruebas con fecha controlada (sin cambios en el motor). Ninguna cotización de humo creada en `softarq_dev`.

**Archivos revisados para la subida a EAS:** `.easignore` (lista blanca). Simulación local: **65 archivos, 760 KB** (raíz de pnpm, `apps/mobile`, `packages/contracts`); `pnpm install --frozen-lockfile`, `eas-build-post-install` y Metro funcionan con solo esos archivos.

**EAS Build y teléfono (estado):** ver el registro al final de esta sección.

**Procesos:** los que se lanzaron durante el trabajo (API de desarrollo en 3000, servidor de pruebas en 3101, Metro) se detuvieron. Para probar con el teléfono hay que dejar abiertos la API (y Metro solo con la *development build*): guía §4–§5.

**Comandos exactos:**
```
pnpm --filter @softarq/mobile typecheck | test | comprobar:bundle | export:android | doctor | start
pnpm --filter @softarq/mobile eas login | whoami | init
pnpm --filter @softarq/mobile eas build --platform android --profile development
pnpm --filter @softarq/mobile eas build --platform android --profile preview
& 'C:\Proyecto_SoftArq\Proyecto_SoftArq\_work\tools\platform-tools\adb.exe' reverse tcp:3000 tcp:3000
pnpm --filter @softarq/api e2e:servidor      # softarq_test:3101, con una cuenta de contraseña temporal para el teléfono (guía §9)
```

**Pendientes (sin cambios):** conceptos heredados, P3, guía manual formal, contadores de 00 INICIO, RF-26, identidad de las funciones SQL. **PR-41 a PR-44 del Excel siguen pendientes** (la prueba en el teléfono no los cuenta).

**Siguiente etapa móvil:** captura y cálculo; revisión y decisión; emisión y documentos; salidas internas; administración; operación sin conexión; TLS.

### Estado de EAS y de la compilación (24/10/2026)

- **Cuenta y proyecto:** `eas whoami` = `raulherrera09` (también ve la organización `raulherrera09s-team`). `project:init --account raulherrera09` devolvió el proyecto `@raulherrera09/softarq-demo`; no se verificó si ya existía o se creó entonces. El CLI no escribe `app.config.ts` (es dinámico): el ID se añadió a mano en `extra.eas.projectId` (no es secreto). `eas project:info` lo confirma.
- **CLI fijada:** `pnpm --filter @softarq/mobile eas …` usa `eas-cli@25.2.0` (script `eas`). La global de esta laptop es 25.3.0; ambas ven la misma sesión y el mismo proyecto. Usar la del paquete para compilar.
- **Archivo de subida real** (`build:inspect --stage archive`, salida en `_work\eas-inspect`): **65 archivos, 768 KB**. Sin `.env` (solo `.env.example`), claves, keystores, APK, PDF, Excel, Word ni SQL; sin API, web, `_work` ni datos. `packages/contracts/dist` va vacío a propósito.
- **`dist` de contracts:** `exports` apunta a `dist`, así que Metro consume lo compilado; el `dist` vacío no impide el build porque EAS ejecuta `eas-build-post-install` (compila `@softarq/contracts`) tras `pnpm install` y antes del empaquetado.
- **Perfil `development` resuelto** (`eas config`): APK interna, `developmentClient`, Node 24.11.1, pnpm 11.1.3, `EXPO_PUBLIC_API_URL=http://localhost:3000`, credenciales remotas.
- **Pendiente:** `eas build --platform android --profile development` (interactivo, lo ejecuta el propietario con `!`); luego instalar por enlace/QR y recorrer T1–T10 en el teléfono (§10 de la guía). No se registró ninguna prueba en el teléfono. No se repitió la suite por la vinculación (solo cambió una línea de configuración).
