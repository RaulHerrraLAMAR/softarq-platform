import { describe, expect, it } from "vitest";
import { ClienteApi } from "../../api/cliente";
import { crearFetchFalso, TOKEN_A } from "../../pruebas/ayudas";
import { detalleCliente, detalleCotizacion, estaTruncada, listarClientes, listarCotizaciones, listarProyectos, versionCotizacion } from "../servicios";

const ID = "7d829aa4-fffc-4ec8-994a-eceea01d4700";

/** Cuerpos mínimos que cumplen cada contrato de lista. */
const LISTAS: Record<string, unknown> = {
  "/api/v1/clientes": { clientes: [], limite: 100 },
  "/api/v1/proyectos": { proyectos: [], limite: 100 },
  "/api/v1/cotizaciones": { cotizaciones: [], limite: 100 },
};

function api(cuerpo: unknown = {}) {
  const { fetch, peticiones } = crearFetchFalso((p) => ({ estado: 200, cuerpo: LISTAS[p.url.pathname] ?? cuerpo }));
  return { api: new ClienteApi({ baseUrl: "http://localhost:3000", fetch, token: () => TOKEN_A }), peticiones };
}

describe("consultas de la etapa 1 (endpoints existentes, solo GET)", () => {
  it("clientes: la búsqueda se recorta y no se envía vacía; la ruta es la de la API", async () => {
    const { api: a, peticiones } = api();
    await listarClientes(a, { buscar: "  Casa  " });
    await listarClientes(a, { buscar: "   " });
    // Se pide el máximo que admite la API (la pantalla avisa si la lista llegó al límite).
    expect(peticiones.map((p) => p.url.pathname + p.url.search)).toEqual(["/api/v1/clientes?buscar=Casa&limite=100", "/api/v1/clientes?limite=100"]);
    expect(estaTruncada(99)).toBe(false);
    expect(estaTruncada(100)).toBe(true);
    expect(peticiones.every((p) => p.metodo === "GET")).toBe(true);
  });

  it("proyectos y cotizaciones filtran por cliente o proyecto solo con UUID válidos", async () => {
    const { api: a, peticiones } = api();
    await listarProyectos(a, { clienteId: ID });
    await listarCotizaciones(a, { proyectoId: ID, buscar: "COT-2026" });
    expect(peticiones[0]!.url.search).toBe(`?clienteId=${ID}&limite=100`);
    expect(peticiones[1]!.url.searchParams.get("proyectoId")).toBe(ID);
    expect(() => listarProyectos(a, { clienteId: "../admin" })).toThrowError(/No se encontró/);
  });

  it("los identificadores de la ruta de la pantalla nunca arman rutas con texto libre", () => {
    const { api: a, peticiones } = api();
    for (const id of ["../../admin/personas", "1; DROP TABLE", "", ID + "/x", "%2e%2e"]) {
      expect(() => detalleCliente(a, id)).toThrow();
      expect(() => detalleCotizacion(a, id)).toThrow();
    }
    expect(() => versionCotizacion(a, ID, "0")).toThrow();
    expect(() => versionCotizacion(a, ID, "1/../2")).toThrow();
    expect(peticiones).toHaveLength(0);
  });

  it("la versión se pide por /cotizaciones/{id}/versiones/{n}", async () => {
    const { api: a, peticiones } = api();
    await versionCotizacion(a, ID, "3").catch(() => {}); // el cuerpo vacío no cumple el contrato: no importa aquí
    expect(peticiones[0]!.url.pathname).toBe(`/api/v1/cotizaciones/${ID}/versiones/3`);
  });
});
