/**
 * Generador del PDF comercial de una versión emitida (módulo 8, ADR-0010), con PDFKit y recursos
 * locales (fuentes Fira Sans con licencia OFL y logotipo DEMO copiado de la fase 1).
 *
 * Recibe SOLO `DocumentoCotizacion` (estructura comercial permitida, D-16): nunca entidades,
 * costos, proveedores, consumos, recargo ni margen. Contenido según el Word maestro §3.13 y
 * `Pdf_Llenar` de `modPdf.bas`: emisor y logotipo; folio, versión, origen, fecha de emisión y
 * vigencia; cliente, contacto, proyecto, ubicación y descripción; partidas; subtotal, impuesto y
 * total MXN; alcance, condiciones y exclusiones; leyenda técnica; preparó, aprobó y emitió
 * (registro operativo); «DEMOSTRACIÓN» y marca de agua en cada página; folio y «Página X de Y» en
 * el pie. Sin autor ni título en los metadatos (como el libro) y sin adjuntos.
 *
 * Diseño: carta vertical, jerarquía por peso (400/600/700), cifras tabulares en importes, paleta
 * de `docs/web/sistema-visual.md`. Las filas no se cortan: si no caben, pasan a la página
 * siguiente con el encabezado de la tabla repetido; el bloque de totales no se divide.
 */
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { LEYENDA_DEMO, type DocumentoCotizacion } from "@softarq/contracts";
import { cantidad, dinero, fecha, porcentaje, unidad } from "./formato.js";

/** Raíz de `apps/api` (igual desde `src/` y desde `dist/`). */
const RAIZ_API = join(import.meta.dirname, "..", "..", "..", "..", "..");
export const DIR_RECURSOS_PDF = join(RAIZ_API, "recursos", "pdf");

export const LOGOS: Readonly<Record<string, string>> = { DEMO: join(DIR_RECURSOS_PDF, "logo-demo.png") };

const FUENTES = {
  normal: join(DIR_RECURSOS_PDF, "fuentes", "fira-sans-latin-400-normal.woff"),
  seminegrita: join(DIR_RECURSOS_PDF, "fuentes", "fira-sans-latin-600-normal.woff"),
  negrita: join(DIR_RECURSOS_PDF, "fuentes", "fira-sans-latin-700-normal.woff"),
} as const;

export type GeneradorPdf = (documento: DocumentoCotizacion) => Promise<Buffer>;

export class ErrorGeneracionPdf extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorGeneracionPdf";
  }
}

const COLOR = {
  texto: "#0f172a",
  secundario: "#334155",
  atenuado: "#475569",
  borde: "#cbd5e1",
  fondo: "#f8fafc",
  marca: "#0f172a",
  acento: "#0369a1",
  totalFondo: "#e0f2fe",
  demo: "#b91c1c",
} as const;

const PAGINA = { ancho: 612, alto: 792 } as const;
const MARGEN = { izquierdo: 46, derecho: 46, superior: 66, inferior: 58 } as const;
const ANCHO = PAGINA.ancho - MARGEN.izquierdo - MARGEN.derecho; // 520
const LIMITE_INFERIOR = PAGINA.alto - MARGEN.inferior;
const X0 = MARGEN.izquierdo;

/** Columnas de la tabla de partidas (suman ANCHO). */
const COLUMNAS = [
  { clave: "numero", titulo: "No.", ancho: 30, alineacion: "center" },
  { clave: "descripcion", titulo: "Concepto", ancho: 222, alineacion: "left" },
  { clave: "unidad", titulo: "Unidad", ancho: 44, alineacion: "center" },
  { clave: "cantidad", titulo: "Cantidad", ancho: 66, alineacion: "right" },
  { clave: "precioUnitario", titulo: "P.U. MXN", ancho: 76, alineacion: "right" },
  { clave: "importe", titulo: "Importe MXN", ancho: 82, alineacion: "right" },
] as const;
const RELLENO_CELDA = 4;

type Doc = InstanceType<typeof PDFDocument>;

/** Todos los textos del documento (para comprobar glifos antes de dibujar). */
function textosDe(d: DocumentoCotizacion): string[] {
  return [
    LEYENDA_DEMO,
    d.folio,
    d.idVersion,
    d.emisor.nombre,
    d.emisor.domicilio,
    d.emisor.telefono,
    d.emisor.correo,
    d.cliente.nombre,
    d.contacto.nombre,
    d.contacto.telefono ?? "",
    d.contacto.correo ?? "",
    d.proyecto.nombre,
    d.proyecto.ubicacion,
    d.proyecto.descripcion,
    d.impuesto.nombre,
    d.textos.alcance,
    d.textos.condiciones,
    d.textos.exclusiones,
    d.leyendaTecnica,
    d.personas.preparo,
    d.personas.aprobo,
    d.personas.emitio,
    ...d.partidas.flatMap((p) => [p.descripcion, unidad(p.unidad)]),
    "COTIZACIÓN Página de · — áéíóúñÁÉÍÓÚÑ ¿¡ ² ³ $ % /",
  ];
}

interface FuenteConGlifos {
  hasGlyphForCodePoint(cp: number): boolean;
}

/** Falla (sin generar) si algún carácter no tiene glifo en las fuentes: nunca «tofu». */
function comprobarGlifos(doc: Doc, d: DocumentoCotizacion): void {
  const faltan = new Set<string>();
  for (const nombre of ["normal", "seminegrita", "negrita"] as const) {
    doc.font(nombre);
    const f = (doc as unknown as { _font?: { font?: FuenteConGlifos } })._font?.font;
    if (!f || typeof f.hasGlyphForCodePoint !== "function") throw new ErrorGeneracionPdf("No se pudo inspeccionar la fuente del documento.");
    for (const t of textosDe(d)) {
      for (const ch of t) {
        const cp = ch.codePointAt(0)!;
        if (cp === 0x0a || cp === 0x0d || cp === 0x09) continue;
        if (!f.hasGlyphForCodePoint(cp)) faltan.add(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
  }
  if (faltan.size > 0) {
    throw new ErrorGeneracionPdf(`El documento contiene caracteres que la fuente no puede representar: ${[...faltan].join(", ")}.`);
  }
}

function etiqueta(doc: Doc, texto: string, x: number, y: number, ancho: number): number {
  doc.font("seminegrita").fontSize(7.5).fillColor(COLOR.atenuado);
  doc.text(texto.toUpperCase(), x, y, { width: ancho, characterSpacing: 0.4, lineBreak: true });
  return doc.y;
}

function valor(doc: Doc, texto: string, x: number, y: number, ancho: number, peso: "normal" | "seminegrita" = "normal", tam = 9.5): number {
  doc.font(peso).fontSize(tam).fillColor(COLOR.texto);
  doc.text(texto, x, y, { width: ancho, lineGap: 1.5 });
  return doc.y;
}

function alto(doc: Doc, texto: string, ancho: number, fuente: string, tam: number, lineGap = 1.5): number {
  doc.font(fuente).fontSize(tam);
  return doc.heightOfString(texto, { width: ancho, lineGap });
}

/** Encabezado del documento (solo en la primera página). Devuelve la `y` siguiente. */
function encabezado(doc: Doc, d: DocumentoCotizacion): number {
  let y = MARGEN.superior;
  const logo = LOGOS[d.emisor.logo];
  if (!logo) throw new ErrorGeneracionPdf("Logotipo del emisor no disponible.");
  doc.image(logo, X0, y, { fit: [150, 43] });

  // Emisor a la derecha.
  const xEmisor = X0 + 190;
  const anchoEmisor = ANCHO - 190;
  doc.font("negrita").fontSize(11.5).fillColor(COLOR.texto);
  doc.text(d.emisor.nombre, xEmisor, y, { width: anchoEmisor, align: "right" });
  doc.font("normal").fontSize(8.5).fillColor(COLOR.secundario);
  doc.text(d.emisor.domicilio, xEmisor, doc.y + 1, { width: anchoEmisor, align: "right" });
  doc.text(`Tel. ${d.emisor.telefono}  ·  ${d.emisor.correo}`, xEmisor, doc.y + 1, { width: anchoEmisor, align: "right" });
  y = Math.max(doc.y, y + 43) + 10;

  doc.moveTo(X0, y).lineTo(X0 + ANCHO, y).lineWidth(1.4).strokeColor(COLOR.marca).stroke();
  y += 14;

  // Título y datos de identificación.
  doc.font("negrita").fontSize(20).fillColor(COLOR.marca).text("COTIZACIÓN", X0, y, { width: 240 });
  doc.font("normal").fontSize(8.5).fillColor(COLOR.atenuado);
  doc.text("Documento comercial emitido desde la web de demostración.", X0, doc.y + 2, { width: 240 });
  const filas: [string, string][] = [
    ["Folio", d.folio],
    ["Versión", `v${d.versionNumero}`],
    ["Origen", "WEB DEMO"],
    ["Fecha de emisión", fecha(d.fechaEmision)],
    ["Vigente hasta", `${fecha(d.vigenteHasta)} (${d.vigenciaDias} días naturales)`],
  ];
  let yMeta = y;
  const xEtiqueta = X0 + 250;
  for (const [k, v] of filas) {
    doc.font("normal").fontSize(8.5).fillColor(COLOR.atenuado).text(k, xEtiqueta, yMeta + 1, { width: 90, align: "right" });
    doc.font("seminegrita").fontSize(9.5).fillColor(COLOR.texto).text(v, xEtiqueta + 98, yMeta, { width: ANCHO - 348, align: "right" });
    yMeta = doc.y + 2;
  }
  y = Math.max(doc.y, yMeta) + 12;

  // Cliente y proyecto, en un recuadro de dos columnas.
  const anchoCol = (ANCHO - 3 * 12) / 2;
  const xIzq = X0 + 12;
  const xDer = xIzq + anchoCol + 12;
  const contacto = [d.contacto.nombre, d.contacto.telefono, d.contacto.correo].filter((x): x is string => !!x).join("  ·  ");
  const medirColumna = (pares: [string, string, boolean][]) =>
    pares.reduce((h, [, t, fuerte]) => h + 11 + alto(doc, t, anchoCol, fuerte ? "seminegrita" : "normal", 9.5) + 6, 0);
  const izquierda: [string, string, boolean][] = [
    ["Cliente", d.cliente.nombre, true],
    ["Contacto", contacto, false],
  ];
  const derecha: [string, string, boolean][] = [
    ["Proyecto", d.proyecto.nombre, true],
    ["Ubicación", d.proyecto.ubicacion, false],
    ["Descripción", d.proyecto.descripcion, false],
  ];
  const altoCaja = Math.max(medirColumna(izquierda), medirColumna(derecha)) + 14;
  doc.roundedRect(X0, y, ANCHO, altoCaja, 4).lineWidth(0.8).fillAndStroke(COLOR.fondo, COLOR.borde);
  const dibujarColumna = (pares: [string, string, boolean][], x: number) => {
    let yy = y + 9;
    for (const [k, t, fuerte] of pares) {
      yy = etiqueta(doc, k, x, yy, anchoCol);
      yy = valor(doc, t, x, yy + 1, anchoCol, fuerte ? "seminegrita" : "normal") + 6;
    }
  };
  dibujarColumna(izquierda, xIzq);
  dibujarColumna(derecha, xDer);
  return y + altoCaja + 16;
}

function encabezadoTabla(doc: Doc, y: number): number {
  const altoFila = 18;
  doc.rect(X0, y, ANCHO, altoFila).fill(COLOR.marca);
  let x = X0;
  doc.font("seminegrita").fontSize(8.5).fillColor("#ffffff");
  for (const c of COLUMNAS) {
    doc.text(c.titulo, x + RELLENO_CELDA, y + 5, { width: c.ancho - 2 * RELLENO_CELDA, align: c.alineacion, lineBreak: false });
    x += c.ancho;
  }
  return y + altoFila;
}

function textoCelda(p: DocumentoCotizacion["partidas"][number], clave: (typeof COLUMNAS)[number]["clave"]): string {
  switch (clave) {
    case "numero":
      return String(p.numero);
    case "descripcion":
      return p.descripcion;
    case "unidad":
      return unidad(p.unidad);
    case "cantidad":
      return cantidad(p.cantidad);
    case "precioUnitario":
      return dinero(p.precioUnitario);
    case "importe":
      return dinero(p.importe);
  }
}

function tabla(doc: Doc, d: DocumentoCotizacion, yInicial: number): number {
  let y = encabezadoTabla(doc, yInicial);
  d.partidas.forEach((p, i) => {
    const altoTexto = Math.max(
      ...COLUMNAS.map((c) => alto(doc, textoCelda(p, c.clave), c.ancho - 2 * RELLENO_CELDA, "normal", 9, 1.2)),
    );
    const altoFila = altoTexto + 2 * RELLENO_CELDA + 2;
    if (y + altoFila > LIMITE_INFERIOR) {
      doc.addPage();
      y = encabezadoTabla(doc, MARGEN.superior);
    }
    if (i % 2 === 1) doc.rect(X0, y, ANCHO, altoFila).fill(COLOR.fondo);
    let x = X0;
    doc.font("normal").fontSize(9).fillColor(COLOR.texto);
    for (const c of COLUMNAS) {
      const numerica = c.alineacion === "right";
      doc.text(textoCelda(p, c.clave), x + RELLENO_CELDA, y + RELLENO_CELDA + 1, {
        width: c.ancho - 2 * RELLENO_CELDA,
        align: c.alineacion,
        lineGap: 1.2,
        ...(numerica ? { features: ["tnum"] as const } : {}),
      });
      x += c.ancho;
    }
    y += altoFila;
    doc.moveTo(X0, y).lineTo(X0 + ANCHO, y).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
  });
  doc.moveTo(X0, y).lineTo(X0 + ANCHO, y).lineWidth(1).strokeColor(COLOR.marca).stroke();
  return y + 8;
}

function totales(doc: Doc, d: DocumentoCotizacion, yInicial: number): number {
  const filas: [string, string, boolean][] = [
    ["Subtotal", dinero(d.subtotal), false],
    [`${d.impuesto.nombre} ${porcentaje(d.impuesto.tasa)}`, dinero(d.impuesto.importe), false],
    ["Total MXN", dinero(d.total), true],
  ];
  const anchoBloque = 250;
  const altoBloque = 3 * 20 + 6;
  let y = yInicial;
  if (y + altoBloque > LIMITE_INFERIOR) {
    doc.addPage();
    y = MARGEN.superior;
  }
  const x = X0 + ANCHO - anchoBloque;
  for (const [k, v, fuerte] of filas) {
    if (fuerte) doc.rect(x, y - 3, anchoBloque, 22).fill(COLOR.totalFondo);
    doc.font(fuerte ? "negrita" : "normal").fontSize(fuerte ? 11 : 9.5).fillColor(COLOR.texto);
    doc.text(k, x + 8, y + (fuerte ? 2 : 1), { width: 140, align: "left", lineBreak: false });
    doc.text(v, x + 120, y + (fuerte ? 2 : 1), { width: anchoBloque - 128, align: "right", features: ["tnum"], lineBreak: false });
    y += 20;
  }
  return y + 8;
}

/** Sección de texto (título + párrafo). El párrafo continúa en la página siguiente si hace falta. */
function seccion(doc: Doc, titulo: string, texto: string, y: number): number {
  const altoTitulo = 16;
  const primeraLinea = alto(doc, "X", ANCHO, "normal", 9);
  if (y + altoTitulo + primeraLinea * 2 > LIMITE_INFERIOR) {
    doc.addPage();
    y = MARGEN.superior;
  }
  doc.font("seminegrita").fontSize(10).fillColor(COLOR.marca).text(titulo, X0, y, { width: ANCHO });
  doc.font("normal").fontSize(9).fillColor(COLOR.texto).text(texto, X0, doc.y + 3, { width: ANCHO, lineGap: 2.2 });
  return doc.y + 10;
}

function pieYMarcas(doc: Doc, d: DocumentoCotizacion): void {
  const rango = doc.bufferedPageRange();
  const demo = d.ambiente === "DEMO";
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // Escribir en los márgenes sin que PDFKit agregue páginas.
    const margenes = { ...doc.page.margins };
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    if (demo) {
      doc.save();
      doc.rotate(-32, { origin: [PAGINA.ancho / 2, PAGINA.alto / 2] });
      doc.font("negrita").fontSize(70).fillColor(COLOR.demo).fillOpacity(0.07);
      doc.text("DEMOSTRACIÓN", 0, PAGINA.alto / 2 - 42, { width: PAGINA.ancho, align: "center", lineBreak: false });
      doc.restore();
      doc.font("seminegrita").fontSize(8.5).fillColor(COLOR.demo).fillOpacity(1);
      doc.text(LEYENDA_DEMO, X0, 30, { width: ANCHO, align: "center", lineBreak: false });
      doc.moveTo(X0, 44).lineTo(X0 + ANCHO, 44).lineWidth(0.6).strokeColor(COLOR.demo).stroke();
    }
    const yPie = PAGINA.alto - 46;
    doc.moveTo(X0, yPie - 6).lineTo(X0 + ANCHO, yPie - 6).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    doc.font("normal").fontSize(8).fillColor(COLOR.atenuado).fillOpacity(1);
    doc.text(`${d.idVersion}  ·  ${d.origen === "WEB_DEMO" ? "WEB DEMO" : d.origen}`, X0, yPie, { width: ANCHO / 2, lineBreak: false });
    doc.text(`Página ${i + 1} de ${rango.count}`, X0 + ANCHO / 2, yPie, { width: ANCHO / 2, align: "right", lineBreak: false });
    doc.page.margins = margenes;
  }
}

/** Genera el PDF en memoria (no escribe en disco). Determinista para un mismo documento. */
export const generarPdf: GeneradorPdf = (d) =>
  new Promise<Buffer>((resolve, reject) => {
    try {
      const fechaCreacion = new Date(`${d.fechaEmision}T12:00:00.000Z`);
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: MARGEN.superior, bottom: MARGEN.inferior, left: MARGEN.izquierdo, right: MARGEN.derecho },
        bufferPages: true,
        autoFirstPage: true,
        compress: true,
        lang: "es-MX",
        // Sin autor ni título (como el libro); fecha de creación = fecha de emisión.
        info: { Producer: "SoftArq", Creator: "SoftArq", CreationDate: fechaCreacion, ModDate: fechaCreacion },
      });
      const partes: Buffer[] = [];
      doc.on("data", (b: Buffer) => partes.push(b));
      doc.on("end", () => resolve(Buffer.concat(partes)));
      doc.on("error", reject);

      doc.registerFont("normal", FUENTES.normal);
      doc.registerFont("seminegrita", FUENTES.seminegrita);
      doc.registerFont("negrita", FUENTES.negrita);
      comprobarGlifos(doc, d);

      let y = encabezado(doc, d);
      y = tabla(doc, d, y);
      y = totales(doc, d, y);
      y = seccion(doc, "Alcance", d.textos.alcance, y);
      y = seccion(doc, "Condiciones", d.textos.condiciones, y);
      y = seccion(doc, "Exclusiones", d.textos.exclusiones, y);
      y = seccion(doc, "Aviso", d.leyendaTecnica, y);
      const registro = `Registro operativo — Preparó: ${d.personas.preparo} · Aprobó: ${d.personas.aprobo} · Emitió: ${d.personas.emitio}. Precios en pesos mexicanos (MXN).`;
      if (y + alto(doc, registro, ANCHO, "normal", 8) > LIMITE_INFERIOR) {
        doc.addPage();
        y = MARGEN.superior;
      }
      doc.font("normal").fontSize(8).fillColor(COLOR.atenuado);
      doc.text(registro, X0, y, { width: ANCHO, lineGap: 1.5 });
      pieYMarcas(doc, d);
      doc.end();
    } catch (e) {
      reject(e instanceof ErrorGeneracionPdf ? e : new ErrorGeneracionPdf(`No se pudo generar el PDF: ${(e as Error).message}`));
    }
  });
