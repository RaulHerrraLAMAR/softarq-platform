# HANDOFF — Continuidad entre sesiones y agentes

> Léelo al empezar. Actualízalo al terminar cada tarea (sección por sección, sin borrar el historial de la tabla 4). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

**Última actualización:** 02/10/2026 · Claude Code (Opus 5.5) · módulo 2 (persistencia de catálogos) terminado y verificado contra PostgreSQL real

## 1. Estado actual

- **Fase 1 (Excel):**
  - terminada para revisión técnica, con datos DEMO;
  - pendientes: PR-41, PR-42, PR-43, PR-44, los 12 datos reales y la aceptación del profesor;
  - no se modifica desde aquí. La prueba personal del propietario está registrada como declaración, no como PR-41 ni PR-44.
- **Módulo 1, motor de cálculo** (`f0a34da`): CR-01 a CR-16 en `apps/api/src/modules/calculo/domain`.
- **Módulo 2, persistencia de catálogos (este commit):**
  - PostgreSQL 18 local con Prisma 7.10.0;
  - catálogos aislados por organización;
  - catálogo DEMO cargado en `softarq_dev`;
  - ensamblador que arma la entrada del motor desde la base;
  - los 4 escenarios principales se reproducen desde PostgreSQL con los totales de referencia.
- **Todavía no existen:** NestJS, endpoints, autenticación, usuarios, clientes, proyectos, cotizaciones persistidas, revisión, emisión, PDF, web ni móvil.

## 2. Decisiones vigentes

| ID | Decisión | Dónde |
|---|---|---|
| ADR-0001 | Monorepo pnpm; solo contratos compartidos; PostgreSQL local | [`docs/adr/0001-monorepo-y-stack.md`](docs/adr/0001-monorepo-y-stack.md) |
| ADR-0002 | DEMO local antes de PR-44, que sigue pendiente | [`docs/adr/0002-demo-local-antes-del-piloto.md`](docs/adr/0002-demo-local-antes-del-piloto.md) |
| ADR-0003 | Motor puro; decimal.js; decimales como texto; Vitest; ESM | [`docs/adr/0003-motor-de-calculo.md`](docs/adr/0003-motor-de-calculo.md) |
| ADR-0004 | Prisma 7.10 con adaptador `pg`; roles migrador y aplicación; base sombra; `NUMERIC` por clase de dato; DATE; FK compuestas por organización; CHECK y exclusión; carga DEMO sin sobrescribir ni borrar; pruebas solo en `softarq_test` | [`docs/adr/0004-persistencia-catalogos.md`](docs/adr/0004-persistencia-catalogos.md) |
| Propietario | Libro oficial `entrega\Cotizador_Estructuras_F1.xlsm`; COT-2026-00016/00017 y la persona en turno se conservan; evidencias citadas por archivo, escenario y caso | [`docs/fase1-estado-verificado.md`](docs/fase1-estado-verificado.md) §4 |
| Entorno | Trabajo en `D:\Proyecto_SoftArq`; temporales y cachés en `_work`; sin remoto ni push | `AGENTS.md` §1 |

Pendiente de decidir: autenticación y permisos, NestJS y su compatibilidad ESM con TypeScript 7, generación de PDF y alcance de la app móvil.

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
| 02/10/2026 | Aprovisionamiento y verificación contra PostgreSQL real | Ver §5 |

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

**Escenarios desde PostgreSQL**, comparados con los totales de las fuentes, no con el cálculo:

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

## 7. Siguiente tarea

**Módulo 3 propuesto: API HTTP mínima del DEMO.**

1. ADR-0005: NestJS con ESM y TypeScript 7 (verificar compatibilidad), validación de entrada HTTP y manejo de errores.
2. Endpoint `POST /calculos`:
   - recibe `SolicitudCalculo`;
   - arma la entrada con `construirEntradaCalculo`;
   - calcula con el motor;
   - devuelve **solo** `CotizacionComercial` al cliente.

   Organización DEMO fija hasta que exista autenticación.
3. Pruebas HTTP de integración sobre `softarq_test`.

Después: usuarios y autenticación, clientes y proyectos, y cotizaciones con versiones.

## 8. Último commit

Ver `git log --oneline -3`: commit «Módulo 2: persistencia…» sobre `f0a34da`, en la rama `main`. Sin remoto ni push.
