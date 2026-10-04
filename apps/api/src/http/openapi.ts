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
    "CONFLICTO_EMISION (la versión o la aprobación vistas ya no son las vigentes) o FOLIO_NO_ACTIVO (cotización descartada).",
  413: "CUERPO_DEMASIADO_GRANDE.",
  415: "TIPO_DE_CONTENIDO_NO_ADMITIDO: el cuerpo debe ser application/json.",
  422:
    "CALCULO_BLOQUEADO (códigos BL, sin importes), CAPTURA_INCOMPLETA (campos pendientes), REGISTRO_INACTIVO, REFERENCIA_NO_DISPONIBLE, " +
    "ENVIO_BLOQUEADO / APROBACION_BLOQUEADA (bloqueos vigentes; el estado no cambió), DECISION_BLOQUEADA (BL-17: quien aprueba no puede ser el autor), " +
    "EMISION_BLOQUEADA (BL-01 a BL-20 a la fecha de emisión; nada cambió), DESCARTE_BLOQUEADO (estado que no permite descartar), " +
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
        SolicitudAcceso: json(EsquemaSolicitudAcceso, "input"),
        RespuestaCsrf: json(EsquemaRespuestaCsrf, "output"),
        RespuestaSesion: json(EsquemaRespuestaSesion, "output"),
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
      },
    },
  };
}
