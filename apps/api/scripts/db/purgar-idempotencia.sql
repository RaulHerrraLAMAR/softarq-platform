-- Purga de claves de idempotencia caducadas (ADR-0008). La ejecuta el rol migrador: la aplicación
-- no tiene DELETE. Una clave caducada ya no se reproduce (422 IDEMPOTENCIA_CADUCADA); se conservan
-- 7 días más para poder revisar reintentos recientes. Los recursos creados no se tocan.
DELETE FROM public."idempotencia"
 WHERE "expira_en" < now() - interval '7 days';
