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
import { CAMPOS_EXCEPCION } from "../calculo.js";
import {
  CODIGOS_ERROR_API,
  EsquemaCodigo,
  EsquemaCotizacionComercial,
  EsquemaDecimalTexto,
  EsquemaFechaISO,
  LIMITES_API,
} from "./comunes.js";

// Lo común (límites, sesión, capacidades, códigos de error) vive en `comunes.ts`; se reexporta aquí
// para que la API y la web sigan importando todo desde `@softarq/contracts`.
export * from "./comunes.js";

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

/**
 * Excepción que afecta al cálculo (módulo 10, ADR-0014): la API la arma desde el borrador de la
 * cotización. RENDIMIENTO cambia el rendimiento o el desperdicio de un componente de esa partida;
 * CONCEPTO_PERSONALIZADO permite calcular con ese concepto personalizado (BL-04). La calculadora
 * sin cotización no las envía.
 */
export const EsquemaExcepcionCalculo = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("RENDIMIENTO"),
    id: EsquemaCodigo,
    partidaId: EsquemaCodigo,
    componenteCodigo: EsquemaCodigo,
    campo: z.enum(CAMPOS_EXCEPCION),
    valorAplicado: EsquemaDecimalTexto,
  }),
  z.strictObject({ tipo: z.literal("CONCEPTO_PERSONALIZADO"), id: EsquemaCodigo, conceptoCodigo: EsquemaCodigo }),
]);
export type ExcepcionCalculo = z.infer<typeof EsquemaExcepcionCalculo>;

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
    /** Excepciones registradas en el borrador (opcional; módulo 10). */
    excepciones: z.array(EsquemaExcepcionCalculo).max(100, { error: "Máximo 100 excepciones." }).optional(),
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
    const excepciones = new Set<string>();
    (s.excepciones ?? []).forEach((x, i) => {
      if (excepciones.has(x.id)) ctx.addIssue({ code: "custom", path: ["excepciones", i, "id"], message: `Excepción duplicada: ${x.id}.` });
      excepciones.add(x.id);
      if (x.tipo === "RENDIMIENTO" && !ids.has(x.partidaId)) {
        ctx.addIssue({ code: "custom", path: ["excepciones", i, "partidaId"], message: `No existe la partida ${x.partidaId}.` });
      }
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

/**
 * Concepto para preparar la captura: sin rendimientos, desperdicios, tarifas ni costos. `clase`
 * (ESTANDAR, GENERICO o PERSONALIZADO) permite avisar que un personalizado exige excepción (BL-04).
 */
export const EsquemaConceptoCatalogo = z.strictObject({
  codigo: z.string(),
  clase: z.string(),
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

export const EsquemaRespuestaCalculoDemo = z.strictObject({
  estado: z.literal("CALCULADO"),
  /** Fecha del servidor con la que se evaluaron las vigencias. */
  fechaCalculo: EsquemaFechaISO,
  cotizacion: EsquemaCotizacionComercial,
  /** Avisos sin importes ni datos de compra. */
  avisos: z.array(z.strictObject({ codigo: z.enum(["AV-01", "AV-03"]), mensaje: z.string() })),
});
export type RespuestaCalculoDemo = z.infer<typeof EsquemaRespuestaCalculoDemo>;

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
    /** 409 CONFLICTO_EXCEPCION: excepciones de la versión con sus decisiones vigentes. */
    excepcionesVigentes: z.unknown().optional(),
    /**
     * Módulo 11: registro de catálogo vigente en un conflicto (CONFLICTO_EDICION, CONFLICTO_TARIFA),
     * el registro existente en DUPLICADO o el precio que se solapa en SOLAPE_VIGENCIA.
     */
    registroVigente: z.unknown().optional(),
    /** Módulo 17: 403 CUENTA_INTERNA_USE_PANEL, dirección del panel del equipo para esta cuenta. */
    panelUrl: z.string().optional(),
    /** Módulo 15: 409 SELECCIONES_DIVERGENTES, selecciones del borrador y las que dejaría el modo. */
    selecciones: z
      .strictObject({
        actuales: z.array(z.strictObject({ insumoCodigo: z.string(), precioCodigo: z.string() })),
        propuestas: z.array(z.strictObject({ insumoCodigo: z.string(), precioCodigo: z.string() })),
      })
      .optional(),
  }),
});
export type RespuestaError = z.infer<typeof EsquemaRespuestaError>;
