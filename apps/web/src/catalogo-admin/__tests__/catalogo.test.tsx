// @vitest-environment jsdom
/**
 * Administración de catálogos en la web (módulo 11, ADR-0015): rutas, bloqueo técnico explicado,
 * impacto antes de desactivar, conflicto que conserva lo escrito, cierre de vigencia con fechas
 * inclusivas y misma clave de idempotencia al reintentar. La API se simula con los contratos.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DetallePrecioAdmin, DetalleProductoAdmin, DetalleProveedorAdmin, PrecioAdmin, ProductoAdmin, ProveedorAdmin } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta, hashDe, interpretarHash } from "../../navegacion/ruta.tsx";
import { PantallaCatalogo } from "../PantallasCatalogo.tsx";
import type { ServiciosCatalogoAdmin } from "../servicios.ts";

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true, datos });
const SIN_IMPACTO = { preciosVigentes: 0, tarifas: 0, conceptos: 0, borradoresAbiertos: 0 };

const PROVEEDOR: ProveedorAdmin = {
  codigo: "PRV-00003",
  nombre: "[DEMO] Proveedor de comprobación",
  contacto: null,
  telefono: null,
  correo: null,
  activo: true,
  revision: 2,
  creadoEn: "2026-10-17T15:00:00.000Z",
  modificadoEn: "2026-10-17T15:00:00.000Z",
  modificadoPor: "[DEMO] Administrador",
};

const PRODUCTO: ProductoAdmin = {
  codigo: "PCM-00012",
  insumo: { codigo: "INS-00011", descripcion: "[DEMO] Mortero", unidadBase: "kg", activo: true },
  descripcion: "[DEMO] Mortero de comprobación",
  presentacion: "bulto 25 kg",
  unidadCompra: "bulto",
  contenido: "25",
  fraccionable: false,
  incrementoMinimo: null,
  activo: true,
  revision: 1,
  tienePrecios: true,
  creadoEn: "2026-10-17T15:00:00.000Z",
  modificadoEn: "2026-10-17T15:00:00.000Z",
  modificadoPor: "[DEMO] Administrador",
};

const PRECIO: PrecioAdmin = {
  codigo: "PRE-000018",
  producto: { codigo: "PCM-00012", descripcion: "[DEMO] Mortero de comprobación", presentacion: "bulto 25 kg", unidadCompra: "bulto", activo: true },
  proveedor: { codigo: "PRV-00003", nombre: "[DEMO] Proveedor de comprobación", activo: true },
  precioUnitario: "118",
  vigenteDesde: "2026-09-01",
  vigenteHasta: "2027-03-31",
  estado: "VIGENTE",
  fuente: "[DEMO] Lista ficticia",
  motivoAnulacion: null,
  anuladoPor: null,
  anuladoEn: null,
  revision: 0,
  registradoPor: "[DEMO] Administrador",
  registradoEn: "2026-10-17T15:00:00.000Z",
};

function servicios(s: Partial<ServiciosCatalogoAdmin> = {}): ServiciosCatalogoAdmin {
  const noUsar = () => Promise.reject(new Error("no se esperaba esta llamada"));
  return {
    listarProveedores: () => ok({ proveedores: [PROVEEDOR], limite: 50, siguiente: null }),
    detalleProveedor: () => ok<DetalleProveedorAdmin>({ proveedor: PROVEEDOR, impacto: { ...SIN_IMPACTO, preciosVigentes: 2, borradoresAbiertos: 3 }, historial: [] }),
    crearProveedor: noUsar,
    editarProveedor: vi.fn(),
    listarProductos: () => ok({ productos: [PRODUCTO], limite: 50, siguiente: null }),
    detalleProducto: () => ok<DetalleProductoAdmin>({ producto: PRODUCTO, impacto: SIN_IMPACTO, historial: [] }),
    crearProducto: noUsar,
    editarProducto: vi.fn(),
    listarPrecios: () => ok({ precios: [PRECIO], fechaReferencia: "2026-10-17", limite: 50, siguiente: null }),
    detallePrecio: () => ok<DetallePrecioAdmin>({ precio: PRECIO, fechaReferencia: "2026-10-17", impacto: { ...SIN_IMPACTO, borradoresAbiertos: 1 }, historial: [] }),
    registrarPrecio: noUsar,
    anularPrecio: vi.fn(),
    cerrarVigencia: vi.fn(),
    listarTarifas: () => ok({ tarifas: [], fechaReferencia: "2026-10-17", limite: 50, siguiente: null }),
    detalleTarifa: noUsar,
    registrarTarifa: noUsar,
    cambiarActivaTarifa: vi.fn(),
    listarConceptos: () => ok({ conceptos: [], limite: 50, siguiente: null }),
    asignarTarifa: vi.fn(),
    listarInsumos: () => ok({ insumos: [PRODUCTO.insumo], limite: 100, siguiente: null }),
    unidades: () => ok({ unidades: [{ clave: "bulto", nombre: "Bulto", magnitud: "conteo" }, { clave: "kg", nombre: "Kilogramo", magnitud: "masa" }] }),
    ...s,
  };
}

const montar = (s: ServiciosCatalogoAdmin, vista: "proveedores" | "productos" | "precios") =>
  render(
    <ProveedorRuta>
      <PantallaCatalogo servicios={s} vista={vista} />
    </ProveedorRuta>,
  );

describe("rutas del catálogo", () => {
  it("cada vista tiene su URL; una vista desconocida no es una ruta del catálogo", () => {
    for (const vista of ["proveedores", "productos", "precios", "mano-de-obra", "conceptos"] as const) {
      expect(interpretarHash(hashDe({ pantalla: "catalogo", vista }))).toEqual({ pantalla: "catalogo", vista });
    }
    expect(interpretarHash("#/catalogo")).toEqual({ pantalla: "catalogo", vista: "proveedores" });
    expect(interpretarHash("#/catalogo/insumos")).toEqual({ pantalla: "no-encontrada" });
  });
});

describe("proveedores", () => {
  it("antes de desactivar muestra el impacto (precios vigentes y cotizaciones abiertas) y envía la revisión vista", async () => {
    const usuario = userEvent.setup();
    const editarProveedor = vi.fn<ServiciosCatalogoAdmin["editarProveedor"]>(() => ok({ ...PROVEEDOR, activo: false, revision: 3 }));
    montar(servicios({ editarProveedor }), "proveedores");
    await usuario.click(await screen.findByRole("button", { name: "Gestionar" }));
    await usuario.click(await screen.findByRole("button", { name: "Desactivar proveedor" }));
    const grupo = screen.getByRole("group", { name: /Confirmar: Desactivar/ });
    expect(grupo.textContent).toMatch(/2 precio\(s\) vigente\(s\) hoy dejarán de ofrecerse/);
    expect(grupo.textContent).toMatch(/3 cotización\(es\) abierta\(s\)/);
    expect(grupo.textContent).toMatch(/No se borra/);
    await usuario.click(within(grupo).getByRole("button", { name: "Desactivar" }));
    expect(editarProveedor).toHaveBeenCalledWith("PRV-00003", { revision: 2, activo: false });
  });

  it("un conflicto conserva lo escrito y ofrece recargar el registro vigente", async () => {
    const usuario = userEvent.setup();
    const editarProveedor = vi.fn<ServiciosCatalogoAdmin["editarProveedor"]>(() =>
      Promise.resolve({ ok: false as const, fallo: { tipo: "conflicto" as const, codigo: "CONFLICTO_EDICION" as const, mensaje: "Otra persona o pestaña guardó cambios antes; lo que escribió se conserva.", actual: null } }),
    );
    montar(servicios({ editarProveedor }), "proveedores");
    await usuario.click(await screen.findByRole("button", { name: "Gestionar" }));
    await usuario.click(await screen.findByRole("button", { name: "Editar datos" }));
    const nombre = screen.getByLabelText(/Nombre del proveedor/);
    await usuario.clear(nombre);
    await usuario.type(nombre, "[[DEMO] Nombre corregido");
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/Otra persona o pestaña guardó cambios antes/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recargar el registro vigente" })).toBeTruthy();
    expect((screen.getByLabelText(/Nombre del proveedor/) as HTMLInputElement).value).toBe("[DEMO] Nombre corregido");
  });
});

describe("productos: bloqueo técnico explicado", () => {
  it("con precios registrados, los campos técnicos están deshabilitados y solo se envía la descripción", async () => {
    const usuario = userEvent.setup();
    const editarProducto = vi.fn<ServiciosCatalogoAdmin["editarProducto"]>(() => ok({ ...PRODUCTO, descripcion: "[DEMO] Mortero corregido", revision: 2 }));
    montar(servicios({ editarProducto }), "productos");
    await usuario.click(await screen.findByRole("button", { name: "Gestionar" }));
    await usuario.click(await screen.findByRole("button", { name: "Corregir descripción" }));
    expect(await screen.findByText("Campos técnicos bloqueados")).toBeTruthy();
    // El insumo se elige con el selector con búsqueda (pendiente del módulo 11): todo el grupo queda deshabilitado.
    expect((screen.getByRole("group", { name: /Insumo que cubre/ }) as HTMLFieldSetElement).disabled).toBe(true);
    for (const etiqueta of [/^Presentación/, /Unidad de compra/, /Contenido por unidad de compra \(en kg\)/]) {
      expect((screen.getByLabelText(etiqueta) as HTMLInputElement).disabled, String(etiqueta)).toBe(true);
    }
    const desc = screen.getByLabelText(/Descripción comercial/);
    await usuario.clear(desc);
    await usuario.type(desc, "[[DEMO] Mortero corregido");
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(editarProducto).toHaveBeenCalledWith("PCM-00012", { revision: 1, descripcion: "[DEMO] Mortero corregido" }));
  });
});

describe("precios: cerrar vigencia y registrar sucesor", () => {
  it("propone hoy y mañana (vigencias inclusivas), explica el efecto y repite la misma clave al reintentar", async () => {
    const usuario = userEvent.setup();
    const cerrarVigencia = vi
      .fn<ServiciosCatalogoAdmin["cerrarVigencia"]>()
      .mockResolvedValueOnce({ ok: false, fallo: { tipo: "red" } })
      .mockResolvedValueOnce({
        ok: true,
        datos: {
          cerrado: { ...PRECIO, vigenteHasta: "2026-10-17", revision: 1 },
          sucesor: { ...PRECIO, codigo: "PRE-000019", precioUnitario: "121.5", vigenteDesde: "2026-10-18", estado: "FUTURO" },
          fechaReferencia: "2026-10-17",
        },
      });
    montar(servicios({ cerrarVigencia }), "precios");
    await usuario.click(await screen.findByRole("button", { name: "Gestionar" }));
    await usuario.click(await screen.findByRole("button", { name: "Cerrar vigencia y registrar sucesor" }));
    expect((screen.getByLabelText(/Nuevo último día/) as HTMLInputElement).value).toBe("2026-10-17");
    expect((screen.getByLabelText(/El sucesor empieza/) as HTMLInputElement).value).toBe("2026-10-18");
    expect((screen.getByLabelText(/El sucesor termina/) as HTMLInputElement).value).toBe("2027-03-31");
    await usuario.type(screen.getByLabelText(/Precio del sucesor/), "121.5");
    await usuario.type(screen.getByLabelText(/Fuente del sucesor/), "[[DEMO] Lista nueva ficticia");
    await usuario.type(screen.getByLabelText(/^Motivo/), "[[DEMO] Cambio de lista del proveedor");
    await usuario.click(screen.getByRole("button", { name: "Revisar y confirmar" }));
    const grupo = screen.getByRole("group", { name: /Confirmar: Cerrar vigencia/ });
    expect(grupo.textContent).toMatch(/vigente hasta el 17\/10\/2026 y el sucesor desde el 18\/10\/2026/);
    expect(grupo.textContent).toMatch(/1 cotización\(es\) abierta\(s\) lo eligieron: no se cambian solas/);
    await usuario.click(within(grupo).getByRole("button", { name: "Cerrar vigencia y registrar sucesor" }));
    await screen.findByText(/No hay conexión/);
    await usuario.click(screen.getByRole("button", { name: "Revisar y confirmar" }));
    await usuario.click(within(screen.getByRole("group", { name: /Confirmar: Cerrar vigencia/ })).getByRole("button", { name: "Cerrar vigencia y registrar sucesor" }));
    await waitFor(() => expect(cerrarVigencia).toHaveBeenCalledTimes(2));
    const [codigo, cuerpo, clave1] = cerrarVigencia.mock.calls[0]!;
    expect(codigo).toBe("PRE-000018");
    expect(cuerpo).toEqual({
      revision: 0,
      nuevaHasta: "2026-10-17",
      motivo: "[DEMO] Cambio de lista del proveedor",
      sucesor: { precioUnitario: "121.5", vigenteDesde: "2026-10-18", vigenteHasta: "2027-03-31", fuente: "[DEMO] Lista nueva ficticia" },
    });
    expect(cerrarVigencia.mock.calls[1]![2]).toBe(clave1);
    expect(await screen.findByText(/sucesor PRE-000019 desde el 18\/10\/2026/)).toBeTruthy();
  });

  it("anular advierte que es definitivo y distinto de un cambio comercial", async () => {
    const usuario = userEvent.setup();
    montar(servicios(), "precios");
    await usuario.click(await screen.findByRole("button", { name: "Gestionar" }));
    await usuario.click(await screen.findByRole("button", { name: "Anular precio erróneo" }));
    expect(screen.getByText(/Para un cambio de precio del proveedor use «Cerrar vigencia y registrar sucesor»/)).toBeTruthy();
    await usuario.type(screen.getByLabelText(/Motivo de la anulación/), "[[DEMO] Precio capturado con un cero de más");
    await usuario.click(screen.getByRole("button", { name: "Revisar y confirmar" }));
    expect(screen.getByRole("group", { name: /Confirmar: Anular precio/ }).textContent).toMatch(/La anulación es definitiva.*BL-08/);
  });
});
