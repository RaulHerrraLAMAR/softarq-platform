/**
 * Contratos HTTP de la API v1 (ADR-0005; autenticación y sesiones: ADR-0007).
 *
 * Los esquemas Zod son la ÚNICA definición: los tipos se derivan con `z.infer` y la API los usa
 * para validar en ejecución (Standard Schema) y para generar OpenAPI. Sin dependencias del servidor.
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

const descripcion = (max: number = LIMITES_API.longitudDescripcion) =>
  z.string({ error: "Debe ser un texto." }).max(max, { error: `Máximo ${max} caracteres.` });

// ---------------------------------------------------------------------------
// Petición de cálculo DEMO
// ---------------------------------------------------------------------------

/** Renglón de números generadores (CR-01). Las dimensiones no usadas van en `null`. */
export const EsquemaRenglonMedicion = z.strictObject({
  descripcion: descripcion(),
  signo: z.enum(["+", "-"], { error: "El signo debe ser \"+\" o \"-\"." }),
  piezas: EsquemaDecimalTexto,
  largo: EsquemaDecimalTexto.nullable(),
  ancho: EsquemaDecimalTexto.nullable(),
  alto: EsquemaDecimalTexto.nullable(),
});

export const EsquemaSolicitudPartidaConcepto = z.strictObject({
  id: EsquemaCodigo,
  tipo: z.literal("CONCEPTO"),
  conceptoCodigo: EsquemaCodigo,
  descripcion: descripcion().optional(),
  mediciones: z
    .array(EsquemaRenglonMedicion)
    .max(LIMITES_API.renglonesPorPartida, { error: `Máximo ${LIMITES_API.renglonesPorPartida} renglones por partida.` }),
});

/** Costo adicional (CR-10): `monto` es el costo capturado por el preparador. */
export const EsquemaSolicitudPartidaAdicional = z.strictObject({
  id: EsquemaCodigo,
  tipo: z.literal("ADICIONAL"),
  tipoAdicionalCodigo: EsquemaCodigo,
  descripcion: descripcion(),
  cantidad: EsquemaDecimalTexto,
  monto: EsquemaDecimalTexto,
});

export const EsquemaSolicitudCalculoDemo = z
  .strictObject({
    /** CR-05. Obligatorio: no hay valor por omisión. */
    consolidarCompras: z.boolean({ error: "consolidarCompras debe ser true o false." }),
    partidas: z
      .array(z.discriminatedUnion("tipo", [EsquemaSolicitudPartidaConcepto, EsquemaSolicitudPartidaAdicional]))
      .max(LIMITES_API.partidas, { error: `Máximo ${LIMITES_API.partidas} partidas.` }),
    /** Precios elegidos y confirmados, uno por insumo (CR-07). El servidor nunca elige por el cliente. */
    preciosElegidos: z
      .array(EsquemaCodigo)
      .max(LIMITES_API.preciosElegidos, { error: `Máximo ${LIMITES_API.preciosElegidos} precios elegidos.` }),
  })
  .superRefine((s, ctx) => {
    const total = s.partidas.reduce((n, p) => n + (p.tipo === "CONCEPTO" ? p.mediciones.length : 0), 0);
    if (total > LIMITES_API.renglonesTotales) {
      ctx.addIssue({
        code: "custom",
        path: ["partidas"],
        message: `Máximo ${LIMITES_API.renglonesTotales} renglones de medición en total (${total}).`,
      });
    }
    const ids = new Set<string>();
    s.partidas.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["partidas", i, "id"], message: `Partida duplicada: ${p.id}.` });
      ids.add(p.id);
    });
    const precios = new Set<string>();
    s.preciosElegidos.forEach((c, i) => {
      if (precios.has(c)) ctx.addIssue({ code: "custom", path: ["preciosElegidos", i], message: `Precio repetido: ${c}.` });
      precios.add(c);
    });
  });

export type SolicitudCalculoDemo = z.infer<typeof EsquemaSolicitudCalculoDemo>;

// ---------------------------------------------------------------------------
// Consultas (query string)
// ---------------------------------------------------------------------------

const limiteListado = z
  .string()
  .regex(/^\d{1,3}$/, { error: "limite debe ser un entero." })
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(1, { error: "limite mínimo: 1." })
      .max(LIMITES_API.limiteListadoMaximo, { error: `limite máximo: ${LIMITES_API.limiteListadoMaximo}.` }),
  )
  .optional();

export const EsquemaConsultaConceptos = z.strictObject({
  buscar: z
    .string()
    .trim()
    .min(1, { error: "buscar no puede estar vacío." })
    .max(LIMITES_API.longitudBusqueda, { error: `buscar admite hasta ${LIMITES_API.longitudBusqueda} caracteres.` })
    .optional(),
  limite: limiteListado,
});
export type ConsultaConceptos = z.infer<typeof EsquemaConsultaConceptos>;

export const EsquemaConsultaOpcionesPrecio = z.strictObject({
  conceptos: z
    .string({ error: "Indique conceptos=CON-1,CON-2 (una sola vez)." })
    .transform((t) => t.split(",").map((c) => c.trim()))
    .pipe(
      z
        .array(EsquemaCodigo)
        .min(1, { error: "Indique al menos un concepto." })
        .max(LIMITES_API.conceptosPorConsulta, { error: `Máximo ${LIMITES_API.conceptosPorConsulta} conceptos.` })
        .refine((l) => new Set(l).size === l.length, { error: "Conceptos repetidos." }),
    ),
});
export type ConsultaOpcionesPrecio = z.infer<typeof EsquemaConsultaOpcionesPrecio>;

export const EsquemaConsultaTiposAdicional = z.strictObject({ limite: limiteListado });
export type ConsultaTiposAdicional = z.infer<typeof EsquemaConsultaTiposAdicional>;

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

export const EsquemaRespuestaSalud = z.strictObject({
  estado: z.enum(["ok", "degradado"]),
  baseDeDatos: z.enum(["disponible", "no disponible"]),
});
export type RespuestaSalud = z.infer<typeof EsquemaRespuestaSalud>;

export const EsquemaInsumoCatalogo = z.strictObject({
  codigo: z.string(),
  descripcion: z.string(),
  unidadBase: z.string(),
});

/** Concepto para preparar la captura: sin rendimientos, desperdicios, tarifas ni costos. */
export const EsquemaConceptoCatalogo = z.strictObject({
  codigo: z.string(),
  descripcion: z.string(),
  unidad: z.string(),
  tipoFormula: z.enum(["CONTEO", "LONGITUD", "AREA", "VOLUMEN"]),
  permiteDescuento: z.boolean(),
  insumos: z.array(EsquemaInsumoCatalogo),
});

export const EsquemaRespuestaConceptos = z.strictObject({
  conceptos: z.array(EsquemaConceptoCatalogo),
  limite: z.number().int(),
});
export type RespuestaConceptos = z.infer<typeof EsquemaRespuestaConceptos>;

/**
 * Opción elegible para un insumo. No incluye precio ni contenido: `esMenorPrecio` es el marcador
 * «(*)» del libro (menor precio vigente del mismo producto), que no elige por el usuario.
 */
export const EsquemaOpcionPrecio = z.strictObject({
  precioCodigo: z.string(),
  productoCodigo: z.string(),
  producto: z.string(),
  presentacion: z.string(),
  unidadCompra: z.string(),
  proveedorCodigo: z.string(),
  proveedor: z.string(),
  vigenteHasta: EsquemaFechaISO,
  esMenorPrecio: z.boolean(),
});

export const EsquemaInsumoConOpciones = z.strictObject({
  insumoCodigo: z.string(),
  insumoDescripcion: z.string(),
  unidadBase: z.string(),
  conceptos: z.array(z.string()),
  opciones: z.array(EsquemaOpcionPrecio),
});

export const EsquemaRespuestaOpcionesPrecio = z.strictObject({
  /** Fecha del servidor con la que se evaluó la vigencia. */
  fechaReferencia: EsquemaFechaISO,
  insumos: z.array(EsquemaInsumoConOpciones),
});
export type RespuestaOpcionesPrecio = z.infer<typeof EsquemaRespuestaOpcionesPrecio>;

export const EsquemaTipoAdicionalCatalogo = z.strictObject({
  codigo: z.string(),
  categoria: z.string(),
  descripcion: z.string(),
  unidad: z.string(),
});

export const EsquemaRespuestaTiposAdicional = z.strictObject({
  tiposAdicional: z.array(EsquemaTipoAdicionalCatalogo),
  limite: z.number().int(),
});
export type RespuestaTiposAdicional = z.infer<typeof EsquemaRespuestaTiposAdicional>;

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

export const EsquemaRespuestaCalculoDemo = z.strictObject({
  estado: z.literal("CALCULADO"),
  /** Fecha del servidor con la que se evaluaron las vigencias. */
  fechaCalculo: EsquemaFechaISO,
  cotizacion: EsquemaCotizacionComercial,
  /** Avisos sin importes ni datos de compra. */
  avisos: z.array(z.strictObject({ codigo: z.enum(["AV-01", "AV-03"]), mensaje: z.string() })),
});
export type RespuestaCalculoDemo = z.infer<typeof EsquemaRespuestaCalculoDemo>;

// ---------------------------------------------------------------------------
// Autenticación y sesiones (ADR-0007)
// ---------------------------------------------------------------------------

/** Funciones del libro (modConfig.bas, D-20), asignadas por pertenencia a una organización. */
export const FUNCIONES_USUARIO = ["PREPARADOR", "REVISOR", "ADMIN_CATALOGO", "ADMIN_SISTEMA"] as const;
export type FuncionUsuario = (typeof FUNCIONES_USUARIO)[number];

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
  funciones: z.array(z.enum(FUNCIONES_USUARIO)),
  capacidades: z.array(z.enum(CAPACIDADES)),
  /** Instante ISO 8601 de la expiración absoluta. */
  expiraEn: z.string(),
  /** Minutos sin actividad tras los que la sesión vence. */
  inactividadMinutos: z.number().int().positive(),
  /** Token CSRF de esta sesión, para POST y DELETE (cabecera X-CSRF-Token). */
  csrfToken: EsquemaTokenOpaco,
});
export type RespuestaSesion = z.infer<typeof EsquemaRespuestaSesion>;

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
] as const;
export type CodigoErrorApi = (typeof CODIGOS_ERROR_API)[number];

export const EsquemaRespuestaError = z.strictObject({
  error: z.strictObject({
    codigo: z.enum(CODIGOS_ERROR_API),
    mensaje: z.string(),
    solicitudId: z.string(),
    /** 400: campos inválidos. */
    campos: z.array(z.strictObject({ ruta: z.string(), mensaje: z.string() })).optional(),
    /** 404: códigos que no existen en la organización. */
    faltantes: z.array(z.strictObject({ tipo: z.string(), codigo: z.string() })).optional(),
    /** 422: bloqueos del cálculo (sin importes). */
    problemas: z
      .array(z.strictObject({ codigo: z.string(), referencia: z.string(), mensaje: z.string() }))
      .optional(),
    /**
     * 409 CONFLICTO_EDICION: estado vigente en el servidor, para comparar o recargar sin perder
     * los cambios locales (la captura solo en borradores).
     */
    actual: z
      .strictObject({
        revision: z.number().int().nonnegative(),
        actualizadoPor: z.string(),
        actualizadoEn: z.string(),
        captura: z.unknown().optional(),
      })
      .optional(),
    /**
     * 409 CONFLICTO_REVISION / REVISION_PENDIENTE: estado vigente de la revisión
     * (`EsquemaResumenRevision`), para actualizar la pantalla sin perder lo escrito.
     */
    revisionVigente: z.unknown().optional(),
    /** Seguimiento actual en un conflicto; la web lo valida antes de presentarlo. */
    seguimientoVigente: z.unknown().optional(),
  }),
});
export type RespuestaError = z.infer<typeof EsquemaRespuestaError>;
