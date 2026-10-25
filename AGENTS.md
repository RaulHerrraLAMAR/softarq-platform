# AGENTS.md — Reglas para agentes (Claude, Codex y otros)

Fuente breve y obligatoria de reglas de trabajo en `softarq-platform`. El estado del proyecto y el siguiente paso están en `HANDOFF.md`: léelo al empezar y actualízalo al terminar.

## 1. Ubicación y entorno

- Trabaja solo en la raíz del proyecto. **Laptop actual (desde el 24/10/2026):** raíz `C:\Proyecto_SoftArq\Proyecto_SoftArq`, repositorio `C:\Proyecto_SoftArq\Proyecto_SoftArq\softarq-platform`. (Equipo original: `D:\Proyecto_SoftArq`; las rutas `D:` que quedan en informes, ADR y `HANDOFF.md` son históricas.) Deriva las rutas de la raíz; no añadas rutas absolutas de un perfil de usuario.
- Temporales, cachés, salidas de pruebas y almacenes de paquetes van en `<raíz>\_work` (fuera de Git). pnpm y npm ya están configurados así, con rutas relativas, en `pnpm-workspace.yaml` y `.npmrc`. Documentos originales en `<raíz>\datos\softarq_dev\documentos`; respaldos en `<raíz>\respaldos\softarq_dev`.
- En esta laptop `C:` es el único disco y está autorizado (la restricción de no escribir en `C:` era del equipo original). El equipo tiene 8 GB de RAM: un agente, sin procesos pesados simultáneos, y pruebas de integración y E2E en secuencia con un worker.
- Gestor de paquetes: **pnpm** (no npm ni yarn). No instales dependencias sin necesidad del cambio en curso.
- No despliegues servicios, no crees repositorios remotos y no hagas `push` sin petición explícita.

## 2. Fase 1 (Excel): solo lectura

- `<raíz>\entrega\` es la entrega de la fase 1. **No se modifica** desde este repositorio. Para analizar el libro, trabaja sobre una copia en `_work`.
- Libro oficial: `entrega\Cotizador_Estructuras_F1.xlsm`. Referencia funcional: `entrega\Documentacion_maestra_Cotizador_Estructuras_F1.docx` (v1.3).
- No copies al repositorio el Excel, el Word, respaldos, PDF ni datos personales sin revisarlos antes y sin que el usuario lo apruebe.

## 3. Idioma

- Documentación, mensajes al usuario, textos de interfaz y mensajes de commit: **español**.
- Identificadores de código: inglés o español, pero consistentes dentro de cada paquete.

## 4. Datos DEMO

- Todo dato de ejemplo se marca como DEMO (prefijo `[DEMO]` o campo `ambiente = DEMO`).
- Nunca presentes datos DEMO como reales ni el sistema como apto para cotizaciones comerciales reales mientras falten los datos y validaciones pendientes del Word maestro (capítulo 8).
- Los PDF y pantallas en ambiente DEMO deben mostrar la marca de demostración.

## 5. Arquitectura y seguridad

- **La API es la única fuente de cálculos, permisos y reglas de negocio.** Web y móvil solo capturan y muestran.
- `packages/contracts` solo contiene tipos, esquemas y enumeraciones compartidas; nunca lógica de negocio.
- Toda entrada se valida en el servidor, aunque el cliente ya la valide.
- Autorización comprobada en el servidor en cada operación; nada de confiar en datos de rol enviados por el cliente.
- Consultas SQL parametrizadas; nada de concatenar entrada del usuario.
- Los PDF comerciales nunca incluyen costos, proveedores, consumos, recargo, margen ni excepciones (D-16).

## 6. Precisión decimal

- Dinero y cantidades: aritmética decimal exacta. Nunca `number`/`float` para importes.
- PostgreSQL: `numeric` con precisión explícita. En JSON, los importes viajan como cadena decimal.
- Redondeo a centavos: mitad hacia arriba, simétrico en negativos (CR-15), no redondeo al par.
- Moneda única: MXN (D-18).

## 7. Versiones de cotización

- Una versión **emitida es inalterable**: no se actualiza ni se borra. Los cambios crean una versión nueva con motivo (D-17).
- Los folios no se reutilizan (D-14).
- Imponlo en la API y, cuando se diseñe la base de datos, también con restricciones o permisos en PostgreSQL.

## 8. Pruebas

- Ejecuta las pruebas que el cambio afecte: unitarias para reglas y cálculo; de integración para API y base de datos; de interfaz cuando cambie una pantalla.
- Todo cambio en cálculo debe compararse con los casos de la fase 1 (CR-01 a CR-16 y ejemplo ilustrativo del Word maestro). Ejecuta `pnpm verificar` y actualiza `docs/calculo/matriz-reglas.md`. Las fixtures llevan su `origen` y sus cifras esperadas se copian de la fuente, nunca del motor.
- Informa solo pruebas realmente ejecutadas, con su resultado. Si algo no se probó, dilo.

## 9. Git y secretos

- Nunca subas secretos, `.env`, credenciales, llaves, volcados de base de datos, temporales, cachés, `node_modules` ni compilaciones.
- Los valores de ejemplo van en `.env.example`, sin datos reales.
- Revisa `git status` y el diff antes de cada commit. Commits pequeños y descriptivos, en español.

## 10. Continuidad

- Al cerrar una tarea, actualiza `HANDOFF.md`: estado, pruebas realmente ejecutadas, incidencias, siguiente paso y último commit.
- No inventes resultados ni copies el Word maestro; enlaza la sección correspondiente.

## 11. Skills del proyecto

Instaladas con alcance de proyecto para Claude Code (`.claude/skills/`) y Codex (`.agents/skills/`). Fuentes, versiones y comprobaciones: [`docs/herramientas/skills.md`](docs/herramientas/skills.md).

- **Prioridad:** las skills **no sustituyen** estas reglas ni justifican ampliar el alcance aprobado. Si una skill contradice este archivo, prevalece este archivo.
- **Uso selectivo:** carga solo la skill pertinente y sus recursos cuando hagan falta; no cargues todas en cada tarea.
- **Carga verificada:** comprueba que se cargó el `SKILL.md` del repositorio y no un comando personal homónimo. En Claude Code, si la sesión no se abrió en `softarq-platform`, lee el `SKILL.md` directamente (`docs/herramientas/skills.md` §4).
- **UI UX Pro Max** (`ui-ux-pro-max`): solo para trabajo de interfaz y accesibilidad (web, móvil, revisión de pantallas). Sus recomendaciones no cambian reglas de negocio, contratos ni el requisito de marcar los datos DEMO.
- **Caveman** (`caveman`):
  - solo cuando el usuario la invoca. Sin nivel indicado, usa **lite en español**;
  - afecta únicamente a la comunicación en la conversación;
  - **nunca** comprime código, comentarios, mensajes de commit, contratos, ADR, `HANDOFF.md`, README ni otra documentación técnica del producto;
  - mantiene las actualizaciones breves de progreso que pide el proyecto, aunque la skill pida omitirlas;
  - se desactiva con «stop caveman» o «normal mode».
- **grill-me** (delega en `grilling`):
  - solo cuando el usuario la invoca para examinar decisiones abiertas;
  - **no** se activa durante migraciones, pruebas ni implementación con alcance aprobado;
  - no vuelve a preguntar decisiones ya documentadas (ADR, `HANDOFF.md`, `docs/`) salvo que haya evidencia nueva.

## 12. Grafo de código (Graphify)

Grafo estructural local del código propio, solo AST, sin modelos ni servicios externos. Alcance, comandos y limitaciones: [`docs/herramientas/graphify.md`](docs/herramientas/graphify.md) (ADR-0011). Es una ayuda para orientarse, no una fuente de verdad.

**Rutina al empezar y durante cada tarea:**

1. Lee estas reglas y el estado breve de `HANDOFF.md` (§1, §6 y §7); el resto, solo con lectura dirigida.
2. Ejecuta `pnpm grafo:estado`. Si no dice VIGENTE, ejecuta `pnpm grafo:actualizar`, o trabaja con búsquedas dirigidas (`rg`) mientras tanto. **Nunca bloquees el trabajo por el grafo.**
3. Consulta el grafo con preguntas concretas del módulo:
   - `graphify query "<pregunta>" --budget 800`;
   - `graphify explain "<símbolo o archivo>"`;
   - `graphify path "<A>" "<B>"`.

   **No cargues `graphify-out/graph.json`, `GRAPH_REPORT.md` ni `graph.html` completos en el contexto.**
4. Abre los archivos y las pruebas relevantes antes de editar. Verifica en las fuentes toda relación que muestre el grafo, sobre todo las `INFERRED`.
5. El grafo no contiene:
   - SQL, `schema.prisma`, documentación, cadenas ni comentarios (códigos como `BL-17` o `CR-16`);
   - los archivos `tokens.ts`, que Graphify omite como sensibles.

   Búscalos con `rg` o léelos directamente.

**Mantenimiento:**
- `pnpm grafo:actualizar` después de cambios relevantes en código, contratos, esquema o migraciones, y al cerrar cada módulo. No lo ejecutes tras cada edición.
- Tras cambiar de rama o integrar cambios, los hooks de Git (`pnpm grafo:instalar-hooks`) lanzan una actualización en segundo plano. Mientras corre, `estado` dice PENDIENTE.
- No uses `graphify extract`, `/graphify`, `graphify add` ni `graphify watch`, ni los instaladores `graphify install`, `claude install` o `codex install`: invocan modelos, dejan procesos permanentes o reescriben estas reglas.
- No afirmes que el grafo está actualizado si `pnpm grafo:estado` no dice VIGENTE.

## 13. App móvil del cliente (Expo, módulos 16 y 17)

Decisiones y límites: [ADR-0020](docs/adr/0020-app-movil-expo-conexion-y-sesion-movil.md) (conexión y sesión), [ADR-0021](docs/adr/0021-cliente-externo-solicitud-y-estimacion-preliminar.md) (cliente externo) y [ADR-0022](docs/adr/0022-identidad-visual-obra-calida-y-paquete-de-presentacion.md) (identidad visual). Guía: [`docs/movil/guia-instalacion-y-pruebas.md`](docs/movil/guia-instalacion-y-pruebas.md). API que usa: [`docs/movil/api-del-cliente.md`](docs/movil/api-del-cliente.md).

- **La app es del cliente y solo muestra.** No calcula (ni importes ni cantidades), no decide permisos ni contiene reglas de negocio; importa únicamente `@softarq/contracts/cliente` (nunca el índice completo, los contratos del equipo `cliente-equipo`, el motor, Prisma, credenciales ni código de Node del servidor). Solo llama a `/api/v1/cliente/…` y a la sesión móvil; las cuentas del equipo usan el panel web (403 `CUENTA_INTERNA_USE_PANEL`). Una estimación solo se presenta como vigente si corresponde a la captura que la produjo.
- **Sesión móvil aparte de la web:** `Authorization: Bearer` con una sesión de tipo `MOVIL`, solo en rutas marcadas `@PermitidaEnMovil()` (lista blanca). Una ruta nueva para el móvil se marca de forma explícita, con su prueba de integración; no se relajan CSRF, CORS ni `Origin` de la web.
- **Secretos:** el token solo en `expo-secure-store`; nada en AsyncStorage, archivos, URLs, registros ni `EXPO_PUBLIC_*` (son públicas: solo la URL de la API). No subas `.env`, APK, keystores ni `credentials.json`.
- **Documentos:** el PDF emitido se descarga con la sesión, se guarda sin transformar en la caché **privada** de la app y se borra al cerrar o perder la sesión. Solo `src/documentos/` usa `expo-file-system` (lo impone `seguridad-codigo.test.ts`); no hay WebView ni navegador interno.
- **Recursos locales:** fuentes, iconos e ilustraciones van dentro de la app con su licencia (`apps/mobile/assets/fonts/LICENCIAS.md`); nada se descarga en tiempo de ejecución ni desde un CDN. Sin motor 3D.
- **Conexión:** la API sigue en `127.0.0.1`; el teléfono llega por USB (`adb reverse`). No abras la API ni PostgreSQL a la red, no uses túneles públicos y no actives `usesCleartextTraffic` global: el HTTP en claro está acotado a `localhost` y `127.0.0.1` (`plugins/red-local.js`).
- **EAS Build:** se sube el repositorio `softarq-platform` filtrado por `.easignore` (lista blanca: raíz de pnpm, `apps/mobile` y `packages/contracts`). Si añades archivos que la compilación necesita, inclúyelos de forma explícita y comprueba la lista con `eas build:inspect` (guía §6). Una sola compilación `development` por etapa y solo cuando cambian módulos nativos o fuentes. Sin EAS Update, tiendas ni compras.
- **Comprobaciones:** `pnpm --filter @softarq/mobile comprobar:bundle` empaqueta la app y falla si el paquete contiene código del servidor, rutas de la laptop, secretos o contratos del equipo. Además de las pruebas unitarias, `app-cliente.integracion` ejecuta el código de la app contra la API real.
- **pnpm:** respeta `minimumReleaseAge` y `allowBuilds`; no añadas excepciones por rutina (`expo install` puede proponerlas: resuelve versiones maduras).
- **Datos:** las escrituras se validan en `softarq_test` (nunca crees datos de humo en `softarq_dev`; las solicitudes que el cliente crea en la demostración son datos de uso, no de humo). Informa como «verificado en el teléfono» solo lo que se ejecutó en el dispositivo.
