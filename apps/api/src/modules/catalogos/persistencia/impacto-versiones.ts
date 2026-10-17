/**
 * Impacto de un cambio de catálogo o de parámetros sobre las cotizaciones ABIERTAS (ADR-0017 §1.3).
 *
 * Solo lee: no cambia estados, importes ni aprobaciones. El servidor sigue revalidando al enviar,
 * aprobar y emitir (BL-04, BL-08, BL-16…), aunque la pantalla haya mostrado este aviso antes.
 *
 * Criterios, por cotización `ACTIVO` de la organización de la sesión:
 * - `borradores`: su borrador guardado usa el registro (concepto en una partida o precio elegido);
 * - de su ÚLTIMA versión calculada, si usa el registro (según su instantánea `entrada_calculo`) y no
 *   está emitida (las emitidas son inmutables y no se cuentan):
 *   - `sinEnviar`: sin revisión, o la última fue devuelta (CAMBIOS_SOLICITADOS) o retirada: hay que
 *     recalcular antes de enviarla;
 *   - `enRevision`: revisión PENDIENTE: el Revisor verá el bloqueo; hay que retirarla y recalcular;
 *   - `aprobadasSinEmitir`: aprobada y sin emitir: la emisión queda bloqueada (BL-16) hasta anular la
 *     aprobación y calcular una versión nueva.
 * - `cotizaciones`: cotizaciones DISTINTAS en cualquiera de los casos anteriores. Una cotización
 *   aporta como mucho una versión (la última); puede contar a la vez en `borradores` y en una de las
 *   categorías de versión, por eso las sumas no equivalen a `cotizaciones`.
 */
import type { ImpactoVersiones } from "@softarq/contracts";
import type { ContextoOrganizacion, Db } from "./repositorio-catalogos.js";

export interface CriterioImpacto {
  /** Conceptos usados por el borrador (partidas) o por la versión. */
  conceptos?: readonly string[];
  /** Conceptos que solo cuentan en los borradores (p. ej. los que usan una tarifa o un insumo: la versión se mide por su instantánea). */
  conceptosBorrador?: readonly string[];
  /** Precios elegidos en el borrador o en la versión. */
  precios?: readonly string[];
  /** Tarifas congeladas en la versión. */
  tarifas?: readonly string[];
  /** Insumos de la instantánea de la versión (componentes, conversiones, precios). */
  insumos?: readonly string[];
  /** Parámetros de venta: afectan a todas las cotizaciones abiertas. */
  todas?: boolean;
}

export const SIN_IMPACTO_VERSIONES: ImpactoVersiones = { cotizaciones: 0, borradores: 0, sinEnviar: 0, enRevision: 0, aprobadasSinEmitir: 0 };

export async function impactoVersiones(db: Db, ctx: ContextoOrganizacion, c: CriterioImpacto): Promise<ImpactoVersiones> {
  const conceptos = [...(c.conceptos ?? [])];
  const conceptosBorrador = [...conceptos, ...(c.conceptosBorrador ?? [])];
  const precios = [...(c.precios ?? [])];
  const tarifas = [...(c.tarifas ?? [])];
  const insumos = [...(c.insumos ?? [])];
  const todas = c.todas === true;
  if (!todas && conceptosBorrador.length + precios.length + tarifas.length + insumos.length === 0) return { ...SIN_IMPACTO_VERSIONES };
  const filas = await db.$queryRaw<{ cotizaciones: number; borradores: number; sin_enviar: number; en_revision: number; aprobadas_sin_emitir: number }[]>`
    WITH abiertas AS (
      SELECT c.id, c.ultima_version,
             (${todas}
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(b.captura->'partidas', '[]'::jsonb)) e
                          WHERE e->>'tipo' = 'CONCEPTO' AND e->>'conceptoCodigo' = ANY(${conceptosBorrador}::text[]))
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(b.captura->'seleccion', '[]'::jsonb)) e
                          WHERE e->>'precioCodigo' = ANY(${precios}::text[]))) AS borrador_usa
        FROM cotizacion c
        JOIN cotizacion_borrador b ON b.organizacion_id = c.organizacion_id AND b.cotizacion_id = c.id
       WHERE c.organizacion_id = ${ctx.organizacionId}::uuid AND c.estado_folio = 'ACTIVO'
    ),
    ultimas AS (
      SELECT a.id AS cotizacion_id, v.id AS version_id,
             (${todas}
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v.entrada_calculo->'partidas', '[]'::jsonb)) e
                          WHERE e->'concepto'->>'id' = ANY(${conceptos}::text[]) OR e->'tarifaManoObra'->>'id' = ANY(${tarifas}::text[]))
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v.entrada_calculo->'selecciones', '[]'::jsonb)) e
                          WHERE e->>'precioId' = ANY(${precios}::text[]))
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v.entrada_calculo->'insumos', '[]'::jsonb)) e
                          WHERE e->>'id' = ANY(${insumos}::text[]))) AS version_usa,
             EXISTS (SELECT 1 FROM emision m WHERE m.organizacion_id = v.organizacion_id AND m.version_id = v.id) AS emitida,
             (SELECT r.estado FROM revision r WHERE r.organizacion_id = v.organizacion_id AND r.version_id = v.id
               ORDER BY r.enviado_en DESC, r.id DESC LIMIT 1) AS ultima_revision
        FROM abiertas a
        JOIN cotizacion_version v ON v.organizacion_id = ${ctx.organizacionId}::uuid AND v.cotizacion_id = a.id AND v.numero = a.ultima_version
    ),
    clasificadas AS (
      SELECT cotizacion_id,
             CASE WHEN NOT version_usa OR emitida THEN NULL
                  WHEN ultima_revision = 'PENDIENTE' THEN 'EN_REVISION'
                  WHEN ultima_revision = 'APROBADA' THEN 'APROBADA'
                  ELSE 'SIN_ENVIAR' END AS categoria
        FROM ultimas
    )
    SELECT
      (SELECT count(*) FROM abiertas a
        WHERE a.borrador_usa OR EXISTS (SELECT 1 FROM clasificadas k WHERE k.cotizacion_id = a.id AND k.categoria IS NOT NULL))::int AS cotizaciones,
      (SELECT count(*) FROM abiertas WHERE borrador_usa)::int AS borradores,
      (SELECT count(*) FROM clasificadas WHERE categoria = 'SIN_ENVIAR')::int AS sin_enviar,
      (SELECT count(*) FROM clasificadas WHERE categoria = 'EN_REVISION')::int AS en_revision,
      (SELECT count(*) FROM clasificadas WHERE categoria = 'APROBADA')::int AS aprobadas_sin_emitir`;
  const f = filas[0]!;
  return { cotizaciones: f.cotizaciones, borradores: f.borradores, sinEnviar: f.sin_enviar, enRevision: f.en_revision, aprobadasSinEmitir: f.aprobadas_sin_emitir };
}
