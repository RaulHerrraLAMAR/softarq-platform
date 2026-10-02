import "@fontsource/fira-sans/latin-400.css";
import "@fontsource/fira-sans/latin-500.css";
import "@fontsource/fira-sans/latin-600.css";
import "@fontsource/fira-code/latin-400.css";
import "./estilos/tokens.css";
import "./estilos/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { crearClienteApi } from "./api/cliente.ts";
import { crearServicios } from "./api/servicios.ts";
import { App } from "./App.tsx";
import { leerConfiguracion } from "./config/configuracion.ts";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta el elemento raíz.");

const config = leerConfiguracion();
createRoot(raiz).render(
  <StrictMode>
    {config.ok ? (
      <App servicios={crearServicios(crearClienteApi(config.url))} />
    ) : (
      <main className="error-configuracion">
        <h1>SoftArq DEMO</h1>
        <p role="alert">La configuración de la aplicación no es válida. Revise VITE_API_URL en la configuración pública de la web.</p>
      </main>
    )}
  </StrictMode>,
);
