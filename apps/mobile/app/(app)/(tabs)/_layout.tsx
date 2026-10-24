import { Tabs } from "expo-router";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { useSesion } from "../../../src/sesion/uso";
import { useTema } from "../../../src/ui/tema";

/**
 * Pestañas según las capacidades que entrega el servidor: Clientes y Proyectos con `clientes.consultar`,
 * Cotizaciones con `cotizaciones.consultar`. Quien solo tiene funciones administrativas ve solo «Inicio».
 * Ocultar una pestaña es presentación: la API vuelve a comprobar la capacidad en cada solicitud.
 */
export default function Pestanas() {
  const t = useTema();
  const { sesion } = useSesion();
  const s = seccionesDe(sesion?.capacidades ?? []);
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.tarjeta },
        headerTintColor: t.texto,
        headerTitleStyle: { fontWeight: "600" },
        sceneStyle: { backgroundColor: t.fondo },
        tabBarActiveTintColor: t.enlace,
        tabBarInactiveTintColor: t.atenuado,
        tabBarStyle: { backgroundColor: t.tarjeta, borderTopColor: t.borde },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarIconStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarAccessibilityLabel: "Inicio" }} />
      <Tabs.Screen name="clientes" options={{ title: "Clientes", ...(s.clientes ? {} : { href: null }) }} />
      <Tabs.Screen name="proyectos" options={{ title: "Proyectos", ...(s.proyectos ? {} : { href: null }) }} />
      <Tabs.Screen name="cotizaciones" options={{ title: "Cotizaciones", ...(s.cotizaciones ? {} : { href: null }) }} />
    </Tabs>
  );
}
