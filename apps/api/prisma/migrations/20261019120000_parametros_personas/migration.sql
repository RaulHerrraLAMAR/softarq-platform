-- ---------------------------------------------------------------------------
-- Módulo 13 (ADR-0017): parámetros y personas. Parte 1 generada con `prisma migrate diff`.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "membresia" ADD COLUMN     "modificada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificada_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "parametros_calculo" ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "texto_alcance" VARCHAR(2000),
ADD COLUMN     "texto_condiciones" VARCHAR(2000),
ADD COLUMN     "texto_exclusiones" VARCHAR(2000);

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "contrasena_temporal_expira_en" TIMESTAMPTZ(3);

-- AddForeignKey
ALTER TABLE "parametros_calculo" ADD CONSTRAINT "parametros_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_modificada_por_fk" FOREIGN KEY ("organizacion_id", "modificada_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Parte 2 (a mano). Módulo 13 (ADR-0017): parámetros (B-38) y personas (B-39).
-- Fuentes: modConfig.bas (BTN_Parametros, Param_Guardar, Cfg_AyudaTipo, BTN_Personas,
-- Persona_Guardar) y tblParametros / tblPersonas.
-- ---------------------------------------------------------------------------

-- Plantillas de textos: la organización DEMO conserva EXACTAMENTE los textos DEMO que hasta ahora
-- eran constantes del código (`TEXTOS_DEMO`); en PRODUCCION siguen pendientes (NULL).
UPDATE parametros_calculo SET
  texto_alcance = '[DEMO] Texto ilustrativo de alcance: ejecución de los conceptos listados según las mediciones indicadas en esta cotización.',
  texto_condiciones = '[DEMO] Condiciones ilustrativas: precios en MXN, vigentes hasta la fecha indicada; sujetos a la aceptación del cliente.',
  texto_exclusiones = '[DEMO] Exclusiones ilustrativas: cálculo estructural, planos, permisos y cualquier concepto no listado.'
WHERE ambiente = 'DEMO';

ALTER TABLE "parametros_calculo"
  ADD CONSTRAINT "parametros_textos_ck" CHECK (
    ("texto_alcance" IS NULL AND "texto_condiciones" IS NULL AND "texto_exclusiones" IS NULL)
    OR (length(btrim("texto_alcance")) > 0 AND length(btrim("texto_condiciones")) > 0 AND length(btrim("texto_exclusiones")) > 0)),
  ADD CONSTRAINT "parametros_impuesto_textos_ck" CHECK (
    ("impuesto_tratamiento" IS NULL OR length(btrim("impuesto_tratamiento")) > 0)
    AND ("impuesto_nombre" IS NULL OR length(btrim("impuesto_nombre")) > 0));

ALTER TABLE "bitacora" DROP CONSTRAINT "bitacora_entidad_ck";
ALTER TABLE "bitacora"
  ADD CONSTRAINT "bitacora_entidad_ck" CHECK ("entidad" IN ('cliente', 'proyecto', 'cotizacion', 'emisor', 'proveedor', 'producto',
    'precio', 'tarifa', 'concepto', 'tipo_estructura', 'insumo', 'conversion', 'componente', 'parametros', 'persona'));

ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_recurso_ck"
  CHECK ("recurso_tipo" IN ('cliente','proyecto','cotizacion','version','revision','emision','respuesta','excepcion','proveedor',
    'producto','precio','tarifa','concepto','tipo_estructura','insumo','conversion','componente','persona'));

-- ---------------------------------------------------------------------------
-- Regla del último Administrador del sistema: la organización conserva al menos una pertenencia
-- activa con ADMIN_SISTEMA de un usuario activo. Las funciones la comprueban tras bloquear la fila
-- de la organización (serializa los cambios concurrentes); este disparador la vuelve a exigir en
-- cualquier UPDATE de `membresia` (también del migrador).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "membresia_ultimo_administrador"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.activa AND 'ADMIN_SISTEMA' = ANY (OLD.funciones)
     AND NOT (NEW.activa AND 'ADMIN_SISTEMA' = ANY (NEW.funciones)) THEN
    PERFORM 1 FROM organizacion WHERE id = NEW.organizacion_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM membresia m JOIN usuario u ON u.id = m.usuario_id
                    WHERE m.organizacion_id = NEW.organizacion_id AND m.activa AND u.activo AND 'ADMIN_SISTEMA' = ANY (m.funciones)) THEN
      RAISE EXCEPTION 'SOFTARQ:ULTIMO_ADMINISTRADOR' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "membresia_ultimo_administrador_trg" AFTER UPDATE OF "funciones", "activa" ON "membresia"
FOR EACH ROW EXECUTE FUNCTION "membresia_ultimo_administrador"();

-- ---------------------------------------------------------------------------
-- Parámetros (B-38): SECURITY INVOKER con columnas mínimas. Ambiente y moneda no se editan.
-- p_cambios: recargoSobreCosto, impuesto (objeto con tasa, base, tratamiento y nombre, o null),
-- vigenciaDias, textos (objeto con alcance, condiciones y exclusiones, o null).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "softarq_editar_parametros"(
  p_org UUID, p_usuario UUID, p_revision INTEGER, p_cambios JSONB, p_motivo TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v parametros_calculo%ROWTYPE;
  n parametros_calculo%ROWTYPE;
  v_detalle JSONB := '{}'::JSONB;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_SISTEMA');
  SELECT * INTO v FROM parametros_calculo WHERE organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'recargoSobreCosto' THEN n.recargo_sobre_costo := (p_cambios->>'recargoSobreCosto')::NUMERIC; END IF;
  IF p_cambios ? 'vigenciaDias' THEN n.vigencia_dias := (p_cambios->>'vigenciaDias')::INTEGER; END IF;
  IF p_cambios ? 'impuesto' THEN
    n.impuesto_tasa := (p_cambios->'impuesto'->>'tasa')::NUMERIC;
    n.impuesto_base := p_cambios->'impuesto'->>'base';
    n.impuesto_tratamiento := p_cambios->'impuesto'->>'tratamiento';
    n.impuesto_nombre := p_cambios->'impuesto'->>'nombre';
  END IF;
  IF p_cambios ? 'textos' THEN
    n.texto_alcance := p_cambios->'textos'->>'alcance';
    n.texto_condiciones := p_cambios->'textos'->>'condiciones';
    n.texto_exclusiones := p_cambios->'textos'->>'exclusiones';
  END IF;
  IF n.recargo_sobre_costo IS DISTINCT FROM v.recargo_sobre_costo THEN
    v_detalle := v_detalle || jsonb_build_object('recargoSobreCosto', jsonb_build_object('anterior', v.recargo_sobre_costo::TEXT, 'nuevo', n.recargo_sobre_costo::TEXT));
  END IF;
  IF n.vigencia_dias IS DISTINCT FROM v.vigencia_dias THEN
    v_detalle := v_detalle || jsonb_build_object('vigenciaDias', jsonb_build_object('anterior', v.vigencia_dias, 'nuevo', n.vigencia_dias));
  END IF;
  IF (n.impuesto_tasa, n.impuesto_base, n.impuesto_tratamiento, n.impuesto_nombre)
     IS DISTINCT FROM (v.impuesto_tasa, v.impuesto_base, v.impuesto_tratamiento, v.impuesto_nombre) THEN
    v_detalle := v_detalle || jsonb_build_object('impuesto', jsonb_build_object(
      'anterior', CASE WHEN v.impuesto_tasa IS NULL THEN NULL ELSE jsonb_build_object('tasa', v.impuesto_tasa::TEXT, 'base', v.impuesto_base, 'tratamiento', v.impuesto_tratamiento, 'nombre', v.impuesto_nombre) END,
      'nuevo', CASE WHEN n.impuesto_tasa IS NULL THEN NULL ELSE jsonb_build_object('tasa', n.impuesto_tasa::TEXT, 'base', n.impuesto_base, 'tratamiento', n.impuesto_tratamiento, 'nombre', n.impuesto_nombre) END));
  END IF;
  IF (n.texto_alcance, n.texto_condiciones, n.texto_exclusiones) IS DISTINCT FROM (v.texto_alcance, v.texto_condiciones, v.texto_exclusiones) THEN
    v_detalle := v_detalle || jsonb_build_object('textos', jsonb_build_object(
      'anterior', CASE WHEN v.texto_alcance IS NULL THEN NULL ELSE jsonb_build_object('alcance', v.texto_alcance, 'condiciones', v.texto_condiciones, 'exclusiones', v.texto_exclusiones) END,
      'nuevo', CASE WHEN n.texto_alcance IS NULL THEN NULL ELSE jsonb_build_object('alcance', n.texto_alcance, 'condiciones', n.texto_condiciones, 'exclusiones', n.texto_exclusiones) END));
  END IF;
  IF v_detalle = '{}'::JSONB THEN
    RETURN v.revision;
  END IF;
  UPDATE parametros_calculo
     SET recargo_sobre_costo = n.recargo_sobre_costo, vigencia_dias = n.vigencia_dias,
         impuesto_tasa = n.impuesto_tasa, impuesto_base = n.impuesto_base, impuesto_tratamiento = n.impuesto_tratamiento,
         impuesto_nombre = n.impuesto_nombre, texto_alcance = n.texto_alcance, texto_condiciones = n.texto_condiciones,
         texto_exclusiones = n.texto_exclusiones, revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE organizacion_id = p_org;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'parametros', p_org, 'PARAMETROS_EDITADOS', p_usuario, jsonb_build_object('cambios', v_detalle, 'motivo', p_motivo));
  RETURN v.revision + 1;
END $$;

-- ---------------------------------------------------------------------------
-- Personas (B-39). SECURITY DEFINER (propietario: rol migrador; search_path fijo): la aplicación no
-- escribe `usuario` ni `membresia` directamente. Todas exigen ADMIN_SISTEMA activo en la
-- organización, bloquean la fila de la organización y registran la bitácora SIN credenciales. El
-- hash Argon2id lo calcula la API; aquí solo se guarda.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "softarq_validar_funciones"(p_funciones TEXT[]) RETURNS TEXT[]
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v TEXT[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT f ORDER BY f), ARRAY[]::TEXT[]) INTO v FROM unnest(p_funciones) f;
  IF cardinality(v) = 0 THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO: asigne al menos una función.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v <@ ARRAY['PREPARADOR', 'REVISOR', 'ADMIN_CATALOGO', 'ADMIN_SISTEMA'] THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO: función desconocida.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END $$;

CREATE FUNCTION "softarq_hay_administrador"(p_org UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM membresia m JOIN usuario u ON u.id = m.usuario_id
                  WHERE m.organizacion_id = p_org AND m.activa AND u.activo AND 'ADMIN_SISTEMA' = ANY (m.funciones))
$$;

-- Alta: usuario nuevo (correo único global) y su pertenencia. Un correo ya registrado responde
-- CORREO_EXISTENTE sin revelar a qué organización pertenece.
CREATE FUNCTION "softarq_crear_persona"(
  p_org UUID, p_admin UUID, p_datos JSONB, p_hash TEXT, p_temporal_expira TIMESTAMPTZ,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_correo TEXT := lower(btrim(p_datos->>'correo'));
  v_funciones TEXT[];
  v_demo BOOLEAN;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_SISTEMA');
  SELECT es_demo INTO v_demo FROM organizacion WHERE id = p_org FOR UPDATE;
  v_funciones := softarq_validar_funciones(ARRAY(SELECT jsonb_array_elements_text(p_datos->'funciones')));
  IF EXISTS (SELECT 1 FROM usuario WHERE correo = v_correo) THEN
    RAISE EXCEPTION 'SOFTARQ:CORREO_EXISTENTE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_admin, p_clave, p_operacion, p_huella, 'persona', v_id, p_expira);
  INSERT INTO usuario (id, correo, nombre, hash_contrasena, es_demo, contrasena_temporal_expira_en)
  VALUES (v_id, v_correo, btrim(p_datos->>'nombre'), p_hash, v_demo, p_temporal_expira);
  INSERT INTO membresia (organizacion_id, usuario_id, funciones, modificada_por)
  VALUES (p_org, v_id, v_funciones, p_admin);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'persona', v_id, 'PERSONA_CREADA', p_admin,
          jsonb_build_object('funciones', to_jsonb(v_funciones), 'motivo', p_datos->>'motivo', 'temporalExpiraEn', p_temporal_expira));
  RETURN v_id;
END $$;

-- p_cambios: nombre, funciones, activa. Nadie se retira su propia función ADMIN_SISTEMA ni desactiva
-- su propia pertenencia; la organización conserva siempre un Administrador del sistema activo.
CREATE FUNCTION "softarq_editar_persona"(
  p_org UUID, p_admin UUID, p_usuario UUID, p_revision INTEGER, p_cambios JSONB, p_motivo TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m membresia%ROWTYPE;
  v_nombre TEXT;
  n_nombre TEXT;
  n_funciones TEXT[];
  n_activa BOOLEAN;
  v_revocadas INTEGER := 0;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_SISTEMA');
  PERFORM 1 FROM organizacion WHERE id = p_org FOR UPDATE;
  SELECT * INTO m FROM membresia WHERE organizacion_id = p_org AND usuario_id = p_usuario FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF m.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  SELECT nombre INTO v_nombre FROM usuario WHERE id = p_usuario FOR UPDATE;
  n_nombre := coalesce(btrim(p_cambios->>'nombre'), v_nombre);
  n_funciones := CASE WHEN p_cambios ? 'funciones'
                      THEN softarq_validar_funciones(ARRAY(SELECT jsonb_array_elements_text(p_cambios->'funciones')))
                      ELSE m.funciones::TEXT[] END;
  n_activa := coalesce((p_cambios->>'activa')::BOOLEAN, m.activa);
  IF p_usuario = p_admin AND (NOT n_activa OR NOT ('ADMIN_SISTEMA' = ANY (n_funciones))) THEN
    RAISE EXCEPTION 'SOFTARQ:AUTOPROTECCION' USING ERRCODE = 'P0001';
  END IF;
  IF n_nombre = v_nombre AND n_funciones = (SELECT array_agg(f::TEXT ORDER BY f) FROM unnest(m.funciones) f) AND n_activa = m.activa THEN
    RETURN m.revision;
  END IF;
  IF n_nombre <> v_nombre THEN
    UPDATE usuario SET nombre = n_nombre WHERE id = p_usuario;
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'persona', p_usuario, 'PERSONA_EDITADA', p_admin, jsonb_build_object('campos', jsonb_build_array('nombre'), 'motivo', p_motivo));
  END IF;
  UPDATE membresia SET funciones = n_funciones, activa = n_activa, revision = revision + 1, modificada_por = p_admin, modificada_en = now()
   WHERE id = m.id;
  IF n_funciones <> (SELECT array_agg(f::TEXT ORDER BY f) FROM unnest(m.funciones) f) THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'persona', p_usuario, 'PERSONA_FUNCIONES', p_admin,
            jsonb_build_object('anteriores', to_jsonb(m.funciones), 'nuevas', to_jsonb(n_funciones), 'motivo', p_motivo));
  END IF;
  IF n_activa <> m.activa THEN
    IF NOT n_activa THEN
      UPDATE sesion SET revocada_en = now(), motivo_revocacion = 'DESACTIVADA'
       WHERE organizacion_id = p_org AND usuario_id = p_usuario AND revocada_en IS NULL;
      GET DIAGNOSTICS v_revocadas = ROW_COUNT;
    END IF;
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'persona', p_usuario, CASE WHEN n_activa THEN 'PERSONA_REACTIVADA' ELSE 'PERSONA_DESACTIVADA' END, p_admin,
            jsonb_build_object('motivo', p_motivo, 'sesionesRevocadas', v_revocadas));
  END IF;
  IF NOT softarq_hay_administrador(p_org) THEN
    RAISE EXCEPTION 'SOFTARQ:ULTIMO_ADMINISTRADOR' USING ERRCODE = 'P0001';
  END IF;
  RETURN m.revision + 1;
END $$;

-- Restablecimiento por el Administrador: contraseña temporal nueva (invalida la anterior) y TODAS las
-- sesiones de la persona revocadas. No sobre la propia cuenta (para eso, el cambio propio).
CREATE FUNCTION "softarq_restablecer_contrasena"(
  p_org UUID, p_admin UUID, p_usuario UUID, p_hash TEXT, p_temporal_expira TIMESTAMPTZ, p_motivo TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_revocadas INTEGER;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_SISTEMA');
  PERFORM 1 FROM organizacion WHERE id = p_org FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM membresia WHERE organizacion_id = p_org AND usuario_id = p_usuario) THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF p_usuario = p_admin THEN
    RAISE EXCEPTION 'SOFTARQ:AUTOPROTECCION' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_admin, p_clave, p_operacion, p_huella, 'persona', p_usuario, p_expira);
  UPDATE usuario SET hash_contrasena = p_hash, contrasena_temporal_expira_en = p_temporal_expira, contrasena_cambiada_en = now()
   WHERE id = p_usuario;
  UPDATE sesion SET revocada_en = now(), motivo_revocacion = 'RESTABLECIMIENTO' WHERE usuario_id = p_usuario AND revocada_en IS NULL;
  GET DIAGNOSTICS v_revocadas = ROW_COUNT;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'persona', p_usuario, 'PERSONA_CONTRASENA_RESTABLECIDA', p_admin,
          jsonb_build_object('motivo', p_motivo, 'temporalExpiraEn', p_temporal_expira, 'sesionesRevocadas', v_revocadas));
  RETURN p_usuario;
END $$;

-- Cambio propio (la API ya verificó la contraseña actual): contraseña definitiva y TODAS las sesiones
-- de la persona revocadas, incluida la actual; hay que volver a entrar.
CREATE FUNCTION "softarq_cambiar_contrasena_propia"(p_org UUID, p_usuario UUID, p_hash TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_revocadas INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM membresia m JOIN usuario u ON u.id = m.usuario_id
                  WHERE m.organizacion_id = p_org AND m.usuario_id = p_usuario AND m.activa AND u.activo) THEN
    RAISE EXCEPTION 'SOFTARQ:SIN_PERMISO' USING ERRCODE = 'P0001';
  END IF;
  UPDATE usuario SET hash_contrasena = p_hash, contrasena_temporal_expira_en = NULL, contrasena_cambiada_en = now() WHERE id = p_usuario;
  UPDATE sesion SET revocada_en = now(), motivo_revocacion = 'CAMBIO_CONTRASENA' WHERE usuario_id = p_usuario AND revocada_en IS NULL;
  GET DIAGNOSTICS v_revocadas = ROW_COUNT;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'persona', p_usuario, 'PERSONA_CONTRASENA_CAMBIADA', p_usuario, jsonb_build_object('sesionesRevocadas', v_revocadas));
END $$;

REVOKE ALL ON FUNCTION "membresia_ultimo_administrador"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_parametros"(UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_validar_funciones"(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_hay_administrador"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_persona"(UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_persona"(UUID, UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_restablecer_contrasena"(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cambiar_contrasena_propia"(UUID, UUID, TEXT) FROM PUBLIC;
