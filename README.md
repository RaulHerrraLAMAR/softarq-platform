# SoftArq Platform

Plataforma de **cotización de estructuras de construcción** (fase 2 del proyecto SoftArq). Sucede al libro de Excel de la fase 1 (`Cotizador_Estructuras_F1.xlsm`, versión 1.0.0-F1), que sigue siendo la referencia funcional.

> **Estado (04/10/2026):** módulos 1 a 8 terminados (los módulos 7 y 8 añadieron revisión, aprobación, emisión y PDF DEMO; ver [`HANDOFF.md`](HANDOFF.md) §1). Antes, módulos 1 a 6: **motor de cálculo** (CR-01 a CR-16), **persistencia de catálogos** en PostgreSQL con Prisma, **API HTTP local** con NestJS 12, **cliente web DEMO** con React y Vite, **usuarios DEMO con sesiones** (Argon2id, cookie HttpOnly, CSRF y permisos por función y organización) y **clientes, proyectos y cotizaciones** con folio WEB DEMO, borrador y versiones inmutables calculadas en el servidor. Resultados de pruebas en [`HANDOFF.md`](HANDOFF.md). Todo dato de ejemplo es **DEMO** y no tiene validez comercial.

## Estructura

| Ruta | Contenido | Tecnología prevista |
|---|---|---|
| `apps/api` | API: cálculos, permisos, reglas de negocio y validación. Hoy: dominio de cálculo, catálogos, sesiones, clientes, proyectos y cotizaciones con versiones, por HTTP local | NestJS 12, decimal.js, Prisma 7.10 + PostgreSQL 18, Zod 4 y Vitest |
| `apps/web` | Cliente web DEMO: calculadora, clientes, proyectos, cotizaciones con borrador, versiones e historial | React 19 + Vite 8, TypeScript 7, Playwright |
| `apps/mobile` | App móvil | React Native con Expo |
| `packages/contracts` | Contratos compartidos sin lógica: tipos del cálculo y esquemas Zod de la API HTTP (definición única) | TypeScript (ESM), Zod 4 |
| `docs` | Decisiones de arquitectura y referencias a la fase 1 | Markdown |

Principio: **los clientes solo comparten contratos**. Toda regla de negocio vive en la API.

## Documentos de trabajo

- [`AGENTS.md`](AGENTS.md): reglas para personas y agentes (Claude, Codex).
- [`CLAUDE.md`](CLAUDE.md): importa `AGENTS.md` y añade notas específicas de Claude Code.
- [`HANDOFF.md`](HANDOFF.md): estado actual, decisiones vigentes y siguiente paso. **Léelo primero.**
- [`docs/`](docs/README.md): decisiones (ADR), matriz de reglas del cálculo, modelo conceptual y estado verificado de la fase 1.
- [`docs/herramientas/skills.md`](docs/herramientas/skills.md): skills de Claude Code (`.claude/skills/`) y Codex (`.agents/skills/`), con sus reglas de uso (`AGENTS.md` §11).
- [`docs/herramientas/graphify.md`](docs/herramientas/graphify.md): grafo de código local para los agentes (Graphify, solo AST; `AGENTS.md` §12):

  ```
  pnpm grafo:estado          # ¿refleja el grafo los archivos actuales?
  pnpm grafo:actualizar      # reconstruye (AST, sin modelos); salida en graphify-out/, ignorada por Git
  pnpm grafo:instalar-hooks  # una vez por clon: actualiza tras cambiar de rama o integrar
  graphify query "<pregunta concreta>" --budget 800
  ```

## Requisitos locales

| Herramienta | Versión verificada (02/10/2026) |
|---|---|
| Git | 2.51.0 |
| Node.js | 24.11.1 |
| pnpm | 11.1.3 |
| PostgreSQL | 18.6 (servicio local, datos en `D:\Postgres18\data`) |

Cachés y almacenes de paquetes van a `D:\Proyecto_SoftArq\_work` (configurado en `pnpm-workspace.yaml` y `.npmrc`).

## Configuración

1. Instala y verifica desde la raíz del repositorio:

```
pnpm install --frozen-lockfile
pnpm verificar          # build + typecheck + test de todos los paquetes
```

2. Prepara PostgreSQL local (credenciales locales, roles, bases, migraciones y catálogo DEMO): sigue [`apps/api/README.md`](apps/api/README.md#preparar-el-entorno-desde-cero). Después:

```
pnpm verificar:integracion   # pruebas contra softarq_test (la única base que pueden vaciar)
```

3. Arranca la API local (solo `127.0.0.1:3000`) y consulta [`docs/api/README.md`](docs/api/README.md):

```
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start
curl -s http://127.0.0.1:3000/health
```

   Las cuentas DEMO se crean con `pnpm --filter @softarq/api db:cargar-usuarios-demo`; sus accesos quedan en `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json`, fuera del repositorio ([ADR-0007](docs/adr/0007-autenticacion-sesiones.md)).

4. Abre la web DEMO (con la API en marcha) en **http://localhost:5173** e inicia sesión con una cuenta DEMO ([`apps/web/README.md`](apps/web/README.md); guía de prueba en [`docs/web/guia-prueba-manual.md`](docs/web/guia-prueba-manual.md)):

```
pnpm --filter @softarq/web dev
pnpm verificar:e2e      # pruebas de navegador: web compilada + API real + softarq_test
```

`.env.example` documenta las variables; los archivos reales (`apps/api/.env`, `.env.test`) los genera `db:credenciales` y no se versionan.

Para mantener los temporales fuera de `C:`, en la sesión de terminal:

```
# Git Bash
export TEMP=/d/Proyecto_SoftArq/_work/tmp TMP=/d/Proyecto_SoftArq/_work/tmp
# PowerShell
$env:TEMP='D:\Proyecto_SoftArq\_work\tmp'; $env:TMP=$env:TEMP
```

## Relación con la fase 1

La entrega de la fase 1 está en `D:\Proyecto_SoftArq\entrega\` y **no forma parte de este repositorio**. No se copian el Excel, el Word, respaldos ni PDF aquí. Ver [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md).
