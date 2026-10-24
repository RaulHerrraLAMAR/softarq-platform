import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useConsulta, useRetardado } from "../../../src/consultas/usar-consulta";
import { estaTruncada, listarCotizaciones } from "../../../src/consultas/servicios";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { ConSesion } from "../../../src/sesion/con-sesion";
import { useApi } from "../../../src/sesion/uso";
import { Aviso, Boton, Campo, Insignia, Tarjeta, Texto } from "../../../src/ui/componentes";
import { ESTADO_FOLIO, estadoDeVersion } from "../../../src/ui/etiquetas";
import { formatearFecha, formatearImporte } from "../../../src/ui/formato";
import { ListaConsulta } from "../../../src/ui/lista";
import { SinAcceso } from "../../../src/ui/sin-acceso";
import { ESP } from "../../../src/ui/tema";

export default function Cotizaciones() {
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).cotizaciones ? <ListaCotizaciones generacion={g} /> : <SinAcceso />)} />;
}

function ListaCotizaciones({ generacion }: { generacion: number }) {
  const api = useApi();
  // Filtros opcionales que llegan desde el detalle de un cliente o de un proyecto.
  const { clienteId, proyectoId } = useLocalSearchParams<{ clienteId?: string; proyectoId?: string }>();
  const [texto, setTexto] = useState("");
  const buscar = useRetardado(texto).trim();
  const { estado, reintentar } = useConsulta(`cotizaciones|${generacion}|${buscar}|${clienteId ?? ""}|${proyectoId ?? ""}`, (senal) =>
    listarCotizaciones(api, { buscar, clienteId, proyectoId }, senal),
  );
  const filtrado = Boolean(clienteId || proyectoId);
  return (
    <ListaConsulta
      items={estado.datos?.cotizaciones ?? null}
      cargando={estado.fase === "cargando"}
      actualizando={estado.actualizando}
      error={estado.error}
      alReintentar={reintentar}
      pie={estaTruncada(estado.datos?.cotizaciones.length ?? 0) ? <Aviso texto="Se muestran los primeros resultados. Use la búsqueda para acotar y ver otras cotizaciones." /> : null}
      claveDe={(c) => c.id}
      textoVacio={buscar || filtrado ? "Ninguna cotización coincide." : "No hay cotizaciones."}
      textoCargando="Cargando cotizaciones…"
      encabezado={
        <View style={{ gap: ESP[3] }}>
          {filtrado ? (
            <View style={{ gap: ESP[2] }}>
              <Aviso texto={clienteId ? "Mostrando las cotizaciones de un cliente." : "Mostrando las cotizaciones de un proyecto."} />
              <Boton texto="Quitar el filtro" variante="secundario" alPulsar={() => router.setParams({ clienteId: undefined, proyectoId: undefined })} />
            </View>
          ) : null}
          <Campo etiqueta="Buscar cotización" valor={texto} alCambiar={setTexto} enterKey="search" ayuda="Por folio, cliente o proyecto" />
        </View>
      }
      renderItem={(c) => {
        const v = c.ultimaVersion;
        const e = v ? estadoDeVersion(v) : null;
        return (
          <Tarjeta alPulsar={() => router.push({ pathname: "/cotizacion/[id]", params: { id: c.id } })} etiqueta={`Cotización ${c.folio}`}>
            <Texto variante="subtitulo">{c.folio}</Texto>
            <Texto>{c.cliente.nombre}</Texto>
            <Texto variante="atenuado">{c.proyecto.nombre}</Texto>
            {c.estadoFolio === "DESCARTADO" ? <Insignia texto={ESTADO_FOLIO.DESCARTADO.texto} tono="error" /> : null}
            {v && e ? (
              <View style={{ gap: ESP[1], marginTop: ESP[1] }}>
                <Texto variante="codigo">{v.idVersion}</Texto>
                <Insignia texto={e.texto} tono={e.tono} />
                <Texto variante="subtitulo">{formatearImporte(v.total)}</Texto>
                <Texto variante="atenuado">Calculada el {formatearFecha(v.fechaCalculo)}</Texto>
              </View>
            ) : (
              <Texto variante="atenuado">Sin versiones calculadas (solo borrador).</Texto>
            )}
          </Tarjeta>
        );
      }}
    />
  );
}
