/**
 * Piezas de interfaz reutilizables de «Obra cálida» (ADR-0022). React Native; no se reutilizan componentes DOM de la web.
 *
 * - Objetivos táctiles ≥ 48 dp, etiquetas visibles, roles de accesibilidad y texto que escala con el sistema.
 * - Profundidad con capas sólidas (`Relieve`): una cara que se hunde al tocar sobre un borde inferior. Con movimiento
 *   reducido el cambio es directo, sin animar.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { mensajeDeFallo, type FalloApi } from "../api/errores";
import { Icono, type NombreIcono } from "./iconos";
import { useMovimientoReducido } from "./movimiento";
import { coloresDe, ESP, FUENTE, OBJETIVO_MINIMO, RADIO, TEXTO, useTema, type Tono } from "./tema";

// --- Estructura ---------------------------------------------------------------------------------

interface PropsPantalla {
  children: ReactNode;
  /** Bordes con área segura. Las pantallas con encabezado propio no necesitan el superior. */
  bordes?: readonly Edge[];
  /** Pantalla con teclado (formularios): se desplaza para no tapar el campo. */
  formulario?: boolean;
  refrescando?: boolean;
  alRefrescar?: () => void;
  /** `false` para pantallas con bandas a sangre (el inicio); cada banda pone su propio margen. */
  relleno?: boolean;
  /** Barra fija al pie (acciones de la pantalla). */
  pie?: ReactNode;
  /** Encabezado fijo arriba (volver, título y avance); con él la pantalla respeta el área segura superior. */
  encabezado?: ReactNode;
  /** Distancia entre bloques. */
  separacion?: number;
}

export function Pantalla({ children, bordes = ["left", "right", "bottom"], formulario = false, refrescando, alRefrescar, relleno = true, pie, encabezado, separacion = ESP[4] }: PropsPantalla) {
  const t = useTema();
  const contenido = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ ...(relleno ? { padding: ESP[4], gap: separacion } : {}), flexGrow: 1 }}
      {...(alRefrescar ? { refreshControl: <RefreshControl refreshing={refrescando ?? false} onRefresh={alRefrescar} colors={[t.terracota]} progressBackgroundColor={t.papel} /> } : {})}
    >
      {children}
    </ScrollView>
  );
  const area = (
    <>
      <View style={{ flex: 1 }}>{contenido}</View>
      {pie}
    </>
  );
  return (
    <SafeAreaView edges={encabezado && !bordes.includes("top") ? [...bordes, "top"] : bordes} style={{ flex: 1, backgroundColor: t.fondo }}>
      {encabezado}
      {/* La app dibuja de borde a borde: en Android el teclado no reduce la ventana, así que el contenedor reserva su altura
          (también bajo la barra de acciones, para que «Atrás» y «Continuar» sigan a la vista). */}
      {formulario ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {area}
        </KeyboardAvoidingView>
      ) : (
        area
      )}
    </SafeAreaView>
  );
}

/** Barra fija al pie con las acciones de la pantalla. */
export function BarraAccion({ children }: { children: ReactNode }) {
  const t = useTema();
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: t.fondo, borderTopWidth: 1, borderTopColor: t.linea, paddingHorizontal: ESP[4], paddingTop: ESP[3], paddingBottom: Math.max(bottom, ESP[3]), gap: ESP[2] }}>{children}</View>
  );
}

// --- Texto --------------------------------------------------------------------------------------

type Variante = "titulo" | "subtitulo" | "cuerpo" | "atenuado" | "etiqueta" | "codigo" | "importe" | "cifra" | "pequeno";

export function Texto({ variante = "cuerpo", children, color, centrado = false, ...resto }: { variante?: Variante; children: ReactNode; color?: string; centrado?: boolean } & Omit<React.ComponentProps<typeof Text>, "style">) {
  const t = useTema();
  const base = {
    titulo: { fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.xl, lineHeight: TEXTO.xl * 1.12, letterSpacing: -0.6, color: t.tinta },
    subtitulo: { fontFamily: FUENTE.titulo, fontSize: TEXTO.lg, lineHeight: TEXTO.lg * 1.2, letterSpacing: -0.3, color: t.tinta },
    cuerpo: { fontFamily: FUENTE.texto, fontSize: TEXTO.md, lineHeight: TEXTO.md * 1.45, color: t.tinta },
    atenuado: { fontFamily: FUENTE.texto, fontSize: TEXTO.sm, lineHeight: TEXTO.sm * 1.45, color: t.suave },
    pequeno: { fontFamily: FUENTE.texto, fontSize: TEXTO.xs, lineHeight: TEXTO.xs * 1.4, color: t.suave },
    etiqueta: { fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs, lineHeight: TEXTO.xs * 1.4, letterSpacing: 1.1, textTransform: "uppercase" as const, color: t.suave },
    codigo: { fontFamily: Platform.OS === "android" ? "monospace" : "Menlo", fontSize: TEXTO.sm, color: t.tinta },
    importe: { fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.importe, lineHeight: TEXTO.importe * 1.05, letterSpacing: -1.4, color: t.tinta, fontVariant: ["tabular-nums" as const] },
    cifra: { fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta, fontVariant: ["tabular-nums" as const] },
  }[variante];
  const estilo = { ...base, ...(color ? { color } : {}), ...(centrado ? { textAlign: "center" as const } : {}) };
  return (
    <Text {...resto} style={estilo} {...(variante === "titulo" || variante === "subtitulo" ? { accessibilityRole: "header" as const } : {})}>
      {children}
    </Text>
  );
}

// --- Relieve y acciones -------------------------------------------------------------------------

/**
 * Cara sobre un borde sólido: al «hundir» la cara baja `profundidad` y cubre el borde. `hundimiento` es el
 * desplazamiento actual (0 = relieve completo).
 */
export function Relieve({ children, colorBase, profundidad, radio, hundimiento }: { children: ReactNode; colorBase: string; profundidad: number; radio: number; hundimiento: Animated.Value | number }) {
  return (
    <View style={{ paddingBottom: profundidad }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: profundidad, bottom: 0, borderRadius: radio, backgroundColor: colorBase }} />
      <Animated.View style={{ transform: [{ translateY: hundimiento }] }}>{children}</Animated.View>
    </View>
  );
}

/** Hunde y suelta una cara con animación nativa (o directo con movimiento reducido). */
export function useHundimiento(profundidad: number) {
  const reducido = useMovimientoReducido();
  const y = useRef(new Animated.Value(0)).current;
  const hundir = (abajo: boolean) => {
    const destino = abajo ? profundidad * 0.8 : 0;
    if (reducido) {
      y.setValue(destino);
      return;
    }
    Animated.timing(y, { toValue: destino, duration: abajo ? 60 : 200, easing: abajo ? Easing.out(Easing.quad) : Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  };
  return { y, hundir };
}

interface PropsBoton {
  texto: string;
  alPulsar: () => void;
  variante?: "primario" | "petroleo" | "secundario";
  subtitulo?: string;
  icono?: NombreIcono;
  deshabilitado?: boolean;
  cargando?: boolean;
  ayuda?: string;
}

const PROFUNDIDAD_BOTON = 6;

/** Botón con volumen: cara de color sobre un borde sólido que se hunde al tocar. */
export function Boton({ texto, alPulsar, variante = "primario", subtitulo, icono, deshabilitado = false, cargando = false, ayuda }: PropsBoton) {
  const t = useTema();
  const inactivo = deshabilitado || cargando;
  const { y, hundir } = useHundimiento(PROFUNDIDAD_BOTON);
  const p = inactivo
    ? { cara: t.hundido, base: t.linea, texto: t.suave, borde: "transparent" }
    : variante === "primario"
      ? { cara: t.terracota, base: t.terracotaBorde, texto: t.sobreTerracota, borde: "transparent" }
      : variante === "petroleo"
        ? { cara: t.petroleoFondo, base: t.petroleoBorde, texto: t.sobrePetroleo, borde: "transparent" }
        : { cara: t.papel, base: t.tinta, texto: t.tinta, borde: t.tinta };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitulo ? `${texto}. ${subtitulo}` : texto}
      {...(ayuda ? { accessibilityHint: ayuda } : {})}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={alPulsar}
      onPressIn={() => hundir(true)}
      onPressOut={() => hundir(false)}
    >
      <Relieve colorBase={p.base} profundidad={PROFUNDIDAD_BOTON} radio={RADIO.medio} hundimiento={y}>
        <View
          style={{
            minHeight: 56,
            borderRadius: RADIO.medio,
            backgroundColor: p.cara,
            borderWidth: variante === "secundario" && !inactivo ? 2 : 0,
            borderColor: p.borde,
            paddingHorizontal: ESP[5],
            paddingVertical: ESP[3],
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: ESP[2],
          }}
        >
          {cargando ? <ActivityIndicator color={t.suave} /> : icono ? <Icono nombre={icono} color={p.texto} tam={20} grosor={2.6} /> : null}
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: p.texto, textAlign: "center" }}>{texto}</Text>
            {subtitulo ? <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs, color: p.texto, textAlign: "center", opacity: 0.92 }}>{subtitulo}</Text> : null}
          </View>
        </View>
      </Relieve>
    </Pressable>
  );
}

/** Acción de texto subrayada (acción secundaria dentro de un bloque). */
export function Enlace({ texto, alPulsar, ayuda, deshabilitado = false }: { texto: string; alPulsar: () => void; ayuda?: string; deshabilitado?: boolean }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      {...(ayuda ? { accessibilityHint: ayuda } : {})}
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={alPulsar}
      hitSlop={6}
      style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: ESP[1] }}
    >
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: deshabilitado ? t.suave : t.enlace, textDecorationLine: "underline" }}>{texto}</Text>
    </Pressable>
  );
}

// --- Formularios --------------------------------------------------------------------------------

interface PropsCampo {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  error?: string | undefined;
  ayuda?: string;
  secreto?: boolean;
  teclado?: KeyboardTypeOptions;
  autoComplete?: TextInputProps["autoComplete"];
  tipoContenido?: TextInputProps["textContentType"];
  alEnviar?: () => void;
  enterKey?: TextInputProps["returnKeyType"];
  editable?: boolean;
  maximo?: number;
  multilinea?: boolean;
  /** Mayúsculas y autocorrección: desactivadas para correos y contraseñas, activas para texto libre. */
  textoLibre?: boolean;
}

/** Campo con etiqueta VISIBLE (no solo marcador), error junto al campo y, si es secreto, «Mostrar/Ocultar». */
export function Campo({ etiqueta, valor, alCambiar, error, ayuda, secreto = false, teclado, autoComplete, tipoContenido, alEnviar, enterKey, editable = true, maximo, multilinea = false, textoLibre = false }: PropsCampo) {
  const t = useTema();
  const [visible, setVisible] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={{ gap: ESP[1] }}>
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm, color: t.tinta }}>{etiqueta}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: multilinea ? "flex-start" : "center",
          borderWidth: 2,
          borderColor: error ? t.rojo : enfocado ? t.petroleo : t.linea,
          borderRadius: RADIO.chico + 4,
          backgroundColor: error ? t.rojoTinte : t.papel,
        }}
      >
        <TextInput
          accessibilityLabel={etiqueta}
          {...(error ? { accessibilityHint: error } : ayuda ? { accessibilityHint: ayuda } : {})}
          value={valor}
          onChangeText={alCambiar}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          editable={editable}
          secureTextEntry={secreto && !visible}
          autoCapitalize={textoLibre ? "sentences" : "none"}
          autoCorrect={textoLibre}
          spellCheck={textoLibre}
          multiline={multilinea}
          {...(maximo ? { maxLength: maximo } : {})}
          {...(teclado ? { keyboardType: teclado } : {})}
          {...(autoComplete ? { autoComplete } : {})}
          {...(tipoContenido ? { textContentType: tipoContenido } : {})}
          {...(alEnviar ? { onSubmitEditing: alEnviar } : {})}
          returnKeyType={enterKey ?? "next"}
          placeholderTextColor={t.suave}
          style={{ flex: 1, minHeight: OBJETIVO_MINIMO + 4, paddingHorizontal: ESP[3], paddingVertical: multilinea ? ESP[3] : 0, fontFamily: FUENTE.textoMedio, fontSize: TEXTO.md, color: t.tinta, textAlignVertical: multilinea ? "top" : "center" }}
        />
        {secreto ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            style={{ minHeight: OBJETIVO_MINIMO, minWidth: OBJETIVO_MINIMO, alignItems: "center", justifyContent: "center", paddingHorizontal: ESP[2] }}
          >
            <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm, color: t.enlace }}>{visible ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: FUENTE.textoMedio, fontSize: TEXTO.sm, color: t.rojo }}>
          {error}
        </Text>
      ) : ayuda ? (
        <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>{ayuda}</Text>
      ) : null}
    </View>
  );
}

// --- Tarjetas, filas y datos --------------------------------------------------------------------

export function Tarjeta({ children, alPulsar, etiqueta }: { children: ReactNode; alPulsar?: () => void; etiqueta?: string }) {
  const t = useTema();
  const base = { backgroundColor: t.papel, borderRadius: RADIO.medio, borderWidth: 1, borderColor: t.linea, padding: ESP[4], gap: ESP[1] };
  if (!alPulsar) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" {...(etiqueta ? { accessibilityLabel: etiqueta } : {})} onPress={alPulsar} android_ripple={{ color: `${t.terracota}22` }} style={({ pressed }) => ({ ...base, minHeight: OBJETIVO_MINIMO, opacity: pressed ? 0.92 : 1 })}>
      {children}
    </Pressable>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ gap: ESP[2] }}>
      <Texto variante="etiqueta">{titulo}</Texto>
      {children}
    </View>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <View accessible accessibilityLabel={typeof valor === "string" ? `${etiqueta}: ${valor}` : etiqueta} style={{ gap: 2 }}>
      <Texto variante="etiqueta">{etiqueta}</Texto>
      {typeof valor === "string" ? <Texto>{valor}</Texto> : valor}
    </View>
  );
}

export function Insignia({ texto, tono = "neutro" }: { texto: string; tono?: Tono }) {
  const t = useTema();
  const c = coloresDe(t, tono);
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: c.fondo, borderRadius: RADIO.pildora, paddingHorizontal: ESP[3], paddingVertical: ESP[1] }}>
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs, color: c.texto }}>{texto}</Text>
    </View>
  );
}

/** Marca de demostración (AGENTS.md §4): visible siempre que la organización es DEMO. */
export function MarcaDemo({ esDemo }: { esDemo: boolean }) {
  return esDemo ? <Insignia texto="DEMO · datos ilustrativos, sin validez comercial" tono="demo" /> : null;
}

// --- Estados ------------------------------------------------------------------------------------

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  const t = useTema();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={texto} style={{ alignItems: "center", gap: ESP[3], padding: ESP[6] }}>
      <ActivityIndicator size="large" color={t.terracota} />
      <Texto variante="atenuado">{texto}</Texto>
    </View>
  );
}

/** Bloque gris que late mientras llega el contenido (sin animar con movimiento reducido). */
export function Esqueleto({ alto = 64, ancho }: { alto?: number; ancho?: number | `${number}%` }) {
  const t = useTema();
  const reducido = useMovimientoReducido();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducido) {
      o.setValue(1);
      return;
    }
    const bucle = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true })]));
    bucle.start();
    return () => bucle.stop();
  }, [reducido, o]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: alto, ...(ancho !== undefined ? { width: ancho } : {}), borderRadius: RADIO.medio, backgroundColor: t.hundido, opacity: o }} />;
}

export function Vacio({ texto, titulo, ilustracion, accion }: { texto: string; titulo?: string; ilustracion?: ReactNode; accion?: ReactNode }) {
  return (
    <View style={{ padding: ESP[6], alignItems: "center", gap: ESP[3] }}>
      {ilustracion}
      {titulo ? <Texto variante="subtitulo" centrado>{titulo}</Texto> : null}
      <Texto variante="atenuado" centrado>{texto}</Texto>
      {accion}
    </View>
  );
}

export function Aviso({ texto, tono = "info", titulo, icono }: { texto: string; tono?: Tono; titulo?: string; icono?: NombreIcono }) {
  const t = useTema();
  const c = coloresDe(t, tono);
  const nombre = icono ?? (tono === "error" ? "alerta" : tono === "correcto" ? "check" : "info");
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.fondo, borderRadius: RADIO.medio, padding: ESP[3], flexDirection: "row", gap: ESP[2], alignItems: "flex-start" }}>
      <View style={{ marginTop: 2 }}>
        <Icono nombre={nombre} tam={18} color={tono === "correcto" ? t.verde : c.texto} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {titulo ? <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm, color: c.texto }}>{titulo}</Text> : null}
        <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, lineHeight: TEXTO.sm * 1.45, color: c.texto }}>{texto}</Text>
      </View>
    </View>
  );
}

/** Error de una consulta con reintento visible (la red o el servidor pueden fallar; la persona decide). */
export function ErrorConsulta({ fallo, alReintentar }: { fallo: FalloApi; alReintentar: () => void }) {
  return (
    <View style={{ gap: ESP[3] }}>
      <Aviso tono="error" texto={mensajeDeFallo(fallo)} />
      {fallo.tipo === "sesion" || fallo.tipo === "sin_permiso" ? null : <Boton texto="Reintentar" alPulsar={alReintentar} variante="secundario" />}
    </View>
  );
}

// --- Desplegable y hoja inferior ----------------------------------------------------------------

/** Bloque que se abre y se cierra (detalles que no hacen falta de entrada). */
export function Desplegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  const t = useTema();
  const [abierto, setAbierto] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={titulo}
        accessibilityState={{ expanded: abierto }}
        onPress={() => setAbierto((a) => !a)}
        style={{ minHeight: OBJETIVO_MINIMO, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta }}>{titulo}</Text>
        <View style={{ transform: [{ rotate: abierto ? "180deg" : "0deg" }] }}>
          <Icono nombre="abajo" />
        </View>
      </Pressable>
      {abierto ? <View style={{ paddingBottom: ESP[2] }}>{children}</View> : null}
    </View>
  );
}

/** Hoja que sube desde abajo (confirmaciones). Atrás de Android la cierra si `alCerrar` existe. */
export function Hoja({ visible, children, alCerrar, etiqueta }: { visible: boolean; children: ReactNode; alCerrar?: () => void; etiqueta: string }) {
  const t = useTema();
  const reducido = useMovimientoReducido();
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={reducido ? "none" : "slide"} onRequestClose={alCerrar ?? (() => {})} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.velo, justifyContent: "flex-end" }}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={etiqueta}
          style={{ backgroundColor: t.papel, borderTopLeftRadius: RADIO.grande + 6, borderTopRightRadius: RADIO.grande + 6, paddingHorizontal: ESP[5], paddingTop: ESP[6], paddingBottom: Math.max(bottom, ESP[4]) + ESP[2], gap: ESP[3] }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
