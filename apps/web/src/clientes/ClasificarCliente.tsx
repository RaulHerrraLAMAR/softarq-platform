/**
 * Clasificación del cliente en su ficha (E3.8). Solo el Administrador del sistema (la API y la base lo exigen). Es una decisión
 * explícita, con motivo y reversible; queda en la bitácora. No oculta nada y no cambia la clasificación de otros clientes.
 */
import type { Clasificacion, Cliente } from "@softarq/contracts";
import { useState, type FormEvent } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { EtiquetaClasificacion, TEXTO_CLASIFICACION } from "../comunes/clasificacion.tsx";
import { Aviso, Boton } from "../comunes/componentes.tsx";

export function ClasificarCliente({ servicios, cliente, alCambiar }: { servicios: ServiciosCotizaciones; cliente: Cliente; alCambiar: () => void }) {
  const actual = cliente.clasificacion ?? null;
  const [categoria, setCategoria] = useState<Clasificacion | "NINGUNA">(actual ?? "NINGUNA");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const sinCambio = (categoria === "NINGUNA" ? null : categoria) === actual;
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setFallo(null);
    const r = await servicios.clasificarCliente(cliente.id, categoria === "NINGUNA" ? null : categoria, motivo.trim());
    setEnviando(false);
    if (!r.ok) {
      if (r.fallo.tipo !== "cancelado") setFallo(r.fallo);
      return;
    }
    setMotivo("");
    setAviso(categoria === "NINGUNA" ? "Clasificación retirada: el cliente vuelve a «sin clasificar»." : `Clasificado como ${TEXTO_CLASIFICACION[categoria]}.`);
    alCambiar();
  };

  return (
    <section className="seccion" aria-labelledby="titulo-clasificacion">
      <h2 id="titulo-clasificacion" className="seccion-titulo">
        Clasificación
      </h2>
      <p>
        {actual ? (
          <>
            <EtiquetaClasificacion valor={actual} /> {cliente.clasificacionMotivo ? <span className="ayuda">Motivo: {cliente.clasificacionMotivo}</span> : null}
          </>
        ) : (
          <span className="ayuda">Sin clasificar. No se asume nada por llevar [DEMO] en el nombre.</span>
        )}
      </p>
      <p className="ayuda">
        Presentación: lo que se enseña. QA: pruebas automatizadas. Humo: restos de pruebas de módulos anteriores. Sus proyectos, cotizaciones y solicitudes heredan la categoría; nada se oculta ni se borra.
      </p>
      <div aria-live="polite">{aviso ? <Aviso tono="correcto" titulo={aviso} /> : null}</div>
      <form className="formulario" onSubmit={(e) => void guardar(e)} aria-label="Clasificar al cliente">
        <div className="campo">
          <label htmlFor="clasificacion-categoria">Categoría</label>
          <select id="clasificacion-categoria" value={categoria} onChange={(e) => (setAviso(null), setCategoria(e.target.value as Clasificacion | "NINGUNA"))}>
            <option value="NINGUNA">Sin clasificar</option>
            <option value="PRESENTACION">Presentación</option>
            <option value="QA">QA</option>
            <option value="HUMO">Humo</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="clasificacion-motivo">Motivo (queda en la bitácora)</label>
          <input id="clasificacion-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
        </div>
        {fallo ? (
          <Aviso tono="error" titulo="No se guardó" rol="alert">
            <p>{mensajeDeFallo(fallo)}</p>
          </Aviso>
        ) : null}
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" disabled={enviando || sinCambio || motivo.trim().length < 3} aria-busy={enviando}>
            {enviando ? "Guardando…" : "Guardar clasificación"}
          </Boton>
        </div>
      </form>
    </section>
  );
}
