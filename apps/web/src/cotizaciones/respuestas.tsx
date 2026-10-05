import { EsquemaCorreccionRespuesta, EsquemaRegistroRespuesta, EsquemaSeguimientoEmision, LIMITES_RESPUESTAS, type EventoRespuestaCliente, type SeguimientoEmision } from "@softarq/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { mensajeDeFallo } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { formatearFecha, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";

type Servicios = Pick<ServiciosCotizaciones, "seguimientoEmision" | "registrarRespuesta" | "corregirRespuesta">;
const resultadoTexto = (e: EventoRespuestaCliente) => e.resultado === "ACEPTADA" ? "Aceptada" : "Rechazada";

function Evento({ evento, vigente = false }: { evento: EventoRespuestaCliente; vigente?: boolean }) {
  return <article className="respuesta-evento">
    <h4>Registro {evento.numero} · {resultadoTexto(evento)} {vigente ? <Insignia tono="estado">Registro vigente</Insignia> : null}</h4>
    <p>Respuesta recibida el {formatearFecha(evento.fechaRespuesta)}.</p>
    <p className="ayuda">{evento.tipo === "CORREGIDA" ? "Corrección registrada" : "Registrada internamente"} por {evento.registradoNombre}, el {formatearInstante(evento.registradoEn)}. Fecha de negocio: {formatearFecha(evento.fechaRegistro)}.</p>
    {evento.nota ? <p className="texto-largo">Nota: {evento.nota}</p> : null}
    {evento.motivo ? <p className="texto-largo">Motivo de corrección: {evento.motivo}</p> : null}
  </article>;
}

/** El servidor decide vigencia y acciones. Una captura en conflicto conserva su base hasta confirmación explícita. */
export function PanelRespuesta({ emisionId, servicios }: { emisionId: string; servicios: Servicios }) {
  const { estado, recargar, setEstado } = useCarga((signal) => servicios.seguimientoEmision(emisionId, undefined, signal), [emisionId]);
  const id = useId();
  const intenciones = useIntenciones();
  const [modo, setModo] = useState<"registrar" | "corregir" | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [resultado, setResultado] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<{ ruta: string; mensaje: string }[]>([]);
  const [exito, setExito] = useState<string | null>(null);
  const [anteriores, setAnteriores] = useState<EventoRespuestaCliente[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const bloqueo = useRef(false);
  const vivo = useRef(true);
  const resumenError = useRef<HTMLDivElement>(null);
  const primerCampo = useRef<HTMLSelectElement>(null);
  const abrirBoton = useRef<HTMLButtonElement>(null);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => { if (error) resumenError.current?.focus(); }, [error]);
  useEffect(() => { if (modo) primerCampo.current?.focus(); }, [modo]);
  useEffect(() => { if (exito) abrirBoton.current?.focus(); }, [exito]);

  const abrir = (s: SeguimientoEmision, correccion: boolean, conservar = false) => {
    setModo(correccion ? "corregir" : "registrar");
    setBaseId(correccion ? s.respuestaVigente!.id : null);
    if (!conservar) {
      setResultado(correccion ? s.respuestaVigente!.resultado : "");
      setFecha(correccion ? s.respuestaVigente!.fechaRespuesta : s.vigencia.estado === "VIGENTE" ? s.vigencia.fechaServidor : "");
      setNota(correccion ? s.respuestaVigente!.nota ?? "" : ""); setMotivo("");
    }
    setConfirmando(false); setError(null); setCampos([]); setExito(null);
  };

  const guardar = async () => {
    if (bloqueo.current || !modo) return;
    const captura = { resultado, fechaRespuesta: fecha, nota: nota.trim() || null, ...(modo === "corregir" ? { motivo } : {}) };
    const validado = (modo === "corregir" ? EsquemaCorreccionRespuesta : EsquemaRegistroRespuesta).safeParse(captura);
    if (!validado.success) {
      setCampos(validado.error.issues.map((e) => ({ ruta: String(e.path[0]), mensaje: e.path[0] === "motivo" ? "Explique la corrección con al menos 10 caracteres y una letra." : e.path[0] === "fechaRespuesta" ? "Capture una fecha real." : "Seleccione Aceptada o Rechazada." })));
      setError("Revise la captura antes de confirmar."); return;
    }
    if (!confirmando) { setConfirmando(true); setError(null); setCampos([]); return; }
    bloqueo.current = true; setOcupado(true); setError(null); setCampos([]);
    const ambito = `respuesta:${emisionId}:${baseId ?? "inicial"}`;
    const clave = intenciones.clave(ambito, validado.data);
    const r = modo === "corregir"
      ? await servicios.corregirRespuesta(emisionId, baseId!, EsquemaCorreccionRespuesta.parse(captura), clave)
      : await servicios.registrarRespuesta(emisionId, EsquemaRegistroRespuesta.parse(captura), clave);
    if (!vivo.current) return;
    bloqueo.current = false; setOcupado(false);
    if (r.ok) {
      intenciones.olvidar(ambito, validado.data); setModo(null); setConfirmando(false);
      setExito(`Registro ${r.datos.numero} guardado internamente. ${resultadoTexto(r.datos)}; respuesta recibida el ${formatearFecha(r.datos.fechaRespuesta)}.`);
      setAnteriores([]); setCursor(undefined); recargar();
    } else if (r.fallo.tipo !== "cancelado") {
      setError(mensajeDeFallo(r.fallo)); setConfirmando(false);
      if (r.fallo.tipo === "respuesta") {
        setCampos(r.fallo.campos ?? []);
        const actual = EsquemaSeguimientoEmision.safeParse(r.fallo.seguimientoVigente);
        if (actual.success) { setEstado({ fase: "listo", datos: actual.data }); setAnteriores([]); setCursor(undefined); }
      } else if (r.fallo.tipo === "invalida") setCampos(r.fallo.campos);
    }
  };

  if (estado.fase === "cargando") return <Cargando etiqueta="Consultando seguimiento…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const s = estado.datos;
  const desactualizado = modo === "registrar" ? Boolean(s.respuestaVigente) : modo === "corregir" && baseId !== s.respuestaVigente?.id;
  const permiso = modo ? s.acciones[modo].permitida : false;
  const siguiente = cursor === undefined ? s.siguienteAntesDe : cursor;
  const historial = [...s.historial, ...anteriores].filter((e, i, todos) => todos.findIndex((x) => x.id === e.id) === i);
  const cambiar = (fn: (v: string) => void, v: string) => { fn(v); setConfirmando(false); };
  const errorCampo = (nombre: string) => campos.some((e) => e.ruta === nombre);
  const ids: Record<string, string> = { resultado: `${id}-resultado`, fechaRespuesta: `${id}-fecha`, motivo: `${id}-motivo`, nota: `${id}-nota` };
  return <section className="seguimiento-emision" aria-labelledby={`${id}-titulo`}>
    <h3 id={`${id}-titulo`}>Seguimiento de {s.idVersion}</h3>
    <dl className="datos-version">
      <div><dt>Documento</dt><dd>Emitido{s.sustituida ? " · Sustituido por otra emisión" : ""}</dd></div>
      <div><dt>Vigencia del documento</dt><dd><Insignia tono="estado">{s.vigencia.estado === "VIGENTE" ? "Vigente" : "Vencida"}</Insignia> · hasta el {formatearFecha(s.vigenteHasta)}, inclusive.</dd></div>
      <div><dt>Resultado comercial registrado</dt><dd>{s.respuestaVigente ? resultadoTexto(s.respuestaVigente) : "Sin respuesta registrada"}</dd></div>
    </dl>
    <p className="ayuda">Consulta según el servidor: {formatearFecha(s.vigencia.fechaServidor)} ({s.vigencia.zonaHoraria}). La aprobación del Revisor es interna y no representa aceptación del cliente.</p>
    {s.vigencia.estado === "VENCIDA" ? <Aviso tono="aviso" titulo="El documento venció"><p>Puede registrarse una respuesta recibida entre {formatearFecha(s.fechaEmision)} y {formatearFecha(s.vigenteHasta)}, inclusive. Una respuesta recibida después de ese plazo se bloquea. Los registros históricos se conservan.</p></Aviso> : null}
    {exito ? <Aviso tono="correcto" rol="status"><p>{exito}</p></Aviso> : null}
    {!modo ? <div className="acciones-formulario">
      {s.acciones.registrar.permitida ? <Boton ref={abrirBoton} onClick={() => abrir(s, false)}>Registrar respuesta del cliente</Boton> : null}
      {s.acciones.corregir.permitida ? <Boton ref={abrirBoton} onClick={() => abrir(s, true)}>Corregir registro interno</Boton> : null}
      <Boton disabled={ocupado} onClick={() => { setAnteriores([]); setCursor(undefined); recargar(); }}>Actualizar seguimiento</Boton>
    </div> : null}
    {!s.acciones.registrar.permitida ? <p className="ayuda">{s.acciones.registrar.motivo}</p> : null}
    {!s.acciones.corregir.permitida ? <p className="ayuda">{s.acciones.corregir.motivo}</p> : null}
    {modo ? <form noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }} className="formulario-respuesta">
      <h4>{modo === "corregir" ? `Corregir el registro ${historial.find((e) => e.id === baseId)?.numero ?? "consultado"}` : "Registrar una respuesta recibida"}</h4>
      <p className="ayuda">La persona de su sesión registra lo que recibió. No es una acción autenticada del cliente.</p>
      {error ? <div ref={resumenError} tabIndex={-1} role="alert" className="aviso aviso-error"><div><p>{error}</p>{campos.length ? <ul>{campos.map((c, i) => <li key={i}><a href={`#${ids[c.ruta] ?? ids.resultado}`}>{c.mensaje}</a></li>)}</ul> : null}<p>Su captura se conserva.</p></div></div> : null}
      {desactualizado ? <Aviso tono="aviso" titulo="Otra persona registró una respuesta"><p>Compare el registro vigente con su captura antes de corregirlo. El sistema no cambia automáticamente la base de su decisión.</p>{s.acciones.corregir.permitida ? <Boton onClick={() => abrir(s, true, true)}>Corregir el registro vigente con mi captura</Boton> : null}</Aviso> : null}
      <fieldset disabled={ocupado} className="campos-respuesta">
        <legend className="solo-lector">Respuesta recibida sobre {s.idVersion}</legend>
        <div className="campo"><label htmlFor={ids.resultado}>Resultado recibido</label><select ref={primerCampo} id={ids.resultado} value={resultado} aria-invalid={errorCampo("resultado")} onChange={(e) => cambiar(setResultado, e.target.value)}><option value="">Seleccione un resultado</option><option value="ACEPTADA">Aceptada</option><option value="RECHAZADA">Rechazada</option></select></div>
        <div className="campo"><label htmlFor={ids.fechaRespuesta}>Fecha en que se recibió la respuesta</label><input id={ids.fechaRespuesta} type="date" min={s.fechaEmision} max={s.vigencia.fechaServidor < s.vigenteHasta ? s.vigencia.fechaServidor : s.vigenteHasta} value={fecha} aria-invalid={errorCampo("fechaRespuesta")} aria-describedby={`${id}-fechas`} onChange={(e) => cambiar(setFecha, e.target.value)} /><p id={`${id}-fechas`} className="ayuda">Desde {formatearFecha(s.fechaEmision)} hasta {formatearFecha(s.vigenteHasta)}, inclusive, sin fechas futuras. La fecha del registro se asigna en el servidor.</p></div>
        <div className="campo"><label htmlFor={ids.nota}>Nota de la respuesta (opcional)</label><textarea id={ids.nota} maxLength={LIMITES_RESPUESTAS.nota} rows={3} value={nota} onChange={(e) => cambiar(setNota, e.target.value)} /></div>
        {modo === "corregir" ? <div className="campo"><label htmlFor={ids.motivo}>Motivo de la corrección</label><textarea id={ids.motivo} maxLength={LIMITES_RESPUESTAS.motivo} rows={3} value={motivo} aria-invalid={errorCampo("motivo")} onChange={(e) => cambiar(setMotivo, e.target.value)} /><p className="ayuda">Obligatorio: al menos 10 caracteres. El registro anterior queda en el historial.</p></div> : null}
      </fieldset>
      {confirmando ? <Aviso tono="info" titulo="Confirme el registro interno"><p>{s.idVersion} · {resultado === "ACEPTADA" ? "Aceptada" : "Rechazada"} · recibida el {formatearFecha(fecha)}. {modo === "corregir" ? "Se añadirá una corrección conservando el evento anterior." : "Se registrará la respuesta sobre esta emisión."}</p></Aviso> : null}
      <div className="acciones-formulario"><Boton type="submit" variante="primario" disabled={ocupado || desactualizado || !permiso}>{ocupado ? "Guardando registro…" : confirmando ? "Confirmar registro interno" : "Revisar registro"}</Boton><Boton disabled={ocupado} onClick={() => { setModo(null); setConfirmando(false); abrirBoton.current?.focus(); }}>Cancelar captura</Boton></div>
    </form> : null}
    {historial.length ? <div className="historial-respuestas"><h4>Historial de respuestas de esta emisión</h4>{historial.map((e) => <Evento key={e.id} evento={e} vigente={e.id === s.respuestaVigente?.id} />)}{siguiente ? <Boton disabled={ocupado} onClick={async () => { if (bloqueo.current) return; bloqueo.current = true; setOcupado(true); const r = await servicios.seguimientoEmision(emisionId, siguiente); if (!vivo.current) return; bloqueo.current = false; setOcupado(false); if (r.ok) { setAnteriores((a) => [...a, ...r.datos.historial]); setCursor(r.datos.siguienteAntesDe); } else { setError(mensajeDeFallo(r.fallo)); } }}>Ver registros anteriores</Boton> : null}</div> : null}
    {error && !modo ? <Aviso tono="error" rol="alert"><p>{error}</p></Aviso> : null}
  </section>;
}
