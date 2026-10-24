/**
 * Croquis isométrico acotado de un trabajo (ADR-0022). Dibujo **orientativo, fuera de escala y sin validación
 * estructural**: ayuda a entender qué medida es cuál.
 *
 * - La geometría es pura y de tamaño fijo (`geometria.ts`); aquí solo se dibuja.
 * - El dibujo se recalcula con las medidas ya «asentadas» (una pausa breve tras dejar de escribir) y se memoiza: activar
 *   un campo, enfocar o desenfocar no reconstruye las caras, solo el realce de la cota activa.
 * - Las cotas son controles nativos encima del dibujo (rol de botón, objetivo táctil amplio): tocar una lleva al campo
 *   de esa medida.
 */
import { memo, useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, Path, Pattern, Polygon, Rect } from "react-native-svg";
import type { DimensionCliente } from "@softarq/contracts/cliente";
import { leerMedida, type RenglonLocal } from "../captura/modelo";
import { useRetardado } from "../consultas/usar-consulta";
import { puntos, PiezaSvg } from "../ui/ilustraciones";
import { ESP, FUENTE, TEXTO, useTema, type Paleta } from "../ui/tema";
import { calcularCroquis, VISTA_CROQUIS, type Cota, type MedidaDeCroquis, type TipoTrabajo } from "./geometria";

export const ROTULO_CROQUIS = "Dibujo orientativo, fuera de escala y sin validación estructural.";

const aMedida = (texto: string): MedidaDeCroquis => {
  const l = leerMedida(texto);
  return { valor: l.valor === null ? null : Number(l.valor), estado: l.estado };
};

const colorDe = (t: Paleta, clave: DimensionCliente): string => (clave === "largo" ? t.terracota : clave === "ancho" ? t.petroleo : t.espesor);

/** Pausa tras dejar de escribir antes de redibujar. */
export const ESPERA_DIBUJO_MS = 120;

const Rejilla = memo(function Rejilla({ color }: { color: string }) {
  return (
    <>
      <Defs>
        <Pattern id="rejilla" width={22} height={22} patternUnits="userSpaceOnUse">
          <Path d="M22 0H0V22" stroke={color} strokeWidth={1} fill="none" />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={VISTA_CROQUIS.ancho} height={VISTA_CROQUIS.alto} fill="url(#rejilla)" />
    </>
  );
});

interface Props {
  tipo: TipoTrabajo;
  pide: readonly DimensionCliente[];
  renglon: RenglonLocal;
  etiquetaAlto: string;
  /** Medida cuyo campo tiene el foco. */
  activa: DimensionCliente | null;
  alTocarCota: (clave: DimensionCliente) => void;
  /** Con el teclado abierto el dibujo se achica para dejar sitio a los campos. */
  compacto: boolean;
}

export function Croquis({ tipo, pide, renglon, etiquetaAlto, activa, alTocarCota, compacto }: Props) {
  const t = useTema();
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });
  const clavePide = pide.join(",");
  const asentado = useRetardado(JSON.stringify([renglon.largo, renglon.ancho, renglon.alto]), ESPERA_DIBUJO_MS);
  const croquis = useMemo(() => {
    const [l = "", a = "", h = ""] = JSON.parse(asentado) as string[];
    return calcularCroquis({ tipo, pide: clavePide.split(",") as DimensionCliente[], largo: aMedida(l), ancho: aMedida(a), alto: aMedida(h), etiquetaAlto });
  }, [asentado, tipo, clavePide, etiquetaAlto]);

  // Caras y detalle: solo cambian con las medidas asentadas o el tema.
  const solido = useMemo(
    () => (
      <>
        <Polygon points={puntos(croquis.sombra)} fill={t.sombra} fillOpacity={0.5} />
        {croquis.piezas.map((p, i) => (
          <PiezaSvg key={i} pieza={p} />
        ))}
      </>
    ),
    [croquis, t],
  );

  const alturaCaja = compacto ? 140 : 232;
  const escala = Math.min(caja.ancho / VISTA_CROQUIS.ancho, alturaCaja / VISTA_CROQUIS.alto);
  const origenX = (caja.ancho - VISTA_CROQUIS.ancho * escala) / 2;
  const origenY = (alturaCaja - VISTA_CROQUIS.alto * escala) / 2;
  const alMedir = (e: LayoutChangeEvent) => setCaja({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height });

  return (
    <View style={{ backgroundColor: t.hundido, paddingTop: ESP[2], paddingBottom: ESP[1] }}>
      <View onLayout={alMedir} style={{ height: alturaCaja }}>
        {/* El dibujo es una imagen para el lector de pantalla; las cotas, encima, son botones independientes. */}
        <View accessible accessibilityRole="image" accessibilityLabel={`${ROTULO_CROQUIS} ${croquis.cotas.map((c) => `${c.etiqueta}: ${c.texto === "?" ? "falta" : c.texto === "!" ? "no válida" : c.texto}`).join(", ")}.`}>
          <Svg width="100%" height={alturaCaja} viewBox={`0 0 ${VISTA_CROQUIS.ancho} ${VISTA_CROQUIS.alto}`} preserveAspectRatio="xMidYMid meet">
            <Rejilla color={t.linea} />
            <G>{solido}</G>
            {croquis.cotas.map((c) => (
              <LineaCota key={c.clave} cota={c} color={c.estado === "inv" ? t.rojo : colorDe(t, c.clave)} activa={activa === c.clave} />
            ))}
          </Svg>
        </View>
        {caja.ancho > 0
          ? croquis.cotas.map((c) => <RotuloCota key={c.clave} cota={c} color={colorDe(t, c.clave)} activa={activa === c.clave} x={origenX + c.centro[0] * escala} y={origenY + c.centro[1] * escala} alPulsar={() => alTocarCota(c.clave)} />)
          : null}
      </View>
      {croquis.fantasma ? <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs, color: t.suave, textAlign: "center" }}>Faltan medidas: el dibujo usa valores de referencia.</Text> : null}
      <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs, color: t.suave, textAlign: "center", paddingHorizontal: ESP[4] }}>{ROTULO_CROQUIS}</Text>
    </View>
  );
}

function LineaCota({ cota, color, activa }: { cota: Cota; color: string; activa: boolean }) {
  return (
    <G>
      <Line x1={cota.a[0]} y1={cota.a[1]} x2={cota.b[0]} y2={cota.b[1]} stroke={color} strokeWidth={activa ? 4 : 2} strokeLinecap="round" {...(cota.estado === "pend" ? { strokeDasharray: "5 4" } : {})} />
      <Circle cx={cota.a[0]} cy={cota.a[1]} r={3.5} fill={color} />
      <Circle cx={cota.b[0]} cy={cota.b[1]} r={3.5} fill={color} />
    </G>
  );
}

function RotuloCota({ cota, color, activa, x, y, alPulsar }: { cota: Cota; color: string; activa: boolean; x: number; y: number; alPulsar: () => void }) {
  const t = useTema();
  const ancho = cota.estado === "ok" ? 68 : 32;
  const relleno = activa || cota.estado === "inv";
  const fondo = cota.estado === "inv" ? t.rojo : relleno ? color : t.papel;
  const texto = relleno ? t.sobreTerracota : color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cota.etiqueta}: ${cota.texto === "?" ? "falta" : cota.texto === "!" ? "no válida" : cota.texto}`}
      accessibilityHint="Lleva al campo de esta medida"
      onPress={alPulsar}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={{ position: "absolute", left: x - ancho / 2, top: y - 14, width: ancho, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fondo, borderWidth: 1.6, borderColor: cota.estado === "inv" ? t.rojo : color }}
    >
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: 12, color: texto, fontVariant: ["tabular-nums"] }}>{cota.texto}</Text>
    </Pressable>
  );
}
