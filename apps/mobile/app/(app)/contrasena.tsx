import { useRouter } from "expo-router";
import { Aviso, Pantalla } from "../../src/ui/componentes";
import { Encabezado } from "../../src/ui/componentes-captura";
import { FormularioContrasena } from "../../src/ui/FormularioContrasena";

/** Cambio voluntario de contraseña desde el Perfil. Al cambiarla, el servidor cierra todas las sesiones y la app vuelve al acceso. */
export default function Contrasena() {
  const router = useRouter();
  return (
    <Pantalla formulario encabezado={<Encabezado titulo="Cambiar contraseña" alVolver={() => router.back()} />}>
      <Aviso tono="info" texto="Al cambiar tu contraseña se cerrarán tus sesiones y tendrás que entrar de nuevo con la contraseña nueva." />
      <FormularioContrasena etiquetaActual="Contraseña actual" />
    </Pantalla>
  );
}
