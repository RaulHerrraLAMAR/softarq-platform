# Respaldo y restauración local de softarq_dev

Procedimiento verificable para respaldar la base `softarq_dev` **junto con** los PDF originales de las emisiones y para comprobar que se pueden recuperar. Decisión: [ADR-0012](../adr/0012-respaldo-y-restauracion-local.md). Contexto de los documentos: [ADR-0010](../adr/0010-emision-pdf-anulacion-descarte.md) §6–8.

> **Limitación:** los respaldos están en el mismo disco `D:` que la base y los documentos. Sirven para recuperarse de errores operativos (borrados, migraciones fallidas, archivos dañados), **no de la pérdida del disco**. Para eso, copie periódicamente `D:\Proyecto_SoftArq\respaldos` a un medio externo; no hay servicios en la nube.

## 1. Preparación (una vez, como administrador local)

Crea el rol de solo lectura `softarq_respaldo` (CONNECT solo a `softarq_dev`, SELECT sobre su esquema, sesiones de solo lectura, sin `pg_read_all_data`), su credencial local `apps\api\.env.respaldo` (excluida de Git) y la base aislada `softarq_restauracion` (propietario `softarq_migrator`; `softarq_app` solo se conecta). Es idempotente y no toca otras bases, el servicio ni `pg_hba.conf`.

```
# Opción A, interactiva: psql pide la contraseña de postgres
powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar-respaldo.ps1

# Opción B, sin interacción, con la credencial cifrada con DPAPI (misma cuenta de Windows).
# 1) En una ventana LOCAL de PowerShell (la contraseña no se muestra ni queda en claro):
Read-Host 'Contraseña de postgres' -AsSecureString | ConvertFrom-SecureString | Set-Content -Encoding ascii D:\Proyecto_SoftArq\_work\secrets\postgres-admin.dpapi
# 2) Aprovisionar y borrar el archivo al terminar (también si falla):
powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar-respaldo.ps1 -ArchivoCredencial D:\Proyecto_SoftArq\_work\secrets\postgres-admin.dpapi -EliminarCredencial
```

## 2. Comandos

Desde `apps/api` (o con `pnpm --filter @softarq/api …`):

| Comando | Qué hace |
|---|---|
| `pnpm respaldo:crear` | Respaldo nuevo en `D:\Proyecto_SoftArq\respaldos\softarq_dev\<ID>` |
| `pnpm respaldo:verificar <carpeta>` | Comprueba manifiesto, SHA-256 del volcado y de cada PDF, legibilidad del volcado y archivos de más. Código 0 solo si es COMPLETO y todo coincide |
| `pnpm respaldo:restaurar <carpeta>` | Restauración **de prueba** en `softarq_restauracion` y documentos en `_work\restauracion\softarq_restauracion\documentos` (requiere la API compilada) |
| `pnpm respaldo:probar-restauracion` | Prueba completa: respaldo real, verificación, restauración, comprobaciones, API temporal en 127.0.0.1:3100 con descarga del PDF, casos de fallo e integridad de desarrollo. Informe en `_work\evidencias\respaldo-<ID>\` |

## 3. Coherencia entre la base y los archivos

La base y la carpeta no comparten transacción. El respaldo lo resuelve así:

1. Abre una transacción `REPEATABLE READ READ ONLY` con `softarq_respaldo` y exporta su instantánea (`pg_export_snapshot()`).
2. `pg_dump --snapshot=<id>` vuelca **exactamente** esa instantánea. En la misma transacción se leen las emisiones (clave, tamaño y SHA-256 registrados), las migraciones aplicadas y los conteos por tabla.
3. La API escribe y sincroniza cada PDF **antes** de registrar su emisión (ADR-0010 §6). Por tanto, toda emisión presente en la instantánea ya tiene su archivo. Una emisión concurrente posterior no está en el volcado y su PDF no se copia: el respaldo es coherente con el instante de la instantánea.
4. Se copian **solo** los archivos referenciados, sin sobrescribir (`COPYFILE_EXCL`), y se comprueban tamaño y SHA-256 en el original y en la copia.
5. Si falta un PDF referenciado, no coincide su hash o falla cualquier paso, el respaldo queda **INCOMPLETO** y el comando termina con código 1 y el motivo.

`documentos:revisar --limpiar` nunca borra archivos registrados, así que no puede retirar un PDF de la instantánea. Aun así, no lo ejecute mientras se crea un respaldo.

## 4. Formato del respaldo

```
D:\Proyecto_SoftArq\respaldos\softarq_dev\
  softarq_dev-20261004T063015Z-a1b2c3\          ← COMPLETO (nombre = id)
    base.dump                                    ← pg_dump -Fc de la instantánea
    documentos\emisiones\<org>\<emision>.pdf     ← bytes originales
    manifiesto.json
  softarq_dev-…-d4e5f6.INCOMPLETO\               ← nunca sirve para restaurar
  softarq_dev-…-xxxxxx.en-curso\                 ← en creación o interrumpido (no válido)
```

- **Identificador:** `softarq_dev-AAAAMMDDTHHMMSSZ-xxxxxx` (UTC + 3 bytes aleatorios). Las carpetas se crean de forma exclusiva: nunca se sobrescribe un respaldo y nunca se borran originales.
- **`manifiesto.json`** (`formato: softarq-respaldo/1`):
  - `id`, `creadoEn`, `estado` (COMPLETO / INCOMPLETO) y `problemas` (tipo AUSENTE, DANADO, COPIA_DISTINTA, CLAVE_INVALIDA o ERROR);
  - `origen`: base, rol, versión del servidor y de `pg_dump`, carpeta de documentos;
  - `aplicacion`: commit y si había cambios sin commit;
  - `esquema`: migraciones aplicadas y la última;
  - `base`: tamaño y SHA-256 de `base.dump`;
  - `documentos`: total, referenciados, bytes y la lista (emisión, organización, folio, versión, clave, tamaño y SHA-256);
  - `conteos` por tabla.

  No contiene contraseñas ni URL de conexión (la verificación lo comprueba).
- **Secretos:** las contraseñas salen de `apps\api\.env` y `.env.respaldo` hacia un `PGPASSFILE` temporal en `_work\tmp` (borrado en `finally`) o al cliente `pg` en memoria. Nunca aparecen en argumentos, registros, manifiestos ni mensajes.

## 5. Restauración

`restaurar` sigue este orden y se detiene en el primer fallo:

1. **Guardas sin conectar:**
   - el destino debe estar en la lista blanca (`softarq_restauracion`);
   - `softarq_dev`, `softarq_test`, `softarq_shadow`, `postgres` y las plantillas se rechazan explícitamente como **PROHIBIDO**;
   - la carpeta de documentos de destino no puede solaparse con los documentos de desarrollo ni con los respaldos, ni estar en un repositorio.
2. Verificación completa del respaldo.
3. Conexión como `softarq_migrator` y comprobación de `current_database()` en el cliente y en el servidor.
4. `DROP SCHEMA public CASCADE` **solo en el destino comprobado** y `pg_restore --no-owner --single-transaction --exit-on-error`.
5. `permisos-app.sql` reaplicado y todas las sesiones restauradas revocadas.
6. Copia de documentos a una carpeta marcada con `.softarq-restauracion`: solo se vacía si lleva esa marca.
7. `documentos:revisar` contra el destino.

**Tratamiento de lo restaurado:**

| Elemento | Tratamiento |
|---|---|
| Roles y contraseñas | **No** están en el volcado (son globales del servidor). Los roles del proyecto ya existen; nunca se crean ni se cambian al restaurar |
| Propietarios | `--no-owner`: todo queda del migrador, como en desarrollo |
| Permisos (GRANT) | Se restauran los del volcado y se **reaplica** `permisos-app.sql`; la prueba comprueba que `softarq_app` no puede modificar emisiones ni versiones |
| Disparadores de inmutabilidad | Se restauran con el esquema y la prueba los comprueba |
| Configuración | El volcado no incluye `postgresql.conf` ni `pg_hba.conf`. La configuración de la aplicación (`.env`) no se respalda: se regenera con `db:credenciales` |
| Sesiones | **Todas se revocan** (motivo `RESTAURACION`): ninguna cookie anterior sirve contra lo restaurado |
| Documentos | Bytes originales; nunca se regeneran |

**Recuperación real de desarrollo:** este procedimiento **no restaura sobre `softarq_dev`** y no hay comando para hacerlo. Si alguna vez hace falta:
1. Detener la API.
2. Comprobar el respaldo con `respaldo:verificar`.
3. Que un administrador restaure en una base nueva siguiendo §5.
4. Validar esa base.
5. Cambiar `DATABASE_URL` y `SOFTARQ_DIR_DOCUMENTOS`, o renombrar las bases, con la API detenida.

Es una decisión manual y documentada, fuera de este alcance.

### 5.1 Inicialización de una instalación nueva (laptop, 24/10/2026)

Procedimiento **separado** y acotado, para una instalación en la que `softarq_dev` acaba de crearse vacía. No sustituye a `respaldo:restaurar` (que sigue admitiendo solo `softarq_restauracion`) ni reemplaza una base existente:

```
pnpm --filter @softarq/api build
pnpm --filter @softarq/api respaldo:inicializar-desarrollo <carpeta del respaldo> --confirmar softarq_dev
```

- Destino fijo `softarq_dev`; sin la confirmación literal no hace nada. Verifica el respaldo, comprueba base y propietario (`softarq_migrator`) en el cliente y en el servidor y **rechaza si `public` contiene cualquier objeto** (no hace `DROP SCHEMA`).
- Restaura con `pg_restore --no-owner --single-transaction`, reaplica `permisos-app.sql`, revoca las sesiones (`RESTAURACION`) y comprueba que el historial de `_prisma_migrations` coincide con el manifiesto y con `prisma/migrations` (no aplica migraciones).
- Documentos: los de `SOFTARQ_DIR_DOCUMENTOS` deben coincidir con el manifiesto; los que falten se copian sin sobrescribir; uno distinto detiene el proceso. Termina con `documentos:revisar`.
- Código: `apps/api/scripts/respaldo/inicializar-desarrollo.mjs`; guardas probadas en `__tests__/inicializar-desarrollo.test.mjs`.
- **Herramientas de PostgreSQL:** `comun.mjs` y los `aprovisionar*.ps1` usan `SOFTARQ_PG_BIN`, si no `%ProgramFiles%\PostgreSQL\18\bin` y, si no, `D:\Postgres18\bin` (equipo original).

## 6. Política de conservación

- **Cuándo respaldar:** antes de cada cambio de esquema (`db:migrar`), antes de cargas o borrados manuales, al cerrar cada módulo y, en uso continuo, una vez al día.
- **Qué conservar:**
  - los **10 respaldos COMPLETOS más recientes**;
  - el **primero de cada mes** durante 12 meses;
  - todo respaldo previo a una migración hasta que la siguiente esté verificada.
- **Borrado:** manual, después de comprobar que existe un respaldo COMPLETO más reciente verificado (`respaldo:verificar`). Las carpetas `.INCOMPLETO` y `.en-curso` no sirven para restaurar; se borran a mano tras revisar su motivo.
- **Sin tareas automáticas:** no hay tareas programadas de Windows ni limpieza automática. Para automatizarlas haría falta una decisión expresa.
- **Copia externa:** copie la carpeta completa del respaldo, con `manifiesto.json`, a un medio externo y compruébela allí con `respaldo:verificar`.

## 7. Resultados verificados (04/10/2026)

**Aprovisionamiento** (`aprovisionar-respaldo.ps1 -ArchivoCredencial … -EliminarCredencial`):
- código de salida 0;
- rol, base, permisos y `.env.respaldo` creados; archivo DPAPI eliminado al terminar.

Comprobado con consultas de catálogo, sin intentar escrituras:
- `softarq_respaldo` tiene SELECT en las 28 tablas y secuencias de `softarq_dev` y **ninguna** escritura;
- `default_transaction_read_only = on`;
- sin superusuario, CREATEDB, CREATEROLE ni BYPASSRLS, sin membresías y sin CREATE en `public`;
- no puede conectarse a `softarq_restauracion` ni a `softarq_test`.

**Prueba completa** (`pnpm respaldo:probar-restauracion`): **30/30 comprobaciones correctas**. Informe en `_work\evidencias\respaldo-softarq_dev-20261004T075403Z-e6dcda\informe.txt`.

| Paso | Resultado |
|---|---|
| Respaldo real | `D:\Proyecto_SoftArq\respaldos\softarq_dev\softarq_dev-20261004T075403Z-e6dcda`: COMPLETO; `base.dump` de 206.182 bytes; esquema `20261003200000_emision`; commit `3c352b6` (con cambios sin commit de este trabajo); 1/1 documento (COT-2026-00004-v1, 24.178 bytes) |
| Verificación | `respaldo:verificar` VÁLIDO: SHA-256 del volcado y del PDF coinciden; `pg_restore --list` legible |
| Restauración en `softarq_restauracion` | Esquema vaciado → `pg_restore` → permisos reaplicados → 2 sesiones revocadas → 1 documento copiado y comprobado → `documentos:revisar` sin ausentes ni dañados |
| Destino | Conteos de las 27 tablas iguales al manifiesto; última migración igual; 0 incoherencias en las 7 relaciones comprobadas: proyecto↔cliente, cotización↔proyecto/cliente, versión↔cotización, revisión↔versión, evento↔revisión, emisión↔versión y aprobación, membresía↔usuario |
| Datos | 1 organización, 3 usuarios, 4 cotizaciones, 4 versiones, 2 revisiones (2 aprobadas) y 1 emisión |
| Permisos | `softarq_app`: SELECT en `emision`; sin UPDATE ni DELETE en `emision` ni UPDATE en `cotizacion_version`; sin acceso a `_prisma_migrations`; 2 disparadores de `emision` presentes; 0 sesiones activas |
| Descarga real | API temporal en 127.0.0.1:3100 contra el destino; inicio de sesión del Preparador DEMO; descarga de COT-2026-00004-v1 con los **mismos bytes** que el original (SHA-256 `a319384da37cbda1…`); API detenida |
| Fallos (copias en `_work\pruebas\respaldo-fallos`) | PDF ausente → `.INCOMPLETO` (AUSENTE); PDF dañado → `.INCOMPLETO` (DANADO); respaldo con el PDF alterado → `verificar` lo rechaza (SHA-256 distinto) y `restaurar` se detiene antes de conectar; destinos `softarq_dev` y `softarq_test` → PROHIBIDO; carpeta de documentos de desarrollo como destino → PROHIBIDA |
| Desarrollo intacto | Conteos de `softarq_dev`, y tamaño, SHA-256 y fecha de cada PDF original, iguales antes y después |

**Comprobaciones independientes:**
- `respaldo:verificar` sobre el respaldo real termina con 0;
- ni el manifiesto, ni los informes, ni `ultima-restauracion.json` contienen ninguna de las contraseñas locales (comparadas sin mostrarlas);
- no quedan archivos `pgpass` ni credenciales temporales;
- el puerto 3100 queda libre y los servidores del propietario (3000 y 5173) siguen con sus procesos.

**Sin comprobar:**
- la ejecución repetida del aprovisionamiento: la idempotencia se revisó en el SQL, pero repetirlo exigiría otra credencial administrativa;
- una emisión concurrente no se comprobó el 04/10/2026; la prueba posterior del módulo 9 se documenta a continuación.

## 8. Nuevos eventos y prueba concurrente (05/10/2026)

La migración `20261005150000_respuestas_cliente` añade `respuesta_cliente_evento` (solo alta), incluida automáticamente en los conteos y volcado de la misma instantánea. `softarq_respaldo` tiene SELECT limitado en la tabla por los permisos por defecto del migrador; se comprobó realmente sin escritura ni DDL. La reaplicación de `permisos-app.sql` al restaurar revoca UPDATE/DELETE en ella y conserva SELECT/INSERT para softarq_app. Para un respaldo anterior, la cláusula condicional no exige que la tabla exista; usar código compatible con el esquema restaurado, sin aplicar migraciones silenciosamente.

Antes de migrar desarrollo: respaldo `softarq_dev-20261005T143908Z-02ccd5`, COMPLETO y VÁLIDO, esquema anterior, PDF 1/1.

`pnpm --filter @softarq/api respaldo:probar-concurrencia` (**15/15**) añadió los folios DEMO COT-2026-00005 y 00006. Emitió/registró el primero antes de exportar una instantánea; mientras seguía abierta confirmó su corrección y una segunda emisión con respuesta. Respaldo `softarq_dev-20261005T151809Z-e27a52`, COMPLETO y VÁLIDO, restaurado solo en softarq_restauracion: incluye la respuesta inicial del primero, excluye su corrección y la emisión/respuesta posteriores. Las emisiones/PDF previos permanecieron intactos. Punto de sincronización interno en `crearRespaldo`; sin endpoint ni opción pública nueva del producto. Evidencia: `_work\evidencias\concurrencia-respaldo-2026-10-05T15-18-05-612Z\informe.json`.

Prueba completa posterior: **35/35**, respaldo `softarq_dev-20261005T151858Z-1e4ecc` (225.175 bytes; 3/3 PDF). Restaura los tres eventos, compara notas y demás campos con origen, verifica cadenas/fechas/permisos/disparadores, descarga los tres PDF por API temporal y comprueba desarrollo intacto. Informe: `_work\evidencias\respaldo-softarq_dev-20261005T151858Z-1e4ecc\informe.txt`.

Sigue pendiente **repetir realmente el aprovisionamiento administrativo**. No se repitió ni se solicitó una contraseña por chat. La prueba de concurrencia pendiente del módulo anterior queda cubierta por la ejecución descrita, sin atribuirla a la sesión anterior.
