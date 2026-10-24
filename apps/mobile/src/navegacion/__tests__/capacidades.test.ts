import { describe, expect, it } from "vitest";
import { CAPACIDADES_CLIENTE } from "../../pruebas/ayudas";
import { iniciales, primerNombre, seccionesDe, tiene } from "../capacidades";

describe("secciones según las capacidades del servidor", () => {
  it("una cuenta de cliente completa ve solicitudes y cotizaciones", () => {
    expect(seccionesDe(CAPACIDADES_CLIENTE)).toEqual({ solicitudes: true, cotizaciones: true });
  });

  it("sin la capacidad, la sección no se ofrece (la API vuelve a comprobarla en cada solicitud)", () => {
    expect(seccionesDe(["sesion.propia"])).toEqual({ solicitudes: false, cotizaciones: false });
    expect(seccionesDe(["sesion.propia", "cliente.cotizaciones"])).toEqual({ solicitudes: false, cotizaciones: true });
  });

  it("las capacidades del equipo no abren nada en la app", () => {
    expect(seccionesDe(["sesion.propia", "clientes.consultar", "cotizaciones.consultar", "solicitudes.atender"])).toEqual({ solicitudes: false, cotizaciones: false });
    expect(tiene(["clientes.consultar"], "cliente.solicitudes")).toBe(false);
  });
});

describe("nombre de la persona", () => {
  it("saluda por el primer nombre y quita la marca de datos de demostración", () => {
    expect(primerNombre("Laura Méndez")).toBe("Laura");
    expect(primerNombre("[DEMO] Constructora Ríos y Asociados")).toBe("Constructora");
    expect(primerNombre("  Raúl  ")).toBe("Raúl");
  });

  it("las iniciales usan el primer nombre y el último apellido", () => {
    expect(iniciales("Laura Méndez")).toBe("LM");
    expect(iniciales("Despacho Aranda Arquitectos")).toBe("DA");
    expect(iniciales("Raúl")).toBe("R");
    expect(iniciales("   ")).toBe("?");
  });
});
