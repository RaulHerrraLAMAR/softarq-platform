/**
 * Servidor para las pruebas de navegador de la web (Playwright). SOLO softarq_test.
 *
 * 1. `prepararBase` (el mismo globalSetup de las pruebas de integración): exige softarq_test local,
 *    confirma `current_database()`, vacía el esquema y aplica migraciones y permisos.
 * 2. Carga el catálogo DEMO con el rol de la aplicación.
 * 3. Crea las cuentas DEMO (Preparador y Revisor) con el rol migrador y contraseñas nuevas en cada
 *    corrida, que guarda en D:\Proyecto_SoftArq\_work\secrets\accesos-e2e.json (fuera del repositorio)
 *    para que las lean las pruebas. No hay ningún atajo de autenticación: la web inicia sesión.
 * 3b. Carga el emisor DEMO y usa una carpeta de documentos EXCLUSIVA de estas pruebas
 *    (_work\pruebas\documentos-e2e), que vacía al empezar; nunca la de desarrollo. Si existe el
 *    archivo `fallar-proxima-generacion` en esa carpeta, la siguiente generación del PDF falla una
 *    vez (prueba de «fallo de generación con el contexto conservado»; solo en dist-e2e).
 * 4. Arranca la API con una fecha de cálculo fija (`RelojFijo`), el mismo mecanismo que las pruebas
 *    HTTP, en 127.0.0.1:3101 y con CORS solo para la web de pruebas (http://localhost:4173). El
 *    navegador usa http://localhost:3101 (mismo site que la web, para la cookie de sesión).
 *
 * Nunca toca softarq_dev. Compilado con tsconfig.e2e.json en dist-e2e/ (no forma parte de dist/).
 */
import "reflect-metadata";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leerConfiguracion } from "../config/entorno.js";
import { CUENTAS_DEMO, cargarUsuariosDemo } from "../modules/autenticacion/demo/cargar-usuarios-demo.js";
import { ServicioContrasenas } from "../modules/autenticacion/infraestructura/contrasenas.js";
import { prismaMigrador } from "../pruebas-integracion/sesiones.js";
import { crearAplicacion } from "../http/crear-aplicacion.js";
import { RelojFijo } from "../modules/calculo/aplicacion/reloj.js";
import { cargarDemo } from "../modules/catalogos/demo/cargar-demo.js";
import { cargarEmisorDemo } from "../modules/cotizaciones/demo/cargar-emisor-demo.js";
import { cargarClientesDemo } from "../modules/cliente/demo/cargar-clientes-demo.js";
import { generarPdf } from "../modules/cotizaciones/dominio/pdf/generador-pdf.js";
import { confirmarBase, directorioDocumentosPrueba, prismaApp, vaciarDocumentosPrueba } from "../pruebas-integracion/entorno.js";
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
    const demo = await cargarDemo(prisma);
    await cargarEmisorDemo(prisma, demo.organizacionId);
  } finally {
    await prisma.$disconnect();
  }
  const migrador = await prismaMigrador();
  try {
    const r = await cargarUsuariosDemo(migrador, new ServicioContrasenas(), { organizacion: "DEMO" });
    // Módulo 7: una persona con las dos funciones, para comprobar BL-17 por identidad en el navegador.
    const ambas = await cargarUsuariosDemo(migrador, new ServicioContrasenas(), {
      organizacion: "DEMO",
      cuentas: [
        { correo: "ambas.e2e@softarq.test", nombre: "[DEMO] Preparador y revisor E2E", funciones: ["PREPARADOR", "REVISOR"] },
        // Módulo 14: Revisor al que se le retira la función con la pantalla abierta (no se usa en otras pruebas).
        { correo: "retiro.e2e@softarq.test", nombre: "[DEMO] Revisor con función retirada E2E", funciones: ["REVISOR"] },
        // Módulo 16 (ADR-0020): cuenta con la contraseña vigente marcada como TEMPORAL, para probar en el
        // teléfono el cambio obligatorio sin tocar softarq_dev (`adb reverse tcp:3000 tcp:3101`).
        { correo: "temporal.e2e@softarq.test", nombre: "[DEMO] Contraseña temporal E2E", funciones: ["PREPARADOR"] },
      ],
    });
    await migrador.$executeRaw`UPDATE usuario SET contrasena_temporal_expira_en = now() + interval '72 hours' WHERE correo = 'temporal.e2e@softarq.test'`;
    // Módulo 17 (E3): trabajos para clientes (Cubierta, Losa, Muro) y precios de referencia, para que las pruebas del panel
    // recorran solicitudes reales. Sus tres clientes ficticios y sus accesos no se usan (las contraseñas no se guardan).
    await cargarClientesDemo(migrador, new ServicioContrasenas(), { organizacion: "DEMO", fecha: FECHA_E2E, dominioCorreo: "clientes-e2e.softarq.test" });
    const cuenta = (correo: string) => {
      const c = [...r.creadas, ...ambas.creadas].find((x) => x.correo === correo);
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
          ambas: cuenta("ambas.e2e@softarq.test"),
          retiro: cuenta("retiro.e2e@softarq.test"),
          temporal: cuenta("temporal.e2e@softarq.test"),
          administrador: cuenta(CUENTAS_DEMO[2]!.correo),
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

  const dirDocumentos = directorioDocumentosPrueba("e2e");
  vaciarDocumentosPrueba(dirDocumentos);
  const marcaFallo = join(dirDocumentos, "fallar-proxima-generacion");
  const config = leerConfiguracion({
    ...process.env,
    SOFTARQ_DIR_DOCUMENTOS: dirDocumentos,
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
  const app = await crearAplicacion(config, {
    reloj: new RelojFijo(FECHA_E2E),
    documentos: {
      generador: async (d) => {
        if (existsSync(marcaFallo)) {
          rmSync(marcaFallo, { force: true });
          throw new Error("Fallo de generación provocado por la prueba E2E.");
        }
        return generarPdf(d);
      },
    },
  });
  await app.listen(config.puerto, config.host);
  console.log(`[e2e] API de pruebas en http://${config.host}:${config.puerto} (softarq_test, fecha ${FECHA_E2E}).`);
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : "Error de arranque.");
  process.exitCode = 1;
});
