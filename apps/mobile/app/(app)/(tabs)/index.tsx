import type { RespuestaSesionMovil } from "@softarq/contracts/movil";
import { useState } from "react";
import { hayAlgoQueConsultar, seccionesDe, textoFunciones } from "../../../src/navegacion/capacidades";
import { ConSesion } from "../../../src/sesion/con-sesion";
import { gestor } from "../../../src/sesion/uso";
import { Aviso, Boton, Dato, MarcaDemo, Pantalla, Seccion, Tarjeta, Texto } from "../../../src/ui/componentes";
import { formatearInstante } from "../../../src/ui/formato";

/** Inicio: quién es la persona, en qué organización y qué puede consultar según el servidor. */
export default function Inicio() {
  return <ConSesion hijos={(sesion) => <ContenidoInicio sesion={sesion} />} />;
}

function ContenidoInicio({ sesion }: { sesion: RespuestaSesionMovil }) {
  const [cerrando, setCerrando] = useState(false);
  const secciones = seccionesDe(sesion.capacidades);

  return (
    <Pantalla bordes={["left", "right"]}>
      <MarcaDemo esDemo={sesion.organizacion.esDemo} />
      <Tarjeta>
        <Dato etiqueta="Persona" valor={sesion.usuario.nombre} />
        <Dato etiqueta="Correo" valor={sesion.usuario.correo} />
        <Dato etiqueta="Organización" valor={`${sesion.organizacion.nombre} (${sesion.organizacion.codigo})`} />
        <Dato etiqueta="Funciones" valor={textoFunciones(sesion.funciones)} />
      </Tarjeta>

      <Seccion titulo="Qué puede consultar">
        {hayAlgoQueConsultar(secciones) ? (
          <Tarjeta>
            {secciones.clientes ? <Texto>• Clientes y proyectos</Texto> : null}
            {secciones.cotizaciones ? <Texto>• Cotizaciones, versiones, estados e historial</Texto> : null}
          </Tarjeta>
        ) : (
          <Aviso tono="info" texto="Sus funciones no incluyen consultas en esta app. Use la web para administrar." />
        )}
        <Texto variante="atenuado">Esta versión de la app es de consulta. Crear, calcular, revisar, emitir y administrar se hace en la web.</Texto>
      </Seccion>

      <Seccion titulo="Sesión">
        <Tarjeta>
          <Dato etiqueta="Vence a más tardar" valor={formatearInstante(sesion.expiraEn)} />
          <Texto variante="atenuado">Por seguridad también se cierra tras {sesion.inactividadMinutos} minutos sin usarla.</Texto>
        </Tarjeta>
        <Boton
          texto="Cerrar sesión"
          variante="secundario"
          cargando={cerrando}
          alPulsar={() => {
            setCerrando(true);
            void gestor.cerrarSesion();
          }}
          ayuda="Cierra la sesión en el servidor y borra el acceso guardado en este teléfono"
        />
      </Seccion>
    </Pantalla>
  );
}
