import { EsquemaCambioContrasena } from "@softarq/contracts/movil";
import { useState } from "react";
import { esFalloApi, mensajeDeFallo } from "../src/api/errores";
import { Aviso, Boton, Campo, Pantalla, Texto } from "../src/ui/componentes";
import { gestor } from "../src/sesion/uso";

type Errores = Partial<Record<"actual" | "nueva" | "confirmacion" | "general", string>>;

/**
 * Cambio obligatorio de la contraseña temporal. Mientras no se cambie, la API solo permite esto y cerrar
 * sesión. Al cambiarla, el servidor revoca TODAS las sesiones de la persona: se vuelve al acceso.
 * Se valida con el mismo contrato que usa la API (ayuda al teclear; la API valida siempre).
 */
export default function CambiarContrasena() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (enviando) return;
    const r = EsquemaCambioContrasena.safeParse({ actual, nueva, confirmacion });
    if (!r.success) {
      const locales: Errores = {};
      for (const i of r.error.issues) {
        const campo = String(i.path[0]);
        if ((campo === "actual" || campo === "nueva" || campo === "confirmacion") && !locales[campo]) locales[campo] = i.message;
      }
      setErrores(locales);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      await gestor.cambiarContrasena(actual, nueva, confirmacion);
    } catch (e) {
      if (!esFalloApi(e)) return setErrores({ general: "No se pudo cambiar la contraseña. Reintente." });
      const delServidor: Errores = {};
      for (const c of e.detalle.campos ?? []) {
        if ((c.ruta === "actual" || c.ruta === "nueva" || c.ruta === "confirmacion") && !delServidor[c.ruta]) delServidor[c.ruta] = c.mensaje;
      }
      if (Object.keys(delServidor).length === 0) delServidor.general = mensajeDeFallo(e);
      setErrores(delServidor);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla formulario bordes={["top", "left", "right", "bottom"]}>
      <Texto variante="titulo">Cambie su contraseña</Texto>
      <Aviso tono="aviso" texto="Entró con una contraseña temporal. Debe elegir una nueva para continuar; después volverá a iniciar sesión." />
      <Campo etiqueta="Contraseña actual (temporal)" valor={actual} alCambiar={setActual} secreto autoComplete="current-password" tipoContenido="password" editable={!enviando} error={errores.actual} />
      <Campo etiqueta="Contraseña nueva" valor={nueva} alCambiar={setNueva} secreto autoComplete="new-password" tipoContenido="newPassword" ayuda="Al menos 12 caracteres y distinta de la actual." editable={!enviando} error={errores.nueva} />
      <Campo etiqueta="Confirme la contraseña nueva" valor={confirmacion} alCambiar={setConfirmacion} secreto autoComplete="new-password" tipoContenido="newPassword" alEnviar={() => void enviar()} enterKey="done" editable={!enviando} error={errores.confirmacion} />
      {errores.general ? <Aviso tono="error" texto={errores.general} /> : null}
      <Boton texto="Cambiar contraseña" alPulsar={() => void enviar()} cargando={enviando} />
      <Boton texto="Cerrar sesión" alPulsar={() => void gestor.cerrarSesion()} variante="secundario" deshabilitado={enviando} />
    </Pantalla>
  );
}
