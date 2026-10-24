import { router } from "expo-router";
import { useState } from "react";
import { useConsulta, useRetardado } from "../../../src/consultas/usar-consulta";
import { estaTruncada, listarClientes } from "../../../src/consultas/servicios";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { ConSesion } from "../../../src/sesion/con-sesion";
import { useApi } from "../../../src/sesion/uso";
import { Aviso, Campo, Insignia, Tarjeta, Texto } from "../../../src/ui/componentes";
import { ListaConsulta } from "../../../src/ui/lista";
import { SinAcceso } from "../../../src/ui/sin-acceso";

export default function Clientes() {
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).clientes ? <ListaClientes generacion={g} /> : <SinAcceso />)} />;
}

function ListaClientes({ generacion }: { generacion: number }) {
  const api = useApi();
  const [texto, setTexto] = useState("");
  const buscar = useRetardado(texto).trim();
  const { estado, reintentar } = useConsulta(`clientes|${generacion}|${buscar}`, (senal) => listarClientes(api, { buscar }, senal));
  return (
    <ListaConsulta
      items={estado.datos?.clientes ?? null}
      cargando={estado.fase === "cargando"}
      actualizando={estado.actualizando}
      error={estado.error}
      alReintentar={reintentar}
      pie={estaTruncada(estado.datos?.clientes.length ?? 0) ? <Aviso texto="Se muestran los primeros resultados. Use la búsqueda para acotar y ver otros clientes." /> : null}
      claveDe={(c) => c.id}
      textoVacio={buscar ? "Ningún cliente coincide con la búsqueda." : "No hay clientes registrados."}
      textoCargando="Cargando clientes…"
      encabezado={<Campo etiqueta="Buscar cliente" valor={texto} alCambiar={setTexto} enterKey="search" ayuda="Por nombre o código" />}
      renderItem={(c) => (
        <Tarjeta alPulsar={() => router.push({ pathname: "/cliente/[id]", params: { id: c.id } })} etiqueta={`Cliente ${c.nombre}, ${c.codigo}`}>
          <Texto variante="subtitulo">{c.nombre}</Texto>
          <Texto variante="codigo">{c.codigo}</Texto>
          {c.contactoNombre ? <Texto variante="atenuado">Contacto: {c.contactoNombre}</Texto> : null}
          {!c.activo ? <Insignia texto="Inactivo" tono="aviso" /> : null}
        </Tarjeta>
      )}
    />
  );
}
