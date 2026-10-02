/**
 * Validación de forma, formato y límites de `EntradaCalculo`.
 *
 * Recibe `unknown` porque la entrada podrá venir de HTTP o de la base de datos.
 * Los valores que el catálogo del Excel nunca admite (precio <= 0, contenido <= 0, factor <= 0,
 * piezas no enteras, etc.) se rechazan aquí como ENTRADA_INVALIDA. Las condiciones que el libro
 * reporta como bloqueo al calcular (BL-03, BL-05, BL-06, BL-08, BL-10 a BL-13) NO se tratan aquí:
 * las evalúa el motor.
 */
import {
  AMBIENTES,
  CAMPOS_EXCEPCION,
  ESTADOS_EXCEPCION,
  LIMITES_ENTRADA_CALCULO as L,
  MODALIDADES_MANO_OBRA,
  TIPOS_FORMULA,
  esDecimalTexto,
  type EntradaCalculo,
  type ErrorEntradaCalculo,
  type TipoFormula,
} from "@softarq/contracts";
import { dec } from "./decimal.js";
import { validarRenglon } from "./medicion.js";
import { esUnidadConocida } from "./unidades.js";
import { esFechaISOValida } from "./vigencias.js";

type Obj = Record<string, unknown>;

class Validador {
  readonly errores: ErrorEntradaCalculo[] = [];

  error(ruta: string, mensaje: string): void {
    this.errores.push({ ruta, mensaje });
  }

  objeto(v: unknown, ruta: string): v is Obj {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      this.error(ruta, "Debe ser un objeto.");
      return false;
    }
    return true;
  }

  lista(v: unknown, ruta: string, maximo: number): v is unknown[] {
    if (!Array.isArray(v)) {
      this.error(ruta, "Debe ser una lista.");
      return false;
    }
    if (v.length > maximo) {
      this.error(ruta, `Excede el límite de ${maximo} elementos (${v.length}).`);
      return false;
    }
    return true;
  }

  texto(v: unknown, ruta: string, { vacio = false } = {}): v is string {
    if (typeof v !== "string") {
      this.error(ruta, "Debe ser un texto.");
      return false;
    }
    if (!vacio && v.trim() === "") {
      this.error(ruta, "No puede estar vacío.");
      return false;
    }
    if (v.length > L.longitudTexto) {
      this.error(ruta, `Excede ${L.longitudTexto} caracteres.`);
      return false;
    }
    return true;
  }

  booleano(v: unknown, ruta: string): v is boolean {
    if (typeof v !== "boolean") {
      this.error(ruta, "Debe ser verdadero o falso.");
      return false;
    }
    return true;
  }

  opcion<T extends string>(v: unknown, ruta: string, opciones: readonly T[]): v is T {
    if (typeof v !== "string" || !(opciones as readonly string[]).includes(v)) {
      this.error(ruta, `Debe ser uno de: ${opciones.join(", ")}.`);
      return false;
    }
    return true;
  }

  /** Decimal con formato válido; `minimo`/`maximo` acotan el rango (incluidos salvo `exclusivo`). */
  decimal(
    v: unknown,
    ruta: string,
    rango: { mayorQue?: string; minimo?: string; menorQue?: string; maximo?: string } = {},
  ): v is string {
    if (!esDecimalTexto(v)) {
      this.error(
        ruta,
        "Debe ser un decimal en texto: hasta 15 enteros y 10 decimales, punto decimal, sin exponente, comas ni espacios.",
      );
      return false;
    }
    const d = dec(v);
    if (rango.mayorQue !== undefined && !d.gt(rango.mayorQue)) {
      this.error(ruta, `Debe ser mayor que ${rango.mayorQue}.`);
      return false;
    }
    if (rango.minimo !== undefined && d.lt(rango.minimo)) {
      this.error(ruta, `Debe ser mayor o igual que ${rango.minimo}.`);
      return false;
    }
    if (rango.menorQue !== undefined && !d.lt(rango.menorQue)) {
      this.error(ruta, `Debe ser menor que ${rango.menorQue}.`);
      return false;
    }
    if (rango.maximo !== undefined && d.gt(rango.maximo)) {
      this.error(ruta, `Debe ser menor o igual que ${rango.maximo}.`);
      return false;
    }
    return true;
  }

  decimalONulo(v: unknown, ruta: string, rango: Parameters<Validador["decimal"]>[2] = {}): boolean {
    return v === null ? true : this.decimal(v, ruta, rango);
  }

  fecha(v: unknown, ruta: string): v is string {
    if (typeof v !== "string" || !esFechaISOValida(v)) {
      this.error(ruta, "Debe ser una fecha AAAA-MM-DD válida.");
      return false;
    }
    return true;
  }

  unidad(v: unknown, ruta: string): v is string {
    if (!this.texto(v, ruta)) return false;
    if (!esUnidadConocida(v)) {
      this.error(ruta, `Unidad desconocida: ${v}.`);
      return false;
    }
    return true;
  }

  unico(ids: Set<string>, id: unknown, ruta: string, que: string): void {
    if (typeof id !== "string") return;
    if (ids.has(id)) this.error(ruta, `${que} duplicado: ${id}.`);
    ids.add(id);
  }
}

export function validarEntrada(entrada: unknown): ErrorEntradaCalculo[] {
  const v = new Validador();
  if (!v.objeto(entrada, "entrada")) return v.errores;
  const e = entrada;

  v.fecha(e["fechaCalculo"], "fechaCalculo");

  // Parámetros
  const p = e["parametros"];
  if (v.objeto(p, "parametros")) {
    v.opcion(p["ambiente"], "parametros.ambiente", AMBIENTES);
    v.opcion(p["moneda"], "parametros.moneda", ["MXN"] as const);
    // El rango del recargo y del impuesto se evalúa en el motor (BL-12, BL-13); aquí solo el formato.
    v.decimalONulo(p["recargoSobreCosto"], "parametros.recargoSobreCosto");
    v.booleano(p["consolidarCompras"], "parametros.consolidarCompras");
    const imp = p["impuesto"];
    if (imp !== null && v.objeto(imp, "parametros.impuesto")) {
      v.decimal(imp["tasa"], "parametros.impuesto.tasa");
      v.texto(imp["base"], "parametros.impuesto.base");
      v.texto(imp["tratamiento"], "parametros.impuesto.tratamiento");
      v.texto(imp["nombre"], "parametros.impuesto.nombre");
    }
  }

  // Insumos
  const insumos = new Map<string, string>();
  if (v.lista(e["insumos"], "insumos", L.insumos)) {
    const ids = new Set<string>();
    e["insumos"].forEach((i, n) => {
      const r = `insumos[${n}]`;
      if (!v.objeto(i, r)) return;
      v.texto(i["id"], `${r}.id`);
      v.unico(ids, i["id"], `${r}.id`, "Insumo");
      if (v.unidad(i["unidadBase"], `${r}.unidadBase`) && typeof i["id"] === "string") {
        insumos.set(i["id"], i["unidadBase"]);
      }
    });
  }

  // Conversiones
  if (v.lista(e["conversiones"], "conversiones", L.conversiones)) {
    const claves = new Set<string>();
    e["conversiones"].forEach((c, n) => {
      const r = `conversiones[${n}]`;
      if (!v.objeto(c, r)) return;
      if (v.texto(c["insumoId"], `${r}.insumoId`) && !insumos.has(c["insumoId"])) {
        v.error(`${r}.insumoId`, `No existe el insumo ${c["insumoId"]}.`);
      }
      v.unidad(c["unidadOrigen"], `${r}.unidadOrigen`);
      v.unidad(c["unidadDestino"], `${r}.unidadDestino`);
      v.decimal(c["factor"], `${r}.factor`, { mayorQue: "0" });
      v.unico(claves, JSON.stringify([c["insumoId"], c["unidadOrigen"], c["unidadDestino"]]), `${r}`, "Conversión");
    });
  }

  // Partidas
  const componentesPorPartida = new Map<string, Set<string>>();
  if (v.lista(e["partidas"], "partidas", L.partidas)) {
    const ids = new Set<string>();
    e["partidas"].forEach((pa, n) => {
      const r = `partidas[${n}]`;
      if (!v.objeto(pa, r)) return;
      v.texto(pa["id"], `${r}.id`);
      v.unico(ids, pa["id"], `${r}.id`, "Partida");
      v.texto(pa["descripcion"], `${r}.descripcion`);
      if (!v.opcion(pa["tipo"], `${r}.tipo`, ["CONCEPTO", "ADICIONAL"] as const)) return;
      if (pa["tipo"] === "ADICIONAL") {
        v.texto(pa["categoria"], `${r}.categoria`);
        v.unidad(pa["unidad"], `${r}.unidad`);
        // cantidad <= 0 → BL-03 y monto <= 0 → BL-11 en el motor.
        v.decimal(pa["cantidad"], `${r}.cantidad`);
        v.decimal(pa["monto"], `${r}.monto`);
        return;
      }
      validarPartidaConcepto(v, pa, r, insumos, componentesPorPartida);
    });
  }

  // Selecciones (una por insumo, CR-07)
  if (v.lista(e["selecciones"], "selecciones", L.selecciones)) {
    const porInsumo = new Set<string>();
    e["selecciones"].forEach((s, n) => {
      const r = `selecciones[${n}]`;
      if (!v.objeto(s, r)) return;
      if (v.texto(s["insumoId"], `${r}.insumoId`) && !insumos.has(s["insumoId"])) {
        v.error(`${r}.insumoId`, `No existe el insumo ${s["insumoId"]}.`);
      }
      v.unico(porInsumo, s["insumoId"], `${r}.insumoId`, "Selección de precio para el insumo");
      v.texto(s["productoId"], `${r}.productoId`);
      v.texto(s["proveedorId"], `${r}.proveedorId`);
      v.texto(s["precioId"], `${r}.precioId`);
      v.decimal(s["precioUnitario"], `${r}.precioUnitario`, { mayorQue: "0" });
      v.decimal(s["contenido"], `${r}.contenido`, { mayorQue: "0" });
      v.decimalONulo(s["menorPrecioVigente"], `${r}.menorPrecioVigente`, { mayorQue: "0" });
      if (v.booleano(s["fraccionable"], `${r}.fraccionable`)) {
        if (s["fraccionable"]) {
          if (s["incrementoMinimo"] === null) {
            v.error(`${r}.incrementoMinimo`, "Un producto fraccionable requiere incremento mínimo.");
          } else {
            v.decimal(s["incrementoMinimo"], `${r}.incrementoMinimo`, { mayorQue: "0" });
          }
        } else if (s["incrementoMinimo"] !== null) {
          v.error(`${r}.incrementoMinimo`, "Solo los productos fraccionables tienen incremento mínimo.");
        }
      }
    });
  }

  // Excepciones de rendimiento
  if (v.lista(e["excepciones"], "excepciones", L.excepciones)) {
    const ids = new Set<string>();
    e["excepciones"].forEach((x, n) => {
      const r = `excepciones[${n}]`;
      if (!v.objeto(x, r)) return;
      v.texto(x["id"], `${r}.id`);
      v.unico(ids, x["id"], `${r}.id`, "Excepción");
      v.opcion(x["estado"], `${r}.estado`, ESTADOS_EXCEPCION);
      if (v.texto(x["partidaId"], `${r}.partidaId`) && v.texto(x["componenteId"], `${r}.componenteId`)) {
        const comps = componentesPorPartida.get(x["partidaId"]);
        if (!comps || !comps.has(x["componenteId"])) {
          v.error(r, `No existe el componente ${x["componenteId"]} en la partida ${x["partidaId"]}.`);
        }
      }
      if (v.opcion(x["campo"], `${r}.campo`, CAMPOS_EXCEPCION)) {
        // El rango del valor aplicado se comprueba en el motor como BL-05, igual que el del catálogo.
        v.decimal(x["valorAplicado"], `${r}.valorAplicado`);
      }
    });
  }

  return v.errores;
}

function validarPartidaConcepto(
  v: Validador,
  pa: Obj,
  r: string,
  insumos: Map<string, string>,
  componentesPorPartida: Map<string, Set<string>>,
): void {
  let tipo: TipoFormula | null = null;
  let permite = false;
  const con = pa["concepto"];
  if (v.objeto(con, `${r}.concepto`)) {
    v.texto(con["id"], `${r}.concepto.id`);
    v.unidad(con["unidad"], `${r}.concepto.unidad`);
    if (v.opcion(con["tipoFormula"], `${r}.concepto.tipoFormula`, TIPOS_FORMULA)) tipo = con["tipoFormula"];
    if (v.booleano(con["permiteDescuento"], `${r}.concepto.permiteDescuento`)) permite = con["permiteDescuento"];
  }

  if (v.lista(pa["mediciones"], `${r}.mediciones`, L.renglonesPorPartida)) {
    pa["mediciones"].forEach((m, n) => {
      const rr = `${r}.mediciones[${n}]`;
      if (!v.objeto(m, rr)) return;
      v.texto(m["descripcion"], `${rr}.descripcion`, { vacio: true });
      const formatoOk = [
        v.opcion(m["signo"], `${rr}.signo`, ["+", "-"] as const),
        v.decimal(m["piezas"], `${rr}.piezas`),
        v.decimalONulo(m["largo"], `${rr}.largo`),
        v.decimalONulo(m["ancho"], `${rr}.ancho`),
        v.decimalONulo(m["alto"], `${rr}.alto`),
      ].every(Boolean);
      if (formatoOk && tipo !== null) {
        for (const err of validarRenglon(tipo, permite, m as never)) {
          v.error(`${rr}.${err.campo}`, err.mensaje);
        }
      }
    });
  }

  const comps = new Set<string>();
  if (typeof pa["id"] === "string") componentesPorPartida.set(pa["id"], comps);
  if (v.lista(pa["componentes"], `${r}.componentes`, L.componentesPorPartida)) {
    pa["componentes"].forEach((c, n) => {
      const rc = `${r}.componentes[${n}]`;
      if (!v.objeto(c, rc)) return;
      v.texto(c["id"], `${rc}.id`);
      v.unico(comps, c["id"], `${rc}.id`, "Componente");
      if (v.texto(c["insumoId"], `${rc}.insumoId`) && !insumos.has(c["insumoId"])) {
        v.error(`${rc}.insumoId`, `No existe el insumo ${c["insumoId"]}.`);
      }
      v.unidad(c["unidadRendimiento"], `${rc}.unidadRendimiento`);
      // Rangos de rendimiento, desperdicio y traslape: BL-05 en el motor.
      v.decimal(c["rendimiento"], `${rc}.rendimiento`);
      v.decimal(c["desperdicio"], `${rc}.desperdicio`);
      v.decimalONulo(c["factorTraslape"], `${rc}.factorTraslape`);
    });
  }

  const t = pa["tarifaManoObra"];
  if (t !== null && v.objeto(t, `${r}.tarifaManoObra`)) {
    const rt = `${r}.tarifaManoObra`;
    v.texto(t["id"], `${rt}.id`);
    v.unidad(t["unidad"], `${rt}.unidad`);
    v.decimal(t["importe"], `${rt}.importe`, { mayorQue: "0" });
    v.booleano(t["activa"], `${rt}.activa`);
    const desdeOk = v.fecha(t["vigenteDesde"], `${rt}.vigenteDesde`);
    const hastaOk = v.fecha(t["vigenteHasta"], `${rt}.vigenteHasta`);
    if (desdeOk && hastaOk && (t["vigenteDesde"] as string) > (t["vigenteHasta"] as string)) {
      v.error(rt, "La vigencia es incoherente: desde debe ser anterior o igual a hasta.");
    }
    if (v.opcion(t["modalidad"], `${rt}.modalidad`, MODALIDADES_MANO_OBRA)) {
      if (t["modalidad"] === "JORNADA") {
        if (t["rendimientoJornada"] === null) v.error(`${rt}.rendimientoJornada`, "Falta el rendimiento por jornada.");
        else v.decimal(t["rendimientoJornada"], `${rt}.rendimientoJornada`, { mayorQue: "0" });
      } else if (t["rendimientoJornada"] !== null) {
        v.error(`${rt}.rendimientoJornada`, "Solo la modalidad JORNADA tiene rendimiento por jornada.");
      }
    }
  }
}

/** Afirmación de tipo tras una validación sin errores. */
export function esEntradaValida(entrada: unknown): entrada is EntradaCalculo {
  return validarEntrada(entrada).length === 0;
}
