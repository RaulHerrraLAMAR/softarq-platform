import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sin tipos (script de comprobación)
import { buscarProhibidos } from "../bundle-prohibidos.mjs";

const hay = (texto: string) => buscarProhibidos(texto).map((h: { grupo: string }) => h.grupo);

describe("detector de contenido prohibido en el bundle", () => {
  it("un texto limpio no tiene hallazgos", () => {
    expect(hay('fetch("/api/v1/clientes",{headers:{Authorization:"Bearer "+token}})')).toEqual([]);
  });
  it("detecta código y configuración del servidor", () => {
    expect(hay("require('@prisma/client')")).toContain("servidor");
    expect(hay("const url='postgresql://softarq_app:x@localhost:5432/softarq_dev'")).toContain("servidor");
    expect(hay("DATABASE_URL")).toContain("servidor");
    expect(hay("import Decimal from 'decimal.js'")).toContain("motor");
  });
  it("detecta rutas de la laptop, tokens y la cookie web", () => {
    expect(hay("C:\\\\Proyecto_SoftArq\\\\Proyecto_SoftArq\\\\softarq-platform")).toContain("rutas");
    expect(hay("/Users/raul/proyecto")).toContain("rutas");
    expect(hay(`Authorization:"Bearer ${"A".repeat(43)}"`)).toContain("secretos");
    expect(hay('name:"softarq_sesion"')).toContain("web");
  });
  it("detecta contratos internos de costos y márgenes", () => {
    expect(hay('costoProrrateado:z.string(),recargoSobreCosto:z.string()')).toContain("interno");
  });
  it("detecta contratos del equipo y la administración", () => {
    expect(hay("contrasenaTemporal:z.string().nullable(),temporalExpiraEn:z.string()")).toContain("equipo");
    expect(hay("designadaEn:z.string(),motivo:z.string()")).toContain("equipo");
  });
  it("detecta claves de los esquemas internos de cálculo, catálogo y precios", () => {
    for (const clave of ["proveedor", "proveedorCodigo", "insumoCodigo", "precioCodigo", "conceptoCodigo", "consolidarCompras", "registroVigente"]) {
      expect(hay(`{${clave}:z.string()}`), clave).toContain("esquemas-internos");
    }
  });
  it("no confunde una palabra común con una clave interna", () => {
    expect(hay("elegir un proveedores o presupuestos")).toEqual([]);
  });
});
