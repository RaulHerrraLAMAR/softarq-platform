// @vitest-environment jsdom
/**
 * Administración del sistema en la web (módulo 13, ADR-0017): porcentajes capturados en % y guardados
 * como fracción, vacío distinto de 0, impacto antes de guardar, conflicto que conserva lo escrito,
 * contraseña temporal mostrada una sola vez y fuera del almacenamiento del navegador, reintento con la
 * misma clave y protección visible de la propia cuenta. La API se simula con los contratos.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DetalleParametros, PersonaAdmin, RespuestaCredencialTemporal } from "@softarq/contracts";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta, hashDe, interpretarHash } from "../../navegacion/ruta.tsx";
import { PantallaAdministracion, PantallaPersona, textoPorcentaje } from "../PantallasAdministracion.tsx";
import { fraccionDePorcentaje, porcentajeDeFraccion } from "../porcentaje.ts";
import type { ServiciosAdministracion } from "../servicios.ts";

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true, datos });
const SIN_IMPACTO = { cotizaciones: 0, borradores: 0, sinEnviar: 0, enRevision: 0, aprobadasSinEmitir: 0 };
const MOTIVO = "[DEMO] Ajuste de comprobación M13";
/** `userEvent.type` interpreta `[` y `{` como teclas: se duplican para escribirlos tal cual. */
const literal = (t: string) => t.replace(/[[{]/g, (c) => c + c);

const DETALLE: DetalleParametros = {
  parametros: {
    ambiente: "DEMO",
    moneda: "MXN",
    recargoSobreCosto: "0.2",
    impuesto: { tasa: "0.16", base: "SUBTOTAL_VENTA", tratamiento: "[DEMO] Trasladado", nombre: "[DEMO] IVA" },
    vigenciaDias: 15,
    textos: { alcance: "[DEMO] Alcance", condiciones: "[DEMO] Condiciones", exclusiones: "[DEMO] Exclusiones" },
    revision: 3,
    modificadoEn: "2026-10-17T15:00:00.000Z",
    modificadoPor: null,
  },
  impacto: { cotizaciones: 2, borradores: 1, sinEnviar: 1, enRevision: 0, aprobadasSinEmitir: 1 },
  historial: [
    {
      tipo: "PARAMETROS_EDITADOS",
      ocurridoEn: "2026-10-17T15:00:00.000Z",
      usuario: "[DEMO] Administrador del sistema",
      detalle: { cambios: { recargoSobreCosto: { anterior: "0.25", nuevo: "0.2" } }, motivo: "[DEMO] Motivo anterior" },
    },
  ],
};

const PERSONA: PersonaAdmin = {
  id: "8c3cbb3e-bae5-48b5-a647-4eefc7851280",
  correo: "persona.m13@softarq.test",
  nombre: "[DEMO] Persona M13",
  funciones: ["PREPARADOR"],
  activa: true,
  cambioContrasenaPendiente: true,
  temporalExpiraEn: "2026-10-20T15:00:00.000Z",
  revision: 0,
  creadaEn: "2026-10-17T15:00:00.000Z",
  modificadaEn: "2026-10-17T15:00:00.000Z",
  modificadaPor: "[DEMO] Administrador del sistema",
};
const PROPIA: PersonaAdmin = { ...PERSONA, id: "3082dc4e-76d5-4346-9ab5-ba61251802dc", correo: "sistema.demo@softarq.test", nombre: "[DEMO] Administrador del sistema", funciones: ["ADMIN_SISTEMA"], cambioContrasenaPendiente: false, temporalExpiraEn: null };
const TEMPORAL = "Xy7-temporal-de-prueba-unica";

function servicios(s: Partial<ServiciosAdministracion> = {}): ServiciosAdministracion {
  const noUsar = () => Promise.reject(new Error("no se esperaba esta llamada"));
  return {
    parametros: () => ok(DETALLE),
    editarParametros: noUsar,
    listarPersonas: () => ok({ personas: [PERSONA], limite: 50, siguiente: null }),
    detallePersona: (id) => ok({ persona: id === PROPIA.id ? PROPIA : PERSONA, historial: [] }),
    crearPersona: noUsar,
    editarPersona: noUsar,
    restablecerContrasena: noUsar,
    ...s,
  };
}

const montar = (ui: ReactNode) => render(<ProveedorRuta>{ui}</ProveedorRuta>);

const espiasAlmacen: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  for (const m of ["getItem", "setItem", "removeItem", "clear", "key"] as const) espiasAlmacen.push(vi.spyOn(Storage.prototype, m));
});
afterEach(() => {
  // La contraseña temporal (ni nada de esta sección) se guarda en el almacenamiento del navegador.
  for (const e of espiasAlmacen) expect(e).not.toHaveBeenCalled();
  for (const e of espiasAlmacen.splice(0)) e.mockRestore();
});

describe("porcentajes (texto a texto, sin redondeo)", () => {
  it("convierte % a fracción y de vuelta", () => {
    expect(fraccionDePorcentaje("20")).toBe("0.2");
    expect(fraccionDePorcentaje("16")).toBe("0.16");
    expect(fraccionDePorcentaje("12.5")).toBe("0.125");
    expect(fraccionDePorcentaje("0.0001")).toBe("0.000001");
    expect(fraccionDePorcentaje("0")).toBe("0");
    expect(fraccionDePorcentaje("100")).toBe("1");
    expect(fraccionDePorcentaje("007")).toBe("0.07");
    expect(porcentajeDeFraccion("0.2")).toBe("20");
    expect(porcentajeDeFraccion("0.125")).toBe("12.5");
    expect(porcentajeDeFraccion("1")).toBe("100");
    expect(porcentajeDeFraccion("0")).toBe("0");
    expect(porcentajeDeFraccion("0.000001")).toBe("0.0001");
  });

  it("rechaza lo que no es un porcentaje entre 0 y 100 con hasta 4 decimales", () => {
    for (const t of ["", "-5", "100.01", "101", "1,5", "1e2", "20 %", "0.00001", "abc"]) expect(fraccionDePorcentaje(t), t).toBeNull();
  });

  it("muestra el porcentaje con la fracción guardada; null es «No definido», no 0", () => {
    expect(textoPorcentaje("0.2")).toBe("20 % (fracción guardada: 0.2)");
    expect(textoPorcentaje("0")).toBe("0 % (fracción guardada: 0)");
    expect(textoPorcentaje(null)).toBe("No definido");
  });
});

describe("rutas de la administración", () => {
  it("parámetros, personas y el detalle de una persona tienen URL propia", () => {
    for (const r of [
      { pantalla: "administracion", vista: "parametros" },
      { pantalla: "administracion", vista: "personas" },
      { pantalla: "persona", id: PERSONA.id },
    ] as const) {
      expect(interpretarHash(hashDe(r))).toEqual(r);
    }
    expect(interpretarHash("#/administracion/personas/no-es-uuid")).toEqual({ pantalla: "no-encontrada" });
  });
});

describe("parámetros", () => {
  it("muestra valores, ambiente y moneda de solo lectura, impacto e historial", async () => {
    montar(<PantallaAdministracion servicios={servicios()} vista="parametros" />);
    expect(await screen.findByText("20 % (fracción guardada: 0.2)")).toBeTruthy();
    expect(screen.getByText(/\[DEMO\] IVA: 16 % \(fracción guardada: 0\.16\)/)).toBeTruthy();
    expect(screen.getByText(/no se edita: una organización DEMO no pasa a producción/)).toBeTruthy();
    expect(screen.getByText(/Afecta a 2 cotización\(es\) abierta\(s\)/)).toBeTruthy();
    expect(screen.getByText(/recargo: 25 % → 20 %/)).toBeTruthy();
  });

  it("captura en %, guarda la fracción y envía solo lo cambiado tras confirmar el impacto", async () => {
    const editar = vi.fn((_c: unknown) => ok({ ...DETALLE, parametros: { ...DETALLE.parametros, recargoSobreCosto: "0.125", revision: 4 } }));
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ editarParametros: editar })} vista="parametros" />);
    await usuario.click(await screen.findByRole("button", { name: "Editar parámetros" }));
    const recargo = screen.getByLabelText(/Recargo \(%\)/);
    expect((recargo as HTMLInputElement).value).toBe("20");
    await usuario.clear(recargo);
    await usuario.type(recargo, "12.5");
    expect(screen.getByText(/Se guardará la fracción 0\.125 \(12\.5 %\)/)).toBeTruthy();
    await usuario.type(screen.getByLabelText(/Motivo del cambio/), literal(MOTIVO));
    await usuario.click(screen.getByRole("button", { name: "Revisar y guardar" }));
    // Antes de guardar: el impacto en cotizaciones abiertas.
    const confirmacion = screen.getByRole("group", { name: "Confirmar: Guardar parámetros" });
    expect(confirmacion.textContent).toMatch(/aprobada\(s\) sin emitir no podrán emitirse \(BL-16\)/);
    expect(editar).not.toHaveBeenCalled();
    await usuario.click(within(confirmacion).getByRole("button", { name: "Guardar parámetros" }));
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    expect(editar.mock.calls[0]![0]).toEqual({ revision: 3, motivo: MOTIVO, recargoSobreCosto: "0.125" });
    expect(await screen.findByText(/Parámetros guardados/)).toBeTruthy();
  });

  it("vacío no es 0: dejar el recargo vacío envía null («no definido»)", async () => {
    const editar = vi.fn((_c: unknown) => ok(DETALLE));
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ editarParametros: editar })} vista="parametros" />);
    await usuario.click(await screen.findByRole("button", { name: "Editar parámetros" }));
    await usuario.clear(screen.getByLabelText(/Recargo \(%\)/));
    expect(screen.getByText(/Vacío = no definido \(no es 0\)/)).toBeTruthy();
    await usuario.type(screen.getByLabelText(/Motivo del cambio/), literal(MOTIVO));
    await usuario.click(screen.getByRole("button", { name: "Revisar y guardar" }));
    await usuario.click(within(screen.getByRole("group", { name: "Confirmar: Guardar parámetros" })).getByRole("button", { name: "Guardar parámetros" }));
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    expect(editar.mock.calls[0]![0]).toMatchObject({ recargoSobreCosto: null });
  });

  it("un porcentaje fuera de rango o sin motivo no se envía", async () => {
    const editar = vi.fn();
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ editarParametros: editar })} vista="parametros" />);
    await usuario.click(await screen.findByRole("button", { name: "Editar parámetros" }));
    await usuario.clear(screen.getByLabelText(/Recargo \(%\)/));
    await usuario.type(screen.getByLabelText(/Recargo \(%\)/), "120");
    await usuario.click(screen.getByRole("button", { name: "Revisar y guardar" }));
    expect(screen.getByText(/Escriba un porcentaje entre 0 y 100/)).toBeTruthy();
    expect(screen.getByText(/Explique el motivo/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Confirmar: Guardar parámetros" })).toBeNull();
    expect(editar).not.toHaveBeenCalled();
  });

  it("solo los textos: la confirmación dice que no afecta a cotizaciones abiertas", async () => {
    const editar = vi.fn((_c: unknown) => ok(DETALLE));
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ editarParametros: editar })} vista="parametros" />);
    await usuario.click(await screen.findByRole("button", { name: "Editar parámetros" }));
    await usuario.type(screen.getByLabelText(/^Alcance/), " ampliado");
    await usuario.type(screen.getByLabelText(/Motivo del cambio/), literal(MOTIVO));
    await usuario.click(screen.getByRole("button", { name: "Revisar y guardar" }));
    const confirmacion = screen.getByRole("group", { name: "Confirmar: Guardar parámetros" });
    expect(confirmacion.textContent).toMatch(/No afecta a cotizaciones abiertas/);
    await usuario.click(within(confirmacion).getByRole("button", { name: "Guardar parámetros" }));
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    expect(editar.mock.calls[0]![0]).toEqual({
      revision: 3,
      motivo: MOTIVO,
      textos: { alcance: "[DEMO] Alcance ampliado", condiciones: "[DEMO] Condiciones", exclusiones: "[DEMO] Exclusiones" },
    });
  });

  it("conflicto: conserva lo escrito y ofrece recargar", async () => {
    const editar = vi.fn(() =>
      Promise.resolve<ResultadoApi<DetalleParametros>>({
        ok: false,
        fallo: { tipo: "conflicto", codigo: "CONFLICTO_EDICION", mensaje: "Otra persona o pestaña guardó cambios antes; lo que escribió se conserva.", actual: null },
      }),
    );
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ editarParametros: editar })} vista="parametros" />);
    await usuario.click(await screen.findByRole("button", { name: "Editar parámetros" }));
    await usuario.clear(screen.getByLabelText(/Recargo \(%\)/));
    await usuario.type(screen.getByLabelText(/Recargo \(%\)/), "18");
    await usuario.type(screen.getByLabelText(/Motivo del cambio/), literal(MOTIVO));
    await usuario.click(screen.getByRole("button", { name: "Revisar y guardar" }));
    await usuario.click(within(screen.getByRole("group", { name: "Confirmar: Guardar parámetros" })).getByRole("button", { name: "Guardar parámetros" }));
    expect((await screen.findByRole("alert")).textContent).toContain("guardó cambios antes");
    expect((screen.getByLabelText(/Recargo \(%\)/) as HTMLInputElement).value).toBe("18");
    expect(screen.getByRole("button", { name: "Recargar el registro vigente" })).toBeTruthy();
  });
});

describe("personas", () => {
  const credencial = (contrasena: string | null): RespuestaCredencialTemporal => ({
    persona: PERSONA,
    contrasenaTemporal: contrasena,
    contrasenaEntregada: contrasena === null,
    temporalExpiraEn: PERSONA.temporalExpiraEn,
  });

  async function darDeAlta(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(await screen.findByRole("button", { name: "Nueva persona" }));
    await usuario.type(screen.getByLabelText(/^Nombre/), literal(PERSONA.nombre));
    await usuario.type(screen.getByLabelText(/^Correo/), PERSONA.correo);
    await usuario.click(screen.getByRole("checkbox", { name: "Preparador" }));
    await usuario.type(screen.getByLabelText(/Motivo del alta/), literal(MOTIVO));
    await usuario.click(screen.getByRole("button", { name: "Crear y generar contraseña temporal" }));
  }

  it("lista personas con funciones y estado (sin contraseñas ni hashes)", async () => {
    montar(<PantallaAdministracion servicios={servicios()} vista="personas" />);
    expect(await screen.findByText(PERSONA.correo)).toBeTruthy();
    expect(screen.getByText("Contraseña temporal pendiente")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/hash|argon/i);
  });

  it("alta: la contraseña temporal se muestra una vez y desaparece al ocultarla", async () => {
    const crear = vi.fn((_d: unknown, _c: string) => ok(credencial(TEMPORAL)));
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ crearPersona: crear })} vista="personas" />);
    await darDeAlta(usuario);
    expect((await screen.findByLabelText("Contraseña temporal")).textContent).toBe(TEMPORAL);
    expect(crear.mock.calls[0]![0]).toEqual({ nombre: PERSONA.nombre, correo: PERSONA.correo, funciones: ["PREPARADOR"], motivo: MOTIVO });
    await usuario.click(screen.getByRole("button", { name: "Ya la entregué: ocultar" }));
    expect(document.body.innerHTML).not.toContain(TEMPORAL);
  });

  it("si la respuesta se pierde, el reintento usa la misma clave y no muestra otra contraseña", async () => {
    let llamadas = 0;
    const crear = vi.fn((_d: unknown, _c: string): Promise<ResultadoApi<RespuestaCredencialTemporal>> => {
      llamadas++;
      return llamadas === 1 ? Promise.resolve({ ok: false, fallo: { tipo: "red" } }) : ok(credencial(null));
    });
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ crearPersona: crear })} vista="personas" />);
    await darDeAlta(usuario);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await usuario.click(screen.getByRole("button", { name: "Crear y generar contraseña temporal" }));
    expect(await screen.findByText("La contraseña temporal ya se entregó")).toBeTruthy();
    expect(crear.mock.calls[0]![1]).toBe(crear.mock.calls[1]![1]);
    expect(screen.queryByLabelText("Contraseña temporal")).toBeNull();
  });

  it("correo ya registrado: el error aparece junto al campo y no se pierde lo escrito", async () => {
    const crear = vi.fn(() =>
      Promise.resolve<ResultadoApi<RespuestaCredencialTemporal>>({
        ok: false,
        fallo: { tipo: "administracion", codigo: "CORREO_EXISTENTE", mensaje: "Ese correo ya está registrado. Use otro correo.", campos: [{ ruta: "correo", mensaje: "Ese correo ya está registrado." }] },
      }),
    );
    const usuario = userEvent.setup();
    montar(<PantallaAdministracion servicios={servicios({ crearPersona: crear })} vista="personas" />);
    await darDeAlta(usuario);
    expect(await screen.findByText("Ese correo ya está registrado.")).toBeTruthy();
    expect((screen.getByLabelText(/^Correo/) as HTMLInputElement).value).toBe(PERSONA.correo);
  });

  it("detalle: desactivar pide motivo y confirmación; el último administrador se explica", async () => {
    const editar = vi.fn((_id: string, _c: unknown) =>
      Promise.resolve<ResultadoApi<PersonaAdmin>>({
        ok: false,
        fallo: { tipo: "administracion", codigo: "ULTIMO_ADMINISTRADOR", mensaje: "La organización debe conservar al menos un Administrador del sistema activo.", campos: [] },
      }),
    );
    const usuario = userEvent.setup();
    montar(<PantallaPersona servicios={servicios({ editarPersona: editar })} id={PERSONA.id} correoPropio={PROPIA.correo} />);
    const desactivar = await screen.findByRole("button", { name: "Desactivar…" });
    expect((desactivar as HTMLButtonElement).disabled).toBe(true);
    const seccion = screen.getByRole("region", { name: "Desactivar" });
    await usuario.type(within(seccion).getByLabelText(/Motivo/), literal(MOTIVO));
    await usuario.click(desactivar);
    const confirmacion = screen.getByRole("group", { name: "Confirmar: Desactivar" });
    expect(confirmacion.textContent).toMatch(/se cerrarán sus sesiones/);
    await usuario.click(within(confirmacion).getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(editar).toHaveBeenCalledTimes(1));
    expect(editar.mock.calls[0]![1]).toEqual({ revision: 0, motivo: MOTIVO, activa: false });
    expect((await screen.findByRole("alert")).textContent).toContain("al menos un Administrador del sistema activo");
  });

  it("su propia cuenta: no puede retirarse ADMIN_SISTEMA, desactivarse ni restablecerse", async () => {
    montar(<PantallaPersona servicios={servicios()} id={PROPIA.id} correoPropio={PROPIA.correo} />);
    expect(await screen.findByText("Es su propia cuenta")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Administrador del sistema" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Desactivar…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restablecer contraseña…" })).toBeNull();
  });

  it("restablecer: confirma, muestra la temporal nueva una vez y explica que se cierran las sesiones", async () => {
    const restablecer = vi.fn((_id: string, _m: string, _c: string) => ok(credencial(TEMPORAL)));
    const usuario = userEvent.setup();
    montar(<PantallaPersona servicios={servicios({ restablecerContrasena: restablecer })} id={PERSONA.id} correoPropio={PROPIA.correo} />);
    const seccion = await screen.findByRole("region", { name: "Restablecer la contraseña" });
    expect(seccion.textContent).toMatch(/se cierran todas sus sesiones/);
    await usuario.type(within(seccion).getByLabelText(/Motivo/), literal(MOTIVO));
    await usuario.click(within(seccion).getByRole("button", { name: "Restablecer contraseña…" }));
    await usuario.click(within(screen.getByRole("group", { name: "Confirmar: Restablecer" })).getByRole("button", { name: "Restablecer" }));
    expect((await screen.findByLabelText("Contraseña temporal")).textContent).toBe(TEMPORAL);
    expect(restablecer.mock.calls[0]!.slice(0, 2)).toEqual([PERSONA.id, MOTIVO]);
  });
});
