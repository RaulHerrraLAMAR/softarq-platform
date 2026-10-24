/**
 * Geometría isométrica de las ilustraciones y del croquis acotado (ADR-0022). Funciones puras, sin React ni SVG: se
 * prueban en Node.
 *
 * - Proyección: X = (x − y)·√3/2, Y = (x + y)/2 − z.
 * - El dibujo es **orientativo, fuera de escala y sin validación estructural**: sirve para entender qué medida es cuál.
 *   Nunca se usa para calcular cantidades (eso es de la API).
 * - **Tope fijo de elementos.** El número de caras, líneas de detalle y cotas no depende de las medidas escritas
 *   (una medida de 500 m dibuja lo mismo que una de 5 m). Así el coste de dibujar es constante y acotado, también
 *   mientras la persona escribe.
 * - Una medida pendiente o inválida no rompe el dibujo: se usa un valor de referencia y la cota queda marcada.
 */
import type { DimensionCliente } from "@softarq/contracts/cliente";
import type { EstadoMedida } from "../captura/modelo";

export const K = Math.sqrt(3) / 2;
export type Punto = readonly [number, number];
export type Segmento = readonly [Punto, Punto];

export const proyectar = (x: number, y: number, z: number): Punto => [(x - y) * K, (x + y) * 0.5 - z];

export type Material = "concreto" | "terracota" | "petroleo" | "ocre";

export interface Caja {
  sup: Punto[];
  izq: Punto[];
  der: Punto[];
}

/** Caja con su esquina en (ox, oy, oz) y dimensiones (dx, dy, dz), ya proyectada. */
export function caja(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, p: (x: number, y: number, z: number) => Punto = proyectar): Caja {
  const q = (x: number, y: number, z: number) => p(ox + x, oy + y, oz + z);
  return {
    sup: [q(0, 0, dz), q(dx, 0, dz), q(dx, dy, dz), q(0, dy, dz)],
    izq: [q(0, dy, 0), q(dx, dy, 0), q(dx, dy, dz), q(0, dy, dz)],
    der: [q(dx, 0, 0), q(dx, dy, 0), q(dx, dy, dz), q(dx, 0, dz)],
  };
}

/** `n − 1` líneas paralelas sobre una cara horizontal (eje «y»: a lo largo de la anchura; «x»: a lo largo del largo). */
function lineasEnTapa(dx: number, dy: number, n: number, z: number, eje: "x" | "y", q: (x: number, y: number, z: number) => Punto): Segmento[] {
  const r: Segmento[] = [];
  for (let i = 1; i < n; i++) {
    const f = i / n;
    r.push(eje === "y" ? [q(dx * f, 0, z), q(dx * f, dy, z)] : [q(0, dy * f, z), q(dx, dy * f, z)]);
  }
  return r;
}

/** `n − 1` líneas horizontales sobre la cara frontal de un muro. */
function lineasEnFrente(dx: number, dy: number, dz: number, n: number, q: (x: number, y: number, z: number) => Punto): Segmento[] {
  const r: Segmento[] = [];
  for (let i = 1; i < n; i++) r.push([q(0, dy, (dz * i) / n), q(dx, dy, (dz * i) / n)]);
  return r;
}

// --- Piezas dibujables ------------------------------------------------------------------------------

export interface Pieza {
  material: Material;
  caja: Caja;
  detalle: Segmento[];
  /** Pieza flotante que se anima al elegir (la losa o el panel de la cubierta). */
  superior?: boolean;
  fantasma?: boolean;
}

/** Cantidad máxima de líneas de detalle de todo el dibujo: no depende de las medidas. */
export const MAX_LINEAS_DETALLE = 16;

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// --- Ilustraciones de las tarjetas (viewBox 150 × 110) ------------------------------------------------

export type TipoTrabajo = "cubierta" | "losa" | "muro";

export const VISTA_ILUSTRACION = { ancho: 150, alto: 110 } as const;

/** Transforma las coordenadas de una escena para encajarla en su lienzo: x·escala + tx. */
function colocar(p: Punto, tx: number, ty: number, e: number): Punto {
  return [p[0] * e + tx, p[1] * e + ty];
}
const colocarCaja = (c: Caja, tx: number, ty: number, e: number): Caja => ({ sup: c.sup.map((p) => colocar(p, tx, ty, e)), izq: c.izq.map((p) => colocar(p, tx, ty, e)), der: c.der.map((p) => colocar(p, tx, ty, e)) });
const colocarSegmentos = (s: Segmento[], tx: number, ty: number, e: number): Segmento[] => s.map(([a, b]) => [colocar(a, tx, ty, e), colocar(b, tx, ty, e)]);

function pieza(material: Material, c: Caja, detalle: Segmento[], tx: number, ty: number, e: number, extra: Partial<Pieza> = {}): Pieza {
  return { material, caja: colocarCaja(c, tx, ty, e), detalle: colocarSegmentos(detalle, tx, ty, e), ...extra };
}

const memoIlustraciones = new Map<TipoTrabajo, Pieza[]>();

/** Ilustración de un trabajo para su tarjeta. Siempre las mismas piezas (constantes). */
export function ilustracion(tipo: TipoTrabajo): Pieza[] {
  const guardada = memoIlustraciones.get(tipo);
  if (guardada) return guardada;
  let r: Pieza[];
  if (tipo === "cubierta") {
    const [tx, ty, e] = [62, 66, 5.6];
    const poste = (x: number, y: number) => pieza("concreto", caja(x, y, 0, 0.9, 0.9, 5), [], tx, ty, e);
    const panel = caja(-0.4, -0.4, 5, 9.4, 6.4, 0.6);
    const q = (x: number, y: number, z: number) => proyectar(-0.4 + x, -0.4 + y, 5 + z);
    r = [poste(0.6, 0.2), poste(7.6, 0.2), poste(0.6, 5), pieza("terracota", panel, lineasEnTapa(9.4, 6.4, 10, 0.6, "y", q), tx, ty, e, { superior: true })];
  } else if (tipo === "losa") {
    const [tx, ty, e] = [60, 42, 6.4];
    const q = (x: number, y: number, z: number) => proyectar(x, y, 1.6 + z);
    r = [pieza("concreto", caja(0, 0, 0, 9, 6.5, 1.6), [], tx, ty, e), pieza("concreto", caja(0, 0, 1.6, 9, 6.5, 1.2), [...lineasEnTapa(9, 6.5, 6, 1.2, "y", q), ...lineasEnTapa(9, 6.5, 5, 1.2, "x", q)], tx, ty, e, { superior: true })];
  } else {
    const [tx, ty, e] = [56, 44, 5.6];
    const q = (x: number, y: number, z: number) => proyectar(x, y, 0.8 + z);
    r = [pieza("concreto", caja(0, 0, 0, 10, 1.6, 0.8), [], tx, ty, e), pieza("terracota", caja(0, 0, 0.8, 10, 1.6, 5), lineasEnFrente(10, 1.6, 5, 6, q), tx, ty, e, { superior: true })];
  }
  memoIlustraciones.set(tipo, r);
  return r;
}

/** Escena del encabezado del inicio (viewBox 220 × 170): una losa con dos muros y un techo petróleo. */
export const VISTA_ESCENA = { ancho: 220, alto: 170 } as const;

export interface EscenaInicio {
  piezas: Pieza[];
  /** Cota «12.40 m» sobre el frente de la losa. */
  cota: { a: Punto; b: Punto; centro: Punto; texto: string };
  /** Índice del techo en `piezas` (se anima al entrar). */
  indiceTecho: number;
}

let memoEscena: EscenaInicio | null = null;
export function escenaInicio(): EscenaInicio {
  if (memoEscena) return memoEscena;
  const [tx, ty, e] = [112, 82, 7.2];
  const qM1 = (x: number, y: number, z: number) => proyectar(0.4 + x, 0.4 + y, 1.2 + z);
  const losa = pieza("concreto", caja(0, 0, 0, 12, 9, 1.2), [], tx, ty, e);
  const m1 = pieza("terracota", caja(0.4, 0.4, 1.2, 11.2, 1.1, 4), lineasEnFrente(11.2, 1.1, 4, 5, qM1), tx, ty, e);
  const m2 = pieza("terracota", caja(0.4, 1.5, 1.2, 1.1, 7.1, 4), [], tx, ty, e);
  const techo = pieza("petroleo", caja(-0.4, -0.4, 7, 13, 10, 0.7), [], tx, ty, e);
  const p1 = proyectar(0, 9 + 1.6, 0);
  const p2 = proyectar(12, 9 + 1.6, 0);
  const a: Punto = [tx + p1[0] * e, ty + p1[1] * e + 8];
  const b: Punto = [tx + p2[0] * e, ty + p2[1] * e + 8];
  memoEscena = { piezas: [losa, m1, m2, techo], cota: { a, b, centro: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 7], texto: "12.40 m" }, indiceTecho: 3 };
  return memoEscena;
}

// --- Croquis acotado (viewBox 360 × 240) --------------------------------------------------------------

export const VISTA_CROQUIS = { ancho: 360, alto: 240 } as const;

/** Valores de referencia con los que se dibuja mientras faltan medidas. */
export const MEDIDAS_REFERENCIA: Record<TipoTrabajo, Record<DimensionCliente, number>> = {
  cubierta: { largo: 8, ancho: 4.5, alto: 0 },
  losa: { largo: 6, ancho: 4, alto: 0.12 },
  muro: { largo: 8, ancho: 0, alto: 2.5 },
};

export interface MedidaDeCroquis {
  /** Valor numérico si la medida es válida; `null` si falta o está mal escrita. */
  valor: number | null;
  estado: EstadoMedida;
}

export interface EntradaCroquis {
  tipo: TipoTrabajo;
  /** Qué medidas pide el trabajo (en el orden en que se muestran). */
  pide: readonly DimensionCliente[];
  largo: MedidaDeCroquis;
  ancho: MedidaDeCroquis;
  alto: MedidaDeCroquis;
  /** Etiqueta de la tercera medida («Alto» o «Espesor»). */
  etiquetaAlto: string;
}

export interface Cota {
  clave: DimensionCliente;
  etiqueta: string;
  a: Punto;
  b: Punto;
  /** Centro del rótulo con la medida. */
  centro: Punto;
  estado: EstadoMedida;
  /** Texto del rótulo: «6.50 m», «?» (pendiente) o «!» (inválida). */
  texto: string;
}

export interface Croquis {
  sombra: Punto[];
  piezas: Pieza[];
  cotas: Cota[];
  /** `true` si el dibujo usa valores de referencia porque falta alguna medida. */
  fantasma: boolean;
  /** Cantidad de elementos gráficos (caras, líneas, cotas): siempre acotada. */
  elementos: number;
}

function efectiva(m: MedidaDeCroquis, referencia: number): number {
  return m.estado === "ok" && m.valor !== null && Number.isFinite(m.valor) && m.valor > 0 ? m.valor : referencia;
}

/** Texto del rótulo de una cota. */
export function textoDeCota(m: MedidaDeCroquis): string {
  if (m.estado === "ok" && m.valor !== null) return `${m.valor.toFixed(2)} m`;
  return m.estado === "inv" ? "!" : "?";
}

export function calcularCroquis(e: EntradaCroquis): Croquis {
  const ref = MEDIDAS_REFERENCIA[e.tipo];
  const pide = new Set(e.pide);
  const l = efectiva(e.largo, ref.largo);
  const w = e.tipo === "muro" ? 1 : efectiva(e.ancho, ref.ancho);
  const h = e.tipo === "cubierta" ? 0 : efectiva(e.alto, ref.alto);
  const fantasma = e.pide.some((c) => (c === "largo" ? e.largo : c === "ancho" ? e.ancho : e.alto).estado !== "ok");

  let s: number;
  let dx: number;
  let dy: number;
  let z: number;
  if (e.tipo === "muro") {
    const grosor = Math.max(l, h) * 0.07;
    s = Math.min(230 / ((l + grosor) * K), 118 / ((l + grosor) * 0.5 + h));
    dx = l * s;
    dy = grosor * s;
    z = h * s;
  } else {
    z = e.tipo === "losa" ? 10 + Math.min(h, 0.5) * 40 : 7;
    s = Math.min(230 / ((l + w) * K), (118 - z) / ((l + w) * 0.5));
    dx = l * s;
    dy = w * s;
  }
  const minX = -dy * K;
  const maxX = dx * K;
  const minY = -z;
  const maxY = (dx + dy) * 0.5;
  const ox = 180 - (minX + maxX) / 2 - 8;
  const oy = 108 - (minY + maxY) / 2 - 6;
  const Q = (x: number, y: number, zz: number): Punto => {
    const p = proyectar(x, y, zz);
    return [p[0] + ox, p[1] + oy];
  };

  let detalle: Segmento[];
  if (e.tipo === "cubierta") detalle = lineasEnTapa(dx, dy, acotar(Math.round(l), 4, 12), z, "y", Q);
  else if (e.tipo === "losa") detalle = [...lineasEnTapa(dx, dy, 6, z, "y", Q), ...lineasEnTapa(dx, dy, 5, z, "x", Q)];
  else detalle = lineasEnFrente(dx, dy, z, acotar(Math.round(h * 2), 3, 8), Q);
  detalle = detalle.slice(0, MAX_LINEAS_DETALLE);

  const material: Material = e.tipo === "muro" || e.tipo === "cubierta" ? "terracota" : "concreto";
  const pz: Pieza = { material, caja: caja(0, 0, 0, dx, dy, z, Q), detalle, fantasma };
  const sombra = [Q(2, 2, 0), Q(dx + 6, 4, 0), Q(dx + 6, dy + 6, 0), Q(2, dy + 6, 0)];

  const off = 16;
  const cotas: Cota[] = [];
  const a1 = Q(0, dy + off, 0);
  const b1 = Q(dx, dy + off, 0);
  cotas.push({ clave: "largo", etiqueta: "Largo", a: a1, b: b1, centro: [(a1[0] + b1[0]) / 2 - 6, (a1[1] + b1[1]) / 2 + 14], estado: e.largo.estado, texto: textoDeCota(e.largo) });
  if (e.tipo !== "muro" && pide.has("ancho")) {
    const a2 = Q(dx + off, 0, 0);
    const b2 = Q(dx + off, dy, 0);
    cotas.push({ clave: "ancho", etiqueta: "Ancho", a: a2, b: b2, centro: [(a2[0] + b2[0]) / 2 + 18, (a2[1] + b2[1]) / 2 + 12], estado: e.ancho.estado, texto: textoDeCota(e.ancho) });
  }
  if (e.tipo !== "cubierta" && pide.has("alto")) {
    const base = Q(dx, 0, 0);
    const tope = Q(dx, 0, z);
    const a3: Punto = [base[0] + 20, base[1]];
    const b3: Punto = [tope[0] + 20, tope[1]];
    const desv = e.tipo === "losa" ? [4, 26] : [0, 0];
    cotas.push({ clave: "alto", etiqueta: e.etiquetaAlto, a: a3, b: b3, centro: [a3[0] + desv[0]!, (a3[1] + b3[1]) / 2 + desv[1]!], estado: e.alto.estado, texto: textoDeCota(e.alto) });
  }

  return { sombra, piezas: [pz], cotas, fantasma, elementos: 1 + 3 + detalle.length + cotas.length * 4 };
}
