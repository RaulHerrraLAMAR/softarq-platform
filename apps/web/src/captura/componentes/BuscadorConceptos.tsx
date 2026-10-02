import { LIMITES_API } from "@softarq/contracts";
import { useId, useState } from "react";
import type { ServiciosApi } from "../../api/servicios.ts";
import { mensajeDeConsulta, useBusquedaConceptos } from "../../catalogos/hooks.ts";
import { Aviso, Boton, Codigo, Esqueleto } from "../../comunes/componentes.tsx";
import { useCaptura } from "../contexto.tsx";
import { NOMBRE_FORMULA } from "./textos.ts";

/** Búsqueda en el catálogo y alta de partidas de concepto. */
export function BuscadorConceptos({ servicios, abiertoInicial }: { servicios: ServiciosApi; abiertoInicial: boolean }) {
  const { despachar } = useCaptura();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(abiertoInicial);
  const { resultado, reintentar } = useBusquedaConceptos(servicios, texto, abierto);
  const id = useId();

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Agregar concepto
      </Boton>
    );
  }

  return (
    <div className="buscador" role="search" aria-label="Buscar conceptos del catálogo">
      <div className="buscador-cabecera">
        <div className="campo">
          <label className="etiqueta" htmlFor={`${id}-buscar`}>
            Buscar concepto por código o descripción
          </label>
          <input
            id={`${id}-buscar`}
            type="search"
            value={texto}
            maxLength={LIMITES_API.longitudBusqueda}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            aria-describedby={`${id}-estado`}
          />
        </div>
        <Boton variante="enlace" onClick={() => setAbierto(false)}>
          Cerrar búsqueda
        </Boton>
      </div>
      <div id={`${id}-estado`} aria-live="polite" className="buscador-estado">
        {resultado.estado === "cargando" ? <Esqueleto lineas={2} etiqueta="Buscando conceptos…" /> : null}
        {resultado.estado === "listo" ? (
          <p className="ayuda">
            {resultado.datos.length === 0
              ? `Sin resultados para «${texto.trim()}». Pruebe con otro código o palabra.`
              : `${resultado.datos.length} ${resultado.datos.length === 1 ? "concepto encontrado" : "conceptos encontrados"}.`}
          </p>
        ) : null}
      </div>
      {resultado.estado === "error" ? (
        <Aviso tono="error" titulo="No se pudo consultar el catálogo">
          <p>{mensajeDeConsulta(resultado.fallo)}</p>
          <Boton onClick={reintentar}>Reintentar</Boton>
        </Aviso>
      ) : null}
      {resultado.estado === "listo" && resultado.datos.length > 0 ? (
        <ul className="lista-conceptos">
          {resultado.datos.map((c) => (
            <li key={c.codigo} className="concepto-encontrado">
              <div>
                <p className="concepto-titulo">
                  <Codigo>{c.codigo}</Codigo> {c.descripcion}
                </p>
                <p className="ayuda">
                  Unidad: {c.unidad} · Medidas: {NOMBRE_FORMULA[c.tipoFormula]} · {c.insumos.length}{" "}
                  {c.insumos.length === 1 ? "insumo" : "insumos"} con opciones
                </p>
              </div>
              <Boton
                variante="primario"
                aria-label={`Agregar ${c.codigo} ${c.descripcion}`}
                onClick={() => {
                  despachar({ tipo: "AGREGAR_CONCEPTO", concepto: c });
                  setAbierto(false);
                  setTexto("");
                }}
              >
                Agregar
              </Boton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
