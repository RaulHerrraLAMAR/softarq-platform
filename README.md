# SoftArq Platform

Plataforma de **cotización de estructuras de construcción** (fase 2 del proyecto SoftArq). Sucede al libro de Excel de la fase 1 (`Cotizador_Estructuras_F1.xlsm`, versión 1.0.0-F1), que sigue siendo la referencia funcional.

> **Estado:** estructura inicial del repositorio. No hay código de aplicación, dependencias instaladas ni funciones de cotización. Todo dato de ejemplo será **DEMO** y no tiene validez comercial.

## Estructura

| Ruta | Contenido | Tecnología prevista |
|---|---|---|
| `apps/api` | API: cálculos, permisos, reglas de negocio y validación | NestJS + TypeScript, PostgreSQL |
| `apps/web` | Cliente web | React + TypeScript |
| `apps/mobile` | App móvil | React Native con Expo |
| `packages/contracts` | Contratos compartidos (tipos y esquemas), sin lógica | TypeScript |
| `docs` | Decisiones de arquitectura y referencias a la fase 1 | Markdown |

Principio: **los clientes solo comparten contratos**. Toda regla de negocio vive en la API.

## Documentos de trabajo

- [`AGENTS.md`](AGENTS.md): reglas para personas y agentes (Claude, Codex).
- [`CLAUDE.md`](CLAUDE.md): importa `AGENTS.md` y añade notas específicas de Claude Code.
- [`HANDOFF.md`](HANDOFF.md): estado actual, decisiones vigentes y siguiente paso. **Léelo primero.**
- [`docs/`](docs/README.md): decisiones (ADR) y estado verificado de la fase 1.

## Requisitos locales

| Herramienta | Versión verificada (02/10/2026) |
|---|---|
| Git | 2.51.0 |
| Node.js | 24.11.1 |
| pnpm | 11.1.3 |
| PostgreSQL | 18.6 (servicio local, datos en `D:\Postgres18\data`) |

Cachés y almacenes de paquetes van a `D:\Proyecto_SoftArq\_work` (configurado en `pnpm-workspace.yaml` y `.npmrc`).

## Configuración

1. Copia `.env.example` como `.env` y completa los valores locales. `.env` no se versiona.
2. Las instrucciones de instalación y ejecución se añadirán cuando se inicialicen las aplicaciones.

## Relación con la fase 1

La entrega de la fase 1 está en `D:\Proyecto_SoftArq\entrega\` y **no forma parte de este repositorio**. No se copian el Excel, el Word, respaldos ni PDF aquí. Ver [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md).
