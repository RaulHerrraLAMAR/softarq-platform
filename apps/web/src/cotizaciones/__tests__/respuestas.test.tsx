// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { EventoRespuestaCliente, SeguimientoEmision } from "@softarq/contracts";
import { PanelRespuesta } from "../respuestas.tsx";
import type { ServiciosCotizaciones } from "../../api/servicios-cotizaciones.ts";
const ID = "f7e6f22e-0530-4000-8000-000000000001";
const evento: EventoRespuestaCliente = { id: ID, emisionId: ID, numero: 1, anteriorId: null, tipo: "REGISTRADA", resultado: "ACEPTADA", fechaRespuesta: "2026-10-10", nota: "Nota original", registradoPor: ID, registradoNombre: "[DEMO] Preparadora Íñiguez", registradoEn: "2026-10-11T14:00:00Z", fechaRegistro: "2026-10-11", motivo: null };
const base: SeguimientoEmision = { emisionId: ID, cotizacionId: ID, versionId: ID, idVersion: "COT-2026-00001-v1", fechaEmision: "2026-09-25", vigenteHasta: "2026-10-10", sustituida: false, vigencia: { estado: "VIGENTE", fechaServidor: "2026-10-10", zonaHoraria: "America/Mexico_City" }, respuestaVigente: null, historial: [], siguienteAntesDe: null, acciones: { registrar: { permitida: true, motivo: null }, corregir: { permitida: false, motivo: "No existe un registro que corregir." } } };
const conRespuesta: SeguimientoEmision = { ...base, respuestaVigente: evento, historial: [evento], acciones: { registrar: { permitida: false, motivo: "Ya existe una respuesta: utilice la corrección con motivo." }, corregir: { permitida: true, motivo: null } } };
const ok = <T,>(datos: T) => Promise.resolve({ ok: true as const, datos });
function servicios(s = base) { return { seguimientoEmision: vi.fn<ServiciosCotizaciones["seguimientoEmision"]>(() => ok(s)), registrarRespuesta: vi.fn<ServiciosCotizaciones["registrarRespuesta"]>(() => ok(evento)), corregirRespuesta: vi.fn<ServiciosCotizaciones["corregirRespuesta"]>(() => ok({ ...evento, numero: 2, tipo: "CORREGIDA" as const, anteriorId: ID, motivo: "Se corrigió el registro." })) }; }
async function capturar() { const u = userEvent.setup(); await u.click(await screen.findByRole("button", { name: "Registrar respuesta del cliente" })); await u.selectOptions(screen.getByLabelText("Resultado recibido"), "ACEPTADA"); await u.type(screen.getByLabelText("Nota de la respuesta (opcional)"), "Begoña confirmó el alcance."); return u; }
it("confirma emisión exacta y muestra que se registra internamente", async () => {
  const s = servicios(); render(<PanelRespuesta emisionId={ID} servicios={s} />); const u = await capturar();
  await u.click(screen.getByRole("button", { name: "Revisar registro" })); expect(s.registrarRespuesta).not.toHaveBeenCalled(); expect(screen.getByText(/COT-2026-00001-v1 · Aceptada/)).not.toBeNull();
  s.seguimientoEmision.mockResolvedValue({ ok: true, datos: conRespuesta }); await u.click(screen.getByRole("button", { name: "Confirmar registro interno" }));
  expect(s.registrarRespuesta).toHaveBeenCalledWith(ID,{ resultado:"ACEPTADA",fechaRespuesta:"2026-10-10",nota:"Begoña confirmó el alcance." },expect.any(String));
  expect(await screen.findByText(/Registrada internamente por.*Íñiguez/)).not.toBeNull();
});
it("fallo de red conserva nota y reintenta con la misma clave", async () => {
  const s = servicios(); s.registrarRespuesta.mockResolvedValueOnce({ok:false,fallo:{tipo:"red"}} as never); render(<PanelRespuesta emisionId={ID} servicios={s} />); const u=await capturar();
  await u.click(screen.getByRole("button",{name:"Revisar registro"})); await u.click(screen.getByRole("button",{name:"Confirmar registro interno"}));
  expect((screen.getByLabelText("Nota de la respuesta (opcional)") as HTMLTextAreaElement).value).toBe("Begoña confirmó el alcance."); expect(document.activeElement).toBe(screen.getByRole("alert"));
  await u.click(screen.getByRole("button",{name:"Revisar registro"})); await u.click(screen.getByRole("button",{name:"Confirmar registro interno"}));
  expect(s.registrarRespuesta.mock.calls[0]?.[2]).toBe(s.registrarRespuesta.mock.calls[1]?.[2]);
});
it("conflicto conserva captura, muestra la vencedora y exige elegir corregir su registro", async () => {
  const s=servicios(); s.registrarRespuesta.mockResolvedValueOnce({ok:false,fallo:{tipo:"respuesta",codigo:"CONFLICTO_RESPUESTA",mensaje:"Otra persona registró antes.",seguimientoVigente:conRespuesta}} as never);
  render(<PanelRespuesta emisionId={ID} servicios={s} />); const u=await capturar(); await u.click(screen.getByRole("button",{name:"Revisar registro"})); await u.click(screen.getByRole("button",{name:"Confirmar registro interno"}));
  expect((screen.getByRole("button",{name:"Revisar registro"}) as HTMLButtonElement).disabled).toBe(true); expect(screen.getByText("Nota: Nota original")).not.toBeNull();
  await u.click(screen.getByRole("button",{name:"Corregir el registro vigente con mi captura"})); expect((screen.getByLabelText("Nota de la respuesta (opcional)") as HTMLTextAreaElement).value).toBe("Begoña confirmó el alcance.");
  await u.click(screen.getByRole("button",{name:"Revisar registro"})); expect(s.corregirRespuesta).not.toHaveBeenCalled();
  await u.type(screen.getByLabelText("Motivo de la corrección"),"Se transcribió la nota incompleta."); await u.click(screen.getByRole("button",{name:"Revisar registro"})); await u.click(screen.getByRole("button",{name:"Confirmar registro interno"}));
  expect(s.corregirRespuesta).toHaveBeenCalledWith(ID,ID,expect.objectContaining({motivo:"Se transcribió la nota incompleta."}),expect.any(String));
});
it("documento vencido conserva aceptación histórica y no atribuye sesión al cliente", async () => {
  render(<PanelRespuesta emisionId={ID} servicios={servicios({...conRespuesta,vigencia:{...base.vigencia,estado:"VENCIDA",fechaServidor:"2026-10-11"}})} />);
  expect(await screen.findByText("Vencida",{exact:true})).not.toBeNull(); expect(screen.getByText("Aceptada",{exact:true})).not.toBeNull(); expect(screen.getByText(/respuesta recibida después de ese plazo se bloquea/)).not.toBeNull();
});
it("solo lectura ofrece motivos del servidor y permite consultar el historial", async () => {
  const s=servicios({...conRespuesta,acciones:{registrar:{permitida:false,motivo:"Solo un Preparador puede registrar."},corregir:{permitida:false,motivo:"Solo un Preparador puede corregir."}}}); render(<PanelRespuesta emisionId={ID} servicios={s} />);
  expect(await screen.findByText("Solo un Preparador puede registrar.")).not.toBeNull(); expect(screen.queryByRole("button",{name:"Corregir registro interno"})).toBeNull(); expect(screen.getByText("Nota: Nota original")).not.toBeNull();
});
it("validación accesible y fecha de servidor, sin perder la nota", async () => {
  render(<PanelRespuesta emisionId={ID} servicios={servicios()} />); const u=userEvent.setup(); await u.click(await screen.findByRole("button",{name:"Registrar respuesta del cliente"})); expect((screen.getByLabelText("Fecha en que se recibió la respuesta") as HTMLInputElement).value).toBe("2026-10-10");
  await u.click(screen.getByRole("button",{name:"Revisar registro"})); await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole("alert"))); expect(screen.getByRole("link",{name:"Seleccione Aceptada o Rechazada."}).getAttribute("href")).toBe(`#${screen.getByLabelText("Resultado recibido").id}`);
});
