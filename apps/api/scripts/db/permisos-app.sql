-- Permisos del rol de la aplicación tras cada `prisma migrate deploy` (ADR-0004).
-- Lo ejecuta el rol migrador con `prisma db execute`. Solo sentencias constantes.
-- La aplicación lee y escribe catálogos, pero no borra (los registros se desactivan o anulan),
-- no ejecuta DDL y no puede leer ni alterar el historial de migraciones.
GRANT USAGE ON SCHEMA public TO softarq_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO softarq_app;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM softarq_app;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM softarq_app;
REVOKE INSERT, UPDATE ON TABLE public."unidad" FROM softarq_app;
