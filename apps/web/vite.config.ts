import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { validarUrlApi } from "./src/config/url-api.ts";

/**
 * Web DEMO (ADR-0006):
 * - escucha solo en loopback (127.0.0.1), puertos fijos con strictPort; sin proxy ni hosts extra;
 * - la URL de la API se valida aquí (falla el arranque o la compilación) y se limita con CSP.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const api = validarUrlApi(process.env.VITE_API_URL ?? env.VITE_API_URL);
  if (!api.ok) throw new Error(`Configuración de la web inválida: ${api.motivo}`);

  return {
    plugins: [react(), politicaDeContenido(api.url, mode)],
    define: { "import.meta.env.VITE_API_URL": JSON.stringify(api.url) },
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
    build: { sourcemap: false, target: "es2022" },
  };
});

/** CSP: solo recursos propios y conexiones a la API configurada (en desarrollo, también HMR). */
function politicaDeContenido(urlApi: string, mode: string): Plugin {
  return {
    name: "softarq-csp",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const desarrollo = ctx.server !== undefined && mode !== "production";
        const conexiones = desarrollo ? `'self' ${urlApi} ws://127.0.0.1:5173 ws://localhost:5173` : `'self' ${urlApi}`;
        const scripts = desarrollo ? "'self' 'unsafe-inline'" : "'self'";
        const csp = [
          "default-src 'self'",
          `script-src ${scripts}`,
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "img-src 'self' data:",
          `connect-src ${conexiones}`,
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join("; ");
        return html.replace("%CSP%", csp);
      },
    },
  };
}
