/**
 * Especificación OpenAPI 3.1 de la API v1, generada desde los esquemas Zod de @softarq/contracts
 * (la misma definición que valida en ejecución). `docs/api/openapi.json` debe coincidir con este
 * documento; una prueba lo comprueba.
 */
import {
  EsquemaBorrador,
  EsquemaCapturaBorrador,
  EsquemaCliente,
  EsquemaConsultaClientes,
  EsquemaConsultaCotizaciones,
  EsquemaConsultaProyectos,
  EsquemaDetalleCliente,
  EsquemaDetalleCotizacion,
  EsquemaEdicionCliente,
  EsquemaEdicionProyecto,
  EsquemaProyecto,
  EsquemaRespuestaBorradorGuardado,
  EsquemaRespuestaClientes,
  EsquemaRespuestaCotizaciones,
  EsquemaRespuestaProyectos,
  EsquemaSolicitudBorrador,
  EsquemaSolicitudCliente,
  EsquemaSolicitudCotizacion,
  EsquemaSolicitudProyecto,
  EsquemaSolicitudVersion,
  EsquemaVersion,
  EsquemaConsultaRevisiones,
  EsquemaDecisionRevision,
  EsquemaDetalleRevision,
  EsquemaRespuestaRevisiones,
  EsquemaRetiroRevision,
  EsquemaSolicitudEnvioRevision,
  EsquemaAnulacionAprobacion,
  EsquemaDescarteCotizacion,
  EsquemaDetalleEmision,
  EsquemaEdicionEmisor,
  EsquemaEmisor,
  EsquemaSolicitudEmision,
  EsquemaValidacionEmision,
  EsquemaSeguimientoEmision,
  EsquemaEventoRespuestaCliente,
  EsquemaRegistroRespuesta,
  EsquemaCorreccionRespuesta,
  EsquemaDecisionExcepcion,
  EsquemaExcepcionesVersion,
  EsquemaSalidasInternasVersion,
  EsquemaRespuestaComponentesExcepcion,
  EsquemaConsultaComponentesExcepcion,
  EsquemaConsultaConceptos,
  EsquemaConsultaOpcionesPrecio,
  EsquemaConsultaTiposAdicional,
  EsquemaRespuestaCalculoDemo,
  EsquemaRespuestaConceptos,
  EsquemaRespuestaCsrf,
  EsquemaRespuestaError,
  EsquemaRespuestaOpcionesPrecio,
  EsquemaRespuestaSalud,
  EsquemaRespuestaSesion,
  EsquemaRespuestaTiposAdicional,
  EsquemaSolicitudAcceso,
  EsquemaSolicitudCalculoDemo,
  EsquemaVerificacionRevision,
  // Módulo 11 (ADR-0015): administración de catálogos (contratos internos).
  EsquemaAnulacionPrecio,
  EsquemaAsignacionTarifa,
  EsquemaCierreVigenciaPrecio,
  EsquemaConceptoTarifaAdmin,
  EsquemaConsultaConceptosAdmin,
  EsquemaConsultaInsumosAdmin,
  EsquemaConsultaPreciosAdmin,
  EsquemaConsultaProductosAdmin,
  EsquemaConsultaProveedoresAdmin,
  EsquemaConsultaTarifasAdmin,
  EsquemaDetallePrecioAdmin,
  EsquemaDetalleProductoAdmin,
  EsquemaDetalleProveedorAdmin,
  EsquemaDetalleTarifaAdmin,
  EsquemaEdicionProducto,
  EsquemaEdicionProveedor,
  EsquemaEdicionTarifa,
  EsquemaPrecioAdmin,
  EsquemaProductoAdmin,
  EsquemaProveedorAdmin,
  EsquemaRespuestaCierreVigencia,
  EsquemaRespuestaConceptosAdmin,
  EsquemaRespuestaInsumosAdmin,
  EsquemaCambioContrasena,
  EsquemaDetalleParametros,
  EsquemaEdicionParametros,
  EsquemaRespuestaPersonas,
  EsquemaDetallePersona,
  EsquemaPersonaAdmin,
  EsquemaSolicitudPersona,
  EsquemaEdicionPersona,
  EsquemaRestablecimientoContrasena,
  EsquemaRespuestaCredencialTemporal,
  EsquemaConsultaPersonas,
  EsquemaInsumoAdmin,
  EsquemaSolicitudInsumo,
  EsquemaEdicionInsumo,
  EsquemaDetalleInsumoAdmin,
  EsquemaSolicitudConversion,
  EsquemaEdicionConversion,
  EsquemaSolicitudTipoEstructura,
  EsquemaEdicionTipoEstructura,
  EsquemaTipoEstructuraAdmin,
  EsquemaRespuestaTiposEstructura,
  EsquemaDetalleTipoEstructura,
  EsquemaConsultaTiposEstructura,
  EsquemaSolicitudConcepto,
  EsquemaEdicionConcepto,
  EsquemaAprobacionConcepto,
  EsquemaDetalleConceptoAdmin,
  EsquemaSolicitudComponente,
  EsquemaEdicionComponente,
  EsquemaRespuestaPreciosAdmin,
  EsquemaRespuestaProductosAdmin,
  EsquemaRespuestaProveedoresAdmin,
  EsquemaRespuestaTarifasAdmin,
  EsquemaRespuestaUnidades,
  EsquemaSolicitudPrecio,
  EsquemaSolicitudProducto,
  EsquemaSolicitudProveedor,
  EsquemaSolicitudTarifa,
  EsquemaTarifaAdmin,
} from "@softarq/contracts";
import { z } from "zod";

const json = (schema: z.ZodType, io: "input" | "output") => {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  return resto;
};

const errores = (...estados: number[]) =>
  Object.fromEntries(
    estados.map((s) => [
      String(s),
      { description: DESCRIPCION_ERROR[s], content: { "application/json": { schema: { $ref: "#/components/schemas/RespuestaError" } } } },
    ]),
  );

const DESCRIPCION_ERROR: Record<number, string> = {
  400: "SOLICITUD_INVALIDA: no cumple el contrato (campos con su ruta) o JSON mal formado.",
  401: "NO_AUTENTICADO (sin cookie de sesión) o SESION_NO_VALIDA (vencida, revocada o desconocida; se borra la cookie).",
  403: "SIN_PERMISO (la función no concede la capacidad), CSRF_NO_VALIDO u ORIGEN_NO_PERMITIDO.",
  404: "NO_ENCONTRADO: ruta, id o códigos inexistentes en la organización (un id de otra organización responde igual).",
  409:
    "CONFLICTO_EDICION (revisión obsoleta; `actual` trae el estado vigente), BORRADOR_DESACTUALIZADO (el borrador cambió; no se guardó ni se envió nada), " +
    "REVISION_PENDIENTE (hay una versión en revisión: no se edita ni se calcula), VERSION_NO_VIGENTE (solo se envía la última versión) " +
    "CONFLICTO_REVISION (la revisión cambió o ya se decidió; `revisionVigente` trae su estado), " +
    "VERSION_EMITIDA (la versión ya se emitió), APROBACION_NO_VIGENTE (la aprobación se anuló o cambió), " +
    "CONFLICTO_EMISION (la versión o la aprobación vistas ya no son las vigentes), FOLIO_NO_ACTIVO (cotización descartada), " +
    "CONFLICTO_RESPUESTA (cabeza comercial cambió; seguimientoVigente trae el estado actual), EMISION_SUSTITUIDA (sin primera respuesta sobre documento sustituido), " +
    "CONFLICTO_EXCEPCION (otra persona ya decidió la excepción; `excepcionesVigentes` trae las decisiones vigentes), " +
    "DUPLICADO (proveedor o producto ya existente; `registroVigente`), SOLAPE_VIGENCIA (precio del mismo producto y proveedor en el periodo; `registroVigente`), " +
    "CONFLICTO_TARIFA (otra persona cambió la tarifa del concepto), PRECIO_ANULADO (la anulación es definitiva) o " +
    "CONFLICTO_APROBACION (el contenido técnico del concepto cambió o ya se aprobó; `registroVigente`).",
  413: "CUERPO_DEMASIADO_GRANDE.",
  415: "TIPO_DE_CONTENIDO_NO_ADMITIDO: el cuerpo debe ser application/json.",
  422:
    "CALCULO_BLOQUEADO (códigos BL, sin importes), CAPTURA_INCOMPLETA (campos pendientes), REGISTRO_INACTIVO, REFERENCIA_NO_DISPONIBLE, " +
    "ENVIO_BLOQUEADO / APROBACION_BLOQUEADA (bloqueos vigentes; el estado no cambió), DECISION_BLOQUEADA (BL-17: quien aprueba no puede ser el autor), " +
    "EMISION_BLOQUEADA (BL-01 a BL-20 a la fecha de emisión; nada cambió), DESCARTE_BLOQUEADO (estado que no permite descartar), " +
    "FECHA_RESPUESTA_INVALIDA (anterior a emisión o futura), RESPUESTA_FUERA_VIGENCIA (recepción después del último día), " +
    "EXCEPCION_INVALIDA (excepción que no corresponde a la captura, al catálogo o fuera de rango; nada se guardó), " +
    "PRODUCTO_CON_PRECIOS (campos técnicos bloqueados), UNIDAD_INCOMPATIBLE (BL-06), VIGENCIA_INVALIDA, VALOR_INVALIDO, " +
    "TIPO_CON_CONCEPTOS (la familia no cambia), INSUMO_CON_REFERENCIAS (la unidad base no cambia), " +
    "CONCEPTO_INCOMPLETO (concepto heredado: complete tipo y regla), REQUISITOS_INCOMPLETOS (`problemas` de aprobación), " +
    "IDEMPOTENCIA_CONFLICTO o IDEMPOTENCIA_CADUCADA.",
  429: "DEMASIADAS_SOLICITUDES (cabecera Retry-After).",
  503: "SERVICIO_NO_DISPONIBLE: PostgreSQL no disponible.",
  500:
    "ERROR_INTERNO, DOCUMENTO_NO_GENERADO (no se generó o guardó el PDF; no hay emisión y se puede reintentar) o " +
    "DOCUMENTO_NO_DISPONIBLE (el archivo emitido falta o no coincide con su registro; nunca se regenera).",
};

function parametrosQuery(schema: z.ZodType): unknown[] {
  const s = json(schema, "input") as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(s.properties ?? {}).map(([name, sch]) => ({
    name,
    in: "query",
    required: (s.required ?? []).includes(name),
    schema: sch,
  }));
}

const ok = (ref: string, descripcion: string) => ({
  description: descripcion,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const cuerpo = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const PARAMETRO_ID = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const PARAMETRO_CODIGO = { name: "codigo", in: "path", required: true, schema: { type: "string", pattern: "^[A-Z0-9][A-Z0-9_-]{0,39}$" } };
const ADMIN = "Contrato INTERNO con importes de proveedor y tarifas; capacidad catalogos.administrar (Administrador del catálogo). Nunca forma parte de la proyección comercial ni del PDF.";
const TECNICO =
  "Contrato INTERNO con rendimientos, desperdicios, factores, reglas de medición y trazabilidad (ADR-0016); capacidad catalogos.administrar. Nunca forma parte de la proyección comercial ni del PDF.";
const SISTEMA =
  "Contrato INTERNO del Administrador del sistema (ADR-0017): parámetros (B-38) o personas y funciones (B-39). La organización y el autor salen de la sesión.";
const PARAMETRO_PERSONA = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const PARAMETRO_UNIDAD = { name: "unidad", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]{1,10}$" } };
const PARAMETRO_COMPONENTE = { name: "componente", in: "path", required: true, schema: { type: "string", pattern: "^[A-Z0-9][A-Z0-9_-]{0,39}$" } };
const PARAMETRO_NUMERO = { name: "numero", in: "path", required: true, schema: { type: "integer", minimum: 1 } };
const CABECERA_IDEMPOTENCIA = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description:
    "UUID de la intención (obligatorio en las altas). Repetirlo con el mismo contenido reproduce el resultado " +
    "(cabecera de respuesta Idempotent-Replayed: true); con otra operación u otro contenido responde 422. Vigencia: 24 h.",
  schema: { type: "string", format: "uuid" },
};
const CON_EFECTOS = [{ cookieSesion: [], tokenCsrf: [] }];

export function construirDocumentoOpenApi(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "SoftArq API (DEMO local)",
      version: "1.0.0",
      description:
        "API local de SoftArq: catálogos DEMO y cálculo de cotizaciones con datos de PostgreSQL. " +
        "Solo escucha en 127.0.0.1. Autenticación con sesión opaca en una cookie HttpOnly (`softarq_sesion`); " +
        "la organización, la identidad y las funciones salen de la sesión (ADR-0007). Las solicitudes POST, PUT, PATCH y DELETE " +
        "exigen la cabecera X-CSRF-Token de la sesión y un Origin permitido. Clientes, proyectos y cotizaciones con folio " +
        "WEB DEMO, borrador con revisión y versiones inmutables calculadas en el servidor (ADR-0008); las altas exigen " +
        "Idempotency-Key. Revisión y aprobación por otra persona (ADR-0009); emisión de versiones aprobadas con PDF DEMO, " +
        "anulación de aprobaciones y descarte de cotizaciones (ADR-0010). " +
        "Los importes y cantidades viajan como texto decimal. Todos los datos son DEMO y no tienen validez comercial.",
    },
    servers: [{ url: "http://localhost:3000", description: "API local (escucha en 127.0.0.1; el navegador usa localhost)." }],
    security: [{ cookieSesion: [] }],
    paths: {
      "/health": {
        get: {
          summary: "Salud del servicio y de PostgreSQL",
          security: [],
          responses: {
            "200": ok("RespuestaSalud", "Servicio y base de datos disponibles."),
            "503": ok("RespuestaSalud", "Base de datos no disponible."),
            ...errores(429),
          },
        },
      },
      "/api/v1/auth/csrf": {
        get: {
          summary: "Crea la sesión previa al acceso (cookie) y devuelve su token CSRF",
          security: [],
          responses: { "200": ok("RespuestaCsrf", "Token CSRF para iniciar sesión."), ...errores(429, 503, 500) },
        },
      },
      "/api/v1/auth/contrasena": {
        post: {
          summary: "Cambio propio de contraseña (obligatorio con una temporal; ADR-0017)",
          description:
            "Exige la contraseña actual, una nueva de al menos 12 caracteres distinta de la actual y su confirmación; CSRF y el limitador de accesos. Revoca TODAS las sesiones de la persona (incluida la actual) y borra la cookie: hay que volver a entrar. Con una temporal pendiente, el resto de las rutas responde 403 CAMBIO_CONTRASENA_REQUERIDO.",
          security: CON_EFECTOS,
          requestBody: cuerpo("CambioContrasena"),
          responses: { "204": { description: "Contraseña cambiada; sesión cerrada." }, ...errores(400, 401, 403, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/auth/sesion": {
        post: {
          summary: "Inicia sesión con correo y contraseña (exige la sesión previa y su token CSRF)",
          security: [{ cookieSesion: [], tokenCsrf: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SolicitudAcceso" } } },
          },
          responses: {
            "200": ok("RespuestaSesion", "Sesión iniciada; cookie nueva y token CSRF nuevo."),
            ...errores(400, 401, 403, 413, 415, 429, 503, 500),
          },
        },
        get: {
          summary: "Identidad, organización, funciones, capacidades y token CSRF de la sesión actual",
          responses: { "200": ok("RespuestaSesion", "Sesión vigente."), ...errores(401, 429, 503, 500) },
        },
        delete: {
          summary: "Cierra la sesión (revocación en el servidor) y borra la cookie",
          security: [{ cookieSesion: [], tokenCsrf: [] }],
          responses: { "204": { description: "Sesión cerrada." }, ...errores(401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/conceptos": {
        get: {
          summary: "Conceptos activos y aprobados (sin costos internos)",
          parameters: parametrosQuery(EsquemaConsultaConceptos),
          responses: { "200": ok("RespuestaConceptos", "Conceptos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/opciones-precio": {
        get: {
          summary: "Opciones de precio vigentes por insumo de los conceptos indicados (sin precios)",
          parameters: parametrosQuery(EsquemaConsultaOpcionesPrecio),
          responses: { "200": ok("RespuestaOpcionesPrecio", "Opciones por insumo."), ...errores(400, 401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/catalogos/tipos-adicional": {
        get: {
          summary: "Tipos de costo adicional",
          parameters: parametrosQuery(EsquemaConsultaTiposAdicional),
          responses: { "200": ok("RespuestaTiposAdicional", "Tipos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/calculos/demo": {
        post: {
          summary: "Calcula una cotización DEMO con datos de PostgreSQL y devuelve la proyección comercial (capacidad calculo.ejecutar: Preparador)",
          security: [{ cookieSesion: [], tokenCsrf: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SolicitudCalculoDemo" } } },
          },
          responses: {
            "200": ok("RespuestaCalculoDemo", "Cotización calculada (solo vista comercial)."),
            ...errores(400, 401, 403, 404, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/clientes": {
        get: {
          summary: "Clientes de la organización (activos, o todos con incluirInactivos=true). Capacidad clientes.consultar",
          parameters: parametrosQuery(EsquemaConsultaClientes),
          responses: { "200": ok("RespuestaClientes", "Clientes."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Crea un cliente con código CLI-NNNNN (capacidad clientes.gestionar: Preparador o Adm. catálogo)",
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudCliente"),
          responses: { "201": ok("Cliente", "Cliente creado (o reproducido)."), ...errores(400, 401, 403, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/clientes/{id}": {
        get: {
          summary: "Cliente, sus proyectos y número de cotizaciones activas",
          parameters: [PARAMETRO_ID],
          responses: { "200": ok("DetalleCliente", "Cliente."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Edita, desactiva o reactiva un cliente (con la revisión leída; nunca se borra)",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID],
          requestBody: cuerpo("EdicionCliente"),
          responses: { "200": ok("Cliente", "Cliente actualizado."), ...errores(400, 401, 403, 404, 409, 413, 415, 429, 503, 500) },
        },
      },
      "/api/v1/proyectos": {
        get: {
          summary: "Proyectos (activos con cliente activo, o todos con incluirInactivos=true)",
          parameters: parametrosQuery(EsquemaConsultaProyectos),
          responses: { "200": ok("RespuestaProyectos", "Proyectos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Crea un proyecto PRY-NNNNN de un cliente activo (capacidad clientes.gestionar)",
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudProyecto"),
          responses: { "201": ok("Proyecto", "Proyecto creado (o reproducido)."), ...errores(400, 401, 403, 404, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/proyectos/{id}": {
        get: {
          summary: "Proyecto",
          parameters: [PARAMETRO_ID],
          responses: { "200": ok("Proyecto", "Proyecto."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Edita, desactiva o reactiva un proyecto (con la revisión leída; el cliente no cambia)",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID],
          requestBody: cuerpo("EdicionProyecto"),
          responses: { "200": ok("Proyecto", "Proyecto actualizado."), ...errores(400, 401, 403, 404, 409, 413, 415, 429, 503, 500) },
        },
      },
      "/api/v1/cotizaciones": {
        get: {
          summary: "Cotizaciones con folio WEB DEMO (capacidad cotizaciones.consultar)",
          parameters: parametrosQuery(EsquemaConsultaCotizaciones),
          responses: { "200": ok("RespuestaCotizaciones", "Cotizaciones."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Crea una cotización: reserva el folio COT-AAAA-NNNNN y un borrador (capacidad cotizaciones.preparar: Preparador)",
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudCotizacion"),
          responses: {
            "201": ok("DetalleCotizacion", "Cotización creada (o reproducida)."),
            ...errores(400, 401, 403, 404, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/cotizaciones/{id}": {
        get: {
          summary: "Cotización, borrador (revisión, autor y completitud), versiones y eventos recientes",
          parameters: [PARAMETRO_ID],
          responses: { "200": ok("DetalleCotizacion", "Cotización."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/cotizaciones/{id}/borrador": {
        put: {
          summary: "Guarda la captura en borrador si sigue en la revisión indicada (puede estar incompleta; nunca tiene total)",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID],
          requestBody: cuerpo("SolicitudBorrador"),
          responses: {
            "200": ok("RespuestaBorradorGuardado", "Borrador guardado."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 429, 503, 500),
          },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones": {
        post: {
          summary:
            "Calcula en el servidor con el borrador guardado y las condiciones vigentes, y guarda una versión inmutable " +
            "(capacidades cotizaciones.preparar y calculo.ejecutar: Preparador; organización DEMO)",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudVersion"),
          responses: {
            "201": ok("Version", "Versión guardada (o reproducida): lo almacenado, solo la vista comercial."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}": {
        get: {
          summary: "Versión guardada tal como se almacenó (no se recalcula)",
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO],
          responses: { "200": ok("Version", "Versión."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}/revisiones": {
        post: {
          summary:
            "Envía a revisión la ÚLTIMA versión, que debe corresponder al borrador guardado (revisionBorrador); verifica las " +
            "condiciones vigentes sin modificar la versión (capacidad revisiones.enviar: Preparador)",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudEnvioRevision"),
          responses: {
            "201": ok("DetalleRevision", "Revisión PENDIENTE creada (o reproducida)."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/revisiones": {
        get: {
          summary: "Bandeja de revisiones (por omisión, PENDIENTE; las más antiguas primero) con las acciones permitidas a la sesión",
          parameters: parametrosQuery(EsquemaConsultaRevisiones),
          responses: { "200": ok("RespuestaRevisiones", "Revisiones."), ...errores(400, 401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/revisiones/{id}": {
        get: {
          summary: "Revisión, versión revisada tal como se guardó (vista comercial), verificación vigente e historial",
          parameters: [PARAMETRO_ID],
          responses: { "200": ok("DetalleRevision", "Revisión."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/revisiones/{id}/decision": {
        post: {
          summary:
            "Aprueba o solicita cambios sobre la versión y la ficha vistas (capacidad revisiones.decidir: Revisor; BL-17 por " +
            "identidad: quien aprueba no es el autor de la versión). La aprobación no es emisión ni entrega al cliente",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("DecisionRevision"),
          responses: {
            "200": ok("DetalleRevision", "Revisión decidida (o reproducida)."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/revisiones/{id}/retiro": {
        post: {
          summary: "Retira una revisión pendiente para corregir (capacidad revisiones.enviar: Preparador)",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("RetiroRevision"),
          responses: {
            "200": ok("DetalleRevision", "Revisión retirada (o reproducida)."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/cotizaciones/{id}/descarte": {
        post: {
          summary: "Descarta la cotización con motivo (capacidad cotizaciones.preparar: Preparador; ADR-0010)",
          description:
            "Solo si el folio está activo, sin emisiones, sin revisión pendiente y sin aprobación vigente. Conserva folio, " +
            "versiones y eventos; el folio no se reutiliza y la cotización queda de solo lectura.",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("DescarteCotizacion"),
          responses: {
            "200": ok("DetalleCotizacion", "Cotización descartada (o reproducida)."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}/emision/validacion": {
        get: {
          summary: "Validación previa a la emisión (solo lectura)",
          description:
            "Lo que se emitiría hoy (fecha del servidor): destinatario, emisor, textos, vigencia y total, con los bloqueos " +
            "BL-01 a BL-20 y los avisos vigentes, y si la sesión puede emitir.",
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO],
          responses: { "200": ok("ValidacionEmision", "Validación."), ...errores(401, 404, 429, 503, 500) },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}/emision": {
        post: {
          summary: "Emite la versión aprobada (capacidad emisiones.emitir: Preparador, o Revisor distinto del autor)",
          description:
            "Comprueba de nuevo permisos, aprobación vigente de ESA versión por otra persona, versión, borrador y bloqueos; " +
            "genera el PDF DEMO, lo guarda y registra la emisión con tamaño y SHA-256. 201 solo cuando existen el archivo y el registro. " +
            "No recalcula importes.",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudEmision"),
          responses: {
            "201": ok("DetalleEmision", "Versión emitida (o reproducida con Idempotent-Replayed: true)."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/emisiones/{id}": {
        get: {
          summary: "Registro de una emisión y contenido exacto del documento emitido",
          parameters: [PARAMETRO_ID],
          responses: { "200": ok("DetalleEmision", "Emisión."), ...errores(401, 404, 429, 503, 500) },
        },
      },
      "/api/v1/emisiones/{id}/documento": {
        get: {
          summary: "Descarga autenticada del PDF emitido (los mismos bytes registrados)",
          description:
            "Content-Type application/pdf, Content-Disposition attachment con el nombre COT-AAAA-NNNNN-vN.pdf y Repr-Digest " +
            "(SHA-256). Si el archivo falta o no coincide con su registro: 500 DOCUMENTO_NO_DISPONIBLE (nunca se regenera).",
          parameters: [PARAMETRO_ID],
          responses: {
            "200": { description: "PDF emitido.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
            ...errores(401, 404, 429, 503, 500),
          },
        },
      },
      "/api/v1/emisiones/{id}/seguimiento": {
        get: {
          summary: "Vigencia y respuestas registradas internamente sobre esta emisión exacta",
          description: "Fecha del servidor y zona de negocio. Historial descendente de 50 eventos; antesDe pagina eventos anteriores, sin cambiar la respuesta vigente.",
          parameters: [PARAMETRO_ID, { in: "query", name: "antesDe", schema: { type: "integer", minimum: 1, maximum: 2147483647 } }],
          responses: { "200": ok("SeguimientoEmision", "Seguimiento y acciones autorizadas."), ...errores(400, 401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/emisiones/{id}/respuestas": {
        post: {
          summary: "Preparador registra una respuesta recibida dentro de vigencia (inclusive)",
          description: "Registro interno, no acción autenticada del cliente. Puede capturarse después de vencer si la fecha recibida fue válida. No se admite una primera respuesta sobre una emisión sustituida. Emisión, versión e importes permanecen intactos.",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, CABECERA_IDEMPOTENCIA], requestBody: cuerpo("RegistroRespuesta"),
          responses: { "201": ok("EventoRespuestaCliente", "Evento inmutable (o reproducido con Idempotent-Replayed)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/emisiones/{id}/respuestas/{eventoId}/correcciones": {
        post: {
          summary: "Preparador corrige el registro vigente mediante un nuevo evento y motivo",
          description: "eventoId debe ser la cabeza vigente; 409 CONFLICTO_RESPUESTA devuelve seguimientoVigente. Nunca se borra ni edita el evento anterior. Una corrección histórica también puede corresponder a un documento sustituido.",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, { in: "path", name: "eventoId", required: true, schema: { type: "string", format: "uuid" } }, CABECERA_IDEMPOTENCIA], requestBody: cuerpo("CorreccionRespuesta"),
          responses: { "201": ok("EventoRespuestaCliente", "Corrección inmutable (o reproducida)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/excepciones/componentes": {
        get: {
          summary: "Componentes de catálogo para registrar una excepción de rendimiento (Preparador; capacidad excepciones.consultar)",
          description: "Datos técnicos internos (rendimiento y desperdicio de catálogo), sin costos, tarifas ni traslape. Nunca forman parte de la proyección comercial ni del PDF.",
          parameters: parametrosQuery(EsquemaConsultaComponentesExcepcion),
          responses: { "200": ok("RespuestaComponentesExcepcion", "Componentes activos por concepto."), ...errores(400, 401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}/excepciones": {
        get: {
          summary: "Excepciones congeladas en la versión, con sus decisiones (Preparador y Revisor; capacidad excepciones.consultar)",
          description: "Valor de catálogo con el que se calculó la versión y valor aplicado. `acciones.decidir` indica si la sesión puede autorizar o rechazar (Revisor distinto del preparador, revisión pendiente).",
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO],
          responses: { "200": ok("ExcepcionesVersion", "Excepciones de la versión."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}/salidas-internas": {
        get: {
          summary: "Compras calculadas, detalle del cálculo e indicadores de la versión (Preparador y Revisor; capacidad salidas.consultar)",
          description:
            "Contrato INTERNO de solo lectura (12 COMPRAS, 13 DETALLE_CALCULO e indicadores de 14 REVISION): costos, consumos, proveedores, recargo y margen. Todo sale de lo congelado en la versión; nunca del catálogo ni de los parámetros vigentes. `disponibilidad` indica si la versión congeló nombres y vigencias (COMPLETO), solo códigos (SIN_NOMBRES, versiones anteriores al módulo 14) o si el detalle no está disponible (NO_DISPONIBLE). Un indicador sin valor es NO_APLICA (denominador 0) o NO_DISPONIBLE, nunca 0. No escribe nada. Nunca forma parte de la proyección comercial ni del PDF.",
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO],
          responses: { "200": ok("SalidasInternasVersion", "Salidas internas de la versión."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/revisiones/{id}/excepciones/{numero}/decision": {
        post: {
          summary: "Autoriza o rechaza la excepción N de la versión en revisión (Revisor distinto del preparador, BL-17)",
          description: "Una decisión por excepción y versión, inmutable. Aprobar y emitir exigen todas las excepciones AUTORIZADAS; una RECHAZADA impide aprobar esa versión (se corrige en una versión nueva).",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, { name: "numero", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 100 } }, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("DecisionExcepcion"),
          responses: { "200": ok("ExcepcionesVersion", "Decisión registrada (o reproducida con Idempotent-Replayed)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/emisor": {
        get: {
          summary: "Datos del emisor de la organización (BL-15) y lo que falta para emitir",
          responses: { "200": ok("Emisor", "Emisor."), ...errores(401, 429, 503, 500) },
        },
        put: {
          summary: "Guarda los datos del emisor (capacidad emisor.configurar: Administrador del sistema)",
          description: "Concurrencia optimista por `revision` (0 = aún no configurado) y motivo obligatorio. No altera documentos ya emitidos.",
          security: CON_EFECTOS,
          requestBody: cuerpo("EdicionEmisor"),
          responses: { "200": ok("Emisor", "Emisor guardado."), ...errores(400, 401, 403, 409, 413, 415, 429, 503, 500) },
        },
      },
      "/api/v1/revisiones/{id}/anulacion": {
        post: {
          summary: "Anula una aprobación antes de emitir, con motivo (capacidad revisiones.decidir: Revisor)",
          description: "Crea un evento nuevo que cita la aprobación; la revisión y su evento de aprobación no cambian.",
          security: CON_EFECTOS,
          parameters: [PARAMETRO_ID, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("AnulacionAprobacion"),
          responses: {
            "200": ok("DetalleRevision", "Aprobación anulada (o reproducida)."),
            ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500),
          },
        },
      },
      "/api/v1/cotizaciones/{id}/versiones/{numero}/verificacion": {
        get: {
          summary: "Verificación vigente de una versión: si el catálogo cambió después de calcularla (capacidad cotizaciones.consultar)",
          description: "La misma comprobación que al enviar (BL-16 detecta cualquier cambio de catálogo frente a la instantánea; BL-08, BL-09, BL-10…). No recalcula importes ni escribe nada; la versión no cambia.",
          parameters: [PARAMETRO_ID, PARAMETRO_NUMERO],
          responses: { "200": ok("VerificacionRevision", "Bloqueos y avisos vigentes."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/admin/proveedores": {
        get: {
          summary: "Proveedores (03 PROVEEDORES), por código con paginación keyset",
          description: ADMIN,
          parameters: parametrosQuery(EsquemaConsultaProveedoresAdmin),
          responses: { "200": ok("RespuestaProveedoresAdmin", "Página de proveedores."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Nuevo proveedor (PRV-NNNNN); rechaza el nombre duplicado normalizado (Val_Proveedor)",
          description: ADMIN,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudProveedor"),
          responses: { "201": ok("ProveedorAdmin", "Proveedor creado (o reproducido)."), ...errores(400, 401, 403, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/proveedores/{codigo}": {
        get: {
          summary: "Detalle del proveedor con el impacto de desactivarlo y su historial",
          description: ADMIN,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetalleProveedorAdmin", "Proveedor."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Edita datos del proveedor o lo desactiva o reactiva (revisión obligatoria; sin borrado)",
          description: ADMIN,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO],
          requestBody: cuerpo("EdicionProveedor"),
          responses: { "200": ok("ProveedorAdmin", "Proveedor guardado."), ...errores(400, 401, 403, 404, 409, 413, 415, 429, 503, 500) },
        },
      },
      "/api/v1/admin/productos": {
        get: {
          summary: "Productos comerciales (05 PRODUCTOS) con su presentación y contenido",
          description: ADMIN,
          parameters: parametrosQuery(EsquemaConsultaProductosAdmin),
          responses: { "200": ok("RespuestaProductosAdmin", "Página de productos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Nuevo producto (PCM-NNNNN) de un insumo activo (Val_Producto)",
          description: ADMIN,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudProducto"),
          responses: { "201": ok("ProductoAdmin", "Producto creado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/productos/{codigo}": {
        get: {
          summary: "Detalle del producto con el impacto de desactivarlo y su historial",
          description: ADMIN,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetalleProductoAdmin", "Producto."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Edita el producto; con algún precio registrado solo cambian la descripción comercial y el estado activo",
          description: `${ADMIN} Adaptación autorizada (ADR-0015 §2.1): con precios, insumo, presentación, unidad, contenido y venta fraccionada no cambian (422 PRODUCTO_CON_PRECIOS).`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO],
          requestBody: cuerpo("EdicionProducto"),
          responses: { "200": ok("ProductoAdmin", "Producto guardado."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/precios": {
        get: {
          summary: "Precios (06 PRECIOS) con su estado a la fecha del servidor",
          description: ADMIN,
          parameters: parametrosQuery(EsquemaConsultaPreciosAdmin),
          responses: { "200": ok("RespuestaPreciosAdmin", "Página de precios."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Registrar precio (PRE-NNNNNN) sin solape con otro no anulado del mismo producto y proveedor (Val_Precio)",
          description: `${ADMIN} Los precios no se editan (RF-06).`,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudPrecio"),
          responses: { "201": ok("PrecioAdmin", "Precio registrado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/precios/{codigo}": {
        get: {
          summary: "Detalle del precio con los borradores que lo usan y su historial",
          description: ADMIN,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetallePrecioAdmin", "Precio."), ...errores(401, 403, 404, 429, 503, 500) },
        },
      },
      "/api/v1/admin/precios/{codigo}/anulacion": {
        post: {
          summary: "Anular precio erróneo, con motivo (Precio_Anular): definitivo; el registro se conserva",
          description: ADMIN,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("AnulacionPrecio"),
          responses: { "200": ok("PrecioAdmin", "Precio anulado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/precios/{codigo}/cierre-vigencia": {
        post: {
          summary: "Cerrar vigencia y registrar sucesor en una sola operación (adaptación autorizada; P3 pendiente con el cliente)",
          description: `${ADMIN} La nueva fecha final es igual o posterior a hoy y al inicio y anterior a la actual; el sucesor empieza después. Si el sucesor falla, la vigencia no se acorta.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("CierreVigenciaPrecio"),
          responses: { "201": ok("RespuestaCierreVigencia", "Vigencia cerrada y sucesor registrado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/tarifas": {
        get: {
          summary: "Tarifas de mano de obra (07 MANO_OBRA)",
          description: ADMIN,
          parameters: parametrosQuery(EsquemaConsultaTarifasAdmin),
          responses: { "200": ok("RespuestaTarifasAdmin", "Página de tarifas."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Registrar tarifa (TMO-NNNNN) UNIDAD, JORNADA o SUBCONTRATO (Val_Tarifa)",
          description: `${ADMIN} Las tarifas no se editan: se registra una nueva y se asigna al concepto (Word §3.5).`,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudTarifa"),
          responses: { "201": ok("TarifaAdmin", "Tarifa registrada (o reproducida)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/tarifas/{codigo}": {
        get: {
          summary: "Detalle de la tarifa con los conceptos que la usan y su historial",
          description: ADMIN,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetalleTarifaAdmin", "Tarifa."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Desactiva o reactiva la tarifa (revisión obligatoria)",
          description: ADMIN,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO],
          requestBody: cuerpo("EdicionTarifa"),
          responses: { "200": ok("TarifaAdmin", "Tarifa guardada."), ...errores(400, 401, 403, 404, 409, 413, 415, 429, 503, 500) },
        },
      },
      "/api/v1/admin/conceptos": {
        get: {
          summary: "Conceptos con tipo, estado, aprobación y tarifa asignada",
          description: ADMIN,
          parameters: parametrosQuery(EsquemaConsultaConceptosAdmin),
          responses: { "200": ok("RespuestaConceptosAdmin", "Página de conceptos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Nuevo concepto (CON-NNNNN) en Borrador (Val_Concepto): tipo activo, unidad acorde a la fórmula, regla de medición y tarifa de la misma unidad",
          description: `${TECNICO} La descripción es única dentro del tipo (Normalizar).`,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudConcepto"),
          responses: { "201": ok("DetalleConceptoAdmin", "Concepto creado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/conceptos/{codigo}": {
        get: {
          summary: "Detalle del concepto: componentes con convertibilidad y trazabilidad, requisitos de aprobación del servidor e historial",
          description: TECNICO,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetalleConceptoAdmin", "Concepto."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Editar o activar/desactivar el concepto: un cambio técnico lo devuelve a Borrador y retira la aprobación",
          description: `${TECNICO} Desactivar conserva la aprobación; reactivar vuelve a Borrador (BTN_ConceptoActivo). Un concepto heredado exige completar tipo y regla (422 CONCEPTO_INCOMPLETO).`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO],
          requestBody: cuerpo("EdicionConcepto"),
          responses: { "200": ok("DetalleConceptoAdmin", "Concepto guardado."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/conceptos/{codigo}/aprobacion": {
        post: {
          summary: "Aprobar el concepto (Concepto_Aprobar, B-13): cualquier Administrador del catálogo, también quien lo creó",
          description: `${TECNICO} Aprueba exactamente la revisión técnica indicada: si cambió, 409 CONFLICTO_APROBACION. Con requisitos pendientes, 422 REQUISITOS_INCOMPLETOS con la lista.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("AprobacionConcepto"),
          responses: { "200": ok("DetalleConceptoAdmin", "Concepto aprobado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/conceptos/{codigo}/componentes": {
        post: {
          summary: "Nuevo componente (CMP-NNNNN; Val_Componente): devuelve el concepto a Borrador",
          description: `${TECNICO} Fuente, fecha y responsable son opcionales al guardar y obligatorios para aprobar y calcular (BL-05). Un componente por insumo en cada concepto.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudComponente"),
          responses: { "201": ok("DetalleConceptoAdmin", "Componente creado (o reproducido)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/conceptos/{codigo}/componentes/{componente}": {
        patch: {
          summary: "Editar o activar/desactivar un componente: devuelve el concepto a Borrador (Concepto_ABorrador)",
          description: TECNICO,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, PARAMETRO_COMPONENTE],
          requestBody: cuerpo("EdicionComponente"),
          responses: { "200": ok("DetalleConceptoAdmin", "Componente guardado."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/tipos-estructura": {
        get: {
          summary: "Tipos de estructura (familias de tblListas.FAMILIA y sus tipos)",
          description: TECNICO,
          parameters: parametrosQuery(EsquemaConsultaTiposEstructura),
          responses: { "200": ok("RespuestaTiposEstructura", "Página de tipos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Nuevo tipo de estructura (TES-NNNNN; Val_TipoEst): único por familia y nombre normalizado",
          description: TECNICO,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudTipoEstructura"),
          responses: { "201": ok("TipoEstructuraAdmin", "Tipo creado (o reproducido)."), ...errores(400, 401, 403, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/tipos-estructura/{codigo}": {
        get: {
          summary: "Detalle del tipo de estructura con su historial",
          description: TECNICO,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetalleTipoEstructura", "Tipo."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Editar o activar/desactivar el tipo: con conceptos, la familia no cambia (422 TIPO_CON_CONCEPTOS)",
          description: `${TECNICO} Desactivarlo conserva sus conceptos; deja de ofrecerse para conceptos nuevos o para reclasificar e impide aprobar sus conceptos.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO],
          requestBody: cuerpo("EdicionTipoEstructura"),
          responses: { "200": ok("TipoEstructuraAdmin", "Tipo guardado."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/conceptos/{codigo}/tarifa": {
        post: {
          summary: "Asignar tarifa al concepto (Word §3.5): solo cambia la tarifa y conserva la aprobación del concepto",
          description: `${ADMIN} \`tarifaActual\` es la que mostraba la pantalla: si cambió, 409 CONFLICTO_TARIFA sin sobrescribir. La tarifa debe estar activa y en la unidad del concepto (BL-06). Las versiones conservan su tarifa congelada.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("AsignacionTarifa"),
          responses: { "200": ok("ConceptoTarifaAdmin", "Tarifa asignada (o reproducida)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/insumos": {
        get: {
          summary: "Insumos técnicos con sus referencias (por omisión, solo activos)",
          description: ADMIN,
          parameters: parametrosQuery(EsquemaConsultaInsumosAdmin),
          responses: { "200": ok("RespuestaInsumosAdmin", "Página de insumos."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Nuevo insumo (INS-NNNNN; Val_Insumo): descripción técnica única normalizada y unidad base válida",
          description: TECNICO,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudInsumo"),
          responses: { "201": ok("InsumoAdmin", "Insumo creado (o reproducido)."), ...errores(400, 401, 403, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/insumos/{codigo}": {
        get: {
          summary: "Detalle del insumo con sus conversiones y los conceptos que las usan",
          description: TECNICO,
          parameters: [PARAMETRO_CODIGO],
          responses: { "200": ok("DetalleInsumoAdmin", "Insumo."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Editar o activar/desactivar el insumo: con productos, conversiones o componentes, la unidad base no cambia",
          description: TECNICO,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO],
          requestBody: cuerpo("EdicionInsumo"),
          responses: { "200": ok("InsumoAdmin", "Insumo guardado."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/insumos/{codigo}/conversiones": {
        post: {
          summary: "Nueva conversión (Val_Conversion): de otra unidad a la unidad base del insumo, factor > 0 y fuente",
          description: `${TECNICO} Una por insumo y unidad de origen; el motor solo usa conversiones directas.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudConversion"),
          responses: { "201": ok("DetalleInsumoAdmin", "Conversión registrada (o reproducida)."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/insumos/{codigo}/conversiones/{unidad}": {
        patch: {
          summary: "Editar factor o fuente con motivo: los conceptos aprobados que la usan vuelven a Borrador",
          description: `${TECNICO} Decisión del propietario (ADR-0016 §2.1). Las versiones conservan su instantánea.`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_CODIGO, PARAMETRO_UNIDAD],
          requestBody: cuerpo("EdicionConversion"),
          responses: { "200": ok("DetalleInsumoAdmin", "Conversión guardada."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/parametros": {
        get: {
          summary: "Parámetros de venta y plantillas de textos, con el impacto en cotizaciones abiertas e historial (B-38)",
          description: `${SISTEMA} Ambiente y moneda se muestran, no se editan.`,
          responses: { "200": ok("DetalleParametros", "Parámetros."), ...errores(401, 403, 429, 503, 500) },
        },
        patch: {
          summary: "Editar recargo, impuesto, vigencia o plantillas, con motivo y revisión",
          description: `${SISTEMA} Fracciones en texto (0.2 = 20 %); null = no definido (BL-12/BL-13). Solo cálculos y cotizaciones nuevos; las versiones no cambian (BL-16 al enviar, aprobar o emitir).`,
          security: CON_EFECTOS,
          requestBody: cuerpo("EdicionParametros"),
          responses: { "200": ok("DetalleParametros", "Parámetros guardados."), ...errores(400, 401, 403, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/personas": {
        get: {
          summary: "Personas de la organización (pertenencias), con búsqueda y cursor por correo",
          description: `${SISTEMA} Nunca incluye contraseñas ni hashes.`,
          parameters: parametrosQuery(EsquemaConsultaPersonas),
          responses: { "200": ok("RespuestaPersonas", "Página de personas."), ...errores(400, 401, 403, 429, 503, 500) },
        },
        post: {
          summary: "Alta de una persona con funciones y contraseña temporal mostrada UNA vez",
          description: `${SISTEMA} Repetir la Idempotency-Key devuelve la persona sin contraseña (contrasenaEntregada: true); si se perdió, restablezca. Correo ya registrado: 409 CORREO_EXISTENTE.`,
          security: CON_EFECTOS,
          parameters: [CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("SolicitudPersona"),
          responses: { "201": ok("RespuestaCredencialTemporal", "Persona creada."), ...errores(400, 401, 403, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/personas/{id}": {
        get: {
          summary: "Detalle de una persona con su historial",
          description: SISTEMA,
          parameters: [PARAMETRO_PERSONA],
          responses: { "200": ok("DetallePersona", "Persona."), ...errores(401, 403, 404, 429, 503, 500) },
        },
        patch: {
          summary: "Editar nombre, funciones o activación (desactivar revoca sus sesiones en la organización)",
          description: `${SISTEMA} La organización conserva un Administrador del sistema activo (422 ULTIMO_ADMINISTRADOR); nadie se retira esa función ni se desactiva (422 AUTOPROTECCION).`,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_PERSONA],
          requestBody: cuerpo("EdicionPersona"),
          responses: { "200": ok("PersonaAdmin", "Persona guardada."), ...errores(400, 401, 403, 404, 409, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/personas/{id}/restablecimiento": {
        post: {
          summary: "Restablecer la contraseña: temporal nueva mostrada una vez; la anterior deja de valer y se revocan todas sus sesiones",
          description: SISTEMA,
          security: CON_EFECTOS,
          parameters: [PARAMETRO_PERSONA, CABECERA_IDEMPOTENCIA],
          requestBody: cuerpo("RestablecimientoContrasena"),
          responses: { "200": ok("RespuestaCredencialTemporal", "Contraseña restablecida."), ...errores(400, 401, 403, 404, 413, 415, 422, 429, 503, 500) },
        },
      },
      "/api/v1/admin/unidades": {
        get: {
          summary: "Referencia común de unidades (solo lectura)",
          description: ADMIN,
          responses: { "200": ok("RespuestaUnidades", "Unidades."), ...errores(401, 403, 429, 503, 500) },
        },
      },
      "/api/v1/openapi.json": {
        get: { summary: "Esta especificación", security: [], responses: { "200": { description: "Documento OpenAPI 3.1." } } },
      },
    },
    components: {
      securitySchemes: {
        cookieSesion: {
          type: "apiKey",
          in: "cookie",
          name: "softarq_sesion",
          description: "Sesión opaca (HttpOnly, SameSite=Strict, Path=/api/v1, host-only).",
        },
        tokenCsrf: {
          type: "apiKey",
          in: "header",
          name: "X-CSRF-Token",
          description: "Token CSRF de la sesión (GET /api/v1/auth/csrf antes del acceso; después, el de la respuesta de sesión).",
        },
      },
      schemas: {
        SeguimientoEmision: json(EsquemaSeguimientoEmision, "output"),
        RespuestaComponentesExcepcion: json(EsquemaRespuestaComponentesExcepcion, "output"),
        ExcepcionesVersion: json(EsquemaExcepcionesVersion, "output"),
        SalidasInternasVersion: json(EsquemaSalidasInternasVersion, "output"),
        DecisionExcepcion: json(EsquemaDecisionExcepcion, "input"),
        EventoRespuestaCliente: json(EsquemaEventoRespuestaCliente, "output"),
        RegistroRespuesta: json(EsquemaRegistroRespuesta, "input"),
        CorreccionRespuesta: json(EsquemaCorreccionRespuesta, "input"),
        SolicitudAcceso: json(EsquemaSolicitudAcceso, "input"),
        RespuestaCsrf: json(EsquemaRespuestaCsrf, "output"),
        RespuestaSesion: json(EsquemaRespuestaSesion, "output"),
        CambioContrasena: json(EsquemaCambioContrasena, "input"),
        DetalleParametros: json(EsquemaDetalleParametros, "output"),
        EdicionParametros: json(EsquemaEdicionParametros, "input"),
        RespuestaPersonas: json(EsquemaRespuestaPersonas, "output"),
        DetallePersona: json(EsquemaDetallePersona, "output"),
        PersonaAdmin: json(EsquemaPersonaAdmin, "output"),
        SolicitudPersona: json(EsquemaSolicitudPersona, "input"),
        EdicionPersona: json(EsquemaEdicionPersona, "input"),
        RestablecimientoContrasena: json(EsquemaRestablecimientoContrasena, "input"),
        RespuestaCredencialTemporal: json(EsquemaRespuestaCredencialTemporal, "output"),
        SolicitudCalculoDemo: json(EsquemaSolicitudCalculoDemo, "input"),
        RespuestaSalud: json(EsquemaRespuestaSalud, "output"),
        RespuestaConceptos: json(EsquemaRespuestaConceptos, "output"),
        RespuestaOpcionesPrecio: json(EsquemaRespuestaOpcionesPrecio, "output"),
        RespuestaTiposAdicional: json(EsquemaRespuestaTiposAdicional, "output"),
        RespuestaCalculoDemo: json(EsquemaRespuestaCalculoDemo, "output"),
        RespuestaError: json(EsquemaRespuestaError, "output"),
        CapturaBorrador: json(EsquemaCapturaBorrador, "output"),
        SolicitudCliente: json(EsquemaSolicitudCliente, "input"),
        EdicionCliente: json(EsquemaEdicionCliente, "input"),
        Cliente: json(EsquemaCliente, "output"),
        RespuestaClientes: json(EsquemaRespuestaClientes, "output"),
        DetalleCliente: json(EsquemaDetalleCliente, "output"),
        SolicitudProyecto: json(EsquemaSolicitudProyecto, "input"),
        EdicionProyecto: json(EsquemaEdicionProyecto, "input"),
        Proyecto: json(EsquemaProyecto, "output"),
        RespuestaProyectos: json(EsquemaRespuestaProyectos, "output"),
        SolicitudCotizacion: json(EsquemaSolicitudCotizacion, "input"),
        RespuestaCotizaciones: json(EsquemaRespuestaCotizaciones, "output"),
        DetalleCotizacion: json(EsquemaDetalleCotizacion, "output"),
        Borrador: json(EsquemaBorrador, "output"),
        SolicitudBorrador: json(EsquemaSolicitudBorrador, "input"),
        RespuestaBorradorGuardado: json(EsquemaRespuestaBorradorGuardado, "output"),
        SolicitudVersion: json(EsquemaSolicitudVersion, "input"),
        Version: json(EsquemaVersion, "output"),
        SolicitudEnvioRevision: json(EsquemaSolicitudEnvioRevision, "input"),
        DecisionRevision: json(EsquemaDecisionRevision, "input"),
        RetiroRevision: json(EsquemaRetiroRevision, "input"),
        RespuestaRevisiones: json(EsquemaRespuestaRevisiones, "output"),
        DetalleRevision: json(EsquemaDetalleRevision, "output"),
        AnulacionAprobacion: json(EsquemaAnulacionAprobacion, "input"),
        DescarteCotizacion: json(EsquemaDescarteCotizacion, "input"),
        SolicitudEmision: json(EsquemaSolicitudEmision, "input"),
        ValidacionEmision: json(EsquemaValidacionEmision, "output"),
        DetalleEmision: json(EsquemaDetalleEmision, "output"),
        Emisor: json(EsquemaEmisor, "output"),
        EdicionEmisor: json(EsquemaEdicionEmisor, "input"),
        VerificacionRevision: json(EsquemaVerificacionRevision, "output"),
        SolicitudProveedor: json(EsquemaSolicitudProveedor, "input"),
        EdicionProveedor: json(EsquemaEdicionProveedor, "input"),
        ProveedorAdmin: json(EsquemaProveedorAdmin, "output"),
        RespuestaProveedoresAdmin: json(EsquemaRespuestaProveedoresAdmin, "output"),
        DetalleProveedorAdmin: json(EsquemaDetalleProveedorAdmin, "output"),
        SolicitudProducto: json(EsquemaSolicitudProducto, "input"),
        EdicionProducto: json(EsquemaEdicionProducto, "input"),
        ProductoAdmin: json(EsquemaProductoAdmin, "output"),
        RespuestaProductosAdmin: json(EsquemaRespuestaProductosAdmin, "output"),
        DetalleProductoAdmin: json(EsquemaDetalleProductoAdmin, "output"),
        SolicitudPrecio: json(EsquemaSolicitudPrecio, "input"),
        AnulacionPrecio: json(EsquemaAnulacionPrecio, "input"),
        CierreVigenciaPrecio: json(EsquemaCierreVigenciaPrecio, "input"),
        PrecioAdmin: json(EsquemaPrecioAdmin, "output"),
        RespuestaPreciosAdmin: json(EsquemaRespuestaPreciosAdmin, "output"),
        DetallePrecioAdmin: json(EsquemaDetallePrecioAdmin, "output"),
        RespuestaCierreVigencia: json(EsquemaRespuestaCierreVigencia, "output"),
        SolicitudTarifa: json(EsquemaSolicitudTarifa, "input"),
        EdicionTarifa: json(EsquemaEdicionTarifa, "input"),
        TarifaAdmin: json(EsquemaTarifaAdmin, "output"),
        RespuestaTarifasAdmin: json(EsquemaRespuestaTarifasAdmin, "output"),
        DetalleTarifaAdmin: json(EsquemaDetalleTarifaAdmin, "output"),
        AsignacionTarifa: json(EsquemaAsignacionTarifa, "input"),
        ConceptoTarifaAdmin: json(EsquemaConceptoTarifaAdmin, "output"),
        RespuestaConceptosAdmin: json(EsquemaRespuestaConceptosAdmin, "output"),
        RespuestaInsumosAdmin: json(EsquemaRespuestaInsumosAdmin, "output"),
        InsumoAdmin: json(EsquemaInsumoAdmin, "output"),
        SolicitudInsumo: json(EsquemaSolicitudInsumo, "input"),
        EdicionInsumo: json(EsquemaEdicionInsumo, "input"),
        DetalleInsumoAdmin: json(EsquemaDetalleInsumoAdmin, "output"),
        SolicitudConversion: json(EsquemaSolicitudConversion, "input"),
        EdicionConversion: json(EsquemaEdicionConversion, "input"),
        SolicitudTipoEstructura: json(EsquemaSolicitudTipoEstructura, "input"),
        EdicionTipoEstructura: json(EsquemaEdicionTipoEstructura, "input"),
        TipoEstructuraAdmin: json(EsquemaTipoEstructuraAdmin, "output"),
        RespuestaTiposEstructura: json(EsquemaRespuestaTiposEstructura, "output"),
        DetalleTipoEstructura: json(EsquemaDetalleTipoEstructura, "output"),
        SolicitudConcepto: json(EsquemaSolicitudConcepto, "input"),
        EdicionConcepto: json(EsquemaEdicionConcepto, "input"),
        AprobacionConcepto: json(EsquemaAprobacionConcepto, "input"),
        DetalleConceptoAdmin: json(EsquemaDetalleConceptoAdmin, "output"),
        SolicitudComponente: json(EsquemaSolicitudComponente, "input"),
        EdicionComponente: json(EsquemaEdicionComponente, "input"),
        RespuestaUnidades: json(EsquemaRespuestaUnidades, "output"),
      },
    },
  };
}
