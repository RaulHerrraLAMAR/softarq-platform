-- Purga de sesiones caducadas (ADR-0007). La ejecuta el rol migrador: la aplicación no tiene DELETE.
-- Solo borra sesiones vencidas o revocadas hace más de 7 días (las recientes se conservan para revisión).
DELETE FROM public."sesion"
 WHERE "expira_en" < now() - interval '7 days'
    OR "revocada_en" < now() - interval '7 days';
