import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
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
  const { sesion } = useSesion();
  const s = seccionesDe(sesion?.capacidades ?? []);
  const icono = (nombre: NombreIcono) =>
    function IconoPestana({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Icono nombre={nombre} tam={focused ? 26 : 24} color={typeof color === "string" ? color : t.suave} />;
    };
  const etiqueta = (texto: string) =>
    function EtiquetaPestana({ color }: { color: ColorValue }) {
      return <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: 12, color: typeof color === "string" ? color : t.suave }}>{texto}</Text>;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.fondo },
        tabBarActiveTintColor: t.enlace,
        tabBarInactiveTintColor: t.suave,
        tabBarStyle: { backgroundColor: t.papel, borderTopColor: t.linea, height: 64, paddingBottom: 6, paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarAccessibilityLabel: "Inicio", tabBarIcon: icono("inicio"), tabBarLabel: etiqueta("Inicio") }} />
      <Tabs.Screen name="mias" options={{ title: "Mis cotizaciones", tabBarAccessibilityLabel: "Mis cotizaciones", tabBarIcon: icono("doc"), tabBarLabel: etiqueta("Mis cotizaciones"), ...(s.solicitudes || s.cotizaciones ? {} : { href: null }) }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarAccessibilityLabel: "Perfil", tabBarIcon: icono("yo"), tabBarLabel: etiqueta("Perfil") }} />
    </Tabs>
  );
}
