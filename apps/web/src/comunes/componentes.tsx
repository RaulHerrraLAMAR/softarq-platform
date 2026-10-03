/**
 * Componentes visuales comunes. Todo texto recibido se representa como texto (React lo escapa);
 * no se interpreta HTML.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type VarianteBoton = "primario" | "secundario" | "peligro" | "enlace";

export function Boton({
  variante = "secundario",
  className,
  type = "button",
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton }) {
  return <button type={type} className={`boton boton-${variante}${className ? ` ${className}` : ""}`} {...resto} />;
}

export type TonoAviso = "info" | "aviso" | "error" | "correcto";

const ICONOS: Record<TonoAviso, ReactNode> = {
  info: <path d="M12 8h.01M11 12h1v5h1" />,
  aviso: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  error: <path d="M15 9l-6 6M9 9l6 6" />,
  correcto: <path d="M20 6 9 17l-5-5" />,
};

/** Icono decorativo: el significado siempre está también en el texto. */
export function Icono({ tono }: { tono: TonoAviso }) {
  return (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {tono === "info" || tono === "error" ? <circle cx="12" cy="12" r="10" /> : null}
      {ICONOS[tono]}
    </svg>
  );
}

export function Aviso({
  tono,
  titulo,
  children,
  rol,
  id,
}: {
  tono: TonoAviso;
  titulo?: string;
  children?: ReactNode;
  /** `alert` solo para errores que requieren atención inmediata. */
  rol?: "alert" | "status";
  id?: string;
}) {
  return (
    <div className={`aviso aviso-${tono}`} role={rol} id={id}>
      <Icono tono={tono} />
      <div>
        {titulo ? <p className="aviso-titulo">{titulo}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function Insignia({ tono = "neutra", children }: { tono?: "neutra" | "demo" | "menor" | "estado"; children: ReactNode }) {
  return <span className={`insignia insignia-${tono}`}>{children}</span>;
}

/** Bloque de carga. Sin animación si el usuario prefiere movimiento reducido (CSS). */
export function Esqueleto({ lineas = 3, etiqueta }: { lineas?: number; etiqueta: string }) {
  return (
    <div className="esqueleto" role="status" aria-label={etiqueta}>
      {Array.from({ length: lineas }, (_, i) => (
        <span key={i} className="esqueleto-linea" />
      ))}
      <span className="solo-lector">{etiqueta}</span>
    </div>
  );
}

export function Codigo({ children }: { children: ReactNode }) {
  return <span className="codigo">{children}</span>;
}

/** Encabezado común: marca, insignia y leyenda DEMO; `children` (p. ej., la sesión) a la derecha. */
export function Encabezado({ children }: { children?: ReactNode }) {
  return (
    <header className="encabezado">
      <div className="encabezado-marca">
        <span className="marca">SoftArq</span>
        <span className="marca-sub">Cotizador de estructuras</span>
        <Insignia tono="demo">DEMO</Insignia>
      </div>
      <p className="encabezado-leyenda">Datos ilustrativos, sin validez comercial.</p>
      {children}
    </header>
  );
}
