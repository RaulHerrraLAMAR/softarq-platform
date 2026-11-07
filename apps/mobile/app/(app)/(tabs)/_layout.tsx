import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { useSesion } from "../../../src/sesion/uso";
import { Icono, type NombreIcono } from "../../../src/ui/iconos";
import { FUENTE, useTema } from "../../../src/ui/tema";

/**
 * Pestañas del cliente: Inicio · Mis cotizaciones · Perfil. «Mis cotizaciones» solo se ofrece si el servidor le dio la
 * capacidad de solicitudes o cotizaciones. Ocultar una pestaña es presentación: la API vuelve a comprobar la capacidad.
 */
export default function Pestanas() {
  const t = useTema();
  // Área segura inferior: con la navegación de tres botones de Android la barra quedaba debajo de ellos (hallazgo en el teléfono, 07/11/2026).
  const { bottom } = useSafeAreaInsets();
  const { sesion } = useSesion();
  const s = seccionesDe(sesion?.capacidades ?? []);
  const icono = (nombre: NombreIcono) =>
    function IconoPestana({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Icono nombre={nombre} tam={focused ? 26 : 24} color={typeof color === "string" ? color : t.suave} />;
    };
  const etiqueta = (texto: string) =>
    function EtiquetaPestana({ color }: { color: ColorValue }) {
      // Una sola línea y con tope de escala: con texto grande la etiqueta se partía y rozaba la barra del sistema.
      return <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2} style={{ fontFamily: FUENTE.textoFuerte, fontSize: 12, color: typeof color === "string" ? color : t.suave }}>{texto}</Text>;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.fondo },
        tabBarActiveTintColor: t.enlace,
        tabBarInactiveTintColor: t.suave,
        tabBarStyle: { backgroundColor: t.papel, borderTopColor: t.linea, height: 64 + bottom, paddingBottom: 6 + bottom, paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarAccessibilityLabel: "Inicio", tabBarIcon: icono("inicio"), tabBarLabel: etiqueta("Inicio") }} />
      <Tabs.Screen name="mias" options={{ title: "Mis cotizaciones", tabBarAccessibilityLabel: "Mis cotizaciones", tabBarIcon: icono("doc"), tabBarLabel: etiqueta("Mis cotizaciones"), ...(s.solicitudes || s.cotizaciones ? {} : { href: null }) }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarAccessibilityLabel: "Perfil", tabBarIcon: icono("yo"), tabBarLabel: etiqueta("Perfil") }} />
    </Tabs>
  );
}
