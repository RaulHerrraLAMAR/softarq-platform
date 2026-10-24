/**
 * Formulario de cambio de contraseña, compartido por el cambio obligatorio (contraseña temporal) y el voluntario (Perfil).
 * Se valida con el mismo contrato que la API (ayuda al teclear; la API valida siempre). Al cambiarla, el servidor revoca
 * TODAS las sesiones de la persona: la app vuelve al acceso con un aviso.
 */
import { EsquemaCambioContrasena } from "@softarq/contracts/cliente";
import { useState } from "react";
import { esFalloApi, mensajeDeFallo } from "../api/errores";
import { gestor } from "../sesion/instancia";
import { Aviso, Boton, Campo } from "./componentes";

type Errores = Partial<Record<"actual" | "nueva" | "confirmacion" | "general", string>>;

export function FormularioContrasena({ etiquetaActual, textoBoton = "Cambiar contraseña", ocupado }: { etiquetaActual: string; textoBoton?: string; ocupado?: boolean }) {
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
      if (!esFalloApi(e)) {
        setErrores({ general: "No se pudo cambiar la contraseña. Intente de nuevo." });
        return;
      }
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

  const bloqueado = enviando || ocupado === true;
  return (
    <>
      <Campo etiqueta={etiquetaActual} valor={actual} alCambiar={setActual} secreto autoComplete="current-password" tipoContenido="password" editable={!bloqueado} error={errores.actual} />
      <Campo etiqueta="Contraseña nueva" valor={nueva} alCambiar={setNueva} secreto autoComplete="new-password" tipoContenido="newPassword" ayuda="Al menos 12 caracteres y distinta de la actual." editable={!bloqueado} error={errores.nueva} />
      <Campo etiqueta="Confirme la contraseña nueva" valor={confirmacion} alCambiar={setConfirmacion} secreto autoComplete="new-password" tipoContenido="newPassword" alEnviar={() => void enviar()} enterKey="done" editable={!bloqueado} error={errores.confirmacion} />
      {errores.general ? <Aviso tono="error" texto={errores.general} /> : null}
      <Boton texto={textoBoton} alPulsar={() => void enviar()} cargando={enviando} />
    </>
  );
}
