import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";
import { EJEMPLOS, type Ejemplo } from "../ejemplos/ejemplos.ts";

export type EstadoCargaEjemplo = { id: string; estado: "cargando" } | { id: string; estado: "error"; fallo: FalloApi } | null;

export function Inicio({
  carga,
  alCargarEjemplo,
  alIniciarPropia,
}: {
  carga: EstadoCargaEjemplo;
  alCargarEjemplo: (e: Ejemplo) => void;
  alIniciarPropia: () => void;
}) {
  const ocupado = carga?.estado === "cargando";
  return (
    <div className="inicio">
      <section aria-labelledby="titulo-inicio" className="inicio-intro">
        <h1 id="titulo-inicio">Nueva cotización DEMO</h1>
        <p>
          Cargue un ejemplo verificado para revisarlo y modificarlo, o inicie una captura propia. Los importes los calcula el
          servidor con los catálogos DEMO al pulsar «Calcular».
        </p>
      </section>

      <section aria-labelledby="titulo-ejemplos">
        <h2 id="titulo-ejemplos" className="seccion-titulo">
          Ejemplos
        </h2>
        <ul className="tarjetas">
          {EJEMPLOS.map((e) => (
            <li key={e.id} className="tarjeta">
              <h3 className="tarjeta-titulo">{e.titulo}</h3>
              <p className="tarjeta-texto">{e.resumen}</p>
              {carga?.id === e.id && carga.estado === "error" ? (
                <Aviso tono="error" rol="alert">
                  <p>No se pudo cargar el ejemplo. {mensajeDeFallo(carga.fallo)}</p>
                </Aviso>
              ) : null}
              <Boton
                variante="primario"
                disabled={ocupado}
                aria-label={`Cargar ejemplo: ${e.titulo}`}
                onClick={() => alCargarEjemplo(e)}
              >
                {carga?.id === e.id && carga.estado === "cargando" ? "Cargando…" : "Cargar ejemplo"}
              </Boton>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-propia" className="inicio-propia">
        <h2 id="titulo-propia" className="seccion-titulo">
          Captura propia
        </h2>
        <p>Busque conceptos del catálogo, capture sus medidas y elija las opciones de cada insumo.</p>
        <Boton variante="secundario" disabled={ocupado} onClick={alIniciarPropia}>
          Iniciar captura propia
        </Boton>
      </section>
    </div>
  );
}
