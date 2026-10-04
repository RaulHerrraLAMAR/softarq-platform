/**
 * Reglas puras del módulo de cotizaciones (ADR-0008): borrador → solicitud, completitud
 * (ausencia, cero e inválido), huellas, resumen de cambios, idempotencia, errores de la base y
 * matriz de permisos contrastada con el libro.
 */
import { describe, expect, it } from "vitest";
import {
  CAPTURA_BORRADOR_VACIA,
  EsquemaCapturaBorrador,
  EsquemaSolicitudBorrador,
  type CapturaBorrador,
  type CotizacionComercial,
  type EntradaCalculo,
} from "@softarq/contracts";
import { capacidadesDe } from "../../autenticacion/dominio/capacidades.js";
import { aSolicitudCalculo, evaluarCompletitud, type ConceptoParaCaptura } from "../dominio/borrador.js";
import { huellaReferencia, jsonCanonico, sha256 } from "../dominio/huella.js";
import { resumirCambios, type EstadoComparable } from "../dominio/resumen-cambios.js";
import { ErrorNegocio, reconocerErrorBase, traducirErrorBase } from "../aplicacion/errores.js";
import { ejecutarIdempotente, prepararIdempotencia, reproducible } from "../aplicacion/idempotencia.js";

const CONCEPTOS = new Map<string, ConceptoParaCaptura>([
  ["CON-00001", { tipoFormula: "LONGITUD", insumos: ["INS-00001", "INS-00002"] }],
  ["CON-00002", { tipoFormula: "AREA", insumos: ["INS-00002", "INS-00003"] }],
  ["CON-00009", { tipoFormula: "CONTEO", insumos: [] }],
]);

type Renglon = Extract<CapturaBorrador["partidas"][number], { tipo: "CONCEPTO" }>["mediciones"][number];
const renglon = (extra: Partial<Renglon> = {}): Renglon => ({
  descripcion: "",
  signo: "+" as const,
  piezas: "2",
  largo: "3.5",
  ancho: null,
  alto: null,
  segundaMedida: "ancho" as const,
  ...extra,
});

function capturaCompleta(): CapturaBorrador {
  return {
    consolidarCompras: true,
    partidas: [
      { tipo: "CONCEPTO", conceptoCodigo: "CON-00001", descripcion: "  ", mediciones: [renglon()] },
      {
        tipo: "CONCEPTO",
        conceptoCodigo: "CON-00002",
        descripcion: "Losa del eje A",
        mediciones: [renglon({ largo: "4", alto: "2.5", segundaMedida: "alto" })],
      },
      { tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001", descripcion: " Flete ", cantidad: "1", monto: "1500" },
    ],
    seleccion: [
      { insumoCodigo: "INS-00001", precioCodigo: "PRE-000001" },
      { insumoCodigo: "INS-00002", precioCodigo: "PRE-000002" },
      { insumoCodigo: "INS-00003", precioCodigo: "PRE-000003" },
      { insumoCodigo: "INS-00099", precioCodigo: "PRE-000099" },
    ],
  };
}

describe("contrato del borrador: ausencia, cero e inválido", () => {
  it("acepta null (sin capturar) y \"0\" (cero) como valores distintos", () => {
    const c = capturaCompleta();
    const p = c.partidas[0] as Extract<CapturaBorrador["partidas"][number], { tipo: "CONCEPTO" }>;
    p.mediciones = [renglon({ piezas: null }), renglon({ piezas: "0" })];
    const r = EsquemaCapturaBorrador.parse(c);
    const m = (r.partidas[0] as typeof p).mediciones;
    expect(m[0]!.piezas).toBeNull();
    expect(m[1]!.piezas).toBe("0");
  });

  it("rechaza un decimal con formato inválido con la ruta del campo (no se guarda)", () => {
    const c = capturaCompleta();
    (c.partidas[0] as { mediciones: unknown[] }).mediciones = [renglon({ piezas: "1,5" })];
    const r = EsquemaSolicitudBorrador.safeParse({ revision: 0, captura: c });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["captura", "partidas", 0, "mediciones", 0, "piezas"]);
  });

  it("rechaza campos no previstos (no acepta resultados, importes ni la organización)", () => {
    expect(EsquemaCapturaBorrador.safeParse({ ...CAPTURA_BORRADOR_VACIA, total: "100.00" }).success).toBe(false);
    expect(EsquemaSolicitudBorrador.safeParse({ revision: 0, captura: CAPTURA_BORRADOR_VACIA, organizacionId: "x" }).success).toBe(false);
  });
});

describe("completitud del borrador", () => {
  it("una captura vacía está incompleta y no se convierte en un cálculo (sin total cero)", () => {
    const r = evaluarCompletitud(CAPTURA_BORRADOR_VACIA, CONCEPTOS);
    expect(r.lista).toBe(false);
    expect(r.pendientes.map((p) => p.ruta)).toEqual(["consolidarCompras", "partidas"]);
  });

  it("señala cada dato ausente con la misma ruta que la web", () => {
    const c = capturaCompleta();
    (c.partidas[0] as { mediciones: unknown[] }).mediciones = [renglon({ piezas: null, largo: null })];
    (c.partidas[1] as { mediciones: unknown[] }).mediciones = [renglon({ largo: "4", ancho: null, alto: null, segundaMedida: "alto" })];
    c.partidas[2] = { tipo: "ADICIONAL", tipoAdicionalCodigo: null, descripcion: "", cantidad: null, monto: null };
    c.seleccion = [];
    const rutas = evaluarCompletitud(c, CONCEPTOS).pendientes.map((p) => p.ruta);
    expect(rutas).toEqual([
      "partidas[0].mediciones[0].piezas",
      "partidas[0].mediciones[0].largo",
      "partidas[1].mediciones[0].alto",
      "partidas[2].tipoAdicionalCodigo",
      "partidas[2].descripcion",
      "partidas[2].cantidad",
      "partidas[2].monto",
      "seleccion.INS-00001",
      "seleccion.INS-00002",
      "seleccion.INS-00003",
    ]);
  });

  it("un concepto que ya no existe queda pendiente, sin inventar sus datos", () => {
    const c = capturaCompleta();
    c.partidas = [{ tipo: "CONCEPTO", conceptoCodigo: "CON-00404", descripcion: "", mediciones: [renglon()] }];
    expect(evaluarCompletitud(c, CONCEPTOS).pendientes).toEqual([
      { ruta: "partidas[0].conceptoCodigo", mensaje: "El concepto CON-00404 no existe o no está disponible." },
    ]);
  });

  it("el cero es un valor capturado: la captura está «lista» y lo rechaza la regla de cálculo, no la completitud", () => {
    const c = capturaCompleta();
    c.partidas = [{ tipo: "CONCEPTO", conceptoCodigo: "CON-00009", descripcion: "", mediciones: [renglon({ piezas: "0", largo: null })] }];
    c.seleccion = [];
    expect(evaluarCompletitud(c, CONCEPTOS).lista).toBe(true);
  });
});

describe("borrador → solicitud de cálculo (igual que armarSolicitud de la web)", () => {
  it("numera partidas, recorta textos, anula dimensiones no usadas y elige precios solo de insumos en uso", () => {
    const s = aSolicitudCalculo(capturaCompleta(), CONCEPTOS);
    expect(s).toEqual({
      consolidarCompras: true,
      partidas: [
        {
          id: "P001",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00001",
          mediciones: [{ descripcion: "", signo: "+", piezas: "2", largo: "3.5", ancho: null, alto: null }],
        },
        {
          id: "P002",
          tipo: "CONCEPTO",
          conceptoCodigo: "CON-00002",
          descripcion: "Losa del eje A",
          mediciones: [{ descripcion: "", signo: "+", piezas: "2", largo: "4", ancho: null, alto: "2.5" }],
        },
        { id: "P003", tipo: "ADICIONAL", tipoAdicionalCodigo: "CAD-00001", descripcion: "Flete", cantidad: "1", monto: "1500" },
      ],
      preciosElegidos: ["PRE-000001", "PRE-000002", "PRE-000003"],
    });
  });
});

describe("huellas SHA-256 sobre JSON canónico", () => {
  it("no dependen del orden de las claves", () => {
    expect(jsonCanonico({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
    expect(sha256({ a: 1, b: 2 }).equals(sha256({ b: 2, a: 1 }))).toBe(true);
    expect(sha256({ a: 1 })).toHaveLength(32);
  });

  it("la huella de referencia ignora la captura y cambia con un precio", () => {
    const entrada = {
      fechaCalculo: "2026-09-25",
      parametros: { ambiente: "DEMO", moneda: "MXN", recargoSobreCosto: "0.25", impuesto: null, consolidarCompras: true },
      insumos: [{ id: "INS-00001", unidadBase: "pza" }],
      conversiones: [],
      partidas: [{ id: "P001", tipo: "ADICIONAL", descripcion: "x", categoria: "FLETE", unidad: "viaje", cantidad: "1", monto: "10" }],
      selecciones: [{ precioId: "PRE-000001", precioUnitario: "10.00" }],
      excepciones: [],
    } as unknown as EntradaCalculo;
    const otraCaptura = {
      ...entrada,
      fechaCalculo: "2026-10-01",
      parametros: { ...entrada.parametros, consolidarCompras: false },
      partidas: [{ ...entrada.partidas[0]!, cantidad: "3", descripcion: "y" }],
    } as EntradaCalculo;
    expect(huellaReferencia(entrada).equals(huellaReferencia(otraCaptura))).toBe(true);
    const otroPrecio = { ...entrada, selecciones: [{ precioId: "PRE-000001", precioUnitario: "11.00" }] } as unknown as EntradaCalculo;
    expect(huellaReferencia(entrada).equals(huellaReferencia(otroPrecio))).toBe(false);
  });
});

describe("resumen de cambios frente a la versión anterior", () => {
  const comercial = (descripciones: string[], total: string) =>
    ({ partidas: descripciones.map((d, i) => ({ numero: i + 1, descripcion: d })), total }) as unknown as CotizacionComercial;
  const descriptivos = { clienteNombre: "[DEMO] Cliente", proyectoNombre: "[DEMO] Obra", proyectoUbicacion: null, proyectoDescripcion: null };

  it("v1: sin versión anterior", () => {
    const r = resumirCambios(null, { captura: capturaCompleta(), comercial: comercial(["a"], "10.00"), huellaReferenciaHex: "aa", descriptivos });
    expect(r).toMatchObject({ versionAnterior: null, totalAnterior: null, totalNuevo: "10.00", partidasAgregadas: [] });
  });

  it("empareja partidas por contenido: quitar la primera no marca las demás como modificadas", () => {
    const antes = capturaCompleta();
    const despues = capturaCompleta();
    despues.partidas = despues.partidas.slice(1);
    const pAdicional = despues.partidas[1] as { monto: string | null };
    pAdicional.monto = "2000";
    despues.seleccion = despues.seleccion.filter((s) => s.insumoCodigo !== "INS-00001");
    const anterior: EstadoComparable = {
      numero: 1,
      captura: antes,
      comercial: comercial(["Larguero", "Losa del eje A", "Flete"], "100.00"),
      huellaReferenciaHex: "aa",
      descriptivos,
    };
    const r = resumirCambios(anterior, {
      captura: despues,
      comercial: comercial(["Losa del eje A", "Flete"], "90.00"),
      huellaReferenciaHex: "bb",
      descriptivos: { ...descriptivos, clienteNombre: "[DEMO] Cliente renombrado" },
    });
    expect(r).toEqual({
      versionAnterior: 1,
      partidasAgregadas: [],
      partidasQuitadas: ["1. Larguero"],
      partidasModificadas: ["2. Flete"],
      seleccionCambiada: ["INS-00001"],
      consolidacionCambiada: false,
      datosDescriptivosCambiados: ["cliente.nombre"],
      // Módulo 8: textos de la versión (ninguno cambió en este caso).
      textosCambiados: [],
      condicionesCambiadas: true,
      totalAnterior: "100.00",
      totalNuevo: "90.00",
    });
  });
});

describe("idempotencia", () => {
  const ahora = new Date("2026-10-03T12:00:00.000Z");
  const idem = prepararIdempotencia("6f1c1d1e-0000-4000-8000-000000000001", "crear_cliente", {}, { nombre: "A" }, ahora);

  it("caduca a las 24 h y su huella depende de operación, ruta y cuerpo", () => {
    expect(idem.expiraEn.toISOString()).toBe("2026-10-04T12:00:00.000Z");
    const otraRuta = prepararIdempotencia(idem.clave, "crear_version", { cotizacionId: "x" }, { a: 1 }, ahora);
    const otraRuta2 = prepararIdempotencia(idem.clave, "crear_version", { cotizacionId: "y" }, { a: 1 }, ahora);
    expect(otraRuta.huella.equals(otraRuta2.huella)).toBe(false);
  });

  it("reproduce con la misma operación y contenido; rechaza otro contenido, otra operación o una clave caducada", () => {
    const registro = { operacion: "crear_cliente", huellaSolicitud: idem.huella, recursoId: "r1", expiraEn: idem.expiraEn };
    expect(reproducible(registro, idem, ahora)).toBe("r1");
    const otroCuerpo = prepararIdempotencia(idem.clave, "crear_cliente", {}, { nombre: "B" }, ahora);
    expect(() => reproducible(registro, otroCuerpo, ahora)).toThrow(expect.objectContaining({ codigo: "IDEMPOTENCIA_CONFLICTO" }));
    const otraOperacion = { ...idem, operacion: "crear_proyecto" as const };
    expect(() => reproducible(registro, otraOperacion, ahora)).toThrow(expect.objectContaining({ codigo: "IDEMPOTENCIA_CONFLICTO" }));
    expect(() => reproducible(registro, idem, idem.expiraEn)).toThrow(expect.objectContaining({ codigo: "IDEMPOTENCIA_CADUCADA" }));
  });

  it("si otra solicitud con la misma clave se confirmó entre tanto, reproduce su resultado sin crear otro", async () => {
    let consultas = 0;
    const fuente = {
      buscarIdempotencia: async () =>
        consultas++ === 0 ? null : { operacion: "crear_cliente", huellaSolicitud: idem.huella, recursoId: "ganadora", expiraEn: idem.expiraEn },
    };
    const r = await ejecutarIdempotente(fuente, { organizacionId: "o" }, { usuarioId: "u" }, idem, ahora, async () => {
      throw new Error('duplicate key value violates unique constraint "idempotencia_pkey"');
    });
    expect(r).toEqual({ id: "ganadora", reproducida: true });
  });
});

describe("errores de las funciones de la base", () => {
  it("reconoce SOFTARQ:<CODIGO> y la clave de idempotencia repetida, aunque vengan anidados", () => {
    const anidado = { message: "Error en consulta", cause: { message: "P0001: SOFTARQ:BORRADOR_DESACTUALIZADO" } };
    expect(reconocerErrorBase(anidado)).toEqual({ tipo: "negocio", codigo: "BORRADOR_DESACTUALIZADO" });
    expect(reconocerErrorBase({ meta: { constraint: "idempotencia_pkey" } })).toEqual({ tipo: "idempotencia_repetida" });
    expect(reconocerErrorBase(new Error("otra cosa"))).toBeNull();
  });

  it("traduce a errores de negocio sin detalles internos", () => {
    const e = traducirErrorBase(new Error("SOFTARQ:CLIENTE_INACTIVO"));
    expect(e).toBeInstanceOf(ErrorNegocio);
    expect((e as ErrorNegocio).codigo).toBe("REGISTRO_INACTIVO");
    const desconocido = new Error("fallo de red");
    expect(traducirErrorBase(desconocido)).toBe(desconocido);
  });
});

describe("matriz de permisos de cotizaciones (contrastada con el libro)", () => {
  it("Preparador prepara y calcula; Revisor solo consulta", () => {
    expect(capacidadesDe(["PREPARADOR"])).toEqual(
      expect.arrayContaining(["clientes.consultar", "clientes.gestionar", "cotizaciones.consultar", "cotizaciones.preparar"]),
    );
    const revisor = capacidadesDe(["REVISOR"]);
    expect(revisor).toEqual(expect.arrayContaining(["clientes.consultar", "cotizaciones.consultar"]));
    expect(revisor).not.toContain("clientes.gestionar");
    expect(revisor).not.toContain("cotizaciones.preparar");
    expect(revisor).not.toContain("calculo.ejecutar");
  });

  it("clientes y proyectos: Preparador o Administrador del catálogo (Cat_RequiereFuncion)", () => {
    expect(capacidadesDe(["ADMIN_CATALOGO"])).toContain("clientes.gestionar");
    expect(capacidadesDe(["ADMIN_CATALOGO"])).not.toContain("cotizaciones.preparar");
    expect(capacidadesDe(["ADMIN_SISTEMA"])).not.toContain("clientes.gestionar");
  });
});
