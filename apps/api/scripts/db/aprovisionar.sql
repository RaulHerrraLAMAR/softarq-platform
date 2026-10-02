-- Aprovisionamiento local de SoftArq (ADR-0004). Ejecutar con psql como superusuario
-- (postgres) mediante aprovisionar.ps1. Idempotente: puede repetirse.
--
-- Crea o actualiza SOLO:
--   roles   softarq_migrator, softarq_app
--   bases   softarq_dev, softarq_test, softarq_shadow (propietario softarq_migrator)
-- No toca otras bases, el servicio, pg_hba.conf ni la configuración global.
-- Las contraseñas llegan por variables de entorno (\getenv), no por la línea de comandos.

\set ON_ERROR_STOP on
\getenv clave_migrador SOFTARQ_MIGRATOR_PASSWORD
\getenv clave_app SOFTARQ_APP_PASSWORD

\if :{?clave_migrador}
\else
  \echo 'ERROR: falta la variable de entorno SOFTARQ_MIGRATOR_PASSWORD.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif
\if :{?clave_app}
\else
  \echo 'ERROR: falta la variable de entorno SOFTARQ_APP_PASSWORD.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif
SELECT (length(:'clave_migrador') >= 32 AND length(:'clave_app') >= 32) AS claves_ok \gset
\if :claves_ok
\else
  \echo 'ERROR: las contraseñas de los roles deben tener al menos 32 caracteres.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif

-- 1. No reutilizar bases ajenas: si alguna existe con otro propietario, se detiene.
SELECT count(*) = 0 AS bases_ok
  FROM pg_database
 WHERE datname IN ('softarq_dev', 'softarq_test', 'softarq_shadow')
   AND pg_get_userbyid(datdba) <> 'softarq_migrator' \gset
\if :bases_ok
\else
  \echo 'ERROR: existe una base softarq_* con un propietario distinto de softarq_migrator. No se modifica nada.'
  DO $$ BEGIN RAISE EXCEPTION 'Aprovisionamiento detenido: no se modificó nada.'; END $$;
\endif

-- 2. Roles sin privilegios especiales.
SELECT format('CREATE ROLE softarq_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clave_migrador')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'softarq_migrator') \gexec
SELECT format('CREATE ROLE softarq_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clave_app')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'softarq_app') \gexec

-- Si ya existían: se restablecen atributos y contraseña (sincroniza con los .env locales).
SELECT format('ALTER ROLE softarq_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clave_migrador') \gexec
SELECT format('ALTER ROLE softarq_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clave_app') \gexec

-- 3. Bases (solo las que faltan).
SELECT format('CREATE DATABASE %I OWNER softarq_migrator ENCODING %L TEMPLATE template0', b, 'UTF8')
  FROM unnest(ARRAY['softarq_dev', 'softarq_test', 'softarq_shadow']) AS b
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = b) \gexec

-- 4. Conexiones: nadie más que los roles del proyecto.
REVOKE CONNECT, TEMPORARY ON DATABASE softarq_dev, softarq_test, softarq_shadow FROM PUBLIC;
GRANT CONNECT ON DATABASE softarq_dev, softarq_test TO softarq_app;
REVOKE ALL ON DATABASE softarq_shadow FROM softarq_app;
GRANT CONNECT, TEMPORARY ON DATABASE softarq_dev, softarq_test, softarq_shadow TO softarq_migrator;

-- 5. Esquema public de cada base: propiedad del migrador; la aplicación solo lo usa.
\connect softarq_dev
ALTER SCHEMA public OWNER TO softarq_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO softarq_app;

\connect softarq_test
ALTER SCHEMA public OWNER TO softarq_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO softarq_app;

\connect softarq_shadow
ALTER SCHEMA public OWNER TO softarq_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

\echo 'Aprovisionamiento completado: roles softarq_migrator y softarq_app; bases softarq_dev, softarq_test y softarq_shadow.'
