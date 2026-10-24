import { useState } from "react";
import { esFalloApi, mensajeDeFallo } from "../src/api/errores";
import { URL_API } from "../src/config/entorno";
import { Aviso, Boton, Campo, Insignia, Pantalla, Texto } from "../src/ui/componentes";
import { gestor, useSesion } from "../src/sesion/uso";

/** Acceso con los mismos correo y contraseña que la web. La contraseña nunca se guarda: solo el token de la sesión. */
export default function Acceso() {
  const { aviso } = useSesion();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (enviando) return;
    if (correo.trim() === "" || contrasena === "") {
      setError("Indique el correo y la contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await gestor.iniciarSesion(correo.trim(), contrasena);
      // Si fue correcto, la pantalla se reemplaza sola (la guardia de rutas sigue al estado).
    } catch (e) {
      setContrasena("");
      setError(esFalloApi(e) ? mensajeDeFallo(e) : "No se pudo iniciar sesión. Reintente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla formulario bordes={["top", "left", "right", "bottom"]}>
      <Texto variante="titulo">SoftArq DEMO</Texto>
      <Insignia texto="DEMO · datos ilustrativos, sin validez comercial" tono="demo" />
      <Texto variante="atenuado">Inicie sesión con su correo y contraseña de SoftArq.</Texto>
      {aviso ? <Aviso tono={aviso.tipo === "contrasena_cambiada" ? "correcto" : "aviso"} texto={aviso.mensaje} /> : null}
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
      <Texto variante="atenuado">Servidor: {URL_API}</Texto>
    </Pantalla>
  );
}
