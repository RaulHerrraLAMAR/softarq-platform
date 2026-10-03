import { EsquemaSolicitudCalculoDemo } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { EJEMPLOS } from "../../ejemplos/ejemplos.ts";
import { CON_AREA, CON_VOLUMEN, OPCIONES_AREA } from "../../pruebas/datos.ts";
import { ESTADO_INICIAL, reducir, type Accion, type Captura, type EstadoApp } from "../estado.ts";
import { armarSolicitud, huellaCaptura, validarCaptura } from "../solicitud.ts";

function aplicar(...acciones: Accion[]): Captura {
  const e = acciones.reduce<EstadoApp>((s, a) => reducir(s, a), ESTADO_INICIAL);
  if (!e.captura) throw new Error("sin captura");
  return e.captura;
}

function con(c: Captura, a: Accion): Captura {
  const r = reducir({ captura: c }, a).captura;
  if (!r) throw new Error("sin captura");
  return r;
}

const ejemplo1 = EJEMPLOS[0]!;
const sinPre7 = OPCIONES_AREA.map((i) => ({ ...i, opciones: i.opciones.filter((o) => o.precioCodigo !== "PRE-000007") }));

describe("captura propia", () => {
  it("empieza vacía, sin consolidación ni opciones elegidas", () => {
    const c = aplicar({ tipo: "INICIAR_PROPIA" }, { tipo: "AGREGAR_CONCEPTO", concepto: CON_AREA });
    expect(c.consolidarCompras).toBeNull();
    expect(c.seleccion).toEqual({});
    const conciliada = con(c, { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007"], insumos: OPCIONES_AREA });
    // La marca esMenorPrecio no elige por el usuario.
    expect(conciliada.seleccion).toEqual({});
    expect(conciliada.avisosSeleccion).toEqual({});
  });

  it("validación local: faltan medidas, consolidación y opciones", () => {
    const c = aplicar({ tipo: "INICIAR_PROPIA" }, { tipo: "AGREGAR_CONCEPTO", concepto: CON_AREA });
    const e = validarCaptura(c, OPCIONES_AREA);
    expect(e).toMatchObject({
      consolidarCompras: expect.any(String),
      "partidas[0].mediciones[0].largo": "Indique el largo.",
      "partidas[0].mediciones[0].ancho": "Indique el ancho.",
      "seleccion.INS-00004": expect.any(String),
      "seleccion.INS-00005": expect.any(String),
    });
    expect(e["partidas[0].mediciones[0].alto"]).toBeUndefined();
    expect(validarCaptura(c, null)["preciosElegidos"]).toMatch(/Espere/);
  });

  it("decimales con coma, espacios o sin entero se rechazan con la ayuda de formato", () => {
    let c = aplicar({ tipo: "INICIAR_PROPIA" }, { tipo: "AGREGAR_CONCEPTO", concepto: CON_VOLUMEN });
    const p = c.partidas[0]!;
    const r = p.tipo === "CONCEPTO" ? p.renglones[0]!.clave : "";
    c = con(c, { tipo: "EDITAR_RENGLON", partida: p.clave, renglon: r, cambios: { largo: "4,5", ancho: "1 0", alto: ".5" } });
    const e = validarCaptura(c, []);
    expect(e["partidas[0].mediciones[0].largo"]).toMatch(/punto decimal/);
    expect(e["partidas[0].mediciones[0].ancho"]).toMatch(/punto decimal/);
    expect(e["partidas[0].mediciones[0].alto"]).toMatch(/punto decimal/);
  });

  it("AREA: al cambiar la segunda medida se vacía la otra y solo se envía una", () => {
    let c = aplicar({ tipo: "INICIAR_PROPIA" }, { tipo: "AGREGAR_CONCEPTO", concepto: CON_AREA });
    const p = c.partidas[0]!;
    const r = p.tipo === "CONCEPTO" ? p.renglones[0]!.clave : "";
    const editar = (cambios: object) => {
      c = con(c, { tipo: "EDITAR_RENGLON", partida: p.clave, renglon: r, cambios });
    };
    editar({ largo: "6", ancho: "2.5" });
    editar({ segundaMedida: "alto" });
    editar({ alto: "2.7" });
    const pc = armarSolicitud(c).partidas[0]!;
    expect(pc.tipo === "CONCEPTO" && pc.mediciones[0]).toEqual({ descripcion: "", signo: "+", piezas: "1", largo: "6", ancho: null, alto: "2.7" });
  });

  it("agregar y quitar partidas, renglones y adicionales", () => {
    let c = aplicar(
      { tipo: "INICIAR_PROPIA" },
      { tipo: "AGREGAR_CONCEPTO", concepto: CON_AREA },
      { tipo: "AGREGAR_CONCEPTO", concepto: CON_VOLUMEN },
      { tipo: "AGREGAR_ADICIONAL" },
    );
    expect(c.partidas.map((p) => p.tipo)).toEqual(["CONCEPTO", "CONCEPTO", "ADICIONAL"]);
    const primera = c.partidas[0]!;
    c = con(c, { tipo: "AGREGAR_RENGLON", partida: primera.clave });
    const conRenglones = c.partidas[0]!;
    expect(conRenglones.tipo === "CONCEPTO" && conRenglones.renglones.length).toBe(2);
    if (conRenglones.tipo === "CONCEPTO") {
      c = con(c, { tipo: "QUITAR_RENGLON", partida: primera.clave, renglon: conRenglones.renglones[0]!.clave });
      const p = c.partidas[0]!;
      expect(p.tipo === "CONCEPTO" && p.renglones.length).toBe(1);
    }
    c = con(c, { tipo: "QUITAR_PARTIDA", clave: primera.clave });
    expect(c.partidas.map((p) => p.tipo)).toEqual(["CONCEPTO", "ADICIONAL"]);
    expect(armarSolicitud(c).partidas.map((p) => p.id)).toEqual(["P001", "P002"]);
  });
});

describe("ejemplos", () => {
  const cargado = () => aplicar({ tipo: "CARGAR_EJEMPLO", ejemplo: ejemplo1, conceptos: [CON_AREA] });

  it("tras conciliar las opciones, la solicitud es exactamente la entrada pública del ejemplo", () => {
    const opciones = [
      ...OPCIONES_AREA,
      {
        insumoCodigo: "INS-00006",
        insumoDescripcion: "[DEMO] Larguero",
        unidadBase: "kg",
        conceptos: ["CON-00007"],
        opciones: [{ ...OPCIONES_AREA[1]!.opciones[0]!, precioCodigo: "PRE-000009" }],
      },
    ];
    const concepto = { ...CON_AREA, insumos: [...CON_AREA.insumos, { codigo: "INS-00006", descripcion: "[DEMO] Larguero", unidadBase: "kg" }] };
    const c0 = aplicar({ tipo: "CARGAR_EJEMPLO", ejemplo: ejemplo1, conceptos: [concepto] });
    const c = con(c0, { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007"], insumos: opciones });
    expect(c.avisosSeleccion).toEqual({});
    expect(validarCaptura(c, opciones)).toEqual({});
    expect(armarSolicitud(c)).toEqual(ejemplo1.solicitud);
  });

  it("una opción del ejemplo que ya no está disponible se avisa y no se sustituye", () => {
    const c = con(cargado(), { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007"], insumos: sinPre7 });
    expect(c.seleccion["INS-00004"]).toBeUndefined();
    expect(c.avisosSeleccion["INS-00004"]).toMatch(/ya no está disponible/);
    expect(c.seleccion["INS-00005"]).toBe("PRE-000008");
    // Elegir otra opción retira el aviso.
    const elegida = con(c, { tipo: "ELEGIR_OPCION", insumo: "INS-00004", precio: "PRE-000006" });
    expect(elegida.avisosSeleccion["INS-00004"]).toBeUndefined();
  });

  it("una selección que desaparece de las opciones vigentes se conserva con aviso (no se retira ni se sustituye)", () => {
    let c = con(cargado(), { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007"], insumos: OPCIONES_AREA });
    expect(c.seleccion["INS-00004"]).toBe("PRE-000007");
    c = con(c, { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007"], insumos: sinPre7 });
    expect(c.seleccion["INS-00004"]).toBe("PRE-000007");
    expect(c.avisosSeleccion["INS-00004"]).toMatch(/PRE-000007 ya no está disponible/);
    // Calcular exige la decisión del usuario.
    expect(validarCaptura(c, sinPre7)["seleccion.INS-00004"]).toMatch(/Elija otra o quite la selección/);
    const quitada = con(c, { tipo: "QUITAR_SELECCION", insumo: "INS-00004" });
    expect(quitada.seleccion["INS-00004"]).toBeUndefined();
    expect(quitada.avisosSeleccion["INS-00004"]).toBeUndefined();
  });

  it("opciones de otra lista de conceptos (respuesta atrasada) no se aplican", () => {
    const c = cargado();
    expect(con(c, { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00008"], insumos: OPCIONES_AREA })).toBe(c);
  });

  it("concepto del ejemplo ausente del catálogo: se avisa y no se inventa", () => {
    const c = aplicar({ tipo: "CARGAR_EJEMPLO", ejemplo: ejemplo1, conceptos: [] });
    expect(c.partidas.map((p) => p.tipo)).toEqual(["ADICIONAL"]);
    expect(c.avisosCarga[0]).toMatch(/CON-00007/);
  });
});

describe("solicitud", () => {
  it("solo contiene campos del contrato y los decimales siguen siendo texto", () => {
    const c = con(cargadoConOpciones(), { tipo: "FIJAR_CONSOLIDACION", valor: true });
    const s = armarSolicitud(c);
    expect(EsquemaSolicitudCalculoDemo.safeParse(s).success).toBe(true);
    expect(Object.keys(s).sort()).toEqual(["consolidarCompras", "partidas", "preciosElegidos"]);
    expect(JSON.stringify(s)).not.toMatch(/organizacion|fecha|costo|importe|total/i);
    const p = s.partidas[0]!;
    if (p.tipo !== "CONCEPTO") throw new Error("se esperaba un concepto");
    expect(typeof p.mediciones[0]!.largo).toBe("string");
  });

  it("los precios elegidos son solo de insumos de los conceptos actuales", () => {
    let c = aplicar({ tipo: "INICIAR_PROPIA" }, { tipo: "AGREGAR_CONCEPTO", concepto: CON_AREA });
    c = con(c, { tipo: "ELEGIR_OPCION", insumo: "INS-00004", precio: "PRE-000006" });
    c = con(c, { tipo: "ELEGIR_OPCION", insumo: "INS-00099", precio: "PRE-999999" });
    expect(armarSolicitud(c).preciosElegidos).toEqual(["PRE-000006"]);
  });

  it("la huella cambia con cualquier dato que afecte el cálculo", () => {
    let c = cargadoConOpciones();
    const h0 = huellaCaptura(c);
    const p = c.partidas[0]!;
    const r = p.tipo === "CONCEPTO" ? p.renglones[0]!.clave : "";
    c = con(c, { tipo: "EDITAR_RENGLON", partida: p.clave, renglon: r, cambios: { largo: "11" } });
    const h1 = huellaCaptura(c);
    expect(h1).not.toBe(h0);
    c = con(c, { tipo: "FIJAR_CONSOLIDACION", valor: false });
    const h2 = huellaCaptura(c);
    expect(h2).not.toBe(h1);
    c = con(c, { tipo: "ELEGIR_OPCION", insumo: "INS-00004", precio: "PRE-000006" });
    expect(huellaCaptura(c)).not.toBe(h2);
  });
});

function cargadoConOpciones(): Captura {
  const c = aplicar({ tipo: "CARGAR_EJEMPLO", ejemplo: ejemplo1, conceptos: [CON_AREA] });
  return con(c, { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007"], insumos: OPCIONES_AREA });
}
