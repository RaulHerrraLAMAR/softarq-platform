import { describe, expect, it } from "vitest";
import { TODAS_LAS_CAPACIDADES } from "../../pruebas/ayudas";
import { hayAlgoQueConsultar, seccionesDe, textoFunciones } from "../capacidades";

describe("navegación según las capacidades del servidor", () => {
  it("clientes y proyectos dependen de clientes.consultar; cotizaciones de cotizaciones.consultar", () => {
    expect(seccionesDe(["sesion.propia", "clientes.consultar"])).toEqual({ clientes: true, proyectos: true, cotizaciones: false });
    expect(seccionesDe(["sesion.propia", "cotizaciones.consultar"])).toEqual({ clientes: false, proyectos: false, cotizaciones: true });
    expect(seccionesDe(["sesion.propia"])).toEqual({ clientes: false, proyectos: false, cotizaciones: false });
  });

  it("las capacidades administrativas por sí solas no abren consultas de otra función", () => {
    const soloAdmin = seccionesDe(["sesion.propia", "catalogos.administrar", "parametros.administrar", "personas.administrar", "emisor.configurar", "clientes.gestionar"]);
    expect(hayAlgoQueConsultar(soloAdmin)).toBe(false);
  });

  it("las capacidades se combinan: quien tiene ambas ve todo; la matriz de funciones no se deduce en la app", () => {
    expect(seccionesDe(["clientes.consultar", "cotizaciones.consultar"])).toEqual({ clientes: true, proyectos: true, cotizaciones: true });
    expect(seccionesDe(TODAS_LAS_CAPACIDADES)).toEqual({ clientes: true, proyectos: true, cotizaciones: true });
  });

  it("la sesión restringida por contraseña temporal no muestra nada que consultar", () => {
    expect(hayAlgoQueConsultar(seccionesDe(["sesion.propia"]))).toBe(false);
  });

  it("muestra las funciones con los nombres de la web", () => {
    expect(textoFunciones(["ADMIN_CATALOGO", "ADMIN_SISTEMA"])).toBe("Administrador del catálogo · Administrador del sistema");
    expect(textoFunciones(["PREPARADOR", "REVISOR"])).toBe("Preparador · Revisor");
  });
});
