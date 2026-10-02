-- Migración 0001 — Catálogos para el motor de cálculo (ADR-0004).
-- Parte 1: generada con `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
-- Parte 2 (al final): restricciones que Prisma no representa (CHECK, exclusión de vigencias)
-- y los datos de la referencia común `unidad`. Solo contiene sentencias constantes: ningún
-- valor procede de entradas de la aplicación.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "unidad" (
    "clave" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "magnitud" VARCHAR(20) NOT NULL,

    CONSTRAINT "unidad_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "organizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "es_demo" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_calculo" (
    "organizacion_id" UUID NOT NULL,
    "ambiente" VARCHAR(12) NOT NULL,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'MXN',
    "recargo_sobre_costo" DECIMAL(7,6),
    "impuesto_tasa" DECIMAL(7,6),
    "impuesto_base" VARCHAR(30),
    "impuesto_tratamiento" VARCHAR(500),
    "impuesto_nombre" VARCHAR(100),
    "vigencia_dias" INTEGER,

    CONSTRAINT "parametros_calculo_pkey" PRIMARY KEY ("organizacion_id")
);

-- CreateTable
CREATE TABLE "insumo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "unidad_base" VARCHAR(10) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "insumo_id" UUID NOT NULL,
    "unidad_origen" VARCHAR(10) NOT NULL,
    "unidad_destino" VARCHAR(10) NOT NULL,
    "factor" DECIMAL(20,10) NOT NULL,
    "fuente" VARCHAR(500) NOT NULL,

    CONSTRAINT "conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "insumo_id" UUID NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "presentacion" VARCHAR(200) NOT NULL,
    "unidad_compra" VARCHAR(10) NOT NULL,
    "contenido" DECIMAL(20,6) NOT NULL,
    "fraccionable" BOOLEAN NOT NULL,
    "incremento_minimo" DECIMAL(20,6),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "producto_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "precio_unitario" DECIMAL(18,6) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "fuente" VARCHAR(500) NOT NULL,

    CONSTRAINT "precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifa_mano_obra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "modalidad" VARCHAR(12) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "unidad" VARCHAR(10) NOT NULL,
    "importe" DECIMAL(18,6) NOT NULL,
    "rendimiento_jornada" DECIMAL(20,6),
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fuente" VARCHAR(500) NOT NULL,

    CONSTRAINT "tarifa_mano_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "unidad" VARCHAR(10) NOT NULL,
    "tipo_formula" VARCHAR(10) NOT NULL,
    "permite_descuento" BOOLEAN NOT NULL,
    "clase" VARCHAR(15) NOT NULL,
    "estado" VARCHAR(10) NOT NULL,
    "tarifa_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "concepto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "concepto_id" UUID NOT NULL,
    "insumo_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "rendimiento" DECIMAL(20,6) NOT NULL,
    "unidad_rendimiento" VARCHAR(10) NOT NULL,
    "desperdicio" DECIMAL(7,6) NOT NULL,
    "factor_traslape" DECIMAL(9,6),
    "fuente" VARCHAR(500) NOT NULL,
    "fecha" DATE NOT NULL,
    "responsable" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "componente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_adicional" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "categoria" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "unidad" VARCHAR(10) NOT NULL,
    "regla" VARCHAR(20) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_adicional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizacion_codigo_key" ON "organizacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "insumo_organizacion_id_id_key" ON "insumo"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "insumo_organizacion_id_codigo_key" ON "insumo"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_insumo_id_unidad_origen_unidad_destino_key" ON "conversion"("insumo_id", "unidad_origen", "unidad_destino");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_organizacion_id_id_key" ON "proveedor"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_organizacion_id_codigo_key" ON "proveedor"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "producto_organizacion_id_id_key" ON "producto"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "producto_organizacion_id_codigo_key" ON "producto"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "precio_organizacion_id_codigo_key" ON "precio"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tarifa_mano_obra_organizacion_id_id_key" ON "tarifa_mano_obra"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tarifa_mano_obra_organizacion_id_codigo_key" ON "tarifa_mano_obra"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "concepto_organizacion_id_id_key" ON "concepto"("organizacion_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "concepto_organizacion_id_codigo_key" ON "concepto"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "componente_organizacion_id_codigo_key" ON "componente"("organizacion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "componente_concepto_id_orden_key" ON "componente"("concepto_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_adicional_organizacion_id_codigo_key" ON "tipo_adicional"("organizacion_id", "codigo");

-- AddForeignKey
ALTER TABLE "parametros_calculo" ADD CONSTRAINT "parametros_calculo_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_unidad_base_fkey" FOREIGN KEY ("unidad_base") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_organizacion_id_insumo_id_fkey" FOREIGN KEY ("organizacion_id", "insumo_id") REFERENCES "insumo"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_unidad_origen_fkey" FOREIGN KEY ("unidad_origen") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_unidad_destino_fkey" FOREIGN KEY ("unidad_destino") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_organizacion_id_insumo_id_fkey" FOREIGN KEY ("organizacion_id", "insumo_id") REFERENCES "insumo"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_unidad_compra_fkey" FOREIGN KEY ("unidad_compra") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_organizacion_id_producto_id_fkey" FOREIGN KEY ("organizacion_id", "producto_id") REFERENCES "producto"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_organizacion_id_proveedor_id_fkey" FOREIGN KEY ("organizacion_id", "proveedor_id") REFERENCES "proveedor"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarifa_mano_obra" ADD CONSTRAINT "tarifa_mano_obra_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarifa_mano_obra" ADD CONSTRAINT "tarifa_mano_obra_unidad_fkey" FOREIGN KEY ("unidad") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_unidad_fkey" FOREIGN KEY ("unidad") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_organizacion_id_tarifa_id_fkey" FOREIGN KEY ("organizacion_id", "tarifa_id") REFERENCES "tarifa_mano_obra"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "componente" ADD CONSTRAINT "componente_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "componente" ADD CONSTRAINT "componente_organizacion_id_concepto_id_fkey" FOREIGN KEY ("organizacion_id", "concepto_id") REFERENCES "concepto"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "componente" ADD CONSTRAINT "componente_organizacion_id_insumo_id_fkey" FOREIGN KEY ("organizacion_id", "insumo_id") REFERENCES "insumo"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "componente" ADD CONSTRAINT "componente_unidad_rendimiento_fkey" FOREIGN KEY ("unidad_rendimiento") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tipo_adicional" ADD CONSTRAINT "tipo_adicional_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tipo_adicional" ADD CONSTRAINT "tipo_adicional_unidad_fkey" FOREIGN KEY ("unidad") REFERENCES "unidad"("clave") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Parte 2 — restricciones de negocio (fuentes: Word maestro v1.3 §3.3-3.7 y
-- validaciones de catálogo del libro: modCatalogos.bas, modConfig.bas).
-- ===========================================================================

-- Parámetros de venta: NULL significa «no definido» (BL-12/BL-13); 0 es un valor válido.
ALTER TABLE "parametros_calculo"
  ADD CONSTRAINT "parametros_ambiente_ck" CHECK ("ambiente" IN ('DEMO', 'PRODUCCION')),
  ADD CONSTRAINT "parametros_moneda_ck" CHECK ("moneda" = 'MXN'),
  ADD CONSTRAINT "parametros_recargo_ck" CHECK ("recargo_sobre_costo" IS NULL OR ("recargo_sobre_costo" >= 0 AND "recargo_sobre_costo" <= 1)),
  ADD CONSTRAINT "parametros_impuesto_tasa_ck" CHECK ("impuesto_tasa" IS NULL OR ("impuesto_tasa" >= 0 AND "impuesto_tasa" <= 1)),
  ADD CONSTRAINT "parametros_impuesto_base_ck" CHECK ("impuesto_base" IS NULL OR "impuesto_base" = 'SUBTOTAL_VENTA'),
  ADD CONSTRAINT "parametros_impuesto_completo_ck" CHECK (
    ("impuesto_tasa" IS NULL AND "impuesto_base" IS NULL AND "impuesto_tratamiento" IS NULL AND "impuesto_nombre" IS NULL)
    OR ("impuesto_tasa" IS NOT NULL AND "impuesto_base" IS NOT NULL AND "impuesto_tratamiento" IS NOT NULL AND "impuesto_nombre" IS NOT NULL)),
  ADD CONSTRAINT "parametros_vigencia_ck" CHECK ("vigencia_dias" IS NULL OR "vigencia_dias" > 0);

ALTER TABLE "conversion"
  ADD CONSTRAINT "conversion_factor_ck" CHECK ("factor" > 0),
  ADD CONSTRAINT "conversion_unidades_distintas_ck" CHECK ("unidad_origen" <> "unidad_destino");

ALTER TABLE "producto"
  ADD CONSTRAINT "producto_contenido_ck" CHECK ("contenido" > 0),
  ADD CONSTRAINT "producto_incremento_ck" CHECK (
    ("fraccionable" AND "incremento_minimo" IS NOT NULL AND "incremento_minimo" > 0)
    OR (NOT "fraccionable" AND "incremento_minimo" IS NULL));

ALTER TABLE "precio"
  ADD CONSTRAINT "precio_positivo_ck" CHECK ("precio_unitario" > 0),
  ADD CONSTRAINT "precio_vigencia_ck" CHECK ("vigente_desde" <= "vigente_hasta");

ALTER TABLE "tarifa_mano_obra"
  ADD CONSTRAINT "tarifa_modalidad_ck" CHECK ("modalidad" IN ('UNIDAD', 'JORNADA', 'SUBCONTRATO')),
  ADD CONSTRAINT "tarifa_importe_ck" CHECK ("importe" > 0),
  ADD CONSTRAINT "tarifa_vigencia_ck" CHECK ("vigente_desde" <= "vigente_hasta"),
  ADD CONSTRAINT "tarifa_rendimiento_jornada_ck" CHECK (
    ("modalidad" = 'JORNADA' AND "rendimiento_jornada" IS NOT NULL AND "rendimiento_jornada" > 0)
    OR ("modalidad" <> 'JORNADA' AND "rendimiento_jornada" IS NULL));

ALTER TABLE "concepto"
  ADD CONSTRAINT "concepto_tipo_formula_ck" CHECK ("tipo_formula" IN ('CONTEO', 'LONGITUD', 'AREA', 'VOLUMEN')),
  ADD CONSTRAINT "concepto_clase_ck" CHECK ("clase" IN ('ESTANDAR', 'GENERICO', 'PERSONALIZADO')),
  ADD CONSTRAINT "concepto_estado_ck" CHECK ("estado" IN ('Borrador', 'Aprobado'));

ALTER TABLE "componente"
  ADD CONSTRAINT "componente_rendimiento_ck" CHECK ("rendimiento" > 0),
  ADD CONSTRAINT "componente_desperdicio_ck" CHECK ("desperdicio" >= 0 AND "desperdicio" < 1),
  ADD CONSTRAINT "componente_traslape_ck" CHECK ("factor_traslape" IS NULL OR "factor_traslape" >= 0),
  ADD CONSTRAINT "componente_orden_ck" CHECK ("orden" > 0);

ALTER TABLE "tipo_adicional"
  ADD CONSTRAINT "tipo_adicional_regla_ck" CHECK ("regla" = 'MONTO_CAPTURADO');

-- Un mismo producto y proveedor no puede tener dos precios no anulados con vigencias que se
-- solapen (Val_Precio del libro). btree_gist es una extensión de confianza: la crea el
-- propietario de la base (softarq_migrator) sin privilegios de superusuario.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "precio"
  ADD CONSTRAINT "precio_sin_solape_ex" EXCLUDE USING gist (
    "organizacion_id" WITH =,
    "producto_id" WITH =,
    "proveedor_id" WITH =,
    daterange("vigente_desde", "vigente_hasta", '[]') WITH &&
  ) WHERE (NOT "anulado");

-- Referencia común: catálogo de unidades de la fase 1 (entrega\fuentes\build\modBuild.bas, B_Unidades).
INSERT INTO "unidad" ("clave", "nombre", "magnitud") VALUES
  ('m', 'Metro', 'longitud'),
  ('m2', 'Metro cuadrado', 'area'),
  ('m3', 'Metro cúbico', 'volumen'),
  ('l', 'Litro', 'volumen'),
  ('kg', 'Kilogramo', 'masa'),
  ('t', 'Tonelada', 'masa'),
  ('pza', 'Pieza', 'conteo'),
  ('bulto', 'Bulto', 'conteo'),
  ('rollo', 'Rollo', 'conteo'),
  ('lote', 'Lote', 'conteo'),
  ('jor', 'Jornada', 'tiempo'),
  ('hr', 'Hora', 'tiempo'),
  ('dia', 'Día', 'tiempo'),
  ('viaje', 'Viaje', 'servicio'),
  ('serv', 'Servicio', 'servicio');

