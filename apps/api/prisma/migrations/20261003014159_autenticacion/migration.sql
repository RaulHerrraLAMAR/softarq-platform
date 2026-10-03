-- Módulo 5 (ADR-0007): usuarios, pertenencias y sesiones opacas.
-- Parte 1: SQL generado por Prisma (prisma migrate dev --create-only), con funciones NOT NULL.
-- Parte 2 (al final): restricciones que Prisma no representa (CHECK). Los permisos de
-- softarq_app se aplican después con scripts/db/permisos-app.sql.

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "correo" VARCHAR(254) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "es_demo" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contrasena_cambiada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "funciones" VARCHAR(20)[] NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" VARCHAR(10) NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "organizacion_id" UUID,
    "usuario_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,
    "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada_en" TIMESTAMPTZ(3),
    "motivo_revocacion" VARCHAR(30),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE INDEX "membresia_usuario_id_idx" ON "membresia"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_organizacion_id_usuario_id_key" ON "membresia"("organizacion_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_hash_key" ON "sesion"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE INDEX "sesion_expira_en_idx" ON "sesion"("expira_en");

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_organizacion_id_usuario_id_fkey" FOREIGN KEY ("organizacion_id", "usuario_id") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Parte 2: restricciones de integridad (revisadas a mano).
-- ---------------------------------------------------------------------------

ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_correo_normalizado_ck" CHECK ("correo" = lower(btrim("correo")) AND "correo" LIKE '%_@_%'),
  ADD CONSTRAINT "usuario_nombre_ck" CHECK (btrim("nombre") <> ''),
  -- Solo cadenas PHC de Argon2id: nunca una contraseña en claro ni otro algoritmo.
  ADD CONSTRAINT "usuario_hash_argon2id_ck" CHECK ("hash_contrasena" LIKE '$argon2id$v=19$m=%');

ALTER TABLE "membresia"
  -- Funciones del libro (modConfig.bas: FN_PREP, FN_REV, FN_ADMCAT, FN_ADMSIS).
  ADD CONSTRAINT "membresia_funciones_ck" CHECK (
    cardinality("funciones") >= 1
    AND "funciones" <@ ARRAY['PREPARADOR', 'REVISOR', 'ADMIN_CATALOGO', 'ADMIN_SISTEMA']::VARCHAR(20)[]
  );

ALTER TABLE "sesion"
  ADD CONSTRAINT "sesion_tipo_ck" CHECK ("tipo" IN ('PREVIA', 'USUARIO')),
  -- Una sesión de usuario lleva usuario y organización (FK compuesta a membresia); una previa, ninguno.
  ADD CONSTRAINT "sesion_tipo_titular_ck" CHECK (
    ("tipo" = 'USUARIO' AND "usuario_id" IS NOT NULL AND "organizacion_id" IS NOT NULL)
    OR ("tipo" = 'PREVIA' AND "usuario_id" IS NULL AND "organizacion_id" IS NULL)
  ),
  -- SHA-256: 32 bytes. El token utilizable nunca se guarda.
  ADD CONSTRAINT "sesion_token_hash_ck" CHECK (octet_length("token_hash") = 32),
  ADD CONSTRAINT "sesion_fechas_ck" CHECK ("expira_en" > "creada_en" AND "ultima_actividad_en" >= "creada_en"),
  ADD CONSTRAINT "sesion_revocacion_ck" CHECK (("revocada_en" IS NULL) = ("motivo_revocacion" IS NULL));
