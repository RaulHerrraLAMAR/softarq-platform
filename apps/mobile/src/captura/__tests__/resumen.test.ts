import { describe, expect, it } from "vitest";
import { CATALOGO } from "../../pruebas/datos-cliente";
import { agregarRenglon, agregarTrabajo, cambiarRenglon, CAPTURA_LOCAL_VACIA, type CapturaLocal } from "../modelo";
import { indiceDeRuta, resumirTrabajos, textoDeAvance, textoDeFaltantes } from "../resumen";

function conTres(): CapturaLocal {
  let c = agregarTrabajo(CAPTURA_LOCAL_VACIA, "CUBIERTA", "LAMINA").captura;
  c = cambiarRenglon(c, "t1", "secciones", 0, "largo", "6");
  c = cambiarRenglon(c, "t1", "secciones", 0, "ancho", "6");
  c = agregarTrabajo(c, "LOSA", "CONCRETO").captura;
  c = cambiarRenglon(c, "t2", "secciones", 0, "largo", "5");
  c = agregarTrabajo(c, "MURO", "TABIQUE").captura;
  c = cambiarRenglon(c, "t3", "secciones", 0, "largo", "abc");
  return c;
}

describe("resumen de trabajos", () => {
  const r = resumirTrabajos(conTres(), CATALOGO);

  it("distingue completo, incompleto y con errores", () => {
    expect(r.map((x) => [x.nombre, x.estado])).toEqual([["Cubierta", "completo"], ["Losa", "incompleto"], ["Muro", "con_errores"]]);
  });

  it("describe cada sección con sus medidas y marca lo que falta o hay que revisar", () => {
    expect(r[0]!.secciones).toEqual(["Largo 6 m · Ancho 6 m"]);
    expect(r[1]!.secciones).toEqual(["Largo 5 m · Ancho: falta · Espesor: falta"]);
    expect(r[2]!.secciones).toEqual(["Largo: revisar · Alto: falta"]);
  });

  it("cada trabajo solo lleva sus propios campos pendientes (la ruta dice a cuál pertenece)", () => {
    expect(r[1]!.campos.map((c) => c.ruta)).toEqual(["trabajos[1].secciones[0].ancho", "trabajos[1].secciones[0].alto"]);
    expect(r[0]!.campos).toEqual([]);
    expect(indiceDeRuta("trabajos[2].secciones[0].largo")).toBe(2);
    expect(indiceDeRuta("trabajos")).toBeNull();
  });

  it("el avance cuenta los trabajos completos", () => {
    expect(textoDeAvance(r)).toBe("1 de 3 trabajos completos");
    expect(textoDeAvance(r.slice(0, 1))).toBe("1 de 1 trabajo completo");
  });

  it("nombra el hueco y las piezas, y no muestra huecos donde el trabajo no los admite", () => {
    let c = agregarTrabajo(CAPTURA_LOCAL_VACIA, "MURO", "TABIQUE").captura;
    c = cambiarRenglon(c, "t1", "secciones", 0, "largo", "8");
    c = cambiarRenglon(c, "t1", "secciones", 0, "alto", "2.5");
    c = cambiarRenglon(c, "t1", "secciones", 0, "nombre", "Fachada");
    c = agregarRenglon(c, "t1", "huecos");
    c = cambiarRenglon(c, "t1", "huecos", 0, "largo", "1.2");
    c = cambiarRenglon(c, "t1", "huecos", 0, "alto", "1");
    c = cambiarRenglon(c, "t1", "huecos", 0, "piezas", "3");
    const m = resumirTrabajos(c, CATALOGO)[0]!;
    expect(m.secciones).toEqual(["Fachada: Largo 8 m · Alto 2.5 m"]);
    expect(m.huecos).toEqual(["Largo 1.2 m · Alto 1 m · 3 piezas"]);
    expect(m.estado).toBe("completo");
  });
});

describe("texto de faltantes", () => {
  it("cuenta lo pendiente y lo que hay que corregir, de todo el borrador o de un trabajo", () => {
    const c = conTres();
    expect(textoDeFaltantes(c, CATALOGO)).toBe("1 medida por corregir · faltan 3 datos");
    expect(textoDeFaltantes(c, CATALOGO, "t1")).toBe("Todo listo");
    expect(textoDeFaltantes(c, CATALOGO, "t2")).toBe("faltan 2 datos");
    expect(textoDeFaltantes(c, CATALOGO, "t3")).toBe("1 medida por corregir · falta 1 dato");
  });
});
