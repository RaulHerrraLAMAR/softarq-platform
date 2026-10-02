#!/usr/bin/env python3
"""
Instala (o reproduce) las skills del proyecto para Claude Code (.claude/skills) y Codex (.agents/skills)
desde sus fuentes originales y versiones fijadas. Ver docs/herramientas/skills.md.

    python scripts/skills/instalar_skills.py                       # instala en el repositorio
    python scripts/skills/instalar_skills.py --destino <carpeta>   # reproduce en otra carpeta (verificación)
    python scripts/skills/instalar_skills.py --reemplazar          # sobrescribe skills ya instaladas

Requisitos: git, pnpm (para ui-ux-pro-max-cli) y Python 3 (solo biblioteca estándar).
Descargas y temporales: <raiz>/../_work/skills-src y _work/tmp (fuera del repositorio).
No instala hooks, plugins, proxies ni otras skills de esos repositorios.
"""
import argparse
import hashlib
import os
import shutil
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
TRABAJO = RAIZ.parent / "_work"
FUENTES = TRABAJO / "skills-src"
FECHA = "02/10/2026"

CAVEMAN = ("JuliusBrussee/caveman", "b39c90862855ad2f0813ce775b8bf07a9d6d2a50")
MATT = ("mattpocock/skills", "d81f3a183412e71a5b1e84ca21bc1a35eea03a60")
UIPRO_REPO = ("nextlevelbuilder/ui-ux-pro-max-skill", "09170eec67eefd46a7ae85de61b40c194020f997")
UIPRO_CLI = "ui-ux-pro-max-cli@2.15.0"


def ejecutar(args, **kw):
    print("  $", " ".join(str(a) for a in args))
    subprocess.run(args, check=True, **kw)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def escribir(destino: Path, texto: str) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto, encoding="utf-8", newline="\n")


def copiar(origen: Path, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(origen, destino)


def clonar(nombre: str, repo: str, commit: str, rutas: list[str]) -> Path:
    """Clon parcial (sparse checkout) del commit fijado."""
    destino = FUENTES / nombre
    entorno = {**os.environ, "MSYS_NO_PATHCONV": "1"}
    if not (destino / ".git").exists():
        ejecutar(["git", "clone", "-q", "--filter=blob:none", "--no-checkout", f"https://github.com/{repo}", str(destino)], env=entorno)
    ejecutar(["git", "-C", str(destino), "sparse-checkout", "set", "--no-cone", *rutas], env=entorno)
    ejecutar(["git", "-C", str(destino), "-c", "core.autocrlf=false", "checkout", "-q", commit], env=entorno)
    real = subprocess.run(["git", "-C", str(destino), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    if real != commit:
        raise SystemExit(f"{repo}: se esperaba {commit} y se obtuvo {real}")
    return destino


def preparar_destino(base: Path, reemplazar: bool) -> None:
    if base.exists():
        if not reemplazar:
            raise SystemExit(f"Ya existe {base}; use --reemplazar para sobrescribirla.")
        shutil.rmtree(base)


def procedencia(base: Path, repo: str, commit: str, ruta: str, originales: dict, licencia: str, cambios: list) -> None:
    lineas = [
        f"# Procedencia de `{base.name}`",
        "",
        f"- **Repositorio:** https://github.com/{repo}",
        f"- **Commit instalado:** `{commit}`",
        f"- **Ruta de origen:** `{ruta}`",
        f"- **Licencia:** {licencia} (texto incluido en esta carpeta)",
        f"- **Instalado:** {FECHA}, copia con sparse checkout del commit indicado (ver `docs/herramientas/skills.md`).",
        "",
        "## SHA-256 de los archivos originales",
        "",
        "| Archivo de origen | SHA-256 |",
        "|---|---|",
    ]
    lineas += [f"| `{k}` | `{v}` |" for k, v in originales.items()]
    lineas += ["", "## Cambios respecto al original", ""]
    lineas += [f"- {c}" for c in cambios] if cambios else ["- Ninguno: copia literal."]
    escribir(base / "PROCEDENCIA.md", "\n".join(lineas) + "\n")


def instalar_caveman(destino: Path, reemplazar: bool) -> None:
    cav = clonar("caveman", *CAVEMAN, ["/skills/caveman/", "/LICENSE", "/LICENSE-MIT", "/NOTICE", "/LICENSING.md"])
    skill = cav / "skills/caveman/SKILL.md"
    readme = cav / "skills/caveman/README.md"
    originales = {"skills/caveman/SKILL.md": sha(skill), "skills/caveman/README.md": sha(readme)}
    texto = skill.read_text(encoding="utf-8")
    if not texto.startswith("---\nname: caveman\n"):
        raise SystemExit("caveman: frontmatter inesperado; revisar antes de adaptar.")
    cierre = texto.index("\n---\n", 4)
    for agente, carpeta in (("claude", ".claude/skills/caveman"), ("codex", ".agents/skills/caveman")):
        base = destino / carpeta
        preparar_destino(base, reemplazar)
        if agente == "claude":
            escribir(base / "SKILL.md", texto[:cierre]
                     + "\ndisable-model-invocation: true"
                     + f"\n# Modificado por SoftArq ({FECHA}): se añadió disable-model-invocation (uso solo explícito). Ver PROCEDENCIA.md."
                     + texto[cierre:])
            cambios = ["`SKILL.md`: se añadió `disable-model-invocation: true` (y un comentario que lo indica) al frontmatter "
                       "para que Claude Code no la active sola; el cuerpo es literal."]
        else:
            copiar(skill, base / "SKILL.md")
            escribir(base / "agents/openai.yaml",
                     f"# Añadido por SoftArq ({FECHA}): uso solo explícito ($caveman) en Codex. Ver PROCEDENCIA.md.\n"
                     "interface:\n  display_name: \"Caveman\"\n  short_description: \"Respuestas comprimidas solo cuando se invoca\"\n"
                     "policy:\n  allow_implicit_invocation: false\n")
            cambios = ["`SKILL.md`: copia literal.",
                       "`agents/openai.yaml`: archivo nuevo (no existe en el origen) con `allow_implicit_invocation: false` "
                       "para uso solo explícito en Codex."]
        copiar(readme, base / "README.md")
        for lic in ("LICENSE", "LICENSE-MIT", "NOTICE"):
            copiar(cav / lic, base / lic)
        procedencia(base, CAVEMAN[0], CAVEMAN[1], "skills/caveman/", originales,
                    "Apache-2.0 (`LICENSE`, `NOTICE`); aportaciones anteriores a 3.0.0 bajo MIT (`LICENSE-MIT`)", cambios)


def instalar_grill(destino: Path, reemplazar: bool) -> None:
    mp = clonar("mattpocock", *MATT, ["/skills/productivity/grill-me/", "/skills/productivity/grilling/", "/LICENSE"])
    for nombre in ("grill-me", "grilling"):
        skill = mp / f"skills/productivity/{nombre}/SKILL.md"
        yaml = mp / f"skills/productivity/{nombre}/agents/openai.yaml"
        originales = {f"skills/productivity/{nombre}/SKILL.md": sha(skill),
                      f"skills/productivity/{nombre}/agents/openai.yaml": sha(yaml)}
        for agente, carpeta in (("claude", f".claude/skills/{nombre}"), ("codex", f".agents/skills/{nombre}")):
            base = destino / carpeta
            preparar_destino(base, reemplazar)
            cambios = []
            if agente == "codex" and nombre == "grill-me":
                literal = 'Call the Skill tool with "grilling".'
                texto = skill.read_text(encoding="utf-8")
                if literal not in texto:
                    raise SystemExit("grill-me cambió en el origen: revisar la adaptación para Codex.")
                escribir(base / "SKILL.md", texto.replace(
                    literal,
                    f"<!-- Adaptado por SoftArq para Codex ({FECHA}). Original: 'Call the Skill tool with \"grilling\".'"
                    " Codex no tiene la herramienta Skill de Claude Code. Ver PROCEDENCIA.md. -->\n\n"
                    "Use the `grilling` skill: read `.agents/skills/grilling/SKILL.md` and follow it exactly."))
                cambios.append("`SKILL.md`: la instrucción `Call the Skill tool with \"grilling\".` (herramienta Skill, exclusiva de "
                               "Claude Code) se sustituyó por leer y seguir `.agents/skills/grilling/SKILL.md`, con un comentario "
                               "que conserva el texto original.")
            else:
                copiar(skill, base / "SKILL.md")
            if agente == "codex":
                copiar(yaml, base / "agents/openai.yaml")
            else:
                cambios.append("`agents/openai.yaml` no se copia para Claude (es configuración de Codex).")
            copiar(mp / "LICENSE", base / "LICENSE")
            procedencia(base, MATT[0], MATT[1], f"skills/productivity/{nombre}/", originales, "MIT (`LICENSE`)", cambios)


def instalar_uipro(destino: Path, reemplazar: bool) -> None:
    lic_dir = FUENTES / "uipro"
    lic_dir.mkdir(parents=True, exist_ok=True)
    licencia = lic_dir / "LICENSE"
    if not licencia.exists():
        ejecutar(["curl", "-sSfL", "-o", str(licencia),
                  f"https://raw.githubusercontent.com/{UIPRO_REPO[0]}/{UIPRO_REPO[1]}/LICENSE"])
    for agente, carpeta in (("claude", ".claude/skills/ui-ux-pro-max"), ("codex", ".agents/skills/ui-ux-pro-max")):
        temporal = TRABAJO / "tmp" / f"uipro-{agente}"
        if temporal.exists():
            shutil.rmtree(temporal)
        temporal.mkdir(parents=True)
        # pnpm dlx con la versión fijada; las cachés de pnpm quedan en _work (pnpm-workspace.yaml).
        ejecutar(["pnpm", "--dir", str(RAIZ), "dlx", UIPRO_CLI, "init", "--ai", agente, "--offline"],
                 cwd=temporal, shell=os.name == "nt")
        origen = temporal / carpeta
        base = destino / carpeta
        preparar_destino(base, reemplazar)
        shutil.copytree(origen, base)  # solo ui-ux-pro-max; las otras 6 skills del instalador se descartan
        copiar(licencia, base / "LICENSE")
        archivos = sorted(p for p in origen.rglob("*") if p.is_file())
        total = sum(p.stat().st_size for p in archivos)
        escribir(base / "PROCEDENCIA.md", f"""# Procedencia de `ui-ux-pro-max` ({agente})

- **Instalador:** `{UIPRO_CLI}` (npm, licencia MIT), ejecutado con versión fijada:
  `pnpm dlx {UIPRO_CLI} init --ai {agente} --offline` en un directorio temporal de `_work`.
- **Repositorio de origen:** https://github.com/{UIPRO_REPO[0]}
  (HEAD consultado el {FECHA}: `{UIPRO_REPO[1]}`; el contenido instalado es el que
  empaqueta la CLI 2.15.0, que no es idéntico al de ese HEAD).
- **Licencia:** MIT (`LICENSE`, tomado del repositorio en el commit indicado).
- **Instalado:** {FECHA}.
- **Contenido:** {len(archivos)} archivos, {total} bytes (SKILL.md, `data/` y `scripts/` con sus pruebas).

## Selección

El instalador (y el plugin del marketplace) instalan 7 skills: `banner-design`, `brand`, `design`,
`design-system`, `slides`, `ui-styling` y `ui-ux-pro-max`. Por regla del proyecto solo se instala
`ui-ux-pro-max`, que es autónoma (sus datos y scripts están en esta carpeta; `--design-system` es una
opción de su script, no otra skill). Ver `docs/herramientas/skills.md`.

## Cambios respecto a la salida del instalador

- Se añadieron `LICENSE` y este `PROCEDENCIA.md`. El resto es una copia literal.

## SHA-256 de `SKILL.md`

`{sha(origen / "SKILL.md")}`
""")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--destino", type=Path, default=RAIZ, help="carpeta raíz donde crear .claude/skills y .agents/skills")
    p.add_argument("--reemplazar", action="store_true", help="sobrescribe skills ya instaladas")
    a = p.parse_args()
    destino = a.destino.resolve()
    print(f"Instalando skills en {destino}")
    instalar_caveman(destino, a.reemplazar)
    instalar_grill(destino, a.reemplazar)
    instalar_uipro(destino, a.reemplazar)
    print("Listo. Verifique el reconocimiento según docs/herramientas/skills.md.")


if __name__ == "__main__":
    main()
