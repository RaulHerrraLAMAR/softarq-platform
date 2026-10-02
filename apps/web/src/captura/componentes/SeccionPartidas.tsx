import type { ServiciosApi } from "../../api/servicios.ts";
import { Boton, Codigo } from "../../comunes/componentes.tsx";
import { CampoTexto, ErrorCampo, useCaptura } from "../contexto.tsx";
import type { Captura, PartidaConcepto } from "../estado.ts";
import { AYUDA_DECIMAL, idCampo } from "../solicitud.ts";
import { BuscadorConceptos } from "./BuscadorConceptos.tsx";
import { TablaMedidas } from "./TablaMedidas.tsx";
import { NOMBRE_FORMULA } from "./textos.ts";

export function SeccionPartidas({ captura, servicios }: { captura: Captura; servicios: ServiciosApi }) {
  const { despachar } = useCaptura();
  const conceptos = captura.partidas
    .map((p, indice) => ({ p, indice }))
    .filter((x): x is { p: PartidaConcepto; indice: number } => x.p.tipo === "CONCEPTO");

  return (
    <section className="seccion" aria-labelledby="titulo-partidas" id="seccion-partidas">
      <h2 id="titulo-partidas" className="seccion-titulo">
        <span className="paso-numero" aria-hidden="true">
          1
        </span>
        Partidas y medidas
      </h2>
      <p className="ayuda">
        Medidas en metros. {AYUDA_DECIMAL} El signo «−» descuenta (por ejemplo, un vano) cuando el concepto lo permite.
      </p>
      <ErrorCampo ruta="partidas" />
      <div id={idCampo("partidas")} tabIndex={-1} />

      {conceptos.length === 0 ? <p className="vacio">Todavía no hay conceptos en la captura.</p> : null}

      {conceptos.map(({ p, indice }) => (
        <article key={p.clave} className="partida" aria-labelledby={`${p.clave}-titulo`}>
          <header className="partida-cabecera">
            <div>
              <h3 id={`${p.clave}-titulo`} className="partida-titulo">
                Partida {indice + 1} · <Codigo>{p.concepto.codigo}</Codigo>
              </h3>
              <p className="ayuda">
                {p.concepto.descripcion} · Unidad: {p.concepto.unidad} · Medidas: {NOMBRE_FORMULA[p.concepto.tipoFormula]}
                {p.concepto.permiteDescuento ? " · admite descuentos" : ""}
              </p>
            </div>
            <Boton
              variante="peligro"
              aria-label={`Quitar la partida ${indice + 1} (${p.concepto.codigo})`}
              onClick={() => despachar({ tipo: "QUITAR_PARTIDA", clave: p.clave })}
            >
              Quitar partida
            </Boton>
          </header>
          <CampoTexto
            ruta={`partidas[${indice}].descripcion`}
            etiqueta="Descripción en la cotización"
            valor={p.descripcion}
            maxLength={200}
            alCambiar={(v) => despachar({ tipo: "EDITAR_DESCRIPCION_PARTIDA", clave: p.clave, descripcion: v })}
          />
          <TablaMedidas partida={p} indice={indice} />
        </article>
      ))}

      <BuscadorConceptos servicios={servicios} abiertoInicial={conceptos.length === 0} />
    </section>
  );
}
