import type { TipoAdicionalCatalogo } from "../../api/servicios.ts";
import { mensajeDeConsulta, type EstadoConsulta } from "../../catalogos/hooks.ts";
import { Aviso, Boton, Esqueleto } from "../../comunes/componentes.tsx";
import { CampoTexto, ErrorCampo, useCaptura } from "../contexto.tsx";
import type { Captura, PartidaAdicional } from "../estado.ts";
import { idCampo } from "../solicitud.ts";

export function SeccionAdicionales({
  captura,
  tipos,
  reintentar,
}: {
  captura: Captura;
  tipos: EstadoConsulta<TipoAdicionalCatalogo[]>;
  reintentar: () => void;
}) {
  const { despachar, errores } = useCaptura();
  const adicionales = captura.partidas
    .map((p, indice) => ({ p, indice }))
    .filter((x): x is { p: PartidaAdicional; indice: number } => x.p.tipo === "ADICIONAL");

  return (
    <section className="seccion" aria-labelledby="titulo-adicionales" id="seccion-adicionales">
      <h2 id="titulo-adicionales" className="seccion-titulo">
        <span className="paso-numero" aria-hidden="true">
          3
        </span>
        Costos adicionales <span className="titulo-nota">(opcional)</span>
      </h2>
      <p className="ayuda">Transporte, maquinaria u otros gastos de la obra. El monto es el costo que usted captura.</p>
      {tipos.estado === "cargando" ? <Esqueleto lineas={1} etiqueta="Cargando tipos de costo adicional…" /> : null}
      {tipos.estado === "error" ? (
        <Aviso tono="error" titulo="No se pudieron cargar los tipos de costo adicional">
          <p>{mensajeDeConsulta(tipos.fallo)}</p>
          <Boton onClick={reintentar}>Reintentar</Boton>
        </Aviso>
      ) : null}
      {adicionales.length === 0 ? <p className="vacio">Sin costos adicionales.</p> : null}
      {adicionales.map(({ p, indice }) => {
        const r = `partidas[${indice}]`;
        const tipo = tipos.estado === "listo" ? tipos.datos.find((t) => t.codigo === p.tipoAdicionalCodigo) : undefined;
        const editar = (cambios: Partial<Omit<PartidaAdicional, "clave" | "tipo">>) =>
          despachar({ tipo: "EDITAR_ADICIONAL", clave: p.clave, cambios });
        return (
          <article key={p.clave} className="partida partida-adicional" aria-labelledby={`${p.clave}-titulo`}>
            <header className="partida-cabecera">
              <h3 id={`${p.clave}-titulo`} className="partida-titulo">
                Partida {indice + 1} · Costo adicional
              </h3>
              <Boton
                variante="peligro"
                aria-label={`Quitar la partida ${indice + 1} (costo adicional)`}
                onClick={() => despachar({ tipo: "QUITAR_PARTIDA", clave: p.clave })}
              >
                Quitar
              </Boton>
            </header>
            <div className="rejilla-adicional">
              <div className="campo">
                <label className="etiqueta" htmlFor={idCampo(`${r}.tipoAdicionalCodigo`)}>
                  Tipo
                </label>
                <select
                  id={idCampo(`${r}.tipoAdicionalCodigo`)}
                  value={p.tipoAdicionalCodigo}
                  aria-invalid={errores[`${r}.tipoAdicionalCodigo`] ? true : undefined}
                  aria-describedby={errores[`${r}.tipoAdicionalCodigo`] ? `${idCampo(`${r}.tipoAdicionalCodigo`)}-error` : undefined}
                  onChange={(e) => editar({ tipoAdicionalCodigo: e.target.value })}
                >
                  <option value="">Elija un tipo…</option>
                  {tipos.estado === "listo"
                    ? tipos.datos.map((t) => (
                        <option key={t.codigo} value={t.codigo}>
                          {t.descripcion} ({t.unidad})
                        </option>
                      ))
                    : p.tipoAdicionalCodigo
                      ? <option value={p.tipoAdicionalCodigo}>{p.tipoAdicionalCodigo}</option>
                      : null}
                </select>
                <ErrorCampo ruta={`${r}.tipoAdicionalCodigo`} />
              </div>
              <CampoTexto
                ruta={`${r}.descripcion`}
                etiqueta="Descripción"
                valor={p.descripcion}
                maxLength={200}
                alCambiar={(v) => editar({ descripcion: v })}
              />
              <CampoTexto
                ruta={`${r}.cantidad`}
                etiqueta="Cantidad"
                unidad={tipo?.unidad}
                decimal
                className="numero"
                valor={p.cantidad}
                alCambiar={(v) => editar({ cantidad: v })}
              />
              <CampoTexto
                ruta={`${r}.monto`}
                etiqueta="Monto"
                unidad="MXN"
                decimal
                className="numero"
                valor={p.monto}
                alCambiar={(v) => editar({ monto: v })}
              />
            </div>
          </article>
        );
      })}
      <Boton variante="secundario" onClick={() => despachar({ tipo: "AGREGAR_ADICIONAL" })}>
        Agregar costo adicional
      </Boton>
    </section>
  );
}
