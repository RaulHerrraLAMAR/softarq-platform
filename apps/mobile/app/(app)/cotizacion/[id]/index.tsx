import type { DetalleCotizacion } from "@softarq/contracts/movil";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useConsulta } from "../../../../src/consultas/usar-consulta";
import { detalleCotizacion } from "../../../../src/consultas/servicios";
import { seccionesDe } from "../../../../src/navegacion/capacidades";
import { ConSesion } from "../../../../src/sesion/con-sesion";
import { useApi } from "../../../../src/sesion/uso";
import { Aviso, Dato, Insignia, Seccion, Tarjeta, Texto } from "../../../../src/ui/componentes";
import { Detalle } from "../../../../src/ui/detalle";
import { ESTADO_FOLIO, NOMBRE_EVENTO_REVISION, estadoDeVersion, nombreDeEvento } from "../../../../src/ui/etiquetas";
import { formatearImporte, formatearInstante } from "../../../../src/ui/formato";
import { SinAcceso } from "../../../../src/ui/sin-acceso";
import { ESP } from "../../../../src/ui/tema";

export default function CotizacionDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).cotizaciones ? <Contenido id={id ?? ""} generacion={g} /> : <SinAcceso />)} />;
}

function Contenido({ id, generacion }: { id: string; generacion: number }) {
  const api = useApi();
  const { estado, reintentar } = useConsulta(`cotizacion|${generacion}|${id}`, (senal) => detalleCotizacion(api, id, senal));
  return (
    <Detalle estado={estado} alReintentar={reintentar} textoCargando="Cargando la cotización…">
      {(d) => <Cuerpo d={d} />}
    </Detalle>
  );
}

/** Solo consulta comercial: versiones, estados e historial de revisión y eventos. No muestra el borrador ni datos internos. */
function Cuerpo({ d }: { d: DetalleCotizacion }) {
  const c = d.cotizacion;
  return (
    <>
      <Tarjeta>
        <Texto variante="titulo">{c.folio}</Texto>
        {c.estadoFolio === "DESCARTADO" ? <Insignia texto={ESTADO_FOLIO.DESCARTADO.texto} tono="error" /> : <Insignia texto={ESTADO_FOLIO.ACTIVO.texto} />}
        <Dato etiqueta="Cliente" valor={c.cliente.nombre} />
        <Dato etiqueta="Proyecto" valor={c.proyecto.nombre} />
        <Dato etiqueta="Creada" valor={`${formatearInstante(c.creadoEn)} por ${c.creadoPor}`} />
        {d.duplicadaDe ? <Dato etiqueta="Duplicada de" valor={`${d.duplicadaDe.folio}${d.duplicadaDe.version ? ` v${d.duplicadaDe.version}` : " (borrador)"}`} /> : null}
      </Tarjeta>
      {c.descarte ? <Aviso tono="error" texto={`Descartada por ${c.descarte.por} el ${formatearInstante(c.descarte.en)}. Motivo: ${c.descarte.motivo}`} /> : null}

      <Seccion titulo={`Versiones (${d.versiones.length})`}>
        {d.versiones.length === 0 ? <Texto variante="atenuado">Aún no hay versiones calculadas.</Texto> : null}
        {d.versiones.map((v) => {
          const e = estadoDeVersion(v);
          return (
            <Tarjeta key={v.numero} alPulsar={() => router.push({ pathname: "/cotizacion/[id]/version/[numero]", params: { id: c.id, numero: String(v.numero) } })} etiqueta={`Versión ${v.idVersion}, ${e.texto}, total ${formatearImporte(v.total)}`}>
              <Texto variante="codigo">{v.idVersion}</Texto>
              <Insignia texto={e.texto} tono={e.tono} />
              <Texto variante="subtitulo">{formatearImporte(v.total)}</Texto>
              <Texto variante="atenuado">
                Guardada el {formatearInstante(v.creadoEn)} por {v.autor}
              </Texto>
              {v.motivo ? <Texto variante="atenuado">Motivo: {v.motivo}</Texto> : null}
            </Tarjeta>
          );
        })}
      </Seccion>

      <Seccion titulo="Revisiones">
        {d.revisiones.length === 0 ? <Texto variante="atenuado">Ninguna versión se ha enviado a revisión.</Texto> : null}
        {d.revisiones.map((r) => (
          <Tarjeta key={r.id}>
            <Texto variante="etiqueta">Versión {r.versionNumero}</Texto>
            <View style={{ gap: ESP[2] }}>
              {r.eventos.map((e) => (
                <View key={e.secuencia} accessible style={{ gap: 2 }}>
                  <Texto>
                    {NOMBRE_EVENTO_REVISION[e.tipo]} · {e.usuario}
                  </Texto>
                  <Texto variante="atenuado">{formatearInstante(e.ocurridoEn)}</Texto>
                  {e.observaciones ? <Texto variante="atenuado">«{e.observaciones}»</Texto> : null}
                </View>
              ))}
            </View>
          </Tarjeta>
        ))}
      </Seccion>

      <Seccion titulo="Eventos recientes">
        {d.eventos.length === 0 ? <Texto variante="atenuado">Sin eventos.</Texto> : null}
        {d.eventos.slice(0, 20).map((e, i) => (
          <View key={`${e.ocurridoEn}-${i}`} accessible style={{ gap: 2 }}>
            <Texto>{nombreDeEvento(e.tipo)}</Texto>
            <Texto variante="atenuado">
              {formatearInstante(e.ocurridoEn)} · {e.usuario}
            </Texto>
          </View>
        ))}
      </Seccion>
    </>
  );
}
