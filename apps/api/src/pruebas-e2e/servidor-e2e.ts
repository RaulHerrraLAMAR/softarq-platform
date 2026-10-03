/**
 * Servidor para las pruebas de navegador de la web (Playwright). SOLO softarq_test.
 *
 * 1. `prepararBase` (el mismo globalSetup de las pruebas de integración): exige softarq_test local,
 *    confirma `current_database()`, vacía el esquema y aplica migraciones y permisos.
 * 2. Carga el catálogo DEMO con el rol de la aplicación.
 * 3. Crea las cuentas DEMO (Preparador y Revisor) con el rol migrador y contraseñas nuevas en cada
 *    corrida, que guarda en D:\Proyecto_SoftArq\_work\secrets\accesos-e2e.json (fuera del repositorio)
 *    para que las lean las pruebas. No hay ningún atajo de autenticación: la web inicia sesión.
 * 4. Arranca la API con una fecha de cálculo fija (`RelojFijo`), el mismo mecanismo que las pruebas
 *    HTTP, en 127.0.0.1:3101 y con CORS solo para la web de pruebas (http://localhost:4173). El
 *    navegador usa http://localhost:3101 (mismo site que la web, para la cookie de sesión).
 *
 * Nunca toca softarq_dev. Compilado con tsconfig.e2e.json en dist-e2e/ (no forma parte de dist/).
 */
import "reflect-metadata";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leerConfiguracion } from "../config/entorno.js";
import { CUENTAS_DEMO, cargarUsuariosDemo } from "../modules/autenticacion/demo/cargar-usuarios-demo.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { prismaMigrador } from "../pruebas-integracion/sesiones.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { confirmarBase, prismaApp } from "../pruebas-integracion/entorno.js";
import prepararBase from "../pruebas-integracion/preparar-base.js";

const FECHA_E2E = "2026-09-25";
const PUERTO_E2E = 3101;
const ORIGEN_WEB_E2E = "http://localhost:4173";
/** apps/api/dist-e2e/pruebas-e2e → D:\Proyecto_SoftArq\_work\secrets */
const ARCHIVO_ACCESOS = join(import.meta.dirname, "..", "..", "..", "..", "..", "_work", "secrets", "accesos-e2e.json");

async function principal(): Promise<void> {
  await prepararBase();
  const prisma = prismaApp();
  try {
    await confirmarBase(prisma);
    await cargarDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }
  const migrador = await prismaMigrador();
  try {
    const r = await cargarUsuariosDemo(migrador, new ServicioContrasenas(), { organizacion: "DEMO" });
    const cuenta = (correo: string) => {
      const c = r.creadas.find((x) => x.correo === correo);
      if (!c) throw new Error(`No se creó la cuenta de prueba ${correo}.`);
      return { correo: c.correo, contrasena: c.contrasena, nombre: c.nombre };
    };
    mkdirSync(join(ARCHIVO_ACCESOS, ".."), { recursive: true });
    writeFileSync(
      ARCHIVO_ACCESOS,
      `${JSON.stringify(
        {
          advertencia: "Accesos de las pruebas de navegador (solo softarq_test); se regeneran en cada corrida. NO VERSIONAR.",
          preparador: cuenta(CUENTAS_DEMO[0]!.correo),
          revisor: cuenta(CUENTAS_DEMO[1]!.correo),
        },
        null,
        2,
      )}
`,
      { encoding: "utf8", mode: 0o600 },
    );
  } finally {
    await migrador.$disconnect();
  }

  const config = leerConfiguracion({
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(PUERTO_E2E),
    API_CORS_ORIGINS: ORIGEN_WEB_E2E,
    // Límites amplios: las pruebas recorren muchos cálculos seguidos con un solo navegador.
    API_LIMITE_GENERAL_POR_MINUTO: "2000",
    API_LIMITE_CALCULO_POR_MINUTO: "600",
    // Cada prueba inicia sesión desde 127.0.0.1: límite por IP amplio (los de cuenta se conservan).
    API_ACCESO_INTENTOS_IP: "1000",
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
