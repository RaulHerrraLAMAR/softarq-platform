/**
 * Aplicación DEMO: inicio (ejemplos o captura propia) y captura con resultado.
 * Coordina el estado; la presentación vive en cada funcionalidad.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import type { ServiciosApi } from "./api/servicios.ts";
import { PanelResultado } from "./calculo/PanelResultado.tsx";
import { useCalculo, type EstadoCalculo } from "./calculo/usarCalculo.ts";
import { useOpcionesPrecio, useTiposAdicional, type OpcionesCargadas } from "./catalogos/hooks.ts";
import { Aviso, Boton, Insignia } from "./comunes/componentes.tsx";
import { ProveedorCaptura } from "./captura/contexto.tsx";
import { ESTADO_INICIAL, conceptosEnUso, reducir, type Captura } from "./captura/estado.ts";
import { Progreso, type EstadoResultado } from "./captura/componentes/Progreso.tsx";
import { SeccionAdicionales } from "./captura/componentes/SeccionAdicionales.tsx";
import { SeccionOpciones } from "./captura/componentes/SeccionOpciones.tsx";
import { SeccionPartidas } from "./captura/componentes/SeccionPartidas.tsx";
import { armarSolicitud, huellaCaptura, validarCaptura, type ErroresCampo } from "./captura/solicitud.ts";
import type { Ejemplo } from "./ejemplos/ejemplos.ts";
import { Inicio, type EstadoCargaEjemplo } from "./inicio/Inicio.tsx";

export function App({ servicios }: { servicios: ServiciosApi }) {
  const [estado, despachar] = useReducer(reducir, ESTADO_INICIAL);
  const captura = estado.captura;
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [carga, setCarga] = useState<EstadoCargaEjemplo>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const cargaActual = useRef(0);
  const refResumen = useRef<HTMLDivElement>(null);
  const [enfocarResumen, setEnfocarResumen] = useState(0);

  const conceptos = useMemo(() => (captura ? conceptosEnUso(captura) : []), [captura]);
  const conciliar = useCallback(
    (o: OpcionesCargadas) => despachar({ tipo: "CONCILIAR_OPCIONES", conceptos: o.conceptos, insumos: o.insumos }),
    [],
  );
  const opciones = useOpcionesPrecio(servicios, conceptos, conciliar);
  const tipos = useTiposAdicional(servicios);

  const huella = captura ? huellaCaptura(captura) : null;
  const calculo = useCalculo(servicios, huella);

  // Opciones válidas solo si corresponden a la lista actual de conceptos.
  const opcionesVigentes =
    opciones.resultado.estado === "listo" && opciones.resultado.datos.conceptos.join(",") === conceptos.join(",")
      ? opciones.resultado.datos.insumos
      : null;
  const erroresLocales = useMemo(() => (captura ? validarCaptura(captura, opcionesVigentes) : {}), [captura, opcionesVigentes]);

  // Errores visibles junto a cada campo: los locales tras un intento de cálculo y los del servidor
  // (400) mientras correspondan a la captura actual.
  const erroresVisibles: ErroresCampo = useMemo(() => {
    const e: ErroresCampo = mostrarErrores ? { ...erroresLocales } : {};
    if (calculo.estado.fase === "rechazado" && calculo.estado.huella === huella) {
      for (const c of calculo.estado.campos) e[c.ruta] ??= c.mensaje;
    }
    return e;
  }, [mostrarErrores, erroresLocales, calculo.estado, huella]);

  useEffect(() => {
    if (enfocarResumen > 0) refResumen.current?.focus();
  }, [enfocarResumen]);

  const alCalcular = () => {
    if (!captura || huella === null) return;
    if (Object.keys(erroresLocales).length > 0) {
      setMostrarErrores(true);
      setEnfocarResumen((n) => n + 1);
      return;
    }
    void calculo.calcular(armarSolicitud(captura), huella);
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
    calculo.reiniciar();
    setMostrarErrores(false);
    setCarga(null);
    despachar({ tipo: "CARGAR_EJEMPLO", ejemplo: ej, conceptos: encontrados });
  };

  const iniciarPropia = () => {
    cargaActual.current++;
    calculo.reiniciar();
    setMostrarErrores(false);
    setCarga(null);
    despachar({ tipo: "INICIAR_PROPIA" });
  };

  const volverAlInicio = () => {
    calculo.reiniciar();
    setMostrarErrores(false);
    setConfirmarSalida(false);
    despachar({ tipo: "VOLVER_AL_INICIO" });
  };

  return (
    <>
      <a className="saltar" href="#principal">
        Saltar al contenido
      </a>
      <header className="encabezado">
        <div className="encabezado-marca">
          <span className="marca">SoftArq</span>
          <span className="marca-sub">Cotizador de estructuras</span>
          <Insignia tono="demo">DEMO</Insignia>
        </div>
        <p className="encabezado-leyenda">Datos ilustrativos, sin validez comercial.</p>
      </header>
      <main id="principal" tabIndex={-1}>
        {captura ? (
          <ProveedorCaptura valor={{ despachar, errores: erroresVisibles }}>
            <VistaCaptura
              captura={captura}
              servicios={servicios}
              opciones={opciones}
              tipos={tipos}
              erroresLocales={erroresLocales}
              mostrarErrores={mostrarErrores}
              estadoCalculo={calculo.estado}
              huella={huella ?? ""}
              alCalcular={alCalcular}
              refResumen={refResumen}
              confirmarSalida={confirmarSalida}
              setConfirmarSalida={setConfirmarSalida}
              alVolver={volverAlInicio}
            />
          </ProveedorCaptura>
        ) : (
          <Inicio carga={carga} alCargarEjemplo={(e) => void cargarEjemplo(e)} alIniciarPropia={iniciarPropia} />
        )}
      </main>
      <footer className="pie">
        <p>SoftArq · entorno DEMO local. La captura se conserva solo mientras esta página esté abierta.</p>
      </footer>
    </>
  );
}

function estadoResultado(e: EstadoCalculo, huella: string): EstadoResultado {
  if (e.fase === "sin_calcular") return "sin_calcular";
  if (e.fase === "calculando") return "calculando";
  if (e.huella !== huella) return "pendiente";
  if (e.fase === "calculado") return "calculado";
  if (e.fase === "bloqueado") return "bloqueado";
  if (e.fase === "cancelado") return "pendiente";
  return "error";
}

function VistaCaptura(props: {
  captura: Captura;
  servicios: ServiciosApi;
  opciones: ReturnType<typeof useOpcionesPrecio>;
  tipos: ReturnType<typeof useTiposAdicional>;
  erroresLocales: ErroresCampo;
  mostrarErrores: boolean;
  estadoCalculo: EstadoCalculo;
  huella: string;
  alCalcular: () => void;
  refResumen: RefObject<HTMLDivElement | null>;
  confirmarSalida: boolean;
  setConfirmarSalida: (v: boolean) => void;
  alVolver: () => void;
}) {
  const { captura } = props;
  const titulo = captura.origen.tipo === "ejemplo" ? captura.origen.titulo : "Captura propia";
  return (
    <div className="captura">
      <div className="captura-cabecera">
        <div>
          <h1 className="captura-titulo">{titulo}</h1>
          <p className="ayuda">La captura se conserva mientras esta página esté abierta; no se guarda.</p>
        </div>
        <div className="captura-acciones">
          {props.confirmarSalida ? (
            <div className="confirmacion" role="group" aria-label="Confirmar salida">
              <span>¿Descartar esta captura y volver al inicio?</span>
              <Boton variante="peligro" onClick={props.alVolver}>
                Descartar
              </Boton>
              <Boton onClick={() => props.setConfirmarSalida(false)} autoFocus>
                Seguir capturando
              </Boton>
            </div>
          ) : (
            <Boton variante="enlace" onClick={() => props.setConfirmarSalida(true)}>
              Volver al inicio
            </Boton>
          )}
        </div>
      </div>
      {captura.avisosCarga.length > 0 ? (
        <Aviso tono="aviso" titulo="El ejemplo no se cargó completo" rol="status">
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
            Elija otra opción para {Object.keys(captura.avisosSeleccion).join(", ")} en{" "}
            <a href="#seccion-opciones">Opciones disponibles</a>. Nada se sustituyó automáticamente.
          </p>
        </Aviso>
      ) : null}
      <Progreso captura={captura} errores={props.erroresLocales} resultado={estadoResultado(props.estadoCalculo, props.huella)} />
      <a className="ir-resultado" href="#seccion-resultado">
        Ir a Calcular y resultado
      </a>
      <div className="rejilla-captura">
        <div className="columna-captura">
          <SeccionPartidas captura={captura} servicios={props.servicios} />
          <SeccionOpciones captura={captura} opciones={props.opciones.resultado} reintentar={props.opciones.reintentar} />
          <SeccionAdicionales captura={captura} tipos={props.tipos.resultado} reintentar={props.tipos.reintentar} />
        </div>
        <aside className="columna-resultado" id="seccion-resultado" aria-label="Resultado de la cotización">
          <PanelResultado
            estado={props.estadoCalculo}
            huellaActual={props.huella}
            erroresLocales={props.erroresLocales}
            mostrarErrores={props.mostrarErrores}
            alCalcular={props.alCalcular}
            alActualizarOpciones={props.opciones.reintentar}
            refResumen={props.refResumen}
          />
        </aside>
      </div>
    </div>
  );
}
