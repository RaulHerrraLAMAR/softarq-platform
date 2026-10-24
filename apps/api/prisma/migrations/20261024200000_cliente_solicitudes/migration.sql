-- Módulo 17, E1 (ADR-0021): cliente externo de la app, trabajos para clientes, precios de referencia,
-- solicitudes y estimaciones preliminares. Aditiva: no modifica datos, versiones, emisiones ni documentos.
--
-- Parte 1 (generada por Prisma): tablas, índices y claves foráneas.
-- Parte 2 (a mano, al final): CHECK, coherencia, disparadores, funciones SECURITY DEFINER y permisos.
--
-- Decisiones que conviene saber al leerla:
-- - La cuenta de un cliente es un `usuario` con una `membresia` de función exclusiva CLIENTE (las sesiones se
--   ligan por FK compuesta a la pertenencia) y un `acceso_cliente` que la vincula con UN Cliente. Disparadores
--   diferidos garantizan que una pertenencia CLIENTE tenga siempre su acceso y viceversa.
-- - Toda escritura pasa por funciones SECURITY DEFINER que recalculan el cliente desde la identidad de la
--   sesión (`softarq_exigir_cliente`); ningún identificador de cliente u organización llega del teléfono.
-- - La cotización que nace de una solicitud conserva origen WEB_DEMO (lo exigen los CHECK de la emisión);
--   `cotizacion.solicitud_id` la identifica como originada por un cliente.
-- - Las estimaciones son de solo alta (disparador). La solicitud solo avanza por transiciones válidas.

-- AlterTable
ALTER TABLE "cotizacion" ADD COLUMN     "solicitud_id" UUID;

-- CreateTable
CREATE TABLE "acceso_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceso_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajo_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "ilustracion" VARCHAR(10) NOT NULL,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "modificado_por" UUID,
    "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trabajo_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opcion_trabajo_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "concepto_id" UUID NOT NULL,
    "consolidar_compras" BOOLEAN NOT NULL,
    "medidas" JSONB NOT NULL,
    "orden" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "opcion_trabajo_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referencia_estimacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "insumo_id" UUID NOT NULL,
    "precio_id" UUID NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "designada_por" UUID,
    "designada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retirada_por" UUID,
    "retirada_en" TIMESTAMPTZ(3),
    "motivo_retiro" VARCHAR(200),

    CONSTRAINT "referencia_estimacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "anio" INTEGER NOT NULL,
    "cliente_id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "estado" VARCHAR(15) NOT NULL,
    "captura" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "creada_por" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_en" TIMESTAMPTZ(3),
    "retirada_en" TIMESTAMPTZ(3),
    "atendida_por" UUID,
    "atendida_en" TIMESTAMPTZ(3),

    CONSTRAINT "solicitud_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimacion_solicitud" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "revision_captura" INTEGER NOT NULL,
    "estado" VARCHAR(15) NOT NULL,
    "captura" JSONB NOT NULL,
    "referencias" JSONB NOT NULL,
    "parametros" JSONB,
    "motivo_codigo" VARCHAR(20),
    "comercial" JSONB,
    "avisos" JSONB NOT NULL,
    "entrada" JSONB,
    "resultado" JSONB,
    "huella" BYTEA NOT NULL,
    "fecha_calculo" DATE NOT NULL,
    "calculada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimacion_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acceso_cliente_usuario_id_key" ON "acceso_cliente"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "acceso_cliente_organizacion_id_cliente_id_key" ON "acceso_cliente"("organizacion_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "acceso_cliente_organizacion_id_usuario_id_key" ON "acceso_cliente"("organizacion_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "trabajo_cliente_organizacion_id_id_key" ON "trabajo_cliente"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trabajo_cliente_organizacion_id_codigo_key" ON "trabajo_cliente"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "opcion_trabajo_cliente_organizacion_id_trabajo_id_codigo_key" ON "opcion_trabajo_cliente"("organizacion_id", "trabajo_id", "codigo");

-- CreateIndex
CREATE INDEX "referencia_estimacion_organizacion_id_insumo_id_idx" ON "referencia_estimacion"("organizacion_id", "insumo_id");

-- CreateIndex
CREATE INDEX "solicitud_cliente_organizacion_id_cliente_id_actualizada_en_idx" ON "solicitud_cliente"("organizacion_id", "cliente_id", "actualizada_en");

-- CreateIndex
CREATE INDEX "solicitud_cliente_organizacion_id_estado_enviada_en_idx" ON "solicitud_cliente"("organizacion_id", "estado", "enviada_en");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_cliente_organizacion_id_id_key" ON "solicitud_cliente"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_cliente_organizacion_id_folio_key" ON "solicitud_cliente"("organizacion_id", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "estimacion_solicitud_solicitud_id_numero_key" ON "estimacion_solicitud"("solicitud_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_organizacion_id_solicitud_id_key" ON "cotizacion"("organizacion_id", "solicitud_id");

-- CreateIndex
CREATE UNIQUE INDEX "precio_organizacion_id_id_key" ON "precio"("organizacion_id", "id");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_solicitud_fk" FOREIGN KEY ("organizacion_id", "solicitud_id") REFERENCES "solicitud_cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "acceso_cliente" ADD CONSTRAINT "acceso_cliente_organizacion_id_usuario_id_fkey" FOREIGN KEY ("organizacion_id", "usuario_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "acceso_cliente" ADD CONSTRAINT "acceso_cliente_organizacion_id_cliente_id_fkey" FOREIGN KEY ("organizacion_id", "cliente_id") REFERENCES "cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "acceso_cliente" ADD CONSTRAINT "acceso_cliente_organizacion_id_creado_por_fkey" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trabajo_cliente" ADD CONSTRAINT "trabajo_cliente_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trabajo_cliente" ADD CONSTRAINT "trabajo_cliente_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opcion_trabajo_cliente" ADD CONSTRAINT "opcion_trabajo_cliente_organizacion_id_trabajo_id_fkey" FOREIGN KEY ("organizacion_id", "trabajo_id") REFERENCES "trabajo_cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opcion_trabajo_cliente" ADD CONSTRAINT "opcion_trabajo_cliente_organizacion_id_concepto_id_fkey" FOREIGN KEY ("organizacion_id", "concepto_id") REFERENCES "concepto"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "referencia_estimacion" ADD CONSTRAINT "referencia_estimacion_organizacion_id_insumo_id_fkey" FOREIGN KEY ("organizacion_id", "insumo_id") REFERENCES "insumo"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "referencia_estimacion" ADD CONSTRAINT "referencia_estimacion_organizacion_id_precio_id_fkey" FOREIGN KEY ("organizacion_id", "precio_id") REFERENCES "precio"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "referencia_estimacion" ADD CONSTRAINT "referencia_designada_por_fk" FOREIGN KEY ("organizacion_id", "designada_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "referencia_estimacion" ADD CONSTRAINT "referencia_retirada_por_fk" FOREIGN KEY ("organizacion_id", "retirada_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "solicitud_cliente" ADD CONSTRAINT "solicitud_cliente_organizacion_id_cliente_id_proyecto_id_fkey" FOREIGN KEY ("organizacion_id", "cliente_id", "proyecto_id") REFERENCES "proyecto"("organizacion_id", "cliente_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "solicitud_cliente" ADD CONSTRAINT "solicitud_cliente_organizacion_id_cliente_id_fkey" FOREIGN KEY ("organizacion_id", "cliente_id") REFERENCES "cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "solicitud_cliente" ADD CONSTRAINT "solicitud_cliente_organizacion_id_creada_por_fkey" FOREIGN KEY ("organizacion_id", "creada_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "solicitud_cliente" ADD CONSTRAINT "solicitud_atendida_por_fk" FOREIGN KEY ("organizacion_id", "atendida_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "estimacion_solicitud" ADD CONSTRAINT "estimacion_solicitud_organizacion_id_solicitud_id_fkey" FOREIGN KEY ("organizacion_id", "solicitud_id") REFERENCES "solicitud_cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Parte 2 (a mano): restricciones, coherencia, funciones y permisos.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Función exclusiva CLIENTE: una pertenencia de cliente no mezcla funciones internas y exige su acceso.
-- ---------------------------------------------------------------------------
ALTER TABLE "membresia" DROP CONSTRAINT "membresia_funciones_ck";
ALTER TABLE "membresia"
  ADD CONSTRAINT "membresia_funciones_ck" CHECK (
    cardinality("funciones") >= 1
    AND (
      "funciones" <@ ARRAY['PREPARADOR', 'REVISOR', 'ADMIN_CATALOGO', 'ADMIN_SISTEMA']::VARCHAR(20)[]
      OR "funciones" = ARRAY['CLIENTE']::VARCHAR(20)[]
    )
  );

ALTER TABLE "acceso_cliente"
  ADD CONSTRAINT "acceso_cliente_distintos_ck" CHECK ("creado_por" <> "usuario_id");

ALTER TABLE "trabajo_cliente"
  ADD CONSTRAINT "trabajo_cliente_codigo_ck" CHECK ("codigo" ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  ADD CONSTRAINT "trabajo_cliente_nombre_ck" CHECK (btrim("nombre") <> '' AND "nombre" = btrim("nombre")),
  ADD CONSTRAINT "trabajo_cliente_ilustracion_ck" CHECK ("ilustracion" IN ('cubierta', 'losa', 'muro')),
  ADD CONSTRAINT "trabajo_cliente_orden_ck" CHECK ("orden" BETWEEN 0 AND 999 AND "revision" >= 0);

ALTER TABLE "opcion_trabajo_cliente"
  ADD CONSTRAINT "opcion_trabajo_cliente_codigo_ck" CHECK ("codigo" ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  ADD CONSTRAINT "opcion_trabajo_cliente_nombre_ck" CHECK (btrim("nombre") <> '' AND "nombre" = btrim("nombre")),
  ADD CONSTRAINT "opcion_trabajo_cliente_medidas_ck" CHECK (jsonb_typeof("medidas") = 'array' AND jsonb_array_length("medidas") BETWEEN 1 AND 3),
  ADD CONSTRAINT "opcion_trabajo_cliente_orden_ck" CHECK ("orden" BETWEEN 0 AND 999);

ALTER TABLE "referencia_estimacion"
  ADD CONSTRAINT "referencia_estimacion_motivo_ck" CHECK (btrim("motivo") <> ''),
  ADD CONSTRAINT "referencia_estimacion_retiro_ck" CHECK (
    ("retirada_en" IS NULL AND "retirada_por" IS NULL AND "motivo_retiro" IS NULL)
    OR ("retirada_en" IS NOT NULL AND "motivo_retiro" IS NOT NULL AND btrim("motivo_retiro") <> '')
  );
-- Una referencia activa por insumo (las retiradas son historial).
CREATE UNIQUE INDEX "referencia_estimacion_activa_uk" ON "referencia_estimacion"("organizacion_id", "insumo_id") WHERE "retirada_en" IS NULL;

ALTER TABLE "solicitud_cliente"
  ADD CONSTRAINT "solicitud_cliente_folio_ck" CHECK ("folio" ~ '^SOL-[0-9]{4}-[0-9]{5}$'),
  ADD CONSTRAINT "solicitud_cliente_anio_ck" CHECK ("anio" BETWEEN 2000 AND 9999),
  ADD CONSTRAINT "solicitud_cliente_estado_ck" CHECK ("estado" IN ('BORRADOR', 'ENVIADA', 'EN_PREPARACION', 'RETIRADA')),
  ADD CONSTRAINT "solicitud_cliente_captura_ck" CHECK (jsonb_typeof("captura") = 'object'),
  ADD CONSTRAINT "solicitud_cliente_revision_ck" CHECK ("revision" >= 0),
  ADD CONSTRAINT "solicitud_cliente_fechas_ck" CHECK (
    ("estado" = 'BORRADOR' AND "enviada_en" IS NULL)
    OR ("estado" IN ('ENVIADA', 'EN_PREPARACION') AND "enviada_en" IS NOT NULL)
    OR "estado" = 'RETIRADA'
  ),
  ADD CONSTRAINT "solicitud_cliente_atencion_ck" CHECK (
    ("estado" = 'EN_PREPARACION' AND "atendida_por" IS NOT NULL AND "atendida_en" IS NOT NULL)
    OR ("estado" <> 'EN_PREPARACION' AND "atendida_por" IS NULL AND "atendida_en" IS NULL)
  );

ALTER TABLE "estimacion_solicitud"
  ADD CONSTRAINT "estimacion_solicitud_numero_ck" CHECK ("numero" >= 1 AND "revision_captura" >= 0),
  ADD CONSTRAINT "estimacion_solicitud_estado_ck" CHECK (
    ("estado" = 'ESTIMADA' AND "comercial" IS NOT NULL AND "motivo_codigo" IS NULL)
    OR ("estado" = 'SIN_ESTIMACION' AND "comercial" IS NULL AND "motivo_codigo" IN ('FALTA_REFERENCIA', 'CONFIGURACION', 'PARAMETROS', 'MEDIDAS', 'NO_DISPONIBLE'))
  ),
  ADD CONSTRAINT "estimacion_solicitud_json_ck" CHECK (
    jsonb_typeof("captura") = 'object' AND jsonb_typeof("referencias") = 'array' AND jsonb_typeof("avisos") = 'array'
  ),
  ADD CONSTRAINT "estimacion_solicitud_huella_ck" CHECK (octet_length("huella") = 32);

-- Contadores, bitácora: nuevos identificadores y entidades.
ALTER TABLE "contador" DROP CONSTRAINT "contador_entidad_ck";
ALTER TABLE "contador"
  ADD CONSTRAINT "contador_entidad_ck" CHECK ("entidad" ~ '^(CLI|PRY|PRV|PCM|PRE|TMO|TES|INS|CON|CMP|COT-[0-9]{4}|SOL-[0-9]{4})$');

ALTER TABLE "bitacora" DROP CONSTRAINT "bitacora_entidad_ck";
ALTER TABLE "bitacora"
  ADD CONSTRAINT "bitacora_entidad_ck" CHECK ("entidad" IN ('cliente', 'proyecto', 'cotizacion', 'emisor', 'proveedor', 'producto',
    'precio', 'tarifa', 'concepto', 'tipo_estructura', 'insumo', 'conversion', 'componente', 'parametros', 'persona',
    'solicitud', 'acceso_cliente', 'referencia', 'trabajo_cliente'));

-- Coherencia entre la pertenencia CLIENTE y su acceso (se comprueba al cerrar la transacción: la función
-- de alta inserta primero la pertenencia y después el acceso).
CREATE FUNCTION "acceso_cliente_coherente"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'membresia' THEN
    IF 'CLIENTE' = ANY (NEW.funciones)
       AND NOT EXISTS (SELECT 1 FROM acceso_cliente a WHERE a.organizacion_id = NEW.organizacion_id AND a.usuario_id = NEW.usuario_id) THEN
      RAISE EXCEPTION 'La pertenencia de un cliente exige su acceso.' USING ERRCODE = '23514';
    END IF;
    -- Una cuenta con acceso de cliente no puede recibir funciones internas.
    IF NEW.funciones <> ARRAY['CLIENTE']::VARCHAR(20)[]
       AND EXISTS (SELECT 1 FROM acceso_cliente a WHERE a.organizacion_id = NEW.organizacion_id AND a.usuario_id = NEW.usuario_id) THEN
      RAISE EXCEPTION 'Una cuenta de cliente no puede tener funciones internas.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM membresia m WHERE m.organizacion_id = NEW.organizacion_id AND m.usuario_id = NEW.usuario_id
                    AND m.funciones = ARRAY['CLIENTE']::VARCHAR(20)[]) THEN
      RAISE EXCEPTION 'El acceso de un cliente exige una pertenencia con la función CLIENTE.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "membresia_cliente_coherente" AFTER INSERT OR UPDATE OF "funciones" ON "membresia"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "acceso_cliente_coherente"();
CREATE CONSTRAINT TRIGGER "acceso_cliente_coherente" AFTER INSERT OR UPDATE ON "acceso_cliente"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "acceso_cliente_coherente"();

-- Inmutabilidad: la estimación solo se agrega; el acceso nunca cambia de usuario ni de cliente.
CREATE FUNCTION "estimacion_solicitud_inmutable"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Las estimaciones son inmutables: solo se agregan.' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "estimacion_solicitud_inmutable" BEFORE UPDATE OR DELETE ON "estimacion_solicitud"
  FOR EACH ROW EXECUTE FUNCTION "estimacion_solicitud_inmutable"();

CREATE FUNCTION "acceso_cliente_fijo"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.organizacion_id, NEW.usuario_id, NEW.cliente_id, NEW.creado_por, NEW.creado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.usuario_id, OLD.cliente_id, OLD.creado_por, OLD.creado_en) THEN
    RAISE EXCEPTION 'El vínculo del acceso con su cliente no se modifica.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "acceso_cliente_fijo" BEFORE UPDATE ON "acceso_cliente"
  FOR EACH ROW EXECUTE FUNCTION "acceso_cliente_fijo"();

-- La solicitud solo avanza por las transiciones permitidas y no cambia de dueño, proyecto ni folio.
CREATE FUNCTION "solicitud_cliente_transicion"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.organizacion_id, NEW.folio, NEW.anio, NEW.cliente_id, NEW.proyecto_id, NEW.creada_por, NEW.creada_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.folio, OLD.anio, OLD.cliente_id, OLD.proyecto_id, OLD.creada_por, OLD.creada_en) THEN
    RAISE EXCEPTION 'La identidad de la solicitud no se modifica.' USING ERRCODE = '23514';
  END IF;
  IF NEW.estado <> OLD.estado AND NOT (
       (OLD.estado = 'BORRADOR' AND NEW.estado IN ('ENVIADA', 'RETIRADA'))
    OR (OLD.estado = 'ENVIADA' AND NEW.estado IN ('EN_PREPARACION', 'RETIRADA'))) THEN
    RAISE EXCEPTION 'Transición de solicitud no permitida: % → %.', OLD.estado, NEW.estado USING ERRCODE = '23514';
  END IF;
  IF OLD.estado <> 'BORRADOR' AND NEW.captura IS DISTINCT FROM OLD.captura THEN
    RAISE EXCEPTION 'La captura de una solicitud enviada no se modifica.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "solicitud_cliente_transicion" BEFORE UPDATE ON "solicitud_cliente"
  FOR EACH ROW EXECUTE FUNCTION "solicitud_cliente_transicion"();

-- ---------------------------------------------------------------------------
-- Identidad del cliente. SECURITY DEFINER (propietario: rol migrador; search_path fijo).
-- ---------------------------------------------------------------------------

-- Cliente vinculado a la cuenta: cuenta, pertenencia y cliente activos, función exclusiva CLIENTE.
-- Nada de lo que envía el teléfono interviene: la API solo pasa la identidad de su sesión.
CREATE FUNCTION "softarq_exigir_cliente"(p_org UUID, p_usuario UUID) RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID;
BEGIN
  SELECT a.cliente_id INTO v_cliente
    FROM acceso_cliente a
    JOIN membresia m ON m.organizacion_id = a.organizacion_id AND m.usuario_id = a.usuario_id
    JOIN usuario u ON u.id = a.usuario_id
    JOIN cliente c ON c.organizacion_id = a.organizacion_id AND c.id = a.cliente_id
   WHERE a.organizacion_id = p_org AND a.usuario_id = p_usuario
     AND a.activo AND m.activa AND u.activo AND c.activo
     AND m.funciones = ARRAY['CLIENTE']::VARCHAR(20)[];
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:SIN_PERMISO' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_cliente;
END $$;

-- Alta del acceso (Administrador del sistema): usuario nuevo con contraseña temporal, pertenencia CLIENTE y vínculo.
CREATE FUNCTION "softarq_crear_acceso_cliente"(
  p_org UUID, p_admin UUID, p_cliente UUID, p_datos JSONB, p_hash TEXT, p_temporal_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_correo TEXT := lower(btrim(p_datos->>'correo'));
  v_demo BOOLEAN;
  v_activo BOOLEAN;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_SISTEMA');
  SELECT es_demo INTO v_demo FROM organizacion WHERE id = p_org FOR UPDATE;
  SELECT activo INTO v_activo FROM cliente WHERE id = p_cliente AND organizacion_id = p_org FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'SOFTARQ:CLIENTE_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM acceso_cliente WHERE organizacion_id = p_org AND cliente_id = p_cliente) THEN
    RAISE EXCEPTION 'SOFTARQ:ACCESO_EXISTENTE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM usuario WHERE correo = v_correo) THEN
    RAISE EXCEPTION 'SOFTARQ:CORREO_EXISTENTE' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO usuario (id, correo, nombre, hash_contrasena, es_demo, contrasena_temporal_expira_en)
  VALUES (v_id, v_correo, btrim(p_datos->>'nombre'), p_hash, v_demo, p_temporal_expira);
  INSERT INTO membresia (organizacion_id, usuario_id, funciones, modificada_por)
  VALUES (p_org, v_id, ARRAY['CLIENTE']::VARCHAR(20)[], p_admin);
  INSERT INTO acceso_cliente (organizacion_id, usuario_id, cliente_id, creado_por)
  VALUES (p_org, v_id, p_cliente, p_admin);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'acceso_cliente', v_id, 'ACCESO_CLIENTE_CREADO', p_admin,
          jsonb_build_object('clienteId', p_cliente, 'motivo', p_datos->>'motivo', 'temporalExpiraEn', p_temporal_expira));
  RETURN v_id;
END $$;

-- Activar o desactivar el acceso (Administrador del sistema). Al desactivar se revocan todas sus sesiones.
CREATE FUNCTION "softarq_estado_acceso_cliente"(p_org UUID, p_admin UUID, p_usuario UUID, p_activo BOOLEAN, p_motivo TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_revocadas INTEGER := 0;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_SISTEMA');
  PERFORM 1 FROM organizacion WHERE id = p_org FOR UPDATE;
  PERFORM 1 FROM acceso_cliente WHERE organizacion_id = p_org AND usuario_id = p_usuario FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  UPDATE acceso_cliente SET activo = p_activo, modificado_en = now() WHERE organizacion_id = p_org AND usuario_id = p_usuario;
  UPDATE membresia SET activa = p_activo, revision = revision + 1, modificada_por = p_admin, modificada_en = now()
   WHERE organizacion_id = p_org AND usuario_id = p_usuario;
  IF NOT p_activo THEN
    UPDATE sesion SET revocada_en = now(), motivo_revocacion = 'DESACTIVADA'
     WHERE organizacion_id = p_org AND usuario_id = p_usuario AND revocada_en IS NULL;
    GET DIAGNOSTICS v_revocadas = ROW_COUNT;
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'acceso_cliente', p_usuario, CASE WHEN p_activo THEN 'ACCESO_CLIENTE_REACTIVADO' ELSE 'ACCESO_CLIENTE_DESACTIVADO' END, p_admin,
          jsonb_build_object('motivo', p_motivo, 'sesionesRevocadas', v_revocadas));
END $$;

-- La administración de personas no toca las cuentas de cliente (se gestionan con las funciones de acceso).
CREATE OR REPLACE FUNCTION "softarq_editar_persona"(
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
  IF NOT FOUND OR 'CLIENTE' = ANY (m.funciones) THEN
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

-- ---------------------------------------------------------------------------
-- Proyectos y solicitudes del cliente. Cada función recalcula el cliente desde la sesión
-- (`softarq_exigir_cliente`): ningún identificador de cliente llega del teléfono.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "softarq_cliente_crear_proyecto"(p_org UUID, p_usuario UUID, p_datos JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID := softarq_exigir_cliente(p_org, p_usuario);
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
BEGIN
  v_n := softarq_siguiente(p_org, 'PRY');
  INSERT INTO proyecto (id, organizacion_id, cliente_id, codigo, nombre, municipio, entidad_federativa, descripcion, creado_por, modificado_por)
  VALUES (v_id, p_org, v_cliente, 'PRY-' || lpad(v_n::TEXT, 5, '0'),
          btrim(p_datos->>'nombre'), btrim(p_datos->>'municipio'), btrim(p_datos->>'entidadFederativa'), nullif(btrim(coalesce(p_datos->>'descripcion', '')), ''),
          p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'proyecto', v_id, 'PROYECTO_CREADO', p_usuario, jsonb_build_object('clienteId', v_cliente, 'canal', 'APP_CLIENTE'));
  RETURN v_id;
END $$;

CREATE FUNCTION "softarq_cliente_crear_solicitud"(p_org UUID, p_usuario UUID, p_proyecto UUID, p_anio INTEGER, p_captura JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID := softarq_exigir_cliente(p_org, p_usuario);
  v_id UUID := gen_random_uuid();
  v_activo BOOLEAN;
  v_n INTEGER;
  v_folio TEXT;
BEGIN
  SELECT activo INTO v_activo FROM proyecto WHERE id = p_proyecto AND organizacion_id = p_org AND cliente_id = v_cliente FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROYECTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  v_n := softarq_siguiente(p_org, 'SOL-' || p_anio::TEXT);
  v_folio := 'SOL-' || p_anio::TEXT || '-' || lpad(v_n::TEXT, 5, '0');
  INSERT INTO solicitud_cliente (id, organizacion_id, folio, anio, cliente_id, proyecto_id, estado, captura, creada_por)
  VALUES (v_id, p_org, v_folio, p_anio, v_cliente, p_proyecto, 'BORRADOR', p_captura, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'solicitud', v_id, 'SOLICITUD_CREADA', p_usuario, jsonb_build_object('folio', v_folio, 'proyectoId', p_proyecto));
  RETURN v_id;
END $$;

CREATE FUNCTION "softarq_cliente_guardar_solicitud"(p_org UUID, p_usuario UUID, p_id UUID, p_revision INTEGER, p_captura JSONB) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID := softarq_exigir_cliente(p_org, p_usuario);
  s solicitud_cliente%ROWTYPE;
BEGIN
  SELECT * INTO s FROM solicitud_cliente WHERE id = p_id AND organizacion_id = p_org AND cliente_id = v_cliente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF s.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'SOFTARQ:SOLICITUD_NO_EDITABLE' USING ERRCODE = 'P0001';
  END IF;
  IF s.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  UPDATE solicitud_cliente SET captura = p_captura, revision = revision + 1, actualizada_en = now() WHERE id = s.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'solicitud', s.id, 'SOLICITUD_GUARDADA', p_usuario, jsonb_build_object('revision', s.revision + 1));
  RETURN s.revision + 1;
END $$;

-- Envío idempotente: devuelve TRUE si la solicitud ya estaba enviada (reintento) y no repite el evento.
CREATE FUNCTION "softarq_cliente_enviar_solicitud"(p_org UUID, p_usuario UUID, p_id UUID, p_revision INTEGER) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID := softarq_exigir_cliente(p_org, p_usuario);
  s solicitud_cliente%ROWTYPE;
BEGIN
  SELECT * INTO s FROM solicitud_cliente WHERE id = p_id AND organizacion_id = p_org AND cliente_id = v_cliente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF s.estado IN ('ENVIADA', 'EN_PREPARACION') THEN
    RETURN TRUE;
  END IF;
  IF s.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'SOFTARQ:ESTADO_SOLICITUD_NO_PERMITE' USING ERRCODE = 'P0001';
  END IF;
  IF s.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(coalesce(s.captura->'trabajos', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'SOFTARQ:SOLICITUD_INCOMPLETA' USING ERRCODE = 'P0001';
  END IF;
  UPDATE solicitud_cliente SET estado = 'ENVIADA', enviada_en = now(), actualizada_en = now() WHERE id = s.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'solicitud', s.id, 'SOLICITUD_ENVIADA', p_usuario, jsonb_build_object('folio', s.folio, 'revision', s.revision));
  RETURN FALSE;
END $$;

CREATE FUNCTION "softarq_cliente_retirar_solicitud"(p_org UUID, p_usuario UUID, p_id UUID, p_motivo TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID := softarq_exigir_cliente(p_org, p_usuario);
  s solicitud_cliente%ROWTYPE;
BEGIN
  SELECT * INTO s FROM solicitud_cliente WHERE id = p_id AND organizacion_id = p_org AND cliente_id = v_cliente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF s.estado = 'RETIRADA' THEN
    RETURN TRUE;
  END IF;
  IF s.estado NOT IN ('BORRADOR', 'ENVIADA') THEN
    RAISE EXCEPTION 'SOFTARQ:ESTADO_SOLICITUD_NO_PERMITE' USING ERRCODE = 'P0001';
  END IF;
  UPDATE solicitud_cliente SET estado = 'RETIRADA', retirada_en = now(), actualizada_en = now() WHERE id = s.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'solicitud', s.id, 'SOLICITUD_RETIRADA', p_usuario, jsonb_build_object('folio', s.folio, 'motivo', p_motivo));
  RETURN FALSE;
END $$;

-- Instantánea de una estimación: solo sobre un BORRADOR propio y en la revisión que se estimó.
CREATE FUNCTION "softarq_cliente_registrar_estimacion"(
  p_org UUID, p_usuario UUID, p_solicitud UUID, p_revision INTEGER, p_datos JSONB, p_huella BYTEA
) RETURNS TABLE (id UUID, numero INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cliente UUID := softarq_exigir_cliente(p_org, p_usuario);
  s solicitud_cliente%ROWTYPE;
  v_id UUID := gen_random_uuid();
  v_num INTEGER;
BEGIN
  SELECT * INTO s FROM solicitud_cliente WHERE solicitud_cliente.id = p_solicitud AND organizacion_id = p_org AND cliente_id = v_cliente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF s.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'SOFTARQ:SOLICITUD_NO_EDITABLE' USING ERRCODE = 'P0001';
  END IF;
  IF s.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(max(e.numero), 0) + 1 INTO v_num FROM estimacion_solicitud e WHERE e.solicitud_id = s.id;
  INSERT INTO estimacion_solicitud (id, organizacion_id, solicitud_id, numero, revision_captura, estado, captura, referencias, parametros,
                                    motivo_codigo, comercial, avisos, entrada, resultado, huella, fecha_calculo)
  VALUES (v_id, p_org, s.id, v_num, s.revision, p_datos->>'estado', s.captura, p_datos->'referencias',
          CASE WHEN jsonb_typeof(p_datos->'parametros') = 'object' THEN p_datos->'parametros' END,
          p_datos->>'motivoCodigo',
          CASE WHEN jsonb_typeof(p_datos->'comercial') = 'object' THEN p_datos->'comercial' END,
          p_datos->'avisos',
          CASE WHEN jsonb_typeof(p_datos->'entrada') = 'object' THEN p_datos->'entrada' END,
          CASE WHEN jsonb_typeof(p_datos->'resultado') = 'object' THEN p_datos->'resultado' END,
          p_huella, (p_datos->>'fechaCalculo')::DATE);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'solicitud', s.id, 'ESTIMACION_REGISTRADA', p_usuario,
          jsonb_build_object('numero', v_num, 'estado', p_datos->>'estado', 'revision', s.revision));
  RETURN QUERY SELECT v_id, v_num;
END $$;

-- ---------------------------------------------------------------------------
-- Precios de referencia y trabajos para clientes (Administrador del catálogo).
-- ---------------------------------------------------------------------------

CREATE FUNCTION "softarq_designar_referencia"(p_org UUID, p_admin UUID, p_insumo UUID, p_precio UUID, p_fecha DATE, p_motivo TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_insumo_activo BOOLEAN;
  p RECORD;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_CATALOGO');
  SELECT activo INTO v_insumo_activo FROM insumo WHERE id = p_insumo AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_insumo_activo THEN
    RAISE EXCEPTION 'SOFTARQ:INSUMO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  SELECT pr.id, pr.producto_id, pr.anulado, pr.vigente_desde, pr.vigente_hasta, d.insumo_id, d.activo AS producto_activo, v.activo AS proveedor_activo
    INTO p
    FROM precio pr
    JOIN producto d ON d.organizacion_id = pr.organizacion_id AND d.id = pr.producto_id
    JOIN proveedor v ON v.organizacion_id = pr.organizacion_id AND v.id = pr.proveedor_id
   WHERE pr.id = p_precio AND pr.organizacion_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF p.insumo_id <> p_insumo THEN
    RAISE EXCEPTION 'SOFTARQ:REFERENCIA_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF p.anulado THEN
    RAISE EXCEPTION 'SOFTARQ:PRECIO_ANULADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p.producto_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PRODUCTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p.proveedor_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROVEEDOR_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF p_fecha < p.vigente_desde OR p_fecha > p.vigente_hasta THEN
    RAISE EXCEPTION 'SOFTARQ:PRECIO_NO_VIGENTE' USING ERRCODE = 'P0001';
  END IF;
  UPDATE referencia_estimacion
     SET retirada_en = now(), retirada_por = p_admin, motivo_retiro = 'Sustituida por una referencia nueva'
   WHERE organizacion_id = p_org AND insumo_id = p_insumo AND retirada_en IS NULL;
  INSERT INTO referencia_estimacion (id, organizacion_id, insumo_id, precio_id, motivo, designada_por)
  VALUES (v_id, p_org, p_insumo, p_precio, btrim(p_motivo), p_admin);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'referencia', v_id, 'REFERENCIA_DESIGNADA', p_admin,
          jsonb_build_object('insumoId', p_insumo, 'precioId', p_precio, 'motivo', btrim(p_motivo)));
  RETURN v_id;
END $$;

CREATE FUNCTION "softarq_retirar_referencia"(p_org UUID, p_admin UUID, p_insumo UUID, p_motivo TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_CATALOGO');
  UPDATE referencia_estimacion
     SET retirada_en = now(), retirada_por = p_admin, motivo_retiro = btrim(p_motivo)
   WHERE organizacion_id = p_org AND insumo_id = p_insumo AND retirada_en IS NULL
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'referencia', v_id, 'REFERENCIA_RETIRADA', p_admin, jsonb_build_object('insumoId', p_insumo, 'motivo', btrim(p_motivo)));
  RETURN v_id;
END $$;

-- Alta o edición de un trabajo con sus opciones (por código). Las opciones que no se mencionan quedan inactivas.
CREATE FUNCTION "softarq_guardar_trabajo_cliente"(p_org UUID, p_admin UUID, p_datos JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID;
  o JSONB;
  v_concepto UUID;
  v_codigos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_CATALOGO');
  PERFORM 1 FROM organizacion WHERE id = p_org FOR UPDATE;
  INSERT INTO trabajo_cliente (organizacion_id, codigo, nombre, descripcion, ilustracion, orden, activo, modificado_por)
  VALUES (p_org, p_datos->>'codigo', btrim(p_datos->>'nombre'), btrim(p_datos->>'descripcion'), p_datos->>'ilustracion',
          (p_datos->>'orden')::INTEGER, (p_datos->>'activo')::BOOLEAN, p_admin)
  ON CONFLICT (organizacion_id, codigo) DO UPDATE
     SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, ilustracion = EXCLUDED.ilustracion, orden = EXCLUDED.orden,
         activo = EXCLUDED.activo, revision = trabajo_cliente.revision + 1, modificado_por = p_admin, modificado_en = now()
  RETURNING id INTO v_id;
  FOR o IN SELECT * FROM jsonb_array_elements(p_datos->'opciones') LOOP
    SELECT id INTO v_concepto FROM concepto WHERE organizacion_id = p_org AND codigo = o->>'conceptoCodigo';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO opcion_trabajo_cliente (organizacion_id, trabajo_id, codigo, nombre, descripcion, concepto_id, consolidar_compras, medidas, orden, activa)
    VALUES (p_org, v_id, o->>'codigo', btrim(o->>'nombre'), btrim(o->>'descripcion'), v_concepto,
            (o->>'consolidarCompras')::BOOLEAN, o->'medidas', (o->>'orden')::INTEGER, (o->>'activa')::BOOLEAN)
    ON CONFLICT (organizacion_id, trabajo_id, codigo) DO UPDATE
       SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, concepto_id = EXCLUDED.concepto_id,
           consolidar_compras = EXCLUDED.consolidar_compras, medidas = EXCLUDED.medidas, orden = EXCLUDED.orden, activa = EXCLUDED.activa;
    v_codigos := v_codigos || (o->>'codigo');
  END LOOP;
  UPDATE opcion_trabajo_cliente SET activa = FALSE
   WHERE organizacion_id = p_org AND trabajo_id = v_id AND NOT (codigo = ANY (v_codigos));
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'trabajo_cliente', v_id, 'TRABAJO_CLIENTE_GUARDADO', p_admin,
          jsonb_build_object('codigo', p_datos->>'codigo', 'opciones', to_jsonb(v_codigos), 'motivo', p_datos->>'motivo'));
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- Atención de la solicitud (Preparador): crea la cotización en borrador SIN precios elegidos ni compras
-- consolidadas. Las referencias de la estimación no se heredan. Reintento: devuelve la cotización existente.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "softarq_atender_solicitud"(p_org UUID, p_usuario UUID, p_solicitud UUID, p_revision INTEGER, p_anio INTEGER, p_captura JSONB)
RETURNS TABLE (cotizacion_id UUID, folio TEXT, repetida BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s solicitud_cliente%ROWTYPE;
  v_id UUID := gen_random_uuid();
  v_n INTEGER;
  v_folio TEXT;
  v_activo BOOLEAN;
  v_pry_activo BOOLEAN;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'PREPARADOR');
  SELECT * INTO s FROM solicitud_cliente WHERE solicitud_cliente.id = p_solicitud AND organizacion_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF s.estado = 'EN_PREPARACION' THEN
    RETURN QUERY SELECT q.id, q.folio::TEXT, TRUE FROM cotizacion q WHERE q.organizacion_id = p_org AND q.solicitud_id = s.id;
    RETURN;
  END IF;
  IF s.estado <> 'ENVIADA' THEN
    RAISE EXCEPTION 'SOFTARQ:ESTADO_SOLICITUD_NO_PERMITE' USING ERRCODE = 'P0001';
  END IF;
  IF s.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.activo, p.activo INTO v_activo, v_pry_activo
    FROM proyecto p JOIN cliente c ON c.organizacion_id = p.organizacion_id AND c.id = p.cliente_id
   WHERE p.id = s.proyecto_id AND p.organizacion_id = p_org FOR SHARE OF p, c;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'SOFTARQ:CLIENTE_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_pry_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROYECTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  v_n := softarq_siguiente(p_org, 'COT-' || p_anio::TEXT);
  v_folio := 'COT-' || p_anio::TEXT || '-' || lpad(v_n::TEXT, 5, '0');
  -- El origen sigue siendo WEB_DEMO (lo exigen los CHECK de la emisión); `solicitud_id` identifica el origen cliente.
  INSERT INTO cotizacion (id, organizacion_id, folio, anio_folio, origen, cliente_id, proyecto_id, creado_por, solicitud_id)
  VALUES (v_id, p_org, v_folio, p_anio, 'WEB_DEMO', s.cliente_id, s.proyecto_id, p_usuario, s.id);
  INSERT INTO cotizacion_borrador (cotizacion_id, organizacion_id, captura, revision, actualizado_por)
  VALUES (v_id, p_org, p_captura, 0, p_usuario);
  UPDATE solicitud_cliente SET estado = 'EN_PREPARACION', atendida_por = p_usuario, atendida_en = now(), actualizada_en = now() WHERE id = s.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cotizacion', v_id, 'COTIZACION_CREADA', p_usuario, jsonb_build_object('folio', v_folio, 'solicitudId', s.id));
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'solicitud', s.id, 'SOLICITUD_ATENDIDA', p_usuario, jsonb_build_object('folio', s.folio, 'cotizacionId', v_id));
  RETURN QUERY SELECT v_id, v_folio, FALSE;
END $$;

-- ---------------------------------------------------------------------------
-- Ninguna de estas funciones se ejecuta por PUBLIC; el rol de la aplicación recibe EXECUTE en permisos-app.sql.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "acceso_cliente_coherente"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "estimacion_solicitud_inmutable"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "acceso_cliente_fijo"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "solicitud_cliente_transicion"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_exigir_cliente"(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_acceso_cliente"(UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_estado_acceso_cliente"(UUID, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_persona"(UUID, UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cliente_crear_proyecto"(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cliente_crear_solicitud"(UUID, UUID, UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cliente_guardar_solicitud"(UUID, UUID, UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cliente_enviar_solicitud"(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cliente_retirar_solicitud"(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cliente_registrar_estimacion"(UUID, UUID, UUID, INTEGER, JSONB, BYTEA) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_designar_referencia"(UUID, UUID, UUID, UUID, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_retirar_referencia"(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_guardar_trabajo_cliente"(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_atender_solicitud"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB) FROM PUBLIC;
