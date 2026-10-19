// @vitest-environment jsdom
/**
 * Salidas internas de una versión en la web (módulo 14, ADR-0018): encabezado de la versión,
 * selector explícito, compras, detalle e indicadores sin `number`, datos no disponibles, pérdida
 * del permiso con la pantalla abierta y respuestas atrasadas.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DetalleCotizacion, SalidasInternasVersion } from "@softarq/contracts";
import type { ResultadoApi } from "../../api/cliente.ts";
import { ProveedorRuta, interpretarHash, hashDe } from "../../navegacion/ruta.tsx";
import { PantallaSalidasInternas } from "../PantallaSalidasInternas.tsx";

const ID = "f7e6f22e-0530-4000-8000-000000000014";
const ok = <T,>(datos: T): Promise<ResultadoApi<T>> => Promise.resolve({ ok: true as const, datos });
const montar = (ui: ReactNode) => render(<ProveedorRuta>{ui}</ProveedorRuta>);
const valor = (v: string) => ({ estado: "VALOR" as const, valor: v });

function salidas(over: Partial<SalidasInternasVersion> = {}, numero = 1): SalidasInternasVersion {
  return {
    encabezado: {
      versionId: "00000000-0000-4000-8000-000000000001",
      idVersion: `COT-2026-00014-v${numero}`,
      folio: "COT-2026-00014",
      numero,
      origen: "WEB_DEMO",
      ambiente: "DEMO",
      moneda: "MXN",
      estado: "APROBADA",
      esUltima: false,
      fechaCalculo: "2026-09-23",
      consolidarCompras: true,
      versionMotor: "motor-1 (libro 1.0.0-F1)",
      autorNombre: "[DEMO] Preparadora",
      creadoEn: "2026-09-23T18:00:00.000Z",
    },
    disponibilidad: { estado: "COMPLETO", motivo: null },
    compras: [
      {
        numero: 2,
        insumo: { codigo: "INS-00002", nombre: "[DEMO] Insumo B" },
        unidadBase: "kg",
        producto: { codigo: "PCM-00002", nombre: "[DEMO] Producto B" },
        presentacion: "Bulto 25 kg",
        unidadCompra: "bulto",
        proveedor: { codigo: "PRV-00001", nombre: "[DEMO] Proveedor uno" },
        precio: { codigo: "PRE-000002", vigenteDesde: "2026-01-01", vigenteHasta: "2026-12-31" },
        partida: null,
        regla: "PAQUETE_COMPLETO",
        consumoTotal: "466.075",
        contenido: "25",
        incrementoMinimo: null,
        cantidadComprada: "475",
        unidades: "19",
        sobrante: "8.925",
        precioUnitario: "145",
        costoCompra: "2755",
        prorrateo: [
          { partidaId: "P001", partidaNumero: 1, componenteCodigo: "CMP-00002", consumoBase: "58.195", costoProrrateado: "343.99447524540041838760928" },
          { partidaId: "P002", partidaNumero: 2, componenteCodigo: "CMP-00003", consumoBase: "407.88", costoProrrateado: "2411.00552475459958161239072" },
        ],
      },
    ],
    partidas: [
      {
        id: "P001",
        numero: 1,
        tipo: "CONCEPTO",
        concepto: { codigo: "CON-00001", nombre: "[DEMO] Concepto X" },
        tipoAdicional: null,
        categoria: null,
        descripcion: "[DEMO] Concepto X (ilustrativo, m2)",
        unidad: "m2",
        cantidad: "11.3",
        renglones: [
          { numero: 1, resultado: "12.5" },
          { numero: 2, resultado: "-1.2" },
        ],
        consumos: [
          {
            componenteCodigo: "CMP-00001",
            insumo: { codigo: "INS-00001", nombre: "[DEMO] Insumo A" },
            catalogo: { rendimiento: "12.5", desperdicio: "0.05", traslape: null },
            rendimientoUsado: "13",
            desperdicioUsado: "0.05",
            traslapeUsado: "1",
            unidadRendimiento: "pza",
            unidadBase: "pza",
            consumoNeto: "146.9",
            consumoConDesperdicio: "154.245",
            factorConversion: "1",
            consumoBase: "154.245",
            compraNumero: 1,
            costoProrrateado: "1519.6",
            ajustes: [{ numero: 1, campo: "RENDIMIENTO", valorAplicado: "13", estado: "AUTORIZADA" }],
          },
        ],
        manoObra: { tarifa: { codigo: "TMO-00001", nombre: "[DEMO] Tarifa m2" }, modalidad: "UNIDAD", unidad: "m2", importeTarifa: "180", rendimientoJornada: null, jornadas: null },
        costoMateriales: "1804.194475245400418387609",
        costoManoObra: "2034",
        costoSubcontrato: "0",
        costoAdicional: "0",
        costoDirecto: "3838.194475245400418387609",
        precioUnitarioVenta: "407.60",
        importe: "4605.88",
      },
    ],
    indicadores: {
      costoMateriales: valor("7065.2"),
      costoManoObra: valor("5034"),
      costoSubcontrato: valor("0"),
      costosAdicionales: [{ categoria: "Transporte", valor: "600" }],
      costoAdicional: valor("1400"),
      costoDirecto: valor("13499.2"),
      costoDirectoRedondeado: valor("13499.20"),
      subtotal: valor("16199.09"),
      impuesto: { nombre: "IVA", tasa: valor("0.16"), base: "SUBTOTAL_VENTA", importe: valor("2591.85") },
      total: valor("18790.94"),
      recargoSobreCosto: valor("0.2"),
      margenSobrePrecio: valor("0.166668108557202657778608"),
    },
    conciliacion: { categorias: true, importes: true, prorrateo: true },
    avisos: [{ codigo: "AV-03", referencia: "compra-2", mensaje: "Compra 2 (PCM-00002): sobrante de 8.925 en unidad base por redondeo de presentaciones; no se descuenta." }],
    ...over,
  };
}

const detalle = { versiones: [1, 2].map((n) => ({ numero: n, idVersion: `COT-2026-00014-v${n}`, estado: n === 1 ? "APROBADA" : "BORRADOR", esUltima: n === 2, fechaCalculo: "2026-09-23" })) } as unknown as DetalleCotizacion;

function servicios(over: Partial<{ salidasInternas: (id: string, n: number, s?: AbortSignal) => Promise<ResultadoApi<SalidasInternasVersion>> }> = {}) {
  return {
    salidasInternas: vi.fn((_id: string, n: number) => ok(salidas({}, n))),
    detalleCotizacion: vi.fn(() => ok(detalle)),
    ...over,
  };
}

describe("rutas de las salidas internas", () => {
  it("cada vista tiene su URL; una vista desconocida no es una ruta válida", () => {
    expect(interpretarHash(`#/cotizaciones/${ID}/v/2/interno`)).toEqual({ pantalla: "salidas", id: ID, numero: 2, vista: "compras" });
    expect(interpretarHash(`#/cotizaciones/${ID}/v/2/interno/indicadores`)).toEqual({ pantalla: "salidas", id: ID, numero: 2, vista: "indicadores" });
    expect(interpretarHash(`#/cotizaciones/${ID}/v/2/interno/otra`)).toEqual({ pantalla: "no-encontrada" });
    expect(hashDe({ pantalla: "salidas", id: ID, numero: 3, vista: "detalle" })).toBe(`#/cotizaciones/${ID}/v/3/interno/detalle`);
  });
});

describe("pantalla de salidas internas", () => {
  it("encabezado de la versión elegida: origen, folio, estado, fecha, modalidad y alcance; marca de uso interno", async () => {
    const s = servicios();
    montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="compras" />);
    expect(await screen.findByRole("heading", { level: 1, name: /COT-2026-00014-v1/ })).toBeTruthy();
    expect(s.salidasInternas).toHaveBeenCalledWith(ID, 1, expect.any(AbortSignal));
    expect(screen.getByRole("note").textContent).toMatch(/No es un documento para el cliente/);
    const datos = screen.getByText("Modalidad de compras").closest("dl")!;
    expect(within(datos).getByText(/Consolidadas por producto y proveedor/)).toBeTruthy();
    expect(within(datos).getByText("23/09/2026")).toBeTruthy();
    expect(within(datos).getByText(/Solo esta versión: 1 partida y 1 compra/)).toBeTruthy();
    expect(within(datos).getByText(/hay versiones posteriores/)).toBeTruthy();
  });

  it("compras: presentación, unidades, sobrante y prorrateo con cuatro decimales truncados (§3.14), sin redondear", async () => {
    montar(<PantallaSalidasInternas servicios={servicios()} id={ID} numero={1} vista="compras" />);
    const tablas = await screen.findAllByRole("table");
    const compras = tablas[0]!;
    expect(within(compras).getByText("Consolidada")).toBeTruthy();
    expect(within(compras).getByText("Bulto 25 kg")).toBeTruthy();
    expect(within(compras).getByText(/19 bulto/)).toBeTruthy();
    expect(within(compras).getByText(/8\.925 kg/)).toBeTruthy();
    expect(within(compras).getByText("$2,755.00")).toBeTruthy();
    expect(within(compras).getByText(/vigente hasta 31\/12\/2026/)).toBeTruthy();
    const prorrateo = tablas[1]!;
    expect(within(prorrateo).getByText("$343.9944")).toBeTruthy();
    expect(within(prorrateo).getByText("$2,411.0055")).toBeTruthy();
    expect(screen.getByText(/AV-03/)).toBeTruthy();
  });

  it("detalle: medición, consumo con su excepción autorizada y valor de catálogo, mano de obra y costos de la partida", async () => {
    montar(<PantallaSalidasInternas servicios={servicios()} id={ID} numero={1} vista="detalle" />);
    expect(await screen.findByRole("heading", { level: 3, name: /Partida 1/ })).toBeTruthy();
    expect(screen.getByText(/2 renglones de medición: 12\.5 \+ -1\.2/)).toBeTruthy();
    expect(screen.getByText(/Excepción 1 \(rendimiento 13\): autorizada/)).toBeTruthy();
    expect(screen.getByText("catálogo: 12.5")).toBeTruthy();
    expect(screen.getByText(/Por unidad: \$180\.00 por m2/)).toBeTruthy();
    // Materiales con precisión completa, mostrados en centavos sin pasar por number.
    expect(screen.getByText("$1,804.19")).toBeTruthy();
    expect(screen.getByText("$4,605.88")).toBeTruthy();
  });

  it("indicadores: recargo y margen por separado; «No aplica» y «No disponible» nunca son cero", async () => {
    const s = servicios({
      salidasInternas: () =>
        ok(
          salidas({
            indicadores: {
              ...salidas().indicadores,
              margenSobrePrecio: { estado: "NO_APLICA", motivo: "El subtotal de venta es 0: el margen sobre precio no se puede calcular." },
              costoSubcontrato: { estado: "NO_DISPONIBLE", motivo: "Sin instantánea interna válida." },
            },
          }),
        ),
    });
    montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="indicadores" />);
    expect(await screen.findByText("Recargo sobre costo aplicado")).toBeTruthy();
    expect(screen.getByText("20 %")).toBeTruthy();
    expect(screen.getByText("No aplica")).toBeTruthy();
    expect(screen.getByText("No disponible")).toBeTruthy();
    expect(screen.getByText("$18,790.94")).toBeTruthy();
    expect(screen.getByText("$13,499.20")).toBeTruthy();
    expect(screen.getByText("Costo adicional: Transporte")).toBeTruthy();
  });

  it("margen redondeado solo al mostrar: 16.67 %", async () => {
    montar(<PantallaSalidasInternas servicios={servicios()} id={ID} numero={1} vista="indicadores" />);
    expect(await screen.findByText("16.67 %")).toBeTruthy();
  });

  it("versión sin nombres congelados: se explica y se muestran solo los códigos", async () => {
    const base = salidas();
    const s = servicios({
      salidasInternas: () =>
        ok({
          ...base,
          disponibilidad: { estado: "SIN_NOMBRES", motivo: "Esta versión se calculó antes de congelar nombres y vigencias del catálogo: se muestran los códigos." },
          compras: base.compras.map((k) => ({ ...k, producto: { ...k.producto, nombre: null }, presentacion: null, precio: { ...k.precio, vigenteHasta: null } })),
        }),
    });
    montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="compras" />);
    expect(await screen.findByText("Nombres y vigencias no congelados en esta versión")).toBeTruthy();
    expect(screen.getByText("PCM-00002")).toBeTruthy();
    expect(screen.queryByText("[DEMO] Producto B")).toBeNull();
    expect(screen.queryByText(/vigente hasta/)).toBeNull();
  });

  it("detalle no disponible: aviso y ninguna tabla con cifras parciales", async () => {
    const s = servicios({ salidasInternas: () => ok(salidas({ disponibilidad: { estado: "NO_DISPONIBLE", motivo: "La instantánea interna no tiene la forma esperada." }, compras: [], partidas: [] })) });
    montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="compras" />);
    expect(await screen.findByText("Detalle no disponible")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("selector de versión: cambia la ruta a la versión elegida (no a la última por su cuenta)", async () => {
    window.location.hash = `#/cotizaciones/${ID}/v/1/interno/compras`;
    montar(<PantallaSalidasInternas servicios={servicios()} id={ID} numero={1} vista="compras" />);
    const selector = await screen.findByLabelText("Versión consultada");
    expect((selector as HTMLSelectElement).value).toBe("1");
    await userEvent.selectOptions(selector, "2");
    await waitFor(() => expect(window.location.hash).toBe(`#/cotizaciones/${ID}/v/2/interno/compras`));
  });

  it("pérdida del permiso con la pantalla abierta: descarta los datos, lo explica y pide la sesión de nuevo", async () => {
    let n = 0;
    const s = servicios({
      salidasInternas: () => (n++ === 0 ? ok(salidas()) : Promise.resolve({ ok: false as const, fallo: { tipo: "sin_permiso", mensaje: "Su función no permite esta operación." } as never })),
    });
    const alPerderPermiso = vi.fn();
    const { rerender } = montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="compras" alPerderPermiso={alPerderPermiso} />);
    expect(await screen.findByText("$2,755.00")).toBeTruthy();
    rerender(
      <ProveedorRuta>
        <PantallaSalidasInternas servicios={s} id={ID} numero={2} vista="compras" alPerderPermiso={alPerderPermiso} />
      </ProveedorRuta>,
    );
    expect(await screen.findByText("Su función ya no permite consultar las salidas internas")).toBeTruthy();
    expect(screen.queryByText("$2,755.00")).toBeNull();
    expect(alPerderPermiso).toHaveBeenCalledTimes(1);
  });

  it("error de red: «Reintentar» solo repite la lectura", async () => {
    let n = 0;
    const s = servicios({
      salidasInternas: vi.fn(() => (n++ === 0 ? Promise.resolve({ ok: false as const, fallo: { tipo: "red", mensaje: "Sin conexión" } as never }) : ok(salidas()))),
    });
    montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="compras" />);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("$2,755.00")).toBeTruthy();
    expect(s.salidasInternas).toHaveBeenCalledTimes(2);
  });

  it("respuesta atrasada de otra versión: se descarta y queda la versión pedida", async () => {
    let soltarV1: (r: ResultadoApi<SalidasInternasVersion>) => void = () => {};
    const s = servicios({
      salidasInternas: (_id, n) => (n === 1 ? new Promise((r) => (soltarV1 = r)) : ok(salidas({}, 2))),
    });
    const { rerender } = montar(<PantallaSalidasInternas servicios={s} id={ID} numero={1} vista="compras" />);
    rerender(
      <ProveedorRuta>
        <PantallaSalidasInternas servicios={s} id={ID} numero={2} vista="compras" />
      </ProveedorRuta>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: /COT-2026-00014-v2/ })).toBeTruthy();
    soltarV1({ ok: true, datos: salidas({}, 1) });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("heading", { level: 1, name: /COT-2026-00014-v2/ })).toBeTruthy();
  });
});
