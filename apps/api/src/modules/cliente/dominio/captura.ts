/**
 * Captura de la solicitud del cliente (módulo 17, ADR-0021). Funciones puras, sin base de datos ni HTTP.
 *
 * - La app captura medidas y elecciones en lenguaje de cliente; este módulo las traduce a la solicitud de cálculo
 *   que el motor ya conoce. No duplica fórmulas: las medidas que se piden salen de la fórmula del concepto
 *   (`DIMENSIONES_POR_FORMULA`) y las validaciones de cálculo siguen en el motor.
 * - Un hueco (ventana, tragaluz…) es un renglón de medición con signo «−» que se resta de la cantidad. No es un descuento
 *   comercial. Solo se admite si el concepto permite descuentos (`permiteDescuento`); lo decide el catálogo, no la app.
 * - Dos niveles de comprobación: `errores` (la captura no es válida: opción inexistente, medidas que no corresponden,
 *   valores no positivos) y `pendientes` (falta algo para estimar o enviar). Guardar un borrador exige cero errores;
 *   estimar y enviar exigen además cero pendientes.
 * - El cliente nunca elige precios: las referencias las pone la API (ver `solicitudDeCalculo`).
 */
import {
  DIMENSIONES_POR_FORMULA,
  type CapturaBorrador,
  type CapturaSolicitud,
  type DimensionCliente,
  type RenglonCliente,
  type SolicitudCalculoDemo,
  type TipoFormula,
  LIMITES_CLIENTE,
} from "@softarq/contracts";

export interface MedidaPedidaCatalogo {
  readonly clave: DimensionCliente;
  readonly etiqueta: string;
  readonly ayuda: string;
}

/** Concepto al que apunta una opción, con lo que la captura necesita de él. */
export interface ConceptoDeOpcion {
  readonly codigo: string;
  readonly tipoFormula: TipoFormula;
  readonly permiteDescuento: boolean;
  readonly unidad: string;
  /** Activo, aprobado (o personalizado con excepción: no se ofrece a clientes) y listo para calcular. */
  readonly disponible: boolean;
  /** Insumos de sus componentes activos (para pedir su referencia de precio). */
  readonly insumos: readonly string[];
}

export interface OpcionCatalogo {
  readonly trabajoCodigo: string;
  readonly trabajoNombre: string;
  readonly trabajoActivo: boolean;
  readonly opcionCodigo: string;
  readonly opcionNombre: string;
  readonly opcionActiva: boolean;
  readonly consolidarCompras: boolean;
  readonly medidas: readonly MedidaPedidaCatalogo[];
  readonly concepto: ConceptoDeOpcion;
}

export type CatalogoCliente = ReadonlyMap<string, OpcionCatalogo>;

export interface CampoInvalido {
  readonly ruta: string;
  readonly mensaje: string;
}

export const claveOpcion = (trabajo: string, opcion: string): string => `${trabajo}/${opcion}`;

/**
 * Las medidas que declara una opción deben ser exactamente las que el motor acepta para la fórmula del concepto:
 * LONGITUD: largo; ÁREA: largo y UNA segunda medida (ancho o alto); VOLUMEN: largo, ancho y alto.
 * Devuelve el problema o `null` si es coherente. CONTEO no se ofrece a clientes (no hay medidas).
 */
export function problemaDeConfiguracion(tipo: TipoFormula, claves: readonly DimensionCliente[]): string | null {
  const unicas = new Set(claves);
  if (unicas.size !== claves.length) return "Hay medidas repetidas.";
  const usadas = DIMENSIONES_POR_FORMULA[tipo];
  if (tipo === "CONTEO") return "Un concepto sin medidas no se ofrece a clientes.";
  if (tipo === "AREA") {
    if (!unicas.has("largo") || claves.length !== 2) return "Un trabajo por área pide el largo y una segunda medida (ancho o alto).";
    return unicas.has("ancho") !== unicas.has("alto") ? null : "Un trabajo por área pide el ancho o el alto, no ambos.";
  }
  const requeridas = new Set<DimensionCliente>(usadas);
  return claves.length === requeridas.size && claves.every((c) => requeridas.has(c)) ? null : `Las medidas no coinciden con la fórmula (${[...requeridas].join(", ")}).`;
}

const NOMBRE_DIMENSION: Record<DimensionCliente, string> = { largo: "el largo", ancho: "el ancho", alto: "el alto" };

function medidaNumerica(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Valida un renglón (sección o hueco) contra las medidas que pide su opción. */
function validarRenglon(r: RenglonCliente, ruta: string, opcion: OpcionCatalogo, errores: CampoInvalido[], pendientes: CampoInvalido[]): void {
  const pide = new Set(opcion.medidas.map((m) => m.clave));
  const piezas = medidaNumerica(r.piezas);
  if (piezas === null || !Number.isFinite(piezas) || piezas <= 0 || piezas > 1000) {
    errores.push({ ruta: `${ruta}.piezas`, mensaje: "Las piezas deben ser un número mayor que 0." });
  }
  for (const d of ["largo", "ancho", "alto"] as const) {
    const valor = r[d];
    if (!pide.has(d)) {
      if (valor !== null) errores.push({ ruta: `${ruta}.${d}`, mensaje: `Este trabajo no pide ${NOMBRE_DIMENSION[d]}.` });
      continue;
    }
    if (valor === null) {
      pendientes.push({ ruta: `${ruta}.${d}`, mensaje: `Indica ${NOMBRE_DIMENSION[d]}.` });
      continue;
    }
    const n = medidaNumerica(valor);
    if (n === null || !Number.isFinite(n) || n <= 0 || n > LIMITES_CLIENTE.medidaMaxima) {
      errores.push({ ruta: `${ruta}.${d}`, mensaje: `Escribe ${NOMBRE_DIMENSION[d]} como un número mayor que 0 y de hasta ${LIMITES_CLIENTE.medidaMaxima}.` });
    }
  }
}

/**
 * Comprueba la captura contra el catálogo de trabajos (ya filtrado a lo que el cliente puede ver).
 * `errores`: no válida. `pendientes`: válida pero incompleta.
 */
export function validarCaptura(captura: CapturaSolicitud, catalogo: CatalogoCliente): { errores: CampoInvalido[]; pendientes: CampoInvalido[] } {
  const errores: CampoInvalido[] = [];
  const pendientes: CampoInvalido[] = [];
  if (captura.trabajos.length === 0) pendientes.push({ ruta: "trabajos", mensaje: "Agrega al menos un trabajo." });
  captura.trabajos.forEach((t, i) => {
    const ruta = `trabajos[${i}]`;
    const o = catalogo.get(claveOpcion(t.trabajoCodigo, t.opcionCodigo));
    if (!o || !o.trabajoActivo || !o.opcionActiva || !o.concepto.disponible) {
      errores.push({ ruta: `${ruta}.opcionCodigo`, mensaje: "Este trabajo ya no está disponible. Elige otro." });
      return;
    }
    if (t.secciones.length === 0) pendientes.push({ ruta: `${ruta}.secciones`, mensaje: "Agrega al menos una sección con sus medidas." });
    t.secciones.forEach((s, j) => validarRenglon(s, `${ruta}.secciones[${j}]`, o, errores, pendientes));
    if (t.huecos.length > 0 && !o.concepto.permiteDescuento) {
      errores.push({ ruta: `${ruta}.huecos`, mensaje: "Este trabajo no admite huecos." });
    } else {
      t.huecos.forEach((h, j) => validarRenglon(h, `${ruta}.huecos[${j}]`, o, errores, pendientes));
    }
  });
  return { errores, pendientes };
}

/** Segunda medida de una fórmula por área: la que la opción declara además del largo. */
function segundaMedidaDe(o: OpcionCatalogo): "ancho" | "alto" {
  return o.medidas.some((m) => m.clave === "alto") ? "alto" : "ancho";
}

function descripcionRenglon(r: RenglonCliente, etiqueta: string, n: number): string {
  const nombre = r.nombre.trim();
  return nombre === "" ? `${etiqueta} ${n}` : nombre;
}

/** Renglones del motor de una captura de trabajo: secciones con «+», huecos con «−». */
function renglones(t: CapturaSolicitud["trabajos"][number], o: OpcionCatalogo) {
  const usa = (d: DimensionCliente, v: string | null) => (o.medidas.some((m) => m.clave === d) ? v : null);
  const armar = (r: RenglonCliente, signo: "+" | "-", etiqueta: string, n: number) => ({
    descripcion: descripcionRenglon(r, etiqueta, n),
    signo,
    piezas: r.piezas,
    largo: usa("largo", r.largo),
    ancho: usa("ancho", r.ancho),
    alto: usa("alto", r.alto),
  });
  return [
    ...t.secciones.map((s, i) => armar(s, "+", "Sección", i + 1)),
    ...t.huecos.map((h, i) => armar(h, "-", "Hueco", i + 1)),
  ];
}

export interface ReferenciasResueltas {
  /** insumo → código de precio de referencia (ya comprobado: vigente, no anulado, producto y proveedor activos). */
  readonly porInsumo: ReadonlyMap<string, string>;
}

/** Insumos de los conceptos que usa la captura, en orden de aparición y sin repetir. */
export function insumosDeCaptura(captura: CapturaSolicitud, catalogo: CatalogoCliente): string[] {
  const vistos = new Set<string>();
  for (const t of captura.trabajos) {
    for (const i of catalogo.get(claveOpcion(t.trabajoCodigo, t.opcionCodigo))?.concepto.insumos ?? []) vistos.add(i);
  }
  return [...vistos];
}

/**
 * Solicitud de cálculo de una captura COMPLETA y válida. Los precios elegidos son EXCLUSIVAMENTE las referencias
 * que la API ya resolvió (una por insumo): nunca el menor precio ni una elección del cliente. `consolidarCompras`
 * es verdadero solo si todas las opciones de la captura lo tienen así (el motor admite un único valor por cálculo).
 */
export function solicitudDeCalculo(captura: CapturaSolicitud, catalogo: CatalogoCliente, referencias: ReferenciasResueltas): SolicitudCalculoDemo {
  const opciones = captura.trabajos.map((t) => catalogo.get(claveOpcion(t.trabajoCodigo, t.opcionCodigo))!);
  const precios: string[] = [];
  for (const i of insumosDeCaptura(captura, catalogo)) {
    const p = referencias.porInsumo.get(i);
    if (p !== undefined && !precios.includes(p)) precios.push(p);
  }
  return {
    consolidarCompras: opciones.length > 0 && opciones.every((o) => o.consolidarCompras),
    partidas: captura.trabajos.map((t, i) => ({
      id: `P${String(i + 1).padStart(3, "0")}`,
      tipo: "CONCEPTO" as const,
      conceptoCodigo: opciones[i]!.concepto.codigo,
      descripcion: `${opciones[i]!.trabajoNombre}, ${opciones[i]!.opcionNombre}`.slice(0, 200),
      mediciones: renglones(t, opciones[i]!),
    })),
    preciosElegidos: precios,
  };
}

/**
 * Borrador interno de la cotización formal (al atender). Lleva conceptos y medidas del cliente y NADA más: sin precios
 * elegidos (`seleccion` vacía) y con `consolidarCompras` sin decidir (`null`): el Preparador los confirma explícitamente.
 * Las referencias de estimación no se heredan.
 */
export function borradorInterno(captura: CapturaSolicitud, catalogo: CatalogoCliente): CapturaBorrador {
  return {
    consolidarCompras: null,
    partidas: captura.trabajos.map((t) => {
      const o = catalogo.get(claveOpcion(t.trabajoCodigo, t.opcionCodigo))!;
      const segunda = segundaMedidaDe(o);
      return {
        tipo: "CONCEPTO" as const,
        conceptoCodigo: o.concepto.codigo,
        descripcion: `${o.trabajoNombre}, ${o.opcionNombre}`.slice(0, 200),
        mediciones: renglones(t, o).map((r) => ({ ...r, segundaMedida: segunda })),
      };
    }),
    seleccion: [],
  };
}

/** Nombres de los trabajos de la captura para listados («Losa, Losa de concreto»). */
export function nombresDeTrabajos(captura: CapturaSolicitud, catalogo: CatalogoCliente): string[] {
  return captura.trabajos.map((t) => catalogo.get(claveOpcion(t.trabajoCodigo, t.opcionCodigo))?.trabajoNombre ?? t.trabajoCodigo);
}
