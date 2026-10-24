import { router, useLocalSearchParams } from "expo-router";
import { useConsulta } from "../../../src/consultas/usar-consulta";
import { detalleCliente } from "../../../src/consultas/servicios";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { ConSesion } from "../../../src/sesion/con-sesion";
import { useApi } from "../../../src/sesion/uso";
import { Boton, Dato, Insignia, Seccion, Tarjeta, Texto } from "../../../src/ui/componentes";
import { Detalle } from "../../../src/ui/detalle";
import { SinAcceso } from "../../../src/ui/sin-acceso";

export default function ClienteDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConSesion hijos={(s, g) => (seccionesDe(s.capacidades).clientes ? <Contenido id={id ?? ""} generacion={g} verCotizaciones={seccionesDe(s.capacidades).cotizaciones} /> : <SinAcceso />)} />;
}

function Contenido({ id, generacion, verCotizaciones }: { id: string; generacion: number; verCotizaciones: boolean }) {
  const api = useApi();
  const { estado, reintentar } = useConsulta(`cliente|${generacion}|${id}`, (senal) => detalleCliente(api, id, senal));
  return (
    <Detalle estado={estado} alReintentar={reintentar} textoCargando="Cargando el cliente…">
      {(d) => (
        <>
          <Tarjeta>
            <Texto variante="titulo">{d.cliente.nombre}</Texto>
            <Texto variante="codigo">{d.cliente.codigo}</Texto>
            {!d.cliente.activo ? <Insignia texto="Inactivo" tono="aviso" /> : null}
            <Dato etiqueta="Contacto" valor={d.cliente.contactoNombre ?? "—"} />
            <Dato etiqueta="Teléfono" valor={d.cliente.contactoTelefono ?? "—"} />
            <Dato etiqueta="Correo del contacto" valor={d.cliente.contactoCorreo ?? "—"} />
            <Dato etiqueta="Cotizaciones con borrador abierto" valor={String(d.borradoresAbiertos)} />
          </Tarjeta>
          {verCotizaciones ? (
            <Boton texto="Ver cotizaciones de este cliente" variante="secundario" alPulsar={() => router.push({ pathname: "/cotizaciones", params: { clienteId: id } })} />
          ) : null}
          <Seccion titulo={`Proyectos (${d.proyectos.length})`}>
            {d.proyectos.length === 0 ? <Texto variante="atenuado">Este cliente no tiene proyectos.</Texto> : null}
            {d.proyectos.map((p) => (
              <Tarjeta key={p.id} alPulsar={() => router.push({ pathname: "/proyecto/[id]", params: { id: p.id } })} etiqueta={`Proyecto ${p.nombre}, ${p.codigo}`}>
                <Texto variante="subtitulo">{p.nombre}</Texto>
                <Texto variante="codigo">{p.codigo}</Texto>
                {!p.activo ? <Insignia texto="Inactivo" tono="aviso" /> : null}
              </Tarjeta>
            ))}
          </Seccion>
        </>
      )}
    </Detalle>
  );
}
