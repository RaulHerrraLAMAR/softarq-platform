/**
 * Iconos propios de la app, dibujados con SVG (sin paquetes de iconos ni imágenes). Son decorativos: el significado
 * lo da siempre el texto o la etiqueta de accesibilidad del control que los contiene.
 */
import Svg, { Path } from "react-native-svg";
import { useTema } from "./tema";

const TRAZOS = {
  inicio: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  doc: "M6 3h9l4 4v14H6z M9 12h7 M9 16h7",
  yo: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M4 21c1-4 4-6 8-6s7 2 8 6",
  atras: "M15 5l-7 7 7 7",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  info: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 11v5 M12 8h.01",
  abajo: "M6 9l6 6 6-6",
  siguiente: "M9 5l7 7-7 7",
  alerta: "M12 3l10 18H2z M12 10v5 M12 18h.01",
  cerrar: "M6 6l12 12M18 6L6 18",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam = 24, color, grosor = 2.2 }: { nombre: NombreIcono; tam?: number; color?: string; grosor?: number }) {
  const t = useTema();
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={TRAZOS[nombre]} fill="none" stroke={color ?? t.tinta} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Marca de SoftArq: una casa en tres caras isométricas. */
export function Logo({ tam = 22 }: { tam?: number }) {
  const t = useTema();
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M3 20V9l9-5 9 5v11z" fill={t.terracotaLuz} />
      <Path d="M3 20V9l9 4.5V20z" fill={t.terracota} />
      <Path d="M12 13.5L21 9v11h-9z" fill={t.terracotaBorde} />
    </Svg>
  );
}
