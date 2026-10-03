-- Módulo 7 (ADR-0009): revisión y aprobación de versiones por un revisor distinto del preparador.
-- Parte 1: SQL generado por Prisma (prisma migrate diff --from-migrations --to-schema --script,
-- con la base sombra; migrate dev --create-only no admite los avisos de índices únicos sin terminal).
-- Parte 2 (al final): CHECK, índice parcial, triggers, funciones atómicas y permisos (revisados a mano).

-- CreateTable
CREATE TABLE "revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "version_id" UUID NOT NULL,
    "version_numero" INTEGER NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "preparador_id" UUID NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "enviado_por" UUID NOT NULL,
    "enviado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_por" UUID,
    "resuelta_en" TIMESTAMPTZ(3),
    "observaciones" VARCHAR(2000),

    CONSTRAINT "revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_evento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "estado_anterior" VARCHAR(20),
    "estado_nuevo" VARCHAR(20) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "usuario_nombre" VARCHAR(200) NOT NULL,
    "observaciones" VARCHAR(2000),
    "avisos" JSONB NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revision_organizacion_id_estado_enviado_en_idx" ON "revision"("organizacion_id", "estado", "enviado_en");

-- CreateIndex
CREATE INDEX "revision_organizacion_id_cotizacion_id_idx" ON "revision"("organizacion_id", "cotizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "revision_organizacion_id_id_key" ON "revision"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "revision_evento_revision_id_secuencia_key" ON "revision_evento"("revision_id", "secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_organizacion_id_id_folio_key" ON "cotizacion"("organizacion_id", "id", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_version_organizacion_id_cotizacion_id_numero_id_key" ON "cotizacion_version"("organizacion_id", "cotizacion_id", "numero", "id");

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_organizacion_id_cotizacion_id_folio_fkey" FOREIGN KEY ("organizacion_id", "cotizacion_id", "folio") REFERENCES "cotizacion"("organizacion_id", "id", "folio") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_organizacion_id_cotizacion_id_version_numero_vers_fkey" FOREIGN KEY ("organizacion_id", "cotizacion_id", "version_numero", "version_id") REFERENCES "cotizacion_version"("organizacion_id", "cotizacion_id", "numero", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_organizacion_id_preparador_id_fkey" FOREIGN KEY ("organizacion_id", "preparador_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_organizacion_id_enviado_por_fkey" FOREIGN KEY ("organizacion_id", "enviado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_organizacion_id_resuelta_por_fkey" FOREIGN KEY ("organizacion_id", "resuelta_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revision_evento" ADD CONSTRAINT "revision_evento_organizacion_id_revision_id_fkey" FOREIGN KEY ("organizacion_id", "revision_id") REFERENCES "revision"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "revision_evento" ADD CONSTRAINT "revision_evento_organizacion_id_usuario_id_fkey" FOREIGN KEY ("organizacion_id", "usuario_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ===========================================================================
-- Parte 2 (revisada a mano): reglas de la revisión en la base.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Restricciones. Estados de una revisión (máquina por revisión y versión):
--   PENDIENTE → APROBADA | CAMBIOS_SOLICITADOS | RETIRADA   (las tres son terminales)
-- Un nuevo envío crea OTRA fila. BL-17 también como CHECK: quien aprueba no es el autor.
-- ---------------------------------------------------------------------------

ALTER TABLE "revision"
  ADD CONSTRAINT "revision_estado_ck" CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'CAMBIOS_SOLICITADOS', 'RETIRADA')),
  ADD CONSTRAINT "revision_revision_ck" CHECK ("revision" >= 0),
  ADD CONSTRAINT "revision_version_numero_ck" CHECK ("version_numero" >= 1),
  ADD CONSTRAINT "revision_folio_ck" CHECK ("folio" ~ '^COT-[0-9]{4}-[0-9]{5}$'),
  ADD CONSTRAINT "revision_resolucion_ck" CHECK (
    ("estado" = 'PENDIENTE') = ("resuelta_por" IS NULL)
    AND ("resuelta_por" IS NULL) = ("resuelta_en" IS NULL)
  ),
  ADD CONSTRAINT "revision_observaciones_ck" CHECK (
    ("observaciones" IS NULL OR btrim("observaciones") <> '')
    AND ("estado" <> 'CAMBIOS_SOLICITADOS' OR "observaciones" IS NOT NULL)
  ),
  ADD CONSTRAINT "revision_bl17_ck" CHECK (NOT ("estado" = 'APROBADA' AND "resuelta_por" = "preparador_id"));

-- Una sola revisión pendiente por cotización: no hay revisiones activas incompatibles.
CREATE UNIQUE INDEX "revision_pendiente_unica" ON "revision" ("organizacion_id", "cotizacion_id") WHERE "estado" = 'PENDIENTE';

ALTER TABLE "revision_evento"
  ADD CONSTRAINT "revision_evento_tipo_ck" CHECK ("tipo" IN ('ENVIADA', 'APROBADA', 'CAMBIOS_SOLICITADOS', 'RETIRADA')),
  ADD CONSTRAINT "revision_evento_estados_ck" CHECK (
    "estado_nuevo" IN ('PENDIENTE', 'APROBADA', 'CAMBIOS_SOLICITADOS', 'RETIRADA')
    AND ("estado_anterior" IS NULL OR "estado_anterior" = 'PENDIENTE')
  ),
  ADD CONSTRAINT "revision_evento_secuencia_ck" CHECK ("secuencia" >= 1),
  ADD CONSTRAINT "revision_evento_textos_ck" CHECK (
    btrim("usuario_nombre") <> '' AND ("observaciones" IS NULL OR btrim("observaciones") <> '')
  ),
  ADD CONSTRAINT "revision_evento_avisos_ck" CHECK (jsonb_typeof("avisos") = 'array');

-- La idempotencia también cubre envíos, decisiones y retiradas.
ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia"
  ADD CONSTRAINT "idempotencia_recurso_ck" CHECK ("recurso_tipo" IN ('cliente', 'proyecto', 'cotizacion', 'version', 'revision'));

-- ---------------------------------------------------------------------------
-- Triggers (también para el propietario, rol migrador).
-- ---------------------------------------------------------------------------

-- Solo transiciones válidas desde PENDIENTE; los datos de identidad y envío no cambian; sin DELETE.
CREATE FUNCTION "revision_transicion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_INMUTABLE: las revisiones no se borran (ADR-0009).' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."estado" <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_CERRADA: la revisión ya terminó (%).', OLD."estado" USING ERRCODE = 'P0001';
  END IF;
  IF NEW."estado" NOT IN ('APROBADA', 'CAMBIOS_SOLICITADOS', 'RETIRADA') OR NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'SOFTARQ:TRANSICION_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW."id", NEW."organizacion_id", NEW."cotizacion_id", NEW."folio", NEW."version_id", NEW."version_numero",
      NEW."total", NEW."preparador_id", NEW."enviado_por", NEW."enviado_en")
     IS DISTINCT FROM
     (OLD."id", OLD."organizacion_id", OLD."cotizacion_id", OLD."folio", OLD."version_id", OLD."version_numero",
      OLD."total", OLD."preparador_id", OLD."enviado_por", OLD."enviado_en") THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_INMUTABLE: la versión revisada y los datos del envío no cambian.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "revision_transicion_trg"
  BEFORE UPDATE OR DELETE ON "revision"
  FOR EACH ROW EXECUTE FUNCTION "revision_transicion"();

CREATE FUNCTION "revision_evento_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SOFTARQ:EVENTO_INMUTABLE: el historial de revisión solo admite altas (ADR-0009).' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "revision_evento_inmutable_trg"
  BEFORE UPDATE OR DELETE ON "revision_evento"
  FOR EACH ROW EXECUTE FUNCTION "revision_evento_inmutable"();

-- ---------------------------------------------------------------------------
-- Funciones de escritura (SECURITY INVOKER; una sentencia cada una). Comprueban DENTRO de la
-- misma sentencia los permisos vigentes, la versión objetivo, el estado y la ficha.
-- ---------------------------------------------------------------------------

-- Permiso vigente: pertenencia activa, cuenta activa y la función del libro requerida. Devuelve
-- el nombre de la persona (se copia en el historial).
CREATE FUNCTION "softarq_exigir_funcion"(p_org UUID, p_usuario UUID, p_funcion TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  SELECT u.nombre INTO v_nombre
    FROM membresia m
    JOIN usuario u ON u.id = m.usuario_id
   WHERE m.organizacion_id = p_org AND m.usuario_id = p_usuario
     AND m.activa AND u.activo AND p_funcion = ANY (m.funciones);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:SIN_PERMISO' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_nombre;
END;
$$;

-- Enviar a revisión (B-26) la ÚLTIMA versión, solo si corresponde a la captura guardada: el
-- borrador sigue en la revisión con la que se calculó y en la que el usuario la vio. Bloquea la
-- fila del borrador: se serializa con guardar el borrador y con crear versiones.
CREATE FUNCTION "softarq_enviar_revision"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_numero INTEGER, p_revision_borrador INTEGER, p_avisos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_nombre TEXT;
  v_rev INTEGER;
  q cotizacion%ROWTYPE;
  v cotizacion_version%ROWTYPE;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'revision', v_id, p_expira);
  v_nombre := softarq_exigir_funcion(p_org, p_usuario, 'PREPARADOR');
  SELECT b.revision INTO v_rev FROM cotizacion_borrador b
   WHERE b.cotizacion_id = p_cotizacion AND b.organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO q FROM cotizacion WHERE id = p_cotizacion AND organizacion_id = p_org;
  SELECT * INTO v FROM cotizacion_version
   WHERE organizacion_id = p_org AND cotizacion_id = p_cotizacion AND numero = p_numero;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF q.estado_folio <> 'ACTIVO' THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision r WHERE r.organizacion_id = p_org AND r.cotizacion_id = p_cotizacion AND r.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;
  IF p_numero <> q.ultima_version THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;
  IF v_rev <> v.revision_borrador OR v_rev <> p_revision_borrador THEN
    RAISE EXCEPTION 'SOFTARQ:BORRADOR_DESACTUALIZADO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision r WHERE r.organizacion_id = p_org AND r.version_id = v.id AND r.estado = 'APROBADA') THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_YA_APROBADA' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO revision (id, organizacion_id, cotizacion_id, folio, version_id, version_numero, total, preparador_id, estado, enviado_por)
  VALUES (v_id, p_org, p_cotizacion, q.folio, v.id, v.numero, v.total, v.autor_id, 'PENDIENTE', p_usuario);
  INSERT INTO revision_evento (organizacion_id, revision_id, secuencia, tipo, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, avisos)
  VALUES (p_org, v_id, 1, 'ENVIADA', NULL, 'PENDIENTE', p_usuario, v_nombre, p_avisos);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'REVISION_ENVIADA', p_usuario, jsonb_build_object('revisionId', v_id, 'numero', v.numero));
  RETURN v_id;
END;
$$;

-- Aprobar o solicitar cambios (B-28, B-29). La decisión se toma sobre la versión que la persona
-- vio (`p_version`) y la ficha que leyó (`p_esperada`): una pantalla obsoleta o una decisión
-- simultánea no encuentran la fila en PENDIENTE con esa ficha y fallan con CONFLICTO_REVISION.
-- BL-17: quien aprueba no puede ser el autor de la versión (identidad, no solo función).
CREATE FUNCTION "softarq_decidir_revision"(
  p_org UUID, p_usuario UUID, p_revision UUID, p_version UUID, p_esperada INTEGER, p_decision TEXT,
  p_observaciones TEXT, p_avisos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
  r revision%ROWTYPE;
  v_autor UUID;
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
    SELECT autor_id INTO v_autor FROM cotizacion_version WHERE id = r.version_id AND organizacion_id = p_org;
    IF p_usuario = v_autor OR p_usuario = r.preparador_id THEN
      RAISE EXCEPTION 'SOFTARQ:AUTOAPROBACION' USING ERRCODE = 'P0001';
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

-- Retirar una revisión pendiente (adaptación de la web: en el libro solo la devuelve el revisor).
-- Solo un Preparador; motivo opcional (las fuentes no lo exigen).
CREATE FUNCTION "softarq_retirar_revision"(
  p_org UUID, p_usuario UUID, p_revision UUID, p_esperada INTEGER, p_motivo TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
  r revision%ROWTYPE;
  v_obs TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'revision', p_revision, p_expira);
  v_nombre := softarq_exigir_funcion(p_org, p_usuario, 'PREPARADOR');
  SELECT * INTO r FROM revision WHERE id = p_revision AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF r.estado <> 'PENDIENTE' OR r.revision <> p_esperada THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_REVISION' USING ERRCODE = 'P0001';
  END IF;
  UPDATE revision
     SET estado = 'RETIRADA', revision = revision + 1, resuelta_por = p_usuario, resuelta_en = now(), observaciones = v_obs
   WHERE id = p_revision AND organizacion_id = p_org AND estado = 'PENDIENTE' AND revision = p_esperada;
  INSERT INTO revision_evento (organizacion_id, revision_id, secuencia, tipo, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, observaciones, avisos)
  VALUES (
    p_org, p_revision,
    (SELECT COALESCE(max(e.secuencia), 0) + 1 FROM revision_evento e WHERE e.revision_id = p_revision),
    'RETIRADA', 'PENDIENTE', 'RETIRADA', p_usuario, v_nombre, v_obs, '[]'::JSONB
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', r.cotizacion_id, 'REVISION_RETIRADA', p_usuario,
          jsonb_build_object('revisionId', p_revision, 'numero', r.version_numero));
  RETURN p_revision;
END;
$$;

-- BL-19: mientras haya una revisión pendiente, el borrador no se guarda ni se crean versiones
-- (en el libro, una versión En revisión no se edita). Se reemplazan las funciones del módulo 6
-- con la misma firma (conservan sus permisos): bloquean la fila del borrador y, después,
-- comprueban la revisión pendiente con una lectura nueva (ve un envío ya confirmado).
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
  IF EXISTS (SELECT 1 FROM revision r WHERE r.organizacion_id = p_org AND r.cotizacion_id = p_cotizacion AND r.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
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
    autor_id, autor_nombre, motivo, resumen_cambios
  ) VALUES (
    v_id, p_org, p_cotizacion, v_num, p_revision,
    p_datos->'captura', p_datos->'solicitudCalculo', p_datos->'entradaCalculo', p_datos->'resultadoInterno',
    p_datos->'proyeccionComercial', p_datos->'avisos',
    (p_datos->>'total')::NUMERIC(18, 2), (p_datos->>'fechaCalculo')::DATE, p_datos->>'versionMotor',
    decode(p_datos->>'huellaCalculo', 'hex'), decode(p_datos->>'huellaReferencia', 'hex'),
    p_datos->>'clienteCodigo', p_datos->>'clienteNombre', p_datos->>'proyectoCodigo', p_datos->>'proyectoNombre',
    p_datos->>'proyectoUbicacion', p_datos->>'proyectoDescripcion',
    p_usuario, p_datos->>'autorNombre', p_datos->>'motivo', p_datos->'resumenCambios'
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'VERSION_CREADA', p_usuario,
          jsonb_build_object('numero', v_num, 'revisionBorrador', p_revision));
  RETURN QUERY SELECT v_id, v_num;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de softarq_app (también en scripts/db/permisos-app.sql, que se aplica tras cada
-- migración). Revisión: alta, consulta y UPDATE SOLO de las columnas de la transición (el trigger
-- limita qué transiciones). Historial: solo alta y consulta. Sin DELETE en ninguna.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE "revision", "revision_evento" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "revision", "revision_evento" TO softarq_app;
GRANT UPDATE ("estado", "revision", "resuelta_por", "resuelta_en", "observaciones") ON TABLE "revision" TO softarq_app;

REVOKE ALL ON FUNCTION "softarq_exigir_funcion"(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_enviar_revision"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_decidir_revision"(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_retirar_revision"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "revision_transicion"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "revision_evento_inmutable"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "softarq_exigir_funcion"(UUID, UUID, TEXT) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_enviar_revision"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_decidir_revision"(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_retirar_revision"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
