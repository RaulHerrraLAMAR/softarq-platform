/**
 * Contratos HTTP (Zod) y su coherencia con el motor: misma definición de renglón, mismo formato
 * decimal y solicitudes derivadas de los fixtures verificados.
 */
import {
  EsquemaConsultaConceptos,
  EsquemaConsultaOpcionesPrecio,
  EsquemaDecimalTexto,
  EsquemaSolicitudCalculoDemo,
  LIMITES_API,
  esDecimalTexto,
  type SolicitudCalculoDemo,
} from "@softarq/contracts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validarEntrada } from "../../modules/calculo/domain/validar-entrada.js";
import { ESCENARIOS } from "../../modules/calculo/domain/__tests__/fixtures/escenarios.js";
import { solicitudDemoDesdeEntrada } from "../../pruebas-integracion/solicitudes.js";

const valida = (): SolicitudCalculoDemo => solicitudDemoDesdeEntrada(ESCENARIOS[0]!.entrada);

describe("EsquemaSolicitudCalculoDemo", () => {
  it.each(ESCENARIOS.map((e) => [e.id, e] as const))("acepta la solicitud derivada de %s", (_id, e) => {
    expect(EsquemaSolicitudCalculoDemo.safeParse(solicitudDemoDesdeEntrada(e.entrada)).success).toBe(true);
  });

  it("acepta una cotización vacía (llega al motor como BL-03)", () => {
    expect(EsquemaSolicitudCalculoDemo.safeParse({ consolidarCompras: true, partidas: [], preciosElegidos: [] }).success).toBe(true);
  });

  const mutar = (f: (s: Record<string, any>) => void) => {
    const s = structuredClone(valida()) as Record<string, any>;
    f(s);
    return EsquemaSolicitudCalculoDemo.safeParse(s);
  };

  it.each([
    ["decimal como número", (s: any) => (s.partidas[0].mediciones[0].piezas = 1)],
    ["decimal con coma", (s: any) => (s.partidas[0].mediciones[0].largo = "1,5")],
    ["decimal con exponente", (s: any) => (s.partidas[1].monto = "9e2")],
    ["signo inválido", (s: any) => (s.partidas[0].mediciones[0].signo = "x")],
    ["renglón sin la clave alto", (s: any) => delete s.partidas[0].mediciones[0].alto],
    ["campo extra en el renglón", (s: any) => (s.partidas[0].mediciones[0].costo = "1")],
    ["campo extra en la partida", (s: any) => (s.partidas[0].precioUnitario = "1")],
    ["campo extra arriba: fechaCalculo", (s: any) => (s.fechaCalculo = "2026-01-01")],
    ["campo extra arriba: organizacionId", (s: any) => (s.organizacionId = "x")],
    ["campo extra arriba: parametros", (s: any) => (s.parametros = { recargoSobreCosto: "0" })],
    ["consolidarCompras ausente", (s: any) => delete s.consolidarCompras],
    ["tipo de partida desconocido", (s: any) => (s.partidas[0].tipo = "OTRO")],
    ["código en minúsculas", (s: any) => (s.preciosElegidos[0] = "pre-000007")],
    ["precio repetido", (s: any) => s.preciosElegidos.push(s.preciosElegidos[0])],
    ["partida repetida", (s: any) => (s.partidas[1].id = s.partidas[0].id)],
    ["descripción demasiado larga", (s: any) => (s.partidas[1].descripcion = "x".repeat(201))],
    ["demasiadas partidas", (s: any) => (s.partidas = Array.from({ length: LIMITES_API.partidas + 1 }, (_, i) => ({ ...s.partidas[1], id: `A${i}` })))],
  ])("rechaza: %s", (_n, f) => {
    expect(mutar(f).success).toBe(false);
  });

  it(`rechaza más de ${LIMITES_API.renglonesTotales} renglones en total`, () => {
    const r = mutar((s) => {
      const renglones = Array.from({ length: 200 }, () => ({ ...s.partidas[0].mediciones[0] }));
      s.partidas = Array.from({ length: 6 }, (_, i) => ({ ...s.partidas[0], id: `P${i}`, mediciones: renglones }));
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join(" ")).toMatch(/renglones de medición en total/);
  });
});

describe("ejemplos de docs/api/ejemplos", () => {
  const EJEMPLOS: Record<string, string> = {
    "calculo-r1-faldones-10m.json": "GUIA-R1-FALDONES-10M",
    "calculo-r2-espesor-012.json": "GUIA-R2-ESPESOR-012",
    "calculo-r3-sin-ventana.json": "GUIA-R3-SIN-VENTANA",
    "calculo-propia-con-00001.json": "GUIA-PROPIA-CON-00001",
  };
  it.each(Object.entries(EJEMPLOS))("%s coincide con el fixture %s y cumple el contrato", (archivo, id) => {
    const ruta = join(import.meta.dirname, "..", "..", "..", "..", "..", "docs", "api", "ejemplos", archivo);
    const ejemplo = JSON.parse(readFileSync(ruta, "utf8"));
    expect(EsquemaSolicitudCalculoDemo.safeParse(ejemplo).success).toBe(true);
    expect(ejemplo).toEqual(solicitudDemoDesdeEntrada(ESCENARIOS.find((e) => e.id === id)!.entrada));
  });
});

describe("coherencia entre el contrato HTTP y el validador del motor", () => {
  it.each(["0", "12.5", "-1.20", "18790.94", "1,5", "1e3", " 1", "+1", "01", ".5", "5.", "1234567890123456", "1.12345678901"])(
    "el formato decimal coincide para %j",
    (v) => {
      expect(EsquemaDecimalTexto.safeParse(v).success).toBe(esDecimalTexto(v));
    },
  );

  it("una solicitud válida para el contrato produce renglones que el motor acepta en forma", () => {
    // Las reglas de captura (p. ej. AREA con ancho y alto) son del motor; el formato es común.
    const e = ESCENARIOS[0]!.entrada;
    expect(validarEntrada(e)).toEqual([]);
    for (const p of valida().partidas) {
      if (p.tipo === "CONCEPTO") for (const r of p.mediciones) expect(EsquemaDecimalTexto.safeParse(r.piezas).success).toBe(true);
    }
  });
});

describe("consultas", () => {
  it("conceptos: limite 1..100, buscar acotado, sin parámetros desconocidos", () => {
    expect(EsquemaConsultaConceptos.parse({ limite: "5" })).toEqual({ limite: 5 });
    for (const q of [{ limite: "0" }, { limite: "101" }, { limite: "abc" }, { buscar: "x".repeat(61) }, { otro: "1" }]) {
      expect(EsquemaConsultaConceptos.safeParse(q).success, JSON.stringify(q)).toBe(false);
    }
  });

  it("opciones-precio: lista de 1 a 20 códigos únicos", () => {
    expect(EsquemaConsultaOpcionesPrecio.parse({ conceptos: "CON-00007,CON-00008" })).toEqual({
      conceptos: ["CON-00007", "CON-00008"],
    });
    const muchos = Array.from({ length: 21 }, (_, i) => `C${i}`).join(",");
    for (const q of [{}, { conceptos: "" }, { conceptos: muchos }, { conceptos: "A,A" }, { conceptos: ["A", "B"] }]) {
      expect(EsquemaConsultaOpcionesPrecio.safeParse(q).success, JSON.stringify(q)).toBe(false);
    }
  });
});
