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

describe("frontera de contratos de la app", () => {
  it("el índice completo sí tiene los esquemas del equipo (para el panel y la API)", () => {
    for (const nombre of DEL_EQUIPO) expect(Object.keys(completo), nombre).toContain(nombre);
  });

  it("el subpath del cliente no expone ninguno", () => {
    const expuestos = Object.keys(cliente);
    for (const nombre of DEL_EQUIPO) expect(expuestos, nombre).not.toContain(nombre);
  });

  it("el subpath del cliente sí expone lo que la app necesita", () => {
    const expuestos = Object.keys(cliente);
    for (const nombre of ["EsquemaCapturaSolicitud", "EsquemaSolicitudDelCliente", "EsquemaTrabajoCliente", "EsquemaRespuestaAccesoMovil", "ROTULO_ESTIMACION"]) {
      expect(expuestos, nombre).toContain(nombre);
    }
  });
});
