/**
 * Módulo 15 (ADR-0019): duplicar la cotización (B-35), preparar la versión nueva con modo de precios
 * (B-34) y vista previa PDF marcada BORRADOR (B-25). La API decide y valida todo; la pantalla
 * explica qué se copia, qué se conserva y qué representa cada documento.
 *
 * - Doble clic y reintentos: una clave de idempotencia por intención (`useIntenciones`) y botones
 *   deshabilitados mientras hay una solicitud en curso.
 * - Respuestas atrasadas: un número de solicitud; solo la última actualiza la pantalla.
 * - Ningún origen se elige en silencio: la pantalla dice si se duplica una versión o el borrador
 *   guardado (y su revisión), y si hay cambios sin guardar que no se incluyen.
 */
import { MODOS_PRECIOS, type DetalleCotizacion, type ModoPrecios, type OrigenDuplicado, type Proyecto } from "@softarq/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton, Codigo } from "../comunes/componentes.tsx";
import { formatearFecha, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { Enlace, useRuta } from "../navegacion/ruta.tsx";
import { guardarArchivo } from "./emision.tsx";

const REINTENTABLES = new Set<FalloApi["tipo"]>(["red", "error_servidor", "no_disponible", "limite", "documento"]);

// ---------------------------------------------------------------------------
// Duplicar (B-35)
// ---------------------------------------------------------------------------

/** Qué se copia y qué se reinicia al duplicar (B-35, `His_Duplicar`). */
function QueSeCopia() {
  return (
    <ul className="lista-compacta">
      <li>
        <strong>Se copian:</strong> las partidas y sus mediciones, los textos del origen (alcance, condiciones y exclusiones) y la decisión de consolidar
        compras.
      </li>
      <li>
        <strong>Se reinician:</strong> el folio (uno nuevo), las versiones, la revisión, la aprobación, la emisión y la respuesta del cliente.
      </li>
      <li>
        <strong>No se copian:</strong> los precios elegidos (se eligen de nuevo) ni las excepciones (se registran de nuevo si hacen falta).
      </li>
    </ul>
  );
}

export function PanelDuplicar({
  cotizaciones,
  cotizacionId,
  origen,
  descripcionOrigen,
  proyecto,
  cambiosSinGuardar = false,
}: {
  cotizaciones: Pick<ServiciosCotizaciones, "duplicarCotizacion" | "listarProyectos">;
  cotizacionId: string;
  origen: OrigenDuplicado;
  /** Texto exacto del origen («la versión COT-…-v2» o «el borrador guardado (revisión 4)»). */
  descripcionOrigen: string;
  proyecto: { id: string; codigo: string; nombre: string; activo: boolean; clienteActivo: boolean };
  cambiosSinGuardar?: boolean;
}) {
  const { navegar } = useRuta();
  const intenciones = useIntenciones();
  const base = useId();
  const [abierto, setAbierto] = useState(false);
  const mismoValido = proyecto.activo && proyecto.clienteActivo;
  const [destino, setDestino] = useState<string | null>(mismoValido ? proyecto.id : null);
  const [buscar, setBuscar] = useState("");
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null);
  const [estado, setEstado] = useState<{ fase: "inactivo" } | { fase: "enviando" } | { fase: "error"; fallo: FalloApi }>({ fase: "inactivo" });
  const solicitud = useRef(0);
  const titulo = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (abierto) titulo.current?.focus();
  }, [abierto]);

  const buscarProyectos = async () => {
    const n = ++solicitud.current;
    const texto = buscar.trim();
    const r = await cotizaciones.listarProyectos(texto ? { buscar: texto } : {});
    if (n !== solicitud.current) return;
    setProyectos(r.ok ? r.datos.proyectos.filter((p) => p.activo && p.cliente.activo) : []);
  };

  const confirmar = async () => {
    if (estado.fase === "enviando" || !destino) return;
    const cuerpo = { origen, proyectoId: destino };
    const ambito = `duplicar:${cotizacionId}`;
    setEstado({ fase: "enviando" });
    const r = await cotizaciones.duplicarCotizacion(cotizacionId, cuerpo, intenciones.clave(ambito, cuerpo));
    if (r.ok) {
      intenciones.olvidar(ambito, cuerpo);
      navegar({ pantalla: "cotizacion", id: r.datos.cotizacion.id });
      return;
    }
    if (!REINTENTABLES.has(r.fallo.tipo)) intenciones.olvidar(ambito, cuerpo);
    setEstado({ fase: "error", fallo: r.fallo });
  };

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} aria-expanded={false}>
        {origen.tipo === "VERSION" ? "Duplicar esta versión…" : "Duplicar el borrador guardado…"}
      </Boton>
    );
  }
  return (
    <div className="confirmacion-bloque" role="group" aria-labelledby={`${base}-titulo`}>
      <p id={`${base}-titulo`} className="aviso-titulo" tabIndex={-1} ref={titulo}>
        Duplicar {descripcionOrigen} en una cotización nueva
      </p>
      <QueSeCopia />
      {cambiosSinGuardar ? (
        <Aviso tono="aviso" titulo="Hay cambios sin guardar">
          <p>Se duplica lo guardado, no lo que está en pantalla. Guarde antes si quiere incluir sus cambios.</p>
        </Aviso>
      ) : null}
      <fieldset className="campo">
        <legend className="etiqueta">Proyecto de la cotización nueva</legend>
        {mismoValido ? (
          <label className="opcion-en-linea">
            <input type="radio" name={`${base}-destino`} checked={destino === proyecto.id} onChange={() => setDestino(proyecto.id)} />
            El mismo proyecto: {proyecto.nombre} <Codigo>{proyecto.codigo}</Codigo>
          </label>
        ) : (
          <p className="ayuda">
            El proyecto {proyecto.nombre} (<Codigo>{proyecto.codigo}</Codigo>) o su cliente está inactivo: elija otro proyecto activo.
          </p>
        )}
        <div className="buscador-cabecera">
          <div className="campo">
            <label htmlFor={`${base}-buscar`}>Buscar otro proyecto</label>
            <input id={`${base}-buscar`} type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} maxLength={60} />
          </div>
          <Boton onClick={() => void buscarProyectos()}>Buscar</Boton>
        </div>
        {proyectos !== null ? (
          proyectos.length === 0 ? (
            <p className="ayuda">No hay proyectos activos con esa búsqueda.</p>
          ) : (
            <div className="lista-seleccion">
              {proyectos.map((p) => (
                <label key={p.id} className={`opcion${destino === p.id ? " opcion-elegida" : ""}`}>
                  <input type="radio" name={`${base}-destino`} checked={destino === p.id} onChange={() => setDestino(p.id)} />
                  <span className="opcion-cuerpo">
                    <span className="opcion-producto">{p.nombre}</span>
                    <span className="opcion-dato">
                      <Codigo>{p.codigo}</Codigo> · {p.cliente.nombre}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )
        ) : null}
      </fieldset>
      {estado.fase === "error" ? (
        <div role="alert">
          <Aviso tono="error" titulo="No se duplicó">
            <p>{mensajeDeFallo(estado.fallo)}</p>
          </Aviso>
        </div>
      ) : null}
      <div className="formulario-acciones">
        <Boton variante="primario" onClick={() => void confirmar()} disabled={estado.fase === "enviando" || !destino} aria-disabled={estado.fase === "enviando" || !destino}>
          {estado.fase === "enviando" ? "Duplicando…" : "Confirmar duplicado"}
        </Boton>
        <Boton onClick={() => setAbierto(false)} disabled={estado.fase === "enviando"}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

/** Aviso en una cotización duplicada sin versiones: origen y lo que falta antes de calcular. */
export function AvisoDuplicada({ detalle }: { detalle: DetalleCotizacion }) {
  const d = detalle.duplicadaDe;
  if (!d) return null;
  const origen = d.version !== null ? `la versión ${d.folio}-v${d.version}` : `el borrador guardado de ${d.folio} (revisión ${d.revision})`;
  return (
    <Aviso tono="info" titulo={`Duplicada de ${origen}`} rol="status">
      <p>
        <Enlace a={{ pantalla: "cotizacion", id: d.cotizacionId }}>Abrir el origen</Enlace>.{" "}
        {detalle.versiones.length === 0
          ? "Antes de calcular, elija los precios de cada insumo y registre de nuevo las excepciones que hagan falta: no se copiaron."
          : null}
      </p>
    </Aviso>
  );
}

// ---------------------------------------------------------------------------
// Preparar la versión nueva con modo de precios (B-34)
// ---------------------------------------------------------------------------

const TEXTO_MODO: Record<ModoPrecios, { titulo: string; efecto: string }> = {
  CONSERVAR: {
    titulo: "Conservar los precios de la versión emitida",
    efecto:
      "El borrador toma los mismos precios elegidos en la versión emitida (mismos registros e importes). Si alguno se anuló o venció, quedará marcado y deberá resolverse antes de enviar o calcular. Los parámetros del cálculo, el impuesto y la mano de obra vigentes se aplican al calcular: el total puede cambiar.",
  },
  ELEGIR_DE_NUEVO: {
    titulo: "Elegir los precios de nuevo",
    efecto:
      "El borrador queda sin precios elegidos: elija cada uno entre las opciones vigentes. No se elige ninguno automáticamente (el menor solo se señala).",
  },
};

export function PanelNuevaVersion({
  cotizaciones,
  detalle,
  alPreparada,
}: {
  cotizaciones: Pick<ServiciosCotizaciones, "prepararNuevaVersion">;
  detalle: DetalleCotizacion;
  alPreparada: () => void;
}) {
  const nv = detalle.nuevaVersion!;
  const base = useId();
  const intenciones = useIntenciones();
  const [modo, setModo] = useState<ModoPrecios | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<
    { fase: "inactivo" } | { fase: "enviando" } | { fase: "divergente"; selecciones: NonNullable<Extract<FalloApi, { tipo: "nueva_version" }>["selecciones"]> } | { fase: "error"; fallo: FalloApi }
  >({ fase: "inactivo" });
  const ocupado = estado.fase === "enviando";

  const enviar = async (reemplazar: boolean) => {
    if (ocupado) return;
    const m = motivo.trim();
    if (!modo) {
      setError("Elija el modo de precios.");
      return;
    }
    if (m.length < 10 || !/\p{L}/u.test(m)) {
      setError("Explique el motivo de la versión nueva (al menos 10 caracteres).");
      return;
    }
    setError(null);
    const cuerpo = {
      versionOrigen: nv.versionOrigen,
      modo,
      motivo: m,
      revisionBorrador: detalle.borrador.revision,
      ...(reemplazar ? { reemplazarSeleccionesDelBorrador: true as const } : {}),
    };
    const ambito = `nueva-version:${detalle.cotizacion.id}`;
    setEstado({ fase: "enviando" });
    const r = await cotizaciones.prepararNuevaVersion(detalle.cotizacion.id, cuerpo, intenciones.clave(ambito, cuerpo));
    if (r.ok) {
      intenciones.olvidar(ambito, cuerpo);
      alPreparada();
      return;
    }
    if (!REINTENTABLES.has(r.fallo.tipo)) intenciones.olvidar(ambito, cuerpo);
    if (r.fallo.tipo === "nueva_version" && r.fallo.codigo === "SELECCIONES_DIVERGENTES" && r.fallo.selecciones) {
      setEstado({ fase: "divergente", selecciones: r.fallo.selecciones });
      return;
    }
    setEstado({ fase: "error", fallo: r.fallo });
  };

  const idVersion = `${detalle.cotizacion.folio}-v${nv.versionOrigen}`;
  return (
    <section className="seccion panel-nueva-version" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className="seccion-titulo">
        Preparar la versión nueva
      </h2>
      <p>
        La última versión, <Codigo>{idVersion}</Codigo>, está emitida y no cambia. Para corregirla se prepara una versión nueva: elija qué hacer con los precios y
        explique el motivo. Las partidas, mediciones y textos del borrador se conservan; la versión nueva se calcula después, con su propia revisión y aprobación.
      </p>
      <fieldset className="campo" aria-describedby={error ? `${base}-error` : undefined}>
        <legend className="etiqueta">Modo de precios</legend>
        {MODOS_PRECIOS.map((m) => (
          <label key={m} className={`opcion${modo === m ? " opcion-elegida" : ""}`}>
            <input
              type="radio"
              name={`${base}-modo`}
              checked={modo === m}
              onChange={() => {
                setModo(m);
                setError(null);
              }}
              disabled={ocupado}
            />
            <span className="opcion-cuerpo">
              <span className="opcion-producto">{TEXTO_MODO[m].titulo}</span>
              <span className="opcion-dato">{TEXTO_MODO[m].efecto}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="campo">
        <label htmlFor={`${base}-motivo`} className="etiqueta">
          Motivo de la versión nueva <span className="ayuda">(obligatorio)</span>
        </label>
        <textarea
          id={`${base}-motivo`}
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setError(null);
          }}
          disabled={ocupado}
        />
      </div>
      {error ? (
        <p id={`${base}-error`} className="error-campo" role="alert">
          {error}
        </p>
      ) : null}
      {estado.fase === "divergente" ? (
        <Aviso tono="aviso" titulo="El borrador tiene precios elegidos distintos de los de la versión emitida" rol="alert">
          <p>No se cambió nada. Compare y decida si deben reemplazarse por lo que deja el modo elegido.</p>
          <div className="tabla-contenedor">
            <table className="tabla tabla-registros">
              <caption className="solo-lector">Precios elegidos: borrador frente al modo</caption>
              <thead>
                <tr>
                  <th scope="col">Insumo</th>
                  <th scope="col">En el borrador</th>
                  <th scope="col">Con el modo elegido</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set([...estado.selecciones.actuales, ...estado.selecciones.propuestas].map((x) => x.insumoCodigo))].map((insumo) => (
                  <tr key={insumo}>
                    <td data-etiqueta="Insumo">
                      <Codigo>{insumo}</Codigo>
                    </td>
                    <td data-etiqueta="En el borrador">{estado.selecciones.actuales.find((x) => x.insumoCodigo === insumo)?.precioCodigo ?? "—"}</td>
                    <td data-etiqueta="Con el modo elegido">{estado.selecciones.propuestas.find((x) => x.insumoCodigo === insumo)?.precioCodigo ?? "Sin elegir"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="formulario-acciones">
            <Boton variante="peligro" onClick={() => void enviar(true)}>
              Reemplazar los precios del borrador
            </Boton>
            <Boton onClick={() => setEstado({ fase: "inactivo" })}>Cancelar</Boton>
          </div>
        </Aviso>
      ) : null}
      {estado.fase === "error" ? (
        <div role="alert">
          <Aviso tono="error" titulo="No se preparó la versión nueva">
            <p>{mensajeDeFallo(estado.fallo)}</p>
          </Aviso>
        </div>
      ) : null}
      {estado.fase !== "divergente" ? (
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={() => void enviar(false)} disabled={ocupado} aria-disabled={ocupado}>
            {ocupado ? "Preparando…" : "Preparar la versión nueva"}
          </Boton>
        </div>
      ) : null}
    </section>
  );
}

/** Ciclo preparado: qué modo se eligió y qué hay que revisar. */
export function AvisoCicloPreparado({ detalle }: { detalle: DetalleCotizacion }) {
  const p = detalle.nuevaVersion?.preparada;
  if (!p) return null;
  const pendientes = detalle.borrador.referencias.selecciones.filter((s) => !s.disponible);
  return (
    <Aviso tono="info" titulo={`Versión nueva preparada desde ${detalle.cotizacion.folio}-v${detalle.nuevaVersion!.versionOrigen}`} rol="status">
      <p>
        {TEXTO_MODO[p.modo].titulo}. Motivo: {p.motivo} ({p.por}, {formatearInstante(p.en)}).
      </p>
      {p.modo === "ELEGIR_DE_NUEVO" && detalle.borrador.captura.seleccion.length === 0 ? <p>Elija los precios antes de calcular.</p> : null}
      {pendientes.length > 0 ? (
        <p>
          Requieren intervención: {pendientes.map((s) => `${s.precioCodigo} (${s.motivo ?? "no disponible"})`).join("; ")}.
        </p>
      ) : null}
    </Aviso>
  );
}

// ---------------------------------------------------------------------------
// Vista previa PDF marcada BORRADOR (B-25)
// ---------------------------------------------------------------------------

export function VistaPreviaPdf({
  cotizaciones,
  cotizacionId,
  numero,
  idVersion,
  fechaCalculo,
}: {
  cotizaciones: Pick<ServiciosCotizaciones, "vistaPrevia">;
  cotizacionId: string;
  numero: number;
  idVersion: string;
  fechaCalculo: string;
}) {
  const base = useId();
  const intenciones = useIntenciones();
  const [estado, setEstado] = useState<{ fase: "inactivo" } | { fase: "generando" } | { fase: "lista"; blob: Blob } | { fase: "error"; fallo: FalloApi }>({ fase: "inactivo" });
  const solicitud = useRef(0);
  const vivo = useRef(true);
  useEffect(
    () => () => {
      vivo.current = false;
      solicitud.current++;
    },
    [],
  );

  const generar = async (accion: "descargar" | "abrir") => {
    if (estado.fase === "generando") return;
    const n = ++solicitud.current;
    // Una intención por clic: un reintento tras un fallo de red reutiliza la clave (sin otro evento).
    const ambito = `vista-previa:${cotizacionId}:${numero}:${n}`;
    setEstado({ fase: "generando" });
    const r = await cotizaciones.vistaPrevia(cotizacionId, numero, intenciones.clave(ambito, {}));
    if (!vivo.current || n !== solicitud.current) return;
    intenciones.olvidar(ambito, {});
    if (!r.ok) {
      setEstado({ fase: "error", fallo: r.fallo });
      return;
    }
    setEstado({ fase: "lista", blob: r.datos });
    if (accion === "descargar") guardarArchivo(r.datos, `${idVersion}-BORRADOR.pdf`);
    else {
      const enlace = URL.createObjectURL(r.datos);
      window.open(enlace, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(enlace), 60_000);
    }
  };

  const ocupado = estado.fase === "generando";
  return (
    <section className="seccion vista-previa-pdf" aria-labelledby={`${base}-titulo`}>
      <h3 id={`${base}-titulo`} className="subtitulo">
        Vista previa PDF (BORRADOR) de <Codigo>{idVersion}</Codigo>
      </h3>
      <p className="ayuda">
        Representa {idVersion}, calculada el {formatearFecha(fechaCalculo)}, con los datos actuales del emisor, el cliente y el proyecto. No es un documento
        emitido ni válido como cotización, y no refleja cambios sin calcular.
      </p>
      <div className="formulario-acciones">
        <Boton onClick={() => void generar("descargar")} disabled={ocupado} aria-disabled={ocupado}>
          {ocupado ? "Generando…" : "Descargar BORRADOR (PDF)"}
        </Boton>
        <Boton variante="enlace" onClick={() => void generar("abrir")} disabled={ocupado}>
          Abrir en otra pestaña
        </Boton>
      </div>
      <div aria-live="polite">
        {estado.fase === "lista" ? <p className="ayuda">Vista previa generada. Puede volver a descargarla o abrirla.</p> : null}
      </div>
      {estado.fase === "error" ? (
        <div role="alert">
          <Aviso tono="error" titulo="No se generó la vista previa">
            <p>{mensajeDeFallo(estado.fallo)}</p>
            {estado.fallo.tipo === "bloqueado" && estado.fallo.problemas.length > 0 ? (
              <ul>
                {estado.fallo.problemas.map((p) => (
                  <li key={`${p.codigo}-${p.referencia}`}>
                    <strong>{p.codigo}</strong> {p.mensaje}
                  </li>
                ))}
              </ul>
            ) : null}
          </Aviso>
        </div>
      ) : null}
    </section>
  );
}

/** ¿El estado de la versión admite vista previa? (la API lo vuelve a comprobar). */
export const admiteVistaPrevia = (v: { estado: string; esUltima: boolean }) => v.esUltima && ["BORRADOR", "EN_REVISION", "APROBADA"].includes(v.estado);
