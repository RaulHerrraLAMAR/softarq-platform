/**
 * Construcción de la aplicación Nest (la usan main.ts y las pruebas HTTP).
 *
 * Controles de transporte (ADR-0005): escucha local, sin trust proxy, CORS con lista explícita,
 * Helmet, límite de cuerpo, rate limiting en memoria, validación Standard Schema (Zod) global,
 * filtro de errores único y cierre ordenado.
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
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import helmet from "helmet";
import { z } from "zod";
import type { ConfiguracionApi } from "../config/entorno.js";
import type { ContextoOrganizacion } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { RelojDelSistema, type Reloj } from "../modules/calculo/aplicacion/reloj.js";
import { ServicioBaseDeDatos } from "./base-de-datos.js";
import { ContextoDemoFijo, resolverContextoDemo } from "./contexto.js";
import { CalculosController, CatalogosController, OpenApiController, SaludController } from "./controladores.js";
import { FiltroErrores, errorDeValidacion } from "./errores.js";
import { crearMiddlewareJson, crearMiddlewareRegistro, middlewareSolicitudId } from "./solicitud.js";
import { BASE_DE_DATOS, CONFIGURACION, CONTEXTO_SOLICITUD, RELOJ, REPOSITORIO_CATALOGOS } from "./tokens.js";

const VENTANA_LIMITADOR_MS = 60_000;

/** Sustituciones SOLO para pruebas: fecha fija o contexto sin consultar la base. */
export interface OpcionesAplicacion {
  reloj?: Reloj;
  contextoFijo?: ContextoOrganizacion;
}

function moduloRaiz(config: ConfiguracionApi, opciones: OpcionesAplicacion): DynamicModule {
  @Module({})
  class TransporteModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(middlewareSolicitudId, crearMiddlewareRegistro(config.registro), crearMiddlewareJson(config.limiteCuerpoKb))
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
    controllers: [SaludController, CatalogosController, CalculosController, OpenApiController],
    providers: [
      { provide: CONFIGURACION, useValue: config },
      { provide: BASE_DE_DATOS, useFactory: () => new ServicioBaseDeDatos(config.databaseUrl) },
      {
        provide: REPOSITORIO_CATALOGOS,
        useFactory: (bd: ServicioBaseDeDatos) => new RepositorioCatalogos(bd.cliente),
        inject: [BASE_DE_DATOS],
      },
      {
        provide: CONTEXTO_SOLICITUD,
        useFactory: async (bd: ServicioBaseDeDatos, repo: RepositorioCatalogos) => {
          if (opciones.contextoFijo) return new ContextoDemoFijo(opciones.contextoFijo);
          try {
            return await resolverContextoDemo(bd, repo, config.organizacionDemo);
          } catch (e) {
            await bd.cliente.$disconnect(); // el arranque falla: no dejar conexiones abiertas
            throw e;
          }
        },
        inject: [BASE_DE_DATOS, REPOSITORIO_CATALOGOS],
      },
      { provide: RELOJ, useValue: opciones.reloj ?? new RelojDelSistema(config.zonaHoraria) },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
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
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    exposedHeaders: ["X-Request-Id", "Retry-After"],
    credentials: false,
    maxAge: 600,
  });
  app.setGlobalPrefix("api/v1", { exclude: [{ path: "health", method: RequestMethod.GET }] });
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: errorDeValidacion }));
  app.enableShutdownHooks();
  return app;
}
