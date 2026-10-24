/**
 * Configuración de Expo de SoftArq DEMO (módulo 16, ADR-0020).
 *
 * - Nombre visible «SoftArq DEMO»; identificador Android estable `com.softarq.demo`.
 * - `EXPO_PUBLIC_API_URL` es PÚBLICA (se incorpora al código de la app): solo una URL, nunca credenciales.
 *   Se valida en `src/config/api.ts` (solo http://localhost:PUERTO o https://).
 * - El tráfico HTTP en claro queda limitado a localhost y 127.0.0.1 por `plugins/red-local.js`; no se usa
 *   `usesCleartextTraffic` global.
 * - Permisos de Android: solo INTERNET (y los que Expo declara por omisión y no se bloquean, como VIBRATE).
 *   Con `networkSecurityConfig`, Android ignora `usesCleartextTraffic` (también el de la variante de
 *   depuración): el texto en claro queda limitado a localhost y 127.0.0.1 en todas las variantes.
 */
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SoftArq DEMO",
  slug: "softarq-demo",
  scheme: "softarq",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  android: {
    package: "com.softarq.demo",
    versionCode: 1,
    allowBackup: false,
    softwareKeyboardLayoutMode: "resize",
    // La app solo consulta la API: no necesita almacenamiento externo ni ventanas superpuestas.
    // (La variante de depuración vuelve a declarar SYSTEM_ALERT_WINDOW para el menú de desarrollo.)
    blockedPermissions: ["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.SYSTEM_ALERT_WINDOW"],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f172a",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-dev-client",
    ["expo-system-ui", {}],
    // Solo arm64-v8a (los teléfonos Android actuales): APK más pequeña y compilación remota más corta.
    // Para un teléfono de 32 bits, añadir "armeabi-v7a".
    ["expo-build-properties", { android: { buildArchs: ["arm64-v8a"] } }],
    "./plugins/red-local.js",
  ],
  experiments: { typedRoutes: true },
};

export default config;
