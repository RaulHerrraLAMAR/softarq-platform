/**
 * Piezas comunes de la administración de catálogos (módulos 11 y 12): búsqueda, historial,
 * confirmación, envío que conserva lo escrito, textos de modalidad e importe de una tarifa y la
 * asignación de tarifa a un concepto (Word §3.5). Se separaron de `PantallasCatalogo.tsx` sin cambiar
 * su comportamiento para reutilizarlas en el catálogo técnico (`catalogo-tecnico/`).
 */
import { LIMITES_CATALOGO_ADMIN, type ConceptoTarifaAdmin, type EventoCatalogo, type ModalidadManoObra } from "@softarq/contracts";
import { useState, type ReactNode } from "react";
import type { FalloApi, ResultadoApi } from "../api/cliente.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";
import { formatearFecha, formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { AvisoFallo, CampoSeleccion, CampoTexto, errorDe } from "./campos.tsx";
import type { ServiciosCatalogoAdmin } from "./servicios.ts";

export const TEXTO_MODALIDAD: Record<ModalidadManoObra, string> = {
  UNIDAD: "Por unidad del concepto",
  JORNADA: "Por jornada de cuadrilla",
  SUBCONTRATO: "Precio de subcontrato",
};

/** Importe interno con al menos dos decimales, sin pasar por `number` ("13.7" → "$13.70"). */
export const mxn = (t: string) => {
  const m = /^(-?\d+)(?:\.(\d*))?$/.exec(t);
  return formatearImporte(m ? `${m[1]}.${(m[2] ?? "").padEnd(2, "0")}` : t, "MXN");
};
export const vigencia = (desde: string, hasta: string) => `${formatearFecha(desde)} a ${formatearFecha(hasta)}`;
export const opcional = (t: string) => (t.trim() === "" ? null : t.trim());

export const textoImporteTarifa = (t: { modalidad: ModalidadManoObra; importe: string; unidad: string }) =>
  t.modalidad === "JORNADA" ? `${mxn(t.importe)} / jornada` : `${mxn(t.importe)} / ${t.unidad}`;

export function Busqueda({ etiqueta, alBuscar, children }: { etiqueta: string; alBuscar: (t: string) => void; children?: ReactNode }) {
  const [texto, setTexto] = useState("");
  return (
    <form
      className="barra-busqueda"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        alBuscar(texto.trim());
      }}
    >
      <label className="etiqueta" htmlFor="buscar-catalogo">
        {etiqueta}
      </label>
      <div className="entrada-con-accion">
        <input id="buscar-catalogo" type="search" value={texto} maxLength={LIMITES_CATALOGO_ADMIN.longitudBusqueda} onChange={(e) => setTexto(e.target.value)} />
        <Boton type="submit">Buscar</Boton>
      </div>
      {children}
    </form>
  );
}

export function Historial({ eventos }: { eventos: EventoCatalogo[] }) {
  if (eventos.length === 0) return <p className="ayuda">Sin cambios registrados desde la carga DEMO.</p>;
  return (
    <ul className="lista-historial" aria-label="Historial de cambios">
      {eventos.map((e, i) => (
        <li key={`${e.tipo}-${e.ocurridoEn}-${i}`}>
          <strong>{textoEvento(e.tipo)}</strong> · {formatearInstante(e.ocurridoEn)} · {e.usuario}
          {detalleEvento(e)}
        </li>
      ))}
    </ul>
  );
}

const TEXTOS_EVENTO: Record<string, string> = {
  PROVEEDOR_CREADO: "Alta",
  PROVEEDOR_EDITADO: "Edición",
  PROVEEDOR_DESACTIVADO: "Desactivado",
  PROVEEDOR_REACTIVADO: "Reactivado",
  PRODUCTO_CREADO: "Alta",
  PRODUCTO_EDITADO: "Edición",
  PRODUCTO_DESACTIVADO: "Desactivado",
  PRODUCTO_REACTIVADO: "Reactivado",
  PRECIO_REGISTRADO: "Registrado",
  PRECIO_ANULADO: "Anulado por error de captura",
  PRECIO_VIGENCIA_CERRADA: "Vigencia cerrada con sucesor",
  TARIFA_REGISTRADA: "Registrada",
  TARIFA_DESACTIVADA: "Desactivada",
  TARIFA_REACTIVADA: "Reactivada",
  CONCEPTO_TARIFA_ASIGNADA: "Tarifa asignada",
  // Módulo 12 (ADR-0016): catálogo técnico.
  TIPO_ESTRUCTURA_CREADO: "Alta",
  TIPO_ESTRUCTURA_EDITADO: "Edición",
  TIPO_ESTRUCTURA_DESACTIVADO: "Desactivado",
  TIPO_ESTRUCTURA_REACTIVADO: "Reactivado",
  INSUMO_CREADO: "Alta",
  INSUMO_EDITADO: "Edición",
  INSUMO_DESACTIVADO: "Desactivado",
  INSUMO_REACTIVADO: "Reactivado",
  CONVERSION_REGISTRADA: "Conversión registrada",
  CONVERSION_EDITADA: "Conversión editada",
  CONCEPTO_CREADO: "Alta en Borrador",
  CONCEPTO_EDITADO: "Edición",
  CONCEPTO_APROBADO: "Aprobado",
  CONCEPTO_A_BORRADOR: "Vuelve a Borrador",
  CONCEPTO_DESACTIVADO: "Desactivado",
  CONCEPTO_REACTIVADO: "Reactivado",
  COMPONENTE_CREADO: "Componente agregado",
  COMPONENTE_EDITADO: "Componente editado",
  COMPONENTE_DESACTIVADO: "Componente desactivado",
  COMPONENTE_REACTIVADO: "Componente reactivado",
};
const textoEvento = (tipo: string) => TEXTOS_EVENTO[tipo] ?? tipo;

function detalleEvento(e: EventoCatalogo): ReactNode {
  const d = e.detalle as Record<string, unknown>;
  const partes: string[] = [];
  if (Array.isArray(d["campos"])) partes.push(`campos: ${(d["campos"] as unknown[]).join(", ")}`);
  if (typeof d["hastaAnterior"] === "string" && typeof d["hastaNueva"] === "string") {
    partes.push(`fin ${formatearFecha(d["hastaAnterior"])} → ${formatearFecha(d["hastaNueva"])}`);
  }
  if (typeof d["sucesor"] === "string") partes.push(`sucesor ${d["sucesor"]}`);
  if (typeof d["sucesorDe"] === "string") partes.push(`sucesor de ${d["sucesorDe"]}`);
  if (typeof d["tarifaNueva"] === "string") partes.push(`${typeof d["tarifaAnterior"] === "string" ? d["tarifaAnterior"] : "sin tarifa"} → ${d["tarifaNueva"]}`);
  if (typeof d["factorAnterior"] === "string" && typeof d["factorNuevo"] === "string") partes.push(`factor ${d["factorAnterior"]} → ${d["factorNuevo"]}`);
  if (Array.isArray(d["conceptosABorrador"]) && d["conceptosABorrador"].length > 0) partes.push(`vuelven a Borrador: ${(d["conceptosABorrador"] as unknown[]).join(", ")}`);
  if (typeof d["revisionTecnica"] === "number") partes.push(`revisión técnica ${d["revisionTecnica"]}`);
  if (d["completadoHeredado"] === true) partes.push("completa los datos de la carga anterior");
  if (typeof d["motivo"] === "string") partes.push(`motivo: ${d["motivo"]}`);
  return partes.length > 0 ? <span className="ayuda bloque">{partes.join(" · ")}</span> : null;
}

export function Confirmacion({ texto, accion, variante = "peligro", alConfirmar, alCancelar, ocupado }: { texto: string; accion: string; variante?: "peligro" | "primario"; alConfirmar: () => void; alCancelar: () => void; ocupado: boolean }) {
  return (
    <div className="confirmacion" role="group" aria-label={`Confirmar: ${accion}`}>
      <span>{texto}</span>
      <Boton variante={variante} onClick={alConfirmar} disabled={ocupado} aria-disabled={ocupado}>
        {ocupado ? "Guardando…" : accion}
      </Boton>
      <Boton onClick={alCancelar} autoFocus disabled={ocupado}>
        Cancelar
      </Boton>
    </div>
  );
}

/** Envío de un formulario con estado y fallo; conserva lo escrito si falla. */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const ejecutar = async <T,>(accion: () => Promise<ResultadoApi<T>>): Promise<ResultadoApi<T> | null> => {
    if (enviando) return null;
    setEnviando(true);
    setFallo(null);
    const r = await accion();
    setEnviando(false);
    if (!r.ok && r.fallo.tipo !== "cancelado") setFallo(r.fallo);
    return r;
  };
  return { enviando, fallo, setFallo, ejecutar };
}

export function Acciones({ enviando, texto, alCancelar }: { enviando: boolean; texto: string; alCancelar?: () => void }) {
  return (
    <div className="formulario-acciones">
      <Boton type="submit" variante="primario" disabled={enviando} aria-disabled={enviando}>
        {enviando ? "Guardando…" : texto}
      </Boton>
      {alCancelar ? (
        <Boton variante="enlace" onClick={alCancelar} disabled={enviando}>
          Cancelar
        </Boton>
      ) : null}
    </div>
  );
}

export function FormularioAsignacion({ concepto, servicios, alAsignada, alRecargar }: { concepto: ConceptoTarifaAdmin; servicios: ServiciosCatalogoAdmin; alAsignada: (m: string) => void; alRecargar: () => void }) {
  const tarifas = useCarga((s) => servicios.listarTarifas({ unidad: concepto.unidad }, s), [concepto.unidad]);
  const [nueva, setNueva] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  if (tarifas.estado.fase === "cargando") return <Cargando etiqueta="Cargando tarifas de la misma unidad…" />;
  if (tarifas.estado.fase === "error") return <CargaFallida fallo={tarifas.estado.fallo} alReintentar={tarifas.recargar} />;
  const opciones = tarifas.estado.datos.tarifas.filter((t) => t.codigo !== concepto.tarifa?.codigo);
  const corto = motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo;
  const cuerpo = { tarifaActual: concepto.tarifa?.codigo ?? null, tarifaNueva: nueva, motivo: motivo.trim() };
  const elegida = opciones.find((t) => t.codigo === nueva);
  const ejecutar = async () => {
    const r = await envio.ejecutar(() => servicios.asignarTarifa(concepto.codigo, cuerpo, intenciones.clave(`tarifa:${concepto.codigo}`, cuerpo)));
    setConfirmar(false);
    if (r?.ok) {
      intenciones.olvidar(`tarifa:${concepto.codigo}`, cuerpo);
      alAsignada(`Tarifa ${nueva} asignada a ${concepto.codigo}. Las cotizaciones abiertas deben recalcular.`);
    }
  };
  return (
    <form
      className="formulario"
      noValidate
      aria-label={`Asignar tarifa a ${concepto.codigo}`}
      onSubmit={(e) => {
        e.preventDefault();
        setIntentado(true);
        if (nueva && !corto) setConfirmar(true);
      }}
    >
      <p className="formulario-titulo">Asignar tarifa a {concepto.codigo}</p>
      {opciones.length === 0 ? (
        <Aviso tono="info" titulo={`No hay otras tarifas activas en ${concepto.unidad}`}>
          <p>Registre una tarifa en la unidad del concepto en «Mano de obra».</p>
        </Aviso>
      ) : (
        <CampoSeleccion
          etiqueta={`Tarifa nueva (activas en ${concepto.unidad})`}
          valor={nueva}
          alCambiar={setNueva}
          obligatorio
          opciones={opciones.map((t) => ({ valor: t.codigo, texto: `${t.codigo} · ${TEXTO_MODALIDAD[t.modalidad]} · ${textoImporteTarifa(t)}${t.vigenteHoy ? "" : " · no vigente hoy"}` }))}
          error={intentado && !nueva ? "Seleccione la tarifa." : errorDe(envio.fallo, "tarifaNueva")}
        />
      )}
      <CampoTexto
        etiqueta="Motivo"
        valor={motivo}
        alCambiar={setMotivo}
        max={LIMITES_CATALOGO_ADMIN.longitudMotivo}
        obligatorio
        multilinea
        error={intentado && corto ? `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).` : errorDe(envio.fallo, "motivo")}
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={`${concepto.codigo} pasará de ${concepto.tarifa?.codigo ?? "sin tarifa"} a ${nueva}${elegida && !elegida.vigenteHoy ? " (no vigente hoy: el cálculo la bloqueará fuera de su vigencia, BL-10)" : ""}. La aprobación técnica del concepto se conserva. ${
            concepto.borradoresAbiertos > 0
              ? `${concepto.borradoresAbiertos} cotización(es) abierta(s) lo usan: deberán recalcular, y sus versiones ya calculadas no podrán enviarse ni aprobarse sin una versión nueva (BL-16).`
              : "Ninguna cotización abierta lo usa."
          } Las versiones y los PDF emitidos conservan su tarifa.`}
          accion="Asignar tarifa"
          variante="primario"
          alConfirmar={() => void ejecutar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : opciones.length > 0 ? (
        <Acciones enviando={envio.enviando} texto="Revisar y confirmar" />
      ) : null}
    </form>
  );
}
