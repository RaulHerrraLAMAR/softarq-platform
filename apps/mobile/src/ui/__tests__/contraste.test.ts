/**
 * Contraste WCAG 2.x de la paleta «Obra cálida» (ADR-0022): texto ≥ 4.5:1 y elementos de interfaz ≥ 3:1, en claro y
 * oscuro. Se comprueba cada par de colores que la app usa de verdad.
 */
import { describe, expect, it } from "vitest";
import { CLARO, OSCURO, type Paleta } from "../paletas";

function canal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

type Par = [string, (t: Paleta) => string, (t: Paleta) => string];

/** Texto sobre su fondo: mínimo 4.5:1. */
const TEXTO: Par[] = [
  ["tinta sobre cal", (t) => t.tinta, (t) => t.fondo],
  ["tinta sobre papel", (t) => t.tinta, (t) => t.papel],
  ["tinta sobre hundido", (t) => t.tinta, (t) => t.hundido],
  ["suave sobre cal", (t) => t.suave, (t) => t.fondo],
  ["suave sobre papel", (t) => t.suave, (t) => t.papel],
  ["suave sobre hundido", (t) => t.suave, (t) => t.hundido],
  ["suave sobre petróleo tinte (descripción de la tarjeta elegida)", (t) => t.suave, (t) => t.petroleoTinte],
  ["enlace sobre cal", (t) => t.enlace, (t) => t.fondo],
  ["enlace sobre papel", (t) => t.enlace, (t) => t.papel],
  ["texto del botón principal", (t) => t.sobreTerracota, (t) => t.terracota],
  ["texto sobre el encabezado petróleo", (t) => t.sobrePetroleo, (t) => t.petroleoFondo],
  ["petróleo (rótulos) sobre papel", (t) => t.petroleo, (t) => t.papel],
  ["petróleo sobre petróleo tinte (aviso informativo)", (t) => t.petroleo, (t) => t.petroleoTinte],
  ["tinta sobre petróleo tinte (tarjeta elegida)", (t) => t.tinta, (t) => t.petroleoTinte],
  ["tinta sobre verde tinte (atención)", (t) => t.tinta, (t) => t.verdeTinte],
  ["rojo sobre rojo tinte (error en el campo)", (t) => t.rojo, (t) => t.rojoTinte],
  ["rojo sobre papel (mensaje de error)", (t) => t.rojo, (t) => t.papel],
  ["rojo sobre cal (mensaje de error)", (t) => t.rojo, (t) => t.fondo],
  ["tinta sobre ocre tinte (aviso)", (t) => t.tinta, (t) => t.ocreTinte],
];

/** Elementos de interfaz (bordes, indicadores, iconos): mínimo 3:1 contra lo que tienen detrás. */
const INTERFAZ: Par[] = [
  ["terracota (acción) sobre cal", (t) => t.terracota, (t) => t.fondo],
  ["petróleo (selección, foco) sobre cal", (t) => t.petroleo, (t) => t.fondo],
  ["petróleo (selección) sobre petróleo tinte", (t) => t.petroleo, (t) => t.petroleoTinte],
  ["rojo (campo inválido) sobre cal", (t) => t.rojo, (t) => t.fondo],
  ["verde (correcto) sobre cal", (t) => t.verde, (t) => t.fondo],
  ["espesor (cota) sobre cal", (t) => t.espesor, (t) => t.fondo],
  ["verde (indicador) sobre verde tinte", (t) => t.verde, (t) => t.verdeTinte],
  ["terracota (marca de la medida) sobre cal", (t) => t.terracota, (t) => t.fondo],
  ["terracota (marca de la medida) sobre papel", (t) => t.terracota, (t) => t.papel],
  ["espesor (marca de la medida) sobre papel", (t) => t.espesor, (t) => t.papel],
  ["terracota (cota) sobre papel", (t) => t.terracota, (t) => t.papel],
  ["petróleo (cota) sobre papel", (t) => t.petroleo, (t) => t.papel],
];

describe.each([
  ["claro", CLARO],
  ["oscuro", OSCURO],
])("contraste en el tema %s", (_nombre, t) => {
  it.each(TEXTO)("texto: %s ≥ 4.5:1", (_n, fg, bg) => {
    expect(contraste(fg(t), bg(t))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(INTERFAZ)("interfaz: %s ≥ 3:1", (_n, fg, bg) => {
    expect(contraste(fg(t), bg(t))).toBeGreaterThanOrEqual(3);
  });
});

describe("la calculadora de contraste", () => {
  it("coincide con valores conocidos", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contraste("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });
});
