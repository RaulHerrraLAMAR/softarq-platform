@AGENTS.md

## Específico de Claude Code

- Shell: Windows con PowerShell 5.1 y Git Bash. En Bash usa rutas `/c/Proyecto_SoftArq/Proyecto_SoftArq/...`; en PowerShell, `C:\Proyecto_SoftArq\Proyecto_SoftArq\...` (en el equipo original eran `D:\Proyecto_SoftArq`).
- Para archivos temporales de la sesión usa `<raíz>\_work\tmp` (`$env:TEMP`/`$env:TMP` apuntando ahí), no el directorio temporal del sistema.
- `node`, `pnpm` y `psql` pueden no estar en el PATH de una sesión abierta antes de instalarlos: abre una terminal nueva o recarga el PATH. PostgreSQL 18 está en `C:\Program Files\PostgreSQL\18\bin` (`SOFTARQ_PG_BIN` lo sobrescribe).
- Al ejecutar Python para inspeccionar archivos, usa `PYTHONDONTWRITEBYTECODE=1` para no dejar `__pycache__`.

## App móvil (`apps/mobile`, módulo 16)

Reglas en `AGENTS.md` §13; guía del teléfono en `docs/movil/guia-instalacion-y-pruebas.md`.

- **Android Platform Tools** (solo `adb`): `_work\tools\platform-tools\adb.exe`. Para que el teléfono llegue a la API local por USB: `adb reverse tcp:3000 tcp:3000` (y `tcp:8081` con la *development build*).
- **EAS CLI** sin instalación global: `pnpm --filter @softarq/mobile eas <comando>` (versión fijada). El inicio de sesión de EAS y la primera compilación (keystore) son interactivos: pídeselos al usuario con `!`; nunca pidas contraseñas ni tokens por el chat.
- Procesos que lances (API de desarrollo en 3000, servidor de pruebas en 3101, Metro en 8081): detén solo los tuyos. Con 8 GB no mantengas Metro, web y E2E abiertos a la vez.
- `pnpm verificar:secuencial` en lugar de `pnpm verificar` si aparecen fallos de tiempo por carga (equipo de 2 núcleos).

## Skills en Claude Code

Las reglas de uso están en `AGENTS.md` §11; aquí solo lo propio de Claude Code.

- **Invocación:**
  - `/ui-ux-pro-max` para interfaz y accesibilidad;
  - `/caveman [lite|full|ultra]`: sin nivel indicado, lite en español;
  - `/grill-me`, que carga `grilling` con la herramienta Skill.
- **Activación automática:** `caveman` y `grill-me` tienen `disable-model-invocation: true` y solo se activan al invocarlas. `grilling` y `ui-ux-pro-max` pueden activarse por su descripción, pero solo deben usarse en los casos de `AGENTS.md` §11.
- **Comandos personales con el mismo nombre:** `~/.claude/commands/` tiene `caveman.md`, `grill-me.md` y `ui-ux-pro-max.md`, de otro proyecto. No modifiques esos archivos personales.
  - **Abre Claude Code en `softarq-platform`:** las skills del proyecto solo se registran si la sesión se abre en este directorio, y entonces prevalecen sobre el comando del mismo nombre.
  - **Si la sesión está abierta en la raíz del proyecto (no en `softarq-platform`),** la herramienta Skill resuelve el comando personal (comprobado en el módulo 5). En ese caso, lee directamente `.claude/skills/<skill>/SKILL.md` y usa sus scripts.
  - **Comprueba siempre qué contenido se cargó** ([`docs/herramientas/skills.md`](docs/herramientas/skills.md) §4).
- **Cambios en una skill:** si editas o reinstalas una skill, la sesión la detecta al recargar. Si no aparece, inicia una sesión nueva; no hace falta interrumpir el trabajo en curso.

## Grafo de código en Claude Code

La rutina está en `AGENTS.md` §12; aquí solo lo propio de Claude Code.

- **Hook `SessionStart`** (`.claude/settings.json`): al abrir la sesión en `softarq-platform` muestra una línea con el estado del grafo. Si dice DESACTUALIZADO, PENDIENTE o AUSENTE, sigue el paso 2 de la rutina.
- **El hook solo informa:** no reconstruye ni invoca proveedores, y nunca bloquea el inicio. Si la sesión se abrió fuera de `softarq-platform`, no se ejecuta; en ese caso, lanza `pnpm grafo:estado` a mano.
- **Ejecuta `graphify` desde Bash o PowerShell en la raíz del repositorio**, con `--budget` para limitar la salida.
- **No hay skill `/graphify` instalada, a propósito:** la de Graphify usa modelos.
