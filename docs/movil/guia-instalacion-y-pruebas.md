# App móvil: instalación por QR y pruebas con el teléfono

Guía práctica del módulo 16, etapa 1 (acceso y consulta). Decisiones y motivos: [ADR-0020](../adr/0020-app-movil-expo-conexion-y-sesion-movil.md). Trabajo en la laptop: `C:\Proyecto_SoftArq\Proyecto_SoftArq` (en PowerShell, desde `softarq-platform`).

> **Cambio de producto (módulo 17, ADR-0021, 24/10/2026):** la app es ahora **del cliente**. La API ya no admite cuentas internas en la app (responde 403 `CUENTA_INTERNA_USE_PANEL`) y las rutas internas de consulta dejaron de estar disponibles por Bearer. La app de la etapa 1 (consulta interna de clientes, proyectos y cotizaciones) **no funciona** contra esta API y se reemplaza en la etapa E2; hasta entonces, esta guía describe la conexión (USB, Metro) y la instalación, que siguen vigentes, y la lista T1–T10 de la §10 queda **obsoleta**. La API del cliente está en [`api-del-cliente.md`](api-del-cliente.md).

> **Estado de las pruebas en el teléfono:** consulte el registro de la §10. Una prueba en el teléfono se anota como realizada **solo** cuando se ejecutó en el dispositivo; las pruebas automatizadas y las capturas de la web no la sustituyen.

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
3. Instale y abra **SoftArq DEMO**. La firma la gestiona EAS; las actualizaciones se instalan sobre la anterior sin perder la sesión.

Si Play Protect avisa de una aplicación no verificada, es esperable en una APK interna de pruebas.

## 4. Probar con la APK `preview` (sin Metro)

1. **Laptop:** arrancar la API contra `softarq_dev`:

   ```powershell
   pnpm --filter @softarq/contracts build
   pnpm --filter @softarq/api build
   pnpm --filter @softarq/api start        # http://127.0.0.1:3000
   ```

2. **Laptop:** `& $adb reverse tcp:3000 tcp:3000` (repetir si se vuelve a conectar el cable).
3. **Teléfono:** abrir **SoftArq DEMO** e iniciar sesión con una cuenta DEMO de `_work\secrets\accesos-demo-softarq_dev.json`.
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

Procesos que deben quedar abiertos: la API y Metro. Cierre ambos con Ctrl+C al terminar.

## 6. Qué se sube a EAS y cómo comprobarlo

El archivo `softarq-platform/.easignore` es una **lista blanca** (al existir, EAS ya no usa `.gitignore`). Se sube solo el repositorio `softarq-platform`: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `.npmrc` de la raíz, `apps/mobile` y `packages/contracts` (65 archivos, unos 760 KB). **No** se suben la API, la web, la documentación, `.env`, respaldos, datos, PDF, documentos Excel/Word, `_work` ni credenciales de firma.

Comprobación antes de compilar (sin gastar una compilación):

```powershell
# 1. Lo que EAS subiría de verdad (requiere sesión de EAS): descarga el archivo a _work y se puede listar
pnpm --filter @softarq/mobile eas build:inspect --platform android --profile development --stage archive --output ../../../_work/eas-inspect --force

# 2. Sin sesión de EAS: simulación local equivalente (misma regla de gitignore)
#    git ls-files --cached --others --exclude-standard  →  copiar a una carpeta  →  copiar .easignore como .gitignore
#    →  git add -A && git ls-files
```

Se verificó con la simulación que `pnpm install --frozen-lockfile`, `eas-build-post-install` (compila `@softarq/contracts`) y el empaquetado Metro funcionan con **solo** esos archivos.

## 7. Compilar con EAS Build

EAS CLI se usa sin instalación global (`pnpm dlx eas-cli@25.2.0`, fijado en el script `eas`). Desde la laptop:

```powershell
pnpm --filter @softarq/mobile eas login      # navegador; sin contraseñas ni tokens en el chat
pnpm --filter @softarq/mobile eas whoami     # confirmar que es SU cuenta personal
pnpm --filter @softarq/mobile eas init       # crea o vincula el proyecto «softarq-demo» (escribe extra.eas.projectId)

pnpm --filter @softarq/mobile eas build --platform android --profile development
pnpm --filter @softarq/mobile eas build --platform android --profile preview
```

- La **primera** compilación de Android genera la *keystore* (la guarda EAS, nunca Git): pide confirmación en la terminal, así que ejecútela en su propia ventana de PowerShell.
- Antes de compilar, haga commit local (EAS pide un árbol limpio).
- `development` = cliente de desarrollo (necesita Metro); `preview` = APK autónoma. En esta etapa basta compilar `development`; `preview` queda configurada.
- Cuota gratuita de EAS: puede haber cola de baja prioridad. No se activan compras, suscripciones, tiendas ni EAS Update.

## 8. Cuándo hace falta una APK nueva

| Cambio | ¿APK nueva? |
|---|---|
| Archivos de `app/` o `src/` (pantallas, lógica, textos) | **Development:** no, recargar JavaScript (Metro). **Preview:** sí (el JavaScript va dentro) |
| Dependencias nativas (`expo-*`, `react-native-*`), SDK de Expo | Sí |
| `app.config.ts` (nombre, icono, permisos, plugins), `plugins/red-local.js` | Sí |
| Identificador Android o ABI (`buildArchs`) | Sí (y el identificador no se cambia sin desinstalar) |
| `EXPO_PUBLIC_API_URL` (la URL de la API) | Sí (se incorpora al código al empaquetar) |
| Contratos (`packages/contracts`) | Development: reiniciar Metro (`pnpm --filter @softarq/mobile start` los recompila). Preview: sí |
| API, base de datos, cuentas, datos | No |

## 9. Contraseña temporal y escrituras: sin tocar `softarq_dev`

Para probar el **cambio obligatorio de contraseña** en el teléfono sin crear personas en `softarq_dev`, use el servidor de pruebas (`softarq_test`, puerto 3101), que crea una cuenta con la contraseña marcada como temporal:

```powershell
# detener la API de desarrollo si estaba en marcha
pnpm --filter @softarq/api build:e2e
pnpm --filter @softarq/api e2e:servidor            # vacía y migra softarq_test; escucha en 127.0.0.1:3101
& $adb reverse tcp:3000 tcp:3101                   # el teléfono sigue usando localhost:3000
```

Cuenta `temporal` en `_work\secrets\accesos-e2e.json` (se regenera en cada arranque). Tras cambiar la contraseña la app vuelve al acceso y la antigua deja de servir. Al terminar: Ctrl+C y `& $adb reverse tcp:3000 tcp:3000`. Esta etapa no tiene escrituras móviles; las escrituras se validan en `softarq_test` con las pruebas de integración y E2E.

## 10. Lista de comprobación en el teléfono y registro

Registre cada caso **solo** cuando lo ejecute en el teléfono (fecha, versión de la APK y resultado).

| # | Caso | Resultado |
|---|---|---|
| T1 | Instalar la APK por enlace/QR y abrir **SoftArq DEMO** (icono y nombre) | Pendiente |
| T2 | Sin API: aparece «Sin conexión» con *Reintentar*; con la API, entra | Pendiente |
| T3 | Acceso con Preparador, Revisor y Administrador (`accesos-demo-softarq_dev.json`); pestañas según la función: Administrador ve Clientes, Proyectos y Cotizaciones; el «Inicio» muestra la marca DEMO | Pendiente |
| T4 | Clientes: lista, búsqueda, detalle, proyectos del cliente y «Ver cotizaciones de este cliente» | Pendiente |
| T5 | Cotizaciones: lista (54), búsqueda por folio, detalle de `COT-2026-00004`, versión: total **$54,190.68**, partidas, impuesto y avisos; sin costos ni márgenes | Pendiente |
| T6 | Botón Atrás de Android en detalle y en pestañas; teclado no tapa los campos; texto grande (Ajustes → Pantalla → Tamaño de fuente) | Pendiente |
| T7 | Modo avión con datos en pantalla: aviso «puede estar desactualizado» y *Reintentar* | Pendiente |
| T8 | Cerrar sesión y volver a abrir la app: pide acceso; nada de la cuenta anterior en pantalla | Pendiente |
| T9 | Cerrar la app (sin cerrar sesión) y reabrirla: restaura la sesión | Pendiente |
| T10 | Contraseña temporal (§9): entra restringido, cambia la contraseña, vuelve al acceso | Pendiente |

## 11. Problemas frecuentes

- **`adb devices` vacío o `unauthorized`:** cable solo de carga, depuración USB desactivada o falta aceptar la clave en el teléfono. `& $adb kill-server; & $adb devices`.
- **La app dice «Sin conexión»:** falta `adb reverse tcp:3000 tcp:3000` (se pierde al desconectar el cable) o la API no está en marcha (`http://127.0.0.1:3000/health` en la laptop).
- **Metro no conecta:** falta `adb reverse tcp:8081 tcp:8081`, Metro no usa `--localhost` o no se arrancó con prioridad IPv4 (use siempre `pnpm --filter @softarq/mobile start`, no `expo start` directo).
- **«Correo o contraseña incorrectos»:** las contraseñas están en `_work\secrets\accesos-demo-softarq_dev.json`. Tras cinco fallos en 15 minutos desde la misma cuenta, la API pide esperar (429).
- **Pantalla «No hay conexión» solo en la APK `preview`:** recuerde que necesita la API y el túnel USB igual que la de desarrollo.
