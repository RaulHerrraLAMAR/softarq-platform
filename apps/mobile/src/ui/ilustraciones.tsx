/**
 * Ilustraciones isométricas de los trabajos y escena del inicio (ADR-0022). Se dibujan con SVG a partir de la
 * geometría pura de `croquis/geometria.ts`: piezas fijas, siempre las mismas, sin imágenes ni recursos externos.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { G, Line, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { escenaInicio, ilustracion, VISTA_ESCENA, VISTA_ILUSTRACION, type Material, type Pieza, type Punto, type TipoTrabajo } from "../croquis/geometria";
import { FUENTE, useTema, type Paleta } from "./tema";
import { useMovimientoReducido } from "./movimiento";

const AnimatedG = Animated.createAnimatedComponent(G);

export const puntos = (p: readonly Punto[]): string => p.map((x) => `${x[0].toFixed(1)},${x[1].toFixed(1)}`).join(" ");

/** Colores (cara superior, izquierda, derecha) de un material en la paleta vigente. */
export function colorDeMaterial(t: Paleta, m: Material): readonly [string, string, string] {
  switch (m) {
    case "concreto":
      return t.concreto;
    case "terracota":
      return t.materialTerracota;
    case "petroleo":
      return t.materialPetroleo;
    case "ocre":
      return t.materialOcre;
  }
}

/** Una pieza sólida: tres caras con su borde y las líneas de detalle. */
export function PiezaSvg({ pieza }: { pieza: Pieza }) {
  const t = useTema();
  const [sup, izq, der] = colorDeMaterial(t, pieza.material);
  const opacidad = pieza.fantasma ? 0.4 : 1;
  const trazo = pieza.fantasma ? { strokeDasharray: "4 3" } : {};
  return (
    <>
      <Polygon points={puntos(pieza.caja.izq)} fill={izq} fillOpacity={opacidad} stroke={t.trazo} strokeWidth={1} strokeLinejoin="round" {...trazo} />
      <Polygon points={puntos(pieza.caja.der)} fill={der} fillOpacity={opacidad} stroke={t.trazo} strokeWidth={1} strokeLinejoin="round" {...trazo} />
      <Polygon points={puntos(pieza.caja.sup)} fill={sup} fillOpacity={opacidad} stroke={t.trazo} strokeWidth={1} strokeLinejoin="round" {...trazo} />
      {pieza.detalle.map((s, i) => (
        <Line key={i} x1={s[0][0]} y1={s[0][1]} x2={s[1][0]} y2={s[1][1]} stroke={t.trazo} strokeWidth={1} />
      ))}
    </>
  );
}

/** Ilustración de un trabajo (cubierta, losa o muro) para su tarjeta o el resumen. */
export function Ilustracion({ tipo, ancho, elevada = false }: { tipo: TipoTrabajo; ancho: number; elevada?: boolean }) {
  const piezas = ilustracion(tipo);
  const alto = (ancho * VISTA_ILUSTRACION.alto) / VISTA_ILUSTRACION.ancho;
  return (
    <Svg width={ancho} height={alto} viewBox={`0 0 ${VISTA_ILUSTRACION.ancho} ${VISTA_ILUSTRACION.alto}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {piezas.map((p, i) => (
        <G key={i} y={p.superior && elevada ? -5 : 0}>
          <PiezaSvg pieza={p} />
        </G>
      ))}
    </Svg>
  );
}

/**
 * Escena del encabezado del inicio: una losa con dos muros y un techo petróleo que baja al entrar, con la cota de 12.40 m.
 * Con movimiento reducido aparece ya completa.
 */
export function EscenaInicio({ ancho }: { ancho: number }) {
  const t = useTema();
  const reducido = useMovimientoReducido();
  const escena = escenaInicio();
  const caida = useRef(new Animated.Value(reducido ? 0 : -14)).current;
  useEffect(() => {
    if (reducido) {
      caida.setValue(0);
      return;
    }
    caida.setValue(-14);
    Animated.timing(caida, { toValue: 0, duration: 650, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [reducido, caida]);

  const alto = (ancho * VISTA_ESCENA.alto) / VISTA_ESCENA.ancho;
  const { cota } = escena;
  return (
    <Svg width={ancho} height={alto} viewBox={`0 0 ${VISTA_ESCENA.ancho} ${VISTA_ESCENA.alto}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {escena.piezas.map((p, i) =>
        i === escena.indiceTecho ? (
          <AnimatedG key={i} y={caida}>
            <PiezaSvg pieza={p} />
          </AnimatedG>
        ) : (
          <G key={i}>
            <PiezaSvg pieza={p} />
          </G>
        ),
      )}
      <Line x1={cota.a[0]} y1={cota.a[1]} x2={cota.b[0]} y2={cota.b[1]} stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" />
      <Rect x={cota.centro[0] - 26} y={cota.centro[1] - 9} width={52} height={18} rx={9} fill={t.terracota} />
      <SvgText x={cota.centro[0]} y={cota.centro[1] + 3.5} textAnchor="middle" fill={t.sobreTerracota} fontSize={10} fontFamily={FUENTE.textoFuerte}>
        {cota.texto}
      </SvgText>
    </Svg>
  );
}
