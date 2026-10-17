// @vitest-environment jsdom
/**
 * Catálogo técnico en la web (módulo 12, ADR-0016): unidad filtrada por la fórmula, aviso de vuelta a
 * Borrador antes de un cambio técnico, conceptos heredados explicados, requisitos de aprobación del
 * servidor, revisión técnica enviada al aprobar y conceptos afectados antes de editar una conversión.
 * La API se simula con los contratos.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponenteAdmin, ConceptoTarifaAdmin, DetalleConceptoAdmin, DetalleInsumoAdmin, InsumoAdmin } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta } from "../../navegacion/ruta.tsx";
import { PantallaCatalogo } from "../../catalogo-admin/PantallasCatalogo.tsx";
import type { ServiciosCatalogoAdmin } from "../../catalogo-admin/servicios.ts";

const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true, datos });
const INSTANTE = "2026-10-17T15:00:00.000Z";

const CONCEPTO: ConceptoTarifaAdmin = {
  codigo: "CON-00010",
  descripcion: "[DEMO] Muro de comprobación",
  unidad: "m2",
  tipoFormula: "AREA",
  clase: "ESTANDAR",
  estado: "Aprobado",
  activo: true,
  tipo: { codigo: "TES-00004", familia: "Mampostería reforzada", nombre: "Genérico - Mampostería reforzada", activo: true },
  heredado: false,
  revision: 3,
  revisionTecnica: 5,
  aprobadoPor: "[DEMO] Administradora",
  aprobadoEn: INSTANTE,
  tarifa: { codigo: "TMO-00005", modalidad: "UNIDAD", descripcion: "[DEMO] MO muro", unidad: "m2", importe: "210", activa: true, vigenteDesde: "2026-09-01", vigenteHasta: "2027-09-30" },
  borradoresAbiertos: 2,
};

const COMPONENTE: ComponenteAdmin = {
  codigo: "CMP-00020",
  orden: 1,
  insumo: { codigo: "INS-00011", descripcion: "[DEMO] Mortero", unidadBase: "kg", activo: true },
  rendimiento: "27",
  unidadRendimiento: "pza",
  desperdicio: "0.05",
  factorTraslape: null,
  fuente: null,
  fecha: "2026-09-25",
  responsable: null,
  activo: true,
  revision: 0,
  convertibilidad: { estado: "FALTA", factor: null },
  trazable: false,
  modificadoEn: INSTANTE,
  modificadoPor: null,
};

const detalleConcepto = (c: Partial<ConceptoTarifaAdmin> = {}, d: Partial<DetalleConceptoAdmin> = {}): DetalleConceptoAdmin => ({
  concepto: { ...CONCEPTO, ...c },
  permiteDescuento: true,
  reglaMedicion: "[DEMO] Área = largo x alto.",
  criterios: null,
  creadoPor: "[DEMO] Administradora",
  creadoEn: INSTANTE,
  cambioTecnicoPor: "[DEMO] Administradora",
  cambioTecnicoEn: INSTANTE,
  componentes: [],
  requisitos: [],
  historial: [],
  ...d,
});

const INSUMO: InsumoAdmin = {
  codigo: "INS-00006",
  descripcion: "[DEMO] Larguero de acero (kg)",
  especificacion: null,
  unidadBase: "kg",
  activo: true,
  revision: 0,
  referencias: { productos: 1, conversiones: 1, componentes: 1 },
  creadoEn: INSTANTE,
  modificadoEn: INSTANTE,
  modificadoPor: null,
};

const UNIDADES = [
  { clave: "m", nombre: "Metro", magnitud: "longitud" },
  { clave: "m2", nombre: "Metro cuadrado", magnitud: "area" },
  { clave: "m3", nombre: "Metro cúbico", magnitud: "volumen" },
  { clave: "kg", nombre: "Kilogramo", magnitud: "masa" },
  { clave: "pza", nombre: "Pieza", magnitud: "conteo" },
];

function servicios(s: Partial<ServiciosCatalogoAdmin> = {}): ServiciosCatalogoAdmin {
  const noUsar = () => Promise.reject(new Error("no se esperaba esta llamada"));
  return {
    listarProveedores: noUsar,
    detalleProveedor: noUsar,
    crearProveedor: noUsar,
    editarProveedor: noUsar,
    listarProductos: noUsar,
    detalleProducto: noUsar,
    crearProducto: noUsar,
    editarProducto: noUsar,
    listarPrecios: noUsar,
    detallePrecio: noUsar,
    registrarPrecio: noUsar,
    anularPrecio: noUsar,
    cerrarVigencia: noUsar,
    listarTarifas: () => ok({ tarifas: [], fechaReferencia: "2026-10-17", limite: 50, siguiente: null }),
    detalleTarifa: noUsar,
    registrarTarifa: noUsar,
    cambiarActivaTarifa: noUsar,
    listarConceptos: () => ok({ conceptos: [CONCEPTO], limite: 50, siguiente: null }),
    asignarTarifa: noUsar,
    listarInsumos: () => ok({ insumos: [INSUMO], limite: 50, siguiente: null }),
    unidades: () => ok({ unidades: UNIDADES }),
    listarTipos: () => ok({ tipos: [], limite: 50, siguiente: null }),
    detalleTipo: noUsar,
    crearTipo: noUsar,
    editarTipo: noUsar,
    detalleInsumo: noUsar,
    crearInsumo: noUsar,
    editarInsumo: noUsar,
    crearConversion: noUsar,
    editarConversion: noUsar,
    detalleConcepto: () => ok(detalleConcepto()),
    crearConcepto: noUsar,
    editarConcepto: noUsar,
    aprobarConcepto: noUsar,
    crearComponente: noUsar,
    editarComponente: noUsar,
    ...s,
  };
}

const montar = (s: ServiciosCatalogoAdmin, vista: "conceptos" | "insumos" | "tipos-estructura") =>
  render(
    <ProveedorRuta>
      <PantallaCatalogo servicios={s} vista={vista} />
    </ProveedorRuta>,
  );

async function abrirConcepto(s: ServiciosCatalogoAdmin) {
  const u = userEvent.setup();
  montar(s, "conceptos");
  await u.click(await screen.findByRole("button", { name: "Gestionar" }));
  return u;
}

describe("conceptos y componentes", () => {
  it("la unidad se elige entre las de la magnitud de la fórmula", async () => {
    const u = userEvent.setup();
    montar(servicios(), "conceptos");
    await u.click(await screen.findByRole("button", { name: "Nuevo concepto" }));
    const unidad = screen.getByLabelText(/^Unidad del concepto/) as HTMLSelectElement;
    expect(unidad.disabled).toBe(true);
    await u.selectOptions(screen.getByLabelText(/^Tipo de fórmula/), "VOLUMEN");
    expect([...unidad.options].map((o) => o.value)).toEqual(["", "m3"]);
    expect(screen.getByText(/Solo unidades de volumen/)).toBeTruthy();
  });

  it("antes de un cambio técnico de un concepto aprobado avisa que vuelve a Borrador y envía solo lo cambiado", async () => {
    const editarConcepto = vi.fn<ServiciosCatalogoAdmin["editarConcepto"]>(() => ok(detalleConcepto({ estado: "Borrador", aprobadoPor: null, aprobadoEn: null, revision: 4, revisionTecnica: 6 })));
    const u = await abrirConcepto(servicios({ editarConcepto }));
    await u.click(await screen.findByRole("button", { name: "Editar datos" }));
    const regla = screen.getByLabelText(/^Regla de medición/);
    await u.clear(regla);
    await u.type(regla, "[[DEMO] Regla corregida.");
    expect(screen.getByText("Al guardar, el concepto aprobado vuelve a Borrador")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Revisar y confirmar" }));
    const grupo = screen.getByRole("group", { name: /Confirmar: Guardar y volver a Borrador/ });
    expect(grupo.textContent).toMatch(/perderá la aprobación de \[DEMO\] Administradora/);
    expect(grupo.textContent).toMatch(/2 cotización\(es\) abierta\(s\)/);
    expect(editarConcepto).not.toHaveBeenCalled();
    await u.click(within(grupo).getByRole("button", { name: "Guardar y volver a Borrador" }));
    expect(editarConcepto).toHaveBeenCalledWith("CON-00010", { revision: 3, reglaMedicion: "[DEMO] Regla corregida." });
  });

  it("un concepto heredado explica qué falta y no permite agregar componentes hasta completarlo", async () => {
    const s = servicios({
      detalleConcepto: () =>
        ok(
          detalleConcepto(
            { heredado: true, tipo: null, aprobadoPor: null, aprobadoEn: null },
            {
              reglaMedicion: null,
              requisitos: [
                { codigo: "HEREDADO", referencia: "CON-00010", mensaje: "Datos incompletos de la carga anterior: complete el tipo de estructura y la regla de medición." },
                { codigo: "SIN_REGLA", referencia: "CON-00010", mensaje: "Falta la regla de medición escrita." },
                { codigo: "SIN_TIPO", referencia: "CON-00010", mensaje: "Falta el tipo de estructura." },
              ],
            },
          ),
        ),
    });
    await abrirConcepto(s);
    const aviso = await screen.findByText("Datos incompletos de la carga anterior", { selector: "strong, p, h2, h3, span, div" });
    expect(aviso).toBeTruthy();
    expect(screen.getByText(/Falta el tipo de estructura y la regla de medición\. El concepto sigue calculando como antes/)).toBeTruthy();
    expect(screen.getByText("Aprobado en la carga anterior (sin fecha registrada)", { exact: false })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Agregar componente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Completar datos" })).toBeTruthy();
  });

  it("muestra la convertibilidad y la trazabilidad faltante, y la lista de requisitos del servidor sin botón de aprobar", async () => {
    const s = servicios({
      detalleConcepto: () =>
        ok(
          detalleConcepto(
            { estado: "Borrador", aprobadoPor: null, aprobadoEn: null },
            {
              componentes: [COMPONENTE],
              requisitos: [
                { codigo: "COMPONENTE_SIN_FUENTE", referencia: "CMP-00020", mensaje: "El componente CMP-00020 no tiene fuente." },
                { codigo: "COMPONENTE_SIN_CONVERSION", referencia: "CMP-00020", mensaje: "El componente CMP-00020 se mide en pza y el insumo INS-00011 en kg: falta la conversión pza → kg." },
              ],
            },
          ),
        ),
    });
    await abrirConcepto(s);
    expect(await screen.findByText("Falta la conversión pza → kg")).toBeTruthy();
    expect(screen.getByText("Falta: fuente, responsable técnico")).toBeTruthy();
    const lista = screen.getByRole("list", { name: "Requisitos para aprobar" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Aprobar concepto" })).toBeNull();
  });

  it("aprobar envía la revisión técnica revisada; si el servidor devuelve requisitos los muestra y recarga", async () => {
    const aprobarConcepto = vi.fn<ServiciosCatalogoAdmin["aprobarConcepto"]>(() =>
      Promise.resolve({
        ok: false as const,
        fallo: {
          tipo: "catalogo" as const,
          codigo: "REQUISITOS_INCOMPLETOS" as const,
          mensaje: "No se puede aprobar: faltan requisitos.",
          problemas: [{ codigo: "TIPO_INACTIVO", referencia: "TES-00004", mensaje: "El tipo de estructura TES-00004 está inactivo." }],
        },
      }),
    );
    const detalle = vi.fn(() => ok(detalleConcepto({ estado: "Borrador", aprobadoPor: null, aprobadoEn: null })));
    const u = await abrirConcepto(servicios({ aprobarConcepto, detalleConcepto: detalle }));
    await u.click(await screen.findByRole("button", { name: "Aprobar concepto" }));
    const grupo = screen.getByRole("group", { name: /Confirmar: Aprobar concepto/ });
    expect(grupo.textContent).toMatch(/revisión técnica 5/);
    await u.click(within(grupo).getByRole("button", { name: "Aprobar concepto" }));
    expect(aprobarConcepto).toHaveBeenCalledWith("CON-00010", { revisionTecnica: 5 }, expect.any(String));
    expect(await screen.findByText("El tipo de estructura TES-00004 está inactivo.")).toBeTruthy();
    expect(detalle.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("insumos y conversiones", () => {
  it("antes de guardar una conversión editada lista los conceptos aprobados que vuelven a Borrador", async () => {
    const detalle: DetalleInsumoAdmin = {
      insumo: INSUMO,
      conversiones: [
        {
          insumoCodigo: "INS-00006",
          unidadOrigen: "m",
          unidadDestino: "kg",
          factor: "4.2",
          fuente: "[DEMO] Factor ilustrativo",
          revision: 0,
          registradoEn: INSTANTE,
          modificadoEn: INSTANTE,
          modificadoPor: null,
          conceptos: [{ codigo: "CON-00007", descripcion: "[DEMO] Cubierta", estado: "Aprobado", activo: true }],
        },
      ],
      historial: [],
    };
    const editarConversion = vi.fn<ServiciosCatalogoAdmin["editarConversion"]>(() => ok(detalle));
    const u = userEvent.setup();
    montar(servicios({ detalleInsumo: () => ok(detalle), editarConversion }), "insumos");
    await u.click(await screen.findByRole("button", { name: "Gestionar" }));
    expect(await screen.findByText(/La usan: CON-00007 \(Aprobado\)/)).toBeTruthy();
    // La unidad base no se ofrece para cambiar: tiene referencias.
    await u.click(screen.getByRole("button", { name: "Editar datos" }));
    expect((screen.getByLabelText(/^Unidad base/) as HTMLSelectElement).disabled).toBe(true);
    await u.click(screen.getByRole("button", { name: "Cancelar" }));
    await u.click(screen.getByRole("button", { name: "Editar factor o fuente" }));
    const factor = screen.getByLabelText(/^Factor \(1 m/);
    await u.clear(factor);
    await u.type(factor, "4.3");
    await u.type(screen.getByLabelText(/^Motivo del cambio/), "[[DEMO] Ficha técnica nueva del fabricante.");
    await u.click(screen.getByRole("button", { name: "Revisar y confirmar" }));
    const grupo = screen.getByRole("group", { name: /Confirmar: Guardar conversión/ });
    expect(grupo.textContent).toMatch(/Volverán a Borrador y perderán su aprobación: CON-00007/);
    await u.click(within(grupo).getByRole("button", { name: "Guardar conversión" }));
    expect(editarConversion).toHaveBeenCalledWith("INS-00006", "m", { revision: 0, motivo: "[DEMO] Ficha técnica nueva del fabricante.", factor: "4.3" });
  });
});
