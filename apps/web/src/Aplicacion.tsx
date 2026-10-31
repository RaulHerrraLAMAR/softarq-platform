/**
 * Aplicación con sesión (módulo 6): marco único, navegación por secciones y pantallas por ruta.
 *
 * - El estado de la calculadora DEMO vive aquí: su captura se conserva al navegar a otra sección
 *   (la vista se desmonta para no repetir `id` de campos con el editor de cotización).
 *   «Guardar como cotización» la lleva como borrador inicial de una cotización nueva.
 * - Los controles se muestran según las capacidades de la sesión, pero la API decide siempre.
 * - Se monta con `key` = generación de la sesión: al cerrar, vencer o cambiar de usuario se
 *   descarta todo (capturas, borradores en pantalla, claves de idempotencia y consultas).
 */
import type { Capacidad, CapturaBorrador, RespuestaSesion } from "@softarq/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calculadora } from "./App.tsx";
import type { ServiciosApi } from "./api/servicios.ts";
import type { ServiciosCotizaciones } from "./api/servicios-cotizaciones.ts";
import { PantallaAdministracion, PantallaPersona } from "./administracion/PantallasAdministracion.tsx";
import type { ServiciosAdministracion } from "./administracion/servicios.ts";
import { PantallaCatalogo } from "./catalogo-admin/PantallasCatalogo.tsx";
import type { ServiciosCatalogoAdmin } from "./catalogo-admin/servicios.ts";
import { Aviso, Boton } from "./comunes/componentes.tsx";
import { Marco } from "./comunes/Marco.tsx";
import { Pagina } from "./comunes/pagina.tsx";
import { serializarBorrador } from "./captura/borrador.ts";
import { useCaptura } from "./captura/usarCaptura.ts";
import { DetalleClientePantalla, ListaClientes, ListaProyectos } from "./clientes/PantallasClientes.tsx";
import { PantallaCotizacion } from "./cotizaciones/EditorCotizacion.tsx";
import { PantallaEmisor } from "./cotizaciones/emision.tsx";
import { ListaCotizaciones, NuevaCotizacion, VistaVersion } from "./cotizaciones/PantallasCotizaciones.tsx";
import { BandejaRevisiones, PantallaRevision } from "./cotizaciones/revisiones.tsx";
import { MiTrabajo } from "./inicio/MiTrabajo.tsx";
import { BandejaSolicitudes, DetalleSolicitud } from "./solicitudes/PantallasSolicitudes.tsx";
import type { ServiciosSolicitudes } from "./solicitudes/servicios.ts";
import { PantallaSalidasInternas } from "./salidas-internas/PantallaSalidasInternas.tsx";
import { Enlace, ProveedorRuta, hashDe, seccionDe, useRuta, type Ruta } from "./navegacion/ruta.tsx";

export interface PropsAplicacion {
  sesion: RespuestaSesion;
  servicios: ServiciosApi;
  cotizaciones: ServiciosCotizaciones;
  /** Administración de catálogos (módulo 11): solo se usa con `catalogos.administrar`. */
  catalogoAdmin: ServiciosCatalogoAdmin;
  /** Parámetros y personas (módulo 13): solo con `parametros.administrar` / `personas.administrar`. */
  administracion: ServiciosAdministracion;
  /** Atención de solicitudes de clientes, accesos y referencias de estimación (módulo 17). */
  solicitudes: ServiciosSolicitudes;
  barraSesion: ReactNode;
  motivoSinCalculo: string | null;
  /** Vuelve a consultar la sesión (módulo 14): tras perder una función con la pantalla abierta. */
  alRefrescarSesion?: () => void;
}

export function Aplicacion(props: PropsAplicacion) {
  return (
    <ProveedorRuta>
      <Contenido {...props} />
    </ProveedorRuta>
  );
}

const SECCIONES: { ruta: Ruta; texto: string; seccion: NonNullable<ReturnType<typeof seccionDe>> }[] = [
  { ruta: { pantalla: "inicio" }, texto: "Mi trabajo", seccion: "inicio" },
  { ruta: { pantalla: "calculadora" }, texto: "Calculadora DEMO", seccion: "calculadora" },
  { ruta: { pantalla: "cotizaciones" }, texto: "Cotizaciones", seccion: "cotizaciones" },
  { ruta: { pantalla: "revisiones" }, texto: "Revisiones", seccion: "revisiones" },
  { ruta: { pantalla: "clientes" }, texto: "Clientes", seccion: "clientes" },
  { ruta: { pantalla: "proyectos" }, texto: "Proyectos", seccion: "proyectos" },
  { ruta: { pantalla: "emisor" }, texto: "Emisor", seccion: "emisor" },
];

/** Solo con `solicitudes.atender` (Preparador, módulo 17); la API lo exige de todos modos. */
const SECCION_SOLICITUDES = { ruta: { pantalla: "solicitudes" } as Ruta, texto: "Solicitudes", seccion: "solicitudes" as const };

/** Solo con `catalogos.administrar` (Administrador del catálogo); la API lo exige de todos modos. */
const SECCION_CATALOGO = { ruta: { pantalla: "catalogo", vista: "proveedores" } as Ruta, texto: "Catálogo", seccion: "catalogo" as const };

/** Solo con `parametros.administrar` o `personas.administrar` (Administrador del sistema, módulo 13). */
const SECCION_ADMINISTRACION = { ruta: { pantalla: "administracion", vista: "parametros" } as Ruta, texto: "Administración", seccion: "administracion" as const };

function Navegacion({ ruta, puedeAtender, puedeAdministrarCatalogo, puedeAdministrarSistema }: { ruta: Ruta; puedeAtender: boolean; puedeAdministrarCatalogo: boolean; puedeAdministrarSistema: boolean }) {
  const actual = seccionDe(ruta);
  return (
    <nav className="navegacion" aria-label="Secciones">
      <ul>
        {[SECCIONES[0]!, ...(puedeAtender ? [SECCION_SOLICITUDES] : []), ...SECCIONES.slice(1), ...(puedeAdministrarCatalogo ? [SECCION_CATALOGO] : []), ...(puedeAdministrarSistema ? [SECCION_ADMINISTRACION] : [])].map((s) => (
          <li key={s.seccion}>
            <Enlace a={s.ruta} className="navegacion-enlace" actual={actual === s.seccion}>
              {s.texto}
            </Enlace>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Contenido({ sesion, servicios, cotizaciones, catalogoAdmin, administracion, solicitudes, barraSesion, motivoSinCalculo, alRefrescarSesion }: PropsAplicacion) {
  const { ruta, pendiente, confirmarSalida, cancelarSalida, navegar } = useRuta();
  const puede = (c: Capacidad) => sesion.capacidades.includes(c);
  const puedePreparar = puede("cotizaciones.preparar");
  const puedeGestionar = puede("clientes.gestionar");
  const puedeEnviarRevision = puede("revisiones.enviar");
  const puedeEmitir = puede("emisiones.emitir");
  const puedeAtender = puede("solicitudes.atender");
  const puedeVerExcepciones = puede("excepciones.consultar");
  const puedeVerSalidas = puede("salidas.consultar");
  const puedeAdministrarCatalogo = puede("catalogos.administrar");
  const puedeParametros = puede("parametros.administrar");
  const puedePersonas = puede("personas.administrar");
  const [capturaPendiente, setCapturaPendiente] = useState<CapturaBorrador | null>(null);
  const editorCalculadora = useCaptura(servicios);

  // Al cambiar de pantalla, el foco va al título (o al contenido) para lectores de pantalla.
  const primera = useRef(true);
  const clave = hashDe(ruta);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const id = window.requestAnimationFrame(() => {
      const titulo = document.querySelector<HTMLElement>("#principal h1");
      (titulo ?? document.getElementById("principal"))?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [clave]);

  const pantalla = (() => {
    switch (ruta.pantalla) {
      case "calculadora":
        return null;
      case "inicio":
        return <MiTrabajo nombre={sesion.usuario.nombre} capacidades={sesion.capacidades} solicitudes={solicitudes} cotizaciones={cotizaciones} />;
      case "solicitudes":
        return puedeAtender ? <BandejaSolicitudes servicios={solicitudes} /> : <SinPermisoSolicitudes />;
      case "solicitud":
        return puedeAtender ? <DetalleSolicitud servicios={solicitudes} id={ruta.id} puedeAtender={puedeAtender} /> : <SinPermisoSolicitudes />;
      case "cotizaciones":
        return <ListaCotizaciones servicios={cotizaciones} puedePreparar={puedePreparar} />;
      case "nueva-cotizacion":
        return puedePreparar ? (
          <NuevaCotizacion
            servicios={cotizaciones}
            proyectoInicial={ruta.proyectoId}
            capturaPendiente={capturaPendiente}
            alDescartarCaptura={() => setCapturaPendiente(null)}
            alCreada={(id) => {
              setCapturaPendiente(null);
              navegar({ pantalla: "cotizacion", id });
            }}
            puedeGestionar={puedeGestionar}
          />
        ) : (
          <SinPermiso />
        );
      case "cotizacion":
        return (
          <PantallaCotizacion
            id={ruta.id}
            servicios={servicios}
            cotizaciones={cotizaciones}
            puedePreparar={puedePreparar}
            puedeEnviarRevision={puedeEnviarRevision}
            puedeEmitir={puedeEmitir}
            motivoSinCalculo={motivoSinCalculo}
          />
        );
      case "emisor":
        return <PantallaEmisor cotizaciones={cotizaciones} />;
      case "catalogo":
        return puedeAdministrarCatalogo ? (
          <PantallaCatalogo servicios={catalogoAdmin} vista={ruta.vista} solicitudes={solicitudes} />
        ) : (
          <Pagina titulo="Sin permiso">
            <Aviso tono="info" titulo="Su función no administra el catálogo">
              <p>En el libro de la fase 1, proveedores, productos, precios y mano de obra los administra el Administrador del catálogo.</p>
            </Aviso>
          </Pagina>
        );
      case "administracion":
        return (ruta.vista === "parametros" ? puedeParametros : puedePersonas) ? (
          <PantallaAdministracion servicios={administracion} vista={ruta.vista} />
        ) : (
          <SinPermisoAdministracion />
        );
      case "persona":
        return puedePersonas ? <PantallaPersona servicios={administracion} id={ruta.id} correoPropio={sesion.usuario.correo} /> : <SinPermisoAdministracion />;
      case "revisiones":
        return <BandejaRevisiones servicios={cotizaciones} />;
      case "revision":
        return <PantallaRevision servicios={cotizaciones} id={ruta.id} puedeVerExcepciones={puedeVerExcepciones} puedeVerSalidas={puedeVerSalidas} />;
      case "version":
        return (
          <VistaVersion
            servicios={cotizaciones}
            id={ruta.id}
            numero={ruta.numero}
            puedeVerExcepciones={puedeVerExcepciones}
            puedeVerSalidas={puedeVerSalidas}
            puedeDuplicar={puedePreparar}
          />
        );
      case "salidas":
        return puedeVerSalidas ? (
          <PantallaSalidasInternas
            key={`${ruta.id}-${ruta.numero}`}
            servicios={cotizaciones}
            id={ruta.id}
            numero={ruta.numero}
            vista={ruta.vista}
            {...(alRefrescarSesion ? { alPerderPermiso: alRefrescarSesion } : {})}
          />
        ) : (
          <Pagina titulo="Sin permiso">
            <Aviso tono="info" titulo="Su función no consulta las salidas internas">
              <p>Las compras calculadas, el detalle y los indicadores internos de una versión los consultan el Preparador y el Revisor.</p>
              <Enlace a={{ pantalla: "version", id: ruta.id, numero: ruta.numero }}>Ver la versión</Enlace>
            </Aviso>
          </Pagina>
        );
      case "clientes":
        return <ListaClientes servicios={cotizaciones} puedeGestionar={puedeGestionar} />;
      case "cliente":
        return <DetalleClientePantalla servicios={cotizaciones} id={ruta.id} puedeGestionar={puedeGestionar} puedePreparar={puedePreparar} {...(puedePersonas ? { accesos: solicitudes } : {})} />;
      case "proyectos":
        return <ListaProyectos servicios={cotizaciones} puedeGestionar={puedeGestionar} puedePreparar={puedePreparar} />;
      case "no-encontrada":
        return (
          <Pagina titulo="Página no encontrada">
            <p>
              La dirección no corresponde a ninguna pantalla. <Enlace a={{ pantalla: "cotizaciones" }}>Ir a cotizaciones</Enlace>
            </p>
          </Pagina>
        );
    }
  })();

  return (
    <Marco barraSesion={barraSesion} navegacion={<Navegacion ruta={ruta} puedeAtender={puedeAtender} puedeAdministrarCatalogo={puedeAdministrarCatalogo} puedeAdministrarSistema={puedeParametros || puedePersonas} />} pie="SoftArq · entorno DEMO local. Datos ilustrativos, sin validez comercial.">
      {pendiente ? (
        <div className="aviso-salida">
          <Aviso tono="aviso" titulo="Hay cambios sin guardar" rol="alert">
            <p>Si sale ahora, los cambios del borrador que no ha guardado se perderán.</p>
            <div className="formulario-acciones">
              <Boton onClick={cancelarSalida} autoFocus>
                Seguir editando
              </Boton>
              <Boton variante="peligro" onClick={confirmarSalida}>
                Salir sin guardar
              </Boton>
            </div>
          </Aviso>
        </div>
      ) : null}
      {ruta.pantalla === "calculadora" ? (
        <Calculadora
          editor={editorCalculadora}
          conMarco={false}
          servicios={servicios}
          motivoSinCalculo={motivoSinCalculo}
          {...(puedePreparar
            ? {
                alGuardarComoCotizacion: (c) => {
                  const s = serializarBorrador(c);
                  if (!s.ok) return s.errores;
                  setCapturaPendiente(s.borrador);
                  navegar({ pantalla: "nueva-cotizacion", proyectoId: null });
                  return null;
                },
              }
            : {})}
        />
      ) : null}
      {pantalla}
    </Marco>
  );
}

function SinPermiso() {
  return (
    <Pagina titulo="Sin permiso">
      <Aviso tono="info" titulo="Su función no permite crear cotizaciones">
        <p>En el libro de la fase 1, la cotización la prepara el Preparador. Puede consultar las cotizaciones existentes.</p>
      </Aviso>
    </Pagina>
  );
}

function SinPermisoSolicitudes() {
  return (
    <Pagina titulo="Sin permiso">
      <Aviso tono="info" titulo="Su función no atiende solicitudes de clientes">
        <p>Las solicitudes enviadas desde la app las atiende el Preparador.</p>
      </Aviso>
    </Pagina>
  );
}

function SinPermisoAdministracion() {
  return (
    <Pagina titulo="Sin permiso">
      <Aviso tono="info" titulo="Su función no administra parámetros ni personas">
        <p>En el libro de la fase 1, los parámetros y las personas los administra el Administrador del sistema.</p>
      </Aviso>
    </Pagina>
  );
}
