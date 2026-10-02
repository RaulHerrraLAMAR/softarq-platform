# ADR-0001 — Monorepo y stack de la fase 2

- **Fecha:** 02/10/2026
- **Estado:** aceptada (indicación del autor del proyecto)

## Contexto

La fase 1 (libro Excel 1.0.0-F1) dejó como dirección prevista PostgreSQL, con migración controlada desde los CSV del libro, y no decidió el resto del stack (Word maestro v1.3, sección 1.2; `CONTEXTO_SoftArq_Fase1.md`, sección 9). Al iniciar la fase 2 se define el stack.

El Word (sección 10.3) coloca la compuerta hacia la fase 2 después del piloto de la fase 1 (PR-44), que sigue pendiente. El desarrollo empieza antes de esa compuerta por decisión del autor; la primera entrega de la aplicación será un **DEMO para aprobación**, no un lanzamiento.

## Decisión

- Monorepo con **pnpm workspaces**: `apps/web`, `apps/api`, `apps/mobile`, `packages/contracts`, `docs`.
- Web: **React + TypeScript**.
- Móvil: **React Native con Expo**.
- API: **NestJS + TypeScript**.
- Base de datos de desarrollo: **PostgreSQL local** (servidor 18.6 ya instalado).
- Entre clientes y API solo se comparten **contratos** (`packages/contracts`). Los cálculos, permisos y reglas de negocio viven exclusivamente en la API.

## Consecuencias

- El cálculo de la cotización se implementa una sola vez, en la API, con aritmética decimal exacta y el redondeo CR-15.
- Los clientes no pueden producir importes oficiales; dependen de la API.
- Pendiente de decidir en ADR posteriores: biblioteca decimal, ORM o capa de acceso a datos y migraciones, validación de esquemas en contratos, autenticación, herramienta de pruebas y generación de PDF.
