# apps/api — API de SoftArq

**Estado (03/10/2026):**
- dominio de cálculo (módulo 1, ADR-0003);
- persistencia de catálogos en PostgreSQL con Prisma 7.10 (módulo 2, ADR-0004);
- API HTTP local con NestJS 12 (módulo 3, ADR-0005; endpoints en [`docs/api/README.md`](../../docs/api/README.md));
- usuarios DEMO, sesiones opacas en PostgreSQL, CSRF y permisos por función y organización (módulo 5, ADR-0007);
- clientes, proyectos y cotizaciones con folio WEB DEMO, borrador con revisión, versiones inmutables calculadas en el servidor e idempotencia (módulo 6, ADR-0008);
- todavía no hay revisión, aprobación, emisión ni PDF.

**Tecnología:** TypeScript 7 (ESM; decoradores con `tsc`), NestJS 12.1.2 sobre Express 5, Zod 4.6.5 (contratos), decimal.js 10.6.0, Prisma 7.10.0 con `@prisma/adapter-pg`, `@node-rs/argon2` 2.2.1 (Argon2id), `cookie` 0.7.2, PostgreSQL 18 local y Vitest 5.

## Responsabilidades

La API es la **única** dueña de:

- los cálculos de la cotización;
- los permisos y la autenticación;
- las reglas de negocio y los bloqueos (CR y BL de la fase 1);
- la validación de toda entrada;
- la inmutabilidad de las versiones guardadas (también impuesta por PostgreSQL: permisos y trigger).

Los clientes (web y móvil) solo muestran y capturan datos.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/modules/calculo/domain/` | Motor puro CR-01 a CR-16. Ver [`docs/calculo/matriz-reglas.md`](../../docs/calculo/matriz-reglas.md) |
| `src/modules/calculo/aplicacion/construir-entrada.ts` | Ensamblador: catálogos de la base y solicitud → `EntradaCalculo` (selección explícita, BL-04 y BL-08) |
| `src/modules/catalogos/persistencia/` | Repositorio de catálogos (siempre con `ContextoOrganizacion`) |
| `src/modules/cotizaciones/` | Módulo 6: borrador → solicitud y completitud, huellas y resumen de cambios (`dominio/`); clientes, proyectos, cotizaciones, versiones en dos fases e idempotencia (`aplicacion/`); repositorio Prisma y llamadas a las funciones de la base (`infraestructura/`) |
| `src/modules/catalogos/demo/` | Datos DEMO con su procedencia y carga idempotente |
| `src/modules/autenticacion/` | Matriz de permisos y política de sesiones (`dominio/`), casos de uso y limitador de accesos (`aplicacion/`), Argon2id, tokens, CSRF y repositorio de sesiones (`infraestructura/`), cuentas DEMO (`demo/`) |
| `src/http/guardia-sesion.ts`, `cookies.ts`, `controlador-autenticacion.ts` | Guardia global (niega por omisión: sesión, origen, CSRF y capacidad), cookie de sesión y endpoints `/auth` |
| `src/infraestructura/prisma/` | Cliente Prisma, conversión decimal por columna y fechas DATE |
| `src/pruebas-integracion/` | Pruebas contra PostgreSQL (solo `softarq_test`) |
| `prisma/schema.prisma`, `prisma/migrations/` | Esquema y migraciones versionadas |
| `scripts/db/` | Credenciales, aprovisionamiento, migración, permisos y comprobación |
| `src/generated/prisma/` | Cliente generado (no versionado; se genera en `build`) |
| `src/main.ts`, `src/http/` | API HTTP: aplicación Nest, controladores, errores, transporte y OpenAPI |
| `src/config/entorno.ts` | Variables validadas al arrancar |
| `src/modules/catalogos/aplicacion/`, `src/modules/calculo/aplicacion/calculo-demo.ts`, `reloj.ts` | Casos de uso HTTP sin Nest: consultas de catálogo, cálculo DEMO y fecha de cálculo |

## Preparar el entorno desde cero

Desde la raíz del repositorio, con los temporales en `_work`:

```
# Git Bash: export TEMP=/d/Proyecto_SoftArq/_work/tmp TMP=$TEMP
pnpm install --frozen-lockfile
```

1. **Credenciales locales:** crea `apps/api/.env` y `.env.test`, que no se versionan.

   ```
   pnpm --filter @softarq/api db:credenciales
   ```

2. **Roles y bases:** necesita la contraseña de `postgres`. Tienes dos opciones:
   - interactiva (psql la pide):

     ```
     powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar.ps1
     ```

   - sin interacción, con un archivo cifrado con DPAPI (misma cuenta de Windows), que conviene borrar después:

     ```
     powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar.ps1 -ArchivoCredencial <archivo.dpapi>
     ```

3. **Comprobación:** las 5 conexiones deben responder OK y sin privilegios especiales.

   ```
   cd apps/api && node scripts/db/comprobar-conexion.mjs
   ```

4. **Esquema y permisos en `softarq_dev`:**

   ```
   pnpm --filter @softarq/api db:migrar
   ```

5. **Catálogo DEMO:** es repetible y no duplica registros.

   ```
   pnpm --filter @softarq/api db:cargar-demo
   ```

6. **Cuentas DEMO** (Preparador y Revisor; rol migrador; solo `softarq_dev`):

   ```
   pnpm --filter @softarq/api db:cargar-usuarios-demo
   # contraseña nueva para una cuenta DEMO existente (revoca sus sesiones):
   pnpm --filter @softarq/api db:cargar-usuarios-demo -- --restablecer preparador.demo@softarq.test
   ```

   Las contraseñas generadas quedan **solo** en `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json` (fuera del repositorio); la consola solo muestra esa ruta. Ejecutarlo de nuevo conserva las cuentas y sus contraseñas.

7. **Verificación:**

   ```
   pnpm verificar                   # build + typecheck + pruebas unitarias
   pnpm verificar:integracion       # vacía y migra softarq_test; nunca otra base
   ```

8. **API local:** escucha solo en `127.0.0.1:3000` (los clientes usan `http://localhost:3000`); ver [`docs/api/README.md`](../../docs/api/README.md).

   ```
   pnpm --filter @softarq/api build && pnpm --filter @softarq/api start
   ```

   Cambiar un contrato obliga a regenerar `docs/api/openapi.json` con `pnpm --filter @softarq/api openapi:generar`; una prueba lo comprueba.

**Mantenimiento de sesiones:** `pnpm --filter @softarq/api db:purgar-sesiones` (rol migrador) borra las sesiones vencidas o revocadas hace más de 7 días; la aplicación no tiene DELETE.

**Mantenimiento de idempotencia:** `pnpm --filter @softarq/api db:purgar-idempotencia` (rol migrador) borra las claves caducadas hace más de 7 días. Los recursos creados no se tocan.

**Cotizaciones (módulo 6):** la migración `20261003062244_cotizaciones` crea las tablas, los CHECK, el trigger de inmutabilidad de las versiones y las funciones `softarq_*` (una sentencia atómica por alta o edición). Se aplica con `db:migrar` como las demás; `permisos-app.sql` limita a `softarq_app` a las columnas editables y le impide modificar versiones, eventos y claves de idempotencia.

**Migraciones nuevas:** `pnpm --filter @softarq/api db:nueva-migracion <nombre>` (usa la base sombra). Después, revisa y completa el SQL (CHECK y exclusiones) y aplícalo con `db:migrar`.

## Reglas específicas

- Importes y cantidades con aritmética decimal exacta. En la base, `NUMERIC` con escala por clase de dato. Un valor con más decimales que su columna se **rechaza**, nunca se redondea.
- La ausencia de un parámetro nunca se convierte en cero: recargo o impuesto NULL bloquean (BL-12, BL-13); `0` es un valor válido.
- Toda consulta de datos propios exige el contexto de organización dentro del `where`.
- El rol de la aplicación no tiene DDL ni DELETE: los catálogos se desactivan o anulan. En identidad solo lee `usuario` y `membresia`, y en `sesion` solo inserta y actualiza actividad y revocación.
- Toda ruta nueva exige sesión y una capacidad declarada con `@Requiere(...)`, o `@Publico()` justificado; la organización se toma de la sesión (`organizacionDe(req)`), nunca de la solicitud.
- La selección de precios es explícita: el repositorio nunca elige el menor ni sustituye una selección inválida.
