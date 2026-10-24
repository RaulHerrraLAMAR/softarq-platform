/**
 * Modelo de la captura del cliente (ADR-0021). Funciones puras, sin React ni red: se prueban en Node.
 *
 * - El estado local conserva lo que la persona escribió (texto), aunque sea inválido, para no borrarle el campo
 *   mientras corrige. Lo que se guarda en el servidor es siempre una captura SIN errores: una medida inválida
 *   viaja como «sin capturar» (`null`) y el servidor la cuenta como pendiente.
 * - La validación local es solo apoyo (marcar el campo y explicar). El servidor valida siempre y manda.
 * - Aquí no hay cálculos monetarios ni de cantidades: las cantidades, los importes y las reglas del motor son
 *   de la API.
 * - Vocabulario de la interfaz: «trabajo» (cubierta, losa, muro), «sección» (una parte del trabajo con sus
 *   medidas) y «hueco» (ventana o tragaluz que se resta de una sección).
 */
import {
  LIMITES_CLIENTE,
  type CapturaSolicitud,
  type DimensionCliente,
  type RenglonCliente,
  type TrabajoCliente,
} from "@softarq/contracts/cliente";

export type TipoRenglon = "secciones" | "huecos";

export interface RenglonLocal {
  nombre: string;
  piezas: string;
  largo: string;
  ancho: string;
  alto: string;
}

export interface TrabajoLocal {
  id: string;
  trabajoCodigo: string;
  opcionCodigo: string;
  secciones: RenglonLocal[];
  huecos: RenglonLocal[];
}

export interface CapturaLocal {
  trabajos: TrabajoLocal[];
  notas: string;
}

export const CAPTURA_LOCAL_VACIA: CapturaLocal = { trabajos: [], notas: "" };

export const DIMENSIONES: readonly DimensionCliente[] = ["largo", "ancho", "alto"];

// --- Catálogo (lo que el servidor ofrece) --------------------------------------------------------

export type OpcionCatalogo = TrabajoCliente["opciones"][number];

export function buscarTrabajo(catalogo: readonly TrabajoCliente[], codigo: string): TrabajoCliente | undefined {
  return catalogo.find((t) => t.codigo === codigo);
}

export function buscarOpcion(catalogo: readonly TrabajoCliente[], trabajoCodigo: string, opcionCodigo: string): OpcionCatalogo | undefined {
  return buscarTrabajo(catalogo, trabajoCodigo)?.opciones.find((o) => o.codigo === opcionCodigo);
}

/** Etiqueta de una dimensión para esa opción (la losa llama «Espesor» a su alto). */
export function etiquetaDe(opcion: OpcionCatalogo, clave: DimensionCliente): string {
  return opcion.medidas.find((m) => m.clave === clave)?.etiqueta ?? clave;
}

// --- Texto de medidas ----------------------------------------------------------------------------

export type EstadoMedida = "pend" | "ok" | "inv";

export interface MedidaLeida {
  estado: EstadoMedida;
  /** Texto decimal canónico para el contrato; `null` si está vacía o es inválida. */
  valor: string | null;
}

const DECIMAL = /^(\d{1,15})(?:\.(\d{1,10}))?$/;

/** Lee lo que escribió la persona: acepta coma o punto decimal, «6.» y «.5». */
export function leerMedida(texto: string, maximo: number = LIMITES_CLIENTE.medidaMaxima): MedidaLeida {
  let t = texto.trim().replace(",", ".");
  if (t === "") return { estado: "pend", valor: null };
  if (t.startsWith(".")) t = `0${t}`;
  if (t.endsWith(".")) t = t.slice(0, -1);
  const m = DECIMAL.exec(t);
  if (!m) return { estado: "inv", valor: null };
  const entero = m[1]!.replace(/^0+(?=\d)/, "");
  const canonico = m[2] !== undefined ? `${entero}.${m[2]}` : entero;
  const n = Number(canonico);
  if (!Number.isFinite(n) || n <= 0 || n > maximo) return { estado: "inv", valor: null };
  return { estado: "ok", valor: canonico };
}

/** Piezas: obligatorias, mayor que 0 y de hasta 1000 (misma regla que el servidor). */
export function leerPiezas(texto: string): MedidaLeida {
  const r = leerMedida(texto, 1000);
  return r.estado === "pend" ? { estado: "inv", valor: null } : r;
}

// --- Conversión con el contrato ------------------------------------------------------------------

const renglonVacio = (): RenglonLocal => ({ nombre: "", piezas: "1", largo: "", ancho: "", alto: "" });

export function desdeContrato(c: CapturaSolicitud): CapturaLocal {
  const renglon = (r: RenglonCliente): RenglonLocal => ({ nombre: r.nombre, piezas: r.piezas, largo: r.largo ?? "", ancho: r.ancho ?? "", alto: r.alto ?? "" });
  return {
    trabajos: c.trabajos.map((t) => ({ id: t.id, trabajoCodigo: t.trabajoCodigo, opcionCodigo: t.opcionCodigo, secciones: t.secciones.map(renglon), huecos: t.huecos.map(renglon) })),
    notas: c.notas ?? "",
  };
}

/**
 * Captura lista para guardar. Las dimensiones que la opción no pide van en `null` y una medida inválida o vacía
 * también (queda pendiente en el servidor). Piezas inválidas se guardan como «1»: la pantalla las marca y no deja
 * calcular ni enviar mientras estén mal.
 */
export function aContrato(local: CapturaLocal, catalogo: readonly TrabajoCliente[]): CapturaSolicitud {
  const renglon = (r: RenglonLocal, opcion: OpcionCatalogo | undefined): RenglonCliente => {
    const pide = new Set(opcion?.medidas.map((m) => m.clave) ?? []);
    const dim = (clave: DimensionCliente) => (pide.has(clave) ? leerMedida(r[clave]).valor : null);
    return { nombre: r.nombre.trim().slice(0, LIMITES_CLIENTE.longitudNombre), piezas: leerPiezas(r.piezas).valor ?? "1", largo: dim("largo"), ancho: dim("ancho"), alto: dim("alto") };
  };
  const notas = local.notas.trim();
  return {
    trabajos: local.trabajos.map((t) => {
      const opcion = buscarOpcion(catalogo, t.trabajoCodigo, t.opcionCodigo);
      return {
        id: t.id,
        trabajoCodigo: t.trabajoCodigo,
        opcionCodigo: t.opcionCodigo,
        secciones: t.secciones.map((r) => renglon(r, opcion)),
        // Sin permiso de huecos no se guarda ninguno (el servidor lo rechazaría como no válido).
        huecos: opcion?.admiteHuecos ? t.huecos.map((r) => renglon(r, opcion)) : [],
      };
    }),
    notas: notas === "" ? null : notas.slice(0, LIMITES_CLIENTE.longitudNotas),
  };
}

/** Igualdad de dos capturas de contrato (para saber si hay algo nuevo que guardar). */
export const mismaCaptura = (a: CapturaSolicitud, b: CapturaSolicitud): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Huella de lo que afecta al cálculo: trabajos, opciones, piezas y medidas válidas. No cambia al corregir un
 * nombre de sección ni las notas. Sirve para saber si una estimación sigue vigente.
 */
export function huellaCalculo(local: CapturaLocal, catalogo: readonly TrabajoCliente[]): string {
  const c = aContrato(local, catalogo);
  return JSON.stringify(c.trabajos.map((t) => [t.id, t.trabajoCodigo, t.opcionCodigo, t.secciones.map(medidas), t.huecos.map(medidas)]));
}
// Se compara por valor: «6», «6.0» y «6,00» son la misma medida y no deben invalidar una estimación.
const numero = (v: string | null): string | null => (v === null ? null : String(Number(v)));
const medidas = (r: RenglonCliente) => [numero(r.piezas), numero(r.largo), numero(r.ancho), numero(r.alto)];

// --- Validación de apoyo -------------------------------------------------------------------------

export interface CampoLocal {
  ruta: string;
  mensaje: string;
}

const NOMBRE_DIMENSION: Record<DimensionCliente, string> = { largo: "el largo", ancho: "el ancho", alto: "el alto" };

export const rutaCampo = (indiceTrabajo: number, tipo: TipoRenglon, indice: number, campo: DimensionCliente | "piezas"): string => `trabajos[${indiceTrabajo}].${tipo}[${indice}].${campo}`;

/** `errores`: algo está mal escrito o no corresponde. `pendientes`: está bien pero falta. */
export function validarLocal(local: CapturaLocal, catalogo: readonly TrabajoCliente[]): { errores: CampoLocal[]; pendientes: CampoLocal[] } {
  const errores: CampoLocal[] = [];
  const pendientes: CampoLocal[] = [];
  if (local.trabajos.length === 0) pendientes.push({ ruta: "trabajos", mensaje: "Agregue al menos un trabajo." });
  local.trabajos.forEach((t, i) => {
    const opcion = buscarOpcion(catalogo, t.trabajoCodigo, t.opcionCodigo);
    if (!opcion) {
      errores.push({ ruta: `trabajos[${i}].opcionCodigo`, mensaje: "Este trabajo ya no está disponible. Elija otro." });
      return;
    }
    if (t.secciones.length === 0) pendientes.push({ ruta: `trabajos[${i}].secciones`, mensaje: "Agregue al menos una sección con sus medidas." });
    const revisar = (tipo: TipoRenglon) =>
      t[tipo].forEach((r, j) => {
        if (leerPiezas(r.piezas).estado !== "ok") errores.push({ ruta: rutaCampo(i, tipo, j, "piezas"), mensaje: "Las piezas deben ser un número mayor que 0." });
        for (const clave of opcion.medidas.map((m) => m.clave)) {
          const leida = leerMedida(r[clave]);
          if (leida.estado === "pend") pendientes.push({ ruta: rutaCampo(i, tipo, j, clave), mensaje: `Indique ${NOMBRE_DIMENSION[clave]}.` });
          else if (leida.estado === "inv") errores.push({ ruta: rutaCampo(i, tipo, j, clave), mensaje: `Escriba ${NOMBRE_DIMENSION[clave]} como un número mayor que 0 y de hasta ${LIMITES_CLIENTE.medidaMaxima}, por ejemplo 6.50.` });
        }
      });
    revisar("secciones");
    if (opcion.admiteHuecos) revisar("huecos");
  });
  return { errores, pendientes };
}

/** Estado de una medida de un renglón para el croquis y los campos. */
export const estadoDeMedida = (r: RenglonLocal, clave: DimensionCliente): EstadoMedida => leerMedida(r[clave]).estado;

// --- Operaciones puras sobre la captura ----------------------------------------------------------

/** Identificador estable dentro de la solicitud: `t1`, `t2`… (nunca reutiliza el de un trabajo quitado en la sesión). */
export function nuevoIdTrabajo(c: CapturaLocal): string {
  const usados = c.trabajos.map((t) => Number(/^t(\d+)$/.exec(t.id)?.[1] ?? 0));
  return `t${Math.max(0, ...usados) + 1}`;
}

export function agregarTrabajo(c: CapturaLocal, trabajoCodigo: string, opcionCodigo: string): { captura: CapturaLocal; id: string } {
  const id = nuevoIdTrabajo(c);
  return { captura: { ...c, trabajos: [...c.trabajos, { id, trabajoCodigo, opcionCodigo, secciones: [renglonVacio()], huecos: [] }] }, id };
}

export const quitarTrabajo = (c: CapturaLocal, id: string): CapturaLocal => ({ ...c, trabajos: c.trabajos.filter((t) => t.id !== id) });

const mapearTrabajo = (c: CapturaLocal, id: string, f: (t: TrabajoLocal) => TrabajoLocal): CapturaLocal => ({ ...c, trabajos: c.trabajos.map((t) => (t.id === id ? f(t) : t)) });

/** Cambia el trabajo y la opción (por ejemplo, de cubierta a losa) conservando las medidas ya escritas. */
export const cambiarTrabajo = (c: CapturaLocal, id: string, trabajoCodigo: string, opcionCodigo: string): CapturaLocal => mapearTrabajo(c, id, (t) => ({ ...t, trabajoCodigo, opcionCodigo }));

export const cambiarOpcion = (c: CapturaLocal, id: string, opcionCodigo: string): CapturaLocal => mapearTrabajo(c, id, (t) => ({ ...t, opcionCodigo }));

export function agregarRenglon(c: CapturaLocal, id: string, tipo: TipoRenglon): CapturaLocal {
  const tope = tipo === "secciones" ? LIMITES_CLIENTE.seccionesPorTrabajo : LIMITES_CLIENTE.huecosPorTrabajo;
  return mapearTrabajo(c, id, (t) => (t[tipo].length >= tope ? t : { ...t, [tipo]: [...t[tipo], renglonVacio()] }));
}

export function quitarRenglon(c: CapturaLocal, id: string, tipo: TipoRenglon, indice: number): CapturaLocal {
  return mapearTrabajo(c, id, (t) => ({ ...t, [tipo]: t[tipo].filter((_, i) => i !== indice) }));
}

export function cambiarRenglon(c: CapturaLocal, id: string, tipo: TipoRenglon, indice: number, campo: keyof RenglonLocal, valor: string): CapturaLocal {
  return mapearTrabajo(c, id, (t) => ({ ...t, [tipo]: t[tipo].map((r, i) => (i === indice ? { ...r, [campo]: valor } : r)) }));
}

export const cambiarNotas = (c: CapturaLocal, notas: string): CapturaLocal => ({ ...c, notas: notas.slice(0, LIMITES_CLIENTE.longitudNotas) });
