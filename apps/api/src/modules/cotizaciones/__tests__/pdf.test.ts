/**
 * Generador del PDF comercial (módulo 8, ADR-0010): contenido, paginación, acentos y ausencia de
 * datos internos. El texto se extrae con pdfjs-dist (devDependency) de los bytes generados.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EsquemaDocumentoBorrador, EsquemaDocumentoCotizacion, LEYENDA_DEMO, type DocumentoBorrador, type DocumentoCotizacion } from "@softarq/contracts";
import { EMISOR_PENDIENTE, ErrorGeneracionPdf, MARCA_BORRADOR, SIN_EMITIR, generarPdf } from "../dominio/pdf/generador-pdf.js";
import { cantidad, dinero, fecha, porcentaje, unidad } from "../dominio/pdf/formato.js";
import { LEYENDA_TECNICA, PLANTILLA_PDF } from "../dominio/emision.js";
import { TEXTOS_DEMO } from "../dominio/textos.js";
import { validarPdf } from "../infraestructura/almacen-documentos.js";

async function textoPorPagina(pdf: Buffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarea = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true });
  const doc = await tarea.promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    paginas.push(c.items.map((x) => ("str" in x ? x.str : "")).join(" ").replace(/\s+/g, " "));
  }
  await tarea.destroy();
  return paginas;
}

async function metadatos(pdf: Buffer): Promise<Record<string, unknown>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarea = pdfjs.getDocument({ data: new Uint8Array(pdf) });
  const doc = await tarea.promise;
  const m = await doc.getMetadata();
  const adjuntos = await doc.getAttachments();
  await tarea.destroy();
  return { ...(m.info as Record<string, unknown>), adjuntos };
}

function documento(partidas = 3, descripcionLarga = false): DocumentoCotizacion {
  return EsquemaDocumentoCotizacion.parse({
    plantilla: PLANTILLA_PDF,
    ambiente: "DEMO",
    origen: "WEB_DEMO",
    folio: "COT-2026-00042",
    versionNumero: 3,
    idVersion: "COT-2026-00042-v3",
    fechaEmision: "2027-10-15",
    vigenciaDias: 15,
    vigenteHasta: "2027-10-30",
    emisor: {
      nombre: "[DEMO] EMISOR DE DEMOSTRACIÓN (ficticio)",
      domicilio: "Domicilio ficticio de demostración",
      telefono: "000 000 0000 (ficticio)",
      correo: "demo@ejemplo.invalid",
      logo: "DEMO",
    },
    cliente: { codigo: "CLI-00007", nombre: "[DEMO] Construcción Peñasco y Ñandú, S.A." },
    contacto: { nombre: "Begoña Muñoz Íñiguez", telefono: "55 1234 5678", correo: "begona@ejemplo.invalid" },
    proyecto: { codigo: "PRY-00009", nombre: "[DEMO] Bodega «El Águila»", ubicacion: "Mérida, Yucatán", descripcion: "Ampliación de nave con cubierta ligera." },
    moneda: "MXN",
    partidas: Array.from({ length: partidas }, (_, i) => ({
      numero: i + 1,
      descripcion:
        descripcionLarga && i % 7 === 3
          ? `[DEMO] Partida ${i + 1}: cubierta ligera con lámina galvanizada calibre 26, canalón, bajadas pluviales, cumbrera y remates; incluye maniobras, acarreos a 20 m y limpieza del área de trabajo al término de cada jornada (descripción larga para probar el ajuste).`
          : `[DEMO] Partida ${i + 1} — muro de block reforzado`,
      unidad: i % 3 === 0 ? "m2" : i % 3 === 1 ? "m3" : "viaje",
      cantidad: "11.3",
      precioUnitario: "1234.5",
      importe: "13949.85",
    })),
    subtotal: "13949.85",
    impuesto: { nombre: "Impuesto (tasa ilustrativa)", tasa: "0.16", importe: "2231.98" },
    total: "16181.83",
    textos: { ...TEXTOS_DEMO },
    leyendaTecnica: LEYENDA_TECNICA,
    personas: { preparo: "[DEMO] Preparador 1", aprobo: "[DEMO] Revisor 1", emitio: "[DEMO] Preparador 1" },
  });
}

describe("formato es-MX del documento", () => {
  it("importes, cantidades, tasas, fechas y unidades sin number", () => {
    expect(dinero("54190.68")).toBe("$54,190.68");
    expect(dinero("4911.79")).toBe("$4,911.79");
    expect(dinero("1234567.005")).toBe("$1,234,567.01");
    expect(cantidad("11.3")).toBe("11.30");
    expect(cantidad("1.23456")).toBe("1.2346");
    expect(cantidad("1500")).toBe("1,500.00");
    expect(porcentaje("0.16")).toBe("16 %");
    expect(fecha("2026-10-03")).toBe("03/10/2026");
    expect(unidad("m2")).toBe("m²");
    expect(unidad("m3")).toBe("m³");
  });
});

// La primera extracción carga pdfjs-dist (varios segundos en la corrida completa).
describe("generador del PDF", { timeout: 60_000 }, () => {
  it("una página: emisor, cliente, contacto, folio, versión, fechas, partidas, totales, textos, marca y pie", async () => {
    // Descripción de proyecto de tres líneas: aun así cabe en una página (sin página sobrante).
    const d = documento(4);
    d.proyecto.descripcion = "Ampliación de nave industrial con cubierta ligera, muros de block reforzado y losa de concreto en el área de carga.";
    const pdf = await generarPdf(d);
    validarPdf(pdf);
    const paginas = await textoPorPagina(pdf);
    expect(paginas).toHaveLength(1);
    const t = paginas[0]!;
    for (const esperado of [
      "COTIZACIÓN",
      "[DEMO] EMISOR DE DEMOSTRACIÓN (ficticio)",
      "COT-2026-00042",
      "v3",
      "WEB DEMO",
      "15/10/2027",
      "30/10/2027 (15 días naturales)",
      "[DEMO] Construcción Peñasco y Ñandú, S.A.",
      "Begoña Muñoz Íñiguez",
      "55 1234 5678",
      "[DEMO] Bodega «El Águila»",
      "Mérida, Yucatán",
      "m²",
      "m³",
      "$1,234.50",
      "$13,949.85",
      "Impuesto (tasa ilustrativa) 16 %",
      "$2,231.98",
      "Total MXN",
      "$16,181.83",
      TEXTOS_DEMO.alcance,
      TEXTOS_DEMO.condiciones,
      TEXTOS_DEMO.exclusiones,
      "Esta cotización no constituye un plano estructural aprobado",
      "Registro operativo — Preparó: [DEMO] Preparador 1",
      "Aprobó: [DEMO] Revisor 1",
      "Emitió: [DEMO] Preparador 1",
      "Precios en pesos mexicanos (MXN).",
      LEYENDA_DEMO,
      "DEMOSTRACIÓN",
      "COT-2026-00042-v3 · WEB DEMO",
      "Página 1 de 1",
    ]) {
      expect(t, esperado).toContain(esperado);
    }
  });

  it("varias páginas con descripciones largas: encabezado de tabla, marca DEMO y pie con folio en cada página", async () => {
    const d = documento(60, true);
    const pdf = await generarPdf(d);
    const paginas = await textoPorPagina(pdf);
    expect(paginas.length).toBeGreaterThanOrEqual(3);
    paginas.forEach((p, i) => {
      expect(p).toContain(LEYENDA_DEMO);
      expect(p).toContain("COT-2026-00042-v3 · WEB DEMO");
      expect(p).toContain(`Página ${i + 1} de ${paginas.length}`);
    });
    // Encabezado de la tabla repetido en las páginas que tienen partidas.
    const conTabla = paginas.filter((p) => /Partida \d+/.test(p));
    expect(conTabla.length).toBeGreaterThanOrEqual(2);
    for (const p of conTabla) expect(p).toContain("P.U. MXN");
    // Todas las partidas, una sola vez cada número de partida en su celda; totales completos al final.
    const todo = paginas.join(" ");
    for (let i = 1; i <= 60; i++) expect(todo).toContain(`Partida ${i}`);
    expect(todo).toContain("$16,181.83");
    expect(todo).toContain("Emitió: [DEMO] Preparador 1");
  });

  it("sin datos internos en el texto ni en los metadatos; sin autor, título ni adjuntos", async () => {
    const pdf = await generarPdf(documento(5));
    const texto = (await textoPorPagina(pdf)).join(" ").toLowerCase();
    for (const prohibido of [
      "costo",
      "proveedor",
      "consumo",
      "rendimiento",
      "desperdicio",
      "margen",
      "recargo",
      "excepci",
      "sobrante",
      "postgres",
      "softarq_app",
      "password",
      "contraseña",
      "d:\\",
      "_work",
    ]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    const m = await metadatos(pdf);
    expect(m["Author"]).toBeUndefined();
    expect(m["Title"]).toBeUndefined();
    expect(m["adjuntos"]).toBeNull();
    const crudo = pdf.toString("latin1");
    expect(crudo).not.toMatch(/\/EmbeddedFile|\/JavaScript|\/Launch/);
  });

  it("se niega a generar con caracteres sin glifo (nunca «tofu»)", async () => {
    const d = documento(1);
    d.contacto.nombre = "Contacto 漢字";
    await expect(generarPdf(d)).rejects.toBeInstanceOf(ErrorGeneracionPdf);
  });

  it("mismo documento → mismo contenido de texto (no depende de datos externos)", async () => {
    const a = await textoPorPagina(await generarPdf(documento(4)));
    const b = await textoPorPagina(await generarPdf(documento(4)));
    expect(a).toEqual(b);
  });
});

/**
 * Módulo 15 (ADR-0019): el documento EMITIDO no cambia con la variante BORRADOR. Huella SHA-256 de
 * este documento fijo calculada ANTES de modificar el generador (`_work/tmp/m15/huella-emitido-antes.txt`).
 */
const HUELLA_EMITIDO_ANTES = "6bbe7811905cae06615fba5a289c4a0f78544343e1b3f8485676ee2e6d24c3a6";

function documentoFijo(): DocumentoCotizacion {
  const d = documento(30);
  return EsquemaDocumentoCotizacion.parse({
    ...d,
    partidas: d.partidas.map((p, i) => ({ ...p, descripcion: `[DEMO] Partida ${i + 1} — muro de block reforzado`, unidad: "m2" })),
  });
}

function borrador(partidas = 3, larga = false, extra: Partial<DocumentoBorrador> = {}): DocumentoBorrador {
  const d = documento(partidas, larga);
  return EsquemaDocumentoBorrador.parse({
    tipo: "BORRADOR",
    plantilla: d.plantilla,
    ambiente: "DEMO",
    origen: "WEB_DEMO",
    folio: d.folio,
    versionNumero: d.versionNumero,
    idVersion: d.idVersion,
    fechaCalculo: "2027-10-10",
    fechaGeneracion: "2027-10-15",
    vigenciaDias: 15,
    emisor: { ...d.emisor },
    cliente: d.cliente,
    contacto: d.contacto,
    proyecto: d.proyecto,
    moneda: "MXN",
    partidas: d.partidas,
    subtotal: d.subtotal,
    impuesto: d.impuesto,
    total: d.total,
    textos: larga
      ? {
          alcance: `${d.textos.alcance} `.repeat(12).trim(),
          condiciones: `${d.textos.condiciones} `.repeat(12).trim(),
          exclusiones: `${d.textos.exclusiones} `.repeat(12).trim(),
        }
      : d.textos,
    leyendaTecnica: d.leyendaTecnica,
    personas: { preparo: "[DEMO] Preparador 1", aprobo: null },
    ...extra,
  });
}

describe("vista previa BORRADOR (B-25, módulo 15)", () => {
  it("el documento EMITIDO genera exactamente los mismos bytes que antes del módulo", async () => {
    const huella = createHash("sha256").update(await generarPdf(documentoFijo())).digest("hex");
    expect(huella).toBe(HUELLA_EMITIDO_ANTES);
  });

  it("multipágina con textos largos: BORRADOR, DEMOSTRACIÓN, folio, versión y paginación en cada página; nada cortado", async () => {
    const pdf = await generarPdf(borrador(60, true));
    const paginas = await textoPorPagina(pdf);
    expect(paginas.length).toBeGreaterThanOrEqual(4);
    paginas.forEach((p, i) => {
      expect(p).toContain(MARCA_BORRADOR);
      expect(p).toContain(LEYENDA_DEMO);
      expect(p).toContain("COT-2026-00042-v3 · WEB DEMO · BORRADOR");
      expect(p).toContain(`Página ${i + 1} de ${paginas.length}`);
    });
    const todo = paginas.join(" ");
    for (let i = 1; i <= 60; i++) expect(todo).toContain(`Partida ${i}`);
    expect(todo).toContain("$16,181.83");
    expect(todo).toContain(`Fecha de emisión ${SIN_EMITIR}`);
    expect(todo).toContain("15 días naturales desde la emisión");
    expect(todo).toContain("Vista previa sin emitir");
    expect(todo).toContain("Aprobó: (pendiente)");
    expect(todo).toContain("Emitió: (sin emitir)");
    // Las condiciones largas terminan completas (última frase presente) y el registro operativo al final.
    expect(todo.lastIndexOf("Registro operativo")).toBeGreaterThan(todo.lastIndexOf("Exclusiones"));
    // No se presenta como emitido.
    expect(todo).not.toContain("Documento comercial emitido");
    expect(todo).not.toMatch(/Vigente hasta \d/);
  });

  it("datos ausentes: emisor pendiente y versión sin textos se indican tal cual, sin plantillas", async () => {
    const pdf = await generarPdf(
      borrador(2, false, {
        emisor: { nombre: null, domicilio: null, telefono: null, correo: null, logo: null },
        textos: null,
        vigenciaDias: null,
        contacto: { nombre: null, telefono: null, correo: null },
      }),
    );
    const todo = (await textoPorPagina(pdf)).join(" ");
    expect(todo).toContain(EMISOR_PENDIENTE);
    expect(todo).toContain("No registrados en esta versión.");
    expect(todo).toContain("Vigencia No definida");
    expect(todo).not.toContain("Alcance ");
  });

  it("sin datos internos en el texto ni en los metadatos; sin autor, título ni adjuntos", async () => {
    const pdf = await generarPdf(borrador(5));
    const texto = (await textoPorPagina(pdf)).join(" ").toLowerCase();
    for (const prohibido of ["costo", "proveedor", "consumo", "rendimiento", "desperdicio", "margen", "recargo", "excepci", "sobrante", "postgres", "_work"]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    const m = await metadatos(pdf);
    expect(m["Author"]).toBeUndefined();
    expect(m["Title"]).toBeUndefined();
    expect(m["adjuntos"]).toBeNull();
    expect(pdf.toString("latin1")).not.toMatch(/\/EmbeddedFile|\/JavaScript|\/Launch/);
  });
});
