import { ESTADOS_SOLICITUD } from "@softarq/contracts/cliente";
import { describe, expect, it } from "vitest";
import { ESTADOS, etiquetaEstado, PASOS_SEGUIMIENTO } from "../etiquetas";

describe("etiquetas de estado", () => {
  it("cada estado del contrato tiene texto, tono y explicación (nunca se muestra el código)", () => {
    for (const e of ESTADOS_SOLICITUD) {
      expect(ESTADOS[e], e).toBeDefined();
      expect(ESTADOS[e].texto, e).not.toMatch(/_/);
      expect(ESTADOS[e].texto, e).not.toBe(e);
      expect(ESTADOS[e].explicacion.length, e).toBeGreaterThan(20);
    }
    expect(etiquetaEstado("EN_PREPARACION")).toBe("En preparación");
  });

  it("el seguimiento recorre estados válidos, en orden", () => {
    expect(PASOS_SEGUIMIENTO.map((p) => p.estado)).toEqual(["BORRADOR", "ENVIADA", "EN_PREPARACION", "COTIZADA"]);
    for (const p of PASOS_SEGUIMIENTO) expect(ESTADOS_SOLICITUD).toContain(p.estado);
  });
});
