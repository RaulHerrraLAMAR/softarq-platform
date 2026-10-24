# apps/mobile — App móvil de SoftArq DEMO

React Native + Expo (SDK 58) para Android. **Módulo 16, etapa 1: acceso y consulta.** Decisiones: [ADR-0020](../../docs/adr/0020-app-movil-expo-conexion-y-sesion-movil.md). Instalación y pruebas con el teléfono: [`docs/movil/guia-instalacion-y-pruebas.md`](../../docs/movil/guia-instalacion-y-pruebas.md).

## Alcance de esta etapa

**Incluye** (en español, con los términos y estados de la web):
- acceso y recuperación de la sesión al abrir la app; cierre de sesión; manejo de sesión vencida, revocada o sin acceso;
- cambio obligatorio de la contraseña temporal;
- navegación según las capacidades que entrega el servidor (Clientes y Proyectos con `clientes.consultar`; Cotizaciones con `cotizaciones.consultar`);
- clientes y proyectos; cotizaciones con sus versiones (comerciales), estados, revisiones y eventos;
- estados de carga, vacío, error con reintento, pérdida de conexión y datos desactualizados.

**No incluye** (y la app no muestra botones de ello): crear o editar cotizaciones, calcular, guardar versiones, revisión y aprobación, emisión y PDF, salidas internas, administración de catálogos y personas, operación sin conexión.

La consulta es **comercial**: la API no entrega costos ni márgenes en estas rutas y la app no los pide.

## Reglas

- La API es la única fuente de cálculos, permisos y reglas; la app solo muestra. No contiene motor de cálculo, Prisma ni credenciales del servidor.
- Importa **solo** `@softarq/contracts/movil` (contratos públicos mínimos).
- La sesión es el token opaco de una sesión de tipo `MOVIL` (`Authorization: Bearer`), guardado **solo** en `expo-secure-store`. Nada de AsyncStorage, archivos, URLs, registros ni `EXPO_PUBLIC_*`; la contraseña nunca se guarda.
- Todo dato de ejemplo es DEMO y la app lo marca (`MarcaDemo`).
- `EXPO_PUBLIC_API_URL` es **pública** (una URL; ver `.env.example`): solo `http://localhost:PUERTO`, `http://127.0.0.1:PUERTO` o `https://…`.
- Seguridad de red: texto en claro solo hacia `localhost` y `127.0.0.1` (`plugins/red-local.js`); el teléfono llega a la API por USB (`adb reverse`), sin exponer la API a la red.

## Estructura

```
app/                       Rutas (Expo Router): acceso, cambiar-contrasena, (app)/(tabs)/…, detalles
src/config/                URL de la API (validada)
src/api/                   Cliente HTTP (Bearer, validación con contratos, generación/cancelación) y errores
src/sesion/                Gestor de sesión (estado, restaurar, revalidar, cierre), almacén seguro
src/navegacion/            Capacidades → secciones
src/consultas/             Servicios de lectura (endpoints existentes) y ejecutor de consultas
src/ui/                    Tema, componentes, formato de importes (texto decimal), etiquetas
src/pruebas/               Apoyo de las pruebas (no se sube a EAS)
plugins/red-local.js       network_security_config acotado a localhost
scripts/                   Comprobación del bundle
```

## Comandos (desde `softarq-platform`)

```
pnpm --filter @softarq/mobile typecheck          # compila los contratos y revisa los tipos (TypeScript 6.0.3, solo aquí)
pnpm --filter @softarq/mobile test               # 100+ pruebas de la lógica (Vitest, Node)
pnpm --filter @softarq/mobile comprobar:bundle   # empaqueta y comprueba que no hay código de servidor, secretos ni contratos internos
pnpm --filter @softarq/mobile export:android     # empaquetado local con Metro (salida en _work\mobile-export)
pnpm --filter @softarq/mobile doctor             # expo-doctor
pnpm --filter @softarq/mobile start              # Metro para la development build (solo localhost)
pnpm --filter @softarq/mobile eas <comando>      # EAS CLI fijado (25.2.0), sin instalación global
```

## Versiones y monorepo

pnpm aislado (sin `node-linker=hoisted`), `expo/metro-config` sin ajustes manuales. TypeScript de la app: 6.0.3 (la versión que valida Expo); API y web conservan 7.0.2. Versiones exactas y motivos en el ADR-0020 §1. Escrituras inevitables en el perfil de Windows (`%USERPROFILE%\.expo`, `%APPDATA%\Prisma`) están aceptadas; temporales y cachés del proyecto van a `_work`.
