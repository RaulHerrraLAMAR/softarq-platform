import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { iniciales } from "../../../src/navegacion/capacidades";
import { rutas } from "../../../src/navegacion/rutas";
import { gestor, useSesion } from "../../../src/sesion/uso";
import { Boton, Hoja, Insignia, Pantalla, Texto } from "../../../src/ui/componentes";
import { Icono } from "../../../src/ui/iconos";
import { ESP, FUENTE, OBJETIVO_MINIMO, TEXTO, useTema } from "../../../src/ui/tema";

function Fila({ titulo, detalle, alPulsar }: { titulo: string; detalle?: string; alPulsar?: () => void }) {
  const t = useTema();
  const contenido = (
    <View style={{ minHeight: OBJETIVO_MINIMO + 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ESP[3], paddingVertical: ESP[2], borderTopWidth: 1, borderTopColor: t.linea }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: t.tinta }}>{titulo}</Text>
        {detalle ? <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>{detalle}</Text> : null}
      </View>
      {alPulsar ? <Icono nombre="siguiente" tam={18} color={t.enlace} /> : null}
    </View>
  );
  return alPulsar ? (
    <Pressable accessibilityRole="button" accessibilityLabel={titulo} onPress={alPulsar}>
      {contenido}
    </Pressable>
  ) : (
    contenido
  );
}

/** Cuenta y sesión del cliente. La cuenta y la sesión se gestionan aquí, no en el inicio. */
export default function Perfil() {
  const t = useTema();
  const router = useRouter();
  const { sesion } = useSesion();
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const nombre = (sesion?.usuario.nombre ?? "").replace(/^\[DEMO\]\s*/i, "");

  const cerrar = async () => {
    setCerrando(true);
    try {
      await gestor.cerrarSesion();
    } finally {
      setCerrando(false);
    }
  };

  return (
    <Pantalla bordes={["top", "left", "right"]}>
      <Texto variante="titulo">Perfil</Texto>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[4] }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: t.petroleoFondo, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.lg, color: t.sobrePetroleo }}>{iniciales(nombre)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.lg, color: t.tinta }}>{nombre}</Text>
          <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>{sesion?.usuario.correo}</Text>
        </View>
      </View>
      {sesion?.organizacion.esDemo ? <Insignia texto="DEMO · datos ilustrativos, sin validez comercial" tono="demo" /> : null}

      <View>
        <Fila titulo="Cambiar contraseña" detalle="Al cambiarla se cerrarán tus sesiones y volverás a entrar." alPulsar={() => router.push(rutas.contrasena)} />
        <Fila titulo="Tamaño de texto" detalle="Sigue el ajuste de tu teléfono." />
        <Fila titulo="Cerrar sesión" alPulsar={() => setConfirmando(true)} />
      </View>
      <Texto variante="atenuado">Tu cuenta es de cliente: solo ves tus propios proyectos y cotizaciones.</Texto>

      <Hoja visible={confirmando} etiqueta="Cerrar sesión" alCerrar={() => setConfirmando(false)}>
        <Texto variante="subtitulo">¿Cerrar sesión?</Texto>
        <Texto variante="atenuado">Tus borradores quedan guardados. Para volver a entrar necesitarás tu correo y contraseña.</Texto>
        <Boton texto="Cerrar sesión" alPulsar={() => void cerrar()} cargando={cerrando} />
        <Boton texto="Cancelar" variante="secundario" alPulsar={() => setConfirmando(false)} deshabilitado={cerrando} />
      </Hoja>
    </Pantalla>
  );
}
