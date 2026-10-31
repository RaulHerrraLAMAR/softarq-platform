/**
 * Solicitudes de clientes (módulo 17, ADR-0021): bandeja del Preparador (`#/solicitudes`) y detalle (`#/solicitudes/{id}`).
 *
 * - Lo que el cliente capturó y envió desde la app, tal cual: proyecto, trabajos con sus medidas y notas.
 * - La estimación del cliente se muestra SIEMPRE rotulada «Estimación preliminar, no es una cotización» y nunca se
 *   hereda a la cotización formal. Atender crea una cotización en borrador SIN precios elegidos: el Preparador debe
 *   confirmarlos explícitamente (CR-07) antes de calcular.
 * - La API decide quién puede atender (`solicitudes.atender`); aquí solo se oculta el control. Atender es idempotente.
 */
import { ROTULO_ESTIMACION, type DetalleSolicitudEquipo, type EstadoSolicitud, type RenglonCliente } from "@softarq/contracts";
import { useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace, useRuta } from "../navegacion/ruta.tsx";
import type { ServiciosSolicitudes } from "./servicios.ts";

const TEXTO_ESTADO: Record<EstadoSolicitud, string> = {
  BORRADOR: "Borrador del cliente",
  ENVIADA: "Enviada",
  EN_PREPARACION: "En preparación",
  COTIZADA: "Cotizada",
  RETIRADA: "Retirada por el cliente",
};

/** Filtros de la bandeja: lo pendiente de atender es lo primero. */
const FILTROS: { clave: string; texto: string; estados: readonly EstadoSolicitud[] }[] = [
  { clave: "pendientes", texto: "Por atender", estados: ["ENVIADA"] },
  { clave: "preparacion", texto: "En preparación", estados: ["EN_PREPARACION"] },
  { clave: "cotizadas", texto: "Cotizadas", estados: ["COTIZADA"] },
  { clave: "retiradas", texto: "Retiradas", estados: ["RETIRADA"] },
];

export function InsigniaEstadoSolicitud({ estado }: { estado: EstadoSolicitud }) {
  const tono = estado === "COTIZADA" ? "emitida" : estado === "ENVIADA" ? "alerta" : estado === "RETIRADA" ? "menor" : "estado";
  return <Insignia tono={tono}>{TEXTO_ESTADO[estado]}</Insignia>;
}

export function BandejaSolicitudes({ servicios }: { servicios: ServiciosSolicitudes }) {
  const [filtro, setFiltro] = useState(FILTROS[0]!);
  const { estado: carga, recargar } = useCarga((s) => servicios.listar(filtro.estados, s), [filtro.clave]);
  return (
    <Pagina
      titulo="Solicitudes de clientes"
      subtitulo="Lo que los clientes enviaron desde la app. Atender una solicitud crea su cotización en borrador; la estimación del cliente es preliminar y no se hereda."
      acciones={<Boton onClick={recargar}>Actualizar</Boton>}
    >
      <div className="filtros" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <Boton key={f.clave} variante={filtro.clave === f.clave ? "primario" : "secundario"} aria-pressed={filtro.clave === f.clave} onClick={() => setFiltro(f)}>
            {f.texto}
          </Boton>
        ))}
      </div>
      {carga.fase === "cargando" ? <Cargando etiqueta="Cargando solicitudes…" /> : null}
      {carga.fase === "error" ? <CargaFallida fallo={carga.fallo} alReintentar={recargar} /> : null}
      {carga.fase === "listo" ? (
        carga.datos.solicitudes.length === 0 ? (
          <SinResultados>{filtro.clave === "pendientes" ? "No hay solicitudes por atender." : "No hay solicitudes en este estado."}</SinResultados>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-registros">
              <caption className="solo-lector">Solicitudes {filtro.texto.toLowerCase()}</caption>
              <thead>
                <tr>
                  <th scope="col">Folio</th>
                  <th scope="col">Cliente y proyecto</th>
                  <th scope="col">Trabajos</th>
                  <th scope="col" className="numero">
                    Estimación del cliente
                  </th>
                  <th scope="col">Enviada</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {carga.datos.solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td data-etiqueta="Folio">
                      <Enlace a={{ pantalla: "solicitud", id: s.id }}>
                        <span className="codigo">{s.folio}</span>
                      </Enlace>
                    </td>
                    <td data-etiqueta="Cliente y proyecto">
                      {s.cliente} · {s.proyecto}
                    </td>
                    <td data-etiqueta="Trabajos">{s.trabajos.join(", ") || "—"}</td>
                    <td data-etiqueta="Estimación del cliente" className="numero">
                      {s.totalEstimado ? (
                        <>
                          {formatearImporte(s.totalEstimado, "MXN")} <span className="ayuda bloque">preliminar</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-etiqueta="Enviada">{s.enviadaEn ? formatearInstante(s.enviadaEn) : "—"}</td>
                    <td data-etiqueta="Estado">
                      <InsigniaEstadoSolicitud estado={s.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </Pagina>
  );
}

const TRABAJOS: Record<string, string> = { CUBIERTA: "Cubierta", LOSA: "Losa", MURO: "Muro" };
const medida = (v: string | null, etiqueta: string) => (v ? `${etiqueta} ${v} m` : null);
const describir = (r: RenglonCliente) =>
  [r.nombre.trim() || null, medida(r.largo, "largo"), medida(r.ancho, "ancho"), medida(r.alto, "alto/espesor"), r.piezas !== "1" ? `${r.piezas} piezas` : null].filter(Boolean).join(" · ");

function Captura({ detalle }: { detalle: DetalleSolicitudEquipo }) {
  const { trabajos, notas } = detalle.captura;
  return (
    <section aria-labelledby="titulo-captura" className="tarjeta">
      <h2 id="titulo-captura" className="tarjeta-titulo">
        Lo que capturó el cliente
      </h2>
      {trabajos.length === 0 ? <p className="vacio">Sin trabajos.</p> : null}
      <ul className="lista-simple">
        {trabajos.map((t) => (
          <li key={t.id}>
            <strong>{TRABAJOS[t.trabajoCodigo] ?? t.trabajoCodigo}</strong> · opción <span className="codigo">{t.opcionCodigo}</span>
            <ul>
              {t.secciones.map((s, i) => (
                <li key={`s${i}`}>Sección {i + 1}: {describir(s)}</li>
              ))}
              {t.huecos.map((h, i) => (
                <li key={`h${i}`}>Hueco {i + 1} (se resta): {describir(h)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {notas ? (
        <p>
          <strong>Notas del cliente:</strong> {notas}
        </p>
      ) : null}
    </section>
  );
}

function EstimacionPreliminar({ detalle }: { detalle: DetalleSolicitudEquipo }) {
  const e = detalle.ultimaEstimacion;
  return (
    <section aria-labelledby="titulo-estimacion" className="tarjeta">
      <h2 id="titulo-estimacion" className="tarjeta-titulo">
        Estimación del cliente
      </h2>
      <p>
        <Insignia tono="demo">{ROTULO_ESTIMACION}</Insignia>
      </p>
      {!e ? <p className="vacio">El cliente no calculó una estimación.</p> : null}
      {e?.comercial ? (
        <p>
          Total mostrado al cliente: <strong>{formatearImporte(e.comercial.total, "MXN")}</strong> (IVA incluido, calculada el {e.fechaCalculo}).
          {e.desactualizada ? " Está desactualizada: la captura cambió después." : ""}
        </p>
      ) : null}
      {e && !e.comercial ? <p>Sin importe: {e.motivo?.mensaje ?? "no se pudo estimar."}</p> : null}
      <p className="ayuda">Es solo una referencia. La cotización formal se prepara con precios que usted confirma de forma explícita; esta estimación no se copia.</p>
    </section>
  );
}

export function DetalleSolicitud({ servicios, id, puedeAtender }: { servicios: ServiciosSolicitudes; id: string; puedeAtender: boolean }) {
  const { estado: carga, recargar } = useCarga((s) => servicios.detalle(id, s), [id]);
  const { clave, olvidar } = useIntenciones();
  const { navegar } = useRuta();
  const [atendiendo, setAtendiendo] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);

  if (carga.fase === "cargando") return <Cargando etiqueta="Cargando la solicitud…" />;
  if (carga.fase === "error") return <CargaFallida fallo={carga.fallo} alReintentar={recargar} />;
  const d = carga.datos;

  const atender = async () => {
    setAtendiendo(true);
    setFallo(null);
    const intencion = { id, revision: d.revision };
    const r = await servicios.atender(id, d.revision, clave("atender-solicitud", intencion));
    setAtendiendo(false);
    if (r.ok) {
      olvidar("atender-solicitud", intencion);
      navegar({ pantalla: "cotizacion", id: r.datos.cotizacionId });
    } else if (r.fallo.tipo !== "cancelado") setFallo(r.fallo);
  };

  return (
    <Pagina
      titulo={
        <>
          Solicitud <span className="codigo">{d.folio}</span>
        </>
      }
      subtitulo={`${d.cliente} · ${d.proyecto}`}
      acciones={
        <>
          <InsigniaEstadoSolicitud estado={d.estado} />
          <Enlace a={{ pantalla: "solicitudes" }}>Volver a la bandeja</Enlace>
        </>
      }
    >
      {fallo ? (
        <Aviso tono="error" titulo="No se pudo atender la solicitud" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
        </Aviso>
      ) : null}
      <Captura detalle={d} />
      <EstimacionPreliminar detalle={d} />
      <section aria-labelledby="titulo-atencion" className="tarjeta">
        <h2 id="titulo-atencion" className="tarjeta-titulo">
          Atención
        </h2>
        {d.estado === "ENVIADA" && puedeAtender ? (
          <>
            <p>Atender crea la cotización en borrador para este cliente y proyecto, <strong>sin precios elegidos</strong>. Después usted confirma los precios, calcula y la envía a revisión.</p>
            <Boton variante="primario" onClick={() => void atender()} disabled={atendiendo} aria-busy={atendiendo}>
              {atendiendo ? "Atendiendo…" : "Atender y preparar la cotización"}
            </Boton>
          </>
        ) : null}
        {d.estado === "ENVIADA" && !puedeAtender ? <p className="ayuda">Su función no atiende solicitudes; solo el Preparador puede hacerlo.</p> : null}
        {d.cotizacionId ? (
          <p>
            Cotización de esta solicitud: <Enlace a={{ pantalla: "cotizacion", id: d.cotizacionId }}>{d.folioCotizacion ?? "ver cotización"}</Enlace>
            {d.estado === "COTIZADA" ? " · emitida: el cliente ya la ve en su app." : " · en preparación."}
          </p>
        ) : null}
        {d.estado === "RETIRADA" ? <p>El cliente retiró esta solicitud; no se puede atender.</p> : null}
      </section>
    </Pagina>
  );
}
