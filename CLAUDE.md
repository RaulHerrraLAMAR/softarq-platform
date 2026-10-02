@AGENTS.md

## Específico de Claude Code

- Shell: Windows con PowerShell 5.1 y Git Bash. En Bash usa rutas `/d/Proyecto_SoftArq/...`; en PowerShell, `D:\Proyecto_SoftArq\...`.
- Para archivos temporales de la sesión usa `D:\Proyecto_SoftArq\_work\tmp`, no el directorio temporal del sistema (`C:`).
- Al ejecutar Python para inspeccionar archivos, usa `PYTHONDONTWRITEBYTECODE=1` para no dejar `__pycache__`.
