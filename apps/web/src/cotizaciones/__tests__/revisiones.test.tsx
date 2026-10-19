// @vitest-environment jsdom
/**
 * Revisión en la web (módulo 7): confirmación que identifica folio, versión y total; nada se
 * anuncia antes de la respuesta del servidor; conflictos que conservan lo escrito; respuestas
 * atrasadas descartadas; clasificación de los errores nuevos; rutas.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EsquemaRespuestaCalculoDemo, type DetalleRevision, type ExcepcionesVersion, type ResumenRevision } from "@softarq/contracts";
import { crearClienteApi, type FalloApi, type ResultadoApi } from "../../api/cliente.ts";
import type { ServiciosCotizaciones } from "../../api/servicios-cotizaciones.ts";
import { ProveedorRuta, hashDe, interpretarHash } from "../../navegacion/ruta.tsx";
import { RESPUESTA_CALCULADA } from "../../pruebas/datos.ts";
import { PantallaRevision } from "../revisiones.tsx";

const ID = "6f242666-26a9-41a9-a42b-61cc3eab5476";
const VERSION_ID = "20fe444e-fd3f-4867-ae05-1954b9a8025b";

const resumen = (cambios: Partial<ResumenRevision> = {}): ResumenRevision => ({
  id: ID,
  estado: "PENDIENTE",
  revision: 0,
  cotizacionId: "b34f14b1-47d5-489a-8cba-a0def091bf69",
  folio: "COT-2026-00010",
  origen: "WEB_DEMO",
  version: { id: VERSION_ID, numero: 1, idVersion: "COT-2026-00010-v1", total: "54190.68", fechaCalculo: "2026-09-25" },
  cliente: { codigo: "CLI-00010", nombre: "[DEMO] Cliente" },
  proyecto: { codigo: "PRY-00010", nombre: "[DEMO] Obra" },
  preparador: "[DEMO] Preparador 1",
  enviadoPor: "[DEMO] Preparador 1",
  enviadoEn: "2026-10-03T15:00:00.000Z",
  resueltaPor: null,
  resueltaEn: null,
  observaciones: null,
  anulacion: null,
  emitida: false,
  acciones: { aprobar: true, solicitarCambios: true, retirar: false, anularAprobacion: false, motivoNoAprobar: null },
  ...cambios,
});

const detalle = (r: ResumenRevision = resumen()): DetalleRevision => ({
  revision: r,
  version: {
    folio: r.folio,
    origen: "WEB_DEMO",
    version: {
      id: VERSION_ID,
      numero: 1,
      idVersion: r.version.idVersion,
      estado: r.estado === "APROBADA" ? "APROBADA" : r.estado === "PENDIENTE" ? "EN_REVISION" : "BORRADOR",
      esUltima: true,
      revisionVigente: null,
      emision: null,
      revisionBorrador: 0,
      fechaCalculo: "2026-09-25",
      creadoEn: "2026-10-03T14:00:00.000Z",
      autor: r.preparador,
      total: r.version.total,
      motivo: null,
    },
    cliente: r.cliente,
    proyecto: { ...r.proyecto, ubicacion: null, descripcion: null },
    versionMotor: "motor-1",
    huellaCalculo: "a".repeat(64),
    captura: { consolidarCompras: true, partidas: [], seleccion: [] },
    cotizacion: { ...RESPUESTA_CALCULADA.cotizacion, total: r.version.total },
    avisos: [],
    cambios: {
      versionAnterior: null,
      partidasAgregadas: [],
      partidasQuitadas: [],
      partidasModificadas: [],
      seleccionCambiada: [],
      consolidacionCambiada: false,
      datosDescriptivosCambiados: [],
      condicionesCambiadas: false,
      totalAnterior: null,
      totalNuevo: r.version.total,
    },
  },
  verificacion: r.estado === "PENDIENTE" ? { fechaReferencia: "2026-09-25", bloqueos: [], avisos: [{ codigo: "AV-03", mensaje: "Sobrante." }] } : null,
  eventos: [{ secuencia: 1, tipo: "ENVIADA", estadoAnterior: null, estadoNuevo: "PENDIENTE", usuario: r.enviadoPor, ocurridoEn: r.enviadoEn, observaciones: null, avisos: ["AV-03"] }],
});

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true, datos });
const falla = <T,>(fallo: FalloApi): Promise<ResultadoApi<T>> => Promise.resolve({ ok: false, fallo });

function servicios(s: Partial<ServiciosCotizaciones>): ServiciosCotizaciones {
  const noUsar = () => Promise.reject(new Error("no se esperaba esta llamada"));
  return {
    // Módulo 11: verificación vigente de la última versión (sin cambios de catálogo por omisión).
    verificarVersion: () => ok({ fechaReferencia: "2026-10-01", bloqueos: [], avisos: [] }),
    listarClientes: noUsar,
    detalleCliente: noUsar,
    crearCliente: noUsar,
    editarCliente: noUsar,
    listarProyectos: noUsar,
    crearProyecto: noUsar,
    editarProyecto: noUsar,
    listarCotizaciones: noUsar,
    crearCotizacion: noUsar,
    detalleCotizacion: noUsar,
    guardarBorrador: noUsar,
    crearVersion: noUsar,
    consultarVersion: noUsar,
    enviarRevision: noUsar,
    listarRevisiones: noUsar,
    detalleRevision: () => ok(detalle()),
    decidirRevision: noUsar,
    retirarRevision: noUsar,
    anularAprobacion: noUsar,
    descartarCotizacion: noUsar,
    validarEmision: noUsar,
    emitir: noUsar,
    detalleEmision: noUsar,
    descargarDocumento: noUsar,
    emisor: noUsar,
    guardarEmisor: noUsar,
    seguimientoEmision: noUsar,
    componentesExcepcion: noUsar,
    excepcionesVersion: noUsar,
    salidasInternas: noUsar,
    decidirExcepcion: noUsar,
    registrarRespuesta: noUsar,
    corregirRespuesta: noUsar,
    ...s,
  };
}

function abrir(s: ServiciosCotizaciones) {
  window.history.replaceState(null, "", hashDe({ pantalla: "revision", id: ID }));
  return render(
    <ProveedorRuta>
      <PantallaRevision servicios={s} id={ID} />
    </ProveedorRuta>,
  );
}

describe("decisión del revisor", () => {
  it("la confirmación identifica folio, versión y total; no se anuncia la aprobación antes de la respuesta del servidor", async () => {
    let responder: (r: ResultadoApi<DetalleRevision>) => void = () => {};
    const decidirRevision = vi.fn(() => new Promise<ResultadoApi<DetalleRevision>>((r) => (responder = r)));
    const u = userEvent.setup();
    abrir(servicios({ decidirRevision }));
    await u.click(await screen.findByRole("button", { name: "Aprobar…" }));
    const grupo = screen.getByRole("group", { name: /Va a aprobar COT-2026-00010-v1 por \$54,190\.68/ });
    expect(grupo.textContent).toContain("La aprobación no es una emisión ni una entrega al cliente.");
    await u.click(within(grupo).getByRole("button", { name: "Confirmar aprobación de COT-2026-00010-v1" }));
    expect(decidirRevision).toHaveBeenCalledWith(
      ID,
      { decision: "APROBAR", versionId: VERSION_ID, revision: 0, observaciones: null },
      expect.any(String),
    );
    // Aún sin respuesta: nada dice «aprobada».
    expect(screen.queryByText(/aprobada por/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Registrando…" })).toHaveProperty("disabled", true);
    responder({ ok: true, datos: detalle(resumen({ estado: "APROBADA", revision: 1, resueltaPor: "[DEMO] Revisor 1", resueltaEn: "2026-10-03T16:00:00.000Z" })) });
    expect(await screen.findByText("COT-2026-00010-v1 aprobada por [DEMO] Revisor 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprobar…" })).toBeNull();
  });

  it("solicitar cambios exige una explicación útil (validación local; el servidor también la exige)", async () => {
    const decidirRevision = vi.fn(() => ok(detalle(resumen({ estado: "CAMBIOS_SOLICITADOS", revision: 1, observaciones: "Revise el faldón sur." }))));
    const u = userEvent.setup();
    abrir(servicios({ decidirRevision }));
    await u.click(await screen.findByRole("button", { name: "Solicitar cambios…" }));
    await u.type(screen.getByLabelText(/Observaciones para el preparador/), "mal");
    await u.click(screen.getByRole("button", { name: "Confirmar solicitud de cambios" }));
    expect(screen.getByRole("alert").textContent).toMatch(/al menos 10 caracteres/);
    expect(decidirRevision).not.toHaveBeenCalled();
    await u.type(screen.getByLabelText(/Observaciones para el preparador/), " medido el faldón sur");
    await u.click(screen.getByRole("button", { name: "Confirmar solicitud de cambios" }));
    await waitFor(() => expect(decidirRevision).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Cambios solicitados en COT-2026-00010-v1")).toBeTruthy();
  });

  it("409 de pantalla obsoleta: explica el estado vigente, conserva lo escrito y permite actualizar", async () => {
    const vigente = resumen({ estado: "APROBADA", revision: 1, resueltaPor: "[DEMO] Revisor 2", resueltaEn: "2026-10-03T16:00:00.000Z" });
    const detalleRevision = vi.fn(() => ok(detalle()));
    const decidirRevision = vi.fn(() =>
      falla<DetalleRevision>({ tipo: "revision", codigo: "CONFLICTO_REVISION", mensaje: "La revisión ya no está pendiente: aprobada.", revisionVigente: vigente }),
    );
    const u = userEvent.setup();
    abrir(servicios({ detalleRevision, decidirRevision }));
    await u.click(await screen.findByRole("button", { name: "Solicitar cambios…" }));
    const campo = screen.getByLabelText(/Observaciones para el preparador/);
    await u.type(campo, "Revise las medidas del faldón sur.");
    await u.click(screen.getByRole("button", { name: "Confirmar solicitud de cambios" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("La revisión cambió mientras la tenía abierta");
    expect(alerta.textContent).toContain("Aprobada");
    expect(alerta.textContent).toContain("[DEMO] Revisor 2");
    expect(alerta.textContent).toContain("Sus observaciones se conservan");
    expect((screen.getByLabelText(/Observaciones para el preparador/) as HTMLTextAreaElement).value).toBe("Revise las medidas del faldón sur.");
    await u.click(within(alerta).getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(detalleRevision).toHaveBeenCalledTimes(2));
  });

  it("BL-17: si la sesión preparó la versión, no se ofrece aprobar y se explica por qué", async () => {
    const r = resumen({ acciones: { aprobar: false, solicitarCambios: true, retirar: false, anularAprobacion: false, motivoNoAprobar: "BL-17: usted preparó esta versión." } });
    abrir(servicios({ detalleRevision: () => ok(detalle(r)) }));
    expect(await screen.findByText("BL-17: usted preparó esta versión.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprobar…" })).toBeNull();
  });

  it("una aprobación bloqueada por la verificación vigente muestra los códigos y no cambia el estado", async () => {
    const decidirRevision = vi.fn(() =>
      falla<DetalleRevision>({
        tipo: "bloqueado",
        codigo: "APROBACION_BLOQUEADA",
        mensaje: "No se puede aprobar; el estado no cambió.",
        problemas: [{ codigo: "BL-09", referencia: "PRE-000007", mensaje: "Precio vencido." }],
      }),
    );
    const u = userEvent.setup();
    abrir(servicios({ decidirRevision }));
    await u.click(await screen.findByRole("button", { name: "Aprobar…" }));
    await u.click(screen.getByRole("button", { name: /Confirmar aprobación/ }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("No se puede aprobar; el estado no cambió.");
    expect(alerta.textContent).toContain("BL-09");
    expect(screen.getByText("En revisión")).toBeTruthy();
  });
});

describe("aprobar y autorizar excepciones a la vez (regresión del fallo intermitente de E2E)", () => {
  it("si la 422 de la aprobación llega mientras se autoriza la excepción, el bloqueo anterior no se queda en pantalla", async () => {
    // Orden reproducido con promesas controladas: «Confirmar aprobación» → «Autorizar excepción» →
    // llega la 422 de la aprobación → llega la autorización. Antes, `alDecidir` leía el estado del
    // envío del render en que se pulsó «Autorizar» («enviando») y no limpiaba el bloqueo.
    let resolverAprobacion!: (r: ResultadoApi<DetalleRevision>) => void;
    let resolverDecision!: (r: ResultadoApi<ExcepcionesVersion>) => void;
    const decidirRevision = vi.fn(() => new Promise<ResultadoApi<DetalleRevision>>((r) => (resolverAprobacion = r)));
    const decidirExcepcion = vi.fn(() => new Promise<ResultadoApi<ExcepcionesVersion>>((r) => (resolverDecision = r)));
    const excepciones: ExcepcionesVersion = {
      versionId: VERSION_ID,
      idVersion: "COT-2026-00010-v1",
      revisionId: ID,
      excepciones: [
        {
          numero: 1,
          tipo: "RENDIMIENTO",
          referencia: "rendimiento del componente CMP-00011 en la partida 1 (CON-00009)",
          campo: "RENDIMIENTO",
          valorOriginal: "12.5 pza",
          valorAplicado: "13",
          motivo: "Block de mayor formato verificado en obra.",
          estado: "PENDIENTE",
          decision: null,
        },
      ],
      acciones: { decidir: { permitida: true, motivo: null } },
    };
    const autorizada: ExcepcionesVersion = {
      ...excepciones,
      excepciones: [{ ...excepciones.excepciones[0]!, estado: "AUTORIZADA", decision: { por: "[DEMO] Revisora", en: "2026-09-25T15:00:00Z", comentario: null } }],
    };
    const u = userEvent.setup();
    window.history.replaceState(null, "", hashDe({ pantalla: "revision", id: ID }));
    render(
      <ProveedorRuta>
        <PantallaRevision
          servicios={servicios({ decidirRevision, decidirExcepcion, excepcionesVersion: () => ok(excepciones) })}
          id={ID}
          puedeVerExcepciones
        />
      </ProveedorRuta>,
    );
    await u.click(await screen.findByRole("button", { name: "Aprobar…" }));
    await u.click(screen.getByRole("button", { name: /Confirmar aprobación/ }));
    await u.click(await screen.findByRole("button", { name: "Autorizar excepción 1…" }));
    await u.click(screen.getByRole("button", { name: "Confirmar autorización de la excepción 1" }));
    await act(async () =>
      resolverAprobacion({
        ok: false,
        fallo: {
          tipo: "bloqueado",
          codigo: "APROBACION_BLOQUEADA",
          mensaje: "No se puede aprobar; el estado no cambió.",
          problemas: [{ codigo: "BL-05", referencia: "1", mensaje: "La excepción 1 no está autorizada por el revisor." }],
        },
      }),
    );
    expect(await screen.findByText("No se puede aprobar; el estado no cambió.")).toBeTruthy();
    await act(async () => resolverDecision({ ok: true, datos: autorizada }));
    expect(await screen.findByText("Excepción 1 autorizada.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("No se puede aprobar; el estado no cambió.")).toBeNull());
    // La pantalla no queda «enviando»: se puede volver a aprobar.
    expect((screen.getByRole("button", { name: /Confirmar aprobación/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("cliente HTTP: errores de la revisión y de referencias", () => {
  const error = (codigo: string, extra: object = {}) => ({ error: { codigo, mensaje: "m", solicitudId: "id", ...extra } });
  async function fallo(estado: number, cuerpo: unknown): Promise<FalloApi> {
    const cliente = crearClienteApi("http://127.0.0.1:3000", async () =>
      new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } }),
    );
    const r = await cliente.enviar("/x", EsquemaRespuestaCalculoDemo, { cuerpo: {} });
    if (r.ok) throw new Error("se esperaba un fallo");
    return r.fallo;
  }
  it("409 de revisión, 422 de bloqueo de envío/aprobación/BL-17 y 422 de referencia no disponible", async () => {
    expect(await fallo(409, error("CONFLICTO_REVISION", { revisionVigente: { estado: "APROBADA" } }))).toEqual({
      tipo: "revision",
      codigo: "CONFLICTO_REVISION",
      mensaje: "m",
      revisionVigente: { estado: "APROBADA" },
    });
    expect((await fallo(409, error("REVISION_PENDIENTE"))).tipo).toBe("revision");
    for (const c of ["ENVIO_BLOQUEADO", "APROBACION_BLOQUEADA", "DECISION_BLOQUEADA"]) {
      expect(await fallo(422, error(c, { problemas: [{ codigo: "BL-17", referencia: "r", mensaje: "x" }] }))).toEqual({
        tipo: "bloqueado",
        codigo: c,
        mensaje: "m",
        problemas: [{ codigo: "BL-17", referencia: "r", mensaje: "x" }],
      });
    }
    expect(await fallo(422, error("REFERENCIA_NO_DISPONIBLE", { campos: [{ ruta: "seleccion[0].precioCodigo", mensaje: "x" }] }))).toEqual({
      tipo: "referencia",
      campos: [{ ruta: "seleccion[0].precioCodigo", mensaje: "x" }],
    });
  });
});

describe("rutas de revisión", () => {
  it("bandeja y detalle tienen URL estable", () => {
    expect(interpretarHash(hashDe({ pantalla: "revisiones" }))).toEqual({ pantalla: "revisiones" });
    expect(interpretarHash(hashDe({ pantalla: "revision", id: ID }))).toEqual({ pantalla: "revision", id: ID });
    expect(interpretarHash("#/revisiones/no-es-uuid")).toEqual({ pantalla: "no-encontrada" });
  });
});

describe("anulación de la aprobación (módulo 8)", () => {
  it("solo con motivo útil; registra la anulación y la muestra sin borrar la aprobación", async () => {
    const aprobada = resumen({
      estado: "APROBADA",
      revision: 1,
      resueltaPor: "[DEMO] Revisor 1",
      resueltaEn: "2026-10-03T15:10:00.000Z",
      acciones: { aprobar: false, solicitarCambios: false, retirar: false, anularAprobacion: true, motivoNoAprobar: null },
    });
    const anulada = resumen({
      ...aprobada,
      anulacion: { por: "[DEMO] Revisor 1", en: "2026-10-03T16:00:00.000Z", motivo: "El cliente pidió cambiar el alcance." },
      acciones: { aprobar: false, solicitarCambios: false, retirar: false, anularAprobacion: false, motivoNoAprobar: null },
    });
    const anularAprobacion = vi.fn(() => ok(detalle(anulada)));
    const u = userEvent.setup();
    abrir(servicios({ detalleRevision: () => ok(detalle(aprobada)), anularAprobacion }));
    await u.click(await screen.findByRole("button", { name: "Anular la aprobación…" }));
    await u.type(screen.getByLabelText(/Motivo de la anulación/), "no");
    await u.click(screen.getByRole("button", { name: "Confirmar anulación" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/al menos 10 caracteres/);
    expect(anularAprobacion).not.toHaveBeenCalled();
    await u.clear(screen.getByLabelText(/Motivo de la anulación/));
    await u.type(screen.getByLabelText(/Motivo de la anulación/), "El cliente pidió cambiar el alcance.");
    await u.click(screen.getByRole("button", { name: "Confirmar anulación" }));
    expect(anularAprobacion).toHaveBeenCalledWith(ID, 1, "El cliente pidió cambiar el alcance.", expect.any(String));
    expect(await screen.findByText("Aprobación anulada por [DEMO] Revisor 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Anular la aprobación…" })).toBeNull();
  });
});
