/**
 * Sistema visual «Obra cálida» de la app del cliente (ADR-0022). Concepto: taller de maquetas. Cal y papel como base,
 * terracota para actuar, verde petróleo para estructurar. La profundidad sale de capas sólidas (borde inferior, caras
 * isométricas) y no de degradados.
 *
 * - Los valores son los del prototipo aprobado (`docs/movil/prototipo/obra-calida-iteracion-2.html`).
 * - Contrastes comprobados por prueba (`__tests__/contraste.test.ts`): texto ≥ 4.5:1 y elementos de interfaz ≥ 3:1,
 *   en claro y oscuro.
 * - Fuentes incluidas en la app (Bricolage Grotesque para títulos, Inter para texto): sin descargas.
 */

export interface Paleta {
  /** Fondo de pantalla (cal). */
  fondo: string;
  /** Superficies elevadas (papel). */
  papel: string;
  /** Superficies hundidas (campos, láminas). */
  hundido: string;
  tinta: string;
  /** Texto secundario. */
  suave: string;
  linea: string;
  terracota: string;
  terracotaLuz: string;
  terracotaBorde: string;
  sobreTerracota: string;
  /** Color petróleo como texto o línea sobre el fondo. */
  petroleo: string;
  petroleoFondo: string;
  petroleoTinte: string;
  petroleoBorde: string;
  sobrePetroleo: string;
  ocre: string;
  ocreTinte: string;
  /** Color del espesor (tercera medida). */
  espesor: string;
  verde: string;
  verdeTinte: string;
  rojo: string;
  rojoTinte: string;
  /** Materiales isométricos: concreto, terracota, petróleo y ocre (cara superior, izquierda, derecha). */
  concreto: readonly [string, string, string];
  materialTerracota: readonly [string, string, string];
  materialPetroleo: readonly [string, string, string];
  materialOcre: readonly [string, string, string];
  sombra: string;
  trazo: string;
  /** Texto de enlace (terracota con contraste suficiente sobre la cal). */
  enlace: string;
  /** Fondo de la ventana mientras se ve una hoja (confirmaciones). */
  velo: string;
}

export const CLARO: Paleta = {
  fondo: "#EFE8DC",
  papel: "#FFFDF9",
  hundido: "#E5DCCD",
  tinta: "#22201C",
  suave: "#5C554A",
  linea: "#D3C9B7",
  terracota: "#C8451E",
  terracotaLuz: "#E36A40",
  terracotaBorde: "#8E2D0F",
  sobreTerracota: "#FFFFFF",
  petroleo: "#14535A",
  petroleoFondo: "#14535A",
  petroleoTinte: "#D3E5E3",
  petroleoBorde: "#0C3A40",
  sobrePetroleo: "#FFFFFF",
  ocre: "#E2A62A",
  ocreTinte: "#F6E3B4",
  espesor: "#8A5A0B",
  verde: "#2C7A4C",
  verdeTinte: "#CDE6D3",
  rojo: "#B3261E",
  rojoTinte: "#F6D6D2",
  concreto: ["#D9D2C4", "#BDB5A5", "#9C9484"],
  materialTerracota: ["#E07A55", "#C8451E", "#9B3114"],
  materialPetroleo: ["#3C8087", "#14535A", "#0C3A40"],
  materialOcre: ["#F0C25F", "#E2A62A", "#B98418"],
  sombra: "rgba(60, 40, 20, 0.28)",
  trazo: "rgba(34, 32, 28, 0.38)",
  enlace: "#8E2D0F",
  velo: "rgba(20, 16, 10, 0.5)",
};

export const OSCURO: Paleta = {
  fondo: "#1B1916",
  papel: "#26231F",
  hundido: "#14120F",
  tinta: "#F2ECE2",
  suave: "#B3AA9B",
  linea: "#3B362E",
  terracota: "#E2663D",
  terracotaLuz: "#F08A63",
  terracotaBorde: "#9C3A1A",
  sobreTerracota: "#1B1916",
  petroleo: "#6CBFC2",
  petroleoFondo: "#0F4046",
  petroleoTinte: "#17353A",
  petroleoBorde: "#082A2F",
  sobrePetroleo: "#FFFFFF",
  ocre: "#E8B84A",
  ocreTinte: "#3E3318",
  espesor: "#E8B84A",
  verde: "#6DBE8A",
  verdeTinte: "#1B3626",
  rojo: "#F2877F",
  rojoTinte: "#3F1E1B",
  concreto: ["#6F685B", "#554F44", "#3E3A32"],
  materialTerracota: ["#EE7F57", "#D45128", "#A93B19"],
  materialPetroleo: ["#5BA9AD", "#2F7D84", "#1E5A60"],
  materialOcre: ["#F0C25F", "#E8B84A", "#B98418"],
  sombra: "rgba(0, 0, 0, 0.6)",
  trazo: "rgba(242, 236, 226, 0.35)",
  enlace: "#F08A63",
  velo: "rgba(0, 0, 0, 0.6)",
};


/** Espaciado base 4 dp. */
export const ESP = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
/** Objetivo táctil mínimo (Material: 48 dp). */
export const OBJETIVO_MINIMO = 48;
export const RADIO = { chico: 10, medio: 16, grande: 22, pildora: 999 } as const;

/** Escala tipográfica. El texto crece con el tamaño de fuente del sistema. */
export const TEXTO = { xs: 12, sm: 14, md: 16, lg: 20, xl: 26, xxl: 32, importe: 44 } as const;

/** Nombres de las fuentes incluidas en la app (archivo sin extensión; ver `assets/fonts/LICENCIAS.md`). */
export const FUENTE = {
  titulo: "BricolageGrotesque_700Bold",
  tituloFuerte: "BricolageGrotesque_800ExtraBold",
  tituloMedio: "BricolageGrotesque_600SemiBold",
  texto: "Inter_400Regular",
  textoMedio: "Inter_500Medium",
  textoFuerte: "Inter_600SemiBold",
} as const;

/** Tono de un aviso o una insignia. */
export type Tono = "info" | "correcto" | "aviso" | "demo" | "error" | "neutro";

/** Colores (fondo, texto) de un tono. */
export function coloresDe(t: Paleta, tono: Tono): { fondo: string; texto: string } {
  switch (tono) {
    case "info":
      return { fondo: t.petroleoTinte, texto: t.petroleo };
    case "correcto":
      // El verde solo como indicador: como texto sobre su tinte no llega a 4.5:1 en el tema claro.
      return { fondo: t.verdeTinte, texto: t.tinta };
    case "aviso":
    case "demo":
      return { fondo: t.ocreTinte, texto: t.tinta };
    case "error":
      return { fondo: t.rojoTinte, texto: t.rojo };
    case "neutro":
      return { fondo: t.hundido, texto: t.suave };
  }
}
