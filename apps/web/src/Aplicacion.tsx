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
import { Enlace, ProveedorRuta, hashDe, seccionDe, useRuta, type Ruta } from "./navegacion/ruta.tsx";

export interface PropsAplicacion {
  sesion: RespuestaSesion;
  servicios: ServiciosApi;
  cotizaciones: ServiciosCotizaciones;
  /** Administración de catálogos (módulo 11): solo se usa con `catalogos.administrar`. */
  catalogoAdmin: ServiciosCatalogoAdmin;
  barraSesion: ReactNode;
  motivoSinCalculo: string | null;
}

export function Aplicacion(props: PropsAplicacion) {
  return (
    <ProveedorRuta>
      <Contenido {...props} />
    </ProveedorRuta>
  );
}

const SECCIONES: { ruta: Ruta; texto: string; seccion: NonNullable<ReturnType<typeof seccionDe>> }[] = [
  { ruta: { pantalla: "calculadora" }, texto: "Calculadora DEMO", seccion: "calculadora" },
  { ruta: { pantalla: "cotizaciones" }, texto: "Cotizaciones", seccion: "cotizaciones" },
  { ruta: { pantalla: "revisiones" }, texto: "Revisiones", seccion: "revisiones" },
  { ruta: { pantalla: "clientes" }, texto: "Clientes", seccion: "clientes" },
  { ruta: { pantalla: "proyectos" }, texto: "Proyectos", seccion: "proyectos" },
  { ruta: { pantalla: "emisor" }, texto: "Emisor", seccion: "emisor" },
];

/** Solo con `catalogos.administrar` (Administrador del catálogo); la API lo exige de todos modos. */
const SECCION_CATALOGO = { ruta: { pantalla: "catalogo", vista: "proveedores" } as Ruta, texto: "Catálogo", seccion: "catalogo" as const };

function Navegacion({ ruta, puedeAdministrarCatalogo }: { ruta: Ruta; puedeAdministrarCatalogo: boolean }) {
  const actual = seccionDe(ruta);
  return (
    <nav className="navegacion" aria-label="Secciones">
      <ul>
        {[...SECCIONES, ...(puedeAdministrarCatalogo ? [SECCION_CATALOGO] : [])].map((s) => (
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

function Contenido({ sesion, servicios, cotizaciones, catalogoAdmin, barraSesion, motivoSinCalculo }: PropsAplicacion) {
  const { ruta, pendiente, confirmarSalida, cancelarSalida, navegar } = useRuta();
  const puede = (c: Capacidad) => sesion.capacidades.includes(c);
  const puedePreparar = puede("cotizaciones.preparar");
  const puedeGestionar = puede("clientes.gestionar");
  const puedeEnviarRevision = puede("revisiones.enviar");
  const puedeEmitir = puede("emisiones.emitir");
  const puedeVerExcepciones = puede("excepciones.consultar");
  const puedeAdministrarCatalogo = puede("catalogos.administrar");
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
          <PantallaCatalogo servicios={catalogoAdmin} vista={ruta.vista} />
        ) : (
          <Pagina titulo="Sin permiso">
            <Aviso tono="info" titulo="Su función no administra el catálogo">
              <p>En el libro de la fase 1, proveedores, productos, precios y mano de obra los administra el Administrador del catálogo.</p>
            </Aviso>
          </Pagina>
        );
      case "revisiones":
        return <BandejaRevisiones servicios={cotizaciones} />;
      case "revision":
        return <PantallaRevision servicios={cotizaciones} id={ruta.id} puedeVerExcepciones={puedeVerExcepciones} />;
      case "version":
        return <VistaVersion servicios={cotizaciones} id={ruta.id} numero={ruta.numero} puedeVerExcepciones={puedeVerExcepciones} />;
      case "clientes":
        return <ListaClientes servicios={cotizaciones} puedeGestionar={puedeGestionar} />;
      case "cliente":
        return <DetalleClientePantalla servicios={cotizaciones} id={ruta.id} puedeGestionar={puedeGestionar} puedePreparar={puedePreparar} />;
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
    <Marco barraSesion={barraSesion} navegacion={<Navegacion ruta={ruta} puedeAdministrarCatalogo={puedeAdministrarCatalogo} />} pie="SoftArq · entorno DEMO local. Datos ilustrativos, sin validez comercial.">
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
