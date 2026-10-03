/**
 * Calculadora DEMO: inicio (ejemplos o captura propia) y captura con resultado previo.
 * Coordina el estado; la presentación vive en cada funcionalidad. No guarda nada: para conservar
 * una captura se usa «Guardar como cotización» (módulo 6).
 *
 * Con sesión (ADR-0007) se monta con una `key` por generación de sesión: al cerrar, vencer o
 * cambiar de usuario, todo este estado (captura, resultados y consultas) se descarta.
 */
import { useRef, useState, type ReactNode } from "react";
import type { ServiciosApi } from "./api/servicios.ts";
import { Aviso, Boton } from "./comunes/componentes.tsx";
import { Marco } from "./comunes/Marco.tsx";
import type { Captura } from "./captura/estado.ts";
import type { ErroresCampo } from "./captura/solicitud.ts";
import { useCaptura, type EstadoEditorCaptura } from "./captura/usarCaptura.ts";
import { VistaCaptura } from "./captura/VistaCaptura.tsx";
import type { Ejemplo } from "./ejemplos/ejemplos.ts";
import { Inicio, type EstadoCargaEjemplo } from "./inicio/Inicio.tsx";

export interface PropsApp {
  servicios: ServiciosApi;
  /** Identidad y cierre de sesión, en el encabezado. */
  barraSesion?: ReactNode;
  /** Navegación entre secciones (módulo 6). */
  navegacion?: ReactNode;
  /** Motivo por el que la función del usuario no permite calcular (solo presentación). */
  motivoSinCalculo?: string | null;
  /**
   * Si se indica, la captura ofrece «Guardar como cotización» (sin perderla). Devuelve los errores
   * de formato que impiden guardarla, o `null` si se aceptó.
   */
  alGuardarComoCotizacion?: (captura: Captura) => ErroresCampo | null;
  /** `false`: solo el contenido, para montarlo dentro del marco de la aplicación (módulo 6). */
  conMarco?: boolean;
}

export function App(props: PropsApp) {
  const editor = useCaptura(props.servicios);
  return <Calculadora {...props} editor={editor} />;
}

/**
 * La calculadora con un estado de captura recibido: la aplicación (módulo 6) lo conserva aunque la
 * vista se desmonte al navegar a otra sección, sin dejar en el DOM campos con `id` repetidos.
 */
export function Calculadora({
  servicios,
  barraSesion,
  navegacion,
  motivoSinCalculo = null,
  alGuardarComoCotizacion,
  conMarco = true,
  editor,
}: PropsApp & { editor: EstadoEditorCaptura }) {
  const { captura, despachar } = editor;
  const [carga, setCarga] = useState<EstadoCargaEjemplo>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [formatoInvalido, setFormatoInvalido] = useState(false);
  const cargaActual = useRef(0);

  const guardarComoCotizacion = (c: Captura) => {
    const errores = alGuardarComoCotizacion?.(c) ?? null;
    setFormatoInvalido(errores !== null);
    if (errores) editor.setErroresExternos(errores);
  };

  const cargarEjemplo = async (ej: Ejemplo) => {
    const mia = ++cargaActual.current;
    setCarga({ id: ej.id, estado: "cargando" });
    const codigos = [...new Set(ej.solicitud.partidas.flatMap((p) => (p.tipo === "CONCEPTO" ? [p.conceptoCodigo] : [])))];
    const respuestas = await Promise.all(codigos.map((c) => servicios.buscarConceptos(c)));
    if (mia !== cargaActual.current) return;
    const fallo = respuestas.find((r) => !r.ok);
    if (fallo && !fallo.ok) {
      setCarga({ id: ej.id, estado: "error", fallo: fallo.fallo });
      return;
    }
    const encontrados = respuestas.flatMap((r) => (r.ok ? r.datos.conceptos : [])).filter((c) => codigos.includes(c.codigo));
    editor.reiniciarResultado();
    setCarga(null);
    despachar({ tipo: "CARGAR_EJEMPLO", ejemplo: ej, conceptos: encontrados });
  };

  const iniciarPropia = () => {
    cargaActual.current++;
    editor.reiniciarResultado();
    setCarga(null);
    despachar({ tipo: "INICIAR_PROPIA" });
  };

  const volverAlInicio = () => {
    editor.reiniciarResultado();
    setConfirmarSalida(false);
    despachar({ tipo: "VOLVER_AL_INICIO" });
  };

  const titulo = captura?.origen.tipo === "ejemplo" ? captura.origen.titulo : "Captura propia";
  const acciones = confirmarSalida ? (
    <div className="confirmacion" role="group" aria-label="Confirmar salida">
      <span>¿Descartar esta captura y volver al inicio?</span>
      <Boton variante="peligro" onClick={volverAlInicio}>
        Descartar
      </Boton>
      <Boton onClick={() => setConfirmarSalida(false)} autoFocus>
        Seguir capturando
      </Boton>
    </div>
  ) : (
    <>
      {alGuardarComoCotizacion && captura ? (
        <Boton variante="secundario" onClick={() => guardarComoCotizacion(captura)}>
          Guardar como cotización
        </Boton>
      ) : null}
      <Boton variante="enlace" onClick={() => setConfirmarSalida(true)}>
        Volver al inicio
      </Boton>
    </>
  );

  const contenido = (
    <>
      {captura ? (
        <VistaCaptura
          editor={editor}
          servicios={servicios}
          titulo={titulo}
          ayuda={
            alGuardarComoCotizacion
              ? "La captura se conserva mientras esta página esté abierta; para guardarla, use «Guardar como cotización»."
              : "La captura se conserva mientras esta página esté abierta; no se guarda."
          }
          acciones={acciones}
          avisos={
            formatoInvalido ? (
              <Aviso tono="error" titulo="No se puede guardar todavía" rol="alert">
                <p>Hay valores con formato inválido (marcados en la captura). Corríjalos y vuelva a pulsar «Guardar como cotización».</p>
              </Aviso>
            ) : null
          }
          motivoSinCalculo={motivoSinCalculo}
        />
      ) : (
        <Inicio carga={carga} alCargarEjemplo={(e) => void cargarEjemplo(e)} alIniciarPropia={iniciarPropia} />
      )}
    </>
  );
  if (!conMarco) return contenido;
  return (
    <Marco
      barraSesion={barraSesion}
      navegacion={navegacion}
      pie="SoftArq · entorno DEMO local. La captura se conserva solo mientras esta página esté abierta."
    >
      {contenido}
    </Marco>
  );
}
