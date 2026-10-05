-- CreateTable
CREATE TABLE "excepcion_decision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "decision" VARCHAR(10) NOT NULL,
    "comentario" VARCHAR(2000),
    "preparador_id" UUID NOT NULL,
    "decidido_por" UUID NOT NULL,
    "decidido_nombre" VARCHAR(200) NOT NULL,
    "decidido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excepcion_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "excepcion_decision_organizacion_id_revision_id_idx" ON "excepcion_decision"("organizacion_id", "revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "excepcion_decision_unica_key" ON "excepcion_decision"("organizacion_id", "version_id", "numero");

-- AddForeignKey
ALTER TABLE "excepcion_decision" ADD CONSTRAINT "excepcion_decision_revision_fk" FOREIGN KEY ("organizacion_id", "revision_id", "version_id") REFERENCES "revision"("organizacion_id", "id", "version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "excepcion_decision" ADD CONSTRAINT "excepcion_decision_autor_fk" FOREIGN KEY ("organizacion_id", "decidido_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Módulo 10 (ADR-0014): decisiones del Revisor sobre las excepciones B-22 de una versión.
-- Completado a mano: CHECK, disparadores, funciones, idempotencia y permisos.
-- ---------------------------------------------------------------------------

ALTER TABLE "excepcion_decision"
  ADD CONSTRAINT "excepcion_decision_decision_ck" CHECK ("decision" IN ('AUTORIZADA', 'RECHAZADA')),
  ADD CONSTRAINT "excepcion_decision_numero_ck" CHECK ("numero" BETWEEN 1 AND 100),
  ADD CONSTRAINT "excepcion_decision_comentario_ck" CHECK ("comentario" IS NULL OR length(btrim("comentario")) > 0),
  ADD CONSTRAINT "excepcion_decision_nombre_ck" CHECK (length(btrim("decidido_nombre")) > 0),
  -- BL-17 por identidad: quien autoriza o rechaza no es el preparador (D-13, `Exc_Resolver`).
  ADD CONSTRAINT "excepcion_decision_bl17_ck" CHECK ("decidido_por" <> "preparador_id");

-- Solo alta: ni la aplicación ni el propietario modifican o borran una decisión.
CREATE FUNCTION "excepcion_decision_inmutable"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'SOFTARQ:DECISION_EXCEPCION_INMUTABLE: la decision se conserva; corrija con una version nueva.' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER "excepcion_decision_inmutable_trg" BEFORE UPDATE OR DELETE ON "excepcion_decision"
FOR EACH ROW EXECUTE FUNCTION "excepcion_decision_inmutable"();

-- Coherencia al insertar (también si alguien inserta sin la función): Revisor vigente, revisión
-- PENDIENTE de esa versión, número existente en la captura congelada y BL-17 frente al autor.
CREATE FUNCTION "excepcion_decision_validar"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r revision%ROWTYPE; v_autor UUID; v_total INTEGER;
BEGIN
  NEW.decidido_nombre := softarq_exigir_funcion(NEW.organizacion_id, NEW.decidido_por, 'REVISOR');
  SELECT * INTO r FROM revision WHERE organizacion_id = NEW.organizacion_id AND id = NEW.revision_id;
  IF NOT FOUND OR r.version_id <> NEW.version_id THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF r.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_REVISION' USING ERRCODE = 'P0001';
  END IF;
  SELECT autor_id, coalesce(jsonb_array_length(captura->'excepciones'), 0) INTO v_autor, v_total
    FROM cotizacion_version WHERE organizacion_id = NEW.organizacion_id AND id = NEW.version_id;
  IF NEW.numero > v_total THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.decidido_por = v_autor OR NEW.decidido_por = r.preparador_id THEN
    RAISE EXCEPTION 'SOFTARQ:AUTOAPROBACION' USING ERRCODE = 'P0001';
  END IF;
  NEW.cotizacion_id := r.cotizacion_id;
  NEW.preparador_id := r.preparador_id;
  RETURN NEW;
END $$;
CREATE TRIGGER "excepcion_decision_validar_trg" BEFORE INSERT ON "excepcion_decision"
FOR EACH ROW EXECUTE FUNCTION "excepcion_decision_validar"();

ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_recurso_ck"
  CHECK ("recurso_tipo" IN ('cliente','proyecto','cotizacion','version','revision','emision','respuesta','excepcion'));

-- Autorizar o rechazar la excepción N (B-29). Bloquea la revisión con el mismo FOR UPDATE que
-- softarq_decidir_revision: una aprobación y una decisión simultáneas se serializan. Una sola
-- sentencia: idempotencia, decisión y bitácora.
CREATE FUNCTION "softarq_decidir_excepcion"(
  p_org UUID, p_usuario UUID, p_revision UUID, p_version UUID, p_numero INTEGER, p_decision TEXT,
  p_comentario TEXT, p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID := gen_random_uuid(); r revision%ROWTYPE;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'excepcion', v_id, p_expira);
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'REVISOR');
  SELECT * INTO r FROM revision WHERE organizacion_id = p_org AND id = p_revision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
  IF r.version_id <> p_version OR r.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_REVISION' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM excepcion_decision WHERE organizacion_id = p_org AND version_id = p_version AND numero = p_numero) THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EXCEPCION' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO excepcion_decision (id, organizacion_id, cotizacion_id, version_id, revision_id, numero, decision, comentario,
                                  preparador_id, decidido_por, decidido_nombre)
  VALUES (v_id, p_org, r.cotizacion_id, p_version, p_revision, p_numero, p_decision, NULLIF(btrim(COALESCE(p_comentario, '')), ''),
          r.preparador_id, p_usuario, '-');
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', r.cotizacion_id,
          CASE WHEN p_decision = 'AUTORIZADA' THEN 'EXCEPCION_AUTORIZADA' ELSE 'EXCEPCION_RECHAZADA' END,
          p_usuario, jsonb_build_object('revisionId', p_revision, 'versionId', p_version, 'numero', p_numero));
  RETURN v_id;
END $$;

-- Reemplaza la función del módulo 7 (misma firma): al APROBAR, todas las excepciones de la versión
-- deben estar AUTORIZADAS (W §3.10, Validar estricto). Se comprueba dentro del bloqueo de la revisión.
CREATE OR REPLACE FUNCTION "softarq_decidir_revision"(
  p_org UUID, p_usuario UUID, p_revision UUID, p_version UUID, p_esperada INTEGER, p_decision TEXT,
  p_observaciones TEXT, p_avisos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
  r revision%ROWTYPE;
  v_autor UUID;
  v_excepciones INTEGER;
  v_nuevo TEXT;
  v_obs TEXT := NULLIF(btrim(COALESCE(p_observaciones, '')), '');
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'revision', p_revision, p_expira);
  v_nombre := softarq_exigir_funcion(p_org, p_usuario, 'REVISOR');
  IF p_decision NOT IN ('APROBAR', 'SOLICITAR_CAMBIOS') THEN
    RAISE EXCEPTION 'SOFTARQ:DECISION_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO r FROM revision WHERE id = p_revision AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF r.version_id <> p_version OR r.estado <> 'PENDIENTE' OR r.revision <> p_esperada THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_REVISION' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'APROBAR' THEN
    SELECT autor_id, coalesce(jsonb_array_length(captura->'excepciones'), 0) INTO v_autor, v_excepciones
      FROM cotizacion_version WHERE id = r.version_id AND organizacion_id = p_org;
    IF p_usuario = v_autor OR p_usuario = r.preparador_id THEN
      RAISE EXCEPTION 'SOFTARQ:AUTOAPROBACION' USING ERRCODE = 'P0001';
    END IF;
    IF v_excepciones > (SELECT count(*) FROM excepcion_decision d
                         WHERE d.organizacion_id = p_org AND d.version_id = r.version_id AND d.decision = 'AUTORIZADA') THEN
      RAISE EXCEPTION 'SOFTARQ:EXCEPCIONES_SIN_AUTORIZAR' USING ERRCODE = 'P0001';
    END IF;
    v_nuevo := 'APROBADA';
  ELSE
    IF v_obs IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:OBSERVACIONES_REQUERIDAS' USING ERRCODE = 'P0001';
    END IF;
    v_nuevo := 'CAMBIOS_SOLICITADOS';
  END IF;
  UPDATE revision
     SET estado = v_nuevo, revision = revision + 1, resuelta_por = p_usuario, resuelta_en = now(), observaciones = v_obs
   WHERE id = p_revision AND organizacion_id = p_org AND estado = 'PENDIENTE' AND revision = p_esperada;
  INSERT INTO revision_evento (organizacion_id, revision_id, secuencia, tipo, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, observaciones, avisos)
  VALUES (
    p_org, p_revision,
    (SELECT COALESCE(max(e.secuencia), 0) + 1 FROM revision_evento e WHERE e.revision_id = p_revision),
    v_nuevo, 'PENDIENTE', v_nuevo, p_usuario, v_nombre, v_obs, p_avisos
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', r.cotizacion_id,
          CASE WHEN v_nuevo = 'APROBADA' THEN 'VERSION_APROBADA' ELSE 'CAMBIOS_SOLICITADOS' END,
          p_usuario, jsonb_build_object('revisionId', p_revision, 'numero', r.version_numero));
  RETURN p_revision;
END;
$$;

REVOKE ALL ON TABLE "excepcion_decision" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "excepcion_decision" TO softarq_app;
REVOKE ALL ON FUNCTION "excepcion_decision_inmutable"(), "excepcion_decision_validar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_decidir_excepcion"(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "softarq_decidir_excepcion"(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
-- softarq_decidir_revision conserva sus privilegios (CREATE OR REPLACE no los cambia).
-- softarq_respaldo recibe SELECT por los privilegios por defecto del migrador ya aprovisionados.
