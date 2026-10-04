/**
 * Cambios relevantes de una versión frente a la anterior (ADR-0008 §7). Función pura sobre datos
 * comerciales y de captura: no expone costos, precios unitarios de compra ni proveedores.
 *
 * Las partidas se emparejan por tipo, código y descripción (en orden), de modo que quitar una
 * partida no marca como modificadas las siguientes.
 */
import type { CapturaBorrador, CotizacionComercial, ResumenCambios } from "@softarq/contracts";
import { jsonCanonico } from "./huella.js";

export interface DatosDescriptivos {
  clienteNombre: string;
  proyectoNombre: string;
  proyectoUbicacion: string | null;
  proyectoDescripcion: string | null;
}

export interface EstadoComparable {
  numero: number;
  captura: CapturaBorrador;
  comercial: CotizacionComercial;
  huellaReferenciaHex: string;
  descriptivos: DatosDescriptivos;
}

type PartidaBorrador = CapturaBorrador["partidas"][number];

interface PartidaEtiquetada {
  clave: string;
  etiqueta: string;
  contenido: string;
}

function etiquetar(captura: CapturaBorrador, comercial: CotizacionComercial): PartidaEtiquetada[] {
  return captura.partidas.map((p: PartidaBorrador, i) => {
    const descripcion = comercial.partidas[i]?.descripcion ?? p.descripcion.trim();
    const codigo = p.tipo === "CONCEPTO" ? p.conceptoCodigo : (p.tipoAdicionalCodigo ?? "");
    return {
      clave: `${p.tipo}|${codigo}|${descripcion}`,
      etiqueta: `${i + 1}. ${descripcion}`,
      contenido: jsonCanonico(p),
    };
  });
}

export function resumirCambios(anterior: EstadoComparable | null, nueva: Omit<EstadoComparable, "numero">): ResumenCambios {
  if (!anterior) {
    return {
      versionAnterior: null,
      partidasAgregadas: [],
      partidasQuitadas: [],
      partidasModificadas: [],
      seleccionCambiada: [],
      consolidacionCambiada: false,
      datosDescriptivosCambiados: [],
      textosCambiados: [],
      condicionesCambiadas: false,
      totalAnterior: null,
      totalNuevo: nueva.comercial.total,
    };
  }

  const viejas = etiquetar(anterior.captura, anterior.comercial);
  const nuevas = etiquetar(nueva.captura, nueva.comercial);
  const usadas = new Set<number>();
  const agregadas: string[] = [];
  const modificadas: string[] = [];
  for (const n of nuevas) {
    const j = viejas.findIndex((v, k) => !usadas.has(k) && v.clave === n.clave);
    if (j < 0) {
      agregadas.push(n.etiqueta);
      continue;
    }
    usadas.add(j);
    if (viejas[j]!.contenido !== n.contenido) modificadas.push(n.etiqueta);
  }
  const quitadas = viejas.filter((_, k) => !usadas.has(k)).map((v) => v.etiqueta);

  const selAnterior = new Map(anterior.captura.seleccion.map((s) => [s.insumoCodigo, s.precioCodigo]));
  const selNueva = new Map(nueva.captura.seleccion.map((s) => [s.insumoCodigo, s.precioCodigo]));
  const insumos = [...new Set([...selAnterior.keys(), ...selNueva.keys()])].sort();
  const seleccionCambiada = insumos.filter((i) => selAnterior.get(i) !== selNueva.get(i));

  const a = anterior.descriptivos;
  const b = nueva.descriptivos;
  const datosDescriptivosCambiados = [
    a.clienteNombre !== b.clienteNombre ? "cliente.nombre" : null,
    a.proyectoNombre !== b.proyectoNombre ? "proyecto.nombre" : null,
    a.proyectoUbicacion !== b.proyectoUbicacion ? "proyecto.ubicacion" : null,
    a.proyectoDescripcion !== b.proyectoDescripcion ? "proyecto.descripcion" : null,
  ].filter((x): x is string => x !== null);

  // Textos de la versión (módulo 8): no intervienen en el cálculo, pero sí en lo que se aprueba.
  const textosCambiados = (["alcance", "condiciones", "exclusiones"] as const).filter(
    (k) => (anterior.captura.textos?.[k] ?? null) !== (nueva.captura.textos?.[k] ?? null),
  );

  return {
    versionAnterior: anterior.numero,
    partidasAgregadas: agregadas,
    partidasQuitadas: quitadas,
    partidasModificadas: modificadas,
    seleccionCambiada,
    consolidacionCambiada: anterior.captura.consolidarCompras !== nueva.captura.consolidarCompras,
    datosDescriptivosCambiados,
    textosCambiados,
    condicionesCambiadas: anterior.huellaReferenciaHex !== nueva.huellaReferenciaHex,
    totalAnterior: anterior.comercial.total,
    totalNuevo: nueva.comercial.total,
  };
}
