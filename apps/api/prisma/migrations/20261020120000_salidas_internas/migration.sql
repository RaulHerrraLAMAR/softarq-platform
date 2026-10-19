-- ---------------------------------------------------------------------------
-- Módulo 14 (ADR-0018): salidas internas de solo lectura (12 COMPRAS, 13 DETALLE_CALCULO e
-- indicadores de 14 REVISION).
--
-- La versión ya congela la entrada y el resultado internos del motor, pero solo con códigos. Para
-- mostrar compras y detalle sin releer el catálogo vigente, las versiones NUEVAS congelan además
-- los nombres y vigencias leídos en la misma instantánea del cálculo (fase A). Las versiones
-- anteriores quedan con NULL: no se rellenan ni se reconstruyen con el catálogo actual.
--
-- Columna aparte: entrada_calculo y la huella del cálculo (BL-16) no cambian de significado.
-- La inmutabilidad la siguen imponiendo el disparador cotizacion_version_inmutable_trg y la
-- ausencia de UPDATE para softarq_app. Sin funciones nuevas ni permisos nuevos.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "cotizacion_version" ADD COLUMN     "referencias_internas" JSONB;

ALTER TABLE "cotizacion_version"
  ADD CONSTRAINT "cotizacion_version_referencias_ck" CHECK (
    "referencias_internas" IS NULL OR jsonb_typeof("referencias_internas") = 'object'
  );

-- Misma firma, mismo SECURITY INVOKER y mismas comprobaciones que en 20261003200000_emision;
-- solo añade referencias_internas (NULL si la API no la envía).
CREATE OR REPLACE FUNCTION "softarq_crear_version"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_revision INTEGER, p_numero_anterior INTEGER,
  p_datos JSONB, p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS TABLE (id UUID, numero INTEGER)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_rev INTEGER;
  v_num INTEGER;
  v_pry_activo BOOLEAN;
  v_cli_activo BOOLEAN;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'version', v_id, p_expira);
  SELECT b.revision INTO v_rev FROM cotizacion_borrador b
   WHERE b.cotizacion_id = p_cotizacion AND b.organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM cotizacion q WHERE q.id = p_cotizacion AND q.organizacion_id = p_org AND q.estado_folio <> 'ACTIVO') THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision r WHERE r.organizacion_id = p_org AND r.cotizacion_id = p_cotizacion AND r.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;
  IF v_rev <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:BORRADOR_DESACTUALIZADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.activo, c.activo INTO v_pry_activo, v_cli_activo
    FROM cotizacion q
    JOIN proyecto p ON p.organizacion_id = q.organizacion_id AND p.id = q.proyecto_id
    JOIN cliente c ON c.organizacion_id = q.organizacion_id AND c.id = q.cliente_id
   WHERE q.id = p_cotizacion AND q.organizacion_id = p_org
     FOR SHARE OF p, c;
  IF NOT v_cli_activo THEN
    RAISE EXCEPTION 'SOFTARQ:CLIENTE_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_pry_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROYECTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  UPDATE cotizacion q SET ultima_version = q.ultima_version + 1
   WHERE q.id = p_cotizacion AND q.organizacion_id = p_org
  RETURNING q.ultima_version INTO v_num;
  IF v_num - 1 <> p_numero_anterior THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_CONCURRENTE' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO cotizacion_version (
    id, organizacion_id, cotizacion_id, numero, revision_borrador,
    captura, solicitud_calculo, entrada_calculo, resultado_interno, proyeccion_comercial, avisos,
    total, fecha_calculo, version_motor, huella_calculo, huella_referencia,
    cliente_codigo, cliente_nombre, proyecto_codigo, proyecto_nombre, proyecto_ubicacion, proyecto_descripcion,
    autor_id, autor_nombre, motivo, resumen_cambios, referencias_internas
  ) VALUES (
    v_id, p_org, p_cotizacion, v_num, p_revision,
    p_datos->'captura', p_datos->'solicitudCalculo', p_datos->'entradaCalculo', p_datos->'resultadoInterno',
    p_datos->'proyeccionComercial', p_datos->'avisos',
    (p_datos->>'total')::NUMERIC(18, 2), (p_datos->>'fechaCalculo')::DATE, p_datos->>'versionMotor',
    decode(p_datos->>'huellaCalculo', 'hex'), decode(p_datos->>'huellaReferencia', 'hex'),
    p_datos->>'clienteCodigo', p_datos->>'clienteNombre', p_datos->>'proyectoCodigo', p_datos->>'proyectoNombre',
    p_datos->>'proyectoUbicacion', p_datos->>'proyectoDescripcion',
    p_usuario, p_datos->>'autorNombre', p_datos->>'motivo', p_datos->'resumenCambios',
    NULLIF(p_datos->'referenciasInternas', 'null'::jsonb)
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'VERSION_CREADA', p_usuario,
          jsonb_build_object('numero', v_num, 'revisionBorrador', p_revision));
  RETURN QUERY SELECT v_id, v_num;
END;
$$;
