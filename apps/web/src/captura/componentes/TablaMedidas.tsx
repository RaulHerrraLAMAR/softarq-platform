/**
 * Renglones de medidas de una partida. Las columnas dependen de la fórmula del concepto
 * (`DIMENSIONES_POR_FORMULA`); en AREA se elige si la segunda medida es ancho o alto.
 * En pantallas estrechas cada renglón se muestra como tarjeta con etiquetas visibles; la
 * estructura de tabla y las etiquetas de cada campo se conservan.
 */
import { Boton } from "../../comunes/componentes.tsx";
import { CampoTexto, ErrorCampo, useCaptura } from "../contexto.tsx";
import type { PartidaConcepto, RenglonCaptura, SegundaMedida } from "../estado.ts";
import { idCampo } from "../solicitud.ts";
import { UNIDAD_MEDIDA } from "./textos.ts";

const NOMBRE = { largo: "Largo", ancho: "Ancho", alto: "Alto" } as const;

export function TablaMedidas({ partida, indice }: { partida: PartidaConcepto; indice: number }) {
  const { despachar } = useCaptura();
  const tipo = partida.concepto.tipoFormula;
  const ruta = `partidas[${indice}]`;
  const editar = (r: RenglonCaptura, cambios: Partial<Omit<RenglonCaptura, "clave">>) =>
    despachar({ tipo: "EDITAR_RENGLON", partida: partida.clave, renglon: r.clave, cambios });

  const columnasDimension: string[] =
    tipo === "CONTEO" ? [] : tipo === "LONGITUD" ? ["Largo (m)"] : tipo === "AREA" ? ["Largo (m)", "Segunda medida", "Valor (m)"] : ["Largo (m)", "Ancho (m)", "Alto (m)"];

  return (
    <div className="medidas">
      <div className="medidas-tabla-contenedor">
        <table className="tabla tabla-medidas" role="table">
          <caption className="solo-lector">Medidas de la partida {indice + 1}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Descripción del renglón</th>
              {partida.concepto.permiteDescuento ? <th role="columnheader" scope="col">Signo</th> : null}
              <th role="columnheader" scope="col">Piezas</th>
              {columnasDimension.map((c) => (
                <th role="columnheader" scope="col" key={c}>
                  {c}
                </th>
              ))}
              <th role="columnheader" scope="col">
                <span className="solo-lector">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {partida.renglones.map((r, n) => {
              const rr = `${ruta}.mediciones[${n}]`;
              const etiquetaRenglon = `renglón ${n + 1}`;
              return (
                <tr role="row" key={r.clave}>
                  <td role="cell">
                    <CampoTexto
                      ruta={`${rr}.descripcion`}
                      etiqueta={`Descripción del ${etiquetaRenglon}`}
                      ocultarEtiqueta
                      valor={r.descripcion}
                      maxLength={200}
                      alCambiar={(v) => editar(r, { descripcion: v })}
                    />
                  </td>
                  {partida.concepto.permiteDescuento ? (
                    <td role="cell">
                      <div className="campo">
                        <label className="etiqueta etiqueta-en-tabla" htmlFor={idCampo(`${rr}.signo`)}>
                          Signo del {etiquetaRenglon}
                        </label>
                        <select
                          id={idCampo(`${rr}.signo`)}
                          value={r.signo}
                          onChange={(e) => editar(r, { signo: e.target.value === "-" ? "-" : "+" })}
                        >
                          <option value="+">+ suma</option>
                          <option value="-">− descuenta</option>
                        </select>
                        <ErrorCampo ruta={`${rr}.signo`} />
                      </div>
                    </td>
                  ) : null}
                  <td role="cell">
                    <CampoTexto
                      ruta={`${rr}.piezas`}
                      etiqueta={`Piezas del ${etiquetaRenglon}`}
                      ocultarEtiqueta
                      unidad="pza"
                      decimal
                      className="numero"
                      valor={r.piezas}
                      alCambiar={(v) => editar(r, { piezas: v })}
                    />
                  </td>
                  {tipo === "CONTEO" ? null : (
                    <td role="cell">
                      <CampoTexto
                        ruta={`${rr}.largo`}
                        etiqueta={`Largo del ${etiquetaRenglon}`}
                        ocultarEtiqueta
                        unidad={UNIDAD_MEDIDA}
                        decimal
                        className="numero"
                        valor={r.largo}
                        alCambiar={(v) => editar(r, { largo: v })}
                      />
                    </td>
                  )}
                  {tipo === "AREA" ? (
                    <>
                      <td role="cell">
                        <div className="campo">
                          <label className="etiqueta etiqueta-en-tabla" htmlFor={idCampo(`${rr}.segundaMedida`)}>
                            Segunda medida del {etiquetaRenglon}
                          </label>
                          <select
                            id={idCampo(`${rr}.segundaMedida`)}
                            value={r.segundaMedida}
                            onChange={(e) => editar(r, { segundaMedida: e.target.value as SegundaMedida })}
                          >
                            <option value="ancho">Ancho</option>
                            <option value="alto">Alto</option>
                          </select>
                        </div>
                      </td>
                      <td role="cell">
                        <CampoTexto
                          ruta={`${rr}.${r.segundaMedida}`}
                          etiqueta={`${NOMBRE[r.segundaMedida]} del ${etiquetaRenglon}`}
                          ocultarEtiqueta
                          unidad={UNIDAD_MEDIDA}
                          decimal
                          className="numero"
                          valor={r[r.segundaMedida]}
                          alCambiar={(v) => editar(r, { [r.segundaMedida]: v })}
                        />
                      </td>
                    </>
                  ) : null}
                  {tipo === "VOLUMEN"
                    ? (["ancho", "alto"] as const).map((d) => (
                        <td role="cell" key={d}>
                          <CampoTexto
                            ruta={`${rr}.${d}`}
                            etiqueta={`${NOMBRE[d]} del ${etiquetaRenglon}`}
                            ocultarEtiqueta
                            unidad={UNIDAD_MEDIDA}
                            decimal
                            className="numero"
                            valor={r[d]}
                            alCambiar={(v) => editar(r, { [d]: v })}
                          />
                        </td>
                      ))
                    : null}
                  <td role="cell" className="celda-accion">
                    <Boton
                      variante="enlace"
                      aria-label={`Quitar el ${etiquetaRenglon} de la partida ${indice + 1}`}
                      onClick={() => despachar({ tipo: "QUITAR_RENGLON", partida: partida.clave, renglon: r.clave })}
                    >
                      Quitar
                    </Boton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ErrorCampo ruta={`${ruta}.mediciones`} />
      <div id={idCampo(`${ruta}.mediciones`)} tabIndex={-1} />
      <Boton
        variante="secundario"
        aria-label={`Agregar renglón de medidas a la partida ${indice + 1}`}
        onClick={() => despachar({ tipo: "AGREGAR_RENGLON", partida: partida.clave })}
      >
        Agregar renglón
      </Boton>
    </div>
  );
}
