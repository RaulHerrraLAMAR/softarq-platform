/**
 * Administración de parámetros (B-38) y de personas y funciones (B-39) — módulo 13, ADR-0017.
 *
 * Contrato INTERNO del Administrador del sistema (`parametros.administrar`, `personas.administrar`).
 * Fuente: `modConfig.bas` (`BTN_Parametros`, `Param_Guardar`, `Cfg_AyudaTipo`, `BTN_Personas`,
 * `Persona_Guardar`) y `tblParametros` / `tblPersonas`.
 *
 * - Fracciones en texto decimal con escala 6 (0.2 = 20 %); `null` = no definido, distinto de cero.
 * - Ambiente y moneda se muestran, pero no se editan.
 * - Las contraseñas NUNCA viajan en listados, detalles ni historiales: la temporal solo aparece una
 *   vez en la respuesta del alta o del restablecimiento (`contrasenaTemporal`).
 */
import { z } from "zod";
import { PATRON_DECIMAL_TEXTO } from "../decimal.js";
import { EsquemaEventoCatalogo, EsquemaImpactoVersiones, PIEZAS_CATALOGO } from "./catalogos-admin.js";
import { BASES_IMPUESTO } from "../calculo.js";
import { CONTRASENA_MINIMA } from "./contrasena.js";
import { FUNCIONES_USUARIO, LIMITES_API } from "./esquemas.js";

const { textoObligatorio, motivo, buscar, limite, booleanoTexto, revision, alMenosUnCambio, EsquemaInstante } = PIEZAS_CATALOGO;

export const LIMITES_ADMINISTRACION = {
  longitudTexto: 2000,
  longitudTratamiento: 500,
  longitudNombreImpuesto: 100,
  vigenciaMaximaDias: 3650,
  longitudNombrePersona: 200,
  /** Contraseña nueva (alta, restablecimiento y cambio propio): longitud, sin reglas de composición. */
  contrasenaMinima: CONTRASENA_MINIMA,
  /** Horas de validez de una contraseña temporal. */
  horasContrasenaTemporal: 72,
} as const;

// ---------------------------------------------------------------------------
// Parámetros (B-38)
// ---------------------------------------------------------------------------

/** PCT del libro: fracción entre 0 y 1 con hasta 6 decimales (NUMERIC 7,6), sin redondeo. */
export const EsquemaFraccion = z
  .string({ error: "Debe ser una fracción en texto (por ejemplo \"0.2\" = 20 %), no un número." })
  .regex(PATRON_DECIMAL_TEXTO, { error: "Fracción inválida (punto decimal, sin comas, espacios ni exponente)." })
  .refine((v) => !v.startsWith("-"), { error: "Debe estar entre 0 y 1." })
  .refine((v) => (v.split(".")[1] ?? "").replace(/0+$/, "").length <= 6, { error: "Admite hasta 6 decimales; no se redondea." })
  .refine(
    (v) => {
      const [e = "0", f = ""] = v.split(".");
      const entero = e.replace(/^0+(?=\d)/, "");
      return entero === "0" || entero === "" || (entero === "1" && /^0*$/.test(f));
    },
    { error: "Debe estar entre 0 y 1 (0.2 = 20 %)." },
  );

const textoPlantilla = (campo: string) => textoObligatorio(LIMITES_ADMINISTRACION.longitudTexto, campo);

export const EsquemaImpuestoParametros = z.strictObject({
  tasa: EsquemaFraccion,
  base: z.enum(BASES_IMPUESTO, { error: "Base del impuesto no admitida." }),
  tratamiento: textoObligatorio(LIMITES_ADMINISTRACION.longitudTratamiento, "el tratamiento fiscal"),
  nombre: textoObligatorio(LIMITES_ADMINISTRACION.longitudNombreImpuesto, "el nombre del impuesto"),
});

export const EsquemaTextosPlantilla = z.strictObject({
  alcance: textoPlantilla("el texto de alcance"),
  condiciones: textoPlantilla("el texto de condiciones"),
  exclusiones: textoPlantilla("el texto de exclusiones"),
});

export const EsquemaParametrosAdmin = z.strictObject({
  ambiente: z.enum(["DEMO", "PRODUCCION"]),
  moneda: z.literal("MXN"),
  recargoSobreCosto: z.string().nullable(),
  impuesto: z.strictObject({ tasa: z.string(), base: z.string(), tratamiento: z.string(), nombre: z.string() }).nullable(),
  vigenciaDias: z.number().int().nullable(),
  textos: z.strictObject({ alcance: z.string(), condiciones: z.string(), exclusiones: z.string() }).nullable(),
  revision: z.number().int(),
  modificadoEn: EsquemaInstante,
  /** `null`: valores de la carga o de la migración (sin persona). */
  modificadoPor: z.string().nullable(),
});
export type ParametrosAdmin = z.infer<typeof EsquemaParametrosAdmin>;

export const EsquemaDetalleParametros = z.strictObject({
  parametros: EsquemaParametrosAdmin,
  /** Cotizaciones abiertas afectadas por un cambio de recargo, impuesto o vigencia (BL-16 en las versiones). */
  impacto: EsquemaImpactoVersiones,
  historial: z.array(EsquemaEventoCatalogo),
});
export type DetalleParametros = z.infer<typeof EsquemaDetalleParametros>;

/**
 * Edición con motivo (B-38). Recargo e impuesto admiten `null` (no definido: BL-12/BL-13); la
 * vigencia es un entero mayor que cero; los textos son plantillas para cotizaciones nuevas.
 */
export const EsquemaEdicionParametros = z
  .strictObject({
    revision,
    motivo,
    recargoSobreCosto: EsquemaFraccion.nullable().optional(),
    impuesto: EsquemaImpuestoParametros.nullable().optional(),
    vigenciaDias: z
      .number({ error: "La vigencia es un número entero de días." })
      .int({ error: "La vigencia es un número entero de días." })
      .min(1, { error: "La vigencia debe ser mayor que cero." })
      .max(LIMITES_ADMINISTRACION.vigenciaMaximaDias, { error: `Vigencia máxima: ${LIMITES_ADMINISTRACION.vigenciaMaximaDias} días.` })
      .optional(),
    textos: EsquemaTextosPlantilla.nullable().optional(),
  })
  .refine((e) => Object.keys(e).some((k) => k !== "revision" && k !== "motivo"), { error: "Indique al menos un cambio." });
export type EdicionParametros = z.infer<typeof EsquemaEdicionParametros>;

// ---------------------------------------------------------------------------
// Personas y funciones (B-39)
// ---------------------------------------------------------------------------

const funciones = z
  .array(z.enum(FUNCIONES_USUARIO, { error: "Función desconocida." }))
  .min(1, { error: "Asigne al menos una función." })
  .max(FUNCIONES_USUARIO.length)
  .refine((f) => new Set(f).size === f.length, { error: "Funciones repetidas." });

const nombrePersona = textoObligatorio(LIMITES_ADMINISTRACION.longitudNombrePersona, "el nombre");

const correo = z
  .string({ error: "El correo debe ser un texto." })
  .trim()
  .toLowerCase()
  .max(LIMITES_API.longitudCorreo, { error: "El correo es demasiado largo." })
  .refine((t) => z.email().safeParse(t).success, { error: "Correo: formato inválido." });

// La contraseña nueva (`EsquemaContrasenaNueva`) y el cambio propio (`EsquemaCambioContrasena`) viven en `contrasena.ts`.

export const EsquemaSolicitudPersona = z.strictObject({ correo, nombre: nombrePersona, funciones, motivo });
export type SolicitudPersona = z.infer<typeof EsquemaSolicitudPersona>;

export const EsquemaEdicionPersona = z
  .strictObject({ revision, motivo, nombre: nombrePersona.optional(), funciones: funciones.optional(), activa: z.boolean().optional() })
  .refine((e) => alMenosUnCambio(Object.fromEntries(Object.entries(e).filter(([k]) => k !== "motivo"))), { error: "Indique al menos un cambio." });
export type EdicionPersona = z.infer<typeof EsquemaEdicionPersona>;

export const EsquemaRestablecimientoContrasena = z.strictObject({ motivo });
export type RestablecimientoContrasena = z.infer<typeof EsquemaRestablecimientoContrasena>;

export const EsquemaConsultaPersonas = z.strictObject({ buscar, incluirInactivas: booleanoTexto, despuesDe: z.email().optional(), limite });
export type ConsultaPersonas = z.infer<typeof EsquemaConsultaPersonas>;

export const EsquemaParametroPersona = z.strictObject({ id: z.uuid() });

export const EsquemaPersonaAdmin = z.strictObject({
  id: z.uuid(),
  correo: z.string(),
  nombre: z.string(),
  funciones: z.array(z.enum(FUNCIONES_USUARIO)),
  /** Pertenencia activa en la organización (la desactivación es por organización). */
  activa: z.boolean(),
  /** Debe cambiar su contraseña temporal antes de operar. */
  cambioContrasenaPendiente: z.boolean(),
  /** Caducidad de la contraseña temporal pendiente, o `null`. */
  temporalExpiraEn: EsquemaInstante.nullable(),
  revision: z.number().int(),
  creadaEn: EsquemaInstante,
  modificadaEn: EsquemaInstante,
  modificadaPor: z.string().nullable(),
});
export type PersonaAdmin = z.infer<typeof EsquemaPersonaAdmin>;

export const EsquemaRespuestaPersonas = z.strictObject({
  personas: z.array(EsquemaPersonaAdmin),
  limite: z.number().int(),
  siguiente: z.string().nullable(),
});
export type RespuestaPersonas = z.infer<typeof EsquemaRespuestaPersonas>;

export const EsquemaDetallePersona = z.strictObject({ persona: EsquemaPersonaAdmin, historial: z.array(EsquemaEventoCatalogo) });
export type DetallePersona = z.infer<typeof EsquemaDetallePersona>;

/**
 * Alta o restablecimiento. `contrasenaTemporal` aparece UNA sola vez: al reintentar con la misma
 * `Idempotency-Key` llega `null` con `contrasenaEntregada: true` (no se genera otra); si se perdió,
 * hace falta un restablecimiento explícito.
 */
export const EsquemaRespuestaCredencialTemporal = z.strictObject({
  persona: EsquemaPersonaAdmin,
  contrasenaTemporal: z.string().nullable(),
  contrasenaEntregada: z.boolean(),
  /** Caducidad de la temporal; `null` si la persona ya la cambió (al reproducir un alta antigua). */
  temporalExpiraEn: EsquemaInstante.nullable(),
});
export type RespuestaCredencialTemporal = z.infer<typeof EsquemaRespuestaCredencialTemporal>;

