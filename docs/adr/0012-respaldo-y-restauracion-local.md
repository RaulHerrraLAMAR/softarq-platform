# ADR-0012 — Respaldo y restauración local verificable de softarq_dev y sus documentos

- **Fecha:** 04/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `apps/api/scripts/respaldo/` (`comun.mjs`, `respaldar.mjs`, `verificar.mjs`, `restaurar.mjs`, `probar-restauracion.mjs` y las pruebas de guardas);
  - `apps/api/scripts/db/aprovisionar-respaldo.{ps1,sql}`;
  - los scripts `respaldo:*` de `apps/api/package.json`;
  - [`docs/operacion/respaldo-y-restauracion.md`](../operacion/respaldo-y-restauracion.md).

## Contexto

Desde el módulo 8 hay datos que no pueden reconstruirse: los PDF emitidos son originales (ADR-0010 §8) y la base guarda su tamaño y SHA-256. ADR-0010 pedía respaldar la carpeta **junto con** la base, pero no existía procedimiento. Un `pg_dump` que termina sin error no demuestra que se pueda recuperar.

## Decisión

1. **Instantánea compartida.** `pg_dump --snapshot` sobre la instantánea exportada de una transacción `REPEATABLE READ READ ONLY`. En esa misma transacción se obtiene la lista de emisiones con su hash. Como la API escribe el PDF antes de registrarlo, la lista de la instantánea siempre tiene archivo, y las emisiones concurrentes posteriores quedan fuera del volcado y de la copia. No se bloquea la API.
2. **Completo o incompleto, sin término medio.** Cada PDF referenciado se copia sin sobrescribir y se comprueba en origen y en copia. Si falta o no coincide alguno, el respaldo queda `.INCOMPLETO` con el motivo y código de salida 1. Carpetas con identificador único creadas de forma exclusiva y manifiesto con esquema, commit, documentos, tamaños y hashes.
3. **Mínimo privilegio.**
   - Rol nuevo `softarq_respaldo`: CONNECT solo a `softarq_dev`, SELECT sobre su esquema (incluidos los privilegios por defecto para tablas futuras del migrador) y `default_transaction_read_only`.
   - Se descartó `pg_read_all_data`, que daría lectura sobre cualquier base del servidor, y también usar `softarq_migrator`, que tiene DDL.
   - La restauración usa `softarq_migrator` solo sobre `softarq_restauracion`.
   - La credencial administrativa solo se usa para aprovisionar, una vez: interactiva o con DPAPI, descifrada en el proceso y borrada con `-EliminarCredencial`.
4. **Restauración solo de prueba y con lista blanca.** `softarq_restauracion` es el único destino. Los destinos prohibidos se rechazan antes de conectar, y en el servidor se comprueba de nuevo `current_database()` antes de vaciar el esquema. Las sesiones restauradas se revocan y los permisos de la aplicación se reaplican.
5. **Recuperación demostrada, no supuesta.** `respaldo:probar-restauracion`:
   - restaura y comprueba relaciones, esquema, permisos, disparadores y sesiones;
   - arranca una API temporal aislada (127.0.0.1:3100) y descarga cada PDF comparando sus bytes con el original;
   - prueba los fallos solo con copias en `_work`;
   - comprueba que `softarq_dev` y sus documentos no cambiaron.
6. **Ubicación:** `D:\Proyecto_SoftArq\respaldos\softarq_dev`, fuera del repositorio y de `_work`. No hay limpieza automática ni tareas programadas; la política de conservación es manual y está documentada.

## Consecuencias

- Un respaldo solo cuenta si `respaldo:verificar` termina con 0. La recuperación se puede repetir con un comando.
- El mismo disco D: protege frente a errores operativos, no frente a la pérdida del disco: hace falta una copia externa manual.
- La restauración sobre desarrollo no está automatizada a propósito (§5 de la guía).
- Si una migración futura crea objetos con un propietario distinto del migrador, habrá que conceder SELECT a `softarq_respaldo`. El respaldo fallaría de forma explícita en `pg_dump` (permiso denegado), nunca en silencio.

## Alternativas descartadas

- **`pg_dump` y copia de la carpeta en momentos distintos:** incoherentes ante emisiones concurrentes.
- **Bloquear la API durante el respaldo:** innecesario gracias a la instantánea.
- **Restaurar sobre `softarq_dev` para probar:** destructivo.
- **`pg_basebackup` o PITR:** requieren cambiar la configuración del servidor, fuera de alcance.
- **Respaldo en la nube:** excluido por el propietario.
