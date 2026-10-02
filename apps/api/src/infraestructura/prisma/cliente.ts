/**
 * Creación del cliente de Prisma con el adaptador de PostgreSQL (Prisma 7).
 * La URL se recibe explícitamente: el dominio y los repositorios no leen variables de entorno.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

export type ClientePrisma = PrismaClient;

export function crearPrisma(urlConexion: string): PrismaClient {
  if (!urlConexion) throw new Error("Falta la URL de conexión a PostgreSQL.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlConexion }) });
}

/** Nombre de la base de una URL postgresql://…/<base>, sin exponer credenciales. */
export function nombreDeBase(urlConexion: string): string {
  return decodeURIComponent(new URL(urlConexion).pathname.replace(/^\//, ""));
}

/** Host de una URL, sin credenciales. */
export function hostDeBase(urlConexion: string): string {
  return new URL(urlConexion).hostname;
}
