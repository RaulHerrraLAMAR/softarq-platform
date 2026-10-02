// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RespuestaCalculoDemo } from "@softarq/contracts";
import type { ResultadoApi } from "../api/cliente.ts";
import { App } from "../App.tsx";
import { CON_AREA, RESPUESTA_CALCULADA, diferida, serviciosFalsos } from "../pruebas/datos.ts";

type ResultadoCalculo = ResultadoApi<RespuestaCalculoDemo>;

const total = () => document.querySelector("[data-prueba=total]");
const esperarTotal = (texto: string) => waitFor(() => expect(total()?.textContent).toBe(texto));

/** Captura propia completa: CON-00007 con un renglón 10 × 4.5 y opciones elegidas a mano. */
async function capturaPropiaCompleta(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("button", { name: "Iniciar captura propia" }));
  await usuario.click(await screen.findByRole("button", { name: /Agregar CON-00007/ }));
  await usuario.type(screen.getByLabelText(/Largo del renglón 1/), "10");
  await usuario.type(screen.getByLabelText(/Ancho del renglón 1/), "4.5");
  await usuario.click(screen.getByRole("radio", { name: "Consolidar compras" }));
  await screen.findByRole("group", { name: /INS-00004/ });
  await usuario.click(within(screen.getByRole("group", { name: /INS-00004/ })).getAllByRole("radio")[0]!);
  await usuario.click(within(screen.getByRole("group", { name: /INS-00005/ })).getAllByRole("radio")[0]!);
}

const ejemploFalso = () =>
  serviciosFalsos({
    buscarConceptos: async () => ({ ok: true, datos: { conceptos: [CON_AREA], limite: 20 } }),
  });

describe("App", () => {
  it("muestra DEMO y los cuatro ejemplos sin totales", () => {
    render(<App servicios={serviciosFalsos()} />);
    expect(screen.getByText("DEMO")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Cargar ejemplo/ })).toHaveLength(4);
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  it("captura propia: ninguna opción preseleccionada aunque haya menor precio", async () => {
    const usuario = userEvent.setup();
    render(<App servicios={serviciosFalsos()} />);
    await usuario.click(screen.getByRole("button", { name: "Iniciar captura propia" }));
    await usuario.click(await screen.findByRole("button", { name: /Agregar CON-00007/ }));
    const grupo = await screen.findByRole("group", { name: /INS-00004/ });
    expect(within(grupo).getAllByText("Menor precio vigente")).toHaveLength(1);
    for (const radio of within(grupo).getAllByRole("radio")) expect((radio as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByRole("radio", { name: /Consolidar compras|Comprar por partida/ }).every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it("captura incompleta: no envía y lista lo que falta", async () => {
    const usuario = userEvent.setup();
    const calcular = vi.fn<() => Promise<ResultadoCalculo>>();
    render(<App servicios={serviciosFalsos({ calcular })} />);
    await usuario.click(screen.getByRole("button", { name: "Iniciar captura propia" }));
    await usuario.click(await screen.findByRole("button", { name: /Agregar CON-00007/ }));
    await screen.findByRole("group", { name: /INS-00004/ });
    await usuario.click(screen.getByRole("button", { name: "Calcular" }));
    expect(calcular).not.toHaveBeenCalled();
    const resumen = await screen.findByRole("alert", { name: /Faltan datos para calcular/ });
    expect(within(resumen).getByText(/Partida 1, renglón 1, largo/)).toBeTruthy();
    expect(within(resumen).getByText(/Opción para INS-00004/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(resumen));
    expect(screen.getByLabelText(/Largo del renglón 1/).getAttribute("aria-invalid")).toBe("true");
  });

  it("calcula con clic y muestra el total; doble clic = una sola solicitud", async () => {
    const usuario = userEvent.setup();
    const d = diferida<ResultadoCalculo>();
    const calcular = vi.fn(() => d.promesa);
    render(<App servicios={serviciosFalsos({ calcular })} />);
    await capturaPropiaCompleta(usuario);
    const boton = screen.getByRole("button", { name: "Calcular" });
    await usuario.dblClick(boton);
    await usuario.click(screen.getByRole("button", { name: /Calculando/ }));
    expect(calcular).toHaveBeenCalledTimes(1);
    const enviada = calcular.mock.calls[0] as unknown as [unknown];
    expect(JSON.stringify(enviada[0])).not.toMatch(/organizacion|fecha|total/i);
    d.resolver({ ok: true, datos: RESPUESTA_CALCULADA });
    await esperarTotal("$1,160.00");
  });

  it("un cambio posterior marca pendiente de recalcular y oculta los importes", async () => {
    const usuario = userEvent.setup();
    render(<App servicios={serviciosFalsos()} />);
    await capturaPropiaCompleta(usuario);
    await usuario.click(screen.getByRole("button", { name: "Calcular" }));
    await esperarTotal("$1,160.00");
    await usuario.type(screen.getByLabelText(/Largo del renglón 1/), "0");
    expect(await screen.findByText("Pendiente de recalcular")).toBeTruthy();
    expect(total()).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  it("respuesta atrasada: si la captura cambia durante el cálculo, se descarta", async () => {
    const usuario = userEvent.setup();
    const d = diferida<ResultadoCalculo>();
    let senal: AbortSignal | undefined;
    const calcular = vi.fn((_s: unknown, signal?: AbortSignal) => {
      senal = signal;
      return d.promesa;
    });
    render(<App servicios={serviciosFalsos({ calcular })} />);
    await capturaPropiaCompleta(usuario);
    await usuario.click(screen.getByRole("button", { name: "Calcular" }));
    await usuario.type(screen.getByLabelText(/Largo del renglón 1/), "5");
    expect(senal?.aborted).toBe(true);
    d.resolver({ ok: true, datos: RESPUESTA_CALCULADA });
    expect(await screen.findByText("Pendiente de recalcular")).toBeTruthy();
    expect(total()).toBeNull();
  });

  it("bloqueado: muestra códigos y mensajes, nunca importes", async () => {
    const usuario = userEvent.setup();
    const calcular = vi.fn(async (): Promise<ResultadoCalculo> => ({
      ok: false,
      fallo: { tipo: "bloqueado", problemas: [{ codigo: "BL-08", referencia: "INS-00004", mensaje: "Precio no válido." }] },
    }));
    render(<App servicios={serviciosFalsos({ calcular })} />);
    await capturaPropiaCompleta(usuario);
    await usuario.click(screen.getByRole("button", { name: "Calcular" }));
    expect(await screen.findByText(/Cálculo bloqueado/)).toBeTruthy();
    expect(screen.getByText("BL-08")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$\d|Total/);
  });

  it("error de conexión: conserva la captura y reintenta solo a petición", async () => {
    const usuario = userEvent.setup();
    const calcular = vi
      .fn<() => Promise<ResultadoCalculo>>()
      .mockResolvedValueOnce({ ok: false, fallo: { tipo: "red" } })
      .mockResolvedValueOnce({ ok: true, datos: RESPUESTA_CALCULADA });
    render(<App servicios={serviciosFalsos({ calcular })} />);
    await capturaPropiaCompleta(usuario);
    await usuario.click(screen.getByRole("button", { name: "Calcular" }));
    expect(await screen.findByText(/No hay conexión con el servicio/)).toBeTruthy();
    expect((screen.getByLabelText(/Largo del renglón 1/) as HTMLInputElement).value).toBe("10");
    await new Promise((r) => setTimeout(r, 50));
    expect(calcular).toHaveBeenCalledTimes(1);
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    await esperarTotal("$1,160.00");
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  it("400 del servidor: el mensaje aparece junto al campo", async () => {
    const usuario = userEvent.setup();
    const calcular = vi.fn(async (): Promise<ResultadoCalculo> => ({
      ok: false,
      fallo: { tipo: "invalida", campos: [{ ruta: "partidas[0].mediciones[0].piezas", mensaje: "Las piezas deben ser un entero mayor que cero." }] },
    }));
    render(<App servicios={serviciosFalsos({ calcular })} />);
    await capturaPropiaCompleta(usuario);
    await usuario.click(screen.getByRole("button", { name: "Calcular" }));
    const campo = await screen.findByLabelText(/Piezas del renglón 1/);
    await waitFor(() => expect(campo.getAttribute("aria-invalid")).toBe("true"));
    const ayuda = document.getElementById(campo.getAttribute("aria-describedby")!.split(" ").pop()!);
    expect(ayuda?.textContent).toMatch(/entero mayor que cero/);
  });

  it("carga un ejemplo editable con sus selecciones, sin resultado hasta calcular", async () => {
    const usuario = userEvent.setup();
    render(<App servicios={ejemploFalso()} />);
    await usuario.click(screen.getByRole("button", { name: /Cargar ejemplo: Ejemplo 1/ }));
    expect(await screen.findByRole("heading", { name: /Ejemplo 1/ })).toBeTruthy();
    expect((screen.getAllByLabelText(/Largo del renglón 1/)[0] as HTMLInputElement).value).toBe("10");
    const grupo = await screen.findByRole("group", { name: /INS-00004/ });
    await waitFor(() => expect((within(grupo).getByRole("radio", { name: /PRE-000007/ }) as HTMLInputElement).checked).toBe(true));
    expect(screen.getByText(/Sin calcular/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  it("búsqueda sin resultados", async () => {
    const usuario = userEvent.setup();
    render(<App servicios={serviciosFalsos()} />);
    await usuario.click(screen.getByRole("button", { name: "Iniciar captura propia" }));
    await usuario.type(await screen.findByLabelText("Buscar concepto por código o descripción"), "ZZZ");
    expect(await screen.findByText(/Sin resultados para «ZZZ»/)).toBeTruthy();
  });

  it("la búsqueda descarta respuestas atrasadas", async () => {
    const usuario = userEvent.setup();
    const pendientes: { texto: string; resolver: (v: Awaited<ReturnType<ReturnType<typeof serviciosFalsos>["buscarConceptos"]>>) => void }[] = [];
    const buscarConceptos = vi.fn(
      (texto: string) =>
        new Promise<Awaited<ReturnType<ReturnType<typeof serviciosFalsos>["buscarConceptos"]>>>((resolver) => pendientes.push({ texto, resolver })),
    );
    render(<App servicios={serviciosFalsos({ buscarConceptos })} />);
    await usuario.click(screen.getByRole("button", { name: "Iniciar captura propia" }));
    await waitFor(() => expect(pendientes).toHaveLength(1));
    const campo = screen.getByLabelText("Buscar concepto por código o descripción");
    await usuario.type(campo, "Losa");
    await waitFor(() => expect(pendientes.some((p) => p.texto === "Losa")).toBe(true));
    // Llega primero la respuesta de la búsqueda nueva y después la vieja (vacía de filtro).
    pendientes.find((p) => p.texto === "Losa")!.resolver({ ok: true, datos: { conceptos: [], limite: 20 } });
    pendientes[0]!.resolver({ ok: true, datos: { conceptos: [CON_AREA], limite: 20 } });
    expect(await screen.findByText(/Sin resultados para «Losa»/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar CON-00007/ })).toBeNull();
  });
});
