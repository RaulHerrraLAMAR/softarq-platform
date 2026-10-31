/**
 * Contratos comunes de la API v1 (ADR-0005, ADR-0007): límites, tipos básicos, proyección comercial,
 * sesión y capacidades, y el catálogo de códigos de error.
 *
 * Es lo único de la API general que viaja en `@softarq/contracts/cliente` (la app del cliente): aquí no
 * hay esquemas de cálculo, catálogos, precios ni excepciones. Los demás contratos están en `esquemas.ts`.
 *
 * Reglas comunes:
 * - objetos estrictos (`z.strictObject`): cualquier campo no previsto se rechaza;
 * - importes y cantidades como texto decimal (`PATRON_DECIMAL_TEXTO`), nunca `number`;
 * - límites explícitos en textos, listas y complejidad.
 */
import { z } from "zod";
import { PATRON_DECIMAL_TEXTO, PATRON_FECHA_ISO } from "../decimal.js";

// ---------------------------------------------------------------------------
// Límites de la API
// ---------------------------------------------------------------------------

export const LIMITES_API = {
  partidas: 100,
  renglonesPorPartida: 200,
  renglonesTotales: 1000,
  preciosElegidos: 100,
  longitudDescripcion: 200,
  longitudBusqueda: 60,
  conceptosPorConsulta: 20,
  limiteListadoPorOmision: 50,
  limiteListadoMaximo: 100,
  longitudCorreo: 254,
  longitudContrasena: 128,
} as const;

/** Códigos de negocio (INS-00001, PRE-000007, CON-00007, P001…). */
export const PATRON_CODIGO = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

// ---------------------------------------------------------------------------
// Tipos básicos
// ---------------------------------------------------------------------------

export const EsquemaDecimalTexto = z
  .string({ error: "Debe ser un decimal en texto (por ejemplo \"12.5\"), no un número." })
  .regex(PATRON_DECIMAL_TEXTO, {
    error: "Decimal inválido: hasta 15 enteros y 10 decimales, punto decimal, sin exponente, comas ni espacios.",
  });

export const EsquemaFechaISO = z.string().regex(PATRON_FECHA_ISO, { error: "Fecha AAAA-MM-DD inválida." });

export const EsquemaCodigo = z
  .string({ error: "Debe ser un código en texto." })
  .regex(PATRON_CODIGO, { error: "Código inválido: mayúsculas, dígitos, guion o guion bajo (máximo 40)." });

/** Proyección comercial (D-16): única salida del cálculo hacia los clientes. */
export const EsquemaCotizacionComercial = z.strictObject({
  ambiente: z.enum(["DEMO", "PRODUCCION"]),
  moneda: z.literal("MXN"),
  /** `LEYENDA_DEMO` en ambiente DEMO; `null` en PRODUCCION. */
  leyenda: z.string().nullable(),
  partidas: z.array(
    z.strictObject({
      numero: z.number().int(),
      descripcion: z.string(),
      unidad: z.string(),
      cantidad: EsquemaDecimalTexto,
      precioUnitario: EsquemaDecimalTexto,
      importe: EsquemaDecimalTexto,
    }),
  ),
  subtotal: EsquemaDecimalTexto,
  impuesto: z.strictObject({ nombre: z.string(), tasa: EsquemaDecimalTexto, importe: EsquemaDecimalTexto }),
  total: EsquemaDecimalTexto,
});

// ---------------------------------------------------------------------------
// Autenticación y sesiones (ADR-0007)
// ---------------------------------------------------------------------------

/** Funciones del libro (modConfig.bas, D-20), asignadas por pertenencia a una organización. */
export const FUNCIONES_USUARIO = ["PREPARADOR", "REVISOR", "ADMIN_CATALOGO", "ADMIN_SISTEMA"] as const;
export type FuncionUsuario = (typeof FUNCIONES_USUARIO)[number];

/**
 * Módulo 17 (ADR-0021): función exclusiva de las cuentas de cliente de la app. No es una función del libro ni se
 * asigna desde la administración de personas; una cuenta con esta función no tiene ninguna otra.
 */
export const FUNCION_CLIENTE = "CLIENTE" as const;
/** Funciones que puede mostrar una sesión: las internas del libro y la del cliente de la app. */
export const FUNCIONES_SESION = [...FUNCIONES_USUARIO, FUNCION_CLIENTE] as const;
export type FuncionSesion = (typeof FUNCIONES_SESION)[number];

/**
 * Capacidades que la API comprueba en esta etapa. Solo es la enumeración: qué función concede cada
 * capacidad lo decide la API (matriz en ADR-0007); el cliente únicamente la muestra.
 */
export const CAPACIDADES = [
  "sesion.propia",
  "catalogos.consultar",
  "calculo.ejecutar",
  // Módulo 6 (ADR-0008): clientes, proyectos y cotizaciones.
  "clientes.consultar",
  "clientes.gestionar",
  "cotizaciones.consultar",
  "cotizaciones.preparar",
  // Módulo 7 (ADR-0009): enviar y retirar revisiones (Preparador); decidir (Revisor).
  "revisiones.enviar",
  "revisiones.decidir",
  // Módulo 8 (ADR-0010): emitir (Preparador, o Revisor distinto del autor: la API lo comprueba por
  // identidad) y configurar los datos del emisor (Administrador del sistema).
  "emisiones.emitir",
  "emisor.configurar",
  // Módulo 9 (ADR-0013): respuesta recibida, registrada internamente por Preparador.
  "respuestas.registrar",
  "respuestas.corregir",
  // Módulo 10 (ADR-0014): datos técnicos de las excepciones (Preparador y Revisor).
  "excepciones.consultar",
  // Módulo 11 (ADR-0015): administrar proveedores, productos, precios y tarifas, y asignar
  // tarifas a conceptos (Administrador del catálogo). Incluye la lectura de importes internos.
  "catalogos.administrar",
  // Módulo 13 (ADR-0017): parámetros (B-38) y personas y funciones (B-39), Administrador del sistema.
  "parametros.administrar",
  "personas.administrar",
  // Módulo 14 (ADR-0018): salidas internas de una versión (compras calculadas, detalle e
  // indicadores, con costos y margen), solo lectura. Preparador y Revisor.
  "salidas.consultar",
  // Módulo 17 (ADR-0021): atender las solicitudes de los clientes (Preparador).
  "solicitudes.atender",
  // Módulo 17 (ADR-0021): capacidades propias del cliente de la app; ninguna función interna las recibe.
  "cliente.solicitudes",
  "cliente.cotizaciones",
] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

/** Nombre de la cabecera con el token CSRF (patrón synchronizer token, ligado a la sesión). */
export const CABECERA_CSRF = "X-CSRF-Token";

/** Token opaco: 32 bytes aleatorios en base64url. */
const EsquemaTokenOpaco = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const EsquemaSolicitudAcceso = z.strictObject({
  correo: z
    .string()
    .trim()
    .min(3, { error: "Indique el correo." })
    .max(LIMITES_API.longitudCorreo, { error: "El correo es demasiado largo." }),
  contrasena: z
    .string()
    .min(1, { error: "Indique la contraseña." })
    .max(LIMITES_API.longitudContrasena, { error: "La contraseña es demasiado larga." }),
});
export type SolicitudAcceso = z.infer<typeof EsquemaSolicitudAcceso>;

/** GET /auth/csrf: token para iniciar sesión (ligado a la sesión previa de la cookie). */
export const EsquemaRespuestaCsrf = z.strictObject({ csrfToken: EsquemaTokenOpaco });
export type RespuestaCsrf = z.infer<typeof EsquemaRespuestaCsrf>;

/** Identidad y contexto de la sesión. Nunca incluye el token de sesión ni hashes. */
export const EsquemaRespuestaSesion = z.strictObject({
  usuario: z.strictObject({ nombre: z.string(), correo: z.string() }),
  organizacion: z.strictObject({ codigo: z.string(), nombre: z.string(), esDemo: z.boolean() }),
  funciones: z.array(z.enum(FUNCIONES_SESION)),
  capacidades: z.array(z.enum(CAPACIDADES)),
  /** Instante ISO 8601 de la expiración absoluta. */
  expiraEn: z.string(),
  /** Minutos sin actividad tras los que la sesión vence. */
  inactividadMinutos: z.number().int().positive(),
  /** Token CSRF de esta sesión, para POST y DELETE (cabecera X-CSRF-Token). */
  csrfToken: EsquemaTokenOpaco,
  /**
   * Módulo 13 (ADR-0017): la contraseña vigente es temporal. La API solo permite consultar la sesión,
   * cambiar la contraseña y cerrar la sesión hasta que se cambie.
   */
  cambioContrasenaRequerido: z.boolean(),
});
export type RespuestaSesion = z.infer<typeof EsquemaRespuestaSesion>;

/**
 * Módulo 16 (ADR-0020), canal móvil. La sesión móvil se presenta como `Authorization: Bearer` (no es
 * una credencial ambiental), así que no hay token CSRF. Es la misma identidad y contexto que la web.
 */
export const EsquemaRespuestaSesionMovil = EsquemaRespuestaSesion.omit({ csrfToken: true });
export type RespuestaSesionMovil = z.infer<typeof EsquemaRespuestaSesionMovil>;

/** POST /auth/movil/sesion: además del contexto, el token opaco que la app guarda en SecureStore. */
export const EsquemaRespuestaAccesoMovil = EsquemaRespuestaSesionMovil.extend({ tokenSesion: EsquemaTokenOpaco });
export type RespuestaAccesoMovil = z.infer<typeof EsquemaRespuestaAccesoMovil>;

export const CODIGOS_ERROR_API = [
  "SOLICITUD_INVALIDA",
  "NO_ENCONTRADO",
  "CUERPO_DEMASIADO_GRANDE",
  "TIPO_DE_CONTENIDO_NO_ADMITIDO",
  "CALCULO_BLOQUEADO",
  "DEMASIADAS_SOLICITUDES",
  "SERVICIO_NO_DISPONIBLE",
  "ERROR_INTERNO",
  "NO_AUTENTICADO",
  "SESION_NO_VALIDA",
  "CREDENCIALES_INVALIDAS",
  "SIN_PERMISO",
  "CSRF_NO_VALIDO",
  "ORIGEN_NO_PERMITIDO",
  // Módulo 16 (ADR-0020): canal móvil.
  "RUTA_NO_DISPONIBLE_EN_MOVIL",
  "ACCESO_MOVIL_NO_PERMITIDO",
  // Módulo 6 (ADR-0008).
  "CONFLICTO_EDICION",
  "BORRADOR_DESACTUALIZADO",
  "CAPTURA_INCOMPLETA",
  "REGISTRO_INACTIVO",
  "IDEMPOTENCIA_CONFLICTO",
  "IDEMPOTENCIA_CADUCADA",
  // Conservación de selecciones del borrador (corrección previa al módulo 7).
  "REFERENCIA_NO_DISPONIBLE",
  // Módulo 7 (ADR-0009): revisión y aprobación.
  "REVISION_PENDIENTE",
  "VERSION_NO_VIGENTE",
  "CONFLICTO_REVISION",
  "ENVIO_BLOQUEADO",
  "APROBACION_BLOQUEADA",
  "DECISION_BLOQUEADA",
  // Módulo 8 (ADR-0010): emisión, anulación y descarte.
  "EMISION_BLOQUEADA",
  "VERSION_EMITIDA",
  "APROBACION_NO_VIGENTE",
  "CONFLICTO_EMISION",
  "FOLIO_NO_ACTIVO",
  "DESCARTE_BLOQUEADO",
  "DOCUMENTO_NO_GENERADO",
  "DOCUMENTO_NO_DISPONIBLE",
  "CONFLICTO_RESPUESTA",
  "EMISION_SUSTITUIDA",
  "FECHA_RESPUESTA_INVALIDA",
  "RESPUESTA_FUERA_VIGENCIA",
  // Módulo 10 (ADR-0014): excepciones B-22.
  "EXCEPCION_INVALIDA",
  "CONFLICTO_EXCEPCION",
  // Módulo 11 (ADR-0015): administración de catálogos.
  "DUPLICADO",
  "SOLAPE_VIGENCIA",
  "PRODUCTO_CON_PRECIOS",
  "UNIDAD_INCOMPATIBLE",
  "CONFLICTO_TARIFA",
  "VIGENCIA_INVALIDA",
  "PRECIO_ANULADO",
  "VALOR_INVALIDO",
  // Módulo 13 (ADR-0017): parámetros y personas.
  "CORREO_EXISTENTE",
  "ULTIMO_ADMINISTRADOR",
  "AUTOPROTECCION",
  "CAMBIO_CONTRASENA_REQUERIDO",
  "CONTRASENA_TEMPORAL_CADUCADA",
  "CONTRASENA_ACTUAL_INCORRECTA",
  // Módulo 12 (ADR-0016): catálogo técnico y aprobación de conceptos.
  "TIPO_CON_CONCEPTOS",
  "INSUMO_CON_REFERENCIAS",
  "CONCEPTO_INCOMPLETO",
  "REQUISITOS_INCOMPLETOS",
  "CONFLICTO_APROBACION",
  // Módulo 15 (ADR-0019): versión nueva con modo de precios (B-34) y vista previa BORRADOR (B-25).
  "NUEVA_VERSION_SIN_PREPARAR",
  "NUEVA_VERSION_NO_APLICA",
  "SELECCIONES_DIVERGENTES",
  "VISTA_PREVIA_BLOQUEADA",
  // Módulo 17 (ADR-0021): cliente externo, solicitud y estimación preliminar.
  "CUENTA_INTERNA_USE_PANEL",
  "SOLICITUD_NO_EDITABLE",
  "SOLICITUD_INCOMPLETA",
  "ESTADO_SOLICITUD_NO_PERMITE",
] as const;
export type CodigoErrorApi = (typeof CODIGOS_ERROR_API)[number];

/**
 * Error tal como lo lee la app del cliente (módulo 17): solo lo que usa. Objeto no estricto: el servidor
 * puede enviar más campos (`EsquemaRespuestaError` completo, en `esquemas.ts`) y aquí se descartan.
 */
export const EsquemaRespuestaErrorCliente = z.object({
  error: z.object({
    codigo: z.enum(CODIGOS_ERROR_API),
    mensaje: z.string(),
    solicitudId: z.string().optional(),
    campos: z.array(z.strictObject({ ruta: z.string(), mensaje: z.string() })).optional(),
    panelUrl: z.string().optional(),
  }),
});
export type RespuestaErrorCliente = z.infer<typeof EsquemaRespuestaErrorCliente>;
