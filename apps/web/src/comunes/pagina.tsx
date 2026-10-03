/**
 * Piezas comunes de las pantallas de clientes, proyectos y cotizaciones (módulo 6).
 */
import type { ReactNode } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton, Esqueleto, Insignia } from "./componentes.tsx";

export function Pagina({
  titulo,
  subtitulo,
  acciones,
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="pagina">
      <div className="pagina-cabecera">
        <div>
          <h1 className="pagina-titulo" tabIndex={-1}>
            {titulo}
          </h1>
          {subtitulo ? <p className="ayuda">{subtitulo}</p> : null}
        </div>
        {acciones ? <div className="pagina-acciones">{acciones}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Cargando({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="pagina">
      <Esqueleto lineas={4} etiqueta={etiqueta} />
    </div>
  );
}

export function CargaFallida({ fallo, alReintentar, titulo = "No se pudo cargar" }: { fallo: FalloApi; alReintentar: () => void; titulo?: string }) {
  const noExiste = fallo.tipo === "no_encontrado";
  return (
    <div className="pagina">
      <Aviso tono="error" titulo={noExiste ? "No existe en su organización" : titulo} rol="alert">
        <p>{noExiste ? "El registro no existe o no pertenece a su organización." : mensajeDeFallo(fallo)}</p>
        {noExiste ? null : <Boton onClick={alReintentar}>Reintentar</Boton>}
      </Aviso>
    </div>
  );
}

/** Estado activo/inactivo con texto (no solo color). */
export function EstadoRegistro({ activo }: { activo: boolean }) {
  return activo ? <Insignia tono="estado">Activo</Insignia> : <Insignia tono="menor">Inactivo</Insignia>;
}

/** Folio de la web: siempre con su origen, para no confundirlo con los folios del libro Excel. */
export function Folio({ folio }: { folio: string }) {
  return (
    <span className="folio">
      <span className="codigo">{folio}</span> <Insignia tono="demo">WEB DEMO</Insignia>
    </span>
  );
}

export function SinResultados({ children }: { children: ReactNode }) {
  return <p className="vacio">{children}</p>;
}
