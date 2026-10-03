/**
 * Construcción de la aplicación Nest (la usan main.ts y las pruebas HTTP).
 *
 * Controles de transporte (ADR-0005): escucha local, sin trust proxy, CORS con lista explícita,
 * Helmet, límite de cuerpo, rate limiting en memoria, validación Standard Schema (Zod) global,
 * filtro de errores único y cierre ordenado.
 *
 * Autenticación (ADR-0007): guardia global que niega por omisión, sesiones opacas en PostgreSQL,
 * CORS con credenciales para orígenes exactos y `Cache-Control: no-store`.
 */
import "reflect-metadata";
import {
  Module,
  RequestMethod,
  StandardSchemaValidationPipe,
  type DynamicModule,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import helmet from "helmet";
import { CABECERA_CSRF } from "@softarq/contracts";
import { z } from "zod";
import type { ConfiguracionApi } from "../config/entorno.js";
import { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { RelojDelSistema, type Reloj } from "../modules/calculo/aplicacion/reloj.js";
import { LimitadorAccesos } from "../modules/autenticacion/aplicacion/limitador-accesos.js";
import {
  RELOJ_SESIONES_DEL_SISTEMA,
  ServicioAutenticacion,
  type RelojSesiones,
} from "../modules/autenticacion/aplicacion/servicio-autenticacion.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { GeneradorCsrf } from "../modules/autenticacion/infraestructura/csrf.js";
import { RepositorioSesiones } from "../modules/autenticacion/infraestructura/repositorio-sesiones.js";
import { ServicioBaseDeDatos } from "./base-de-datos.js";
import { comprobarRolAplicacion } from "./contexto.js";
import { AutenticacionController } from "./controlador-autenticacion.js";
import { CalculosController, CatalogosController, OpenApiController, SaludController } from "./controladores.js";
import { FiltroErrores, errorDeValidacion } from "./errores.js";
import { GuardiaSesion } from "./guardia-sesion.js";
import { crearMiddlewareJson, crearMiddlewareRegistro, middlewareSinCache, middlewareSolicitudId } from "./solicitud.js";
import {
  BASE_DE_DATOS,
  CONFIGURACION,
  RELOJ,
  RELOJ_SESIONES,
  REPOSITORIO_CATALOGOS,
  SERVICIO_AUTENTICACION,
} from "./tokens.js";

const VENTANA_LIMITADOR_MS = 60_000;

/**
 * Sustituciones SOLO para pruebas. Ninguna autentica ni da contexto de organización:
 * - `reloj`: fecha de negocio del cálculo (vigencias);
 * - `relojSesiones`: instante de la política de sesiones (expiración absoluta e inactividad);
 * - `sinComprobacionInicialDeRol`: permite arrancar con PostgreSQL inaccesible para comprobar las
 *   respuestas 503 (la guardia sigue exigiendo sesión y consultándola en la base).
 */
export interface OpcionesAplicacion {
  reloj?: Reloj;
  relojSesiones?: RelojSesiones;
  sinComprobacionInicialDeRol?: true;
}

function moduloRaiz(config: ConfiguracionApi, opciones: OpcionesAplicacion): DynamicModule {
  @Module({})
  class TransporteModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(
          middlewareSolicitudId,
          middlewareSinCache,
          crearMiddlewareRegistro(config.registro),
          crearMiddlewareJson(config.limiteCuerpoKb),
        )
        .forRoutes({ path: "*splat", method: RequestMethod.ALL });
    }
  }

  return {
    module: TransporteModule,
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [
          { name: "general", ttl: VENTANA_LIMITADOR_MS, limit: config.limiteGeneralPorMinuto },
          { name: "calculo", ttl: VENTANA_LIMITADOR_MS, limit: config.limiteCalculoPorMinuto },
        ],
      }),
    ],
    controllers: [SaludController, AutenticacionController, CatalogosController, CalculosController, OpenApiController],
    providers: [
      { provide: CONFIGURACION, useValue: config },
      { provide: BASE_DE_DATOS, useFactory: () => new ServicioBaseDeDatos(config.databaseUrl) },
      {
        provide: REPOSITORIO_CATALOGOS,
        useFactory: (bd: ServicioBaseDeDatos) => new RepositorioCatalogos(bd.cliente),
        inject: [BASE_DE_DATOS],
      },
      {
        provide: SERVICIO_AUTENTICACION,
        useFactory: async (bd: ServicioBaseDeDatos) => {
          try {
            if (!opciones.sinComprobacionInicialDeRol) await comprobarRolAplicacion(bd);
          } catch (e) {
            await bd.cliente.$disconnect(); // el arranque falla: no dejar conexiones abiertas
            throw e;
          }
          const contrasenas = new ServicioContrasenas();
          await contrasenas.preparar(); // hash ficticio: tiempo uniforme para cuentas inexistentes
          const relojSesiones = opciones.relojSesiones ?? RELOJ_SESIONES_DEL_SISTEMA;
          return new ServicioAutenticacion(
            new RepositorioSesiones(bd.cliente),
            contrasenas,
            new LimitadorAccesos(config.accesos, () => relojSesiones.ahora().getTime()),
            new GeneradorCsrf(),
            relojSesiones,
          );
        },
        inject: [BASE_DE_DATOS],
      },
      { provide: RELOJ_SESIONES, useValue: opciones.relojSesiones ?? RELOJ_SESIONES_DEL_SISTEMA },
      { provide: RELOJ, useValue: opciones.reloj ?? new RelojDelSistema(config.zonaHoraria) },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      {
        // Después del limitador: niega por omisión (sesión, origen, CSRF y capacidad).
        provide: APP_GUARD,
        useFactory: (reflector: Reflector, servicio: ServicioAutenticacion) =>
          new GuardiaSesion(reflector, servicio, config.origenesCors, config.registro !== "ninguno"),
        inject: [Reflector, SERVICIO_AUTENTICACION],
      },
      {
        provide: APP_FILTER,
        useFactory: () => new FiltroErrores(config.registro !== "ninguno", VENTANA_LIMITADOR_MS / 1000),
      },
    ],
  };
}

export async function crearAplicacion(
  config: ConfiguracionApi,
  opciones: OpcionesAplicacion = {},
): Promise<INestApplication> {
  // Mensajes de validación de Zod en español.
  z.config(z.locales.es());

  const app = await NestFactory.create<NestExpressApplication>(moduloRaiz(config, opciones), {
    bodyParser: false, // el parser JSON con límite es un middleware de Nest (sus errores llegan al filtro)
    logger: config.registro === "ninguno" ? false : ["log", "warn", "error"],
    abortOnError: false,
  });

  app.set("trust proxy", false); // no se confía en X-Forwarded-For
  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.use(helmet({ hsts: false })); // HTTP local: HSTS no aplica
  app.enableCors({
    origin: (origen, cb) => cb(null, origen !== undefined && config.origenesCors.includes(origen)),
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", CABECERA_CSRF],
    exposedHeaders: ["X-Request-Id", "Retry-After"],
    credentials: true, // cookie de sesión; solo para los orígenes exactos de la lista

    maxAge: 600,
  });
  app.setGlobalPrefix("api/v1", { exclude: [{ path: "health", method: RequestMethod.GET }] });
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: errorDeValidacion }));
  app.enableShutdownHooks();
  return app;
}
