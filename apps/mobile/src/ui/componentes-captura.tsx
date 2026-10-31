/**
 * Piezas propias del recorrido de la cotización (ADR-0022): encabezado con progreso, tarjeta de trabajo, campo de
 * medida, anillo de avance, filas de lista y la palomita de confirmación.
 */
import { useEffect, useRef, type ElementRef, type ReactNode, type RefObject } from "react";
import { Animated, Easing, Pressable, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { DimensionCliente } from "@softarq/contracts/cliente";
import type { EstadoMedida } from "../captura/modelo";
import type { TipoTrabajo } from "../croquis/geometria";
import { Icono } from "./iconos";
import { Ilustracion } from "./ilustraciones";
import { Relieve, Texto, useHundimiento } from "./componentes";
import { useMovimientoReducido } from "./movimiento";
import { coloresDe, ESP, FUENTE, RADIO, TEXTO, useTema, type Tono } from "./tema";

const AnimadoPath = Animated.createAnimatedComponent(Path);

// --- Encabezado y progreso ----------------------------------------------------------------------

/** Barra de pasos: los hechos en terracota, el actual en petróleo a medias, los demás vacíos. */
export function Pasos({ total, actual }: { total: number; actual: number }) {
  const t = useTema();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Paso ${actual} de ${total}`} accessibilityValue={{ min: 1, max: total, now: actual }} style={{ flexDirection: "row", gap: 5 }}>
      {Array.from({ length: total }, (_, i) => (
        <Segmento key={i} estado={i + 1 < actual ? "hecho" : i + 1 === actual ? "actual" : "pendiente"} fondo={t.linea} hecho={t.terracota} actual={t.petroleo} />
      ))}
    </View>
  );
}

function Segmento({ estado, fondo, hecho, actual }: { estado: "hecho" | "actual" | "pendiente"; fondo: string; hecho: string; actual: string }) {
  const reducido = useMovimientoReducido();
  const meta = estado === "hecho" ? 1 : estado === "actual" ? 0.5 : 0;
  const v = useRef(new Animated.Value(reducido ? meta : 0)).current;
  useEffect(() => {
    if (reducido) v.setValue(meta);
    else Animated.timing(v, { toValue: meta, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [meta, reducido, v]);
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: fondo, overflow: "hidden" }}>
      <Animated.View style={{ height: 6, backgroundColor: estado === "actual" ? actual : hecho, width: v.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
    </View>
  );
}

/** Encabezado de una pantalla del recorrido: volver, título y, si aplica, el avance. */
export function Encabezado({ titulo, alVolver, paso, total, etiquetaPaso, etiquetaVolver = "Volver" }: { titulo: string; alVolver?: () => void; paso?: number; total?: number; etiquetaPaso?: string; etiquetaVolver?: string }) {
  const t = useTema();
  return (
    <View style={{ paddingHorizontal: ESP[4], paddingTop: ESP[2], paddingBottom: ESP[2], gap: ESP[2], backgroundColor: t.fondo }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[2] }}>
        {alVolver ? (
          <Pressable accessibilityRole="button" accessibilityLabel={etiquetaVolver} onPress={alVolver} hitSlop={6} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.papel, borderBottomWidth: 2, borderBottomColor: t.linea, alignItems: "center", justifyContent: "center" }}>
              <Icono nombre="atras" tam={20} />
            </View>
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: FUENTE.titulo, fontSize: TEXTO.lg, color: t.tinta }} numberOfLines={2}>
          {titulo}
        </Text>
      </View>
      {paso !== undefined && total !== undefined ? (
        <>
          <Pasos total={total} actual={paso} />
          <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs, color: t.suave }}>{etiquetaPaso ? `Paso ${paso} de ${total} · ${etiquetaPaso}` : `Paso ${paso} de ${total}`}</Text>
        </>
      ) : null}
    </View>
  );
}

// --- Tarjeta de trabajo -------------------------------------------------------------------------

const PROFUNDIDAD_TARJETA = 5;

/**
 * Tarjeta ilustrada de un tipo de trabajo. Al elegirla se levanta, cambia a petróleo, muestra la marca de elección y
 * adelanta qué medidas se pedirán. Las tarjetas alternan el lado de la ilustración.
 */
export function TarjetaTrabajo({ tipo, nombre, descripcion, pide, seleccionado, alPulsar, invertida = false }: { tipo: TipoTrabajo; nombre: string; descripcion: string; pide: string; seleccionado: boolean; alPulsar: () => void; invertida?: boolean }) {
  const t = useTema();
  const reducido = useMovimientoReducido();
  const { y, hundir } = useHundimiento(PROFUNDIDAD_TARJETA);
  const levanta = useRef(new Animated.Value(seleccionado ? 1 : 0)).current;
  useEffect(() => {
    if (reducido) levanta.setValue(seleccionado ? 1 : 0);
    else Animated.timing(levanta, { toValue: seleccionado ? 1 : 0, duration: 220, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [seleccionado, reducido, levanta]);
  const marca = levanta.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${nombre}. ${descripcion} ${pide}`}
      accessibilityState={{ checked: seleccionado }}
      onPress={alPulsar}
      onPressIn={() => hundir(true)}
      onPressOut={() => hundir(false)}
    >
      <Animated.View style={{ transform: [{ translateY: levanta.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}>
        <Relieve colorBase={seleccionado ? t.petroleoBorde : t.linea} profundidad={PROFUNDIDAD_TARJETA} radio={RADIO.grande} hundimiento={y}>
          <View
            style={{
              flexDirection: invertida ? "row-reverse" : "row",
              alignItems: "center",
              gap: ESP[2],
              minHeight: 112,
              borderRadius: RADIO.grande,
              borderWidth: 2,
              borderColor: seleccionado ? t.petroleo : t.linea,
              backgroundColor: seleccionado ? t.petroleoTinte : t.papel,
              paddingVertical: ESP[3],
              paddingHorizontal: ESP[3],
            }}
          >
            <View style={{ marginTop: -ESP[5], marginBottom: -ESP[2], marginHorizontal: -ESP[1] }}>
              <Ilustracion tipo={tipo} ancho={128} elevada={seleccionado} />
            </View>
            <View style={{ flex: 1, gap: 2, alignItems: invertida ? "flex-end" : "flex-start" }}>
              <Text style={{ fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.lg + 2, letterSpacing: -0.4, color: t.tinta, textAlign: invertida ? "right" : "left" }}>{nombre}</Text>
              <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave, textAlign: invertida ? "right" : "left" }}>{descripcion}</Text>
              {seleccionado ? <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs + 1, color: t.petroleo, textAlign: invertida ? "right" : "left" }}>{pide}</Text> : null}
            </View>
            <Animated.View
              style={{
                position: "absolute",
                top: -ESP[3],
                ...(invertida ? { left: ESP[3] } : { right: ESP[3] }),
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: t.petroleoFondo,
                alignItems: "center",
                justifyContent: "center",
                opacity: marca,
                transform: [{ scale: marca }],
              }}
            >
              <Icono nombre="check" tam={16} color={t.sobrePetroleo} grosor={3} />
            </Animated.View>
          </View>
        </Relieve>
      </Animated.View>
    </Pressable>
  );
}

// --- Campo de medida ----------------------------------------------------------------------------

export type ColorMedida = "terracota" | "petroleo" | "espesor";

/** Color de la marca de una dimensión (el mismo que su cota en el croquis). */
export function colorDeDimension(clave: DimensionCliente): ColorMedida {
  return clave === "largo" ? "terracota" : clave === "ancho" ? "petroleo" : "espesor";
}

/**
 * Campo de una medida: marca de color (la de su cota), número grande con teclado decimal, unidad y mensaje de error
 * junto al campo. El error aparece apenas el texto no es válido; lo pendiente solo se marca en el resumen.
 */
export function CampoMedida({
  clave,
  etiqueta,
  ayuda,
  valor,
  estado,
  alCambiar,
  alEnfocar,
  alDesenfocar,
  referencia,
  unidad = "m",
  alEnviar,
  ultimo = false,
  motivo,
}: {
  clave: DimensionCliente;
  etiqueta: string;
  ayuda: string;
  valor: string;
  estado: EstadoMedida;
  alCambiar: (v: string) => void;
  alEnfocar?: () => void;
  alDesenfocar?: () => void;
  referencia?: RefObject<ElementRef<typeof TextInput> | null>;
  unidad?: string;
  alEnviar?: () => void;
  ultimo?: boolean;
  /** Por qué se rechaza lo escrito; si falta, un texto general. */
  motivo?: string | null;
}) {
  const t = useTema();
  const marca = { terracota: t.terracota, petroleo: t.petroleo, espesor: t.espesor }[colorDeDimension(clave)];
  const invalido = estado === "inv";
  const mensaje = motivo ?? "Escriba un número mayor que 0, por ejemplo 6.50.";
  return (
    <View style={{ gap: ESP[1] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[2] }}>
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: marca }} />
        <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm + 1, color: t.tinta }}>{etiqueta}</Text>
      </View>
      {/* El motivo va encima del campo: al enfocarlo, Android desplaza solo el campo y lo que está debajo puede quedar tras la barra. */}
      {invalido ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: ESP[1] }}>
          <Icono nombre="alerta" tam={16} color={t.rojo} />
          <Text style={{ flex: 1, fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm, color: t.rojo }}>{mensaje}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", borderRadius: RADIO.chico + 4, borderWidth: 2, borderColor: invalido ? t.rojo : t.linea, borderLeftWidth: 6, borderLeftColor: invalido ? t.rojo : marca, backgroundColor: invalido ? t.rojoTinte : t.papel, paddingHorizontal: ESP[3] }}>
        <TextInput
          {...(referencia ? { ref: referencia } : {})}
          accessibilityLabel={`${etiqueta}, en metros`}
          accessibilityHint={invalido ? mensaje : ayuda}
          value={valor}
          onChangeText={alCambiar}
          onFocus={alEnfocar}
          onBlur={alDesenfocar}
          keyboardType="decimal-pad"
          returnKeyType={ultimo ? "done" : "next"}
          {...(alEnviar ? { onSubmitEditing: alEnviar } : {})}
          blurOnSubmit={ultimo}
          maxLength={14}
          autoCorrect={false}
          spellCheck={false}
          selectTextOnFocus
          placeholder="0.00"
          placeholderTextColor={t.suave}
          style={{ flex: 1, minHeight: 56, fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.lg + 2, color: t.tinta, fontVariant: ["tabular-nums"], paddingVertical: ESP[2] }}
        />
        <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.suave }}>{unidad}</Text>
      </View>
      {invalido ? null : <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>{ayuda}</Text>}
    </View>
  );
}

// --- Listas -------------------------------------------------------------------------------------

/** Fila de una lista (solicitud o cotización): título, detalle, estado y, a la derecha, un dato corto. */
export function FilaLista({ titulo, detalle, estado, tonoEstado = "neutro", derecha, notaDerecha, alPulsar, etiqueta }: { titulo: string; detalle?: string; estado?: string; tonoEstado?: Tono; derecha?: string; notaDerecha?: string; alPulsar: () => void; etiqueta: string }) {
  const t = useTema();
  const c = coloresDe(t, tonoEstado);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={etiqueta} onPress={alPulsar} android_ripple={{ color: `${t.terracota}22` }} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: ESP[3], paddingVertical: ESP[3], borderTopWidth: 1, borderTopColor: t.linea }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: t.tinta }} numberOfLines={2}>
          {titulo}
        </Text>
        {detalle ? (
          <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }} numberOfLines={2}>
            {detalle}
          </Text>
        ) : null}
        {estado ? (
          <View style={{ alignSelf: "flex-start", marginTop: 2, backgroundColor: c.fondo, borderRadius: RADIO.pildora, paddingHorizontal: ESP[2] + 2, paddingVertical: 2 }}>
            <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs, color: c.texto }}>{estado}</Text>
          </View>
        ) : null}
      </View>
      {derecha ? (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta, fontVariant: ["tabular-nums"] }}>{derecha}</Text>
          {notaDerecha ? <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs, color: t.suave }}>{notaDerecha}</Text> : null}
        </View>
      ) : null}
      <Icono nombre="siguiente" tam={18} color={t.enlace} />
    </Pressable>
  );
}

/** Anillo de avance con un texto al centro (por ejemplo «3/5»). */
export function Anillo({ avance, texto }: { avance: number; texto: string }) {
  const t = useTema();
  const radio = 20;
  const largo = 2 * Math.PI * radio;
  const a = Math.max(0, Math.min(1, avance));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
      <Svg width={52} height={52} viewBox="0 0 48 48" style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={24} cy={24} r={radio} stroke={t.linea} strokeWidth={5} fill="none" />
        <Circle cx={24} cy={24} r={radio} stroke={t.terracota} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${largo}`} strokeDashoffset={largo * (1 - a)} />
      </Svg>
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs + 1, color: t.tinta, fontVariant: ["tabular-nums"] }}>{texto}</Text>
    </View>
  );
}

/** Palomita que se traza al confirmar un envío (aparece completa con movimiento reducido). */
export function Palomita({ tam = 72 }: { tam?: number }) {
  const t = useTema();
  const reducido = useMovimientoReducido();
  const trazo = useRef(new Animated.Value(reducido ? 0 : 40)).current;
  useEffect(() => {
    if (reducido) {
      trazo.setValue(0);
      return;
    }
    trazo.setValue(40);
    Animated.timing(trazo, { toValue: 0, duration: 500, delay: 250, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [reducido, trazo]);
  return (
    <Svg width={tam} height={tam} viewBox="0 0 60 60" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={30} cy={30} r={28} fill={t.verdeTinte} />
      <AnimadoPath d="M17 31l9 9 17-19" fill="none" stroke={t.verde} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" strokeDashoffset={trazo} />
    </Svg>
  );
}

/** Texto de apoyo con un icono de información. */
export function NotaInfo({ children }: { children: ReactNode }) {
  const t = useTema();
  return (
    <View style={{ flexDirection: "row", gap: ESP[2], alignItems: "flex-start" }}>
      <View style={{ marginTop: 2 }}>
        <Icono nombre="info" tam={18} color={t.petroleo} />
      </View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Texto variante="atenuado">{children}</Texto> : children}</View>
    </View>
  );
}

/** Estado del guardado automático, siempre a la vista: nunca se pierde un cambio sin que se note. */
export function IndicadorGuardado({ estado, alReintentar }: { estado: "limpio" | "pendiente" | "guardando" | "error" | "conflicto"; alReintentar: () => void }) {
  const t = useTema();
  if (estado === "error") {
    return (
      <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: ESP[2], flexWrap: "wrap" }}>
        <Icono nombre="alerta" tam={16} color={t.rojo} />
        <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm, color: t.rojo }}>No se pudo guardar.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Reintentar el guardado" onPress={alReintentar} hitSlop={10}>
          <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm, color: t.enlace, textDecorationLine: "underline" }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  const texto = estado === "limpio" ? "Guardado" : estado === "conflicto" ? "Hay cambios por resolver" : "Guardando…";
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: ESP[1] }}>
      {estado === "limpio" ? <Icono nombre="check" tam={14} color={t.verde} grosor={3} /> : null}
      <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs + 1, color: t.suave }}>{texto}</Text>
    </View>
  );
}
