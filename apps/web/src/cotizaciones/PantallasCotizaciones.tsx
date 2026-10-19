/**
 * Lista de cotizaciones, alta (cliente → proyecto → folio) y consulta de una versión guardada
 * (módulo 6). Una versión se muestra tal como se almacenó: abrirla nunca recalcula.
 */
import { useEffect, useState, type FormEvent } from "react";
import type { CapturaBorrador, Cliente, Proyecto } from "@softarq/contracts";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Detalle, Resumen } from "../calculo/PanelResultado.tsx";
import { Aviso, Boton, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearFecha, formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, Folio, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { FormularioCliente, FormularioProyecto } from "../clientes/formularios.tsx";
import { Enlace, useRuta } from "../navegacion/ruta.tsx";
import { CambiosVersion, EstadoVersion, ResumenCaptura } from "./componentes.tsx";
import { TarjetaEmision } from "./emision.tsx";
import { PanelDuplicar, VistaPreviaPdf, admiteVistaPrevia } from "./duplicar-modo-vista-previa.tsx";
import { PanelExcepcionesVersion } from "../excepciones/PanelExcepcionesVersion.tsx";
import { PanelRespuesta } from "./respuestas.tsx";

export function ListaCotizaciones({ servicios, puedePreparar }: { servicios: ServiciosCotizaciones; puedePreparar: boolean }) {
  const [texto, setTexto] = useState("");
  const [buscar, setBuscar] = useState("");
  const { estado, recargar } = useCarga((s) => servicios.listarCotizaciones({ buscar }, s), [buscar]);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setBuscar(texto);
  };
  return (
    <Pagina
      titulo="Cotizaciones"
      subtitulo="Folios de la web DEMO: historial independiente del libro Excel de la fase 1."
      acciones={
        puedePreparar ? (
          <Enlace className="boton boton-primario" a={{ pantalla: "nueva-cotizacion", proyectoId: null }}>
            Nueva cotización
          </Enlace>
        ) : null
      }
    >
      <form className="barra-busqueda" role="search" onSubmit={enviar}>
        <label className="etiqueta" htmlFor="buscar-cotizaciones">
          Buscar por folio, cliente o proyecto
        </label>
        <div className="entrada-con-accion">
          <input id="buscar-cotizaciones" type="search" value={texto} maxLength={60} onChange={(e) => setTexto(e.target.value)} />
          <Boton type="submit">Buscar</Boton>
        </div>
      </form>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando cotizaciones…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.cotizaciones.length === 0 ? (
          <SinResultados>
            {buscar ? `No hay cotizaciones que coincidan con «${buscar}».` : "Todavía no hay cotizaciones."}
            {puedePreparar && !buscar ? " Use «Nueva cotización»: primero elija o cree el cliente y el proyecto." : null}
          </SinResultados>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-registros">
              <caption className="solo-lector">Cotizaciones</caption>
              <thead>
                <tr>
                  <th scope="col">Folio</th>
                  <th scope="col">Cliente y proyecto</th>
                  <th scope="col">Borrador</th>
                  <th scope="col">Última versión</th>
                </tr>
              </thead>
              <tbody>
                {estado.datos.cotizaciones.map((c) => (
                  <tr key={c.id}>
                    <td data-etiqueta="Folio">
                      <Enlace a={{ pantalla: "cotizacion", id: c.id }}>
                        <span className="codigo">{c.folio}</span>
                      </Enlace>{" "}
                      <Insignia tono="demo">WEB DEMO</Insignia>
                    </td>
                    <td data-etiqueta="Cliente y proyecto">
                      {c.cliente.nombre}
                      {c.cliente.activo ? null : <span className="ayuda"> (inactivo)</span>}
                      <span className="ayuda bloque">
                        {c.proyecto.nombre}
                        {c.proyecto.activo ? "" : " (inactivo)"}
                      </span>
                    </td>
                    <td data-etiqueta="Borrador">
                      Revisión {c.revisionBorrador} · {formatearInstante(c.borradorActualizadoEn)}
                    </td>
                    <td data-etiqueta="Última versión">
                      {c.ultimaVersion ? (
                        <>
                          <span className="codigo">v{c.ultimaVersion.numero}</span> · {formatearImporte(c.ultimaVersion.total, "MXN")}
                          {c.ultimaVersion.revisionBorrador !== c.revisionBorrador ? (
                            <span className="ayuda bloque">El borrador cambió después de esta versión.</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="ayuda">Sin versiones</span>
                      )}
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

/** Lista de opciones con radio (cliente o proyecto). */
function ListaSeleccion<T extends { id: string; codigo: string; nombre: string }>({
  leyenda,
  nombre,
  elementos,
  elegido,
  alElegir,
  detalle,
}: {
  leyenda: string;
  nombre: string;
  elementos: T[];
  elegido: string | null;
  alElegir: (id: string) => void;
  detalle?: (e: T) => string | null;
}) {
  return (
    <fieldset className="lista-seleccion">
      <legend className="solo-lector">{leyenda}</legend>
      {elementos.map((e) => (
        <label key={e.id} className={`opcion${elegido === e.id ? " opcion-elegida" : ""}`}>
          <input type="radio" name={nombre} checked={elegido === e.id} onChange={() => alElegir(e.id)} />
          <span className="opcion-cuerpo">
            <span className="opcion-producto">{e.nombre}</span>
            <span className="opcion-dato">
              <Codigo>{e.codigo}</Codigo>
              {detalle?.(e) ? ` · ${detalle(e)}` : null}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function NuevaCotizacion({
  servicios,
  proyectoInicial,
  capturaPendiente,
  alDescartarCaptura,
  alCreada,
  puedeGestionar,
}: {
  servicios: ServiciosCotizaciones;
  proyectoInicial: string | null;
  /** Captura de la calculadora que se guardará como borrador inicial (no se pierde). */
  capturaPendiente: CapturaBorrador | null;
  alDescartarCaptura: () => void;
  alCreada: (id: string) => void;
  puedeGestionar: boolean;
}) {
  const intenciones = useIntenciones();
  const [buscar, setBuscar] = useState("");
  const [texto, setTexto] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [proyectoId, setProyectoId] = useState<string | null>(proyectoInicial);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const clientes = useCarga((s) => servicios.listarClientes({ buscar }, s), [buscar]);
  const proyectos = useCarga(
    (s) =>
      clienteId
        ? servicios.listarProyectos({ clienteId }, s)
        : Promise.resolve({ ok: true as const, datos: { proyectos: [] as Proyecto[], limite: 0 } }),
    [clienteId],
  );

  // Proyecto preseleccionado (desde un cliente o un proyecto): se deduce su cliente.
  useEffect(() => {
    if (!proyectoInicial) return;
    const control = new AbortController();
    void servicios.listarProyectos({}, control.signal).then((r) => {
      if (!r.ok) return;
      const p = r.datos.proyectos.find((x) => x.id === proyectoInicial);
      if (p) {
        setClienteId(p.cliente.id);
        setProyectoId(p.id);
      }
    });
    return () => control.abort();
  }, [proyectoInicial, servicios]);

  const crear = async () => {
    if (!proyectoId || enviando) return;
    setEnviando(true);
    setFallo(null);
    const contenido = { proyectoId, captura: capturaPendiente };
    const r = await servicios.crearCotizacion(proyectoId, capturaPendiente, intenciones.clave("crear-cotizacion", contenido));
    setEnviando(false);
    if (r.ok) {
      intenciones.olvidar("crear-cotizacion", contenido);
      alCreada(r.datos.cotizacion.id);
    } else if (r.fallo.tipo !== "cancelado") {
      if (r.fallo.tipo !== "red" && r.fallo.tipo !== "error_servidor" && r.fallo.tipo !== "no_disponible") {
        intenciones.olvidar("crear-cotizacion", contenido);
      }
      setFallo(r.fallo);
    }
  };

  const clienteElegido: Cliente | undefined = clientes.estado.fase === "listo" ? clientes.estado.datos.clientes.find((c) => c.id === clienteId) : undefined;
  const proyectosDelCliente = proyectos.estado.fase === "listo" ? proyectos.estado.datos.proyectos : [];

  return (
    <Pagina
      titulo="Nueva cotización"
      subtitulo="El folio se reserva al crear la cotización y nunca se reutiliza. Solo se ofrecen clientes y proyectos activos."
      acciones={<Enlace a={{ pantalla: "cotizaciones" }}>Volver a cotizaciones</Enlace>}
    >
      {capturaPendiente ? (
        <Aviso tono="info" titulo="Se guardará la captura de la calculadora" rol="status">
          <p>
            La captura que tenía en la calculadora ({capturaPendiente.partidas.length}{" "}
            {capturaPendiente.partidas.length === 1 ? "partida" : "partidas"}) será el borrador inicial de la cotización. No se ha guardado todavía.
          </p>
          <Boton variante="enlace" onClick={alDescartarCaptura}>
            Crear la cotización sin esa captura
          </Boton>
        </Aviso>
      ) : null}

      <section className="seccion" aria-labelledby="titulo-paso-cliente">
        <h2 id="titulo-paso-cliente" className="seccion-titulo">
          <span className="paso-numero" aria-hidden="true">
            1
          </span>
          Cliente
        </h2>
        <form
          className="barra-busqueda"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscar(texto);
          }}
        >
          <label className="etiqueta" htmlFor="buscar-cliente-cotizacion">
            Buscar cliente activo
          </label>
          <div className="entrada-con-accion">
            <input id="buscar-cliente-cotizacion" type="search" value={texto} maxLength={60} onChange={(e) => setTexto(e.target.value)} />
            <Boton type="submit">Buscar</Boton>
          </div>
        </form>
        {clientes.estado.fase === "cargando" ? <Cargando etiqueta="Cargando clientes…" /> : null}
        {clientes.estado.fase === "error" ? <CargaFallida fallo={clientes.estado.fallo} alReintentar={clientes.recargar} /> : null}
        {clientes.estado.fase === "listo" ? (
          clientes.estado.datos.clientes.length === 0 ? (
            <SinResultados>No hay clientes activos{buscar ? ` que coincidan con «${buscar}»` : ""}.</SinResultados>
          ) : (
            <ListaSeleccion
              leyenda="Elija el cliente"
              nombre="cliente-cotizacion"
              elementos={clientes.estado.datos.clientes}
              elegido={clienteId}
              alElegir={(id) => {
                setClienteId(id);
                setProyectoId(null);
              }}
            />
          )
        ) : null}
        {puedeGestionar ? (
          creandoCliente ? (
            <FormularioCliente
              titulo="Nuevo cliente"
              textoBoton="Crear cliente"
              alCancelar={() => setCreandoCliente(false)}
              alGuardar={async (datos) => {
                const r = await servicios.crearCliente(datos, intenciones.clave("crear-cliente", datos));
                if (r.ok) {
                  intenciones.olvidar("crear-cliente", datos);
                  setCreandoCliente(false);
                  setTexto("");
                  setBuscar("");
                  clientes.recargar();
                  setClienteId(r.datos.id);
                  setProyectoId(null);
                }
                return r;
              }}
            />
          ) : (
            <Boton onClick={() => setCreandoCliente(true)}>Nuevo cliente</Boton>
          )
        ) : null}
      </section>

      <section className="seccion" aria-labelledby="titulo-paso-proyecto">
        <h2 id="titulo-paso-proyecto" className="seccion-titulo">
          <span className="paso-numero" aria-hidden="true">
            2
          </span>
          Proyecto {clienteElegido ? <span className="titulo-nota">de {clienteElegido.nombre}</span> : null}
        </h2>
        {!clienteId ? <p className="vacio">Elija primero el cliente.</p> : null}
        {clienteId && proyectos.estado.fase === "cargando" ? <Cargando etiqueta="Cargando proyectos…" /> : null}
        {clienteId && proyectos.estado.fase === "error" ? <CargaFallida fallo={proyectos.estado.fallo} alReintentar={proyectos.recargar} /> : null}
        {clienteId && proyectos.estado.fase === "listo" ? (
          proyectosDelCliente.length === 0 ? (
            <SinResultados>Este cliente no tiene proyectos activos.</SinResultados>
          ) : (
            <ListaSeleccion
              leyenda="Elija el proyecto"
              nombre="proyecto-cotizacion"
              elementos={proyectosDelCliente}
              elegido={proyectoId}
              alElegir={setProyectoId}
              detalle={(p) => [p.municipio, p.entidadFederativa].filter(Boolean).join(", ") || null}
            />
          )
        ) : null}
        {clienteId && puedeGestionar ? (
          creandoProyecto ? (
            <FormularioProyecto
              titulo="Nuevo proyecto"
              textoBoton="Crear proyecto"
              alCancelar={() => setCreandoProyecto(false)}
              alGuardar={async (datos) => {
                const r = await servicios.crearProyecto(clienteId, datos, intenciones.clave(`crear-proyecto:${clienteId}`, datos));
                if (r.ok) {
                  intenciones.olvidar(`crear-proyecto:${clienteId}`, datos);
                  setCreandoProyecto(false);
                  proyectos.recargar();
                  setProyectoId(r.datos.id);
                }
                return r;
              }}
            />
          ) : (
            <Boton onClick={() => setCreandoProyecto(true)}>Nuevo proyecto</Boton>
          )
        ) : null}
      </section>

      <section className="seccion" aria-labelledby="titulo-paso-folio">
        <h2 id="titulo-paso-folio" className="seccion-titulo">
          <span className="paso-numero" aria-hidden="true">
            3
          </span>
          Reservar folio
        </h2>
        {fallo ? (
          <Aviso tono="error" titulo="No se creó la cotización" rol="alert">
            <p>{mensajeDeFallo(fallo)}</p>
          </Aviso>
        ) : null}
        <Boton variante="primario" onClick={() => void crear()} disabled={!proyectoId || enviando} aria-disabled={!proyectoId || enviando}>
          {enviando ? "Creando…" : "Crear cotización"}
        </Boton>
        <p className="ayuda">{proyectoId ? "Se reservará un folio WEB DEMO y se abrirá el borrador." : "Elija un cliente y un proyecto."}</p>
      </section>
    </Pagina>
  );
}

export function VistaVersion({
  servicios,
  id,
  numero,
  puedeVerExcepciones = false,
  puedeVerSalidas = false,
  puedeDuplicar = false,
}: {
  servicios: ServiciosCotizaciones;
  id: string;
  numero: number;
  puedeVerExcepciones?: boolean;
  /** Módulo 15 (B-35): duplicar esta versión (`cotizaciones.preparar`); la API lo exige igualmente. */
  puedeDuplicar?: boolean;
  /** Módulo 14: enlace a las salidas internas (`salidas.consultar`); la API lo exige igualmente. */
  puedeVerSalidas?: boolean;
}) {
  const { estado, recargar } = useCarga((s) => servicios.consultarVersion(id, numero, s), [id, numero]);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando la versión…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const v = estado.datos;
  return (
    <Pagina
      titulo={
        <>
          Versión <span className="codigo">{v.version.idVersion}</span>
        </>
      }
      subtitulo={
        <>
          <Folio folio={v.folio} /> · <EstadoVersion version={v.version} />
        </>
      }
      acciones={
        <>
          {puedeVerSalidas ? (
            <Enlace a={{ pantalla: "salidas", id, numero, vista: "compras" }} className="boton boton-secundario">
              Salidas internas
            </Enlace>
          ) : null}
          <Enlace a={{ pantalla: "cotizacion", id }}>Volver a la cotización</Enlace>
        </>
      }
    >
      <Aviso tono="info" titulo="Registro histórico: se muestra tal como se guardó" rol="status">
        <p>
          Calculada por el servidor el {formatearInstante(v.version.creadoEn)} por {v.version.autor}, con las condiciones vigentes al{" "}
          {formatearFecha(v.version.fechaCalculo)}. Abrirla no la recalcula; los cambios posteriores de catálogo o de nombres no la alteran.
        </p>
      </Aviso>
      <dl className="datos-version">
        <div>
          <dt>Cliente</dt>
          <dd>
            {v.cliente.nombre} <Codigo>{v.cliente.codigo}</Codigo>
          </dd>
        </div>
        <div>
          <dt>Proyecto</dt>
          <dd>
            {v.proyecto.nombre} <Codigo>{v.proyecto.codigo}</Codigo>
            {v.proyecto.ubicacion ? <span className="ayuda bloque">{v.proyecto.ubicacion}</span> : null}
            {v.proyecto.descripcion ? <span className="ayuda bloque">{v.proyecto.descripcion}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Revisión del borrador</dt>
          <dd>{v.version.revisionBorrador}</dd>
        </div>
        <div>
          <dt>Motivo</dt>
          <dd>{v.version.motivo ?? "—"}</dd>
        </div>
        <div>
          <dt>Motor</dt>
          <dd>
            {v.versionMotor} · huella <span className="codigo huella">{v.huellaCalculo.slice(0, 16)}…</span>
          </dd>
        </div>
      </dl>
      <section className="seccion" aria-labelledby="titulo-cambios-version">
        <h2 id="titulo-cambios-version" className="seccion-titulo">
          Cambios relevantes
        </h2>
        <CambiosVersion cambios={v.cambios} />
      </section>
      <section className="panel-resultado" aria-labelledby="titulo-resultado-version">
        <h2 id="titulo-resultado-version" className="seccion-titulo">
          Resultado guardado
        </h2>
        <Resumen
          respuesta={{ estado: "CALCULADO", fechaCalculo: v.version.fechaCalculo, cotizacion: v.cotizacion, avisos: v.avisos }}
          etiqueta={
            <>
              <Insignia tono="estado">Guardado</Insignia> en {v.version.idVersion}
            </>
          }
        />
        <Detalle respuesta={{ estado: "CALCULADO", fechaCalculo: v.version.fechaCalculo, cotizacion: v.cotizacion, avisos: v.avisos }} />
      </section>
      {admiteVistaPrevia(v.version) ? (
        <VistaPreviaPdf cotizaciones={servicios} cotizacionId={id} numero={numero} idVersion={v.version.idVersion} fechaCalculo={v.version.fechaCalculo} />
      ) : null}
      {puedeDuplicar ? <DuplicarVersion servicios={servicios} id={id} numero={numero} idVersion={v.version.idVersion} /> : null}
      <ResumenCaptura captura={v.captura} titulo="Captura de esta versión" />
      {puedeVerExcepciones ? <PanelExcepcionesVersion servicios={servicios} cotizacionId={id} numero={numero} /> : null}
      {v.version.emision ? <><TarjetaEmision emision={v.version.emision} cotizaciones={servicios} /><PanelRespuesta emisionId={v.version.emision.id} servicios={servicios} /></> : null}
    </Pagina>
  );
}

/** Duplicar una versión concreta (B-35): el proyecto destino se propone desde la cotización. */
function DuplicarVersion({ servicios, id, numero, idVersion }: { servicios: ServiciosCotizaciones; id: string; numero: number; idVersion: string }) {
  const { estado } = useCarga((s) => servicios.detalleCotizacion(id, s), [id]);
  if (estado.fase !== "listo") return null;
  const c = estado.datos.cotizacion;
  return (
    <section className="seccion" aria-label="Duplicar esta versión">
      <PanelDuplicar
        cotizaciones={servicios}
        cotizacionId={id}
        origen={{ tipo: "VERSION", numero }}
        descripcionOrigen={`la versión ${idVersion}`}
        proyecto={{ ...c.proyecto, clienteActivo: c.cliente.activo }}
      />
    </section>
  );
}
