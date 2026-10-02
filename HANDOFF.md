# HANDOFF — Continuidad entre sesiones y agentes

> Léelo al empezar. Actualízalo al terminar cada tarea (sección por sección, sin borrar el historial de la tabla 4). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

**Última actualización:** 02/10/2026 · Claude Code (Opus 5.5) · módulo 3 (API HTTP local con NestJS) terminado y verificado

## 1. Estado actual

- **Fase 1 (Excel):**
  - terminada para revisión técnica, con datos DEMO;
  - pendientes: PR-41, PR-42, PR-43, PR-44, los 12 datos reales y la aceptación del profesor;
  - no se modifica desde aquí. La prueba personal del propietario está registrada como declaración, no como PR-41 ni PR-44.
- **Módulo 1, motor de cálculo** (`f0a34da`): CR-01 a CR-16 en `apps/api/src/modules/calculo/domain`.
- **Módulo 2, persistencia de catálogos** (`2543baa`):
  - PostgreSQL 18 local con Prisma 7.10.0;
  - catálogos aislados por organización;
  - catálogo DEMO cargado en `softarq_dev`;
  - ensamblador que arma la entrada del motor desde la base;
  - los 4 escenarios principales se reproducen desde PostgreSQL con los totales de referencia.
- **Módulo 3, API HTTP local (este commit):**
  - NestJS 12 en `127.0.0.1:3000`;
  - catálogos para preparar una cotización DEMO y `POST /api/v1/calculos/demo` con datos de PostgreSQL;
  - devuelve solo la proyección comercial;
  - los 4 escenarios principales se reproducen por HTTP.
- **Todavía no existen:** autenticación, usuarios, clientes, proyectos, cotizaciones persistidas, revisión, emisión, PDF, web ni móvil.

## 2. Decisiones vigentes

| ID | Decisión | Dónde |
|---|---|---|
| ADR-0001 | Monorepo pnpm; solo contratos compartidos; PostgreSQL local | [`docs/adr/0001-monorepo-y-stack.md`](docs/adr/0001-monorepo-y-stack.md) |
| ADR-0002 | DEMO local antes de PR-44, que sigue pendiente | [`docs/adr/0002-demo-local-antes-del-piloto.md`](docs/adr/0002-demo-local-antes-del-piloto.md) |
| ADR-0003 | Motor puro; decimal.js; decimales como texto; Vitest; ESM | [`docs/adr/0003-motor-de-calculo.md`](docs/adr/0003-motor-de-calculo.md) |
| ADR-0004 | Prisma 7.10 con adaptador `pg`; roles migrador y aplicación; base sombra; `NUMERIC` por clase de dato; DATE; FK compuestas por organización; CHECK y exclusión; carga DEMO sin sobrescribir ni borrar; pruebas solo en `softarq_test` | [`docs/adr/0004-persistencia-catalogos.md`](docs/adr/0004-persistencia-catalogos.md) |
| ADR-0005 | API HTTP local: NestJS 12 ESM compilado con `tsc`; Zod en `contracts` como definición única (validación, tipos y OpenAPI); sobre de error único (400/404/413/415/422/429/503/500); solo `127.0.0.1`; CORS con lista explícita; rate limit en memoria; contexto DEMO fijo (no es autenticación); fecha de cálculo del servidor | [`docs/adr/0005-api-http-local.md`](docs/adr/0005-api-http-local.md) |
| Propietario | Libro oficial `entrega\Cotizador_Estructuras_F1.xlsm`; COT-2026-00016/00017 y la persona en turno se conservan; evidencias citadas por archivo, escenario y caso | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) §4 |
| Entorno | Trabajo en `D:\Proyecto_SoftArq`; temporales y cachés en `_work`; sin remoto ni push | `AGENTS.md` §1 |

Pendiente de decidir: autenticación y permisos, almacén compartido del limitador para varias instancias, generación de PDF y alcance de la app móvil.

## 3. Esquema implementado (migración `20261002000000_catalogos`)

- **Común:**
  - `unidad`: 15 unidades de `modBuild.bas`; la aplicación solo la lee.
- **Propio de cada organización** (todas las tablas con `organizacion_id` y FK compuestas `(organizacion_id, x_id)`):
  - `organizacion` y `parametros_calculo` (NULL = no definido);
  - `insumo` y `conversion`;
  - `proveedor`, `producto` y `precio` (exclusión de vigencias solapadas, `btree_gist`);
  - `tarifa_mano_obra`;
  - `concepto` y `componente`;
  - `tipo_adicional`.
- **Precisión:**
  - dinero `NUMERIC(18,6)`;
  - cantidades `NUMERIC(20,6)`;
  - factores `NUMERIC(20,10)`;
  - fracciones `NUMERIC(7,6)`;
  - traslape `NUMERIC(9,6)`.
- **Vigencias:** `DATE`.

Detalle en ADR-0004 y en [`docs/modelo-conceptual.md`](docs/modelo-conceptual.md) §4.

**Recursos de PostgreSQL creados (02/10/2026):**

| Recurso | Características |
|---|---|
| Rol `softarq_migrator` | LOGIN; sin SUPERUSER, CREATEDB, CREATEROLE ni BYPASSRLS; propietario de las 3 bases |
| Rol `softarq_app` | LOGIN; sin privilegios especiales; `SELECT/INSERT/UPDATE` en catálogos y solo `SELECT` en `unidad`; sin DELETE, TRUNCATE, CREATE ni acceso a `_prisma_migrations` o `softarq_shadow` |
| Base `softarq_dev` | Migrada; catálogo DEMO cargado |
| Base `softarq_test` | Las pruebas de integración la vacían y migran |
| Base `softarq_shadow` | Base sombra de `migrate dev` |

Credenciales: `apps/api/.env` y `.env.test` (locales, excluidos de Git). La credencial administrativa usada (`_work\secrets\postgres-admin.dpapi`) se **eliminó** al terminar.

## 4. Tareas terminadas

| Fecha | Tarea | Resultado |
|---|---|---|
| 02/10/2026 | Inspección de la fase 1, entorno, estructura y reglas | Commit `e375fce` |
| 02/10/2026 | Módulo 1: motor de cálculo | Commit `f0a34da` (163 pruebas) |
| 02/10/2026 | Módulo 2: esquema, migración, scripts de base de datos, repositorio, ensamblador, carga DEMO, pruebas, ADR-0004 | Ver §5 y §8 |
| 02/10/2026 | Aprovisionamiento y verificación contra PostgreSQL real | Commit `2543baa` |
| 02/10/2026 | Skills del proyecto (ui-ux-pro-max, caveman, grill-me + grilling) para Claude Code y Codex, con reglas de uso | Commit `fdcc8f4`; ver §9 |
| 02/10/2026 | Módulo 3: API HTTP local (NestJS 12, contratos Zod, catálogos, cálculo DEMO, errores, transporte, OpenAPI, ADR-0005) | Ver §5, §10 y §8 |

## 5. Comandos y resultados reales (02/10/2026)

**Preparación desde cero:** [`apps/api/README.md`](apps/api/README.md#preparar-el-entorno-desde-cero).

| Comando | Resultado |
|---|---|
| `aprovisionar.ps1 -SoloDiagnostico`, antes | 0 roles y 0 bases del proyecto: el `28P01` anterior era por roles inexistentes |
| `aprovisionar.ps1 -ArchivoCredencial …` | 2 roles y 3 bases creados; esquemas y permisos aplicados; código de salida 0 |
| `node scripts/db/comprobar-conexion.mjs` | 5/5 conexiones OK, ninguna con privilegios especiales; `softarq_app` → `softarq_shadow` rechazado (`42501`) |
| `pnpm --filter @softarq/api db:migrar` | Migración `20261002000000_catalogos` aplicada en `softarq_dev`; `migrate status`: «Database schema is up to date!» |
| Privilegios efectivos de `softarq_app` en dev | S/I/U en las 11 tablas de catálogo, solo S en `unidad`; sin DELETE, TRUNCATE ni CREATE; `_prisma_migrations` no visible |
| `pnpm --filter @softarq/api db:cargar-demo`, 1.ª vez | 71 registros creados; los valores coinciden con los esperados |
| `pnpm --filter @softarq/api db:cargar-demo`, 2.ª vez | 0 creados y 71 conservados (idempotente) |
| `pnpm verificar:integracion`, 2 corridas | **3 archivos, 46/46 pruebas aprobadas** en `softarq_test` |
| Causa de los rechazos en la base (comprobada) | `23514` (CHECK desperdicio), `23P01` (solape de precios), `23503` (FK entre organizaciones), `42501` (DELETE) |
| `migrar.mjs --test` y `globalSetup` con una URL de `softarq_dev` | Ambos rechazan el destino («solo se permite: softarq_test»); `softarq_dev` intacta después |
| `pnpm verificar` | Build, typecheck y **200/200 pruebas unitarias** (163 del motor, 28 del adaptador y 9 de protección de destino) |
| MD5 del libro oficial | `b60debc121957b8d8e3f2c2edd9a5b4f`, sin cambios |

**Módulo 3 (API HTTP):**

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | Al día; la instalación de Nest 12.1.2, throttler 6.7.1, Helmet 8.3.0, Express 5.2.1 y Zod 4.6.5 no añadió excepciones ni scripts de instalación |
| `pnpm verificar` | Build (contracts y api), typecheck y **275/275 pruebas unitarias** (200 anteriores y 75 nuevas: entorno, esquemas, errores, OpenAPI y ejemplos) |
| `pnpm verificar:integracion` | **4 archivos, 94/94** en `softarq_test` (46 anteriores y 48 HTTP). También con los archivos en orden aleatorio (`--sequence.shuffle.files`, semillas 7 y 1234): 94/94 |
| `node dist/main.js` con `API_HOST=0.0.0.0`, con `API_CORS_ORIGINS=*` o con la URL del migrador | El arranque falla con código 1 y un mensaje claro, sin valores secretos |
| `node dist/main.js` contra `softarq_dev` y `curl` de los 4 ejemplos de `docs/api/ejemplos` | 54190.68, 43312.16, 22405.28 y 4911.79; `netstat`: escucha solo en `127.0.0.1:3000`; el preflight desde `http://localhost:5173` permitido |
| SIGINT al servidor compilado (simulado en el mismo proceso, porque Windows no envía SIGINT entre procesos) | «Conexiones con PostgreSQL cerradas (SIGINT)»; puerto liberado |
| MD5 del libro oficial | Sin cambios |

**Escenarios desde PostgreSQL** (módulo 2; por HTTP en el módulo 3), comparados con los totales de las fuentes, no con el cálculo:

| Escenario | Total |
|---|---|
| `GUIA-R1-FALDONES-10M` | 54,190.68 |
| `GUIA-R2-ESPESOR-012` | 43,312.16 |
| `GUIA-R3-SIN-VENTANA` | 22,405.28 |
| `GUIA-PROPIA-CON-00001` | 4,911.79 |

En los cuatro, el resultado completo es idéntico al calculado con los fixtures del módulo 1.

## 6. Limitaciones, incidencias y riesgos

1. **Escrituras en C: no redirigibles:**
   - Prisma guarda su motor de migraciones (unos 20 MB) en `%APPDATA%\Prisma`;
   - Windows, Node y pnpm pueden escribir en el perfil de usuario.
2. **Restricciones en SQL manual:** los CHECK y la exclusión viven en la migración. Revisa siempre el SQL de `db:nueva-migracion` antes de aplicarlo.
3. **Sin DELETE para la aplicación:** las correcciones de catálogo se hacen desactivando o anulando. Hará falta un flujo administrativo explícito.
4. **Sin guardar todavía:** mediciones, selecciones ni cotizaciones (forman parte de la solicitud de cálculo).
5. **Fuera del motor y del ensamblador:** BL-07 y BL-09 (vigencia a la emisión con excepciones).
6. **PostgreSQL:** escucha en `*:5432`, pero `pg_hba.conf` solo admite conexiones locales. No se modificó el servicio ni su configuración.
7. **Fase 1:** siguen abiertas la incidencia de cierre de Excel y la observación de hoja activa.
8. **API local sin autenticación:**
   - el contexto DEMO es fijo y no controla el acceso;
   - solo escucha en `127.0.0.1` y no debe exponerse en red, Expo ni despliegue sin un ADR de autenticación, TLS y proxy.
9. **Rate limiting en memoria:** vale para una instancia; con varias hará falta un almacén compartido.
10. **Avisos:** AV-01 y AV-03 se publican reescritos sin importes. AV-02, AV-04 y AV-05 corresponden a la revisión y la emisión.
11. **Cierre por señal en Windows:** solo se comprobó dentro del mismo proceso; con Ctrl+C en la terminal funciona el mismo gancho (`enableShutdownHooks`).

## 7. Siguiente tarea

**Módulo 4 propuesto: cliente web DEMO (React + TypeScript) sobre la API local.**

1. Inicializar `apps/web` (Vite) con origen `http://localhost:5173`, ya permitido en CORS. Comprobar antes las rutas de caché.
2. Pantallas:
   - captura de partidas y renglones con los conceptos de `/catalogos/conceptos`;
   - selección explícita de precios con `/catalogos/opciones-precio`;
   - cálculo y vista comercial con la leyenda DEMO.

   Usar los tipos y esquemas de `@softarq/contracts`; los decimales se muestran y envían como texto.
3. Aplicar UI UX Pro Max (interfaz y accesibilidad) según `AGENTS.md` §11.
4. Pruebas de componentes y de extremo a extremo contra la API local.

Alternativa, si se prioriza el dominio: usuarios y autenticación, clientes y proyectos, y cotizaciones con versiones (folios y emisión).

## 8. Último commit

- `2543baa`: Módulo 2, persistencia de catálogos (sobre `f0a34da`).
- `fdcc8f4`: skills de proyecto y reglas de uso.
- A continuación, el commit del módulo 3 (API HTTP local): ver `git log --oneline -3`.

Rama `main`. Sin remoto ni push.

## 9. Skills de agentes

Detalle completo, fuentes, comprobaciones y actualización: [`docs/herramientas/skills.md`](docs/herramientas/skills.md). Reglas de uso: `AGENTS.md` §11.

| Skill | Claude Code | Codex | Verificado (02/10/2026) |
|---|---|---|---|
| `ui-ux-pro-max` (CLI 2.15.0, MIT) | `.claude/skills/ui-ux-pro-max` | `.agents/skills/ui-ux-pro-max` | Ambos agentes la reconocen; `search.py` funciona con Python 3.14.5 |
| `caveman` (commit `b39c908`, Apache-2.0) | `.claude/skills/caveman`, solo explícita | `.agents/skills/caveman`, solo explícita | Ambos agentes aplican lite y citan la skill original |
| `grill-me` + `grilling` (commit `d81f3a1`, MIT) | Literal; delega con la herramienta Skill | `grill-me` adaptada: lee `grilling/SKILL.md` | Delegación comprobada en ambos agentes |

- **Reinstalar o actualizar:** `python scripts/skills/instalar_skills.py [--destino <carpeta>] [--reemplazar]`.
- **Selección:** solo se instaló `ui-ux-pro-max` de las 7 skills que trae su instalador o plugin.
- **Comandos personales:** los `~/.claude/commands/{caveman,grill-me,ui-ux-pro-max}.md` siguen intactos; en este repositorio prevalecen las skills.

## 10. API HTTP local (módulo 3)

Endpoints, errores, límites y ejemplos: [`docs/api/README.md`](docs/api/README.md). Especificación: [`docs/api/openapi.json`](docs/api/openapi.json).

```
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start        # http://127.0.0.1:3000 (lee apps/api/.env)
curl -s http://127.0.0.1:3000/health
curl -s -X POST http://127.0.0.1:3000/api/v1/calculos/demo -H "Content-Type: application/json" --data @docs/api/ejemplos/calculo-r1-faldones-10m.json
pnpm --filter @softarq/api openapi:generar   # tras cambiar un contrato (una prueba lo exige)
```

| Endpoint | Uso |
|---|---|
| `GET /health` | Servicio y PostgreSQL |
| `GET /api/v1/catalogos/conceptos` | Conceptos activos y aprobados |
| `GET /api/v1/catalogos/opciones-precio?conceptos=…` | Opciones vigentes por insumo, sin precios, con `esMenorPrecio` |
| `GET /api/v1/catalogos/tipos-adicional` | Tipos de costo adicional |
| `POST /api/v1/calculos/demo` | Cálculo DEMO; solo vista comercial |
| `GET /api/v1/openapi.json` | Especificación |

- **Código:**
  - `apps/api/src/http/` (aplicación, controladores, errores, transporte y OpenAPI);
  - `src/config/entorno.ts`;
  - casos de uso sin Nest en `src/modules/*/aplicacion/`;
  - contratos en `packages/contracts/src/api/esquemas.ts`.
- **Pruebas de integración:** `api-http`, `calculo-desde-base` y `catalogos` usan organizaciones DEMO distintas (`DEMO-HTTP`, `DEMO-CALCULO` y `DEMO`), así que no dependen del orden de ejecución.
