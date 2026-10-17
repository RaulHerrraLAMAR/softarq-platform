/**
 * Campos y piezas de los formularios de administración de catálogos (módulo 11). Etiquetas
 * visibles, ayuda y error junto al campo (`aria-describedby`), sin depender del color.
 * La validación definitiva es del servidor; aquí solo se muestran sus mensajes por campo.
 */
import { useId, useState, type ReactNode } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";

/** Mensaje del servidor para un campo (400 del contrato o 422 con campos). */
export function errorDe(fallo: FalloApi | null, ruta: string): string | null {
  if (!fallo) return null;
  const campos = fallo.tipo === "invalida" || fallo.tipo === "catalogo" ? (fallo.campos ?? []) : [];
  return campos.find((c) => c.ruta === ruta || c.ruta.startsWith(`${ruta}.`))?.mensaje ?? null;
}

function useDescripcion(error: string | null | undefined, ayuda: ReactNode | undefined) {
  const id = useId();
  const describe = [error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(" ") || undefined;
  const pie = (
    <>
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
    </>
  );
  return { id, describe, pie };
}

function Etiqueta({ htmlFor, texto, obligatorio }: { htmlFor: string; texto: string; obligatorio: boolean }) {
  return (
    <label className="etiqueta" htmlFor={htmlFor}>
      {texto}
      {obligatorio ? <span aria-hidden="true"> *</span> : <span className="ayuda"> (opcional)</span>}
    </label>
  );
}

export function CampoTexto({
  etiqueta,
  valor,
  alCambiar,
  max,
  obligatorio = false,
  error,
  ayuda,
  tipo = "text",
  inputMode,
  deshabilitado = false,
  multilinea = false,
  enfocar = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  max: number;
  obligatorio?: boolean;
  error?: string | null;
  ayuda?: ReactNode;
  tipo?: "text" | "tel" | "email" | "date";
  inputMode?: "decimal" | "text";
  deshabilitado?: boolean;
  multilinea?: boolean;
  /** Primer campo de un formulario recién abierto: recibe el foco (navegación con teclado). */
  enfocar?: boolean;
}) {
  const { id, describe, pie } = useDescripcion(error, ayuda);
  const comunes = {
    id,
    value: valor,
    maxLength: max,
    required: obligatorio,
    disabled: deshabilitado,
    autoFocus: enfocar,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describe,
    className: "entrada",
  } as const;
  return (
    <div className="campo">
      <Etiqueta htmlFor={id} texto={etiqueta} obligatorio={obligatorio} />
      {multilinea ? (
        <textarea {...comunes} rows={2} onChange={(e) => alCambiar(e.target.value)} />
      ) : (
        <input {...comunes} type={tipo} inputMode={inputMode} autoComplete="off" onChange={(e) => alCambiar(e.target.value)} />
      )}
      {pie}
    </div>
  );
}

export function CampoSeleccion({
  etiqueta,
  valor,
  alCambiar,
  opciones,
  obligatorio = false,
  error,
  ayuda,
  deshabilitado = false,
  vacio = "Seleccione…",
  enfocar = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  obligatorio?: boolean;
  error?: string | null;
  ayuda?: ReactNode;
  deshabilitado?: boolean;
  vacio?: string;
  enfocar?: boolean;
}) {
  const { id, describe, pie } = useDescripcion(error, ayuda);
  return (
    <div className="campo">
      <Etiqueta htmlFor={id} texto={etiqueta} obligatorio={obligatorio} />
      <select
        id={id}
        className="entrada"
        value={valor}
        required={obligatorio}
        disabled={deshabilitado}
        autoFocus={enfocar}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe}
        onChange={(e) => alCambiar(e.target.value)}
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {pie}
    </div>
  );
}

export function CampoCasilla({ etiqueta, valor, alCambiar, ayuda, deshabilitado = false }: { etiqueta: string; valor: boolean; alCambiar: (v: boolean) => void; ayuda?: ReactNode; deshabilitado?: boolean }) {
  const { id, describe, pie } = useDescripcion(null, ayuda);
  return (
    <div className="campo">
      <label className="casilla" htmlFor={id}>
        <input id={id} type="checkbox" checked={valor} disabled={deshabilitado} aria-describedby={describe} onChange={(e) => alCambiar(e.target.checked)} />
        {etiqueta}
      </label>
      {pie}
    </div>
  );
}

/** Aviso de fallo de una operación: conserva lo escrito y, en un conflicto, ofrece recargar. */
export function AvisoFallo({ fallo, alRecargar }: { fallo: FalloApi; alRecargar?: () => void }) {
  if (fallo.tipo === "cancelado") return null;
  const conflicto = fallo.tipo === "conflicto" || (fallo.tipo === "catalogo" && fallo.codigo === "CONFLICTO_TARIFA");
  return (
    <Aviso tono="error" titulo="No se guardó" rol="alert">
      <p>{fallo.tipo === "invalida" ? "Hay datos que no se pueden usar. Revise los campos marcados." : mensajeDeFallo(fallo)}</p>
      {conflicto ? (
        <>
          <p className="ayuda">Lo que escribió sigue en pantalla. Recargue para ver el estado vigente y decida de nuevo.</p>
          {alRecargar ? <Boton onClick={alRecargar}>Recargar el registro vigente</Boton> : null}
        </>
      ) : null}
    </Aviso>
  );
}

/** Paginación por código (keyset): página siguiente y regreso a las anteriores. */
export function usePaginas() {
  const [cursores, setCursores] = useState<(string | undefined)[]>([undefined]);
  const actual = cursores[cursores.length - 1];
  return {
    actual,
    numero: cursores.length,
    siguiente: (c: string) => setCursores((v) => [...v, c]),
    anterior: () => setCursores((v) => (v.length > 1 ? v.slice(0, -1) : v)),
    reiniciar: () => setCursores([undefined]),
  };
}

export function ControlPaginas({ paginas, siguiente }: { paginas: ReturnType<typeof usePaginas>; siguiente: string | null }) {
  if (paginas.numero === 1 && siguiente === null) return null;
  return (
    <nav className="formulario-acciones" aria-label="Páginas del listado">
      <Boton onClick={paginas.anterior} disabled={paginas.numero === 1}>
        Página anterior
      </Boton>
      <span className="ayuda">Página {paginas.numero}</span>
      <Boton onClick={() => siguiente && paginas.siguiente(siguiente)} disabled={siguiente === null}>
        Página siguiente
      </Boton>
    </nav>
  );
}
