/**
 * Revisión estática del código de la app (ADR-0020): lo que nunca debe aparecer en `app/` ni `src/`.
 * Complementa la comprobación del bundle empaquetado (`scripts/comprobar-bundle.mjs`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "pruebas" ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

const FUENTES = [...archivos(join(RAIZ, "src")), ...archivos(join(RAIZ, "app"))].map((ruta) => ({
  nombre: relative(RAIZ, ruta).replaceAll("\\", "/"),
  texto: readFileSync(ruta, "utf8"),
}));

const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("código de la app", () => {
  it("hay código que revisar", () => expect(FUENTES.length).toBeGreaterThan(10));

  it("no persiste en AsyncStorage, archivos ni almacenamiento web (la sesión solo va en SecureStore)", () => {
    for (const f of FUENTES) {
      expect(sinComentarios(f.texto), f.nombre).not.toMatch(/AsyncStorage|localStorage|sessionStorage|expo-file-system|react-native-mmkv|expo-sqlite/);
    }
  });

  it("no escribe registros (console.*) que puedan filtrar tokens, contraseñas o cuerpos", () => {
    for (const f of FUENTES) expect(sinComentarios(f.texto), f.nombre).not.toMatch(/\bconsole\.(log|info|debug|warn|error)\b/);
  });

  it("solo importa contratos públicos: nada del motor, Prisma, base de datos ni código de Node del servidor", () => {
    // `src/api` es la carpeta propia del cliente HTTP de la app; lo prohibido es el servidor (`apps/api`).
    const prohibido = /from\s+["'](?:@softarq\/api|[^"']*apps\/api[^"']*|[^"']*\bapi\/src[^"']*|@prisma\/[^"']*|prisma|pg|@nestjs\/[^"']*|@node-rs\/[^"']*|argon2|express|node:[^"']*)["']/;
    for (const f of FUENTES) {
      const codigo = sinComentarios(f.texto);
      expect(codigo, f.nombre).not.toMatch(prohibido);
      for (const m of codigo.matchAll(/from\s+["'](@softarq\/[^"']+)["']/g)) expect(m[1], f.nombre).toBe("@softarq/contracts/movil");
    }
  });

  it("la única variable pública EXPO_PUBLIC_* es la URL de la API (nunca credenciales)", () => {
    for (const f of FUENTES) {
      for (const m of f.texto.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) expect(m[0], f.nombre).toBe("EXPO_PUBLIC_API_URL");
    }
  });

  it("no hay credenciales, cadenas de conexión ni contraseñas escritas en el código", () => {
    for (const f of FUENTES) {
      expect(f.texto, f.nombre).not.toMatch(/postgres(?:ql)?:\/\/|DATABASE_URL|MIGRATION_DATABASE_URL|Bearer [A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC )?PRIVATE KEY/);
    }
  });

  it("no usa WebView ni carga la web: la interfaz es React Native", () => {
    for (const f of FUENTES) expect(f.texto, f.nombre).not.toMatch(/react-native-webview|<WebView|expo-web-browser|localhost:5173/);
  });

  it("no envía por la red ni muestra las claves internas de costos o márgenes", () => {
    for (const f of FUENTES) expect(sinComentarios(f.texto), f.nombre).not.toMatch(/costoDirecto|costoCompra|costoMateriales|costoProrrateado|\bmargen\b|recargoSobreCosto|referenciasInternas|salidas-internas/);
  });
});
