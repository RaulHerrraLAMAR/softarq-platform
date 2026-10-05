/**
 * Excepciones del borrador (módulo 10, ADR-0014; B-22 `BTN_RegistrarExcepcion`). Solo Preparador.
 *
 * - Se registran con una acción explícita: tipo sin preselección, referencia, valor y motivo
 *   obligatorio; antes de agregarla se muestra un resumen para confirmar.
 * - Quedan en el borrador como «registradas»: la autorización la decide un Revisor distinto, en la
 *   revisión de la versión que se calcule. Aquí no se decide nada de eso.
 * - La validación local da respuesta inmediata; la definitiva es del servidor al guardar.
 */
import { LIMITES_EXCEPCIONES, PATRON_DECIMAL_TEXTO, TIPOS_EXCEPCION, type CampoExcepcion, type TipoExcepcion } from "@softarq/contracts";
import { useEffect, useId, useRef, useState } from "react";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { referidas, type Accion, type Captura, type NuevaExcepcion } from "../captura/estado.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { claveDuplicado, describir, EXPLICACION_TIPO, NOMBRE_CAMPO, NOMBRE_TIPO, type ExcepcionCaptura } from "./modelo.ts";

interface Componente {
  codigo: string;
  insumoCodigo: string;
  insumoDescripcion: string;
  unidad: string;
  rendimiento: string;
  desperdicio: string;
}

interface Formulario {
  tipo: TipoExcepcion | "";
  partidaClave: string;
  componenteCodigo: string;
  campo: CampoExcepcion | "";
  valorAplicado: string;
  insumoCodigo: string;
  conceptoCodigo: string;
  motivo: string;
}

const VACIO: Formulario = { tipo: "", partidaClave: "", componenteCodigo: "", campo: "", valorAplicado: "", insumoCodigo: "", conceptoCodigo: "", motivo: "" };

/** Errores por campo del formulario (clave = nombre del campo). */
type Errores = Partial<Record<keyof Formulario, string>>;

export function SeccionExcepciones({
  captura,
  despachar,
  servicios,
  deshabilitado = false,
  erroresServidor = [],
}: {
  captura: Captura;
  despachar: (a: Accion) => void;
  servicios: Pick<ServiciosCotizaciones, "componentesExcepcion">;
  deshabilitado?: boolean;
  /** 422 EXCEPCION_INVALIDA del último guardado (rutas `excepciones.N.campo`). */
  erroresServidor?: readonly { ruta: string; mensaje: string }[];
}) {
  const base = useId();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<Formulario>(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const [revisando, setRevisando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [componentes, setComponentes] = useState<Record<string, Componente[] | "cargando" | "error">>({});
  const [agregada, setAgregada] = useState<string | null>(null);
  const abrirBoton = useRef<HTMLButtonElement>(null);
  const primerCampo = useRef<HTMLInputElement>(null);
  const resumenError = useRef<HTMLDivElement>(null);
  const estadoRef = useRef<HTMLParagraphElement>(null);

  const partidas = referidas(captura);
  const conceptos = captura.partidas.flatMap((p, i) => (p.tipo === "CONCEPTO" ? [{ clave: p.clave, numero: i + 1, codigo: p.concepto.codigo, descripcion: p.descripcion || p.concepto.descripcion, clase: p.concepto.clase }] : []));
  const personalizados = [...new Map(conceptos.filter((c) => c.clase === "PERSONALIZADO").map((c) => [c.codigo, c])).values()];
  const precios = Object.entries(captura.seleccion).map(([insumo, precio]) => ({ insumo, precio, aviso: captura.avisosSeleccion[insumo] ?? null }));
  const partidaElegida = conceptos.find((c) => c.clave === f.partidaClave);
  const lista = partidaElegida ? componentes[partidaElegida.codigo] : undefined;
  const componente = Array.isArray(lista) ? lista.find((k) => k.codigo === f.componenteCodigo) : undefined;

  useEffect(() => {
    if (abierto) primerCampo.current?.focus();
  }, [abierto]);
  useEffect(() => {
    if (Object.keys(errores).length > 0) resumenError.current?.focus();
  }, [errores]);
  useEffect(() => {
    if (agregada) estadoRef.current?.focus();
  }, [agregada]);

  // Componentes de catálogo del concepto elegido (una consulta por concepto).
  useEffect(() => {
    const codigo = partidaElegida?.codigo;
    if (!codigo || componentes[codigo]) return;
    const control = new AbortController();
    setComponentes((c) => ({ ...c, [codigo]: "cargando" }));
    void servicios.componentesExcepcion([codigo], control.signal).then((r) => {
      if (control.signal.aborted) return;
      const encontrados = r.ok ? r.datos.conceptos.find((c) => c.codigo === codigo)?.componentes : undefined;
      setComponentes((c) => ({ ...c, [codigo]: encontrados ?? "error" }));
    });
    return () => control.abort();
  }, [partidaElegida?.codigo]);

  const cambiar = (cambios: Partial<Formulario>) => {
    setF((x) => ({ ...x, ...cambios }));
    setRevisando(false);
  };

  const cerrar = () => {
    setAbierto(false);
    setF(VACIO);
    setErrores({});
    setRevisando(false);
    window.requestAnimationFrame(() => abrirBoton.current?.focus());
  };

  /** Validación local (inmediata). El servidor vuelve a comprobarlo todo al guardar. */
  function validar(): { errores: Errores; nueva: NuevaExcepcion | null } {
    const e: Errores = {};
    const motivo = f.motivo.trim();
    if (!f.tipo) e.tipo = "Elija el tipo de excepción.";
    if (motivo.length < LIMITES_EXCEPCIONES.minimoMotivo || !/\p{L}/u.test(motivo)) {
      e.motivo = `El motivo es obligatorio: explique la excepción (al menos ${LIMITES_EXCEPCIONES.minimoMotivo} caracteres).`;
    }
    let nueva: NuevaExcepcion | null = null;
    if (f.tipo === "RENDIMIENTO") {
      if (!partidaElegida) e.partidaClave = "Elija la partida.";
      if (!f.componenteCodigo) e.componenteCodigo = "Elija el componente.";
      if (!f.campo) e.campo = "Indique si cambia el rendimiento o el desperdicio.";
      const v = f.valorAplicado.trim();
      if (!PATRON_DECIMAL_TEXTO.test(v)) e.valorAplicado = "Use punto decimal, por ejemplo 13 o 0.08 (sin comas ni espacios).";
      else if (f.campo === "RENDIMIENTO" && (v.startsWith("-") || esCero(v))) e.valorAplicado = "El rendimiento aplicado debe ser mayor que cero.";
      else if (f.campo === "DESPERDICIO" && (v.startsWith("-") || !menorQueUno(v))) e.valorAplicado = "El desperdicio aplicado debe cumplir 0 <= d < 1.";
      if (partidaElegida && f.componenteCodigo && f.campo) {
        nueva = { tipo: "RENDIMIENTO", partidaClave: partidaElegida.clave, conceptoCodigo: partidaElegida.codigo, componenteCodigo: f.componenteCodigo, campo: f.campo, valorAplicado: v, motivo };
      }
    } else if (f.tipo === "PRECIO_VENCIDO") {
      const p = precios.find((x) => x.insumo === f.insumoCodigo);
      if (!p) e.insumoCodigo = "Elija el precio.";
      else nueva = { tipo: "PRECIO_VENCIDO", insumoCodigo: p.insumo, precioCodigo: p.precio, motivo };
    } else if (f.tipo === "CONCEPTO_PERSONALIZADO") {
      if (!f.conceptoCodigo) e.conceptoCodigo = "Elija el concepto personalizado.";
      else nueva = { tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: f.conceptoCodigo, motivo };
    }
    if (nueva && captura.excepciones.some((x) => claveDuplicado(x) === claveDuplicado({ ...nueva, clave: "" } as ExcepcionCaptura))) {
      e.tipo = "Ya existe una excepción para esa referencia; quítela antes de registrar otra.";
    }
    return { errores: e, nueva: Object.keys(e).length === 0 ? nueva : null };
  }

  const revisar = () => {
    const r = validar();
    setErrores(r.errores);
    setRevisando(r.nueva !== null);
  };

  const agregar = () => {
    const r = validar();
    if (!r.nueva) {
      setErrores(r.errores);
      setRevisando(false);
      return;
    }
    despachar({ tipo: "AGREGAR_EXCEPCION", excepcion: r.nueva });
    setAgregada(describir({ ...r.nueva, clave: "" } as ExcepcionCaptura, partidas));
    setAbierto(false);
    setF(VACIO);
    setErrores({});
    setRevisando(false);
  };

  const idCampo = (c: keyof Formulario) => `${base}-${c}`;
  const descrito = (c: keyof Formulario, ayuda?: boolean) =>
    [ayuda ? `${idCampo(c)}-ayuda` : null, errores[c] ? `${idCampo(c)}-error` : null].filter(Boolean).join(" ") || undefined;
  const error = (c: keyof Formulario) =>
    errores[c] ? (
      <p className="error-campo" id={`${idCampo(c)}-error`} role="alert">
        {errores[c]}
      </p>
    ) : null;

  return (
    <section className="seccion seccion-excepciones" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className="seccion-titulo">
        Excepciones
      </h2>
      <p className="ayuda">
        Una excepción permite, solo en esta cotización, cambiar el rendimiento o el desperdicio de un componente, usar un precio elegido que ya venció o usar un
        concepto personalizado. Exige un motivo y la autoriza un Revisor distinto de usted durante la revisión: sin autorización no se aprueba ni se emite. El
        catálogo no cambia y el PDF no las muestra.
      </p>
      {agregada ? (
        <p className="estado-en-linea" role="status" tabIndex={-1} ref={estadoRef}>
          Excepción agregada al borrador: {agregada}. Guarde el borrador y calcule una versión nueva para que se aplique.
        </p>
      ) : null}
      {erroresServidor.length > 0 ? (
        <Aviso tono="error" titulo="El servidor rechazó excepciones del borrador" rol="alert">
          <ul className="lista-problemas">
            {erroresServidor.map((x) => (
              <li key={`${x.ruta}-${x.mensaje}`}>
                {nombreRuta(x.ruta)}: {x.mensaje}
              </li>
            ))}
          </ul>
        </Aviso>
      ) : null}

      {captura.excepciones.length === 0 ? (
        <p className="ayuda">Este borrador no tiene excepciones.</p>
      ) : (
        <ol className="lista-excepciones">
          {captura.excepciones.map((x, i) => (
            <li key={x.clave} className="tarjeta-excepcion">
              <p className="tarjeta-excepcion-titulo">
                <span>
                  Excepción {i + 1} · {NOMBRE_TIPO[x.tipo]}
                </span>{" "}
                <Insignia tono="neutra">Registrada · pendiente de autorización</Insignia>
              </p>
              <p>{describir(x, partidas)}</p>
              <p className="texto-largo">
                <span className="etiqueta-en-linea">Motivo:</span> {x.motivo}
              </p>
              {quitando === x.clave ? (
                <span className="confirmacion" role="group" aria-label={`Confirmar quitar la excepción ${i + 1}`}>
                  <span>Se quitará del borrador; la versión ya calculada no cambia.</span>
                  <Boton
                    variante="peligro"
                    onClick={() => {
                      despachar({ tipo: "QUITAR_EXCEPCION", clave: x.clave });
                      setQuitando(null);
                      window.requestAnimationFrame(() => abrirBoton.current?.focus());
                    }}
                  >
                    Quitar
                  </Boton>
                  <Boton onClick={() => setQuitando(null)}>Cancelar</Boton>
                </span>
              ) : (
                <Boton onClick={() => setQuitando(x.clave)} disabled={deshabilitado} aria-label={`Quitar la excepción ${i + 1}…`}>
                  Quitar…
                </Boton>
              )}
            </li>
          ))}
        </ol>
      )}

      {!abierto ? (
        <Boton ref={abrirBoton} onClick={() => (setAgregada(null), setAbierto(true))} disabled={deshabilitado || captura.partidas.length === 0}>
          Registrar excepción…
        </Boton>
      ) : (
        <fieldset className="formulario-excepcion" disabled={deshabilitado}>
          <legend>Registrar excepción</legend>
          {Object.keys(errores).length > 0 ? (
            <div className="aviso aviso-error" role="alert" tabIndex={-1} ref={resumenError} aria-labelledby={`${base}-error-titulo`}>
              <div>
                <p className="aviso-titulo" id={`${base}-error-titulo`}>
                  Revise la excepción; su captura se conserva.
                </p>
                <ul className="lista-problemas">
                  {Object.entries(errores).map(([c, m]) => (
                    <li key={c}>
                      <a href={`#${idCampo(c as keyof Formulario)}`}>{m}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="campo" role="radiogroup" aria-labelledby={`${base}-tipo-etiqueta`} aria-describedby={descrito("tipo")}>
            <p className="etiqueta" id={`${base}-tipo-etiqueta`}>
              Tipo de excepción
            </p>
            {TIPOS_EXCEPCION.map((t, n) => (
              <label key={t} className="opcion-radio">
                <input
                  ref={n === 0 ? primerCampo : undefined}
                  id={n === 0 ? idCampo("tipo") : undefined}
                  type="radio"
                  name={`${base}-tipo`}
                  value={t}
                  checked={f.tipo === t}
                  onChange={() => cambiar({ ...VACIO, tipo: t, motivo: f.motivo })}
                />
                <span>
                  <strong>{NOMBRE_TIPO[t]}</strong>
                  <span className="ayuda">{EXPLICACION_TIPO[t]}</span>
                </span>
              </label>
            ))}
            {error("tipo")}
          </div>

          {f.tipo === "RENDIMIENTO" ? (
            <>
              <div className="campo">
                <label className="etiqueta" htmlFor={idCampo("partidaClave")}>
                  Partida
                </label>
                <select
                  id={idCampo("partidaClave")}
                  value={f.partidaClave}
                  aria-invalid={errores.partidaClave ? true : undefined}
                  aria-describedby={descrito("partidaClave")}
                  onChange={(e) => cambiar({ partidaClave: e.target.value, componenteCodigo: "" })}
                >
                  <option value="">Elija una partida…</option>
                  {conceptos.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      Partida {c.numero} · {c.codigo} · {c.descripcion}
                    </option>
                  ))}
                </select>
                {error("partidaClave")}
              </div>
              <div className="campo">
                <label className="etiqueta" htmlFor={idCampo("componenteCodigo")}>
                  Componente
                </label>
                <select
                  id={idCampo("componenteCodigo")}
                  value={f.componenteCodigo}
                  disabled={!Array.isArray(lista)}
                  aria-invalid={errores.componenteCodigo ? true : undefined}
                  aria-describedby={descrito("componenteCodigo", true)}
                  onChange={(e) => cambiar({ componenteCodigo: e.target.value })}
                >
                  <option value="">{lista === "cargando" ? "Cargando componentes…" : "Elija un componente…"}</option>
                  {Array.isArray(lista)
                    ? lista.map((k) => (
                        <option key={k.codigo} value={k.codigo}>
                          {k.codigo} · {k.insumoDescripcion} · rendimiento {k.rendimiento} {k.unidad} · desperdicio {k.desperdicio}
                        </option>
                      ))
                    : null}
                </select>
                <p className="ayuda" id={`${idCampo("componenteCodigo")}-ayuda`}>
                  {lista === "error" ? "No se pudieron consultar los componentes de esta partida." : "Valores del catálogo; la excepción no los cambia."}
                </p>
                {error("componenteCodigo")}
              </div>
              <div className="campo" role="radiogroup" aria-labelledby={`${base}-campo-etiqueta`} aria-describedby={descrito("campo")}>
                <p className="etiqueta" id={`${base}-campo-etiqueta`}>
                  Valor que cambia
                </p>
                {(["RENDIMIENTO", "DESPERDICIO"] as const).map((c, n) => (
                  <label key={c} className="opcion-radio">
                    <input
                      id={n === 0 ? idCampo("campo") : undefined}
                      type="radio"
                      name={`${base}-campo`}
                      value={c}
                      checked={f.campo === c}
                      onChange={() => cambiar({ campo: c })}
                    />
                    <span>{NOMBRE_CAMPO[c]}</span>
                  </label>
                ))}
                {error("campo")}
              </div>
              <div className="campo">
                <label className="etiqueta" htmlFor={idCampo("valorAplicado")}>
                  Valor aplicado en esta cotización
                </label>
                <input
                  id={idCampo("valorAplicado")}
                  inputMode="decimal"
                  autoComplete="off"
                  value={f.valorAplicado}
                  aria-invalid={errores.valorAplicado ? true : undefined}
                  aria-describedby={descrito("valorAplicado", true)}
                  onChange={(e) => cambiar({ valorAplicado: e.target.value })}
                />
                <p className="ayuda" id={`${idCampo("valorAplicado")}-ayuda`}>
                  {f.campo === "DESPERDICIO"
                    ? `Fracción entre 0 y menos de 1 (catálogo: ${componente?.desperdicio ?? "—"}).`
                    : f.campo === "RENDIMIENTO"
                      ? `Mayor que cero, en ${componente?.unidad ?? "la unidad del componente"} (catálogo: ${componente?.rendimiento ?? "—"}).`
                      : "Elija primero qué valor cambia."}
                </p>
                {error("valorAplicado")}
              </div>
            </>
          ) : null}

          {f.tipo === "PRECIO_VENCIDO" ? (
            <div className="campo">
              <label className="etiqueta" htmlFor={idCampo("insumoCodigo")}>
                Precio elegido
              </label>
              <select
                id={idCampo("insumoCodigo")}
                value={f.insumoCodigo}
                aria-invalid={errores.insumoCodigo ? true : undefined}
                aria-describedby={descrito("insumoCodigo", true)}
                onChange={(e) => cambiar({ insumoCodigo: e.target.value })}
              >
                <option value="">Elija un precio…</option>
                {precios.map((p) => (
                  <option key={p.insumo} value={p.insumo}>
                    {p.insumo} · {p.precio}
                    {p.aviso ? " · no disponible hoy" : ""}
                  </option>
                ))}
              </select>
              <p className="ayuda" id={`${idCampo("insumoCodigo")}-ayuda`}>
                Solo los precios ya elegidos en este borrador. Un precio que dejó de estar vigente se conserva y aquí se marca «no disponible hoy».
              </p>
              {error("insumoCodigo")}
            </div>
          ) : null}

          {f.tipo === "CONCEPTO_PERSONALIZADO" ? (
            <div className="campo">
              <label className="etiqueta" htmlFor={idCampo("conceptoCodigo")}>
                Concepto personalizado
              </label>
              <select
                id={idCampo("conceptoCodigo")}
                value={f.conceptoCodigo}
                aria-invalid={errores.conceptoCodigo ? true : undefined}
                aria-describedby={descrito("conceptoCodigo", true)}
                onChange={(e) => cambiar({ conceptoCodigo: e.target.value })}
              >
                <option value="">Elija un concepto…</option>
                {personalizados.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} · {c.descripcion}
                  </option>
                ))}
              </select>
              <p className="ayuda" id={`${idCampo("conceptoCodigo")}-ayuda`}>
                {personalizados.length === 0 ? "Este borrador no usa conceptos personalizados." : "Conceptos personalizados que usan las partidas de este borrador."}
              </p>
              {error("conceptoCodigo")}
            </div>
          ) : null}

          <div className="campo">
            <label className="etiqueta" htmlFor={idCampo("motivo")}>
              Motivo (obligatorio)
            </label>
            <textarea
              id={idCampo("motivo")}
              rows={3}
              maxLength={LIMITES_EXCEPCIONES.motivo}
              value={f.motivo}
              aria-invalid={errores.motivo ? true : undefined}
              aria-describedby={descrito("motivo", true)}
              onChange={(e) => cambiar({ motivo: e.target.value })}
            />
            <p className="ayuda" id={`${idCampo("motivo")}-ayuda`}>
              Al menos {LIMITES_EXCEPCIONES.minimoMotivo} caracteres; el Revisor lo leerá antes de decidir. {f.motivo.length} / {LIMITES_EXCEPCIONES.motivo}
            </p>
            {error("motivo")}
          </div>

          {revisando ? (
            <div className="confirmacion-bloque" role="group" aria-labelledby={`${base}-confirmar`}>
              <p id={`${base}-confirmar`}>
                Se agregará al borrador una excepción de tipo «{f.tipo ? NOMBRE_TIPO[f.tipo] : ""}». Quedará pendiente de autorización por un Revisor
                distinto de usted; para aplicarla, guarde el borrador y calcule una versión nueva.
              </p>
              <div className="formulario-acciones">
                <Boton variante="primario" onClick={agregar}>
                  Agregar al borrador
                </Boton>
                <Boton onClick={() => setRevisando(false)}>Seguir editando</Boton>
              </div>
            </div>
          ) : (
            <div className="formulario-acciones">
              <Boton variante="primario" onClick={revisar}>
                Revisar excepción
              </Boton>
              <Boton onClick={cerrar}>Cancelar</Boton>
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
}

/** Comparaciones sobre el texto decimal (sin convertir a número); los negativos se rechazan aparte. */
const esCero = (v: string) => /^0*(\.0*)?$/.test(v);
const menorQueUno = (v: string) => /^0*(\.\d*)?$/.test(v);

/** «excepciones.0.valorAplicado» → «Excepción 1». */
function nombreRuta(ruta: string): string {
  const m = /excepciones\.(\d+)/.exec(ruta);
  return m ? `Excepción ${Number(m[1]) + 1}` : "Excepciones";
}
