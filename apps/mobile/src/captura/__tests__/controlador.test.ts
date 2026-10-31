import { describe, expect, it } from "vitest";
import { CAPTURA_CUBIERTA, CATALOGO, ID_SOLICITUD, ServidorFalso, noEditable, sinRed, solicitudDe } from "../../pruebas/datos-cliente";
import { ControladorSolicitud } from "../controlador";
import { agregarTrabajo, cambiarRenglon, cambiarNotas, CAPTURA_LOCAL_VACIA } from "../modelo";

/** Reloj manual: el autoguardado se dispara a mano, sin esperas reales. */
function reloj() {
  const cola: (() => void)[] = [];
  return {
    programar: (f: () => void) => {
      cola.push(f);
      return () => {
        const i = cola.indexOf(f);
        if (i >= 0) cola.splice(i, 1);
      };
    },
    disparar: () => cola.splice(0).forEach((f) => f()),
    pendientes: () => cola.length,
  };
}

async function abrir(servidor = new ServidorFalso()) {
  const r = reloj();
  const c = new ControladorSolicitud({ id: ID_SOLICITUD, servicios: servidor.servicios, catalogo: CATALOGO, programar: r.programar });
  await c.cargar();
  return { c, servidor, r };
}

/** Escribe la cubierta de 6 × 6 m con la API del controlador. */
function escribirCubierta(c: ControladorSolicitud, largo = "6", ancho = "6") {
  c.modificar((x) => agregarTrabajo(x, "CUBIERTA", "LAMINA").captura);
  c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "largo", largo));
  c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "ancho", ancho));
}

const soltar = () => {
  let liberar!: () => void;
  const promesa = new Promise<void>((r) => (liberar = r));
  return { promesa, liberar };
};

describe("carga", () => {
  it("toma la solicitud del servidor como punto de partida", async () => {
    const { c } = await abrir(new ServidorFalso(solicitudDe({ captura: CAPTURA_CUBIERTA, revision: 3 })));
    const e = c.obtenerEstado();
    expect(e.carga).toBe("lista");
    expect(e.local.trabajos[0]!.secciones[0]).toMatchObject({ largo: "6", ancho: "6" });
    expect(e.guardado).toBe("limpio");
    expect(e.soloLectura).toBe(false);
  });

  it("una solicitud enviada se abre en solo lectura", async () => {
    const { c } = await abrir(new ServidorFalso(solicitudDe({ estado: "ENVIADA", editable: false, captura: CAPTURA_CUBIERTA })));
    expect(c.obtenerEstado().soloLectura).toBe(true);
    c.modificar((x) => cambiarNotas(x, "no debe guardarse"));
    expect(c.obtenerEstado().guardado).toBe("limpio");
  });
});

describe("autoguardado", () => {
  it("guarda tras la pausa, con la revisión vigente, y la actualiza", async () => {
    const { c, servidor, r } = await abrir();
    escribirCubierta(c);
    expect(c.obtenerEstado().guardado).toBe("pendiente");
    expect(r.pendientes()).toBe(1); // varios cambios seguidos = una sola espera
    r.disparar();
    await c.guardarAhora();
    expect(servidor.contar("guardar")).toBe(1);
    expect(servidor.llamadas.find((l) => l.operacion === "guardar")!.revision).toBe(1);
    expect(c.obtenerEstado().guardado).toBe("limpio");
    expect(servidor.solicitud.revision).toBe(2);
    expect(servidor.solicitud.captura.trabajos[0]!.secciones[0]).toMatchObject({ largo: "6", ancho: "6" });
  });

  it("nunca hay dos guardados a la vez: un cambio durante el guardado se guarda después, con la revisión nueva", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c, "6", "6");
    const retenido = soltar();
    servidor.retener.guardar = retenido.promesa;
    const primero = c.guardarAhora();
    await Promise.resolve();
    c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "largo", "7"));
    const segundo = c.guardarAhora(); // se une al guardado en curso
    expect(servidor.contar("guardar")).toBe(1);
    servidor.retener.guardar = undefined as never;
    retenido.liberar();
    expect(await primero).toBe(true);
    expect(await segundo).toBe(true);
    expect(servidor.llamadas.filter((l) => l.operacion === "guardar").map((l) => l.revision)).toEqual([1, 2]);
    expect(servidor.solicitud.captura.trabajos[0]!.secciones[0]!.largo).toBe("7");
    expect(c.obtenerEstado().guardado).toBe("limpio");
  });

  it("una medida mal escrita no impide guardar: viaja como pendiente y el campo conserva lo escrito", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c, "abc", "6");
    expect(await c.guardarAhora()).toBe(true);
    expect(servidor.solicitud.captura.trabajos[0]!.secciones[0]!.largo).toBeNull();
    expect(c.obtenerEstado().local.trabajos[0]!.secciones[0]!.largo).toBe("abc");
  });

  it("si el guardado falla por red, queda en error con los cambios intactos y se puede reintentar", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.fallos.guardar = [sinRed()];
    expect(await c.guardarAhora()).toBe(false);
    expect(c.obtenerEstado().guardado).toBe("error");
    expect(c.obtenerEstado().errorGuardado?.tipo).toBe("red");
    expect(c.haySinGuardar).toBe(true);
    expect(await c.guardarAhora()).toBe(true);
    expect(c.obtenerEstado().guardado).toBe("limpio");
  });
});

describe("conflicto de edición", () => {
  const OTRA = { trabajos: [{ id: "t1", trabajoCodigo: "LOSA", opcionCodigo: "CONCRETO", secciones: [{ nombre: "", piezas: "1", largo: "9", ancho: "9", alto: "0.12" }], huecos: [] }], notas: "otro dispositivo" };

  it("no sobrescribe en silencio: se detiene y muestra la versión del servidor", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.guardadoExterno(OTRA);
    expect(await c.guardarAhora()).toBe(false);
    const e = c.obtenerEstado();
    expect(e.guardado).toBe("conflicto");
    expect(e.conflicto?.captura.notas).toBe("otro dispositivo");
    expect(servidor.solicitud.captura).toEqual(OTRA); // el servidor no se tocó
    // Mientras se decide, un cambio más no intenta guardar.
    c.modificar((x) => cambiarNotas(x, "sigo escribiendo"));
    expect(c.obtenerEstado().guardado).toBe("conflicto");
    expect(servidor.contar("guardar")).toBe(1);
  });

  it("«usar lo guardado» descarta lo local", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.guardadoExterno(OTRA);
    await c.guardarAhora();
    c.usarVersionGuardada();
    const e = c.obtenerEstado();
    expect(e.guardado).toBe("limpio");
    expect(e.local.trabajos[0]!.trabajoCodigo).toBe("LOSA");
    expect(e.conflicto).toBeNull();
  });

  it("«conservar mis cambios» los guarda sobre la versión más reciente, por decisión de la persona", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.guardadoExterno(OTRA);
    await c.guardarAhora();
    expect(await c.conservarMisCambios()).toBe(true);
    expect(servidor.solicitud.captura.trabajos[0]!.trabajoCodigo).toBe("CUBIERTA");
    expect(c.obtenerEstado().guardado).toBe("limpio");
  });

  it("si el guardado anterior sí llegó y solo se perdió la respuesta, no hay conflicto", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.perderRespuesta.guardar = true;
    expect(await c.guardarAhora()).toBe(false);
    expect(c.obtenerEstado().guardado).toBe("error");
    servidor.perderRespuesta.guardar = false;
    expect(await c.guardarAhora()).toBe(true); // 409 → mismo contenido → se adopta la revisión
    expect(c.obtenerEstado().guardado).toBe("limpio");
    expect(c.obtenerEstado().conflicto).toBeNull();
    expect(servidor.solicitud.revision).toBe(2); // no se guardó dos veces
  });

  it("si la solicitud ya no se puede editar, pasa a solo lectura y lo explica", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.solicitud = { ...servidor.solicitud, estado: "ENVIADA", editable: false };
    servidor.fallos.guardar = [noEditable()];
    expect(await c.guardarAhora()).toBe(false);
    expect(c.obtenerEstado().soloLectura).toBe(true);
    expect(c.obtenerEstado().solicitud?.estado).toBe("ENVIADA");
  });
});

describe("estimación", () => {
  it("guarda antes de calcular y presenta el resultado como vigente", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    await c.estimar();
    const e = c.obtenerEstado();
    expect(servidor.llamadas.map((l) => l.operacion).filter((o) => o !== "solicitud")).toEqual(["guardar", "estimar"]);
    expect(servidor.llamadas.find((l) => l.operacion === "estimar")!.revision).toBe(2);
    expect(e.estimacion).toBe("vigente");
    expect(e.datosEstimacion?.comercial?.total).toBe("54190.68");
  });

  it("no calcula con datos pendientes ni mal escritos", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c, "6", "");
    await c.estimar();
    expect(servidor.contar("estimar")).toBe(0);
    c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "ancho", "-1"));
    await c.estimar();
    expect(servidor.contar("estimar")).toBe(0);
  });

  it("al cambiar una medida el resultado deja de ser vigente de inmediato, y vuelve a serlo al recalcular", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    await c.estimar();
    expect(c.obtenerEstado().estimacion).toBe("vigente");
    c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "largo", "7"));
    expect(c.obtenerEstado().estimacion).toBe("desactualizada"); // antes de guardar siquiera
    await c.guardarAhora();
    expect(c.obtenerEstado().estimacion).toBe("desactualizada"); // guardado, pero no recalculado
    servidor.totalEstimacion = "63222.11";
    await c.estimar();
    expect(c.obtenerEstado().estimacion).toBe("vigente");
    expect(c.obtenerEstado().datosEstimacion?.comercial?.total).toBe("63222.11");
  });

  it("volver a la medida anterior no pide recalcular si la estimación sigue siendo de esa captura", async () => {
    const { c } = await abrir();
    escribirCubierta(c);
    await c.estimar();
    c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "largo", "7"));
    c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "largo", "6"));
    await c.guardarAhora(); // el servidor ya tenía eso: no hay nada que guardar
    expect(c.obtenerEstado().estimacion).toBe("vigente");
  });

  it("descarta la respuesta tardía de una captura anterior", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    await c.guardarAhora();
    const retenido = soltar();
    servidor.retener.estimar = retenido.promesa;
    const calculo = c.estimar();
    await new Promise((r) => setTimeout(r, 0));
    expect(c.obtenerEstado().estimacion).toBe("calculando");
    c.modificar((x) => cambiarRenglon(x, "t1", "secciones", 0, "largo", "9")); // la captura cambia mientras se calcula
    retenido.liberar();
    await calculo;
    const e = c.obtenerEstado();
    expect(e.datosEstimacion).toBeNull();
    expect(e.estimacion).not.toBe("vigente");
    expect(e.estimacion).not.toBe("calculando");
  });

  it("dos pulsaciones seguidas hacen un solo cálculo", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    const a = c.estimar();
    const b = c.estimar();
    await Promise.all([a, b]);
    expect(servidor.contar("estimar")).toBe(1);
  });

  it("un fallo de red al calcular se muestra y no deja ningún resultado", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.fallos.estimar = [sinRed()];
    await c.estimar();
    const e = c.obtenerEstado();
    expect(e.estimacion).toBe("error");
    expect(e.errorEstimacion?.tipo).toBe("red");
    expect(e.datosEstimacion).toBeNull();
    await c.estimar();
    expect(c.obtenerEstado().estimacion).toBe("vigente");
  });

  it("sin red al guardar, calcular lo dice (no se queda mudo), no pide el cálculo y se puede reintentar", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.fallos.guardar = [sinRed()];
    await c.estimar();
    const e = c.obtenerEstado();
    expect(e.estimacion).toBe("error");
    expect(e.guardado).toBe("error");
    expect(e.errorEstimacion?.tipo).toBe("red");
    expect(servidor.contar("estimar")).toBe(0);
    expect(c.haySinGuardar).toBe(true);
    await c.estimar();
    expect(c.obtenerEstado().estimacion).toBe("vigente");
    expect(servidor.contar("guardar")).toBe(2);
    expect(servidor.contar("estimar")).toBe(1);
  });

  it("una estimación sin referencia no tiene importe y no se confunde con cero", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    const original = servidor.servicios.estimar;
    servidor.servicios.estimar = async (id, rev) => {
      const e = await original(id, rev);
      return { ...e, estado: "SIN_ESTIMACION", comercial: null, motivo: { codigo: "FALTA_REFERENCIA", mensaje: "El equipo completará la valoración de este trabajo." } };
    };
    await c.estimar();
    const e = c.obtenerEstado();
    expect(e.datosEstimacion?.comercial).toBeNull();
    expect(e.datosEstimacion?.estado).toBe("SIN_ESTIMACION");
  });
});

describe("envío", () => {
  it("se puede enviar sin estimación y la solicitud queda solo para lectura", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    await c.enviar();
    const e = c.obtenerEstado();
    expect(servidor.contar("estimar")).toBe(0);
    expect(servidor.solicitud.estado).toBe("ENVIADA");
    expect(e.envio).toBe("enviada");
    expect(e.soloLectura).toBe(true);
  });

  it("no envía con la captura incompleta", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c, "6", "");
    await c.enviar();
    expect(servidor.contar("enviar")).toBe(0);
    expect(c.obtenerEstado().envio).toBe("inactivo");
  });

  it("dos pulsaciones seguidas envían una sola vez", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    await Promise.all([c.enviar(), c.enviar()]);
    expect(servidor.contar("enviar")).toBe(1);
  });

  it("si se pierde la respuesta, consulta el estado y no crea otro envío", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.perderRespuesta.enviar = true; // el servidor recibe y envía, pero la respuesta no llega
    await c.enviar();
    const e = c.obtenerEstado();
    expect(e.envio).toBe("enviada");
    expect(e.errorEnvio).toBeNull();
    expect(servidor.contar("enviar")).toBe(1);
    expect(servidor.solicitud.estado).toBe("ENVIADA");
  });

  it("si el envío no llegó, muestra el error y el reintento es seguro", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    servidor.fallos.enviar = [sinRed()];
    await c.enviar();
    expect(c.obtenerEstado().envio).toBe("error");
    expect(servidor.solicitud.estado).toBe("BORRADOR");
    await c.enviar();
    expect(c.obtenerEstado().envio).toBe("enviada");
    expect(servidor.contar("enviar")).toBe(2);
  });

  it("sin red al guardar antes de enviar, lo dice, no envía nada y el reintento envía una sola vez", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    c.modificar((x) => cambiarNotas(x, "sin red 2"));
    servidor.fallos.guardar = [sinRed()];
    await c.enviar();
    const e = c.obtenerEstado();
    expect(e.envio).toBe("error");
    expect(e.guardado).toBe("error");
    expect(e.errorEnvio?.tipo).toBe("red");
    expect(servidor.contar("enviar")).toBe(0);
    expect(servidor.solicitud.estado).toBe("BORRADOR");
    await c.enviar();
    expect(c.obtenerEstado().envio).toBe("enviada");
    expect(servidor.solicitud.captura.notas).toBe("sin red 2");
    expect(servidor.contar("enviar")).toBe(1);
  });

  it("enviar guarda primero lo pendiente", async () => {
    const { c, servidor } = await abrir();
    escribirCubierta(c);
    c.modificar((x) => cambiarNotas(x, "Llamar antes de ir"));
    await c.enviar();
    expect(servidor.solicitud.captura.notas).toBe("Llamar antes de ir");
    expect(servidor.llamadas.map((l) => l.operacion).filter((o) => o !== "solicitud")).toEqual(["guardar", "enviar"]);
  });
});

describe("retiro", () => {
  it("retira una solicitud enviada", async () => {
    const { c, servidor } = await abrir(new ServidorFalso(solicitudDe({ estado: "ENVIADA", editable: false, captura: CAPTURA_CUBIERTA })));
    expect(await c.retirar()).toBe(true);
    expect(servidor.solicitud.estado).toBe("RETIRADA");
    expect(c.obtenerEstado().solicitud?.estado).toBe("RETIRADA");
  });
});

describe("al salir de la pantalla", () => {
  it("liberar cancela el guardado programado y deja de avisar", async () => {
    const { c, r } = await abrir();
    let avisos = 0;
    c.suscribir(() => avisos++);
    c.modificar((x) => cambiarNotas(x, "hola"));
    expect(r.pendientes()).toBe(1);
    c.liberar();
    expect(r.pendientes()).toBe(0);
    const antes = avisos;
    c.modificar((x) => cambiarNotas(x, "adiós"));
    expect(avisos).toBe(antes);
  });

  it("un trabajo nuevo sin medidas se guarda como borrador con pendientes", async () => {
    const { c, servidor } = await abrir();
    c.modificar((x) => agregarTrabajo(x ?? CAPTURA_LOCAL_VACIA, "LOSA", "CONCRETO").captura);
    await c.guardarAhora();
    expect(servidor.solicitud.captura.trabajos[0]).toMatchObject({ trabajoCodigo: "LOSA", secciones: [{ largo: null, ancho: null, alto: null }] });
  });
});
