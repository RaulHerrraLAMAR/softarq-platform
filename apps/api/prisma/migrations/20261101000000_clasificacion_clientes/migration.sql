-- Clasificación de clientes: presentación, QA o humo (E3.8, ADR-0021 §Consecuencias).
--
-- Separa lo que se enseña, lo que prueban las automatizaciones y lo que quedó de las pruebas de humo de módulos anteriores SIN
-- ocultar ni reclasificar nada por sí sola: una fila es una decisión explícita de una persona (Administrador del sistema), con su
-- motivo y fecha, y se puede cambiar o retirar (queda en la bitácora). Un cliente sin fila queda «sin clasificar»; no se asume
-- que lo marcado [DEMO] sea desechable. Los proyectos, cotizaciones y solicitudes heredan la categoría de su cliente.
-- Aditiva: no modifica ni borra ninguna fila existente (ni cotizaciones, versiones, emisiones o documentos).

CREATE TABLE "clasificacion_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "categoria" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "clasificado_por" UUID NOT NULL,
    "clasificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clasificacion_cliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clasificacion_cliente_organizacion_id_cliente_id_key" ON "clasificacion_cliente"("organizacion_id", "cliente_id");
CREATE INDEX "clasificacion_cliente_organizacion_id_categoria_idx" ON "clasificacion_cliente"("organizacion_id", "categoria");

ALTER TABLE "clasificacion_cliente" ADD CONSTRAINT "clasificacion_cliente_cliente_fkey" FOREIGN KEY ("organizacion_id", "cliente_id") REFERENCES "cliente"("organizacion_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "clasificacion_cliente" ADD CONSTRAINT "clasificacion_cliente_autor_fkey" FOREIGN KEY ("organizacion_id", "clasificado_por") REFERENCES "membresia"("organizacion_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "clasificacion_cliente"
  ADD CONSTRAINT "clasificacion_cliente_categoria_ck" CHECK ("categoria" IN ('PRESENTACION', 'QA', 'HUMO')),
  ADD CONSTRAINT "clasificacion_cliente_motivo_ck" CHECK (char_length(btrim("motivo")) >= 3);

-- Única vía de escritura: la aplicación solo lee la tabla; la función exige la función ADMIN_SISTEMA en la base y deja la bitácora.
-- `p_categoria` NULL retira la clasificación (el cliente vuelve a «sin clasificar»).
CREATE FUNCTION "softarq_clasificar_cliente"(p_org UUID, p_admin UUID, p_cliente UUID, p_categoria TEXT, p_motivo TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_anterior TEXT;
BEGIN
  PERFORM softarq_exigir_funcion(p_org, p_admin, 'ADMIN_SISTEMA');
  PERFORM 1 FROM cliente WHERE id = p_cliente AND organizacion_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOFTARQ:NO_ENCONTRADO' USING ERRCODE = 'P0001';
  END IF;
  IF p_categoria IS NOT NULL AND p_categoria NOT IN ('PRESENTACION', 'QA', 'HUMO') THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'SOFTARQ:VALOR_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  SELECT categoria INTO v_anterior FROM clasificacion_cliente WHERE organizacion_id = p_org AND cliente_id = p_cliente FOR UPDATE;
  IF p_categoria IS NULL THEN
    DELETE FROM clasificacion_cliente WHERE organizacion_id = p_org AND cliente_id = p_cliente;
    INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
    VALUES (p_org, 'cliente', p_cliente, 'CLASIFICACION_RETIRADA', p_admin, jsonb_build_object('anterior', v_anterior, 'motivo', btrim(p_motivo)));
    RETURN NULL;
  END IF;
  IF v_anterior IS NULL THEN
    INSERT INTO clasificacion_cliente (organizacion_id, cliente_id, categoria, motivo, clasificado_por)
    VALUES (p_org, p_cliente, p_categoria, btrim(p_motivo), p_admin);
  ELSE
    UPDATE clasificacion_cliente
       SET categoria = p_categoria, motivo = btrim(p_motivo), clasificado_por = p_admin, clasificado_en = now()
     WHERE organizacion_id = p_org AND cliente_id = p_cliente;
  END IF;
  INSERT INTO bitacora (organizacion_id, entidad, entidad_id, tipo, usuario_id, detalle)
  VALUES (p_org, 'cliente', p_cliente, 'CLASIFICADO', p_admin, jsonb_build_object('categoria', p_categoria, 'anterior', v_anterior, 'motivo', btrim(p_motivo)));
  RETURN p_categoria;
END $$;

REVOKE ALL ON FUNCTION "softarq_clasificar_cliente"(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
