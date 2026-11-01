/**
 * Exportación CSV UTF-8 de tablas para migración (RF-26, Word v1.3 §1.3 y §5.8; ADR-0023).
 *
 * Es una salida de DATOS MAESTROS para migrar o respaldar a mano; no es un informe (las compras y el detalle son las salidas
 * internas del módulo 14) ni sustituye al respaldo (ADR-0012). Reglas:
 *
 * - **Tablas y campos explícitos:** solo los de esta lista. Nada que no esté aquí se exporta (ni versiones, emisiones, PDF,
 *   bitácora, idempotencia, sesiones, tokens, contraseñas, hashes ni credenciales temporales).
 * - **Permiso por tabla** con las capacidades que ya existen, sin ampliar ninguna función: maestros comerciales y personas →
 *   `personas.administrar` (Administrador del sistema); catálogos con precios y tarifas internos → `catalogos.administrar`
 *   (Administrador del catálogo, que ya los ve en su pantalla).
 * - **Aislamiento:** toda consulta filtra por la organización de la sesión (nunca por un parámetro del cliente).
 * - **Formato:** RFC 4180 (comas, comillas dobles, CRLF) con BOM UTF-8 para Excel; fechas ISO 8601 en UTC; importes como texto
 *   decimal exacto. Defensa contra inyección de fórmulas: una celda de texto que empieza por `= + - @`, tabulador o retorno de
 *   carro se antepone con un apóstrofo.
 */
import type { Capacidad } from "@softarq/contracts";
import type { PrismaClient } from "../../generated/prisma/client.js";

export const TABLAS_EXPORTABLES = ["clientes", "proyectos", "cotizaciones", "personas", "proveedores", "productos", "precios", "insumos", "tarifas"] as const;
export type TablaExportable = (typeof TABLAS_EXPORTABLES)[number];

interface Definicion {
  readonly descripcion: string;
  readonly capacidad: Capacidad;
  readonly columnas: readonly string[];
}

export const DEFINICIONES: Record<TablaExportable, Definicion> = {
  clientes: { descripcion: "Clientes con su clasificación (presentación, QA o humo)", capacidad: "personas.administrar", columnas: ["codigo", "nombre", "contacto_nombre", "contacto_telefono", "contacto_correo", "activo", "clasificacion", "creado_en", "modificado_en"] },
  proyectos: { descripcion: "Proyectos de los clientes", capacidad: "personas.administrar", columnas: ["codigo", "cliente_codigo", "nombre", "municipio", "entidad_federativa", "descripcion", "activo", "creado_en", "modificado_en"] },
  cotizaciones: { descripcion: "Cotizaciones (encabezado y estado del folio; sin versiones ni documentos)", capacidad: "personas.administrar", columnas: ["folio", "cliente_codigo", "proyecto_codigo", "origen", "estado_folio", "ultima_version", "solicitud_folio", "creado_en"] },
  personas: { descripcion: "Personas del equipo y sus funciones (sin contraseñas, hashes, sesiones ni tokens)", capacidad: "personas.administrar", columnas: ["correo", "nombre", "funciones", "activa", "es_demo", "creada_en"] },
  proveedores: { descripcion: "Proveedores", capacidad: "catalogos.administrar", columnas: ["codigo", "nombre", "contacto", "telefono", "correo", "activo", "creado_en", "modificado_en"] },
  productos: { descripcion: "Productos y sus presentaciones", capacidad: "catalogos.administrar", columnas: ["codigo", "insumo_codigo", "descripcion", "presentacion", "unidad_compra", "contenido", "fraccionable", "incremento_minimo", "activo", "creado_en", "modificado_en"] },
  precios: { descripcion: "Precios de proveedor con su vigencia (importes internos)", capacidad: "catalogos.administrar", columnas: ["codigo", "producto_codigo", "proveedor_codigo", "precio_unitario", "vigente_desde", "vigente_hasta", "anulado", "motivo_anulacion", "fuente", "registrado_en"] },
  insumos: { descripcion: "Insumos", capacidad: "catalogos.administrar", columnas: ["codigo", "descripcion", "unidad_base", "especificacion", "activo", "creado_en", "modificado_en"] },
  tarifas: { descripcion: "Tarifas de mano de obra (importes internos)", capacidad: "catalogos.administrar", columnas: ["codigo", "modalidad", "descripcion", "unidad", "importe", "rendimiento_jornada", "vigente_desde", "vigente_hasta", "activa", "fuente"] },
};

export const esTablaExportable = (t: string): t is TablaExportable => (TABLAS_EXPORTABLES as readonly string[]).includes(t);

/** Texto de una celda: fechas ISO en UTC, listas con «|», decimales exactos y defensa contra fórmulas. */
export function celda(v: unknown): string {
  if (v === null || v === undefined) return "";
  let t: string;
  if (v instanceof Date) t = Number.isNaN(v.getTime()) ? "" : /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(v.toISOString()) ? v.toISOString().slice(0, 10) : v.toISOString();
  else if (Array.isArray(v)) t = v.map(String).join("|");
  else if (typeof v === "boolean") t = v ? "true" : "false";
  else t = String(v);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** CSV completo con BOM UTF-8 y CRLF. */
export function aCsv(columnas: readonly string[], filas: readonly Record<string, unknown>[]): string {
  const lineas = [columnas.join(","), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(","))];
  return `﻿${lineas.join("\r\n")}\r\n`;
}

type Fila = Record<string, unknown>;

export class ServicioExportaciones {
  constructor(private readonly db: PrismaClient) {}

  /** Tablas que una sesión puede exportar según sus capacidades. */
  disponibles(capacidades: readonly Capacidad[]): { tabla: TablaExportable; descripcion: string; columnas: readonly string[] }[] {
    return TABLAS_EXPORTABLES.filter((t) => capacidades.includes(DEFINICIONES[t].capacidad)).map((t) => ({ tabla: t, descripcion: DEFINICIONES[t].descripcion, columnas: DEFINICIONES[t].columnas }));
  }

  async filas(org: string, tabla: TablaExportable): Promise<Fila[]> {
    switch (tabla) {
      case "clientes":
        return this.db.$queryRaw<Fila[]>`
          SELECT c.codigo, c.nombre, c.contacto_nombre, c.contacto_telefono, c.contacto_correo, c.activo, k.categoria AS clasificacion, c.creado_en, c.modificado_en
            FROM cliente c LEFT JOIN clasificacion_cliente k ON k.organizacion_id = c.organizacion_id AND k.cliente_id = c.id
           WHERE c.organizacion_id = ${org}::uuid ORDER BY c.codigo`;
      case "proyectos":
        return this.db.$queryRaw<Fila[]>`
          SELECT p.codigo, c.codigo AS cliente_codigo, p.nombre, p.municipio, p.entidad_federativa, p.descripcion, p.activo, p.creado_en, p.modificado_en
            FROM proyecto p JOIN cliente c ON c.organizacion_id = p.organizacion_id AND c.id = p.cliente_id
           WHERE p.organizacion_id = ${org}::uuid ORDER BY p.codigo`;
      case "cotizaciones":
        return this.db.$queryRaw<Fila[]>`
          SELECT q.folio, c.codigo AS cliente_codigo, p.codigo AS proyecto_codigo, q.origen, q.estado_folio, q.ultima_version, s.folio AS solicitud_folio, q.creado_en
            FROM cotizacion q
            JOIN cliente c ON c.organizacion_id = q.organizacion_id AND c.id = q.cliente_id
            JOIN proyecto p ON p.organizacion_id = q.organizacion_id AND p.id = q.proyecto_id
            LEFT JOIN solicitud_cliente s ON s.organizacion_id = q.organizacion_id AND s.id = q.solicitud_id
           WHERE q.organizacion_id = ${org}::uuid ORDER BY q.folio`;
      case "personas":
        return this.db.$queryRaw<Fila[]>`
          SELECT u.correo, u.nombre, m.funciones, m.activa, u.es_demo, m.creada_en
            FROM membresia m JOIN usuario u ON u.id = m.usuario_id
           WHERE m.organizacion_id = ${org}::uuid ORDER BY u.correo`;
      case "proveedores":
        return this.db.$queryRaw<Fila[]>`
          SELECT codigo, nombre, contacto, telefono, correo, activo, creado_en, modificado_en FROM proveedor WHERE organizacion_id = ${org}::uuid ORDER BY codigo`;
      case "productos":
        return this.db.$queryRaw<Fila[]>`
          SELECT d.codigo, i.codigo AS insumo_codigo, d.descripcion, d.presentacion, d.unidad_compra, d.contenido::text AS contenido, d.fraccionable, d.incremento_minimo::text AS incremento_minimo, d.activo, d.creado_en, d.modificado_en
            FROM producto d JOIN insumo i ON i.organizacion_id = d.organizacion_id AND i.id = d.insumo_id
           WHERE d.organizacion_id = ${org}::uuid ORDER BY d.codigo`;
      case "precios":
        return this.db.$queryRaw<Fila[]>`
          SELECT r.codigo, d.codigo AS producto_codigo, v.codigo AS proveedor_codigo, r.precio_unitario::text AS precio_unitario, r.vigente_desde, r.vigente_hasta, r.anulado, r.motivo_anulacion, r.fuente, r.registrado_en
            FROM precio r
            JOIN producto d ON d.organizacion_id = r.organizacion_id AND d.id = r.producto_id
            JOIN proveedor v ON v.organizacion_id = r.organizacion_id AND v.id = r.proveedor_id
           WHERE r.organizacion_id = ${org}::uuid ORDER BY r.codigo`;
      case "insumos":
        return this.db.$queryRaw<Fila[]>`
          SELECT codigo, descripcion, unidad_base, especificacion, activo, creado_en, modificado_en FROM insumo WHERE organizacion_id = ${org}::uuid ORDER BY codigo`;
      case "tarifas":
        return this.db.$queryRaw<Fila[]>`
          SELECT codigo, modalidad, descripcion, unidad, importe::text AS importe, rendimiento_jornada::text AS rendimiento_jornada, vigente_desde, vigente_hasta, activa, fuente
            FROM tarifa_mano_obra WHERE organizacion_id = ${org}::uuid ORDER BY codigo`;
    }
  }

  async csv(org: string, tabla: TablaExportable): Promise<{ nombre: string; contenido: string; filas: number }> {
    const filas = await this.filas(org, tabla);
    return { nombre: `softarq-${tabla}.csv`, contenido: aCsv(DEFINICIONES[tabla].columnas, filas), filas: filas.length };
  }
}
