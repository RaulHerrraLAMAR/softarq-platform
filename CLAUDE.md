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
- **Comandos personales con el mismo nombre:** `~/.claude/commands/` tiene `caveman.md`, `grill-me.md` y `ui-ux-pro-max.md`, de otro proyecto. En este repositorio prevalecen las skills de `.claude/skills/` (una skill tiene prioridad sobre un comando del mismo nombre). No modifiques esos archivos personales.
- **Cambios en una skill:** si editas o reinstalas una skill, la sesión la detecta al recargar. Si no aparece, inicia una sesión nueva; no hace falta interrumpir el trabajo en curso.
