// @vitest-environment jsdom
/**
 * Módulo 15 (ADR-0019) en la web: duplicar (B-35), preparar la versión nueva con modo de precios
 * (B-34) y vista previa PDF BORRADOR (B-25). La API decide; aquí se comprueba lo que la pantalla
 * explica, envía y protege (origen explícito, doble clic, divergencia y errores).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetalleCotizacion } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { AvisoCicloPreparado, PanelDuplicar, PanelNuevaVersion, VistaPreviaPdf } from "../duplicar-modo-vista-previa.tsx";

const ID = "f7e6f22e-0530-4000-8000-000000000015";
const NUEVA = "f7e6f22e-0530-4000-8000-000000000016";
const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true as const, datos });
const montar = (ui: ReactNode) => render(<ProveedorRuta>{ui}</ProveedorRuta>);
const PROYECTO = { id: "p1", codigo: "PRY-00001", nombre: "[DEMO] Obra", activo: true, clienteActivo: true };

function detalle(over: Partial<DetalleCotizacion> = {}): DetalleCotizacion {
  return {
    cotizacion: {
      id: ID,
      folio: "COT-2026-00015",
      origen: "WEB_DEMO",
      estadoFolio: "ACTIVO",
      descarte: null,
      cliente: { id: "c1", codigo: "CLI-00001", nombre: "[DEMO] Cliente", activo: true },
      proyecto: { id: "p1", codigo: "PRY-00001", nombre: "[DEMO] Obra", activo: true },
      creadoEn: "2026-10-03T15:00:00.000Z",
      creadoPor: "[DEMO] Preparador 1",
      revisionBorrador: 4,
      borradorActualizadoEn: "2026-10-03T15:05:00.000Z",
      ultimaVersion: null,
    },
    borrador: {
      revision: 4,
      captura: { consolidarCompras: true, partidas: [], seleccion: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-000007" }] },
      actualizadoPor: "[DEMO] Preparador 1",
      actualizadoEn: "2026-10-03T15:05:00.000Z",
      completitud: { lista: true, pendientes: [] },
      referencias: { conceptos: [], selecciones: [], tiposAdicional: [] },
      textosPredeterminados: null,
    },
    versiones: [],
    descartar: { permitido: true, motivoNoPermitido: null },
    revisiones: [],
    eventos: [],
    duplicadaDe: null,
    nuevaVersion: { requerida: true, versionOrigen: 2, preparada: null },
    ...over,
  } as DetalleCotizacion;
}

afterEach(() => {
  window.location.hash = "";
});

describe("duplicar (B-35)", () => {
  it("explica qué se copia, avisa de cambios sin guardar y duplica el origen exacto con el mismo proyecto; un solo envío ante doble clic", async () => {
    let soltar: (r: ResultadoApi<DetalleCotizacion>) => void = () => {};
    const duplicarCotizacion = vi.fn(() => new Promise<ResultadoApi<DetalleCotizacion>>((r) => (soltar = r)));
    const servicios = { duplicarCotizacion, listarProyectos: vi.fn() };
    montar(
      <PanelDuplicar
        cotizaciones={servicios}
        cotizacionId={ID}
        origen={{ tipo: "BORRADOR", revision: 4 }}
        descripcionOrigen="el borrador guardado (revisión 4)"
        proyecto={PROYECTO}
        cambiosSinGuardar
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Duplicar el borrador guardado…" }));
    expect(screen.getByText(/Duplicar el borrador guardado \(revisión 4\) en una cotización nueva/)).toBeTruthy();
    expect(screen.getByText(/los precios elegidos \(se eligen de nuevo\)/)).toBeTruthy();
    expect(screen.getByText("Hay cambios sin guardar")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /El mismo proyecto/ }) as HTMLInputElement).checked).toBe(true);
    const boton = screen.getByRole("button", { name: "Confirmar duplicado" });
    await userEvent.dblClick(boton);
    expect(duplicarCotizacion).toHaveBeenCalledTimes(1);
    expect(duplicarCotizacion).toHaveBeenCalledWith(ID, { origen: { tipo: "BORRADOR", revision: 4 }, proyectoId: "p1" }, expect.any(String));
    soltar({ ok: true, datos: detalle({ cotizacion: { ...detalle().cotizacion, id: NUEVA } }) });
    await waitFor(() => expect(window.location.hash).toBe(`#/cotizaciones/${NUEVA}`));
  });

  it("proyecto inactivo: exige elegir otro proyecto activo antes de confirmar", async () => {
    const duplicarCotizacion = vi.fn(() => ok(detalle()));
    const listarProyectos = vi.fn(() =>
      ok({
        limite: 20,
        proyectos: [
          { id: "p2", codigo: "PRY-00002", nombre: "[DEMO] Obra activa", activo: true, cliente: { id: "c1", codigo: "CLI-00001", nombre: "[DEMO] Cliente", activo: true } },
          { id: "p3", codigo: "PRY-00003", nombre: "[DEMO] Obra inactiva", activo: false, cliente: { id: "c1", codigo: "CLI-00001", nombre: "[DEMO] Cliente", activo: true } },
        ],
      } as never),
    );
    montar(
      <PanelDuplicar
        cotizaciones={{ duplicarCotizacion, listarProyectos }}
        cotizacionId={ID}
        origen={{ tipo: "VERSION", numero: 2 }}
        descripcionOrigen="la versión COT-2026-00015-v2"
        proyecto={{ ...PROYECTO, activo: false }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Duplicar esta versión…" }));
    expect(screen.getByText(/está inactivo: elija otro proyecto activo/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirmar duplicado" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText("[DEMO] Obra activa")).toBeTruthy();
    expect(screen.queryByText("[DEMO] Obra inactiva")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Obra activa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar duplicado" }));
    expect(duplicarCotizacion).toHaveBeenCalledWith(ID, { origen: { tipo: "VERSION", numero: 2 }, proyectoId: "p2" }, expect.any(String));
  });
});

describe("preparar la versión nueva (B-34)", () => {
  it("exige modo y motivo; explica cada modo; nunca elige un precio por su cuenta", async () => {
    const prepararNuevaVersion = vi.fn(() => ok(detalle()));
    const alPreparada = vi.fn();
    montar(<PanelNuevaVersion cotizaciones={{ prepararNuevaVersion }} detalle={detalle()} alPreparada={alPreparada} />);
    expect(screen.getByText(/COT-2026-00015-v2/)).toBeTruthy();
    expect(screen.getByText(/No se elige ninguno automáticamente/)).toBeTruthy();
    expect(screen.getByText(/el total puede cambiar/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Preparar la versión nueva" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Elija el modo de precios/);
    await userEvent.click(screen.getByRole("radio", { name: /Elegir los precios de nuevo/ }));
    // Al corregir, el aviso anterior desaparece.
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.type(screen.getByLabelText(/Motivo de la versión nueva/), "corto");
    await userEvent.click(screen.getByRole("button", { name: "Preparar la versión nueva" }));
    expect(screen.getByRole("alert").textContent).toMatch(/al menos 10 caracteres/);
    await userEvent.type(screen.getByLabelText(/Motivo de la versión nueva/), " por cambio del cliente");
    await userEvent.click(screen.getByRole("button", { name: "Preparar la versión nueva" }));
    expect(prepararNuevaVersion).toHaveBeenCalledWith(
      ID,
      { versionOrigen: 2, modo: "ELEGIR_DE_NUEVO", motivo: "corto por cambio del cliente", revisionBorrador: 4 },
      expect.any(String),
    );
    await waitFor(() => expect(alPreparada).toHaveBeenCalled());
  });

  it("borrador divergente: muestra las diferencias y solo reemplaza con la confirmación explícita", async () => {
    const prepararNuevaVersion = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        fallo: {
          tipo: "nueva_version",
          codigo: "SELECCIONES_DIVERGENTES",
          mensaje: "x",
          selecciones: { actuales: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-000006" }], propuestas: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-000007" }] },
        },
      })
      .mockResolvedValueOnce({ ok: true, datos: detalle() });
    const alPreparada = vi.fn();
    montar(<PanelNuevaVersion cotizaciones={{ prepararNuevaVersion }} detalle={detalle()} alPreparada={alPreparada} />);
    await userEvent.click(screen.getByRole("radio", { name: /Conservar los precios/ }));
    await userEvent.type(screen.getByLabelText(/Motivo de la versión nueva/), "Actualización pedida por el cliente.");
    await userEvent.click(screen.getByRole("button", { name: "Preparar la versión nueva" }));
    expect(await screen.findByText(/precios elegidos distintos/)).toBeTruthy();
    expect(screen.getByText("PRE-000006")).toBeTruthy();
    expect(screen.getByText("PRE-000007")).toBeTruthy();
    expect(alPreparada).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reemplazar los precios del borrador" }));
    expect(prepararNuevaVersion).toHaveBeenLastCalledWith(ID, expect.objectContaining({ reemplazarSeleccionesDelBorrador: true, modo: "CONSERVAR" }), expect.any(String));
    await waitFor(() => expect(alPreparada).toHaveBeenCalled());
  });

  it("ciclo preparado: muestra modo, motivo y lo que requiere intervención", () => {
    const d = detalle({
      nuevaVersion: { requerida: false, versionOrigen: 2, preparada: { modo: "CONSERVAR", motivo: "Cambio del cliente.", por: "[DEMO] Preparador 1", en: "2026-10-04T10:00:00.000Z" } },
      borrador: {
        ...detalle().borrador,
        referencias: { conceptos: [], tiposAdicional: [], selecciones: [{ insumoCodigo: "INS-00004", precioCodigo: "PRE-000007", disponible: false, motivo: "el precio está anulado" }] },
      },
    } as Partial<DetalleCotizacion>);
    render(<AvisoCicloPreparado detalle={d} />);
    expect(screen.getByText(/Versión nueva preparada desde COT-2026-00015-v2/)).toBeTruthy();
    expect(screen.getByText(/Requieren intervención: PRE-000007 \(el precio está anulado\)/)).toBeTruthy();
  });
});

describe("vista previa PDF BORRADOR (B-25)", () => {
  it("explica qué representa, descarga el BORRADOR y evita el doble clic", async () => {
    const crear = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: vi.fn() });
    let soltar: (r: ResultadoApi<Blob>) => void = () => {};
    const vistaPrevia = vi.fn(() => new Promise<ResultadoApi<Blob>>((r) => (soltar = r)));
    render(<VistaPreviaPdf cotizaciones={{ vistaPrevia }} cotizacionId={ID} numero={2} idVersion="COT-2026-00015-v2" fechaCalculo="2026-09-25" />);
    expect(screen.getByText(/Representa COT-2026-00015-v2, calculada el 25\/09\/2026, con los datos actuales/)).toBeTruthy();
    expect(screen.getByText(/No es un documento emitido/)).toBeTruthy();
    await userEvent.dblClick(screen.getByRole("button", { name: "Descargar BORRADOR (PDF)" }));
    expect(vistaPrevia).toHaveBeenCalledTimes(1);
    soltar({ ok: true, datos: new Blob(["%PDF-"], { type: "application/pdf" }) });
    expect(await screen.findByText(/Vista previa generada/)).toBeTruthy();
    expect(crear).toHaveBeenCalled();
  });

  it("bloqueo del servidor (BL-16): se explica sin generar nada", async () => {
    const vistaPrevia = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        fallo: { tipo: "bloqueado" as const, codigo: "VISTA_PREVIA_BLOQUEADA", mensaje: "No se generó la vista previa.", problemas: [{ codigo: "BL-16", referencia: "x", mensaje: "El borrador guardado cambió." }] },
      }),
    );
    render(<VistaPreviaPdf cotizaciones={{ vistaPrevia }} cotizacionId={ID} numero={2} idVersion="COT-2026-00015-v2" fechaCalculo="2026-09-25" />);
    await userEvent.click(screen.getByRole("button", { name: "Descargar BORRADOR (PDF)" }));
    expect(await screen.findByText("No se generó la vista previa")).toBeTruthy();
    expect(screen.getByText(/El borrador guardado cambió/)).toBeTruthy();
  });

  it("respuesta que llega después de cerrar la pantalla: se descarta", async () => {
    let soltar: (r: ResultadoApi<Blob>) => void = () => {};
    const crear = vi.fn(() => "blob:y");
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: vi.fn() });
    const vistaPrevia = vi.fn(() => new Promise<ResultadoApi<Blob>>((r) => (soltar = r)));
    const { unmount } = render(<VistaPreviaPdf cotizaciones={{ vistaPrevia }} cotizacionId={ID} numero={2} idVersion="COT-2026-00015-v2" fechaCalculo="2026-09-25" />);
    await userEvent.click(screen.getByRole("button", { name: "Descargar BORRADOR (PDF)" }));
    unmount();
    soltar({ ok: true, datos: new Blob(["%PDF-"]) });
    await new Promise((r) => setTimeout(r, 0));
    expect(crear).not.toHaveBeenCalled();
  });
});
