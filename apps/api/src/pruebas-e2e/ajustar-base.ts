/**
 * Ajustes reversibles de softarq_test para las pruebas de navegador (bloqueos reales):
 *
 *   node dist-e2e/pruebas-e2e/ajustar-base.js proveedor <codigo> activo|inactivo
 *   node dist-e2e/pruebas-e2e/ajustar-base.js concepto <codigo> aprobado|borrador
 *   node dist-e2e/pruebas-e2e/ajustar-base.js parametros sin-impuesto|demo
 *   node dist-e2e/pruebas-e2e/ajustar-base.js sesiones revocar <correo>
 *
 * `sesiones revocar` simula que la sesión terminó en el servidor (revocación con UPDATE, lo único
 * que el rol de la aplicación puede modificar en `sesion`).
 *
 * Exige softarq_test local (mismo guardia que las pruebas de integración) y usa el rol de la
 * aplicación, que no tiene DELETE ni DDL.
 */
import { PARAMETROS_DEMO, ORGANIZACION_DEMO } from "../modules/catalogos/demo/datos-demo.js";
import { RepositorioCatalogos } from "../modules/catalogos/persistencia/repositorio-catalogos.js";
import { cargarEntornoDePrueba, confirmarBase, prismaApp, urlDePrueba } from "../pruebas-integracion/entorno.js";

async function principal(args: string[]): Promise<void> {
  cargarEntornoDePrueba();
  urlDePrueba("DATABASE_URL");
  const prisma = prismaApp();
  try {
    await confirmarBase(prisma);
    const org = await prisma.organizacion.findUnique({ where: { codigo: ORGANIZACION_DEMO.codigo } });
    if (!org) throw new Error("La organización DEMO no existe en softarq_test.");
    const ctx = { organizacionId: org.id };
    const repo = new RepositorioCatalogos(prisma);
    const [que, a, b] = args;
    if (que === "proveedor" && a && (b === "activo" || b === "inactivo")) {
      await repo.cambiarActivoProveedor(ctx, a, b === "activo");
    } else if (que === "concepto" && a && (b === "aprobado" || b === "borrador")) {
      await repo.cambiarEstadoConcepto(ctx, a, b === "aprobado" ? "Aprobado" : "Borrador");
    } else if (que === "parametros" && a === "sin-impuesto") {
      await repo.actualizarParametros(ctx, {
        ...PARAMETROS_DEMO,
        impuestoTasa: null,
        impuestoBase: null,
        impuestoTratamiento: null,
        impuestoNombre: null,
      });
    } else if (que === "parametros" && a === "demo") {
      await repo.actualizarParametros(ctx, { ...PARAMETROS_DEMO });
    } else if (que === "sesiones" && a === "revocar" && b) {
      const r = await prisma.sesion.updateMany({
        where: { revocadaEn: null, membresia: { is: { usuario: { correo: b } } } },
        data: { revocadaEn: new Date(), motivoRevocacion: "RESTABLECIMIENTO" },
      });
      console.log(`[e2e] sesiones revocadas: ${r.count}`);
    } else {
      throw new Error(
        "Uso: ajustar-base proveedor <codigo> activo|inactivo | concepto <codigo> aprobado|borrador | parametros sin-impuesto|demo | sesiones revocar <correo>",
      );
    }
    console.log(`[e2e] softarq_test: ${args.join(" ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

principal(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
