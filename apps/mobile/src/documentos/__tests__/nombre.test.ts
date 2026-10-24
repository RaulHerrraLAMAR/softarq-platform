import { describe, expect, it } from "vitest";
import { nombreDePdf } from "../nombre";

describe("nombre del PDF", () => {
  it("conserva el folio", () => {
    expect(nombreDePdf("COT-2026-00012")).toBe("COT-2026-00012.pdf");
  });
  it("no deja caracteres de ruta ni espacios, aunque el folio venga raro", () => {
    expect(nombreDePdf("../../etc/passwd")).toBe("etc_passwd.pdf");
    expect(nombreDePdf("COT 2026/00012")).toBe("COT_2026_00012.pdf");
    expect(nombreDePdf("")).toBe("cotizacion.pdf");
    expect(nombreDePdf("ñandú")).toBe("nandu.pdf");
    expect(nombreDePdf("x".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});
