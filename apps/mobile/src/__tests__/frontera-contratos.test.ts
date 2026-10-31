/**
 * Frontera de contratos (ADR-0021, AGENTS §13): `@softarq/contracts/cliente` es lo único que la app importa y
 * no debe exponer los esquemas del equipo ni de la administración (accesos con contraseña temporal,
 * referencias de estimación con proveedor y producto, definición de trabajos, bandeja).
 */
import * as cliente from "@softarq/contracts/cliente";
import * as completo from "@softarq/contracts";
import { describe, expect, it } from "vitest";

const DEL_EQUIPO = [
  "EsquemaNuevoAccesoCliente",
  "EsquemaAccesoCliente",
  "EsquemaRespuestaAltaAcceso",
  "EsquemaReferenciaEstimacion",
  "EsquemaDesignarReferencia",
  "EsquemaDefinicionTrabajo",
  "EsquemaResumenSolicitudEquipo",
  "EsquemaDetalleSolicitudEquipo",
  "EsquemaAtenderSolicitud",
];

// Esquemas generales de cálculo, catálogo y precios (`esquemas.ts`): contienen proveedor, insumoCodigo,
// precioCodigo, conceptoCodigo y consolidarCompras, y no son de la app del cliente.
const INTERNOS_GENERALES = [
  "EsquemaSolicitudCalculoDemo",
  "EsquemaSolicitudPartidaConcepto",
  "EsquemaExcepcionCalculo",
  "EsquemaOpcionPrecio",
  "EsquemaInsumoConOpciones",
  "EsquemaRespuestaOpcionesPrecio",
  "EsquemaRespuestaCalculoDemo",
  "EsquemaConceptoCatalogo",
  "EsquemaRespuestaError",
];

describe("frontera de contratos de la app", () => {
  it("el subpath del cliente no expone los esquemas generales de cálculo, catálogo ni el error completo", () => {
    const expuestos = Object.keys(cliente);
    for (const nombre of INTERNOS_GENERALES) {
      expect(Object.keys(completo), nombre).toContain(nombre);
      expect(expuestos, nombre).not.toContain(nombre);
    }
  });

  it("el error de la app descarta lo que no usa y exige lo que sí", () => {
    const e = cliente.EsquemaRespuestaErrorCliente.parse({
      error: { codigo: "CONFLICTO_EDICION", mensaje: "x", solicitudId: "s", registroVigente: {}, selecciones: { actuales: [], propuestas: [] } },
    });
    expect(Object.keys(e.error).sort()).toEqual(["codigo", "mensaje", "solicitudId"]);
    expect(cliente.EsquemaRespuestaErrorCliente.safeParse({ error: { codigo: "NO_EXISTE", mensaje: "x" } }).success).toBe(false);
  });

  it("el índice completo sí tiene los esquemas del equipo (para el panel y la API)", () => {
    for (const nombre of DEL_EQUIPO) expect(Object.keys(completo), nombre).toContain(nombre);
  });

  it("el subpath del cliente no expone ninguno", () => {
    const expuestos = Object.keys(cliente);
    for (const nombre of DEL_EQUIPO) expect(expuestos, nombre).not.toContain(nombre);
  });

  it("el subpath del cliente sí expone lo que la app necesita", () => {
    const expuestos = Object.keys(cliente);
    for (const nombre of ["EsquemaCapturaSolicitud", "EsquemaSolicitudDelCliente", "EsquemaTrabajoCliente", "EsquemaRespuestaAccesoMovil", "ROTULO_ESTIMACION", "EsquemaRespuestaErrorCliente", "EsquemaCotizacionComercial", "CAPACIDADES"]) {
      expect(expuestos, nombre).toContain(nombre);
    }
  });
});
