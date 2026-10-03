/**
 * Revisión y aprobación de versiones (módulo 7, ADR-0009).
 *
 * - Bandeja (`#/revisiones`) y detalle (`#/revisiones/{id}`): la versión revisada tal como se
 *   guardó (proyección comercial), la verificación vigente que hace el servidor, el historial y las
 *   acciones que el servidor permite a la sesión (`acciones`). La web no decide permisos ni BL-17.
 * - Las decisiones citan la versión y la ficha vistas: si otra persona decidió antes o la pantalla
 *   está obsoleta, el servidor responde 409 con el estado vigente; lo escrito se conserva.
 * - Nada se anuncia como aprobado antes de la respuesta del servidor; una respuesta atrasada de
 *   otra revisión o de una solicitud anterior se descarta.
 * - La aprobación NO es emisión ni entrega al cliente (la emisión es de un módulo posterior).
 */
import {
  EsquemaResumenRevision,
  LIMITES_REVISIONES,
  type DecisionRevision,
  type DetalleRevision,
  type EstadoRevision,
  type EventoRevision,
  type HistorialRevision,
  type ResumenRevision,
  type ResumenVersion,
} from "@softarq/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Detalle, Resumen } from "../calculo/PanelResultado.tsx";
import { Aviso, Boton, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearFecha, formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, Folio, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace } from "../navegacion/ruta.tsx";

export const NOTA_NO_EMISION = "La aprobación no es una emisión ni una entrega al cliente.";

const TEXTO_ESTADO: Record<EstadoRevision, string> = {
  PENDIENTE: "En revisión",
  APROBADA: "Aprobada",
  CAMBIOS_SOLICITADOS: "Cambios solicitados",
  RETIRADA: "Retirada",
};

export function EstadoRevisionInsignia({ estado }: { estado: EstadoRevision }) {
  const tono = estado === "APROBADA" ? "estado" : estado === "PENDIENTE" ? "demo" : "neutra";
  return <Insignia tono={tono}>{TEXTO_ESTADO[estado]}</Insignia>;
}

/** Estado de una versión con su motivo (derivado por el servidor de su última revisión). */
export function EstadoVersion({ version }: { version: Pick<ResumenVersion, "estado" | "revisionVigente"> }) {
  const r = version.revisionVigente;
  if (version.estado === "EN_REVISION") return <Insignia tono="demo">En revisión</Insignia>;
  if (version.estado === "APROBADA") return <Insignia tono="estado">Aprobada{r?.resueltaPor ? ` por ${r.resueltaPor}` : ""}</Insignia>;
  if (r?.estado === "CAMBIOS_SOLICITADOS") return <Insignia tono="menor">Borrador · cambios solicitados</Insignia>;
  if (r?.estado === "RETIRADA") return <Insignia tono="neutra">Borrador · revisión retirada</Insignia>;
  return <Insignia tono="neutra">Borrador calculado · sin enviar a revisión</Insignia>;
}

const NOMBRE_TIPO: Record<EventoRevision["tipo"], string> = {
  ENVIADA: "Enviada a revisión",
  APROBADA: "Aprobada",
  CAMBIOS_SOLICITADOS: "Cambios solicitados",
  RETIRADA: "Revisión retirada",
};

export function EventosRevision({ eventos }: { eventos: EventoRevision[] }) {
  return (
    <ol className="eventos">
      {eventos.map((e) => (
        <li key={e.secuencia}>
          <span className="eventos-fecha">{formatearInstante(e.ocurridoEn)}</span> <strong>{NOMBRE_TIPO[e.tipo]}</strong>{" "}
          <span className="ayuda">· {e.usuario}</span>
          {e.observaciones ? <span className="observaciones bloque">«{e.observaciones}»</span> : null}
          {e.avisos.length > 0 ? <span className="ayuda bloque">Avisos presentes: {e.avisos.join(", ")} (informativo)</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Historial de revisiones de una cotización: decisiones, responsables, fechas y observaciones. */
export function HistorialRevisiones({ revisiones }: { revisiones: HistorialRevision[] }) {
  if (revisiones.length === 0) return <p className="vacio">Ninguna versión se ha enviado a revisión.</p>;
  return (
    <ul className="historial-revisiones">
      {revisiones.map((r) => (
        <li key={r.id}>
          <p>
            <strong>v{r.versionNumero}</strong> <EstadoRevisionInsignia estado={r.estado} />{" "}
            <Enlace a={{ pantalla: "revision", id: r.id }}>Abrir la revisión</Enlace>
          </p>
          <EventosRevision eventos={r.eventos} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Bandeja
// ---------------------------------------------------------------------------

const FILTROS: { estado: EstadoRevision; texto: string }[] = [
  { estado: "PENDIENTE", texto: "Pendientes" },
  { estado: "CAMBIOS_SOLICITADOS", texto: "Cambios solicitados" },
  { estado: "APROBADA", texto: "Aprobadas" },
  { estado: "RETIRADA", texto: "Retiradas" },
];

export function BandejaRevisiones({ servicios }: { servicios: ServiciosCotizaciones }) {
  const [estado, setEstado] = useState<EstadoRevision>("PENDIENTE");
  const { estado: carga, recargar } = useCarga((s) => servicios.listarRevisiones(estado, s), [estado]);
  return (
    <Pagina
      titulo="Revisiones"
      subtitulo="Versiones enviadas a revisión. Abra una para ver su contenido comercial, los avisos y decidir. La aprobación no es una emisión."
      acciones={<Boton onClick={recargar}>Actualizar</Boton>}
    >
      <div className="filtros" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <Boton key={f.estado} variante={estado === f.estado ? "primario" : "secundario"} aria-pressed={estado === f.estado} onClick={() => setEstado(f.estado)}>
            {f.texto}
          </Boton>
        ))}
      </div>
      {carga.fase === "cargando" ? <Cargando etiqueta="Cargando revisiones…" /> : null}
      {carga.fase === "error" ? <CargaFallida fallo={carga.fallo} alReintentar={recargar} /> : null}
      {carga.fase === "listo" ? (
        carga.datos.revisiones.length === 0 ? (
          <SinResultados>{estado === "PENDIENTE" ? "No hay revisiones pendientes." : "No hay revisiones en este estado."}</SinResultados>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-registros">
              <caption className="solo-lector">Revisiones {TEXTO_ESTADO[estado].toLowerCase()}</caption>
              <thead>
                <tr>
                  <th scope="col">Versión</th>
                  <th scope="col">Cliente y proyecto</th>
                  <th scope="col" className="numero">
                    Total
                  </th>
                  <th scope="col">Preparó</th>
                  <th scope="col">Enviada</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {carga.datos.revisiones.map((r) => (
                  <tr key={r.id}>
                    <td data-etiqueta="Versión">
                      <Enlace a={{ pantalla: "revision", id: r.id }}>
                        <span className="codigo">{r.version.idVersion}</span>
                      </Enlace>
                    </td>
                    <td data-etiqueta="Cliente y proyecto">
                      {r.cliente.nombre} · {r.proyecto.nombre}
                    </td>
                    <td data-etiqueta="Total" className="numero">
                      {formatearImporte(r.version.total, "MXN")}
                    </td>
                    <td data-etiqueta="Preparó">{r.preparador}</td>
                    <td data-etiqueta="Enviada">
                      {formatearInstante(r.enviadoEn)} · {r.enviadoPor}
                    </td>
                    <td data-etiqueta="Estado">
                      <EstadoRevisionInsignia estado={r.estado} />
                      {r.estado === "PENDIENTE" && r.acciones.motivoNoAprobar ? <span className="ayuda bloque">Usted la preparó (BL-17)</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
// Detalle y decisión
// ---------------------------------------------------------------------------

type Accion = "aprobar" | "cambios" | "retirar";

type EstadoEnvio =
  | { fase: "inactivo" }
  | { fase: "enviando"; accion: Accion }
  | { fase: "hecho"; accion: Accion }
  | { fase: "conflicto"; mensaje: string; vigente: ResumenRevision | null }
  | { fase: "bloqueado"; mensaje: string; problemas: { codigo: string; mensaje: string }[] }
  | { fase: "error"; fallo: FalloApi; accion: Accion };

const REINTENTABLES = new Set<FalloApi["tipo"]>(["red", "error_servidor", "no_disponible", "limite", "csrf"]);

export function PantallaRevision({ servicios, id }: { servicios: ServiciosCotizaciones; id: string }) {
  const { estado, recargar, setEstado } = useCarga((s) => servicios.detalleRevision(id, s), [id]);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando la revisión…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  return (
    <DetalleRevisionVista
      key={id}
      servicios={servicios}
      detalle={estado.datos}
      alActualizar={recargar}
      alCambiar={(d) => setEstado({ fase: "listo", datos: d })}
    />
  );
}

function DetalleRevisionVista({
  servicios,
  detalle,
  alActualizar,
  alCambiar,
}: {
  servicios: ServiciosCotizaciones;
  detalle: DetalleRevision;
  alActualizar: () => void;
  alCambiar: (d: DetalleRevision) => void;
}) {
  const r = detalle.revision;
  const v = detalle.version;
  const intenciones = useIntenciones();
  const [abierta, setAbierta] = useState<Accion | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [motivo, setMotivo] = useState("");
  const [envio, setEnvio] = useState<EstadoEnvio>({ fase: "inactivo" });
  const [errorObs, setErrorObs] = useState<string | null>(null);
  // Solo la respuesta de la última solicitud de ESTA revisión actualiza la pantalla.
  const solicitud = useRef(0);
  const idObs = useId();
  const idMotivo = useId();
  const pendiente = r.estado === "PENDIENTE";
  const ocupado = envio.fase === "enviando";

  useEffect(() => () => void (solicitud.current += 1), []);

  const confirmar = async (accion: Accion) => {
    if (ocupado) return;
    const obs = observaciones.trim();
    if (accion === "cambios" && (obs.length < LIMITES_REVISIONES.minimoObservaciones || !/\p{L}/u.test(obs))) {
      setErrorObs(`Explique qué debe cambiar (al menos ${LIMITES_REVISIONES.minimoObservaciones} caracteres).`);
      return;
    }
    setErrorObs(null);
    const n = ++solicitud.current;
    setEnvio({ fase: "enviando", accion });
    let resultado;
    let contenido: unknown;
    if (accion === "retirar") {
      contenido = { revision: r.revision, motivo: motivo.trim() };
      resultado = await servicios.retirarRevision(r.id, r.revision, motivo.trim() || null, intenciones.clave(`retiro:${r.id}`, contenido));
    } else {
      const decision: DecisionRevision = accion === "aprobar" ? "APROBAR" : "SOLICITAR_CAMBIOS";
      contenido = { decision, revision: r.revision, versionId: r.version.id, obs };
      resultado = await servicios.decidirRevision(
        r.id,
        { decision, versionId: r.version.id, revision: r.revision, observaciones: obs || null },
        intenciones.clave(`decision:${r.id}`, contenido),
      );
    }
    if (n !== solicitud.current) return; // respuesta atrasada: se descarta
    const ambito = accion === "retirar" ? `retiro:${r.id}` : `decision:${r.id}`;
    if (resultado.ok) {
      intenciones.olvidar(ambito, contenido);
      setAbierta(null);
      setObservaciones("");
      setMotivo("");
      setEnvio({ fase: "hecho", accion });
      alCambiar(resultado.datos);
      return;
    }
    const f = resultado.fallo;
    if (!REINTENTABLES.has(f.tipo)) intenciones.olvidar(ambito, contenido);
    if (f.tipo === "revision") {
      const vigente = EsquemaResumenRevision.safeParse(f.revisionVigente);
      setEnvio({ fase: "conflicto", mensaje: f.mensaje, vigente: vigente.success ? vigente.data : null });
    } else if (f.tipo === "bloqueado") {
      setEnvio({ fase: "bloqueado", mensaje: mensajeDeFallo(f), problemas: f.problemas });
    } else if (f.tipo === "invalida" && accion === "cambios") {
      setErrorObs(f.campos[0]?.mensaje ?? "Revise las observaciones.");
      setEnvio({ fase: "inactivo" });
    } else {
      setEnvio({ fase: "error", fallo: f, accion });
    }
  };

  const actualizar = () => {
    solicitud.current += 1;
    setEnvio({ fase: "inactivo" });
    alActualizar();
  };

  const total = formatearImporte(r.version.total, "MXN");

  return (
    <Pagina
      titulo={
        <>
          Revisión de <span className="codigo">{r.version.idVersion}</span>
        </>
      }
      subtitulo={
        <>
          <Folio folio={r.folio} /> · <EstadoRevisionInsignia estado={r.estado} />
        </>
      }
      acciones={
        <>
          <Enlace a={{ pantalla: "revisiones" }}>Volver a revisiones</Enlace>
          <Enlace a={{ pantalla: "cotizacion", id: r.cotizacionId }}>Abrir la cotización</Enlace>
        </>
      }
    >
      <dl className="datos-version">
        <div>
          <dt>Versión revisada</dt>
          <dd>
            <Enlace a={{ pantalla: "version", id: r.cotizacionId, numero: r.version.numero }}>
              <span className="codigo">{r.version.idVersion}</span>
            </Enlace>{" "}
            · calculada el {formatearFecha(r.version.fechaCalculo)}
          </dd>
        </div>
        <div>
          <dt>Total de la versión</dt>
          <dd>
            <strong className="numero">{total}</strong>
          </dd>
        </div>
        <div>
          <dt>Cliente</dt>
          <dd>
            {r.cliente.nombre} <Codigo>{r.cliente.codigo}</Codigo>
          </dd>
        </div>
        <div>
          <dt>Proyecto</dt>
          <dd>
            {r.proyecto.nombre} <Codigo>{r.proyecto.codigo}</Codigo>
          </dd>
        </div>
        <div>
          <dt>Preparó la versión</dt>
          <dd>{r.preparador}</dd>
        </div>
        <div>
          <dt>Enviada</dt>
          <dd>
            {formatearInstante(r.enviadoEn)} · {r.enviadoPor}
          </dd>
        </div>
        {r.resueltaPor ? (
          <div>
            <dt>{r.estado === "RETIRADA" ? "Retirada" : "Decidida"}</dt>
            <dd>
              {formatearInstante(r.resueltaEn!)} · {r.resueltaPor}
            </dd>
          </div>
        ) : null}
      </dl>

      <div aria-live="polite">
        {envio.fase === "hecho" ? (
          <Aviso tono="correcto" titulo={tituloHecho(r)} rol="status">
            <p>
              {r.estado === "APROBADA" ? `${NOTA_NO_EMISION} ` : ""}La versión {r.version.idVersion} no cambió.
            </p>
          </Aviso>
        ) : null}
      </div>
      {r.estado === "APROBADA" && envio.fase !== "hecho" ? (
        <Aviso tono="correcto" titulo={`Aprobada por ${r.resueltaPor ?? "—"}`}>
          <p>{NOTA_NO_EMISION} La aprobación corresponde solo a esta versión; una versión nueva requiere su propia revisión.</p>
        </Aviso>
      ) : null}
      {r.observaciones && r.estado !== "PENDIENTE" ? (
        <Aviso tono={r.estado === "CAMBIOS_SOLICITADOS" ? "aviso" : "info"} titulo={r.estado === "RETIRADA" ? "Motivo de la retirada" : "Observaciones"}>
          <p className="observaciones">{r.observaciones}</p>
        </Aviso>
      ) : null}

      {envio.fase === "conflicto" ? (
        <Aviso tono="error" titulo="La revisión cambió mientras la tenía abierta" rol="alert">
          <p>{envio.mensaje}</p>
          {envio.vigente ? (
            <p>
              Estado vigente: <EstadoRevisionInsignia estado={envio.vigente.estado} />
              {envio.vigente.resueltaPor ? ` · ${envio.vigente.resueltaPor}` : ""}. No se registró su decisión.
            </p>
          ) : null}
          {observaciones.trim() ? <p className="ayuda">Sus observaciones se conservan en el formulario.</p> : null}
          <Boton variante="primario" onClick={actualizar}>
            Actualizar
          </Boton>
        </Aviso>
      ) : null}
      {envio.fase === "bloqueado" ? (
        <Aviso tono="error" titulo={envio.mensaje} rol="alert">
          <ul className="lista-problemas">
            {envio.problemas.map((p, i) => (
              <li key={`${p.codigo}-${i}`}>
                <Codigo>{p.codigo}</Codigo> {p.mensaje}
              </li>
            ))}
          </ul>
          <p className="ayuda">El estado no cambió y la versión no se modificó.</p>
        </Aviso>
      ) : null}
      {envio.fase === "error" ? (
        <Aviso tono="error" titulo="No se registró la operación" rol="alert">
          <p>{mensajeDeFallo(envio.fallo)}</p>
          {REINTENTABLES.has(envio.fallo.tipo) ? <Boton onClick={() => void confirmar(envio.accion)}>Reintentar (sin duplicar)</Boton> : null}
        </Aviso>
      ) : null}

      {pendiente && detalle.verificacion ? (
        <section className="seccion" aria-labelledby="titulo-verificacion">
          <h2 id="titulo-verificacion" className="seccion-titulo">
            Verificación al {formatearFecha(detalle.verificacion.fechaReferencia)}
          </h2>
          <p className="ayuda">
            El servidor comprueba las condiciones vigentes sin modificar la versión. Si algo exige recalcular, corresponde una versión nueva.
          </p>
          {detalle.verificacion.bloqueos.length === 0 ? (
            <p>
              <Insignia tono="estado">Sin bloqueos</Insignia>
            </p>
          ) : (
            <Aviso tono="error" titulo={`${detalle.verificacion.bloqueos.length} bloqueo(s): no se puede aprobar`}>
              <ul className="lista-problemas">
                {detalle.verificacion.bloqueos.map((p, i) => (
                  <li key={`${p.codigo}-${i}`}>
                    <Codigo>{p.codigo}</Codigo> {p.mensaje}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          {detalle.verificacion.avisos.length > 0 ? (
            <Aviso tono="aviso" titulo="Avisos (no bloquean)">
              <ul className="lista-problemas">
                {detalle.verificacion.avisos.map((a, i) => (
                  <li key={`${a.codigo}-${i}`}>
                    <Codigo>{a.codigo}</Codigo> {a.mensaje}
                  </li>
                ))}
              </ul>
            </Aviso>
          ) : (
            <p className="ayuda">Sin avisos.</p>
          )}
        </section>
      ) : null}

      {pendiente && (r.acciones.aprobar || r.acciones.solicitarCambios || r.acciones.retirar || r.acciones.motivoNoAprobar) ? (
        <section className="seccion panel-decision" aria-labelledby="titulo-decision">
          <h2 id="titulo-decision" className="seccion-titulo">
            Decisión
          </h2>
          {r.acciones.motivoNoAprobar ? (
            <Aviso tono="info" titulo="No puede aprobar esta versión">
              <p>{r.acciones.motivoNoAprobar}</p>
            </Aviso>
          ) : null}
          {abierta === null ? (
            <div className="formulario-acciones">
              {r.acciones.aprobar ? (
                <Boton variante="primario" onClick={() => setAbierta("aprobar")} disabled={ocupado}>
                  Aprobar…
                </Boton>
              ) : null}
              {r.acciones.solicitarCambios ? (
                <Boton onClick={() => setAbierta("cambios")} disabled={ocupado}>
                  Solicitar cambios…
                </Boton>
              ) : null}
              {r.acciones.retirar ? (
                <Boton variante="peligro" onClick={() => setAbierta("retirar")} disabled={ocupado}>
                  Retirar la revisión…
                </Boton>
              ) : null}
            </div>
          ) : null}
          {abierta === "aprobar" ? (
            <div className="confirmacion-bloque" role="group" aria-labelledby="titulo-confirmar-aprobar">
              <p id="titulo-confirmar-aprobar">
                <strong>
                  Va a aprobar {r.version.idVersion} por {total}.
                </strong>{" "}
                {NOTA_NO_EMISION}
              </p>
              <div className="formulario-acciones">
                <Boton variante="primario" onClick={() => void confirmar("aprobar")} disabled={ocupado} aria-disabled={ocupado}>
                  {ocupado ? "Registrando…" : `Confirmar aprobación de ${r.version.idVersion}`}
                </Boton>
                <Boton onClick={() => setAbierta(null)} disabled={ocupado}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : null}
          {abierta === "cambios" ? (
            <div className="confirmacion-bloque" role="group" aria-labelledby="titulo-confirmar-cambios">
              <p id="titulo-confirmar-cambios">
                <strong>Solicitar cambios en {r.version.idVersion}.</strong> La versión vuelve a Borrador; el preparador ve sus observaciones.
              </p>
              <div className="campo">
                <label className="etiqueta" htmlFor={idObs}>
                  Observaciones para el preparador <span className="ayuda">(obligatorias)</span>
                </label>
                <textarea
                  id={idObs}
                  rows={4}
                  maxLength={LIMITES_REVISIONES.longitudObservaciones}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  aria-invalid={errorObs ? true : undefined}
                  aria-describedby={errorObs ? `${idObs}-error` : undefined}
                />
                {errorObs ? (
                  <p className="error-campo" id={`${idObs}-error`} role="alert">
                    {errorObs}
                  </p>
                ) : null}
              </div>
              <div className="formulario-acciones">
                <Boton variante="primario" onClick={() => void confirmar("cambios")} disabled={ocupado} aria-disabled={ocupado}>
                  {ocupado ? "Registrando…" : "Confirmar solicitud de cambios"}
                </Boton>
                <Boton onClick={() => setAbierta(null)} disabled={ocupado}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : null}
          {abierta === "retirar" ? (
            <div className="confirmacion-bloque" role="group" aria-labelledby="titulo-confirmar-retiro">
              <p id="titulo-confirmar-retiro">
                <strong>Retirar la revisión de {r.version.idVersion}.</strong> La cotización vuelve a ser editable; para revisarla otra vez hay que enviarla de
                nuevo.
              </p>
              <div className="campo">
                <label className="etiqueta" htmlFor={idMotivo}>
                  Motivo <span className="ayuda">(opcional)</span>
                </label>
                <input id={idMotivo} type="text" maxLength={LIMITES_REVISIONES.longitudMotivoRetiro} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
              <div className="formulario-acciones">
                <Boton variante="peligro" onClick={() => void confirmar("retirar")} disabled={ocupado} aria-disabled={ocupado}>
                  {ocupado ? "Registrando…" : "Confirmar retirada"}
                </Boton>
                <Boton onClick={() => setAbierta(null)} disabled={ocupado}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel-resultado" aria-labelledby="titulo-contenido-revision">
        <h2 id="titulo-contenido-revision" className="seccion-titulo">
          Contenido comercial de la versión
        </h2>
        <p className="ayuda">Tal como se guardó; abrirla no la recalcula.</p>
        <Resumen
          respuesta={{ estado: "CALCULADO", fechaCalculo: v.version.fechaCalculo, cotizacion: v.cotizacion, avisos: v.avisos }}
          etiqueta={
            <>
              <Insignia tono="estado">Guardado</Insignia> en {v.version.idVersion}
            </>
          }
        />
        <Detalle respuesta={{ estado: "CALCULADO", fechaCalculo: v.version.fechaCalculo, cotizacion: v.cotizacion, avisos: v.avisos }} />
      </section>

      <section className="seccion" aria-labelledby="titulo-historial-revision">
        <h2 id="titulo-historial-revision" className="seccion-titulo">
          Historial de la revisión
        </h2>
        <EventosRevision eventos={detalle.eventos} />
      </section>
    </Pagina>
  );
}

function tituloHecho(r: ResumenRevision): string {
  if (r.estado === "APROBADA") return `${r.version.idVersion} aprobada por ${r.resueltaPor ?? "—"}`;
  if (r.estado === "CAMBIOS_SOLICITADOS") return `Cambios solicitados en ${r.version.idVersion}`;
  if (r.estado === "RETIRADA") return `Revisión de ${r.version.idVersion} retirada`;
  return "Registrado";
}
