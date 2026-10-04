// Renderiza cada página de un PDF a PNG para revisarlo a ojo (módulo 8, ADR-0010). Herramienta
// de desarrollo: usa pdfjs-dist (devDependency) y su lienzo opcional @napi-rs/canvas; no
// modifica el PDF. Uso:
//   node scripts/pdf/renderizar-pdf.mjs <archivo.pdf> <carpeta-salida> [escala=2]
// Las salidas van a D:\Proyecto_SoftArq\_work (nunca al repositorio).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , archivo, salida, escalaTexto] = process.argv;
if (!archivo || !salida) {
  console.error("Uso: node scripts/pdf/renderizar-pdf.mjs <archivo.pdf> <carpeta-salida> [escala]");
  process.exit(2);
}
const escala = Number(escalaTexto ?? "2");
const datos = new Uint8Array(readFileSync(archivo));
const tarea = pdfjs.getDocument({ data: datos, useSystemFonts: false });
const doc = await tarea.promise;
mkdirSync(salida, { recursive: true });
const base = basename(archivo, ".pdf");
for (let i = 1; i <= doc.numPages; i++) {
  const pagina = await doc.getPage(i);
  const viewport = pagina.getViewport({ scale: escala });
  const lienzo = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await pagina.render({ canvasContext: lienzo.context, canvas: lienzo.canvas, viewport }).promise;
  const destino = resolve(join(salida, `${base}-p${String(i).padStart(2, "0")}.png`));
  writeFileSync(destino, lienzo.canvas.toBuffer("image/png"));
  console.log(destino);
}
await tarea.destroy();
