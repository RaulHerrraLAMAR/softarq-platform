/**
 * Piezas de consulta de cotizaciones (módulo 6): captura de solo lectura, versiones, cambios y
 * eventos. Solo muestran lo que entrega la API (proyección comercial y captura), sin cálculos.
 */
import type { CapturaBorrador, Evento, ResumenCambios, ResumenVersion } from "@softarq/contracts";
import { Codigo } from "../comunes/componentes.tsx";
import { EstadoVersion } from "./revisiones.tsx";
import { formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { Enlace } from "../navegacion/ruta.tsx";

export { EstadoVersion } from "./revisiones.tsx";

const NOMBRE_EVENTO: Record<string, string> = {
  COTIZACION_CREADA: "Cotización creada (folio reservado)",
  BORRADOR_GUARDADO: "Borrador guardado",
  VERSION_CREADA: "Versión calculada y guardada",
  CALCULO_BLOQUEADO: "Intento de versión bloqueado (sin guardar)",
  REVISION_ENVIADA: "Versión enviada a revisión",
  REVISION_RETIRADA: "Revisión retirada",
  CAMBIOS_SOLICITADOS: "Cambios solicitados por el revisor",
  VERSION_APROBADA: "Versión aprobada (no es emisión)",
  ENVIO_BLOQUEADO: "Intento de envío bloqueado (sin cambios)",
  APROBACION_BLOQUEADA: "Intento de aprobación bloqueado (sin cambios)",
  // Módulo 8 (ADR-0010).
  APROBACION_ANULADA: "Aprobación anulada antes de emitir",
  VERSION_EMITIDA: "Versión emitida (documento PDF DEMO)",
  EMISION_BLOQUEADA: "Intento de emisión bloqueado (sin emitir)",
  COTIZACION_DESCARTADA: "Cotización descartada",
};

function detalleEvento(e: Evento): string {
  const d = e.detalle;
  if (e.tipo === "BORRADOR_GUARDADO" && typeof d["revision"] === "number") return `revisión ${d["revision"]}`;
  if (e.tipo === "VERSION_CREADA" && typeof d["numero"] === "number") return `v${d["numero"]} desde la revisión ${String(d["revisionBorrador"])}`;
  if (e.tipo === "CALCULO_BLOQUEADO" && Array.isArray(d["codigos"])) return (d["codigos"] as unknown[]).join(", ");
  if (e.tipo === "COTIZACION_CREADA" && typeof d["folio"] === "string") return d["folio"];
  // Módulo 15 (ADR-0019).
  if (e.tipo === "COTIZACION_DUPLICADA" && typeof d["origenFolio"] === "string") {
    return `desde ${d["origenFolio"]}${typeof d["origenVersion"] === "number" ? `-v${d["origenVersion"]}` : ` (borrador, revisión ${String(d["origenRevision"])})`}`;
  }
  if (e.tipo === "NUEVA_VERSION_PREPARADA" && typeof d["versionOrigen"] === "number") {
    return `desde v${d["versionOrigen"]} · ${d["modo"] === "CONSERVAR" ? "conservar precios" : "elegir precios de nuevo"}`;
  }
  if (e.tipo === "VISTA_PREVIA" && typeof d["numero"] === "number") return `v${d["numero"]} (BORRADOR, sin emitir)`;
  if (typeof d["numero"] === "number" && /REVISION|CAMBIOS|APROBA|ENVIO|EMISION|EMITIDA/.test(e.tipo)) {
    const codigos = Array.isArray(d["codigos"]) ? ` · ${(d["codigos"] as unknown[]).join(", ")}` : "";
    return `v${d["numero"]}${codigos}`;
  }
  return "";
}

export function ListaEventos({ eventos }: { eventos: Evento[] }) {
  if (eventos.length === 0) return <p className="vacio">Sin eventos.</p>;
  return (
    <ol className="eventos">
      {eventos.map((e, i) => (
        <li key={`${e.ocurridoEn}-${i}`}>
          <span className="eventos-fecha">{formatearInstante(e.ocurridoEn)}</span> <strong>{NOMBRE_EVENTO[e.tipo] ?? e.tipo}</strong>
          {detalleEvento(e) ? <span className="ayuda"> · {detalleEvento(e)}</span> : null} <span className="ayuda">· {e.usuario}</span>
        </li>
      ))}
    </ol>
  );
}

export function TablaVersiones({ cotizacionId, versiones }: { cotizacionId: string; versiones: ResumenVersion[] }) {
  if (versiones.length === 0) {
    return <p className="vacio">Aún no hay versiones. Una versión se guarda al pulsar «Calcular y guardar versión».</p>;
  }
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-registros">
        <caption className="solo-lector">Versiones guardadas</caption>
        <thead>
          <tr>
            <th scope="col">Versión</th>
            <th scope="col">Estado</th>
            <th scope="col">Guardada</th>
            <th scope="col">Autor</th>
            <th scope="col">Revisión del borrador</th>
            <th scope="col" className="numero">
              Total
            </th>
            <th scope="col">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {versiones.map((v) => (
            <tr key={v.numero}>
              <td data-etiqueta="Versión">
                <Enlace a={{ pantalla: "version", id: cotizacionId, numero: v.numero }}>
                  <span className="codigo">{v.idVersion}</span>
                </Enlace>
              </td>
              <td data-etiqueta="Estado">
                <EstadoVersion version={v} />
                {v.revisionVigente ? (
                  <span className="bloque">
                    <Enlace a={{ pantalla: "revision", id: v.revisionVigente.id }}>Ver revisión</Enlace>
                  </span>
                ) : null}
              </td>
              <td data-etiqueta="Guardada">{formatearInstante(v.creadoEn)}</td>
              <td data-etiqueta="Autor">{v.autor}</td>
              <td data-etiqueta="Revisión">{v.revisionBorrador}</td>
              <td data-etiqueta="Total" className="numero">
                {formatearImporte(v.total, "MXN")}
              </td>
              <td data-etiqueta="Motivo">{v.motivo ?? <span className="ayuda">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NOMBRE_DATO: Record<string, string> = {
  "cliente.nombre": "nombre del cliente",
  "proyecto.nombre": "nombre del proyecto",
  "proyecto.ubicacion": "ubicación del proyecto",
  "proyecto.descripcion": "descripción del proyecto",
};

export function CambiosVersion({ cambios }: { cambios: ResumenCambios }) {
  if (cambios.versionAnterior === null) return <p className="ayuda">Primera versión de la cotización.</p>;
  const lineas: string[] = [];
  if (cambios.partidasAgregadas.length) lineas.push(`Partidas agregadas: ${cambios.partidasAgregadas.join("; ")}.`);
  if (cambios.partidasQuitadas.length) lineas.push(`Partidas quitadas: ${cambios.partidasQuitadas.join("; ")}.`);
  if (cambios.partidasModificadas.length) lineas.push(`Partidas modificadas: ${cambios.partidasModificadas.join("; ")}.`);
  if (cambios.seleccionCambiada.length) lineas.push(`Opción de precio distinta para: ${cambios.seleccionCambiada.join(", ")}.`);
  if (cambios.consolidacionCambiada) lineas.push("Cambió la decisión de consolidar compras.");
  if (cambios.datosDescriptivosCambiados.length) {
    lineas.push(`Datos descriptivos actualizados: ${cambios.datosDescriptivosCambiados.map((d) => NOMBRE_DATO[d] ?? d).join(", ")}.`);
  }
  if (cambios.condicionesCambiadas) lineas.push("Condiciones de referencia distintas: cambiaron los datos vigentes del catálogo o las opciones elegidas.");
  if (lineas.length === 0) lineas.push("Misma captura y mismas condiciones que la versión anterior (recálculo).");
  return (
    <div className="cambios">
      <p>
        Frente a la v{cambios.versionAnterior}: total {cambios.totalAnterior ? formatearImporte(cambios.totalAnterior, "MXN") : "—"} →{" "}
        <strong>{formatearImporte(cambios.totalNuevo, "MXN")}</strong>
      </p>
      <ul>
        {lineas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function medidas(m: CapturaBorrador["partidas"][number] & { tipo: "CONCEPTO" }): string {
  return m.mediciones
    .map((r) => {
      const partes = [`${r.signo === "-" ? "− " : ""}${r.piezas ?? "¿?"} pza`];
      if (r.largo !== null) partes.push(`largo ${r.largo}`);
      if (r.ancho !== null) partes.push(`ancho ${r.ancho}`);
      if (r.alto !== null) partes.push(`alto ${r.alto}`);
      return `${partes.join(" × ")}${r.descripcion ? ` (${r.descripcion})` : ""}`;
    })
    .join("; ");
}

/** Captura de solo lectura (borrador o versión): lo capturado, sin resultados calculados. */
export function ResumenCaptura({ captura, titulo }: { captura: CapturaBorrador; titulo: string }) {
  return (
    <section className="seccion" aria-label={titulo}>
      <h2 className="seccion-titulo">{titulo}</h2>
      <p className="ayuda">
        Compras de insumos:{" "}
        {captura.consolidarCompras === null ? "sin decidir" : captura.consolidarCompras ? "consolidadas por insumo" : "por partida"}
      </p>
      {captura.partidas.length === 0 ? (
        <p className="vacio">Sin partidas capturadas.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla tabla-registros">
            <caption className="solo-lector">{titulo}</caption>
            <thead>
              <tr>
                <th scope="col">Núm.</th>
                <th scope="col">Partida</th>
                <th scope="col">Captura</th>
              </tr>
            </thead>
            <tbody>
              {captura.partidas.map((p, i) => (
                <tr key={i}>
                  <td data-etiqueta="Núm.">{i + 1}</td>
                  <td data-etiqueta="Partida">
                    {p.tipo === "CONCEPTO" ? <Codigo>{p.conceptoCodigo}</Codigo> : <Codigo>{p.tipoAdicionalCodigo ?? "sin tipo"}</Codigo>}{" "}
                    {p.descripcion.trim() || (p.tipo === "CONCEPTO" ? "(descripción del concepto)" : <span className="ayuda">sin descripción</span>)}
                  </td>
                  <td data-etiqueta="Captura">
                    {p.tipo === "CONCEPTO"
                      ? medidas(p) || <span className="ayuda">sin medidas</span>
                      : `cantidad ${p.cantidad ?? "sin capturar"} · monto capturado ${p.monto ?? "sin capturar"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {captura.seleccion.length > 0 ? (
        <p className="ayuda">
          Opciones elegidas: {captura.seleccion.map((s) => `${s.insumoCodigo} → ${s.precioCodigo}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

