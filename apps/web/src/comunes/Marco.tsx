/**
 * Marco común de las pantallas: salto al contenido, encabezado (con la sesión), navegación,
 * contenido principal y pie. El enlace de salto no cambia la ruta (las rutas usan el hash).
 */
import type { MouseEvent, ReactNode } from "react";
import { Encabezado } from "./componentes.tsx";

export function enfocarPrincipal(e?: MouseEvent): void {
  e?.preventDefault();
  const principal = document.getElementById("principal");
  principal?.focus();
  principal?.scrollIntoView?.({ block: "start" });
}

export function Marco({
  barraSesion,
  navegacion,
  pie,
  children,
}: {
  barraSesion?: ReactNode;
  navegacion?: ReactNode;
  pie: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <a className="saltar" href="#principal" onClick={enfocarPrincipal}>
        Saltar al contenido
      </a>
      <Encabezado>{barraSesion}</Encabezado>
      {navegacion}
      <main id="principal" tabIndex={-1}>
        {children}
      </main>
      <footer className="pie">
        <p>{pie}</p>
      </footer>
    </>
  );
}
