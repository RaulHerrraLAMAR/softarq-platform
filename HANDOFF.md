# HANDOFF — Continuidad entre sesiones y agentes

> Léelo al empezar. Actualízalo al terminar cada tarea (sección por sección, sin borrar el historial de la tabla 4). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

**Última actualización:** 02/10/2026 · Claude Code (Opus 5.5)

## 1. Estado actual

- **Fase 1 (Excel):** terminada para revisión técnica, con datos DEMO. No apta para cotizaciones comerciales reales. Pendientes: 12 datos reales, pruebas con personas (PR-41), cotizaciones reales (PR-42, PR-43), piloto (PR-44) y aceptación del profesor. **No se modifica desde aquí.**
- **Fase 2 (este repositorio):** estructura mínima del monorepo creada. **No hay código de aplicación, dependencias instaladas, base de datos creada ni funciones de cotización.**
- El libro oficial cambió después del cierre documental de la fase 1 (dos cotizaciones DEMO emitidas más y otra persona en turno). Detalle en [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md), sección 3.

## 2. Decisiones vigentes

| ID | Decisión | Dónde |
|---|---|---|
| ADR-0001 | Monorepo pnpm: `apps/web` (React + TS), `apps/api` (NestJS + TS), `apps/mobile` (React Native + Expo), `packages/contracts`, `docs` | [`docs/adr/0001-monorepo-y-stack.md`](docs/adr/0001-monorepo-y-stack.md) |
| ADR-0001 | Solo contratos compartidos; cálculos, permisos y reglas en la API | ídem |
| ADR-0001 | PostgreSQL local para desarrollo | ídem |
| F1 D-01…D-21 | Reglas funcionales de la fase 1 (precisión decimal, redondeo CR-15, folios no reutilizables, versiones emitidas inalterables, PDF sin datos internos, MXN, revisor ≠ preparador…) | Word maestro v1.3, capítulos 2 y 3 |
| Entorno | Trabajo local en `D:\Proyecto_SoftArq`; temporales y cachés en `D:\Proyecto_SoftArq\_work`; sin push ni remoto | `AGENTS.md` §1 |

Pendientes de decidir (ADR futuros): biblioteca decimal, ORM/migraciones, validación de esquemas, autenticación, pruebas, generación de PDF, alcance de la app móvil.

## 3. Archivos fuente de verdad

| Qué | Ruta |
|---|---|
| Especificación funcional | `D:\Proyecto_SoftArq\entrega\Documentacion_maestra_Cotizador_Estructuras_F1.docx` (v1.3) |
| Comportamiento de referencia | `D:\Proyecto_SoftArq\entrega\Cotizador_Estructuras_F1.xlsm` (1.0.0-F1); código VBA en `entrega\codigo_vba_exportado\` y `entrega\fuentes\vba\` |
| Resumen de la fase 1 | `D:\Proyecto_SoftArq\CONTEXTO_SoftArq_Fase1.md` |
| Estado verificado de la F1 y diferencias | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) |
| Reglas de trabajo | [`AGENTS.md`](AGENTS.md) |

`H.xlsm` fue una copia de prueba y ya no existe en el disco; no usarla como referencia.

## 4. Tareas terminadas

| Fecha | Tarea | Resultado |
|---|---|---|
| 02/10/2026 | Inspección de solo lectura de la entrega de la fase 1 | Versiones confirmadas; 5 diferencias documentadas en `docs/fase1-estado-verificado.md` |
| 02/10/2026 | Comprobación del entorno | Ver sección 5 |
| 02/10/2026 | Estructura del monorepo, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `README.md`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`, `.npmrc`, `pnpm-workspace.yaml`, ADR-0001 | Creados y revisados |
| 02/10/2026 | Commit inicial en `main` (local, sin push) | Ver sección 8 |

## 5. Pruebas y verificaciones realmente ejecutadas

No hay pruebas de software: todavía no existe código. Solo se ejecutaron estas verificaciones (02/10/2026):

- Lectura del `.xlsm` y de los `.docx` con Python; MD5 del libro idéntico antes y después (`b60debc1…a5b4f`).
- Versiones de herramientas: Git 2.51.0, Node 24.11.1, npm 11.6.2, pnpm 11.1.3, Python 3.14.5, Docker 29.1.3 (servicio detenido), PostgreSQL 18.6 (servicio `postgresql-x64-18` en ejecución, arranque automático).
- `pnpm store path` → `D:\Proyecto_SoftArq\_work\pnpm-store\v11`; `pnpm config get cache-dir/state-dir` → `../_work/...`; `npm config get cache` → `D:\Proyecto_SoftArq\_work\npm-cache`.
- PostgreSQL: binarios y datos en `D:\Postgres18` (`data` ≈ 41 MB); `listen_addresses = '*'`, puerto 5432; `pg_hba.conf` solo admite `127.0.0.1`/`::1` con `scram-sha-256`. **No se conectó a la base ni se creó ningún usuario o base.**
- Las cifras 193/193, TE-01…TE-10 y 46/46 de la fase 1 son **declaradas** por sus documentos; no se volvieron a ejecutar.

## 6. Incidencias y riesgos abiertos

1. **Libro oficial modificado tras el cierre documental** (folios 00016 y 00017 emitidos, persona en turno `[DEMO] Revisor 1`). Decide el autor: documentarlo o restaurar. Ver `docs/fase1-estado-verificado.md` §3–4.
2. **Fase 1:** incidencia de cierre inesperado de Excel (causa no determinada) y observación de hoja activa; heredadas, sin cambios.
3. **Espacio en `C:`:** ≈ 4,2 GB libres. `%TEMP%`, `%USERPROFILE%\.expo`, Gradle y el SDK de Android escriben en `C:` por defecto: configurar antes de inicializar `apps/mobile`.
4. **pnpm global:** el almacén global configurado en el equipo es `D:\.pnpm-store` (fuera del proyecto); este repositorio lo redirige a `_work` vía `pnpm-workspace.yaml`. Ejecutar pnpm siempre desde la raíz del repositorio.
5. **Orden de fases:** la fase 2 empieza antes del piloto PR-44 que el Word pone como compuerta (ADR-0001).

## 7. Siguiente paso

Antes del primer módulo:

1. Decidir sobre la incidencia 1.
2. Elegir el **primer módulo** (propuesta: motor de cálculo en `apps/api` con aritmética decimal, verificado contra CR-01…CR-16 y el ejemplo ilustrativo de la sección 3.14 del Word, sin interfaz).
3. ADR-0002 con biblioteca decimal, ORM/migraciones y herramienta de pruebas.
4. Crear en PostgreSQL un rol y una base exclusivos (`softarq_dev`) y el `.env` local (no versionado).
5. Inicializar solo el paquete del primer módulo (`apps/api` y `packages/contracts`), comprobando antes las rutas de caché.

## 8. Último commit

Commit inicial en la rama `main` (este archivo forma parte de él). Hash: `git log -1 --oneline`. Sin remoto ni push.
