import { describe, expect, it } from "vitest";
import { FalloApi } from "../../api/errores";
import { Consulta } from "../ejecutor";

const diferido = <T>() => {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((a, b) => ((resolver = a), (rechazar = b)));
  return { promesa, resolver, rechazar };
};

describe("ejecutor de consultas", () => {
  it("carga, lista y vacía: cargando → listo con datos", async () => {
    const c = new Consulta(async () => ["a", "b"]);
    expect(c.obtener().fase).toBe("cargando");
    await c.cargar();
    expect(c.obtener()).toMatchObject({ fase: "listo", datos: ["a", "b"], error: null, actualizando: false });
  });

  it("un error sin datos previos es una pantalla de error con reintento; reintentar recupera", async () => {
    let falla = true;
    const c = new Consulta(async () => {
      if (falla) throw new FalloApi("red", "Sin conexión.");
      return 7;
    });
    await c.cargar();
    expect(c.obtener()).toMatchObject({ fase: "error", datos: null, error: { tipo: "red" } });
    falla = false;
    await c.reintentar();
    expect(c.obtener()).toMatchObject({ fase: "listo", datos: 7, error: null });
  });

  it("con datos en pantalla, un reintento fallido los conserva y avisa aparte; no los presenta como actuales sin avisar", async () => {
    let n = 0;
    const c = new Consulta(async () => {
      if (++n === 2) throw new FalloApi("red", "Sin conexión.");
      return n;
    });
    await c.cargar();
    const p = c.cargar();
    expect(c.obtener()).toMatchObject({ fase: "listo", datos: 1, actualizando: true });
    await p;
    expect(c.obtener()).toMatchObject({ fase: "listo", datos: 1, actualizando: false, error: { tipo: "red" } });
  });

  it("una respuesta tardía de una carga anterior no pisa a la más reciente", async () => {
    const lenta = diferido<string>();
    const respuestas = [lenta.promesa, Promise.resolve("nueva")];
    const c = new Consulta(() => respuestas.shift()!);
    const primera = c.cargar();
    await c.cargar();
    lenta.resolver("vieja");
    await primera;
    expect(c.obtener().datos).toBe("nueva");
  });

  it("al descartar (pantalla cerrada o cambio de cuenta) la respuesta pendiente se ignora y se aborta la señal", async () => {
    const d = diferido<string>();
    let senal!: AbortSignal;
    const c = new Consulta((s) => ((senal = s), d.promesa));
    const p = c.cargar();
    c.descartar();
    d.resolver("de la cuenta anterior");
    await p;
    expect(senal.aborted).toBe(true);
    expect(c.obtener().datos).toBeNull();
  });

  it("un error «cancelada» no se muestra", async () => {
    const c = new Consulta(async () => {
      throw new FalloApi("cancelada", "cancelada");
    });
    await c.cargar();
    expect(c.obtener().fase).toBe("cargando");
  });

  it("notifica a los suscriptores en cada cambio", async () => {
    const c = new Consulta(async () => 1);
    let veces = 0;
    c.suscribir(() => veces++);
    await c.cargar();
    expect(veces).toBeGreaterThanOrEqual(2);
  });
});
