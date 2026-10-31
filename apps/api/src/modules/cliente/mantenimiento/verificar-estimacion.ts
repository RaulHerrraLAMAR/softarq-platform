/**
 * `pnpm --filter @softarq/api db:verificar-estimacion -- SOL-2026-00002` (módulo 17, ADR-0021 §3).
 *
 * Solo lectura. Toma de la base la estimación que se envió con la solicitud (la última de su revisión final) y vuelve a pasar sus
 * entradas CONGELADAS (`entrada`: medidas, precios de referencia, consumos y parámetros de ese día) por el mismo motor
 * (`calcularCotizacion`) y la misma proyección comercial que usan la calculadora del equipo y el servicio de estimación.
 *
 * Compara total, importes por partida y avisos con lo guardado. NO consulta el catálogo de hoy: recalcular hoy con otros precios o
 * vigencias puede dar otro importe y eso no es una diferencia del motor. No escribe nada ni cambia fechas, precios ni referencias.
 * Lee DATABASE_URL (rol de la aplicación) del archivo de entorno (SOFTARQ_ENV_FILE o `.env`). No imprime la URL ni secretos.
 */
import { isDeepStrictEqual } from "node:util";
import { existsSync } from "node:fs";
import { leerConfiguracion } from "../../../config/entorno.js";
import { crearPrisma, nombreDeBase } from "../../../infraestructura/prisma/cliente.js";
import { calcularCotizacion } from "../../calculo/domain/motor.js";
import { aVistaComercial } from "../../calculo/domain/vista-comercial.js";

interface Fila {
  numero: number;
  revision_captura: number;
  estado: string;
  entrada: unknown;
  comercial: unknown;
  parametros: unknown;
  referencias: unknown;
  fecha_calculo: Date;
  revision_solicitud: number;
}

async function principal(): Promise<void> {
  const folio = process.argv.slice(2).find((a) => /^SOL-\d{4}-\d{5}$/.test(a));
  if (!folio) throw new Error("Indique el folio de la solicitud, por ejemplo: SOL-2026-00002.");
  const archivo = process.env["SOFTARQ_ENV_FILE"] ?? ".env";
  if (existsSync(archivo)) process.loadEnvFile(archivo);
  const config = leerConfiguracion(process.env);
  const prisma = crearPrisma(config.databaseUrl);
  try {
    const filas = await prisma.$queryRaw<Fila[]>`
      SELECT e.numero, e.revision_captura, e.estado, e.entrada, e.comercial, e.parametros, e.referencias, e.fecha_calculo,
             s.revision AS revision_solicitud
        FROM estimacion_solicitud e JOIN solicitud_cliente s ON s.id = e.solicitud_id
       WHERE s.folio = ${folio}
       ORDER BY e.numero`;
    console.log(`Base: ${nombreDeBase(config.databaseUrl)} · solicitud ${folio} · ${filas.length} estimación(es) guardada(s)`);
    if (filas.length === 0) throw new Error("La solicitud no tiene estimaciones.");
    const ultimaRevision = filas[0]!.revision_solicitud;
    const delEnvio = filas.filter((f) => f.revision_captura === ultimaRevision).at(-1);
    if (!delEnvio) throw new Error(`Ninguna estimación corresponde a la revisión final (${ultimaRevision}) de la solicitud.`);
    console.log(`Estimación revisada: nº ${delEnvio.numero} (revisión ${delEnvio.revision_captura}, estado ${delEnvio.estado}, fecha de cálculo ${delEnvio.fecha_calculo.toISOString().slice(0, 10)})`);
    if (delEnvio.estado !== "ESTIMADA" || delEnvio.entrada === null) {
      console.log("Esa estimación no tiene importe (SIN_ESTIMACION): no hay nada que reproducir.");
      return;
    }

    const r = calcularCotizacion(delEnvio.entrada);
    if (r.estado !== "CALCULADO") {
      console.log(`DIFERENCIA: el motor ya no calcula con la entrada congelada (estado ${r.estado}).`);
      process.exitCode = 2;
      return;
    }
    const nueva = aVistaComercial(r) as unknown;
    const guardada = delEnvio.comercial as { total: string; subtotal: string; partidas: { numero: number; importe: string }[] };
    const repetida = nueva as typeof guardada;
    console.log(`Guardada:  subtotal ${guardada.subtotal} · total ${guardada.total} · ${guardada.partidas.length} partida(s)`);
    console.log(`Reproducida con el motor: subtotal ${repetida.subtotal} · total ${repetida.total} · ${repetida.partidas.length} partida(s)`);
    const igual = isDeepStrictEqual(JSON.parse(JSON.stringify(nueva)), JSON.parse(JSON.stringify(delEnvio.comercial)));
    console.log(`Referencias congeladas: ${JSON.stringify(delEnvio.referencias)}`);
    console.log(igual ? "COINCIDE: la proyección comercial es idéntica (total, partidas e impuesto)." : "DIFERENCIA: la proyección reproducida no coincide con la guardada.");
    process.exitCode = igual ? 0 : 2;
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error al verificar la estimación.");
  process.exitCode = 1;
});
