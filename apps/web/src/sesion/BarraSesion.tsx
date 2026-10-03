/**
 * Identidad y función actuales, con el cierre de sesión. Los datos vienen de la API
 * (`GET /auth/sesion` o la respuesta del acceso); la web no los deduce ni los guarda.
 */
import type { RespuestaSesion } from "@softarq/contracts";
import { useState } from "react";
import { mensajeDeFallo } from "../api/cliente.ts";
import type { ResultadoInicio } from "./ProveedorSesion.tsx";
import { nombreFunciones } from "./ProveedorSesion.tsx";

export function BarraSesion({ sesion, alCerrar }: { sesion: RespuestaSesion; alCerrar: () => Promise<ResultadoInicio> }) {
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = async () => {
    if (cerrando) return;
    setCerrando(true);
    setError(null);
    const r = await alCerrar();
    // Si se cerró, esta barra se desmonta; si no, se informa y la sesión sigue abierta.
    if (!r.ok) {
      setCerrando(false);
      setError(`No se pudo cerrar la sesión: ${mensajeDeFallo(r.fallo)}`);
    }
  };

  return (
    <div className="barra-sesion" aria-label="Sesión actual" role="group">
      <div className="barra-sesion-identidad">
        <span className="barra-sesion-nombre">{sesion.usuario.nombre}</span>
        <span className="barra-sesion-detalle">
          {nombreFunciones(sesion.funciones)} · {sesion.organizacion.nombre}
        </span>
      </div>
      <button type="button" className="boton boton-encabezado" onClick={() => void cerrar()} disabled={cerrando} aria-disabled={cerrando}>
        {cerrando ? "Cerrando…" : "Cerrar sesión"}
      </button>
      {error ? (
        <p className="barra-sesion-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
