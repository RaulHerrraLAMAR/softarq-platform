/**
 * Contexto de la captura: despacho de acciones y errores por campo (locales y del servidor).
 * Los valores de la captura NO viajan por contexto; se pasan como props.
 */
import { createContext, useContext, type Dispatch, type InputHTMLAttributes, type ReactNode } from "react";
import type { Accion } from "./estado.ts";
import { idCampo, type ErroresCampo } from "./solicitud.ts";

export interface ValorContextoCaptura {
  despachar: Dispatch<Accion>;
  errores: ErroresCampo;
}

const ContextoCaptura = createContext<ValorContextoCaptura | null>(null);

export function ProveedorCaptura({ valor, children }: { valor: ValorContextoCaptura; children: ReactNode }) {
  return <ContextoCaptura.Provider value={valor}>{children}</ContextoCaptura.Provider>;
}

export function useCaptura(): ValorContextoCaptura {
  const v = useContext(ContextoCaptura);
  if (!v) throw new Error("useCaptura fuera de ProveedorCaptura");
  return v;
}

/** Mensaje de error de un campo, enlazado con `aria-describedby`. */
export function ErrorCampo({ ruta }: { ruta: string }) {
  const { errores } = useCaptura();
  const mensaje = errores[ruta];
  if (!mensaje) return null;
  return (
    <p className="error-campo" id={`${idCampo(ruta)}-error`}>
      <span className="solo-lector">Error: </span>
      {mensaje}
    </p>
  );
}

/**
 * Campo de texto con etiqueta, unidad visible, ayuda y error accesibles.
 * `ocultarEtiqueta` la deja solo para lectores de pantalla en pantallas anchas (tablas con encabezado).
 */
export function CampoTexto({
  ruta,
  etiqueta,
  unidad,
  ayuda,
  valor,
  alCambiar,
  ocultarEtiqueta = false,
  decimal = false,
  ...resto
}: {
  ruta: string;
  etiqueta: string;
  unidad?: string | undefined;
  ayuda?: string;
  valor: string;
  alCambiar: (v: string) => void;
  ocultarEtiqueta?: boolean;
  decimal?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
  const { errores } = useCaptura();
  const id = idCampo(ruta);
  const error = errores[ruta];
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className={`campo${error ? " campo-con-error" : ""}`}>
      <label htmlFor={id} className={ocultarEtiqueta ? "etiqueta etiqueta-en-tabla" : "etiqueta"}>
        {etiqueta}
        {unidad ? <span className="solo-lector"> en {unidad}</span> : null}
      </label>
      <div className="entrada-con-unidad">
        <input
          id={id}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe || undefined}
          autoComplete="off"
          spellCheck={false}
          {...(decimal ? { inputMode: "decimal" as const } : {})}
          {...resto}
        />
        {unidad ? (
          <span className="unidad" aria-hidden="true">
            {unidad}
          </span>
        ) : null}
      </div>
      {ayuda ? (
        <p className="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
      <ErrorCampo ruta={ruta} />
    </div>
  );
}
