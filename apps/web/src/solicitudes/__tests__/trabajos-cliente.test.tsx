// @vitest-environment jsdom
/**
 * Trabajos para clientes en el catálogo (módulo 17): lista, edición con motivo, la definición completa viaja a la API sin tocar el
 * concepto ni las medidas, desactivar no borra y un fallo conserva lo escrito.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DefinicionTrabajo, RespuestaDefinicionesTrabajo } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { VistaTrabajosCliente } from "../VistaTrabajosCliente.tsx";
import type { ServiciosSolicitudes } from "../servicios.ts";

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true as const, datos });

const LOSA: RespuestaDefinicionesTrabajo["trabajos"][number] = {
  codigo: "LOSA",
  nombre: "Losa",
  descripcion: "Piso o losa de concreto.",
  ilustracion: "losa",
  orden: 20,
  activo: true,
  opciones: [
    {
      codigo: "CONCRETO",
      nombre: "Losa de concreto",
      descripcion: "Concreto reforzado.",
      conceptoCodigo: "CON-00008",
      consolidarCompras: true,
      medidas: [
        { clave: "largo", etiqueta: "Largo", ayuda: "Largo en metros." },
        { clave: "ancho", etiqueta: "Ancho", ayuda: "Ancho en metros." },
        { clave: "alto", etiqueta: "Espesor", ayuda: "Espesor en metros." },
      ],
      orden: 10,
      activa: true,
    },
  ],
};
const MURO = { ...LOSA, codigo: "MURO", nombre: "Muro", ilustracion: "muro" as const, orden: 30, opciones: [{ ...LOSA.opciones[0]!, codigo: "BLOCK", nombre: "Muro de block", conceptoCodigo: "CON-00009" }] };

function servicios(guardar: ServiciosSolicitudes["guardarTrabajoCliente"] = vi.fn(() => ok({ trabajos: [LOSA, MURO] }))): ServiciosSolicitudes {
  return { trabajosCliente: () => ok({ trabajos: [MURO, LOSA] }), guardarTrabajoCliente: guardar } as unknown as ServiciosSolicitudes;
}
const montar = (s: ServiciosSolicitudes) => render(<ProveedorRuta><VistaTrabajosCliente servicios={s} /></ProveedorRuta>);

describe("trabajos para clientes", () => {
  it("los lista por orden con su estado y opciones, y aclara qué no se edita aquí", async () => {
    montar(servicios());
    const tabla = await screen.findByRole("table");
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas[0]!.textContent).toContain("Losa");
    expect(filas[1]!.textContent).toContain("Muro");
    expect(within(tabla).getAllByText("Se ofrece")).toHaveLength(2);
    expect(screen.getByText(/No hay trabajos definidos|Los trabajos que el cliente elige/)).toBeTruthy();
  });

  it("editar exige motivo y envía la definición completa con el concepto y las medidas intactos", async () => {
    const guardar = vi.fn(() => ok({ trabajos: [LOSA, MURO] }));
    montar(servicios(guardar as never));
    await userEvent.click((await screen.findAllByRole("button", { name: "Editar" }))[0]!);
    expect(screen.getByText(/El concepto y las medidas no se editan aquí/)).toBeTruthy();
    const enviar = screen.getByRole("button", { name: "Guardar el trabajo" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.type(screen.getByLabelText("Nombre"), "Losa de piso");
    await userEvent.clear(screen.getByLabelText("Orden (menor primero)"));
    await userEvent.type(screen.getByLabelText("Orden (menor primero)"), "5");
    await userEvent.type(screen.getByLabelText(/Motivo/), "Cambio de nombre comercial");
    expect(enviar.disabled).toBe(false);
    await userEvent.click(enviar);
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    const [def, clave] = (guardar as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [DefinicionTrabajo, string];
    expect(def).toMatchObject({ codigo: "LOSA", nombre: "Losa de piso", orden: 5, activo: true, motivo: "Cambio de nombre comercial" });
    expect(def.opciones[0]).toMatchObject({ codigo: "CONCRETO", conceptoCodigo: "CON-00008", consolidarCompras: true });
    expect(def.opciones[0]!.medidas.map((m) => m.clave)).toEqual(["largo", "ancho", "alto"]);
    expect(typeof clave).toBe("string");
    expect(await screen.findByText("Trabajo «Losa» guardado.")).toBeTruthy();
  });

  it("desactivar el trabajo y una opción se envía como estado, no como borrado", async () => {
    const guardar = vi.fn(() => ok({ trabajos: [LOSA, MURO] }));
    montar(servicios(guardar as never));
    await userEvent.click((await screen.findAllByRole("button", { name: "Editar" }))[0]!);
    await userEvent.click(screen.getByLabelText("Se ofrece al cliente en la app"));
    await userEvent.click(screen.getByLabelText("La opción CONCRETO está activa"));
    await userEvent.type(screen.getByLabelText(/Motivo/), "Se deja de ofrecer por ahora");
    await userEvent.click(screen.getByRole("button", { name: "Guardar el trabajo" }));
    await waitFor(() => expect(guardar).toHaveBeenCalled());
    const def = (guardar as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as DefinicionTrabajo;
    expect(def.activo).toBe(false);
    expect(def.opciones[0]!.activa).toBe(false);
    expect(def.opciones).toHaveLength(1);
  });

  it("un fallo de la API lo explica y conserva lo escrito; un reintento reutiliza la misma clave", async () => {
    let n = 0;
    const guardar = vi.fn(() => (n++ === 0 ? Promise.resolve({ ok: false as const, fallo: { tipo: "red", mensaje: "Sin conexión" } as never }) : ok({ trabajos: [LOSA, MURO] })));
    montar(servicios(guardar as never));
    await userEvent.click((await screen.findAllByRole("button", { name: "Editar" }))[0]!);
    await userEvent.type(screen.getByLabelText(/Motivo/), "Ajuste de descripción");
    await userEvent.click(screen.getByRole("button", { name: "Guardar el trabajo" }));
    expect(await screen.findByText("No se guardó")).toBeTruthy();
    expect((screen.getByLabelText(/Motivo/) as HTMLInputElement).value).toBe("Ajuste de descripción");
    await userEvent.click(screen.getByRole("button", { name: "Guardar el trabajo" }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
    const claves = (guardar as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(claves[0]).toBe(claves[1]);
  });
});
