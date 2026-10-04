-- Permisos del rol de la aplicación tras cada `prisma migrate deploy` (ADR-0004, ADR-0007, ADR-0008, ADR-0009, ADR-0010).
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
