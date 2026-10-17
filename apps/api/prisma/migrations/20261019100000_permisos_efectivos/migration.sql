-- ---------------------------------------------------------------------------
-- Permisos efectivos (ADR-0017 §1.2), correcciones previas al módulo 13. Sin cambios de esquema.
--
-- Hasta aquí, aprobar un concepto dependía de una marca local (`set_config`) que cualquier sesión del
-- rol de la aplicación podía fijar: protegía de escrituras directas ACCIDENTALES, no de SQL
-- arbitrario. Ahora:
-- - `softarq_aprobar_concepto` es SECURITY DEFINER (propietario: rol migrador, `search_path` fijo) y
--   sigue exigiendo función, organización, revisión técnica y requisitos;
-- - `softarq_aprobar_carga_base` (DEFINER) aprueba solo conceptos de organizaciones DEMO insertados por
--   la carga en la transacción en curso, sin persona y con los requisitos completos;
-- - el disparador del concepto rechaza el paso a Aprobado cuando `current_user` es softarq_app, y
--   `permisos-app.sql` le retira UPDATE de `estado`, `aprobado_por` y `aprobado_en`.
-- Límite que se mantiene (ADR-0017): las funciones confían en el usuario que les pasa la API.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "concepto_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_propio BOOLEAN;
  v_tecnico BOOLEAN;
  v_magnitud TEXT;
  v_tipo_activo BOOLEAN;
  v_tarifa_unidad TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.heredado THEN
      RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: un concepto nuevo no puede marcarse como heredado.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.estado <> 'Borrador' OR NEW.aprobado_por IS NOT NULL OR NEW.aprobado_en IS NOT NULL THEN
      RAISE EXCEPTION 'SOFTARQ:APROBACION_DIRECTA: un concepto nuevo empieza en Borrador.' USING ERRCODE = 'P0001';
    END IF;
    v_propio := TRUE;
    v_tecnico := FALSE;
  ELSE
    IF (NEW.id, NEW.organizacion_id, NEW.codigo, NEW.creado_por, NEW.creado_en)
       IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo, OLD.creado_por, OLD.creado_en) THEN
      RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: el identificador del concepto no cambia.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.heredado AND NOT OLD.heredado THEN
      RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: la marca de concepto heredado no se activa.' USING ERRCODE = 'P0001';
    END IF;
    v_propio := (NEW.tipo_id, NEW.descripcion, NEW.unidad, NEW.tipo_formula, NEW.permite_descuento, NEW.regla_medicion, NEW.criterios, NEW.clase)
      IS DISTINCT FROM (OLD.tipo_id, OLD.descripcion, OLD.unidad, OLD.tipo_formula, OLD.permite_descuento, OLD.regla_medicion, OLD.criterios, OLD.clase);
    v_tecnico := v_propio OR NEW.revision_tecnica <> OLD.revision_tecnica;
    IF v_propio AND OLD.heredado THEN
      IF NEW.tipo_id IS NULL OR NEW.regla_medicion IS NULL THEN
        RAISE EXCEPTION 'SOFTARQ:CONCEPTO_INCOMPLETO: complete el tipo de estructura y la regla de medición para editar el concepto.' USING ERRCODE = 'P0001';
      END IF;
      NEW.heredado := FALSE;
    END IF;
    IF v_tecnico THEN
      IF NEW.revision_tecnica <= OLD.revision_tecnica THEN
        NEW.revision_tecnica := OLD.revision_tecnica + 1;
      END IF;
      NEW.estado := 'Borrador';
    END IF;
    IF NEW.activo AND NOT OLD.activo THEN
      NEW.estado := 'Borrador';
    END IF;
  END IF;

  -- Tipo activo de la misma organización (la FK compuesta impide otra organización).
  IF NEW.tipo_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.tipo_id IS DISTINCT FROM OLD.tipo_id) THEN
    SELECT activo INTO v_tipo_activo FROM tipo_estructura WHERE organizacion_id = NEW.organizacion_id AND id = NEW.tipo_id FOR SHARE;
    IF v_tipo_activo IS NOT TRUE THEN
      RAISE EXCEPTION 'SOFTARQ:TIPO_INACTIVO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- MagnitudDeFormula: CONTEO→conteo, LONGITUD→longitud, AREA→area, VOLUMEN→volumen.
  IF TG_OP = 'INSERT' OR (NEW.unidad, NEW.tipo_formula) IS DISTINCT FROM (OLD.unidad, OLD.tipo_formula) THEN
    SELECT magnitud INTO v_magnitud FROM unidad WHERE clave = NEW.unidad;
    IF v_magnitud IS DISTINCT FROM lower(NEW.tipo_formula) THEN
      RAISE EXCEPTION 'SOFTARQ:UNIDAD_FORMULA' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.tarifa_id IS NOT NULL AND (TG_OP = 'INSERT' OR (NEW.tarifa_id, NEW.unidad) IS DISTINCT FROM (OLD.tarifa_id, OLD.unidad)) THEN
    SELECT unidad INTO v_tarifa_unidad FROM tarifa_mano_obra WHERE organizacion_id = NEW.organizacion_id AND id = NEW.tarifa_id;
    IF v_tarifa_unidad IS DISTINCT FROM NEW.unidad THEN
      RAISE EXCEPTION 'SOFTARQ:UNIDAD_INCOMPATIBLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.estado = 'Borrador' THEN
    NEW.aprobado_por := NULL;
    NEW.aprobado_en := NULL;
  ELSIF TG_OP = 'UPDATE' AND (OLD.estado <> 'Aprobado'
        OR (NEW.aprobado_por, NEW.aprobado_en) IS DISTINCT FROM (OLD.aprobado_por, OLD.aprobado_en)) THEN
    -- Solo dentro de las funciones SECURITY DEFINER de aprobación (current_user = su propietario) o
    -- por el rol migrador; nunca con una escritura directa del rol de la aplicación.
    IF current_user = 'softarq_app' OR NEW.heredado OR NOT NEW.activo OR NEW.aprobado_en IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:APROBACION_DIRECTA: el concepto se aprueba con la operación Aprobar.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "softarq_aprobar_concepto"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision_tecnica INTEGER,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v concepto%ROWTYPE;
  v_problemas TEXT;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM concepto WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.estado = 'Aprobado' THEN
    RAISE EXCEPTION 'SOFTARQ:YA_APROBADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision_tecnica <> p_revision_tecnica THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_APROBACION' USING ERRCODE = 'P0001';
  END IF;
  -- Tipo y tarifa no cambian de estado mientras se aprueba.
  PERFORM 1 FROM tipo_estructura WHERE organizacion_id = p_org AND id = v.tipo_id FOR SHARE;
  PERFORM 1 FROM tarifa_mano_obra WHERE organizacion_id = p_org AND id = v.tarifa_id FOR SHARE;
  SELECT string_agg(codigo, ',') INTO v_problemas FROM softarq_problemas_concepto(p_org, v.id);
  IF v_problemas IS NOT NULL THEN
    RAISE EXCEPTION 'SOFTARQ:REQUISITOS_INCOMPLETOS: %', v_problemas USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'concepto', v.id, p_expira);
  UPDATE concepto SET estado = 'Aprobado', aprobado_por = p_usuario, aprobado_en = now(), revision = revision + 1 WHERE id = v.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'concepto', v.id, 'CONCEPTO_APROBADO', p_usuario,
          jsonb_build_object('revisionTecnica', v.revision_tecnica, 'creadoPor', v.creado_por, 'cambioTecnicoPor', v.cambio_tecnico_por));
  RETURN v.id;
END $$;

-- Aprobación de la carga base (sin persona). Solo organizaciones DEMO, conceptos creados por la carga
-- (sin autor) en esta misma transacción, nunca heredados y con todos los requisitos.
CREATE FUNCTION "softarq_aprobar_carga_base"(p_org UUID, p_codigo TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v concepto%ROWTYPE;
  v_xmin TEXT;
  v_problemas TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizacion WHERE id = p_org AND es_demo) THEN
    RAISE EXCEPTION 'SOFTARQ:APROBACION_DIRECTA: la carga base solo aprueba en organizaciones DEMO.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v FROM concepto WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT xmin::TEXT INTO v_xmin FROM concepto WHERE id = v.id;
  IF v.creado_por IS NOT NULL OR v.heredado OR v.estado <> 'Borrador'
     OR v_xmin <> (pg_current_xact_id()::TEXT::BIGINT % 4294967296)::TEXT THEN
    RAISE EXCEPTION 'SOFTARQ:APROBACION_DIRECTA: la carga base solo aprueba los conceptos que acaba de crear.' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(codigo, ',') INTO v_problemas FROM softarq_problemas_concepto(p_org, v.id);
  IF v_problemas IS NOT NULL THEN
    RAISE EXCEPTION 'SOFTARQ:REQUISITOS_INCOMPLETOS: %', v_problemas USING ERRCODE = 'P0001';
  END IF;
  UPDATE concepto SET estado = 'Aprobado', aprobado_en = now(), revision = revision + 1 WHERE id = v.id;
END $$;

REVOKE ALL ON FUNCTION "softarq_aprobar_concepto"(UUID, UUID, TEXT, INTEGER, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_aprobar_carga_base"(UUID, TEXT) FROM PUBLIC;
