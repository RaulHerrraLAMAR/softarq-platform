/**
 * Emisión de versiones aprobadas, documento PDF DEMO, descarte y emisor (módulo 8, ADR-0010).
 *
 * - La web solo muestra y confirma: qué se emitiría, lo que falta y los bloqueos los calcula el
 *   servidor (`validacion`), que vuelve a comprobarlo todo al emitir.
 * - Nada se anuncia como emitido antes de la respuesta 201 del servidor. Mientras se genera el
 *   documento el botón queda deshabilitado; un fallo conserva el contexto y permite reintentar con
 *   la MISMA clave (sin duplicar).
 * - APROBADA y EMITIDA se distinguen siempre. El PDF se descarga con la sesión (no hay enlaces
 *   públicos) y es el archivo emitido, nunca uno regenerado.
 * - No hay envío por correo ni entrega al cliente desde la web.
 */
import {
  LIMITES_COTIZACIONES,
  LIMITES_EMISION,
  LIMITES_REVISIONES,
  type DetalleCotizacion,
  type Emisor,
  type ResumenEmision,
  type ResumenVersion,
  type TextosCotizacion,
  type ValidacionEmision,
} from "@softarq/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearFecha, formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, Pagina } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace } from "../navegacion/ruta.tsx";
import { PanelRespuesta } from "./respuestas.tsx";

const REINTENTABLES = new Set<FalloApi["tipo"]>(["red", "error_servidor", "no_disponible", "limite", "csrf", "documento"]);

const CAMPOS_TEXTO: { clave: keyof TextosCotizacion; titulo: string }[] = [
  { clave: "alcance", titulo: "Alcance" },
  { clave: "condiciones", titulo: "Condiciones" },
  { clave: "exclusiones", titulo: "Exclusiones" },
];

/** Cómo se corrige cada bloqueo de emisión (en palabras de la web). */
const COMO_CORREGIR: Record<string, string> = {
  "BL-01": "Complete el contacto en la ficha del cliente. Si cambió el nombre, genere una versión nueva y obtenga su aprobación.",
  "BL-02": "Complete municipio, entidad y descripción del proyecto y genere una versión nueva con su aprobación.",
  "BL-09": "Hay precios vencidos a la fecha de emisión: genere una versión nueva con precios vigentes.",
  "BL-15": "El Administrador del sistema completa los datos del emisor (sección «Emisor»).",
  "BL-16": "Cambiaron datos o el borrador después de calcular: genere una versión nueva y envíela a revisión.",
  "BL-17": "Hace falta una aprobación vigente de esta versión por una persona distinta de quien la preparó.",
  "BL-19": "El estado no permite emitir esta versión.",
  "BL-20": "Complete alcance, condiciones y exclusiones en el borrador y genere una versión nueva.",
};

// ---------------------------------------------------------------------------
// Textos de la versión
// ---------------------------------------------------------------------------

/** Textos guardados en una versión (solo lectura). Sin textos: aviso BL-20. */
export function TextosVersion({ textos, titulo = "Textos de la versión" }: { textos: TextosCotizacion | null; titulo?: string }) {
  const id = useId();
  return (
    <section className="seccion textos-version" aria-labelledby={id}>
      <h2 id={id} className="seccion-titulo">
        {titulo}
      </h2>
      {!textos ? (
        <Aviso tono="aviso" titulo="Esta versión no tiene textos (BL-20)">
          <p>Se calculó antes de existir los textos de la versión. Para emitir hace falta una versión nueva con alcance, condiciones y exclusiones.</p>
        </Aviso>
      ) : (
        <dl className="lista-textos">
          {CAMPOS_TEXTO.map((c) => (
            <div key={c.clave}>
              <dt>{c.titulo}</dt>
              <dd className="texto-largo">{textos[c.clave].trim() ? textos[c.clave] : <span className="error-campo">Vacío (BL-20)</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Edición de los textos del borrador. Son de la versión: no cambian el cálculo. */
export function EditorTextos({
  textos,
  predeterminados,
  alCambiar,
  alRestablecer,
  deshabilitado = false,
}: {
  textos: TextosCotizacion | null;
  predeterminados: TextosCotizacion | null;
  alCambiar: (campo: keyof TextosCotizacion, valor: string) => void;
  alRestablecer: (t: TextosCotizacion) => void;
  deshabilitado?: boolean;
}) {
  const base = useId();
  const [confirmar, setConfirmar] = useState(false);
  const vacios = CAMPOS_TEXTO.filter((c) => !textos || textos[c.clave].trim() === "").map((c) => c.titulo.toLowerCase());
  return (
    <section className="seccion editor-textos" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className="seccion-titulo">
        Textos de la cotización
      </h2>
      <p className="ayuda">
        Forman parte de la versión que se calcula: el revisor los ve antes de aprobar y aparecen en el PDF. No cambian el cálculo. Si los cambia
        después de calcular, hará falta una versión nueva con su propia aprobación.
      </p>
      {CAMPOS_TEXTO.map((c) => {
        const valor = textos?.[c.clave] ?? "";
        const id = `${base}-${c.clave}`;
        return (
          <div className="campo" key={c.clave}>
            <label className="etiqueta" htmlFor={id}>
              {c.titulo}
            </label>
            <textarea
              id={id}
              rows={3}
              maxLength={LIMITES_COTIZACIONES.longitudTextoCotizacion}
              value={valor}
              disabled={deshabilitado}
              aria-describedby={`${id}-contador`}
              onChange={(e) => alCambiar(c.clave, e.target.value)}
            />
            <p className="ayuda contador" id={`${id}-contador`}>
              {valor.length} / {LIMITES_COTIZACIONES.longitudTextoCotizacion}
            </p>
          </div>
        );
      })}
      {vacios.length > 0 ? (
        <p className="ayuda aviso-en-linea" role="status">
          Falta {vacios.join(", ")}: se puede guardar, pero no enviar a revisión ni emitir (BL-20).
        </p>
      ) : null}
      {predeterminados ? (
        confirmar ? (
          <span className="confirmacion" role="group" aria-label="Confirmar textos predeterminados">
            <span>Se reemplazarán los tres textos por los predeterminados DEMO.</span>
            <Boton
              onClick={() => {
                alRestablecer(predeterminados);
                setConfirmar(false);
              }}
            >
              Reemplazar
            </Boton>
            <Boton onClick={() => setConfirmar(false)}>Cancelar</Boton>
          </span>
        ) : (
          <Boton onClick={() => setConfirmar(true)} disabled={deshabilitado}>
            Restablecer textos DEMO…
          </Boton>
        )
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Documento emitido
// ---------------------------------------------------------------------------

function tamano(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Guarda el archivo descargado con su nombre (sin abrir ventanas ni URL públicas). */
function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TarjetaEmision({ emision, cotizaciones }: { emision: ResumenEmision; cotizaciones: ServiciosCotizaciones }) {
  const [descarga, setDescarga] = useState<{ fase: "inactivo" } | { fase: "descargando" } | { fase: "hecho" } | { fase: "error"; fallo: FalloApi }>({
    fase: "inactivo",
  });
  const descargar = async () => {
    if (descarga.fase === "descargando") return;
    setDescarga({ fase: "descargando" });
    const r = await cotizaciones.descargarDocumento(emision.id);
    if (r.ok) {
      guardarArchivo(r.datos, emision.archivo.nombre);
      setDescarga({ fase: "hecho" });
    } else if (r.fallo.tipo !== "cancelado") {
      setDescarga({ fase: "error", fallo: r.fallo });
    } else {
      setDescarga({ fase: "inactivo" });
    }
  };
  return (
    <div className="tarjeta-emision" aria-label={`Documento emitido de ${emision.idVersion}`}>
      <p className="tarjeta-emision-titulo">
        <Insignia tono="emitida">{emision.sustituida ? "Emitida · sustituida" : "Emitida"}</Insignia> <span className="codigo">{emision.idVersion}</span>{" "}
        <strong className="numero">{formatearImporte(emision.total, "MXN")}</strong>
      </p>
      <dl className="datos-version">
        <div>
          <dt>Fecha de emisión</dt>
          <dd>{formatearFecha(emision.fechaEmision)}</dd>
        </div>
        <div>
          <dt>Vigente hasta</dt>
          <dd>
            {formatearFecha(emision.vigenteHasta)} ({emision.vigenciaDias} días naturales)
          </dd>
        </div>
        <div>
          <dt>Preparó · aprobó · emitió</dt>
          <dd>
            {emision.preparadoPor} · {emision.aprobadoPor} · {emision.emitidoPor}
          </dd>
        </div>
        <div>
          <dt>Documento</dt>
          <dd>
            <span className="codigo">{emision.archivo.nombre}</span> · {tamano(emision.archivo.bytes)} · SHA-256{" "}
            <span className="codigo" title={emision.archivo.sha256}>
              {emision.archivo.sha256.slice(0, 12)}…
            </span>
          </dd>
        </div>
      </dl>
      {emision.sustituida ? <p className="ayuda">Se emitió una versión posterior; este documento se conserva sin cambios.</p> : null}
      <div className="formulario-acciones">
        <Boton variante="primario" onClick={() => void descargar()} disabled={descarga.fase === "descargando"} aria-disabled={descarga.fase === "descargando"}>
          {descarga.fase === "descargando" ? "Descargando…" : "Descargar PDF"}
        </Boton>
      </div>
      <div aria-live="polite">
        {descarga.fase === "hecho" ? <p className="ayuda">Descargado {emision.archivo.nombre} (el documento emitido, sin regenerar).</p> : null}
        {descarga.fase === "error" ? (
          <Aviso tono="error" titulo="No se pudo descargar el documento" rol="alert">
            <p>{mensajeDeFallo(descarga.fallo)}</p>
          </Aviso>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emisión
// ---------------------------------------------------------------------------

type EstadoEmision =
  | { fase: "inactivo" }
  | { fase: "generando" }
  | { fase: "bloqueada"; mensaje: string; problemas: { codigo: string; mensaje: string }[] }
  | { fase: "conflicto"; mensaje: string }
  | { fase: "error"; fallo: FalloApi };

/**
 * Emisión de la última versión APROBADA (B-30, con la adaptación de quién emite). Muestra lo que se
 * emitiría, lo que falta y los bloqueos; confirma folio, versión, destinatario, fechas y total.
 */
export function PanelEmision({
  cotizacionId,
  version,
  cotizaciones,
  alEmitida,
  alActualizar,
}: {
  cotizacionId: string;
  version: ResumenVersion;
  cotizaciones: ServiciosCotizaciones;
  alEmitida: () => void;
  alActualizar: () => void;
}) {
  const { estado: carga, recargar } = useCarga((s) => cotizaciones.validarEmision(cotizacionId, version.numero, s), [cotizacionId, version.numero, version.revisionVigente?.id]);
  const intenciones = useIntenciones();
  const [confirmando, setConfirmando] = useState(false);
  const [emision, setEmision] = useState<EstadoEmision>({ fase: "inactivo" });
  const solicitud = useRef(0);
  useEffect(() => () => void (solicitud.current += 1), []);
  const titulo = useId();

  if (carga.fase === "cargando") return <Cargando etiqueta="Comprobando si se puede emitir…" />;
  if (carga.fase === "error") return <CargaFallida titulo="No se pudo validar la emisión" fallo={carga.fallo} alReintentar={recargar} />;
  const v: ValidacionEmision = carga.datos;
  const generando = emision.fase === "generando";

  const emitir = async () => {
    if (generando || !v.aprobacion) return;
    const contenido = { versionId: v.version.id, revisionId: v.aprobacion.revisionId };
    const ambito = `emision:${cotizacionId}:${v.version.numero}`;
    const n = ++solicitud.current;
    setEmision({ fase: "generando" });
    const r = await cotizaciones.emitir(cotizacionId, v.version.numero, contenido, intenciones.clave(ambito, contenido));
    if (n !== solicitud.current) return;
    if (r.ok) {
      intenciones.olvidar(ambito, contenido);
      setConfirmando(false);
      setEmision({ fase: "inactivo" });
      alEmitida();
      return;
    }
    const f = r.fallo;
    // DOCUMENTO_NO_DISPONIBLE no aplica a emitir; DOCUMENTO_NO_GENERADO sí se reintenta con la misma clave.
    if (!REINTENTABLES.has(f.tipo)) intenciones.olvidar(ambito, contenido);
    if (f.tipo === "bloqueado") setEmision({ fase: "bloqueada", mensaje: f.mensaje ?? "No se puede emitir; nada cambió.", problemas: f.problemas });
    else if (f.tipo === "estado" || f.tipo === "revision" || f.tipo === "conflicto") setEmision({ fase: "conflicto", mensaje: f.mensaje });
    else setEmision({ fase: "error", fallo: f });
  };

  const contacto = [v.destinatario.contacto.nombre, v.destinatario.contacto.telefono, v.destinatario.contacto.correo].filter(Boolean).join(" · ");
  const motivoNo = v.motivoNoEmitir ?? (v.bloqueos.length > 0 ? "Hay bloqueos: corríjalos antes de emitir." : null);

  return (
    <section className="panel-emision" aria-labelledby={titulo}>
      <h3 id={titulo} className="subtitulo">
        Emisión de {v.version.idVersion}
      </h3>
      <p className="ayuda">
        Emitir genera el documento PDF DEMO y deja la versión emitida; no se envía al cliente desde aquí. Fecha de emisión:{" "}
        {formatearFecha(v.fechaEmision)}
        {v.vigenteHasta ? `; vigente hasta ${formatearFecha(v.vigenteHasta)} (${v.vigenciaDias} días naturales)` : ""}.
      </p>
      <dl className="datos-version">
        <div>
          <dt>Aprobación</dt>
          <dd>{v.aprobacion ? `${v.aprobacion.aprobadaPor} · ${formatearInstante(v.aprobacion.aprobadaEn)}` : "Sin aprobación vigente"}</dd>
        </div>
        <div>
          <dt>Destinatario</dt>
          <dd>
            {v.destinatario.cliente.nombre} <Codigo>{v.destinatario.cliente.codigo}</Codigo>
            <span className="bloque">{contacto || <span className="error-campo">Sin contacto (BL-01)</span>}</span>
          </dd>
        </div>
        <div>
          <dt>Proyecto</dt>
          <dd>
            {v.destinatario.proyecto.nombre}
            {v.destinatario.proyecto.ubicacion ? ` · ${v.destinatario.proyecto.ubicacion}` : ""}
          </dd>
        </div>
        <div>
          <dt>Emisor</dt>
          <dd>{v.emisor.nombre ?? <span className="error-campo">Sin configurar (BL-15)</span>}</dd>
        </div>
      </dl>
      {v.bloqueos.length > 0 ? (
        <Aviso tono="error" titulo={`${v.bloqueos.length} bloqueo(s): no se puede emitir`}>
          <ul className="lista-problemas">
            {v.bloqueos.map((p, i) => (
              <li key={`${p.codigo}-${i}`}>
                <Codigo>{p.codigo}</Codigo> {p.mensaje}
                {COMO_CORREGIR[p.codigo] ? <span className="ayuda bloque">{COMO_CORREGIR[p.codigo]}</span> : null}
              </li>
            ))}
          </ul>
        </Aviso>
      ) : null}
      {v.avisos.length > 0 ? (
        <Aviso tono="aviso" titulo="Avisos con la fecha de emisión (no bloquean)">
          <ul className="lista-problemas">
            {v.avisos.map((a, i) => (
              <li key={`${a.codigo}-${i}`}>
                <Codigo>{a.codigo}</Codigo> {a.mensaje}
              </li>
            ))}
          </ul>
        </Aviso>
      ) : null}
      {motivoNo ? (
        <p className="ayuda" id={`${titulo}-motivo`}>
          {motivoNo}
        </p>
      ) : null}
      {confirmando && v.puedeEmitir ? (
        <div className="confirmacion-bloque" role="group" aria-labelledby={`${titulo}-confirmar`}>
          <p id={`${titulo}-confirmar`}>
            <strong>
              Emitir {v.version.idVersion} por {formatearImporte(v.version.total, "MXN")}
            </strong>{" "}
            para {v.destinatario.cliente.nombre}
            {contacto ? ` (${contacto})` : ""}. Fecha de emisión {formatearFecha(v.fechaEmision)}
            {v.vigenteHasta ? `, vigente hasta ${formatearFecha(v.vigenteHasta)}` : ""}. La versión quedará emitida y su documento no cambiará.
          </p>
          <div className="formulario-acciones">
            <Boton variante="primario" onClick={() => void emitir()} disabled={generando} aria-disabled={generando}>
              {generando ? "Generando el documento…" : `Confirmar emisión de ${v.version.idVersion}`}
            </Boton>
            <Boton onClick={() => setConfirmando(false)} disabled={generando}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <div className="formulario-acciones">
          <Boton
            variante="primario"
            onClick={() => setConfirmando(true)}
            disabled={!v.puedeEmitir}
            aria-disabled={!v.puedeEmitir}
            aria-describedby={motivoNo ? `${titulo}-motivo` : undefined}
          >
            Emitir {v.version.idVersion}…
          </Boton>
          <Boton onClick={recargar}>Volver a validar</Boton>
        </div>
      )}
      <div aria-live="polite" aria-busy={generando}>
        {generando ? <p className="ayuda">Generando y guardando el documento. No se anuncia nada hasta que el servidor lo confirme.</p> : null}
        {emision.fase === "bloqueada" ? (
          <Aviso tono="error" titulo={emision.mensaje} rol="alert">
            <ul className="lista-problemas">
              {emision.problemas.map((p, i) => (
                <li key={`${p.codigo}-${i}`}>
                  <Codigo>{p.codigo}</Codigo> {p.mensaje}
                </li>
              ))}
            </ul>
            <Boton onClick={() => (setEmision({ fase: "inactivo" }), recargar())}>Volver a validar</Boton>
          </Aviso>
        ) : null}
        {emision.fase === "conflicto" ? (
          <Aviso tono="error" titulo="El estado cambió: no se emitió" rol="alert">
            <p>{emision.mensaje}</p>
            <Boton variante="primario" onClick={() => (setEmision({ fase: "inactivo" }), setConfirmando(false), alActualizar())}>
              Actualizar
            </Boton>
          </Aviso>
        ) : null}
        {emision.fase === "error" ? (
          <Aviso tono="error" titulo="No se emitió" rol="alert">
            <p>{mensajeDeFallo(emision.fallo)}</p>
            <p className="ayuda">Puede reintentar: no se duplicará la emisión.</p>
            {REINTENTABLES.has(emision.fallo.tipo) ? <Boton onClick={() => void emitir()}>Reintentar (sin duplicar)</Boton> : null}
          </Aviso>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Emisión y documentos de una cotización: la última versión aprobada se puede emitir (si la sesión
 * puede); las emitidas muestran su documento. APROBADA y EMITIDA nunca se confunden.
 */
export function SeccionEmision({
  detalle,
  cotizaciones,
  puedeEmitir,
  alCambiar,
}: {
  detalle: DetalleCotizacion;
  cotizaciones: ServiciosCotizaciones;
  puedeEmitir: boolean;
  alCambiar: () => void;
}) {
  const emitidas = detalle.versiones.filter((v) => v.emision);
  const ultima = detalle.versiones[0] ?? null;
  const aprobadaSinEmitir = ultima && ultima.estado === "APROBADA" && detalle.cotizacion.estadoFolio === "ACTIVO" ? ultima : null;
  if (!aprobadaSinEmitir && emitidas.length === 0) return null;
  return (
    <section className="seccion seccion-emision" aria-labelledby="titulo-emision">
      <h2 id="titulo-emision" className="seccion-titulo">
        Emisión
      </h2>
      {aprobadaSinEmitir ? (
        puedeEmitir ? (
          <PanelEmision
            key={`${aprobadaSinEmitir.id}:${aprobadaSinEmitir.revisionVigente?.id ?? ""}`}
            cotizacionId={detalle.cotizacion.id}
            version={aprobadaSinEmitir}
            cotizaciones={cotizaciones}
            alEmitida={alCambiar}
            alActualizar={alCambiar}
          />
        ) : (
          <p className="ayuda">
            {aprobadaSinEmitir.idVersion} está aprobada y aún no se emite. Emiten un Preparador o un Revisor distinto de quien la preparó.
          </p>
        )
      ) : null}
      {emitidas.map((v) => (
        <div key={v.emision!.id} className="emision-con-seguimiento"><TarjetaEmision emision={v.emision!} cotizaciones={cotizaciones} /><PanelRespuesta emisionId={v.emision!.id} servicios={cotizaciones} /></div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Descarte
// ---------------------------------------------------------------------------

export function PanelDescarte({
  detalle,
  cotizaciones,
  alDescartada,
}: {
  detalle: DetalleCotizacion;
  cotizaciones: ServiciosCotizaciones;
  alDescartada: () => void;
}) {
  const intenciones = useIntenciones();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<{ fase: "inactivo" } | { fase: "enviando" } | { fase: "error"; fallo: FalloApi }>({ fase: "inactivo" });
  const c = detalle.cotizacion;
  if (c.estadoFolio !== "ACTIVO") return null;

  const descartar = async () => {
    if (estado.fase === "enviando") return;
    const m = motivo.trim();
    if (m.length < LIMITES_REVISIONES.minimoObservaciones || !/\p{L}/u.test(m)) {
      setError(`Explique por qué se descarta (al menos ${LIMITES_REVISIONES.minimoObservaciones} caracteres).`);
      return;
    }
    setError(null);
    setEstado({ fase: "enviando" });
    const contenido = { motivo: m };
    const r = await cotizaciones.descartarCotizacion(c.id, m, intenciones.clave(`descarte:${c.id}`, contenido));
    if (r.ok) {
      intenciones.olvidar(`descarte:${c.id}`, contenido);
      alDescartada();
      return;
    }
    if (!REINTENTABLES.has(r.fallo.tipo)) intenciones.olvidar(`descarte:${c.id}`, contenido);
    setEstado({ fase: "error", fallo: r.fallo });
  };

  return (
    <section className="seccion panel-descarte" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="seccion-titulo">
        Descartar la cotización
      </h2>
      {!detalle.descartar.permitido ? (
        <p className="ayuda">
          No se puede descartar ahora. {detalle.descartar.motivoNoPermitido}
        </p>
      ) : abierto ? (
        <div className="confirmacion-bloque" role="group" aria-labelledby={`${id}-confirmar`}>
          <p id={`${id}-confirmar`}>
            <strong>Descartar {c.folio} definitivamente.</strong> El folio no se reutiliza; las versiones y el historial se conservan y la cotización quedará
            en solo lectura.
          </p>
          <div className="campo">
            <label className="etiqueta" htmlFor={`${id}-motivo`}>
              Motivo del descarte <span className="ayuda">(obligatorio)</span>
            </label>
            <textarea
              id={`${id}-motivo`}
              rows={3}
              maxLength={LIMITES_EMISION.longitudMotivo}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error ? (
              <p className="error-campo" id={`${id}-error`} role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="formulario-acciones">
            <Boton variante="peligro" onClick={() => void descartar()} disabled={estado.fase === "enviando"} aria-disabled={estado.fase === "enviando"}>
              {estado.fase === "enviando" ? "Descartando…" : `Confirmar descarte de ${c.folio}`}
            </Boton>
            <Boton onClick={() => setAbierto(false)} disabled={estado.fase === "enviando"}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <Boton variante="peligro" onClick={() => setAbierto(true)}>
          Descartar la cotización…
        </Boton>
      )}
      {estado.fase === "error" ? (
        <Aviso tono="error" titulo="No se descartó" rol="alert">
          <p>{mensajeDeFallo(estado.fallo)}</p>
          {REINTENTABLES.has(estado.fallo.tipo) ? <Boton onClick={() => void descartar()}>Reintentar (sin duplicar)</Boton> : null}
        </Aviso>
      ) : null}
    </section>
  );
}

/** Aviso de cotización descartada (solo lectura). */
export function AvisoDescartada({ detalle }: { detalle: DetalleCotizacion }) {
  const d = detalle.cotizacion.descarte;
  if (!d) return null;
  return (
    <Aviso tono="aviso" titulo={`${detalle.cotizacion.folio} está descartada`} rol="status">
      <p>
        Descartada el {formatearInstante(d.en)} por {d.por}: <span className="observaciones">{d.motivo}</span>
      </p>
      <p className="ayuda">El folio no se reutiliza. Sus versiones, revisiones e historial se conservan y solo se consultan.</p>
    </Aviso>
  );
}

// ---------------------------------------------------------------------------
// Emisor
// ---------------------------------------------------------------------------

export function PantallaEmisor({ cotizaciones }: { cotizaciones: ServiciosCotizaciones }) {
  const { estado, recargar, setEstado } = useCarga((s) => cotizaciones.emisor(s), []);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando el emisor…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  return <VistaEmisor emisor={estado.datos} cotizaciones={cotizaciones} alGuardado={(e) => setEstado({ fase: "listo", datos: e })} alActualizar={recargar} />;
}

function VistaEmisor({
  emisor,
  cotizaciones,
  alGuardado,
  alActualizar,
}: {
  emisor: Emisor;
  cotizaciones: ServiciosCotizaciones;
  alGuardado: (e: Emisor) => void;
  alActualizar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState({
    nombre: emisor.nombre ?? "",
    domicilio: emisor.domicilio ?? "",
    telefono: emisor.telefono ?? "",
    correo: emisor.correo ?? "",
    logo: emisor.logo,
    motivo: "",
  });
  const [estado, setEstado] = useState<{ fase: "inactivo" } | { fase: "guardando" } | { fase: "guardado" } | { fase: "error"; fallo: FalloApi }>({
    fase: "inactivo",
  });
  const base = useId();
  const guardar = async () => {
    if (estado.fase === "guardando") return;
    setEstado({ fase: "guardando" });
    const vacio = (t: string) => (t.trim() === "" ? null : t.trim());
    const r = await cotizaciones.guardarEmisor({
      revision: emisor.revision,
      nombre: vacio(datos.nombre),
      domicilio: vacio(datos.domicilio),
      telefono: vacio(datos.telefono),
      correo: vacio(datos.correo),
      logo: datos.logo,
      motivo: datos.motivo.trim(),
    });
    if (r.ok) {
      setEstado({ fase: "guardado" });
      setEditando(false);
      alGuardado(r.datos);
    } else setEstado({ fase: "error", fallo: r.fallo });
  };
  const campo = (clave: "nombre" | "domicilio" | "telefono" | "correo", etiqueta: string, max: number, tipo: "text" | "tel" | "email" = "text") => (
    <div className="campo">
      <label className="etiqueta" htmlFor={`${base}-${clave}`}>
        {etiqueta}
      </label>
      <input id={`${base}-${clave}`} type={tipo} maxLength={max} value={datos[clave]} onChange={(e) => setDatos({ ...datos, [clave]: e.target.value })} />
    </div>
  );
  return (
    <Pagina
      titulo="Emisor"
      subtitulo="Datos de quien emite las cotizaciones (BL-15). Se copian a cada emisión: cambiarlos no altera documentos ya emitidos."
    >
      {emisor.esDemo ? (
        <Aviso tono="info" titulo="Datos ficticios de demostración">
          <p>Son los datos DEMO del libro (DEMO_EMISOR_*). No son de una empresa real.</p>
        </Aviso>
      ) : null}
      {emisor.faltantes.length > 0 ? (
        <Aviso tono="error" titulo="Datos incompletos: no se puede emitir (BL-15)">
          <p>Falta: {emisor.faltantes.join(", ")}.</p>
        </Aviso>
      ) : null}
      <div aria-live="polite">{estado.fase === "guardado" ? <Aviso tono="correcto" titulo="Datos del emisor guardados" rol="status" /> : null}</div>
      {!editando ? (
        <>
          <dl className="datos-cotizacion">
            <div>
              <dt>Nombre o razón social</dt>
              <dd>{emisor.nombre ?? "—"}</dd>
            </div>
            <div>
              <dt>Domicilio</dt>
              <dd>{emisor.domicilio ?? "—"}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{emisor.telefono ?? "—"}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{emisor.correo ?? "—"}</dd>
            </div>
            <div>
              <dt>Logotipo</dt>
              <dd>{emisor.logo === "DEMO" ? "Logotipo DEMO (recurso local)" : "Sin logotipo"}</dd>
            </div>
            <div>
              <dt>Última modificación</dt>
              <dd>{emisor.modificadoEn ? `${formatearInstante(emisor.modificadoEn)} · ${emisor.modificadoPor ?? "—"}` : "—"}</dd>
            </div>
          </dl>
          {emisor.editable ? (
            <Boton onClick={() => (setEstado({ fase: "inactivo" }), setEditando(true))}>Editar datos del emisor</Boton>
          ) : (
            <p className="ayuda">Los configura el Administrador del sistema.</p>
          )}
        </>
      ) : (
        <form
          className="formulario"
          noValidate
          aria-label="Datos del emisor"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          {campo("nombre", "Nombre o razón social", LIMITES_EMISION.longitudNombreEmisor)}
          {campo("domicilio", "Domicilio", LIMITES_EMISION.longitudDomicilio)}
          <div className="formulario-fila">
            {campo("telefono", "Teléfono", LIMITES_EMISION.longitudTelefono, "tel")}
            {campo("correo", "Correo", LIMITES_EMISION.longitudCorreo, "email")}
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor={`${base}-logo`}>
              Logotipo
            </label>
            <select id={`${base}-logo`} value={datos.logo ?? ""} onChange={(e) => setDatos({ ...datos, logo: e.target.value === "DEMO" ? "DEMO" : null })}>
              <option value="">Sin logotipo</option>
              <option value="DEMO">Logotipo DEMO (recurso local)</option>
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor={`${base}-motivo`}>
              Motivo del cambio <span className="ayuda">(obligatorio)</span>
            </label>
            <input id={`${base}-motivo`} type="text" maxLength={LIMITES_EMISION.longitudMotivo} value={datos.motivo} onChange={(e) => setDatos({ ...datos, motivo: e.target.value })} />
          </div>
          {estado.fase === "error" ? (
            <Aviso tono="error" titulo="No se guardó" rol="alert">
              <p>{estado.fallo.tipo === "invalida" ? estado.fallo.campos.map((c) => c.mensaje).join(" ") : mensajeDeFallo(estado.fallo)}</p>
              {estado.fallo.tipo === "conflicto" ? <Boton onClick={alActualizar}>Ver los datos vigentes</Boton> : null}
            </Aviso>
          ) : null}
          <div className="formulario-acciones">
            <Boton type="submit" variante="primario" disabled={estado.fase === "guardando"} aria-disabled={estado.fase === "guardando"}>
              {estado.fase === "guardando" ? "Guardando…" : "Guardar"}
            </Boton>
            <Boton variante="enlace" onClick={() => setEditando(false)} disabled={estado.fase === "guardando"}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
      <p className="ayuda">
        Ver también: <Enlace a={{ pantalla: "cotizaciones" }}>Cotizaciones</Enlace>
      </p>
    </Pagina>
  );
}
