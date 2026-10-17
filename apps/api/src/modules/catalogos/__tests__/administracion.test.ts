/**
 * Administración de catálogos (módulo 11, ADR-0015): reglas puras y contratos.
 * Las cifras y mensajes salen de `modCatalogos.bas` y `modApp.bas` (Normalizar, Val_Producto,
 * Val_Precio, Val_Tarifa), no del código bajo prueba.
 */
import {
  EsquemaAsignacionTarifa,
  EsquemaCierreVigenciaPrecio,
  EsquemaEdicionProducto,
  EsquemaEdicionTarifa,
  EsquemaSolicitudPrecio,
  EsquemaSolicitudProducto,
  EsquemaSolicitudProveedor,
  EsquemaSolicitudTarifa,
} from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { diaSiguiente, estadoPrecio, motivoCierreInvalido, normalizar, tarifaVigente } from "../dominio/administracion.js";

describe("Normalizar (modApp.bas) para duplicados", () => {
  it("minúsculas, sin acentos, puntuación como espacio y espacios simples", () => {
    expect(normalizar("  [DEMO]  Proveedor  Úno, S.A. de C.V.  ")).toBe("[demo] proveedor uno s a de c v");
    expect(normalizar("Ñandú-Acero_Norte")).toBe("nandu acero norte");
    expect(normalizar('O\'Brien "Materiales"')).toBe("o brien materiales");
  });

  it("mismo nombre con otras mayúsculas o espacios es duplicado (TI-004)", () => {
    expect(normalizar("Proveedor Tres")).toBe(normalizar("  PROVEEDOR   tres "));
    expect(normalizar("Proveedor Tres")).not.toBe(normalizar("Proveedor Treses"));
  });
});

describe("estado de un precio a la fecha del servidor (vigencias inclusivas)", () => {
  const p = { anulado: false, vigenteDesde: "2026-10-01", vigenteHasta: "2026-10-31" };
  it("los límites son vigentes", () => {
    expect(estadoPrecio(p, "2026-10-01")).toBe("VIGENTE");
    expect(estadoPrecio(p, "2026-10-31")).toBe("VIGENTE");
    expect(estadoPrecio(p, "2026-09-30")).toBe("FUTURO");
    expect(estadoPrecio(p, "2026-11-01")).toBe("VENCIDO");
  });
  it("anulado prevalece sobre la vigencia", () => {
    expect(estadoPrecio({ ...p, anulado: true }, "2026-10-15")).toBe("ANULADO");
  });
  it("tarifa vigente con los mismos límites inclusivos (BL-10)", () => {
    expect(tarifaVigente(p, "2026-10-31")).toBe(true);
    expect(tarifaVigente(p, "2026-11-01")).toBe(false);
  });
});

describe("cierre de vigencia con sucesor (adaptación autorizada; P3 pendiente)", () => {
  const actual = { anulado: false, vigenteDesde: "2026-09-01", vigenteHasta: "2027-03-31" };
  const hoy = "2026-10-17";
  it("cerrar hoy permite que el sucesor empiece mañana", () => {
    expect(motivoCierreInvalido(actual, hoy, diaSiguiente(hoy), hoy)).toBeNull();
    expect(diaSiguiente(hoy)).toBe("2026-10-18");
  });
  it("no es retroactivo: ayer se rechaza", () => {
    expect(motivoCierreInvalido(actual, "2026-10-16", "2026-10-17", hoy)).toMatch(/anterior a hoy/);
  });
  it("solo acorta: igual o posterior a la fecha final actual se rechaza", () => {
    expect(motivoCierreInvalido(actual, "2027-03-31", "2027-04-01", hoy)).toMatch(/solo puede acortarse/);
    expect(motivoCierreInvalido(actual, "2027-04-30", "2027-05-01", hoy)).toMatch(/solo puede acortarse/);
  });
  it("no antes del inicio (precio futuro)", () => {
    const futuro = { anulado: false, vigenteDesde: "2026-12-01", vigenteHasta: "2027-03-31" };
    expect(motivoCierreInvalido(futuro, "2026-11-30", "2026-12-01", hoy)).toMatch(/inicio/);
    expect(motivoCierreInvalido(futuro, "2026-12-01", "2026-12-02", hoy)).toBeNull();
  });
  it("el sucesor empieza después del último día (vigencias inclusivas)", () => {
    expect(motivoCierreInvalido(actual, "2026-10-20", "2026-10-20", hoy)).toMatch(/después del último día/);
  });
  it("un precio anulado no se cierra", () => {
    expect(motivoCierreInvalido({ ...actual, anulado: true }, hoy, "2026-10-18", hoy)).toMatch(/anulado/);
  });
  it("cambio de año y de mes sin desplazamiento por zona horaria", () => {
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01");
    expect(diaSiguiente("2028-02-28")).toBe("2028-02-29");
  });
});

describe("contratos de administración (escalas, rangos, ausente frente a cero)", () => {
  const producto = {
    insumoCodigo: "INS-00010",
    descripcion: "[DEMO] Block comprobación",
    presentacion: "pieza",
    unidadCompra: "pza",
    contenido: "1",
    fraccionable: false,
    incrementoMinimo: null,
  };

  it("producto: contenido > 0 con hasta 6 decimales, sin redondeo", () => {
    expect(EsquemaSolicitudProducto.safeParse(producto).success).toBe(true);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, contenido: "25.123456" }).success).toBe(true);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, contenido: "25.1234567" }).success).toBe(false);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, contenido: "0" }).success).toBe(false);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, contenido: "-1" }).success).toBe(false);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, contenido: 25 }).success).toBe(false);
  });

  it("producto: incremento obligatorio solo si es fraccionable (Val_Producto); null no es cero", () => {
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, fraccionable: true, incrementoMinimo: null }).success).toBe(false);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, fraccionable: true, incrementoMinimo: "0" }).success).toBe(false);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, fraccionable: true, incrementoMinimo: "0.25" }).success).toBe(true);
    expect(EsquemaSolicitudProducto.safeParse({ ...producto, incrementoMinimo: "0.25" }).success).toBe(false);
    const { incrementoMinimo: _ausente, ...sinCampo } = producto;
    expect(EsquemaSolicitudProducto.safeParse(sinCampo).success).toBe(false);
  });

  it("producto: la edición exige revisión y algún cambio; no admite organización ni código", () => {
    expect(EsquemaEdicionProducto.safeParse({ revision: 0 }).success).toBe(false);
    expect(EsquemaEdicionProducto.safeParse({ revision: 0, descripcion: "Otra" }).success).toBe(true);
    expect(EsquemaEdicionProducto.safeParse({ revision: 0, descripcion: "Otra", organizacionId: "x" }).success).toBe(false);
    expect(EsquemaEdicionProducto.safeParse({ revision: 0, codigo: "PCM-00001" }).success).toBe(false);
  });

  const precio = {
    productoCodigo: "PCM-00010",
    proveedorCodigo: "PRV-00003",
    precioUnitario: "13.9",
    vigenteDesde: "2026-10-17",
    vigenteHasta: "2026-12-31",
    fuente: "[DEMO] Lista de comprobación",
  };

  it("precio: > 0, escala 6, fechas reales y desde ≤ hasta (Val_Precio)", () => {
    expect(EsquemaSolicitudPrecio.safeParse(precio).success).toBe(true);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, vigenteHasta: precio.vigenteDesde }).success).toBe(true);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, precioUnitario: "0" }).success).toBe(false);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, precioUnitario: "13.0000001" }).success).toBe(false);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, precioUnitario: "1234567890123" }).success).toBe(false);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, vigenteHasta: "2026-10-16" }).success).toBe(false);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, vigenteHasta: "2026-02-30" }).success).toBe(false);
    expect(EsquemaSolicitudPrecio.safeParse({ ...precio, fuente: "   " }).success).toBe(false);
  });

  it("cierre: sucesor después de la nueva fecha final y motivo explicado", () => {
    const cierre = {
      revision: 0,
      nuevaHasta: "2026-10-17",
      motivo: "[DEMO] Cambio de lista del proveedor",
      sucesor: { precioUnitario: "14.2", vigenteDesde: "2026-10-18", vigenteHasta: "2027-03-31", fuente: "[DEMO] Lista nueva" },
    };
    expect(EsquemaCierreVigenciaPrecio.safeParse(cierre).success).toBe(true);
    expect(EsquemaCierreVigenciaPrecio.safeParse({ ...cierre, sucesor: { ...cierre.sucesor, vigenteDesde: "2026-10-17" } }).success).toBe(false);
    expect(EsquemaCierreVigenciaPrecio.safeParse({ ...cierre, motivo: "corto" }).success).toBe(false);
  });

  const tarifa = {
    modalidad: "UNIDAD",
    descripcion: "[DEMO] Tarifa de comprobación",
    unidad: "m2",
    importe: "210",
    rendimientoJornada: null,
    proveedorCodigo: null,
    vigenteDesde: "2026-10-17",
    vigenteHasta: "2027-03-31",
    fuente: "[DEMO] Comprobación",
  };

  it("tarifa: sin modalidades nuevas; rendimiento por jornada solo en JORNADA (Val_Tarifa)", () => {
    expect(EsquemaSolicitudTarifa.safeParse(tarifa).success).toBe(true);
    expect(EsquemaSolicitudTarifa.safeParse({ ...tarifa, modalidad: "DESTAJO" }).success).toBe(false);
    expect(EsquemaSolicitudTarifa.safeParse({ ...tarifa, modalidad: "JORNADA" }).success).toBe(false);
    expect(EsquemaSolicitudTarifa.safeParse({ ...tarifa, modalidad: "JORNADA", rendimientoJornada: "0.6" }).success).toBe(true);
    expect(EsquemaSolicitudTarifa.safeParse({ ...tarifa, rendimientoJornada: "0.6" }).success).toBe(false);
    expect(EsquemaSolicitudTarifa.safeParse({ ...tarifa, importe: "0" }).success).toBe(false);
  });

  it("tarifa: no se edita; solo activa con revisión", () => {
    expect(EsquemaEdicionTarifa.safeParse({ revision: 0, activa: false }).success).toBe(true);
    expect(EsquemaEdicionTarifa.safeParse({ revision: 0, activa: false, importe: "1" }).success).toBe(false);
  });

  it("asignación: exige la tarifa vista y una distinta", () => {
    expect(EsquemaAsignacionTarifa.safeParse({ tarifaActual: "TMO-00001", tarifaNueva: "TMO-00006", motivo: "[DEMO] Tarifa nueva de la lista" }).success).toBe(true);
    expect(EsquemaAsignacionTarifa.safeParse({ tarifaActual: "TMO-00001", tarifaNueva: "TMO-00001", motivo: "[DEMO] Tarifa nueva de la lista" }).success).toBe(false);
    expect(EsquemaAsignacionTarifa.safeParse({ tarifaNueva: "TMO-00006", motivo: "[DEMO] Tarifa nueva de la lista" }).success).toBe(false);
  });

  it("proveedor: nombre obligatorio y correo válido si se captura (Val_Proveedor)", () => {
    expect(EsquemaSolicitudProveedor.safeParse({ nombre: "[DEMO] Proveedor" }).success).toBe(true);
    expect(EsquemaSolicitudProveedor.safeParse({ nombre: " " }).success).toBe(false);
    expect(EsquemaSolicitudProveedor.safeParse({ nombre: "[DEMO] Proveedor", correo: "sin-arroba" }).success).toBe(false);
    expect(EsquemaSolicitudProveedor.safeParse({ nombre: "[DEMO] Proveedor", correo: "" }).data?.correo).toBeNull();
  });
});
