# apps/api — API de SoftArq

**Estado (02/10/2026):**
- dominio de cálculo (módulo 1, ADR-0003);
- persistencia de catálogos en PostgreSQL con Prisma 7.10 (módulo 2, ADR-0004);
- todavía no están inicializados NestJS, los endpoints ni la autenticación.

**Tecnología:** TypeScript 7 (ESM), decimal.js 10.6.0, Prisma 7.10.0 con `@prisma/adapter-pg`, PostgreSQL 18 local y Vitest 5.

## Responsabilidades

La API es la **única** dueña de:

- los cálculos de la cotización;
- los permisos y la autenticación;
- las reglas de negocio y los bloqueos (CR y BL de la fase 1);
- la validación de toda entrada;
- la inmutabilidad de las versiones emitidas.

Los clientes (web y móvil) solo muestran y capturan datos.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/modules/calculo/domain/` | Motor puro CR-01 a CR-16. Ver [`docs/calculo/matriz-reglas.md`](../../docs/calculo/matriz-reglas.md) |
| `src/modules/calculo/aplicacion/construir-entrada.ts` | Ensamblador: catálogos de la base y solicitud → `EntradaCalculo` (selección explícita, BL-04 y BL-08) |
| `src/modules/catalogos/persistencia/` | Repositorio de catálogos (siempre con `ContextoOrganizacion`) |
| `src/modules/catalogos/demo/` | Datos DEMO con su procedencia y carga idempotente |
| `src/infraestructura/prisma/` | Cliente Prisma, conversión decimal por columna y fechas DATE |
| `src/pruebas-integracion/` | Pruebas contra PostgreSQL (solo `softarq_test`) |
| `prisma/schema.prisma`, `prisma/migrations/` | Esquema y migraciones versionadas |
| `scripts/db/` | Credenciales, aprovisionamiento, migración, permisos y comprobación |
| `src/generated/prisma/` | Cliente generado (no versionado; se genera en `build`) |

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

6. **Verificación:**

   ```
   pnpm verificar                   # build + typecheck + pruebas unitarias
   pnpm verificar:integracion       # vacía y migra softarq_test; nunca otra base
   ```

**Migraciones nuevas:** `pnpm --filter @softarq/api db:nueva-migracion <nombre>` (usa la base sombra). Después, revisa y completa el SQL (CHECK y exclusiones) y aplícalo con `db:migrar`.

## Reglas específicas

- Importes y cantidades con aritmética decimal exacta. En la base, `NUMERIC` con escala por clase de dato. Un valor con más decimales que su columna se **rechaza**, nunca se redondea.
- La ausencia de un parámetro nunca se convierte en cero: recargo o impuesto NULL bloquean (BL-12, BL-13); `0` es un valor válido.
- Toda consulta de datos propios exige el contexto de organización dentro del `where`.
- El rol de la aplicación no tiene DDL ni DELETE: los catálogos se desactivan o anulan.
- La selección de precios es explícita: el repositorio nunca elige el menor ni sustituye una selección inválida.
