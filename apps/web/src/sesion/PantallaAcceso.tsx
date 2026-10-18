/**
 * Pantalla de acceso con correo y contraseña (ADR-0007; UI UX Pro Max: etiquetas visibles,
 * autocompletado y pegado permitidos, mostrar u ocultar la contraseña, estado de envío y errores
 * anunciados). No incluye credenciales ni acceso automático.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import type { FalloApi } from "../api/cliente.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";
import type { MotivoAcceso, ResultadoInicio } from "./ProveedorSesion.tsx";

function mensajeAcceso(fallo: FalloApi): { titulo: string; texto: string } {
  switch (fallo.tipo) {
    case "credenciales":
      return { titulo: "No se pudo iniciar sesión", texto: "Correo o contraseña incorrectos. Revise los datos e inténtelo de nuevo." };
    case "temporal_caducada":
      return { titulo: "La contraseña temporal caducó", texto: "Pida al Administrador del sistema un restablecimiento; le entregará una contraseña temporal nueva." };
    case "limite": {
      const min = fallo.reintentarEnSegundos !== null ? Math.max(1, Math.ceil(fallo.reintentarEnSegundos / 60)) : null;
      return {
        titulo: "Demasiados intentos",
        texto: min !== null ? `Espere ${min} min antes de volver a intentarlo.` : "Espere unos minutos antes de volver a intentarlo.",
      };
    }
    case "csrf":
      return { titulo: "El formulario caducó", texto: "Vuelva a pulsar «Iniciar sesión»." };
    case "invalida":
      return { titulo: "Datos no válidos", texto: "Revise el correo y la contraseña." };
    case "red":
      return { titulo: "Sin conexión", texto: "No hay conexión con el servicio. Compruebe que la API esté iniciada." };
    case "no_disponible":
      return { titulo: "Servicio no disponible", texto: "El servicio no está disponible en este momento. Inténtelo más tarde." };
    default:
      return { titulo: "No se pudo iniciar sesión", texto: "El servicio no pudo atender la solicitud. Inténtelo de nuevo." };
  }
}

export function PantallaAcceso({
  motivo,
  alIniciar,
}: {
  motivo: MotivoAcceso;
  alIniciar: (correo: string, contrasena: string) => Promise<ResultadoInicio>;
}) {
  const id = useId();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const refCorreo = useRef<HTMLInputElement>(null);
  const refContrasena = useRef<HTMLInputElement>(null);

  const errorCorreo = intentado && correo.trim() === "" ? "Escriba su correo." : null;
  const errorContrasena = intentado && contrasena === "" ? "Escriba su contraseña." : null;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setIntentado(true);
    setFallo(null);
    if (correo.trim() === "") return refCorreo.current?.focus();
    if (contrasena === "") return refContrasena.current?.focus();
    setEnviando(true);
    const r = await alIniciar(correo.trim(), contrasena);
    // Si el acceso fue correcto, esta pantalla se desmonta.
    if (!r.ok) {
      setEnviando(false);
      setFallo(r.fallo);
    }
  };

  const m = fallo ? mensajeAcceso(fallo) : null;
  return (
    <div className="acceso">
      <section className="acceso-tarjeta" aria-labelledby={`${id}-titulo`}>
        <h1 id={`${id}-titulo`} className="acceso-titulo">
          Iniciar sesión
        </h1>
        <p className="ayuda">Cotizador de estructuras · entorno DEMO local.</p>

        {motivo === "vencida" ? (
          <Aviso tono="aviso" titulo="Su sesión terminó" rol="status">
            <p>Venció por inactividad o tiempo máximo, o se cerró en el servidor. Inicie sesión de nuevo; la captura anterior no se conservó.</p>
          </Aviso>
        ) : motivo === "contrasena_cambiada" ? (
          <Aviso tono="correcto" titulo="Contraseña cambiada" rol="status">
            <p>Se cerraron todas sus sesiones. Inicie sesión con su contraseña nueva.</p>
          </Aviso>
        ) : motivo === "cerrada" ? (
          <Aviso tono="correcto" titulo="Sesión cerrada" rol="status">
            <p>La captura y los resultados de la sesión anterior se descartaron.</p>
          </Aviso>
        ) : null}

        {m ? (
          <Aviso tono="error" titulo={m.titulo} rol="alert">
            <p>{m.texto}</p>
          </Aviso>
        ) : null}

        <form className="acceso-formulario" onSubmit={(e) => void enviar(e)} noValidate aria-busy={enviando}>
          <div className="campo">
            <label htmlFor={`${id}-correo`} className="etiqueta">
              Correo
            </label>
            <input
              ref={refCorreo}
              id={`${id}-correo`}
              type="email"
              name="correo"
              autoComplete="username"
              inputMode="email"
              spellCheck={false}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              aria-invalid={errorCorreo ? true : undefined}
              aria-describedby={errorCorreo ? `${id}-correo-error` : undefined}
              disabled={enviando}
              maxLength={254}
            />
            {errorCorreo ? (
              <p className="error-campo" id={`${id}-correo-error`}>
                <span className="solo-lector">Error: </span>
                {errorCorreo}
              </p>
            ) : null}
          </div>

          <div className="campo">
            <label htmlFor={`${id}-contrasena`} className="etiqueta">
              Contraseña
            </label>
            <div className="entrada-con-accion">
              <input
                ref={refContrasena}
                id={`${id}-contrasena`}
                type={mostrar ? "text" : "password"}
                name="contrasena"
                autoComplete="current-password"
                spellCheck={false}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                aria-invalid={errorContrasena ? true : undefined}
                aria-describedby={errorContrasena ? `${id}-contrasena-error` : undefined}
                disabled={enviando}
                maxLength={128}
              />
              {/* El nombre accesible cambia con el estado («Mostrar/Ocultar contraseña») e incluye el texto visible. */}
              <Boton
                onClick={() => setMostrar((v) => !v)}
                aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-controls={`${id}-contrasena`}
                disabled={enviando}
              >
                {mostrar ? "Ocultar" : "Mostrar"}
              </Boton>
            </div>
            {errorContrasena ? (
              <p className="error-campo" id={`${id}-contrasena-error`}>
                <span className="solo-lector">Error: </span>
                {errorContrasena}
              </p>
            ) : null}
          </div>

          <Boton type="submit" variante="primario" className="acceso-enviar" disabled={enviando} aria-disabled={enviando}>
            {enviando ? "Verificando…" : "Iniciar sesión"}
          </Boton>
        </form>

        <p className="ayuda acceso-nota">
          Las cuentas DEMO se crean en este equipo con <code>db:cargar-usuarios-demo</code>; sus accesos están en el archivo local
          indicado en <code>HANDOFF.md</code>. La sesión vence tras 30 minutos sin actividad.
        </p>
      </section>
    </div>
  );
}
