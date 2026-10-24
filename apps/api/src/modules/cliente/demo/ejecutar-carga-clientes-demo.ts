/**
 * Punto de entrada de `pnpm --filter @softarq/api db:cargar-clientes-demo` (módulo 17, ADR-0021).
 *
 * - SOLO `softarq_dev` local (archivo `.env`), con el rol migrador (MIGRATION_DATABASE_URL). Rechaza NODE_ENV=production.
 * - Carga trabajos para clientes, precios de referencia, tres clientes ficticios con sus proyectos y su acceso a la app.
 *   Idempotente: nunca restablece la contraseña de un acceso existente ni toca cotizaciones, versiones, emisiones ni PDF.
 * - Los accesos nuevos se guardan en `<raíz>\_work\secrets\accesos-clientes-demo-softarq_dev.json` (fuera de Git). La consola
 *   nunca muestra contraseñas: solo la ruta del archivo. Las contraseñas temporales caducan a las 72 h y deben cambiarse al entrar.
 * - Antes de cargar en `softarq_dev` haga un respaldo verificado (`respaldo:crear` y `respaldo:verificar`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crearPrisma, hostDeBase, nombreDeBase } from "../../../infraestructura/prisma/cliente.js";
import { ServicioContrasenas } from "../../autenticacion/infraestructura/contrasenas.js";
import { RelojDelSistema } from "../../calculo/aplicacion/reloj.js";
import { cargarClientesDemo } from "./cargar-clientes-demo.js";

const BASE_PERMITIDA = "softarq_dev";
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ORGANIZACION = "DEMO";
/** apps/api/dist/modules/cliente/demo → <raíz>\_work\secrets */
const CARPETA_SECRETOS = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "..", "_work", "secrets");

interface ArchivoAccesos {
  advertencia: string;
  base: string;
  organizacion: string;
  actualizado: string;
  cuentas: Record<string, { nombre: string; cliente: string; contrasena: string; generada: string }>;
}

async function principal(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") throw new Error("Los datos de presentación no se cargan con NODE_ENV=production.");
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env["MIGRATION_DATABASE_URL"];
  if (!url) throw new Error("Falta MIGRATION_DATABASE_URL en apps/api/.env (ver db:credenciales).");
  const base = nombreDeBase(url);
  if (base !== BASE_PERMITIDA || !HOSTS_LOCALES.has(hostDeBase(url))) {
    throw new Error(`Los datos de presentación solo se cargan en ${BASE_PERMITIDA} local (destino: ${base}).`);
  }
  if (!existsSync(join(CARPETA_SECRETOS, ".."))) throw new Error(`No existe la carpeta de trabajo ${join(CARPETA_SECRETOS, "..")}.`);
  mkdirSync(CARPETA_SECRETOS, { recursive: true });
  const ruta = join(CARPETA_SECRETOS, `accesos-clientes-demo-${base}.json`);

  console.log(`Cargando datos de presentación del cliente en ${base} (${hostDeBase(url)}), organización ${ORGANIZACION}...`);
  const migrador = crearPrisma(url);
  try {
    const hoy = new RelojDelSistema(process.env["SOFTARQ_ZONA_HORARIA"] ?? "America/Mexico_City").hoy();
    const r = await cargarClientesDemo(migrador, new ServicioContrasenas(), { organizacion: ORGANIZACION, fecha: hoy });
    if (r.accesosCreados.length > 0) {
      const archivo: ArchivoAccesos = existsSync(ruta)
        ? (JSON.parse(readFileSync(ruta, "utf8")) as ArchivoAccesos)
        : { advertencia: "Accesos de clientes DEMO locales. NO VERSIONAR NI COMPARTIR. Solo válidos en softarq_dev local.", base, organizacion: ORGANIZACION, actualizado: "", cuentas: {} };
      const ahora = new Date().toISOString();
      for (const c of r.accesosCreados) archivo.cuentas[c.correo] = { nombre: c.nombre, cliente: c.cliente, contrasena: c.contrasena, generada: ahora };
      archivo.actualizado = ahora;
      writeFileSync(ruta, `${JSON.stringify(archivo, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    console.log(`Trabajos guardados: ${r.trabajosGuardados.join(", ") || "ninguno (ya estaban)"}`);
    console.log(`Referencias designadas: ${r.referenciasDesignadas.join(", ") || "ninguna"}; conservadas: ${r.referenciasConservadas.length}`);
    console.log(`Clientes creados: ${r.clientesCreados.join(", ") || "ninguno"}`);
    console.log(`Proyectos creados: ${r.proyectosCreados.join(", ") || "ninguno"}`);
    console.log(`Accesos creados: ${r.accesosCreados.map((c) => c.correo).join(", ") || "ninguno"}; conservados sin cambios: ${r.accesosConservados.length}`);
    console.log(`Accesos locales: ${ruta}${r.accesosCreados.length > 0 ? " (actualizado)" : ""}`);
  } finally {
    await migrador.$disconnect();
  }
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error en la carga de clientes DEMO.");
  process.exitCode = 1;
});
