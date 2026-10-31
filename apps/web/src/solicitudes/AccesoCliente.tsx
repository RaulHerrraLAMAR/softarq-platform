/**
 * Acceso del cliente a la app (módulo 17, ADR-0021 §1), en la ficha del cliente. Solo con `personas.administrar`
 * (Administrador del sistema); la API lo exige de todos modos.
 *
 * - Un cliente, una cuenta; por invitación, sin autorregistro. La contraseña temporal (72 h, cambio obligatorio) se
 *   muestra UNA sola vez, en memoria: no se guarda en el navegador ni se vuelve a mostrar (ni se puede consultar).
 * - Desactivar cierra sus sesiones de la app; reactivar no las revive. Restablecer genera otra temporal y cierra sus sesiones.
 * - Toda acción lleva un motivo que queda en la bitácora y una clave de idempotencia por intención.
 */
import type { AccesoCliente as Acceso, RespuestaAltaAcceso } from "@softarq/contracts";
import { useState, type FormEvent } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { Cargando } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import type { ServiciosSolicitudes } from "./servicios.ts";

type Modo = "ninguno" | "crear" | "desactivar" | "activar" | "restablecer";

function CredencialTemporal({ datos, alCerrar }: { datos: RespuestaAltaAcceso; alCerrar: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Aviso tono="aviso" titulo="Contraseña temporal: entréguela al cliente ahora" rol="alert">
      <p>
        Cuenta <strong>{datos.acceso.correo}</strong>. Vence el {formatearInstante(datos.temporalExpiraEn)}; el cliente debe elegir una nueva al entrar. <strong>No se vuelve a mostrar</strong> ni se guarda aquí.
      </p>
      {datos.contrasenaTemporal ? (
        <p>
          <code className="codigo" aria-label="Contraseña temporal">{visible ? datos.contrasenaTemporal : "••••••••••••••••"}</code>{" "}
          <Boton onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
            {visible ? "Ocultar" : "Mostrar"}
          </Boton>
        </p>
      ) : (
        <p className="ayuda">Esta respuesta repetida ya no trae la contraseña: restablezca el acceso para generar otra.</p>
      )}
      <Boton variante="primario" onClick={alCerrar}>
        Ya la entregué
      </Boton>
    </Aviso>
  );
}

export function AccesoCliente({ servicios, clienteId, clienteNombre, clienteActivo }: { servicios: ServiciosSolicitudes; clienteId: string; clienteNombre: string; clienteActivo: boolean }) {
  const { estado, recargar } = useCarga((s) => servicios.acceso(clienteId, s), [clienteId]);
  const { clave, olvidar } = useIntenciones();
  const [modo, setModo] = useState<Modo>("ninguno");
  const [correo, setCorreo] = useState("");
  const [nombre, setNombre] = useState(clienteNombre);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [credencial, setCredencial] = useState<RespuestaAltaAcceso | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando el acceso…" />;
  const sinAcceso = estado.fase === "error" && estado.fallo.tipo === "no_encontrado";
  if (estado.fase === "error" && !sinAcceso) {
    return (
      <Aviso tono="error" titulo="No se pudo consultar el acceso" rol="alert">
        <p>{mensajeDeFallo(estado.fallo)}</p>
        <Boton onClick={recargar}>Reintentar</Boton>
      </Aviso>
    );
  }
  const acceso: Acceso | null = estado.fase === "listo" ? estado.datos : null;

  const terminar = () => {
    setModo("ninguno");
    setMotivo("");
    setFallo(null);
    recargar();
  };

  const ejecutar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setFallo(null);
    const intencion = { modo, clienteId, correo, nombre, motivo };
    const m = motivo.trim();
    const k = clave("acceso-cliente", intencion);
    let r;
    if (modo === "crear") r = await servicios.crearAcceso(clienteId, { correo: correo.trim(), nombre: nombre.trim(), motivo: m }, k);
    else if (modo === "restablecer" && acceso) r = await servicios.restablecerAcceso(acceso.usuarioId, m, k);
    else if ((modo === "desactivar" || modo === "activar") && acceso) r = await servicios.cambiarEstadoAcceso(acceso.usuarioId, modo === "activar", m, k);
    else return;
    setEnviando(false);
    if (!r.ok) {
      if (r.fallo.tipo !== "cancelado") setFallo(r.fallo);
      return;
    }
    olvidar("acceso-cliente", intencion);
    if ("acceso" in r.datos) setCredencial(r.datos);
    setAviso(modo === "desactivar" ? "Acceso desactivado: sus sesiones en la app se cerraron." : modo === "activar" ? "Acceso reactivado. Debe volver a iniciar sesión." : null);
    terminar();
  };

  const puedeEnviar = motivo.trim().length >= 3 && (modo !== "crear" || (correo.includes("@") && nombre.trim().length >= 2)) && !enviando;
  const titulos: Record<Exclude<Modo, "ninguno">, string> = { crear: "Crear el acceso a la app", desactivar: "Desactivar el acceso", activar: "Reactivar el acceso", restablecer: "Restablecer la contraseña" };

  return (
    <section className="seccion" aria-labelledby="titulo-acceso-cliente">
      <h2 id="titulo-acceso-cliente" className="seccion-titulo">
        Acceso a la app del cliente
      </h2>
      {credencial ? <CredencialTemporal datos={credencial} alCerrar={() => setCredencial(null)} /> : null}
      <div aria-live="polite">{aviso ? <Aviso tono="correcto" titulo={aviso} /> : null}</div>
      {acceso ? (
        <dl className="datos-cotizacion">
          <div>
            <dt>Cuenta</dt>
            <dd>{acceso.correo}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              {acceso.activo ? <Insignia tono="estado">Activo</Insignia> : <Insignia tono="menor">Desactivado</Insignia>}{" "}
              {acceso.contrasenaTemporal ? <Insignia tono="alerta">Contraseña temporal pendiente de cambio</Insignia> : null}
            </dd>
          </div>
          <div>
            <dt>Creado</dt>
            <dd>{formatearInstante(acceso.creadoEn)}</dd>
          </div>
        </dl>
      ) : (
        <p className="ayuda">Este cliente todavía no tiene acceso a la app. El acceso es por invitación: no hay autorregistro.</p>
      )}
      {modo === "ninguno" ? (
        <div className="formulario-acciones">
          {!acceso ? (
            <Boton variante="primario" onClick={() => setModo("crear")} disabled={!clienteActivo} title={clienteActivo ? undefined : "Reactive el cliente para crear su acceso"}>
              Crear acceso a la app
            </Boton>
          ) : (
            <>
              {acceso.activo ? <Boton variante="peligro" onClick={() => setModo("desactivar")}>Desactivar acceso</Boton> : <Boton onClick={() => setModo("activar")}>Reactivar acceso</Boton>}
              <Boton onClick={() => setModo("restablecer")}>Restablecer contraseña</Boton>
            </>
          )}
        </div>
      ) : (
        <form className="formulario" onSubmit={(e) => void ejecutar(e)} aria-label={titulos[modo]}>
          <h3>{titulos[modo]}</h3>
          {modo === "crear" ? (
            <>
              <div className="campo">
                <label htmlFor="acceso-correo">Correo del cliente (será su usuario)</label>
                <input id="acceso-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={254} required autoComplete="off" />
              </div>
              <div className="campo">
                <label htmlFor="acceso-nombre">Nombre que verá en la app</label>
                <input id="acceso-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required />
              </div>
            </>
          ) : null}
          {modo === "desactivar" ? <p className="ayuda">Se cierran sus sesiones en la app. Sus solicitudes y cotizaciones se conservan.</p> : null}
          {modo === "restablecer" ? <p className="ayuda">Se genera otra contraseña temporal (72 h) y se cierran sus sesiones. No se cambia ninguna contraseña por el cliente.</p> : null}
          <div className="campo">
            <label htmlFor="acceso-motivo">Motivo (queda en la bitácora)</label>
            <input id="acceso-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required />
          </div>
          {fallo ? (
            <Aviso tono="error" titulo="No se guardó" rol="alert">
              <p>{mensajeDeFallo(fallo)}</p>
            </Aviso>
          ) : null}
          <div className="formulario-acciones">
            <Boton type="submit" variante={modo === "desactivar" ? "peligro" : "primario"} disabled={!puedeEnviar} aria-busy={enviando}>
              {enviando ? "Guardando…" : titulos[modo]}
            </Boton>
            <Boton onClick={() => (setModo("ninguno"), setFallo(null))}>Cancelar</Boton>
          </div>
        </form>
      )}
    </section>
  );
}
