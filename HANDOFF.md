# HANDOFF — Continuidad entre sesiones y agentes

> Léelo al empezar. Actualízalo al terminar cada tarea (sección por sección, sin borrar el historial de la tabla 4). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

**Última actualización:** 03/10/2026 · Claude Code (Opus 5.5) · módulo 7 (revisión y aprobación por un revisor distinto del preparador) terminado y verificado, tras la corrección del borrador (commit `97e69d5`)

## 1. Estado actual

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
- **Módulo 7, revisión y aprobación (ADR-0009, este commit):**
  - el Preparador envía explícitamente la **última** versión, solo si corresponde al borrador guardado (sin cambios sin guardar ni pendientes de recalcular);
  - el Revisor consulta la bandeja, abre la versión (proyección comercial guardada, verificación vigente y avisos) y **solicita cambios** (con explicación) o **aprueba**;
  - el Preparador puede **retirar** una revisión pendiente para corregir (adaptación de la web);
  - **BL-17 por identidad:** quien aprueba no puede ser el autor de la versión, aunque tenga o reciba la función Revisor (API, función de la base y CHECK);
  - la revisión vive en `revision` (estado por envío, terminal tras decidir o retirar) y `revision_evento` (solo alta). La versión **no cambia**: su estado (`BORRADOR`, `EN_REVISION`, `APROBADA`) se deriva y la aprobación de v1 no se aplica a v2;
  - verificación vigente al enviar y aprobar (BL-01/02, 04, 07, 08, 09, 10–14, 16, 18 y AV-01/02/03/05) en una lectura de solo lectura, **sin recalcular ni reemplazar importes**;
  - concurrencia: una sola transición confirmada (409 `CONFLICTO_REVISION` con el estado vigente); idempotencia de envíos, decisiones y retiradas;
  - con una revisión pendiente no se guarda el borrador ni se calcula (409 `REVISION_PENDIENTE`, BL-19);
  - **la aprobación no es una emisión ni una entrega al cliente.**
- **Corrección del borrador (commit `97e69d5`):** guardar ya no elimina en silencio las selecciones de un concepto, proveedor o precio que dejó de estar disponible. Se conservan, marcadas, hasta que el usuario las sustituya o quite; las referencias nuevas inválidas se rechazan (422 `REFERENCIA_NO_DISPONIBLE`). Ver ADR-0008, «Corrección posterior».
- **Revisión personal de la web:** el propietario declaró que revisa manualmente los resultados de la web (registrado el 03/10/2026). Es una declaración, sin recorridos, casos ni evidencias atribuidos. La ejecución formal de los casos de la guía (A1–A9, 1–14, C1–C15) sigue sin registro, y ninguna de las dos cuenta como PR-41 ni PR-44 del Excel.
- **Todavía no existen:** registro o CRUD de usuarios, recuperación de contraseña, MFA, descartar o duplicar cotizaciones, excepciones, anular una aprobación, emisión, PDF ni móvil.

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
| Propietario | Libro oficial `entrega\Cotizador_Estructuras_F1.xlsm`; COT-2026-00016/00017 y la persona en turno se conservan; evidencias citadas por archivo, escenario y caso | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) §4 |
| Entorno | Trabajo en `D:\Proyecto_SoftArq`; temporales y cachés en `_work`; sin remoto ni push | `AGENTS.md` §1 |

Pendiente de decidir: selección de organización para usuarios con varias pertenencias, anular una aprobación antes de emitir, almacén compartido de los limitadores para varias instancias, TLS y proxy antes de publicar, generación de PDF y alcance de la app móvil.

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
| 03/10/2026 | Módulo 7: revisión y aprobación por un revisor distinto del preparador; ADR-0009 | Ver §5, §14 y §8 |

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
5. **Fuera del motor y del ensamblador:** BL-07 y BL-09 (vigencia a la emisión con excepciones).
6. **PostgreSQL:** escucha en `*:5432`, pero `pg_hba.conf` solo admite conexiones locales. No se modificó el servicio ni su configuración.
7. **Fase 1:** siguen abiertas la incidencia de cierre de Excel y la observación de hoja activa.
8. **API con sesiones, pero solo local:**
   - solo escucha en `127.0.0.1` y la cookie no lleva `Secure` (HTTP local);
   - no debe exponerse en red, Expo ni despliegue sin TLS, `Secure` y `__Host-`, proxy y almacén compartido de los limitadores (ADR-0007 §5).
9. **Rate limiting en memoria:** vale para una instancia; con varias hará falta un almacén compartido.
10. **Avisos:**
    - AV-01 y AV-03 se publican reescritos sin importes;
    - AV-02 y AV-05 se evalúan en la revisión con la fecha del servidor (AV-02 se volverá a evaluar con la fecha de emisión);
    - AV-04 no aplica hasta que existan excepciones.
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
17. **Servidores del propietario:** durante los módulos 6 y 7 no había nada escuchando en `3000` ni `5173`; las pruebas de humo usaron `3200` y la API temporal se detuvo. Cualquier API o web iniciada antes de este commit no tiene la revisión: hay que **recompilar y reiniciar** (`pnpm --filter @softarq/contracts build && pnpm --filter @softarq/api build && pnpm --filter @softarq/api start`, y la web). La migración ya está aplicada en `softarq_dev`.
18. **Disco y PostgreSQL:** se observaron `COMMIT` de más de 1 s (`WalWrite`) durante las pruebas de navegador del módulo 5. Por eso el código de sesiones evita las transacciones interactivas de Prisma; la única del módulo 6 es de solo lectura (sin escritura de WAL al confirmar) y su máximo medido fue 182 ms frente a un límite de 15 s.
19. **Cotizaciones (ADR-0008):**
    - sin descartar ni duplicar cotizaciones ni «precios anteriores» (B-34/B-35 del libro);
    - el contacto del cliente y los datos del emisor llegarán con la emisión (BL-01);
    - la purga de idempotencia es manual (`db:purgar-idempotencia`);
    - listados limitados a 100 resultados, sin paginación;
    - ~~la selección de un concepto que desaparece del catálogo se perdía al volver a guardar~~: corregido (ADR-0008, «Corrección posterior»);
    - en `softarq_dev` quedan `COT-2026-00001` (acentos dañados por el `curl` de humo) y `COT-2026-00002`, datos DEMO de prueba sin cambios, y `COT-2026-00003` (humo del módulo 7: v1 aprobada; su instantánea conserva el nombre dañado, ver §5). El siguiente folio web será `COT-2026-00004`.
20. **Revisión (ADR-0009):**
    - la aprobación no se puede anular ni «observar» después (en el libro sí); queda para el módulo de emisión;
    - sin excepciones (B-22): BL-09 siempre bloquea y AV-04 no aplica;
    - la verificación vigente recalcula en memoria al abrir una revisión pendiente, al enviar y al aprobar (el mismo trabajo que la fase A de ADR-0008; no se midió aparte);
    - el catálogo puede cambiar entre la verificación y la sentencia de escritura; la verificación refleja el instante de su lectura;
    - las cuentas DEMO de `softarq_dev` tienen una función cada una; BL-17 en pantalla solo se ve con una cuenta con las dos (las pruebas E2E crean `ambas.e2e@softarq.test` en `softarq_test`).

## 7. Siguiente tarea

1. **Ejecución formal de la guía manual** [`docs/web/guia-prueba-manual.md`](docs/web/guia-prueba-manual.md) (A1–A9, 1–14, C1–C15 y R1–R10), con el registro de la §5. Complementa la revisión personal ya declarada. No cuenta como PR-41 ni PR-44.
2. **Módulo 8 propuesto: emisión.**
   - datos del emisor y contacto del cliente; BL-01, BL-02, BL-15 y BL-20 completos (contacto, ubicación, descripción, emisor y textos);
   - emitir solo una versión APROBADA (BL-17 con revisor registrado ≠ preparador), con BL-09 y AV-02 a la fecha de emisión;
   - estado EMITIDA en una tabla aparte, sin UPDATE de la versión; anular una aprobación antes de emitir;
   - PDF comercial (D-16) y descartar cotizaciones (folio DESCARTADO).

Alternativas más cortas:
- **web DEMO:** coma decimal, conservar el borrador durante la sesión y más de 20 conceptos por consulta;
- **administración de usuarios:** alta, baja y restablecimiento por un Administrador del sistema.

## 8. Último commit

- `2543baa`: Módulo 2, persistencia de catálogos (sobre `f0a34da`).
- `fdcc8f4`: skills de proyecto y reglas de uso.
- `185fd26`: Módulo 3, API HTTP local.
- `84f9218`: Módulo 4, cliente web DEMO.
- `ff6da0d`: Módulo 5, usuarios DEMO, sesiones y autorización.
- `26ce1a5`: Módulo 6, clientes, proyectos y cotizaciones con versiones.
- `97e69d5`: corrección del borrador (selecciones no disponibles conservadas) y registro de la revisión personal.
- A continuación, el commit del módulo 7 (revisión y aprobación): ver `git log --oneline -3`.
- MD5 del libro oficial al cerrar el módulo 7: `b60debc121957b8d8e3f2c2edd9a5b4f` (sin cambios).

Rama `main`. Sin remoto ni push.

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
- las cuentas son `preparador.demo@softarq.test` (Preparador: consulta y calcula) y `revisor.demo@softarq.test` (Revisor: consulta y no calcula);
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
