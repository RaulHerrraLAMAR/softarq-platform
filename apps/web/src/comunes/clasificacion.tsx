/**
 * Clasificación de clientes (E3.8): presentación, QA o humo. Es una decisión explícita del Administrador del sistema con
 * motivo; sin clasificación = «sin clasificar». Nada se oculta por defecto: el filtro «Todas» muestra todo y el resto
 * identifica y consulta cada grupo. Los proyectos, cotizaciones y solicitudes heredan la categoría de su cliente.
 */
import type { Clasificacion, FiltroClasificacion } from "@softarq/contracts";
import { Insignia } from "./componentes.tsx";

export const TEXTO_CLASIFICACION: Record<Clasificacion, string> = { PRESENTACION: "Presentación", QA: "QA", HUMO: "Humo" };

/** Etiqueta de la clasificación; sin clasificar no pinta nada (solo la ficha lo dice). */
export function EtiquetaClasificacion({ valor }: { valor: Clasificacion | null | undefined }) {
  if (!valor) return null;
  return <Insignia tono={valor === "PRESENTACION" ? "estado" : valor === "QA" ? "neutra" : "menor"}>{TEXTO_CLASIFICACION[valor]}</Insignia>;
}

const OPCIONES: { valor: FiltroClasificacion | ""; texto: string }[] = [
  { valor: "", texto: "Todas" },
  { valor: "PRESENTACION", texto: "Presentación" },
  { valor: "QA", texto: "QA" },
  { valor: "HUMO", texto: "Humo" },
  { valor: "SIN_CLASIFICAR", texto: "Sin clasificar" },
];

export function FiltroClasificacionCampo({ valor, alCambiar, id = "filtro-clasificacion" }: { valor: FiltroClasificacion | undefined; alCambiar: (v: FiltroClasificacion | undefined) => void; id?: string }) {
  return (
    <div className="campo campo-filtro">
      <label htmlFor={id}>Clasificación</label>
      <select id={id} value={valor ?? ""} onChange={(e) => alCambiar(e.target.value === "" ? undefined : (e.target.value as FiltroClasificacion))}>
        {OPCIONES.map((o) => (
          <option key={o.valor || "todas"} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}
