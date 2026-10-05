# Grafo de código local (Graphify)

Grafo **estructural** del código propio para orientar a Claude Code y a Codex hacia los archivos relevantes y sus relaciones. Es solo AST: no usa modelos, claves de API, cuentas ni servicios en la nube, y no es una dependencia de la aplicación. Decisión: [ADR-0011](../adr/0011-grafo-de-codigo-graphify.md). Rutina de los agentes: [`AGENTS.md`](../../AGENTS.md) §12.

## 1. Versión y procedencia (comprobado el 04/10/2026)

| Dato | Valor |
|---|---|
| Ejecutable | `C:\Users\RAUL\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe` (Python 3.14.5) |
| Paquete | `graphifyy` **0.8.5** en PyPI (MIT), instalado por el propietario. No se reinstaló ni se actualizó. |
| Proyecto | La página del paquete indica `github.com/safishamsi/graphify`, que **redirige (301) a `github.com/Graphify-Labs/graphify`**, la referencia del proyecto. Es el mismo proyecto. |
| Diferencias con la documentación actual | `graphify install --project` y `--platform codex` **no existen en 0.8.5**: `graphify install --project` termina con `error: unknown install option '--project'`. |

## 2. Por qué no se usan los instaladores de Graphify

Se simularon en una copia desechable (`_work\evidencias\graphify-simulacion-instaladores\`, con los diff):

| Comando | Qué hace en 0.8.5 | Problema |
|---|---|---|
| `graphify install` | Copia la skill a `~/.claude/skills/graphify` y la registra en `~/.claude/CLAUDE.md` (**global**) | Escribe en la configuración personal, fuera del proyecto. La skill `/graphify` usa además modelos para la extracción semántica. |
| `graphify claude install` | Añade a `CLAUDE.md` una sección «## graphify» en inglés y un hook `PreToolUse` sobre Bash en `.claude/settings.json` que llama a `python3` | Ordena «ALWAYS read GRAPH_REPORT.md» antes de cualquier búsqueda, lo que contradice la regla de no cargar el informe completo. El hook depende de `python3`. **Reescribe el archivo entero con finales CRLF.** |
| `graphify codex install` | Añade la misma sección a `AGENTS.md` y crea `.codex/hooks.json` con `graphify hook-check` | La misma regla, y el hook **no hace nada** (`hook-check` termina con 0). |
| `graphify hook install` | Hooks de Git que reconstruyen con `nohup` | Escribe registros en `~/.cache` (C:) y usa `SIGALRM`, que no existe en Windows. Hereda además el problema de §6.1. |

Las instrucciones equivalentes, en español y compatibles con las reglas, se integraron a mano en `AGENTS.md` §12 y `CLAUDE.md`. El mantenimiento usa el script versionado de §4.

## 3. Alcance indexado

- **Incluido** (204 archivos al 04/10/2026; lista exacta con `pnpm grafo:archivos`):
  - `apps/api/src`, `apps/web/src`, `apps/web/e2e`, `packages/contracts/src`;
  - `apps/api/scripts` (`.mjs`, `.ps1`), `scripts/grafo`, `scripts/http`;
  - `*.config.ts`.
- **Excluido** en [`.graphifyignore`](../../.graphifyignore):
  - `.env*`, llaves y credenciales;
  - `_work`, `node_modules`, `dist*`, cobertura, cachés y registros;
  - datos, respaldos, `documentos-*`;
  - PDF, Excel, Word e imágenes;
  - `graphify-out`;
  - el cliente Prisma generado (`apps/api/src/generated`);
  - las skills de terceros (`.claude`, `.agents`, `scripts/skills`);
  - toda la documentación (`docs/`, `*.md`) y `*.json`.
- **Sin soporte o con análisis parcial en 0.8.5:**
  - **SQL** (`apps/api/prisma/migrations/*.sql`, `scripts/db/*.sql`): se detecta, pero no se extrae porque falta `tree_sitter_sql`. Generaba 0 nodos, así que se excluye. Se lee directamente.
  - **`schema.prisma`**: no soportado. Se lee directamente.
  - **`.ps1`**: solo el nodo del archivo, sin funciones.
  - **`.mjs`**: constantes y funciones de nivel superior.
  - **Cadenas y comentarios**: no forman parte del grafo. Los códigos de regla (`BL-17`, `CR-16`, `D-16`…) se buscan con `rg`.
  - **Omitidos por Graphify como «sensibles» por su nombre**, sin opción de reincluirlos: `apps/api/src/http/tokens.ts`, `apps/api/src/modules/autenticacion/infraestructura/tokens.ts` y `apps/web/src/estilos/tokens.css`. Las relaciones de **sesión y CSRF que pasan por `tokens.ts`** no aparecen en el grafo.
  - **Comunidades** con nombres genéricos («Community N»): ponerles nombre requeriría un modelo.
- La **documentación** (ADR, `HANDOFF.md`, `docs/`, Word maestro) no entra en el grafo: se consulta con lectura dirigida.

## 4. Comandos

Desde la raíz del repositorio (`D:\Proyecto_SoftArq\softarq-platform`):

```
pnpm grafo:estado            # VIGENTE / DESACTUALIZADO / PENDIENTE / AUSENTE (≈2 s; no reconstruye)
pnpm grafo:actualizar        # reconstruye solo con AST (≈15–30 s; la caché AST evita reextraer lo que no cambió)
pnpm grafo:archivos          # conjunto real indexado y archivos omitidos
pnpm grafo:instalar-hooks    # hooks de Git post-checkout y post-merge (una vez por clon)

graphify query "<pregunta concreta>" --budget 800   # recorrido BFS limitado en tokens
graphify explain "<nodo>"                           # vecinos de un símbolo o archivo
graphify path "<A>" "<B>"                           # camino más corto entre dos nodos
```

- **`scripts/grafo/grafo.mjs`** ejecuta Graphify sin variables de proveedores (`*API_KEY`, `*_TOKEN`, `*SECRET*`, `*ACCESS_KEY*`), con `GRAPHIFY_NO_TIPS=1` y `PYTHONDONTWRITEBYTECODE=1`.
- **Archivos generados en `graphify-out/`**, en D: e ignorados por Git:
  - `graph.json`, `GRAPH_REPORT.md` y `graph.html`;
  - `cache/`, la caché AST;
  - `manifest.json`;
  - `softarq-estado.json`, el estado propio: versión, commit, SHA-256 de cada archivo indexado y de `.graphifyignore`;
  - `ultima-actualizacion.log`.
- **No se usan:**
  - `graphify extract`, `/graphify`, `--backend` ni `add`, porque invocan modelos o red;
  - `graphify watch`, porque es un proceso permanente;
  - `graphify benchmark`, porque no se ha medido el ahorro de tokens y por eso no se afirma ninguno.

## 5. Vigencia y actualización

- **Comprobación:** `pnpm grafo:estado` compara el SHA-256 de cada archivo indexado y de `.graphifyignore` con los del último grafo, y busca archivos de código nuevos que Graphify indexaría. Si hay alguno, lo confirma con la detección real de Graphify. Termina con código 0 solo si el grafo está **VIGENTE**.
- **PENDIENTE:** `actualizar` marca el estado como PENDIENTE **antes** de reconstruir. Si falla o se interrumpe, nunca queda como vigente. Mientras hay una actualización en curso, un candado (`graphify-out/.actualizando`) hace que `estado` informe PENDIENTE y que una segunda actualización simultánea no arranque.
- **Cuándo actualizar:**
  - al iniciar una tarea, si `estado` no dice VIGENTE;
  - tras cambios relevantes en código, contratos, esquema o migraciones (en el esquema y las migraciones el grafo no cambia, pero sí su código consumidor);
  - al cerrar cada módulo;
  - tras cambiar de rama o integrar cambios. Esto es automático con los hooks de Git: lanzan **una** actualización desacoplada y regresan al instante (medido: `git switch` en 1 s; sin el desacople, la reconstrucción en primer plano lo bloqueaba unos 25 s). Mientras corre, el estado es PENDIENTE.
- **No** se reconstruye después de cada edición.
- **Claude Code:** el hook `SessionStart` de [`.claude/settings.json`](../../.claude/settings.json) ejecuta `grafo.mjs estado --hook`. Imprime una línea, nunca reconstruye, no invoca proveedores y siempre termina con 0.
- **Codex:** no tiene hook (el de Graphify no hace nada). Sigue la rutina de `AGENTS.md` §12.
- **Regenerar si se borra:** borrar `graphify-out/` y ejecutar `pnpm grafo:actualizar`. Todo se reconstruye desde el código con `.graphifyignore` y `scripts/grafo/grafo.mjs`, ambos versionados.

### 5.1 Hooks instalados

- **Git** (`.git/hooks/`, no versionados; los genera `pnpm grafo:instalar-hooks` y llevan la marca `# softarq-grafo-hook`):
  - `post-checkout`: solo en cambios de rama;
  - `post-merge`.

  Si ya existe un hook ajeno, **no se sobrescribe**: se avisa para integrarlo a mano. Antes de instalarlos no había hooks propios ni `core.hooksPath`.
- **Claude Code:** `SessionStart` en `.claude/settings.json`, versionado. `settings.local.json` se conserva.

## 6. Comprobaciones realizadas (04/10/2026)

### 6.1 Limitación descubierta en `graphify update`

En 0.8.5, `graphify update .` **conserva** los nodos y aristas del `graph.json` anterior: el mecanismo existe para preservar nodos semánticos, y la expulsión de nodos solo ocurre con una lista explícita de cambios. Prueba real:
- al cambiar un import, la arista antigua seguía presente;
- al borrar un archivo, su nodo permanecía y se informaba «No code-graph topology changes».

Por eso `grafo.mjs actualizar` hace una **reconstrucción limpia**:
1. aparta `graph.json`;
2. ejecuta `graphify update . --force`;
3. si falla, restaura el grafo anterior y deja el estado PENDIENTE.

No hay nodos semánticos que perder y la caché AST se conserva.

### 6.2 Prueba controlada de actualización

Archivo temporal `apps/api/src/grafo-prueba-temporal.ts`, eliminado al terminar; evidencia en `_work\evidencias\graphify-prueba-actualizacion.txt`:

| Paso | `estado` antes de actualizar | Grafo después de `actualizar` |
|---|---|---|
| Añadir `import { ErrorDocumento } from ".../almacen-documentos.js"` | DESACTUALIZADO, `nuevo:` | aristas a `almacen-documentos.ts` y `ErrorDocumento` |
| Cambiar a `import { GeneradorCsrf } from ".../csrf.js"` | DESACTUALIZADO, `cambiado:` | solo aristas a `csrf.ts` y `GeneradorCsrf`; las anteriores desaparecen |
| Eliminar el archivo | DESACTUALIZADO, `eliminado:` | 0 menciones en `graph.json`; `estado` vuelve a VIGENTE |

También se comprobó que:
- un archivo `.ts` nuevo en la raíz marca DESACTUALIZADO, y un `.json` nuevo excluido no lo marca;
- un cambio en `.graphifyignore` marca DESACTUALIZADO;
- con un cambio de rama, el hook regresa en 1 s y deja el estado PENDIENTE hasta terminar, sin procesos residuales;
- con dos cambios de rama seguidos, el segundo respeta el candado.

### 6.3 Consultas contrastadas con el código

| Tema | Consulta | Resultado verificado en las fuentes |
|---|---|---|
| Sesiones, CSRF y permisos | `graphify query "sesion csrf guardia permisos"`, `graphify explain "GeneradorCsrf"` | `GeneradorCsrf` (`autenticacion/infraestructura/csrf.ts` L19) con métodos `tokenPara`, `esValido`, `mac` y constructor, importado por `crear-aplicacion.ts`, `servicio-autenticacion.ts` y `autenticacion.test.ts`. Coincide con los `import` reales. También aparecen `capacidades.ts`, `politica.ts`, `LimitadorAccesos` y `ProveedorSesion.tsx`. **No aparece `tokens.ts`** (omitido como sensible, §3). |
| Motor de cálculo y contratos | `graphify query "motor calculo contratos calcularCotizacion"` | `calculo/domain/motor.ts`, `packages/contracts/src/calculo.ts`, `contracts/src/api/esquemas.ts`, `reglas.test.ts`, los servicios de cotizaciones, revisiones y emisiones y las pruebas de integración de cálculo desde la base. |
| Revisión, aprobación y BL-17 | `graphify query "revision aprobacion aprobar BL-17"`, `graphify explain "servicio-revisiones.ts"` | `servicio-revisiones.ts` (52 conexiones: repositorios, `verificacion.ts`, idempotencia, controladores), `contracts/src/api/revisiones.ts` y `web/cotizaciones/revisiones.tsx`. **BL-17 es una cadena**, así que el grafo no la ve: con `rg "BL-17"` se localiza en `servicio-revisiones.ts` L71/284/426, `capacidades.ts` L16 y las migraciones. |
| Emisión, almacén y descarga del PDF | `graphify query "emision pdf almacen documentos descarga"`, `graphify explain "AlmacenDocumentos"`, `graphify path "servicio-emisiones.ts" "almacen-documentos.ts"` | `AlmacenDocumentos`, importado por `servicio-emisiones.ts`, `crear-aplicacion.ts` (import multilínea, L51; un `grep` de una sola línea no lo veía) y `concurrencia-emision.integracion.test.ts`. Ruta directa `servicio-emisiones.ts → almacen-documentos.ts`. También `repositorio-emisiones.ts`, `verificacion.ts`, `pdf.test.ts` y `web/cotizaciones/emision.tsx`. |

Las relaciones del grafo son `EXTRACTED` (del AST), salvo 9 `INFERRED` de 4.699. Aun así, **toda relación se verifica abriendo el archivo** antes de editar.

## 7. Escrituras fuera de D:

- `graphify update` y `query` no escribieron en `~/.graphify` ni en `~/.cache`. El archivo `~/.cache/graphify-rebuild.log`, de septiembre, es anterior y ajeno a este proyecto.
- Los instaladores solo se ejecutaron en la copia desechable de `_work`.
- `~/.claude` y `~/.codex` no se modificaron.

## 7.1 Entornos que no encuentran Graphify (diagnóstico del 05/10/2026)

En la sesión del módulo 9, Codex no pudo reconstruir el grafo: `python` daba ENOENT y el Python propio de su entorno no tenía el módulo `graphify`. Comprobado después desde la sesión del propietario (Claude Code, Git Bash y PowerShell):

| Comprobación | Resultado |
|---|---|
| `graphify` en el PATH | `C:\Users\RAUL\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe` |
| `python` en el PATH | `C:\Users\RAUL\AppData\Local\Python\bin\python.exe` → intérprete `pythoncore-3.14-64`, con `graphifyy` 0.8.5 en su `site-packages` |
| Qué usa `grafo.mjs` | `GRAPHIFY_EXE` o, si no existe, `graphify`; `GRAPHIFY_PYTHON` o, si no existe, `python` (detección del conjunto indexado). No hay rutas antiguas en el repositorio |
| `pnpm grafo:actualizar` | Correcto: 221 archivos, 2.389 nodos y 5.124 aristas; `grafo:estado` VIGENTE |

**Conclusión:** la instalación no estaba dañada. El fallo se debía a un entorno restringido sin el PATH del usuario. No se reinstaló nada ni se cambiaron perfiles.

Si un entorno no hereda ese PATH, se pueden indicar las rutas solo para el comando, sin tocar configuraciones globales. Las variables ya existían en el script:

```powershell
$env:GRAPHIFY_EXE = 'C:\Users\RAUL\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe'
$env:GRAPHIFY_PYTHON = 'C:\Users\RAUL\AppData\Local\Python\pythoncore-3.14-64\python.exe'
pnpm grafo:actualizar
```

Si el entorno no puede leer esas rutas (acceso denegado), no hay alternativa en el repositorio. Se trabaja con `rg` y el grafo se actualiza después desde el entorno del propietario. El procedimiento de reconstrucción limpia de la §6.1 no cambia.

## 8. Desinstalar del proyecto

1. Borrar `graphify-out/`.
2. Quitar los hooks de Git con la marca `softarq-grafo-hook`.
3. Quitar el hook `SessionStart` de `.claude/settings.json`.
4. Quitar las secciones de `AGENTS.md` §12 y `CLAUDE.md`.

El paquete `graphifyy` es del propietario y no se toca.
