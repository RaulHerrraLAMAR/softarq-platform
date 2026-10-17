/**
 * Construcción de la aplicación Nest (la usan main.ts y las pruebas HTTP).
 *
 * Controles de transporte (ADR-0005): escucha local, sin trust proxy, CORS con lista explícita,
 * Helmet, límite de cuerpo, rate limiting en memoria, validación Standard Schema (Zod) global,
 * filtro de errores único y cierre ordenado.
 *
 * Autenticación (ADR-0007): guardia global que niega por omisión, sesiones opacas en PostgreSQL,
 * CORS con credenciales para orígenes exactos y `Cache-Control: no-store`.
 *
 * Cotizaciones (ADR-0008): clientes, proyectos, borradores y versiones; PUT/PATCH y la cabecera
 * `Idempotency-Key` se añaden a CORS.
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
import { CABECERA_CSRF, CABECERA_IDEMPOTENCIA, CABECERA_IDEMPOTENCIA_REPRODUCIDA } from "@softarq/contracts";
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
import { ServicioClientes } from "../modules/cotizaciones/aplicacion/servicio-clientes.js";
import { ServicioCotizaciones, type MedidorTiempos } from "../modules/cotizaciones/aplicacion/servicio-cotizaciones.js";
import { ServicioEmisiones, type GanchosEmision } from "../modules/cotizaciones/aplicacion/servicio-emisiones.js";
import { ServicioRevisiones } from "../modules/cotizaciones/aplicacion/servicio-revisiones.js";
import { ServicioRespuestas } from "../modules/cotizaciones/aplicacion/servicio-respuestas.js";
import { ServicioExcepciones } from "../modules/cotizaciones/aplicacion/servicio-excepciones.js";
import { ServicioAdministracionCatalogos } from "../modules/catalogos/aplicacion/servicio-administracion.js";
import { AdministracionCatalogosController } from "./controladores-catalogos-admin.js";
import { generarPdf, type GeneradorPdf } from "../modules/cotizaciones/dominio/pdf/generador-pdf.js";
import {
  AlmacenArchivos,
  AlmacenNoConfigurado,
  type AlmacenDocumentos,
} from "../modules/cotizaciones/infraestructura/almacen-documentos.js";
import { RepositorioCotizaciones } from "../modules/cotizaciones/infraestructura/repositorio-cotizaciones.js";
import { ServicioBaseDeDatos } from "./base-de-datos.js";
import { comprobarRolAplicacion } from "./contexto.js";
import { AutenticacionController } from "./controlador-autenticacion.js";
import { CalculosController, CatalogosController, OpenApiController, SaludController } from "./controladores.js";
import {
  ClientesController,
  CotizacionesController,
  EmisionesController,
  EmisionVersionController,
  EmisorController,
  EnvioRevisionController,
  ProyectosController,
  RevisionesController,
  RespuestasController,
  ExcepcionesCatalogoController,
  ExcepcionesVersionController,
  ExcepcionesRevisionController,
  VerificacionVersionController,
} from "./controladores-cotizaciones.js";
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
  SERVICIO_CLIENTES,
  SERVICIO_COTIZACIONES,
  SERVICIO_EMISIONES,
  SERVICIO_REVISIONES,
  SERVICIO_RESPUESTAS,
  SERVICIO_EXCEPCIONES,
  SERVICIO_ADMIN_CATALOGOS,
} from "./tokens.js";

const VENTANA_LIMITADOR_MS = 60_000;

/**
 * Sustituciones SOLO para pruebas. Ninguna autentica ni da contexto de organización:
 * - `reloj`: fecha de negocio del cálculo (vigencias);
 * - `relojSesiones`: instante de la política de sesiones (expiración absoluta e inactividad);
 * - `sinComprobacionInicialDeRol`: permite arrancar con PostgreSQL inaccesible para comprobar las
 *   respuestas 503 (la guardia sigue exigiendo sesión y consultándola en la base);
 * - `medirTiempos`: observa la duración de las fases de «guardar versión» (medición del ADR-0008);
 * - `documentos`: almacén, generador del PDF o ganchos de la emisión, para provocar fallos de
 *   generación, escritura, movimiento o registro (ADR-0010). Nunca cambian permisos ni reglas.
 */
export interface OpcionesAplicacion {
  reloj?: Reloj;
  relojSesiones?: RelojSesiones;
  sinComprobacionInicialDeRol?: true;
  medirTiempos?: MedidorTiempos;
  documentos?: { almacen?: AlmacenDocumentos; generador?: GeneradorPdf; ganchos?: GanchosEmision };
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
    controllers: [
      SaludController,
      AutenticacionController,
      CatalogosController,
      CalculosController,
      ClientesController,
      ProyectosController,
      CotizacionesController,
      EnvioRevisionController,
      RevisionesController,
      EmisionVersionController,
      EmisionesController,
      RespuestasController,
      ExcepcionesCatalogoController,
      ExcepcionesVersionController,
      ExcepcionesRevisionController,
      VerificacionVersionController,
      AdministracionCatalogosController,
      EmisorController,
      OpenApiController,
    ],
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
      {
        provide: SERVICIO_CLIENTES,
        useFactory: (bd: ServicioBaseDeDatos, instante: RelojSesiones) =>
          new ServicioClientes(new RepositorioCotizaciones(bd.cliente), instante),
        inject: [BASE_DE_DATOS, RELOJ_SESIONES],
      },
      {
        provide: SERVICIO_COTIZACIONES,
        useFactory: (bd: ServicioBaseDeDatos, reloj: Reloj, instante: RelojSesiones) =>
          new ServicioCotizaciones(bd.cliente, reloj, instante, opciones.medirTiempos),
        inject: [BASE_DE_DATOS, RELOJ, RELOJ_SESIONES],
      },
      {
        provide: SERVICIO_REVISIONES,
        useFactory: (bd: ServicioBaseDeDatos, reloj: Reloj, instante: RelojSesiones) => new ServicioRevisiones(bd.cliente, reloj, instante),
        inject: [BASE_DE_DATOS, RELOJ, RELOJ_SESIONES],
      },
      {
        provide: SERVICIO_EMISIONES,
        useFactory: async (bd: ServicioBaseDeDatos, reloj: Reloj, instante: RelojSesiones, revisiones: ServicioRevisiones) => {
          let almacen = opciones.documentos?.almacen;
          if (!almacen) {
            if (config.dirDocumentos) {
              const archivos = new AlmacenArchivos(config.dirDocumentos);
              await archivos.preparar(); // carpeta escribible y fuera del repositorio, o no arranca
              almacen = archivos;
            } else {
              almacen = new AlmacenNoConfigurado();
            }
          }
          return new ServicioEmisiones(
            bd.cliente,
            reloj,
            instante,
            revisiones,
            almacen,
            opciones.documentos?.generador ?? generarPdf,
            opciones.documentos?.ganchos,
          );
        },
        inject: [BASE_DE_DATOS, RELOJ, RELOJ_SESIONES, SERVICIO_REVISIONES],
      },
      {
        provide: SERVICIO_RESPUESTAS,
        useFactory: (bd: ServicioBaseDeDatos, reloj: Reloj, instante: RelojSesiones) =>
          new ServicioRespuestas(bd.cliente, reloj, instante, config.zonaHoraria),
        inject: [BASE_DE_DATOS, RELOJ, RELOJ_SESIONES],
      },
      {
        provide: SERVICIO_ADMIN_CATALOGOS,
        useFactory: (bd: ServicioBaseDeDatos, reloj: Reloj, instante: RelojSesiones) => new ServicioAdministracionCatalogos(bd.cliente, reloj, instante),
        inject: [BASE_DE_DATOS, RELOJ, RELOJ_SESIONES],
      },
      {
        provide: SERVICIO_EXCEPCIONES,
        useFactory: (bd: ServicioBaseDeDatos, instante: RelojSesiones) => new ServicioExcepciones(bd.cliente, instante),
        inject: [BASE_DE_DATOS, RELOJ_SESIONES],
      },
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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", CABECERA_CSRF, CABECERA_IDEMPOTENCIA],
    exposedHeaders: ["X-Request-Id", "Retry-After", CABECERA_IDEMPOTENCIA_REPRODUCIDA],
    credentials: true, // cookie de sesión; solo para los orígenes exactos de la lista

    maxAge: 600,
  });
  app.setGlobalPrefix("api/v1", { exclude: [{ path: "health", method: RequestMethod.GET }] });
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: errorDeValidacion }));
  app.enableShutdownHooks();
  return app;
}
