-- ---------------------------------------------------------------------------
-- Módulo 12 (ADR-0016): administración de insumos, conversiones, tipos de estructura, conceptos y
-- componentes, con aprobación de conceptos. Parte 1 (generada con `prisma migrate diff`) precedida
-- de esta comprobación; parte 2 (al final) completada a mano.
-- Fuentes: modCatalogos.bas (Cat_Campos, Val_Insumo, Val_Conversion, Val_TipoEst, Val_Concepto,
-- Val_Componente, Concepto_Problemas, Concepto_Aprobar, Concepto_ABorrador, BTN_ConceptoActivo,
-- Cat_Duplicado), modValidacion.bas (Validar, BL-05) y tblListas.FAMILIA.
-- ---------------------------------------------------------------------------

-- Las restricciones únicas nuevas no deben chocar con datos existentes: si los hubiera, la migración
-- se detiene con el detalle en lugar de corregirlos sola.
DO $$
DECLARE
  v_detalle TEXT;
BEGIN
  SELECT string_agg(format('%s/%s (%s)', c.codigo, i.codigo, n), ', ') INTO v_detalle
    FROM (SELECT concepto_id, insumo_id, count(*) AS n FROM componente GROUP BY 1, 2 HAVING count(*) > 1) d
    JOIN concepto c ON c.id = d.concepto_id
    JOIN insumo i ON i.id = d.insumo_id;
  IF v_detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Componentes repetidos por concepto e insumo: %', v_detalle;
  END IF;
  SELECT string_agg(format('%s %s', i.codigo, d.unidad_origen), ', ') INTO v_detalle
    FROM (SELECT insumo_id, unidad_origen FROM conversion GROUP BY 1, 2 HAVING count(*) > 1) d
    JOIN insumo i ON i.id = d.insumo_id;
  IF v_detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Conversiones repetidas por insumo y unidad de origen: %', v_detalle;
  END IF;
  SELECT string_agg(format('%s %s→%s (base %s)', i.codigo, v.unidad_origen, v.unidad_destino, i.unidad_base), ', ') INTO v_detalle
    FROM conversion v JOIN insumo i ON i.id = v.insumo_id
   WHERE v.unidad_destino <> i.unidad_base;
  IF v_detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Conversiones cuyo destino no es la unidad base del insumo: %', v_detalle;
  END IF;
END $$;
-- AlterTable
ALTER TABLE "componente" ADD COLUMN     "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creado_por" UUID,
ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "fuente" DROP NOT NULL,
ALTER COLUMN "fecha" DROP NOT NULL,
ALTER COLUMN "responsable" DROP NOT NULL;

-- AlterTable
ALTER TABLE "concepto" ADD COLUMN     "aprobado_en" TIMESTAMPTZ(3),
ADD COLUMN     "aprobado_por" UUID,
ADD COLUMN     "cambio_tecnico_en" TIMESTAMPTZ(3),
ADD COLUMN     "cambio_tecnico_por" UUID,
ADD COLUMN     "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creado_por" UUID,
ADD COLUMN     "criterios" VARCHAR(2000),
ADD COLUMN     "heredado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "regla_medicion" VARCHAR(2000),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revision_tecnica" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo_id" UUID;

-- AlterTable
ALTER TABLE "conversion" ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "registrado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "insumo" ADD COLUMN     "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creado_por" UUID,
ADD COLUMN     "especificacion" VARCHAR(2000),
ADD COLUMN     "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modificado_por" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tipo_estructura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "familia" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "prioritario" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_por" UUID,
    "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_estructura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_estructura_organizacion_id_id_key" ON "tipo_estructura"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_estructura_organizacion_id_codigo_key" ON "tipo_estructura"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "componente_concepto_insumo_key" ON "componente"("concepto_id", "insumo_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_insumo_origen_key" ON "conversion"("insumo_id", "unidad_origen");

-- AddForeignKey
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_creado_por_fk" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_registrado_por_fk" FOREIGN KEY ("organizacion_id", "registrado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_tipo_fk" FOREIGN KEY ("organizacion_id", "tipo_id") REFERENCES "tipo_estructura"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_aprobado_por_fk" FOREIGN KEY ("organizacion_id", "aprobado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_cambio_tecnico_por_fk" FOREIGN KEY ("organizacion_id", "cambio_tecnico_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_creado_por_fk" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "componente" ADD CONSTRAINT "componente_creado_por_fk" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "componente" ADD CONSTRAINT "componente_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tipo_estructura" ADD CONSTRAINT "tipo_estructura_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tipo_estructura" ADD CONSTRAINT "tipo_estructura_creado_por_fk" FOREIGN KEY ("organizacion_id", "creado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tipo_estructura" ADD CONSTRAINT "tipo_estructura_modificado_por_fk" FOREIGN KEY ("organizacion_id", "modificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ---------------------------------------------------------------------------
-- Parte 2 (a mano). Módulo 12 (ADR-0016).
-- ---------------------------------------------------------------------------

-- Conceptos heredados: los que ya existen al migrar no tienen tipo ni regla de medición (la carga
-- anterior no los tenía). Se marcan uno a uno; no se rellena ningún dato ni cambia su cálculo, y
-- conservan su estado y su aprobación anterior. La marca no la escribe la aplicación: solo pasa de
-- true a false cuando el Administrador del catálogo completa el concepto (disparador).
DO $$
DECLARE
  v_codigos TEXT;
BEGIN
  UPDATE concepto SET heredado = TRUE WHERE tipo_id IS NULL AND regla_medicion IS NULL;
  SELECT string_agg(o.codigo || ':' || c.codigo, ', ' ORDER BY o.codigo, c.codigo) INTO v_codigos
    FROM concepto c JOIN organizacion o ON o.id = c.organizacion_id WHERE c.heredado;
  RAISE NOTICE 'Conceptos heredados de la carga anterior: %', coalesce(v_codigos, 'ninguno');
END $$;

-- Duplicados del libro (Cat_Duplicado con Normalizar): insumo por descripción técnica; tipo por
-- (familia, nombre); concepto por (tipo, descripción). Se comprueban antes de crear los índices.
DO $$
DECLARE
  v_detalle TEXT;
BEGIN
  SELECT string_agg(d.codigos, '; ') INTO v_detalle FROM (
    SELECT string_agg(codigo, ', ' ORDER BY codigo) AS codigos FROM insumo
     GROUP BY organizacion_id, softarq_normalizar(descripcion) HAVING count(*) > 1) d;
  IF v_detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Insumos con la misma descripción normalizada: %', v_detalle;
  END IF;
END $$;

CREATE UNIQUE INDEX "insumo_descripcion_normalizada_key" ON "insumo" ("organizacion_id", softarq_normalizar("descripcion"));
CREATE UNIQUE INDEX "tipo_estructura_familia_nombre_key" ON "tipo_estructura" ("organizacion_id", "familia", softarq_normalizar("nombre"));
-- Los heredados no tienen tipo (NULL no se repite): la unicidad se aplica a todo concepto con tipo.
CREATE UNIQUE INDEX "concepto_tipo_descripcion_key" ON "concepto" ("organizacion_id", "tipo_id", softarq_normalizar("descripcion"));
CREATE INDEX "concepto_tipo_idx" ON "concepto" ("organizacion_id", "tipo_id");
CREATE INDEX "componente_insumo_idx" ON "componente" ("organizacion_id", "insumo_id", "unidad_rendimiento");

ALTER TABLE "tipo_estructura"
  -- tblListas.FAMILIA del libro.
  ADD CONSTRAINT "tipo_estructura_familia_ck" CHECK ("familia" IN ('Cimentaciones', 'Concreto reforzado', 'Acero estructural',
    'Mampostería reforzada', 'Cubiertas ligeras', 'Conceptos personalizados')),
  ADD CONSTRAINT "tipo_estructura_nombre_ck" CHECK (length(btrim("nombre")) > 0);

ALTER TABLE "insumo"
  ADD CONSTRAINT "insumo_descripcion_ck" CHECK (length(btrim("descripcion")) > 0),
  ADD CONSTRAINT "insumo_especificacion_ck" CHECK ("especificacion" IS NULL OR length(btrim("especificacion")) > 0);

ALTER TABLE "conversion"
  ADD CONSTRAINT "conversion_fuente_ck" CHECK (length(btrim("fuente")) > 0);

ALTER TABLE "concepto"
  ADD CONSTRAINT "concepto_descripcion_ck" CHECK (length(btrim("descripcion")) > 0),
  ADD CONSTRAINT "concepto_textos_ck" CHECK (
    ("regla_medicion" IS NULL OR length(btrim("regla_medicion")) > 0) AND ("criterios" IS NULL OR length(btrim("criterios")) > 0)),
  -- Val_Concepto: tipo y regla de medición obligatorios. Solo los heredados pueden carecer de ellos.
  ADD CONSTRAINT "concepto_completo_ck" CHECK ("heredado" OR ("tipo_id" IS NOT NULL AND "regla_medicion" IS NOT NULL)),
  -- Aprobado ⇒ fecha de aprobación (quién: NULL solo en la carga base, sin persona). Los heredados
  -- conservan su aprobación anterior, que no tiene fecha registrada. Borrador ⇒ sin datos de aprobación.
  ADD CONSTRAINT "concepto_aprobacion_ck" CHECK (
    ("estado" = 'Aprobado' AND ("aprobado_en" IS NOT NULL OR "heredado"))
    OR ("estado" = 'Borrador' AND "aprobado_por" IS NULL AND "aprobado_en" IS NULL)),
  ADD CONSTRAINT "concepto_cambio_tecnico_ck" CHECK ("cambio_tecnico_por" IS NULL OR "cambio_tecnico_en" IS NOT NULL);

ALTER TABLE "componente"
  ADD CONSTRAINT "componente_trazabilidad_ck" CHECK (
    ("fuente" IS NULL OR length(btrim("fuente")) > 0) AND ("responsable" IS NULL OR length(btrim("responsable")) > 0));

ALTER TABLE "contador" DROP CONSTRAINT "contador_entidad_ck";
ALTER TABLE "contador"
  ADD CONSTRAINT "contador_entidad_ck" CHECK ("entidad" ~ '^(CLI|PRY|PRV|PCM|PRE|TMO|TES|INS|CON|CMP|COT-[0-9]{4})$');

ALTER TABLE "bitacora" DROP CONSTRAINT "bitacora_entidad_ck";
ALTER TABLE "bitacora"
  ADD CONSTRAINT "bitacora_entidad_ck" CHECK ("entidad" IN ('cliente', 'proyecto', 'cotizacion', 'emisor', 'proveedor', 'producto',
    'precio', 'tarifa', 'concepto', 'tipo_estructura', 'insumo', 'conversion', 'componente'));

ALTER TABLE "idempotencia" DROP CONSTRAINT "idempotencia_recurso_ck";
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_recurso_ck"
  CHECK ("recurso_tipo" IN ('cliente','proyecto','cotizacion','version','revision','emision','respuesta','excepcion','proveedor',
    'producto','precio','tarifa','concepto','tipo_estructura','insumo','conversion','componente'));

-- ---------------------------------------------------------------------------
-- Disparadores (también para el propietario de la base)
-- ---------------------------------------------------------------------------

-- Tipo de estructura: la familia no cambia si el tipo ya tiene conceptos (una clasificación distinta
-- exige otro tipo; los conceptos no se trasladan solos). Desactivarlo conserva sus conceptos.
CREATE FUNCTION "tipo_estructura_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.organizacion_id, NEW.codigo, NEW.creado_por, NEW.creado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo, OLD.creado_por, OLD.creado_en) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: el identificador del tipo no cambia.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.familia <> OLD.familia
     AND EXISTS (SELECT 1 FROM concepto WHERE organizacion_id = OLD.organizacion_id AND tipo_id = OLD.id) THEN
    RAISE EXCEPTION 'SOFTARQ:TIPO_CON_CONCEPTOS: registre otro tipo para la nueva familia.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "tipo_estructura_proteger_trg" BEFORE UPDATE ON "tipo_estructura"
FOR EACH ROW EXECUTE FUNCTION "tipo_estructura_proteger"();

-- Insumo: la unidad base no cambia si ya tiene productos o conversiones (Val_Insumo) o componentes
-- (más estricto que el libro: cambiaría el sentido de los rendimientos). La salida es un insumo nuevo.
CREATE FUNCTION "insumo_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.organizacion_id, NEW.codigo, NEW.creado_por, NEW.creado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo, OLD.creado_por, OLD.creado_en) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: el identificador del insumo no cambia.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.unidad_base <> OLD.unidad_base AND (
       EXISTS (SELECT 1 FROM producto WHERE organizacion_id = OLD.organizacion_id AND insumo_id = OLD.id)
    OR EXISTS (SELECT 1 FROM conversion WHERE organizacion_id = OLD.organizacion_id AND insumo_id = OLD.id)
    OR EXISTS (SELECT 1 FROM componente WHERE organizacion_id = OLD.organizacion_id AND insumo_id = OLD.id)) THEN
    RAISE EXCEPTION 'SOFTARQ:INSUMO_CON_REFERENCIAS: registre un insumo nuevo para otra unidad base.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "insumo_proteger_trg" BEFORE UPDATE ON "insumo"
FOR EACH ROW EXECUTE FUNCTION "insumo_proteger"();

-- Conversión (Val_Conversion): se identifica por (insumo, unidad de origen); el destino es siempre la
-- unidad base del insumo y el origen es otra. Solo cambian el factor y la fuente.
CREATE FUNCTION "conversion_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_base TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.organizacion_id, NEW.insumo_id, NEW.unidad_origen, NEW.unidad_destino, NEW.registrado_por, NEW.registrado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.insumo_id, OLD.unidad_origen, OLD.unidad_destino, OLD.registrado_por, OLD.registrado_en) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: de una conversión solo cambian el factor y la fuente.' USING ERRCODE = 'P0001';
  END IF;
  -- FOR SHARE: un cambio simultáneo de la unidad base espera y después ve esta conversión.
  SELECT unidad_base INTO v_base FROM insumo WHERE organizacion_id = NEW.organizacion_id AND id = NEW.insumo_id FOR SHARE;
  IF NEW.unidad_destino IS DISTINCT FROM v_base THEN
    RAISE EXCEPTION 'SOFTARQ:CONVERSION_DESTINO: el destino de la conversión es la unidad base del insumo.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "conversion_proteger_trg" BEFORE INSERT OR UPDATE ON "conversion"
FOR EACH ROW EXECUTE FUNCTION "conversion_proteger"();

-- Una conversión nueva o editada cambia el contenido técnico de los conceptos con un componente
-- activo de ese insumo medido en esa unidad: sube su revisión técnica (y el disparador del concepto
-- retira la aprobación). Decisión del propietario: «Editar y volver a Borrador».
CREATE FUNCTION "conversion_propagar"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.factor, NEW.fuente) IS NOT DISTINCT FROM (OLD.factor, OLD.fuente) THEN
    RETURN NULL;
  END IF;
  UPDATE concepto c
     SET revision_tecnica = c.revision_tecnica + 1,
         cambio_tecnico_por = coalesce(NEW.modificado_por, c.cambio_tecnico_por),
         cambio_tecnico_en = CASE WHEN NEW.modificado_por IS NULL THEN c.cambio_tecnico_en ELSE NEW.modificado_en END
   WHERE c.organizacion_id = NEW.organizacion_id
     AND EXISTS (SELECT 1 FROM componente k
                  WHERE k.organizacion_id = c.organizacion_id AND k.concepto_id = c.id AND k.activo
                    AND k.insumo_id = NEW.insumo_id AND k.unidad_rendimiento = NEW.unidad_origen);
  RETURN NULL;
END $$;
CREATE TRIGGER "conversion_propagar_trg" AFTER INSERT OR UPDATE ON "conversion"
FOR EACH ROW EXECUTE FUNCTION "conversion_propagar"();

-- Componente (Val_Componente): concepto, orden y código no cambian; un insumo nuevo debe estar activo.
CREATE FUNCTION "componente_proteger"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_activo BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.organizacion_id, NEW.codigo, NEW.concepto_id, NEW.orden, NEW.creado_por, NEW.creado_en)
     IS DISTINCT FROM (OLD.id, OLD.organizacion_id, OLD.codigo, OLD.concepto_id, OLD.orden, OLD.creado_por, OLD.creado_en) THEN
    RAISE EXCEPTION 'SOFTARQ:REGISTRO_INMUTABLE: el componente no cambia de concepto ni de orden.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.insumo_id <> OLD.insumo_id THEN
    SELECT activo INTO v_activo FROM insumo WHERE organizacion_id = NEW.organizacion_id AND id = NEW.insumo_id FOR SHARE;
    IF NOT v_activo THEN
      RAISE EXCEPTION 'SOFTARQ:INSUMO_INACTIVO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "componente_proteger_trg" BEFORE INSERT OR UPDATE ON "componente"
FOR EACH ROW EXECUTE FUNCTION "componente_proteger"();

-- Concepto_ABorrador: crear, editar, activar o desactivar un componente es un cambio técnico del
-- concepto. En un heredado exige completarlo antes (tipo y regla de medición).
CREATE FUNCTION "componente_propagar"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  c concepto%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.insumo_id, NEW.rendimiento, NEW.unidad_rendimiento, NEW.desperdicio, NEW.factor_traslape,
                           NEW.fuente, NEW.fecha, NEW.responsable, NEW.activo)
     IS NOT DISTINCT FROM (OLD.insumo_id, OLD.rendimiento, OLD.unidad_rendimiento, OLD.desperdicio, OLD.factor_traslape,
                           OLD.fuente, OLD.fecha, OLD.responsable, OLD.activo) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM concepto WHERE organizacion_id = NEW.organizacion_id AND id = NEW.concepto_id FOR UPDATE;
  IF c.heredado THEN
    RAISE EXCEPTION 'SOFTARQ:CONCEPTO_INCOMPLETO: complete el tipo de estructura y la regla de medición del concepto antes de cambiar sus componentes.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE concepto
     SET revision_tecnica = revision_tecnica + 1,
         cambio_tecnico_por = coalesce(NEW.modificado_por, cambio_tecnico_por),
         cambio_tecnico_en = CASE WHEN NEW.modificado_por IS NULL THEN cambio_tecnico_en ELSE NEW.modificado_en END
   WHERE id = c.id;
  RETURN NULL;
END $$;
CREATE TRIGGER "componente_propagar_trg" AFTER INSERT OR UPDATE ON "componente"
FOR EACH ROW EXECUTE FUNCTION "componente_propagar"();

-- Concepto. Reglas que valen aunque se escriba con SQL directo:
-- - alta siempre en Borrador y nunca heredada; tipo activo; unidad acorde a la fórmula; tarifa de la
--   misma unidad (BL-06);
-- - un cambio técnico (Val_Concepto: tipo, descripción, unidad, fórmula, descuentos, regla, criterios,
--   clase; o la revisión técnica, que suben componentes y conversiones) devuelve a Borrador y retira la
--   aprobación; en un heredado exige completarlo y le quita la marca;
-- - reactivar devuelve a Borrador (BTN_ConceptoActivo); desactivar y asignar tarifa la conservan;
-- - pasar a Aprobado solo dentro de softarq_aprobar_concepto (marca local de la transacción).
CREATE FUNCTION "concepto_proteger"() RETURNS trigger
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
    IF current_setting('softarq.aprobacion_concepto', TRUE) IS DISTINCT FROM NEW.id::TEXT
       OR NEW.heredado OR NOT NEW.activo OR NEW.aprobado_en IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:APROBACION_DIRECTA: el concepto se aprueba con la operación Aprobar.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "concepto_proteger_trg" BEFORE INSERT OR UPDATE ON "concepto"
FOR EACH ROW EXECUTE FUNCTION "concepto_proteger"();

-- ---------------------------------------------------------------------------
-- Requisitos de aprobación (Concepto_Problemas), una sola definición para la API y para Aprobar.
-- Añade la convertibilidad de la unidad de cada componente, que el motor exige (BL-06).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "softarq_problemas_concepto"(p_org UUID, p_concepto UUID)
RETURNS TABLE (codigo TEXT, referencia TEXT, mensaje TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH c AS (SELECT * FROM concepto WHERE organizacion_id = p_org AND id = p_concepto),
  k AS (SELECT k.*, i.codigo AS insumo_codigo, i.unidad_base FROM componente k JOIN c ON k.concepto_id = c.id
          JOIN insumo i ON i.organizacion_id = k.organizacion_id AND i.id = k.insumo_id
         WHERE k.organizacion_id = p_org AND k.activo)
  SELECT x.codigo, x.referencia, x.mensaje FROM (
    SELECT 1 AS o, 'HEREDADO' AS codigo, c.codigo AS referencia,
           'Datos incompletos de la carga anterior: complete el tipo de estructura y la regla de medición.' AS mensaje
      FROM c WHERE c.heredado
    UNION ALL SELECT 2, 'INACTIVO', c.codigo, 'El concepto está inactivo.' FROM c WHERE NOT c.activo
    UNION ALL SELECT 3, 'SIN_REGLA', c.codigo, 'Falta la regla de medición escrita.' FROM c WHERE c.regla_medicion IS NULL
    UNION ALL SELECT 4, 'SIN_TIPO', c.codigo, 'Falta el tipo de estructura.' FROM c WHERE c.tipo_id IS NULL
    UNION ALL SELECT 5, 'TIPO_INACTIVO', t.codigo, format('El tipo de estructura %s está inactivo.', t.codigo)
      FROM c JOIN tipo_estructura t ON t.organizacion_id = c.organizacion_id AND t.id = c.tipo_id WHERE NOT t.activo
    UNION ALL SELECT 6, 'UNIDAD_FORMULA', c.codigo, 'La unidad no corresponde al tipo de fórmula.'
      FROM c JOIN unidad u ON u.clave = c.unidad WHERE u.magnitud <> lower(c.tipo_formula)
    UNION ALL SELECT 7, 'SIN_TARIFA', c.codigo, 'Falta la tarifa de mano de obra.' FROM c WHERE c.tarifa_id IS NULL
    UNION ALL SELECT 8, 'TARIFA_UNIDAD', t.codigo, format('La tarifa %s es por %s y el concepto se mide en %s (BL-06).', t.codigo, t.unidad, c.unidad)
      FROM c JOIN tarifa_mano_obra t ON t.organizacion_id = c.organizacion_id AND t.id = c.tarifa_id WHERE t.unidad <> c.unidad
    UNION ALL SELECT 9, 'COMPONENTE_SIN_FUENTE', k.codigo, format('El componente %s no tiene fuente.', k.codigo) FROM k WHERE k.fuente IS NULL
    UNION ALL SELECT 10, 'COMPONENTE_SIN_FECHA', k.codigo, format('El componente %s no tiene fecha.', k.codigo) FROM k WHERE k.fecha IS NULL
    UNION ALL SELECT 11, 'COMPONENTE_SIN_RESPONSABLE', k.codigo, format('El componente %s no tiene responsable técnico.', k.codigo) FROM k WHERE k.responsable IS NULL
    UNION ALL SELECT 12, 'COMPONENTE_SIN_CONVERSION', k.codigo,
           format('El componente %s se mide en %s y el insumo %s en %s: falta la conversión %s → %s.', k.codigo, k.unidad_rendimiento, k.insumo_codigo, k.unidad_base, k.unidad_rendimiento, k.unidad_base)
      FROM k WHERE k.unidad_rendimiento <> k.unidad_base
       AND NOT EXISTS (SELECT 1 FROM conversion v WHERE v.organizacion_id = k.organizacion_id AND v.insumo_id = k.insumo_id
                          AND v.unidad_origen = k.unidad_rendimiento AND v.unidad_destino = k.unidad_base)
    UNION ALL SELECT 13, 'SIN_COMPONENTES', c.codigo, 'El concepto no tiene componentes activos.'
      FROM c WHERE c.clase <> 'GENERICO' AND NOT EXISTS (SELECT 1 FROM k)
  ) x ORDER BY x.o, x.referencia
$$;

-- ---------------------------------------------------------------------------
-- Funciones de escritura (SECURITY INVOKER; una sentencia con idempotencia, contador, revisión y
-- bitácora). Todas exigen la función Administrador del catálogo en la pertenencia vigente.
-- ---------------------------------------------------------------------------

-- Siguiente código libre (módulo 11), ahora también para TES, INS, CON y CMP.
CREATE OR REPLACE FUNCTION "softarq_codigo_catalogo"(p_org UUID, p_prefijo TEXT) RETURNS TEXT
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
      WHEN 'TES' THEN EXISTS (SELECT 1 FROM tipo_estructura WHERE organizacion_id = p_org AND codigo = v_codigo)
      WHEN 'INS' THEN EXISTS (SELECT 1 FROM insumo WHERE organizacion_id = p_org AND codigo = v_codigo)
      WHEN 'CON' THEN EXISTS (SELECT 1 FROM concepto WHERE organizacion_id = p_org AND codigo = v_codigo)
      WHEN 'CMP' THEN EXISTS (SELECT 1 FROM componente WHERE organizacion_id = p_org AND codigo = v_codigo)
    END;
    IF v_existe IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:PREFIJO_INVALIDO' USING ERRCODE = 'P0001';
    END IF;
    EXIT WHEN NOT v_existe;
  END LOOP;
  RETURN v_codigo;
END $$;

-- ----------------------------- tipos de estructura -----------------------------

CREATE FUNCTION "softarq_crear_tipo_estructura"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'tipo_estructura', v_id, p_expira);
  INSERT INTO tipo_estructura (id, organizacion_id, codigo, familia, nombre, prioritario, creado_por, modificado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'TES'), p_datos->>'familia', p_datos->>'nombre',
          coalesce((p_datos->>'prioritario')::BOOLEAN, FALSE), p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'tipo_estructura', v_id, 'TIPO_ESTRUCTURA_CREADO', p_usuario, jsonb_build_object('familia', p_datos->>'familia'));
  RETURN v_id;
END $$;

-- p_cambios: familia, nombre, prioritario, activo.
CREATE FUNCTION "softarq_editar_tipo_estructura"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v tipo_estructura%ROWTYPE;
  n tipo_estructura%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM tipo_estructura WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'familia' THEN n.familia := p_cambios->>'familia'; END IF;
  IF p_cambios ? 'nombre' THEN n.nombre := p_cambios->>'nombre'; END IF;
  IF p_cambios ? 'prioritario' THEN n.prioritario := (p_cambios->>'prioritario')::BOOLEAN; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.familia IS DISTINCT FROM v.familia THEN v_campos := array_append(v_campos, 'familia'); END IF;
  IF n.nombre IS DISTINCT FROM v.nombre THEN v_campos := array_append(v_campos, 'nombre'); END IF;
  IF n.prioritario IS DISTINCT FROM v.prioritario THEN v_campos := array_append(v_campos, 'prioritario'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE tipo_estructura
     SET familia = n.familia, nombre = n.nombre, prioritario = n.prioritario, activo = n.activo,
         revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'tipo_estructura', v.id, 'TIPO_ESTRUCTURA_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'tipo_estructura', v.id, CASE WHEN n.activo THEN 'TIPO_ESTRUCTURA_REACTIVADO' ELSE 'TIPO_ESTRUCTURA_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END $$;

-- ----------------------------------- insumos -----------------------------------

CREATE FUNCTION "softarq_crear_insumo"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  IF NOT EXISTS (SELECT 1 FROM unidad WHERE clave = p_datos->>'unidadBase') THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'insumo', v_id, p_expira);
  INSERT INTO insumo (id, organizacion_id, codigo, descripcion, especificacion, unidad_base, creado_por, modificado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'INS'), p_datos->>'descripcion', p_datos->>'especificacion',
          p_datos->>'unidadBase', p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'insumo', v_id, 'INSUMO_CREADO', p_usuario, jsonb_build_object('unidadBase', p_datos->>'unidadBase'));
  RETURN v_id;
END $$;

-- p_cambios: descripcion, especificacion, unidadBase, activo.
CREATE FUNCTION "softarq_editar_insumo"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v insumo%ROWTYPE;
  n insumo%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM insumo WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'descripcion' THEN n.descripcion := p_cambios->>'descripcion'; END IF;
  IF p_cambios ? 'especificacion' THEN n.especificacion := p_cambios->>'especificacion'; END IF;
  IF p_cambios ? 'unidadBase' THEN n.unidad_base := p_cambios->>'unidadBase'; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.unidad_base <> v.unidad_base AND NOT EXISTS (SELECT 1 FROM unidad WHERE clave = n.unidad_base) THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF n.descripcion IS DISTINCT FROM v.descripcion THEN v_campos := array_append(v_campos, 'descripcion'); END IF;
  IF n.especificacion IS DISTINCT FROM v.especificacion THEN v_campos := array_append(v_campos, 'especificacion'); END IF;
  IF n.unidad_base IS DISTINCT FROM v.unidad_base THEN v_campos := array_append(v_campos, 'unidadBase'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE insumo
     SET descripcion = n.descripcion, especificacion = n.especificacion, unidad_base = n.unidad_base, activo = n.activo,
         revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'insumo', v.id, 'INSUMO_EDITADO', p_usuario, jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'insumo', v.id, CASE WHEN n.activo THEN 'INSUMO_REACTIVADO' ELSE 'INSUMO_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  RETURN v.revision + 1;
END $$;

-- -------------------------------- conversiones ---------------------------------

-- Val_Conversion: el destino es la unidad base del insumo y el origen es otra unidad válida.
CREATE FUNCTION "softarq_crear_conversion"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  i insumo%ROWTYPE;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO i FROM insumo WHERE organizacion_id = p_org AND codigo = p_datos->>'insumoCodigo' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unidad WHERE clave = p_datos->>'unidadOrigen') THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF p_datos->>'unidadOrigen' = i.unidad_base THEN
    RAISE EXCEPTION 'SOFTARQ:CONVERSION_DESTINO: la unidad de origen es la unidad base; no requiere conversión.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'conversion', v_id, p_expira);
  INSERT INTO conversion (id, organizacion_id, insumo_id, unidad_origen, unidad_destino, factor, fuente, registrado_por, modificado_por)
  VALUES (v_id, p_org, i.id, p_datos->>'unidadOrigen', i.unidad_base, (p_datos->>'factor')::NUMERIC, p_datos->>'fuente', p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'conversion', v_id, 'CONVERSION_REGISTRADA', p_usuario,
          jsonb_build_object('insumo', i.codigo, 'unidadOrigen', p_datos->>'unidadOrigen', 'unidadDestino', i.unidad_base, 'factor', p_datos->>'factor'));
  RETURN v_id;
END $$;

-- Editar factor o fuente con motivo. Los conceptos aprobados con un componente activo de ese insumo
-- en esa unidad vuelven a Borrador en la misma sentencia (conversion_propagar), con bitácora.
CREATE FUNCTION "softarq_editar_conversion"(
  p_org UUID, p_usuario UUID, p_insumo TEXT, p_origen TEXT, p_revision INTEGER, p_cambios JSONB, p_motivo TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v conversion%ROWTYPE;
  n conversion%ROWTYPE;
  v_insumo_id UUID;
  v_aprobados TEXT[];
  v_campos TEXT[] := ARRAY[]::TEXT[];
  r RECORD;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT id INTO v_insumo_id FROM insumo WHERE organizacion_id = p_org AND codigo = p_insumo;
  SELECT * INTO v FROM conversion WHERE organizacion_id = p_org AND insumo_id = v_insumo_id AND unidad_origen = p_origen FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'factor' THEN n.factor := (p_cambios->>'factor')::NUMERIC; END IF;
  IF p_cambios ? 'fuente' THEN n.fuente := p_cambios->>'fuente'; END IF;
  IF n.factor IS DISTINCT FROM v.factor THEN v_campos := array_append(v_campos, 'factor'); END IF;
  IF n.fuente IS DISTINCT FROM v.fuente THEN v_campos := array_append(v_campos, 'fuente'); END IF;
  IF cardinality(v_campos) = 0 THEN
    RETURN v.revision;
  END IF;
  SELECT coalesce(array_agg(c.codigo ORDER BY c.codigo), ARRAY[]::TEXT[]) INTO v_aprobados
    FROM concepto c
   WHERE c.organizacion_id = p_org AND c.estado = 'Aprobado'
     AND EXISTS (SELECT 1 FROM componente k WHERE k.organizacion_id = p_org AND k.concepto_id = c.id AND k.activo
                    AND k.insumo_id = v.insumo_id AND k.unidad_rendimiento = v.unidad_origen);
  UPDATE conversion
     SET factor = n.factor, fuente = n.fuente, revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'conversion', v.id, 'CONVERSION_EDITADA', p_usuario,
          jsonb_build_object('campos', to_jsonb(v_campos), 'factorAnterior', v.factor::TEXT, 'factorNuevo', n.factor::TEXT,
                             'motivo', p_motivo, 'conceptosABorrador', to_jsonb(v_aprobados)));
  FOR r IN SELECT id, codigo FROM concepto WHERE organizacion_id = p_org AND codigo = ANY (v_aprobados) LOOP
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'concepto', r.id, 'CONCEPTO_A_BORRADOR', p_usuario,
            jsonb_build_object('motivo', format('Conversión %s %s → %s editada: %s', p_insumo, v.unidad_origen, v.unidad_destino, p_motivo)));
  END LOOP;
  RETURN v.revision + 1;
END $$;

-- ---------------------------------- conceptos ----------------------------------

-- Val_Concepto: tipo activo; unidad de longitud, área, volumen o conteo acorde a la fórmula; regla de
-- medición; tarifa activa de la misma unidad (opcional al guardar). Siempre empieza en Borrador.
CREATE FUNCTION "softarq_crear_concepto"(
  p_org UUID, p_usuario UUID, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_tipo UUID;
  v_tarifa UUID;
  v_tarifa_activa BOOLEAN;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT id INTO v_tipo FROM tipo_estructura WHERE organizacion_id = p_org AND codigo = p_datos->>'tipoCodigo';
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF p_datos->>'tarifaCodigo' IS NOT NULL THEN
    SELECT id, activa INTO v_tarifa, v_tarifa_activa FROM tarifa_mano_obra WHERE organizacion_id = p_org AND codigo = p_datos->>'tarifaCodigo' FOR SHARE;
    IF v_tarifa IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_tarifa_activa THEN
      RAISE EXCEPTION 'SOFTARQ:TARIFA_INACTIVA' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'concepto', v_id, p_expira);
  INSERT INTO concepto (id, organizacion_id, codigo, tipo_id, descripcion, unidad, tipo_formula, permite_descuento, regla_medicion,
                        criterios, clase, estado, tarifa_id, creado_por, modificado_por, cambio_tecnico_por, cambio_tecnico_en)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'CON'), v_tipo, p_datos->>'descripcion', p_datos->>'unidad', p_datos->>'tipoFormula',
          (p_datos->>'permiteDescuento')::BOOLEAN, p_datos->>'reglaMedicion', p_datos->>'criterios', p_datos->>'clase', 'Borrador',
          v_tarifa, p_usuario, p_usuario, p_usuario, now());
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'concepto', v_id, 'CONCEPTO_CREADO', p_usuario,
          jsonb_build_object('tipo', p_datos->>'tipoCodigo', 'clase', p_datos->>'clase', 'tarifa', p_datos->>'tarifaCodigo'));
  RETURN v_id;
END $$;

-- p_cambios: tipoCodigo, descripcion, unidad, tipoFormula, permiteDescuento, reglaMedicion, criterios,
-- clase, activo. La tarifa se asigna con softarq_asignar_tarifa_concepto (módulo 11).
CREATE FUNCTION "softarq_editar_concepto"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v concepto%ROWTYPE;
  n concepto%ROWTYPE;
  d concepto%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO v FROM concepto WHERE organizacion_id = p_org AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'tipoCodigo' THEN
    SELECT id INTO n.tipo_id FROM tipo_estructura WHERE organizacion_id = p_org AND codigo = p_cambios->>'tipoCodigo';
    IF n.tipo_id IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_cambios ? 'descripcion' THEN n.descripcion := p_cambios->>'descripcion'; END IF;
  IF p_cambios ? 'unidad' THEN n.unidad := p_cambios->>'unidad'; END IF;
  IF p_cambios ? 'tipoFormula' THEN n.tipo_formula := p_cambios->>'tipoFormula'; END IF;
  IF p_cambios ? 'permiteDescuento' THEN n.permite_descuento := (p_cambios->>'permiteDescuento')::BOOLEAN; END IF;
  IF p_cambios ? 'reglaMedicion' THEN n.regla_medicion := p_cambios->>'reglaMedicion'; END IF;
  IF p_cambios ? 'criterios' THEN n.criterios := p_cambios->>'criterios'; END IF;
  IF p_cambios ? 'clase' THEN n.clase := p_cambios->>'clase'; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.tipo_id IS DISTINCT FROM v.tipo_id THEN v_campos := array_append(v_campos, 'tipo'); END IF;
  IF n.descripcion IS DISTINCT FROM v.descripcion THEN v_campos := array_append(v_campos, 'descripcion'); END IF;
  IF n.unidad IS DISTINCT FROM v.unidad THEN v_campos := array_append(v_campos, 'unidad'); END IF;
  IF n.tipo_formula IS DISTINCT FROM v.tipo_formula THEN v_campos := array_append(v_campos, 'tipoFormula'); END IF;
  IF n.permite_descuento IS DISTINCT FROM v.permite_descuento THEN v_campos := array_append(v_campos, 'permiteDescuento'); END IF;
  IF n.regla_medicion IS DISTINCT FROM v.regla_medicion THEN v_campos := array_append(v_campos, 'reglaMedicion'); END IF;
  IF n.criterios IS DISTINCT FROM v.criterios THEN v_campos := array_append(v_campos, 'criterios'); END IF;
  IF n.clase IS DISTINCT FROM v.clase THEN v_campos := array_append(v_campos, 'clase'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE concepto
     SET tipo_id = n.tipo_id, descripcion = n.descripcion, unidad = n.unidad, tipo_formula = n.tipo_formula,
         permite_descuento = n.permite_descuento, regla_medicion = n.regla_medicion, criterios = n.criterios, clase = n.clase,
         activo = n.activo, revision = revision + 1, modificado_por = p_usuario, modificado_en = now(),
         cambio_tecnico_por = CASE WHEN cardinality(v_campos) > 0 THEN p_usuario ELSE cambio_tecnico_por END,
         cambio_tecnico_en = CASE WHEN cardinality(v_campos) > 0 THEN now() ELSE cambio_tecnico_en END
   WHERE id = v.id
  RETURNING * INTO d;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'concepto', v.id, 'CONCEPTO_EDITADO', p_usuario,
            jsonb_build_object('campos', to_jsonb(v_campos), 'revisionTecnica', d.revision_tecnica,
                               'completadoHeredado', v.heredado AND NOT d.heredado));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'concepto', v.id, CASE WHEN n.activo THEN 'CONCEPTO_REACTIVADO' ELSE 'CONCEPTO_DESACTIVADO' END, p_usuario, '{}'::JSONB);
  END IF;
  IF v.estado = 'Aprobado' AND d.estado = 'Borrador' THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'concepto', v.id, 'CONCEPTO_A_BORRADOR', p_usuario,
            jsonb_build_object('motivo', CASE WHEN cardinality(v_campos) > 0 THEN 'Cambio técnico: ' || array_to_string(v_campos, ', ') ELSE 'Reactivado' END,
                               'aprobadoPor', v.aprobado_por, 'aprobadoEn', v.aprobado_en));
  END IF;
  RETURN v.revision + 1;
END $$;

-- Concepto_Aprobar (B-13): cualquier Administrador del catálogo, también quien lo creó o editó (regla
-- del libro). La aprobación corresponde a la revisión técnica revisada: si cambió, conflicto.
CREATE FUNCTION "softarq_aprobar_concepto"(
  p_org UUID, p_usuario UUID, p_codigo TEXT, p_revision_tecnica INTEGER,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
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
  PERFORM set_config('softarq.aprobacion_concepto', v.id::TEXT, TRUE);
  UPDATE concepto SET estado = 'Aprobado', aprobado_por = p_usuario, aprobado_en = now(), revision = revision + 1 WHERE id = v.id;
  PERFORM set_config('softarq.aprobacion_concepto', '', TRUE);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'concepto', v.id, 'CONCEPTO_APROBADO', p_usuario,
          jsonb_build_object('revisionTecnica', v.revision_tecnica, 'creadoPor', v.creado_por, 'cambioTecnicoPor', v.cambio_tecnico_por));
  RETURN v.id;
END $$;

-- --------------------------------- componentes ---------------------------------

-- Val_Componente: insumo activo, rendimiento > 0, 0 <= desperdicio < 1, traslape >= 0; un componente
-- por insumo en cada concepto; orden = último + 1. Fuente, fecha y responsable, opcionales al guardar.
CREATE FUNCTION "softarq_crear_componente"(
  p_org UUID, p_usuario UUID, p_concepto TEXT, p_datos JSONB,
  p_clave UUID, p_operacion TEXT, p_huella BYTEA, p_expira TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  c concepto%ROWTYPE;
  v_insumo UUID;
  v_orden INTEGER;
  v_estado TEXT;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO c FROM concepto WHERE organizacion_id = p_org AND codigo = p_concepto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_insumo FROM insumo WHERE organizacion_id = p_org AND codigo = p_datos->>'insumoCodigo';
  IF v_insumo IS NULL THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unidad WHERE clave = p_datos->>'unidadRendimiento') THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(max(orden), 0) + 1 INTO v_orden FROM componente WHERE organizacion_id = p_org AND concepto_id = c.id;
  PERFORM softarq_registrar_idempotencia(p_org, p_usuario, p_clave, p_operacion, p_huella, 'componente', v_id, p_expira);
  INSERT INTO componente (id, organizacion_id, codigo, concepto_id, insumo_id, orden, rendimiento, unidad_rendimiento, desperdicio,
                          factor_traslape, fuente, fecha, responsable, creado_por, modificado_por)
  VALUES (v_id, p_org, softarq_codigo_catalogo(p_org, 'CMP'), c.id, v_insumo, v_orden, (p_datos->>'rendimiento')::NUMERIC,
          p_datos->>'unidadRendimiento', (p_datos->>'desperdicio')::NUMERIC, (p_datos->>'factorTraslape')::NUMERIC,
          p_datos->>'fuente', (p_datos->>'fecha')::DATE, p_datos->>'responsable', p_usuario, p_usuario);
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'componente', v_id, 'COMPONENTE_CREADO', p_usuario, jsonb_build_object('concepto', c.codigo, 'insumo', p_datos->>'insumoCodigo'));
  SELECT estado INTO v_estado FROM concepto WHERE id = c.id;
  IF c.estado = 'Aprobado' AND v_estado = 'Borrador' THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'concepto', c.id, 'CONCEPTO_A_BORRADOR', p_usuario, jsonb_build_object('motivo', 'Componente agregado', 'aprobadoPor', c.aprobado_por, 'aprobadoEn', c.aprobado_en));
  END IF;
  RETURN v_id;
END $$;

-- p_cambios: insumoCodigo, rendimiento, unidadRendimiento, desperdicio, factorTraslape, fuente, fecha,
-- responsable, activo (null borra los opcionales).
CREATE FUNCTION "softarq_editar_componente"(
  p_org UUID, p_usuario UUID, p_concepto TEXT, p_codigo TEXT, p_revision INTEGER, p_cambios JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  c concepto%ROWTYPE;
  v componente%ROWTYPE;
  n componente%ROWTYPE;
  v_campos TEXT[] := ARRAY[]::TEXT[];
  v_estado TEXT;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_usuario, 'ADMIN_CATALOGO');
  SELECT * INTO c FROM concepto WHERE organizacion_id = p_org AND codigo = p_concepto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v FROM componente WHERE organizacion_id = p_org AND concepto_id = c.id AND codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF v.revision <> p_revision THEN
    RAISE EXCEPTION 'SOFTARQ:CONFLICTO_EDICION' USING ERRCODE = 'P0001';
  END IF;
  n := v;
  IF p_cambios ? 'insumoCodigo' THEN
    SELECT id INTO n.insumo_id FROM insumo WHERE organizacion_id = p_org AND codigo = p_cambios->>'insumoCodigo';
    IF n.insumo_id IS NULL THEN
      RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_cambios ? 'rendimiento' THEN n.rendimiento := (p_cambios->>'rendimiento')::NUMERIC; END IF;
  IF p_cambios ? 'unidadRendimiento' THEN n.unidad_rendimiento := p_cambios->>'unidadRendimiento'; END IF;
  IF p_cambios ? 'desperdicio' THEN n.desperdicio := (p_cambios->>'desperdicio')::NUMERIC; END IF;
  IF p_cambios ? 'factorTraslape' THEN n.factor_traslape := (p_cambios->>'factorTraslape')::NUMERIC; END IF;
  IF p_cambios ? 'fuente' THEN n.fuente := p_cambios->>'fuente'; END IF;
  IF p_cambios ? 'fecha' THEN n.fecha := (p_cambios->>'fecha')::DATE; END IF;
  IF p_cambios ? 'responsable' THEN n.responsable := p_cambios->>'responsable'; END IF;
  IF p_cambios ? 'activo' THEN n.activo := (p_cambios->>'activo')::BOOLEAN; END IF;
  IF n.unidad_rendimiento <> v.unidad_rendimiento AND NOT EXISTS (SELECT 1 FROM unidad WHERE clave = n.unidad_rendimiento) THEN
    RAISE EXCEPTION 'SOFTARQ:UNIDAD_INVALIDA' USING ERRCODE = 'P0001';
  END IF;
  IF n.insumo_id IS DISTINCT FROM v.insumo_id THEN v_campos := array_append(v_campos, 'insumo'); END IF;
  IF n.rendimiento IS DISTINCT FROM v.rendimiento THEN v_campos := array_append(v_campos, 'rendimiento'); END IF;
  IF n.unidad_rendimiento IS DISTINCT FROM v.unidad_rendimiento THEN v_campos := array_append(v_campos, 'unidadRendimiento'); END IF;
  IF n.desperdicio IS DISTINCT FROM v.desperdicio THEN v_campos := array_append(v_campos, 'desperdicio'); END IF;
  IF n.factor_traslape IS DISTINCT FROM v.factor_traslape THEN v_campos := array_append(v_campos, 'factorTraslape'); END IF;
  IF n.fuente IS DISTINCT FROM v.fuente THEN v_campos := array_append(v_campos, 'fuente'); END IF;
  IF n.fecha IS DISTINCT FROM v.fecha THEN v_campos := array_append(v_campos, 'fecha'); END IF;
  IF n.responsable IS DISTINCT FROM v.responsable THEN v_campos := array_append(v_campos, 'responsable'); END IF;
  IF cardinality(v_campos) = 0 AND n.activo = v.activo THEN
    RETURN v.revision;
  END IF;
  UPDATE componente
     SET insumo_id = n.insumo_id, rendimiento = n.rendimiento, unidad_rendimiento = n.unidad_rendimiento, desperdicio = n.desperdicio,
         factor_traslape = n.factor_traslape, fuente = n.fuente, fecha = n.fecha, responsable = n.responsable, activo = n.activo,
         revision = revision + 1, modificado_por = p_usuario, modificado_en = now()
   WHERE id = v.id;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'componente', v.id, 'COMPONENTE_EDITADO', p_usuario, jsonb_build_object('concepto', c.codigo, 'campos', to_jsonb(v_campos)));
  END IF;
  IF n.activo <> v.activo THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'componente', v.id, CASE WHEN n.activo THEN 'COMPONENTE_REACTIVADO' ELSE 'COMPONENTE_DESACTIVADO' END, p_usuario,
            jsonb_build_object('concepto', c.codigo));
  END IF;
  SELECT estado INTO v_estado FROM concepto WHERE id = c.id;
  IF c.estado = 'Aprobado' AND v_estado = 'Borrador' THEN
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'concepto', c.id, 'CONCEPTO_A_BORRADOR', p_usuario,
            jsonb_build_object('motivo', format('Cambio en el componente %s', v.codigo), 'aprobadoPor', c.aprobado_por, 'aprobadoEn', c.aprobado_en));
  END IF;
  RETURN v.revision + 1;
END $$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución (las columnas editables de softarq_app están en scripts/db/permisos-app.sql)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION "tipo_estructura_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "insumo_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "conversion_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "conversion_propagar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "componente_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "componente_propagar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "concepto_proteger"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_problemas_concepto"(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_tipo_estructura"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_tipo_estructura"(UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_insumo"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_insumo"(UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_conversion"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_conversion"(UUID, UUID, TEXT, TEXT, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_concepto"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_concepto"(UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_aprobar_concepto"(UUID, UUID, TEXT, INTEGER, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_crear_componente"(UUID, UUID, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "softarq_editar_componente"(UUID, UUID, TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC;
