// @vitest-environment jsdom
/**
 * Excepciones B-22 en la web (módulo 10, ADR-0014): estado del borrador, registro por el
 * Preparador (sin preselección, motivo obligatorio, confirmación) y decisión del Revisor.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CapturaBorrador, ExcepcionesVersion } from "@softarq/contracts";
import { huellaBorrador, serializarBorrador } from "../../captura/borrador.ts";
import { armarSolicitud } from "../../captura/solicitud.ts";
import { ESTADO_INICIAL, reducir, type Captura } from "../../captura/estado.ts";
import { CON_AREA, CON_VOLUMEN } from "../../pruebas/datos.ts";
import { PanelExcepcionesVersion } from "../PanelExcepcionesVersion.tsx";
import { SeccionExcepciones } from "../SeccionExcepciones.tsx";

const ID = "f7e6f22e-0530-4000-8000-000000000001";
const ok = <T,>(datos: T) => Promise.resolve({ ok: true as const, datos });
const MOTIVO = "Formato de lámina verificado en obra.";

const guardado: CapturaBorrador = {
  consolidarCompras: true,
  partidas: [
    { tipo: "CONCEPTO", conceptoCodigo: "CON-00007", descripcion: "", mediciones: [{ descripcion: "Faldón", signo: "+", piezas: "1", largo: "10", ancho: "4", alto: null, segundaMedida: "ancho" }] },
    { tipo: "CONCEPTO", conceptoCodigo: "CON-00008", descripcion: "", mediciones: [{ descripcion: "Losa", signo: "+", piezas: "1", largo: "2", ancho: "1", alto: "0.1", segundaMedida: "ancho" }] },
  ],
  seleccion: [
    { insumoCodigo: "INS-00004", precioCodigo: "PRE-000007" },
    { insumoCodigo: "INS-00007", precioCodigo: "PRE-000011" },
  ],
  excepciones: [
    { tipo: "RENDIMIENTO", partida: 2, conceptoCodigo: "CON-00008", componenteCodigo: "CMP-00008", campo: "DESPERDICIO", valorAplicado: "0.08", motivo: MOTIVO },
    { tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00004", precioCodigo: "PRE-000007", motivo: MOTIVO },
  ],
};

const cargar = (b: CapturaBorrador = guardado): Captura =>
  reducir(ESTADO_INICIAL, { tipo: "CARGAR_BORRADOR", folio: "COT-2026-00001", borrador: b, conceptos: [CON_AREA, CON_VOLUMEN] }).captura!;

describe("estado del borrador", () => {
  it("ida y vuelta: la partida citada por número se conserva, también en la solicitud de la vista previa", () => {
    const c = cargar();
    const s = serializarBorrador(c);
    expect(s.ok && s.borrador.excepciones).toEqual(guardado.excepciones);
    expect(armarSolicitud(c).excepciones).toEqual([
      { tipo: "RENDIMIENTO", id: "EXC-1", partidaId: "P002", componenteCodigo: "CMP-00008", campo: "DESPERDICIO", valorAplicado: "0.08" },
    ]);
  });

  it("quitar la partida 1 renumera la excepción de la partida 2 y quitar la partida citada la quita (como Partida_Quitar)", () => {
    let e = { captura: cargar() };
    e = reducir(e, { tipo: "QUITAR_PARTIDA", clave: e.captura.partidas[0]!.clave }) as { captura: Captura };
    let s = serializarBorrador(e.captura);
    // La selección de la partida quitada se conserva (corrección del módulo 6), y con ella su excepción de precio.
    expect(s.ok && s.borrador.excepciones?.map((x) => (x.tipo === "RENDIMIENTO" ? x.partida : x.tipo))).toEqual([1, "PRECIO_VENCIDO"]);
    e = reducir(e, { tipo: "QUITAR_PARTIDA", clave: e.captura.partidas[0]!.clave }) as { captura: Captura };
    s = serializarBorrador(e.captura);
    // La excepción de precio cita INS-00004, cuya selección se conserva: sigue.
    expect(s.ok && s.borrador.excepciones?.map((x) => x.tipo)).toEqual(["PRECIO_VENCIDO"]);
  });

  it("elegir otro precio quita la excepción del precio anterior; sin excepciones el campo no viaja", () => {
    const sinRendimiento = { ...guardado, excepciones: [guardado.excepciones![1]!] };
    const e = reducir({ captura: cargar(sinRendimiento) }, { tipo: "ELEGIR_OPCION", insumo: "INS-00004", precio: "PRE-000006" });
    const s = serializarBorrador(e.captura!);
    expect(s.ok && "excepciones" in s.borrador).toBe(false);
  });

  it("agregar y quitar cambian la huella (cambios sin guardar)", () => {
    const c = cargar({ ...guardado, excepciones: [] });
    const conUna = reducir({ captura: c }, {
      tipo: "AGREGAR_EXCEPCION",
      excepcion: { tipo: "PRECIO_VENCIDO", insumoCodigo: "INS-00007", precioCodigo: "PRE-000011", motivo: MOTIVO },
    }).captura!;
    expect(huellaBorrador(conUna)).not.toBe(huellaBorrador(c));
    const sinNinguna = reducir({ captura: conUna }, { tipo: "QUITAR_EXCEPCION", clave: conUna.excepciones[0]!.clave }).captura!;
    expect(huellaBorrador(sinNinguna)).toBe(huellaBorrador(c));
  });
});

function Seccion({ inicial, componentes }: { inicial: Captura; componentes: ReturnType<typeof vi.fn> }) {
  const [estado, despachar] = useReducer(reducir, { captura: inicial });
  return (
    <>
      <SeccionExcepciones captura={estado.captura!} despachar={despachar} servicios={{ componentesExcepcion: componentes as never }} />
      <output data-testid="borrador">{JSON.stringify(serializarBorrador(estado.captura!))}</output>
    </>
  );
}

const componentesOk = () =>
  vi.fn(() =>
    ok({
      conceptos: [
        {
          codigo: "CON-00007",
          clase: "ESTANDAR",
          componentes: [{ codigo: "CMP-00005", insumoCodigo: "INS-00004", insumoDescripcion: "[DEMO] Lámina", unidad: "m2", rendimiento: "1", desperdicio: "0.05" }],
        },
      ],
    }),
  );

describe("registro por el Preparador", () => {
  it("sin tipo preseleccionado; sin tipo ni motivo no se agrega y el resumen de errores recibe el foco", async () => {
    const u = userEvent.setup();
    render(<Seccion inicial={cargar({ ...guardado, excepciones: [] })} componentes={componentesOk()} />);
    expect(screen.getByText("Este borrador no tiene excepciones.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Registrar excepción…" }));
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLInputElement).checked).toBe(false);
    await u.click(screen.getByRole("button", { name: "Revisar excepción" }));
    const resumen = await screen.findByText("Revise la excepción; su captura se conserva.");
    await waitFor(() => expect(document.activeElement).toBe(resumen.closest("[role=alert]")));
    expect(screen.getByRole("link", { name: "Elija el tipo de excepción." })).toBeTruthy();
    expect(JSON.parse(screen.getByTestId("borrador").textContent!).borrador.excepciones).toBeUndefined();
  });

  it("rendimiento o desperdicio: valida el rango, pide confirmación y entonces lo agrega al borrador", async () => {
    const u = userEvent.setup();
    const componentes = componentesOk();
    render(<Seccion inicial={cargar({ ...guardado, excepciones: [] })} componentes={componentes} />);
    await u.click(screen.getByRole("button", { name: "Registrar excepción…" }));
    await u.click(screen.getByRole("radio", { name: /Rendimiento o desperdicio de un componente/ }));
    await u.selectOptions(screen.getByLabelText("Partida"), screen.getByRole("option", { name: /Partida 1 · CON-00007/ }));
    await waitFor(() => expect(componentes).toHaveBeenCalledWith(["CON-00007"], expect.anything()));
    await u.selectOptions(await screen.findByLabelText("Componente"), await screen.findByRole("option", { name: /CMP-00005/ }));
    await u.click(screen.getByRole("radio", { name: "Desperdicio" }));
    await u.type(screen.getByLabelText("Valor aplicado en esta cotización"), "1");
    await u.type(screen.getByLabelText("Motivo (obligatorio)"), MOTIVO);
    await u.click(screen.getByRole("button", { name: "Revisar excepción" }));
    expect((await screen.findAllByText("El desperdicio aplicado debe cumplir 0 <= d < 1.")).length).toBeGreaterThan(0);

    await u.clear(screen.getByLabelText("Valor aplicado en esta cotización"));
    await u.type(screen.getByLabelText("Valor aplicado en esta cotización"), "0.07");
    await u.click(screen.getByRole("button", { name: "Revisar excepción" }));
    expect(screen.getByText(/Quedará pendiente de autorización por un Revisor/)).toBeTruthy();
    // Nada se agregó todavía.
    expect(JSON.parse(screen.getByTestId("borrador").textContent!).borrador.excepciones).toBeUndefined();
    await u.click(screen.getByRole("button", { name: "Agregar al borrador" }));
    expect(JSON.parse(screen.getByTestId("borrador").textContent!).borrador.excepciones).toEqual([
      { tipo: "RENDIMIENTO", partida: 1, conceptoCodigo: "CON-00007", componenteCodigo: "CMP-00005", campo: "DESPERDICIO", valorAplicado: "0.07", motivo: MOTIVO },
    ]);
    expect(screen.getByText("Registrada · pendiente de autorización")).toBeTruthy();
  });

  it("quitar exige confirmación", async () => {
    const u = userEvent.setup();
    render(<Seccion inicial={cargar()} componentes={componentesOk()} />);
    await u.click(screen.getByRole("button", { name: "Quitar la excepción 2…" }));
    await u.click(within(screen.getByRole("group", { name: "Confirmar quitar la excepción 2" })).getByRole("button", { name: "Quitar" }));
    expect(JSON.parse(screen.getByTestId("borrador").textContent!).borrador.excepciones.map((x: { tipo: string }) => x.tipo)).toEqual(["RENDIMIENTO"]);
  });
});

const version = (over: Partial<ExcepcionesVersion> = {}): ExcepcionesVersion => ({
  versionId: ID,
  idVersion: "COT-2026-00001-v1",
  revisionId: ID,
  excepciones: [
    {
      numero: 1,
      tipo: "RENDIMIENTO",
      referencia: "rendimiento del componente CMP-00011 en la partida 1 (CON-00009)",
      campo: "RENDIMIENTO",
      valorOriginal: "12.5 pza",
      valorAplicado: "13",
      motivo: MOTIVO,
      estado: "PENDIENTE",
      decision: null,
    },
  ],
  acciones: { decidir: { permitida: true, motivo: null } },
  ...over,
});

describe("decisión del Revisor", () => {
  it("ve catálogo, valor aplicado y motivo; autoriza con confirmación y la misma clave al reintentar", async () => {
    const u = userEvent.setup();
    const autorizada = version({
      excepciones: [{ ...version().excepciones[0]!, estado: "AUTORIZADA", decision: { por: "[DEMO] Revisora", en: "2026-09-25T15:00:00Z", comentario: null } }],
      acciones: { decidir: { permitida: false, motivo: "Las excepciones se autorizan mientras la versión está en revisión." } },
    });
    const decidirExcepcion = vi.fn().mockResolvedValueOnce({ ok: false, fallo: { tipo: "red" } }).mockResolvedValueOnce({ ok: true, datos: autorizada });
    const alDecidir = vi.fn();
    render(
      <PanelExcepcionesVersion servicios={{ excepcionesVersion: () => ok(version()), decidirExcepcion }} cotizacionId={ID} numero={1} alDecidir={alDecidir} />,
    );
    expect(await screen.findByText("12.5 pza")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    expect(screen.getByText(MOTIVO)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Autorizar excepción 1…" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar autorización de la excepción 1" });
    await waitFor(() => expect(document.activeElement).toBe(confirmar));
    await u.click(confirmar);
    expect(await screen.findByText("No se registró la decisión")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Confirmar autorización de la excepción 1" }));
    expect(await screen.findByText("Excepción 1 autorizada.")).toBeTruthy();
    expect(decidirExcepcion.mock.calls[0]![3]).toBe(decidirExcepcion.mock.calls[1]![3]);
    expect(decidirExcepcion.mock.calls[0]!.slice(0, 3)).toEqual([ID, 1, { versionId: ID, decision: "AUTORIZADA", comentario: null }]);
    expect(alDecidir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Autorizar excepción/ })).toBeNull();
  });

  it("conflicto: otra persona decidió antes y se muestra la decisión vigente", async () => {
    const u = userEvent.setup();
    const vigente = version({ excepciones: [{ ...version().excepciones[0]!, estado: "RECHAZADA", decision: { por: "[DEMO] Revisor Dos", en: "2026-09-25T15:00:00Z", comentario: "Sin respaldo." } }] });
    const decidirExcepcion = vi.fn(() =>
      Promise.resolve({ ok: false as const, fallo: { tipo: "excepcion" as const, codigo: "CONFLICTO_EXCEPCION" as const, mensaje: "x", excepcionesVigentes: vigente } }),
    );
    render(<PanelExcepcionesVersion servicios={{ excepcionesVersion: () => ok(version()), decidirExcepcion }} cotizacionId={ID} numero={1} />);
    await u.click(await screen.findByRole("button", { name: "Rechazar excepción 1…" }));
    await u.click(screen.getByRole("button", { name: "Confirmar rechazo de la excepción 1" }));
    expect(await screen.findByText(/Otra persona ya decidió esta excepción/)).toBeTruthy();
    expect(screen.getByText(/Rechazó \[DEMO\] Revisor Dos/)).toBeTruthy();
  });

  it("sin permiso de decidir solo muestra el motivo del servidor; sin excepciones no muestra nada", async () => {
    const { unmount } = render(
      <PanelExcepcionesVersion
        servicios={{ excepcionesVersion: () => ok(version({ acciones: { decidir: { permitida: false, motivo: "BL-17: usted preparó esta versión." } } })), decidirExcepcion: vi.fn() }}
        cotizacionId={ID}
        numero={1}
      />,
    );
    expect(await screen.findByText("BL-17: usted preparó esta versión.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Autorizar/ })).toBeNull();
    unmount();
    const { container } = render(
      <PanelExcepcionesVersion servicios={{ excepcionesVersion: () => ok(version({ excepciones: [] })), decidirExcepcion: vi.fn() }} cotizacionId={ID} numero={1} />,
    );
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
