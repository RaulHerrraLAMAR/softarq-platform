/**
 * Cliente de PostgreSQL del proceso HTTP: se crea con la URL del rol de la aplicación,
 * se comprueba con `SELECT 1` (salud) y se desconecta al cerrar el servicio.
 */
import { Logger, type OnApplicationShutdown } from "@nestjs/common";
import type { PrismaClient } from "../generated/prisma/client.js";
import { crearPrisma } from "../infraestructura/prisma/cliente.js";

export class ServicioBaseDeDatos implements OnApplicationShutdown {
  readonly cliente: PrismaClient;

  constructor(urlConexion: string) {
    this.cliente = crearPrisma(urlConexion);
  }

  /** `true` si PostgreSQL responde. Nunca propaga el detalle del error. */
  async disponible(): Promise<boolean> {
    try {
      await this.cliente.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(senal?: string): Promise<void> {
    await this.cliente.$disconnect();
    new Logger("BaseDeDatos").log(`Conexiones con PostgreSQL cerradas${senal ? ` (${senal})` : ""}.`);
  }
}
