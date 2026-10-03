/**
 * Conservación de lo capturado en un borrador cuando una referencia deja de estar disponible
 * (corrección previa al módulo 7). Guardar nunca elimina en silencio partidas, medidas ni
 * selecciones de precio; tampoco se elige otra opción por el usuario.
 */
import type { CapturaBorrador } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { CON_AREA, CON_VOLUMEN, OPCIONES_AREA } from "../../pruebas/datos.ts";
import { serializarBorrador } from "../borrador.ts";
import { reducir, type Accion, type Captura } from "../estado.ts";
import { validarCaptura } from "../solicitud.ts";

function con(c: Captura, a: Accion): Captura {
  const r = reducir({ captura: c }, a).captura;
  if (!r) throw new Error("sin captura");
  return r;
}

const guardado: CapturaBorrador = {
  consolidarCompras: false,
  partidas: [
    {
      tipo: "CONCEPTO",
      conceptoCodigo: "CON-00007",
      descripcion: "Faldón norte",
      mediciones: [{ descripcion: "", signo: "+", piezas: "1", largo: "10", ancho: "4", alto: null, segundaMedida: "ancho" }],
    },
    {
      tipo: "CONCEPTO",
      conceptoCodigo: "CON-00008",
      descripcion: "",
      mediciones: [{ descripcion: "", signo: "+", piezas: "1", largo: "2", ancho: "2", alto: "0.1", segundaMedida: "ancho" }],
    },
  ],
  seleccion: [
    { insumoCodigo: "INS-00004", precioCodigo: "PRE-000006" },
    { insumoCodigo: "INS-00005", precioCodigo: "PRE-000008" },
    { insumoCodigo: "INS-00007", precioCodigo: "PRE-000011" },
  ],
};

function cargar(conceptos = [CON_VOLUMEN], referencias?: Parameters<typeof cargarCon>[1]): Captura {
  return cargarCon(conceptos, referencias);
}

function cargarCon(
  conceptos: (typeof CON_AREA)[],
  referencias?: Extract<Accion, { tipo: "CARGAR_BORRADOR" }>["referencias"],
): Captura {
  const r = reducir(
    { captura: null },
    { tipo: "CARGAR_BORRADOR", folio: "COT-2026-00001", borrador: guardado, conceptos, ...(referencias ? { referencias } : {}) },
  ).captura;
  if (!r) throw new Error("sin captura");
  return r;
}

function seleccionGuardada(c: Captura) {
  const s = serializarBorrador(c);
  if (!s.ok) throw new Error("no serializa");
  return [...s.borrador.seleccion].sort((a, b) => a.insumoCodigo.localeCompare(b.insumoCodigo));
}

describe("concepto que deja de estar en el catálogo", () => {
  it("sin datos del servidor: conserva sus selecciones al guardar, recargar y editar otra partida", () => {
    let c = cargar();
    expect(seleccionGuardada(c)).toEqual(guardado.seleccion);

    // Editar otra partida y volver a guardar.
    const otra = c.partidas[1]!;
    const r = otra.tipo === "CONCEPTO" ? otra.renglones[0]!.clave : "";
    c = con(c, { tipo: "EDITAR_RENGLON", partida: otra.clave, renglon: r, cambios: { largo: "3" } });
    const s = serializarBorrador(c);
    expect(s.ok && s.borrador.partidas).toHaveLength(2);
    expect(seleccionGuardada(c)).toEqual(guardado.seleccion);

    // Recuperar lo guardado: sigue igual.
    const s2 = serializarBorrador(c);
    if (!s2.ok) throw new Error("no serializa");
    const recargada = reducir(
      { captura: null },
      { tipo: "CARGAR_BORRADOR", folio: "COT-2026-00001", borrador: s2.borrador, conceptos: [CON_VOLUMEN] },
    ).captura!;
    expect(seleccionGuardada(recargada)).toEqual(guardado.seleccion);
  });

  it("con los insumos que informa el servidor, el concepto no disponible conserva los suyos y lo señala", () => {
    const c = cargar([CON_VOLUMEN], {
      conceptos: [
        { codigo: "CON-00007", disponible: false, motivo: "inactivo", insumos: ["INS-00004", "INS-00005"] },
        { codigo: "CON-00008", disponible: true, motivo: null, insumos: ["INS-00007"] },
      ],
      selecciones: [],
      tiposAdicional: [],
    });
    const p = c.partidas[0]!;
    expect(p.tipo === "CONCEPTO" && p.concepto.insumos.map((i) => i.codigo)).toEqual(["INS-00004", "INS-00005"]);
    expect(c.avisosCarga.join(" ")).toMatch(/CON-00007.*no está disponible/);
    expect(seleccionGuardada(c)).toEqual(guardado.seleccion);
  });

  it("quitar la partida es una decisión del usuario: entonces sus selecciones dejan de guardarse", () => {
    let c = cargar([CON_VOLUMEN], {
      conceptos: [
        { codigo: "CON-00007", disponible: false, motivo: "inactivo", insumos: ["INS-00004", "INS-00005"] },
        { codigo: "CON-00008", disponible: true, motivo: null, insumos: ["INS-00007"] },
      ],
      selecciones: [],
      tiposAdicional: [],
    });
    c = con(c, { tipo: "QUITAR_PARTIDA", clave: c.partidas[0]!.clave });
    expect(seleccionGuardada(c)).toEqual([{ insumoCodigo: "INS-00007", precioCodigo: "PRE-000011" }]);
  });

  it("una selección huérfana se conserva hasta que el usuario la quita", () => {
    let c = cargar();
    c = con(c, { tipo: "QUITAR_SELECCION", insumo: "INS-00004" });
    expect(seleccionGuardada(c).map((s) => s.insumoCodigo)).toEqual(["INS-00005", "INS-00007"]);
  });
});

describe("opción de precio que deja de estar disponible", () => {
  it("se conserva marcada como no disponible, sin elegir otra; calcular exige decidir", () => {
    const c0 = cargar([CON_AREA, CON_VOLUMEN]);
    const sinPre6 = OPCIONES_AREA.map((i) => ({ ...i, opciones: i.opciones.filter((o) => o.precioCodigo !== "PRE-000006") }));
    const c = con(c0, { tipo: "CONCILIAR_OPCIONES", conceptos: ["CON-00007", "CON-00008"], insumos: sinPre6 });
    expect(c.seleccion["INS-00004"]).toBe("PRE-000006");
    expect(c.avisosSeleccion["INS-00004"]).toMatch(/PRE-000006 ya no está disponible/);
    expect(seleccionGuardada(c)).toEqual(guardado.seleccion);
    expect(validarCaptura(c, sinPre6)["seleccion.INS-00004"]).toMatch(/ya no está disponible/);

    // El usuario decide: elige otra opción.
    const elegida = con(c, { tipo: "ELEGIR_OPCION", insumo: "INS-00004", precio: "PRE-000007" });
    expect(elegida.avisosSeleccion["INS-00004"]).toBeUndefined();
    expect(elegida.seleccion["INS-00004"]).toBe("PRE-000007");
  });

  it("la selección marcada por el servidor como no disponible se muestra al cargar", () => {
    const c = cargar([CON_AREA, CON_VOLUMEN], {
      conceptos: [],
      selecciones: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-000006", disponible: false, motivo: "el precio está anulado" }],
      tiposAdicional: [],
    });
    expect(c.avisosSeleccion["INS-00004"]).toMatch(/PRE-000006.*anulado/);
    expect(c.seleccion["INS-00004"]).toBe("PRE-000006");
  });
});
