# HANDOFF — Continuidad entre sesiones y agentes

> Léelo al empezar. Actualízalo al terminar cada tarea (sección por sección, sin borrar el historial de la tabla 4). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

**Última actualización:** 02/10/2026 · Claude Code (Opus 5.5) · módulo 1 (motor de cálculo) terminado

## 1. Estado actual

- **Fase 1 (Excel):**
  - terminada para revisión técnica, con datos DEMO; no apta para cotizaciones comerciales reales;
  - pendientes: 12 datos reales, PR-41 (prueba guiada con una persona), PR-42 y PR-43 (cotizaciones y reglas reales), PR-44 (piloto) y la aceptación del profesor;
  - **no se modifica desde aquí.**
- **Declaración del propietario:** probó personalmente el libro oficial y le funcionó correctamente. Queda registrada como declaración; **no** equivale a PR-41 ni a PR-44.
- **Fase 2, DEMO local (ADR-0002):** el **módulo 1, motor de cálculo del servidor**, está implementado y verificado:
  - `packages/contracts`: tipos de entrada y salida y formato `DecimalTexto`;
  - `apps/api/src/modules/calculo/domain`: CR-01 a CR-16, bloqueos del cálculo y vista comercial;
  - 163 pruebas Vitest que pasan, con 11 escenarios de extremo a extremo que coinciden al centavo con fuentes independientes, entre ellos 54,190.68; 43,312.16; 22,405.28 y 4,911.79.
- **Todavía no existen:** NestJS, endpoints, persistencia (Prisma/PostgreSQL), autenticación, catálogos, folios, revisión, emisión, PDF, web ni móvil.

## 2. Decisiones vigentes

| ID | Decisión | Dónde |
|---|---|---|
| ADR-0001 | Monorepo pnpm: `apps/web` (React + TS), `apps/api` (NestJS + TS), `apps/mobile` (Expo), `packages/contracts`, `docs`; solo contratos compartidos; PostgreSQL local | [`docs/adr/0001-monorepo-y-stack.md`](docs/adr/0001-monorepo-y-stack.md) |
| ADR-0002 | DEMO local autorizado antes de PR-44, que sigue pendiente; datos ficticios marcados como DEMO y fórmulas reales | [`docs/adr/0002-demo-local-antes-del-piloto.md`](docs/adr/0002-demo-local-antes-del-piloto.md) |
| ADR-0003 | Dominio de cálculo puro; decimal.js 10.6.0 (40 cifras, CR-15 explícito); decimales como texto; Vitest 5; ESM; NestJS y Prisma aplazados | [`docs/adr/0003-motor-de-calculo.md`](docs/adr/0003-motor-de-calculo.md) |
| Propietario | Libro oficial = `entrega\Cotizador_Estructuras_F1.xlsm`; H eliminado; COT-2026-00016/00017 y la persona en turno se conservan; evidencias citadas por archivo, escenario y caso | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) §4 |
| F1 D-01…D-21 | Reglas funcionales de la fase 1 | Word maestro v1.3, capítulos 2 y 3 |
| Entorno | Trabajo en `D:\Proyecto_SoftArq`; temporales y cachés en `D:\Proyecto_SoftArq\_work`; sin push ni remoto | `AGENTS.md` §1 |

Pendientes de decidir: ORM y migraciones (Prisma previsto), validación de esquemas en HTTP, autenticación y permisos, generación de PDF, alcance de la app móvil.

## 3. Archivos relevantes

| Qué | Ruta |
|---|---|
| Especificación funcional | `D:\Proyecto_SoftArq\entrega\Documentacion_maestra_Cotizador_Estructuras_F1.docx` (v1.3) |
| Comportamiento de referencia | `D:\Proyecto_SoftArq\entrega\Cotizador_Estructuras_F1.xlsm` (1.0.0-F1, MD5 `b60debc121957b8d8e3f2c2edd9a5b4f`); VBA en `entrega\fuentes\vba\` |
| Motor del libro | `entrega\fuentes\vba\modCalculo.bas`, `modMotor.bas`, `modRedondeo.bas`, `modPruebas.bas` (casos PC) |
| Contratos | `packages/contracts/src/` (`decimal.ts`, `calculo.ts`, `vista-comercial.ts`) |
| Motor nuevo | `apps/api/src/modules/calculo/domain/` (entrada: `calcularCotizacion` en `motor.ts`) |
| Fixtures DEMO con su origen | `apps/api/src/modules/calculo/domain/__tests__/fixtures/` |
| Matriz regla → fuente → implementación → prueba | [`docs/calculo/matriz-reglas.md`](docs/calculo/matriz-reglas.md) |
| Modelo conceptual | [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) |
| Estado verificado de la fase 1 | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) |

## 4. Tareas terminadas

| Fecha | Tarea | Resultado |
|---|---|---|
| 02/10/2026 | Inspección de solo lectura de la entrega de la fase 1 | Versiones confirmadas; 5 diferencias documentadas |
| 02/10/2026 | Comprobación del entorno | Ver sección 5 |
| 02/10/2026 | Estructura del monorepo, reglas, `.gitignore`, `.env.example`, ADR-0001 | Commit `e375fce` |
| 02/10/2026 | Módulo 1: contratos, dominio de cálculo, 163 pruebas, ADR-0002 y 0003, matriz de reglas, modelo conceptual y decisiones del propietario | Ver secciones 5 y 8 |

## 5. Comandos y resultados reales

**Antes de ejecutar** (desde la raíz del repositorio):

```
# Git Bash: temporales de la sesión fuera de C:
export TEMP=/d/Proyecto_SoftArq/_work/tmp TMP=/d/Proyecto_SoftArq/_work/tmp
pnpm store path                 # debe dar D:\Proyecto_SoftArq\_work\pnpm-store\v11
pnpm install --frozen-lockfile
```

**Verificación completa:** `pnpm verificar` (= `pnpm build && pnpm typecheck && pnpm test`).

**Resultados del 02/10/2026:**
- `pnpm verificar`: build de contracts y api correcto; typecheck correcto; **Vitest: 5 archivos, 163 pruebas aprobadas, 0 fallidas**.
- Prueba de mutación manual: con el redondeo cambiado a «mitad al par» fallaron 4 pruebas de CR-15. Se restauró el código y volvieron a pasar las 163.
- Ejecución del código compilado en Node 24.11.1 (`dist/`): `calcularCotizacion({})` devuelve `ENTRADA_INVALIDA`, una cotización vacía devuelve `BLOQUEADO` (BL-03) y `cr16VigenteHasta('2026-12-20', 15)` da `2027-01-04`.
- MD5 del libro oficial sin cambios antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`.

**Versiones instaladas (lockfile):** decimal.js 10.6.0, TypeScript 7.0.2, Vitest 5.0.3, Vite 8.3.2 (dependencia par de Vitest) y @types/node 24.19.0. La instalación pasó la política de antigüedad mínima de pnpm sin excepciones.

**Pruebas de la fase 1:** las cifras 193/193, TE-01 a TE-10 y 46/46 son **declaradas** por sus documentos; **no** se volvieron a ejecutar. Este módulo tiene sus propias evidencias (las de arriba).

## 6. Limitaciones, incidencias y riesgos

1. **Discrepancias entre fuentes:** hay 10, documentadas con su decisión en [`docs/calculo/matriz-reglas.md`](docs/calculo/matriz-reglas.md) §4. Las de mayor impacto futuro:
   - solo se admite la base de impuesto `SUBTOTAL_VENTA` (dato 7 pendiente);
   - el recargo se limita a [0,1] (dato 6 pendiente).
2. **Precisión:** 40 cifras frente a las 28 aproximadas del VBA. Solo podría variar un centavo ante empates por debajo de 1e-28.
3. **Fuera del motor:** BL-01, 02, 04, 07, 09, 14 a 17, 19 y 20; la trazabilidad de BL-05; AV-02, 04 y 05; el sello BL-16; folios, estados y PDF.
4. **Orden de la entrada:** el orden de partidas y componentes define a quién se asigna el remanente del prorrateo (CR-08). La persistencia debe conservarlo.
5. **Escrituras en C::** Windows, Node y pnpm pueden escribir en el perfil de usuario (por ejemplo, `%LOCALAPPDATA%\pnpm` del pnpm global), y eso no se controla desde el repositorio. `C:` tenía unos 4,2 GB libres. Expo, Gradle y el SDK de Android requerirán configuración antes de `apps/mobile`.
6. **Fase 1:** siguen abiertas la incidencia de cierre inesperado de Excel y la observación de la hoja activa.
7. **PostgreSQL 18.6:**
   - escucha en `*:5432`, pero `pg_hba.conf` solo admite conexiones locales;
   - no se creó ningún usuario ni base, y no se tocó el servicio.

## 7. Siguiente tarea

**Módulo 2 propuesto: persistencia y catálogos DEMO.**

1. ADR-0004: Prisma y migraciones, esquema inicial (organización DEMO, catálogos, cliente, proyecto, cotización, versión, partidas, mediciones, selecciones y excepciones) según [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md). Usar `numeric` en importes y cantidades y conservar el orden de partidas y componentes.
2. Antes de instalar Prisma: comprobar dónde descarga sus motores y binarios y redirigirlos a `_work`.
3. Crear en PostgreSQL un rol y una base exclusivos (`softarq_dev`) y el `.env` local (no versionado), con aprobación del propietario.
4. Semillas DEMO a partir de `__tests__/fixtures/catalogo-demo.ts`, con un ensamblador que arme `EntradaCalculo` desde la base. Verificar que reproduce los 11 escenarios.

Después: inicializar NestJS con el endpoint de cálculo (revisar la compatibilidad ESM con TypeScript 7), y luego revisión, emisión y PDF.

## 8. Último commit

Ver `git log -1 --oneline`: commit del módulo 1 sobre `e375fce`, en la rama `main`. Sin remoto ni push.
