import { Aviso, Pantalla } from "./componentes";

/** Pantalla a la que se llega sin la capacidad (por un enlace o una pestaña ya oculta). La API decide en todo caso. */
export function SinAcceso({ texto = "Su función no permite consultar esto." }: { texto?: string }) {
  return (
    <Pantalla>
      <Aviso tono="aviso" texto={texto} />
    </Pantalla>
  );
}
