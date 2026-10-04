-- Módulo 8 (ADR-0010): emisión de versiones aprobadas, PDF DEMO, anulación de aprobación y descarte.
-- Parte 1: SQL generado por Prisma (prisma migrate diff --from-migrations --to-schema --script,
-- con la base sombra).
-- Parte 2 (al final): CHECK, triggers, funciones atómicas y permisos (revisados a mano).

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "contacto_correo" VARCHAR(254),
ADD COLUMN     "contacto_nombre" VARCHAR(200),
ADD COLUMN     "contacto_telefono" VARCHAR(40);

-- AlterTable
ALTER TABLE "cotizacion" ADD COLUMN     "descartada_en" TIMESTAMPTZ(3),
ADD COLUMN     "descartada_por" UUID,
ADD COLUMN     "motivo_descarte" VARCHAR(500);

-- CreateTable
CREATE TABLE "emisor" (
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(200),
    "domicilio" VARCHAR(300),
    "telefono" VARCHAR(40),
    "correo" VARCHAR(254),
    "logo_clave" VARCHAR(20),
    "es_demo" BOOLEAN NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "modificado_por" UUID,
    "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emisor_pkey" PRIMARY KEY ("organizacion_id")
);

-- CreateTable
CREATE TABLE "emision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "version_id" UUID NOT NULL,
    "version_numero" INTEGER NOT NULL,
    "revision_id" UUID NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "ambiente" VARCHAR(12) NOT NULL,
    "preparado_por" UUID NOT NULL,
    "preparado_nombre" VARCHAR(200) NOT NULL,
    "aprobado_por" UUID NOT NULL,
    "aprobado_nombre" VARCHAR(200) NOT NULL,
    "emitido_por" UUID NOT NULL,
    "emitido_nombre" VARCHAR(200) NOT NULL,
    "emitido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_emision" DATE NOT NULL,
    "vigencia_dias" INTEGER NOT NULL,
    "vigente_hasta" DATE NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "contenido" JSONB NOT NULL,
    "plantilla_version" VARCHAR(40) NOT NULL,
    "archivo_clave" VARCHAR(200) NOT NULL,
    "archivo_bytes" INTEGER NOT NULL,
    "archivo_sha256" BYTEA NOT NULL,

    CONSTRAINT "emision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emision_organizacion_id_cotizacion_id_idx" ON "emision"("organizacion_id", "cotizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "emision_version_id_key" ON "emision"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "emision_organizacion_id_id_key" ON "emision"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "emision_archivo_clave_key" ON "emision"("archivo_clave");

-- CreateIndex
CREATE UNIQUE INDEX "revision_organizacion_id_id_version_id_key" ON "revision"("organizacion_id", "id", "version_id");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_organizacion_id_descartada_por_fkey" FOREIGN KEY ("organizacion_id", "descartada_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emisor" ADD CONSTRAINT "emisor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emisor" ADD CONSTRAINT "emisor_organizacion_id_modificado_por_fkey" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emision" ADD CONSTRAINT "emision_organizacion_id_cotizacion_id_folio_fkey" FOREIGN KEY ("organizacion_id", "cotizacion_id", "folio") REFERENCES "cotizacion"("organizacion_id", "id", "folio") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emision" ADD CONSTRAINT "emision_organizacion_id_cotizacion_id_version_numero_versi_fkey" FOREIGN KEY ("organizacion_id", "cotizacion_id", "version_numero", "version_id") REFERENCES "cotizacion_version"("organizacion_id", "cotizacion_id", "numero", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emision" ADD CONSTRAINT "emision_organizacion_id_revision_id_version_id_fkey" FOREIGN KEY ("organizacion_id", "revision_id", "version_id") REFERENCES "revision"("organizacion_id", "id", "version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emision" ADD CONSTRAINT "emision_organizacion_id_preparado_por_fkey" FOREIGN KEY ("organizacion_id", "preparado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emision" ADD CONSTRAINT "emision_organizacion_id_aprobado_por_fkey" FOREIGN KEY ("organizacion_id", "aprobado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "emision" ADD CONSTRAINT "emision_organizacion_id_emitido_por_fkey" FOREIGN KEY ("organizacion_id", "emitido_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ===========================================================================
-- Parte 2 (revisada a mano): reglas de emisión, anulación y descarte en la base (ADR-0010).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Restricciones
-- ---------------------------------------------------------------------------

-- Contacto del cliente (BL-01). El formato lo valida la API; aquí, textos limpios y un correo con @.
ALTER TABLE "cliente"
  ADD CONSTRAINT "cliente_contacto_ck" CHECK (
    ("contacto_nombre" IS NULL OR (btrim("contacto_nombre") <> '' AND "contacto_nombre" = btrim("contacto_nombre")))
    AND ("contacto_telefono" IS NULL OR (btrim("contacto_telefono") <> '' AND "contacto_telefono" = btrim("contacto_telefono")))
    AND ("contacto_correo" IS NULL OR "contacto_correo" ~ '^[^@[:space:]]+@[^@[:space:]]+$')
  );

-- Descarte (B-37): los tres datos del descarte existen si y solo si el folio está DESCARTADO.
ALTER TABLE "cotizacion"
  ADD CONSTRAINT "cotizacion_descarte_ck" CHECK (
    ("estado_folio" = 'DESCARTADO') = ("descartada_por" IS NOT NULL)
    AND ("descartada_por" IS NULL) = ("descartada_en" IS NULL)
    AND ("descartada_por" IS NULL) = ("motivo_descarte" IS NULL)
    AND ("motivo_descarte" IS NULL OR btrim("motivo_descarte") <> '')
  );

-- Emisor (BL-15). Logotipo: solo recursos locales conocidos por la API.
ALTER TABLE "emisor"
  ADD CONSTRAINT "emisor_textos_ck" CHECK (
    ("nombre" IS NULL OR btrim("nombre") <> '')
    AND ("domicilio" IS NULL OR btrim("domicilio") <> '')
    AND ("telefono" IS NULL OR btrim("telefono") <> '')
    AND ("correo" IS NULL OR "correo" ~ '^[^@[:space:]]+@[^@[:space:]]+$')
  ),
  ADD CONSTRAINT "emisor_logo_ck" CHECK ("logo_clave" IS NULL OR "logo_clave" IN ('DEMO')),
  ADD CONSTRAINT "emisor_revision_ck" CHECK ("revision" >= 0);

-- Emisión: coherencia interna. BL-17 también como CHECK: quien aprobó no es quien preparó.
ALTER TABLE "emision"
  ADD CONSTRAINT "emision_origen_ck" CHECK ("origen" = 'WEB_DEMO'),
  ADD CONSTRAINT "emision_ambiente_ck" CHECK ("ambiente" IN ('DEMO', 'PRODUCCION')),
  ADD CONSTRAINT "emision_folio_ck" CHECK ("folio" ~ '^COT-[0-9]{4}-[0-9]{5}$'),
  ADD CONSTRAINT "emision_version_numero_ck" CHECK ("version_numero" >= 1),
  ADD CONSTRAINT "emision_bl17_ck" CHECK ("aprobado_por" <> "preparado_por"),
  ADD CONSTRAINT "emision_vigencia_ck" CHECK ("vigencia_dias" > 0 AND "vigente_hasta" = "fecha_emision" + "vigencia_dias"),
  ADD CONSTRAINT "emision_total_ck" CHECK ("total" >= 0),
  ADD CONSTRAINT "emision_contenido_ck" CHECK (jsonb_typeof("contenido") = 'object'),
  ADD CONSTRAINT "emision_nombres_ck" CHECK (
    btrim("preparado_nombre") <> '' AND btrim("aprobado_nombre") <> '' AND btrim("emitido_nombre") <> ''
    AND btrim("plantilla_version") <> ''
  ),
  ADD CONSTRAINT "emision_archivo_ck" CHECK (
    "archivo_clave" ~ '^emisiones/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    AND "archivo_bytes" > 0
    AND octet_length("archivo_sha256") = 32
  );

-- Anulación de una aprobación: evento nuevo del historial (la revisión y su evento APROBADA no
-- cambian). Una sola anulación por revisión.
ALTER TABLE "revision_evento" DROP CONSTRAINT "revision_evento_tipo_ck";
ALTER TABLE "revision_evento" DROP CONSTRAINT "revision_evento_estados_ck";
ALTER TABLE "revision_evento"
  ADD CONSTRAINT "revision_evento_tipo_ck" CHECK (
    "tipo" IN ('ENVIADA', 'APROBADA', 'CAMBIOS_SOLICITADOS', 'RETIRADA', 'APROBACION_ANULADA')
  ),
  ADD CONSTRAINT "revision_evento_estados_ck" CHECK (
    ("tipo" = 'APROBACION_ANULADA' AND "estado_anterior" = 'APROBADA' AND "estado_nuevo" = 'ANULADA'
       AND "observaciones" IS NOT NULL)
    OR ("tipo" <> 'APROBACION_ANULADA'
       AND "estado_nuevo" IN ('PENDIENTE', 'APROBADA', 'CAMBIOS_SOLICITADOS', 'RETIRADA')
       AND ("estado_anterior" IS NULL OR "estado_anterior" = 'PENDIENTE'))
  );
CREATE UNIQUE INDEX "revision_evento_anulacion_unica" ON "revision_evento" ("revision_id") WHERE "tipo" = 'APROBACION_ANULADA';

ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia"
  ADD CONSTRAINT "idempotencia_recurso_ck" CHECK ("recurso_tipo" IN ('cliente', 'proyecto', 'cotizacion', 'version', 'revision', 'emision'));

ALTER TABLE "bitacora" DROP CONSTRAINT "bitacora_entidad_ck";
ALTER TABLE "bitacora"
  ADD CONSTRAINT "bitacora_entidad_ck" CHECK ("entidad" IN ('cliente', 'proyecto', 'cotizacion', 'emisor'));

-- ---------------------------------------------------------------------------
-- Triggers (también para el propietario, rol migrador).
-- ---------------------------------------------------------------------------

-- Cotización: sin DELETE; un folio DESCARTADO no cambia más; la única transición de estado es
-- ACTIVO → DESCARTADO (con sus datos y sin tocar nada más); sin ella, solo cambia ultima_version.
CREATE FUNCTION "cotizacion_transicion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SOFTARQ:COTIZACION_INMUTABLE: las cotizaciones no se borran; el folio no se reutiliza.' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW."id", NEW."organizacion_id", NEW."folio", NEW."anio_folio", NEW."origen", NEW."cliente_id",
      NEW."proyecto_id", NEW."creado_por", NEW."creado_en")
     IS DISTINCT FROM
     (OLD."id", OLD."organizacion_id", OLD."folio", OLD."anio_folio", OLD."origen", OLD."cliente_id",
      OLD."proyecto_id", OLD."creado_por", OLD."creado_en") THEN
    RAISE EXCEPTION 'SOFTARQ:COTIZACION_INMUTABLE: el folio y sus datos de identidad no cambian.' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."estado_folio" = 'DESCARTADO' THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO: la cotización está descartada.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."estado_folio" <> OLD."estado_folio" THEN
    IF NEW."estado_folio" <> 'DESCARTADO' OR NEW."ultima_version" <> OLD."ultima_version" THEN
      RAISE EXCEPTION 'SOFTARQ:TRANSICION_INVALIDA' USING ERRCODE = 'P0001';
    END IF;
  ELSIF (NEW."descartada_por", NEW."descartada_en", NEW."motivo_descarte") IS DISTINCT FROM (NULL::UUID, NULL::TIMESTAMPTZ, NULL::TEXT) THEN
    RAISE EXCEPTION 'SOFTARQ:TRANSICION_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "cotizacion_transicion_trg"
  BEFORE UPDATE OR DELETE ON "cotizacion"
  FOR EACH ROW EXECUTE FUNCTION "cotizacion_transicion"();

-- Emisión inmutable (D-17): ni UPDATE ni DELETE.
CREATE FUNCTION "emision_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SOFTARQ:EMISION_INMUTABLE: las emisiones no se modifican ni se borran (ADR-0010).' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "emision_inmutable_trg"
  BEFORE UPDATE OR DELETE ON "emision"
  FOR EACH ROW EXECUTE FUNCTION "emision_inmutable"();

-- Defensa en profundidad: aunque alguien inserte directamente (sin la función), la emisión debe
-- citar una aprobación vigente de ESA versión, la última de un folio activo, con sus personas y su
-- total. Bloquea la fila de la revisión: se serializa con la anulación.
CREATE FUNCTION "emision_validar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r revision%ROWTYPE;
  v cotizacion_version%ROWTYPE;
  q cotizacion%ROWTYPE;
BEGIN
  SELECT * INTO r FROM revision WHERE id = NEW."revision_id" AND organizacion_id = NEW."organizacion_id" FOR UPDATE;
  SELECT * INTO v FROM cotizacion_version WHERE id = NEW."version_id" AND organizacion_id = NEW."organizacion_id";
  SELECT * INTO q FROM cotizacion WHERE id = NEW."cotizacion_id" AND organizacion_id = NEW."organizacion_id";
  IF r.id IS NULL OR v.id IS NULL OR q.id IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF r.estado <> 'APROBADA' OR r.version_id <> v.id
     OR EXISTS (SELECT 1 FROM revision_evento e WHERE e.revision_id = r.id AND e.tipo = 'APROBACION_ANULADA') THEN
    RAISE EXCEPTION 'SOFTARQ:APROBACION_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;
  IF q.estado_folio <> 'ACTIVO' THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF v.numero <> q.ultima_version THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."total" <> v.total OR NEW."preparado_por" <> v.autor_id OR NEW."aprobado_por" <> r.resuelta_por
     OR NEW."folio" <> q.folio OR NEW."version_numero" <> v.numero OR NEW."cotizacion_id" <> v.cotizacion_id THEN
    RAISE EXCEPTION 'SOFTARQ:EMISION_INCOHERENTE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "emision_validar_trg"
  BEFORE INSERT ON "emision"
  FOR EACH ROW EXECUTE FUNCTION "emision_validar"();

-- Una anulación solo cabe sobre una revisión APROBADA cuya versión no se emitió (también con
-- inserciones directas). Bloquea la fila de la revisión, como la emisión.
CREATE FUNCTION "revision_evento_validar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r revision%ROWTYPE;
BEGIN
  IF NEW."tipo" <> 'APROBACION_ANULADA' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM revision WHERE id = NEW."revision_id" AND organizacion_id = NEW."organizacion_id" FOR UPDATE;
  IF r.id IS NULL OR r.estado <> 'APROBADA' THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_REVISION' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM emision m WHERE m.organizacion_id = r.organizacion_id AND m.version_id = r.version_id) THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_EMITIDA' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "revision_evento_validar_trg"
  BEFORE INSERT ON "revision_evento"
  FOR EACH ROW EXECUTE FUNCTION "revision_evento_validar"();

-- ---------------------------------------------------------------------------
-- Funciones de escritura (SECURITY INVOKER; una sentencia cada una).
-- ---------------------------------------------------------------------------

-- Quién emite (decisión autorizada por el propietario, ADR-0010; en el libro, solo el Revisor
-- distinto del preparador): un Preparador activo de la organización, o un Revisor activo que NO
-- es el autor de la versión. Devuelve el nombre de quien emite.
CREATE FUNCTION "softarq_exigir_emisor"(p_org UUID, p_usuario UUID, p_autor UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
  v_funciones TEXT[];
BEGIN
  SELECT u.nombre, m.funciones INTO v_nombre, v_funciones
    FROM membresia m
    JOIN usuario u ON u.id = m.usuario_id
   WHERE m.organizacion_id = p_org AND m.usuario_id = p_usuario AND m.activa AND u.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:SIN_PERMISO' USING ERRCODE = 'P0001';
  END IF;
  IF 'PREPARADOR' = ANY (v_funciones) THEN
    RETURN v_nombre;
  END IF;
  IF 'REVISOR' = ANY (v_funciones) THEN
    IF p_usuario = p_autor THEN
      RAISE EXCEPTION 'SOFTARQ:EMISOR_ES_AUTOR' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_nombre;
  END IF;
  RAISE EXCEPTION 'SOFTARQ:SIN_PERMISO' USING ERRCODE = 'P0001';
END;
$$;

-- Emitir (B-30) la versión que la persona vio, con la aprobación que vio. El archivo ya está
-- generado, validado y en su ubicación definitiva: aquí se registra en UNA sentencia tras volver a
-- comprobar todo con las filas bloqueadas (borrador → revisión, mismo orden que el resto).
-- Si algo falla, no queda registro y la API borra el archivo que acaba de crear.
CREATE FUNCTION "softarq_emitir_version"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_numero INTEGER, p_version UUID, p_revision UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := (p_datos->>'id')::UUID;
  v_nombre TEXT;
  v_aprobador TEXT;
  v_rev INTEGER;
  q cotizacion%ROWTYPE;
  v cotizacion_version%ROWTYPE;
  r revision%ROWTYPE;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'emision', v_id, p_expira);
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
  IF v.id <> p_version THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EMISION' USING ERRCODE = 'P0001';
  END IF;
  v_nombre := softarq_exigir_emisor(p_org, p_usuario, v.autor_id);
  IF q.estado_folio <> 'ACTIVO' THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM emision m WHERE m.organizacion_id = p_org AND m.version_id = v.id) THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_EMITIDA' USING ERRCODE = 'P0001';
  END IF;
  IF p_numero <> q.ultima_version THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision x WHERE x.organizacion_id = p_org AND x.cotizacion_id = p_cotizacion AND x.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;
  IF v_rev <> v.revision_borrador THEN
    RAISE EXCEPTION 'SOFTARQ:BORRADOR_DESACTUALIZADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO r FROM revision WHERE id = p_revision AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND OR r.version_id <> v.id OR r.estado <> 'APROBADA'
     OR EXISTS (SELECT 1 FROM revision_evento e WHERE e.revision_id = r.id AND e.tipo = 'APROBACION_ANULADA') THEN
    RAISE EXCEPTION 'SOFTARQ:APROBACION_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;
  IF r.resuelta_por = v.autor_id OR r.resuelta_por = r.preparador_id THEN
    RAISE EXCEPTION 'SOFTARQ:AUTOAPROBACION' USING ERRCODE = 'P0001';
  END IF;
  IF (p_datos->>'total')::NUMERIC(18, 2) <> v.total THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EMISION' USING ERRCODE = 'P0001';
  END IF;
  SELECT e.usuario_nombre INTO v_aprobador FROM revision_evento e WHERE e.revision_id = r.id AND e.tipo = 'APROBADA';
  INSERT INTO emision (
    id, organizacion_id, cotizacion_id, folio, version_id, version_numero, revision_id, origen, ambiente,
    preparado_por, preparado_nombre, aprobado_por, aprobado_nombre, emitido_por, emitido_nombre,
    fecha_emision, vigencia_dias, vigente_hasta, total, contenido, plantilla_version,
    archivo_clave, archivo_bytes, archivo_sha256
  ) VALUES (
    v_id, p_org, p_cotizacion, q.folio, v.id, v.numero, r.id, 'WEB_DEMO', p_datos->>'ambiente',
    v.autor_id, v.autor_nombre, r.resuelta_por, v_aprobador, p_usuario, v_nombre,
    (p_datos->>'fechaEmision')::DATE, (p_datos->>'vigenciaDias')::INTEGER, (p_datos->>'vigenteHasta')::DATE,
    v.total, p_datos->'contenido', p_datos->>'plantillaVersion',
    p_datos->>'archivoClave', (p_datos->>'archivoBytes')::INTEGER, decode(p_datos->>'archivoSha256', 'hex')
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'VERSION_EMITIDA', p_usuario,
          jsonb_build_object('emisionId', v_id, 'numero', v.numero, 'revisionId', r.id));
  RETURN v_id;
END;
$$;

-- Anular una aprobación ANTES de emitir (adaptación de Rev_Observar sobre una versión Aprobada):
-- solo un Revisor, con motivo; evento nuevo que cita la aprobación. La revisión y su evento
-- APROBADA no cambian. Después, la versión vuelve a Borrador y necesita otra aprobación.
CREATE FUNCTION "softarq_anular_aprobacion"(
  p_org UUID, p_usuario UUID, p_revision UUID, p_esperada INTEGER, p_motivo TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
  r revision%ROWTYPE;
  v_motivo TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'revision', p_revision, p_expira);
  v_nombre := softarq_exigir_funcion(p_org, p_usuario, 'REVISOR');
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:MOTIVO_REQUERIDO' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO r FROM revision WHERE id = p_revision AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF r.estado <> 'APROBADA' OR r.revision <> p_esperada
     OR EXISTS (SELECT 1 FROM revision_evento e WHERE e.revision_id = r.id AND e.tipo = 'APROBACION_ANULADA') THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_REVISION' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM emision m WHERE m.organizacion_id = p_org AND m.version_id = r.version_id) THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_EMITIDA' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO revision_evento (organizacion_id, revision_id, secuencia, tipo, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, observaciones, avisos)
  VALUES (
    p_org, p_revision,
    (SELECT COALESCE(max(e.secuencia), 0) + 1 FROM revision_evento e WHERE e.revision_id = p_revision),
    'APROBACION_ANULADA', 'APROBADA', 'ANULADA', p_usuario, v_nombre, v_motivo, '[]'::JSONB
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', r.cotizacion_id, 'APROBACION_ANULADA', p_usuario,
          jsonb_build_object('revisionId', p_revision, 'numero', r.version_numero));
  RETURN p_revision;
END;
$$;

-- Descartar una cotización (B-37, adaptado al folio): solo un Preparador, con motivo, y solo si
-- no hay emisiones, revisión pendiente ni aprobación vigente (no se eluden con el descarte). El
-- folio, las versiones y los eventos se conservan; el folio no se reutiliza.
CREATE FUNCTION "softarq_descartar_cotizacion"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_motivo TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_nombre TEXT;
  q cotizacion%ROWTYPE;
  v_motivo TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'cotizacion', p_cotizacion, p_expira);
  v_nombre := softarq_exigir_funcion(p_org, p_usuario, 'PREPARADOR');
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:MOTIVO_REQUERIDO' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM cotizacion_borrador WHERE cotizacion_id = p_cotizacion AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO q FROM cotizacion WHERE id = p_cotizacion AND organizacion_id = p_org FOR UPDATE;
  IF q.estado_folio <> 'ACTIVO' THEN
    RAISE EXCEPTION 'SOFTARQ:FOLIO_NO_ACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM emision m WHERE m.organizacion_id = p_org AND m.cotizacion_id = p_cotizacion) THEN
    RAISE EXCEPTION 'SOFTARQ:DESCARTE_EMITIDA' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM revision x WHERE x.organizacion_id = p_org AND x.cotizacion_id = p_cotizacion AND x.estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'SOFTARQ:REVISION_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM revision x
     WHERE x.organizacion_id = p_org AND x.cotizacion_id = p_cotizacion AND x.estado = 'APROBADA'
       AND NOT EXISTS (SELECT 1 FROM revision_evento e WHERE e.revision_id = x.id AND e.tipo = 'APROBACION_ANULADA')
  ) THEN
    RAISE EXCEPTION 'SOFTARQ:DESCARTE_APROBADA' USING ERRCODE = 'P0001';
  END IF;
  UPDATE cotizacion
     SET estado_folio = 'DESCARTADO', descartada_por = p_usuario, descartada_en = now(), motivo_descarte = v_motivo
   WHERE id = p_cotizacion AND organizacion_id = p_org;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'COTIZACION_DESCARTADA', p_usuario, jsonb_build_object('folio', q.folio));
  RETURN p_cotizacion;
END;
$$;

-- Datos del emisor (17 CONFIG; en el libro los cambia el Administrador del sistema, con motivo).
-- Concurrencia optimista por `revision` (0 = aún no existe la fila). `es_demo` sale de la
-- organización. Devuelve la revisión resultante.
CREATE FUNCTION "softarq_guardar_emisor"(
  p_org UUID, p_usuario UUID, p_revision INTEGER, p_datos JSONB, p_motivo TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_rev INTEGER;
  v_demo BOOLEAN;
  v_motivo TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_SISTEMA');
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:MOTIVO_REQUERIDO' USING ERRCODE = 'P0001';
  END IF;
  SELECT es_demo INTO v_demo FROM organizacion WHERE id = p_org;
  SELECT revision INTO v_rev FROM emisor WHERE organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    IF p_revision <> 0 THEN
      RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO emisor (organizacion_id, nombre, domicilio, telefono, correo, logo_clave, es_demo, revision, modificado_por)
    VALUES (p_org, p_datos->>'nombre', p_datos->>'domicilio', p_datos->>'telefono', p_datos->>'correo',
            p_datos->>'logoClave', v_demo, 1, p_usuario);
    v_rev := 1;
  ELSE
    IF v_rev <> p_revision THEN
      RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
    END IF;
    UPDATE emisor
       SET nombre = p_datos->>'nombre', domicilio = p_datos->>'domicilio', telefono = p_datos->>'telefono',
           correo = p_datos->>'correo', logo_clave = p_datos->>'logoClave',
           revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
     WHERE organizacion_id = p_org
    RETURNING revision INTO v_rev;
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'emisor', p_org, 'EMISOR_ACTUALIZADO', p_usuario, jsonb_build_object('revision', v_rev, 'motivo', v_motivo));
  RETURN v_rev;
END;
$$;

-- Clientes con contacto (BL-01). El alta pasa a recibir un objeto (nombre y contacto); la firma
-- anterior se elimina (solo la usaba la API).
DROP FUNCTION "softarq_crear_cliente"(UUID, UUID, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ);

CREATE FUNCTION "softarq_crear_cliente"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'cliente', v_id, p_expira);
  v_n := softarq_siguiente(p_org, 'CLI');
  INSERT INTO cliente (id, organizacion_id, codigo, nombre, contacto_nombre, contacto_telefono, contacto_correo, creado_por, modificado_por)
  VALUES (v_id, p_org, 'CLI-' || lpad(v_n::TEXT, 5, '0'), p_datos->>'nombre',
          p_datos->>'contactoNombre', p_datos->>'contactoTelefono', p_datos->>'contactoCorreo', p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cliente', v_id, 'CLIENTE_CREADO', p_usuario, '{}'::JSONB);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION "softarq_editar_cliente"(
  p_org UUID, p_usuario UUID, p_id UUID, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v cliente%ROWTYPE;
  n cliente%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO v FROM cliente WHERE id = p_id AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'nombre' THEN n.nombre := p_cambios->>'nombre'; END IF;
  IF p_cambios ? 'contactoNombre' THEN n.contacto_nombre := p_cambios->>'contactoNombre'; END IF;
  IF p_cambios ? 'contactoTelefono' THEN n.contacto_telefono := p_cambios->>'contactoTelefono'; END IF;
  IF p_cambios ? 'contactoCorreo' THEN n.contacto_correo := p_cambios->>'contactoCorreo'; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.nombre IS DISTINCT FROM v.nombre THEN v_campos := array_append(v_campos, 'nombre'); END IF;
  IF n.contacto_nombre IS DISTINCT FROM v.contacto_nombre THEN v_campos := array_append(v_campos, 'contactoNombre'); END IF;
  IF n.contacto_telefono IS DISTINCT FROM v.contacto_telefono THEN v_campos := array_append(v_campos, 'contactoTelefono'); END IF;
  IF n.contacto_correo IS DISTINCT FROM v.contacto_correo THEN v_campos := array_append(v_campos, 'contactoCorreo'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE cliente
     SET nombre = n.nombre, contacto_nombre = n.contacto_nombre, contacto_telefono = n.contacto_telefono,
         contacto_correo = n.contacto_correo, activo = n.activo, revision = revision + 1,
         modificado_por = p_usuario, modificado_en = now()
   WHERE id = p_id AND organizacion_id = p_org;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'cliente', p_id, 'CLIENTE_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'cliente', p_id, CASE WHEN n.activo THEN 'CLIENTE_REACTIVADO' ELSE 'CLIENTE_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END;
$$;

-- Folio descartado (módulo 8): no se guarda el borrador ni se calculan versiones. Mismas firmas
-- (conservan sus permisos); la comprobación va después de bloquear la fila del borrador, que el
-- descarte también bloquea.
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

-- Enviar a revisión: una aprobación ANULADA ya no impide volver a enviar la misma versión; una
-- versión emitida no se envía. Misma firma y mismas comprobaciones que el módulo 7.
CREATE OR REPLACE FUNCTION "softarq_enviar_revision"(
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
  IF EXISTS (SELECT 1 FROM emision m WHERE m.organizacion_id = p_org AND m.version_id = v.id) THEN
    RAISE EXCEPTION 'SOFTARQ:VERSION_EMITIDA' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM revision r
     WHERE r.organizacion_id = p_org AND r.version_id = v.id AND r.estado = 'APROBADA'
       AND NOT EXISTS (SELECT 1 FROM revision_evento e WHERE e.revision_id = r.id AND e.tipo = 'APROBACION_ANULADA')
  ) THEN
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

-- ---------------------------------------------------------------------------
-- Permisos de softarq_app (también en scripts/db/permisos-app.sql). Emisión: alta y consulta
-- (sin UPDATE ni DELETE). Emisor: alta, consulta y UPDATE de sus columnas editables. Cotización y
-- cliente: UPDATE de las columnas nuevas que escriben las funciones.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE "emision", "emisor" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "emision", "emisor" TO softarq_app;
GRANT UPDATE ("nombre", "domicilio", "telefono", "correo", "logo_clave", "revision", "modificado_por", "modificado_en") ON TABLE "emisor" TO softarq_app;
GRANT UPDATE ("estado_folio", "descartada_por", "descartada_en", "motivo_descarte") ON TABLE "cotizacion" TO softarq_app;
GRANT UPDATE ("contacto_nombre", "contacto_telefono", "contacto_correo") ON TABLE "cliente" TO softarq_app;

REVOKE ALL ON FUNCTION "cotizacion_transicion"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "emision_inmutable"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "emision_validar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "revision_evento_validar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_exigir_emisor"(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_emitir_version"(UUID, UUID, UUID, INTEGER, UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_anular_aprobacion"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_descartar_cotizacion"(UUID, UUID, UUID, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_guardar_emisor"(UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_cliente"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "softarq_exigir_emisor"(UUID, UUID, UUID) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_emitir_version"(UUID, UUID, UUID, INTEGER, UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_anular_aprobacion"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_descartar_cotizacion"(UUID, UUID, UUID, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_guardar_emisor"(UUID, UUID, INTEGER, JSONB, TEXT) TO softarq_app;
GRANT EXECUTE ON FUNCTION "softarq_crear_cliente"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
