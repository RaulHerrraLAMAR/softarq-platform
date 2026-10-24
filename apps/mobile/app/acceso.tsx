import { useState } from "react";
import { View } from "react-native";
import { esFalloApi, mensajeDeFallo, type FalloApi } from "../src/api/errores";
import { URL_API } from "../src/config/entorno";
import { Aviso, Boton, Campo, Insignia, Pantalla, Texto } from "../src/ui/componentes";
import { Logo } from "../src/ui/iconos";
import { ESP } from "../src/ui/tema";
import { gestor, useSesion } from "../src/sesion/uso";

/** Acceso del cliente con el correo y la contraseña que le dio el equipo. La contraseña nunca se guarda: solo el token de la sesión. */
export default function Acceso() {
  const { aviso } = useSesion();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (enviando) return;
    if (correo.trim() === "" || contrasena === "") {
      setError("Escribe tu correo y tu contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    setFallo(null);
    try {
      await gestor.iniciarSesion(correo.trim(), contrasena);
      // Si fue correcto, la pantalla se reemplaza sola (la guardia de rutas sigue al estado).
    } catch (e) {
      setContrasena("");
      if (esFalloApi(e) && e.tipo === "cuenta_interna") setFallo(e);
      else setError(esFalloApi(e) ? mensajeDeFallo(e) : "No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla formulario bordes={["top", "left", "right", "bottom"]} separacion={ESP[4]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[2], justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[2] }}>
          <Logo tam={30} />
          <Texto variante="subtitulo">SoftArq</Texto>
        </View>
        <Insignia texto="DEMO" tono="demo" />
      </View>
      <View style={{ gap: ESP[1], marginTop: ESP[4] }}>
        <Texto variante="titulo">Bienvenido</Texto>
        <Texto variante="atenuado">Entra con el correo y la contraseña que te dio el equipo de SoftArq para cotizar tu obra.</Texto>
      </View>
      {aviso ? <Aviso tono={aviso.tipo === "contrasena_cambiada" ? "correcto" : "aviso"} texto={aviso.mensaje} /> : null}
      {fallo ? (
        <Aviso tono="aviso" titulo="Esta cuenta es del equipo" texto={`Esta app es para clientes. Para trabajar con tu cuenta entra al panel web${fallo.detalle.panelUrl ? ` (${fallo.detalle.panelUrl})` : ""}.`} />
      ) : null}
      <Campo etiqueta="Correo" valor={correo} alCambiar={setCorreo} teclado="email-address" autoComplete="email" tipoContenido="username" editable={!enviando} />
      <Campo
        etiqueta="Contraseña"
        valor={contrasena}
        alCambiar={setContrasena}
        secreto
        autoComplete="current-password"
        tipoContenido="password"
        alEnviar={() => void enviar()}
        enterKey="go"
        editable={!enviando}
        error={error ?? undefined}
      />
      <Boton texto="Iniciar sesión" alPulsar={() => void enviar()} cargando={enviando} />
      <Texto variante="pequeno">Versión de demostración: los datos son ilustrativos y no tienen validez comercial.{__DEV__ ? `\nServidor: ${URL_API}` : ""}</Texto>
    </Pantalla>
  );
}
