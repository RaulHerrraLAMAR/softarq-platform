import { EsquemaCapturaSolicitud } from "@softarq/contracts/cliente";
import { describe, expect, it } from "vitest";
import { CATALOGO } from "../../pruebas/datos-cliente";
import {
  agregarRenglon,
  agregarTrabajo,
  aContrato,
  cambiarNotas,
  cambiarRenglon,
  cambiarTrabajo,
  CAPTURA_LOCAL_VACIA,
  desdeContrato,
  huellaCalculo,
  explicarMedida,
  leerMedida,
  leerPiezas,
  quitarRenglon,
  quitarTrabajo,
  validarLocal,
  type CapturaLocal,
} from "../modelo";

const conCubierta = (): { c: CapturaLocal; id: string } => {
  const { captura, id } = agregarTrabajo(CAPTURA_LOCAL_VACIA, "CUBIERTA", "LAMINA");
  return { c: captura, id };
};

describe("leerMedida", () => {
  it("acepta punto o coma decimal y devuelve el texto canónico", () => {
    expect(leerMedida("6.50")).toEqual({ estado: "ok", valor: "6.50" });
    expect(leerMedida("6,5")).toEqual({ estado: "ok", valor: "6.5" });
    expect(leerMedida(".5")).toEqual({ estado: "ok", valor: "0.5" });
    expect(leerMedida("6.")).toEqual({ estado: "ok", valor: "6" });
    expect(leerMedida(" 06 ")).toEqual({ estado: "ok", valor: "6" });
  });
  it("vacío es pendiente; cero, negativos, texto y exponentes son inválidos", () => {
    expect(leerMedida("")).toEqual({ estado: "pend", valor: null });
    expect(leerMedida("   ").estado).toBe("pend");
    for (const malo of ["0", "00", "-1", "abc", "1e3", "6.5.1", "6 5", "501"]) expect(leerMedida(malo).estado, malo).toBe("inv");
  });
  it("el máximo de 500 m es válido", () => {
    expect(leerMedida("500").estado).toBe("ok");
    expect(leerMedida("500.01").estado).toBe("inv");
  });
  it("las piezas son obligatorias y llegan hasta 1000", () => {
    expect(leerPiezas("").estado).toBe("inv");
    expect(leerPiezas("1").estado).toBe("ok");
    expect(leerPiezas("1000").estado).toBe("ok");
    expect(leerPiezas("1001").estado).toBe("inv");
  });
});

describe("conversión con el contrato", () => {
  it("la captura que se guarda cumple el esquema del contrato", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "6,5");
    c = cambiarRenglon(c, id, "secciones", 0, "ancho", "4");
    const contrato = aContrato(c, CATALOGO);
    expect(EsquemaCapturaSolicitud.safeParse(contrato).success).toBe(true);
    expect(contrato.trabajos[0]!.secciones[0]).toMatchObject({ largo: "6.5", ancho: "4", alto: null, piezas: "1" });
  });

  it("una medida inválida o vacía viaja como «sin capturar» y una dimensión que el trabajo no pide, también", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "abc");
    c = cambiarRenglon(c, id, "secciones", 0, "alto", "3"); // la cubierta no pide alto
    const r = aContrato(c, CATALOGO).trabajos[0]!.secciones[0]!;
    expect(r.largo).toBeNull();
    expect(r.ancho).toBeNull();
    expect(r.alto).toBeNull();
  });

  it("no guarda huecos en un trabajo que no los admite", () => {
    let { c, id } = conCubierta();
    c = agregarRenglon(c, id, "huecos");
    expect(aContrato(c, CATALOGO).trabajos[0]!.huecos).toEqual([]);
  });

  it("guarda las piezas inválidas como 1 y recorta las notas vacías a null", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "piezas", "0");
    c = cambiarNotas(c, "   ");
    const contrato = aContrato(c, CATALOGO);
    expect(contrato.trabajos[0]!.secciones[0]!.piezas).toBe("1");
    expect(contrato.notas).toBeNull();
  });

  it("ida y vuelta: lo que guarda el servidor se vuelve a leer igual", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "6");
    c = cambiarRenglon(c, id, "secciones", 0, "ancho", "6");
    const contrato = aContrato(c, CATALOGO);
    expect(aContrato(desdeContrato(contrato), CATALOGO)).toEqual(contrato);
  });
});

describe("validación de apoyo", () => {
  it("sin trabajos hay un pendiente; un trabajo nuevo pide sus medidas", () => {
    expect(validarLocal(CAPTURA_LOCAL_VACIA, CATALOGO).pendientes.map((p) => p.ruta)).toEqual(["trabajos"]);
    const { c } = conCubierta();
    const v = validarLocal(c, CATALOGO);
    expect(v.errores).toEqual([]);
    expect(v.pendientes.map((p) => p.ruta)).toEqual(["trabajos[0].secciones[0].largo", "trabajos[0].secciones[0].ancho"]);
  });

  it("separa lo pendiente de lo mal escrito, con la ruta que usa el servidor", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "-3");
    const v = validarLocal(c, CATALOGO);
    expect(v.errores.map((e) => e.ruta)).toEqual(["trabajos[0].secciones[0].largo"]);
    expect(v.pendientes.map((p) => p.ruta)).toEqual(["trabajos[0].secciones[0].ancho"]);
  });

  it("completa cuando todas las medidas que pide el trabajo son válidas", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "6");
    c = cambiarRenglon(c, id, "secciones", 0, "ancho", "6");
    expect(validarLocal(c, CATALOGO)).toEqual({ errores: [], pendientes: [] });
  });

  it("los huecos solo se revisan donde el trabajo los admite", () => {
    let { captura: c, id } = agregarTrabajo(CAPTURA_LOCAL_VACIA, "MURO", "TABIQUE");
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "8");
    c = cambiarRenglon(c, id, "secciones", 0, "alto", "2.5");
    c = agregarRenglon(c, id, "huecos");
    const v = validarLocal(c, CATALOGO);
    expect(v.pendientes.map((p) => p.ruta)).toEqual(["trabajos[0].huecos[0].largo", "trabajos[0].huecos[0].alto"]);
  });

  it("un trabajo que ya no existe en el catálogo es un error", () => {
    const { captura } = agregarTrabajo(CAPTURA_LOCAL_VACIA, "TECHO", "X");
    expect(validarLocal(captura, CATALOGO).errores[0]!.ruta).toBe("trabajos[0].opcionCodigo");
  });
});

describe("operaciones sobre la captura", () => {
  it("los trabajos tienen identificadores propios y no se reutilizan", () => {
    let c = CAPTURA_LOCAL_VACIA;
    const a = agregarTrabajo(c, "CUBIERTA", "LAMINA");
    const b = agregarTrabajo(a.captura, "LOSA", "CONCRETO");
    expect([a.id, b.id]).toEqual(["t1", "t2"]);
    c = quitarTrabajo(b.captura, "t1");
    expect(agregarTrabajo(c, "MURO", "TABIQUE").id).toBe("t3");
  });

  it("editar, agregar o quitar un trabajo no toca los demás", () => {
    let c = CAPTURA_LOCAL_VACIA;
    c = agregarTrabajo(c, "CUBIERTA", "LAMINA").captura;
    c = agregarTrabajo(c, "LOSA", "CONCRETO").captura;
    const [t1, t2] = c.trabajos;
    const editado = cambiarRenglon(c, "t1", "secciones", 0, "largo", "9");
    expect(editado.trabajos[1]).toBe(t2);
    expect(editado.trabajos[0]).not.toBe(t1);
    const sinT1 = quitarTrabajo(c, "t1");
    expect(sinT1.trabajos).toEqual([t2]);
    const conOtraSeccion = agregarRenglon(c, "t2", "secciones");
    expect(conOtraSeccion.trabajos[0]).toBe(t1);
    expect(conOtraSeccion.trabajos[1]!.secciones).toHaveLength(2);
  });

  it("cambiar de trabajo conserva las medidas escritas", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "7");
    c = cambiarTrabajo(c, id, "LOSA", "CONCRETO");
    expect(c.trabajos[0]).toMatchObject({ trabajoCodigo: "LOSA", opcionCodigo: "CONCRETO" });
    expect(c.trabajos[0]!.secciones[0]!.largo).toBe("7");
  });

  it("respeta el máximo de secciones y quita la sección indicada", () => {
    let { c, id } = conCubierta();
    for (let i = 0; i < 40; i++) c = agregarRenglon(c, id, "secciones");
    expect(c.trabajos[0]!.secciones).toHaveLength(20);
    c = cambiarRenglon(c, id, "secciones", 3, "nombre", "Faldón norte");
    c = quitarRenglon(c, id, "secciones", 3);
    expect(c.trabajos[0]!.secciones).toHaveLength(19);
    expect(c.trabajos[0]!.secciones.some((s) => s.nombre === "Faldón norte")).toBe(false);
  });
});

describe("huella del cálculo", () => {
  it("no cambia con el nombre de la sección ni con las notas, y sí con una medida", () => {
    let { c, id } = conCubierta();
    c = cambiarRenglon(c, id, "secciones", 0, "largo", "6");
    const base = huellaCalculo(c, CATALOGO);
    expect(huellaCalculo(cambiarRenglon(c, id, "secciones", 0, "nombre", "Norte"), CATALOGO)).toBe(base);
    expect(huellaCalculo(cambiarNotas(c, "una nota"), CATALOGO)).toBe(base);
    expect(huellaCalculo(cambiarRenglon(c, id, "secciones", 0, "largo", "6.1"), CATALOGO)).not.toBe(base);
    expect(huellaCalculo(cambiarRenglon(c, id, "secciones", 0, "largo", "6,0"), CATALOGO)).toBe(base);
  });
});

describe("explicarMedida", () => {
  it("no explica lo válido ni lo vacío", () => {
    expect(explicarMedida("6.50")).toBeNull();
    expect(explicarMedida("")).toBeNull();
    expect(explicarMedida("500")).toBeNull();
  });
  it("dice el límite cuando el número es demasiado grande, sin cambiar lo que se acepta", () => {
    expect(leerMedida("2000000").estado).toBe("inv");
    expect(explicarMedida("2000000")).toContain("máximo es 500 m");
    expect(explicarMedida("500.01")).toContain("máximo es 500 m");
  });
  it("distingue cero, texto y exceso de decimales", () => {
    expect(explicarMedida("0")).toBe("Debe ser mayor que 0.");
    expect(explicarMedida("abc")).toContain("solo números");
    expect(explicarMedida("1.12345678901")).toContain("10 decimales");
  });
});
