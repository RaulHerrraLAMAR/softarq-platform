/**
 * Estado de la captura (una sola fuente de verdad, reducer puro).
 *
 * - Cantidades y medidas se guardan como TEXTO tal como las escribe el usuario; nunca `number`.
 * - La selección de precios es explícita y por insumo; nada se preselecciona en una captura propia.
 * - Las opciones de un ejemplo se resuelven contra las opciones vigentes que entrega la API; si una ya
 *   no está disponible, el insumo queda sin selección y con aviso (nunca se sustituye).
 * - Una selección ya hecha que deja de estar disponible SE CONSERVA marcada (nunca se borra ni se
 *   sustituye en silencio): el usuario decide elegir otra opción o quitarla («Quitar selección»).
 * - Los textos de la versión (alcance, condiciones y exclusiones; módulo 8) son parte del borrador de
 *   una cotización: no intervienen en el cálculo ni en la huella de la vista previa.
 * - Las excepciones B-22 (módulo 10) también son del borrador. Solo se agregan con una acción
 *   explícita del usuario; las que dejan de citar algo de la captura se quitan (`depurar`).
 */
import type { CapturaBorrador, DimensionMedicion, ReferenciasBorrador, TextosCotizacion, TipoFormula } from "@softarq/contracts";
import type { ConceptoCatalogo, InsumoConOpciones } from "../api/servicios.ts";
import type { Ejemplo } from "../ejemplos/ejemplos.ts";
import { depurar, desdeBorrador as excepcionesDesdeBorrador, type ExcepcionCaptura, type PartidaReferida } from "../excepciones/modelo.ts";

/** Excepción por agregar: la clave local la asigna el reducer. */
export type NuevaExcepcion = ExcepcionCaptura extends infer X ? (X extends ExcepcionCaptura ? Omit<X, "clave"> : never) : never;

export type SegundaMedida = "ancho" | "alto";

export interface RenglonCaptura {
  clave: string;
  descripcion: string;
  signo: "+" | "-";
  piezas: string;
  largo: string;
  ancho: string;
  alto: string;
  /** Solo para fórmulas AREA: qué segunda medida se captura (la otra va vacía). */
  segundaMedida: SegundaMedida;
}

export interface PartidaConcepto {
  clave: string;
  tipo: "CONCEPTO";
  concepto: ConceptoCatalogo;
  descripcion: string;
  renglones: RenglonCaptura[];
  /**
   * Motivo si el concepto ya no está disponible en el catálogo (borrador guardado). La partida y
   * sus selecciones se conservan; no se piden opciones para él y el cálculo queda pendiente hasta
   * que el usuario la quite.
   */
  noDisponible: string | null;
}

export interface PartidaAdicional {
  clave: string;
  tipo: "ADICIONAL";
  tipoAdicionalCodigo: string;
  descripcion: string;
  cantidad: string;
  monto: string;
}

export type PartidaCaptura = PartidaConcepto | PartidaAdicional;

export type OrigenCaptura =
  | { tipo: "ejemplo"; id: string; titulo: string }
  | { tipo: "propia" }
  /** Borrador guardado de una cotización (módulo 6). */
  | { tipo: "cotizacion"; folio: string };

export interface Captura {
  origen: OrigenCaptura;
  /** `null` = el usuario aún no lo decide (el contrato no tiene valor por omisión). */
  consolidarCompras: boolean | null;
  partidas: PartidaCaptura[];
  /** Precio elegido por insumo. */
  seleccion: Record<string, string>;
  /** Códigos de precio del ejemplo pendientes de comprobar contra las opciones vigentes. */
  preciosDelEjemplo: string[] | null;
  /** Aviso por insumo cuando una opción (del ejemplo o elegida) dejó de estar disponible. */
  avisosSeleccion: Record<string, string>;
  /**
   * Insumos con selección guardada que no corresponden a ninguna partida conocida (p. ej. de un
   * concepto que ya no existe). Se conservan al guardar hasta que el usuario los quite.
   */
  seleccionConservada: string[];
  /** Avisos de la carga de un ejemplo (p. ej. un concepto que ya no existe). */
  avisosCarga: string[];
  /**
   * Textos de la versión (BL-20). `null` = la captura no los tiene (calculadora, o borradores
   * anteriores al módulo 8): no se envían hasta que el usuario los escriba o los restablezca.
   */
  textos: TextosCotizacion | null;
  /** Excepciones registradas en el borrador (módulo 10). Vacía = no se envía el campo. */
  excepciones: ExcepcionCaptura[];
  siguienteClave: number;
}

export type Accion =
  | { tipo: "INICIAR_PROPIA" }
  | { tipo: "CARGAR_EJEMPLO"; ejemplo: Ejemplo; conceptos: readonly ConceptoCatalogo[] }
  | {
      tipo: "CARGAR_BORRADOR";
      folio: string;
      borrador: CapturaBorrador;
      conceptos: readonly ConceptoCatalogo[];
      /** Disponibilidad hoy, informada por el servidor (si falta, solo se usa el catálogo recibido). */
      referencias?: ReferenciasBorrador;
    }
  | { tipo: "VOLVER_AL_INICIO" }
  | { tipo: "AGREGAR_CONCEPTO"; concepto: ConceptoCatalogo }
  | { tipo: "QUITAR_PARTIDA"; clave: string }
  | { tipo: "EDITAR_DESCRIPCION_PARTIDA"; clave: string; descripcion: string }
  | { tipo: "AGREGAR_RENGLON"; partida: string }
  | { tipo: "QUITAR_RENGLON"; partida: string; renglon: string }
  | { tipo: "EDITAR_RENGLON"; partida: string; renglon: string; cambios: Partial<Omit<RenglonCaptura, "clave">> }
  | { tipo: "AGREGAR_ADICIONAL" }
  | { tipo: "EDITAR_ADICIONAL"; clave: string; cambios: Partial<Omit<PartidaAdicional, "clave" | "tipo">> }
  | { tipo: "FIJAR_CONSOLIDACION"; valor: boolean }
  | { tipo: "ELEGIR_OPCION"; insumo: string; precio: string }
  /** Decisión explícita del usuario: deja de guardar la selección de ese insumo. */
  | { tipo: "QUITAR_SELECCION"; insumo: string }
  | { tipo: "EDITAR_TEXTO"; campo: keyof TextosCotizacion; valor: string }
  | { tipo: "FIJAR_TEXTOS"; textos: TextosCotizacion }
  | { tipo: "AGREGAR_EXCEPCION"; excepcion: NuevaExcepcion }
  | { tipo: "QUITAR_EXCEPCION"; clave: string }
  | { tipo: "CONCILIAR_OPCIONES"; conceptos: readonly string[]; insumos: readonly InsumoConOpciones[] };

export type EstadoApp = { captura: Captura | null };

export const ESTADO_INICIAL: EstadoApp = { captura: null };

function capturaVacia(origen: OrigenCaptura): Captura {
  return {
    origen,
    consolidarCompras: null,
    partidas: [],
    seleccion: {},
    preciosDelEjemplo: null,
    avisosSeleccion: {},
    seleccionConservada: [],
    avisosCarga: [],
    textos: null,
    excepciones: [],
    siguienteClave: 1,
  };
}

function renglonVacio(clave: string): RenglonCaptura {
  return { clave, descripcion: "", signo: "+", piezas: "1", largo: "", ancho: "", alto: "", segundaMedida: "ancho" };
}

/** Conceptos DISPONIBLES de la captura, en orden de aparición (para pedir sus opciones). */
export function conceptosEnUso(c: Captura): string[] {
  const vistos = new Set<string>();
  for (const p of c.partidas) if (p.tipo === "CONCEPTO" && p.noDisponible === null) vistos.add(p.concepto.codigo);
  return [...vistos];
}

/** Insumos de todos los conceptos de la captura, también los no disponibles (lo que se guarda). */
export function insumosEnUso(c: Captura): string[] {
  const vistos = new Set<string>();
  for (const p of c.partidas) if (p.tipo === "CONCEPTO") for (const i of p.concepto.insumos) vistos.add(i.codigo);
  return [...vistos];
}

/** Insumos de los conceptos disponibles: los que necesitan una opción elegida para calcular. */
export function insumosParaElegir(c: Captura): string[] {
  const vistos = new Set<string>();
  for (const p of c.partidas) {
    if (p.tipo === "CONCEPTO" && p.noDisponible === null) for (const i of p.concepto.insumos) vistos.add(i.codigo);
  }
  return [...vistos];
}

/** Insumos cuya selección se guarda: los de las partidas y los conservados sin partida conocida. */
export function insumosConSeleccionGuardable(c: Captura): string[] {
  return [...new Set([...insumosEnUso(c), ...c.seleccionConservada])];
}

export function reducir(estado: EstadoApp, accion: Accion): EstadoApp {
  if (accion.tipo === "INICIAR_PROPIA") return { captura: capturaVacia({ tipo: "propia" }) };
  if (accion.tipo === "CARGAR_EJEMPLO") return { captura: desdeEjemplo(accion.ejemplo, accion.conceptos) };
  if (accion.tipo === "CARGAR_BORRADOR") return { captura: desdeBorrador(accion.folio, accion.borrador, accion.conceptos, accion.referencias) };
  if (accion.tipo === "VOLVER_AL_INICIO") return ESTADO_INICIAL;
  const c = estado.captura;
  if (!c) return estado;
  const nueva = reducirCaptura(c, accion);
  if (nueva === c) return estado;
  // Una excepción que dejó de citar algo de la captura (partida, precio o concepto) se quita.
  return { captura: nueva.excepciones.length > 0 ? { ...nueva, excepciones: depurar(nueva.excepciones, referidas(nueva), nueva.seleccion) } : nueva };
}

/** Partidas en el formato mínimo que usan las excepciones. */
export function referidas(c: Captura): PartidaReferida[] {
  return c.partidas.map((p) => (p.tipo === "CONCEPTO" ? { clave: p.clave, tipo: "CONCEPTO", conceptoCodigo: p.concepto.codigo } : { clave: p.clave, tipo: "ADICIONAL" }));
}

function reducirCaptura(c: Captura, a: Accion): Captura {
  switch (a.tipo) {
    case "AGREGAR_CONCEPTO": {
      const clave = `k${c.siguienteClave}`;
      const renglon = renglonVacio(`k${c.siguienteClave + 1}`);
      const partida: PartidaConcepto = {
        clave,
        tipo: "CONCEPTO",
        concepto: a.concepto,
        descripcion: a.concepto.descripcion,
        renglones: [renglon],
        noDisponible: null,
      };
      return { ...c, partidas: [...c.partidas, partida], siguienteClave: c.siguienteClave + 2 };
    }
    case "QUITAR_PARTIDA":
      return { ...c, partidas: c.partidas.filter((p) => p.clave !== a.clave) };
    case "EDITAR_DESCRIPCION_PARTIDA":
      return conPartida(c, a.clave, (p) => (p.tipo === "CONCEPTO" ? { ...p, descripcion: a.descripcion } : p));
    case "AGREGAR_RENGLON":
      return {
        ...conPartida(c, a.partida, (p) =>
          p.tipo === "CONCEPTO" ? { ...p, renglones: [...p.renglones, renglonVacio(`k${c.siguienteClave}`)] } : p,
        ),
        siguienteClave: c.siguienteClave + 1,
      };
    case "QUITAR_RENGLON":
      return conPartida(c, a.partida, (p) =>
        p.tipo === "CONCEPTO" ? { ...p, renglones: p.renglones.filter((r) => r.clave !== a.renglon) } : p,
      );
    case "EDITAR_RENGLON":
      return conPartida(c, a.partida, (p) =>
        p.tipo === "CONCEPTO"
          ? { ...p, renglones: p.renglones.map((r) => (r.clave === a.renglon ? editarRenglon(r, a.cambios) : r)) }
          : p,
      );
    case "AGREGAR_ADICIONAL": {
      const partida: PartidaAdicional = {
        clave: `k${c.siguienteClave}`,
        tipo: "ADICIONAL",
        tipoAdicionalCodigo: "",
        descripcion: "",
        cantidad: "1",
        monto: "",
      };
      return { ...c, partidas: [...c.partidas, partida], siguienteClave: c.siguienteClave + 1 };
    }
    case "EDITAR_ADICIONAL":
      return conPartida(c, a.clave, (p) => (p.tipo === "ADICIONAL" ? { ...p, ...a.cambios } : p));
    case "FIJAR_CONSOLIDACION":
      return c.consolidarCompras === a.valor ? c : { ...c, consolidarCompras: a.valor };
    case "ELEGIR_OPCION": {
      const { [a.insumo]: _, ...avisos } = c.avisosSeleccion;
      return { ...c, seleccion: { ...c.seleccion, [a.insumo]: a.precio }, avisosSeleccion: avisos };
    }
    case "QUITAR_SELECCION": {
      if (c.seleccion[a.insumo] === undefined && !c.seleccionConservada.includes(a.insumo)) return c;
      const { [a.insumo]: _s, ...seleccion } = c.seleccion;
      const { [a.insumo]: _a, ...avisos } = c.avisosSeleccion;
      return { ...c, seleccion, avisosSeleccion: avisos, seleccionConservada: c.seleccionConservada.filter((i) => i !== a.insumo) };
    }
    case "CONCILIAR_OPCIONES":
      return conciliar(c, a.conceptos, a.insumos);
    case "EDITAR_TEXTO":
      return { ...c, textos: { ...(c.textos ?? { alcance: "", condiciones: "", exclusiones: "" }), [a.campo]: a.valor } };
    case "FIJAR_TEXTOS":
      return { ...c, textos: { ...a.textos } };
    case "AGREGAR_EXCEPCION":
      return { ...c, excepciones: [...c.excepciones, { ...a.excepcion, clave: `k${c.siguienteClave}` } as ExcepcionCaptura], siguienteClave: c.siguienteClave + 1 };
    case "QUITAR_EXCEPCION":
      return { ...c, excepciones: c.excepciones.filter((x) => x.clave !== a.clave) };
    default:
      return c;
  }
}

function conPartida(c: Captura, clave: string, f: (p: PartidaCaptura) => PartidaCaptura): Captura {
  return { ...c, partidas: c.partidas.map((p) => (p.clave === clave ? f(p) : p)) };
}

/** Al cambiar la segunda medida de un renglón AREA, se vacía la que deja de usarse. */
function editarRenglon(r: RenglonCaptura, cambios: Partial<Omit<RenglonCaptura, "clave">>): RenglonCaptura {
  const nuevo = { ...r, ...cambios };
  if (cambios.segundaMedida && cambios.segundaMedida !== r.segundaMedida) {
    const otra: DimensionMedicion = cambios.segundaMedida === "ancho" ? "alto" : "ancho";
    nuevo[otra] = "";
  }
  return nuevo;
}

/**
 * Compara la selección con las opciones vigentes recibidas para los conceptos actuales:
 * - una selección que ya no figura entre las opciones SE CONSERVA y se avisa (el usuario decide
 *   elegir otra o quitarla; nunca se borra ni se sustituye por otra);
 * - si una selección marcada vuelve a figurar entre las opciones, el aviso desaparece;
 * - en un ejemplo, se marcan las opciones del ejemplo que siguen vigentes y se avisa de las demás.
 * Una respuesta para otra lista de conceptos (atrasada) no se aplica.
 */
function conciliar(c: Captura, conceptos: readonly string[], insumos: readonly InsumoConOpciones[]): Captura {
  const actuales = conceptosEnUso(c);
  if (actuales.length !== conceptos.length || actuales.some((x, i) => x !== conceptos[i])) return c;

  const seleccion = { ...c.seleccion };
  const avisos = { ...c.avisosSeleccion };
  let cambio = false;
  for (const ins of insumos) {
    const codigos = new Set(ins.opciones.map((o) => o.precioCodigo));
    const elegido = seleccion[ins.insumoCodigo];
    if (elegido !== undefined && !codigos.has(elegido)) {
      if (!avisos[ins.insumoCodigo]?.includes(elegido)) {
        avisos[ins.insumoCodigo] = avisoNoDisponible(elegido, null);
        cambio = true;
      }
    } else if (elegido !== undefined && avisos[ins.insumoCodigo] !== undefined) {
      delete avisos[ins.insumoCodigo];
      cambio = true;
    }
    if (c.preciosDelEjemplo && seleccion[ins.insumoCodigo] === undefined) {
      const delEjemplo = ins.opciones.find((o) => c.preciosDelEjemplo?.includes(o.precioCodigo));
      if (delEjemplo) {
        seleccion[ins.insumoCodigo] = delEjemplo.precioCodigo;
      } else if (!avisos[ins.insumoCodigo]) {
        avisos[ins.insumoCodigo] = "La opción indicada en el ejemplo ya no está disponible. Elija una opción.";
      }
      cambio = true;
    }
  }
  if (!cambio && c.preciosDelEjemplo === null) return c;
  return { ...c, seleccion, avisosSeleccion: avisos, preciosDelEjemplo: null };
}

/** Aviso de una selección conservada que ya no se puede elegir. */
export function avisoNoDisponible(precio: string, motivo: string | null): string {
  return `La opción ${precio} ya no está disponible${motivo ? ` (${motivo})` : ""}. Se conserva hasta que elija otra o la quite.`;
}

function desdeEjemplo(ej: Ejemplo, conceptos: readonly ConceptoCatalogo[]): Captura {
  const c = capturaVacia({ tipo: "ejemplo", id: ej.id, titulo: ej.titulo });
  let n = 1;
  const clave = () => `k${n++}`;
  const partidas: PartidaCaptura[] = [];
  const avisosCarga: string[] = [];
  for (const p of ej.solicitud.partidas) {
    if (p.tipo === "ADICIONAL") {
      partidas.push({
        clave: clave(),
        tipo: "ADICIONAL",
        tipoAdicionalCodigo: p.tipoAdicionalCodigo,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        monto: p.monto,
      });
      continue;
    }
    const concepto = conceptos.find((x) => x.codigo === p.conceptoCodigo);
    if (!concepto) {
      avisosCarga.push(`El concepto ${p.conceptoCodigo} del ejemplo ya no está disponible; esa partida no se cargó.`);
      continue;
    }
    partidas.push({
      clave: clave(),
      tipo: "CONCEPTO",
      concepto,
      descripcion: p.descripcion ?? concepto.descripcion,
      renglones: p.mediciones.map((m) => ({
        clave: clave(),
        descripcion: m.descripcion,
        signo: m.signo,
        piezas: m.piezas,
        largo: m.largo ?? "",
        ancho: m.ancho ?? "",
        alto: m.alto ?? "",
        segundaMedida: m.ancho === null && m.alto !== null ? "alto" : "ancho",
      })),
      noDisponible: null,
    });
  }
  return {
    ...c,
    consolidarCompras: ej.solicitud.consolidarCompras,
    partidas,
    preciosDelEjemplo: [...ej.solicitud.preciosElegidos],
    avisosCarga,
    siguienteClave: n,
  };
}

/** Fórmula probable de un concepto que ya no está en el catálogo, según las medidas guardadas. */
function formulaSegunMedidas(p: Extract<CapturaBorrador["partidas"][number], { tipo: "CONCEPTO" }>): TipoFormula {
  const m = p.mediciones;
  if (m.some((r) => r.ancho !== null && r.alto !== null)) return "VOLUMEN";
  if (m.some((r) => r.ancho !== null || r.alto !== null)) return "AREA";
  if (m.some((r) => r.largo !== null)) return "LONGITUD";
  return "CONTEO";
}

/**
 * Captura editable a partir de un borrador guardado (módulo 6). A diferencia de un ejemplo, NUNCA
 * se descarta una partida ni una selección:
 * - si su concepto ya no está disponible, la partida se conserva con un concepto provisional y un
 *   aviso; si el servidor informa sus insumos, sus selecciones siguen asociadas a ella;
 * - una selección que el servidor informa como no disponible se conserva marcada;
 * - una selección sin partida conocida se conserva («seleccionConservada») hasta que se quite.
 * `null` vuelve a ser un campo vacío; `"0"` se conserva.
 */
function desdeBorrador(
  folio: string,
  b: CapturaBorrador,
  conceptos: readonly ConceptoCatalogo[],
  referencias: ReferenciasBorrador | undefined,
): Captura {
  const c = capturaVacia({ tipo: "cotizacion", folio });
  let n = 1;
  const clave = () => `k${n++}`;
  const avisosCarga: string[] = [];
  const refConcepto = new Map((referencias?.conceptos ?? []).map((r) => [r.codigo, r]));
  const avisados = new Set<string>();
  const partidas: PartidaCaptura[] = b.partidas.map((p) => {
    if (p.tipo === "ADICIONAL") {
      return {
        clave: clave(),
        tipo: "ADICIONAL",
        tipoAdicionalCodigo: p.tipoAdicionalCodigo ?? "",
        descripcion: p.descripcion,
        cantidad: p.cantidad ?? "",
        monto: p.monto ?? "",
      };
    }
    const ref = refConcepto.get(p.conceptoCodigo);
    let concepto = ref?.disponible === false ? undefined : conceptos.find((x) => x.codigo === p.conceptoCodigo);
    let noDisponible: string | null = null;
    if (!concepto) {
      noDisponible = ref?.motivo ?? "no está en el catálogo disponible";
      if (!avisados.has(p.conceptoCodigo)) {
        avisados.add(p.conceptoCodigo);
        avisosCarga.push(
          `El concepto ${p.conceptoCodigo} ya no está disponible: ${noDisponible}. Su partida y sus selecciones se conservan tal como se guardaron, pero no se podrá calcular hasta quitarla.`,
        );
      }
      concepto = {
        codigo: p.conceptoCodigo,
        clase: "",
        descripcion: `${p.conceptoCodigo} (no disponible)`,
        unidad: "",
        tipoFormula: formulaSegunMedidas(p),
        permiteDescuento: true,
        insumos: (ref?.insumos ?? []).map((codigo) => ({ codigo, descripcion: "", unidadBase: "" })),
      };
    }
    return {
      clave: clave(),
      tipo: "CONCEPTO",
      concepto,
      descripcion: p.descripcion,
      renglones: p.mediciones.map((m) => ({
        clave: clave(),
        descripcion: m.descripcion,
        signo: m.signo,
        piezas: m.piezas ?? "",
        largo: m.largo ?? "",
        ancho: m.ancho ?? "",
        alto: m.alto ?? "",
        segundaMedida: m.segundaMedida,
      })),
      noDisponible,
    };
  });
  const base: Captura = {
    ...c,
    consolidarCompras: b.consolidarCompras,
    partidas,
    seleccion: Object.fromEntries(b.seleccion.map((s) => [s.insumoCodigo, s.precioCodigo])),
    avisosCarga,
    textos: b.textos ? { ...b.textos } : null,
    siguienteClave: n,
  };
  base.excepciones = excepcionesDesdeBorrador(b.excepciones ?? [], referidas(base), clave);
  base.siguienteClave = n;
  const conocidos = new Set(insumosEnUso(base));
  const avisosSeleccion: Record<string, string> = {};
  for (const r of referencias?.selecciones ?? []) {
    if (!r.disponible && base.seleccion[r.insumoCodigo] === r.precioCodigo) {
      avisosSeleccion[r.insumoCodigo] = avisoNoDisponible(r.precioCodigo, r.motivo);
    }
  }
  return {
    ...base,
    avisosSeleccion,
    seleccionConservada: b.seleccion.map((s) => s.insumoCodigo).filter((i) => !conocidos.has(i)),
  };
}
