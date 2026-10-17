// @vitest-environment jsdom
/**
 * Selector con búsqueda y paginación (pendiente del módulo 11): cualquier registro autorizado se
 * puede elegir; la selección actual se muestra aunque no esté en la página; una selección que dejó
 * de estar disponible se marca sin sustituirla; las respuestas tardías se descartan.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ResultadoApi } from "../../api/cliente.ts";
import { SelectorRegistro, type BuscarRegistros, type OpcionRegistro } from "../SelectorRegistro.tsx";

type Pagina = { opciones: OpcionRegistro[]; siguiente: string | null };
const op = (n: number): OpcionRegistro => ({ codigo: `PCM-${String(n).padStart(5, "0")}`, texto: `PCM-${String(n).padStart(5, "0")} · [DEMO] Producto ${n}`, disponible: true });

function Prueba({ buscar, inicial = "", seleccion = null }: { buscar: BuscarRegistros; inicial?: string; seleccion?: OpcionRegistro | null }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <SelectorRegistro etiqueta="Producto" valor={valor} seleccion={seleccion} alCambiar={(c) => setValor(c)} buscar={buscar} obligatorio />
      <output data-testid="valor">{valor}</output>
    </>
  );
}

describe("selector de registros", () => {
  it("pagina por código en el servidor y permite elegir un registro de la segunda página", async () => {
    const u = userEvent.setup();
    const buscar = vi.fn<BuscarRegistros>(async (_t, despuesDe) =>
      ({ ok: true, datos: despuesDe ? { opciones: [op(51), op(52)], siguiente: null } : { opciones: Array.from({ length: 50 }, (_, i) => op(i + 1)), siguiente: "PCM-00050" } }) as ResultadoApi<Pagina>,
    );
    render(<Prueba buscar={buscar} />);
    await u.click(await screen.findByRole("button", { name: "Más resultados" }));
    await u.click(await screen.findByRole("radio", { name: /Producto 52/ }));
    expect(screen.getByTestId("valor").textContent).toBe("PCM-00052");
    expect(buscar).toHaveBeenLastCalledWith("", "PCM-00050", expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Más resultados" })).toBeNull();
  });

  it("busca en el servidor (no filtra en el navegador)", async () => {
    const u = userEvent.setup();
    const buscar = vi.fn<BuscarRegistros>(async (texto) => ({ ok: true, datos: { opciones: texto ? [op(77)] : [op(1)], siguiente: null } }));
    render(<Prueba buscar={buscar} />);
    await screen.findByRole("radio", { name: /Producto 1$/ });
    await u.type(screen.getByRole("searchbox"), "77");
    await u.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByRole("radio", { name: /Producto 77/ })).toBeTruthy();
    expect(buscar).toHaveBeenLastCalledWith("77", undefined, expect.any(AbortSignal));
  });

  it("la selección actual se muestra aunque no esté en la página, y si ya no está disponible se marca sin sustituirse", async () => {
    const buscar: BuscarRegistros = async () => ({ ok: true, datos: { opciones: [op(1)], siguiente: null } });
    render(<Prueba buscar={buscar} inicial="PCM-00099" seleccion={{ codigo: "PCM-00099", texto: "PCM-00099 · [DEMO] Producto retirado", disponible: false }} />);
    await screen.findByRole("radio", { name: /Producto 1$/ });
    expect(screen.getByText("PCM-00099 · [DEMO] Producto retirado")).toBeTruthy();
    expect(screen.getByText(/no disponible para registros nuevos/)).toBeTruthy();
    expect(screen.getByTestId("valor").textContent).toBe("PCM-00099");
  });

  it("una respuesta tardía de una búsqueda anterior se descarta", async () => {
    const u = userEvent.setup();
    let tardia!: (r: ResultadoApi<Pagina>) => void;
    const buscar = vi.fn<BuscarRegistros>((texto) =>
      texto === "lenta" ? new Promise((r) => (tardia = r)) : Promise.resolve({ ok: true, datos: { opciones: [op(texto ? 2 : 1)], siguiente: null } }),
    );
    render(<Prueba buscar={buscar} />);
    await screen.findByRole("radio", { name: /Producto 1$/ });
    await u.type(screen.getByRole("searchbox"), "lenta");
    await u.click(screen.getByRole("button", { name: "Buscar" }));
    await u.clear(screen.getByRole("searchbox"));
    await u.type(screen.getByRole("searchbox"), "rapida");
    await u.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByRole("radio", { name: /Producto 2$/ });
    await act(async () => tardia({ ok: true, datos: { opciones: [op(9)], siguiente: null } }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Producto 9/ })).toBeNull());
    expect(screen.getByRole("radio", { name: /Producto 2$/ })).toBeTruthy();
  });

  it("un error conserva la selección y permite reintentar la misma petición", async () => {
    const u = userEvent.setup();
    const buscar = vi
      .fn<BuscarRegistros>()
      .mockResolvedValueOnce({ ok: false, fallo: { tipo: "red" } })
      .mockResolvedValueOnce({ ok: true, datos: { opciones: [op(3)], siguiente: null } });
    render(<Prueba buscar={buscar} inicial="PCM-00003" seleccion={op(3)} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("valor").textContent).toBe("PCM-00003");
    await u.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("radio", { name: /Producto 3/ })).toBeTruthy();
    expect(buscar.mock.calls[1]!.slice(0, 2)).toEqual(["", undefined]);
  });
});
