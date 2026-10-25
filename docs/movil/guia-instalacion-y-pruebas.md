# App del cliente: instalación y pruebas con el teléfono

Guía práctica de la app móvil **del cliente** (módulo 16, conexión y sesión; módulo 17, cotización, estimación y seguimiento). Decisiones y motivos: [ADR-0020](../adr/0020-app-movil-expo-conexion-y-sesion-movil.md), [ADR-0021](../adr/0021-cliente-externo-solicitud-y-estimacion-preliminar.md) e [ADR-0022](../adr/0022-identidad-visual-obra-calida-y-paquete-de-presentacion.md). API que usa la app: [`api-del-cliente.md`](api-del-cliente.md). Trabajo en la laptop: `C:\Proyecto_SoftArq\Proyecto_SoftArq` (en PowerShell, desde `softarq-platform`).

> **Estado de las pruebas en el teléfono:** consulte el registro de la §10. Una prueba en el teléfono se anota como realizada **solo** cuando se ejecutó en el dispositivo; las pruebas automatizadas no la sustituyen. Hoy **ninguna** está realizada.

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

1. **Laptop:** arrancar la API contra `softarq_dev` **con el código actual** (la que está en marcha desde antes de E1 no tiene las rutas del cliente; deténgala y reiníciela):

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

- **Cuentas:** `_work\secrets\accesos-clientes-demo-softarq_dev.json` (tres clientes ficticios; correos `…@clientes.softarq.test`). Las contraseñas **temporales caducan el 27/10/2026 a las 22:29 (hora local)**. En el primer ingreso la app pide elegir una contraseña nueva (y vuelve al acceso); cada cuenta tiene una sola oportunidad de ver ese paso. Si la temporal caduca antes de probar, el Administrador del sistema debe restablecerla (`POST /api/v1/admin/accesos-cliente/{usuarioId}/contrasena`, sin pantalla en el panel todavía: llega en la etapa E3).
- **Solicitudes:** crear una desde la app es una **escritura en `softarq_dev`** (folio `SOL-2026-…`). Es el uso normal de la demostración y no toca cotizaciones, versiones, emisiones ni documentos existentes. Para probar sin tocar `softarq_dev`, las pruebas de integración (`app-cliente.integracion`) ya recorren el mismo flujo con el código de la app en `softarq_test`.
- **Cotización formal y PDF:** los tres clientes demo **no tienen cotizaciones emitidas** todavía. Para ver una en la app: en el panel web, con el Preparador y el Revisor de `accesos-demo-softarq_dev.json`, prepare, revise, apruebe y emita una cotización para el cliente de esa cuenta (por ejemplo, «Laura Méndez», proyecto «Casa Tlalpan»); el cliente ve sus cotizaciones **emitidas** aunque se hayan preparado desde el panel. La bandeja «Solicitudes» del panel (para atender lo que el cliente envía desde la app) llega en la etapa E3; mientras tanto la API ya la ofrece (`api-del-cliente.md`).

## 10. Lista de comprobación en el teléfono y registro

Registre cada caso **solo** cuando lo ejecute en el teléfono (fecha, versión de la APK y resultado). Sustituye a la lista T1–T10 de la etapa 1, que quedó obsoleta.

| # | Caso | Resultado |
|---|---|---|
| C1 | Instalar la APK por enlace/QR y abrir **SoftArq DEMO** (icono, nombre, fuentes Bricolage Grotesque e Inter visibles en títulos y texto) | Pendiente |
| C2 | Sin API: aparece «Sin conexión» con *Reintentar*; con la API, llega al acceso | Pendiente |
| C3 | Acceso de cliente con contraseña temporal → elegir contraseña nueva → vuelve al acceso → entra con la nueva | Pendiente |
| C4 | Una cuenta del equipo (Preparador) en la app: mensaje «Esta cuenta es del equipo…» con la dirección del panel; no queda sesión | Pendiente |
| C5 | Inicio: encabezado petróleo con la escena animada, «Nueva cotización» flotando, marca DEMO; lista de solicitudes vacía o con las propias | Pendiente |
| C6 | Nueva cotización: registrar una obra nueva (con descripción) o elegir un proyecto propio → elegir trabajo (tarjetas ilustradas Cubierta, Losa, Muro; respuesta al toque y marca de elección) | Pendiente |
| C7 | **Medidas — apertura y escritura:** abrir la pantalla de medidas por primera vez sin congelamientos; escribir valores (incluidos 500 y valores inválidos) sin tirones; las cotas del croquis resaltan la medida activa, tocar una cota lleva a su campo, los datos pendientes y los inválidos se marcan; rótulo «orientativo, fuera de escala y sin validación estructural» | Pendiente |
| C8 | Medidas: el teclado decimal no tapa los campos, el scroll funciona, el croquis se achica con el teclado y los botones «Atrás» y «Continuar al resumen» siguen visibles | Pendiente |
| C9 | Secciones (agregar y quitar), huecos solo en Muro, opción en trabajos con varias; agregar un segundo trabajo sin perder el primero | Pendiente |
| C10 | Resumen editable: corregir, quitar trabajo, notas; «Por completar» con acceso al campo; el indicador «Guardado» cambia solo | Pendiente |
| C11 | Calcular estimación: importe real de la API (por ejemplo losa 6 × 5 × 0.12 coincide con la calculadora del equipo), rótulo «Estimación preliminar», desglose plegable; cambiar una medida marca «Hace falta recalcular» y oculta el importe anterior | Pendiente |
| C12 | Enviar: confirmación que explica que ya no se edita; doble toque rápido no envía dos veces; confirmación con folio; seguimiento en solo lectura; retirar una solicitud enviada | Pendiente |
| C13 | Modo avión durante el autoguardado y el envío: aviso «No se pudo guardar», datos conservados, reintentar; al volver la red, el envío no se duplica | Pendiente |
| C14 | Conflicto: editar la misma solicitud desde dos teléfonos (o desde un teléfono y una reinstalación) y comprobar la hoja «Esta solicitud cambió en otro lugar» | Pendiente |
| C15 | **PDF:** con una cotización emitida (§9), «Ver o descargar el PDF» abre el selector del sistema y el PDF se ve completo (esto comprueba que `fetch` de React Native entrega los bytes binarios sin alterarlos) | Pendiente |
| C16 | Cerrar la app sin cerrar sesión y reabrirla: restaura la sesión (SecureStore); cerrar sesión: pide acceso y no queda nada de la cuenta anterior | Pendiente |
| C17 | Acceso desactivado por el Administrador del sistema con la app abierta: la siguiente acción vuelve al acceso con un aviso | Pendiente |
| C18 | Botón Atrás de Android en cada paso; texto grande (Ajustes → Pantalla → Tamaño de fuente) sin cortes ni acciones ocultas | Pendiente |
| C19 | Tema claro y oscuro: legibilidad, contraste y que las ilustraciones y las cotas se vean bien | Pendiente |
| C20 | Movimiento reducido (Ajustes → Accesibilidad → Quitar animaciones): sin animaciones y con los mismos estados | Pendiente |

## 11. Problemas frecuentes

- **`adb devices` vacío o `unauthorized`:** cable solo de carga, depuración USB desactivada o falta aceptar la clave en el teléfono. `& $adb kill-server; & $adb devices`.
- **La app dice «Sin conexión»:** falta `adb reverse tcp:3000 tcp:3000` (se pierde al desconectar el cable) o la API no está en marcha (`http://127.0.0.1:3000/health` en la laptop).
- **Todo responde 404 o «No encontramos…» en la app:** la API en marcha es de antes de E1 (no tiene `/api/v1/cliente/…`). Reinícela con el código actual (§4).
- **Metro no conecta:** falta `adb reverse tcp:8081 tcp:8081`, Metro no usa `--localhost` o no se arrancó con prioridad IPv4 (use siempre `pnpm --filter @softarq/mobile start`, no `expo start` directo).
- **Los títulos salen con otra tipografía:** la APK instalada es la anterior a esta etapa (sin las fuentes nativas). Hace falta la compilación nueva (§7).
- **«Correo o contraseña incorrectos»:** las contraseñas están en `_work\secrets\accesos-clientes-demo-softarq_dev.json`. Tras cinco fallos en 15 minutos desde la misma cuenta, la API pide esperar (429).
- **«La contraseña temporal caducó»:** ver §9.
- **Pantalla «No hay conexión» solo en la APK `preview`:** recuerde que necesita la API y el túnel USB igual que la de desarrollo.
