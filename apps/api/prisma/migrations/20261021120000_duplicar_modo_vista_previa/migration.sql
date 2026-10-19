-- ---------------------------------------------------------------------------
-- Módulo 15 (ADR-0019): duplicar cotización (B-35), modo de precios de una versión nueva (B-34)
-- y vista previa PDF marcada BORRADOR (B-25). Fuentes: `modHistorial.bas` (`His_Duplicar`,
-- `His_NuevaVersion`, `Ver_CopiarContenido`), `modPdf.bas` (`BTN_VistaPrevia`, `Pdf_Generar`) y
-- Word maestro v1.3 §3.8, §3.9 y §3.13.
--
-- - Duplicar: la cotización nueva registra su origen (cotización y versión, o revisión del
--   borrador guardado). La captura la arma el servidor desde el origen; aquí solo se comprueba que
--   el origen siga siendo el mismo (revisión del borrador) y se reserva un folio nuevo.
-- - Modo de precios: «ciclo» de nueva versión en el borrador. Tras una emisión, guardar o calcular
--   exige preparar antes el ciclo (modo y motivo); la versión creada copia modo y origen.
-- - Vista previa: auditoría VISTA_PREVIA idempotente. No crea emisión ni archivo, no consume folio
--   y no cambia estados ni versiones.
-- Sin funciones DEFINER ni permisos nuevos fuera de las columnas del ciclo y EXECUTE de las
-- funciones (bloque condicional de permisos-app.sql).
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "cotizacion" ADD COLUMN     "duplicada_de_id" UUID,
ADD COLUMN     "duplicada_de_version" INTEGER,
ADD COLUMN     "duplicada_de_revision" INTEGER;

-- AlterTable
ALTER TABLE "cotizacion_borrador" ADD COLUMN     "ciclo_version_origen" INTEGER,
ADD COLUMN     "ciclo_modo_precios" VARCHAR(20),
ADD COLUMN     "ciclo_motivo" VARCHAR(500),
ADD COLUMN     "ciclo_preparado_por" UUID,
ADD COLUMN     "ciclo_preparado_en" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "cotizacion_version" ADD COLUMN     "modo_precios" VARCHAR(20),
ADD COLUMN     "version_origen" INTEGER;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_duplicada_de_fk" FOREIGN KEY ("organizacion_id", "duplicada_de_id") REFERENCES "cotizacion"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion_borrador" ADD CONSTRAINT "cotizacion_borrador_ciclo_preparado_por_fk" FOREIGN KEY ("organizacion_id", "ciclo_preparado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Parte 2 (a mano): CHECK, idempotencia y funciones.
-- ---------------------------------------------------------------------------

ALTER TABLE "cotizacion"
  ADD CONSTRAINT "cotizacion_duplicada_de_ck" CHECK (
    ("duplicada_de_id" IS NULL AND "duplicada_de_version" IS NULL AND "duplicada_de_revision" IS NULL)
    OR ("duplicada_de_id" IS NOT NULL AND "duplicada_de_id" <> "id"
        AND (("duplicada_de_version" IS NOT NULL AND "duplicada_de_version" >= 1 AND "duplicada_de_revision" IS NULL)
          OR ("duplicada_de_version" IS NULL AND "duplicada_de_revision" IS NOT NULL AND "duplicada_de_revision" >= 0)))
  );

ALTER TABLE "cotizacion_borrador"
  ADD CONSTRAINT "cotizacion_borrador_ciclo_ck" CHECK (
    ("ciclo_version_origen" IS NULL AND "ciclo_modo_precios" IS NULL AND "ciclo_motivo" IS NULL
      AND "ciclo_preparado_por" IS NULL AND "ciclo_preparado_en" IS NULL)
    OR ("ciclo_version_origen" >= 1 AND "ciclo_modo_precios" IN ('CONSERVAR', 'ELEGIR_DE_NUEVO')
      AND char_length(btrim("ciclo_motivo")) >= 10
      AND "ciclo_preparado_por" IS NOT NULL AND "ciclo_preparado_en" IS NOT NULL)
  );

ALTER TABLE "cotizacion_version"
  ADD CONSTRAINT "cotizacion_version_modo_ck" CHECK (
    ("modo_precios" IS NULL AND "version_origen" IS NULL)
    OR ("modo_precios" IN ('CONSERVAR', 'ELEGIR_DE_NUEVO') AND "version_origen" >= 1 AND "version_origen" < "numero")
  );

ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_recurso_ck"
  CHECK ("recurso_tipo" IN ('cliente','proyecto','cotizacion','version','revision','emision','respuesta','excepcion','proveedor',
    'producto','precio','tarifa','concepto','tipo_estructura','insumo','conversion','componente','persona',
    'nueva_version','vista_previa'));

-- Número de la última versión emitida de una cotización (0 si no hay emisiones). Auxiliar interna.
CREATE FUNCTION "softarq_ultima_emitida"(p_org UUID, p_cotizacion UUID) RETURNS INTEGER
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(max(e.version_numero), 0) FROM emision e WHERE e.organizacion_id = p_org AND e.cotizacion_id = p_cotizacion;
$$;

-- ¿Hace falta preparar la nueva versión (B-34)? Sí cuando la última versión está emitida y el ciclo
-- del borrador no corresponde a esa emisión. Antes de la primera emisión, nunca.
CREATE FUNCTION "softarq_requiere_nueva_version"(p_org UUID, p_cotizacion UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.n > 0 AND e.n = q.ultima_version AND b.ciclo_version_origen IS DISTINCT FROM e.n
    FROM cotizacion q
    JOIN cotizacion_borrador b ON b.organizacion_id = q.organizacion_id AND b.cotizacion_id = q.id
    CROSS JOIN LATERAL (SELECT softarq_ultima_emitida(p_org, p_cotizacion) AS n) e
   WHERE q.organizacion_id = p_org AND q.id = p_cotizacion;
$$;

-- B-35: cotización nueva desde una versión concreta o desde el borrador guardado (revisión
-- esperada). Folio nuevo del contador WEB DEMO, borrador en revisión 0, origen registrado.
CREATE FUNCTION "softarq_duplicar_cotizacion"(
  p_org UUID, p_usuario UUID, p_origen UUID, p_origen_version INTEGER, p_origen_revision INTEGER,
  p_proyecto UUID, p_anio INTEGER, p_captura JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
  v_folio TEXT;
  v_origen_folio TEXT;
  v_cliente UUID;
  v_pry_activo BOOLEAN;
  v_cli_activo BOOLEAN;
BEGIN
  IF (p_origen_version IS NULL) = (p_origen_revision IS NULL) THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'cotizacion', v_id, p_expira);
  SELECT q.folio INTO v_origen_folio FROM cotizacion q WHERE q.id = p_origen AND q.organizacion_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF p_origen_version IS NOT NULL THEN
    PERFORM 1 FROM cotizacion_version v
     WHERE v.organizacion_id = p_org AND v.cotizacion_id = p_origen AND v.numero = p_origen_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    PERFORM 1 FROM cotizacion_borrador b
     WHERE b.organizacion_id = p_org AND b.cotizacion_id = p_origen AND b.revision = p_origen_revision
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOFTARQ:BORRADOR_DESACTUALIZADO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT p.cliente_id, p.activo, c.activo INTO v_cliente, v_pry_activo, v_cli_activo
    FROM proyecto p
    JOIN cliente c ON c.organizacion_id = p.organizacion_id AND c.id = p.cliente_id
   WHERE p.id = p_proyecto AND p.organizacion_id = p_org
     FOR SHARE OF p, c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_cli_activo THEN
    RAISE EXCEPTION 'SOFTARQ:CLIENTE_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_pry_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROYECTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  v_n := softarq_siguiente(p_org, 'COT-' || p_anio::TEXT);
  v_folio := 'COT-' || p_anio::TEXT || '-' || lpad(v_n::TEXT, 5, '0');
  INSERT INTO cotizacion (id, organizacion_id, folio, anio_folio, origen, cliente_id, proyecto_id, creado_por,
                          duplicada_de_id, duplicada_de_version, duplicada_de_revision)
  VALUES (v_id, p_org, v_folio, p_anio, 'WEB_DEMO', v_cliente, p_proyecto, p_usuario,
          p_origen, p_origen_version, p_origen_revision);
  INSERT INTO cotizacion_borrador (cotizacion_id, organizacion_id, captura, revision, actualizado_por)
  VALUES (v_id, p_org, p_captura, 0, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', v_id, 'COTIZACION_DUPLICADA', p_usuario,
          jsonb_strip_nulls(jsonb_build_object('folio', v_folio, 'origenId', p_origen, 'origenFolio', v_origen_folio,
            'origenVersion', p_origen_version, 'origenRevision', p_origen_revision)));
  RETURN v_id;
END;
$$;

-- B-34: prepara el ciclo de la versión nueva tras una emisión. Solo cambia las selecciones de
-- precio de la captura (las que decidió el servidor según el modo) y registra modo, motivo y origen.
CREATE FUNCTION "softarq_preparar_nueva_version"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_revision INTEGER, p_version_origen INTEGER,
  p_modo TEXT, p_motivo TEXT, p_seleccion JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_rev INTEGER;
  v_ultima INTEGER;
  v_emitida INTEGER;
  v_ciclo INTEGER;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'nueva_version', p_cotizacion, p_expira);
  SELECT b.ciclo_version_origen INTO v_ciclo FROM cotizacion_borrador b
   WHERE b.cotizacion_id = p_cotizacion AND b.organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT q.ultima_version INTO v_ultima FROM cotizacion q WHERE q.id = p_cotizacion AND q.organizacion_id = p_org;
  IF EXISTS (SELECT 1 FROM cotizacion q WHERE q.id = p_cotizacion AND q.organizacion_id = p_org AND q.estado_folio <> 'ACTIVO') THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision r WHERE r.organizacion_id = p_org AND r.cotizacion_id = p_cotizacion AND r.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;
  v_emitida := softarq_ultima_emitida(p_org, p_cotizacion);
  IF v_emitida = 0 OR v_emitida <> v_ultima OR v_emitida <> p_version_origen OR v_ciclo IS NOT DISTINCT FROM v_emitida THEN
    RAISE EXCEPTION 'SOFTARQ:NUEVA_VERSION_NO_APLICA' USING ERRCODE = 'P0001';
  END IF;
  IF p_modo NOT IN ('CONSERVAR', 'ELEGIR_DE_NUEVO') OR jsonb_typeof(p_seleccion) <> 'array' THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  UPDATE cotizacion_borrador
     SET captura = jsonb_set(captura, '{seleccion}', p_seleccion), revision = revision + 1,
         actualizado_por = p_usuario, actualizado_en = now(),
         ciclo_version_origen = p_version_origen, ciclo_modo_precios = p_modo, ciclo_motivo = btrim(p_motivo),
         ciclo_preparado_por = p_usuario, ciclo_preparado_en = now()
   WHERE cotizacion_id = p_cotizacion AND organizacion_id = p_org AND revision = p_revision
  RETURNING revision INTO v_rev;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'NUEVA_VERSION_PREPARADA', p_usuario,
          jsonb_build_object('versionOrigen', p_version_origen, 'modo', p_modo, 'motivo', btrim(p_motivo), 'revision', v_rev));
  RETURN v_rev;
END;
$$;

-- B-25: auditoría de una vista previa generada (sin archivo ni cambios de estado). La misma clave
-- no registra dos eventos.
CREATE FUNCTION "softarq_registrar_vista_previa"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_version UUID,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_numero INTEGER;
BEGIN
  SELECT v.numero INTO v_numero FROM cotizacion_version v
   WHERE v.id = p_version AND v.cotizacion_id = p_cotizacion AND v.organizacion_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'vista_previa', p_version, p_expira);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'VISTA_PREVIA', p_usuario,
          jsonb_build_object('numero', v_numero, 'versionId', p_version));
END;
$$;

-- Misma firma y comprobaciones que en 20261003200000_emision; añade el requisito del ciclo (B-34).
CREATE OR REPLACE FUNCTION "softarq_guardar_borrador"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_revision INTEGER, p_captura JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_rev INTEGER;
BEGIN
  PERFORM 1 FROM cotizacion_borrador WHERE cotizacion_id = p_cotizacion AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM cotizacion q WHERE q.id = p_cotizacion AND q.organizacion_id = p_org AND q.estado_folio <> 'ACTIVO') THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision r WHERE r.organizacion_id = p_org AND r.cotizacion_id = p_cotizacion AND r.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;
  IF softarq_requiere_nueva_version(p_org, p_cotizacion) THEN
    RAISE EXCEPTION 'SOFTARQ:NUEVA_VERSION_SIN_PREPARAR' USING ERRCODE = 'P0001';
  END IF;
  UPDATE cotizacion_borrador
     SET captura = p_captura, revision = revision + 1, actualizado_por = p_usuario, actualizado_en = now()
   WHERE cotizacion_id = p_cotizacion AND organizacion_id = p_org AND revision = p_revision
  RETURNING revision INTO v_rev;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'BORRADOR_GUARDADO', p_usuario, jsonb_build_object('revision', v_rev));
  RETURN v_rev;
END;
$$;

-- Misma firma y comprobaciones que en 20261020120000_salidas_internas; añade el requisito del
-- ciclo (B-34) y copia su modo y origen a la versión (y su motivo, si no se envía otro).
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
  v_ciclo INTEGER;
  v_modo TEXT;
  v_motivo TEXT;
  v_emitida INTEGER;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'version', v_id, p_expira);
  SELECT b.revision, b.ciclo_version_origen, b.ciclo_modo_precios, b.ciclo_motivo
    INTO v_rev, v_ciclo, v_modo, v_motivo
    FROM cotizacion_borrador b
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
  IF softarq_requiere_nueva_version(p_org, p_cotizacion) THEN
    RAISE EXCEPTION 'SOFTARQ:NUEVA_VERSION_SIN_PREPARAR' USING ERRCODE = 'P0001';
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
  v_emitida := softarq_ultima_emitida(p_org, p_cotizacion);
  UPDATE cotizacion q SET ultima_version = q.ultima_version + 1
   WHERE q.id = p_cotizacion AND q.organizacion_id = p_org
  RETURNING q.ultima_version INTO v_num;
  IF v_num - 1 <> p_numero_anterior THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_CONCURRENTE' USING ERRCODE = 'P0001';
  END IF;
  -- Ciclo vigente: corresponde a la última emisión (las versiones del ciclo se crean después de ella).
  IF v_ciclo IS NULL OR v_ciclo <> v_emitida THEN
    v_ciclo := NULL;
    v_modo := NULL;
    v_motivo := NULL;
  END IF;
  INSERT INTO cotizacion_version (
    id, organizacion_id, cotizacion_id, numero, revision_borrador,
    captura, solicitud_calculo, entrada_calculo, resultado_interno, proyeccion_comercial, avisos,
    total, fecha_calculo, version_motor, huella_calculo, huella_referencia,
    cliente_codigo, cliente_nombre, proyecto_codigo, proyecto_nombre, proyecto_ubicacion, proyecto_descripcion,
    autor_id, autor_nombre, motivo, resumen_cambios, referencias_internas, modo_precios, version_origen
  ) VALUES (
    v_id, p_org, p_cotizacion, v_num, p_revision,
    p_datos->'captura', p_datos->'solicitudCalculo', p_datos->'entradaCalculo', p_datos->'resultadoInterno',
    p_datos->'proyeccionComercial', p_datos->'avisos',
    (p_datos->>'total')::NUMERIC(18, 2), (p_datos->>'fechaCalculo')::DATE, p_datos->>'versionMotor',
    decode(p_datos->>'huellaCalculo', 'hex'), decode(p_datos->>'huellaReferencia', 'hex'),
    p_datos->>'clienteCodigo', p_datos->>'clienteNombre', p_datos->>'proyectoCodigo', p_datos->>'proyectoNombre',
    p_datos->>'proyectoUbicacion', p_datos->>'proyectoDescripcion',
    p_usuario, p_datos->>'autorNombre',
    coalesce(p_datos->>'motivo', CASE WHEN v_ciclo IS NOT NULL AND v_num - 1 = v_ciclo THEN v_motivo END),
    p_datos->'resumenCambios',
    NULLIF(p_datos->'referenciasInternas', 'null'::jsonb), v_modo, v_ciclo
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'VERSION_CREADA', p_usuario,
          jsonb_strip_nulls(jsonb_build_object('numero', v_num, 'revisionBorrador', p_revision, 'modoPrecios', v_modo, 'versionOrigen', v_ciclo)));
  RETURN QUERY SELECT v_id, v_num;
END;
$$;
