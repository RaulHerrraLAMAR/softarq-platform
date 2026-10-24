import { router } from "expo-router";
import { useState } from "react";
import { useConsulta, useRetardado } from "../../../src/consultas/usar-consulta";
import { estaTruncada, listarProyectos } from "../../../src/consultas/servicios";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { ConSesion } from "../../../src/sesion/con-sesion";
import { useApi } from "../../../src/sesion/uso";
import { Aviso, Campo, Insignia, Tarjeta, Texto } from "../../../src/ui/componentes";
import { ListaConsulta } from "../../../src/ui/lista";
import { SinAcceso } from "../../../src/ui/sin-acceso";

export default function Proyectos() {
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).proyectos ? <ListaProyectos generacion={g} /> : <SinAcceso />)} />;
}

function ListaProyectos({ generacion }: { generacion: number }) {
  const api = useApi();
  const [texto, setTexto] = useState("");
  const buscar = useRetardado(texto).trim();
  const { estado, reintentar } = useConsulta(`proyectos|${generacion}|${buscar}`, (senal) => listarProyectos(api, { buscar }, senal));
  return (
    <ListaConsulta
      items={estado.datos?.proyectos ?? null}
      cargando={estado.fase === "cargando"}
      actualizando={estado.actualizando}
      error={estado.error}
      alReintentar={reintentar}
      pie={estaTruncada(estado.datos?.proyectos.length ?? 0) ? <Aviso texto="Se muestran los primeros resultados. Use la búsqueda para acotar y ver otros proyectos." /> : null}
      claveDe={(p) => p.id}
      textoVacio={buscar ? "Ningún proyecto coincide con la búsqueda." : "No hay proyectos registrados."}
      textoCargando="Cargando proyectos…"
      encabezado={<Campo etiqueta="Buscar proyecto" valor={texto} alCambiar={setTexto} enterKey="search" ayuda="Por nombre o código" />}
      renderItem={(p) => (
        <Tarjeta alPulsar={() => router.push({ pathname: "/proyecto/[id]", params: { id: p.id } })} etiqueta={`Proyecto ${p.nombre}, ${p.codigo}`}>
          <Texto variante="subtitulo">{p.nombre}</Texto>
          <Texto variante="codigo">{p.codigo}</Texto>
          <Texto variante="atenuado">Cliente: {p.cliente.nombre}</Texto>
          {p.municipio || p.entidadFederativa ? <Texto variante="atenuado">{[p.municipio, p.entidadFederativa].filter(Boolean).join(", ")}</Texto> : null}
          {!p.activo ? <Insignia texto="Inactivo" tono="aviso" /> : null}
        </Tarjeta>
      )}
    />
  );
}
