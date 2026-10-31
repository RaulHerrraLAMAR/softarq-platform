import "@fontsource/fira-code/latin-400.css";
import "./estilos/fuentes.css";
import "./estilos/tokens.css";
import "./estilos/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { leerConfiguracion } from "./config/configuracion.ts";
import { ProveedorSesion } from "./sesion/ProveedorSesion.tsx";
import { Raiz } from "./sesion/Raiz.tsx";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta el elemento raíz.");

const config = leerConfiguracion();
createRoot(raiz).render(
  <StrictMode>
    {config.ok ? (
      <ProveedorSesion urlApi={config.url}>
        <Raiz />
      </ProveedorSesion>
    ) : (
      <main className="error-configuracion">
        <h1>SoftArq DEMO</h1>
        <p role="alert">La configuración de la aplicación no es válida. Revise VITE_API_URL en la configuración pública de la web.</p>
      </main>
    )}
  </StrictMode>,
);
