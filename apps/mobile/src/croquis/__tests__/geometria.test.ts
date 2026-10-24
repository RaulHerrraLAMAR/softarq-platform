import { describe, expect, it } from "vitest";
import { leerMedida, type EstadoMedida } from "../../captura/modelo";
import { calcularCroquis, escenaInicio, ilustracion, MAX_LINEAS_DETALLE, VISTA_CROQUIS, type EntradaCroquis, type MedidaDeCroquis, type Punto, type TipoTrabajo } from "../geometria";

const medida = (texto: string): MedidaDeCroquis => {
  const l = leerMedida(texto);
  return { valor: l.valor === null ? null : Number(l.valor), estado: l.estado };
};

const PIDE: Record<TipoTrabajo, EntradaCroquis["pide"]> = { cubierta: ["largo", "ancho"], losa: ["largo", "ancho", "alto"], muro: ["largo", "alto"] };

const entrada = (tipo: TipoTrabajo, largo: string, ancho: string, alto: string): EntradaCroquis => ({
  tipo,
  pide: PIDE[tipo],
  largo: medida(largo),
  ancho: medida(ancho),
  alto: medida(alto),
  etiquetaAlto: tipo === "losa" ? "Espesor" : "Alto",
});

const puntosDe = (c: ReturnType<typeof calcularCroquis>): Punto[] => [
  ...c.sombra,
  ...c.piezas.flatMap((p) => [...p.caja.sup, ...p.caja.izq, ...p.caja.der, ...p.detalle.flat()]),
  ...c.cotas.flatMap((k) => [k.a, k.b, k.centro]),
];

/** Tope de elementos del dibujo: 1 sombra + 3 caras + líneas de detalle + 4 por cota (línea, dos puntos y rótulo). */
const TOPE_ELEMENTOS = 1 + 3 + MAX_LINEAS_DETALLE + 3 * 4;

describe("croquis: tope de elementos independiente de las medidas", () => {
  const extremas = ["0.01", "0.5", "1", "5", "12.4", "100", "499.99", "500"];
  for (const tipo of ["cubierta", "losa", "muro"] as const) {
    it(`${tipo}: con cualquier medida el dibujo tiene un número acotado de elementos y todos sus puntos son finitos`, () => {
      let maximo = 0;
      for (const a of extremas)
        for (const b of extremas)
          for (const c of extremas) {
            const croquis = calcularCroquis(entrada(tipo, a, b, c));
            maximo = Math.max(maximo, croquis.elementos);
            expect(croquis.elementos, `${a}/${b}/${c}`).toBeLessThanOrEqual(TOPE_ELEMENTOS);
            for (const [x, y] of puntosDe(croquis)) {
              expect(Number.isFinite(x) && Number.isFinite(y), `${a}/${b}/${c}`).toBe(true);
            }
          }
      expect(maximo).toBeLessThanOrEqual(TOPE_ELEMENTOS);
    });
  }

  it("500 m dibuja la misma cantidad de detalle que 12 m (no crece con la medida)", () => {
    for (const tipo of ["cubierta", "muro"] as const) {
      const grande = calcularCroquis(entrada(tipo, "500", "500", "500"));
      const medio = calcularCroquis(entrada(tipo, "12", "12", "12"));
      expect(grande.elementos).toBe(medio.elementos);
    }
  });

  it("un dibujo con medidas razonables cabe en el lienzo", () => {
    for (const tipo of ["cubierta", "losa", "muro"] as const) {
      for (const [a, b, c] of [["6", "4", "0.12"], ["12.4", "8", "3"], ["30", "2", "0.2"], ["3", "3", "3"]]) {
        const croquis = calcularCroquis(entrada(tipo, a!, b!, c!));
        for (const k of puntosDe(croquis).filter(Boolean)) {
          expect(k[0], `${tipo} ${a}/${b}/${c}`).toBeGreaterThan(-10);
          expect(k[0]).toBeLessThan(VISTA_CROQUIS.ancho + 10);
          expect(k[1]).toBeGreaterThan(-10);
          expect(k[1]).toBeLessThan(VISTA_CROQUIS.alto + 10);
        }
      }
    }
  });

  it("calcularlo miles de veces es barato (sin trabajo que crezca con la medida)", () => {
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) calcularCroquis(entrada("cubierta", String(1 + (i % 499)), String(1 + ((i * 7) % 499)), "3"));
    const ms = performance.now() - t0;
    // Cota muy holgada: solo detectaría un coste que creciera con la medida (en esta laptop son unos pocos ms).
    expect(ms).toBeLessThan(1500);
  });
});

describe("croquis: medidas pendientes o inválidas", () => {
  it("se dibuja con valores de referencia, queda marcado como fantasma y la cota lo dice", () => {
    const c = calcularCroquis(entrada("cubierta", "6", "", ""));
    expect(c.fantasma).toBe(true);
    expect(c.cotas.map((k) => [k.clave, k.estado, k.texto])).toEqual([["largo", "ok", "6.00 m"], ["ancho", "pend", "?"]]);
  });

  it("una medida mal escrita se marca con «!» y no rompe el dibujo", () => {
    const c = calcularCroquis(entrada("losa", "6", "abc", "-1"));
    expect(c.cotas.map((k) => k.texto)).toEqual(["6.00 m", "!", "!"]);
    for (const [x, y] of puntosDe(c)) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("completo: sin fantasma y con los tres rótulos de la losa (el alto se llama espesor)", () => {
    const c = calcularCroquis(entrada("losa", "6", "4", "0.12"));
    expect(c.fantasma).toBe(false);
    expect(c.cotas.map((k) => k.etiqueta)).toEqual(["Largo", "Ancho", "Espesor"]);
    expect(c.cotas.map((k) => k.texto)).toEqual(["6.00 m", "4.00 m", "0.12 m"]);
  });

  it("cada trabajo muestra solo las cotas de las medidas que pide", () => {
    expect(calcularCroquis(entrada("cubierta", "6", "4", "")).cotas.map((k) => k.clave)).toEqual(["largo", "ancho"]);
    expect(calcularCroquis(entrada("muro", "8", "", "2.5")).cotas.map((k) => k.clave)).toEqual(["largo", "alto"]);
  });

  it("el estado de cada medida se conserva para resaltarla o marcarla", () => {
    const estados = calcularCroquis(entrada("losa", "6", "", "x")).cotas.map((k): EstadoMedida => k.estado);
    expect(estados).toEqual(["ok", "pend", "inv"]);
  });
});

describe("ilustraciones de las tarjetas", () => {
  it("tienen siempre las mismas piezas y una pieza superior que se anima", () => {
    for (const tipo of ["cubierta", "losa", "muro"] as const) {
      const a = ilustracion(tipo);
      expect(ilustracion(tipo)).toBe(a); // se calculan una sola vez
      expect(a.filter((p) => p.superior)).toHaveLength(1);
      const detalle = a.reduce((n, p) => n + p.detalle.length, 0);
      expect(detalle).toBeLessThanOrEqual(MAX_LINEAS_DETALLE);
    }
    expect(ilustracion("cubierta")).toHaveLength(4);
  });

  it("la escena del inicio es fija y su techo es una pieza identificable", () => {
    const e = escenaInicio();
    expect(e.piezas).toHaveLength(4);
    expect(e.piezas[e.indiceTecho]!.material).toBe("petroleo");
    expect(e.cota.texto).toBe("12.40 m");
  });
});
