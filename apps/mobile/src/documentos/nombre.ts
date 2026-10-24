/** Nombre de archivo seguro para el PDF de una cotización a partir de su folio («COT-2026-00012» → «COT-2026-00012.pdf»). */
export function nombreDePdf(folio: string): string {
  const base = folio.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base === "" ? "cotizacion" : base.slice(0, 60)}.pdf`;
}
