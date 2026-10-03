/**
 * Formularios de cliente y proyecto (módulo 6). Solo los campos que este flujo necesita y que el
 * libro respalda (tblClientes, tblProyectos); sin datos fiscales ni de contacto. La validación
 * definitiva es del servidor; aquí solo se evita enviar un nombre vacío.
 */
import { LIMITES_COTIZACIONES } from "@softarq/contracts";
import { useId, useState, type FormEvent } from "react";
import { mensajeDeFallo, type FalloApi, type ResultadoApi } from "../api/cliente.ts";
import type { DatosProyecto } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";

function Campo({
  etiqueta,
  valor,
  alCambiar,
  max,
  obligatorio = false,
  error,
  ayuda,
  multilinea = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  max: number;
  obligatorio?: boolean;
  error?: string | null;
  ayuda?: string;
  multilinea?: boolean;
}) {
  const id = useId();
  const describe = [error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(" ") || undefined;
  const comunes = {
    id,
    value: valor,
    maxLength: max,
    required: obligatorio,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describe,
    className: "entrada",
  } as const;
  return (
    <div className="campo">
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
        {obligatorio ? <span aria-hidden="true"> *</span> : <span className="ayuda"> (opcional)</span>}
      </label>
      {multilinea ? (
        <textarea {...comunes} rows={2} onChange={(e) => alCambiar(e.target.value)} />
      ) : (
        <input {...comunes} type="text" autoComplete="off" onChange={(e) => alCambiar(e.target.value)} />
      )}
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
    </div>
  );
}

function errorDeServidor(fallo: FalloApi | null, ruta: string): string | null {
  if (fallo?.tipo !== "invalida") return null;
  return fallo.campos.find((c) => c.ruta === ruta)?.mensaje ?? null;
}

export function FormularioCliente({
  titulo,
  inicial = "",
  textoBoton,
  alGuardar,
  alCancelar,
}: {
  titulo: string;
  inicial?: string;
  textoBoton: string;
  alGuardar: (nombre: string) => Promise<ResultadoApi<unknown>>;
  alCancelar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [intentado, setIntentado] = useState(false);
  const vacio = nombre.trim() === "";

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (vacio || enviando) return;
    setEnviando(true);
    setFallo(null);
    const r = await alGuardar(nombre.trim());
    setEnviando(false);
    if (!r.ok && r.fallo.tipo !== "cancelado") setFallo(r.fallo);
  };

  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <Campo
        etiqueta="Nombre o razón social"
        valor={nombre}
        alCambiar={setNombre}
        max={LIMITES_COTIZACIONES.longitudNombre}
        obligatorio
        error={intentado && vacio ? "Escriba el nombre o la razón social." : errorDeServidor(fallo, "nombre")}
        ayuda="Datos DEMO: use la marca [DEMO] en el nombre."
      />
      {fallo && fallo.tipo !== "invalida" ? (
        <Aviso tono="error" titulo="No se guardó" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
        </Aviso>
      ) : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" disabled={enviando} aria-disabled={enviando}>
          {enviando ? "Guardando…" : textoBoton}
        </Boton>
        {alCancelar ? (
          <Boton variante="enlace" onClick={alCancelar} disabled={enviando}>
            Cancelar
          </Boton>
        ) : null}
      </div>
    </form>
  );
}

export function FormularioProyecto({
  titulo,
  inicial,
  textoBoton,
  alGuardar,
  alCancelar,
}: {
  titulo: string;
  inicial?: DatosProyecto;
  textoBoton: string;
  alGuardar: (datos: DatosProyecto) => Promise<ResultadoApi<unknown>>;
  alCancelar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [municipio, setMunicipio] = useState(inicial?.municipio ?? "");
  const [entidad, setEntidad] = useState(inicial?.entidadFederativa ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [intentado, setIntentado] = useState(false);
  const vacio = nombre.trim() === "";
  const opcional = (t: string) => (t.trim() === "" ? null : t.trim());

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (vacio || enviando) return;
    setEnviando(true);
    setFallo(null);
    const r = await alGuardar({
      nombre: nombre.trim(),
      municipio: opcional(municipio),
      entidadFederativa: opcional(entidad),
      descripcion: opcional(descripcion),
    });
    setEnviando(false);
    if (!r.ok && r.fallo.tipo !== "cancelado") setFallo(r.fallo);
  };

  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <Campo
        etiqueta="Nombre del proyecto"
        valor={nombre}
        alCambiar={setNombre}
        max={LIMITES_COTIZACIONES.longitudNombre}
        obligatorio
        error={intentado && vacio ? "Escriba el nombre del proyecto." : errorDeServidor(fallo, "nombre")}
      />
      <div className="formulario-fila">
        <Campo etiqueta="Municipio" valor={municipio} alCambiar={setMunicipio} max={LIMITES_COTIZACIONES.longitudMunicipio} />
        <Campo etiqueta="Entidad federativa" valor={entidad} alCambiar={setEntidad} max={LIMITES_COTIZACIONES.longitudEntidad} />
      </div>
      <Campo
        etiqueta="Descripción"
        valor={descripcion}
        alCambiar={setDescripcion}
        max={LIMITES_COTIZACIONES.longitudDescripcionProyecto}
        multilinea
        ayuda="Ubicación y descripción se exigirán para emitir (BL-02); aquí son opcionales."
      />
      {fallo && fallo.tipo !== "invalida" ? (
        <Aviso tono="error" titulo="No se guardó" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
        </Aviso>
      ) : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" disabled={enviando} aria-disabled={enviando}>
          {enviando ? "Guardando…" : textoBoton}
        </Boton>
        {alCancelar ? (
          <Boton variante="enlace" onClick={alCancelar} disabled={enviando}>
            Cancelar
          </Boton>
        ) : null}
      </div>
    </form>
  );
}
