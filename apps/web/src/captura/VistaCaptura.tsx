/**
 * Captura editable con resultado (las mismas secciones para la calculadora DEMO y para el
 * borrador de una cotización). La cabecera, las acciones y lo que va antes del resultado los
 * aporta quien la usa; el formulario y el cálculo previo son siempre los mismos.
 */
import type { ReactNode } from "react";
import { PanelResultado } from "../calculo/PanelResultado.tsx";
import type { EstadoCalculo } from "../calculo/usarCalculo.ts";
import { Aviso } from "../comunes/componentes.tsx";
import { ProveedorCaptura } from "./contexto.tsx";
import { Progreso, type EstadoResultado } from "./componentes/Progreso.tsx";
import { SeccionAdicionales } from "./componentes/SeccionAdicionales.tsx";
import { SeccionOpciones } from "./componentes/SeccionOpciones.tsx";
import { SeccionPartidas } from "./componentes/SeccionPartidas.tsx";
import type { ServiciosApi } from "../api/servicios.ts";
import type { EstadoEditorCaptura } from "./usarCaptura.ts";

export function estadoResultado(e: EstadoCalculo, huella: string): EstadoResultado {
  if (e.fase === "sin_calcular") return "sin_calcular";
  if (e.fase === "calculando") return "calculando";
  if (e.huella !== huella) return "pendiente";
  if (e.fase === "calculado") return "calculado";
  if (e.fase === "bloqueado") return "bloqueado";
  if (e.fase === "cancelado") return "pendiente";
  return "error";
}

export interface PropsVistaCaptura {
  editor: EstadoEditorCaptura;
  servicios: ServiciosApi;
  titulo: ReactNode;
  ayuda: ReactNode;
  /** Acciones de la cabecera (volver, guardar…). */
  acciones?: ReactNode;
  /** Avisos bajo la cabecera (p. ej., un conflicto de edición). */
  avisos?: ReactNode;
  /** Contenido de la columna de resultado antes del cálculo previo (p. ej., guardar versión). */
  antesDelResultado?: ReactNode;
  /** Contenido de la columna principal tras la captura (p. ej., textos, emisión y descarte). */
  despuesDeLaCaptura?: ReactNode;
  /** Texto del botón de cálculo previo y ayuda bajo él. */
  textoCalcular?: string;
  ayudaCalcular?: ReactNode;
  motivoSinCalculo?: string | null;
}

export function VistaCaptura({
  editor,
  servicios,
  titulo,
  ayuda,
  acciones,
  avisos,
  antesDelResultado,
  despuesDeLaCaptura,
  textoCalcular,
  ayudaCalcular,
  motivoSinCalculo = null,
}: PropsVistaCaptura) {
  const captura = editor.captura;
  if (!captura) return null;
  const huella = editor.huella ?? "";
  return (
    <ProveedorCaptura valor={{ despachar: editor.despachar, errores: editor.erroresVisibles }}>
      <div className="captura">
        <div className="captura-cabecera">
          <div>
            <h1 className="captura-titulo" tabIndex={-1}>
              {titulo}
            </h1>
            <p className="ayuda">{ayuda}</p>
          </div>
          {acciones ? <div className="captura-acciones">{acciones}</div> : null}
        </div>
        {avisos}
        {captura.avisosCarga.length > 0 ? (
          <Aviso
            tono="aviso"
            titulo={captura.origen.tipo === "cotizacion" ? "Hay datos guardados que ya no están disponibles" : "La captura no se cargó completa"}
            rol="status"
          >
            <ul>
              {captura.avisosCarga.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Aviso>
        ) : null}
        {Object.keys(captura.avisosSeleccion).length > 0 ? (
          <Aviso tono="aviso" titulo="Hay opciones que ya no están disponibles" rol="status">
            <p>
              Elija otra opción o quite la selección de {Object.keys(captura.avisosSeleccion).join(", ")} en{" "}
              <a href="#seccion-opciones">Opciones disponibles</a>. Nada se sustituyó ni se borró automáticamente.
            </p>
          </Aviso>
        ) : null}
        <Progreso captura={captura} errores={editor.erroresLocales} resultado={estadoResultado(editor.calculo.estado, huella)} />
        <a className="ir-resultado" href="#seccion-resultado">
          Ir a Calcular y resultado
        </a>
        <div className="rejilla-captura">
          <div className="columna-captura">
            <SeccionPartidas captura={captura} servicios={servicios} />
            <SeccionOpciones captura={captura} opciones={editor.opciones.resultado} reintentar={editor.opciones.reintentar} />
            <SeccionAdicionales captura={captura} tipos={editor.tipos.resultado} reintentar={editor.tipos.reintentar} />
            {despuesDeLaCaptura}
          </div>
          <aside className="columna-resultado" id="seccion-resultado" aria-label="Resultado de la cotización">
            {antesDelResultado}
            <PanelResultado
              estado={editor.calculo.estado}
              huellaActual={huella}
              erroresLocales={editor.erroresLocales}
              mostrarErrores={editor.mostrarErrores}
              alCalcular={editor.alCalcular}
              alActualizarOpciones={editor.opciones.reintentar}
              refResumen={editor.refResumen}
              motivoSinCalculo={motivoSinCalculo}
              {...(textoCalcular ? { textoCalcular } : {})}
              {...(ayudaCalcular ? { ayudaCalcular } : {})}
            />
          </aside>
        </div>
      </div>
    </ProveedorCaptura>
  );
}
