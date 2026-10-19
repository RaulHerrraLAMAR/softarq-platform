/**
 * Salidas internas de una versión (módulo 14, ADR-0018): compras calculadas, detalle del cálculo e
 * indicadores, de SOLO LECTURA.
 *
 * - Una transacción READ ONLY en REPEATABLE READ: la versión, su estado derivado y las decisiones
 *   de sus excepciones se leen en la misma instantánea. No escribe nada (ni bitácora ni eventos):
 *   consultar no crea versiones, no recalcula, no cambia estados, selecciones ni folios.
 * - Solo lo congelado en la versión: nunca el catálogo ni los parámetros vigentes.
 * - La capacidad la exige la guardia en cada petición (`cotizaciones.consultar` y
 *   `salidas.consultar`); la organización sale de la sesión y otra organización es un 404.
 */
import type { SalidasInternasVersion } from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { construirSalidasInternas } from "../dominio/salidas-internas.js";
import { RepositorioCotizaciones } from "../infraestructura/repositorio-cotizaciones.js";
import { ErrorNegocio } from "./errores.js";

export class ServicioSalidasInternas {
  constructor(private readonly db: PrismaClient) {}

  async consultar(ctx: ContextoOrganizacion, cotizacionId: string, numero: number): Promise<SalidasInternasVersion> {
    const v = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return new RepositorioCotizaciones(tx).obtenerVersionInterna(ctx, cotizacionId, numero);
      },
      { isolationLevel: "RepeatableRead", timeout: 15_000 },
    );
    if (!v) throw new ErrorNegocio("NO_ENCONTRADO", "La versión no existe en su organización.");
    return construirSalidasInternas(v);
  }
}
