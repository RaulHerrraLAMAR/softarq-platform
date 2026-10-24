import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sin tipos (script de arranque)
import { argumentosExpo, nodeOptionsIpv4, OPCION_IPV4 } from "../opciones-metro.mjs";

describe("opciones de Metro por USB", () => {
  it("añade la prioridad IPv4 cuando NODE_OPTIONS está vacío o ausente", () => {
    expect(nodeOptionsIpv4(undefined)).toBe(OPCION_IPV4);
    expect(nodeOptionsIpv4("  ")).toBe(OPCION_IPV4);
  });

  it("conserva las opciones previas y no duplica la de IPv4", () => {
    expect(nodeOptionsIpv4("--max-old-space-size=2048")).toBe(`--max-old-space-size=2048 ${OPCION_IPV4}`);
    expect(nodeOptionsIpv4(`--max-old-space-size=2048 ${OPCION_IPV4}`)).toBe(`--max-old-space-size=2048 ${OPCION_IPV4}`);
  });

  it("arranca la development build solo en loopback y en el puerto 8081", () => {
    expect(argumentosExpo()).toEqual(["start", "--dev-client", "--localhost", "--port", "8081"]);
    expect(argumentosExpo(["--clear"])).toEqual(["start", "--dev-client", "--localhost", "--port", "8081", "--clear"]);
    expect(argumentosExpo(["--port", "8082"])).toEqual(["start", "--dev-client", "--localhost", "--port", "8082"]);
  });
});
