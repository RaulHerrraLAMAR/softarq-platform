-- Módulo 16 (ADR-0020): sesión del canal móvil. Aditiva: solo amplía los CHECK de `sesion`.
--
-- Una sesión `MOVIL` es el mismo token opaco de 32 bytes (solo su SHA-256 en la base) que una de
-- `USUARIO`, pero se presenta como `Authorization: Bearer` y NO como cookie. El tipo distinto aísla
-- los canales: la resolución por cookie solo acepta USUARIO y la del Bearer solo MOVIL, así que un
-- token de un canal no sirve en el otro. Misma tabla, mismas columnas, mismos permisos de
-- `softarq_app` (INSERT; UPDATE solo de actividad y revocación; sin DELETE). Las funciones de
-- personas que revocan sesiones lo hacen por `usuario_id`, de modo que cubren también las móviles.

ALTER TABLE "sesion" DROP CONSTRAINT "sesion_tipo_ck";
ALTER TABLE "sesion" DROP CONSTRAINT "sesion_tipo_titular_ck";

ALTER TABLE "sesion"
  ADD CONSTRAINT "sesion_tipo_ck" CHECK ("tipo" IN ('PREVIA', 'USUARIO', 'MOVIL')),
  -- Una sesión de usuario o móvil lleva usuario y organización (FK compuesta a membresia); una previa, ninguno.
  ADD CONSTRAINT "sesion_tipo_titular_ck" CHECK (
    ("tipo" IN ('USUARIO', 'MOVIL') AND "usuario_id" IS NOT NULL AND "organizacion_id" IS NOT NULL)
    OR ("tipo" = 'PREVIA' AND "usuario_id" IS NULL AND "organizacion_id" IS NULL)
  );
