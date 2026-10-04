# Skills del proyecto (Claude Code y Codex)

- **Fecha de instalación:** 02/10/2026
- **Alcance:** proyecto. Las skills se versionan en el repositorio:
  - Claude Code lee `.claude/skills/`;
  - Codex lee `.agents/skills/`.

  Ninguno de los dos agentes explora la carpeta del otro, así que no hay doble instalación en una ubicación escaneada.
- **Reglas de uso:** [`AGENTS.md`](../../AGENTS.md) §11 y [`CLAUDE.md`](../../CLAUDE.md).

> **Grafo de código (Graphify):** no es una skill. Se integra como herramienta de línea de comandos con su propia guía: [`graphify.md`](graphify.md) (`AGENTS.md` §12). La skill `/graphify` no se instala porque usa modelos.

## 1. Inventario

| Skill | Fuente | Versión instalada | Licencia | Claude Code | Codex |
|---|---|---|---|---|---|
| `ui-ux-pro-max` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | CLI `ui-ux-pro-max-cli@2.15.0` (npm). HEAD del repositorio consultado: `09170eec67eefd46a7ae85de61b40c194020f997` | MIT | `.claude/skills/ui-ux-pro-max/` | `.agents/skills/ui-ux-pro-max/` |
| `caveman` | https://github.com/JuliusBrussee/caveman, ruta `skills/caveman/` | commit `b39c90862855ad2f0813ce775b8bf07a9d6d2a50` | Apache-2.0 (y MIT para aportaciones anteriores a 3.0.0) | `.claude/skills/caveman/` | `.agents/skills/caveman/` |
| `grill-me` | https://github.com/mattpocock/skills, ruta `skills/productivity/grill-me/` | commit `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` | MIT | `.claude/skills/grill-me/` | `.agents/skills/grill-me/` (adaptada) |
| `grilling` (dependencia de `grill-me`) | mismo repositorio, `skills/productivity/grilling/` | mismo commit | MIT | `.claude/skills/grilling/` | `.agents/skills/grilling/` |

Cada carpeta incluye la licencia original (`LICENSE` y, en Caveman, también `NOTICE` y `LICENSE-MIT`) y un `PROCEDENCIA.md` con el repositorio, el commit o la versión, la ruta, el SHA-256 de los originales y los cambios.

## 2. Método de instalación

Todo se reproduce con el script versionado (requiere git, pnpm y Python 3 solo con biblioteca estándar):

```
python scripts/skills/instalar_skills.py                       # instala en el repositorio
python scripts/skills/instalar_skills.py --destino <carpeta>   # reproduce en otra carpeta para comparar
python scripts/skills/instalar_skills.py --reemplazar          # actualiza (sobrescribe) lo instalado
```

- **Caveman y mattpocock:**
  - clon parcial (`git sparse-checkout`) del commit fijado en `D:\Proyecto_SoftArq\_work\skills-src`;
  - se copian **solo** las carpetas de las skills y las licencias;
  - de Caveman **no** se instalan su plugin, hooks, proxy, wrappers ni el resto de skills;
  - del repositorio de Matt Pocock solo `grill-me` y `grilling`.
- **UI UX Pro Max:**
  - se ejecuta `pnpm dlx ui-ux-pro-max-cli@2.15.0 init --ai claude|codex --offline` en `_work\tmp`, sin instalación global; la CLI no tiene scripts de instalación;
  - de su salida se copia **solo** `ui-ux-pro-max`;
  - la licencia MIT se toma del repositorio en el commit indicado.

**Por qué no se usó el plugin del marketplace para Claude:**
- El plugin oficial (`ui-ux-pro-max@ui-ux-pro-max-skill`, manifiesto 2.13.0) y la CLI instalan **7 skills**: `banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling` y `ui-ux-pro-max`.
- Solo se pidió `ui-ux-pro-max`, que es autónoma: sus datos y scripts están en su carpeta, y `--design-system` es una opción de su script, no otra skill.
- Se probó el marketplace con `--scope project`, se revisaron sus manifiestos (sin hooks ni MCP en la raíz) y se retiró antes de instalar el plugin, que nunca llegó a instalarse.
- Así ambos agentes usan la misma versión publicada y fijada (CLI 2.15.0). Su contenido no es idéntico al HEAD `09170ee` del repositorio, que está más adelantado.

## 3. Dependencias

- **ui-ux-pro-max:** Python 3 para `scripts/search.py`, solo con biblioteca estándar, sin red ni instalaciones. Disponible: Python 3.14.5. En Windows se invoca como `python`.
- **caveman:** ninguna.
- **grill-me:** requiere `grilling`, instalada.
  - En Claude delega con la herramienta Skill.
  - En Codex lee `.agents/skills/grilling/SKILL.md`.
  - `grilling` pide delegar búsquedas de hechos en subagentes: Claude Code los tiene y Codex 0.154.0 también (`multi_agent`, estable y activo).

## 4. Activación

| Skill | Claude Code | Codex | Regla del proyecto |
|---|---|---|---|
| `ui-ux-pro-max` | `/ui-ux-pro-max`; también automática por descripción | `$ui-ux-pro-max`; también implícita | Solo interfaz y accesibilidad |
| `caveman` | Solo `/caveman [nivel]` (`disable-model-invocation: true`, añadido) | Solo `$caveman` (`allow_implicit_invocation: false`, añadido) | Lite y en español por omisión; solo para la conversación |
| `grill-me` | Solo `/grill-me` (`disable-model-invocation: true`, del original) | Solo `$grill-me` (`allow_implicit_invocation: false`, del original) | Solo decisiones abiertas; nunca durante trabajo aprobado |
| `grilling` | Invocable; `grill-me` la carga | Implícita | Igual que `grill-me` |

**Comandos personales con el mismo nombre (solo Claude):**
- `~/.claude/commands/` contiene `caveman.md`, `grill-me.md` y `ui-ux-pro-max.md`, con contenido de otro proyecto.
- La documentación de Claude Code establece que una skill tiene prioridad sobre un comando del mismo nombre, así que en este repositorio se usan las skills. Las pruebas de la §6 lo confirman: las respuestas citan el texto de las skills, no el de los comandos.
- Los archivos personales **no** se modificaron.
- **Observación del módulo 4 (02/10/2026):**
  - la herramienta Skill de Claude Code, invocada con `ui-ux-pro-max`, devolvió el contenido del comando **personal** `~/.claude/commands/ui-ux-pro-max.md`, una lista de comprobación de otro proyecto que menciona «Accept/Refer/Decline», y no el `SKILL.md` del repositorio;
  - la prioridad descrita arriba no se cumplió en ese caso. Para el diseño se usó directamente la skill del repositorio (`python .claude/skills/ui-ux-pro-max/scripts/search.py …`), y del comando ajeno solo se tomaron los criterios generales de accesibilidad que coinciden con este proyecto;
  - si se quiere evitar la ambigüedad, el propietario puede renombrar o retirar sus comandos personales; el agente no los modifica.
- **Mecanismo comprobado en el módulo 5 (02/10/2026):**
  - **Causa:** Claude Code descubre las skills de proyecto en el `.claude/skills/` del **directorio donde se abre la sesión**. Esta sesión se abrió en `D:\Proyecto_SoftArq` (clave de proyecto `D--Proyecto-SoftArq`), que no tiene `.claude/`, así que las skills de `softarq-platform/.claude/skills/` **no se registran**. La lista de skills de la sesión no las mostraba.
  - **Qué carga cada invocación en esa sesión** (verificado por el contenido devuelto):

    | Invocación | Resultado |
    |---|---|
    | Herramienta Skill con `ui-ux-pro-max` | Comando personal (`userSettings:ui-ux-pro-max`): la lista «Accept/Refer/Decline», no el `SKILL.md` del repositorio |
    | Herramienta Skill con `projectSettings:ui-ux-pro-max` | «Unknown skill» |

  - **Uso correcto:**
    - **preferido:** abrir Claude Code con `softarq-platform` como directorio de trabajo (`cd D:\Proyecto_SoftArq\softarq-platform` y después `claude`). Así la skill del proyecto existe y tiene prioridad sobre el comando homónimo (es lo que comprobaron las pruebas de la §6, hechas desde el repositorio);
    - **si la sesión está abierta en la carpeta superior:** no usar la herramienta Skill para `ui-ux-pro-max`, sino leer explícitamente `softarq-platform/.claude/skills/ui-ux-pro-max/SKILL.md` y sus recursos, y consultar `python .claude/skills/ui-ux-pro-max/scripts/search.py …` desde la raíz del repositorio. Así se hizo en el módulo 5;
    - comprobar siempre qué texto se cargó: el `SKILL.md` empieza por «UI/UX Pro Max - Design Intelligence»; el comando personal menciona «Accept/Refer/Decline».
  - **Comprobación repetida en el módulo 6 (03/10/2026):** la sesión seguía abierta en `D:\Proyecto_SoftArq`. `projectSettings:ui-ux-pro-max` volvió a responder «Unknown skill» y el nombre corto había cargado el comando personal (`userSettings:ui-ux-pro-max`, «Accept/Refer/Decline»). Se usó de nuevo la alternativa documentada: lectura explícita de `.claude/skills/ui-ux-pro-max/SKILL.md` (empieza por «UI/UX Pro Max - Design Intelligence») y `scripts/search.py`. **Estado:** causa identificada y alternativa comprobada; el conflicto **no está resuelto** mientras la sesión no se abra en `softarq-platform`. Los comandos personales no se modificaron.
  - **Sin cambios en `caveman` ni en `grill-me`:** tienen el mismo riesgo (también hay comandos personales homónimos), así que se aplica la misma regla. Sus reglas de uso no cambian y los comandos personales no se modificaron.

## 5. Adaptaciones (mínimas y documentadas)

| Archivo | Cambio | Motivo |
|---|---|---|
| `.claude/skills/caveman/SKILL.md` | Se añadió al frontmatter `disable-model-invocation: true` y un comentario que lo indica; cuerpo literal | Uso solo explícito |
| `.agents/skills/caveman/agents/openai.yaml` | Archivo nuevo con `allow_implicit_invocation: false` | Uso solo explícito en Codex |
| `.agents/skills/grill-me/SKILL.md` | `Call the Skill tool with "grilling".` se sustituyó por leer y seguir `.agents/skills/grilling/SKILL.md`; el texto original se conserva en un comentario | Codex no tiene la herramienta Skill de Claude Code |

Todo lo demás es copia literal, verificada con `cmp` y con la reproducción descrita en §6. El nivel por omisión de Caveman (lite en español) y sus límites (no tocar documentación técnica, mantener las actualizaciones de progreso) se fijan en `AGENTS.md` §11, sin modificar la skill.

## 6. Comprobaciones realizadas (02/10/2026)

| Comprobación | Resultado |
|---|---|
| Copias literales frente al origen (`cmp`) | Iguales, salvo las adaptaciones de §5 |
| Reproducción con `instalar_skills.py --destino _work/tmp/skills-reproduccion` | `diff -rq` sin diferencias frente a lo instalado |
| Finales de línea y huellas | El primer clon heredó `core.autocrlf=true` global (CRLF). Se reinstaló desde clones nuevos con `core.autocrlf=false`: no hay CRLF en ninguna skill, y el SHA-256 de `PROCEDENCIA.md` coincide con el archivo crudo de GitHub en el commit fijado (por ejemplo, `grilling/SKILL.md` `10ff989e…` y `caveman/SKILL.md` `0bf09a0a…`) |
| `search.py "construction quote dashboard accessible" --domain ux` en ambas copias | Resultados correctos; código 0; sin `__pycache__` |
| `search.py … --design-system -p "SoftArq DEMO"` (sin `--persist`) | Genera la recomendación sin escribir archivos |
| `codex debug prompt-input` antes y después | Antes: solo skills del sistema. Después: aparecen `grilling` y `ui-ux-pro-max`; `caveman` y `grill-me` no, porque su invocación implícita está desactivada (comportamiento esperado) |
| `codex exec --ephemeral --sandbox read-only '$caveman lite …'` | «Aplico caveman lite; la primera frase literal es: «Respond terse like smart caveman.»» |
| `codex exec … '$ui-ux-pro-max …'` | Cita `.agents/skills/ui-ux-pro-max/scripts/search.py` y `python` en Windows |
| `codex exec … '$grill-me …'` | Leyó `.agents/skills/grilling/SKILL.md` y cita el formato `❓ **Q1** - **<question title>**: …` |
| `claude -p '/caveman lite …'` | Nivel lite; cita «Respond terse like smart caveman.» (es la skill, no el comando personal) |
| `claude -p '/ui-ux-pro-max …'` | Cita `.claude/skills/ui-ux-pro-max/scripts/search.py` |
| `claude -p '/grill-me …'` | «cargué la skill `grilling` con la herramienta Skill»; cita su formato de preguntas |

Las pruebas con `claude -p` y `codex exec` usaron las cuentas configuradas del equipo. Los registros están en `D:\Proyecto_SoftArq\_work\registros\`, fuera del repositorio.

## 7. Escrituras fuera de D:

- `pnpm dlx` resuelve paquetes en las cachés de `_work`.
- `claude -p` y `codex exec` escriben su estado y configuración en el perfil de usuario (`~/.claude`, `~/.codex`). `codex exec --ephemeral` no guarda la sesión.
- El clon temporal del marketplace (unos 30 MB en `~/.claude/plugins/marketplaces`) se eliminó al retirar el marketplace.

## 8. Procedimiento de actualización

1. Consulta los commits o versiones nuevos:
   - `git ls-remote https://github.com/<repo> HEAD`;
   - `pnpm view ui-ux-pro-max-cli version`.
2. Actualiza las constantes `CAVEMAN`, `MATT`, `UIPRO_REPO` y `UIPRO_CLI` de `scripts/skills/instalar_skills.py`.
3. Revisa en el origen:
   - que las rutas y el frontmatter no hayan cambiado; el script se detiene si la instrucción adaptada de `grill-me` o el frontmatter de Caveman ya no coinciden;
   - las licencias;
   - si aparecen hooks, scripts o dependencias nuevas.
4. Reproduce primero en una carpeta aparte y compara:

   ```
   python scripts/skills/instalar_skills.py --destino D:/Proyecto_SoftArq/_work/tmp/skills-nuevas
   ```

5. Instala con `--reemplazar`, repite las comprobaciones de §6 y actualiza este documento y `HANDOFF.md`.
