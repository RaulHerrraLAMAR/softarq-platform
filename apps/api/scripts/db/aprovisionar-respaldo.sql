-- Aprovisionamiento para respaldo y prueba de restauración (ADR-0012). Ejecutar con psql como
-- superusuario (postgres) mediante aprovisionar-respaldo.ps1. Idempotente: puede repetirse.
--
-- Crea o actualiza SOLO:
--   rol   softarq_respaldo: LOGIN de solo lectura. CONNECT solo a softarq_dev y SELECT sobre su
--         esquema public (tablas y secuencias, incluidas las que creen migraciones futuras).
--         Sin DDL, sin escritura, sin pg_read_all_data (que leería cualquier base del servidor).
--   base  softarq_restauracion: destino AISLADO de pruebas de restauración (propietario
--         softarq_migrator, que restaura; softarq_app solo se conecta para la API temporal).
-- No toca softarq_dev salvo para conceder SELECT a softarq_respaldo; no toca softarq_test,
-- softarq_shadow, otras bases, el servicio, pg_hba.conf ni la configuración global.
-- La contraseña llega por variable de entorno (\getenv), no por la línea de comandos.

\set ON_ERROR_STOP on
\getenv clave_respaldo SOFTARQ_RESPALDO_PASSWORD

\if :{?clave_respaldo}
\else
  \echo 'ERROR: falta la variable de entorno SOFTARQ_RESPALDO_PASSWORD.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif
SELECT length(:'clave_respaldo') >= 32 AS clave_ok \gset
\if :clave_ok
\else
  \echo 'ERROR: la contraseña de softarq_respaldo debe tener al menos 32 caracteres.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif

-- 1. Requisitos: roles y base de desarrollo ya aprovisionados (aprovisionar.ps1).
SELECT count(*) = 2 AS roles_ok FROM pg_roles WHERE rolname IN ('softarq_migrator', 'softarq_app') \gset
\if :roles_ok
\else
  \echo 'ERROR: faltan los roles softarq_migrator o softarq_app. Ejecuta antes aprovisionar.ps1.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif
SELECT count(*) = 1 AS dev_ok FROM pg_database WHERE datname = 'softarq_dev' AND pg_get_userbyid(datdba) = 'softarq_migrator' \gset
\if :dev_ok
\else
  \echo 'ERROR: no existe softarq_dev con propietario softarq_migrator.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif
-- No reutilizar una base ajena con el nombre del destino.
SELECT count(*) = 0 AS restauracion_ok FROM pg_database
 WHERE datname = 'softarq_restauracion' AND pg_get_userbyid(datdba) <> 'softarq_migrator' \gset
\if :restauracion_ok
\else
  \echo 'ERROR: existe softarq_restauracion con un propietario distinto de softarq_migrator. No se modifica nada.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif

-- 2. Rol de respaldo (INHERIT no hace falta: no recibe membresías).
SELECT format('CREATE ROLE softarq_respaldo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clave_respaldo')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'softarq_respaldo') \gexec
SELECT format('ALTER ROLE softarq_respaldo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clave_respaldo') \gexec
-- Sesiones de respaldo siempre de solo lectura, aunque un cliente intente escribir.
ALTER ROLE softarq_respaldo SET default_transaction_read_only = on;

-- 3. Base aislada de restauración (solo si falta).
SELECT 'CREATE DATABASE softarq_restauracion OWNER softarq_migrator ENCODING ''UTF8'' TEMPLATE template0'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'softarq_restauracion') \gexec

REVOKE CONNECT, TEMPORARY ON DATABASE softarq_restauracion FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE softarq_restauracion TO softarq_migrator;
GRANT CONNECT ON DATABASE softarq_restauracion TO softarq_app;
GRANT CONNECT ON DATABASE softarq_dev TO softarq_respaldo;
-- El respaldo nunca se conecta al destino de restauración.
REVOKE ALL ON DATABASE softarq_restauracion FROM softarq_respaldo;

-- 4. softarq_dev: lectura para el respaldo, también de lo que creen migraciones futuras.
\connect softarq_dev
GRANT USAGE ON SCHEMA public TO softarq_respaldo;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO softarq_respaldo;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO softarq_respaldo;
ALTER DEFAULT PRIVILEGES FOR ROLE softarq_migrator IN SCHEMA public GRANT SELECT ON TABLES TO softarq_respaldo;
ALTER DEFAULT PRIVILEGES FOR ROLE softarq_migrator IN SCHEMA public GRANT SELECT ON SEQUENCES TO softarq_respaldo;

-- 5. softarq_restauracion: mismo esquema public que las demás bases.
\connect softarq_restauracion
ALTER SCHEMA public OWNER TO softarq_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO softarq_app;

\echo 'Aprovisionamiento de respaldo completado: rol softarq_respaldo (solo lectura de softarq_dev) y base aislada softarq_restauracion.'
