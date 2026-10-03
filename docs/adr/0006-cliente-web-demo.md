# ADR-0006 — Cliente web DEMO (React + Vite) sobre la API local

- **Fecha:** 02/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `apps/web`;
  - `DIMENSIONES_POR_FORMULA` en `packages/contracts`;
  - el arranque de pruebas de navegador en `apps/api/src/pruebas-e2e`.

## Contexto

La API local (ADR-0005) ya ofrece catálogos y cálculo DEMO. Faltaba una interfaz para recorrer el flujo completo:

1. elegir un ejemplo o iniciar una captura propia;
2. capturar conceptos y medidas;
3. elegir opciones de precio y añadir costos adicionales;
4. calcular en el servidor y consultar el resultado comercial, los avisos y los bloqueos.

No hay autenticación, usuarios, guardado de cotizaciones, folios, aprobación, PDF, Expo, 3D ni despliegue.

## Decisiones

### 1. Stack mínimo

| Paquete | Versión | Uso |
|---|---|---|
| `react`, `react-dom` | 19.3.0 | Interfaz |
| `vite` | 8.3.2 (la misma que usa Vitest) | Desarrollo, compilación y vista previa |
| `@vitejs/plugin-react` | 6.1.1 | JSX |
| `zod` | 4.6.5 (la de `contracts`) | Validar respuestas con los esquemas compartidos |
| `@fontsource/fira-sans`, `@fontsource/fira-code` | 5.3.0 | Fuentes **locales** empaquetadas por Vite |
| `vitest` 5.0.3 + `jsdom` 30.1.1 + Testing Library | | Estado y componentes |
| `@playwright/test` | 1.63.0 | Navegador real |

- Todas son versiones estables publicadas antes de la antigüedad mínima de pnpm; no se añadió ninguna excepción ni script de instalación.
- **Sin router, sin librería de estado y sin kit de componentes:** es una sola página con cuatro secciones.
- TypeScript 7 solo comprueba tipos (`tsc --noEmit`); Vite compila.

### 2. Arquitectura por funcionalidades

| Carpeta | Responsabilidad |
|---|---|
| `api/` | Cliente HTTP centralizado y funciones por endpoint |
| `catalogos/` | Consultas con cancelación |
| `captura/` | Estado (reducer puro), armado y validación de la solicitud, secciones de captura |
| `calculo/` | Estado del cálculo y panel de resultado |
| `ejemplos/` | Entradas públicas de los 4 escenarios |
| `inicio/` | Pantalla de inicio |
| `comunes/` | Componentes visuales y formato |
| `config/` | URL pública de la API validada |

- **Contratos:** la web importa **solo** `@softarq/contracts`. Nunca `apps/api`, Prisma, el motor ni fixtures con costos; una prueba lo vigila sobre el código fuente.
- **Validación con los esquemas compartidos:**
  - la solicitud se valida con `EsquemaSolicitudCalculoDemo` antes de enviarla;
  - cada respuesta, con su esquema. Una respuesta que no cumple se trata como «incompatible» y no se muestra.

### 3. Estado y cálculo

- **La captura vive en un `useReducer`** (una fuente de verdad):
  - las medidas son **texto** tal como se escriben;
  - la solicitud se arma por lista explícita de campos: `consolidarCompras`, `partidas` y `preciosElegidos`;
  - nunca lleva organización, fecha, costos ni importes;
  - los `preciosElegidos` incluyen solo los de los insumos de los conceptos actuales.
- **Huella:** cada resultado guarda la huella (JSON canónico) de la solicitud enviada. Si la captura cambia, el panel muestra «Pendiente de recalcular» y **ningún importe**.
- **Sin duplicados ni respuestas atrasadas:**
  - se calcula solo desde el botón, nunca en un efecto, así que StrictMode no duplica;
  - un `ref` «en curso» y el botón deshabilitado evitan los duplicados;
  - un cambio durante el cálculo aborta la petición (`AbortController`). Si aun así llega, se descarta por número de solicitud y por huella;
  - las consultas de catálogo usan `AbortController` y un número de generación: solo se aplica la última. La búsqueda espera 250 ms.
- **Errores:**
  - un error recuperable conserva la captura;
  - el reintento es siempre manual, sin bucles automáticos;
  - el cliente HTTP distingue validación (400, con mensajes junto al campo por la ruta `partidas[0].mediciones[1].piezas`), no encontrado (404), bloqueo (422), límite (429 con `Retry-After`), servicio no disponible (503), error del servidor, red, respuesta incompatible y cancelación.
- **Sin persistencia:** no hay `localStorage` ni guardado; la interfaz avisa que la captura dura mientras la página esté abierta.

### 4. Reglas del flujo

- **Selección explícita:**
  - en una captura propia **no se preselecciona** ninguna opción ni la consolidación de compras (el contrato no tiene valor por omisión);
  - `esMenorPrecio` se muestra como la insignia «Menor precio vigente», pero no decide.
- **Ejemplos:**
  - rellenan una captura editable con sus selecciones;
  - son copia de `docs/api/ejemplos/*.json` (una prueba exige que coincidan) y no contienen totales;
  - cada selección se comprueba contra las opciones vigentes que entrega la API. Si una ya no está, el insumo queda **sin selección** y con aviso, y nada se sustituye;
  - tras un bloqueo BL-08, «Actualizar opciones disponibles» vuelve a consultar y marca la opción que dejó de valer.
- **Campos de medida por fórmula:**
  - la tabla `DIMENSIONES_POR_FORMULA` se trasladó del motor a `packages/contracts`. Es una regla de captura (qué campos existen), no una fórmula de importes;
  - el motor la importa, así que no hay dos copias;
  - en AREA, el usuario elige si la segunda medida es ancho o alto.
- **Validación local solo de completitud y formato:** campos requeridos, punto decimal y opciones elegidas. Las reglas de negocio (por ejemplo, piezas enteras, monto mayor que cero o vigencias) las decide el servidor y se muestran como errores 400 junto al campo o como bloqueos 422.
- **Bloqueos:** muestran código y mensaje, nunca importes (ni cero ni los de un cálculo anterior).
- **Formato:**
  - es-MX aplicado al **texto** recibido (agrupación de miles), sin convertir a `number`;
  - la moneda es la de la respuesta (`cotizacion.moneda`).
- **Textos recibidos:** siempre como texto, sin `dangerouslySetInnerHTML`.

### 5. Configuración y transporte

- **Vite** escucha solo en `127.0.0.1`:
  - desarrollo en el puerto 5173 y vista previa en el 4173;
  - `strictPort` activado; sin `proxy` ni hosts adicionales.
- **Origen de la web:** `http://localhost:5173`, ya incluido en `API_CORS_ORIGINS`.
- **`VITE_API_URL`:**
  - pública y sin secretos; por omisión `http://127.0.0.1:3000` (desde el módulo 5, `http://localhost:3000` y solo `localhost`, por la cookie de sesión: [ADR-0007](0007-autenticacion-sesiones.md) §5);
  - se valida en `vite.config.ts` y en ejecución: solo http a loopback, con puerto, sin ruta ni credenciales. Una URL inválida hace fallar el arranque o la compilación.
- **CSP** en `index.html`:
  - `default-src 'self'`;
  - `connect-src` solo hacia la API configurada (en desarrollo, también el HMR local);
  - `object-src 'none'`, `base-uri 'none'` y `form-action 'none'`.
- **Sin CDN:** fuentes, iconos (SVG en línea) y el favicon son locales.

### 6. Pruebas de navegador reales

- **Playwright** con el **Edge instalado** (canal `msedge`), sin descargar Chromium, con un solo worker.
- **Contra qué se prueba:** la web **compilada** (`vite build` y `vite preview` en `127.0.0.1:4173`) y la API real en `127.0.0.1:3101` sobre **softarq_test**.
- **Arranque del servidor de pruebas:** `apps/api/src/pruebas-e2e/servidor-e2e.ts`, compilado con `tsconfig.e2e.json` en `dist-e2e/`, que no se versiona ni forma parte de `dist/`. Reutiliza las protecciones de las pruebas de integración:
  - exige `softarq_test` local y confirma `current_database()` antes de vaciar;
  - carga el DEMO;
  - fija la fecha de cálculo con `RelojFijo("2026-09-25")`, el mismo mecanismo que las pruebas HTTP. El navegador no controla ninguna fecha.
- **Bloqueos reales:** `ajustar-base.ts` desactiva y reactiva un proveedor, y vacía y restaura el impuesto, solo en `softarq_test` y con el rol de la aplicación.
- **Fallos simulados en el navegador:** los fallos de red, 503, 429, respuestas incompatibles y retrasos se provocan con `page.route`.
- **Salidas:** el informe, las trazas y las capturas de evidencia van a `D:\Proyecto_SoftArq\_work`.

### 7. Diseño

- **Sistema visual** en [`docs/web/sistema-visual.md`](../web/sistema-visual.md), obtenido con UI UX Pro Max (`search.py`): estilo «Minimalism & Swiss», densidad alta y movimiento mínimo.
- **Criterios de accesibilidad verificados:**
  - contraste ≥ 4.5:1, con una prueba sobre los tokens;
  - teclado completo y foco visible;
  - objetivos de 44 px o más;
  - `aria-live="polite"` en el resultado;
  - estados con texto e icono, no solo con color;
  - `prefers-reduced-motion` respetado;
  - tablas que se apilan en pantallas estrechas con roles ARIA explícitos.

## Consecuencias

- La web es un cliente delgado: si cambia una regla de cálculo o de bloqueo, solo cambia la API.
- `contracts` gana una constante de captura compartida. Cualquier cambio en las dimensiones por fórmula afecta a la vez al motor y a la web.
- **Pruebas de navegador:** `pnpm verificar:e2e` vacía y recarga **softarq_test**. No debe ejecutarse a la vez que `pnpm verificar:integracion`, porque comparten la base.
- **Pendiente:**
  - autenticación y contexto real (la organización sigue siendo DEMO y fija en el servidor);
  - guardado de borradores y cotizaciones;
  - formato decimal con coma, que hoy se rechaza con un mensaje que indica usar punto.
