// @vitest-environment jsdom
/**
 * Web del módulo 6: borrador (ausencia, cero e inválido), hidratación sin pérdida, rutas, y el
 * editor de cotización con cambios sin guardar, conflicto recuperable, reintento idempotente y
 * consulta de solo lectura. La API se simula con la forma pública de los contratos.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CapturaBorrador, DetalleCotizacion, ReferenciasBorrador, RespuestaBorradorGuardado, Version } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import type { ServiciosCotizaciones } from "../../api/servicios-cotizaciones.ts";
import { huellaBorrador, huellaDeBorrador, serializarBorrador } from "../../captura/borrador.ts";
import { ESTADO_INICIAL, reducir } from "../../captura/estado.ts";
import { ProveedorRuta, hashDe, interpretarHash, type Ruta } from "../../navegacion/ruta.tsx";
import { CON_AREA, RESPUESTA_CALCULADA, serviciosFalsos } from "../../pruebas/datos.ts";
import { PantallaCotizacion } from "../EditorCotizacion.tsx";

const ID = "5d0f1c7e-1111-4aaa-8bbb-000000000001";

/** Todas las referencias disponibles: el servidor no informa nada que conservar marcado. */
const SIN_REFERENCIAS_NO_DISPONIBLES: ReferenciasBorrador = { conceptos: [], selecciones: [], tiposAdicional: [] };

const BORRADOR: CapturaBorrador = {
  consolidarCompras: true,
  partidas: [
    {
      tipo: "CONCEPTO",
      conceptoCodigo: "CON-00007",
      descripcion: "[DEMO] Cubierta ligera",
      mediciones: [{ descripcion: "", signo: "+", piezas: "1", largo: "10", ancho: "4.5", alto: null, segundaMedida: "ancho" }],
    },
  ],
  seleccion: [
    { insumoCodigo: "INS-00004", precioCodigo: "PRE-000006" },
    { insumoCodigo: "INS-00005", precioCodigo: "PRE-000008" },
  ],
};

function detalle(revision = 3, versiones: DetalleCotizacion["versiones"] = []): DetalleCotizacion {
  return {
    cotizacion: {
      id: ID,
      folio: "COT-2026-00001",
      origen: "WEB_DEMO",
      estadoFolio: "ACTIVO",
      descarte: null,
      cliente: { id: "c1", codigo: "CLI-00001", nombre: "[DEMO] Cliente", activo: true },
      proyecto: { id: "p1", codigo: "PRY-00001", nombre: "[DEMO] Obra", activo: true },
      creadoEn: "2026-10-03T15:00:00.000Z",
      creadoPor: "[DEMO] Preparador 1",
      revisionBorrador: revision,
      borradorActualizadoEn: "2026-10-03T15:05:00.000Z",
      ultimaVersion: versiones[0] ?? null,
    },
    borrador: {
      revision,
      captura: BORRADOR,
      actualizadoPor: "[DEMO] Preparador 1",
      actualizadoEn: "2026-10-03T15:05:00.000Z",
      completitud: { lista: true, pendientes: [] },
      referencias: SIN_REFERENCIAS_NO_DISPONIBLES,
      textosPredeterminados: null,
    },
    versiones,
    descartar: { permitido: true, motivoNoPermitido: null },
    revisiones: [],
    eventos: [],
  };
}

const VERSION: Version = {
  folio: "COT-2026-00001",
  origen: "WEB_DEMO",
  version: {
    id: "4d745608-0934-4e68-a067-0346beeec59c",
    numero: 1,
    idVersion: "COT-2026-00001-v1",
    estado: "BORRADOR",
    esUltima: true,
    revisionVigente: null,
    emision: null,
    revisionBorrador: 4,
    fechaCalculo: "2026-09-25",
    creadoEn: "2026-10-03T15:10:00.000Z",
    autor: "[DEMO] Preparador 1",
    total: "2320.00",
    motivo: null,
  },
  cliente: { codigo: "CLI-00001", nombre: "[DEMO] Cliente" },
  proyecto: { codigo: "PRY-00001", nombre: "[DEMO] Obra", ubicacion: null, descripcion: null },
  versionMotor: "motor-1",
  huellaCalculo: "a".repeat(64),
  captura: BORRADOR,
  cotizacion: { ...RESPUESTA_CALCULADA.cotizacion, total: "2320.00" },
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
    totalNuevo: "2320.00",
  },
};

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true, datos });

function cotizacionesFalsas(s: Partial<ServiciosCotizaciones> = {}): ServiciosCotizaciones {
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
    detalleCotizacion: () => ok(detalle()),
    guardarBorrador: vi.fn(),
    crearVersion: vi.fn(),
    consultarVersion: noUsar,
    enviarRevision: vi.fn(),
    listarRevisiones: noUsar,
    detalleRevision: noUsar,
    decidirRevision: vi.fn(),
    retirarRevision: vi.fn(),
    anularAprobacion: vi.fn(),
    descartarCotizacion: vi.fn(),
    validarEmision: noUsar,
    emitir: vi.fn(),
    detalleEmision: noUsar,
    descargarDocumento: vi.fn(),
    emisor: noUsar,
    guardarEmisor: vi.fn(),
    seguimientoEmision: vi.fn(),
    componentesExcepcion: vi.fn(),
    excepcionesVersion: vi.fn(),
    salidasInternas: vi.fn(),
    decidirExcepcion: vi.fn(),
    registrarRespuesta: vi.fn(),
    corregirRespuesta: vi.fn(),
    ...s,
  };
}

function abrir(cotizaciones: ServiciosCotizaciones, puedePreparar = true) {
  window.history.replaceState(null, "", hashDe({ pantalla: "cotizacion", id: ID }));
  return render(
    <ProveedorRuta>
      <PantallaCotizacion id={ID} servicios={serviciosFalsos()} cotizaciones={cotizaciones} puedePreparar={puedePreparar}
        puedeEnviarRevision={puedePreparar}
        puedeEmitir={false}
        motivoSinCalculo={null}
      />
    </ProveedorRuta>,
  );
}

const estado = () => document.querySelector(".estado-borrador-linea")?.textContent ?? "";

describe("borrador: serialización y carga", () => {
  it("distingue ausencia (null), cero y formato inválido; anula dimensiones no usadas", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "INICIAR_PROPIA" });
    e = reducir(e, { tipo: "AGREGAR_CONCEPTO", concepto: CON_AREA });
    const p = e.captura!.partidas[0]!;
    const r = p.tipo === "CONCEPTO" ? p.renglones[0]!.clave : "";
    e = reducir(e, { tipo: "EDITAR_RENGLON", partida: p.clave, renglon: r, cambios: { piezas: "0", largo: " 10 ", alto: "9" } });
    const s = serializarBorrador(e.captura!);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.borrador.consolidarCompras).toBeNull();
    const m = (s.borrador.partidas[0] as Extract<CapturaBorrador["partidas"][number], { tipo: "CONCEPTO" }>).mediciones[0]!;
    expect(m).toMatchObject({ piezas: "0", largo: "10", ancho: null, alto: null, segundaMedida: "ancho" });

    const invalida = reducir(e, { tipo: "EDITAR_RENGLON", partida: p.clave, renglon: r, cambios: { ancho: "4,5" } });
    expect(serializarBorrador(invalida.captura!)).toEqual({ ok: false, errores: { "partidas[0].mediciones[0].ancho": expect.any(String) } });
  });

  it("cargar un borrador no cambia nada (sin cambios sin guardar) y conserva una partida cuyo concepto ya no existe", () => {
    const cargada = reducir(ESTADO_INICIAL, { tipo: "CARGAR_BORRADOR", folio: "COT-2026-00001", borrador: BORRADOR, conceptos: [CON_AREA] }).captura!;
    expect(huellaBorrador(cargada)).toBe(huellaDeBorrador(BORRADOR));

    const sinConcepto = reducir(ESTADO_INICIAL, { tipo: "CARGAR_BORRADOR", folio: "COT-2026-00001", borrador: BORRADOR, conceptos: [] }).captura!;
    expect(sinConcepto.partidas).toHaveLength(1);
    expect(sinConcepto.avisosCarga[0]).toMatch(/CON-00007 ya no está disponible/);
    const s = serializarBorrador(sinConcepto);
    expect(s.ok && s.borrador.partidas[0]).toMatchObject({ conceptoCodigo: "CON-00007", mediciones: [{ largo: "10", ancho: "4.5" }] });
  });
});

describe("rutas por hash", () => {
  it("cada pantalla tiene una URL estable; las anclas de la página no son rutas", () => {
    const rutas: Ruta[] = [
      { pantalla: "calculadora" },
      { pantalla: "cotizaciones" },
      { pantalla: "nueva-cotizacion", proyectoId: null },
      { pantalla: "nueva-cotizacion", proyectoId: ID },
      { pantalla: "cotizacion", id: ID },
      { pantalla: "version", id: ID, numero: 12 },
      { pantalla: "clientes" },
      { pantalla: "cliente", id: ID },
      { pantalla: "proyectos" },
    ];
    for (const r of rutas) expect(interpretarHash(hashDe(r))).toEqual(r);
    expect(interpretarHash("")).toEqual({ pantalla: "calculadora" });
    expect(interpretarHash("#seccion-resultado")).toBeNull();
    expect(interpretarHash("#/cotizaciones/no-es-uuid")).toEqual({ pantalla: "no-encontrada" });
  });
});

describe("editor de cotización", () => {
  it("marca los cambios sin guardar y guarda con la revisión leída", async () => {
    const guardarBorrador = vi.fn(
      async (_id: string, revision: number, _c: CapturaBorrador): Promise<ResultadoApi<RespuestaBorradorGuardado>> => ({
        ok: true,
        datos: {
          revision: revision + 1,
          actualizadoPor: "[DEMO] Preparador 1",
          actualizadoEn: "2026-10-03T16:00:00.000Z",
          completitud: { lista: true, pendientes: [] },
          referencias: SIN_REFERENCIAS_NO_DISPONIBLES,
        },
      }),
    );
    const usuario = userEvent.setup();
    abrir(cotizacionesFalsas({ guardarBorrador }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado · revisión 3/));
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toHaveProperty("disabled", true);

    const largo = screen.getByLabelText(/Largo del renglón 1/);
    await usuario.clear(largo);
    await usuario.type(largo, "12");
    expect(estado()).toBe("Cambios sin guardar.");
    await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado · revisión 4/));
    expect(guardarBorrador).toHaveBeenCalledTimes(1);
    const [id, revision, captura] = guardarBorrador.mock.calls[0]!;
    expect([id, revision]).toEqual([ID, 3]);
    expect(JSON.stringify(captura)).toContain('"largo":"12"');
    expect(JSON.stringify(captura)).not.toMatch(/total|importe/);
  });

  it("conflicto: conserva los cambios locales, permite comparar y guardar sobre la revisión vigente solo si se pide", async () => {
    const otra: CapturaBorrador = { ...BORRADOR, consolidarCompras: false };
    const guardarBorrador = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        fallo: {
          tipo: "conflicto",
          codigo: "CONFLICTO_EDICION",
          mensaje: "m",
          actual: { revision: 5, actualizadoPor: "[DEMO] Otra pestaña", actualizadoEn: "2026-10-03T16:00:00.000Z", captura: otra },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        datos: { revision: 6, actualizadoPor: "[DEMO] Preparador 1", actualizadoEn: "2026-10-03T16:01:00.000Z", completitud: { lista: true, pendientes: [] } },
      });
    const usuario = userEvent.setup();
    abrir(cotizacionesFalsas({ guardarBorrador }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado/));
    const largo = screen.getByLabelText(/Largo del renglón 1/);
    await usuario.clear(largo);
    await usuario.type(largo, "15");
    await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

    expect(await screen.findByText(/Otra pestaña o persona guardó este borrador antes/)).toBeTruthy();
    expect((screen.getByLabelText(/Largo del renglón 1/) as HTMLInputElement).value).toBe("15");
    expect(estado()).toMatch(/Conflicto/);

    await usuario.click(screen.getByRole("button", { name: "Comparar" }));
    const diferencias = screen.getByRole("list", { name: /Diferencias/ });
    expect(within(diferencias).getByText(/consolidar/)).toBeTruthy();
    expect(within(diferencias).getByText(/Partida 1: datos distintos/)).toBeTruthy();
    expect(guardarBorrador).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Guardar mis cambios sobre la revisión 5" }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado · revisión 6/));
    expect(guardarBorrador.mock.calls[1]![1]).toBe(5);
  });

  it("si la respuesta de un guardado se perdió, el reintento adopta la revisión sin preguntar", async () => {
    const guardarBorrador = vi.fn(async (_id: string, _rev: number, captura: CapturaBorrador) => ({
      ok: false as const,
      fallo: {
        tipo: "conflicto" as const,
        codigo: "CONFLICTO_EDICION" as const,
        mensaje: "m",
        actual: { revision: 4, actualizadoPor: "[DEMO] Preparador 1", actualizadoEn: "2026-10-03T16:00:00.000Z", captura },
      },
    }));
    const usuario = userEvent.setup();
    abrir(cotizacionesFalsas({ guardarBorrador }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado/));
    const largo = screen.getByLabelText(/Largo del renglón 1/);
    await usuario.clear(largo);
    await usuario.type(largo, "11");
    await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado · revisión 4/));
    expect(screen.queryByText(/Otra pestaña o persona/)).toBeNull();
  });

  it("guardar versión: reintenta con la MISMA clave tras un fallo de red y muestra el resultado almacenado", async () => {
    const crearVersion = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, fallo: { tipo: "red" } })
      .mockResolvedValueOnce({ ok: true, datos: VERSION });
    const usuario = userEvent.setup();
    abrir(cotizacionesFalsas({ crearVersion, detalleCotizacion: vi.fn().mockResolvedValue({ ok: true, datos: detalle() }) }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado/));
    await usuario.click(screen.getByRole("button", { name: "Calcular y guardar versión" }));
    await usuario.click(await screen.findByRole("button", { name: "Reintentar (sin duplicar)" }));
    expect(await screen.findByText("Versión COT-2026-00001-v1 guardada")).toBeTruthy();
    expect(crearVersion).toHaveBeenCalledTimes(2);
    const [a, b] = crearVersion.mock.calls;
    expect(a![0]).toBe(ID);
    expect(a![1]).toBe(3);
    expect(b![3]).toBe(a![3]);
    expect(a![3]).toMatch(/^[0-9a-f-]{36}$/);
    expect(document.querySelector(".resultado-guardado [data-prueba=total]")?.textContent).toMatch(/2,320\.00/);
  });

  it("guardar y versionar: una consulta del detalle que responde tarde no reemplaza la más reciente (v1 no desaparece)", async () => {
    // 1.ª consulta: al abrir. 2.ª: tras guardar el borrador (responde TARDE y sin versiones).
    // 3.ª: tras crear la versión (responde antes, con v1).
    let responderTarde: (r: ResultadoApi<DetalleCotizacion>) => void = () => {};
    const detalleCotizacion = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, datos: detalle(3) })
      .mockImplementationOnce(() => new Promise((r) => (responderTarde = r)))
      .mockResolvedValue({ ok: true, datos: detalle(4, [{ ...VERSION.version, revisionBorrador: 4 }]) });
    const guardarBorrador = vi.fn(async (_id: string, revision: number) => ({
      ok: true as const,
      datos: {
        revision: revision + 1,
        actualizadoPor: "[DEMO] Preparador 1",
        actualizadoEn: "2026-10-03T16:00:00.000Z",
        completitud: { lista: true, pendientes: [] },
        referencias: SIN_REFERENCIAS_NO_DISPONIBLES,
      },
    }));
    const crearVersion = vi.fn().mockResolvedValue({ ok: true, datos: VERSION });
    const usuario = userEvent.setup();
    abrir(cotizacionesFalsas({ detalleCotizacion, guardarBorrador, crearVersion }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado · revisión 3/));
    const largo = screen.getByLabelText(/Largo del renglón 1/);
    await usuario.clear(largo);
    await usuario.type(largo, "12");
    await usuario.click(screen.getByRole("button", { name: "Calcular y guardar versión" }));
    expect(await screen.findByRole("link", { name: "COT-2026-00001-v1" })).toBeTruthy();
    // Llega la respuesta atrasada (sin versiones): se descarta.
    responderTarde({ ok: true, datos: detalle(4) });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole("link", { name: "COT-2026-00001-v1" })).toBeTruthy();
    expect(screen.queryByText(/Aún no hay versiones/)).toBeNull();
  });

  it("un cálculo bloqueado no guarda versión ni muestra importes", async () => {
    const crearVersion = vi.fn().mockResolvedValue({
      ok: false,
      fallo: { tipo: "bloqueado", problemas: [{ codigo: "BL-08", referencia: "INS-00004", mensaje: "La selección no es válida." }] },
    });
    const usuario = userEvent.setup();
    abrir(cotizacionesFalsas({ crearVersion, detalleCotizacion: vi.fn().mockResolvedValue({ ok: true, datos: detalle() }) }));
    await waitFor(() => expect(estado()).toMatch(/^Guardado/));
    await usuario.click(screen.getByRole("button", { name: "Calcular y guardar versión" }));
    expect(await screen.findByText("Cálculo bloqueado: no se guardó ninguna versión")).toBeTruthy();
    expect(document.querySelector(".panel-guardar [data-prueba=total]")).toBeNull();
  });

  it("solo lectura (Revisor): sin controles de edición, guardado ni cálculo", async () => {
    abrir(cotizacionesFalsas({ detalleCotizacion: () => ok(detalle(3, [VERSION.version])) }), false);
    expect(await screen.findByText(/su función permite ver la cotización/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Guardar borrador" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Calcular/ })).toBeNull();
    expect(screen.queryByLabelText(/Largo del renglón 1/)).toBeNull();
    expect(screen.getByRole("link", { name: "COT-2026-00001-v1" })).toBeTruthy();
  });
});

describe("catálogo cambiado después de calcular (módulo 11)", () => {
  it("si la verificación del servidor informa BL-16, el editor avisa que la versión ya no es vigente y no la recalcula", async () => {
    const verificarVersion = vi.fn<ServiciosCotizaciones["verificarVersion"]>(() =>
      Promise.resolve({
        ok: true as const,
        datos: {
          fechaReferencia: "2026-10-17",
          bloqueos: [
            { codigo: "BL-16", referencia: "v1", mensaje: "La entrada de cálculo cambió: genere una versión nueva." },
            { codigo: "BL-20", referencia: "v1", mensaje: "Faltan textos." },
          ],
          avisos: [],
        },
      }),
    );
    const crearVersion = vi.fn();
    abrir(cotizacionesFalsas({ detalleCotizacion: () => ok(detalle(4, [VERSION.version])), verificarVersion, crearVersion }));
    const aviso = await screen.findByText(/El catálogo cambió después de calcular la v1/);
    const caja = aviso.closest(".aviso")! as HTMLElement;
    expect(within(caja).getByText(/genere una versión nueva/)).toBeTruthy();
    // Solo los bloqueos de catálogo: BL-20 (textos) no se presenta como cambio de catálogo.
    expect(within(caja).queryByText(/Faltan textos/)).toBeNull();
    expect(verificarVersion).toHaveBeenCalledWith(ID, 1, expect.anything());
    expect(crearVersion).not.toHaveBeenCalled();
  });

  it("sin cambios de catálogo no muestra el aviso", async () => {
    abrir(cotizacionesFalsas({ detalleCotizacion: () => ok(detalle(4, [VERSION.version])) }));
    await screen.findByText(/corresponde a la captura guardada/);
    expect(screen.queryByText(/El catálogo cambió/)).toBeNull();
  });
});
