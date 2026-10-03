/**
 * Estado completo de una captura editable: reducer, opciones de precio, tipos de adicional,
 * validación local, errores visibles y resultado previo (vista previa del servidor).
 *
 * Lo usan la calculadora DEMO y el editor de cotizaciones (módulo 6): un solo formulario y una
 * sola conversión a la solicitud de cálculo, sin duplicar reglas.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ServiciosApi } from "../api/servicios.ts";
import { useCalculo } from "../calculo/usarCalculo.ts";
import { useOpcionesPrecio, useTiposAdicional, type OpcionesCargadas } from "../catalogos/hooks.ts";
import { ESTADO_INICIAL, conceptosEnUso, reducir } from "./estado.ts";
import { armarSolicitud, huellaCaptura, validarCaptura, type ErroresCampo } from "./solicitud.ts";

export function useCaptura(servicios: ServiciosApi) {
  const [estado, despachar] = useReducer(reducir, ESTADO_INICIAL);
  const captura = estado.captura;
  const [mostrarErrores, setMostrarErrores] = useState(false);
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

  /** Errores que vienen de otra fuente (p. ej., formato al guardar o pendientes del servidor). */
  const [erroresExternos, setErroresExternos] = useState<ErroresCampo>({});

  // Errores visibles junto a cada campo: los locales tras un intento de cálculo, los externos y los
  // del servidor (400) mientras correspondan a la captura actual.
  const erroresVisibles: ErroresCampo = useMemo(() => {
    const e: ErroresCampo = mostrarErrores ? { ...erroresLocales } : {};
    for (const [ruta, mensaje] of Object.entries(erroresExternos)) e[ruta] ??= mensaje;
    if (calculo.estado.fase === "rechazado" && calculo.estado.huella === huella) {
      for (const c of calculo.estado.campos) e[c.ruta] ??= c.mensaje;
    }
    return e;
  }, [mostrarErrores, erroresLocales, erroresExternos, calculo.estado, huella]);

  useEffect(() => {
    if (enfocarResumen > 0) refResumen.current?.focus();
  }, [enfocarResumen]);

  // Un error externo deja de mostrarse en cuanto cambia la captura.
  useEffect(() => {
    setErroresExternos((e) => (Object.keys(e).length > 0 ? {} : e));
  }, [captura]);

  const alCalcular = () => {
    if (!captura || huella === null) return;
    if (Object.keys(erroresLocales).length > 0) {
      setMostrarErrores(true);
      setEnfocarResumen((n) => n + 1);
      return;
    }
    void calculo.calcular(armarSolicitud(captura), huella);
  };

  /** Olvida el resultado previo y los errores mostrados (al salir o cargar otra captura). */
  const reiniciarResultado = useCallback(() => {
    calculo.reiniciar();
    setMostrarErrores(false);
  }, [calculo]);

  return {
    captura,
    despachar,
    opciones,
    tipos,
    huella,
    calculo,
    erroresLocales,
    erroresVisibles,
    mostrarErrores,
    setErroresExternos,
    refResumen,
    alCalcular,
    reiniciarResultado,
  };
}

export type EstadoEditorCaptura = ReturnType<typeof useCaptura>;
