// @vitest-environment jsdom
/**
 * Clasificación de clientes, contadores de inicio y exportaciones CSV en el panel (E3.8, RF-26, ADR-0023): lo que muestra y envía
 * cada pantalla. Las garantías de fondo (permisos, aislamiento, sin secretos) están en la integración de la API.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, ContadoresInicio as Contadores } from "@softarq/contracts";
import { PantallaExportaciones } from "../../exportaciones/PantallaExportaciones.tsx";
import type { ServiciosAdministracion } from "../../administracion/servicios.ts";
import type { ResultadoApi } from "../../api/cliente.ts";
import type { ServiciosCotizaciones } from "../../api/servicios-cotizaciones.ts";
import { ClasificarCliente } from "../../clientes/ClasificarCliente.tsx";
import { ListaClientes } from "../../clientes/PantallasClientes.tsx";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { ContadoresInicio } from "../ContadoresInicio.tsx";

const guardarArchivo = vi.hoisted(() => vi.fn());
vi.mock("../../cotizaciones/emision.tsx", () => ({ guardarArchivo }));

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true as const, datos });
const montar = (ui: ReactNode) => render(<ProveedorRuta>{ui}</ProveedorRuta>);

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: "f7e6f22e-0530-4000-8000-000000000061",
  codigo: "CLI-00047",
  nombre: "[DEMO] Raul Herrera",
  contactoNombre: "Raul Herrera",
  contactoTelefono: null,
  contactoCorreo: null,
  activo: true,
  revision: 1,
  creadoEn: "2026-10-31T17:00:00.000Z",
  modificadoEn: "2026-10-31T17:00:00.000Z",
  modificadoPor: "[DEMO] Preparador 1",
  clasificacion: null,
  clasificacionMotivo: null,
  ...over,
});

beforeEach(() => {
  guardarArchivo.mockReset();
  window.location.hash = "#/clientes";
});

describe("clasificar un cliente en su ficha", () => {
  it("sin clasificar: lo dice, no asume nada por [DEMO] y no deja guardar sin cambio ni motivo", async () => {
    const s = { clasificarCliente: vi.fn() } as unknown as ServiciosCotizaciones;
    montar(<ClasificarCliente servicios={s} cliente={cliente()} alCambiar={() => {}} />);
    expect(screen.getByText(/No se asume nada por llevar \[DEMO\]/)).toBeTruthy();
    const guardar = screen.getByRole("button", { name: "Guardar clasificación" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "HUMO");
    expect(guardar.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Motivo/), "ab");
    expect(guardar.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Motivo/), "c");
    expect(guardar.disabled).toBe(false);
  });

  it("guarda con categoría y motivo, avisa y pide recargar; retirar envía null", async () => {
    const clasificarCliente = vi.fn(() => ok(cliente({ clasificacion: "HUMO", clasificacionMotivo: "Resto de humo" })));
    const alCambiar = vi.fn();
    montar(<ClasificarCliente servicios={{ clasificarCliente } as unknown as ServiciosCotizaciones} cliente={cliente()} alCambiar={alCambiar} />);
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "HUMO");
    await userEvent.type(screen.getByLabelText(/Motivo/), "Resto de humo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar clasificación" }));
    await waitFor(() => expect(clasificarCliente).toHaveBeenCalledWith("f7e6f22e-0530-4000-8000-000000000061", "HUMO", "Resto de humo"));
    await waitFor(() => expect(alCambiar).toHaveBeenCalledWith("Clasificado como Humo."));
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it("clasificado: muestra la etiqueta y el motivo, y retirar la clasificación envía categoría nula", async () => {
    const clasificarCliente = vi.fn(() => ok(cliente()));
    montar(<ClasificarCliente servicios={{ clasificarCliente } as unknown as ServiciosCotizaciones} cliente={cliente({ clasificacion: "QA", clasificacionMotivo: "Cuenta de automatización" })} alCambiar={() => {}} />);
    expect(document.querySelector(".insignia")?.textContent).toBe("QA");
    expect(screen.getByText(/Motivo: Cuenta de automatización/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "NINGUNA");
    await userEvent.type(screen.getByLabelText(/Motivo/), "Se decidió no clasificar");
    await userEvent.click(screen.getByRole("button", { name: "Guardar clasificación" }));
    await waitFor(() => expect(clasificarCliente).toHaveBeenCalledWith(expect.any(String), null, "Se decidió no clasificar"));
  });

  it("si la API rechaza, lo dice y conserva lo escrito", async () => {
    const clasificarCliente = vi.fn(() => Promise.resolve({ ok: false as const, fallo: { tipo: "sin_permiso", mensaje: "Sin permiso" } as never }));
    montar(<ClasificarCliente servicios={{ clasificarCliente } as unknown as ServiciosCotizaciones} cliente={cliente()} alCambiar={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "PRESENTACION");
    await userEvent.type(screen.getByLabelText(/Motivo/), "Cliente de la presentación");
    await userEvent.click(screen.getByRole("button", { name: "Guardar clasificación" }));
    expect(await screen.findByText("No se guardó")).toBeTruthy();
    expect((screen.getByLabelText(/Motivo/) as HTMLInputElement).value).toBe("Cliente de la presentación");
  });
});

describe("lista de clientes con clasificación", () => {
  it("muestra todos con su etiqueta por omisión y filtra solo cuando se elige", async () => {
    const listarClientes = vi.fn((f: { clasificacion?: string }) => ok({ limite: 50, clientes: f.clasificacion === "HUMO" ? [cliente({ id: "f7e6f22e-0530-4000-8000-000000000062", codigo: "CLI-00001", nombre: "[DEMO] Cliente humo", clasificacion: "HUMO" })] : [cliente({ clasificacion: "PRESENTACION" }), cliente({ id: "f7e6f22e-0530-4000-8000-000000000063", codigo: "CLI-00009", nombre: "Sin etiqueta" })] }));
    montar(<ListaClientes servicios={{ listarClientes } as unknown as ServiciosCotizaciones} puedeGestionar={false} />);
    expect(await screen.findByText("[DEMO] Raul Herrera")).toBeTruthy();
    expect(screen.getByText("Sin etiqueta")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Presentación")).toBeTruthy();
    expect(listarClientes).toHaveBeenLastCalledWith({ buscar: "", incluirInactivos: false }, expect.anything());
    await userEvent.selectOptions(screen.getByLabelText("Clasificación"), "HUMO");
    expect(await screen.findByText("[DEMO] Cliente humo")).toBeTruthy();
    expect(screen.queryByText("[DEMO] Raul Herrera")).toBeNull();
    expect(listarClientes).toHaveBeenLastCalledWith({ buscar: "", incluirInactivos: false, clasificacion: "HUMO" }, expect.anything());
    await userEvent.selectOptions(screen.getByLabelText("Clasificación"), "");
    expect(await screen.findByText("[DEMO] Raul Herrera")).toBeTruthy();
  });
});

const CONTADORES: Contadores = {
  fecha: "2026-10-31",
  borradores: 4,
  enRevision: 2,
  aprobadasPorEmitir: 1,
  emitidasVigentes: 7,
  vencidas: 3,
  preciosPorVencer: 5,
  ultimoFolio: "COT-2026-00056",
  avisos: [{ codigo: "INI-02", mensaje: "3 cotización(es) emitida(s) ya vencieron su vigencia." }],
  reglas: ["Cada cotización con folio activo cuenta una sola vez."],
};

describe("contadores de inicio", () => {
  it("muestra los seis contadores, el último folio, los avisos y las reglas", async () => {
    montar(<ContadoresInicio servicios={{ contadoresInicio: () => ok(CONTADORES) } as unknown as ServiciosCotizaciones} />);
    expect(await screen.findByText("Estado de las cotizaciones")).toBeTruthy();
    const valor = (c: string) => document.querySelector(`[data-contador="${c}"]`)?.textContent;
    expect([valor("borradores"), valor("revision"), valor("aprobadas"), valor("vigentes"), valor("vencidas"), valor("precios")]).toEqual(["4", "2", "1", "7", "3", "5"]);
    expect(screen.getByText("COT-2026-00056")).toBeTruthy();
    expect(screen.getByText(/ya vencieron su vigencia/)).toBeTruthy();
    expect(screen.getByText("Cómo se cuenta")).toBeTruthy();
    expect(screen.getByText(/cuenta una sola vez/)).toBeTruthy();
  });

  it("sin último folio muestra una raya y un fallo se puede reintentar", async () => {
    let n = 0;
    const contadoresInicio = vi.fn(() => (n++ === 0 ? Promise.resolve({ ok: false as const, fallo: { tipo: "red", mensaje: "Sin conexión" } as never }) : ok({ ...CONTADORES, ultimoFolio: null, avisos: [] })));
    montar(<ContadoresInicio servicios={{ contadoresInicio } as unknown as ServiciosCotizaciones} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Estado de las cotizaciones")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("exportaciones CSV", () => {
  const servicios = (over: Partial<ServiciosAdministracion> = {}) =>
    ({
      exportaciones: () => ok({ tablas: [{ tabla: "clientes", descripcion: "Clientes con su clasificación", columnas: ["codigo", "nombre", "clasificacion"] }] }),
      descargarExportacion: vi.fn(() => ok(new Blob(["codigo\r\n"], { type: "text/csv" }))),
      ...over,
    }) as unknown as ServiciosAdministracion;

  it("lista solo lo que la API ofrece y descarga el CSV con su nombre", async () => {
    const s = servicios();
    montar(<PantallaExportaciones servicios={s} />);
    expect(await screen.findByRole("region", { name: "Exportar clientes" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Exportar personas" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Descargar clientes.csv" }));
    await waitFor(() => expect(guardarArchivo).toHaveBeenCalledWith(expect.any(Blob), "softarq-clientes.csv"));
    expect(s.descargarExportacion).toHaveBeenCalledWith("clientes");
    expect(await screen.findByText("Se descargó softarq-clientes.csv")).toBeTruthy();
    expect(screen.getByText(/Contraseñas, hashes, sesiones, tokens/)).toBeTruthy();
  });

  it("una función sin tablas lo dice, y un fallo de descarga se explica sin guardar nada", async () => {
    montar(<PantallaExportaciones servicios={servicios({ exportaciones: () => ok({ tablas: [] }) })} />);
    expect(await screen.findByText("Su función no exporta tablas.")).toBeTruthy();
  });

  it("si la descarga falla no se guarda ningún archivo", async () => {
    const s = servicios({ descargarExportacion: vi.fn(() => Promise.resolve({ ok: false as const, fallo: { tipo: "sin_permiso", mensaje: "Sin permiso" } as never })) as never });
    montar(<PantallaExportaciones servicios={s} />);
    await userEvent.click(await screen.findByRole("button", { name: "Descargar clientes.csv" }));
    expect(await screen.findByText("No se pudo descargar")).toBeTruthy();
    expect(guardarArchivo).not.toHaveBeenCalled();
  });
});
