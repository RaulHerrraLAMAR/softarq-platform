import { Aviso, Boton, Pantalla, Texto } from "../src/ui/componentes";
import { FormularioContrasena } from "../src/ui/FormularioContrasena";
import { gestor } from "../src/sesion/uso";

/**
 * Cambio obligatorio de la contraseña temporal. Mientras no se cambie, la API solo permite esto y cerrar sesión.
 * Al cambiarla, el servidor revoca TODAS las sesiones de la persona: se vuelve al acceso.
 */
export default function CambiarContrasena() {
  return (
    <Pantalla formulario bordes={["top", "left", "right", "bottom"]}>
      <Texto variante="titulo">Elige tu contraseña</Texto>
      <Aviso tono="aviso" texto="Entraste con una contraseña temporal. Elige una nueva para continuar; después volverás a iniciar sesión." />
      <FormularioContrasena etiquetaActual="Contraseña temporal" />
      <Boton texto="Cerrar sesión" alPulsar={() => void gestor.cerrarSesion()} variante="secundario" />
    </Pantalla>
  );
}
