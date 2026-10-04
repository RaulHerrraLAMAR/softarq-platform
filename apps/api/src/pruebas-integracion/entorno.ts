/**
 * Entorno de las pruebas de integración. ÚNICA base permitida: softarq_test en localhost.
 * Se comprueba el destino antes de cualquier operación; nunca se imprime una URL completa.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { crearPrisma, type ClientePrisma } from "../infraestructura/prisma/cliente.js";

export const BASE_DE_PRUEBA = "softarq_test";
export const RAIZ_API = join(import.meta.dirname, "..", "..");
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function cargarEntornoDePrueba(): void {
  const archivo = join(RAIZ_API, ".env.test");
  if (!existsSync(archivo)) {
    throw new Error(
      "No existe apps/api/.env.test: ejecute scripts/db/generar-credenciales.mjs y el aprovisionamiento (README).",
    );
  }
  process.loadEnvFile(archivo);
}

/** Devuelve la URL de la variable solo si apunta a softarq_test en localhost. */
export function urlDePrueba(variable: "DATABASE_URL" | "MIGRATION_DATABASE_URL"): string {
  const valor = process.env[variable];
  if (!valor) throw new Error(`Falta ${variable} en .env.test.`);
  const url = new URL(valor);
  const base = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (base !== BASE_DE_PRUEBA || !HOSTS_LOCALES.has(url.hostname)) {
    throw new Error(
      `${variable} apunta a «${base}» en ${url.hostname}. Las pruebas de integración solo pueden usar ${BASE_DE_PRUEBA} local.`,
    );
  }
  return valor;
}

/** Confirma en el servidor que la conexión está en softarq_test. */
export async function confirmarBase(prisma: ClientePrisma): Promise<void> {
  const filas = await prisma.$queryRaw<{ base: string }[]>`SELECT current_database() AS base`;
  const base = filas[0]?.base;
  if (base !== BASE_DE_PRUEBA) throw new Error(`Conectado a «${base}»; se esperaba ${BASE_DE_PRUEBA}.`);
}

/** Cliente con el rol de la aplicación (softarq_app) sobre softarq_test. */
export function prismaApp(): ClientePrisma {
  return crearPrisma(urlDePrueba("DATABASE_URL"));
}

/**
 * Carpeta de documentos emitidos de las pruebas (módulo 8): SIEMPRE bajo
 * D:\Proyecto_SoftArq\_work\pruebas\documentos-<nombre>, nunca la de desarrollo.
 */
export const RAIZ_PRUEBAS_DOCUMENTOS = resolve(RAIZ_API, "..", "..", "..", "_work", "pruebas");

export function directorioDocumentosPrueba(nombre: "integracion" | "e2e"): string {
  return join(RAIZ_PRUEBAS_DOCUMENTOS, `documentos-${nombre}`);
}

/** Vacía una carpeta de documentos de prueba; se niega con cualquier otra ruta. */
export function vaciarDocumentosPrueba(ruta: string): void {
  const r = resolve(ruta);
  const rel = relative(RAIZ_PRUEBAS_DOCUMENTOS, r);
  if (rel.startsWith("..") || isAbsolute(rel) || !/^documentos-[a-z0-9-]+$/.test(rel)) {
    throw new Error(`Solo se vacían carpetas de documentos de prueba bajo _work\pruebas (recibido: ${r}).`);
  }
  rmSync(r, { recursive: true, force: true });
  mkdirSync(r, { recursive: true });
}
