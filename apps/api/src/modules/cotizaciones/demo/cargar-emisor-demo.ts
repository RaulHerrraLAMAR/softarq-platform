/**
 * Datos del emisor DEMO (módulo 8, ADR-0010): `DEMO_EMISOR_*` de `modBuild.bas` (ficticios, solo
 * con AMBIENTE = DEMO), con los acentos restaurados y la marca [DEMO]. El logotipo es el recurso
 * local copiado de `entrega\recursos\logo_demo.png` (sin modificar el original).
 *
 * Carga idempotente: si la organización ya tiene emisor, se conserva TAL CUAL (no se sobrescriben
 * cambios del Administrador del sistema). Usa el rol de la aplicación, como la carga del catálogo.
 */
import type { PrismaClient } from "../../../generated/prisma/client.js";

export const EMISOR_DEMO = {
  nombre: "[DEMO] EMISOR DE DEMOSTRACIÓN (ficticio)",
  domicilio: "Domicilio ficticio de demostración",
  telefono: "000 000 0000 (ficticio)",
  correo: "demo@ejemplo.invalid",
  logoClave: "DEMO",
} as const;

export async function cargarEmisorDemo(prisma: PrismaClient, organizacionId: string): Promise<{ creado: boolean }> {
  const existente = await prisma.emisor.findUnique({ where: { organizacionId }, select: { organizacionId: true } });
  if (existente) return { creado: false };
  await prisma.emisor.create({ data: { organizacionId, ...EMISOR_DEMO, esDemo: true, revision: 0, modificadoPor: null } });
  return { creado: true };
}
