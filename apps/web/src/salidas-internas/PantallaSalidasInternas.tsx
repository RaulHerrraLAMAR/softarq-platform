/**
 * Salidas internas de una versión (módulo 14, ADR-0018): compras calculadas (12 COMPRAS), detalle
 * del cálculo (13 DETALLE_CALCULO) e indicadores (14 REVISION). Contrato interno con capacidad
 * propia (`salidas.consultar`); la API la exige en cada consulta.
 *
 * - Siempre una versión concreta, elegida en la ruta o en el selector: nunca se cambia en silencio
 *   a la última. La consulta es de solo lectura; «Reintentar» solo repite la lectura.
 * - Las cifras llegan como texto decimal y se muestran sin `number`: el prorrateo con cuatro
 *   decimales truncados (§3.14) y los importes redondeados a centavos solo al mostrar.
 * - Si la función deja de permitir la consulta (403), se descartan los datos en pantalla y se
 *   vuelve a pedir la sesión para que la navegación deje de ofrecerla.
 */
import type { CompraInterna, EstadoVersion, Indicador, PartidaInterna, SalidasInternasVersion } from "@softarq/contracts";
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearCantidad, formatearFecha, formatearImporte, formatearInstante, formatearTasa, redondearDecimales, truncarDecimales } from "../comunes/formato.ts";
import { Cargando, CargaFallida, Folio, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace, VISTAS_SALIDAS_RUTA, useRuta, type VistaSalidas } from "../navegacion/ruta.tsx";

const TITULOS: Record<VistaSalidas, string> = {
  compras: "Compras calculadas",
  detalle: "Detalle del cálculo",
  indicadores: "Indicadores",
};

const TEXTO_ESTADO: Record<EstadoVersion, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  APROBADA: "Aprobada",
  EMITIDA: "Emitida",
  SUSTITUIDA: "Sustituida",
};

const TEXTO_MODALIDAD = {
  UNIDAD: "Por unidad",
  JORNADA: "Por jornada",
  SUBCONTRATO: "Subcontrato",
} as const;

const SIN_MONEDA = "MXN";

/** Importe con precisión completa mostrado en centavos (CR-15), sin alterar el valor recibido. */
const importe = (texto: string, moneda: string) => formatearImporte(redondearDecimales(texto, 2), moneda);
/** Cantidad con hasta 4 decimales (Word maestro §3.3: #,##0.00##), sin ceros sobrantes. */
const cantidad = (texto: string) => formatearCantidad(redondearDecimales(texto, 4).replace(/\.?0+$/, ""));
/** Fracción como porcentaje con dos decimales ("0.1666…" → "16.67 %"). */
const porcentaje = (texto: string) => formatearTasa(redondearDecimales(texto, 4));

function Nombre({ r }: { r: { codigo: string; nombre: string | null } }) {
  return (
    <>
      {r.nombre ? <span className="bloque">{r.nombre}</span> : null}
      <Codigo>{r.codigo}</Codigo>
    </>
  );
}

export function PantallaSalidasInternas({
  servicios,
  id,
  numero,
  vista,
  alPerderPermiso,
}: {
  servicios: Pick<ServiciosCotizaciones, "salidasInternas" | "detalleCotizacion">;
  id: string;
  numero: number;
  vista: VistaSalidas;
  /** Tras un 403: la sesión se vuelve a consultar (la API ya no concede `salidas.consultar`). */
  alPerderPermiso?: () => void;
}) {
  const { estado, recargar } = useCarga((s) => servicios.salidasInternas(id, numero, s), [id, numero]);
  const sinPermiso = estado.fase === "error" && estado.fallo.tipo === "sin_permiso";
  const avisado = useRef(false);
  useEffect(() => {
    if (sinPermiso && !avisado.current) {
      avisado.current = true;
      alPerderPermiso?.();
    }
  }, [sinPermiso, alPerderPermiso]);

  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando las salidas internas…" />;
  if (estado.fase === "error") {
    if (estado.fallo.tipo === "sin_permiso") {
      return (
        <Pagina titulo="Sin permiso">
          <Aviso tono="info" titulo="Su función ya no permite consultar las salidas internas" rol="alert">
            <p>Las compras calculadas, el detalle y los indicadores internos los consultan el Preparador y el Revisor. Puede volver a la versión comercial.</p>
            <Enlace a={{ pantalla: "version", id, numero }}>Volver a la versión</Enlace>
          </Aviso>
        </Pagina>
      );
    }
    return <CargaFallida fallo={estado.fallo} alReintentar={recargar} titulo="No se pudieron consultar las salidas internas" />;
  }
  const s = estado.datos;
  const e = s.encabezado;
  const moneda = e.moneda ?? SIN_MONEDA;
  return (
    <Pagina
      titulo={
        <>
          Salidas internas <span className="codigo">{e.idVersion}</span>
        </>
      }
      subtitulo={
        <>
          <Folio folio={e.folio} /> · {TEXTO_ESTADO[e.estado]}
        </>
      }
      acciones={<Enlace a={{ pantalla: "version", id, numero }}>Volver a la versión</Enlace>}
    >
      <div className="marca-interna" role="note">
        <Insignia tono="alerta">Uso interno</Insignia>
        <p>No es un documento para el cliente: contiene costos, consumos, proveedores, recargo y margen. Valores congelados al calcular la versión.</p>
      </div>
      <SelectorVersion servicios={servicios} id={id} numero={numero} vista={vista} />
      <Encabezado s={s} />
      {s.disponibilidad.estado === "SIN_NOMBRES" ? (
        <Aviso tono="info" titulo="Nombres y vigencias no congelados en esta versión" rol="status">
          <p>{s.disponibilidad.motivo}</p>
        </Aviso>
      ) : null}
      {s.disponibilidad.estado === "NO_DISPONIBLE" ? (
        <Aviso tono="aviso" titulo="Detalle no disponible" rol="status">
          <p>{s.disponibilidad.motivo}</p>
        </Aviso>
      ) : (
        <>
          {s.conciliacion && !(s.conciliacion.categorias && s.conciliacion.importes && s.conciliacion.prorrateo) ? (
            <Aviso tono="error" titulo="Las sumas congeladas no cuadran" rol="alert">
              <p>Se muestran tal como se guardaron, sin corregir. Informe al responsable del sistema.</p>
            </Aviso>
          ) : null}
          <nav aria-label="Salidas internas de la versión">
            <ul className="navegacion-catalogo">
              {VISTAS_SALIDAS_RUTA.map((v) => (
                <li key={v}>
                  <Enlace a={{ pantalla: "salidas", id, numero, vista: v }} className="navegacion-enlace" actual={v === vista}>
                    {TITULOS[v]}
                  </Enlace>
                </li>
              ))}
            </ul>
          </nav>
          {vista === "compras" ? <VistaCompras s={s} moneda={moneda} /> : null}
          {vista === "detalle" ? <VistaDetalle s={s} moneda={moneda} /> : null}
          {vista === "indicadores" ? <VistaIndicadores s={s} moneda={moneda} /> : null}
        </>
      )}
    </Pagina>
  );
}

/** Versión elegida explícitamente: cambiarla cambia la ruta (nunca se salta a la última en silencio). */
function SelectorVersion({
  servicios,
  id,
  numero,
  vista,
}: {
  servicios: Pick<ServiciosCotizaciones, "detalleCotizacion">;
  id: string;
  numero: number;
  vista: VistaSalidas;
}) {
  const campo = useId();
  const { navegar } = useRuta();
  const { estado } = useCarga((s) => servicios.detalleCotizacion(id, s), [id]);
  if (estado.fase !== "listo" || estado.datos.versiones.length < 2) return null;
  const versiones = [...estado.datos.versiones].sort((a, b) => a.numero - b.numero);
  return (
    <div className="campo selector-version">
      <label htmlFor={campo}>Versión consultada</label>
      <select id={campo} value={numero} onChange={(ev) => navegar({ pantalla: "salidas", id, numero: Number(ev.target.value), vista })}>
        {versiones.map((v) => (
          <option key={v.numero} value={v.numero}>
            {v.idVersion} · {TEXTO_ESTADO[v.estado]} · {formatearFecha(v.fechaCalculo)}
            {v.esUltima ? " · última" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Encabezado({ s }: { s: SalidasInternasVersion }) {
  const e = s.encabezado;
  return (
    <dl className="datos-version">
      <div>
        <dt>Origen</dt>
        <dd>
          <Insignia tono="demo">WEB DEMO</Insignia> {e.ambiente ? <span>Ambiente {e.ambiente}</span> : null}
        </dd>
      </div>
      <div>
        <dt>Folio y versión</dt>
        <dd>
          <Codigo>{e.idVersion}</Codigo> {e.esUltima ? <span className="ayuda">(última versión)</span> : <span className="ayuda">(hay versiones posteriores)</span>}
        </dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{TEXTO_ESTADO[e.estado]}</dd>
      </div>
      <div>
        <dt>Fecha del cálculo</dt>
        <dd>
          {formatearFecha(e.fechaCalculo)} <span className="ayuda bloque">Guardada el {formatearInstante(e.creadoEn)} por {e.autorNombre}</span>
        </dd>
      </div>
      <div>
        <dt>Modalidad de compras</dt>
        <dd>
          {e.consolidarCompras === null
            ? "No disponible"
            : e.consolidarCompras
              ? "Consolidadas por producto y proveedor (CR-05)"
              : "Separadas por partida (CR-05)"}
        </dd>
      </div>
      <div>
        <dt>Alcance</dt>
        <dd>
          Solo esta versión: {s.partidas.length} {s.partidas.length === 1 ? "partida" : "partidas"} y {s.compras.length}{" "}
          {s.compras.length === 1 ? "compra" : "compras"}. Motor <Codigo>{e.versionMotor}</Codigo>
        </dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Compras calculadas (12 COMPRAS)
// ---------------------------------------------------------------------------

function VistaCompras({ s, moneda }: { s: SalidasInternasVersion; moneda: string }) {
  const titulo = useId();
  return (
    <section className="seccion" aria-labelledby={titulo}>
      <h2 id={titulo} className="seccion-titulo">
        Compras calculadas
      </h2>
      <p className="ayuda">
        Presentaciones a comprar según el consumo de la versión. El sobrante se informa y no se descuenta (D-10). Cantidades en la unidad base del insumo.
      </p>
      {s.compras.length === 0 ? (
        <SinResultados>Esta versión no tiene compras: sus partidas son solo costos adicionales.</SinResultados>
      ) : (
        <>
          <div className="tabla-contenedor">
            <table className="tabla tabla-registros tabla-interna">
              <caption className="solo-lector">Compras calculadas de {s.encabezado.idVersion}</caption>
              <thead>
                <tr>
                  <th scope="col">Compra</th>
                  <th scope="col">Insumo</th>
                  <th scope="col">Producto, presentación y regla</th>
                  <th scope="col">Proveedor y precio</th>
                  <th scope="col">Partida</th>
                  <th scope="col" className="numero">Consumo total</th>
                  <th scope="col" className="numero">Cantidad comprada</th>
                  <th scope="col" className="numero">Unidades</th>
                  <th scope="col" className="numero">Sobrante</th>
                  <th scope="col" className="numero">Costo de compra</th>
                </tr>
              </thead>
              <tbody>
                {s.compras.map((k) => (
                  <FilaCompra key={k.numero} k={k} moneda={moneda} />
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="seccion-subtitulo">Prorrateo de cada compra (CR-08)</h3>
          <p className="ayuda">
            El costo de cada compra se reparte entre las partidas en proporción a su consumo; la última recibe el remanente para que la suma sea exacta. Se
            muestra con cuatro decimales truncados; se calculó con precisión completa.
          </p>
          <div className="tabla-contenedor">
            <table className="tabla tabla-registros tabla-interna">
              <caption className="solo-lector">Prorrateo de las compras de {s.encabezado.idVersion}</caption>
              <thead>
                <tr>
                  <th scope="col">Compra</th>
                  <th scope="col">Partida</th>
                  <th scope="col">Componente</th>
                  <th scope="col" className="numero">Consumo base</th>
                  <th scope="col" className="numero">Costo prorrateado</th>
                </tr>
              </thead>
              <tbody>
                {s.compras.flatMap((k) =>
                  k.prorrateo.map((x) => (
                    <tr key={`${k.numero}-${x.partidaId}-${x.componenteCodigo}`}>
                      <td data-etiqueta="Compra">K{String(k.numero).padStart(2, "0")}</td>
                      <td data-etiqueta="Partida">{x.partidaNumero}</td>
                      <td data-etiqueta="Componente">
                        <Codigo>{x.componenteCodigo}</Codigo>
                      </td>
                      <td data-etiqueta="Consumo base" className="numero">
                        {cantidad(x.consumoBase)}
                      </td>
                      <td data-etiqueta="Costo prorrateado" className="numero">
                        {formatearImporte(truncarDecimales(x.costoProrrateado, 4), moneda)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <AvisosInternos s={s} />
    </section>
  );
}

function FilaCompra({ k, moneda }: { k: CompraInterna; moneda: string }) {
  const unidad = k.unidadBase ?? "";
  return (
    <tr>
      <td data-etiqueta="Compra">K{String(k.numero).padStart(2, "0")}</td>
      <td data-etiqueta="Insumo">
        <Nombre r={k.insumo} />
      </td>
      <td data-etiqueta="Producto y presentación">
        <Nombre r={k.producto} />
        {k.presentacion ? <span className="ayuda bloque">{k.presentacion}</span> : null}
        <span className="bloque">
          {k.regla === "FRACCIONABLE"
            ? `Fraccionable por ${cantidad(k.incrementoMinimo ?? "0")} ${unidad}`
            : `Presentación completa de ${cantidad(k.contenido)} ${unidad}`}
        </span>
      </td>
      <td data-etiqueta="Proveedor y precio">
        <Nombre r={k.proveedor} />
        <span className="bloque">
          {importe(k.precioUnitario, moneda)} por {k.unidadCompra ?? "unidad de compra"}
        </span>
        <span className="ayuda bloque">
          Precio <Codigo>{k.precio.codigo}</Codigo>
          {k.precio.vigenteHasta ? ` vigente hasta ${formatearFecha(k.precio.vigenteHasta)}` : null}
        </span>
      </td>
      <td data-etiqueta="Partida" className="sin-corte">
        {k.partida ? `Partida ${k.partida.numero}` : "Consolidada"}
      </td>
      <td data-etiqueta="Consumo total" className="numero">
        {cantidad(k.consumoTotal)} {unidad}
      </td>
      <td data-etiqueta="Cantidad comprada" className="numero">
        {cantidad(k.cantidadComprada)} {unidad}
      </td>
      <td data-etiqueta="Unidades" className="numero">
        {cantidad(k.unidades)} {k.unidadCompra ?? ""}
      </td>
      <td data-etiqueta="Sobrante" className="numero">
        {cantidad(k.sobrante)} {unidad}
      </td>
      <td data-etiqueta="Costo de compra" className="numero">
        {importe(k.costoCompra, moneda)}
      </td>
    </tr>
  );
}

function AvisosInternos({ s }: { s: SalidasInternasVersion }) {
  if (s.avisos.length === 0) return null;
  return (
    <Aviso tono="aviso" titulo="Avisos del cálculo">
      <ul>
        {s.avisos.map((a) => (
          <li key={`${a.codigo}-${a.referencia}`}>
            <strong>{a.codigo}</strong> {a.mensaje}
          </li>
        ))}
      </ul>
    </Aviso>
  );
}

// ---------------------------------------------------------------------------
// Detalle del cálculo (13 DETALLE_CALCULO)
// ---------------------------------------------------------------------------

function VistaDetalle({ s, moneda }: { s: SalidasInternasVersion; moneda: string }) {
  const titulo = useId();
  return (
    <section className="seccion" aria-labelledby={titulo}>
      <h2 id={titulo} className="seccion-titulo">
        Detalle del cálculo
      </h2>
      <p className="ayuda">
        Origen de cada importe por partida: medición (CR-01), consumos y conversiones (CR-02 a CR-04), mano de obra (CR-09), costos adicionales (CR-10) y precio
        (CR-11, CR-12). El recargo de esta versión es {s.indicadores.recargoSobreCosto.estado === "VALOR" ? porcentaje(s.indicadores.recargoSobreCosto.valor) : "no disponible"} sobre el
        costo.
      </p>
      {s.partidas.map((p) => (
        <DetallePartida key={p.id} p={p} moneda={moneda} />
      ))}
    </section>
  );
}

function DetallePartida({ p, moneda }: { p: PartidaInterna; moneda: string }) {
  const titulo = useId();
  return (
    <section className="partida-interna" aria-labelledby={titulo}>
      <h3 id={titulo} className="seccion-subtitulo">
        Partida {p.numero}. {p.descripcion}
      </h3>
      <dl className="datos-version">
        <div>
          <dt>{p.tipo === "CONCEPTO" ? "Concepto" : "Costo adicional"}</dt>
          <dd>
            {p.concepto ? <Nombre r={p.concepto} /> : null}
            {p.tipoAdicional ? <Nombre r={p.tipoAdicional} /> : null}
            {p.categoria ? <span className="ayuda bloque">Categoría {p.categoria}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Cantidad</dt>
          <dd>
            {cantidad(p.cantidad)} {p.unidad}
            {p.renglones.length > 0 ? (
              <span className="ayuda bloque">
                {p.renglones.length} {p.renglones.length === 1 ? "renglón" : "renglones"} de medición: {p.renglones.map((r) => cantidad(r.resultado)).join(" + ")}
              </span>
            ) : null}
          </dd>
        </div>
        {p.manoObra ? (
          <div>
            <dt>{p.manoObra.modalidad === "SUBCONTRATO" ? "Subcontrato" : "Mano de obra"}</dt>
            <dd>
              {TEXTO_MODALIDAD[p.manoObra.modalidad]}: {importe(p.manoObra.importeTarifa, moneda)}
              {p.manoObra.unidad ? ` por ${p.manoObra.modalidad === "JORNADA" ? "jornada" : p.manoObra.unidad}` : null}
              {p.manoObra.jornadas ? ` · ${cantidad(p.manoObra.jornadas)} jornadas (rendimiento ${cantidad(p.manoObra.rendimientoJornada ?? "0")} ${p.unidad}/jornada)` : null}
              <span className="ayuda bloque">
                Tarifa <Nombre r={p.manoObra.tarifa} />
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
      {p.consumos.length > 0 ? (
        <div className="tabla-contenedor">
          <table className="tabla tabla-registros tabla-interna">
            <caption className="solo-lector">Consumos de la partida {p.numero}</caption>
            <thead>
              <tr>
                <th scope="col">Componente e insumo</th>
                <th scope="col" className="numero">Rendimiento</th>
                <th scope="col" className="numero">Traslape</th>
                <th scope="col" className="numero">Neto</th>
                <th scope="col" className="numero">Desperdicio</th>
                <th scope="col" className="numero">Con desperdicio</th>
                <th scope="col" className="numero">Factor de conversión</th>
                <th scope="col" className="numero">Consumo base</th>
                <th scope="col">Compra</th>
                <th scope="col" className="numero">Costo prorrateado</th>
              </tr>
            </thead>
            <tbody>
              {p.consumos.map((c) => (
                <tr key={c.componenteCodigo}>
                  <td data-etiqueta="Componente e insumo">
                    <Codigo>{c.componenteCodigo}</Codigo> <Nombre r={c.insumo} />
                    {c.ajustes.map((a) => (
                      <span key={a.numero} className="ayuda bloque">
                        Excepción {a.numero} ({a.campo === "RENDIMIENTO" ? "rendimiento" : "desperdicio"} {a.campo === "DESPERDICIO" ? porcentaje(a.valorAplicado) : cantidad(a.valorAplicado)}):{" "}
                        {a.estado === "AUTORIZADA" ? "autorizada" : a.estado === "RECHAZADA" ? "rechazada" : "pendiente de decisión"}
                      </span>
                    ))}
                  </td>
                  <td data-etiqueta="Rendimiento" className="numero">
                    {cantidad(c.rendimientoUsado)} {c.unidadRendimiento}
                    {c.catalogo && c.catalogo.rendimiento !== c.rendimientoUsado ? <span className="ayuda bloque">catálogo: {cantidad(c.catalogo.rendimiento)}</span> : null}
                  </td>
                  <td data-etiqueta="Traslape" className="numero">
                    {cantidad(c.traslapeUsado)}
                  </td>
                  <td data-etiqueta="Neto" className="numero">
                    {cantidad(c.consumoNeto)} {c.unidadRendimiento}
                  </td>
                  <td data-etiqueta="Desperdicio" className="numero">
                    {porcentaje(c.desperdicioUsado)}
                    {c.catalogo && c.catalogo.desperdicio !== c.desperdicioUsado ? <span className="ayuda bloque">catálogo: {porcentaje(c.catalogo.desperdicio)}</span> : null}
                  </td>
                  <td data-etiqueta="Con desperdicio" className="numero">
                    {cantidad(c.consumoConDesperdicio)} {c.unidadRendimiento}
                  </td>
                  <td data-etiqueta="Factor de conversión" className="numero">
                    {cantidad(c.factorConversion)} {c.unidadBase}/{c.unidadRendimiento}
                  </td>
                  <td data-etiqueta="Consumo base" className="numero">
                    {cantidad(c.consumoBase)} {c.unidadBase}
                  </td>
                  <td data-etiqueta="Compra">K{String(c.compraNumero).padStart(2, "0")}</td>
                  <td data-etiqueta="Costo prorrateado" className="numero">
                    {formatearImporte(truncarDecimales(c.costoProrrateado, 4), moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <dl className="totales totales-internos">
        <Linea etiqueta="Materiales (prorrateo)" valor={importe(p.costoMateriales, moneda)} />
        <Linea etiqueta="Mano de obra" valor={importe(p.costoManoObra, moneda)} />
        <Linea etiqueta="Subcontrato" valor={importe(p.costoSubcontrato, moneda)} />
        <Linea etiqueta="Costo adicional capturado" valor={importe(p.costoAdicional, moneda)} />
        <Linea etiqueta="Costo directo" valor={importe(p.costoDirecto, moneda)} />
        <Linea etiqueta="Precio unitario de venta" valor={importe(p.precioUnitarioVenta, moneda)} />
        <Linea etiqueta="Importe" valor={importe(p.importe, moneda)} />
      </dl>
    </section>
  );
}

function Linea({ etiqueta, valor, ayuda }: { etiqueta: string; valor: ReactNode; ayuda?: string | undefined }) {
  return (
    <div>
      <dt>
        {etiqueta}
        {ayuda ? <span className="ayuda bloque">{ayuda}</span> : null}
      </dt>
      <dd>{valor}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores de la versión (10 COTIZAR, 13 DETALLE_CALCULO, 14 REVISION)
// ---------------------------------------------------------------------------

function textoIndicador(i: Indicador, formato: (v: string) => string): ReactNode {
  if (i.estado === "VALOR") return formato(i.valor);
  return (
    <>
      {i.estado === "NO_APLICA" ? "No aplica" : "No disponible"}
      <span className="ayuda bloque">{i.motivo}</span>
    </>
  );
}

function VistaIndicadores({ s, moneda }: { s: SalidasInternasVersion; moneda: string }) {
  const titulo = useId();
  const i = s.indicadores;
  const dinero = (v: string) => importe(v, moneda);
  return (
    <section className="seccion" aria-labelledby={titulo}>
      <h2 id={titulo} className="seccion-titulo">
        Indicadores de la versión
      </h2>
      <p className="ayuda">
        Solo de {s.encabezado.idVersion}, con los valores congelados al calcular; no suman otras versiones ni cotizaciones. Los costos se calcularon con precisión
        completa y aquí se muestran redondeados a centavos.
      </p>
      <dl className="totales totales-internos">
        <Linea etiqueta="Materiales" ayuda="Suma del prorrateo de compras por partida" valor={textoIndicador(i.costoMateriales, dinero)} />
        <Linea etiqueta="Mano de obra" ayuda="Por unidad y por jornada (CR-09)" valor={textoIndicador(i.costoManoObra, dinero)} />
        <Linea etiqueta="Subcontrato" ayuda="Modalidad subcontrato (CR-09)" valor={textoIndicador(i.costoSubcontrato, dinero)} />
        {i.costosAdicionales.map((a) => (
          <Linea key={a.categoria} etiqueta={`Costo adicional: ${a.categoria}`} ayuda="Monto capturado (CR-10)" valor={dinero(a.valor)} />
        ))}
        <Linea etiqueta="Costo directo" ayuda="Materiales + mano de obra + subcontrato + adicionales" valor={textoIndicador(i.costoDirectoRedondeado, dinero)} />
        <Linea etiqueta="Subtotal de venta" ayuda="Suma de importes de las partidas (CR-12)" valor={textoIndicador(i.subtotal, dinero)} />
        <Linea
          etiqueta={i.impuesto.nombre ? `Impuestos: ${i.impuesto.nombre}` : "Impuestos"}
          ayuda={i.impuesto.tasa.estado === "VALOR" ? `${formatearTasa(i.impuesto.tasa.valor)} sobre el subtotal de venta (CR-13)` : undefined}
          valor={textoIndicador(i.impuesto.importe, dinero)}
        />
        <Linea etiqueta="Total" ayuda="Subtotal + impuestos (CR-14)" valor={textoIndicador(i.total, dinero)} />
      </dl>
      <h3 className="seccion-subtitulo">Recargo y margen</h3>
      <p className="ayuda">Son medidas distintas: el recargo se suma al costo para formar el precio; el margen se mide sobre la venta y solo es un indicador.</p>
      <dl className="totales totales-internos">
        <Linea
          etiqueta="Recargo sobre costo aplicado"
          ayuda="Precio unitario = redondear(costo directo × (1 + recargo) ÷ cantidad) (CR-11)"
          valor={textoIndicador(i.recargoSobreCosto, porcentaje)}
        />
        <Linea
          etiqueta="Margen sobre precio (indicador)"
          ayuda="(Subtotal de venta − costo directo) ÷ subtotal de venta (D-07)"
          valor={textoIndicador(i.margenSobrePrecio, porcentaje)}
        />
      </dl>
    </section>
  );
}
