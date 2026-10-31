# App del cliente: instalación y pruebas con el teléfono

Guía práctica de la app móvil **del cliente** (módulo 16, conexión y sesión; módulo 17, cotización, estimación y seguimiento). Decisiones y motivos: [ADR-0020](../adr/0020-app-movil-expo-conexion-y-sesion-movil.md), [ADR-0021](../adr/0021-cliente-externo-solicitud-y-estimacion-preliminar.md) e [ADR-0022](../adr/0022-identidad-visual-obra-calida-y-paquete-de-presentacion.md). API que usa la app: [`api-del-cliente.md`](api-del-cliente.md). Trabajo en la laptop: `C:\Proyecto_SoftArq\Proyecto_SoftArq` (en PowerShell, desde `softarq-platform`).

> **Estado de las pruebas en el teléfono:** consulte el registro de la §10. Una prueba en el teléfono se anota como realizada **solo** cuando se ejecutó en el dispositivo; las pruebas automatizadas no la sustituyen. Al 24/10/2026 hay **7 casos con resultado parcial o confirmado, declarados por el propietario** (Claude no observó el teléfono ni tiene evidencia visual); **ninguno está dado por aprobado en su totalidad** salvo lo que dice cada fila, y los demás siguen «Pendiente».

> **La app de la etapa 1 (consulta interna) ya no funciona** contra esta API: las cuentas del equipo reciben 403 `CUENTA_INTERNA_USE_PANEL` y las rutas internas no están disponibles por Bearer. La app del cliente la reemplaza y **necesita una compilación `development` nueva** (§7 y §8): trae módulos nativos y fuentes que la anterior no tiene.

## 1. Tres conexiones distintas

| Tramo | Cómo | Necesita |
|---|---|---|
| **Descargar la APK** | Enlace o QR de EAS, abierto en el teléfono | Internet en el teléfono (no la laptop) |
| **Teléfono ↔ API** | Cable USB y `adb reverse tcp:3000 tcp:3000`: el `localhost:3000` del teléfono es la laptop | Cable, depuración USB, la API en marcha |
| **Teléfono ↔ Metro** (solo *development build*) | `adb reverse tcp:8081 tcp:8081` | Metro en marcha con `--localhost` |

La API sigue escuchando solo en `127.0.0.1` y PostgreSQL no se expone. La APK `preview` no necesita Metro, pero **sí** la API (y por tanto el cable y `adb reverse tcp:3000`) para ver datos e iniciar sesión.

Atajo para los comandos de las secciones siguientes (PowerShell):

```powershell
$adb = 'C:\Proyecto_SoftArq\Proyecto_SoftArq\_work\tools\platform-tools\adb.exe'
```

## 2. Preparar el teléfono (una vez)

1. **Ajustes → Acerca del teléfono** y pulse siete veces *Número de compilación* (activa las opciones de desarrollador).
2. **Ajustes → Sistema → Opciones de desarrollador → Depuración USB**: actívela.
3. Conecte el cable (de **datos**, no solo de carga) y, en el teléfono, acepte *¿Permitir la depuración USB?* (marque «Permitir siempre desde este equipo»).
4. Compruebe en la laptop: `& $adb devices` debe mostrar el equipo como `device` (no `unauthorized` ni `offline`).

## 3. Instalar la APK por enlace o QR

1. En el teléfono, abra el enlace (o escanee el QR) que entrega EAS al terminar la compilación: página de la compilación → **Install**.
2. Descargue la APK. Android pedirá permitir **instalar aplicaciones de esta fuente** (una vez, para el navegador que usó): acéptelo.
3. Instale y abra **SoftArq DEMO**. Se instala **sobre** la anterior (mismo identificador `com.softarq.demo`). Si quedó un token de la etapa 1 en el teléfono, la app lo revoca al abrir y muestra «Esta cuenta es del equipo…»: es lo esperado.

Si Play Protect avisa de una aplicación no verificada, es esperable en una APK interna de pruebas.

## 4. Probar con la APK `preview` (sin Metro)

1. **Laptop:** arrancar la API contra `softarq_dev` **con el código actual** (la que está en marcha desde antes de E1 no tiene las rutas del cliente; deténgala y reiníciela). El código actual ya está compilado en `apps/api/dist` desde el 24/10/2026 19:07: si no cambió nada después, basta con `pnpm --filter @softarq/api start`:

   ```powershell
   pnpm --filter @softarq/contracts build
   pnpm --filter @softarq/api build
   pnpm --filter @softarq/api start        # http://127.0.0.1:3000
   ```

2. **Laptop:** `& $adb reverse tcp:3000 tcp:3000` (repetir si se vuelve a conectar el cable).
3. **Teléfono:** abrir **SoftArq DEMO** e iniciar sesión con una cuenta de **cliente** de `_work\secrets\accesos-clientes-demo-softarq_dev.json` (Laura Méndez, Constructora Ríos y Asociados o Despacho Aranda Arquitectos). Las cuentas del equipo (`accesos-demo-softarq_dev.json`) se usan en el panel web, no en la app.
4. Al terminar, cerrar la API con Ctrl+C. La APK no necesita nada más.

## 5. Probar con la *development build* y Metro

La *development build* es la APK con el cliente de desarrollo: carga el JavaScript desde Metro, así que los cambios de `app/` y `src/` se ven al recargar.

1. Arrancar la API (§4 paso 1) y los túneles:

   ```powershell
   & $adb reverse tcp:3000 tcp:3000
   & $adb reverse tcp:8081 tcp:8081
   ```

2. **Laptop:** `pnpm --filter @softarq/mobile start` (compila los contratos y ejecuta `scripts/iniciar-metro.mjs`, que lanza `expo start --dev-client --localhost --port 8081` con `NODE_OPTIONS=--dns-result-order=ipv4first`; Metro escucha solo en loopback). Con Node 24, `localhost` se resolvía a `::1` y `adb reverse tcp:8081` reenvía hacia IPv4, por lo que el teléfono no alcanzaba Metro; la prioridad IPv4 lo corrige. No exporte la variable a mano: el script la añade conservando las opciones que ya existan. Comprobación en la laptop: `curl http://127.0.0.1:8081/status` debe responder `packager-status:running`.
3. **Teléfono:** abrir la app de desarrollo → *Enter URL manually* → `http://localhost:8081` (o el enlace `exp+softarq-demo://…` que muestra la terminal).
4. Recargar con el menú de desarrollo (agitar el teléfono) → *Reload*.

Procesos que deben quedar abiertos: la API y Metro. Cierre ambos con Ctrl+C al terminar. Si ya tiene un Metro en marcha de antes, reinícielo con este mismo comando: las rutas y los módulos de la app cambiaron.

## 6. Qué se sube a EAS y cómo comprobarlo

El archivo `softarq-platform/.easignore` es una **lista blanca** (al existir, EAS ya no usa `.gitignore`). Se sube solo el repositorio `softarq-platform`: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `.npmrc` de la raíz, `apps/mobile` y `packages/contracts` (**100 archivos, unos 2 MB**, de los que 1.3 MB son las seis fuentes). **No** se suben la API, la web, la documentación, las pruebas ni los scripts de la app, `.env`, respaldos, datos, PDF, documentos Excel/Word, `_work` ni credenciales de firma.

Comprobación antes de compilar (sin gastar una compilación):

```powershell
# Lo que EAS subiría de verdad (requiere sesión de EAS): descarga el archivo a _work y se puede listar
pnpm --filter @softarq/mobile eas build:inspect --platform android --profile development --stage archive --output ../../../_work/eas-inspect --force
```

Esta comprobación se hizo el 24/10/2026 con la app del cliente: la lista contiene `assets/fonts/*.ttf` con sus textos de licencia (OFL) y no contiene secretos, datos, respaldos, documentos, API, web ni pruebas.

## 7. Compilar con EAS Build

EAS CLI se usa sin instalación global (`pnpm dlx eas-cli@25.2.0`, fijado en el script `eas`). Desde la laptop, en **su propia** ventana de PowerShell (la compilación pide confirmaciones de la *keystore* y no puede ejecutarla un agente):

```powershell
pnpm --filter @softarq/mobile eas whoami     # confirmar que es SU cuenta personal (raulherrera09)
pnpm --filter @softarq/mobile eas build --platform android --profile development
```

- La **primera** compilación de Android genera la *keystore* (la guarda EAS, nunca Git).
- Antes de compilar, el árbol de Git debe estar limpio (EAS lo pide); la app del cliente está confirmada en commits locales.
- `development` = cliente de desarrollo (necesita Metro); `preview` = APK autónoma (queda configurada, no hace falta ahora). Solo se compila **una** `development` para esta etapa.
- Cuota gratuita de EAS: puede haber cola de baja prioridad. No se activan compras, suscripciones, tiendas ni EAS Update.

**Qué cambios nativos trae esta compilación** (por eso hace falta una nueva): `react-native-svg` (iconos, ilustraciones y croquis), `expo-font` con las fuentes Bricolage Grotesque e Inter incluidas en la app, `expo-file-system` (PDF en la caché privada) y `expo-sharing` (abrir el PDF con el selector del sistema).

## 8. Cuándo hace falta una APK nueva

| Cambio | ¿APK nueva? |
|---|---|
| Archivos de `app/` o `src/` (pantallas, lógica, textos) | **Development:** no, recargar JavaScript (Metro). **Preview:** sí (el JavaScript va dentro) |
| Dependencias nativas (`expo-*`, `react-native-*`), SDK de Expo | Sí |
| Fuentes (`assets/fonts`), `app.config.ts` (nombre, icono, permisos, plugins), `plugins/red-local.js` | Sí |
| Identificador Android o ABI (`buildArchs`) | Sí (y el identificador no se cambia sin desinstalar) |
| `EXPO_PUBLIC_API_URL` (la URL de la API) | Sí (se incorpora al código al empaquetar) |
| Contratos (`packages/contracts`) | Development: reiniciar Metro (`pnpm --filter @softarq/mobile start` los recompila). Preview: sí |
| API, base de datos, cuentas, datos | No |

## 9. Cuentas de cliente y datos de prueba

- **Cuentas:** `_work\secrets\accesos-clientes-demo-softarq_dev.json` (tres clientes ficticios; correos `…@clientes.softarq.test`). **Laura Méndez ya cambió su contraseña temporal (24/10/2026): la que figura en el archivo para su cuenta ya NO sirve** y la nueva no se guarda en ningún archivo ni en Git (la conoce solo el propietario; si se pierde, el Administrador del sistema debe restablecerla). Las de Héctor Ríos y Silvia Aranda siguen siendo temporales y **caducan el 27/10/2026 a las 22:29 (hora local)**. En el primer ingreso la app pide elegir una contraseña nueva (y vuelve al acceso); cada cuenta tiene una sola oportunidad de ver ese paso. Si una temporal caduca antes de probar, el Administrador del sistema debe restablecerla (`POST /api/v1/admin/accesos-cliente/{usuarioId}/contrasena`, sin pantalla en el panel todavía: llega en la etapa E3).
- **Cuenta principal de presentación (desde el 31/10/2026): «[DEMO] Raul Herrera»** (CLI-00047, proyecto «[DEMO] Casa Raul Herrera — ampliación de planta alta» PRY-00047, correo `raul.demo@clientes.softarq.test`, acceso exclusivo CLIENTE y separado de la cuenta interna de administración). Alta con `node scripts/demo/acceso-presentacion.mjs --api http://127.0.0.1:3100` (idempotente; usa las rutas normales con las cuentas DEMO del equipo). La contraseña temporal (vence 03/11/2026 17:22 UTC) está **solo** en `_work\secrets\acceso-cliente-raul-softarq_dev.json` (permisos restringidos a su usuario de Windows); el cambio obligatorio lo hace el propietario en el teléfono. Laura, Héctor y Silvia quedan sin tocar y no se usan como cuenta principal.
- **Segunda sesión de la misma cuenta (C14 y C17):** `node scripts/demo/segunda-sesion.mjs iniciar raul.demo@clientes.softarq.test --api http://127.0.0.1:3000` lo ejecuta el propietario en su terminal (la contraseña se pide oculta; no va en argumentos ni en el chat). Después `estado [folio]`, `editar <folio>` (cambia las notas del borrador: la revisión sube y el teléfono recibe el conflicto) y `cerrar` (revoca la sesión y borra el archivo del token).
- **Solicitudes:** crear una desde la app es una **escritura en `softarq_dev`** (folio `SOL-2026-…`). Es el uso normal de la demostración y no toca cotizaciones, versiones, emisiones ni documentos existentes. Para probar sin tocar `softarq_dev`, las pruebas de integración (`app-cliente.integracion`) ya recorren el mismo flujo con el código de la app en `softarq_test`.
- **Cotización formal y PDF:** Laura Méndez ya tiene una cotización emitida para probar el PDF: **COT-2026-00055** (ver el caso de presentación en la §10). Los otros dos clientes demo no tienen ninguna. Para crear otra: en el panel web, con el Preparador y el Revisor de `accesos-demo-softarq_dev.json`, prepare, revise, apruebe y emita una cotización para el cliente de esa cuenta; el cliente ve sus cotizaciones **emitidas** aunque se hayan preparado desde el panel. La bandeja «Solicitudes» del panel (para atender lo que el cliente envía desde la app) llega en la etapa E3; mientras tanto la API ya la ofrece (`api-del-cliente.md`).

## 10. Lista de comprobación en el teléfono y registro

Registre cada caso **solo** cuando lo ejecute en el teléfono (fecha, versión de la APK y resultado). Sustituye a la lista T1–T10 de la etapa 1, que quedó obsoleta.

| # | Caso | Resultado |
|---|---|---|
| C1 | Instalar la APK por enlace/QR y abrir **SoftArq DEMO** (icono, nombre, fuentes Bricolage Grotesque e Inter visibles en títulos y texto) | Pendiente |
| C2 | Sin API: aparece «Sin conexión» con *Reintentar*; con la API, llega al acceso | Pendiente |
| C3 | Acceso de cliente con contraseña temporal → elegir contraseña nueva → vuelve al acceso → entra con la nueva | **Parcial** · el propietario confirmó (24/10/2026) que cambió la contraseña temporal de Laura. No declaró la entrada posterior como caso aparte. Técnica (Claude, base): Laura ya no tiene contraseña temporal |
| C4 | Una cuenta del equipo (Preparador) en la app: mensaje «Esta cuenta es del equipo…» con la dirección del panel; no queda sesión | Pendiente |
| C5 | Inicio: encabezado petróleo con la escena animada, «Nueva cotización» flotando, marca DEMO; lista de solicitudes vacía o con las propias | Pendiente |
| C6 | Nueva cotización: registrar una obra nueva (con descripción) o elegir un proyecto propio → elegir trabajo (tarjetas ilustradas Cubierta, Losa, Muro; respuesta al toque y marca de elección) | **Parcial** · el propietario confirmó que eligió proyecto y trabajo. No declaró el registro de una obra nueva |
| C7 | **Medidas — apertura y escritura:** abrir la pantalla de medidas por primera vez sin congelamientos; escribir valores (incluidos 500 y valores inválidos) sin tirones; las cotas del croquis resaltan la medida activa, tocar una cota lleva a su campo, los datos pendientes y los inválidos se marcan; rótulo «orientativo, fuera de escala y sin validación estructural» | **Parcial** · el propietario confirmó que capturó medidas. **Sin resultado** sobre la apertura sin congelamientos, los valores 500 y «abc», las cotas y los tirones: el punto del congelamiento sigue abierto |
| C8 | Medidas: el teclado decimal no tapa los campos, el scroll funciona, el croquis se achica con el teclado y los botones «Atrás» y «Continuar al resumen» siguen visibles | Pendiente |
| C9 | Secciones (agregar y quitar), huecos solo en Muro, opción en trabajos con varias; agregar un segundo trabajo sin perder el primero | Pendiente |
| C10 | Resumen editable: corregir, quitar trabajo, notas; «Por completar» con acceso al campo; el indicador «Guardado» cambia solo | **Parcial** · el propietario confirmó que revisó el resumen. No declaró editar, quitar ni notas |
| C11 | Calcular estimación: importe real de la API (por ejemplo losa 6 × 5 × 0.12 coincide con la calculadora del equipo), rótulo «Estimación preliminar», desglose plegable; cambiar una medida marca «Hace falta recalcular» y oculta el importe anterior | **Parcial** · el propietario confirmó que calculó una estimación de $82,142.94 (SOL-2026-00002, Losa 5 × 10 × 0.16). No declaró recalcular tras un cambio. Técnica (Claude, base): esa estimación existe para la revisión enviada; **falta compararla con la calculadora** |
| C12 | Enviar: confirmación que explica que ya no se edita; doble toque rápido no envía dos veces; confirmación con folio; seguimiento en solo lectura; retirar una solicitud enviada | **Parcial** · el propietario confirmó que envió la solicitud y vio «Enviada». No declaró el doble toque ni el retiro. Técnica (Claude, base): un solo evento de envío por solicitud |
| C13 | Modo avión durante el autoguardado y el envío: aviso «No se pudo guardar», datos conservados, reintentar; al volver la red, el envío no se duplica | Pendiente |
| C14 | Conflicto: editar la misma solicitud desde dos teléfonos (o desde un teléfono y una reinstalación) y comprobar la hoja «Esta solicitud cambió en otro lugar» | Pendiente |
| C15 | **PDF:** con una cotización emitida (§9), «Ver o descargar el PDF» abre el selector del sistema y el PDF se ve completo (esto comprueba que `fetch` de React Native entrega los bytes binarios sin alterarlos) | **Confirmado por el propietario** (24/10/2026): consultó COT-2026-00055 y pudo compartir y abrir su PDF. Técnica (Claude, `adb`): el archivo de la caché de la app coincide byte a byte (SHA-256) con el registrado |
| C16 | Cerrar la app sin cerrar sesión y reabrirla: restaura la sesión (SecureStore); cerrar sesión: pide acceso y no queda nada de la cuenta anterior | Pendiente |
| C17 | Acceso desactivado por el Administrador del sistema con la app abierta: la siguiente acción vuelve al acceso con un aviso | Pendiente |
| C18 | Botón Atrás de Android en cada paso; texto grande (Ajustes → Pantalla → Tamaño de fuente) sin cortes ni acciones ocultas | Pendiente |
| C19 | Tema claro y oscuro: legibilidad, contraste y que las ilustraciones y las cotas se vean bien | Pendiente |
| C20 | Movimiento reducido (Ajustes → Accesibilidad → Quitar animaciones): sin animaciones y con los mismos estados | Pendiente |

### Caso de presentación preparado (24/10/2026)

Para comprobar el PDF (C15) hay una cotización **emitida** para el cliente DEMO **Laura Méndez** (proyecto «Casa Tlalpan»): folio **COT-2026-00055**, total **$54,190.68** MXN, duplicada de la versión 1 de COT-2026-00004 con las rutas normales de la API (duplicar → confirmar precios → calcular → enviar a revisión → aprobar el Revisor → emitir el Preparador). Huella SHA-256 del PDF registrado: `36348de579dce7626012feb14a75e86a5b8ddf321d383f1b371bb36b06d25c2e`. Aparece en «Mis cotizaciones» de Laura. No está vinculada a ninguna solicitud (se preparó desde el panel), así que no sustituye al seguimiento de **su propia** solicitud (C12), que se verá como «Enviada» hasta que el equipo la atienda (la bandeja del panel llega en E3; la API ya permite atenderla).

### Reparto: qué ejecuta cada quien, en orden de prioridad

Marcas: **T** = lo hace usted en el teléfono; **Y** = comprobación técnica que hace Claude (lectura de la base y de los registros, `adb`, capturas) mientras tanto. Ningún caso se marca aprobado hasta que usted confirme el resultado.

| Prioridad | Caso | T (teléfono) | Y (comprobación técnica) |
|---|---|---|---|
| 1 · Acceso | C2 | Con la API detenida, abrir la app: «Sin conexión»; arrancarla y *Reintentar* | `/health` antes y después; registro de `adb logcat` |
| 1 · Acceso | C3 | Entrar como Laura con la temporal, elegir contraseña nueva (anótela usted; no se comparte), volver a entrar | Solo lectura: la temporal deja de funcionar (401), `contrasena_temporal_expira_en` se limpia y la sesión anterior queda revocada; sin ver la contraseña nueva |
| 1 · Acceso | C4 | Entrar en la app con la cuenta del Preparador | Registro de la API (`ACCESO_MOVIL_CUENTA_INTERNA`) y que no se creó ninguna sesión `MOVIL` |
| 1 · Captura propia | C5, C6 | Ver el inicio; crear «Nueva cotización» con una obra nueva (con descripción) y elegir Losa | Capturas de pantalla; en la base, un solo proyecto y un solo borrador, del cliente correcto |
| 1 · Medidas | C7 | Abrir medidas la primera vez; escribir 6, 5, 0.12, luego 500 y «abc»; anotar cualquier tirón o congelamiento | `dumpsys gfxinfo` (fotogramas lentos) antes y después, `logcat` de errores JS y de «Skipped frames», capturas |
| 1 · Medidas | C8, C9 | Teclado, scroll y botones visibles; segunda sección; cambiar de opción; segundo trabajo; hueco en Muro | Capturas con el teclado abierto; la captura guardada en la base (trabajos, secciones, huecos) |
| 1 · Estimación | C10, C11 | Corregir, quitar un trabajo, notas; calcular Losa 6 × 5 × 0.12; cambiar una medida y ver «Hace falta recalcular» | La misma captura en la calculadora del equipo: el importe debe coincidir; instantáneas de estimación numeradas |
| 1 · Envío | C12 | Enviar con doble toque rápido; ver el seguimiento; retirar otra solicitud | Un solo evento `SOLICITUD_ENVIADA` por solicitud; estado y captura inmutable |
| 1 · Recuperación | C13, C16 | Modo avión durante el guardado y el envío; cerrar la app (deslizar) y reabrirla; cerrar sesión | Sin duplicados en la base; tras cerrar sesión, `cache/documentos` vacío y sesión revocada (`adb run-as`) |
| 1 · PDF | C15 | «Mis cotizaciones» → COT-2026-00055 → «Ver o descargar el PDF» y abrirlo/guardarlo | Si el cable sigue conectado: SHA-256 del PDF en la caché de la app (`adb exec-out run-as com.softarq.demo cat cache/documentos/COT-2026-00055.pdf`) frente a la huella de arriba |
| 2 | C17 | Dejar la app abierta en el inicio y comprobar el aviso tras la siguiente acción | Con su visto bueno, desactivo y vuelvo a activar el acceso con la API (Administrador del sistema), sin tocar la contraseña |
| 2 | C14 | Solo si dispone de un segundo dispositivo con la misma cuenta | Está cubierto por `app-cliente.integracion`; sin segundo dispositivo queda «No ejecutable», no «Aprobado» |
| 3 | C1, C18, C19, C20 | Fuentes visibles, Atrás en cada paso, texto grande, tema oscuro, sin animaciones | Cambio los ajustes por `adb` (`font_scale`, `cmd uimode night`, `animator_duration_scale`), los restauro después y capturo |

### Resultados de la sesión del 24/10/2026

**Confirmado por el propietario** (lo declaró en la conversación; Claude no observó el teléfono ni tiene vídeo ni capturas): cambió la contraseña temporal de Laura; seleccionó proyecto y trabajo, capturó medidas y revisó el resumen; calculó una estimación de $82,142.94 y envió la solicitud; consultó su estado «Enviada»; consultó COT-2026-00055 y pudo compartir y abrir su PDF.

**Comprobaciones técnicas que ejecutó Claude** (lectura de la base y de `adb`; no sustituyen al teléfono):
- **Sin duplicados:** hay dos solicitudes de Laura, SOL-2026-00001 (Muro, Bodega Ixtapaluca, enviada a las 19:36) y SOL-2026-00002 (Losa 5 × 10 × 0.16, Bodega Ixtapaluca, enviada a las 20:03). Cada una tiene **un solo** evento de envío y un solo borrador creado. El propietario describió solo la segunda; la primera existe y está «Enviada»: se registra como dato, no como caso aprobado.
- **Estimación:** SOL-2026-00002 tiene una estimación, $82,142.94, de la misma revisión que se envió (6). SOL-2026-00001 tiene tres estimaciones (la última, $16,116.11, de su revisión final).
- **PDF:** el archivo `COT-2026-00055.pdf` de la caché de la app (23 211 bytes, abierto a las 20:03) tiene el mismo SHA-256 que el registrado por la API (`36348de579dce7626012feb14a75e86a5b8ddf321d383f1b371bb36b06d25c2e`) y empieza con `%PDF-`. Esto confirma que `Response.arrayBuffer()` de React Native entregó los bytes sin alterarlos. (El PDF sigue en la caché hasta cerrar la sesión.)
- **Contraseña de Laura:** ya no figura como temporal; Héctor y Silvia sí. Hay una sola sesión móvil activa de cliente (Laura) y ninguna de cuentas del equipo.
- **Respaldo:** `softarq_dev-20261025T021749Z-dd2591` (esquema `20261024200000_cliente_solicitudes`, commit `c3a0525`, 9 documentos), creado y **verificado**.

**Siguen pendientes (no ejecutados):**
- **Rendimiento y congelamiento (C7):** no se tomó ninguna medición controlada (`dumpsys gfxinfo` no devolvió datos y no se registró `logcat`); el propietario no reportó el resultado de abrir y escribir medidas. El punto del congelamiento **sigue abierto**.
- Comparar los $82,142.94 con la calculadora del equipo (mismos precios de referencia); revisar `logcat` en busca de errores de JavaScript.
- Casos sin ejecutar o sin declarar: C1, C2, C4, C5, C8, C9, C13 (modo avión), C14 (segundo dispositivo), C16 (cerrar la app y la sesión; limpieza de la caché de PDF), C17 (acceso desactivado), C18–C20 (Atrás, texto grande, tema oscuro, movimiento reducido), y las partes no declaradas de C3, C6, C7, C10, C11 y C12.
- Incidencias: el propietario **no reportó ninguna**.

### Sesión del 31/10/2026 con la cuenta «[DEMO] Raul Herrera» (en curso)

Equipo: SM-A346M (Android 13), *development build* de E2 con Metro, API en el puerto 3000 y `adb reverse` 3000/8081. Ajustes originales del teléfono, anotados antes de cualquier cambio: `font_scale` 1.1; escalas de animación 1.0 (la de `animator` sin definir); modo oscuro activo. Sigue sin cambiarse ninguno.

**Declarado por el propietario** (resúmenes de grabaciones que revisó una herramienta externa; Claude **no** recibió los videos ni observó el teléfono):
- **C3 completo (Raul):** cambió la contraseña temporal, volvió a entrar y vio el inicio sin solicitudes. *Técnica (Claude):* Raul sin temporal; la primera sesión móvil quedó revocada por `CAMBIO_CONTRASENA` y hay dos activas independientes (teléfono y segunda sesión); `estado` de la segunda sesión → HTTP 200.
- **C6 (obra nueva):** registró «Casa» (Zapopan / Guadalajara / «Construccion de casa»), la app avanzó y mostró «Proyecto: Casa» y «Guardado». No se observó el intento con la descripción vacía: **esa validación no queda comprobada**.
- **C7 (parcial):** croquis isométrico y campos; 6 × 5 × 0.12 con «.0.12» temporal marcado en rojo («1 medida por corregir») y «Todo listo» al corregir; croquis 6.00/5.00/0.12. 2 000 000 en largo se marca en rojo. **Sin comprobar:** largo 500, «abc», tocar una cota para enfocar su campo.
- **C10–C12 (parcial):** resumen con un trabajo y medidas correctas, estimación preliminar de **$37,835.35** (3.6 m³, IVA incluido), Enviar → confirmación → SOL-2026-00003 «Enviada» y aparece en el inicio. Sin comprobar: editar/quitar/notas, recálculo tras un cambio, doble toque y retiro.
- **C8 (parcial):** con el teclado, «Atrás» y «Continuar al resumen» quedan visibles (tras la corrección I-01); se llega al campo Espesor y el mensaje de validación se ve en varias posiciones.

**Comprobaciones técnicas de Claude:**
- SOL-2026-00003: ENVIADA, revisión 4, proyecto PRY-00048 «Casa» del cliente de Raul; captura LOSA 6 × 5 × 0.12 (concreto); un `SOLICITUD_CREADA`, **un** `SOLICITUD_ENVIADA`, un `ESTIMACION_REGISTRADA`, cuatro `SOLICITUD_GUARDADA`.
- **Importe:** `db:verificar-estimacion -- SOL-2026-00003` reproduce con el motor la entrada congelada: subtotal 32,616.68, total **37,835.35**, idéntico a lo guardado (referencias INS-00007/8/9 → PRE-000012/13/14, fecha de cálculo 31/10/2026). Antes, SOL-2026-00002: $82,142.94 idéntico.
- **Rendimiento (C7):** `dumpsys gfxinfo` falla en este equipo («Failure while dumping the app»): **no hay percentiles ni fotogramas lentos**. El `logcat` del proceso de la app (desde 12:23:01; el recorrido va de 12:25:19 a 12:26:27) no contiene errores de `ReactNativeJS`, `FATAL`, ANR ni «Skipped frames». Eso descarta bloqueos graves, **no certifica fluidez**; el punto del congelamiento al abrir Medidas sigue sin una medición.
- Borrador reutilizable: SOL-2026-00004 (BORRADOR, Casa, LOSA 6 × 5 × 0.12 guardado).

**Grupo 4 (sin grabación), declarado por el propietario:** (1) aparece el mensaje de que no se permiten medidas mayores de 500; (2) escribe valores como 2000; (3) en los campos numéricos **no pudo escribir ni pegar «ABC»**, y en los de texto (p. ej. Descripción) sí pueden escribirse letras; no vio un mensaje de rechazo de «ABC», solo el filtrado del campo; (4) las correcciones de visibilidad y los mensajes se mostraron bien; (5) añadió y quitó una sección y las medidas de la primera se conservaron; (6) escribió una nota «SKERE» y esperó el «Guardado». No envió.

**Verificación técnica de Claude (base y registro de la API):**
- Esa sesión se hizo sobre un **borrador nuevo, SOL-2026-00005** (la app lo creó a las 13:10:11), no sobre SOL-2026-00004, que quedó intacto (revisión 15, sin cambios desde las 12:52:28, nota nula).
- SOL-2026-00005 (Casa, PRY-00048, BORRADOR, revisión 15, 1 `SOLICITUD_CREADA` y 15 `SOLICITUD_GUARDADA`, 0 estimaciones): una sola sección LOSA 6 × 5 × 0.12 (concreto), piezas 1, y **el texto «Skere» está en el *nombre de la sección*; `notas` es nula**. Es decir, se guardó el nombre de la sección, no el campo «Notas para el equipo» del resumen. El texto guardado es «Skere», no «SKERE»: el código no cambia mayúsculas; el campo pide mayúscula inicial y corrección (`autoCapitalize="sentences"`), probablemente del teclado. Hipótesis, no comprobada. Pendiente que el propietario aclare en qué campo escribió.
- Las secciones finales coinciden con lo declarado (una; la añadida se quitó).
- **2000 y el máximo:** pruebas automatizadas (255/255 + 1 nueva): 2000, 500.01 y 501 son inválidos; con 2000 en largo la captura queda con un error, no completa. El bloqueo de avance se comprueba en el servidor/controlador (estimar y enviar exigen captura sin errores); **«Continuar al resumen» sí navega** aunque haya errores, y es el resumen el que marca lo que falta. Falta repetir en el teléfono qué muestra el resumen con 2000.
- Quedan ahora **dos borradores sin enviar** de Raul: SOL-2026-00004 y SOL-2026-00005. Se usará SOL-2026-00004 para recalcular, conexión y conflicto; SOL-2026-00005 se conserva (no se borra).

**C15 NO se verifica con Raul:** el PDF probado antes pertenecía a Laura. El caso de Raul (atender su solicitud y emitir su cotización) se comprueba cuando E3 lo permita.

### Registro de incidencias

Se anota cada fallo en cuanto aparece y se corrige antes de pasar a E3. Una incidencia se cierra solo con una repetición del caso en el teléfono.

| # | Caso | Qué ocurrió | Evidencia | Estado |
|---|---|---|---|---|
| — | — | Ninguna reportada por el propietario en la sesión del 24/10/2026 | — | — |
| I-01 | C8 | Con el teclado abierto en Medidas, «Atrás» y «Continuar» quedaban ocultos, había campos tapados y el mensaje de validación quedaba detrás de la barra | Resumen del propietario (31/10); causa en el código: sin `padding` en Android con dibujo de borde a borde y barra fuera del contenedor | **Parcial.** Corregido: el contenedor envuelve contenido y barra (botones visibles, comprobado por el propietario). Residual: la barra aún cubría el borde del campo y su mensaje. Segunda corrección: el motivo va encima del campo. **Cerrada el 31/10/2026 con la repetición del propietario** (declarada, sin grabación): visibilidad y mensajes correctos |
| I-02 | C12 | Tras enviar, «Atrás» desde el seguimiento muestra «Trabajo» con Losa marcada y «Continuar» | Resumen del propietario (31/10) | Corregido en el código (`dismissTo(inicio)` antes de abrir el seguimiento). **Sin repetir:** se comprueba al enviar el siguiente borrador (SOL-2026-00004) |
| I-03 | C7 | El mensaje de una medida inválida es genérico («Escriba un número mayor que 0…»): no explica que 2 000 000 supera el máximo de 500 m | Resumen del propietario (31/10); causa: `medidaMaxima` = 500 en `LIMITES_CLIENTE` | Corregido: `explicarMedida` dice el motivo (máximo 500 m, mayor que 0, solo números, hasta 10 decimales) sin cambiar lo que se acepta; 255/255 pruebas de la app. **Cerrada el 31/10/2026:** el propietario confirmó el mensaje del máximo de 500 |

## 11. Problemas frecuentes

- **`adb devices` vacío o `unauthorized`:** cable solo de carga, depuración USB desactivada o falta aceptar la clave en el teléfono. `& $adb kill-server; & $adb devices`.
- **La app dice «Sin conexión»:** falta `adb reverse tcp:3000 tcp:3000` (se pierde al desconectar el cable) o la API no está en marcha (`http://127.0.0.1:3000/health` en la laptop).
- **Todo responde 404 o «No encontramos…» en la app:** la API en marcha es de antes de E1 (no tiene `/api/v1/cliente/…`). Reinícela con el código actual (§4).
- **Metro no conecta:** falta `adb reverse tcp:8081 tcp:8081`, Metro no usa `--localhost` o no se arrancó con prioridad IPv4 (use siempre `pnpm --filter @softarq/mobile start`, no `expo start` directo).
- **Los títulos salen con otra tipografía:** la APK instalada es la anterior a esta etapa (sin las fuentes nativas). Hace falta la compilación nueva (§7).
- **«Correo o contraseña incorrectos»:** las contraseñas están en `_work\secrets\accesos-clientes-demo-softarq_dev.json`. Tras cinco fallos en 15 minutos desde la misma cuenta, la API pide esperar (429).
- **«La contraseña temporal caducó»:** ver §9.
- **Pantalla «No hay conexión» solo en la APK `preview`:** recuerde que necesita la API y el túnel USB igual que la de desarrollo.
