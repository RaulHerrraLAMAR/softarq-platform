@AGENTS.md

## Específico de Claude Code

- Shell: Windows con PowerShell 5.1 y Git Bash. En Bash usa rutas `/d/Proyecto_SoftArq/...`; en PowerShell, `D:\Proyecto_SoftArq\...`.
- Para archivos temporales de la sesión usa `D:\Proyecto_SoftArq\_work\tmp`, no el directorio temporal del sistema (`C:`).
- Al ejecutar Python para inspeccionar archivos, usa `PYTHONDONTWRITEBYTECODE=1` para no dejar `__pycache__`.

## Skills en Claude Code

Las reglas de uso están en `AGENTS.md` §11; aquí solo lo propio de Claude Code.

- **Invocación:**
  - `/ui-ux-pro-max` para interfaz y accesibilidad;
  - `/caveman [lite|full|ultra]`: sin nivel indicado, lite en español;
  - `/grill-me`, que carga `grilling` con la herramienta Skill.
- **Activación automática:** `caveman` y `grill-me` tienen `disable-model-invocation: true` y solo se activan al invocarlas. `grilling` y `ui-ux-pro-max` pueden activarse por su descripción, pero solo deben usarse en los casos de `AGENTS.md` §11.
- **Comandos personales con el mismo nombre:** `~/.claude/commands/` tiene `caveman.md`, `grill-me.md` y `ui-ux-pro-max.md`, de otro proyecto. No modifiques esos archivos personales.
  - **Abre Claude Code en `softarq-platform`:** las skills del proyecto solo se registran si la sesión se abre en este directorio, y entonces prevalecen sobre el comando del mismo nombre.
  - **Si la sesión está abierta en `D:\Proyecto_SoftArq`,** la herramienta Skill resuelve el comando personal (comprobado en el módulo 5). En ese caso, lee directamente `.claude/skills/<skill>/SKILL.md` y usa sus scripts.
  - **Comprueba siempre qué contenido se cargó** ([`docs/herramientas/skills.md`](docs/herramientas/skills.md) §4).
- **Cambios en una skill:** si editas o reinstalas una skill, la sesión la detecta al recargar. Si no aparece, inicia una sesión nueva; no hace falta interrumpir el trabajo en curso.

## Grafo de código en Claude Code

La rutina está en `AGENTS.md` §12; aquí solo lo propio de Claude Code.

- **Hook `SessionStart`** (`.claude/settings.json`): al abrir la sesión en `softarq-platform` muestra una línea con el estado del grafo. Si dice DESACTUALIZADO, PENDIENTE o AUSENTE, sigue el paso 2 de la rutina.
- **El hook solo informa:** no reconstruye ni invoca proveedores, y nunca bloquea el inicio. Si la sesión se abrió en `D:\Proyecto_SoftArq`, no se ejecuta; en ese caso, lanza `pnpm grafo:estado` a mano.
- **Ejecuta `graphify` desde Bash o PowerShell en la raíz del repositorio**, con `--budget` para limitar la salida.
- **No hay skill `/graphify` instalada, a propósito:** la de Graphify usa modelos.
