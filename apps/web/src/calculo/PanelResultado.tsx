/**
 * Panel de resultado. Reglas:
 * - solo se muestran importes de un cálculo CALCULADO cuya huella coincide con la captura actual;
 * - un resultado de una captura anterior se marca «Pendiente de recalcular», sin importes;
 * - un cálculo BLOQUEADO nunca muestra importes (ni cero ni anteriores).
 */
import type { RespuestaCalculoDemo } from "@softarq/contracts";
import type { ReactNode, Ref } from "react";
import { mensajeDeFallo } from "../api/cliente.ts";
import { Aviso, Boton, Codigo, Esqueleto, Insignia } from "../comunes/componentes.tsx";
import { formatearCantidad, formatearFecha, formatearImporte, formatearTasa } from "../comunes/formato.ts";
import { idCampo, type ErroresCampo } from "../captura/solicitud.ts";
import type { EstadoCalculo } from "./usarCalculo.ts";

const NOMBRE_FALTANTE: Record<string, string> = {
  concepto: "Concepto",
  precio: "Opción de precio",
  tipoAdicional: "Tipo de costo adicional",
};

export interface PropsPanel {
  estado: EstadoCalculo;
  huellaActual: string;
  erroresLocales: ErroresCampo;
  mostrarErrores: boolean;
  alCalcular: () => void;
  /** Vuelve a pedir las opciones vigentes (tras un bloqueo por una opción que dejó de ser válida). */
  alActualizarOpciones: () => void;
  /** Recibe el foco cuando un intento de cálculo encuentra la captura incompleta. */
  refResumen: Ref<HTMLDivElement>;
  /**
   * Si la función del usuario no incluye calcular, el motivo (el botón se deshabilita). Solo es
   * presentación: la API rechaza el cálculo de todos modos (403).
   */
  motivoSinCalculo?: string | null;
  /** Texto del botón (por omisión «Calcular»; en cotizaciones, «Vista previa»). */
  textoCalcular?: string;
  /** Ayuda bajo el botón. */
  ayudaCalcular?: ReactNode;
}

export function PanelResultado({
  estado,
  huellaActual,
  erroresLocales,
  mostrarErrores,
  alCalcular,
  alActualizarOpciones,
  refResumen,
  motivoSinCalculo = null,
  textoCalcular = "Calcular",
  ayudaCalcular = "El cálculo lo hace el servidor con los catálogos vigentes.",
}: PropsPanel) {
  const calculando = estado.fase === "calculando";
  const vigente = estado.fase !== "sin_calcular" && estado.huella === huellaActual;
  const anterior = estado.fase !== "sin_calcular" && estado.fase !== "calculando" && !vigente;
  const errores = Object.entries(erroresLocales);
  const incompleta = mostrarErrores && errores.length > 0;

  return (
    <section className="panel-resultado" aria-labelledby="titulo-resultado">
      <h2 id="titulo-resultado" className="seccion-titulo">
        <span className="paso-numero" aria-hidden="true">
          4
        </span>
        Resultado
      </h2>
      <Boton
        variante="primario"
        className="boton-calcular"
        onClick={alCalcular}
        disabled={calculando || motivoSinCalculo !== null}
        aria-disabled={calculando || motivoSinCalculo !== null}
        aria-describedby={motivoSinCalculo !== null ? "motivo-sin-calculo" : undefined}
      >
        {calculando ? "Calculando…" : textoCalcular}
      </Boton>
      {motivoSinCalculo !== null ? (
        <Aviso tono="info" titulo="Calcular no está disponible para su función" id="motivo-sin-calculo">
          <p>{motivoSinCalculo}</p>
        </Aviso>
      ) : (
        <p className="ayuda">{ayudaCalcular}</p>
      )}

      {incompleta ? (
        <div className="resumen-errores" ref={refResumen} tabIndex={-1} role="alert" aria-labelledby="titulo-errores">
          <p id="titulo-errores" className="aviso-titulo">
            Faltan datos para calcular ({errores.length})
          </p>
          <ul>
            {errores.slice(0, 12).map(([ruta, mensaje]) => (
              <li key={ruta}>
                <a href={`#${idCampo(ruta)}`}>{describirRuta(ruta)}: {mensaje}</a>
              </li>
            ))}
          </ul>
          {errores.length > 12 ? <p className="ayuda">Y {errores.length - 12} más.</p> : null}
        </div>
      ) : null}

      <div className="resultado-vivo" aria-live="polite" aria-atomic="true" aria-busy={calculando}>
        {calculando ? <Esqueleto lineas={4} etiqueta="Calculando la cotización…" /> : null}
        {estado.fase === "sin_calcular" && !incompleta ? (
          <p className="vacio">Sin calcular. Complete la captura y pulse «{textoCalcular}».</p>
        ) : null}
        {anterior ? (
          <Aviso tono="aviso" titulo="Pendiente de recalcular">
            <p>La captura cambió después del último cálculo. Pulse «{textoCalcular}» para obtener el resultado de la captura actual.</p>
          </Aviso>
        ) : null}
        {vigente && estado.fase === "cancelado" ? (
          <Aviso tono="aviso" titulo="Cálculo cancelado">
            <p>La captura cambió mientras se calculaba. Pulse «{textoCalcular}» de nuevo.</p>
          </Aviso>
        ) : null}
        {vigente && estado.fase === "calculado" ? <Resumen respuesta={estado.respuesta} /> : null}
        {vigente && estado.fase === "bloqueado" ? (
          <Aviso tono="error" titulo="Cálculo bloqueado: no hay importes">
            <p>Corrija lo siguiente y vuelva a calcular:</p>
            <ul className="lista-problemas">
              {estado.problemas.map((p, i) => (
                <li key={`${p.codigo}-${i}`}>
                  <Codigo>{p.codigo}</Codigo> {p.mensaje}
                  {p.referencia ? <span className="ayuda"> (referencia: {p.referencia})</span> : null}
                </li>
              ))}
            </ul>
            {estado.problemas.some((p) => p.codigo === "BL-08") ? (
              <Boton onClick={alActualizarOpciones}>Actualizar opciones disponibles</Boton>
            ) : null}
          </Aviso>
        ) : null}
        {vigente && estado.fase === "rechazado" ? (
          <Aviso tono="error" titulo="El servicio no aceptó algunos datos">
            <ul className="lista-problemas">
              {estado.campos.map((c) => (
                <li key={c.ruta}>
                  <a href={`#${idCampo(c.ruta)}`}>{describirRuta(c.ruta)}</a>: {c.mensaje}
                </li>
              ))}
            </ul>
          </Aviso>
        ) : null}
        {vigente && estado.fase === "no_encontrado" ? (
          <Aviso tono="error" titulo="Elementos que ya no están en el catálogo">
            <ul className="lista-problemas">
              {estado.faltantes.map((f) => (
                <li key={`${f.tipo}-${f.codigo}`}>
                  {NOMBRE_FALTANTE[f.tipo] ?? "Elemento"} <Codigo>{f.codigo}</Codigo>
                </li>
              ))}
            </ul>
            <p>Quítelos de la captura o elija otra opción.</p>
          </Aviso>
        ) : null}
        {vigente && estado.fase === "error" ? (
          <Aviso tono="error" titulo="No se pudo calcular">
            <p>{mensajeDeFallo(estado.fallo)}</p>
            <p className="ayuda">Su captura se conserva.</p>
            <Boton onClick={alCalcular}>Reintentar</Boton>
          </Aviso>
        ) : null}
      </div>
      {vigente && estado.fase === "calculado" ? <Detalle respuesta={estado.respuesta} /> : null}
    </section>
  );
}

export function Resumen({ respuesta, etiqueta }: { respuesta: RespuestaCalculoDemo; etiqueta?: ReactNode }) {
  const c = respuesta.cotizacion;
  return (
    <div className="resumen">
      <p className="resumen-estado">
        {etiqueta ?? (
          <>
            <Insignia tono="estado">Calculado</Insignia> con catálogos vigentes al {formatearFecha(respuesta.fechaCalculo)}
          </>
        )}
      </p>
      {c.leyenda ? <p className="leyenda-demo">{c.leyenda}</p> : null}
      <dl className="totales">
        <div className="total-principal">
          <dt>Total</dt>
          <dd data-prueba="total">{formatearImporte(c.total, c.moneda)}</dd>
        </div>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatearImporte(c.subtotal, c.moneda)}</dd>
        </div>
        <div>
          <dt>
            {c.impuesto.nombre} ({formatearTasa(c.impuesto.tasa)})
          </dt>
          <dd>{formatearImporte(c.impuesto.importe, c.moneda)}</dd>
        </div>
      </dl>
      <p className="ayuda">Moneda: {c.moneda}</p>
      {respuesta.avisos.length > 0 ? (
        <Aviso tono="info" titulo="Avisos">
          <ul className="lista-problemas">
            {respuesta.avisos.map((a, i) => (
              <li key={`${a.codigo}-${i}`}>
                <Codigo>{a.codigo}</Codigo> {a.mensaje}
              </li>
            ))}
          </ul>
        </Aviso>
      ) : null}
    </div>
  );
}

export function Detalle({ respuesta }: { respuesta: RespuestaCalculoDemo }) {
  const c = respuesta.cotizacion;
  return (
    <details className="detalle">
      <summary>Detalle de la cotización ({c.partidas.length} {c.partidas.length === 1 ? "partida" : "partidas"})</summary>
      <div className="tabla-contenedor">
        <table className="tabla tabla-detalle" role="table">
          <caption className="solo-lector">Detalle de la cotización</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Núm.</th>
              <th role="columnheader" scope="col">Descripción</th>
              <th role="columnheader" scope="col">Unidad</th>
              <th role="columnheader" scope="col" className="numero">
                Cantidad
              </th>
              <th role="columnheader" scope="col" className="numero">
                Precio unitario
              </th>
              <th role="columnheader" scope="col" className="numero">
                Importe
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {c.partidas.map((p) => (
              <tr role="row" key={p.numero}>
                <td role="cell" data-etiqueta="Núm.">{p.numero}</td>
                <td role="cell" data-etiqueta="Descripción">{p.descripcion}</td>
                <td role="cell" data-etiqueta="Unidad">{p.unidad}</td>
                <td role="cell" data-etiqueta="Cantidad" className="numero">
                  {formatearCantidad(p.cantidad)}
                </td>
                <td role="cell" data-etiqueta="Precio unitario" className="numero">
                  {formatearImporte(p.precioUnitario, c.moneda)}
                </td>
                <td role="cell" data-etiqueta="Importe" className="numero">
                  {formatearImporte(p.importe, c.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot role="rowgroup">
            <tr role="row">
              <th role="rowheader" scope="row" colSpan={5}>
                Subtotal
              </th>
              <td role="cell" data-etiqueta="Subtotal" className="numero">
                {formatearImporte(c.subtotal, c.moneda)}
              </td>
            </tr>
            <tr role="row">
              <th role="rowheader" scope="row" colSpan={5}>
                {c.impuesto.nombre} ({formatearTasa(c.impuesto.tasa)})
              </th>
              <td role="cell" data-etiqueta="Impuesto" className="numero">
                {formatearImporte(c.impuesto.importe, c.moneda)}
              </td>
            </tr>
            <tr role="row">
              <th role="rowheader" scope="row" colSpan={5}>
                Total
              </th>
              <td role="cell" data-etiqueta="Total" className="numero">
                {formatearImporte(c.total, c.moneda)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}

/** «partidas[0].mediciones[1].piezas» → «Partida 1, renglón 2, piezas». */
export function describirRuta(ruta: string): string {
  if (ruta === "consolidarCompras") return "Compras de insumos";
  if (ruta === "partidas") return "Partidas";
  if (ruta === "preciosElegidos") return "Opciones disponibles";
  const sel = /^seleccion\.(.+)$/.exec(ruta);
  if (sel) return `Opción para ${sel[1]}`;
  const partes: string[] = [];
  const p = /partidas\[(\d+)\]/.exec(ruta);
  if (p) partes.push(`Partida ${Number(p[1]) + 1}`);
  const m = /mediciones\[(\d+)\]/.exec(ruta);
  if (m) partes.push(`renglón ${Number(m[1]) + 1}`);
  const campo = /\.([A-Za-z]+)$/.exec(ruta)?.[1];
  const nombres: Record<string, string> = {
    piezas: "piezas",
    largo: "largo",
    ancho: "ancho",
    alto: "alto",
    signo: "signo",
    descripcion: "descripción",
    cantidad: "cantidad",
    monto: "monto",
    tipoAdicionalCodigo: "tipo",
    mediciones: "medidas",
  };
  if (campo && nombres[campo]) partes.push(nombres[campo]);
  return partes.length > 0 ? partes.join(", ") : "Captura";
}
