/**
 * Raíz de la app del cliente (ADR-0020, ADR-0021). La navegación sale del estado de sesión que dicta el servidor:
 * - sin sesión → solo `acceso`;
 * - contraseña temporal → solo `cambiar-contrasena`;
 * - sesión activa → el grupo `(app)`.
 * Ocultar rutas es presentación; la API comprueba la sesión y las capacidades en cada solicitud.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { limpiarDocumentos } from "../src/documentos/pdf";
import { Aviso, Boton, Texto } from "../src/ui/componentes";
import { Logo } from "../src/ui/iconos";
import { ESP, useTema } from "../src/ui/tema";
import { gestor, useSesion } from "../src/sesion/uso";

function PantallaInicial() {
  const t = useTema();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.fondo, alignItems: "center", justifyContent: "center", gap: ESP[4] }}>
      <Logo tam={44} />
      <Texto variante="titulo">SoftArq</Texto>
      <ActivityIndicator size="large" color={t.terracota} accessibilityLabel="Abriendo la app" />
    </SafeAreaView>
  );
}

function PantallaSinConexion() {
  const t = useTema();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.fondo, padding: ESP[4], justifyContent: "center" }}>
      <View style={{ gap: ESP[4] }}>
        <Texto variante="titulo">Sin conexión</Texto>
        <Aviso tono="aviso" titulo="No pudimos comprobar tu sesión" texto="Revisa tu conexión e inténtalo de nuevo. Tu sesión sigue guardada en este teléfono." />
        <Boton texto="Reintentar" alPulsar={() => void gestor.reintentarRestauracion()} />
        <Boton texto="Cerrar sesión en este teléfono" alPulsar={() => void gestor.cerrarSesion()} variante="secundario" />
      </View>
    </SafeAreaView>
  );
}

export default function Raiz() {
  const { fase } = useSesion();

  // Abrir la app: leer el token seguro y revalidarlo con el servidor.
  useEffect(() => {
    void gestor.restaurar();
  }, []);

  // Los PDF descargados no sobreviven a la sesión: se borran al abrir la app y al cerrar o perder la sesión.
  useEffect(() => {
    limpiarDocumentos();
    return gestor.alPerderSesion(limpiarDocumentos);
  }, []);

  // Volver a primer plano: revalidar (como mucho una vez por minuto); el servidor conserva la decisión final.
  useEffect(() => {
    const suscripcion = AppState.addEventListener("change", (e) => {
      if (e === "active") void gestor.alVolverAPrimerPlano();
    });
    return () => suscripcion.remove();
  }, []);

  if (fase === "iniciando") return <PantallaInicial />;
  if (fase === "sin_conexion") return <PantallaSinConexion />;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={fase === "anonima"}>
          <Stack.Screen name="acceso" />
        </Stack.Protected>
        <Stack.Protected guard={fase === "cambio_contrasena"}>
          <Stack.Screen name="cambiar-contrasena" />
        </Stack.Protected>
        <Stack.Protected guard={fase === "activa"}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
