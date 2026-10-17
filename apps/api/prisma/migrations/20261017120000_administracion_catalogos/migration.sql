-- AlterTable
ALTER TABLE "precio" ADD COLUMN     "anulado_en" TIMESTAMPTZ(3),
ADD COLUMN     "anulado_por" UUID,
ADD COLUMN     "motivo_anulacion" VARCHAR(500),
ADD COLUMN     "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "registrado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "producto" ADD COLUMN     "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creado_por" UUID,
ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "proveedor" ADD COLUMN     "contacto" VARCHAR(200),
ADD COLUMN     "correo" VARCHAR(254),
ADD COLUMN     "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creado_por" UUID,
ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "telefono" VARCHAR(40);

-- AlterTable
ALTER TABLE "tarifa_mano_obra" ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "proveedor_id" UUID,
ADD COLUMN     "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "registrado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_creado_por_fk" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_creado_por_fk" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_registrado_por_fk" FOREIGN KEY ("organizacion_id", "registrado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_anulado_por_fk" FOREIGN KEY ("organizacion_id", "anulado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarifa_mano_obra" ADD CONSTRAINT "tarifa_mano_obra_proveedor_fk" FOREIGN KEY ("organizacion_id", "proveedor_id") REFERENCES "proveedor"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarifa_mano_obra" ADD CONSTRAINT "tarifa_mano_obra_registrado_por_fk" FOREIGN KEY ("organizacion_id", "registrado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarifa_mano_obra" ADD CONSTRAINT "tarifa_mano_obra_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Módulo 11 (ADR-0015): administración de proveedores, productos, precios y tarifas.
-- Completado a mano: normalización, unicidad, CHECK, disparadores, funciones y permisos.
-- Fuentes: modCatalogos.bas (Val_Proveedor, Val_Producto, Val_Precio, Val_Tarifa, Precio_Anular,
-- Cat_CambiarActivo) y Word maestro §3.5 y §5.6. Adaptaciones autorizadas: bloqueo técnico del
-- producto con precios, cierre de vigencia con sucesor (P3 pendiente) y asignación de tarifa.
-- ---------------------------------------------------------------------------

-- Copia exacta de `Normalizar` (modApp.bas): minúsculas, sin acentos, puntuación . , ; : - _ ' "
-- convertida en espacio y espacios simples. Las mayúsculas acentuadas se traducen antes de lower()
-- para no depender de la configuración regional de la base.
CREATE FUNCTION "softarq_normalizar"(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(translate(btrim(p), 'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛ', 'áéíóúüñàèìòùâêîôû')),
      'áéíóúüñàèìòùâêîôû.,;:-_''"',
      'aeiouunaeiouaeiou        '),
    ' {2,}', ' ', 'g'))
$$;

-- Duplicados del libro (Cat_Duplicado): proveedor por nombre; producto por descripción y presentación.
CREATE UNIQUE INDEX "proveedor_nombre_normalizado_key" ON "proveedor" ("organizacion_id", softarq_normalizar("nombre"));
CREATE UNIQUE INDEX "producto_descripcion_presentacion_key" ON "producto" ("organizacion_id", softarq_normalizar("descripcion"), softarq_normalizar("presentacion"));

ALTER TABLE "proveedor"
  ADD CONSTRAINT "proveedor_nombre_ck" CHECK (length(btrim("nombre")) > 0),
  ADD CONSTRAINT "proveedor_correo_ck" CHECK ("correo" IS NULL OR ("correo" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND right("correo", 1) <> '.'));

ALTER TABLE "producto"
  ADD CONSTRAINT "producto_textos_ck" CHECK (length(btrim("descripcion")) > 0 AND length(btrim("presentacion")) > 0);

ALTER TABLE "precio"
  ADD CONSTRAINT "precio_fuente_ck" CHECK (length(btrim("fuente")) > 0),
  -- Anular exige motivo y fecha (Precio_Anular); un precio no anulado no lleva datos de anulación.
  ADD CONSTRAINT "precio_anulacion_ck" CHECK (
    ("anulado" AND "motivo_anulacion" IS NOT NULL AND length(btrim("motivo_anulacion")) > 0 AND "anulado_en" IS NOT NULL)
    OR (NOT "anulado" AND "motivo_anulacion" IS NULL AND "anulado_por" IS NULL AND "anulado_en" IS NULL));

ALTER TABLE "tarifa_mano_obra"
  ADD CONSTRAINT "tarifa_textos_ck" CHECK (length(btrim("descripcion")) > 0 AND length(btrim("fuente")) > 0);

ALTER TABLE "contador" DROP CONSTRAINT "contador_entidad_ck";
ALTER TABLE "contador"
  ADD CONSTRAINT "contador_entidad_ck" CHECK ("entidad" ~ '^(CLI|PRY|PRV|PCM|PRE|TMO|COT-[0-9]{4})$');

ALTER TABLE "bitacora" DROP CONSTRAINT "bitacora_entidad_ck";
ALTER TABLE "bitacora"
  ADD CONSTRAINT "bitacora_entidad_ck" CHECK ("entidad" IN ('cliente', 'proyecto', 'cotizacion', 'emisor', 'proveedor', 'producto', 'precio', 'tarifa', 'concepto'));

ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_recurso_ck"
  CHECK ("recurso_tipo" IN ('cliente','proyecto','cotizacion','version','revision','emision','respuesta','excepcion','proveedor','producto','precio','tarifa','concepto'));

-- ---------------------------------------------------------------------------
-- Disparadores de protección (también para el propietario de la base)
-- ---------------------------------------------------------------------------

-- Producto: con algún precio registrado (vigente, vencido o anulado), insumo, presentación, unidad
-- de compra, contenido, fraccionable e incremento ya no cambian (decisión del propietario).
CREATE FUNCTION "producto_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.organizacion_id, NEW.codigo) IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: el identificador del producto no cambia.' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.insumo_id, NEW.presentacion, NEW.unidad_compra, NEW.contenido, NEW.fraccionable, NEW.incremento_minimo)
     IS DISTINCT FROM (OLD.insumo_id, OLD.presentacion, OLD.unidad_compra, OLD.contenido, OLD.fraccionable, OLD.incremento_minimo)
     AND EXISTS (SELECT 1 FROM precio WHERE organizacion_id = OLD.organizacion_id AND producto_id = OLD.id) THEN
    RAISE EXCEPTION 'SOFTARQ:PRODUCTO_CON_PRECIOS: registre un producto nuevo para otra presentación.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "producto_proteger_trg" BEFORE UPDATE ON "producto"
FOR EACH ROW EXECUTE FUNCTION "producto_proteger"();

-- Registrar un precio bloquea su producto (FOR SHARE) hasta confirmar: una edición técnica
-- simultánea (FOR UPDATE) espera y después ve el precio.
CREATE FUNCTION "precio_bloquear_producto"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM producto WHERE organizacion_id = NEW.organizacion_id AND id = NEW.producto_id FOR SHARE;
  RETURN NEW;
END $$;
CREATE TRIGGER "precio_bloquear_producto_trg" BEFORE INSERT ON "precio"
FOR EACH ROW EXECUTE FUNCTION "precio_bloquear_producto"();

-- Precio: no se edita (RF-06). Solo se anula (definitivo) o se acorta su vigencia al registrar un
-- sucesor; nunca se borra ni se amplía la vigencia ni cambia el importe.
CREATE FUNCTION "precio_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: los precios no se borran; anúlelos con motivo.' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.id, NEW.organizacion_id, NEW.codigo, NEW.producto_id, NEW.proveedor_id, NEW.precio_unitario, NEW.vigente_desde, NEW.fuente, NEW.registrado_por, NEW.registrado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo, OLD.producto_id, OLD.proveedor_id, OLD.precio_unitario, OLD.vigente_desde, OLD.fuente, OLD.registrado_por, OLD.registrado_en) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: los precios no se editan; registre uno nuevo.' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.anulado AND (NOT NEW.anulado OR NEW.vigente_hasta <> OLD.vigente_hasta
      OR (NEW.motivo_anulacion, NEW.anulado_por, NEW.anulado_en) IS DISTINCT FROM (OLD.motivo_anulacion, OLD.anulado_por, OLD.anulado_en)) THEN
    RAISE EXCEPTION 'SOFTARQ:PRECIO_ANULADO: la anulación es definitiva.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.vigente_hasta <> OLD.vigente_hasta AND (NEW.vigente_hasta > OLD.vigente_hasta OR NEW.vigente_hasta < OLD.vigente_desde) THEN
    RAISE EXCEPTION 'SOFTARQ:VIGENCIA_INVALIDA: la vigencia solo puede acortarse.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "precio_proteger_trg" BEFORE UPDATE OR DELETE ON "precio"
FOR EACH ROW EXECUTE FUNCTION "precio_proteger"();

-- Tarifa: no se edita (Val_Tarifa); solo se desactiva o reactiva.
CREATE FUNCTION "tarifa_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: las tarifas no se borran; desactívelas.' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.id, NEW.organizacion_id, NEW.codigo, NEW.modalidad, NEW.descripcion, NEW.unidad, NEW.importe, NEW.rendimiento_jornada,
      NEW.vigente_desde, NEW.vigente_hasta, NEW.fuente, NEW.proveedor_id, NEW.registrado_por, NEW.registrado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo, OLD.modalidad, OLD.descripcion, OLD.unidad, OLD.importe, OLD.rendimiento_jornada,
      OLD.vigente_desde, OLD.vigente_hasta, OLD.fuente, OLD.proveedor_id, OLD.registrado_por, OLD.registrado_en) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: las tarifas no se editan; registre una nueva y asígnela al concepto.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "tarifa_proteger_trg" BEFORE UPDATE OR DELETE ON "tarifa_mano_obra"
FOR EACH ROW EXECUTE FUNCTION "tarifa_proteger"();

-- ---------------------------------------------------------------------------
-- Funciones de escritura (SECURITY INVOKER; una sentencia con idempotencia, contador, revisión y
-- bitácora). Todas exigen la función Administrador del catálogo en la pertenencia vigente: si se
-- pierde durante la sesión, SOFTARQ:SIN_PERMISO (403) sin escribir nada.
-- ---------------------------------------------------------------------------

-- Siguiente código libre: el contador no se reutiliza y salta los códigos ya cargados (DEMO).
CREATE FUNCTION "softarq_codigo_catalogo"(p_org UUID, p_prefijo TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_codigo TEXT;
  v_existe BOOLEAN;
BEGIN
  LOOP
    v_codigo := p_prefijo || '-' || lpad(softarq_siguiente(p_org, p_prefijo)::TEXT, CASE WHEN p_prefijo = 'PRE' THEN 6 ELSE 5 END, '0');
    v_existe := CASE p_prefijo
      WHEN 'PRV' THEN EXISTS (SELECT 1 FROM proveedor WHERE organizacion_id = p_org AND codigo = v_codigo)
      WHEN 'PCM' THEN EXISTS (SELECT 1 FROM producto WHERE organizacion_id = p_org AND codigo = v_codigo)
      WHEN 'PRE' THEN EXISTS (SELECT 1 FROM precio WHERE organizacion_id = p_org AND codigo = v_codigo)
      WHEN 'TMO' THEN EXISTS (SELECT 1 FROM tarifa_mano_obra WHERE organizacion_id = p_org AND codigo = v_codigo)
    END;
    IF v_existe IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:PREFIJO_INVALIDO' USING ERRCODE = 'P0001';
    END IF;
    EXIT WHEN NOT v_existe;
  END LOOP;
  RETURN v_codigo;
END $$;

CREATE FUNCTION "softarq_crear_proveedor"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'proveedor', v_id, p_expira);
  INSERT INTO proveedor (id, organizacion_id, codigo, nombre, contacto, telefono, correo, creado_por, modificado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'PRV'), p_datos->>'nombre', p_datos->>'contacto',
          p_datos->>'telefono', p_datos->>'correo', p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'proveedor', v_id, 'PROVEEDOR_CREADO', p_usuario, '{}'::JSONB);
  RETURN v_id;
END $$;

-- p_cambios solo trae las claves que cambian (nombre, contacto, telefono, correo, activo).
CREATE FUNCTION "softarq_editar_proveedor"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v proveedor%ROWTYPE;
  n proveedor%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM proveedor WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'nombre' THEN n.nombre := p_cambios->>'nombre'; END IF;
  IF p_cambios ? 'contacto' THEN n.contacto := p_cambios->>'contacto'; END IF;
  IF p_cambios ? 'telefono' THEN n.telefono := p_cambios->>'telefono'; END IF;
  IF p_cambios ? 'correo' THEN n.correo := p_cambios->>'correo'; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.nombre IS DISTINCT FROM v.nombre THEN v_campos := array_append(v_campos, 'nombre'); END IF;
  IF n.contacto IS DISTINCT FROM v.contacto THEN v_campos := array_append(v_campos, 'contacto'); END IF;
  IF n.telefono IS DISTINCT FROM v.telefono THEN v_campos := array_append(v_campos, 'telefono'); END IF;
  IF n.correo IS DISTINCT FROM v.correo THEN v_campos := array_append(v_campos, 'correo'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE proveedor
     SET nombre = n.nombre, contacto = n.contacto, telefono = n.telefono, correo = n.correo, activo = n.activo,
         revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'proveedor', v.id, 'PROVEEDOR_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'proveedor', v.id, CASE WHEN n.activo THEN 'PROVEEDOR_REACTIVADO' ELSE 'PROVEEDOR_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END $$;

-- Insumo activo (Val_Producto) y unidad de compra de la referencia común.
CREATE FUNCTION "softarq_crear_producto"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_insumo insumo%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v_insumo FROM insumo WHERE organizacion_id = p_org AND codigo = p_datos->>'insumoCodigo' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_insumo.activo THEN
    RAISE EXCEPTION 'SOFTARQ:INSUMO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unidad WHERE clave = p_datos->>'unidadCompra') THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'producto', v_id, p_expira);
  INSERT INTO producto (id, organizacion_id, codigo, insumo_id, descripcion, presentacion, unidad_compra, contenido,
                        fraccionable, incremento_minimo, creado_por, modificado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'PCM'), v_insumo.id, p_datos->>'descripcion', p_datos->>'presentacion',
          p_datos->>'unidadCompra', (p_datos->>'contenido')::NUMERIC, (p_datos->>'fraccionable')::BOOLEAN,
          (p_datos->>'incrementoMinimo')::NUMERIC, p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'producto', v_id, 'PRODUCTO_CREADO', p_usuario, jsonb_build_object('insumo', v_insumo.codigo));
  RETURN v_id;
END $$;

-- p_cambios: descripcion, presentacion, insumoCodigo, unidadCompra, contenido, fraccionable,
-- incrementoMinimo, activo. Sin fraccionar no hay incremento (Val_Producto lo vacía).
CREATE FUNCTION "softarq_editar_producto"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v producto%ROWTYPE;
  n producto%ROWTYPE;
  v_insumo insumo%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
  v_tecnico BOOLEAN;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM producto WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'descripcion' THEN n.descripcion := p_cambios->>'descripcion'; END IF;
  IF p_cambios ? 'presentacion' THEN n.presentacion := p_cambios->>'presentacion'; END IF;
  IF p_cambios ? 'unidadCompra' THEN n.unidad_compra := p_cambios->>'unidadCompra'; END IF;
  IF p_cambios ? 'contenido' THEN n.contenido := (p_cambios->>'contenido')::NUMERIC; END IF;
  IF p_cambios ? 'fraccionable' THEN n.fraccionable := (p_cambios->>'fraccionable')::BOOLEAN; END IF;
  IF p_cambios ? 'incrementoMinimo' THEN n.incremento_minimo := (p_cambios->>'incrementoMinimo')::NUMERIC; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF NOT n.fraccionable THEN n.incremento_minimo := NULL; END IF;
  IF n.fraccionable AND n.incremento_minimo IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO: indique el incremento mínimo de venta.' USING ERRCODE = 'P0001';
  END IF;
  IF p_cambios ? 'insumoCodigo' THEN
    SELECT * INTO v_insumo FROM insumo WHERE organizacion_id = p_org AND codigo = p_cambios->>'insumoCodigo' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
    IF v_insumo.id <> v.insumo_id AND NOT v_insumo.activo THEN
      RAISE EXCEPTION 'SOFTARQ:INSUMO_INACTIVO' USING ERRCODE = 'P0001';
    END IF;
    n.insumo_id := v_insumo.id;
  END IF;
  IF n.unidad_compra <> v.unidad_compra AND NOT EXISTS (SELECT 1 FROM unidad WHERE clave = n.unidad_compra) THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  v_tecnico := (n.insumo_id, n.presentacion, n.unidad_compra, n.contenido, n.fraccionable, n.incremento_minimo)
    IS DISTINCT FROM (v.insumo_id, v.presentacion, v.unidad_compra, v.contenido, v.fraccionable, v.incremento_minimo);
  -- La fila está bloqueada (FOR UPDATE): un precio que se registraba a la vez ya está confirmado
  -- y se ve aquí; uno posterior espera a esta sentencia. El disparador lo vuelve a comprobar.
  IF v_tecnico AND EXISTS (SELECT 1 FROM precio WHERE organizacion_id = p_org AND producto_id = v.id) THEN
    RAISE EXCEPTION 'SOFTARQ:PRODUCTO_CON_PRECIOS' USING ERRCODE = 'P0001';
  END IF;
  IF n.descripcion IS DISTINCT FROM v.descripcion THEN v_campos := array_append(v_campos, 'descripcion'); END IF;
  IF n.presentacion IS DISTINCT FROM v.presentacion THEN v_campos := array_append(v_campos, 'presentacion'); END IF;
  IF n.insumo_id IS DISTINCT FROM v.insumo_id THEN v_campos := array_append(v_campos, 'insumo'); END IF;
  IF n.unidad_compra IS DISTINCT FROM v.unidad_compra THEN v_campos := array_append(v_campos, 'unidadCompra'); END IF;
  IF n.contenido IS DISTINCT FROM v.contenido THEN v_campos := array_append(v_campos, 'contenido'); END IF;
  IF n.fraccionable IS DISTINCT FROM v.fraccionable THEN v_campos := array_append(v_campos, 'fraccionable'); END IF;
  IF n.incremento_minimo IS DISTINCT FROM v.incremento_minimo THEN v_campos := array_append(v_campos, 'incrementoMinimo'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE producto
     SET descripcion = n.descripcion, presentacion = n.presentacion, insumo_id = n.insumo_id, unidad_compra = n.unidad_compra,
         contenido = n.contenido, fraccionable = n.fraccionable, incremento_minimo = n.incremento_minimo, activo = n.activo,
         revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'producto', v.id, 'PRODUCTO_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'producto', v.id, CASE WHEN n.activo THEN 'PRODUCTO_REACTIVADO' ELSE 'PRODUCTO_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END $$;

-- Val_Precio: producto y proveedor activos. El solape lo impide precio_sin_solape_ex (23P01).
CREATE FUNCTION "softarq_registrar_precio"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_producto producto%ROWTYPE;
  v_proveedor proveedor%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v_producto FROM producto WHERE organizacion_id = p_org AND codigo = p_datos->>'productoCodigo' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_proveedor FROM proveedor WHERE organizacion_id = p_org AND codigo = p_datos->>'proveedorCodigo' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_producto.activo THEN
    RAISE EXCEPTION 'SOFTARQ:PRODUCTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_proveedor.activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROVEEDOR_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'precio', v_id, p_expira);
  INSERT INTO precio (id, organizacion_id, codigo, producto_id, proveedor_id, precio_unitario, vigente_desde, vigente_hasta, fuente, registrado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'PRE'), v_producto.id, v_proveedor.id, (p_datos->>'precioUnitario')::NUMERIC,
          (p_datos->>'vigenteDesde')::DATE, (p_datos->>'vigenteHasta')::DATE, p_datos->>'fuente', p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'precio', v_id, 'PRECIO_REGISTRADO', p_usuario,
          jsonb_build_object('producto', v_producto.codigo, 'proveedor', v_proveedor.codigo,
                             'vigenteDesde', p_datos->>'vigenteDesde', 'vigenteHasta', p_datos->>'vigenteHasta'));
  RETURN v_id;
END $$;

-- «Anular precio erróneo» (Precio_Anular): definitivo, con motivo; el registro se conserva.
CREATE FUNCTION "softarq_anular_precio"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_motivo TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v precio%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM precio WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.anulado THEN
    RAISE EXCEPTION 'SOFTARQ:PRECIO_ANULADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'precio', v.id, p_expira);
  UPDATE precio
     SET anulado = TRUE, motivo_anulacion = p_motivo, anulado_por = p_usuario, anulado_en = now(), revision = revision + 1
   WHERE id = v.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'precio', v.id, 'PRECIO_ANULADO', p_usuario, jsonb_build_object('motivo', p_motivo));
  RETURN v.id;
END $$;

-- «Cerrar vigencia y registrar sucesor» (adaptación autorizada para el DEMO; P3 pendiente con el
-- cliente). En UNA sentencia: si el sucesor falla (solape, inactivo), la vigencia anterior no
-- queda acortada. La nueva fecha final: >= desde, >= hoy (fecha de negocio del servidor), < hasta.
CREATE FUNCTION "softarq_cerrar_vigencia_precio"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_nueva_hasta DATE, p_hoy DATE, p_motivo TEXT, p_sucesor JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v precio%ROWTYPE;
  v_id UUID := gen_random_uuid();
  v_codigo TEXT;
  v_producto_activo BOOLEAN;
  v_proveedor_activo BOOLEAN;
  v_desde DATE := (p_sucesor->>'vigenteDesde')::DATE;
  v_hasta DATE := (p_sucesor->>'vigenteHasta')::DATE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM precio WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.anulado THEN
    RAISE EXCEPTION 'SOFTARQ:PRECIO_ANULADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  IF p_nueva_hasta < v.vigente_desde OR p_nueva_hasta < p_hoy OR p_nueva_hasta >= v.vigente_hasta THEN
    RAISE EXCEPTION 'SOFTARQ:VIGENCIA_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF v_desde <= p_nueva_hasta OR v_desde > v_hasta THEN
    RAISE EXCEPTION 'SOFTARQ:VIGENCIA_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  SELECT activo INTO v_producto_activo FROM producto WHERE organizacion_id = p_org AND id = v.producto_id FOR SHARE;
  SELECT activo INTO v_proveedor_activo FROM proveedor WHERE organizacion_id = p_org AND id = v.proveedor_id FOR SHARE;
  IF NOT v_producto_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PRODUCTO_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_proveedor_activo THEN
    RAISE EXCEPTION 'SOFTARQ:PROVEEDOR_INACTIVO' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'precio', v_id, p_expira);
  UPDATE precio SET vigente_hasta = p_nueva_hasta, revision = revision + 1 WHERE id = v.id;
  v_codigo := softarq_codigo_catalogo(p_org, 'PRE');
  INSERT INTO precio (id, organizacion_id, codigo, producto_id, proveedor_id, precio_unitario, vigente_desde, vigente_hasta, fuente, registrado_por)
  VALUES (v_id, p_org, v_codigo, v.producto_id, v.proveedor_id, (p_sucesor->>'precioUnitario')::NUMERIC, v_desde, v_hasta,
          p_sucesor->>'fuente', p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'precio', v.id, 'PRECIO_VIGENCIA_CERRADA', p_usuario,
          jsonb_build_object('hastaAnterior', v.vigente_hasta::TEXT, 'hastaNueva', p_nueva_hasta::TEXT, 'motivo', p_motivo,
                             'sucesor', v_codigo, 'fechaNegocio', p_hoy::TEXT));
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'precio', v_id, 'PRECIO_REGISTRADO', p_usuario,
          jsonb_build_object('sucesorDe', v.codigo, 'vigenteDesde', v_desde::TEXT, 'vigenteHasta', v_hasta::TEXT));
  RETURN v_id;
END $$;

-- Val_Tarifa. Unidad del concepto: longitud, área, volumen, conteo o masa (Cat_Campos «TARIFA»).
CREATE FUNCTION "softarq_registrar_tarifa"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_proveedor_id UUID;
  v_proveedor_activo BOOLEAN;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  IF NOT EXISTS (SELECT 1 FROM unidad WHERE clave = p_datos->>'unidad' AND magnitud IN ('longitud', 'area', 'volumen', 'conteo', 'masa')) THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF p_datos->>'proveedorCodigo' IS NOT NULL THEN
    SELECT id, activo INTO v_proveedor_id, v_proveedor_activo
      FROM proveedor WHERE organizacion_id = p_org AND codigo = p_datos->>'proveedorCodigo' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_proveedor_activo THEN
      RAISE EXCEPTION 'SOFTARQ:PROVEEDOR_INACTIVO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'tarifa', v_id, p_expira);
  INSERT INTO tarifa_mano_obra (id, organizacion_id, codigo, modalidad, descripcion, unidad, importe, rendimiento_jornada,
                                vigente_desde, vigente_hasta, fuente, proveedor_id, registrado_por, modificado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'TMO'), p_datos->>'modalidad', p_datos->>'descripcion', p_datos->>'unidad',
          (p_datos->>'importe')::NUMERIC, (p_datos->>'rendimientoJornada')::NUMERIC, (p_datos->>'vigenteDesde')::DATE,
          (p_datos->>'vigenteHasta')::DATE, p_datos->>'fuente', v_proveedor_id, p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'tarifa', v_id, 'TARIFA_REGISTRADA', p_usuario, jsonb_build_object('modalidad', p_datos->>'modalidad'));
  RETURN v_id;
END $$;

CREATE FUNCTION "softarq_cambiar_activa_tarifa"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_activa BOOLEAN
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v tarifa_mano_obra%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM tarifa_mano_obra WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  IF v.activa = p_activa THEN
    RETURN v.revision;
  END IF;
  UPDATE tarifa_mano_obra SET activa = p_activa, revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'tarifa', v.id, CASE WHEN p_activa THEN 'TARIFA_REACTIVADA' ELSE 'TARIFA_DESACTIVADA' END, p_usuario, '{}'::JSONB);
  RETURN v.revision + 1;
END $$;

-- «Se registra una nueva y se asigna al concepto» (Word §3.5). Dependencia mínima del módulo 11:
-- cambia SOLO tarifa_id, conserva la aprobación del concepto y deja la tarifa anterior y la nueva
-- en bitácora. p_tarifa_actual es la que mostraba la pantalla (control de concurrencia).
CREATE FUNCTION "softarq_asignar_tarifa_concepto"(
  p_org UUID, p_usuario UUID, p_concepto TEXT, p_tarifa_actual TEXT, p_tarifa_nueva TEXT, p_motivo TEXT,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v concepto%ROWTYPE;
  v_anterior TEXT;
  t tarifa_mano_obra%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM concepto WHERE organizacion_id = p_org AND codigo = p_concepto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT codigo INTO v_anterior FROM tarifa_mano_obra WHERE organizacion_id = p_org AND id = v.tarifa_id;
  IF v_anterior IS DISTINCT FROM p_tarifa_actual THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_TARIFA' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM tarifa_mano_obra WHERE organizacion_id = p_org AND codigo = p_tarifa_nueva FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF t.id = v.tarifa_id THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO: la tarifa ya está asignada.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT t.activa THEN
    RAISE EXCEPTION 'SOFTARQ:TARIFA_INACTIVA' USING ERRCODE = 'P0001';
  END IF;
  -- BL-06: la tarifa debe estar en la unidad de la partida (la del concepto).
  IF t.unidad <> v.unidad THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'concepto', v.id, p_expira);
  UPDATE concepto SET tarifa_id = t.id WHERE id = v.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'concepto', v.id, 'CONCEPTO_TARIFA_ASIGNADA', p_usuario,
          jsonb_build_object('tarifaAnterior', v_anterior, 'tarifaNueva', t.codigo, 'motivo', p_motivo, 'estadoConcepto', v.estado));
  RETURN v.id;
END $$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución (las columnas editables de softarq_app están en scripts/db/permisos-app.sql,
-- que se reaplica tras cada migración)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION "softarq_normalizar"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "producto_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "precio_bloquear_producto"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "precio_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "tarifa_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_codigo_catalogo"(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_proveedor"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_proveedor"(UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_producto"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_producto"(UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_registrar_precio"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_anular_precio"(UUID, UUID, TEXT, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cerrar_vigencia_precio"(UUID, UUID, TEXT, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_registrar_tarifa"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_cambiar_activa_tarifa"(UUID, UUID, TEXT, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_asignar_tarifa_concepto"(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
