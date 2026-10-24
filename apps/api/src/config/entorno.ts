/**
 * Configuración de la API validada al arrancar (ADR-0005). Si algo es inválido, el arranque falla
 * con un mensaje claro que NUNCA incluye valores secretos (solo el nombre de la variable y la regla).
 */
import { z } from "zod";

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** Roles que nunca deben usarse para ejecutar el servidor. */
const ROLES_PROHIBIDOS = new Set(["postgres", "softarq_migrator"]);
/**
 * Orígenes de los clientes: solo http en loopback. La cookie de sesión no lleva `Secure` en esta
 * etapa (HTTP local, ADR-0007); por eso no se admite ningún origen que no sea local ni https.
 */
const ORIGEN_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

const entero = (nombre: string, min: number, max: number, porOmision: number) =>
  z
    .string()
    .regex(/^\d+$/, { error: `${nombre} debe ser un entero.` })
    .transform(Number)
    .pipe(z.number().int().min(min, { error: `${nombre} mínimo ${min}.` }).max(max, { error: `${nombre} máximo ${max}.` }))
    .optional()
    .transform((v) => v ?? porOmision);

const EsquemaEntorno = z.object({
  DATABASE_URL: z
    .string({ error: "Falta DATABASE_URL (apps/api/.env; ver db:credenciales)." })
    .refine((v) => URL.canParse(v), { error: "DATABASE_URL no es una URL válida." })
    .refine((v) => /^postgres(ql)?:$/.test(new URL(v).protocol), { error: "DATABASE_URL debe ser postgresql://." })
    .refine((v) => HOSTS_LOCALES.has(new URL(v).hostname), { error: "DATABASE_URL debe apuntar a PostgreSQL local." })
    .refine((v) => !ROLES_PROHIBIDOS.has(decodeURIComponent(new URL(v).username)), {
      error: "DATABASE_URL usa un rol administrativo o de migración; el servidor debe usar softarq_app.",
    }),
  API_HOST: z
    .literal("127.0.0.1", { error: "API_HOST solo puede ser 127.0.0.1 en esta etapa (sin acceso desde la red)." })
    .optional()
    .transform(() => "127.0.0.1" as const),
  API_PORT: entero("API_PORT", 1024, 65535, 3000),
  API_CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ?? "http://localhost:5173").split(",").map((o) => o.trim()).filter(Boolean))
    .pipe(
      z
        .array(
          z.string().refine((o) => o !== "*" && ORIGEN_LOCAL.test(o), {
            error: "API_CORS_ORIGINS solo admite orígenes locales explícitos por http (http://localhost:PUERTO); nunca \"*\".",
          }),
        )
        .min(1)
        .max(10),
    ),
  // Módulo 17 (ADR-0021): dirección del panel del equipo que la app muestra a una cuenta interna. Solo local en esta etapa.
  API_PANEL_URL: z
    .string()
    .optional()
    .refine((v) => v === undefined || ORIGEN_LOCAL.test(v), { error: "API_PANEL_URL debe ser un origen local http://localhost:PUERTO." }),
  API_LIMITE_GENERAL_POR_MINUTO: entero("API_LIMITE_GENERAL_POR_MINUTO", 1, 10000, 120),
  API_LIMITE_CALCULO_POR_MINUTO: entero("API_LIMITE_CALCULO_POR_MINUTO", 1, 1000, 30),
  API_LIMITE_CUERPO_KB: entero("API_LIMITE_CUERPO_KB", 1, 1024, 128),
  // Límites de intentos de acceso (ADR-0007 §4): ventanas fijas en memoria, nunca permanentes.
  API_ACCESO_VENTANA_MINUTOS: entero("API_ACCESO_VENTANA_MINUTOS", 1, 1440, 15),
  API_ACCESO_FALLOS_CUENTA_IP: entero("API_ACCESO_FALLOS_CUENTA_IP", 1, 100, 5),
  API_ACCESO_FALLOS_CUENTA: entero("API_ACCESO_FALLOS_CUENTA", 1, 1000, 20),
  API_ACCESO_INTENTOS_IP: entero("API_ACCESO_INTENTOS_IP", 1, 10000, 30),
  // La cookie de sesión sin `Secure` solo es admisible en local: un entorno de producción se rechaza.
  NODE_ENV: z
    .string()
    .optional()
    .refine((v) => v !== "production", {
      error: "NODE_ENV=production no está permitido: esta API solo funciona en local por HTTP (sin TLS ni cookie Secure; ADR-0007).",
    }),
  SOFTARQ_ZONA_HORARIA: z
    .string()
    .optional()
    .transform((v) => v ?? "America/Mexico_City")
    .refine(
      (v) => {
        try {
          new Intl.DateTimeFormat("en-CA", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      },
      { error: "SOFTARQ_ZONA_HORARIA no es una zona horaria IANA válida." },
    ),
  // Módulo 8 (ADR-0010): carpeta persistente de los PDF emitidos (no es caché ni temporal). Ruta
  // absoluta; la API comprueba al arrancar que existe o puede crearse, que admite escritura y que
  // no está dentro de un repositorio. Sin ella, `main.ts` no arranca (las pruebas sin emisiones
  // pueden omitirla).
  SOFTARQ_DIR_DOCUMENTOS: z
    .string()
    .optional()
    .refine((v) => v === undefined || /^([A-Za-z]:[\\/]|\/)/.test(v), {
      error: "SOFTARQ_DIR_DOCUMENTOS debe ser una ruta absoluta.",
    }),
  API_REGISTRO: z
    .enum(["completo", "errores", "ninguno"], { error: "API_REGISTRO: completo | errores | ninguno." })
    .optional()
    .transform((v) => v ?? "completo"),
});

export interface ConfiguracionApi {
  databaseUrl: string;
  host: "127.0.0.1";
  puerto: number;
  origenesCors: string[];
  /** Panel del equipo (por omisión, el primer origen permitido). */
  panelUrl: string;
  limiteGeneralPorMinuto: number;
  limiteCalculoPorMinuto: number;
  limiteCuerpoKb: number;
  accesos: {
    ventanaMs: number;
    fallosPorCuentaEIp: number;
    fallosPorCuenta: number;
    intentosPorIp: number;
  };
  zonaHoraria: string;
  /** Carpeta persistente de documentos emitidos; `null` = emisión no disponible (solo pruebas). */
  dirDocumentos: string | null;
  registro: "completo" | "errores" | "ninguno";
}

export class ErrorConfiguracion extends Error {
  constructor(readonly problemas: string[]) {
    super(`Configuración inválida de la API:\n${problemas.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ErrorConfiguracion";
  }
}

/** Valida variables de entorno (o un objeto equivalente en pruebas). Lanza ErrorConfiguracion. */
export function leerConfiguracion(entorno: Record<string, string | undefined>): ConfiguracionApi {
  const r = EsquemaEntorno.safeParse(entorno);
  if (!r.success) {
    // Solo mensajes de las reglas; nunca los valores recibidos.
    throw new ErrorConfiguracion(r.error.issues.map((i) => i.message));
  }
  const e = r.data;
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.API_HOST,
    puerto: e.API_PORT,
    origenesCors: e.API_CORS_ORIGINS,
    panelUrl: e.API_PANEL_URL ?? e.API_CORS_ORIGINS[0]!,
    limiteGeneralPorMinuto: e.API_LIMITE_GENERAL_POR_MINUTO,
    limiteCalculoPorMinuto: e.API_LIMITE_CALCULO_POR_MINUTO,
    limiteCuerpoKb: e.API_LIMITE_CUERPO_KB,
    accesos: {
      ventanaMs: e.API_ACCESO_VENTANA_MINUTOS * 60_000,
      fallosPorCuentaEIp: e.API_ACCESO_FALLOS_CUENTA_IP,
      fallosPorCuenta: e.API_ACCESO_FALLOS_CUENTA,
      intentosPorIp: e.API_ACCESO_INTENTOS_IP,
    },
    zonaHoraria: e.SOFTARQ_ZONA_HORARIA,
    dirDocumentos: e.SOFTARQ_DIR_DOCUMENTOS ?? null,
    registro: e.API_REGISTRO,
  };
}
