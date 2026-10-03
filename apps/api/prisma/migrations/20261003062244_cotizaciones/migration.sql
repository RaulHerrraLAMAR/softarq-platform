-- Módulo 6 (ADR-0008): clientes, proyectos y cotizaciones con folio, borrador y versiones.
-- Parte 1: SQL generado por Prisma (prisma migrate dev --create-only).
-- Parte 2 (al final): CHECK, trigger de inmutabilidad y funciones atómicas (revisadas a mano).

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_por" UUID NOT NULL,
    "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "municipio" VARCHAR(120),
    "entidad_federativa" VARCHAR(60),
    "descripcion" VARCHAR(500),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_por" UUID NOT NULL,
    "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "anio_folio" INTEGER NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "estado_folio" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    "cliente_id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "ultima_version" INTEGER NOT NULL DEFAULT 0,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_borrador" (
    "cotizacion_id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "captura" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "actualizado_por" UUID NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_borrador_pkey" PRIMARY KEY ("cotizacion_id")
);

-- CreateTable
CREATE TABLE "cotizacion_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "revision_borrador" INTEGER NOT NULL,
    "captura" JSONB NOT NULL,
    "solicitud_calculo" JSONB NOT NULL,
    "entrada_calculo" JSONB NOT NULL,
    "resultado_interno" JSONB NOT NULL,
    "proyeccion_comercial" JSONB NOT NULL,
    "avisos" JSONB NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "fecha_calculo" DATE NOT NULL,
    "version_motor" VARCHAR(40) NOT NULL,
    "huella_calculo" BYTEA NOT NULL,
    "huella_referencia" BYTEA NOT NULL,
    "cliente_codigo" VARCHAR(20) NOT NULL,
    "cliente_nombre" VARCHAR(200) NOT NULL,
    "proyecto_codigo" VARCHAR(20) NOT NULL,
    "proyecto_nombre" VARCHAR(200) NOT NULL,
    "proyecto_ubicacion" VARCHAR(200),
    "proyecto_descripcion" VARCHAR(500),
    "autor_id" UUID NOT NULL,
    "autor_nombre" VARCHAR(200) NOT NULL,
    "motivo" VARCHAR(500),
    "resumen_cambios" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador" (
    "organizacion_id" UUID NOT NULL,
    "entidad" VARCHAR(20) NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "contador_pkey" PRIMARY KEY ("organizacion_id","entidad")
);

-- CreateTable
CREATE TABLE "bitacora" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "entidad" VARCHAR(20) NOT NULL,
    "entidad_id" UUID NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "detalle" JSONB NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotencia" (
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "clave" UUID NOT NULL,
    "operacion" VARCHAR(40) NOT NULL,
    "huella_solicitud" BYTEA NOT NULL,
    "recurso_tipo" VARCHAR(20) NOT NULL,
    "recurso_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotencia_pkey" PRIMARY KEY ("organizacion_id","usuario_id","clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_organizacion_id_id_key" ON "cliente"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_organizacion_id_codigo_key" ON "cliente"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_organizacion_id_id_key" ON "proyecto"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_organizacion_id_codigo_key" ON "proyecto"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_organizacion_id_cliente_id_id_key" ON "proyecto"("organizacion_id", "cliente_id", "id");

-- CreateIndex
CREATE INDEX "cotizacion_organizacion_id_creado_en_idx" ON "cotizacion"("organizacion_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_organizacion_id_id_key" ON "cotizacion"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_organizacion_id_folio_key" ON "cotizacion"("organizacion_id", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_borrador_organizacion_id_cotizacion_id_key" ON "cotizacion_borrador"("organizacion_id", "cotizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_version_cotizacion_id_numero_key" ON "cotizacion_version"("cotizacion_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_version_organizacion_id_id_key" ON "cotizacion_version"("organizacion_id", "id");

-- CreateIndex
CREATE INDEX "bitacora_organizacion_id_entidad_entidad_id_ocurrido_en_idx" ON "bitacora"("organizacion_id", "entidad", "entidad_id", "ocurrido_en");

-- CreateIndex
CREATE INDEX "idempotencia_expira_en_idx" ON "idempotencia"("expira_en");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_organizacion_id_creado_por_fkey" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_organizacion_id_modificado_por_fkey" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_organizacion_id_cliente_id_fkey" FOREIGN KEY ("organizacion_id", "cliente_id") REFERENCES "cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_organizacion_id_creado_por_fkey" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_organizacion_id_modificado_por_fkey" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_organizacion_id_cliente_id_proyecto_id_fkey" FOREIGN KEY ("organizacion_id", "cliente_id", "proyecto_id") REFERENCES "proyecto"("organizacion_id", "cliente_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_organizacion_id_creado_por_fkey" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion_borrador" ADD CONSTRAINT "cotizacion_borrador_organizacion_id_cotizacion_id_fkey" FOREIGN KEY ("organizacion_id", "cotizacion_id") REFERENCES "cotizacion"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion_borrador" ADD CONSTRAINT "cotizacion_borrador_organizacion_id_actualizado_por_fkey" FOREIGN KEY ("organizacion_id", "actualizado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion_version" ADD CONSTRAINT "cotizacion_version_organizacion_id_cotizacion_id_fkey" FOREIGN KEY ("organizacion_id", "cotizacion_id") REFERENCES "cotizacion"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion_version" ADD CONSTRAINT "cotizacion_version_organizacion_id_autor_id_fkey" FOREIGN KEY ("organizacion_id", "autor_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contador" ADD CONSTRAINT "contador_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_organizacion_id_usuario_id_fkey" FOREIGN KEY ("organizacion_id", "usuario_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_organizacion_id_usuario_id_fkey" FOREIGN KEY ("organizacion_id", "usuario_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Parte 2: restricciones de integridad, inmutabilidad y funciones atómicas (revisadas a mano).
-- ADR-0008. Los permisos de softarq_app se aplican después con scripts/db/permisos-app.sql.
-- ---------------------------------------------------------------------------

ALTER TABLE "cliente"
  ADD CONSTRAINT "cliente_codigo_ck" CHECK ("codigo" ~ '^CLI-[0-9]{5}$'),
  ADD CONSTRAINT "cliente_nombre_ck" CHECK (btrim("nombre") <> '' AND "nombre" = btrim("nombre")),
  ADD CONSTRAINT "cliente_revision_ck" CHECK ("revision" >= 0);

ALTER TABLE "proyecto"
  ADD CONSTRAINT "proyecto_codigo_ck" CHECK ("codigo" ~ '^PRY-[0-9]{5}$'),
  ADD CONSTRAINT "proyecto_nombre_ck" CHECK (btrim("nombre") <> '' AND "nombre" = btrim("nombre")),
  -- Texto opcional: NULL = sin capturar; nunca cadena vacía.
  ADD CONSTRAINT "proyecto_textos_ck" CHECK (
    ("municipio" IS NULL OR btrim("municipio") <> '')
    AND ("entidad_federativa" IS NULL OR btrim("entidad_federativa") <> '')
    AND ("descripcion" IS NULL OR btrim("descripcion") <> '')
  ),
  ADD CONSTRAINT "proyecto_revision_ck" CHECK ("revision" >= 0);

ALTER TABLE "cotizacion"
  -- Formato del libro (modIds.bas: COT-AAAA-NNNNN); el año del folio es el de anio_folio.
  ADD CONSTRAINT "cotizacion_folio_ck" CHECK (
    "folio" ~ '^COT-[0-9]{4}-[0-9]{5}$' AND substring("folio" FROM 5 FOR 4)::INTEGER = "anio_folio"
  ),
  ADD CONSTRAINT "cotizacion_anio_ck" CHECK ("anio_folio" BETWEEN 2000 AND 9999),
  -- Historial web independiente de la fase Excel (no se importan ni continúan folios del libro).
  ADD CONSTRAINT "cotizacion_origen_ck" CHECK ("origen" = 'WEB_DEMO'),
  ADD CONSTRAINT "cotizacion_estado_folio_ck" CHECK ("estado_folio" IN ('ACTIVO', 'DESCARTADO')),
  ADD CONSTRAINT "cotizacion_ultima_version_ck" CHECK ("ultima_version" >= 0);

ALTER TABLE "cotizacion_borrador"
  ADD CONSTRAINT "cotizacion_borrador_captura_ck" CHECK (jsonb_typeof("captura") = 'object'),
  ADD CONSTRAINT "cotizacion_borrador_revision_ck" CHECK ("revision" >= 0);

ALTER TABLE "cotizacion_version"
  ADD CONSTRAINT "cotizacion_version_numero_ck" CHECK ("numero" >= 1 AND "revision_borrador" >= 0),
  ADD CONSTRAINT "cotizacion_version_json_ck" CHECK (
    jsonb_typeof("captura") = 'object'
    AND jsonb_typeof("solicitud_calculo") = 'object'
    AND jsonb_typeof("entrada_calculo") = 'object'
    AND jsonb_typeof("resultado_interno") = 'object'
    AND jsonb_typeof("proyeccion_comercial") = 'object'
    AND jsonb_typeof("avisos") = 'array'
    AND jsonb_typeof("resumen_cambios") = 'object'
  ),
  -- SHA-256: 32 bytes.
  ADD CONSTRAINT "cotizacion_version_huellas_ck" CHECK (
    octet_length("huella_calculo") = 32 AND octet_length("huella_referencia") = 32
  ),
  ADD CONSTRAINT "cotizacion_version_textos_ck" CHECK (
    btrim("autor_nombre") <> '' AND btrim("cliente_nombre") <> '' AND btrim("proyecto_nombre") <> ''
    AND ("motivo" IS NULL OR btrim("motivo") <> '')
  );

ALTER TABLE "contador"
  ADD CONSTRAINT "contador_entidad_ck" CHECK ("entidad" ~ '^(CLI|PRY|COT-[0-9]{4})$'),
  ADD CONSTRAINT "contador_ultimo_ck" CHECK ("ultimo" BETWEEN 1 AND 99999);

ALTER TABLE "bitacora"
  ADD CONSTRAINT "bitacora_entidad_ck" CHECK ("entidad" IN ('cliente', 'proyecto', 'cotizacion')),
  ADD CONSTRAINT "bitacora_tipo_ck" CHECK ("tipo" ~ '^[A-Z][A-Z_]{2,39}$'),
  ADD CONSTRAINT "bitacora_detalle_ck" CHECK (jsonb_typeof("detalle") = 'object');

ALTER TABLE "idempotencia"
  ADD CONSTRAINT "idempotencia_huella_ck" CHECK (octet_length("huella_solicitud") = 32),
  ADD CONSTRAINT "idempotencia_recurso_ck" CHECK ("recurso_tipo" IN ('cliente', 'proyecto', 'cotizacion', 'version')),
  ADD CONSTRAINT "idempotencia_expira_ck" CHECK ("expira_en" > "creada_en");

-- ---------------------------------------------------------------------------
-- Inmutabilidad de las versiones guardadas (D-17, ADR-0008). softarq_app no tiene UPDATE ni
-- DELETE sobre la tabla; este trigger lo impide también al propietario. Los cambios de estado
-- futuros (revisión, emisión) irán en otra tabla, nunca como UPDATE de la versión.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "cotizacion_version_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SOFTARQ:VERSION_INMUTABLE: las versiones guardadas no se modifican ni se borran (ADR-0008).'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "cotizacion_version_inmutable_trg"
  BEFORE UPDATE OR DELETE ON "cotizacion_version"
  FOR EACH ROW EXECUTE FUNCTION "cotizacion_version_inmutable"();

-- ---------------------------------------------------------------------------
-- Funciones de escritura (SECURITY INVOKER: se ejecutan con los permisos de softarq_app).
-- Cada llamada es UNA sentencia: o se aplica todo (recurso, contador, evento e idempotencia) o
-- nada. No mantienen transacciones abiertas entre solicitudes. Errores de negocio:
-- RAISE 'SOFTARQ:<CODIGO>' (P0001), que la API traduce a HTTP.
-- Los datos que reciben ya están validados por la API (contratos Zod); aquí solo se comprueban
-- pertenencia a la organización, estado activo, revisión y unicidad.
-- ---------------------------------------------------------------------------

-- Contador atómico por organización y entidad (tblContadores). Nunca MAX + 1: el UPSERT bloquea
-- la fila del contador hasta el fin de la sentencia que lo llama.
CREATE FUNCTION "softarq_siguiente"(p_org UUID, p_entidad TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO contador AS c (organizacion_id, entidad, ultimo)
  VALUES (p_org, p_entidad, 1)
  ON CONFLICT (organizacion_id, entidad) DO UPDATE SET ultimo = c.ultimo + 1
  RETURNING c.ultimo INTO v_n;
  -- El CHECK contador_ultimo_ck también lo impide; aquí se da un mensaje claro.
  IF v_n > 99999 THEN
    RAISE EXCEPTION 'SOFTARQ:CONTADOR_AGOTADO' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_n;
END;
$$;

-- Registro de idempotencia. Si la clave ya existe (otra solicitud confirmada), PostgreSQL lanza
-- unique_violation sobre idempotencia_pkey y la API reproduce el resultado guardado.
CREATE FUNCTION "softarq_registrar_idempotencia"(
  p_org UUID, p_usuario UUID, p_clave UUID, p_operacion TEXT, p_huella BYTEA,
  p_recurso_tipo TEXT, p_recurso UUID, p_expira TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO idempotencia (organizacion_id, usuario_id, clave, operacion, huella_solicitud, recurso_tipo, recurso_id, expira_en)
  VALUES (p_org, p_usuario, p_clave, p_operacion, p_huella, p_recurso_tipo, p_recurso, p_expira);
END;
$$;

CREATE FUNCTION "softarq_crear_cliente"(
  p_org UUID, p_usuario UUID, p_nombre TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'cliente', v_id, p_expira);
  v_n := softarq_siguiente(p_org, 'CLI');
  INSERT INTO cliente (id, organizacion_id, codigo, nombre, creado_por, modificado_por)
  VALUES (v_id, p_org, 'CLI-' || lpad(v_n::TEXT, 5, '0'), p_nombre, p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cliente', v_id, 'CLIENTE_CREADO', p_usuario, '{}'::JSONB);
  RETURN v_id;
END;
$$;

CREATE FUNCTION "softarq_crear_proyecto"(
  p_org UUID, p_usuario UUID, p_cliente UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
  v_activo BOOLEAN;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'proyecto', v_id, p_expira);
  -- FOR SHARE: el cliente no puede desactivarse mientras se crea el proyecto.
  SELECT activo INTO v_activo FROM cliente WHERE id = p_cliente AND organizacion_id = p_org FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'SOFTARQ:CLIENTE_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  v_n := softarq_siguiente(p_org, 'PRY');
  INSERT INTO proyecto (id, organizacion_id, cliente_id, codigo, nombre, municipio, entidad_federativa, descripcion, creado_por, modificado_por)
  VALUES (
    v_id, p_org, p_cliente, 'PRY-' || lpad(v_n::TEXT, 5, '0'),
    p_datos->>'nombre', p_datos->>'municipio', p_datos->>'entidadFederativa', p_datos->>'descripcion',
    p_usuario, p_usuario
  );
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'proyecto', v_id, 'PROYECTO_CREADO', p_usuario, jsonb_build_object('clienteId', p_cliente));
  RETURN v_id;
END;
$$;

-- Edición con control de concurrencia optimista. p_cambios solo trae las claves que cambian
-- (nombre, activo). Devuelve la revisión resultante; sin cambios efectivos no la incrementa.
CREATE FUNCTION "softarq_editar_cliente"(
  p_org UUID, p_usuario UUID, p_id UUID, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v cliente%ROWTYPE;
  v_nombre TEXT;
  v_activo BOOLEAN;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO v FROM cliente WHERE id = p_id AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  v_nombre := CASE WHEN p_cambios ? 'nombre' THEN p_cambios->>'nombre' ELSE v.nombre END;
  v_activo := CASE WHEN p_cambios ? 'activo' THEN (p_cambios->>'activo')::BOOLEAN ELSE v.activo END;
  IF v_nombre IS DISTINCT FROM v.nombre THEN v_campos := array_append(v_campos, 'nombre'); END IF;
  IF cardinality(v_campos) = 0 AND v_activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE cliente
     SET nombre = v_nombre, activo = v_activo, revision = revision + 1,
         modificado_por = p_usuario, modificado_en = now()
   WHERE id = p_id AND organizacion_id = p_org;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'cliente', p_id, 'CLIENTE_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF v_activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'cliente', p_id, CASE WHEN v_activo THEN 'CLIENTE_REACTIVADO' ELSE 'CLIENTE_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END;
$$;

CREATE FUNCTION "softarq_editar_proyecto"(
  p_org UUID, p_usuario UUID, p_id UUID, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v proyecto%ROWTYPE;
  n proyecto%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO v FROM proyecto WHERE id = p_id AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'nombre' THEN n.nombre := p_cambios->>'nombre'; END IF;
  IF p_cambios ? 'municipio' THEN n.municipio := p_cambios->>'municipio'; END IF;
  IF p_cambios ? 'entidadFederativa' THEN n.entidad_federativa := p_cambios->>'entidadFederativa'; END IF;
  IF p_cambios ? 'descripcion' THEN n.descripcion := p_cambios->>'descripcion'; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.nombre IS DISTINCT FROM v.nombre THEN v_campos := array_append(v_campos, 'nombre'); END IF;
  IF n.municipio IS DISTINCT FROM v.municipio THEN v_campos := array_append(v_campos, 'municipio'); END IF;
  IF n.entidad_federativa IS DISTINCT FROM v.entidad_federativa THEN v_campos := array_append(v_campos, 'entidadFederativa'); END IF;
  IF n.descripcion IS DISTINCT FROM v.descripcion THEN v_campos := array_append(v_campos, 'descripcion'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE proyecto
     SET nombre = n.nombre, municipio = n.municipio, entidad_federativa = n.entidad_federativa,
         descripcion = n.descripcion, activo = n.activo, revision = revision + 1,
         modificado_por = p_usuario, modificado_en = now()
   WHERE id = p_id AND organizacion_id = p_org;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'proyecto', p_id, 'PROYECTO_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'proyecto', p_id, CASE WHEN n.activo THEN 'PROYECTO_REACTIVADO' ELSE 'PROYECTO_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END;
$$;

-- Nueva cotización: reserva el folio al crear el borrador (modIds.bas, D-14). El cliente sale
-- del proyecto; ambos deben estar activos. Folio por organización y año, sin MAX + 1.
CREATE FUNCTION "softarq_crear_cotizacion"(
  p_org UUID, p_usuario UUID, p_proyecto UUID, p_anio INTEGER, p_captura JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
  v_folio TEXT;
  v_cliente UUID;
  v_pry_activo BOOLEAN;
  v_cli_activo BOOLEAN;
BEGIN
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'cotizacion', v_id, p_expira);
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
  INSERT INTO cotizacion (id, organizacion_id, folio, anio_folio, origen, cliente_id, proyecto_id, creado_por)
  VALUES (v_id, p_org, v_folio, p_anio, 'WEB_DEMO', v_cliente, p_proyecto, p_usuario);
  INSERT INTO cotizacion_borrador (cotizacion_id, organizacion_id, captura, revision, actualizado_por)
  VALUES (v_id, p_org, p_captura, 0, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', v_id, 'COTIZACION_CREADA', p_usuario, jsonb_build_object('folio', v_folio));
  RETURN v_id;
END;
$$;

-- Guardar el borrador solo si sigue en la revisión esperada (sin sobrescrituras silenciosas).
-- Dos guardados simultáneos con la misma revisión: el segundo espera el bloqueo de fila,
-- reevalúa la condición y no encuentra fila (CONFLICTO_EDICION).
CREATE FUNCTION "softarq_guardar_borrador"(
  p_org UUID, p_usuario UUID, p_cotizacion UUID, p_revision INTEGER, p_captura JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_rev INTEGER;
BEGIN
  UPDATE cotizacion_borrador
     SET captura = p_captura, revision = revision + 1, actualizado_por = p_usuario, actualizado_en = now()
   WHERE cotizacion_id = p_cotizacion AND organizacion_id = p_org AND revision = p_revision
  RETURNING revision INTO v_rev;
  IF NOT FOUND THEN
    PERFORM 1 FROM cotizacion_borrador WHERE cotizacion_id = p_cotizacion AND organizacion_id = p_org;
    IF FOUND THEN
      RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', p_cotizacion, 'BORRADOR_GUARDADO', p_usuario, jsonb_build_object('revision', v_rev));
  RETURN v_rev;
END;
$$;

-- Fase B de «calcular y guardar versión» (ADR-0008 §5). Recibe la instantánea calculada en la
-- fase A (lectura REPEATABLE READ de borrador, catálogos y datos descriptivos) y la guarda solo si:
-- - el borrador sigue en la revisión calculada (si no, BORRADOR_DESACTUALIZADO);
-- - cliente y proyecto siguen activos (BL-01/BL-02);
-- - la versión anterior es la que se usó para el resumen de cambios (si no, VERSION_CONCURRENTE
--   y la API repite la fase A).
-- El número se asigna con UPDATE … RETURNING sobre la fila bloqueada de la cotización.
CREATE FUNCTION "softarq_crear_version"(
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
