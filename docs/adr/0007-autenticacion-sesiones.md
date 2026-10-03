# ADR-0007 — Usuarios DEMO, sesiones opacas y autorización por organización

- **Fecha:** 02/10/2026
- **Estado:** aceptada
- **Sustituye:** el contexto DEMO fijo de [ADR-0005](0005-api-http-local.md) §7 (`SOFTARQ_ORGANIZACION_DEMO`).
- **Ámbito:**
  - `apps/api/src/modules/autenticacion`;
  - `apps/api/src/http`: guardia, cookies y controlador de sesión;
  - la migración `20261003014159_autenticacion` y `scripts/db/permisos-app.sql`;
  - `packages/contracts`;
  - `apps/web/src/sesion` y `apps/web/src/api/cliente.ts`.

## Contexto

Hasta el módulo 4, la API usaba una organización DEMO fija resuelta al arrancar, sin identidad ni control de acceso. Este módulo hace que **la organización, la identidad y las capacidades salgan de una sesión autenticada y de la pertenencia vigente**, y protege los endpoints existentes.

Sigue siendo un entorno **local por HTTP en loopback**: TLS, proxy y despliegue quedan para antes de publicar.

**Fuera de alcance:** registro público, recuperación por correo, proveedores externos de identidad, MFA, suscripciones, CRUD de usuarios, clientes, proyectos, cotizaciones guardadas, folios, aprobación y PDF.

## Decisiones

### 1. Modelo: usuario, pertenencia y sesión

| Tabla | Contenido | Restricciones |
|---|---|---|
| `usuario` | Global: correo normalizado, nombre, hash de contraseña, `activo`, `es_demo` | Correo único y `CHECK correo = lower(btrim(correo))`; `CHECK` del hash con prefijo `$argon2id$v=19$m=` |
| `membresia` | Pertenencia (`organizacion_id`, `usuario_id`), `funciones text[]`, `activa` | UNIQUE (`organizacion_id`, `usuario_id`); `CHECK` de funciones ⊆ {PREPARADOR, REVISOR, ADMIN_CATALOGO, ADMIN_SISTEMA} y al menos una |
| `sesion` | `tipo` (PREVIA o USUARIO), `token_hash` (32 bytes), titular, `creada_en`, `ultima_actividad_en`, `expira_en`, `revocada_en`, `motivo_revocacion` | **FK compuesta** (`organizacion_id`, `usuario_id`) → `membresia`: una sesión no puede unir un usuario con una organización a la que no pertenece. `CHECK` de coherencia entre tipo y titular, fechas, revocación y longitud del hash |

- **Pertenencia explícita:** el diseño admite varias por usuario. En esta etapa el acceso exige **exactamente una pertenencia activa**; con más de una, falla con el mensaje genérico. La selección de organización queda para un módulo posterior.
- **Funciones:** se leen de `membresia` **en cada solicitud** y nunca se copian a la sesión. Un cambio en ellas afecta a la siguiente solicitud.

### 2. Funciones y matriz de permisos (contrastadas con el libro)

**Fuentes:**
- `modConfig.bas` (`FN_PREP`, `FN_REV`, `FN_ADMCAT`, `FN_ADMSIS`);
- `tblPersonas.funciones`, con varias funciones separadas por `;`;
- el Word maestro v1.3 §2.4 y D-20.

En el libro, **`BTN_Calcular` (`modMotor.bas`) exige `Req_Funcion FN_PREP`**, igual que «Elegir precios» y «Guardar medición». Abrir las hojas de catálogo y «Verificar bloqueos» no exigen ninguna función.

| Capacidad | Endpoints | Preparador | Revisor | Adm. catálogo | Adm. sistema |
|---|---|---|---|---|---|
| `sesion.propia` | `GET` y `DELETE /api/v1/auth/sesion` | ✓ | ✓ | ✓ | ✓ |
| `catalogos.consultar` | `GET /api/v1/catalogos/*` | ✓ | ✓ | ✓ | ✓ |
| `calculo.ejecutar` | `POST /api/v1/calculos/demo` | ✓ | ✗ (403) | ✗ | ✗ |

- **Dónde vive la matriz:** es una constante pura en `apps/api/src/modules/autenticacion/dominio/capacidades.ts`. `contracts` solo enumera funciones y capacidades.
- **Cálculo DEMO:** además exige que la organización de la sesión sea DEMO; si no, responde 403.
- **Cuentas DEMO:** solo de Preparador y Revisor. Las funciones administrativas se modelan, pero en esta etapa no tienen cuentas ni capacidades propias.

**Para módulos futuros** (documentado; no se implementa ni se simula):

| Función | Capacidades previstas |
|---|---|
| Preparador | Registrar excepciones y enviar a revisión |
| Revisor | Observaciones, autorizar excepciones, aprobar y emitir, **siempre siendo una persona distinta del preparador** (BL-17, D-13, RF-17) |
| Administrador del catálogo | Editar catálogos y aprobar conceptos |
| Administrador del sistema | Parámetros restringidos con motivo y gestión de personas |

### 3. Contraseñas: Argon2id con `@node-rs/argon2` 2.2.1

- **Biblioteca:** napi-rs, mantenida y con binarios precompilados en dependencias opcionales. **No tiene script de instalación**, así que no hubo que cambiar `allowBuilds` ni las políticas de pnpm. Se publicó el 10/09/2026, por lo que cumple la antigüedad mínima.
- **Alternativas descartadas:**
  - `argon2` 0.45: compila con `node-gyp-build` y exigiría una excepción de instalación;
  - `crypto.argon2` de Node 24: experimental y sin formato PHC.
- **Parámetros:** m = 64 MiB, t = 3, p = 4, salida de 32 bytes. Es la segunda recomendación de RFC 9106 §4 y supera el mínimo de OWASP (19 MiB, t = 2, p = 1). Se guardan en la cadena PHC.
- **Medición en el equipo de desarrollo** (6 núcleos, 15.9 GiB; 20 operaciones):

  | Configuración | Mediana de hash y verificación | Dos verificaciones simultáneas | RSS del proceso |
  |---|---|---|---|
  | **m = 64 MiB, t = 3, p = 4 (elegida)** | **56 ms** | **109 ms** | **De 54 a 248 MiB** |
  | m = 64 MiB, t = 3, p = 1 | 105–108 ms | 137 ms | ≈ 253 MiB |
  | m = 19 MiB, t = 2, p = 1 (mínimo de OWASP) | 19 ms | 28 ms | — |

- **Memoria acotada:** como máximo 2 verificaciones simultáneas, unos 128 MiB de trabajo. Con más de 8 en cola, la respuesta es 429.
- **Tiempo uniforme:** una cuenta inexistente se verifica contra un hash ficticio con los mismos parámetros, calculado al arrancar.
- **Longitud:** la contraseña admite de 1 a 128 caracteres en el acceso.
- **Pruebas:** usan **los mismos parámetros**; no se redujeron para ganar velocidad.

### 4. Sesiones opacas en PostgreSQL

- **Token:** 32 bytes de `crypto.randomBytes` en base64url. En la base solo se guarda su **SHA-256**. Para un token de 256 bits no hace falta un hash lento (OWASP Session Management), y el token utilizable nunca se guarda ni se registra.
- **Expiración:**

  | Límite | Valor | Justificación |
  |---|---|---|
  | Absoluta | **8 h** | Una jornada; obliga a autenticarse a diario |
  | Por inactividad | **30 min** | OWASP propone 15–30 min para riesgo bajo o medio; el sistema maneja datos comerciales y de proveedores, pero es local y DEMO |
  | Sesión previa al acceso | **15 min** | Solo sirve para el formulario de inicio de sesión |

  La última actividad se registra como mucho una vez por minuto, para reducir escrituras.
- **Renovación:** al autenticarse siempre se emite un token nuevo y se revoca la sesión previa, lo que evita la fijación de sesión. `GET /auth/csrf` sustituye cualquier sesión viva de esa cookie.
- **Revocación:** el cierre de sesión marca `revocada_en` con un `UPDATE` (sin DELETE) y borra la cookie.
- **Comprobación en cada solicitud protegida:** en una sola consulta se revisan revocación, expiración absoluta, inactividad, **usuario activo** y **pertenencia activa**. Si la cuenta o la pertenencia se desactivaron, la sesión se revoca (`USUARIO_INACTIVO` o `MEMBRESIA_INACTIVA`) y la respuesta es 401. Reactivarlas no revive la sesión.
- **Atomicidad:** el reemplazo de sesión es una transacción por lotes, no interactiva. Durante las pruebas de navegador se observaron `COMMIT` de más de 1 s por escritura del WAL (`WalWrite`) en este equipo, que superaban el tiempo máximo de 5 s de las transacciones interactivas de Prisma.

### 5. Cookie

`softarq_sesion` lleva `HttpOnly`, `SameSite=Strict` y `Path=/api/v1`, **sin `Domain`** (host-only), con `Max-Age` igual a lo que falta para la expiración absoluta.

**Excepción local de `Secure`:** se omite porque la API solo funciona por HTTP en loopback. No se puede habilitar en un despliegue inseguro, porque:
- no es configurable;
- `API_HOST` solo admite `127.0.0.1`;
- `API_CORS_ORIGINS` solo admite orígenes `http` locales;
- el arranque falla con `NODE_ENV=production` (comprobado en pruebas).

Antes de publicar harán falta TLS, `Secure`, el prefijo `__Host-` y una política de proxy.

**Hostname unificado:** la web se abre en `http://localhost:5173`. Si llamara a `http://127.0.0.1:3000`, la API sería otro *site* y el navegador no enviaría una cookie `SameSite=Strict`.
- `VITE_API_URL` pasa a ser `http://localhost:3000`, y la web **exige** el host `localhost`.
- La API **sigue escuchando solo en 127.0.0.1**; el navegador resuelve `localhost` a loopback (comprobado con Edge).
- `http://127.0.0.1:5173` deja de ser un origen permitido por omisión.

### 6. CSRF y origen

**Patrón «HMAC CSRF token» de OWASP** (CSRF Prevention Cheat Sheet), con `node:crypto`:

```
token = base64url(HMAC-SHA256(clave, "softarq-csrf-v1:" + idSesion))
```

- **Clave:** 32 bytes aleatorios generados al arrancar el proceso; no se guarda ni se registra.
- **Ligado a la sesión:** cada sesión, previa o de usuario, tiene su token. Al autenticar cambia junto con la sesión, y el de otra sesión no sirve.
- **Se recalcula, no se guarda:** así `GET /auth/sesion` puede devolverlo tras recargar la página sin almacenar un secreto adicional. Comparación en tiempo constante.
- **Flujo del cliente:**
  1. `GET /api/v1/auth/csrf` crea la sesión previa (cookie) y devuelve su token; esto protege también **el inicio de sesión** (*login CSRF*);
  2. `POST /api/v1/auth/sesion` con `X-CSRF-Token` devuelve el token de la sesión nueva;
  3. después, `GET /api/v1/auth/sesion` lo devuelve de nuevo.
- **Dónde se exige:** en todo `POST` y `DELETE` con sesión (acceso, cierre y cálculo) se exige la cabecera `X-CSRF-Token`. La web la guarda **solo en memoria**.
- **Si la API se reinicia:** la clave cambia y los tokens dejan de valer (403 `CSRF_NO_VALIDO`). La web obtiene uno nuevo con `GET /auth/sesion` y pide repetir la acción.
- **Defensa adicional, sin confiar solo en SameSite ni en CORS:** en todo método con efectos, también en las rutas públicas, la cabecera `Origin` debe pertenecer a la lista permitida; si falta o es ajena, la respuesta es 403 `ORIGEN_NO_PERMITIDO`.
- **Cambio respecto al plan aprobado:** el plan proponía guardar un hash del token CSRF. Se cambió al patrón HMAC porque ese hash no permite devolver el token al restaurar la sesión tras recargar la página. Así no se guarda ningún secreto adicional y la protección es equivalente.

**CORS:**
- `credentials: true` solo para orígenes exactos, sin comodines;
- métodos `GET`, `POST` y `DELETE`; cabeceras `Content-Type` y `X-CSRF-Token`;
- `trust proxy` sigue desactivado;
- todas las respuestas de la API llevan `Cache-Control: no-store`.

### 7. Límites de intentos de acceso

En memoria, con ventanas fijas que caducan solas, **nunca permanentes**:

| Clave | Límite por omisión | Variable |
|---|---|---|
| Cuenta + IP | 5 fallos en 15 min; un acceso correcto reinicia el contador | `API_ACCESO_FALLOS_CUENTA_IP` |
| Cuenta, desde todas las IP | 20 fallos en 15 min | `API_ACCESO_FALLOS_CUENTA` |
| IP | 30 intentos en 15 min | `API_ACCESO_INTENTOS_IP` |
| Ventana | 15 min | `API_ACCESO_VENTANA_MINUTOS` |

- Al superar un límite, la respuesta es 429 con `Retry-After`, sin verificar la contraseña.
- Las cuentas inexistentes cuentan igual, para no revelar si existen.
- **Riesgo residual:** un tercero puede bloquear **temporalmente** una cuenta durante 15 min. El límite por cuenta + IP impide que lo haga desde otra IP sin afectar a la persona legítima, salvo con más de 20 fallos distribuidos.
- **Alcance:** como el limitador de ADR-0005, vale para una sola instancia.

### 8. Respuestas y registros

| HTTP | Código | Cuándo |
|---|---|---|
| 401 | `NO_AUTENTICADO` | Sin cookie |
| 401 | `SESION_NO_VALIDA` | Cookie desconocida, vencida o revocada; se borra la cookie |
| 401 | `CREDENCIALES_INVALIDAS` | **Mensaje único** («Correo o contraseña incorrectos.»): no distingue si la cuenta no existe, está inactiva, no tiene pertenencia o la contraseña es incorrecta |
| 403 | `SIN_PERMISO` | La función no concede la capacidad |
| 403 | `CSRF_NO_VALIDO`, `ORIGEN_NO_PERMITIDO` | Ver §6 |
| 404 | `NO_ENCONTRADO` | Códigos inexistentes en la organización de la sesión; los de otra organización responden igual |

**Registro:** sigue sin cuerpos ni cabeceras. Se añaden eventos de seguridad con el id de solicitud: `ACCESO_OK`, `ACCESO_FALLO`, `ACCESO_LIMITE`, `CIERRE` y `SESION_NO_VALIDA` con su motivo. Nunca incluyen correo, contraseña, cookie, token ni hash (comprobado en pruebas).

### 9. Endpoints públicos y guardia que niega por omisión

- **Públicos:** solo `GET /health`, `GET /api/v1/openapi.json`, `GET /api/v1/auth/csrf` y `POST /api/v1/auth/sesion` (este último exige la sesión previa y su CSRF).
- **Guardia global** (`GuardiaSesion`), después del limitador: cualquier otra ruta exige una sesión de usuario vigente y su `@Requiere(capacidad)`; una ruta sin capacidad declarada se rechaza.
- **Sin contexto anónimo:** se eliminaron `ContextoDemoFijo`, `SOFTARQ_ORGANIZACION_DEMO` y la opción de pruebas `contextoFijo`.
- **Opciones de pruebas restantes en `crearAplicacion`** (ninguna autentica):
  - `reloj`: fecha de negocio;
  - `relojSesiones`: instante de la política de sesiones;
  - `sinComprobacionInicialDeRol`: solo para arrancar con PostgreSQL caído y comprobar los 503; la guardia sigue exigiendo sesión.

**Dos relojes separados:** la fecha de negocio de los escenarios (`RelojFijo("2026-09-25")`) no interviene en la expiración de sesiones, que usa el instante real o el reloj de sesiones de la prueba.

### 10. PostgreSQL

Se usan las credenciales existentes: el migrador aplica la migración y `permisos-app.sql`. No hicieron falta credenciales administrativas.

| Tabla | Permisos de `softarq_app` |
|---|---|
| `usuario`, `membresia` | Solo `SELECT`: la aplicación no puede crear, modificar ni reactivar cuentas |
| `sesion` | `SELECT` e `INSERT`; `UPDATE` **solo de columnas** (`ultima_actividad_en`, `revocada_en`, `motivo_revocacion`); sin `DELETE` |

- La aplicación sigue sin superusuario, DDL, acceso a la base sombra ni `DELETE` en ninguna tabla.
- **Purga:** `pnpm --filter @softarq/api db:purgar-sesiones` usa el rol migrador y borra solo sesiones vencidas o revocadas hace más de 7 días.

### 11. Cuentas DEMO

`pnpm --filter @softarq/api db:cargar-usuarios-demo` crea `[DEMO] Preparador 1` (`preparador.demo@softarq.test`) y `[DEMO] Revisor 1` (`revisor.demo@softarq.test`). El dominio `.test` está reservado (RFC 2606).

- **Rol y destino:** usa el rol migrador, solo en `softarq_dev`, solo en organizaciones DEMO con parámetros DEMO, y rechaza `NODE_ENV=production`.
- **Contraseñas:** `randomBytes(18)` en base64url (24 caracteres). Solo se guardan en `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json`, fuera del repositorio; la consola solo muestra la ruta.
- **Idempotente:** conserva las cuentas existentes sin tocar su contraseña. `--restablecer <correo>` genera una nueva de forma explícita y revoca sus sesiones.
- **Pruebas de navegador:** el servidor de pruebas crea sus cuentas en `softarq_test` en cada corrida (`_work\secrets\accesos-e2e.json`).

### 12. Web

- **Sesión:**
  - restauración con `GET /auth/sesion`;
  - pantalla de acceso con etiquetas visibles, autocompletado y pegado permitidos, «Mostrar/Ocultar», estado de envío y errores anunciados;
  - barra con nombre, función y organización, y «Cerrar sesión»;
  - estados de sesión vencida y sin conexión.
- **Cliente HTTP:**
  - `credentials: "include"` y CSRF solo en memoria;
  - sin `localStorage` ni `sessionStorage` (comprobado en Vitest y Playwright);
  - `cancelarTodo()` aborta lo pendiente, y la **generación de sesión** descarta cualquier respuesta tardía.
- **Limpieza:** el cotizador se monta con `key` igual a la generación. Al cerrar, vencer o cambiar de usuario se descartan la captura, los resultados y las consultas.
- **Revisor:** «Calcular» aparece deshabilitado con el motivo. Es solo presentación: la API responde 403 de todos modos.

## Cambios en pruebas existentes justificados por la autenticación

- **Integración:** las pruebas HTTP inician sesión como Preparador de su organización de prueba (`DEMO-HTTP`) con el flujo real.
  - Se retiraron las dos pruebas de «organización configurada al arrancar» porque esa configuración ya no existe; sus equivalentes están en `autenticacion.integracion.test.ts`.
  - El preflight CORS ahora espera `Access-Control-Allow-Credentials: true` y `X-CSRF-Token`.
  - La prueba de 503 arranca sin la comprobación inicial de rol y envía una cookie con forma válida.
- **Unitarias:**
  - los orígenes por omisión pasan a `http://localhost:5173`;
  - la URL de la web exige `localhost`;
  - el cliente usa `credentials: "include"`;
  - OpenAPI incluye las rutas de sesión.
- **Navegador:** las 21 pruebas anteriores inician sesión como Preparador antes de cada recorrido. Las respuestas simuladas añaden `Access-Control-Allow-Credentials`.
- **Sin cambios:** los cuatro totales y las reglas del motor.

## Consecuencias

- Cualquier endpoint nuevo exige sesión y una capacidad declarada; si no, queda bloqueado.
- **Riesgos y pendientes:**
  - límites de acceso y limitador en memoria (una instancia);
  - bloqueo temporal de cuentas posible;
  - purga manual de sesiones;
  - la clave CSRF se renueva al reiniciar el proceso;
  - sin MFA ni recuperación;
  - antes de publicar: TLS, `Secure` y `__Host-`, proxy y almacén compartido.
