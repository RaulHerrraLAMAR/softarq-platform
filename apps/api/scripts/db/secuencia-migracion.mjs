/**
 * Migrar `softarq_dev` solo después de un respaldo VERIFICADO (ADR-0017 §1).
 *
 * Orden obligatorio: crear respaldo → verificar manifiesto, archivos y hashes → migrar. Si la creación
 * no termina COMPLETA o la verificación falla, lanza y NO invoca la migración. No hay opción para
 * saltarse el respaldo. Las dependencias se inyectan para poder probar la secuencia sin base de datos.
 *
 * Límite: protege `db:migrar` en desarrollo. No impide un `prisma migrate deploy` ni SQL administrativo
 * manuales. `softarq_test` se prepara aparte (vaciado + migraciones) y la prueba de restauración usa
 * su propio procedimiento aislado.
 */

export class ErrorMigracionProtegida extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorMigracionProtegida";
  }
}

/**
 * @param {{
 *   crear: () => Promise<{ ruta: string; estado: string; problemas?: unknown[] }>;
 *   verificar: (carpeta: string) => Promise<unknown>;
 *   migrar: () => void | Promise<void>;
 *   registrar?: (texto: string) => void;
 * }} d
 * @returns {Promise<{ respaldo: string }>}
 */
export async function migrarConRespaldo(d) {
  const registrar = d.registrar ?? (() => {});
  let creado;
  try {
    creado = await d.crear();
  } catch (e) {
    throw new ErrorMigracionProtegida(`No se creó el respaldo previo; no se migra. ${e instanceof Error ? e.message : e}`);
  }
  if (!creado || creado.estado !== "COMPLETO" || !creado.ruta) {
    throw new ErrorMigracionProtegida(`El respaldo previo quedó ${creado?.estado ?? "sin resultado"} (${creado?.ruta ?? "sin carpeta"}); no se migra.`);
  }
  registrar(`Respaldo previo creado: ${creado.ruta}`);
  try {
    await d.verificar(creado.ruta);
  } catch (e) {
    throw new ErrorMigracionProtegida(`La verificación del respaldo previo falló; no se migra. ${e instanceof Error ? e.message : e}`);
  }
  registrar("Respaldo previo verificado (manifiesto, base.dump y documentos con sus hashes).");
  await d.migrar();
  return { respaldo: creado.ruta };
}
