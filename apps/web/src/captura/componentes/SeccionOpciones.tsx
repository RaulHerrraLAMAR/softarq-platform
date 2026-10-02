/**
 * Opciones disponibles por insumo. Se muestran solo los datos comerciales que entrega la API
 * (producto, presentación, unidad de compra, proveedor, vigencia y la marca de menor precio).
 * Ninguna opción se preselecciona en una captura propia: la marca ayuda, no decide.
 */
import type { InsumoConOpciones } from "../../api/servicios.ts";
import { mensajeDeConsulta, type EstadoConsulta, type OpcionesCargadas } from "../../catalogos/hooks.ts";
import { Aviso, Boton, Codigo, Esqueleto, Insignia } from "../../comunes/componentes.tsx";
import { formatearFecha } from "../../comunes/formato.ts";
import { ErrorCampo, useCaptura } from "../contexto.tsx";
import { insumosEnUso, type Captura } from "../estado.ts";
import { idCampo } from "../solicitud.ts";

export function SeccionOpciones({
  captura,
  opciones,
  reintentar,
}: {
  captura: Captura;
  opciones: EstadoConsulta<OpcionesCargadas>;
  reintentar: () => void;
}) {
  const { despachar } = useCaptura();
  const enUso = new Set(insumosEnUso(captura));

  return (
    <section className="seccion" aria-labelledby="titulo-opciones" id="seccion-opciones">
      <h2 id="titulo-opciones" className="seccion-titulo">
        <span className="paso-numero" aria-hidden="true">
          2
        </span>
        Opciones disponibles
      </h2>

      <fieldset className="grupo-opciones-simple">
        <legend className="etiqueta">Compras de insumos</legend>
        <p className="ayuda" id={`${idCampo("consolidarCompras")}-ayuda`}>
          Consolidar agrupa en una sola compra el mismo producto y proveedor de varias partidas.
        </p>
        <div className="opciones-en-linea" id={idCampo("consolidarCompras")} tabIndex={-1}>
          {([true, false] as const).map((v) => (
            <label key={String(v)} className="opcion-simple">
              <input
                type="radio"
                name="consolidarCompras"
                checked={captura.consolidarCompras === v}
                aria-describedby={`${idCampo("consolidarCompras")}-ayuda`}
                onChange={() => despachar({ tipo: "FIJAR_CONSOLIDACION", valor: v })}
              />
              {v ? "Consolidar compras" : "Comprar por partida"}
            </label>
          ))}
        </div>
        <ErrorCampo ruta="consolidarCompras" />
      </fieldset>

      {enUso.size === 0 ? <p className="vacio">Agregue un concepto para ver las opciones de sus insumos.</p> : null}
      {enUso.size > 0 && opciones.estado === "cargando" ? <Esqueleto lineas={4} etiqueta="Cargando opciones disponibles…" /> : null}
      {enUso.size > 0 && opciones.estado === "error" ? (
        <Aviso tono="error" titulo="No se pudieron cargar las opciones" rol="alert">
          <p>{mensajeDeConsulta(opciones.fallo)}</p>
          {opciones.fallo.tipo !== "demasiados_conceptos" ? <Boton onClick={reintentar}>Reintentar</Boton> : null}
        </Aviso>
      ) : null}
      <div id={idCampo("preciosElegidos")} tabIndex={-1} />
      <ErrorCampo ruta="preciosElegidos" />

      {enUso.size > 0 && opciones.estado === "listo" ? (
        <>
          <p className="ayuda">
            Opciones vigentes al {formatearFecha(opciones.datos.fechaReferencia)}. Elija una por insumo; la marca «Menor
            precio vigente» es informativa.
          </p>
          {opciones.datos.insumos
            .filter((i) => enUso.has(i.insumoCodigo))
            .map((ins) => (
              <OpcionesInsumo
                key={ins.insumoCodigo}
                insumo={ins}
                elegido={captura.seleccion[ins.insumoCodigo]}
                aviso={captura.avisosSeleccion[ins.insumoCodigo]}
              />
            ))}
        </>
      ) : null}
    </section>
  );
}

function OpcionesInsumo({ insumo, elegido, aviso }: { insumo: InsumoConOpciones; elegido: string | undefined; aviso: string | undefined }) {
  const { despachar, errores } = useCaptura();
  const ruta = `seleccion.${insumo.insumoCodigo}`;
  const id = idCampo(ruta);
  const error = errores[ruta];
  return (
    <fieldset
      className={`insumo${error ? " insumo-con-error" : ""}`}
      id={id}
      tabIndex={-1}
      aria-describedby={[aviso ? `${id}-aviso` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
    >
      <legend className="insumo-titulo">
        <Codigo>{insumo.insumoCodigo}</Codigo> {insumo.insumoDescripcion}
        <span className="ayuda"> · unidad base {insumo.unidadBase} · usado en {insumo.conceptos.join(", ")}</span>
      </legend>
      {aviso ? (
        <div id={`${id}-aviso`}>
          <Aviso tono="aviso">
            <p>{aviso}</p>
          </Aviso>
        </div>
      ) : null}
      {insumo.opciones.length === 0 ? (
        <p className="vacio">No hay opciones vigentes para este insumo. El cálculo no podrá completarse.</p>
      ) : (
        <div className="opciones-insumo">
          {insumo.opciones.map((o) => (
            <label key={o.precioCodigo} className={`opcion${elegido === o.precioCodigo ? " opcion-elegida" : ""}`}>
              <input
                type="radio"
                name={`opcion-${insumo.insumoCodigo}`}
                value={o.precioCodigo}
                checked={elegido === o.precioCodigo}
                onChange={() => despachar({ tipo: "ELEGIR_OPCION", insumo: insumo.insumoCodigo, precio: o.precioCodigo })}
              />
              <span className="opcion-cuerpo">
                <span className="opcion-producto">{o.producto}</span>
                <span className="opcion-dato">
                  Presentación: {o.presentacion} · Compra por {o.unidadCompra}
                </span>
                <span className="opcion-dato">Proveedor: {o.proveedor}</span>
                <span className="opcion-dato">
                  Vigente hasta {formatearFecha(o.vigenteHasta)} · <Codigo>{o.precioCodigo}</Codigo>
                </span>
                {o.esMenorPrecio ? <Insignia tono="menor">Menor precio vigente</Insignia> : null}
                {elegido === o.precioCodigo ? (
                  <span className="opcion-marca">
                    <Insignia tono="estado">Elegida</Insignia>
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
      <ErrorCampo ruta={ruta} />
    </fieldset>
  );
}
