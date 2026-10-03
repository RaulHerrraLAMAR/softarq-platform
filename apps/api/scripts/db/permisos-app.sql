-- Permisos del rol de la aplicación tras cada `prisma migrate deploy` (ADR-0004, ADR-0007).
-- Lo ejecuta el rol migrador con `prisma db execute`. Solo sentencias constantes.
-- La aplicación lee y escribe catálogos, pero no borra (los registros se desactivan o anulan),
-- no ejecuta DDL y no puede leer ni alterar el historial de migraciones.
GRANT USAGE ON SCHEMA public TO softarq_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO softarq_app;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM softarq_app;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM softarq_app;
REVOKE INSERT, UPDATE ON TABLE public."unidad" FROM softarq_app;
-- Identidad (ADR-0007): la aplicación solo consulta usuarios y pertenencias; no crea, modifica
-- ni reactiva cuentas (las cuentas DEMO las carga el rol migrador).
REVOKE INSERT, UPDATE ON TABLE public."usuario", public."membresia" FROM softarq_app;
-- Sesiones: alta y, como única modificación, actividad y revocación (nunca el hash del token,
-- el titular ni las fechas de expiración). Sin DELETE: la purga es tarea del rol migrador.
REVOKE UPDATE ON TABLE public."sesion" FROM softarq_app;
GRANT UPDATE ("ultima_actividad_en", "revocada_en", "motivo_revocacion") ON TABLE public."sesion" TO softarq_app;
