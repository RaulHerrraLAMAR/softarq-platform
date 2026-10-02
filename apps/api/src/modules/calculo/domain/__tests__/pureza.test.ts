/** Determinismo, inmutabilidad de la entrada y vista comercial sin datos internos (D-16). */
import { LEYENDA_DEMO } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { calcularCotizacion } from "../motor.js";
import { aVistaComercial } from "../vista-comercial.js";
import { calculado, congelar } from "./ayudas.js";
import { ejemplo314 } from "./fixtures/ejemplo-3-14.js";
import { ESCENARIOS } from "./fixtures/escenarios.js";

describe("pureza del motor", () => {
  it("no modifica la entrada (congelada en profundidad) y la deja idéntica", () => {
    const e = ejemplo314();
    const copia = structuredClone(e);
    congelar(e);
    expect(() => calcularCotizacion(e)).not.toThrow();
    expect(e).toEqual(copia);
  });

  it("misma entrada, mismo resultado", () => {
    for (const { entrada } of ESCENARIOS) {
      expect(calcularCotizacion(structuredClone(entrada))).toEqual(calcularCotizacion(structuredClone(entrada)));
    }
  });

  it("el resultado no comparte referencias con la entrada", () => {
    const e = ejemplo314();
    const r = calculado(calcularCotizacion(e));
    r.consumos[0]!.excepcionIds.push("X");
    expect(calculado(calcularCotizacion(e)).consumos[0]!.excepcionIds).toEqual([]);
  });

  it("los resultados son texto decimal, nunca number", () => {
    const r = calculado(calcularCotizacion(ejemplo314()));
    const numeros: string[] = [];
    const recorrer = (o: unknown, ruta: string) => {
      if (typeof o === "number" && !/numero|compraNumero/.test(ruta)) numeros.push(ruta);
      else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) recorrer(v, `${ruta}.${k}`);
    };
    recorrer(r, "r");
    expect(numeros).toEqual([]);
  });
});

describe("vista comercial (D-16)", () => {
  const r = calculado(calcularCotizacion(ejemplo314()));
  const v = aVistaComercial(r);

  it("contiene lo comercial: partidas, subtotal, impuesto con tasa, total y leyenda DEMO", () => {
    expect(v.total).toBe("18790.94");
    expect(v.subtotal).toBe("16199.09");
    expect(v.impuesto).toEqual({ nombre: "Impuesto (tasa ilustrativa)", tasa: "0.16", importe: "2591.85" });
    expect(v.leyenda).toBe(LEYENDA_DEMO);
    expect(v.partidas.map((p) => p.importe)).toEqual(["4605.88", "9913.21", "720.00", "960.00"]);
  });

  it("no contiene costos, proveedores, productos, consumos, recargo, margen ni excepciones", () => {
    const texto = JSON.stringify(v).toLowerCase();
    for (const prohibido of [
      "costo",
      "proveedor",
      "prv-",
      "producto",
      "pcm-",
      "consumo",
      "rendimiento",
      "desperdicio",
      "sobrante",
      "recargo",
      "margen",
      "excepcion",
      "compra",
      "ins-",
      "tarifa",
    ]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });

  it("en PRODUCCION no lleva leyenda DEMO", () => {
    const e = ejemplo314();
    const prod = calculado(calcularCotizacion({ ...e, parametros: { ...e.parametros, ambiente: "PRODUCCION" } }));
    expect(aVistaComercial(prod).leyenda).toBeNull();
  });
});
