-- Permisos del rol de la aplicación tras cada `prisma migrate deploy` (ADR-0004, ADR-0007 a ADR-0010, ADR-0013 a ADR-0016).
-- Lo ejecuta el rol migrador con `prisma db execute`. Solo sentencias constantes.
-- La aplicación lee y escribe catálogos, pero no borra (los registros se desactivan o anulan),
-- no ejecuta DDL y no puede leer ni alterar el historial de migraciones.
GRANT USAGE ON SCHEMA public TO softarq_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO softarq_app;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM softarq_app;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM softarq_app;
REVOKE INSERT, UPDATE ON TABLE public."unidad" FROM softarq_app;
-- Identidad (ADR-0007): la aplicación solo consulta usuarios y pertenencias; no crea, modifica
-- ni reactiva cuentas (las cuentas DEMO las carga el rol migrador).
REVOKE INSERT, UPDATE ON TABLE public."usuario", public."membresia" FROM softarq_app;
-- Sesiones: alta y, como única modificación, actividad y revocación (nunca el hash del token,
-- el titular ni las fechas de expiración). Sin DELETE: la purga es tarea del rol migrador.
REVOKE UPDATE ON TABLE public."sesion" FROM softarq_app;
GRANT UPDATE ("ultima_actividad_en", "revocada_en", "motivo_revocacion") ON TABLE public."sesion" TO softarq_app;
-- Cotizaciones (ADR-0008). Versiones, bitácora e idempotencia: solo alta y consulta (las versiones
-- son inmutables; además lo impide un trigger). En las demás, UPDATE solo de columnas editables:
-- nunca identificadores, códigos, folio, organización, cliente del proyecto ni datos de creación.
REVOKE UPDATE ON TABLE public."cotizacion_version", public."bitacora", public."idempotencia" FROM softarq_app;
REVOKE UPDATE ON TABLE public."cliente", public."proyecto", public."cotizacion", public."cotizacion_borrador", public."contador" FROM softarq_app;
GRANT UPDATE ("nombre", "contacto_nombre", "contacto_telefono", "contacto_correo", "activo", "revision", "modificado_por", "modificado_en") ON TABLE public."cliente" TO softarq_app;
GRANT UPDATE ("nombre", "municipio", "entidad_federativa", "descripcion", "activo", "revision", "modificado_por", "modificado_en") ON TABLE public."proyecto" TO softarq_app;
GRANT UPDATE ("ultima_version", "estado_folio", "descartada_por", "descartada_en", "motivo_descarte") ON TABLE public."cotizacion" TO softarq_app;
GRANT UPDATE ("captura", "revision", "actualizado_por", "actualizado_en") ON TABLE public."cotizacion_borrador" TO softarq_app;
GRANT UPDATE ("ultimo") ON TABLE public."contador" TO softarq_app;
-- Revisión (ADR-0009): alta y consulta; UPDATE solo de las columnas de la transición (un trigger
-- limita las transiciones). El historial de revisión es de solo alta. Sin DELETE.
REVOKE UPDATE ON TABLE public."revision", public."revision_evento" FROM softarq_app;
GRANT UPDATE ("estado", "revision", "resuelta_por", "resuelta_en", "observaciones") ON TABLE public."revision" TO softarq_app;
-- Emisión (ADR-0010): alta y consulta, sin UPDATE ni DELETE (además, triggers de inmutabilidad y de
-- coherencia). Emisor: UPDATE solo de sus columnas editables. El descarte de una cotización escribe
-- estado_folio y sus tres datos (un trigger limita la transición a ACTIVO → DESCARTADO).
REVOKE UPDATE ON TABLE public."emision", public."emisor" FROM softarq_app;
GRANT UPDATE ("nombre", "domicilio", "telefono", "correo", "logo_clave", "revision", "modificado_por", "modificado_en") ON TABLE public."emisor" TO softarq_app;
-- Funciones de escritura (SECURITY INVOKER: actúan con los permisos anteriores). Solo softarq_app.
REVOKE ALL ON FUNCTION public."softarq_siguiente"(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_registrar_idempotencia"(UUID, UUID, UUID, TEXT, BYTEA, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_crear_cliente"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_crear_proyecto"(UUID, UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_editar_cliente"(UUID, UUID, UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_editar_proyecto"(UUID, UUID, UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_crear_cotizacion"(UUID, UUID, UUID, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_guardar_borrador"(UUID, UUID, UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_crear_version"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."cotizacion_version_inmutable"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."softarq_siguiente"(UUID, TEXT) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_registrar_idempotencia"(UUID, UUID, UUID, TEXT, BYTEA, TEXT, UUID, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_crear_cliente"(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_crear_proyecto"(UUID, UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_editar_cliente"(UUID, UUID, UUID, INTEGER, JSONB) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_editar_proyecto"(UUID, UUID, UUID, INTEGER, JSONB) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_crear_cotizacion"(UUID, UUID, UUID, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_guardar_borrador"(UUID, UUID, UUID, INTEGER, JSONB) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_crear_version"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
REVOKE ALL ON FUNCTION public."softarq_exigir_funcion"(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_enviar_revision"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_decidir_revision"(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_retirar_revision"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."revision_transicion"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."revision_evento_inmutable"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."softarq_exigir_funcion"(UUID, UUID, TEXT) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_enviar_revision"(UUID, UUID, UUID, INTEGER, INTEGER, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_decidir_revision"(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_retirar_revision"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
REVOKE ALL ON FUNCTION public."cotizacion_transicion"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."emision_inmutable"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."emision_validar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."revision_evento_validar"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_exigir_emisor"(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_emitir_version"(UUID, UUID, UUID, INTEGER, UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_anular_aprobacion"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_descartar_cotizacion"(UUID, UUID, UUID, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."softarq_guardar_emisor"(UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."softarq_exigir_emisor"(UUID, UUID, UUID) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_emitir_version"(UUID, UUID, UUID, INTEGER, UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_anular_aprobacion"(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_descartar_cotizacion"(UUID, UUID, UUID, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
GRANT EXECUTE ON FUNCTION public."softarq_guardar_emisor"(UUID, UUID, INTEGER, JSONB, TEXT) TO softarq_app;

-- ADR-0013. Condicional para poder restaurar también respaldos del módulo 8.
DO $$ BEGIN
  IF to_regclass('public.respuesta_cliente_evento') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE public.respuesta_cliente_evento FROM softarq_app;
    GRANT SELECT, INSERT ON TABLE public.respuesta_cliente_evento TO softarq_app;
    REVOKE ALL ON FUNCTION public.respuesta_cliente_inmutable(), public.respuesta_cliente_validar() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.softarq_registrar_respuesta(UUID,UUID,UUID,UUID,JSONB,DATE,TIMESTAMPTZ,UUID,TEXT,BYTEA,TIMESTAMPTZ) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.softarq_registrar_respuesta(UUID,UUID,UUID,UUID,JSONB,DATE,TIMESTAMPTZ,UUID,TEXT,BYTEA,TIMESTAMPTZ) TO softarq_app;
  END IF;
END $$;

-- ADR-0014 (módulo 10). Condicional para poder restaurar también respaldos de módulos anteriores.
DO $$ BEGIN
  IF to_regclass('public.excepcion_decision') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE public.excepcion_decision FROM softarq_app;
    GRANT SELECT, INSERT ON TABLE public.excepcion_decision TO softarq_app;
    REVOKE ALL ON FUNCTION public.excepcion_decision_inmutable(), public.excepcion_decision_validar() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.softarq_decidir_excepcion(UUID,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT,BYTEA,TIMESTAMPTZ) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.softarq_decidir_excepcion(UUID,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT,BYTEA,TIMESTAMPTZ) TO softarq_app;
  END IF;
END $$;

-- ADR-0015 (módulo 11): administración de proveedores, productos, precios y tarifas. UPDATE solo de
-- las columnas editables (nunca código, organización, importe, inicio de vigencia, fuente ni datos
-- de alta); los disparadores limitan además qué cambio es válido. Sin DELETE ni DDL. Condicional
-- para poder restaurar también respaldos de módulos anteriores.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'proveedor' AND column_name = 'revision') THEN
    REVOKE UPDATE ON TABLE public.proveedor, public.producto, public.precio, public.tarifa_mano_obra FROM softarq_app;
    GRANT UPDATE (nombre, contacto, telefono, correo, activo, revision, modificado_por, modificado_en) ON TABLE public.proveedor TO softarq_app;
    GRANT UPDATE (insumo_id, descripcion, presentacion, unidad_compra, contenido, fraccionable, incremento_minimo, activo,
                  revision, modificado_por, modificado_en) ON TABLE public.producto TO softarq_app;
    GRANT UPDATE (vigente_hasta, anulado, motivo_anulacion, anulado_por, anulado_en, revision) ON TABLE public.precio TO softarq_app;
    GRANT UPDATE (activa, revision, modificado_por, modificado_en) ON TABLE public.tarifa_mano_obra TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_normalizar(TEXT) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_codigo_catalogo(UUID, TEXT) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_proveedor(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_proveedor(UUID, UUID, TEXT, INTEGER, JSONB) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_producto(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_producto(UUID, UUID, TEXT, INTEGER, JSONB) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_registrar_precio(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_anular_precio(UUID, UUID, TEXT, INTEGER, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_cerrar_vigencia_precio(UUID, UUID, TEXT, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_registrar_tarifa(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_cambiar_activa_tarifa(UUID, UUID, TEXT, INTEGER, BOOLEAN) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_asignar_tarifa_concepto(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
  END IF;
END $$;

-- ADR-0016 (módulo 12): insumos, conversiones, tipos de estructura, conceptos y componentes. UPDATE
-- solo de las columnas que escriben las funciones: nunca códigos, organización, concepto u orden de un
-- componente, datos de alta ni la marca `heredado` (la quita el disparador al completar el concepto).
-- `estado` y `aprobado_*` sí, porque los disparadores limitan el cambio: pasar a Aprobado solo dentro
-- de softarq_aprobar_concepto. Sin DELETE ni DDL. Condicional para restaurar respaldos anteriores.
DO $$ BEGIN
  IF to_regclass('public.tipo_estructura') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE public.tipo_estructura, public.insumo, public.conversion, public.concepto, public.componente FROM softarq_app;
    GRANT UPDATE (familia, nombre, prioritario, activo, revision, modificado_por, modificado_en) ON TABLE public.tipo_estructura TO softarq_app;
    GRANT UPDATE (descripcion, especificacion, unidad_base, activo, revision, modificado_por, modificado_en) ON TABLE public.insumo TO softarq_app;
    GRANT UPDATE (factor, fuente, revision, modificado_por, modificado_en) ON TABLE public.conversion TO softarq_app;
    GRANT UPDATE (tipo_id, descripcion, unidad, tipo_formula, permite_descuento, regla_medicion, criterios, clase, tarifa_id, activo,
                  estado, aprobado_por, aprobado_en, revision, revision_tecnica, cambio_tecnico_por, cambio_tecnico_en,
                  modificado_por, modificado_en) ON TABLE public.concepto TO softarq_app;
    GRANT UPDATE (insumo_id, rendimiento, unidad_rendimiento, desperdicio, factor_traslape, fuente, fecha, responsable, activo,
                  revision, modificado_por, modificado_en) ON TABLE public.componente TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_problemas_concepto(UUID, UUID) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_tipo_estructura(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_tipo_estructura(UUID, UUID, TEXT, INTEGER, JSONB) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_insumo(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_insumo(UUID, UUID, TEXT, INTEGER, JSONB) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_conversion(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_conversion(UUID, UUID, TEXT, TEXT, INTEGER, JSONB, TEXT) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_concepto(UUID, UUID, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_concepto(UUID, UUID, TEXT, INTEGER, JSONB) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_aprobar_concepto(UUID, UUID, TEXT, INTEGER, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_crear_componente(UUID, UUID, TEXT, JSONB, UUID, TEXT, BYTEA, TIMESTAMPTZ) TO softarq_app;
    GRANT EXECUTE ON FUNCTION public.softarq_editar_componente(UUID, UUID, TEXT, TEXT, INTEGER, JSONB) TO softarq_app;
  END IF;
END $$;
