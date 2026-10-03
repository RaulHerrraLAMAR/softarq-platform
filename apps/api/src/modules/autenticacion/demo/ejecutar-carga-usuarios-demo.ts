/**
 * Punto de entrada de `pnpm --filter @softarq/api db:cargar-usuarios-demo [-- --restablecer <correo>]`.
 *
 * - SOLO `softarq_dev` local (archivo `.env`), con el rol migrador (MIGRATION_DATABASE_URL).
 * - Rechaza NODE_ENV=production y organizaciones que no sean DEMO.
 * - Las contraseñas generadas se guardan en
 *   `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json` (fuera del repositorio).
 *   La consola nunca las muestra: solo indica la ruta del archivo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crearPrisma, hostDeBase, nombreDeBase } from "../../../infraestructura/prisma/cliente.js";
import { ServicioContrasenas } from "../infraestructura/contrasenas.js";
import { cargarUsuariosDemo, type CredencialGenerada } from "./cargar-usuarios-demo.js";

const BASE_PERMITIDA = "softarq_dev";
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ORGANIZACION = "DEMO";
/** apps/api/dist/modules/autenticacion/demo → D:\Proyecto_SoftArq\_work\secrets */
const CARPETA_SECRETOS = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "..", "_work", "secrets");

interface ArchivoAccesos {
  advertencia: string;
  base: string;
  organizacion: string;
  actualizado: string;
  cuentas: Record<string, { nombre: string; funciones: readonly string[]; contrasena: string; generada: string }>;
}

function leerArchivo(ruta: string): ArchivoAccesos | null {
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8")) as ArchivoAccesos;
}

async function principal(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") throw new Error("Las cuentas DEMO no se cargan con NODE_ENV=production.");
  const args = process.argv.slice(2);
  const restablecer: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--restablecer" && args[i + 1]) restablecer.push(String(args[++i]));
    else if (args[i] !== "--") throw new Error(`Argumento no reconocido: ${args[i]}. Uso: [--restablecer <correo>]`);
  }

  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env["MIGRATION_DATABASE_URL"];
  if (!url) throw new Error("Falta MIGRATION_DATABASE_URL en apps/api/.env (ver db:credenciales).");
  const base = nombreDeBase(url);
  if (base !== BASE_PERMITIDA || !HOSTS_LOCALES.has(hostDeBase(url))) {
    throw new Error(`Las cuentas DEMO solo se cargan en ${BASE_PERMITIDA} local (destino: ${base}).`);
  }
  if (!existsSync(join(CARPETA_SECRETOS, ".."))) throw new Error(`No existe la carpeta de trabajo ${join(CARPETA_SECRETOS, "..")}.`);
  mkdirSync(CARPETA_SECRETOS, { recursive: true });
  const ruta = join(CARPETA_SECRETOS, `accesos-demo-${base}.json`);

  console.log(`Cargando cuentas DEMO en ${base} (${hostDeBase(url)}), organización ${ORGANIZACION}...`);
  const migrador = crearPrisma(url);
  try {
    const r = await cargarUsuariosDemo(migrador, new ServicioContrasenas(), { organizacion: ORGANIZACION, restablecer });
    const nuevas: CredencialGenerada[] = [...r.creadas, ...r.restablecidas];
    const archivo: ArchivoAccesos = leerArchivo(ruta) ?? {
      advertencia: "Accesos DEMO locales. NO VERSIONAR NI COMPARTIR. Solo válidos en softarq_dev local.",
      base,
      organizacion: ORGANIZACION,
      actualizado: "",
      cuentas: {},
    };
    if (nuevas.length > 0) {
      const ahora = new Date().toISOString();
      for (const c of nuevas) {
        archivo.cuentas[c.correo] = { nombre: c.nombre, funciones: c.funciones, contrasena: c.contrasena, generada: ahora };
      }
      archivo.actualizado = ahora;
      writeFileSync(ruta, `${JSON.stringify(archivo, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    }

    console.log(`Creadas: ${r.creadas.map((c) => c.correo).join(", ") || "ninguna"}`);
    console.log(`Restablecidas: ${r.restablecidas.map((c) => c.correo).join(", ") || "ninguna"}`);
    console.log(`Conservadas sin cambios: ${r.conservadas.join(", ") || "ninguna"}`);
    if (r.pertenenciasAgregadas.length > 0) console.log(`Pertenencias añadidas: ${r.pertenenciasAgregadas.join(", ")}`);
    const sinClave = r.conservadas.filter((c) => !archivo.cuentas[c]);
    if (sinClave.length > 0) {
      console.warn(
        `Sin contraseña en el archivo local para: ${sinClave.join(", ")}. No se cambió nada; para generar una nueva, ` +
          "use --restablecer <correo> (revoca sus sesiones).",
      );
    }
    console.log(`Accesos locales: ${ruta}${nuevas.length > 0 ? " (actualizado)" : ""}`);
  } finally {
    await migrador.$disconnect();
  }
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error en la carga de cuentas DEMO.");
  process.exitCode = 1;
});
