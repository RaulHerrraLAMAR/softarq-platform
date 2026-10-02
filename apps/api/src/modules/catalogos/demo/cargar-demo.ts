/**
 * Carga repetible e idempotente del catálogo DEMO (ADR-0004).
 *
 * - Una sola transacción: o se carga todo o nada.
 * - Por (organización, código): si el registro existe se conserva TAL CUAL (no se sobrescriben
 *   cambios del usuario) y, si no existe, se crea. Nunca se borra nada; el rol de la aplicación
 *   ni siquiera tiene permiso DELETE.
 * - Ejecutarla dos veces no duplica registros.
 * - Informa (sin corregir) los registros DEMO existentes cuyo valor difiera del esperado.
 */
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { RepositorioCatalogos, type ContextoOrganizacion } from "../persistencia/repositorio-catalogos.js";
import {
  COMPONENTES_DEMO,
  CONCEPTOS_DEMO,
  CONVERSIONES_DEMO,
  INSUMOS_DEMO,
  ORGANIZACION_DEMO,
  PARAMETROS_DEMO,
  PRECIOS_DEMO,
  PRODUCTOS_DEMO,
  PROVEEDORES_DEMO,
  TARIFAS_DEMO,
  TIPOS_ADICIONAL_DEMO,
} from "./datos-demo.js";

export interface ResumenCarga {
  organizacionId: string;
  creados: Record<string, number>;
  existentes: Record<string, number>;
  diferencias: string[];
}

/**
 * @param organizacion organización DEMO destino (por omisión `DEMO`). Las pruebas HTTP usan otra
 *   organización DEMO para no alterar los datos que verifican otras pruebas.
 */
export async function cargarDemo(
  prisma: PrismaClient,
  organizacion: { codigo: string; nombre: string } = ORGANIZACION_DEMO,
): Promise<ResumenCarga> {
  return prisma.$transaction(async (tx) => {
    const repo = new RepositorioCatalogos(tx);
    const creados: Record<string, number> = {};
    const existentes: Record<string, number> = {};
    const anotar = (tabla: string, creado: boolean) => {
      const destino = creado ? creados : existentes;
      destino[tabla] = (destino[tabla] ?? 0) + 1;
    };

    const org = await repo.asegurarOrganizacion(organizacion.codigo, organizacion.nombre, true);
    anotar("organizacion", org.creado);
    const ctx: ContextoOrganizacion = { organizacionId: org.id };

    anotar("parametros", (await repo.asegurarParametros(ctx, { ...PARAMETROS_DEMO })).creado);
    for (const d of INSUMOS_DEMO) anotar("insumo", (await repo.asegurarInsumo(ctx, d)).creado);
    for (const d of CONVERSIONES_DEMO) anotar("conversion", (await repo.asegurarConversion(ctx, d)).creado);
    for (const d of PROVEEDORES_DEMO) anotar("proveedor", (await repo.asegurarProveedor(ctx, d)).creado);
    for (const d of PRODUCTOS_DEMO) anotar("producto", (await repo.asegurarProducto(ctx, d)).creado);
    for (const d of PRECIOS_DEMO) anotar("precio", (await repo.asegurarPrecio(ctx, d)).creado);
    for (const d of TARIFAS_DEMO) anotar("tarifa", (await repo.asegurarTarifa(ctx, d)).creado);
    for (const d of CONCEPTOS_DEMO) anotar("concepto", (await repo.asegurarConcepto(ctx, d)).creado);
    for (const d of COMPONENTES_DEMO) anotar("componente", (await repo.asegurarComponente(ctx, d)).creado);
    for (const d of TIPOS_ADICIONAL_DEMO) anotar("tipoAdicional", (await repo.asegurarTipoAdicional(ctx, d)).creado);

    return { organizacionId: org.id, creados, existentes, diferencias: await diferenciasDemo(repo, ctx) };
  });
}

/** Compara los valores que alimentan el cálculo con los esperados del catálogo DEMO. */
async function diferenciasDemo(repo: RepositorioCatalogos, ctx: ContextoOrganizacion): Promise<string[]> {
  const dif: string[] = [];
  const precios = await repo.obtenerPrecios(ctx, PRECIOS_DEMO.map((p) => p.codigo));
  for (const e of PRECIOS_DEMO) {
    const r = precios.find((p) => p.codigo === e.codigo);
    if (!r) continue;
    const esperado = [e.precioUnitario, e.vigenteDesde, e.vigenteHasta, e.producto, e.proveedor].join("|");
    const real = [r.precioUnitario, r.vigenteDesde, r.vigenteHasta, r.producto.codigo, r.proveedor.codigo].join("|");
    if (esperado !== real) dif.push(`precio ${e.codigo}: esperado ${esperado}, guardado ${real}`);
  }
  const conceptos = await repo.obtenerConceptos(ctx, CONCEPTOS_DEMO.map((c) => c.codigo));
  for (const e of COMPONENTES_DEMO) {
    const r = conceptos.find((c) => c.codigo === e.concepto)?.componentes.find((k) => k.codigo === e.codigo);
    if (!r) continue;
    const esperado = [e.orden, e.insumo, e.rendimiento, e.unidadRendimiento, e.desperdicio, e.factorTraslape].join("|");
    const real = [r.orden, r.insumoCodigo, r.rendimiento, r.unidadRendimiento, r.desperdicio, r.factorTraslape].join("|");
    if (esperado !== real) dif.push(`componente ${e.codigo}: esperado ${esperado}, guardado ${real}`);
  }
  const p = await repo.obtenerParametros(ctx);
  if (p) {
    const esperado = [PARAMETROS_DEMO.recargoSobreCosto, PARAMETROS_DEMO.impuestoTasa, PARAMETROS_DEMO.impuestoBase].join("|");
    const real = [p.recargoSobreCosto, p.impuesto?.tasa ?? null, p.impuesto?.base ?? null].join("|");
    if (esperado !== real) dif.push(`parámetros: esperado ${esperado}, guardado ${real}`);
  }
  return dif;
}
