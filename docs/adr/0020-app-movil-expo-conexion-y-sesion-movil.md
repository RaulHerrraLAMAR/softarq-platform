# ADR-0020 — App móvil Android con Expo (etapa 1): conexión local y sesión móvil

- **Fecha:** 24/10/2026
- **Estado:** aceptada (módulo 16, etapa 1: acceso y consulta). **Reorientada por [ADR-0021](0021-cliente-externo-solicitud-y-estimacion-preliminar.md):** la app pasa a ser exclusivamente del cliente y las rutas internas de consulta dejarán de estar disponibles en móvil al implementar E1. Conexión, sesión `MOVIL`, EAS y seguridad siguen vigentes
- **Ámbito:**
  - `apps/mobile` (nuevo proyecto Expo), `.easignore` y `eas.json`;
  - `apps/api`: sesión de tipo MOVIL (`modules/autenticacion`, `http/guardia-sesion.ts`, `http/controlador-autenticacion.ts`), migración `20261024120000_sesion_movil`;
  - `packages/contracts`: `@softarq/contracts/movil`, `api/contrasena.ts`, esquemas de sesión móvil.
- **Relacionada con:** [ADR-0007](0007-autenticacion-sesiones.md) (sesiones web), [ADR-0017](0017-parametros-personas-permisos.md) (contraseña temporal), [ADR-0012](0012-respaldo-y-restauracion-local.md) (migración protegida).

## Contexto

Falta la app móvil del bloque 6 de `docs/cobertura-demo.md`. Esta primera etapa es **solo consulta**: acceso, navegación según capacidades y lectura comercial de clientes, proyectos y cotizaciones. La API y PostgreSQL siguen locales (`127.0.0.1`); el teléfono es otro dispositivo, así que hay que resolver cómo llega a la API y cómo se autentica sin debilitar la web (ADR-0007: cookie `HttpOnly`/`SameSite=Strict`, CSRF, `Origin` obligatorio y `API_HOST` fijo en loopback).

**Fuera de esta etapa:** crear y editar cotizaciones, calcular, revisión/aprobación, emisión y PDF, salidas internas, administración y operación sin conexión. La app no muestra botones de nada de eso.

## Decisiones

### 1. Versiones y arquitectura

| Pieza | Versión (24/10/2026) | Nota |
|---|---|---|
| Expo SDK | **58** (`expo` 58.0.17) | Estable desde el 15/10/2026 (RN 0.88, Node ≥ 24.3). |
| React Native / React | 0.88.0 / 19.3.0 | Hermes; nueva arquitectura (por omisión en el SDK 58). |
| Navegación | `expo-router` 58.0.25 | Rutas por archivo; `Stack.Protected` por estado de sesión. |
| Sesión segura | `expo-secure-store` 58.0.2 | Android Keystore. |
| Cliente de desarrollo | `expo-dev-client` 58.0.14 | Solo perfil `development`. |
| Otros | `expo-constants`, `expo-linking`, `expo-status-bar`, `expo-system-ui` 58.x, `expo-build-properties` 58.0.11, `react-native-safe-area-context` 5.10.1, `react-native-screens` 4.30.0 | Instalados con `expo install` (versiones fijadas por Expo). |
| TypeScript | **6.0.3 solo en `apps/mobile`** | La versión que valida Expo; API y web siguen en 7.0.2 (aislado por paquete, sin tocar sus versiones). |
| Pruebas | Vitest 5.0.3 (mismo que el resto) | Lógica en Node; las pantallas son una capa fina. |
| EAS CLI | 25.2.0 (`pnpm dlx`, sin instalación global) | |
| Platform Tools | 37.0.1 en `_work\tools\platform-tools` | Solo `adb` (verificado con el hash publicado por Google). |

- **Sin WebView:** la interfaz es React Native (no se reutilizan componentes DOM de la web). Se portan los términos, estados y el formato de importes (texto decimal, sin `number`).
- **Metro:** `expo/metro-config` sin `watchFolders` ni `nodeModulesPaths` (monorepo pnpm soportado desde el SDK 52). pnpm aislado funcionó sin tocar `node-linker` ni `pnpm-workspace.yaml`.
- **Política de pnpm:** `expo install` propuso, para cinco paquetes de Expo publicados horas antes, excepciones de `minimumReleaseAge`. **No se aceptaron**: se resolvieron las últimas versiones ya maduras (`expo-router` 58.0.25 en vez de 58.0.26, `expo-dev-client` 58.0.14 en vez de 58.0.15). `expo-doctor` lo avisa como diferencia de parche; se corrige con `pnpm --filter @softarq/mobile exec expo install --fix` cuando esas versiones cumplan la antigüedad.
- **Contratos:** la app importa solo `@softarq/contracts/movil`, un punto de entrada mínimo (sesión y errores, clientes/proyectos/cotizaciones, vista comercial, cambio de contraseña). No incluye los contratos internos (catálogos administrativos, parámetros y personas, salidas internas, emisiones, revisiones, respuestas). Para ello `EsquemaCambioContrasena` pasó a `api/contrasena.ts` (sin cambio de comportamiento; el índice sigue exportándolo). En EAS el paquete se compila con el gancho `eas-build-post-install`.

### 2. Conexión con la API local (tres tramos distintos)

| Tramo | Solución | Cambios en el servidor |
|---|---|---|
| **Descargar la APK** | Enlace o QR de EAS (Internet del teléfono; no pasa por la laptop) | Ninguno |
| **Teléfono ↔ API** | **USB con `adb reverse tcp:3000 tcp:3000`**: el `localhost:3000` del teléfono es la laptop | **Ninguno**: la API sigue en `127.0.0.1`, sin firewall ni exposición de red |
| **Teléfono ↔ Metro** (solo development build) | `adb reverse tcp:8081 tcp:8081` y `expo start --dev-client --localhost` (Metro solo en loopback), arrancado con `scripts/iniciar-metro.mjs` | Ninguno |

- **Por qué USB y no Wi-Fi:** conserva el aislamiento de ADR-0005/0007. Wi-Fi exigiría ampliar `API_HOST` (hoy el arranque lo rechaza), abrir el puerto en el firewall de Windows, HTTP en claro dentro de la LAN, revisar el limitador por IP y los orígenes, y no tendría TLS. Queda como alternativa **no aplicada**, para una etapa con TLS (la que prepara Railway).
- No hay ngrok, túneles ni servicios de alojamiento; PostgreSQL no se expone: la app solo habla con la API.
- La APK `preview` no necesita Metro, pero sí la API (y por tanto `adb reverse tcp:3000`) para datos y sesión.
- **HTTP en Android:** Android 9+ bloquea el HTTP en claro. El plugin `plugins/red-local.js` añade un `network_security_config.xml` con `cleartextTrafficPermitted="false"` por omisión y **solo** `localhost` y `127.0.0.1` (sin subdominios) permitidos en claro; no se usa `usesCleartextTraffic` global ni se relaja la validación TLS. La variante de depuración (development) declara `usesCleartextTraffic`, pero Android lo **ignora** cuando existe `networkSecurityConfig` (API ≥ 24): comprobado en la prebuild local. `EXPO_PUBLIC_API_URL` se valida al arrancar (solo `http://localhost|127.0.0.1:PUERTO` o `https://…`); una IP de la red o un host remoto por http hace fallar el arranque.
- No se reemplazan las restricciones de arranque de la API por una aceptación general de cualquier dirección.
- **Metro e IPv4 (24/10/2026):** con Node 24, `localhost` se resolvía a `::1` y `adb reverse` reenvía hacia IPv4, así que el teléfono no alcanzaba Metro. `pnpm --filter @softarq/mobile start` ejecuta `scripts/iniciar-metro.mjs`, que añade `NODE_OPTIONS=--dns-result-order=ipv4first` (sin duplicarla ni perder opciones previas) y lanza `expo start --dev-client --localhost --port 8081`. Probado en el puerto 8089: Metro responde `packager-status:running` en `127.0.0.1` y escucha solo en loopback.

### 3. Autenticación móvil

**Alternativas.**

| | (A) Reutilizar la cookie web en React Native | (B) **Sesión opaca por `Authorization: Bearer` (elegida)** |
|---|---|---|
| Transporte | Cookie `HttpOnly` en el almacén de cookies nativo, compartido con WebViews | Cabecera explícita |
| Persistencia | Fuera de SecureStore (la gestiona el sistema) | `expo-secure-store` (Keystore), solo el token |
| `Origin`/CSRF | RN no envía `Origin`: habría que **falsificar el origen de la web** para pasar la defensa, o relajarla | No aplican: la credencial no es ambiental |
| Comportamiento | Distinto entre plataformas y versiones; difícil de borrar y de aislar por cuenta | Controlado por la app |
| Cambios en la web | Probablemente (orígenes, cookies) | **Ninguno**: CSRF, CORS y cookie intactos |

**Decisión (B), mínima y separada de la web.** Mismo token opaco (32 bytes, solo su SHA-256 en la base), misma tabla `sesion`, mismas políticas, pero con un **tipo propio `MOVIL`**:

- **Migración aditiva** `20261024120000_sesion_movil`: `sesion_tipo_ck` admite `'MOVIL'` y `sesion_tipo_titular_ck` lo trata como `USUARIO` (titular obligatorio). Sin columnas ni permisos nuevos (los de `softarq_app` en `sesion` no cambian). Las funciones SQL que revocan sesiones lo hacen por `usuario_id`, así que desactivar, restablecer o cambiar la contraseña también cierra las móviles.
- **Aislamiento entre canales por construcción:** `resolver` (cookie) solo acepta `USUARIO`; `resolverMovil` (Bearer) solo acepta `MOVIL`. Un token web no sirve como Bearer ni uno móvil como cookie (probado en ambos sentidos). Con `Authorization` manda el Bearer; la cookie se ignora.
- **Rutas:** `POST /api/v1/auth/movil/sesion` (acceso: sin cookie ni sesión previa; se rechaza con 403 si trae `Origin`, propio de navegadores, o `Authorization`; mismo limitador, Argon2id y tiempo uniforme; devuelve el contexto y el `tokenSesion` **una sola vez**, sin `csrfToken`) y `GET /api/v1/auth/movil/sesion` (revalidar). Se reutilizan `DELETE /auth/sesion`, `POST /auth/contrasena` y las `GET` de consulta.
- **Lista blanca explícita (`@PermitidaEnMovil()`):** con Bearer solo pasan las rutas marcadas; el resto responde `403 RUTA_NO_DISPONIBLE_EN_MOVIL` **antes** de resolver la sesión. En la etapa 1: sesión, cierre, cambio de contraseña, clientes, proyectos, cotizaciones y su versión. **Ninguna escritura.** Una cabecera «soy móvil» no concede nada: autoriza el token válido, la pertenencia vigente y las capacidades de cada solicitud.
- **Se conserva:** identidad, organización y funciones desde el servidor (nunca copiadas a la sesión); expiración absoluta 8 h e inactividad 30 min; revocación; desactivación del usuario o de la pertenencia en la siguiente solicitud; cambio obligatorio de la contraseña temporal (`CAMBIO_CONTRASENA_REQUERIDO`; el cambio revoca todas las sesiones y la app vuelve al acceso); regla del último Administrador del sistema; BL-17 y todos los flujos del backend. La app móvil no obtiene accesos por ser otro cliente.
- **Cliente:** el token vive solo en SecureStore y en memoria; **nunca** AsyncStorage, archivos, URLs, registros ni `EXPO_PUBLIC_*`; la contraseña nunca se guarda. Cerrar sesión, vencer o perder acceso: se borra el almacén, se cambia la «generación» (aborta lo pendiente y descarta respuestas tardías de la cuenta anterior), se vacían las cachés y se desmontan las pantallas. Se revalida al volver a primer plano (como mucho una vez por minuto) y ante cualquier 401/403; el servidor decide.
- **Sin JWT, proveedores externos, Firebase ni otra base.** `CORS` no permite la cabecera `Authorization` (un navegador no puede enviarla desde el origen web).

### 4. Qué se sube a EAS Build

- `softarq-platform/.easignore` es una **lista blanca**: al existir, EAS ya no usa `.gitignore`. Se sube el repositorio `softarq-platform` (no `Proyecto_SoftArq`): `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `.npmrc` de la raíz, `apps/mobile` y `packages/contracts`. Nada de API, web, documentación, skills, grafo, `.env`, respaldos, datos, PDF, documentos Excel/Word, evidencias, `_work`, entornos Python ni credenciales de firma.
- Comprobado antes de gastar compilaciones: la lista resultante (**65 archivos, 760 KB**) y que `pnpm install --frozen-lockfile`, el gancho `eas-build-post-install` y el empaquetado Metro funcionan **solo con ese archivo** (sin los importadores de API y web).
- `EXPO_PUBLIC_*` es público (una URL); la firma Android la gestiona EAS (credenciales en Expo, nunca en Git).
- Perfiles: `development` (dev client, APK, distribución interna) y `preview` (APK interna, sin Metro). Sin EAS Update, tiendas, compras ni suscripciones.

### 5. Verificación

Detalle y cifras en `HANDOFF.md` §26. Resumen de las comprobaciones que respaldan esta decisión: pruebas unitarias del servicio y la guardia, 23 pruebas de integración contra PostgreSQL real (`softarq_test`), 103 pruebas de la app, comprobación del bundle (sin código de servidor, credenciales, rutas de la laptop ni contratos internos), regresión completa de web e integración, y recorrido real contra `softarq_dev` con las tres cuentas (solo lectura).

## Consecuencias

- **Una APK nueva** hace falta al cambiar dependencias nativas, `app.config.ts`, plugins, permisos, el identificador o la URL pública de la API. **Basta reiniciar Metro / recargar JavaScript** (solo development build) al cambiar `app/` o `src/`. La APK `preview` lleva su JavaScript dentro: cualquier cambio exige otra compilación. Detalle en `docs/movil/guia-instalacion-y-pruebas.md`.
- **Sin TLS** hasta el despliegue: el token viaja por el túnel USB (loopback) en claro. Aceptable para el DEMO local; antes de exponer la API en red harán falta TLS y revisar este canal.
- Un token móvil robado del teléfono sirve hasta que venza (8 h / 30 min de inactividad) o se revoque; el cierre de sesión, el cambio de contraseña y las funciones del Administrador del sistema lo revocan.
- El límite de identidad de las funciones SQL (ADR-0017 §4, ADR-0018 §7) **sigue pendiente**: las sesiones móviles no lo resuelven ni lo amplían (no hay escrituras móviles en esta etapa).
- `softarq_app` no puede borrar sesiones: la purga manual (`db:purgar-sesiones`) cubre también las móviles.
- El teléfono de desarrollo debe volver a ejecutar `adb reverse` cada vez que se reconecta el cable.
- Etapas siguientes (cada una con su propia decisión): captura y cálculo, revisión y decisión, emisión y documentos, salidas internas, administración, operación sin conexión y TLS.
