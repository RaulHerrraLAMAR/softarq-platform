import type { Version } from "@softarq/contracts/movil";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useConsulta } from "../../../../../src/consultas/usar-consulta";
import { versionCotizacion } from "../../../../../src/consultas/servicios";
import { seccionesDe } from "../../../../../src/navegacion/capacidades";
import { ConSesion } from "../../../../../src/sesion/con-sesion";
import { useApi } from "../../../../../src/sesion/uso";
import { Aviso, Dato, Insignia, MarcaDemo, Seccion, Tarjeta, Texto } from "../../../../../src/ui/componentes";
import { Detalle } from "../../../../../src/ui/detalle";
import { estadoDeVersion, lineasDeCambios } from "../../../../../src/ui/etiquetas";
import { formatearCantidad, formatearFecha, formatearImporte, formatearInstante, formatearTasa } from "../../../../../src/ui/formato";
import { SinAcceso } from "../../../../../src/ui/sin-acceso";
import { ESP } from "../../../../../src/ui/tema";

export default function VersionDetalle() {
  const { id, numero } = useLocalSearchParams<{ id: string; numero: string }>();
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).cotizaciones ? <Contenido id={id ?? ""} numero={numero ?? ""} generacion={g} /> : <SinAcceso />)} />;
}

function Contenido({ id, numero, generacion }: { id: string; numero: string; generacion: number }) {
  const api = useApi();
  const { estado, reintentar } = useConsulta(`version|${generacion}|${id}|${numero}`, (senal) => versionCotizacion(api, id, numero, senal));
  return (
    <Detalle estado={estado} alReintentar={reintentar} textoCargando="Cargando la versión…">
      {(v) => <Cuerpo v={v} />}
    </Detalle>
  );
}

/** Versión guardada tal como se calculó: solo la proyección comercial (la API no entrega costos ni márgenes). */
function Cuerpo({ v }: { v: Version }) {
  const e = estadoDeVersion(v.version);
  const q = v.cotizacion;
  const em = v.version.emision;
  return (
    <>
      <MarcaDemo esDemo={q.ambiente === "DEMO"} />
      {q.leyenda ? <Texto variante="atenuado">{q.leyenda}</Texto> : null}
      <Tarjeta>
        <Texto variante="titulo">{v.version.idVersion}</Texto>
        <Insignia texto={e.texto} tono={e.tono} />
        <Dato etiqueta="Cliente" valor={v.cliente.nombre} />
        <Dato etiqueta="Proyecto" valor={v.proyecto.nombre} />
        {v.proyecto.ubicacion ? <Dato etiqueta="Ubicación" valor={v.proyecto.ubicacion} /> : null}
        {v.proyecto.descripcion ? <Dato etiqueta="Descripción" valor={v.proyecto.descripcion} /> : null}
        <Dato etiqueta="Calculada el" valor={formatearFecha(v.version.fechaCalculo)} />
        <Dato etiqueta="Guardada" valor={`${formatearInstante(v.version.creadoEn)} por ${v.version.autor}`} />
        {v.version.motivo ? <Dato etiqueta="Motivo" valor={v.version.motivo} /> : null}
      </Tarjeta>

      {em ? (
        <Aviso
          tono="info"
          texto={`Emitida el ${formatearFecha(em.fechaEmision)} por ${em.emitidoPor} (preparó ${em.preparadoPor}, aprobó ${em.aprobadoPor}). Vigente hasta ${formatearFecha(em.vigenteHasta)}.`}
        />
      ) : null}

      <Seccion titulo={`Partidas (${q.partidas.length})`}>
        {q.partidas.map((p) => (
          <Tarjeta key={p.numero}>
            <Texto variante="etiqueta">Partida {p.numero}</Texto>
            <Texto>{p.descripcion}</Texto>
            <Texto variante="atenuado">
              {formatearCantidad(p.cantidad)} {p.unidad} × {formatearImporte(p.precioUnitario)}
            </Texto>
            <Texto variante="subtitulo">{formatearImporte(p.importe)}</Texto>
          </Tarjeta>
        ))}
      </Seccion>

      <Seccion titulo="Totales">
        <Tarjeta>
          <Fila etiqueta="Subtotal" valor={formatearImporte(q.subtotal)} />
          <Fila etiqueta={`${q.impuesto.nombre} (${formatearTasa(q.impuesto.tasa)})`} valor={formatearImporte(q.impuesto.importe)} />
          <Fila etiqueta="Total" valor={formatearImporte(q.total)} fuerte />
        </Tarjeta>
      </Seccion>

      {v.avisos.length > 0 ? (
        <Seccion titulo="Avisos">
          {v.avisos.map((a) => (
            <Aviso key={a.codigo} tono="aviso" texto={`${a.codigo}: ${a.mensaje}`} />
          ))}
        </Seccion>
      ) : null}

      <Seccion titulo="Cambios frente a la versión anterior">
        <Tarjeta>
          {v.cambios.versionAnterior !== null ? (
            <Texto>
              Frente a la v{v.cambios.versionAnterior}: {v.cambios.totalAnterior ? formatearImporte(v.cambios.totalAnterior) : "—"} → {formatearImporte(v.cambios.totalNuevo)}
            </Texto>
          ) : null}
          <View style={{ gap: ESP[1] }}>
            {lineasDeCambios(v.cambios).map((l) => (
              <Texto key={l} variante="atenuado">
                • {l}
              </Texto>
            ))}
          </View>
        </Tarjeta>
      </Seccion>
    </>
  );
}

function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${etiqueta}: ${valor}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: ESP[3] }}>
      <Texto variante={fuerte ? "subtitulo" : "cuerpo"}>{etiqueta}</Texto>
      <Texto variante={fuerte ? "subtitulo" : "cuerpo"}>{valor}</Texto>
    </View>
  );
}
