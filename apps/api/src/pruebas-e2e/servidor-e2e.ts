/**
 * Servidor para las pruebas de navegador de la web (Playwright). SOLO softarq_test.
 *
 * 1. `prepararBase` (el mismo globalSetup de las pruebas de integración): exige softarq_test local,
 *    confirma `current_database()`, vacía el esquema y aplica migraciones y permisos.
 * 2. Carga el catálogo DEMO con el rol de la aplicación.
 * 3. Arranca la API con una fecha de cálculo fija (`RelojFijo`), el mismo mecanismo que las pruebas
 *    HTTP, en 127.0.0.1:3101 y con CORS solo para la web de pruebas (http://localhost:4173).
 *
 * Nunca toca softarq_dev. Compilado con tsconfig.e2e.json en dist-e2e/ (no forma parte de dist/).
 */
import "reflect-metadata";
import { leerConfiguracion } from "../config/entorno.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { confirmarBase, prismaApp } from "../pruebas-integracion/entorno.js";
import prepararBase from "../pruebas-integracion/preparar-base.js";

const FECHA_E2E = "2026-09-25";
const PUERTO_E2E = 3101;
const ORIGEN_WEB_E2E = "http://localhost:4173";

async function principal(): Promise<void> {
  await prepararBase();
  const prisma = prismaApp();
  try {
    await confirmarBase(prisma);
    await cargarDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const config = leerConfiguracion({
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(PUERTO_E2E),
    API_CORS_ORIGINS: ORIGEN_WEB_E2E,
    // Límites amplios: las pruebas recorren muchos cálculos seguidos con un solo navegador.
    API_LIMITE_GENERAL_POR_MINUTO: "2000",
    API_LIMITE_CALCULO_POR_MINUTO: "600",
    API_REGISTRO: "errores",
  });
  const app = await crearAplicacion(config, { reloj: new RelojFijo(FECHA_E2E) });
  await app.listen(config.puerto, config.host);
  console.log(`[e2e] API de pruebas en http://${config.host}:${config.puerto} (softarq_test, fecha ${FECHA_E2E}).`);
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : "Error de arranque.");
  process.exitCode = 1;
});
