import { Stack } from "expo-router";
import { useTema } from "../../src/ui/tema";

/** Pantallas de detalle sobre las pestañas: encabezado nativo con «Atrás» (el botón Atrás de Android funciona igual). */
export default function LayoutApp() {
  const t = useTema();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.tarjeta },
        headerTintColor: t.texto,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: t.fondo },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="cliente/[id]" options={{ title: "Cliente" }} />
      <Stack.Screen name="proyecto/[id]" options={{ title: "Proyecto" }} />
      <Stack.Screen name="cotizacion/[id]/index" options={{ title: "Cotización" }} />
      <Stack.Screen name="cotizacion/[id]/version/[numero]" options={{ title: "Versión" }} />
    </Stack>
  );
}
