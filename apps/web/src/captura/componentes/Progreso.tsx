/**
 * Progreso del flujo. Cada paso indica su estado con texto e icono, no solo con color.
 */
import { Icono } from "../../comunes/componentes.tsx";
import type { Captura } from "../estado.ts";
import type { ErroresCampo } from "../solicitud.ts";

export type EstadoResultado = "sin_calcular" | "calculando" | "calculado" | "bloqueado" | "pendiente" | "error";

interface Paso {
  ancla: string;
  nombre: string;
  completo: boolean | null;
  detalle: string;
}

function pasos(c: Captura, errores: ErroresCampo, resultado: EstadoResultado): Paso[] {
  const claves = Object.keys(errores);
  const conceptos = c.partidas.filter((p) => p.tipo === "CONCEPTO").length;
  const adicionales = c.partidas.filter((p) => p.tipo === "ADICIONAL");
  const faltanOpciones = claves.filter((k) => k.startsWith("seleccion.")).length;
  const erroresOpciones = faltanOpciones + (errores["consolidarCompras"] || errores["preciosElegidos"] ? 1 : 0);
  const enPartidas = (tipo: "CONCEPTO" | "ADICIONAL") => {
    const indices = new Set(c.partidas.flatMap((p, i) => (p.tipo === tipo ? [i] : [])));
    return claves.filter((k) => {
      const m = /^partidas\[(\d+)\]/.exec(k);
      return m ? indices.has(Number(m[1])) : false;
    }).length;
  };
  const erroresPartidas = enPartidas("CONCEPTO") + (errores["partidas"] ? 1 : 0);
  const erroresAdicionales = enPartidas("ADICIONAL");

  return [
    {
      ancla: "seccion-partidas",
      nombre: "Partidas y medidas",
      completo: conceptos > 0 && erroresPartidas === 0,
      detalle:
        conceptos === 0 ? "sin conceptos" : erroresPartidas === 0 ? `${conceptos} ${conceptos === 1 ? "concepto" : "conceptos"}` : "faltan datos",
    },
    {
      ancla: "seccion-opciones",
      nombre: "Opciones disponibles",
      completo: conceptos > 0 && erroresOpciones === 0,
      detalle:
        conceptos === 0
          ? "sin insumos"
          : faltanOpciones > 0
            ? `falta elegir ${faltanOpciones}`
            : erroresOpciones > 0
              ? "faltan datos"
              : "completo",
    },
    {
      ancla: "seccion-adicionales",
      nombre: "Costos adicionales",
      completo: adicionales.length === 0 ? null : erroresAdicionales === 0,
      detalle: adicionales.length === 0 ? "opcional" : erroresAdicionales === 0 ? `${adicionales.length} capturados` : "faltan datos",
    },
    {
      ancla: "seccion-resultado",
      nombre: "Resultado",
      completo: resultado === "calculado" ? true : resultado === "sin_calcular" || resultado === "calculando" ? null : false,
      detalle: {
        sin_calcular: "sin calcular",
        calculando: "calculando…",
        calculado: "calculado",
        bloqueado: "bloqueado",
        pendiente: "pendiente de recalcular",
        error: "con error",
      }[resultado],
    },
  ];
}

export function Progreso({ captura, errores, resultado }: { captura: Captura; errores: ErroresCampo; resultado: EstadoResultado }) {
  return (
    <nav className="progreso" aria-label="Progreso de la cotización">
      <ol>
        {pasos(captura, errores, resultado).map((p, i) => (
          <li key={p.ancla} className={`paso paso-${p.completo === true ? "completo" : p.completo === false ? "pendiente" : "neutro"}`}>
            <a href={`#${p.ancla}`}>
              <span className="paso-icono">
                {p.completo === true ? <Icono tono="correcto" /> : p.completo === false ? <Icono tono="aviso" /> : <span className="paso-numero">{i + 1}</span>}
              </span>
              <span className="paso-texto">
                <span className="paso-nombre">{p.nombre}</span>
                <span className="paso-detalle">{p.detalle}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
