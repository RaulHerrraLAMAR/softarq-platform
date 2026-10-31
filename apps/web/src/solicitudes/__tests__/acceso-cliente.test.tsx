// @vitest-environment jsdom
/**
 * Acceso del cliente a la app, en su ficha (módulo 17, ADR-0021 §1): alta por invitación con contraseña temporal que se
 * muestra una sola vez, idempotencia por intención, desactivar/reactivar y restablecer con motivo.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccesoCliente as Acceso } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { AccesoCliente } from "../AccesoCliente.tsx";
import type { ServiciosSolicitudes } from "../servicios.ts";

const CLIENTE = "f7e6f22e-0530-4000-8000-000000000051";
const USUARIO = "f7e6f22e-0530-4000-8000-000000000052";
const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true as const, datos });
const nada = () => Promise.resolve({ ok: false as const, fallo: { tipo: "no_encontrado", faltantes: [] } as never });
const acceso = (over: Partial<Acceso> = {}): Acceso => ({ usuarioId: USUARIO, clienteId: CLIENTE, correo: "raul.demo@clientes.softarq.test", nombre: "Raul Herrera", activo: true, contrasenaTemporal: false, creadoEn: "2026-10-31T17:00:00.000Z", ...over });
const alta = (temporal: string | null) => ({ acceso: acceso({ contrasenaTemporal: true }), contrasenaTemporal: temporal, temporalExpiraEn: "2026-11-03T20:00:00.000Z" });

function servicios(over: Partial<ServiciosSolicitudes> = {}): ServiciosSolicitudes {
  const no = () => Promise.reject(new Error("no se esperaba esta llamada"));
  return { listar: no, detalle: no, atender: no, acceso: vi.fn(nada), crearAcceso: no, cambiarEstadoAcceso: no, restablecerAcceso: no, referencias: no, designarReferencia: no, retirarReferencia: no, ...over } as ServiciosSolicitudes;
}
const montar = (s: ServiciosSolicitudes, activo = true) =>
  render(
    <ProveedorRuta>
      <AccesoCliente servicios={s} clienteId={CLIENTE} clienteNombre="Raul Herrera" clienteActivo={activo} />
    </ProveedorRuta>,
  );

describe("acceso del cliente en la ficha", () => {
  it("sin acceso: explica que es por invitación y ofrece crearlo", async () => {
    montar(servicios());
    expect(await screen.findByText(/por invitación: no hay autorregistro/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear acceso a la app" })).toBeTruthy();
  });

  it("un cliente desactivado no permite crear su acceso", async () => {
    montar(servicios(), false);
    const b = await screen.findByRole("button", { name: "Crear acceso a la app" });
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("crear: pide correo, nombre y motivo; la temporal se muestra una vez, oculta por defecto, y se descarta al cerrar", async () => {
    const crear = vi.fn(() => ok(alta("Temporal-Segura-123")));
    const acc = vi.fn().mockImplementationOnce(nada).mockImplementation(() => ok(acceso({ contrasenaTemporal: true })));
    montar(servicios({ crearAcceso: crear as never, acceso: acc as never }));
    await userEvent.click(await screen.findByRole("button", { name: "Crear acceso a la app" }));
    const enviar = screen.getByRole("button", { name: "Crear el acceso a la app" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Correo del cliente/), "raul.demo@clientes.softarq.test");
    await userEvent.type(screen.getByLabelText("Motivo (queda en la bitácora)"), "Cuenta de presentación");
    await userEvent.click(enviar);
    expect(await screen.findByText(/entréguela al cliente ahora/)).toBeTruthy();
    expect(crear).toHaveBeenCalledWith(CLIENTE, { correo: "raul.demo@clientes.softarq.test", nombre: "Raul Herrera", motivo: "Cuenta de presentación" }, expect.any(String));
    expect(screen.queryByText("Temporal-Segura-123")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(screen.getByText("Temporal-Segura-123")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Ya la entregué" }));
    expect(screen.queryByText("Temporal-Segura-123")).toBeNull();
    expect(document.body.textContent).not.toContain("Temporal-Segura-123");
  });

  it("si crear falla, un reintento reutiliza la misma clave de idempotencia", async () => {
    let n = 0;
    const crear = vi.fn(() => (n++ === 0 ? Promise.resolve({ ok: false as const, fallo: { tipo: "red", mensaje: "Sin conexión" } as never }) : ok(alta("T-1"))));
    montar(servicios({ crearAcceso: crear as never }));
    await userEvent.click(await screen.findByRole("button", { name: "Crear acceso a la app" }));
    await userEvent.type(screen.getByLabelText(/Correo del cliente/), "a@b.test");
    await userEvent.type(screen.getByLabelText("Motivo (queda en la bitácora)"), "Alta de prueba");
    await userEvent.click(screen.getByRole("button", { name: "Crear el acceso a la app" }));
    expect(await screen.findByText("No se guardó")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Crear el acceso a la app" }));
    await waitFor(() => expect(crear).toHaveBeenCalledTimes(2));
    const claves = crear.mock.calls.map((c) => (c as unknown[])[2]);
    expect(claves[0]).toBe(claves[1]);
  });

  it("con acceso: desactivar exige motivo y avisa que cierra sus sesiones", async () => {
    const cambiar = vi.fn(() => ok(acceso({ activo: false })));
    montar(servicios({ acceso: () => ok(acceso()), cambiarEstadoAcceso: cambiar as never }));
    await userEvent.click(await screen.findByRole("button", { name: "Desactivar acceso" }));
    expect(screen.getByText(/Se cierran sus sesiones en la app/)).toBeTruthy();
    const enviar = screen.getByRole("button", { name: "Desactivar el acceso" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Motivo (queda en la bitácora)"), "Prueba de pérdida de acceso");
    await userEvent.click(enviar);
    await waitFor(() => expect(cambiar).toHaveBeenCalledWith(USUARIO, false, "Prueba de pérdida de acceso", expect.any(String)));
    expect(await screen.findByText(/sus sesiones en la app se cerraron/)).toBeTruthy();
  });

  it("restablecer muestra la temporal nueva una sola vez y no cambia ninguna contraseña por el cliente", async () => {
    const restablecer = vi.fn(() => ok(alta("Otra-Temporal-9")));
    montar(servicios({ acceso: () => ok(acceso()), restablecerAcceso: restablecer as never }));
    await userEvent.click(await screen.findByRole("button", { name: "Restablecer contraseña" }));
    expect(screen.getByText(/No se cambia ninguna contraseña por el cliente/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Motivo (queda en la bitácora)"), "El cliente la olvidó");
    await userEvent.click(screen.getByRole("button", { name: "Restablecer la contraseña" }));
    expect(await screen.findByText(/entréguela al cliente ahora/)).toBeTruthy();
    expect(restablecer).toHaveBeenCalledWith(USUARIO, "El cliente la olvidó", expect.any(String));
  });

  it("un acceso desactivado ofrece reactivarlo, y una temporal pendiente se indica", async () => {
    montar(servicios({ acceso: () => ok(acceso({ activo: false, contrasenaTemporal: true })) }));
    expect(await screen.findByRole("button", { name: "Reactivar acceso" })).toBeTruthy();
    expect(screen.getByText("Desactivado")).toBeTruthy();
    expect(screen.getByText("Contraseña temporal pendiente de cambio")).toBeTruthy();
  });
});
