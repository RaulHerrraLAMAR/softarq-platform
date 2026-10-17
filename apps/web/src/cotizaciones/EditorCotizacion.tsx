/**
 * Cotización: borrador editable, vista previa, versiones e historial (módulo 6, ADR-0008).
 *
 * Tres cosas distintas, siempre rotuladas:
 * - Captura editable: lo que hay en pantalla. Si difiere de lo guardado, «Cambios sin guardar».
 * - Vista previa: cálculo del servidor de la captura en pantalla; NO se guarda.
 * - Versión: la calcula y guarda el servidor con el borrador guardado (revisión concreta) y las
 *   condiciones vigentes. Lo que se muestra como guardado es la respuesta del servidor.
 *
 * Concurrencia: guardar envía la revisión leída. Si otra pestaña o persona guardó antes, el
 * servidor responde 409 y aquí se conservan los cambios locales: se pueden comparar, descartar
 * (recargar) o guardar sobre la revisión vigente, siempre por decisión explícita.
 * Idempotencia: cada intención (crear versión con una revisión y un motivo) tiene su clave, que se
 * reutiliza al reintentar; un doble clic o una respuesta perdida no duplican versiones.
 *
 * Revisión (módulo 7, ADR-0009): solo se envía la ÚLTIMA versión y solo si corresponde a la
 * captura guardada (sin cambios sin guardar ni pendientes de recalcular). Mientras la revisión está
 * pendiente, la cotización se muestra en solo lectura con «Retirar la revisión»; el servidor
 * también rechaza guardar o calcular (409 REVISION_PENDIENTE).
 *
 * Emisión (módulo 8, ADR-0010): textos de la versión en el borrador; la última versión aprobada se
 * emite desde «Emisión» (Preparador, o Revisor distinto del autor); las emitidas se descargan. Una
 * cotización descartada se muestra en solo lectura.
 */
import { EsquemaCapturaBorrador, type CapturaBorrador, type DetalleCotizacion, type ResumenVersion, type Version } from "@softarq/contracts";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosApi } from "../api/servicios.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Detalle, Resumen, describirRuta } from "../calculo/PanelResultado.tsx";
import { Aviso, Boton, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, EstadoRegistro, Folio, Pagina } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { diferenciasBorrador, huellaBorrador, huellaDeBorrador, serializarBorrador } from "../captura/borrador.ts";
import { ESTADO_INICIAL, reducir, type Accion } from "../captura/estado.ts";
import { idCampo, type ErroresCampo } from "../captura/solicitud.ts";
import { useCaptura } from "../captura/usarCaptura.ts";
import { VistaCaptura } from "../captura/VistaCaptura.tsx";
import { Enlace, useRuta } from "../navegacion/ruta.tsx";
import { ListaEventos, ResumenCaptura, TablaVersiones } from "./componentes.tsx";
import { AvisoDescartada, EditorTextos, PanelDescarte, SeccionEmision, TextosVersion } from "./emision.tsx";
import { SeccionExcepciones } from "../excepciones/SeccionExcepciones.tsx";
import { HistorialRevisiones, NOTA_NO_EMISION } from "./revisiones.tsx";

interface Guardada {
  revision: number;
  /** Huella de la captura guardada, para detectar cambios sin guardar. */
  huella: string;
  actualizadoPor: string;
  actualizadoEn: string;
  completitud: DetalleCotizacion["borrador"]["completitud"];
}

type EstadoGuardado =
  | { fase: "inactivo" }
  | { fase: "guardando" }
  | { fase: "guardado" }
  | { fase: "formato"; campos: number }
  | { fase: "error"; fallo: FalloApi }
  | {
      fase: "conflicto";
      actual: { revision: number; actualizadoPor: string; actualizadoEn: string; captura: CapturaBorrador | null };
      local: CapturaBorrador;
    };

type EstadoVersion =
  | { fase: "inactivo" }
  | { fase: "guardando" }
  | { fase: "guardada"; version: Version }
  | { fase: "bloqueada"; problemas: { codigo: string; referencia: string; mensaje: string }[] }
  | { fase: "incompleta"; campos: { ruta: string; mensaje: string }[] }
  | { fase: "error"; fallo: FalloApi };

/** Los errores del servidor sobre el borrador llegan como «captura.partidas[0]…». */
function erroresDeCampos(campos: { ruta: string; mensaje: string }[]): ErroresCampo {
  const e: ErroresCampo = {};
  for (const c of campos) e[c.ruta.replace(/^captura\./, "")] ??= c.mensaje;
  return e;
}

const FALLOS_REINTENTABLES = new Set<FalloApi["tipo"]>(["red", "error_servidor", "no_disponible", "limite", "csrf", "cancelado"]);

export function EncabezadoCotizacion({ detalle }: { detalle: DetalleCotizacion }) {
  const c = detalle.cotizacion;
  return (
    <dl className="datos-cotizacion">
      <div>
        <dt>Folio</dt>
        <dd>
          <Folio folio={c.folio} />
        </dd>
      </div>
      <div>
        <dt>Cliente</dt>
        <dd>
          <Enlace a={{ pantalla: "cliente", id: c.cliente.id }}>{c.cliente.nombre}</Enlace> <Codigo>{c.cliente.codigo}</Codigo>
          {c.cliente.activo ? null : (
            <>
              {" "}
              <EstadoRegistro activo={false} />
            </>
          )}
        </dd>
      </div>
      <div>
        <dt>Proyecto</dt>
        <dd>
          {c.proyecto.nombre} <Codigo>{c.proyecto.codigo}</Codigo>
          {c.proyecto.activo ? null : (
            <>
              {" "}
              <EstadoRegistro activo={false} />
            </>
          )}
        </dd>
      </div>
      <div>
        <dt>Estado del folio</dt>
        <dd>{c.estadoFolio === "ACTIVO" ? <Insignia tono="estado">Activo</Insignia> : <Insignia tono="neutra">Descartado</Insignia>}</dd>
      </div>
      <div>
        <dt>Creada</dt>
        <dd>
          {formatearInstante(c.creadoEn)} · {c.creadoPor}
        </dd>
      </div>
    </dl>
  );
}

export function PantallaCotizacion({
  id,
  servicios,
  cotizaciones,
  puedePreparar,
  puedeEnviarRevision,
  puedeEmitir,
  motivoSinCalculo,
}: {
  id: string;
  servicios: ServiciosApi;
  cotizaciones: ServiciosCotizaciones;
  puedePreparar: boolean;
  puedeEnviarRevision: boolean;
  puedeEmitir: boolean;
  motivoSinCalculo: string | null;
}) {
  const { estado, recargar } = useCarga((s) => cotizaciones.detalleCotizacion(id, s), [id]);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando la cotización…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const enRevision = estado.datos.versiones.find((v) => v.estado === "EN_REVISION") ?? null;
  const descartada = estado.datos.cotizacion.estadoFolio !== "ACTIVO";
  if (!puedePreparar || enRevision || descartada) {
    return (
      <ConsultaCotizacion
        detalle={estado.datos}
        cotizaciones={cotizaciones}
        puedeEmitir={puedeEmitir}
        puedePreparar={puedePreparar}
        alCambiar={recargar}
        subtitulo={
          descartada
            ? "Descartada: la cotización solo se consulta."
            : puedePreparar
              ? "En revisión: la captura no se puede editar ni calcular mientras la revisión esté pendiente."
              : "Consulta: su función permite ver la cotización y sus versiones, no editarla ni calcularla. Las decisiones de revisión se toman en «Revisiones»."
        }
        aviso={
          descartada ? (
            <AvisoDescartada detalle={estado.datos} />
          ) : enRevision ? (
            <AvisoEnRevision
              key={enRevision.revisionVigente?.id}
              version={enRevision}
              cotizaciones={cotizaciones}
              puedeRetirar={puedeEnviarRevision}
              alCambiar={recargar}
            />
          ) : null
        }
      />
    );
  }
  return (
    <EditorBorrador
      key={id}
      inicial={estado.datos}
      servicios={servicios}
      cotizaciones={cotizaciones}
      motivoSinCalculo={motivoSinCalculo}
      puedeEnviarRevision={puedeEnviarRevision}
      puedeEmitir={puedeEmitir}
      alCambiarRevision={recargar}
    />
  );
}

/** Versión en revisión: quién la envió, enlace a la revisión y, para el Preparador, retirarla. */
function AvisoEnRevision({
  version,
  cotizaciones,
  puedeRetirar,
  alCambiar,
}: {
  version: ResumenVersion;
  cotizaciones: ServiciosCotizaciones;
  puedeRetirar: boolean;
  alCambiar: () => void;
}) {
  const r = version.revisionVigente!;
  const intenciones = useIntenciones();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState<{ fase: "inactivo" } | { fase: "enviando" } | { fase: "error"; fallo: FalloApi }>({ fase: "inactivo" });
  const retirar = async () => {
    if (estado.fase === "enviando") return;
    const contenido = { revision: r.revision, motivo: motivo.trim() };
    setEstado({ fase: "enviando" });
    const res = await cotizaciones.retirarRevision(r.id, r.revision, contenido.motivo || null, intenciones.clave(`retiro:${r.id}`, contenido));
    if (res.ok) {
      intenciones.olvidar(`retiro:${r.id}`, contenido);
      alCambiar();
      return;
    }
    if (!FALLOS_REINTENTABLES.has(res.fallo.tipo)) intenciones.olvidar(`retiro:${r.id}`, contenido);
    setEstado({ fase: "error", fallo: res.fallo });
  };
  return (
    <Aviso tono="info" titulo={`${version.idVersion} está en revisión`} rol="status">
      <p>
        Enviada el {formatearInstante(r.enviadoEn)} por {r.enviadoPor}. Total {formatearImporte(version.total, "MXN")}.{" "}
        <Enlace a={{ pantalla: "revision", id: r.id }}>Abrir la revisión</Enlace>
      </p>
      {puedeRetirar ? (
        confirmando ? (
          <div className="confirmacion-bloque" role="group" aria-label="Confirmar retirada">
            <p>Para corregir, retire la revisión. La cotización volverá a ser editable y deberá enviarse de nuevo.</p>
            <div className="campo">
              <label className="etiqueta" htmlFor="motivo-retiro">
                Motivo <span className="ayuda">(opcional)</span>
              </label>
              <input id="motivo-retiro" type="text" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <div className="formulario-acciones">
              <Boton variante="peligro" onClick={() => void retirar()} disabled={estado.fase === "enviando"}>
                {estado.fase === "enviando" ? "Retirando…" : "Confirmar retirada"}
              </Boton>
              <Boton onClick={() => setConfirmando(false)} disabled={estado.fase === "enviando"}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <Boton variante="peligro" onClick={() => setConfirmando(true)}>
            Retirar la revisión para corregir…
          </Boton>
        )
      ) : null}
      {estado.fase === "error" ? (
        <div role="alert">
          <p>{mensajeDeFallo(estado.fallo)}</p>
          <Boton onClick={alCambiar}>Actualizar</Boton>
        </div>
      ) : null}
    </Aviso>
  );
}

/** Solo lectura (Revisor, otras funciones, en revisión o descartada): sin controles de edición ni cálculo. */
function ConsultaCotizacion({
  detalle,
  subtitulo,
  aviso,
  cotizaciones,
  puedeEmitir,
  puedePreparar,
  alCambiar,
}: {
  detalle: DetalleCotizacion;
  subtitulo: string;
  aviso: ReactNode;
  cotizaciones: ServiciosCotizaciones;
  puedeEmitir: boolean;
  puedePreparar: boolean;
  alCambiar: () => void;
}) {
  const b = detalle.borrador;
  return (
    <Pagina
      titulo={
        <>
          Cotización <span className="codigo">{detalle.cotizacion.folio}</span>
        </>
      }
      subtitulo={subtitulo}
      acciones={<Enlace a={{ pantalla: "cotizaciones" }}>Volver a cotizaciones</Enlace>}
    >
      <EncabezadoCotizacion detalle={detalle} />
      {aviso}
      <Aviso tono="info" titulo="Borrador actual" rol="status">
        <p>
          Revisión {b.revision}, guardada {formatearInstante(b.actualizadoEn)} por {b.actualizadoPor}.{" "}
          {b.completitud.lista ? "Captura completa para calcular." : `Faltan ${b.completitud.pendientes.length} datos para calcular.`}
        </p>
      </Aviso>
      <section className="seccion" aria-labelledby="titulo-versiones-consulta">
        <h2 id="titulo-versiones-consulta" className="seccion-titulo">
          Versiones guardadas
        </h2>
        <TablaVersiones cotizacionId={detalle.cotizacion.id} versiones={detalle.versiones} />
      </section>
      <SeccionEmision detalle={detalle} cotizaciones={cotizaciones} puedeEmitir={puedeEmitir} alCambiar={alCambiar} />
      {puedePreparar ? <PanelDescarte detalle={detalle} cotizaciones={cotizaciones} alDescartada={alCambiar} /> : null}
      <ResumenCaptura captura={b.captura} titulo="Captura del borrador" />
      <TextosVersion textos={b.captura.textos ?? null} titulo="Textos del borrador" />
      <section className="seccion" aria-labelledby="titulo-revisiones-consulta">
        <h2 id="titulo-revisiones-consulta" className="seccion-titulo">
          Revisiones
        </h2>
        <HistorialRevisiones revisiones={detalle.revisiones} />
      </section>
      <section className="seccion" aria-labelledby="titulo-eventos-consulta">
        <h2 id="titulo-eventos-consulta" className="seccion-titulo">
          Historial de eventos
        </h2>
        <ListaEventos eventos={detalle.eventos} />
      </section>
    </Pagina>
  );
}

function EditorBorrador({
  inicial,
  servicios,
  cotizaciones,
  motivoSinCalculo,
  puedeEnviarRevision,
  puedeEmitir,
  alCambiarRevision,
}: {
  inicial: DetalleCotizacion;
  servicios: ServiciosApi;
  cotizaciones: ServiciosCotizaciones;
  motivoSinCalculo: string | null;
  puedeEnviarRevision: boolean;
  puedeEmitir: boolean;
  /** Tras enviar (o un 409 de revisión): se vuelve a cargar la cotización desde el servidor. */
  alCambiarRevision: () => void;
}) {
  const id = inicial.cotizacion.id;
  const folio = inicial.cotizacion.folio;
  const { registrarGuarda } = useRuta();
  const editor = useCaptura(servicios);
  const { despachar, reiniciarResultado, setErroresExternos } = editor;
  const intenciones = useIntenciones();
  const [detalle, setDetalle] = useState(inicial);
  const [guardada, setGuardada] = useState<Guardada | null>(null);
  const [hidratacion, setHidratacion] = useState<{ fase: "cargando" } | { fase: "lista" } | { fase: "error"; fallo: FalloApi }>({
    fase: "cargando",
  });
  const [guardado, setGuardado] = useState<EstadoGuardado>({ fase: "inactivo" });
  const [version, setVersion] = useState<EstadoVersion>({ fase: "inactivo" });
  const [motivo, setMotivo] = useState("");
  const [verDiferencias, setVerDiferencias] = useState(false);
  const [confirmarRecarga, setConfirmarRecarga] = useState(false);

  /** Carga en pantalla un borrador del servidor (sin perder partidas: ver `desdeBorrador`). */
  const hidratar = useCallback(
    async (b: DetalleCotizacion["borrador"]) => {
      setHidratacion({ fase: "cargando" });
      const codigos = [...new Set(b.captura.partidas.flatMap((p) => (p.tipo === "CONCEPTO" ? [p.conceptoCodigo] : [])))];
      const respuestas = await Promise.all(codigos.map((c) => servicios.buscarConceptos(c)));
      const fallo = respuestas.find((r) => !r.ok);
      if (fallo && !fallo.ok) {
        if (fallo.fallo.tipo !== "cancelado") setHidratacion({ fase: "error", fallo: fallo.fallo });
        return;
      }
      const conceptos = respuestas.flatMap((r) => (r.ok ? r.datos.conceptos : [])).filter((c) => codigos.includes(c.codigo));
      const accion: Accion = { tipo: "CARGAR_BORRADOR", folio, borrador: b.captura, conceptos, referencias: b.referencias };
      // La huella se toma de la captura ya cargada: recién abierta no tiene cambios sin guardar.
      const cargada = reducir(ESTADO_INICIAL, accion).captura;
      reiniciarResultado();
      despachar(accion);
      setGuardada({
        revision: b.revision,
        huella: cargada ? huellaBorrador(cargada) : huellaDeBorrador(b.captura),
        actualizadoPor: b.actualizadoPor,
        actualizadoEn: b.actualizadoEn,
        completitud: b.completitud,
      });
      setHidratacion({ fase: "lista" });
    },
    [servicios, folio, despachar, reiniciarResultado],
  );

  useEffect(() => {
    void hidratar(inicial.borrador);
    // Solo al abrir: después, lo guardado se actualiza con las respuestas del servidor.
  }, []);

  const captura = editor.captura;
  const sucio = hidratacion.fase === "lista" && captura !== null && guardada !== null && huellaBorrador(captura) !== guardada.huella;

  // Guarda de navegación y aviso al cerrar o recargar la pestaña con cambios sin guardar.
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  useEffect(() => {
    registrarGuarda(() => sucioRef.current);
    return () => registrarGuarda(null);
  }, [registrarGuarda]);
  useEffect(() => {
    if (!sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sucio]);

  /** Versiones, eventos y datos de la cotización (no toca la captura en pantalla). */
  // Varias consultas del detalle pueden estar en curso (tras guardar y tras crear la versión): solo
  // la última solicitada se aplica; una respuesta atrasada nunca reemplaza datos más recientes.
  const consultaDetalle = useRef(0);
  const leerDetalle = useCallback(async () => {
    const n = ++consultaDetalle.current;
    const r = await cotizaciones.detalleCotizacion(id);
    return n === consultaDetalle.current ? r : null;
  }, [cotizaciones, id]);
  const refrescar = useCallback(async () => {
    const r = await leerDetalle();
    if (r?.ok) setDetalle(r.datos);
  }, [leerDetalle]);

  const guardar = async (revisionForzada?: number): Promise<number | null> => {
    if (!captura || !guardada) return null;
    const s = serializarBorrador(captura);
    if (!s.ok) {
      setErroresExternos(s.errores);
      setGuardado({ fase: "formato", campos: Object.keys(s.errores).length });
      return null;
    }
    setGuardado({ fase: "guardando" });
    const r = await cotizaciones.guardarBorrador(id, revisionForzada ?? guardada.revision, s.borrador);
    if (r.ok) {
      setGuardada({
        revision: r.datos.revision,
        huella: huellaDeBorrador(s.borrador),
        actualizadoPor: r.datos.actualizadoPor,
        actualizadoEn: r.datos.actualizadoEn,
        completitud: r.datos.completitud,
      });
      setGuardado({ fase: "guardado" });
      setVerDiferencias(false);
      void refrescar();
      return r.datos.revision;
    }
    const f = r.fallo;
    if (f.tipo === "conflicto" && f.actual) {
      const delServidor = EsquemaCapturaBorrador.safeParse(f.actual.captura);
      const capturaServidor = delServidor.success ? delServidor.data : null;
      // Reintento de un guardado cuya respuesta se perdió: el servidor ya tiene exactamente esto.
      if (capturaServidor && huellaDeBorrador(capturaServidor) === huellaDeBorrador(s.borrador)) {
        setGuardada({
          revision: f.actual.revision,
          huella: huellaDeBorrador(s.borrador),
          actualizadoPor: f.actual.actualizadoPor,
          actualizadoEn: f.actual.actualizadoEn,
          completitud: guardada.completitud,
        });
        setGuardado({ fase: "guardado" });
        void refrescar();
        return f.actual.revision;
      }
      setGuardado({
        fase: "conflicto",
        actual: { revision: f.actual.revision, actualizadoPor: f.actual.actualizadoPor, actualizadoEn: f.actual.actualizadoEn, captura: capturaServidor },
        local: s.borrador,
      });
      return null;
    }
    if (f.tipo === "invalida" || f.tipo === "referencia") setErroresExternos(erroresDeCampos(f.campos));
    setGuardado({ fase: "error", fallo: f });
    return null;
  };

  const recargarDelServidor = async () => {
    setConfirmarRecarga(false);
    const r = await leerDetalle();
    if (!r) return;
    if (!r.ok) {
      setGuardado({ fase: "error", fallo: r.fallo });
      return;
    }
    setDetalle(r.datos);
    setGuardado({ fase: "inactivo" });
    setVersion({ fase: "inactivo" });
    setVerDiferencias(false);
    await hidratar(r.datos.borrador);
  };

  const guardarVersion = async () => {
    if (version.fase === "guardando" || guardado.fase === "guardando" || !guardada) return;
    let revision = guardada.revision;
    if (sucio) {
      const n = await guardar();
      if (n === null) return;
      revision = n;
    }
    const contenido = { revision, motivo: motivo.trim() };
    const clave = intenciones.clave(`version:${id}`, contenido);
    setVersion({ fase: "guardando" });
    const r = await cotizaciones.crearVersion(id, revision, contenido.motivo || null, clave);
    if (r.ok) {
      intenciones.olvidar(`version:${id}`, contenido);
      setVersion({ fase: "guardada", version: r.datos });
      setMotivo("");
      void refrescar();
      return;
    }
    const f = r.fallo;
    if (!FALLOS_REINTENTABLES.has(f.tipo)) intenciones.olvidar(`version:${id}`, contenido);
    if (f.tipo === "bloqueado") {
      setVersion({ fase: "bloqueada", problemas: f.problemas });
      void refrescar();
    } else if (f.tipo === "incompleta") {
      setVersion({ fase: "incompleta", campos: f.campos });
      setErroresExternos(erroresDeCampos(f.campos));
    } else if (f.tipo === "conflicto") {
      setVersion({ fase: "error", fallo: f });
      void recargarMeta();
    } else {
      setVersion({ fase: "error", fallo: f });
    }
  };

  /** Tras un 409 al versionar: actualiza lo guardado; si el servidor tiene otra captura, conflicto. */
  const recargarMeta = async () => {
    const r = await leerDetalle();
    if (!r || !r.ok || !captura || !guardada) return;
    setDetalle(r.datos);
    const local = serializarBorrador(captura);
    const b = r.datos.borrador;
    if (local.ok && huellaDeBorrador(local.borrador) === huellaDeBorrador(b.captura)) {
      setGuardada({ ...guardada, revision: b.revision, actualizadoPor: b.actualizadoPor, actualizadoEn: b.actualizadoEn, completitud: b.completitud });
    } else if (local.ok) {
      setGuardado({
        fase: "conflicto",
        actual: { revision: b.revision, actualizadoPor: b.actualizadoPor, actualizadoEn: b.actualizadoEn, captura: b.captura },
        local: local.borrador,
      });
    }
  };

  if (hidratacion.fase === "error") {
    return <CargaFallida titulo="No se pudo abrir el borrador" fallo={hidratacion.fallo} alReintentar={() => void hidratar(detalle.borrador)} />;
  }
  if (hidratacion.fase === "cargando" || !captura || !guardada) return <Cargando etiqueta="Abriendo el borrador…" />;

  const ultima = detalle.versiones[0] ?? null;
  const vistaPrevia = editor.calculo.estado;
  const previaVigente = vistaPrevia.fase === "calculado" && vistaPrevia.huella === editor.huella ? vistaPrevia.respuesta : null;
  const ocupado = guardado.fase === "guardando" || version.fase === "guardando";

  const estadoBorrador =
    guardado.fase === "guardando"
      ? "Guardando el borrador…"
      : guardado.fase === "conflicto"
        ? "Conflicto: sus cambios no se guardaron."
        : sucio
          ? "Cambios sin guardar."
          : `Guardado · revisión ${guardada.revision} · ${formatearInstante(guardada.actualizadoEn)} · ${guardada.actualizadoPor}`;

  const relacionVersion = sucio
    ? "La vista previa y las versiones no incluyen los cambios sin guardar hasta guardarlos."
    : !ultima
      ? "Aún no hay versiones de esta cotización."
      : ultima.revisionBorrador !== guardada.revision
        ? `Pendiente de recalcular: la captura guardada (revisión ${guardada.revision}) cambió después de la v${ultima.numero}.`
        : `La v${ultima.numero} corresponde a la captura guardada (revisión ${guardada.revision}). Recalcular crea una versión nueva con las condiciones vigentes.`;

  const avisos = (
    <>
      <EncabezadoCotizacion detalle={detalle} />
      <div className={`estado-borrador${sucio || guardado.fase === "conflicto" ? " estado-borrador-pendiente" : ""}`} aria-live="polite">
        <p className="estado-borrador-linea">
          <strong>{estadoBorrador}</strong>
        </p>
        <p className="ayuda">
          {guardada.completitud.lista
            ? "Lo guardado está completo para calcular."
            : `A lo guardado le faltan ${guardada.completitud.pendientes.length} datos para calcular (se puede guardar incompleto).`}{" "}
          {relacionVersion}
        </p>
      </div>
      {ultima && !sucio && ultima.revisionBorrador === guardada.revision ? (
        <AvisoCatalogoCambiado cotizaciones={cotizaciones} id={id} numero={ultima.numero} clave={ultima.id} />
      ) : null}
      {guardado.fase === "formato" ? (
        <Aviso tono="error" titulo="No se guardó: hay valores con formato inválido" rol="alert">
          <p>Corrija los {guardado.campos} campos marcados (punto decimal, sin comas ni espacios). Sus cambios siguen en pantalla.</p>
        </Aviso>
      ) : null}
      {guardado.fase === "error" ? (
        <Aviso tono="error" titulo="No se guardó el borrador" rol="alert">
          <p>{mensajeDeFallo(guardado.fallo)} Sus cambios siguen en pantalla.</p>
          {guardado.fallo.tipo === "revision" ? (
            <>
              <p className="ayuda">Al actualizar, la cotización se muestra en solo lectura y los cambios sin guardar se descartan de la pantalla.</p>
              <Boton onClick={alCambiarRevision}>Actualizar</Boton>
            </>
          ) : (
            <Boton onClick={() => void guardar()}>Reintentar</Boton>
          )}
        </Aviso>
      ) : null}
      {guardado.fase === "conflicto" ? (
        <Aviso tono="error" titulo="Otra pestaña o persona guardó este borrador antes" rol="alert">
          <p>
            {guardado.actual.actualizadoPor} guardó la revisión {guardado.actual.revision} el {formatearInstante(guardado.actual.actualizadoEn)}. Sus
            cambios siguen en pantalla y <strong>no se han guardado</strong>. Nada se sobrescribió.
          </p>
          <div className="formulario-acciones">
            <Boton onClick={() => setVerDiferencias((v) => !v)} aria-expanded={verDiferencias}>
              {verDiferencias ? "Ocultar diferencias" : "Comparar"}
            </Boton>
            {confirmarRecarga ? (
              <span className="confirmacion" role="group" aria-label="Confirmar recarga">
                <span>Se descartarán sus cambios.</span>
                <Boton variante="peligro" onClick={() => void recargarDelServidor()}>
                  Descartar y recargar
                </Boton>
                <Boton onClick={() => setConfirmarRecarga(false)}>Cancelar</Boton>
              </span>
            ) : (
              <Boton onClick={() => setConfirmarRecarga(true)}>Recargar la versión guardada</Boton>
            )}
            <Boton variante="primario" onClick={() => void guardar(guardado.actual.revision)}>
              Guardar mis cambios sobre la revisión {guardado.actual.revision}
            </Boton>
          </div>
          {verDiferencias ? (
            guardado.actual.captura ? (
              <ul className="lista-problemas" aria-label="Diferencias entre sus cambios y lo guardado">
                {(() => {
                  const d = diferenciasBorrador(guardado.local, guardado.actual.captura);
                  return d.length > 0 ? d.map((x) => <li key={x}>{x}</li>) : <li>Sin diferencias de contenido.</li>;
                })()}
              </ul>
            ) : (
              <p>No se pudo leer la captura guardada; recárguela para verla.</p>
            )
          ) : null}
        </Aviso>
      ) : null}
    </>
  );

  const panelGuardar = (
    <section className="panel-guardar" aria-labelledby="titulo-guardar-version">
      <h2 id="titulo-guardar-version" className="seccion-titulo">
        Versión guardada
      </h2>
      <p className="ayuda">
        El servidor calcula con el borrador guardado y las condiciones vigentes, y guarda una versión que ya no cambia. Si hay cambios sin guardar,
        primero se guarda el borrador.
      </p>
      <div className="campo">
        <label className="etiqueta" htmlFor="motivo-version">
          Motivo de la versión <span className="ayuda">(opcional)</span>
        </label>
        <input id="motivo-version" type="text" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <Boton
        variante="primario"
        className="boton-calcular"
        onClick={() => void guardarVersion()}
        disabled={ocupado || motivoSinCalculo !== null}
        aria-disabled={ocupado || motivoSinCalculo !== null}
      >
        {version.fase === "guardando" ? "Calculando y guardando…" : "Calcular y guardar versión"}
      </Boton>
      <div aria-live="polite" aria-busy={version.fase === "guardando"}>
        {version.fase === "guardada" ? (
          <ResultadoGuardado version={version.version} cotizacionId={id} previa={previaVigente?.cotizacion.total ?? null} />
        ) : null}
        {version.fase === "bloqueada" ? (
          <Aviso tono="error" titulo="Cálculo bloqueado: no se guardó ninguna versión" rol="alert">
            <ul className="lista-problemas">
              {version.problemas.map((p, i) => (
                <li key={`${p.codigo}-${i}`}>
                  <Codigo>{p.codigo}</Codigo> {p.mensaje}
                </li>
              ))}
            </ul>
            <p className="ayuda">La captura guardada se conserva. Las versiones anteriores no cambiaron.</p>
          </Aviso>
        ) : null}
        {version.fase === "incompleta" ? (
          <Aviso tono="error" titulo="Captura incompleta: no se guardó ninguna versión" rol="alert">
            <ul className="lista-problemas">
              {version.campos.slice(0, 12).map((c) => (
                <li key={c.ruta}>
                  <a href={`#${idCampo(c.ruta.replace(/^captura\./, ""))}`}>{describirRuta(c.ruta)}</a>: {c.mensaje}
                </li>
              ))}
            </ul>
          </Aviso>
        ) : null}
        {version.fase === "error" ? (
          <Aviso tono="error" titulo="No se guardó la versión" rol="alert">
            <p>{mensajeDeFallo(version.fallo)}</p>
            {FALLOS_REINTENTABLES.has(version.fallo.tipo) ? (
              <Boton onClick={() => void guardarVersion()}>Reintentar (sin duplicar)</Boton>
            ) : null}
            {version.fallo.tipo === "revision" ? <Boton onClick={alCambiarRevision}>Actualizar</Boton> : null}
          </Aviso>
        ) : null}
      </div>
      {ultima ? (
        <PanelEnvioRevision
          cotizacionId={id}
          ultima={ultima}
          sucio={sucio}
          revisionGuardada={guardada.revision}
          ocupado={ocupado}
          puedeEnviar={puedeEnviarRevision}
          faltanTextos={!captura.textos || Object.values(captura.textos).some((t) => t.trim() === "")}
          cotizaciones={cotizaciones}
          alEnviada={alCambiarRevision}
        />
      ) : null}
      {detalle.versiones.some((v) => v.estado === "APROBADA" || v.emision) ? (
        <p className="ayuda">
          <a href="#titulo-emision">Ir a la emisión</a>
        </p>
      ) : null}
      <h3 className="subtitulo">Versiones</h3>
      <TablaVersiones cotizacionId={id} versiones={detalle.versiones} />
      <details className="detalle">
        <summary>Revisiones ({detalle.revisiones.length})</summary>
        <HistorialRevisiones revisiones={detalle.revisiones} />
      </details>
      <details className="detalle">
        <summary>Historial de eventos ({detalle.eventos.length})</summary>
        <ListaEventos eventos={detalle.eventos} />
      </details>
    </section>
  );

  const despuesDeLaCaptura = (
    <>
      <SeccionExcepciones
        captura={captura}
        despachar={despachar}
        servicios={cotizaciones}
        deshabilitado={ocupado}
        erroresServidor={guardado.fase === "error" && guardado.fallo.tipo === "excepcion" ? (guardado.fallo.campos ?? []) : []}
      />
      <EditorTextos
        textos={captura.textos}
        predeterminados={detalle.borrador.textosPredeterminados}
        alCambiar={(campo, valor) => despachar({ tipo: "EDITAR_TEXTO", campo, valor })}
        alRestablecer={(textos) => despachar({ tipo: "FIJAR_TEXTOS", textos })}
        deshabilitado={ocupado}
      />
      <SeccionEmision detalle={detalle} cotizaciones={cotizaciones} puedeEmitir={puedeEmitir} alCambiar={() => void refrescar()} />
      <PanelDescarte detalle={detalle} cotizaciones={cotizaciones} alDescartada={alCambiarRevision} />
    </>
  );

  return (
    <VistaCaptura
      editor={editor}
      servicios={servicios}
      titulo={
        <>
          Cotización <span className="codigo">{folio}</span>
        </>
      }
      ayuda="Borrador editable. Guarde para conservarlo; la vista previa no se guarda."
      acciones={
        <>
          <Boton variante="primario" onClick={() => void guardar()} disabled={!sucio || ocupado} aria-disabled={!sucio || ocupado}>
            {guardado.fase === "guardando" ? "Guardando…" : "Guardar borrador"}
          </Boton>
          <Enlace a={{ pantalla: "cotizaciones" }}>Volver a cotizaciones</Enlace>
        </>
      }
      avisos={avisos}
      antesDelResultado={panelGuardar}
      despuesDeLaCaptura={despuesDeLaCaptura}
      textoCalcular="Vista previa"
      ayudaCalcular="Vista previa del servidor con la captura en pantalla. No se guarda ni crea versión."
      motivoSinCalculo={motivoSinCalculo}
    />
  );
}

/** Bloqueos que indican que el catálogo cambió después de calcular la versión (módulo 11). */
const CODIGOS_CATALOGO = new Set(["BL-04", "BL-05", "BL-06", "BL-07", "BL-08", "BL-09", "BL-10", "BL-16"]);

/**
 * Si un cambio de catálogo (precio cerrado o anulado, proveedor o producto desactivado, mano de
 * obra reasignada o desactivada…) invalidó la última versión, lo dice: lo calculado ya no se
 * presenta como vigente. Consulta la verificación del servidor; no recalcula ni cambia la versión.
 */
function AvisoCatalogoCambiado({ cotizaciones, id, numero, clave }: { cotizaciones: ServiciosCotizaciones; id: string; numero: number; clave: string }) {
  const { estado } = useCarga((s) => cotizaciones.verificarVersion(id, numero, s), [id, numero, clave]);
  if (estado.fase !== "listo") return null;
  const problemas = estado.datos.bloqueos.filter((b) => CODIGOS_CATALOGO.has(b.codigo));
  if (problemas.length === 0) return null;
  return (
    <Aviso tono="aviso" titulo={`El catálogo cambió después de calcular la v${numero}: su resultado ya no es vigente`} rol="status">
      <p>
        Lo calculado en la v{numero} no corresponde a las condiciones vigentes y no se puede enviar, aprobar ni emitir así. Recalcule para crear una
        versión nueva; si alguna selección ya no está disponible, elíjala de nuevo. La v{numero} se conserva sin cambios.
      </p>
      <ul className="lista-problemas">
        {problemas.map((p, i) => (
          <li key={`${p.codigo}-${i}`}>
            <Codigo>{p.codigo}</Codigo> {p.mensaje}
          </li>
        ))}
      </ul>
    </Aviso>
  );
}

function ResultadoGuardado({ version, cotizacionId, previa }: { version: Version; cotizacionId: string; previa: string | null }) {
  const v = version.version;
  return (
    <div className="resultado-guardado">
      <Aviso tono="correcto" titulo={`Versión ${v.idVersion} guardada`} rol="status">
        <p>
          Calculada por el servidor el {formatearInstante(v.creadoEn)} con la revisión {v.revisionBorrador} del borrador. Este es el resultado
          almacenado.
        </p>
      </Aviso>
      {previa !== null && previa !== version.cotizacion.total ? (
        <Aviso tono="aviso" titulo="El resultado guardado difiere de la vista previa">
          <p>
            Vista previa {formatearImporte(previa, "MXN")}; guardado {formatearImporte(version.cotizacion.total, "MXN")}. El servidor usó las condiciones
            vigentes al guardar.
          </p>
        </Aviso>
      ) : null}
      <Resumen
        respuesta={{ estado: "CALCULADO", fechaCalculo: v.fechaCalculo, cotizacion: version.cotizacion, avisos: version.avisos }}
        etiqueta={
          <>
            <Insignia tono="estado">Guardado</Insignia> en {v.idVersion}
          </>
        }
      />
      <Detalle respuesta={{ estado: "CALCULADO", fechaCalculo: v.fechaCalculo, cotizacion: version.cotizacion, avisos: version.avisos }} />
      <Enlace a={{ pantalla: "version", id: cotizacionId, numero: v.numero }}>Abrir la versión {v.idVersion}</Enlace>
    </div>
  );
}

/**
 * Estado de revisión de la ÚLTIMA versión y envío explícito (B-26). El envío se deshabilita, con su
 * motivo, si hay cambios sin guardar o un borrador guardado que esa versión no incluye: nunca se
 * envía una versión anterior como si representara cambios pendientes. El servidor lo comprueba de
 * nuevo (revisión del borrador vista) y verifica las condiciones vigentes sin modificar la versión.
 */
function PanelEnvioRevision({
  cotizacionId,
  ultima,
  sucio,
  revisionGuardada,
  ocupado,
  puedeEnviar,
  faltanTextos,
  cotizaciones,
  alEnviada,
}: {
  cotizacionId: string;
  ultima: ResumenVersion;
  sucio: boolean;
  revisionGuardada: number;
  ocupado: boolean;
  puedeEnviar: boolean;
  /** Los textos de la versión (BL-20) faltan o están vacíos en la captura guardada. */
  faltanTextos: boolean;
  cotizaciones: ServiciosCotizaciones;
  alEnviada: () => void;
}) {
  const intenciones = useIntenciones();
  const [confirmando, setConfirmando] = useState(false);
  const [envio, setEnvio] = useState<
    { fase: "inactivo" } | { fase: "enviando" } | { fase: "bloqueado"; problemas: { codigo: string; mensaje: string }[] } | { fase: "error"; fallo: FalloApi }
  >({ fase: "inactivo" });
  const r = ultima.revisionVigente;
  const motivoNoEnviar = sucio
    ? "Hay cambios sin guardar: guárdelos y calcule una versión nueva antes de enviar."
    : ultima.revisionBorrador !== revisionGuardada
      ? `El borrador guardado (revisión ${revisionGuardada}) cambió después de ${ultima.idVersion}: calcule una versión nueva antes de enviar.`
      : faltanTextos
        ? `${ultima.idVersion} no tiene alcance, condiciones y exclusiones completos (BL-20): complételos, guarde y calcule una versión nueva.`
        : null;

  const enviar = async () => {
    if (envio.fase === "enviando" || motivoNoEnviar) return;
    const contenido = { numero: ultima.numero, revisionBorrador: ultima.revisionBorrador };
    setEnvio({ fase: "enviando" });
    const res = await cotizaciones.enviarRevision(cotizacionId, ultima.numero, ultima.revisionBorrador, intenciones.clave(`envio:${cotizacionId}`, contenido));
    if (res.ok) {
      intenciones.olvidar(`envio:${cotizacionId}`, contenido);
      setConfirmando(false);
      alEnviada();
      return;
    }
    const f = res.fallo;
    if (!FALLOS_REINTENTABLES.has(f.tipo)) intenciones.olvidar(`envio:${cotizacionId}`, contenido);
    setEnvio(f.tipo === "bloqueado" ? { fase: "bloqueado", problemas: f.problemas } : { fase: "error", fallo: f });
  };

  return (
    <section className="panel-revision" aria-labelledby="titulo-revision-version">
      <h3 id="titulo-revision-version" className="subtitulo">
        Revisión de {ultima.idVersion}
      </h3>
      {ultima.estado === "APROBADA" && r ? (
        <Aviso tono="correcto" titulo={`${ultima.idVersion} aprobada por ${r.resueltaPor ?? "—"}`}>
          <p>
            {formatearInstante(r.resueltaEn ?? r.enviadoEn)}. {NOTA_NO_EMISION} Si cambia la captura, la versión nueva necesitará su propia revisión; esta
            aprobación no se le aplica.
          </p>
        </Aviso>
      ) : null}
      {(ultima.estado === "EMITIDA" || ultima.estado === "SUSTITUIDA") && ultima.emision ? (
        <Aviso tono="correcto" titulo={`${ultima.idVersion} emitida por ${ultima.emision.emitidoPor}`}>
          <p>
            {formatearInstante(ultima.emision.emitidoEn)}. Su documento está en «Emisión». Si cambia la captura, la versión nueva necesitará su propia revisión
            y emisión.
          </p>
        </Aviso>
      ) : null}
      {r?.estado === "APROBADA" && r.anulacion ? (
        <Aviso tono="aviso" titulo={`Aprobación anulada por ${r.anulacion.por}`}>
          <p className="observaciones">{r.anulacion.motivo}</p>
          <p className="ayuda">Para emitir, envíe la versión a revisión otra vez (o corrija y calcule una versión nueva).</p>
        </Aviso>
      ) : null}
      {r?.estado === "CAMBIOS_SOLICITADOS" ? (
        <Aviso tono="aviso" titulo={`Cambios solicitados por ${r.resueltaPor ?? "—"}`}>
          <p className="observaciones">{r.observaciones}</p>
          <p className="ayuda">Corrija, guarde y calcule una versión nueva; después envíela a revisión.</p>
        </Aviso>
      ) : null}
      {r?.estado === "RETIRADA" ? (
        <p className="ayuda">
          Revisión retirada por {r.resueltaPor ?? "—"} el {formatearInstante(r.resueltaEn ?? r.enviadoEn)}
          {r.observaciones ? ` (${r.observaciones})` : ""}.
        </p>
      ) : null}
      {ultima.estado === "BORRADOR" && puedeEnviar ? (
        <>
          {motivoNoEnviar ? (
            <p className="ayuda" id="motivo-no-enviar">
              {motivoNoEnviar}
            </p>
          ) : null}
          {confirmando && !motivoNoEnviar ? (
            <div className="confirmacion-bloque" role="group" aria-labelledby="titulo-confirmar-envio">
              <p id="titulo-confirmar-envio">
                <strong>
                  Enviar {ultima.idVersion} por {formatearImporte(ultima.total, "MXN")} a revisión.
                </strong>{" "}
                Mientras esté en revisión no podrá editar ni calcular; otra persona con función de revisor decidirá.
              </p>
              <div className="formulario-acciones">
                <Boton variante="primario" onClick={() => void enviar()} disabled={envio.fase === "enviando"} aria-disabled={envio.fase === "enviando"}>
                  {envio.fase === "enviando" ? "Enviando…" : `Confirmar envío de ${ultima.idVersion}`}
                </Boton>
                <Boton onClick={() => setConfirmando(false)} disabled={envio.fase === "enviando"}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : (
            <Boton
              onClick={() => setConfirmando(true)}
              disabled={ocupado || motivoNoEnviar !== null}
              aria-disabled={ocupado || motivoNoEnviar !== null}
              aria-describedby={motivoNoEnviar ? "motivo-no-enviar" : undefined}
            >
              Enviar {ultima.idVersion} a revisión…
            </Boton>
          )}
        </>
      ) : null}
      <div aria-live="polite">
        {envio.fase === "bloqueado" ? (
          <Aviso tono="error" titulo="No se puede enviar a revisión; el estado no cambió" rol="alert">
            <ul className="lista-problemas">
              {envio.problemas.map((p, i) => (
                <li key={`${p.codigo}-${i}`}>
                  <Codigo>{p.codigo}</Codigo> {p.mensaje}
                </li>
              ))}
            </ul>
          </Aviso>
        ) : null}
        {envio.fase === "error" ? (
          <Aviso tono="error" titulo="No se envió a revisión" rol="alert">
            <p>{mensajeDeFallo(envio.fallo)}</p>
            {FALLOS_REINTENTABLES.has(envio.fallo.tipo) ? (
              <Boton onClick={() => void enviar()}>Reintentar (sin duplicar)</Boton>
            ) : (
              <Boton onClick={alEnviada}>Actualizar</Boton>
            )}
          </Aviso>
        ) : null}
      </div>
    </section>
  );
}
