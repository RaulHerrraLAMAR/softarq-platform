import { Stack } from "expo-router";
import { useMovimientoReducido } from "../../src/ui/movimiento";
import { useTema } from "../../src/ui/tema";

/**
 * Pantallas del cliente sobre las pestañas. Cada pantalla pone su propio encabezado («Obra cálida»); el botón Atrás de
 * Android y el gesto de volver funcionan con la pila nativa. Con movimiento reducido no hay transición.
 */
export default function LayoutApp() {
  const t = useTema();
  const reducido = useMovimientoReducido();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.fondo }, animation: reducido ? "none" : "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="nueva" />
      <Stack.Screen name="solicitud/[id]" />
      <Stack.Screen name="cotizacion/[id]" />
      <Stack.Screen name="contrasena" />
    </Stack>
  );
}
