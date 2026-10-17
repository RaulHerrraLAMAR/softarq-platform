/**
 * Catálogo técnico (módulo 12, ADR-0016): contratos y ensamblado de la entrada (BL-05 de
 * trazabilidad). Los rangos y mensajes salen de `modCatalogos.bas` (Val_Conversion, Val_Concepto,
 * Val_Componente) y `modValidacion.bas` (`Validar`), y las escalas de las columnas NUMERIC de la
 * migración del módulo 2, no del código bajo prueba.
 */
import {
  CAMPOS_TECNICOS_CONCEPTO,
  EsquemaAprobacionConcepto,
  EsquemaDesperdicio,
  EsquemaEdicionComponente,
  EsquemaEdicionConcepto,
  EsquemaEdicionConversion,
  EsquemaFactorConversion,
  EsquemaFactorTraslape,
  EsquemaRendimiento,
  EsquemaSolicitudComponente,
  EsquemaSolicitudConcepto,
  EsquemaSolicitudTipoEstructura,
  FAMILIAS_ESTRUCTURA,
} from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { construirEntradaCalculo } from "../../calculo/aplicacion/construir-entrada.js";
import type { ConceptoLeido, RepositorioCatalogos } from "../persistencia/repositorio-catalogos.js";

const valido = (e: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => e.safeParse(v).success;

describe("decimales con la escala de su columna (sin redondeo)", () => {
  it("rendimiento NUMERIC(20,6) > 0", () => {
    expect(valido(EsquemaRendimiento, "12.5")).toBe(true);
    expect(valido(EsquemaRendimiento, "0.000001")).toBe(true);
    expect(valido(EsquemaRendimiento, "0")).toBe(false);
    expect(valido(EsquemaRendimiento, "1.0000001")).toBe(false);
    expect(valido(EsquemaRendimiento, "123456789012345")).toBe(false);
    expect(valido(EsquemaRendimiento, 12.5)).toBe(false);
  });

  it("desperdicio NUMERIC(7,6): 0 <= d < 1 (Val_Componente)", () => {
    for (const v of ["0", "0.05", "0.999999", "0.000000"]) expect(valido(EsquemaDesperdicio, v), v).toBe(true);
    for (const v of ["1", "1.0", "-0.01", "0.1234567", "2"]) expect(valido(EsquemaDesperdicio, v), v).toBe(false);
  });

  it("traslape NUMERIC(9,6) >= 0 y factor de conversión NUMERIC(20,10) > 0", () => {
    expect(valido(EsquemaFactorTraslape, "0")).toBe(true);
    expect(valido(EsquemaFactorTraslape, "0.1")).toBe(true);
    expect(valido(EsquemaFactorTraslape, "-0.1")).toBe(false);
    expect(valido(EsquemaFactorTraslape, "1000")).toBe(false);
    expect(valido(EsquemaFactorConversion, "0.5600000000")).toBe(true);
    expect(valido(EsquemaFactorConversion, "0.12345678901")).toBe(false);
    expect(valido(EsquemaFactorConversion, "0")).toBe(false);
  });
});

describe("contratos de administración", () => {
  const concepto = {
    tipoCodigo: "TES-00004",
    descripcion: "[DEMO] Muro",
    unidad: "m2",
    tipoFormula: "AREA",
    permiteDescuento: true,
    reglaMedicion: "[DEMO] Área = largo x alto.",
    clase: "ESTANDAR",
  };

  it("un concepto nuevo exige tipo y regla; no acepta estado, aprobación, heredado ni organización", () => {
    expect(valido(EsquemaSolicitudConcepto, concepto)).toBe(true);
    expect(valido(EsquemaSolicitudConcepto, { ...concepto, reglaMedicion: "   " })).toBe(false);
    const { tipoCodigo: _t, ...sinTipo } = concepto;
    expect(valido(EsquemaSolicitudConcepto, sinTipo)).toBe(false);
    for (const extra of [{ estado: "Aprobado" }, { aprobadoPor: "x" }, { heredado: true }, { organizacionId: "x" }, { revisionTecnica: 0 }]) {
      expect(valido(EsquemaSolicitudConcepto, { ...concepto, ...extra }), JSON.stringify(extra)).toBe(false);
    }
    expect(valido(EsquemaSolicitudConcepto, { ...concepto, clase: "OTRA" })).toBe(false);
  });

  it("los campos técnicos son los de Val_Concepto; la edición no admite la marca de heredado", () => {
    expect([...CAMPOS_TECNICOS_CONCEPTO].sort()).toEqual(["clase", "criterios", "descripcion", "permiteDescuento", "reglaMedicion", "tipoCodigo", "tipoFormula", "unidad"]);
    expect(valido(EsquemaEdicionConcepto, { revision: 0 })).toBe(false);
    expect(valido(EsquemaEdicionConcepto, { revision: 0, activo: false })).toBe(true);
    expect(valido(EsquemaEdicionConcepto, { revision: 0, heredado: false })).toBe(false);
    expect(valido(EsquemaAprobacionConcepto, { revisionTecnica: 3 })).toBe(true);
    expect(valido(EsquemaAprobacionConcepto, {})).toBe(false);
  });

  it("componente: trazabilidad opcional al guardar, `null` distinto de cero y fecha real", () => {
    const k = { insumoCodigo: "INS-00010", rendimiento: "12.5", unidadRendimiento: "pza", desperdicio: "0", factorTraslape: null };
    expect(valido(EsquemaSolicitudComponente, k)).toBe(true);
    expect(EsquemaSolicitudComponente.parse({ ...k, factorTraslape: "0" }).factorTraslape).toBe("0");
    expect(EsquemaSolicitudComponente.parse({ ...k, fuente: "  " }).fuente).toBeNull();
    expect(valido(EsquemaSolicitudComponente, { ...k, fecha: "2026-02-30" })).toBe(false);
    expect(valido(EsquemaSolicitudComponente, { ...k, fecha: "2026-09-25" })).toBe(true);
    expect(valido(EsquemaEdicionComponente, { revision: 1, factorTraslape: null })).toBe(true);
  });

  it("conversión: editar exige motivo y el factor o la fuente; tipos con las seis familias del libro", () => {
    expect(valido(EsquemaEdicionConversion, { revision: 0, factor: "4.3", motivo: "[DEMO] Ficha técnica nueva." })).toBe(true);
    expect(valido(EsquemaEdicionConversion, { revision: 0, factor: "4.3" })).toBe(false);
    expect(valido(EsquemaEdicionConversion, { revision: 0, motivo: "[DEMO] Ficha técnica nueva." })).toBe(false);
    expect(FAMILIAS_ESTRUCTURA).toEqual(["Cimentaciones", "Concreto reforzado", "Acero estructural", "Mampostería reforzada", "Cubiertas ligeras", "Conceptos personalizados"]);
    expect(valido(EsquemaSolicitudTipoEstructura, { familia: "Cubiertas ligeras", nombre: "Techumbres" })).toBe(true);
    expect(valido(EsquemaSolicitudTipoEstructura, { familia: "Puentes", nombre: "x" })).toBe(false);
  });
});

describe("BL-05 de trazabilidad al armar la entrada (`Validar`)", () => {
  const conceptoLeido = (trazable: boolean, activo = true): ConceptoLeido => ({
    codigo: "CON-T1",
    descripcion: "[DEMO] Muro",
    unidad: "m2",
    tipoFormula: "AREA",
    permiteDescuento: true,
    clase: "ESTANDAR",
    estado: "Aprobado",
    activo: true,
    tarifa: null,
    componentes: [
      { codigo: "CMP-T1", orden: 1, insumoCodigo: "INS-00010", rendimiento: "12.5", unidadRendimiento: "pza", desperdicio: "0.05", factorTraslape: null, activo, trazable },
    ],
  });
  const repo = (c: ConceptoLeido) =>
    ({
      obtenerParametros: async () => null,
      obtenerConceptos: async () => [c],
      obtenerTiposAdicional: async () => [],
      obtenerPrecios: async () => [],
      obtenerInsumos: async () => [{ codigo: "INS-00010", unidadBase: "pza", activo: true }],
      obtenerConversiones: async () => [],
      obtenerPreciosVigentesDeProductos: async () => [],
    }) as unknown as RepositorioCatalogos;
  const solicitud = {
    fechaCalculo: "2026-10-17",
    consolidarCompras: true,
    partidas: [{ id: "P001", tipo: "CONCEPTO" as const, conceptoCodigo: "CON-T1", mediciones: [] }],
    preciosElegidos: [],
  };

  it("un componente activo sin fuente, fecha o responsable bloquea con el mensaje del libro", async () => {
    const r = await construirEntradaCalculo(repo(conceptoLeido(false)), { organizacionId: "x" }, solicitud);
    expect(r).toEqual({
      estado: "BLOQUEADO",
      problemas: [
        {
          codigo: "BL-05",
          referencia: "CMP-T1",
          mensaje: "Partida P001: el componente CMP-T1 no tiene rendimiento o desperdicio trazable (fuente, fecha y responsable técnico).",
        },
      ],
    });
  });

  it("un componente inactivo o trazable no bloquea", async () => {
    expect((await construirEntradaCalculo(repo(conceptoLeido(false, false)), { organizacionId: "x" }, solicitud)).estado).toBe("LISTA");
    expect((await construirEntradaCalculo(repo(conceptoLeido(true)), { organizacionId: "x" }, solicitud)).estado).toBe("LISTA");
  });
});
