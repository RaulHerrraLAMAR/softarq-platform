/**
 * Excepciones congeladas en una versión, con sus decisiones (módulo 10, ADR-0014; B-29
 * `BTN_AutorizarExcepcion`). Contrato interno con capacidad propia (`excepciones.consultar`).
 *
 * - El Revisor ve el valor de catálogo con el que se calculó, el valor aplicado y el motivo antes
 *   de decidir. Autoriza o rechaza cada una con confirmación y comentario opcional; las acciones
 *   permitidas las decide el servidor (BL-17, revisión pendiente).
 * - Una decisión es definitiva para esa versión. Ante un conflicto (otra persona decidió antes) se
 *   muestra la decisión vigente y se conserva el comentario escrito.
 */
import { EsquemaExcepcionesVersion, LIMITES_EXCEPCIONES, type DecisionExcepcion, type ExcepcionesVersion } from "@softarq/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { useCarga } from "../comunes/usarCarga.ts";
import { NOMBRE_CAMPO, NOMBRE_TIPO } from "./modelo.ts";

type Abierta = { numero: number; decision: DecisionExcepcion } | null;

export function PanelExcepcionesVersion({
  servicios,
  cotizacionId,
  numero,
  alDecidir,
}: {
  servicios: Pick<ServiciosCotizaciones, "excepcionesVersion" | "decidirExcepcion">;
  cotizacionId: string;
  numero: number;
  /** Tras una decisión: la pantalla de revisión vuelve a cargar su verificación. */
  alDecidir?: () => void;
}) {
  const base = useId();
  const { estado, recargar, setEstado } = useCarga((signal) => servicios.excepcionesVersion(cotizacionId, numero, signal), [cotizacionId, numero]);
  const [abierta, setAbierta] = useState<Abierta>(null);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<{ fallo: FalloApi; texto: string } | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const intenciones = useIntenciones();
  const bloqueo = useRef(false);
  const vivo = useRef(true);
  const mensaje = useRef<HTMLDivElement>(null);
  const confirmarBoton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => void (vivo.current = false), []);
  useEffect(() => {
    if (fallo || hecho) mensaje.current?.focus();
  }, [fallo, hecho]);
  useEffect(() => {
    if (abierta) confirmarBoton.current?.focus();
  }, [abierta]);

  if (estado.fase === "cargando") return null;
  if (estado.fase === "error") {
    // Sin la capacidad no hay nada que mostrar; otros fallos se informan sin bloquear la pantalla.
    if (estado.fallo.tipo === "sin_permiso" || estado.fallo.tipo === "no_encontrado") return null;
    return (
      <Aviso tono="error" titulo="No se pudieron consultar las excepciones de la versión">
        <p>{mensajeDeFallo(estado.fallo)}</p>
        <Boton onClick={recargar}>Reintentar</Boton>
      </Aviso>
    );
  }
  const datos = estado.datos;
  if (datos.excepciones.length === 0) return null;
  const decidir = datos.acciones.decidir;

  async function confirmar(a: NonNullable<Abierta>, d: ExcepcionesVersion) {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setFallo(null);
    setHecho(null);
    const cuerpo = { versionId: d.versionId, decision: a.decision, comentario: comentario.trim() || null };
    const ambito = `excepcion:${d.revisionId}:${a.numero}`;
    const r = await servicios.decidirExcepcion(d.revisionId!, a.numero, cuerpo, intenciones.clave(ambito, cuerpo));
    bloqueo.current = false;
    if (!vivo.current) return;
    setOcupado(false);
    if (r.ok) {
      intenciones.olvidar(ambito, cuerpo);
      setEstado({ fase: "listo", datos: r.datos });
      setAbierta(null);
      setComentario("");
      setHecho(`Excepción ${a.numero} ${a.decision === "AUTORIZADA" ? "autorizada" : "rechazada"}.`);
      alDecidir?.();
      return;
    }
    if (r.fallo.tipo === "cancelado") return;
    if (r.fallo.tipo === "excepcion" && r.fallo.codigo === "CONFLICTO_EXCEPCION") {
      // Otra persona decidió antes: se muestra lo vigente y se conserva el comentario.
      const vigente = EsquemaExcepcionesVersion.safeParse(r.fallo.excepcionesVigentes);
      if (vigente.success) setEstado({ fase: "listo", datos: vigente.data });
      intenciones.olvidar(ambito, cuerpo);
      setAbierta(null);
      setFallo({ fallo: r.fallo, texto: "Otra persona ya decidió esta excepción. Se muestra la decisión vigente." });
      alDecidir?.();
      return;
    }
    if (r.fallo.tipo === "revision") {
      intenciones.olvidar(ambito, cuerpo);
      setAbierta(null);
      setFallo({ fallo: r.fallo, texto: "La revisión ya no está pendiente o cambió. Actualice para ver su estado vigente." });
      return;
    }
    setFallo({ fallo: r.fallo, texto: mensajeDeFallo(r.fallo) });
  }

  return (
    <section className="seccion seccion-excepciones" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className="seccion-titulo">
        Excepciones de la versión
      </h2>
      <p className="ayuda">
        Registradas por el preparador con su motivo. Aprobar y emitir exigen todas autorizadas por un Revisor distinto del preparador; una rechazada impide
        aprobar esta versión y la corrección es una versión nueva. Datos internos: no aparecen en el PDF.
      </p>
      {hecho || fallo ? (
        <div tabIndex={-1} ref={mensaje}>
          {hecho ? (
            <Aviso tono="correcto" rol="status">
              <p>{hecho}</p>
            </Aviso>
          ) : null}
          {fallo ? (
            <Aviso tono="error" titulo="No se registró la decisión" rol="alert">
              <p>{fallo.texto}</p>
              {fallo.fallo.tipo === "revision" ? <Boton onClick={recargar}>Actualizar</Boton> : null}
            </Aviso>
          ) : null}
        </div>
      ) : null}
      {!decidir.permitida && decidir.motivo && datos.excepciones.some((x) => x.estado === "PENDIENTE") ? <p className="ayuda">{decidir.motivo}</p> : null}
      <ol className="lista-excepciones">
        {datos.excepciones.map((x) => (
          <li key={x.numero} className="tarjeta-excepcion">
            <p className="tarjeta-excepcion-titulo">
              <span>
                Excepción {x.numero} · {NOMBRE_TIPO[x.tipo]}
              </span>{" "}
              <Insignia tono={x.estado === "AUTORIZADA" ? "emitida" : x.estado === "RECHAZADA" ? "alerta" : "neutra"}>
                {x.estado === "PENDIENTE" ? "Pendiente de autorización" : x.estado === "AUTORIZADA" ? "Autorizada" : "Rechazada"}
              </Insignia>
            </p>
            <p>{x.referencia}</p>
            {x.campo ? (
              <dl className="datos-excepcion">
                <div>
                  <dt>{NOMBRE_CAMPO[x.campo]} del catálogo</dt>
                  <dd>{x.valorOriginal ?? "—"}</dd>
                </div>
                <div>
                  <dt>Aplicado en esta versión</dt>
                  <dd>{x.valorAplicado ?? "—"}</dd>
                </div>
              </dl>
            ) : null}
            <p className="texto-largo">
              <span className="etiqueta-en-linea">Motivo:</span> {x.motivo}
            </p>
            {x.decision ? (
              <p className="ayuda">
                {x.estado === "AUTORIZADA" ? "Autorizó" : "Rechazó"} {x.decision.por}, {formatearInstante(x.decision.en)}.
                {x.decision.comentario ? ` Comentario: ${x.decision.comentario}` : ""}
              </p>
            ) : null}
            {x.estado === "PENDIENTE" && decidir.permitida && datos.revisionId ? (
              abierta?.numero === x.numero ? (
                <div className="confirmacion-bloque" role="group" aria-labelledby={`${base}-confirmar-${x.numero}`}>
                  <p id={`${base}-confirmar-${x.numero}`}>
                    {abierta.decision === "AUTORIZADA"
                      ? `Autorizar la excepción ${x.numero} de ${datos.idVersion}. La decisión es definitiva para esta versión.`
                      : `Rechazar la excepción ${x.numero} de ${datos.idVersion}. Esta versión ya no podrá aprobarse; el preparador deberá corregir en una versión nueva.`}
                  </p>
                  <div className="campo">
                    <label className="etiqueta" htmlFor={`${base}-comentario-${x.numero}`}>
                      Comentario (opcional)
                    </label>
                    <textarea
                      id={`${base}-comentario-${x.numero}`}
                      rows={2}
                      maxLength={LIMITES_EXCEPCIONES.comentario}
                      value={comentario}
                      disabled={ocupado}
                      onChange={(e) => setComentario(e.target.value)}
                    />
                  </div>
                  <div className="formulario-acciones">
                    <Boton
                      ref={confirmarBoton}
                      variante={abierta.decision === "AUTORIZADA" ? "primario" : "peligro"}
                      disabled={ocupado}
                      onClick={() => void confirmar(abierta, datos)}
                    >
                      {ocupado ? "Registrando…" : abierta.decision === "AUTORIZADA" ? `Confirmar autorización de la excepción ${x.numero}` : `Confirmar rechazo de la excepción ${x.numero}`}
                    </Boton>
                    <Boton disabled={ocupado} onClick={() => setAbierta(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              ) : (
                <div className="formulario-acciones">
                  <Boton disabled={ocupado} onClick={() => (setFallo(null), setHecho(null), setAbierta({ numero: x.numero, decision: "AUTORIZADA" }))}>
                    Autorizar excepción {x.numero}…
                  </Boton>
                  <Boton variante="peligro" disabled={ocupado} onClick={() => (setFallo(null), setHecho(null), setAbierta({ numero: x.numero, decision: "RECHAZADA" }))}>
                    Rechazar excepción {x.numero}…
                  </Boton>
                </div>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
