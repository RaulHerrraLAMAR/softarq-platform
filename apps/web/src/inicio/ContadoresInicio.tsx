/**
 * Contadores de la hoja «00 INICIO» (ADR-0018 §2.2, ADR-0023): cuántas cotizaciones hay en cada etapa del flujo en TODA la
 * organización, con la fecha del servidor y las reglas que se aplicaron (se muestran, no se esconden). Distintos de las tarjetas
 * de «Mi trabajo», que cuentan solo las bandejas propias de cada persona.
 */
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";
import { formatearFecha } from "../comunes/formato.ts";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace } from "../navegacion/ruta.tsx";

export function ContadoresInicio({ servicios }: { servicios: ServiciosCotizaciones }) {
  const { estado, recargar } = useCarga((s) => servicios.contadoresInicio(s), []);
  if (estado.fase === "cargando") {
    return (
      <p className="ayuda" aria-live="polite">
        Cargando el estado de las cotizaciones…
      </p>
    );
  }
  if (estado.fase === "error") {
    return (
      <Aviso tono="aviso" titulo="No se pudo consultar el estado de las cotizaciones">
        <Boton onClick={recargar}>Reintentar</Boton>
      </Aviso>
    );
  }
  const c = estado.datos;
  const celdas = [
    { clave: "borradores", etiqueta: "Borradores", valor: c.borradores, enlace: "cotizaciones" as const },
    { clave: "revision", etiqueta: "En revisión", valor: c.enRevision, enlace: "revisiones" as const },
    { clave: "aprobadas", etiqueta: "Aprobadas por emitir", valor: c.aprobadasPorEmitir, enlace: "cotizaciones" as const },
    { clave: "vigentes", etiqueta: "Emitidas vigentes", valor: c.emitidasVigentes, enlace: null },
    { clave: "vencidas", etiqueta: "Vencidas", valor: c.vencidas, enlace: null },
    { clave: "precios", etiqueta: "Precios por vencer", valor: c.preciosPorVencer, enlace: null },
  ];
  return (
    <section className="tarjeta contadores-inicio" aria-labelledby="titulo-contadores">
      <h2 id="titulo-contadores" className="tarjeta-titulo">
        Estado de las cotizaciones
      </h2>
      <p className="ayuda">
        Toda la organización al {formatearFecha(c.fecha)}. Último folio: <span className="codigo">{c.ultimoFolio ?? "—"}</span>.
      </p>
      <ul className="contadores-lista">
        {celdas.map((x) => (
          <li key={x.clave} className="contador">
            <span className="contador-valor" data-contador={x.clave}>
              {x.valor}
            </span>
            <span className="contador-etiqueta">{x.enlace ? <Enlace a={{ pantalla: x.enlace }}>{x.etiqueta}</Enlace> : x.etiqueta}</span>
          </li>
        ))}
      </ul>
      {c.avisos.length > 0 ? (
        <ul className="lista-simple" aria-label="Avisos">
          {c.avisos.map((a) => (
            <li key={a.codigo}>
              <span className="codigo">{a.codigo}</span> {a.mensaje}
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary>Cómo se cuenta</summary>
        <ul>
          {c.reglas.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
