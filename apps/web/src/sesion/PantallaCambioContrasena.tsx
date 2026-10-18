/**
 * Cambio obligatorio de la contraseña temporal (módulo 13, ADR-0017). Mientras la contraseña sea
 * temporal, la API solo permite consultar la sesión, cambiarla y cerrar la sesión: esta pantalla guía,
 * pero la protección está en el servidor.
 *
 * - Pide la contraseña actual (la temporal), la nueva y su confirmación. La política (longitud mínima
 *   y que sea distinta) se comprueba aquí para avisar antes, y de nuevo en el servidor.
 * - Al terminar, el servidor revoca todas las sesiones: se vuelve a la pantalla de acceso.
 * - Las contraseñas solo viven en el estado del formulario; nunca en almacenamiento del navegador.
 */
import { LIMITES_ADMINISTRACION, LIMITES_API, type CambioContrasena, type RespuestaSesion } from "@softarq/contracts";
import { useId, useState, type FormEvent } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";
import type { ResultadoInicio } from "./ProveedorSesion.tsx";

function CampoContrasena({
  etiqueta,
  valor,
  alCambiar,
  autocompletar,
  error,
  ayuda,
  deshabilitado,
  enfocar = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  autocompletar: "current-password" | "new-password";
  error: string | null;
  ayuda?: string;
  deshabilitado: boolean;
  enfocar?: boolean;
}) {
  const id = useId();
  const [mostrar, setMostrar] = useState(false);
  const describe = [error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="campo">
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
      </label>
      <div className="entrada-con-accion">
        <input
          id={id}
          type={mostrar ? "text" : "password"}
          autoComplete={autocompletar}
          spellCheck={false}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          disabled={deshabilitado}
          autoFocus={enfocar}
          maxLength={LIMITES_API.longitudContrasena}
        />
        <Boton onClick={() => setMostrar((v) => !v)} aria-label={mostrar ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`} aria-controls={id} disabled={deshabilitado}>
          {mostrar ? "Ocultar" : "Mostrar"}
        </Boton>
      </div>
      {ayuda ? (
        <p className="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p className="error-campo" id={`${id}-error`}>
          <span className="solo-lector">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const campoDelServidor = (fallo: FalloApi | null, ruta: string) =>
  fallo && (fallo.tipo === "invalida" || fallo.tipo === "administracion") ? (fallo.campos.find((c) => c.ruta === ruta)?.mensaje ?? null) : null;

export function PantallaCambioContrasena({
  sesion,
  alCambiar,
  alCerrar,
}: {
  sesion: RespuestaSesion;
  alCambiar: (datos: CambioContrasena) => Promise<ResultadoInicio>;
  alCerrar: () => Promise<ResultadoInicio>;
}) {
  const id = useId();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);

  const minimo = LIMITES_ADMINISTRACION.contrasenaMinima;
  const errores = {
    actual: actual === "" ? "Escriba la contraseña temporal que le entregaron." : null,
    nueva: nueva.length < minimo ? `La contraseña nueva debe tener al menos ${minimo} caracteres.` : nueva === actual ? "La contraseña nueva debe ser distinta de la temporal." : null,
    confirmacion: confirmacion !== nueva ? "La confirmación no coincide con la contraseña nueva." : null,
  };
  const error = (k: keyof typeof errores) => (intentado ? errores[k] : null) ?? campoDelServidor(fallo, k);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setIntentado(true);
    setFallo(null);
    if (Object.values(errores).some(Boolean)) return;
    setEnviando(true);
    const r = await alCambiar({ actual, nueva, confirmacion });
    // Si fue correcto, esta pantalla se desmonta (vuelve el acceso).
    if (!r.ok) {
      setEnviando(false);
      setFallo(r.fallo);
    }
  };

  const avisoFallo =
    fallo && fallo.tipo !== "invalida" && !(fallo.tipo === "administracion" && fallo.codigo === "CONTRASENA_ACTUAL_INCORRECTA") && fallo.tipo !== "cancelado"
      ? mensajeDeFallo(fallo)
      : null;
  return (
    <div className="acceso">
      <section className="acceso-tarjeta" aria-labelledby={`${id}-titulo`}>
        <h1 id={`${id}-titulo`} className="acceso-titulo" tabIndex={-1}>
          Cambie su contraseña temporal
        </h1>
        <p className="ayuda">
          {sesion.usuario.nombre} · {sesion.organizacion.nombre}
        </p>
        <Aviso tono="info" titulo="Antes de continuar">
          <p>Entró con una contraseña temporal. Hasta cambiarla solo puede hacer esto o cerrar la sesión. Al terminar se cerrarán todas sus sesiones y entrará con la contraseña nueva.</p>
        </Aviso>
        {avisoFallo ? (
          <Aviso tono="error" titulo="No se cambió la contraseña" rol="alert">
            <p>{avisoFallo}</p>
          </Aviso>
        ) : null}
        <form className="acceso-formulario" onSubmit={(e) => void enviar(e)} noValidate aria-busy={enviando}>
          <CampoContrasena etiqueta="Contraseña temporal" enfocar valor={actual} alCambiar={setActual} autocompletar="current-password" error={error("actual")} deshabilitado={enviando} />
          <CampoContrasena
            etiqueta="Contraseña nueva"
            valor={nueva}
            alCambiar={setNueva}
            autocompletar="new-password"
            error={error("nueva")}
            ayuda={`Al menos ${minimo} caracteres. Una frase larga y fácil de recordar es mejor que una corta con símbolos.`}
            deshabilitado={enviando}
          />
          <CampoContrasena etiqueta="Confirmación" valor={confirmacion} alCambiar={setConfirmacion} autocompletar="new-password" error={error("confirmacion")} deshabilitado={enviando} />
          <Boton type="submit" variante="primario" className="acceso-enviar" disabled={enviando} aria-disabled={enviando}>
            {enviando ? "Cambiando…" : "Cambiar contraseña"}
          </Boton>
        </form>
        <div className="formulario-acciones">
          <Boton variante="enlace" onClick={() => void alCerrar()} disabled={enviando}>
            Cerrar sesión
          </Boton>
        </div>
      </section>
    </div>
  );
}
