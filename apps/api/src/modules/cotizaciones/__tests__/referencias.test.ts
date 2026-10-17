/**
 * Disponibilidad de referencias y validación de referencias NUEVAS al guardar un borrador
 * (corrección previa al módulo 7). Lo ya guardado se conserva aunque deje de estar disponible.
 */
import type { CapturaBorrador } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import type { ConceptoLeido, PrecioLeido, TipoAdicionalLeido } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { evaluarReferencias, referenciasNuevasInvalidas } from "../dominio/referencias.js";

const HOY = "2026-09-25";

const concepto = (codigo: string, extra: Partial<ConceptoLeido> = {}): ConceptoLeido => ({
  codigo,
  descripcion: `[DEMO] ${codigo}`,
  unidad: "m2",
  tipoFormula: "AREA",
  permiteDescuento: true,
  clase: "ESTANDAR",
  estado: "Aprobado",
  activo: true,
  tarifa: null,
  componentes: [
    { codigo: `${codigo}-1`, orden: 1, insumoCodigo: "INS-00004", rendimiento: "1", unidadRendimiento: "m2", desperdicio: "0", factorTraslape: null, activo: true, trazable: true },
    { codigo: `${codigo}-2`, orden: 2, insumoCodigo: "INS-00009", rendimiento: "1", unidadRendimiento: "m2", desperdicio: "0", factorTraslape: null, activo: false, trazable: true },
  ],
  ...extra,
});

const precio = (codigo: string, insumoCodigo: string, extra: Partial<PrecioLeido> = {}): PrecioLeido => ({
  codigo,
  precioUnitario: "10",
  vigenteDesde: "2026-01-01",
  vigenteHasta: "2026-12-31",
  anulado: false,
  producto: { codigo: `PCM-${codigo}`, insumoCodigo, contenido: "1", fraccionable: false, incrementoMinimo: null, activo: true },
  proveedor: { codigo: "PRV-00001", activo: true },
  ...extra,
});

const adicional = (codigo: string, activo = true): TipoAdicionalLeido => ({ codigo, categoria: "Transporte", descripcion: "", unidad: "viaje", activo });

const captura = (seleccion: CapturaBorrador["seleccion"], conceptos = ["CON-A"], adicionales: string[] = []): CapturaBorrador => ({
  consolidarCompras: false,
  partidas: [
    ...conceptos.map((c) => ({ tipo: "CONCEPTO" as const, conceptoCodigo: c, descripcion: "", mediciones: [] })),
    ...adicionales.map((a) => ({ tipo: "ADICIONAL" as const, tipoAdicionalCodigo: a, descripcion: "x", cantidad: "1", monto: "1" })),
  ],
  seleccion,
});

describe("evaluarReferencias", () => {
  it("informa cada motivo y los insumos de los componentes activos", () => {
    const c = captura(
      [
        { insumoCodigo: "INS-00004", precioCodigo: "PRE-ANULADO" },
        { insumoCodigo: "INS-00005", precioCodigo: "PRE-VENCIDO" },
        { insumoCodigo: "INS-00006", precioCodigo: "PRE-OTRO" },
        { insumoCodigo: "INS-00007", precioCodigo: "PRE-NADA" },
        { insumoCodigo: "INS-00008", precioCodigo: "PRE-OK" },
      ],
      ["CON-A", "CON-INACTIVO", "CON-BORRADOR", "CON-NADA"],
      ["CAD-1", "CAD-INACTIVO", "CAD-NADA"],
    );
    const r = evaluarReferencias(
      c,
      {
        conceptos: [concepto("CON-A"), concepto("CON-INACTIVO", { activo: false }), concepto("CON-BORRADOR", { estado: "Borrador" })],
        precios: [
          precio("PRE-ANULADO", "INS-00004", { anulado: true }),
          precio("PRE-VENCIDO", "INS-00005", { vigenteHasta: "2026-09-24" }),
          precio("PRE-OTRO", "INS-00099"),
          precio("PRE-OK", "INS-00008"),
        ],
        tiposAdicional: [adicional("CAD-1"), adicional("CAD-INACTIVO", false)],
      },
      HOY,
    );
    expect(r.conceptos.map((x) => [x.codigo, x.disponible, x.motivo])).toEqual([
      ["CON-A", true, null],
      ["CON-INACTIVO", false, "el concepto está inactivo"],
      ["CON-BORRADOR", false, "el concepto no está aprobado (estado Borrador)"],
      ["CON-NADA", false, "no existe en el catálogo de su organización"],
    ]);
    expect(r.conceptos[0]!.insumos).toEqual(["INS-00004"]);
    expect(r.conceptos[3]!.insumos).toEqual([]);
    expect(r.selecciones.map((x) => x.motivo)).toEqual([
      "el precio está anulado",
      "el precio no está vigente hoy (vigencia 2026-01-01 a 2026-09-24)",
      "corresponde a otro insumo (INS-00099)",
      "no existe en el catálogo de su organización",
      null,
    ]);
    expect(r.tiposAdicional.map((x) => x.disponible)).toEqual([true, false, false]);
  });
});

describe("referenciasNuevasInvalidas", () => {
  const cat = {
    conceptos: [concepto("CON-A", { activo: false })],
    precios: [precio("PRE-1", "INS-00004", { anulado: true }), precio("PRE-2", "INS-00004")],
    tiposAdicional: [adicional("CAD-1", false)],
  };

  it("acepta referencias ya guardadas aunque ya no estén disponibles", () => {
    const anterior = captura([{ insumoCodigo: "INS-00004", precioCodigo: "PRE-1" }], ["CON-A"], ["CAD-1"]);
    // Se modificó otra cosa (la consolidación), las referencias siguen igual.
    const nueva = { ...anterior, consolidarCompras: true };
    expect(referenciasNuevasInvalidas(nueva, anterior, evaluarReferencias(nueva, cat, HOY))).toEqual([]);
  });

  it("rechaza referencias nuevas no disponibles, con su ruta", () => {
    const anterior = captura([], []);
    const nueva = captura([{ insumoCodigo: "INS-00004", precioCodigo: "PRE-1" }], ["CON-A"], ["CAD-1"]);
    const e = referenciasNuevasInvalidas(nueva, anterior, evaluarReferencias(nueva, cat, HOY));
    expect(e.map((x) => x.ruta)).toEqual(["partidas[0].conceptoCodigo", "partidas[1].tipoAdicionalCodigo", "seleccion[0].precioCodigo"]);
    expect(e[2]!.mensaje).toMatch(/PRE-1.*anulado/);
  });

  it("una selección guardada que se cambia por otro precio no disponible se rechaza; por uno disponible, no", () => {
    const anterior = captura([{ insumoCodigo: "INS-00004", precioCodigo: "PRE-2" }], []);
    const mala = captura([{ insumoCodigo: "INS-00004", precioCodigo: "PRE-1" }], []);
    expect(referenciasNuevasInvalidas(mala, anterior, evaluarReferencias(mala, cat, HOY))).toHaveLength(1);
    const buena = captura([{ insumoCodigo: "INS-00004", precioCodigo: "PRE-2" }], []);
    expect(referenciasNuevasInvalidas(buena, anterior, evaluarReferencias(buena, cat, HOY))).toEqual([]);
  });

  it("un código de otra organización no existe en esta: es una referencia nueva inválida", () => {
    const nueva = captura([{ insumoCodigo: "INS-00004", precioCodigo: "PRE-DE-OTRA-ORG" }], []);
    const e = referenciasNuevasInvalidas(nueva, captura([], []), evaluarReferencias(nueva, cat, HOY));
    expect(e[0]!.mensaje).toMatch(/no existe en el catálogo de su organización/);
  });
});
