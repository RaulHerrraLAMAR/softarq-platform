/**
 * Selector de un registro del catálogo con búsqueda en el servidor y paginación por código
 * (módulos 11 y 12). Sustituye las listas desplegables que solo ofrecían la primera página.
 *
 * - La selección actual se muestra siempre, aunque no esté en la página cargada, y se marca «no
 *   disponible» si ya no se ofrece; nunca se sustituye sola.
 * - Las respuestas tardías (otra búsqueda u otra página pedida después) se descartan.
 * - Los errores se muestran junto al selector con «Reintentar»; la selección no se pierde.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { mensajeDeFallo, type FalloApi, type ResultadoApi } from "../api/cliente.ts";
import { Boton } from "../comunes/componentes.tsx";

export interface OpcionRegistro {
  codigo: string;
  texto: string;
  /** `false` si existe pero ya no se ofrece para registros nuevos (inactivo). */
  disponible: boolean;
  /** Dato auxiliar para el formulario (p. ej., la unidad base de un insumo). */
  detalle?: string;
}

export type BuscarRegistros = (
  texto: string,
  despuesDe: string | undefined,
  signal: AbortSignal,
) => Promise<ResultadoApi<{ opciones: OpcionRegistro[]; siguiente: string | null }>>;

export function SelectorRegistro({
  etiqueta,
  valor,
  seleccion,
  alCambiar,
  buscar,
  obligatorio = false,
  error,
  ayuda,
  deshabilitado = false,
  textoVacio = "Sin selección",
  permitirQuitar = false,
  enfocar = false,
}: {
  etiqueta: string;
  /** Código seleccionado ("" sin selección). */
  valor: string;
  /** Descripción de la selección actual (aunque no esté en la página cargada). */
  seleccion?: OpcionRegistro | null;
  alCambiar: (codigo: string, opcion: OpcionRegistro | null) => void;
  buscar: BuscarRegistros;
  obligatorio?: boolean;
  error?: string | null;
  ayuda?: ReactNode;
  deshabilitado?: boolean;
  textoVacio?: string;
  /** Permite volver a «sin selección» (campos opcionales). */
  permitirQuitar?: boolean;
  /** Primer campo de un formulario recién abierto: la búsqueda recibe el foco. */
  enfocar?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const [opciones, setOpciones] = useState<OpcionRegistro[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [fase, setFase] = useState<"cargando" | "listo" | "error">("cargando");
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [conocidas, setConocidas] = useState<Record<string, OpcionRegistro>>({});
  const solicitud = useRef(0);
  const control = useRef<AbortController | null>(null);
  const ultima = useRef<{ q: string; despuesDe: string | undefined }>({ q: "", despuesDe: undefined });

  const cargar = useCallback(
    async (q: string, despuesDe: string | undefined) => {
      control.current?.abort();
      const c = new AbortController();
      control.current = c;
      const n = ++solicitud.current;
      ultima.current = { q, despuesDe };
      setFase("cargando");
      setFallo(null);
      const r = await buscar(q, despuesDe, c.signal);
      if (n !== solicitud.current || c.signal.aborted) return; // respuesta atrasada: se descarta
      if (!r.ok) {
        if (r.fallo.tipo === "cancelado") return;
        setFallo(r.fallo);
        setFase("error");
        return;
      }
      setOpciones((anteriores) => (despuesDe ? [...anteriores, ...r.datos.opciones] : r.datos.opciones));
      setConocidas((k) => ({ ...k, ...Object.fromEntries(r.datos.opciones.map((o) => [o.codigo, o])) }));
      setSiguiente(r.datos.siguiente);
      setFase("listo");
    },
    [buscar],
  );

  useEffect(() => {
    void cargar(consulta, undefined);
    return () => control.current?.abort();
  }, [consulta, cargar]);

  const actual = valor ? (conocidas[valor] ?? (seleccion && seleccion.codigo === valor ? seleccion : null)) : null;
  const describe = [`${id}-actual`, error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(" ");

  return (
    <fieldset className="campo selector-registro" disabled={deshabilitado} aria-describedby={describe}>
      <legend className="etiqueta">
        {etiqueta}
        {obligatorio ? <span aria-hidden="true"> *</span> : <span className="ayuda"> (opcional)</span>}
      </legend>
      <p className="selector-actual" id={`${id}-actual`}>
        <span className="ayuda">Seleccionado: </span>
        {valor ? (
          <>
            <strong>{actual ? actual.texto : valor}</strong>
            {actual && !actual.disponible ? <span className="insignia insignia-alerta"> no disponible para registros nuevos</span> : null}
          </>
        ) : (
          <span>{textoVacio}</span>
        )}
        {permitirQuitar && valor ? (
          <>
            {" "}
            <Boton variante="enlace" onClick={() => alCambiar("", null)}>
              Quitar selección
            </Boton>
          </>
        ) : null}
      </p>
      <div className="entrada-con-accion">
        <label className="solo-lector" htmlFor={`${id}-buscar`}>
          Buscar {etiqueta.toLowerCase()}
        </label>
        <input
          id={`${id}-buscar`}
          className="entrada"
          type="search"
          autoFocus={enfocar}
          value={texto}
          maxLength={60}
          placeholder="Código o descripción"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setConsulta(texto.trim());
            }
          }}
        />
        <Boton onClick={() => setConsulta(texto.trim())}>Buscar</Boton>
      </div>
      <div className="selector-opciones" role="radiogroup" aria-label={`Resultados: ${etiqueta}`} aria-busy={fase === "cargando"}>
        {opciones.map((o) => (
          <label key={o.codigo} className="casilla">
            <input type="radio" name={`${id}-opcion`} value={o.codigo} checked={o.codigo === valor} onChange={() => alCambiar(o.codigo, o)} />
            {o.texto}
            {o.disponible ? null : <span className="ayuda"> (inactivo)</span>}
          </label>
        ))}
        {fase === "listo" && opciones.length === 0 ? <p className="ayuda">Sin resultados{consulta ? ` para «${consulta}»` : ""}.</p> : null}
        {fase === "cargando" ? <p className="ayuda">Cargando…</p> : null}
      </div>
      {fase === "error" && fallo ? (
        <p className="error-campo" role="alert">
          {mensajeDeFallo(fallo)} <Boton onClick={() => void cargar(ultima.current.q, ultima.current.despuesDe)}>Reintentar</Boton>
        </p>
      ) : null}
      {siguiente && fase === "listo" ? <Boton onClick={() => void cargar(consulta, siguiente)}>Más resultados</Boton> : null}
      {ayuda ? (
        <p className="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p className="error-campo" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
