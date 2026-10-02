# Procedencia de `ui-ux-pro-max` (codex)

- **Instalador:** `ui-ux-pro-max-cli@2.15.0` (npm, licencia MIT), ejecutado con versión fijada:
  `pnpm dlx ui-ux-pro-max-cli@2.15.0 init --ai codex --offline` en un directorio temporal de `_work`.
- **Repositorio de origen:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
  (HEAD consultado el 02/10/2026: `09170eec67eefd46a7ae85de61b40c194020f997`; el contenido instalado es el que
  empaqueta la CLI 2.15.0, que no es idéntico al de ese HEAD).
- **Licencia:** MIT (`LICENSE`, tomado del repositorio en el commit indicado).
- **Instalado:** 02/10/2026.
- **Contenido:** 68 archivos, 3566731 bytes (SKILL.md, `data/` y `scripts/` con sus pruebas).

## Selección

El instalador (y el plugin del marketplace) instalan 7 skills: `banner-design`, `brand`, `design`,
`design-system`, `slides`, `ui-styling` y `ui-ux-pro-max`. Por regla del proyecto solo se instala
`ui-ux-pro-max`, que es autónoma (sus datos y scripts están en esta carpeta; `--design-system` es una
opción de su script, no otra skill). Ver `docs/herramientas/skills.md`.

## Cambios respecto a la salida del instalador

- Se añadieron `LICENSE` y este `PROCEDENCIA.md`. El resto es una copia literal.

## SHA-256 de `SKILL.md`

`e5baf9400d4347e5ed3eb1f6b99cd0b9ba545b8b0e507aabb2b87397bbf73ea1`
