/**
 * Raíz de la web con sesión: comprobación inicial, pantalla de acceso o cotizador.
 * El cotizador solo se monta con una sesión válida y con `key` = generación de la sesión.
 */
import { Aplicacion } from "../Aplicacion.tsx";
import { mensajeDeFallo } from "../api/cliente.ts";
import { Aviso, Boton, Encabezado, Esqueleto } from "../comunes/componentes.tsx";
import { BarraSesion } from "./BarraSesion.tsx";
import { PantallaAcceso } from "./PantallaAcceso.tsx";
import { PantallaCambioContrasena } from "./PantallaCambioContrasena.tsx";
import { useSesion } from "./ProveedorSesion.tsx";

export const MOTIVO_REVISOR =
  "Su función (Revisor) no incluye calcular; en el libro de la fase 1 el cálculo lo hace el Preparador. Puede consultar los catálogos y la captura.";

export function Raiz() {
  const { estado, servicios, cotizaciones, catalogoAdmin, administracion, solicitudes, iniciar, cerrar, cambiarContrasena, reintentarVerificacion, refrescar } = useSesion();

  // Contraseña temporal (módulo 13): solo el cambio o cerrar la sesión. La API rechaza todo lo demás
  // (403 CAMBIO_CONTRASENA_REQUERIDO); esta pantalla no es la protección, solo la guía.
  const restringida = estado.fase === "autenticado" && estado.sesion.cambioContrasenaRequerido;

  if (estado.fase === "autenticado" && !restringida) {
    const puedeCalcular = estado.sesion.capacidades.includes("calculo.ejecutar");
    return (
      <Aplicacion
        key={estado.generacion}
        sesion={estado.sesion}
        servicios={servicios}
        cotizaciones={cotizaciones}
        catalogoAdmin={catalogoAdmin}
        administracion={administracion}
        solicitudes={solicitudes}
        barraSesion={<BarraSesion sesion={estado.sesion} alCerrar={cerrar} />}
        alRefrescarSesion={refrescar}
        motivoSinCalculo={puedeCalcular ? null : estado.sesion.funciones.includes("REVISOR") ? MOTIVO_REVISOR : "Su función no incluye calcular."}
      />
    );
  }

  return (
    <>
      <a className="saltar" href="#principal">
        Saltar al contenido
      </a>
      <Encabezado />
      <main id="principal" tabIndex={-1}>
        {estado.fase === "autenticado" ? (
          <PantallaCambioContrasena sesion={estado.sesion} alCambiar={cambiarContrasena} alCerrar={cerrar} />
        ) : estado.fase === "verificando" ? (
          <div className="acceso">
            <div className="acceso-tarjeta">
              <Esqueleto lineas={3} etiqueta="Comprobando la sesión…" />
            </div>
          </div>
        ) : estado.fase === "sin_conexion" ? (
          <div className="acceso">
            <div className="acceso-tarjeta">
              <Aviso tono="error" titulo="No se pudo comprobar la sesión" rol="alert">
                <p>{mensajeDeFallo(estado.fallo)}</p>
              </Aviso>
              <Boton variante="primario" onClick={reintentarVerificacion}>
                Reintentar
              </Boton>
            </div>
          </div>
        ) : (
          <PantallaAcceso motivo={estado.motivo} alIniciar={iniciar} />
        )}
      </main>
      <footer className="pie">
        <p>SoftArq · entorno DEMO local. La autorización la comprueba siempre el servidor.</p>
      </footer>
    </>
  );
}
