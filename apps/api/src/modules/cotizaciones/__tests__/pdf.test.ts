/**
 * Generador del PDF comercial (módulo 8, ADR-0010): contenido, paginación, acentos y ausencia de
 * datos internos. El texto se extrae con pdfjs-dist (devDependency) de los bytes generados.
 */
import { describe, expect, it } from "vitest";
import { EsquemaDocumentoCotizacion, LEYENDA_DEMO, type DocumentoCotizacion } from "@softarq/contracts";
import { ErrorGeneracionPdf, generarPdf } from "../dominio/pdf/generador-pdf.js";
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
