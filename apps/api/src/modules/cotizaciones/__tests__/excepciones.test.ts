/**
 * Excepciones B-22 (módulo 10, ADR-0014). Reglas de Word maestro v1.3 §3.10/§3.11, `Exc_Registrar`
 * y `Exc_Resolver` (modRevision.bas), `Validar`/`Avisos` (modValidacion.bas). Cifras esperadas de
 * las fuentes: TI-339 (`fase1.csv`): block 24.66 × 13 × 1.05 = 336.609 → 337 piezas; TI-092: la
 * excepción no cambia el catálogo (12.5).
 */
import {
  EsquemaCapturaBorrador,
  EsquemaListaExcepciones,
  type CapturaBorrador,
  type DecisionExcepcion,
  type EntradaCalculo,
  type ExcepcionBorrador,
} from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { ESCENARIOS } from "../../calculo/domain/__tests__/fixtures/escenarios.js";
import { calcularCotizacion } from "../../calculo/domain/motor.js";
import type { ConceptoLeido, PrecioLeido } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { aSolicitudCalculo } from "../dominio/borrador.js";
import {
  av04,
  bloqueosExcepciones,
  excepcionesParaCalculo,
  preciosConExcepcion,
  sinExcepciones,
  validarExcepciones,
} from "../dominio/excepciones.js";
import { bl09 } from "../dominio/verificacion.js";

const R3 = ESCENARIOS.find((e) => e.id === "GUIA-R3-BLOCK-1390")!;
const entradaR3 = R3.entrada as EntradaCalculo;
const MOTIVO = "Block de mayor formato verificado en obra por el residente.";

const rendimiento = (over: Partial<Extract<ExcepcionBorrador, { tipo: "RENDIMIENTO" }>> = {}): ExcepcionBorrador => ({
  tipo: "RENDIMIENTO",
  partida: 1,
  conceptoCodigo: "CON-00009",
  componenteCodigo: "CMP-00011",
  campo: "RENDIMIENTO",
  valorAplicado: "13",
  motivo: MOTIVO,
  ...over,
});

const captura = (excepciones: ExcepcionBorrador[]): CapturaBorrador => ({
  consolidarCompras: true,
  partidas: [
    {
      tipo: "CONCEPTO",
      conceptoCodigo: "CON-00009",
      descripcion: "",
      mediciones: [{ descripcion: "Muro", signo: "+", piezas: "1", largo: "6", ancho: null, alto: "2.7", segundaMedida: "alto" }],
    },
    { tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001", descripcion: "Transporte", cantidad: "1", monto: "700" },
  ],
  seleccion: [{ insumoCodigo: "INS-00010", precioCodigo: "PRE-000016" }],
  excepciones,
});

const componente = (codigo: string, insumo: string) => ({
  codigo,
  orden: 1,
  insumoCodigo: insumo,
  rendimiento: "12.5",
  unidadRendimiento: "pza",
  desperdicio: "0.05",
  factorTraslape: null,
  activo: true,
});
const concepto = (codigo: string, clase: string, componentes = [componente("CMP-00011", "INS-00010")]): ConceptoLeido => ({
  codigo,
  descripcion: codigo,
  unidad: "m2",
  tipoFormula: "AREA",
  permiteDescuento: true,
  clase,
  estado: clase === "PERSONALIZADO" ? "Borrador" : "Aprobado",
  activo: true,
  tarifa: null,
  componentes,
});
const catalogo = new Map([
  ["CON-00009", concepto("CON-00009", "ESTANDAR")],
  ["CON-90001", concepto("CON-90001", "PERSONALIZADO")],
]);

describe("efecto en el cálculo (W §3.10, `Motor_Modelo`)", () => {
  const conExcepcion = (estado: "Pendiente" | "Autorizada" | "Rechazada"): EntradaCalculo => ({
    ...entradaR3,
    excepciones: [{ id: "EXC-1", partidaId: "P001", componenteId: "CMP-00011", campo: "RENDIMIENTO", valorAplicado: "13", estado }],
  });
  const block = (e: EntradaCalculo) => {
    const r = calcularCotizacion(e);
    if (r.estado !== "CALCULADO") throw new Error(JSON.stringify(r));
    return {
      consumo: r.consumos.find((c) => c.componenteId === "CMP-00011")!,
      compra: r.compras.find((c) => c.productoId === "PCM-00010")!,
    };
  };

  it("TI-339: block 24.66 × 13 × 1.05 = 336.609 → 337 piezas, con la excepción registrada (pendiente)", () => {
    const { consumo, compra } = block(conExcepcion("Pendiente"));
    expect(consumo.rendimientoUsado).toBe("13");
    expect(consumo.consumoConDesperdicio).toBe("336.609");
    expect(consumo.excepcionIds).toEqual(["EXC-1"]);
    expect(compra.unidades).toBe("337");
  });

  it("autorizada se aplica igual; rechazada deja de aplicarse (324 piezas, como el recorrido 3)", () => {
    expect(block(conExcepcion("Autorizada")).compra.unidades).toBe("337");
    const rechazada = block(conExcepcion("Rechazada"));
    expect(rechazada.compra.unidades).toBe("324");
    expect(rechazada.consumo.excepcionIds).toEqual([]);
  });

  it("TI-092: la excepción no cambia el componente del catálogo (12.5) ni el escenario sin excepción", () => {
    const e = conExcepcion("Pendiente");
    block(e);
    const p = e.partidas[0]!;
    expect(p.tipo === "CONCEPTO" && p.componentes.find((k) => k.id === "CMP-00011")!.rendimiento).toBe("12.5");
    const sin = calcularCotizacion(entradaR3);
    expect(sin.estado === "CALCULADO" && sin.totales.total).toBe("20688.24");
  });
});

describe("registro (`Exc_Registrar`, TI-090)", () => {
  it("motivo obligatorio con al menos 10 caracteres y alguna letra", () => {
    expect(EsquemaListaExcepciones.safeParse([rendimiento({ motivo: "" })]).success).toBe(false);
    expect(EsquemaListaExcepciones.safeParse([rendimiento({ motivo: "1234567890" })]).success).toBe(false);
    expect(EsquemaListaExcepciones.safeParse([rendimiento()]).success).toBe(true);
  });

  it("no admite dos excepciones para la misma referencia y campo", () => {
    expect(EsquemaListaExcepciones.safeParse([rendimiento(), rendimiento({ valorAplicado: "14" })]).success).toBe(false);
    expect(EsquemaListaExcepciones.safeParse([rendimiento(), rendimiento({ campo: "DESPERDICIO", valorAplicado: "0.1" })]).success).toBe(true);
  });

  it("la captura anterior sin excepciones sigue siendo válida (campo opcional)", () => {
    const { excepciones: _, ...anterior } = captura([]);
    expect(EsquemaCapturaBorrador.safeParse(anterior).success).toBe(true);
  });

  it("rangos: rendimiento > 0 y 0 <= desperdicio < 1", () => {
    const rutas = (x: ExcepcionBorrador) => validarExcepciones(captura([x]), null, catalogo).map((e) => e.ruta);
    expect(rutas(rendimiento())).toEqual([]);
    expect(rutas(rendimiento({ valorAplicado: "0" }))).toEqual(["excepciones.0.valorAplicado"]);
    expect(rutas(rendimiento({ campo: "DESPERDICIO", valorAplicado: "1" }))).toEqual(["excepciones.0.valorAplicado"]);
    expect(rutas(rendimiento({ campo: "DESPERDICIO", valorAplicado: "0" }))).toEqual([]);
  });

  it("referencias: partida con ese concepto, componente del concepto, precio elegido y concepto personalizado", () => {
    const rutas = (x: ExcepcionBorrador) => validarExcepciones(captura([x]), null, catalogo).map((e) => e.ruta);
    expect(rutas(rendimiento({ partida: 2 }))).toEqual(["excepciones.0.partida"]);
    expect(rutas(rendimiento({ conceptoCodigo: "CON-00001" }))).toEqual(["excepciones.0.partida"]);
    expect(rutas(rendimiento({ componenteCodigo: "CMP-00001" }))).toEqual(["excepciones.0.componenteCodigo"]);
    expect(rutas({ tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00010", precioCodigo: "PRE-000015", motivo: MOTIVO })).toEqual([
      "excepciones.0.precioCodigo",
    ]);
    expect(rutas({ tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00010", precioCodigo: "PRE-000016", motivo: MOTIVO })).toEqual([]);
    // CON-00009 está en la captura pero es ESTANDAR; CON-90001 es personalizado pero no está en la captura.
    expect(rutas({ tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: "CON-00009", motivo: MOTIVO })).toEqual(["excepciones.0.conceptoCodigo"]);
    expect(rutas({ tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: "CON-90001", motivo: MOTIVO })).toEqual(["excepciones.0.conceptoCodigo"]);
  });

  it("una excepción ya guardada se conserva aunque el catálogo cambie (el cálculo la bloquea con BL-05)", () => {
    const x = rendimiento({ componenteCodigo: "CMP-99999" });
    expect(validarExcepciones(captura([x]), captura([x]), catalogo)).toEqual([]);
    expect(validarExcepciones(captura([x]), null, catalogo)).toHaveLength(1);
  });

  it("al quitar la partida, la referencia huérfana se rechaza aunque estuviera guardada", () => {
    const c = captura([rendimiento()]);
    const sinPartida: CapturaBorrador = { ...c, partidas: c.partidas.slice(1) };
    expect(validarExcepciones(sinPartida, c, catalogo).map((e) => e.ruta)).toEqual(["excepciones.0.partida"]);
  });
});

describe("solicitud de cálculo desde el borrador", () => {
  const conceptos = new Map([["CON-00009", { tipoFormula: "AREA" as const, insumos: ["INS-00010"] }]]);

  it("las excepciones de rendimiento y de personalizado viajan con EXC-n y la partida P00n", () => {
    const c = captura([
      { tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00010", precioCodigo: "PRE-000016", motivo: MOTIVO },
      rendimiento(),
    ]);
    expect(excepcionesParaCalculo(c)).toEqual([
      { tipo: "RENDIMIENTO", id: "EXC-2", partidaId: "P001", componenteCodigo: "CMP-00011", campo: "RENDIMIENTO", valorAplicado: "13" },
    ]);
    expect(aSolicitudCalculo(c, conceptos as never).excepciones).toHaveLength(1);
  });

  it("sin excepciones la solicitud no cambia (las versiones anteriores conservan su huella)", () => {
    const { excepciones: _, ...anterior } = captura([]);
    expect("excepciones" in aSolicitudCalculo(anterior, conceptos as never)).toBe(false);
    expect("excepciones" in aSolicitudCalculo(captura([]), conceptos as never)).toBe(false);
  });

  it("las vistas compartidas omiten las excepciones", () => {
    expect("excepciones" in sinExcepciones(captura([rendimiento()]))).toBe(false);
  });
});

describe("revisión: enviar, aprobar y emitir (W §3.10)", () => {
  const lista: ExcepcionBorrador[] = [
    rendimiento(),
    { tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00003", precioCodigo: "PRE-000005", motivo: MOTIVO },
    { tipo: "CONCEPTO_PERSONALIZADO", conceptoCodigo: "CON-90001", motivo: MOTIVO },
  ];
  const sin = new Map<number, DecisionExcepcion>();
  const codigos = (d: Map<number, DecisionExcepcion>, estricto: boolean) =>
    bloqueosExcepciones(lista, d, estricto, "v1").map((p) => `${p.codigo}:${p.referencia}`);

  it("TI-069: registradas con motivo no bloquean al enviar", () => {
    expect(codigos(sin, false)).toEqual([]);
  });

  it("TI-070/TI-093: pendientes bloquean al aprobar y emitir con el código de su tipo (BL-05, BL-09, BL-04)", () => {
    expect(codigos(sin, true)).toEqual(["BL-05:EXC-1", "BL-09:EXC-2", "BL-04:EXC-3"]);
  });

  it("TI-071: autorizadas no bloquean", () => {
    const todas = new Map<number, DecisionExcepcion>([[1, "AUTORIZADA"], [2, "AUTORIZADA"], [3, "AUTORIZADA"]]);
    expect(codigos(todas, true)).toEqual([]);
  });

  it("una rechazada bloquea siempre (también al enviar): la versión inmutable no puede aprobarse", () => {
    const d = new Map<number, DecisionExcepcion>([[1, "RECHAZADA"], [2, "AUTORIZADA"], [3, "AUTORIZADA"]]);
    expect(codigos(d, false)).toEqual(["BL-05:EXC-1"]);
    expect(codigos(d, true)).toEqual(["BL-05:EXC-1"]);
  });

  it("TI-068/BL-09: el precio vencido bloquea salvo excepción (registrada al enviar, autorizada al aprobar)", () => {
    const e = {
      ...entradaR3,
      selecciones: [{ ...entradaR3.selecciones[0]!, precioId: "PRE-000005", insumoId: "INS-00003" }],
    } as EntradaCalculo;
    const vencido: PrecioLeido = {
      codigo: "PRE-000005",
      precioUnitario: "1",
      vigenteDesde: "2026-08-01",
      vigenteHasta: "2026-09-15",
      anulado: false,
      producto: { codigo: "P", insumoCodigo: "INS-00003", contenido: "1", fraccionable: false, incrementoMinimo: null, activo: true },
      proveedor: { codigo: "PRV", activo: true },
    };
    const bl = (d: Map<number, DecisionExcepcion>, estricto: boolean) =>
      bl09(e, [vencido], "2026-09-25", preciosConExcepcion(lista, d, estricto)).map((p) => p.codigo);
    expect(bl09(e, [vencido], "2026-09-25").map((p) => p.codigo)).toEqual(["BL-09"]);
    expect(bl(sin, false)).toEqual([]);
    expect(bl(sin, true)).toEqual(["BL-09"]);
    expect(bl(new Map([[2, "AUTORIZADA"]]), true)).toEqual([]);
    expect(bl(new Map([[2, "RECHAZADA"]]), false)).toEqual(["BL-09"]);
  });

  it("TI-072/AV-04: un aviso por excepción autorizada, sin el motivo ni valores técnicos", () => {
    const avisos = av04(lista, new Map([[1, "AUTORIZADA"], [3, "RECHAZADA"]]));
    expect(avisos.map((a) => a.codigo)).toEqual(["AV-04"]);
    expect(avisos[0]!.mensaje).not.toContain(MOTIVO);
    expect(avisos[0]!.mensaje).not.toMatch(/13|12\.5/);
    expect(av04(lista, sin)).toEqual([]);
  });
});
