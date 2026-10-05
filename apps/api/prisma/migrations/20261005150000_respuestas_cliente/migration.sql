-- ADR-0013. Solo eventos nuevos: no se modifica cotizacion_version ni emision.
BEGIN;
CREATE TABLE respuesta_cliente_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id UUID NOT NULL, emision_id UUID NOT NULL,
  numero INTEGER NOT NULL, anterior_id UUID,
  tipo VARCHAR(12) NOT NULL, resultado VARCHAR(10) NOT NULL,
  fecha_respuesta DATE NOT NULL, nota VARCHAR(2000),
  registrado_por UUID NOT NULL, registrado_nombre VARCHAR(200) NOT NULL,
  registrado_en TIMESTAMPTZ(3) NOT NULL DEFAULT now(), fecha_registro DATE NOT NULL,
  motivo VARCHAR(500),
  CONSTRAINT respuesta_evento_org_emision_id_key UNIQUE(organizacion_id, emision_id, id),
  CONSTRAINT respuesta_evento_numero_key UNIQUE(organizacion_id, emision_id, numero),
  CONSTRAINT respuesta_evento_anterior_key UNIQUE(organizacion_id, emision_id, anterior_id),
  CONSTRAINT respuesta_evento_emision_fk FOREIGN KEY(organizacion_id, emision_id)
    REFERENCES emision(organizacion_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT respuesta_evento_autor_fk FOREIGN KEY(organizacion_id, registrado_por)
    REFERENCES membresia(organizacion_id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT respuesta_evento_anterior_fk FOREIGN KEY(organizacion_id, emision_id, anterior_id)
    REFERENCES respuesta_cliente_evento(organizacion_id, emision_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT respuesta_evento_resultado_ck CHECK(resultado IN ('ACEPTADA', 'RECHAZADA')),
  CONSTRAINT respuesta_evento_fecha_ck CHECK(fecha_respuesta <= fecha_registro),
  CONSTRAINT respuesta_evento_nombre_ck CHECK(length(btrim(registrado_nombre)) > 0),
  CONSTRAINT respuesta_evento_tipo_ck CHECK(
    (tipo = 'REGISTRADA' AND numero = 1 AND anterior_id IS NULL AND motivo IS NULL) OR
    (tipo = 'CORREGIDA' AND numero > 1 AND anterior_id IS NOT NULL AND motivo IS NOT NULL AND length(btrim(motivo)) BETWEEN 10 AND 500
      AND motivo ~ '[[:alpha:]]')
  )
);
CREATE UNIQUE INDEX respuesta_evento_inicial_key ON respuesta_cliente_evento(organizacion_id, emision_id) WHERE anterior_id IS NULL;

CREATE FUNCTION respuesta_cliente_inmutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'SOFTARQ:RESPUESTA_INMUTABLE: conserve el evento y registre una correccion.' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER respuesta_cliente_inmutable_trg BEFORE UPDATE OR DELETE ON respuesta_cliente_evento
FOR EACH ROW EXECUTE FUNCTION respuesta_cliente_inmutable();

-- El mismo bloqueo del módulo 8 serializa con una emisión posterior, sin UPDATE sobre emision.
CREATE FUNCTION respuesta_cliente_validar() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e emision%ROWTYPE; cabeza respuesta_cliente_evento%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(NEW.organizacion_id, NEW.registrado_por, 'PREPARADOR');
  SELECT * INTO e FROM emision WHERE organizacion_id = NEW.organizacion_id AND id = NEW.emision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM cotizacion_borrador WHERE organizacion_id = e.organizacion_id AND cotizacion_id = e.cotizacion_id FOR UPDATE;
  SELECT * INTO cabeza FROM respuesta_cliente_evento WHERE organizacion_id = NEW.organizacion_id AND emision_id = NEW.emision_id ORDER BY numero DESC LIMIT 1;
  IF NEW.anterior_id IS DISTINCT FROM cabeza.id OR NEW.numero <> coalesce(cabeza.numero, 0) + 1 THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_RESPUESTA' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.anterior_id IS NULL AND EXISTS(SELECT 1 FROM emision WHERE organizacion_id = e.organizacion_id AND cotizacion_id = e.cotizacion_id AND version_numero > e.version_numero) THEN
    RAISE EXCEPTION 'SOFTARQ:EMISION_SUSTITUIDA' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.fecha_respuesta < e.fecha_emision OR NEW.fecha_respuesta > NEW.fecha_registro THEN
    RAISE EXCEPTION 'SOFTARQ:FECHA_RESPUESTA_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.fecha_respuesta > e.vigente_hasta THEN
    RAISE EXCEPTION 'SOFTARQ:RESPUESTA_FUERA_VIGENCIA' USING ERRCODE = 'P0001';
  END IF;
  -- La persona es el miembro del equipo, jamás un cliente autenticado.
  SELECT nombre INTO NEW.registrado_nombre FROM usuario WHERE id = NEW.registrado_por;
  RETURN NEW;
END $$;
CREATE TRIGGER respuesta_cliente_validar_trg BEFORE INSERT ON respuesta_cliente_evento
FOR EACH ROW EXECUTE FUNCTION respuesta_cliente_validar();

ALTER TABLE idempotencia DROP CONSTRAINT idempotencia_recurso_ck;
ALTER TABLE idempotencia ADD CONSTRAINT idempotencia_recurso_ck CHECK(recurso_tipo IN ('cliente','proyecto','cotizacion','version','revision','emision','respuesta'));

CREATE FUNCTION softarq_registrar_respuesta(
  p_org UUID, p_usuario UUID, p_emision UUID, p_anterior UUID, p_datos JSONB,
  p_fecha DATE, p_instante TIMESTAMPTZ, p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID := gen_random_uuid(); e emision%ROWTYPE; v_numero INTEGER;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'PREPARADOR');
  IF p_operacion <> (CASE WHEN p_anterior IS NULL THEN 'registrar_respuesta' ELSE 'corregir_respuesta' END) THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_RESPUESTA' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org,p_usuario,p_clave,p_operacion,p_huella,'respuesta',v_id,p_expira);
  SELECT * INTO e FROM emision WHERE organizacion_id = p_org AND id = p_emision;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM cotizacion_borrador WHERE organizacion_id = p_org AND cotizacion_id = e.cotizacion_id FOR UPDATE;
  SELECT coalesce(max(numero),0)+1 INTO v_numero FROM respuesta_cliente_evento WHERE organizacion_id = p_org AND emision_id = p_emision;
  INSERT INTO respuesta_cliente_evento(id,organizacion_id,emision_id,numero,anterior_id,tipo,resultado,fecha_respuesta,nota,
    registrado_por,registrado_nombre,registrado_en,fecha_registro,motivo)
  VALUES(v_id,p_org,p_emision,v_numero,p_anterior,CASE WHEN p_anterior IS NULL THEN 'REGISTRADA' ELSE 'CORREGIDA' END,
    p_datos->>'resultado',(p_datos->>'fechaRespuesta')::date,nullif(p_datos->>'nota',''),p_usuario,'Pendiente',p_instante,p_fecha,
    nullif(p_datos->>'motivo',''));
  INSERT INTO bitacora(organizacion_id,entidad,entidad_id,tipo,usuario_id,detalle)
  VALUES(p_org,'cotizacion',e.cotizacion_id,CASE WHEN p_anterior IS NULL THEN 'RESPUESTA_REGISTRADA' ELSE 'RESPUESTA_CORREGIDA' END,
    p_usuario,jsonb_build_object('emisionId',p_emision,'versionId',e.version_id,'eventoId',v_id,'numero',v_numero));
  RETURN v_id;
END $$;
REVOKE ALL ON TABLE respuesta_cliente_evento FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE respuesta_cliente_evento TO softarq_app;
REVOKE ALL ON FUNCTION respuesta_cliente_inmutable(), respuesta_cliente_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION softarq_registrar_respuesta(UUID,UUID,UUID,UUID,JSONB,DATE,TIMESTAMPTZ,UUID,TEXT,BYTEA,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION softarq_registrar_respuesta(UUID,UUID,UUID,UUID,JSONB,DATE,TIMESTAMPTZ,UUID,TEXT,BYTEA,TIMESTAMPTZ) TO softarq_app;
-- softarq_respaldo recibe SELECT por los privilegios por defecto del migrador ya aprovisionados.
COMMIT;
