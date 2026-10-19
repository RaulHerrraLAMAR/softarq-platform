// @vitest-environment jsdom
/**
 * Emisión en la web (módulo 8, ADR-0010): validación visible antes de emitir, confirmación con
 * folio, versión, destinatario y total; nada se anuncia antes del 201; los fallos conservan el
 * contexto y reintentan con la MISMA clave; descarga del documento; textos de la versión;
 * anulación y descarte con motivo; clasificación de los errores nuevos.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DetalleCotizacion, DetalleEmision, ResumenEmision, ResumenVersion, ValidacionEmision } from "@softarq/contracts";
import { crearClienteApi, type FalloApi, type ResultadoApi } from "../../api/cliente.ts";
import type { ServiciosCotizaciones } from "../../api/servicios-cotizaciones.ts";
import { huellaBorrador, serializarBorrador } from "../../captura/borrador.ts";
import { ESTADO_INICIAL, reducir } from "../../captura/estado.ts";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { PanelDescarte, PanelEmision, TarjetaEmision, TextosVersion } from "../emision.tsx";

const COT = "b34f14b1-47d5-489a-8cba-a0def091bf69";
const VERSION_ID = "20fe444e-fd3f-4867-ae05-1954b9a8025b";
const REVISION_ID = "6f242666-26a9-41a9-a42b-61cc3eab5476";
const TEXTOS = { alcance: "[DEMO] Alcance.", condiciones: "[DEMO] Condiciones.", exclusiones: "[DEMO] Exclusiones." };

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
    detalleRevision: noUsar,
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
    duplicarCotizacion: noUsar,
    prepararNuevaVersion: noUsar,
    vistaPrevia: noUsar,
    decidirExcepcion: noUsar,
    registrarRespuesta: noUsar,
    corregirRespuesta: noUsar,
    ...s,
  };
}

const VERSION: ResumenVersion = {
  id: VERSION_ID,
  numero: 2,
  idVersion: "COT-2026-00010-v2",
  estado: "APROBADA",
  esUltima: true,
  revisionVigente: {
    id: REVISION_ID,
    estado: "APROBADA",
    revision: 1,
    enviadoPor: "[DEMO] Preparador 1",
    enviadoEn: "2026-10-03T15:00:00.000Z",
    resueltaPor: "[DEMO] Revisor 1",
    resueltaEn: "2026-10-03T15:10:00.000Z",
    observaciones: null,
    anulacion: null,
  },
  emision: null,
  revisionBorrador: 2,
  fechaCalculo: "2026-09-25",
  creadoEn: "2026-10-03T14:00:00.000Z",
  autor: "[DEMO] Preparador 1",
  total: "54190.68",
  motivo: null,
  modoPrecios: null,
  versionOrigen: null,
};

const validacion = (cambios: Partial<ValidacionEmision> = {}): ValidacionEmision => ({
  fechaEmision: "2026-09-25",
  vigenciaDias: 15,
  vigenteHasta: "2026-10-10",
  version: { id: VERSION_ID, numero: 2, idVersion: "COT-2026-00010-v2", total: "54190.68", esUltima: true },
  aprobacion: { revisionId: REVISION_ID, aprobadaPor: "[DEMO] Revisor 1", aprobadaEn: "2026-10-03T15:10:00.000Z" },
  preparador: "[DEMO] Preparador 1",
  destinatario: {
    cliente: { codigo: "CLI-00010", nombre: "[DEMO] Construcción Peñasco" },
    proyecto: { codigo: "PRY-00010", nombre: "[DEMO] Bodega", ubicacion: "Mérida, Yucatán", descripcion: "Nave." },
    contacto: { nombre: "Begoña Muñoz", telefono: "55 1234 5678", correo: null },
  },
  emisor: { nombre: "[DEMO] EMISOR DE DEMOSTRACIÓN (ficticio)", domicilio: "D", telefono: "T", correo: "c@e.invalid", logo: "DEMO" },
  textos: TEXTOS,
  bloqueos: [],
  avisos: [],
  puedeEmitir: true,
  motivoNoEmitir: null,
  emision: null,
  ...cambios,
});

const EMISION: ResumenEmision = {
  id: "9d1b1e7f-5a0a-4b66-9f0e-6a3b2f1c0d11",
  folio: "COT-2026-00010",
  versionNumero: 2,
  idVersion: "COT-2026-00010-v2",
  origen: "WEB_DEMO",
  fechaEmision: "2026-09-25",
  vigenciaDias: 15,
  vigenteHasta: "2026-10-10",
  total: "54190.68",
  preparadoPor: "[DEMO] Preparador 1",
  aprobadoPor: "[DEMO] Revisor 1",
  emitidoPor: "[DEMO] Preparador 1",
  emitidoEn: "2026-10-03T16:00:00.000Z",
  plantillaVersion: "cotizacion-web-demo/1",
  sustituida: false,
  archivo: { nombre: "COT-2026-00010-v2.pdf", bytes: 51200, sha256: "ab".repeat(32) },
};

function montarPanel(s: ServiciosCotizaciones, alEmitida = vi.fn()) {
  render(
    <ProveedorRuta>
      <PanelEmision cotizacionId={COT} version={VERSION} cotizaciones={s} alEmitida={alEmitida} alActualizar={vi.fn()} />
    </ProveedorRuta>,
  );
  return alEmitida;
}

describe("panel de emisión", () => {
  it("muestra destinatario, aprobación y fechas; la confirmación identifica folio, versión, destinatario y total; nada se anuncia antes del 201", async () => {
    let responder: (r: ResultadoApi<DetalleEmision>) => void = () => {};
    const emitir = vi.fn((_id: string, _n: number, _d: unknown, _clave: string) => new Promise<ResultadoApi<DetalleEmision>>((r) => (responder = r)));
    const u = userEvent.setup();
    const alEmitida = montarPanel(servicios({ validarEmision: () => ok(validacion()), emitir }));
    expect(await screen.findByText(/\[DEMO\] Revisor 1 · /)).toBeTruthy();
    expect(screen.getByText(/Begoña Muñoz · 55 1234 5678/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Emitir COT-2026-00010-v2…" }));
    const grupo = screen.getByRole("group", { name: /Emitir COT-2026-00010-v2 por \$54,190\.68/ });
    expect(grupo.textContent).toContain("[DEMO] Construcción Peñasco");
    expect(grupo.textContent).toContain("Begoña Muñoz");
    expect(grupo.textContent).toContain("25/09/2026");
    expect(grupo.textContent).toContain("10/10/2026");
    await u.click(within(grupo).getByRole("button", { name: "Confirmar emisión de COT-2026-00010-v2" }));
    expect(emitir).toHaveBeenCalledWith(COT, 2, { versionId: VERSION_ID, revisionId: REVISION_ID }, expect.any(String));
    // Generando: botón deshabilitado y sin anunciar éxito.
    const boton = screen.getByRole("button", { name: "Generando el documento…" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(alEmitida).not.toHaveBeenCalled();
    responder({ ok: true, datos: { emision: EMISION, documento: {} as DetalleEmision["documento"] } });
    await waitFor(() => expect(alEmitida).toHaveBeenCalledTimes(1));
  });

  it("muestra los bloqueos con cómo corregirlos y no permite emitir", async () => {
    montarPanel(
      servicios({
        validarEmision: () =>
          ok(
            validacion({
              puedeEmitir: false,
              bloqueos: [
                { codigo: "BL-01", referencia: "CLI-00010", mensaje: "El cliente CLI-00010 no tiene nombre de contacto." },
                { codigo: "BL-15", referencia: "EMISOR", mensaje: "Datos del emisor incompletos: correo." },
              ],
              avisos: [{ codigo: "AV-02", mensaje: "El precio PRE-1 vence antes." }],
            }),
          ),
      }),
    );
    expect(await screen.findByText(/2 bloqueo\(s\): no se puede emitir/)).toBeTruthy();
    expect(screen.getByText(/Complete el contacto en la ficha del cliente/)).toBeTruthy();
    expect(screen.getByText(/El Administrador del sistema completa los datos del emisor/)).toBeTruthy();
    expect(screen.getByText(/AV-02/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Emitir COT-2026-00010-v2…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un fallo de generación conserva el contexto y el reintento usa la MISMA clave (sin duplicar)", async () => {
    const emitir = vi
      .fn()
      .mockImplementationOnce(() =>
        falla<DetalleEmision>({ tipo: "documento", codigo: "DOCUMENTO_NO_GENERADO", mensaje: "No se generó el documento; la versión sigue aprobada y sin emitir." }),
      )
      .mockImplementationOnce(() => ok<DetalleEmision>({ emision: EMISION, documento: {} as DetalleEmision["documento"] }));
    const u = userEvent.setup();
    const alEmitida = montarPanel(servicios({ validarEmision: () => ok(validacion()), emitir }));
    await u.click(await screen.findByRole("button", { name: "Emitir COT-2026-00010-v2…" }));
    await u.click(screen.getByRole("button", { name: "Confirmar emisión de COT-2026-00010-v2" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("No se emitió");
    expect(alerta.textContent).toContain("sigue aprobada y sin emitir");
    await u.click(within(alerta).getByRole("button", { name: "Reintentar (sin duplicar)" }));
    await waitFor(() => expect(alEmitida).toHaveBeenCalledTimes(1));
    expect(emitir.mock.calls[0]![3]).toBe(emitir.mock.calls[1]![3]);
  });

  it("si la aprobación se anuló mientras tanto (409), no se emite y se ofrece actualizar", async () => {
    const u = userEvent.setup();
    montarPanel(
      servicios({
        validarEmision: () => ok(validacion()),
        emitir: () => falla({ tipo: "estado", codigo: "APROBACION_NO_VIGENTE", mensaje: "La aprobación de esta versión ya no está vigente." }),
      }),
    );
    await u.click(await screen.findByRole("button", { name: "Emitir COT-2026-00010-v2…" }));
    await u.click(screen.getByRole("button", { name: "Confirmar emisión de COT-2026-00010-v2" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("El estado cambió: no se emitió");
    expect(within(alerta).getByRole("button", { name: "Actualizar" })).toBeTruthy();
  });
});

describe("documento emitido", () => {
  it("EMITIDA se distingue; la descarga pide el archivo emitido y un archivo dañado se informa sin sustituirlo", async () => {
    const descargarDocumento = vi.fn(() =>
      falla<Blob>({ tipo: "documento", codigo: "DOCUMENTO_NO_DISPONIBLE", mensaje: "El documento emitido no está disponible o no coincide con su registro." }),
    );
    const u = userEvent.setup();
    render(<TarjetaEmision emision={EMISION} cotizaciones={servicios({ descargarDocumento })} />);
    expect(screen.getByText("Emitida")).toBeTruthy();
    expect(screen.getByText(/\[DEMO\] Preparador 1 · \[DEMO\] Revisor 1 · \[DEMO\] Preparador 1/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(descargarDocumento).toHaveBeenCalledWith(EMISION.id);
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("no está disponible o no coincide");
  });

  it("el cliente HTTP descarga el PDF con la sesión y valida el tipo; los errores de documento y de estado se clasifican", async () => {
    const pdf = new Blob(["%PDF-1.7 prueba"], { type: "application/pdf" });
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { codigo: "DOCUMENTO_NO_DISPONIBLE", mensaje: "No disponible.", solicitudId: "x" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { codigo: "VERSION_EMITIDA", mensaje: "Ya se emitió.", solicitudId: "x" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    const api = crearClienteApi("http://localhost:3000", fetchFalso as unknown as typeof fetch);
    const r1 = await api.descargar("/api/v1/emisiones/x/documento", "application/pdf");
    expect(r1.ok).toBe(true);
    expect(fetchFalso.mock.calls[0]![1]).toMatchObject({ credentials: "include", headers: { Accept: "application/pdf" } });
    expect(await api.descargar("/x", "application/pdf")).toEqual({
      ok: false,
      fallo: { tipo: "documento", codigo: "DOCUMENTO_NO_DISPONIBLE", mensaje: "No disponible." },
    });
    expect(await api.obtener("/y", { safeParse: () => ({ success: true, data: null }) } as never)).toEqual({
      ok: false,
      fallo: { tipo: "estado", codigo: "VERSION_EMITIDA", mensaje: "Ya se emitió." },
    });
    expect(await api.descargar("/z", "application/pdf")).toEqual({ ok: false, fallo: { tipo: "incompatible" } });
  });
});

describe("textos de la versión", () => {
  it("se editan en la captura, viajan en el borrador y cambian la huella (cambios sin guardar); sin textos no se envían", () => {
    const base = reducir(ESTADO_INICIAL, {
      tipo: "CARGAR_BORRADOR",
      folio: "COT-2026-00010",
      borrador: { consolidarCompras: true, partidas: [], seleccion: [] },
      conceptos: [],
    }).captura!;
    expect(base.textos).toBeNull();
    const s0 = serializarBorrador(base);
    expect(s0.ok && "textos" in s0.borrador).toBe(false);
    const conTexto = reducir({ captura: base }, { tipo: "EDITAR_TEXTO", campo: "alcance", valor: "Nuevo alcance" }).captura!;
    expect(conTexto.textos).toEqual({ alcance: "Nuevo alcance", condiciones: "", exclusiones: "" });
    expect(huellaBorrador(conTexto)).not.toBe(huellaBorrador(base));
    const fijados = reducir({ captura: conTexto }, { tipo: "FIJAR_TEXTOS", textos: TEXTOS }).captura!;
    const s = serializarBorrador(fijados);
    expect(s.ok && s.borrador.textos).toEqual(TEXTOS);
  });

  it("la revisión muestra los textos de la versión; una versión sin textos avisa BL-20", () => {
    const { rerender } = render(<TextosVersion textos={TEXTOS} />);
    expect(screen.getByText("[DEMO] Alcance.")).toBeTruthy();
    rerender(<TextosVersion textos={null} />);
    expect(screen.getByText(/no tiene textos \(BL-20\)/)).toBeTruthy();
  });
});

describe("descarte", () => {
  const detalle = (permitido: boolean, motivo: string | null = null): DetalleCotizacion =>
    ({
      cotizacion: { id: COT, folio: "COT-2026-00010", estadoFolio: "ACTIVO", descarte: null },
      descartar: { permitido, motivoNoPermitido: motivo },
    }) as unknown as DetalleCotizacion;

  it("exige un motivo útil, confirma el folio y no se anuncia antes de la respuesta", async () => {
    const descartarCotizacion = vi.fn(() => ok({} as DetalleCotizacion));
    const alDescartada = vi.fn();
    const u = userEvent.setup();
    render(<PanelDescarte detalle={detalle(true)} cotizaciones={servicios({ descartarCotizacion })} alDescartada={alDescartada} />);
    await u.click(screen.getByRole("button", { name: "Descartar la cotización…" }));
    await u.type(screen.getByLabelText(/Motivo del descarte/), "corto");
    await u.click(screen.getByRole("button", { name: "Confirmar descarte de COT-2026-00010" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/al menos 10 caracteres/);
    expect(descartarCotizacion).not.toHaveBeenCalled();
    await u.type(screen.getByLabelText(/Motivo del descarte/), " — el cliente desistió");
    await u.click(screen.getByRole("button", { name: "Confirmar descarte de COT-2026-00010" }));
    await waitFor(() => expect(alDescartada).toHaveBeenCalledTimes(1));
    expect(descartarCotizacion).toHaveBeenCalledWith(COT, "corto — el cliente desistió", expect.any(String));
  });

  it("si el estado no lo permite, explica por qué (revisión pendiente o aprobación vigente)", () => {
    render(<PanelDescarte detalle={detalle(false, "La versión v2 está aprobada: un Revisor debe anular la aprobación antes de descartar.")} cotizaciones={servicios({})} alDescartada={vi.fn()} />);
    expect(screen.getByText(/un Revisor debe anular la aprobación/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Descartar la cotización…" })).toBeNull();
  });
});
