import { router, useLocalSearchParams } from "expo-router";
import { useConsulta } from "../../../src/consultas/usar-consulta";
import { detalleProyecto } from "../../../src/consultas/servicios";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { ConSesion } from "../../../src/sesion/con-sesion";
import { useApi } from "../../../src/sesion/uso";
import { Boton, Dato, Insignia, Tarjeta, Texto } from "../../../src/ui/componentes";
import { Detalle } from "../../../src/ui/detalle";
import { SinAcceso } from "../../../src/ui/sin-acceso";

export default function ProyectoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).proyectos ? <Contenido id={id ?? ""} generacion={g} verCotizaciones={seccionesDe(s.capacidades).cotizaciones} /> : <SinAcceso />)} />;
}

function Contenido({ id, generacion, verCotizaciones }: { id: string; generacion: number; verCotizaciones: boolean }) {
  const api = useApi();
  const { estado, reintentar } = useConsulta(`proyecto|${generacion}|${id}`, (senal) => detalleProyecto(api, id, senal));
  return (
    <Detalle estado={estado} alReintentar={reintentar} textoCargando="Cargando el proyecto…">
      {(p) => (
        <>
          <Tarjeta>
            <Texto variante="titulo">{p.nombre}</Texto>
            <Texto variante="codigo">{p.codigo}</Texto>
            {!p.activo ? <Insignia texto="Inactivo" tono="aviso" /> : null}
            <Dato etiqueta="Ubicación" valor={[p.municipio, p.entidadFederativa].filter(Boolean).join(", ") || "—"} />
            <Dato etiqueta="Descripción" valor={p.descripcion ?? "—"} />
          </Tarjeta>
          <Tarjeta alPulsar={() => router.push({ pathname: "/cliente/[id]", params: { id: p.cliente.id } })} etiqueta={`Cliente ${p.cliente.nombre}`}>
            <Texto variante="etiqueta">Cliente</Texto>
            <Texto variante="subtitulo">{p.cliente.nombre}</Texto>
            <Texto variante="codigo">{p.cliente.codigo}</Texto>
          </Tarjeta>
          {verCotizaciones ? (
            <Boton texto="Ver cotizaciones de este proyecto" variante="secundario" alPulsar={() => router.push({ pathname: "/cotizaciones", params: { proyectoId: id } })} />
          ) : null}
        </>
      )}
    </Detalle>
  );
}
