/**
 * Módulo 15 (ADR-0019): reglas puras de duplicar (B-35), modo de precios (B-34) y estado de la
 * vista previa BORRADOR (B-25). Fuentes: `His_Duplicar`, `Ver_CopiarContenido` y `BTN_VistaPrevia`.
 */
import type { CapturaBorrador } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { capturaDuplicada, mismasSelecciones, seleccionesDelModo } from "../duplicacion.js";
import { bloqueosEstadoVistaPrevia, construirDocumentoBorrador, type EntradaBorrador } from "../vista-previa.js";

const TEXTOS = { alcance: "Alcance de prueba.", condiciones: "Condiciones de prueba.", exclusiones: "Exclusiones de prueba." };

const origen: CapturaBorrador = {
  consolidarCompras: false,
  partidas: [
    {
      tipo: "CONCEPTO",
      conceptoCodigo: "CON-00009",
      descripcion: "[DEMO] Muro con descripción propia",
      mediciones: [{ descripcion: "Muro norte", signo: "+", piezas: "1", largo: "10", ancho: null, alto: "2.5", segundaMedida: "alto" }],
    },
    { tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001", descripcion: "Transporte", cantidad: "1", monto: "600" },
  ],
  seleccion: [
    { insumoCodigo: "INS-00010", precioCodigo: "PRE-000014" },
    { insumoCodigo: "INS-00011", precioCodigo: "PRE-000015" },
  ],
  textos: TEXTOS,
  excepciones: [
    { tipo: "RENDIMIENTO", partida: 1, conceptoCodigo: "CON-00009", componenteCodigo: "CMP-00011", campo: "RENDIMIENTO", valorAplicado: "13", motivo: "Block de mayor formato verificado en obra." },
    { tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: "CON-00009", motivo: "Concepto personalizado para la prueba." },
  ],
};

describe("duplicar (B-35)", () => {
  it("copia partidas, mediciones, descripciones, textos y consolidación; no copia selecciones ni excepciones", () => {
    const c = capturaDuplicada(origen);
    expect(c.partidas).toEqual(origen.partidas);
    expect(c.consolidarCompras).toBe(false);
    expect(c.textos).toEqual(TEXTOS);
    expect(c.seleccion).toEqual([]);
    expect("excepciones" in c).toBe(false);
  });

  it("es una copia independiente (cambiarla no cambia el origen)", () => {
    const c = capturaDuplicada(origen);
    const p = c.partidas[0]!;
    if (p.tipo === "CONCEPTO") p.mediciones[0]!.largo = "99";
    c.textos!.alcance = "otro";
    const o = origen.partidas[0]!;
    expect(o.tipo === "CONCEPTO" && o.mediciones[0]!.largo).toBe("10");
    expect(origen.textos!.alcance).toBe("Alcance de prueba.");
  });

  it("origen sin textos: la copia tampoco los tiene (no se completan con la plantilla)", () => {
    const { textos: _, ...sinTextos } = origen;
    expect("textos" in capturaDuplicada(sinTextos)).toBe(false);
  });
});

describe("modo de precios (B-34)", () => {
  it("CONSERVAR toma las selecciones de la versión emitida; ELEGIR_DE_NUEVO no deja ninguna", () => {
    expect(seleccionesDelModo("CONSERVAR", origen)).toEqual(origen.seleccion);
    expect(seleccionesDelModo("ELEGIR_DE_NUEVO", origen)).toEqual([]);
  });

  it("las selecciones se comparan como conjunto", () => {
    expect(mismasSelecciones(origen.seleccion, [...origen.seleccion].reverse())).toBe(true);
    expect(mismasSelecciones(origen.seleccion, [origen.seleccion[0]!])).toBe(false);
    expect(mismasSelecciones(origen.seleccion, [{ insumoCodigo: "INS-00010", precioCodigo: "PRE-000099" }, origen.seleccion[1]!])).toBe(false);
  });
});

describe("estado para la vista previa (B-25)", () => {
  const base = { idVersion: "COT-2026-00001-v2", estado: "BORRADOR" as const, esUltima: true, folioActivo: true, revisionBorradorVersion: 4, revisionBorrador: 4 };

  it.each(["BORRADOR", "EN_REVISION", "APROBADA"] as const)("%s con el borrador igual: se permite", (estado) => {
    expect(bloqueosEstadoVistaPrevia({ ...base, estado })).toEqual([]);
  });

  it.each(["EMITIDA", "SUSTITUIDA"] as const)("%s: BL-19 (se descarga el documento emitido)", (estado) => {
    expect(bloqueosEstadoVistaPrevia({ ...base, estado }).map((p) => p.codigo)).toEqual(["BL-19"]);
  });

  it("folio descartado: BL-19", () => {
    expect(bloqueosEstadoVistaPrevia({ ...base, folioActivo: false }).map((p) => p.codigo)).toEqual(["BL-19"]);
  });

  it("borrador guardado distinto de la versión, o versión que no es la última: BL-16", () => {
    expect(bloqueosEstadoVistaPrevia({ ...base, revisionBorrador: 5 }).map((p) => p.codigo)).toEqual(["BL-16"]);
    expect(bloqueosEstadoVistaPrevia({ ...base, esUltima: false }).map((p) => p.codigo)).toEqual(["BL-16"]);
  });
});

describe("documento BORRADOR: congelados de la versión y administrativos actuales", () => {
  const entrada: EntradaBorrador = {
    ambiente: "DEMO",
    folio: "COT-2026-00001",
    numero: 2,
    fechaCalculo: "2026-09-25",
    fechaGeneracion: "2026-09-30",
    comercial: {
      ambiente: "DEMO",
      moneda: "MXN",
      leyenda: "x",
      partidas: [{ numero: 1, descripcion: "[DEMO] Partida", unidad: "m2", cantidad: "10", precioUnitario: "100.00", importe: "1000.00" }],
      subtotal: "1000.00",
      impuesto: { nombre: "Impuesto (tasa ilustrativa)", tasa: "0.16", importe: "160.00" },
      total: "1160.00",
    },
    textos: null,
    emisor: null,
    cliente: { codigo: "CLI-00001", nombre: "[DEMO] Cliente renombrado hoy", contactoNombre: null, contactoTelefono: null, contactoCorreo: null },
    proyecto: { codigo: "PRY-00001", nombre: "[DEMO] Obra", ubicacion: null, descripcion: null },
    vigenciaDias: 15,
    preparo: "[DEMO] Preparador 1",
    aprobo: null,
  };

  it("importes de la versión, cliente actual, emisor y textos ausentes como tales", () => {
    const d = construirDocumentoBorrador(entrada);
    expect(d.tipo).toBe("BORRADOR");
    expect(d.idVersion).toBe("COT-2026-00001-v2");
    expect(d.total).toBe("1160.00");
    expect(d.cliente.nombre).toBe("[DEMO] Cliente renombrado hoy");
    expect(d.emisor).toEqual({ nombre: null, domicilio: null, telefono: null, correo: null, logo: null });
    expect(d.textos).toBeNull();
    expect(d.personas).toEqual({ preparo: "[DEMO] Preparador 1", aprobo: null });
    expect(JSON.stringify(d)).not.toMatch(/costo|margen|recargo|proveedor|consumo|excepci/i);
  });
});
