/**
 * Reglas de emisión (módulo 8, ADR-0010), textos de la versión (BL-20) y almacén de documentos.
 * Funciones puras y un almacén sobre una carpeta exclusiva en _work\pruebas.
 */
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapturaBorrador, EntradaCalculo } from "@softarq/contracts";
import { cr16VigenteHasta } from "../../calculo/domain/vigencias.js";
import { bl01, bl02, bl15, bl17, bl19, faltantesEmisor, puedeEmitirPersona } from "../dominio/emision.js";
import { bl20, conTextosIniciales, TEXTOS_DEMO, textosPredeterminados } from "../dominio/textos.js";
import { av02 } from "../dominio/verificacion.js";
import { AlmacenArchivos, ErrorDocumento, claveDeEmision, sha256Hex, validarPdf } from "../infraestructura/almacen-documentos.js";
import type { DatosParaEmitir } from "../infraestructura/repositorio-emisiones.js";
import { directorioDocumentosPrueba, RAIZ_PRUEBAS_DOCUMENTOS, vaciarDocumentosPrueba } from "../../../pruebas-integracion/entorno.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const AUTOR = "22222222-2222-4222-8222-222222222222";
const REVISOR = "33333333-3333-4333-8333-333333333333";

function datos(cambios: Partial<DatosParaEmitir> = {}): DatosParaEmitir {
  return {
    versionId: "44444444-4444-4444-8444-444444444444",
    cotizacionId: "55555555-5555-4555-8555-555555555555",
    folio: "COT-2027-00001",
    numero: 2,
    ultimaVersion: 2,
    estadoFolio: "ACTIVO",
    revisionBorrador: 5,
    borradorRevision: 5,
    autorId: AUTOR,
    autorNombre: "[DEMO] Preparador 1",
    total: "100.00",
    captura: {},
    proyeccionComercial: {},
    version: {
      clienteCodigo: "CLI-00001",
      clienteNombre: "[DEMO] Cliente",
      proyectoCodigo: "PRY-00001",
      proyectoNombre: "[DEMO] Proyecto",
      proyectoUbicacion: "Mérida, Yucatán",
      proyectoDescripcion: "Nave",
    },
    cliente: {
      codigo: "CLI-00001",
      nombre: "[DEMO] Cliente",
      activo: true,
      contactoNombre: "Begoña",
      contactoTelefono: null,
      contactoCorreo: "b@ejemplo.invalid",
    },
    proyecto: {
      codigo: "PRY-00001",
      nombre: "[DEMO] Proyecto",
      activo: true,
      municipio: "Mérida",
      entidadFederativa: "Yucatán",
      descripcion: "Nave",
      clienteId: "c1",
    },
    clienteIdCotizacion: "c1",
    pendiente: false,
    ...cambios,
  };
}

describe("BL-01 y BL-02 al emitir", () => {
  it("datos completos y coherentes con la versión: sin bloqueos", () => {
    expect([...bl01(datos()), ...bl02(datos())]).toEqual([]);
  });

  it("BL-01: contacto incompleto, cliente inactivo y nombre distinto de la copia de la versión", () => {
    const d = datos({ cliente: { ...datos().cliente, activo: false, contactoNombre: null, contactoCorreo: null, nombre: "[DEMO] Renombrado" } });
    const m = bl01(d).map((p) => p.mensaje);
    expect(bl01(d).every((p) => p.codigo === "BL-01")).toBe(true);
    expect(m.join(" ")).toMatch(/inactivo/);
    expect(m.join(" ")).toMatch(/nombre de contacto/);
    expect(m.join(" ")).toMatch(/medio de contacto/);
    expect(m.join(" ")).toMatch(/cambió después de calcular v2.*versión nueva/);
  });

  it("BL-02: proyecto sin ubicación, de otro cliente o con datos distintos de la versión", () => {
    expect(bl02(datos({ proyecto: { ...datos().proyecto, municipio: null } })).map((p) => p.mensaje).join(" ")).toMatch(/ubicación/);
    expect(bl02(datos({ clienteIdCotizacion: "otro" })).map((p) => p.mensaje).join(" ")).toMatch(/no pertenece/);
    expect(bl02(datos({ proyecto: { ...datos().proyecto, descripcion: "Otra" } })).map((p) => p.mensaje).join(" ")).toMatch(
      /cambiaron después de calcular v2/,
    );
    // Versión calculada antes de completar el proyecto: hace falta una versión nueva.
    const vieja = datos({ version: { ...datos().version, proyectoUbicacion: null } , proyecto: { ...datos().proyecto, municipio: null, entidadFederativa: null } });
    expect(bl02(vieja).length).toBeGreaterThan(0);
  });
});

describe("BL-15, BL-17, BL-19 y quién emite", () => {
  it("BL-15: emisor incompleto o logotipo inexistente", () => {
    const completo = { nombre: "E", domicilio: "D", telefono: "T", correo: "c@e.invalid", logoClave: "DEMO", esDemo: true, revision: 0, modificadoEn: new Date(), modificador: null };
    expect(faltantesEmisor(completo, () => true)).toEqual([]);
    expect(faltantesEmisor(completo, () => false)).toEqual(["logotipo (archivo no encontrado)"]);
    expect(faltantesEmisor(null, () => true)).toEqual(["nombre o razón social", "domicilio", "teléfono", "correo", "logotipo"]);
    expect(bl15(["correo"])[0]!.codigo).toBe("BL-15");
  });

  it("BL-17: sin aprobación, anulada, sin revisor o de la misma persona", () => {
    const base = { revisionId: "r", estado: "APROBADA", revision: 1, resueltaPor: REVISOR, aprobadaPor: "[DEMO] Revisor 1", aprobadaEn: new Date(), anulada: false };
    expect(bl17(base, AUTOR, "X")).toEqual([]);
    expect(bl17(null, AUTOR, "X")[0]!.mensaje).toMatch(/no está aprobada/);
    expect(bl17({ ...base, estado: "PENDIENTE" }, AUTOR, "X")[0]!.mensaje).toMatch(/no está aprobada/);
    expect(bl17({ ...base, anulada: true }, AUTOR, "X")[0]!.mensaje).toMatch(/se anuló/);
    expect(bl17({ ...base, resueltaPor: AUTOR }, AUTOR, "X")[0]!.mensaje).toMatch(/distinto del preparador/);
  });

  it("BL-19/BL-16: descartada, ya emitida, no es la última, revisión pendiente o borrador posterior", () => {
    expect(bl19(datos(), false)).toEqual([]);
    expect(bl19(datos({ estadoFolio: "DESCARTADO" }), false)[0]!.mensaje).toMatch(/descartada/);
    expect(bl19(datos(), true)[0]!.mensaje).toMatch(/ya está emitida/);
    expect(bl19(datos({ ultimaVersion: 3 }), false)[0]!.mensaje).toMatch(/última versión/);
    expect(bl19(datos({ pendiente: true }), false)[0]!.mensaje).toMatch(/en revisión/);
    expect(bl19(datos({ borradorRevision: 6 }), false)[0]!.codigo).toBe("BL-16");
  });

  it("quién emite (adaptación autorizada): Preparador; Revisor solo si no es el autor; nadie más", () => {
    expect(puedeEmitirPersona(["PREPARADOR"], AUTOR, AUTOR).permitido).toBe(true);
    expect(puedeEmitirPersona(["PREPARADOR"], REVISOR, AUTOR).permitido).toBe(true);
    expect(puedeEmitirPersona(["REVISOR"], REVISOR, AUTOR).permitido).toBe(true);
    expect(puedeEmitirPersona(["REVISOR"], AUTOR, AUTOR)).toEqual({ permitido: false, motivo: expect.stringMatching(/BL-17/) });
    // Con las dos funciones emite como Preparador (la aprobación sigue siendo de otra persona).
    expect(puedeEmitirPersona(["PREPARADOR", "REVISOR"], AUTOR, AUTOR).permitido).toBe(true);
    expect(puedeEmitirPersona(["ADMIN_SISTEMA", "ADMIN_CATALOGO"], REVISOR, AUTOR).permitido).toBe(false);
  });
});

describe("textos de la versión (BL-20) y vigencias con la fecha de emisión", () => {
  const vacia: CapturaBorrador = { consolidarCompras: null, partidas: [], seleccion: [] };

  // Módulo 13 (ADR-0017, cambio intencionado): las plantillas son de la configuración de la
  // organización (las DEMO son su valor inicial), no del ambiente.
  it("plantillas copiadas solo si la captura no trae textos; sin plantillas no hay predeterminados", () => {
    expect(textosPredeterminados(null)).toBeNull();
    const conDemo = conTextosIniciales(vacia, textosPredeterminados(TEXTOS_DEMO));
    expect(conDemo.textos).toEqual(TEXTOS_DEMO);
    expect(conDemo.textos).not.toBe(TEXTOS_DEMO); // copia, no referencia
    const propios = { alcance: "A", condiciones: "C", exclusiones: "E" };
    expect(conTextosIniciales({ ...vacia, textos: propios }, TEXTOS_DEMO).textos).toBe(propios);
    for (const t of Object.values(TEXTOS_DEMO)) expect(t.startsWith("[DEMO]")).toBe(true);
  });

  it("BL-20: textos ausentes (versión anterior) o vacíos", () => {
    expect(bl20({ ...vacia, textos: { ...TEXTOS_DEMO } }, "v1")).toEqual([]);
    expect(bl20(vacia, "v1")[0]!.mensaje).toMatch(/versión nueva/);
    expect(bl20({ ...vacia, textos: { alcance: " ", condiciones: "C", exclusiones: "" } }, "v1")[0]!.mensaje).toBe(
      "Complete los textos de la versión: alcance, exclusiones.",
    );
  });

  it("CR-16 y AV-02 se evalúan con la fecha de emisión", () => {
    expect(cr16VigenteHasta("2026-10-01", 15)).toBe("2026-10-16");
    expect(cr16VigenteHasta("2026-12-20", 15)).toBe("2027-01-04");
    const e = { selecciones: [{ insumoId: "INS-1", precioId: "PRE-1" }] } as unknown as EntradaCalculo;
    const precio = { codigo: "PRE-1", vigenteHasta: "2027-10-20" } as never;
    expect(av02(e, [precio], "2027-10-15", 15).map((a) => a.codigo)).toEqual(["AV-02"]);
    expect(av02(e, [precio], "2027-10-01", 15)).toEqual([]);
  });
});

describe("almacén de documentos", () => {
  const raiz = join(RAIZ_PRUEBAS_DOCUMENTOS, "documentos-unitarias");
  let almacen: AlmacenArchivos;
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n"), Buffer.alloc(900, 32), Buffer.from("\n%%EOF\n")]);
  const emision = "66666666-6666-4666-8666-666666666666";

  beforeAll(async () => {
    vaciarDocumentosPrueba(raiz);
    almacen = new AlmacenArchivos(raiz);
    await almacen.preparar();
  });
  afterAll(() => vaciarDocumentosPrueba(raiz));

  it("solo limpia carpetas de prueba bajo _work\\pruebas", () => {
    expect(() => vaciarDocumentosPrueba("D:\\Proyecto_SoftArq\\datos\\softarq_dev\\documentos")).toThrow(/_work/);
    expect(() => vaciarDocumentosPrueba(join(RAIZ_PRUEBAS_DOCUMENTOS, "otra"))).toThrow(/_work/);
    expect(directorioDocumentosPrueba("e2e")).toMatch(/_work[\\/]pruebas[\\/]documentos-e2e$/);
  });

  it("rechaza raíces relativas o dentro de un repositorio, y claves que no son del servidor", async () => {
    expect(() => new AlmacenArchivos("datos")).toThrow(/absoluta/);
    await expect(new AlmacenArchivos(join(import.meta.dirname, "salida")).preparar()).rejects.toThrow(/repositorio/);
    await expect(almacen.guardar("../../fuera.pdf", pdf)).rejects.toThrow(/Clave/);
    await expect(almacen.guardar(`emisiones/${ORG}/..\\..\\x.pdf`, pdf)).rejects.toThrow(/Clave/);
    expect(() => claveDeEmision(ORG, "nombre-del-cliente")).toThrow(/Clave/);
  });

  it("guarda, valida y firma lo escrito; nunca sobrescribe; la lectura comprueba tamaño y hash", async () => {
    const clave = claveDeEmision(ORG, emision);
    const g = await almacen.guardar(clave, pdf);
    expect(g).toEqual({ clave, bytes: pdf.length, sha256: sha256Hex(pdf) });
    await expect(almacen.guardar(clave, pdf)).rejects.toMatchObject({ code: "EEXIST" });
    expect((await almacen.leer(clave, g.bytes, g.sha256)).equals(pdf)).toBe(true);
    await expect(almacen.leer(clave, g.bytes, "0".repeat(64))).rejects.toMatchObject({ tipo: "DANADO" });
    // Sin temporales sobrantes.
    expect(readdirSync(join(raiz, "tmp"))).toEqual([]);
  });

  it("no acepta PDF incompletos", () => {
    expect(() => validarPdf(Buffer.from("hola"))).toThrow(ErrorDocumento);
    expect(() => validarPdf(Buffer.concat([pdf.subarray(0, pdf.length - 8)]))).toThrow(/incompleto/);
  });

  it("recuperación: informa y limpia solo temporales y archivos propios sin registro y antiguos", async () => {
    const huerfano = claveDeEmision(ORG, "77777777-7777-4777-8777-777777777777");
    await almacen.guardar(huerfano, pdf);
    const reciente = claveDeEmision(ORG, "88888888-8888-4888-8888-888888888888");
    await almacen.guardar(reciente, pdf);
    const temporal = join(raiz, "tmp", "99999999-9999-4999-8999-999999999999.part");
    writeFileSync(temporal, "parcial");
    const ajeno = join(raiz, "emisiones", ORG, "notas.txt");
    writeFileSync(ajeno, "no es nuestro");
    const viejo = new Date(Date.now() - 2 * 3600_000);
    utimesSync(join(raiz, ...huerfano.split("/")), viejo, viejo);
    utimesSync(temporal, viejo, viejo);
    const registrada = claveDeEmision(ORG, emision);
    mkdirSync(join(raiz, "emisiones", ORG), { recursive: true });

    const informe = await almacen.revisar({
      registradas: [{ id: emision, archivoClave: registrada, archivoBytes: pdf.length, archivoSha256: sha256Hex(pdf) }],
      limpiar: true,
      antiguedadMinimaMs: 3600_000,
      ahora: new Date(),
    });
    expect(informe.correctos).toBe(1);
    expect(informe.sinRegistro.sort()).toEqual([huerfano, reciente].sort());
    expect(informe.eliminados.sort()).toEqual([huerfano, "tmp/99999999-9999-4999-8999-999999999999.part"].sort());
    expect(informe.ajenos).toEqual([`emisiones/${ORG}/notas.txt`]);
    expect(existsSync(join(raiz, ...registrada.split("/")))).toBe(true);
    expect(existsSync(join(raiz, ...reciente.split("/")))).toBe(true); // reciente: puede estar en curso
    expect(existsSync(ajeno)).toBe(true);

    // Registro con archivo ausente: se informa, nunca se regenera.
    const ausente = await almacen.revisar({
      registradas: [{ id: "x", archivoClave: claveDeEmision(ORG, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), archivoBytes: 1, archivoSha256: "0".repeat(64) }],
      limpiar: false,
      antiguedadMinimaMs: 0,
      ahora: new Date(),
    });
    expect(ausente.ausentes).toHaveLength(1);
  });
});
