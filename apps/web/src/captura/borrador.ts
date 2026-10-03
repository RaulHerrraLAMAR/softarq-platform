/**
 * Captura → borrador guardable (módulo 6, ADR-0008 §4).
 *
 * - Lo que el usuario no escribió viaja como `null` (sin capturar); `"0"` es un valor.
 * - Un texto con formato decimal inválido NO se convierte: el guardado se detiene y el campo se
 *   marca; la captura local se conserva tal cual. El servidor vuelve a validar todo.
 * - Las dimensiones que la fórmula no usa viajan en `null` y los precios elegidos solo de los
 *   insumos de los conceptos actuales, igual que `armarSolicitud`.
 * - El borrador no lleva resultados ni importes calculados.
 */
import { PATRON_DECIMAL_TEXTO, type CapturaBorrador } from "@softarq/contracts";
import { insumosEnUso, type Captura } from "./estado.ts";
import { AYUDA_DECIMAL, dimensionesDelRenglon, type ErroresCampo } from "./solicitud.ts";

export type ResultadoSerializacion = { ok: true; borrador: CapturaBorrador } | { ok: false; errores: ErroresCampo };

export function serializarBorrador(c: Captura): ResultadoSerializacion {
  const errores: ErroresCampo = {};
  const decimal = (ruta: string, texto: string): string | null => {
    const t = texto.trim();
    if (!t) return null;
    if (!PATRON_DECIMAL_TEXTO.test(t)) errores[ruta] = AYUDA_DECIMAL;
    return t;
  };

  const partidas: CapturaBorrador["partidas"] = c.partidas.map((p, i) => {
    const r = `partidas[${i}]`;
    if (p.tipo === "ADICIONAL") {
      return {
        tipo: "ADICIONAL",
        tipoAdicionalCodigo: p.tipoAdicionalCodigo || null,
        descripcion: p.descripcion,
        cantidad: decimal(`${r}.cantidad`, p.cantidad),
        monto: decimal(`${r}.monto`, p.monto),
      };
    }
    return {
      tipo: "CONCEPTO",
      conceptoCodigo: p.concepto.codigo,
      descripcion: p.descripcion,
      mediciones: p.renglones.map((rg, n) => {
        const rr = `${r}.mediciones[${n}]`;
        const usadas = dimensionesDelRenglon(p, rg);
        const dim = (d: "largo" | "ancho" | "alto") => (usadas.includes(d) ? decimal(`${rr}.${d}`, rg[d]) : null);
        return {
          descripcion: rg.descripcion,
          signo: rg.signo,
          piezas: decimal(`${rr}.piezas`, rg.piezas),
          largo: dim("largo"),
          ancho: dim("ancho"),
          alto: dim("alto"),
          segundaMedida: rg.segundaMedida,
        };
      }),
    };
  });

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  const seleccion = insumosEnUso(c)
    .filter((ins) => c.seleccion[ins] !== undefined)
    .map((ins) => ({ insumoCodigo: ins, precioCodigo: c.seleccion[ins]! }));
  return { ok: true, borrador: { consolidarCompras: c.consolidarCompras, partidas, seleccion } };
}

/** JSON con claves ordenadas: el servidor (jsonb) no conserva el orden de las claves. */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonico(o[k])]));
  }
  return v;
}

/** Huella de un borrador; la selección se ordena por insumo (su orden no cambia lo que se guarda). */
export function huellaDeBorrador(b: CapturaBorrador): string {
  const seleccion = [...b.seleccion].sort((x, y) => x.insumoCodigo.localeCompare(y.insumoCodigo));
  return JSON.stringify(canonico({ ...b, seleccion }));
}

/** Huella para detectar cambios sin guardar: dos capturas con la misma huella guardan lo mismo. */
export function huellaBorrador(c: Captura): string {
  const r = serializarBorrador(c);
  return r.ok ? huellaDeBorrador(r.borrador) : `invalido:${JSON.stringify(c.partidas)}:${JSON.stringify(c.seleccion)}`;
}

/** Diferencias legibles entre la captura local y la guardada por otra pestaña o persona. */
export function diferenciasBorrador(local: CapturaBorrador, servidor: CapturaBorrador): string[] {
  const d: string[] = [];
  if (local.consolidarCompras !== servidor.consolidarCompras) d.push("Compras de insumos: la decisión de consolidar es distinta.");
  const total = Math.max(local.partidas.length, servidor.partidas.length);
  for (let i = 0; i < total; i++) {
    const a = local.partidas[i];
    const b = servidor.partidas[i];
    const nombre = (p: CapturaBorrador["partidas"][number]) =>
      p.tipo === "CONCEPTO" ? `${p.conceptoCodigo}${p.descripcion.trim() ? ` «${p.descripcion.trim()}»` : ""}` : `costo adicional «${p.descripcion.trim()}»`;
    if (a && !b) d.push(`Partida ${i + 1}: solo está en sus cambios (${nombre(a)}).`);
    else if (!a && b) d.push(`Partida ${i + 1}: solo está en la versión guardada (${nombre(b)}).`);
    else if (a && b && JSON.stringify(canonico(a)) !== JSON.stringify(canonico(b))) d.push(`Partida ${i + 1}: datos distintos (${nombre(a)}).`);
  }
  const sel = (b: CapturaBorrador) => new Map(b.seleccion.map((s) => [s.insumoCodigo, s.precioCodigo]));
  const sa = sel(local);
  const sb = sel(servidor);
  for (const ins of [...new Set([...sa.keys(), ...sb.keys()])].sort()) {
    if (sa.get(ins) !== sb.get(ins)) d.push(`Opción elegida para ${ins}: distinta.`);
  }
  return d;
}
