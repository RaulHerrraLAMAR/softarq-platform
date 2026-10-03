/** Validación de la configuración al arrancar (sin base de datos). */
import { describe, expect, it } from "vitest";
import { ErrorConfiguracion, leerConfiguracion } from "../../config/entorno.js";

const CLAVE = "clave-secreta-de-prueba-123";
const base = { DATABASE_URL: `postgresql://softarq_app:${CLAVE}@localhost:5432/softarq_dev` };

function fallo(entorno: Record<string, string | undefined>): string {
  try {
    leerConfiguracion(entorno);
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorConfiguracion);
    const mensaje = (e as Error).message;
    expect(mensaje, "el mensaje nunca incluye la contraseña").not.toContain(CLAVE);
    return mensaje;
  }
  throw new Error("se esperaba un error de configuración");
}

describe("configuración de la API", () => {
  it("valores por omisión seguros", () => {
    expect(leerConfiguracion(base)).toEqual({
      databaseUrl: base.DATABASE_URL,
      host: "127.0.0.1",
      puerto: 3000,
      // Módulo 5: solo localhost (la cookie SameSite=Strict exige el mismo site que la API, ADR-0007).
      origenesCors: ["http://localhost:5173"],
      limiteGeneralPorMinuto: 120,
      limiteCalculoPorMinuto: 30,
      limiteCuerpoKb: 128,
      accesos: { ventanaMs: 15 * 60_000, fallosPorCuentaEIp: 5, fallosPorCuenta: 20, intentosPorIp: 30 },
      zonaHoraria: "America/Mexico_City",
      registro: "completo",
    });
  });

  it.each([
    ["API_HOST distinto de 127.0.0.1", { API_HOST: "0.0.0.0" }, /API_HOST/],
    ["CORS con comodín", { API_CORS_ORIGINS: "*" }, /nunca "\*"/],
    ["CORS no local", { API_CORS_ORIGINS: "https://ejemplo.com" }, /orígenes locales/],
    ["puerto inválido", { API_PORT: "80" }, /API_PORT/],
    ["zona horaria inválida", { SOFTARQ_ZONA_HORARIA: "Marte/Olimpo" }, /SOFTARQ_ZONA_HORARIA/],
    ["límite no numérico", { API_LIMITE_CALCULO_POR_MINUTO: "muchos" }, /API_LIMITE_CALCULO_POR_MINUTO/],
    // ADR-0007: la cookie sin Secure solo es admisible en local por HTTP.
    ["NODE_ENV de producción", { NODE_ENV: "production" }, /NODE_ENV=production/],
    ["origen https (la cookie no lleva Secure)", { API_CORS_ORIGINS: "https://localhost:5173" }, /orígenes locales/],
    ["límite de accesos fuera de rango", { API_ACCESO_FALLOS_CUENTA_IP: "0" }, /API_ACCESO_FALLOS_CUENTA_IP/],
  ])("rechaza %s", (_n, extra, patron) => {
    expect(fallo({ ...base, ...extra })).toMatch(patron);
  });

  it.each(["postgres", "softarq_migrator"])("rechaza ejecutar el servidor con el rol %s", (rol) => {
    expect(fallo({ DATABASE_URL: `postgresql://${rol}:${CLAVE}@localhost:5432/softarq_dev` })).toMatch(/softarq_app/);
  });

  it("rechaza una base de datos remota o sin URL", () => {
    expect(fallo({ DATABASE_URL: `postgresql://softarq_app:${CLAVE}@db.ejemplo.com:5432/x` })).toMatch(/local/);
    expect(fallo({})).toMatch(/DATABASE_URL/);
  });

  it("acepta orígenes locales explícitos", () => {
    const c = leerConfiguracion({ ...base, API_CORS_ORIGINS: "http://localhost:5173, http://127.0.0.1:4173" });
    expect(c.origenesCors).toEqual(["http://localhost:5173", "http://127.0.0.1:4173"]);
  });
});
