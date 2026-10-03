import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Lee los colores de tokens.css (fuente única del sistema visual). */
const css = readFileSync(join(import.meta.dirname, "..", "tokens.css"), "utf-8");
const tokens = Object.fromEntries([...css.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
const BLANCO = "#ffffff";

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const t = (n: string): string => {
  const v = tokens[n];
  if (!v) throw new Error(`Falta el token ${n}`);
  return v;
};

// Pares texto/fondo que usa la interfaz (base.css). Encabezado: #ffffff y #e2e8f0 sobre el primario.
const PARES: [string, string, string][] = [
  ["texto sobre fondo", t("color-texto"), t("color-fondo")],
  ["texto sobre tarjeta", t("color-texto"), t("color-tarjeta")],
  ["texto atenuado sobre tarjeta", t("color-texto-atenuado"), t("color-tarjeta")],
  ["texto atenuado sobre fondo", t("color-texto-atenuado"), t("color-fondo")],
  ["secundario sobre tarjeta", t("color-secundario"), t("color-tarjeta")],
  ["secundario sobre superficie", t("color-secundario"), t("color-superficie-suave")],
  ["botón primario", t("color-sobre-accion"), t("color-accion")],
  ["botón primario (hover)", t("color-sobre-accion"), t("color-accion-hover")],
  ["enlace sobre tarjeta", t("color-accion"), t("color-tarjeta")],
  ["enlace sobre fondo", t("color-accion"), t("color-fondo")],
  ["error sobre tarjeta", t("color-error"), t("color-tarjeta")],
  ["error sobre fondo de error", t("color-error"), t("color-error-fondo")],
  ["texto sobre fondo de error", t("color-texto"), t("color-error-fondo")],
  ["texto sobre fondo de aviso", t("color-texto"), t("color-aviso-fondo")],
  ["texto sobre fondo informativo", t("color-texto"), t("color-info-fondo")],
  ["secundario sobre fondo informativo (opción elegida)", t("color-secundario"), t("color-info-fondo")],
  ["insignia DEMO", t("color-demo"), t("color-demo-fondo")],
  ["insignia menor precio", t("color-info"), t("color-info-fondo")],
  ["insignia elegida/calculado", t("color-correcto"), t("color-correcto-fondo")],
  ["encabezado", BLANCO, t("color-primario")],
  ["leyenda del encabezado", "#e2e8f0", t("color-primario")],
  ["atenuado en tarjeta móvil", t("color-texto-atenuado"), t("color-superficie-suave")],
  // Módulo 5: barra de sesión y pantalla de acceso.
  ["detalle de la sesión en el encabezado", t("color-texto-sobre-oscuro"), t("color-primario")],
  ["botón «Cerrar sesión» (hover)", BLANCO, t("color-secundario")],
  ["error en la barra de sesión", t("color-error"), t("color-error-fondo")],
  ["aviso «Sesión cerrada»", t("color-texto"), t("color-correcto-fondo")],
];

describe("contraste del sistema visual (WCAG AA, texto normal)", () => {
  it.each(PARES)("%s ≥ 4.5:1", (_nombre, texto, fondo) => {
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it("los bordes de campos y el foco distinguen el control del fondo (≥ 3:1)", () => {
    expect(contraste(t("color-borde-fuerte"), t("color-tarjeta"))).toBeGreaterThanOrEqual(3);
    expect(contraste(t("color-foco"), t("color-tarjeta"))).toBeGreaterThanOrEqual(3);
    expect(contraste(t("color-foco"), t("color-fondo"))).toBeGreaterThanOrEqual(3);
    // Foco y borde del botón sobre el encabezado oscuro.
    expect(contraste(t("color-foco-sobre-oscuro"), t("color-primario"))).toBeGreaterThanOrEqual(3);
    expect(contraste(t("color-texto-sobre-oscuro"), t("color-primario"))).toBeGreaterThanOrEqual(3);
  });
});
