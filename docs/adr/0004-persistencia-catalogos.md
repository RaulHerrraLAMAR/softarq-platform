# ADR-0004 — Persistencia local de catálogos (PostgreSQL + Prisma)

- **Fecha:** 02/10/2026
- **Estado:** aceptada
- **Ámbito:** `apps/api/prisma`, `apps/api/scripts/db`, `apps/api/src/infraestructura/prisma`, `apps/api/src/modules/catalogos` y `apps/api/src/modules/calculo/aplicacion`

## Contexto

El motor de cálculo (ADR-0003) recibe una `EntradaCalculo` completa. Los catálogos (insumos, productos, precios, tarifas, conceptos y parámetros) solo existían como fixtures. Este módulo los guarda en PostgreSQL local, los aísla por organización y arma la entrada del motor desde la base, sin mover reglas de cálculo fuera del dominio.

## Decisiones

### 1. Prisma 7.10.0 con adaptador `pg`

| Paquete | Versión |
|---|---|
| `prisma` | 7.10.0 |
| `@prisma/client` | 7.10.0 |
| `@prisma/adapter-pg` | 7.10.0 |
| `pg` | 8.23.1 (la que fija el lockfile) |

- **Por qué 7.10.0:** es la última versión estable. En npm, `latest` apuntaba a `8.0.0-rc.19`, una versión candidata; la página oficial de estado de versiones indica fijar `^7`. Requiere Node `^20.19 || ^22.12 || >=24.0` y TypeScript ≥ 5.4, compatibles con Node 24.11.1 y TypeScript 7.0.2.
- **Generador `prisma-client`:** ESM y TypeScript, salida en `src/generated/prisma`, que se excluye de Git y se regenera en `build`, `typecheck` y `test:integracion`.
- **`prisma.config.ts`:** Prisma 7 no carga `.env` automáticamente; se usa `process.loadEnvFile` de Node, que no sobrescribe variables ya definidas. El archivo se elige con `SOFTARQ_ENV_FILE`: `.env` para desarrollo y `.env.test` para pruebas.
- **Scripts de instalación:** se autorizan por versión exacta en `pnpm-workspace.yaml` (`allowBuilds`): `prisma@7.10.0` (`preinstall`, que comprueba Node) y `@prisma/engines@7.10.0` (`postinstall`, que descarga el motor de migraciones). `strictDepBuilds` y la política de antigüedad mínima siguen activos.
- **Escritura en C: no redirigible:** el `postinstall` guarda el motor de migraciones (unos 20 MB) en `%APPDATA%\Prisma\master\<hash>\windows\`. Prisma no tiene una opción oficial para cambiar esa caché (el PR que proponía `PRISMA_DOWNLOAD_CACHE_DIR` se cerró sin fusionar). También queda una copia en el almacén de `_work`.

### 2. Roles, bases y permisos

| Recurso | Uso | Privilegios |
|---|---|---|
| `softarq_migrator` | CLI de Prisma (`migrate deploy/dev`, `db execute`) y preparación de pruebas | `LOGIN`; sin `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` ni `BYPASSRLS`. Propietario de las tres bases y de su esquema `public`. |
| `softarq_app` | Aplicación, repositorios y carga DEMO | `LOGIN` sin privilegios especiales. `CONNECT` solo en `softarq_dev` y `softarq_test`; `USAGE` en `public`; `SELECT, INSERT, UPDATE` en las tablas. **Sin DELETE, TRUNCATE ni DDL**, sin acceso a `_prisma_migrations` y solo lectura en `unidad`. |
| `softarq_dev` | Desarrollo | — |
| `softarq_test` | Integración. **Única** base que las pruebas pueden vaciar | — |
| `softarq_shadow` | Base sombra de `prisma migrate dev` (necesaria porque el migrador no tiene `CREATEDB`) | La aplicación no tiene acceso. |

- **Aprovisionamiento** (`scripts/db/aprovisionar.sql`, mediante `aprovisionar.ps1`):
  - la contraseña de `postgres` llega de una de dos formas:
    - de forma interactiva, en el prompt de psql;
    - con `-ArchivoCredencial <archivo.dpapi>`: un SecureString de `ConvertFrom-SecureString` (DPAPI de la misma cuenta de Windows) que se descifra solo dentro del proceso, se entrega a psql por `PGPASSWORD` con `-w` y se borra en `finally`;
  - `-SoloDiagnostico` consulta, en solo lectura, roles y bases del proyecto;
  - el 02/10/2026 se ejecutó con un archivo DPAPI que se eliminó al terminar. Los roles no existían antes: el `28P01` inicial era por roles ausentes, no por credenciales distintas;
  - las contraseñas de los roles llegan por variables de entorno (`\getenv`), no por la línea de comandos;
  - es idempotente y se detiene si alguna base `softarq_*` tiene otro propietario;
  - no toca otras bases, el servicio, `pg_hba.conf` ni la configuración global.
- **Credenciales:**
  - `scripts/db/generar-credenciales.mjs` crea `apps/api/.env` y `.env.test` (excluidos de Git) con contraseñas aleatorias de 32 bytes y no las imprime;
  - `DATABASE_URL` usa el rol de la aplicación y `MIGRATION_DATABASE_URL` el migrador.
- **Permisos de la aplicación:** se aplican tras cada `migrate deploy` con `scripts/db/permisos-app.sql`, mediante `scripts/db/migrar.mjs`.

### 3. Esquema y aislamiento por organización

**Común a todas las organizaciones:** `unidad`, con las 15 unidades y magnitudes de `modBuild.bas`, cargadas en la migración.

**Propio de cada organización:**

| Grupo | Tablas |
|---|---|
| Organización y parámetros | `organizacion`, `parametros_calculo` (una fila por organización) |
| Insumos y conversiones | `insumo`, `conversion` |
| Compras | `proveedor`, `producto`, `precio` |
| Mano de obra | `tarifa_mano_obra` |
| Conceptos | `concepto`, `componente` |
| Costos adicionales | `tipo_adicional` |

**Aislamiento en la base de datos:**
- cada tabla propia tiene `organizacion_id`, `UNIQUE(organizacion_id, id)` y `UNIQUE(organizacion_id, codigo)`;
- toda relación entre entidades propias es una **FK compuesta** `(organizacion_id, x_id) → (organizacion_id, id)`, de modo que PostgreSQL rechaza relacionar registros de organizaciones distintas.

**Aislamiento en la aplicación:** todos los métodos del repositorio exigen `ContextoOrganizacion` y lo aplican dentro del `where`; nunca se filtra después de leer. Solo hay consultas de Prisma, que son parametrizadas. El SQL literal se limita a la migración, a `permisos-app.sql` y a la preparación de pruebas, siempre con sentencias constantes.

**Fuera de este módulo:** usuarios, clientes, proyectos y cotizaciones. Las mediciones y selecciones forman parte de la solicitud de cálculo y todavía no se guardan.

### 4. Precisión y fechas

| Clase | Columnas | Tipo |
|---|---|---|
| Dinero de catálogo | `precio_unitario`, `importe` | `NUMERIC(18,6)` |
| Cantidades físicas | `contenido`, `incremento_minimo`, `rendimiento`, `rendimiento_jornada` | `NUMERIC(20,6)` |
| Factores de conversión | `factor` | `NUMERIC(20,10)` |
| Fracciones [0,1] | `desperdicio`, `recargo_sobre_costo`, `impuesto_tasa` | `NUMERIC(7,6)` |
| Traslape | `factor_traslape` | `NUMERIC(9,6)` |

- No se usa `Float`. Todas las columnas caben en el formato del contrato (15 enteros y 10 decimales).
- **Al escribir:** `decimalParaColumna` **rechaza** cualquier valor con más escala o más enteros que su columna, para que PostgreSQL no redondee en silencio. Prisma recibe los valores como texto.
- **Al leer:** `Prisma.Decimal.toFixed()` se convierte a `DecimalTexto` normalizado, sin pasar por `number`.
- **NULL, ausente y cero:** NULL en recargo o impuesto significa «no definido», y el motor bloquea (BL-12 y BL-13). `0` es un valor definido. El impuesto es todo o nada (CHECK), y su base solo puede ser `SUBTOTAL_VENTA` (CHECK).
- **Fechas:** las vigencias son `DATE` (sin hora). Se escriben y leen en UTC (`fechaParaColumna` y `fechaDeColumna`); probado con TZ `America/Mexico_City`, `Pacific/Kiritimati` y UTC. `fechaCalculo` sigue siendo una entrada explícita.

### 5. Restricciones de negocio en la base

Se añaden a mano en el SQL de la migración, porque Prisma no las representa.

**CHECK:**
- recargo y tasa en [0,1];
- moneda `MXN` y ambiente válido;
- factor, contenido, precio, importe y rendimiento mayores que 0;
- 0 ≤ desperdicio < 1 y traslape ≥ 0;
- desde ≤ hasta en las vigencias;
- incremento obligatorio solo si el producto es fraccionable;
- rendimiento por jornada solo en `JORNADA`;
- dominios de fórmula, clase, estado, modalidad y regla.

**Exclusión:** con `btree_gist`, extensión de confianza que crea el propietario de la base, un mismo producto y proveedor no puede tener dos precios no anulados con vigencias solapadas (`Val_Precio` del libro).

### 6. Migraciones

- `prisma/migrations/20261002000000_catalogos/migration.sql` contiene dos partes:
  - la parte generada con `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`;
  - la parte manual, con CHECK, exclusión y unidades.
- Se aplican con `migrate deploy` (`pnpm --filter @softarq/api db:migrar` y `db:migrar:test`).
- Las migraciones nuevas se generan con `db:nueva-migracion <nombre>` (`migrate dev --create-only` con la base sombra) y se revisan antes de aplicarlas.
- **No** se usa `db push` ni `migrate reset` sobre `softarq_dev`.

### 7. Carga DEMO e integración con el motor

- **`cargarDemo`:**
  - una sola transacción, con alta por (organización, código) y sin `update`;
  - **nunca sobrescribe ni borra** (el rol de la aplicación ni siquiera tiene `DELETE`);
  - informa, sin corregirlos, los registros DEMO cuyos valores difieran de los esperados.
- **`construirEntradaCalculo`:**
  - arma la entrada con los códigos de negocio como identificadores;
  - usa **exactamente** los precios elegidos: si uno está anulado, o su producto o proveedor está inactivo, devuelve BL-08, sin sustituirlo ni elegir el menor;
  - `menorPrecioVigente` solo alimenta el aviso AV-01;
  - BL-04 (concepto no aprobado o inactivo) se evalúa aquí;
  - un código de otra organización da `NO_ENCONTRADO`.

### 8. Pruebas de integración

- Usan solo `softarq_test`, con `vitest.integracion.config.ts` y archivos ejecutados en serie.
- `globalSetup` comprueba el nombre de la base y el host en las dos URL y `current_database()` con el migrador. **Solo entonces** vacía el esquema `public` y aplica las migraciones y los permisos.

## Consecuencias

- Los catálogos DEMO se recrean en cualquier equipo con `db:migrar` y `db:cargar-demo`.
- Para borrar o corregir datos de catálogo no hay `DELETE`: se desactiva o se anula. Las correcciones administrativas futuras necesitarán un flujo explícito.
- Los CHECK y la exclusión viven en SQL manual. Si Prisma en una versión futura intentara eliminarlos en un `migrate dev`, la revisión del SQL generado (`--create-only`) debe detectarlo.
- La escritura de unos 20 MB en `%APPDATA%\Prisma` se repetirá en cada equipo que instale este Prisma.
