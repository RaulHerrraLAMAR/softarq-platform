// @vitest-environment jsdom
/**
 * Solicitudes de clientes en el panel (módulo 17, E3): bandeja por estado, detalle con la estimación rotulada como
 * preliminar, «Atender» idempotente que lleva a la cotización, permisos y «Mi trabajo» por función.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULO_ESTIMACION, type Capacidad, type DetalleSolicitudEquipo, type RespuestaSolicitudesEquipo } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import type { ServiciosCotizaciones } from "../../api/servicios-cotizaciones.ts";
import { MiTrabajo } from "../../inicio/MiTrabajo.tsx";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { BandejaSolicitudes, DetalleSolicitud } from "../PantallasSolicitudes.tsx";
import type { ServiciosSolicitudes } from "../servicios.ts";

const ID = "f7e6f22e-0530-4000-8000-000000000031";
const COT = "f7e6f22e-0530-4000-8000-000000000099";
const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true as const, datos });
const montar = (ui: ReactNode) => render(<ProveedorRuta>{ui}</ProveedorRuta>);

const resumen = (over: Partial<RespuestaSolicitudesEquipo["solicitudes"][number]> = {}): RespuestaSolicitudesEquipo["solicitudes"][number] => ({
  id: ID,
  folio: "SOL-2026-00003",
  estado: "ENVIADA",
  cliente: "[DEMO] Raul Herrera",
  proyecto: "Casa",
  trabajos: ["Losa"],
  enviadaEn: "2026-10-31T18:26:27.962Z",
  totalEstimado: "37835.35",
  cotizacionId: null,
  ...over,
});

const detalle = (over: Partial<DetalleSolicitudEquipo> = {}): DetalleSolicitudEquipo => ({
  ...resumen(),
  revision: 4,
  captura: { notas: "Acceso por el portón norte", trabajos: [{ id: "t1", trabajoCodigo: "LOSA", opcionCodigo: "CONCRETO", huecos: [], secciones: [{ nombre: "", piezas: "1", largo: "6", ancho: "5", alto: "0.12" }] }] },
  ultimaEstimacion: {
    id: "f7e6f22e-0530-4000-8000-000000000041",
    numero: 1,
    estado: "ESTIMADA",
    rotulo: ROTULO_ESTIMACION,
    calculadaEn: "2026-10-31T18:25:00.000Z",
    fechaCalculo: "2026-10-31",
    revisionCaptura: 4,
    desactualizada: false,
    comercial: { ambiente: "DEMO", moneda: "MXN", leyenda: "DEMO", partidas: [], subtotal: "32616.68", impuesto: { nombre: "IVA", tasa: "0.16", importe: "5218.67" }, total: "37835.35" },
    motivo: null,
    avisos: [],
  },
  folioCotizacion: null,
  ...over,
});

function servicios(over: Partial<ServiciosSolicitudes> = {}): ServiciosSolicitudes {
  const no = () => Promise.reject(new Error("no se esperaba esta llamada"));
  return {
    listar: vi.fn(() => ok({ solicitudes: [resumen()] })),
    detalle: vi.fn(() => ok(detalle())),
    atender: vi.fn(() => ok({ cotizacionId: COT, folio: "COT-2026-00056", repetida: false })),
    acceso: no,
    crearAcceso: no,
    cambiarEstadoAcceso: no,
    restablecerAcceso: no,
    referencias: vi.fn(() => ok({ referencias: [], pendientes: [{ insumoCodigo: "INS-00009", insumo: "Cemento" }] })),
    designarReferencia: no,
    retirarReferencia: no,
    ...over,
  } as ServiciosSolicitudes;
}

beforeEach(() => {
  window.location.hash = "#/solicitudes";
});

describe("bandeja de solicitudes", () => {
  it("muestra por defecto lo por atender, con la estimación del cliente marcada como preliminar", async () => {
    const s = servicios();
    montar(<BandejaSolicitudes servicios={s} />);
    expect(await screen.findByText("SOL-2026-00003")).toBeTruthy();
    expect(s.listar).toHaveBeenCalledWith(["ENVIADA"], expect.anything(), undefined); // sin filtro de clasificación por omisión
    expect(screen.getByText("$37,835.35")).toBeTruthy();
    expect(screen.getByText("preliminar")).toBeTruthy();
    expect(screen.getByRole("link", { name: "SOL-2026-00003" }).getAttribute("href")).toBe(`#/solicitudes/${ID}`);
  });

  it("cambiar de filtro pide ese estado; vacío lo dice sin tabla", async () => {
    const s = servicios({ listar: vi.fn((e) => ok({ solicitudes: e[0] === "COTIZADA" ? [] : [resumen()] })) });
    montar(<BandejaSolicitudes servicios={s} />);
    await screen.findByText("SOL-2026-00003");
    await userEvent.click(screen.getByRole("button", { name: "Cotizadas" }));
    expect(await screen.findByText("No hay solicitudes en este estado.")).toBeTruthy();
    expect(s.listar).toHaveBeenLastCalledWith(["COTIZADA"], expect.anything(), undefined);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("una solicitud sin estimación no muestra un cero", async () => {
    montar(<BandejaSolicitudes servicios={servicios({ listar: () => ok({ solicitudes: [resumen({ totalEstimado: null })] }) })} />);
    await screen.findByText("SOL-2026-00003");
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });
});

describe("detalle y atención", () => {
  it("muestra lo capturado, el rótulo de estimación preliminar y avisa que no se hereda", async () => {
    montar(<DetalleSolicitud servicios={servicios()} id={ID} puedeAtender />);
    expect(await screen.findByText(/Losa/)).toBeTruthy();
    expect(screen.getByText(/largo 6 m · ancho 5 m · alto\/espesor 0\.12 m/)).toBeTruthy();
    expect(screen.getByText(/Acceso por el portón norte/)).toBeTruthy();
    expect(screen.getByText(ROTULO_ESTIMACION)).toBeTruthy();
    expect(screen.getByText(/no se copia/)).toBeTruthy();
  });

  it("atender envía la revisión vista, con una clave, y lleva a la cotización creada", async () => {
    const s = servicios();
    montar(<DetalleSolicitud servicios={s} id={ID} puedeAtender />);
    await userEvent.click(await screen.findByRole("button", { name: "Atender y preparar la cotización" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/cotizaciones/${COT}`));
    expect(s.atender).toHaveBeenCalledTimes(1);
    const [id, revision, clave] = (s.atender as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect([id, revision]).toEqual([ID, 4]);
    expect(typeof clave).toBe("string");
  });

  it("si atender falla, lo dice y un reintento reutiliza la misma clave (no duplica)", async () => {
    let n = 0;
    const s = servicios({
      atender: vi.fn(() => (n++ === 0 ? Promise.resolve({ ok: false as const, fallo: { tipo: "red", mensaje: "Sin conexión" } as never }) : ok({ cotizacionId: COT, folio: "COT-2026-00056", repetida: false }))),
    });
    montar(<DetalleSolicitud servicios={s} id={ID} puedeAtender />);
    await userEvent.click(await screen.findByRole("button", { name: "Atender y preparar la cotización" }));
    expect(await screen.findByText("No se pudo atender la solicitud")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Atender y preparar la cotización" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/cotizaciones/${COT}`));
    const claves = (s.atender as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[2]);
    expect(claves).toHaveLength(2);
    expect(claves[0]).toBe(claves[1]);
  });

  it("sin la capacidad de atender no hay botón; una solicitud ya cotizada enlaza a su cotización", async () => {
    montar(<DetalleSolicitud servicios={servicios()} id={ID} puedeAtender={false} />);
    await screen.findByText(ROTULO_ESTIMACION);
    expect(screen.queryByRole("button", { name: /Atender/ })).toBeNull();
    expect(screen.getByText(/solo el Preparador/)).toBeTruthy();
  });

  it("cotizada: sin botón y con el enlace a la cotización emitida", async () => {
    const s = servicios({ detalle: () => ok(detalle({ estado: "COTIZADA", cotizacionId: COT, folioCotizacion: "COT-2026-00056" })) });
    montar(<DetalleSolicitud servicios={s} id={ID} puedeAtender />);
    expect(await screen.findByRole("link", { name: "COT-2026-00056" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Atender/ })).toBeNull();
    expect(screen.getByText(/el cliente ya la ve en su app/)).toBeTruthy();
  });

  it("una estimación sin importe dice por qué y no inventa un total", async () => {
    const e = detalle().ultimaEstimacion!;
    const s = servicios({ detalle: () => ok(detalle({ ultimaEstimacion: { ...e, estado: "SIN_ESTIMACION", comercial: null, motivo: { codigo: "FALTA_REFERENCIA", mensaje: "Falta un precio de referencia." } } })) });
    montar(<DetalleSolicitud servicios={s} id={ID} puedeAtender />);
    expect(await screen.findByText(/Sin importe: Falta un precio de referencia\./)).toBeTruthy();
    expect(screen.queryByText(/Total mostrado al cliente/)).toBeNull();
  });
});

describe("«Mi trabajo» por función", () => {
  const cotizaciones = { listarRevisiones: vi.fn(() => ok({ revisiones: [{}, {}] })) } as unknown as ServiciosCotizaciones;
  const caps = (...c: Capacidad[]) => c;

  it("el Preparador ve sus solicitudes por atender y sus cotizaciones, no el catálogo ni las revisiones", async () => {
    montar(<MiTrabajo nombre="[DEMO] Preparador 1" capacidades={caps("solicitudes.atender", "cotizaciones.preparar")} solicitudes={servicios()} cotizaciones={cotizaciones} />);
    expect(await screen.findByRole("region", { name: "Solicitudes por atender" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("region", { name: "Solicitudes por atender" }).textContent).toContain("1"));
    expect(screen.getByRole("region", { name: "Mis cotizaciones" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Revisiones pendientes" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Insumos sin precio de referencia" })).toBeNull();
  });

  it("el Revisor ve sus revisiones pendientes con su número", async () => {
    montar(<MiTrabajo nombre="[DEMO] Revisor 1" capacidades={caps("revisiones.decidir")} solicitudes={servicios()} cotizaciones={cotizaciones} />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Revisiones pendientes" }).textContent).toContain("2"));
    expect(screen.queryByRole("region", { name: "Solicitudes por atender" })).toBeNull();
  });

  it("el Administrador del catálogo ve los insumos sin referencia; sin bandejas propias lo dice", async () => {
    montar(<MiTrabajo nombre="Admin" capacidades={caps("catalogos.administrar")} solicitudes={servicios()} cotizaciones={cotizaciones} />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Insumos sin precio de referencia" }).textContent).toContain("1"));
    montar(<MiTrabajo nombre="Nadie" capacidades={caps("sesion.propia")} solicitudes={servicios()} cotizaciones={cotizaciones} />);
    expect(await screen.findByText(/no tiene bandejas propias/)).toBeTruthy();
  });
});
