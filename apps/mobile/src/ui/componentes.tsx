/**
 * Piezas de interfaz reutilizables (React Native; no se reutilizan componentes DOM de la web).
 * Etiquetas visibles, objetivos táctiles ≥ 48 dp, retroalimentación al tocar (ripple) y roles de
 * accesibilidad. El texto escala con el tamaño de fuente del sistema.
 */
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { mensajeDeFallo, type FalloApi } from "../api/errores";
import type { Tono } from "./etiquetas";
import { ESP, OBJETIVO_MINIMO, RADIO, TEXTO, useTema, type Paleta } from "./tema";

// --- Estructura ---------------------------------------------------------------------------------

interface PropsPantalla {
  children: ReactNode;
  /** Bordes con área segura. Las pantallas con encabezado nativo no necesitan el superior. */
  bordes?: readonly Edge[];
  /** Desplazable y con teclado (formularios). */
  formulario?: boolean;
  refrescando?: boolean;
  alRefrescar?: () => void;
}

export function Pantalla({ children, bordes = ["left", "right", "bottom"], formulario = false, refrescando, alRefrescar }: PropsPantalla) {
  const t = useTema();
  const contenido = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: ESP[4], gap: ESP[3], flexGrow: 1 }}
      {...(alRefrescar ? { refreshControl: <RefreshControl refreshing={refrescando ?? false} onRefresh={alRefrescar} colors={[t.accion]} /> } : {})}
    >
      {children}
    </ScrollView>
  );
  return (
    <SafeAreaView edges={bordes} style={{ flex: 1, backgroundColor: t.fondo }}>
      {formulario ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {contenido}
        </KeyboardAvoidingView>
      ) : (
        contenido
      )}
    </SafeAreaView>
  );
}

// --- Texto --------------------------------------------------------------------------------------

type Variante = "titulo" | "subtitulo" | "cuerpo" | "atenuado" | "etiqueta" | "codigo";

export function Texto({ variante = "cuerpo", children, color, ...resto }: { variante?: Variante; children: ReactNode; color?: string } & Omit<React.ComponentProps<typeof Text>, "style">) {
  const t = useTema();
  const estilo = {
    titulo: { fontSize: TEXTO.xl, fontWeight: "700" as const, color: t.texto },
    subtitulo: { fontSize: TEXTO.lg, fontWeight: "600" as const, color: t.texto },
    cuerpo: { fontSize: TEXTO.md, color: t.texto },
    atenuado: { fontSize: TEXTO.sm, color: t.atenuado },
    etiqueta: { fontSize: TEXTO.sm, fontWeight: "600" as const, color: t.atenuado },
    codigo: { fontSize: TEXTO.sm, fontFamily: Platform.OS === "android" ? "monospace" : "Menlo", color: t.texto },
  }[variante];
  return (
    <Text {...resto} style={color ? { ...estilo, color } : estilo} {...(variante === "titulo" || variante === "subtitulo" ? { accessibilityRole: "header" as const } : {})}>
      {children}
    </Text>
  );
}

// --- Acciones -----------------------------------------------------------------------------------

interface PropsBoton {
  texto: string;
  alPulsar: () => void;
  variante?: "primario" | "secundario";
  deshabilitado?: boolean;
  cargando?: boolean;
  ayuda?: string;
}

export function Boton({ texto, alPulsar, variante = "primario", deshabilitado = false, cargando = false, ayuda }: PropsBoton) {
  const t = useTema();
  const inactivo = deshabilitado || cargando;
  const primario = variante === "primario";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      {...(ayuda ? { accessibilityHint: ayuda } : {})}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={alPulsar}
      android_ripple={{ color: primario ? "#ffffff55" : `${t.accion}33` }}
      style={({ pressed }) => ({
        minHeight: OBJETIVO_MINIMO,
        paddingHorizontal: ESP[4],
        borderRadius: RADIO,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: ESP[2],
        backgroundColor: primario ? t.accion : t.tarjeta,
        borderWidth: primario ? 0 : 1,
        borderColor: t.accion,
        opacity: inactivo ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      {cargando ? <ActivityIndicator color={primario ? t.sobreAccion : t.accion} /> : null}
      <Text style={{ fontSize: TEXTO.md, fontWeight: "600", color: primario ? t.sobreAccion : t.enlace }}>{texto}</Text>
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
}

/** Campo con etiqueta VISIBLE (no solo marcador), error junto al campo y, si es secreto, «Mostrar/Ocultar». */
export function Campo({ etiqueta, valor, alCambiar, error, ayuda, secreto = false, teclado, autoComplete, tipoContenido, alEnviar, enterKey, editable = true }: PropsCampo) {
  const t = useTema();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: ESP[1] }}>
      <Text style={{ fontSize: TEXTO.sm, fontWeight: "600", color: t.texto }}>{etiqueta}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: error ? t.error : t.borde, borderRadius: RADIO, backgroundColor: t.tarjeta }}>
        <TextInput
          accessibilityLabel={etiqueta}
          {...(error ? { accessibilityHint: error } : ayuda ? { accessibilityHint: ayuda } : {})}
          value={valor}
          onChangeText={alCambiar}
          editable={editable}
          secureTextEntry={secreto && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          {...(teclado ? { keyboardType: teclado } : {})}
          {...(autoComplete ? { autoComplete } : {})}
          {...(tipoContenido ? { textContentType: tipoContenido } : {})}
          {...(alEnviar ? { onSubmitEditing: alEnviar } : {})}
          returnKeyType={enterKey ?? "next"}
          placeholderTextColor={t.atenuado}
          style={{ flex: 1, minHeight: OBJETIVO_MINIMO, paddingHorizontal: ESP[3], fontSize: TEXTO.md, color: t.texto }}
        />
        {secreto ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            android_ripple={{ color: `${t.accion}33` }}
            style={{ minHeight: OBJETIVO_MINIMO, minWidth: OBJETIVO_MINIMO, alignItems: "center", justifyContent: "center", paddingHorizontal: ESP[2] }}
          >
            <Text style={{ fontSize: TEXTO.sm, fontWeight: "600", color: t.enlace }}>{visible ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: TEXTO.sm, color: t.error }}>
          {error}
        </Text>
      ) : ayuda ? (
        <Text style={{ fontSize: TEXTO.sm, color: t.atenuado }}>{ayuda}</Text>
      ) : null}
    </View>
  );
}

// --- Tarjetas y filas ---------------------------------------------------------------------------

export function Tarjeta({ children, alPulsar, etiqueta }: { children: ReactNode; alPulsar?: () => void; etiqueta?: string }) {
  const t = useTema();
  const base = { backgroundColor: t.tarjeta, borderRadius: RADIO, borderWidth: 1, borderColor: t.borde, padding: ESP[4], gap: ESP[1] };
  if (!alPulsar) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      {...(etiqueta ? { accessibilityLabel: etiqueta } : {})}
      onPress={alPulsar}
      android_ripple={{ color: `${t.accion}22` }}
      style={({ pressed }) => ({ ...base, minHeight: OBJETIVO_MINIMO, opacity: pressed ? 0.9 : 1 })}
    >
      {children}
    </Pressable>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ gap: ESP[2] }}>
      <Texto variante="subtitulo">{titulo}</Texto>
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

function coloresDe(t: Paleta, tono: Tono): { fondo: string; texto: string } {
  switch (tono) {
    case "info":
      return { fondo: t.infoFondo, texto: t.info };
    case "correcto":
      return { fondo: t.correctoFondo, texto: t.correcto };
    case "aviso":
      return { fondo: t.avisoFondo, texto: t.aviso };
    case "demo":
      return { fondo: t.demoFondo, texto: t.demo };
    case "error":
      return { fondo: t.errorFondo, texto: t.error };
    case "neutro":
      return { fondo: t.suave, texto: t.atenuado };
  }
}

export function Insignia({ texto, tono = "neutro" }: { texto: string; tono?: Tono }) {
  const t = useTema();
  const c = coloresDe(t, tono);
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: c.fondo, borderRadius: 999, paddingHorizontal: ESP[3], paddingVertical: ESP[1] }}>
      <Text style={{ fontSize: TEXTO.xs, fontWeight: "600", color: c.texto }}>{texto}</Text>
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
      <ActivityIndicator size="large" color={t.accion} />
      <Texto variante="atenuado">{texto}</Texto>
    </View>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return (
    <View style={{ padding: ESP[6], alignItems: "center" }}>
      <Texto variante="atenuado">{texto}</Texto>
    </View>
  );
}

export function Aviso({ texto, tono = "info" }: { texto: string; tono?: Tono }) {
  const t = useTema();
  const c = coloresDe(t, tono);
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.fondo, borderRadius: RADIO, padding: ESP[3] }}>
      <Text style={{ fontSize: TEXTO.sm, color: c.texto }}>{texto}</Text>
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
