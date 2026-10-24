import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { esFalloApi } from "../../api/errores";
import { CAPACIDADES_CLIENTE, TOKEN_A, TOKEN_B, accesoDe, crearFetchFalso, errorApi, sesionDe, type Manejador, type Peticion } from "../../pruebas/ayudas";
import { AlmacenMemoria, type AlmacenToken } from "../almacen";
import { GestorSesion, MINIMO_REVALIDAR_MS } from "../gestor";

const BASE = "http://localhost:3000";
const Cualquiera = z.unknown();

function montar(manejador: Manejador, opciones: { token?: string | null; almacen?: AlmacenToken } = {}) {
  const { fetch, peticiones } = crearFetchFalso(manejador);
  const almacen = opciones.almacen ?? new AlmacenMemoria(opciones.token ?? null);
  let reloj = 1_000_000;
  const gestor = new GestorSesion({ baseUrl: BASE, almacen, fetch, ahora: () => reloj });
  return { gestor, peticiones, almacen, avanzar: (ms: number) => (reloj += ms) };
}

const esRuta = (p: Peticion, metodo: string, ruta: string) => p.metodo === metodo && p.url.pathname === ruta;
const SESION_OK = sesionDe(["CLIENTE"], CAPACIDADES_CLIENTE);

describe("restaurar al abrir la app", () => {
  it("sin token guardado: anónima, sin llamar a la API", async () => {
    const m = montar(() => ({ estado: 500 }));
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", sesion: null, aviso: null });
    expect(m.peticiones).toHaveLength(0);
  });

  it("token guardado y vigente: se revalida con el servidor y manda lo que él dice (identidad y capacidades)", async () => {
    const m = montar(() => ({ estado: 200, cuerpo: SESION_OK }), { token: TOKEN_A });
    await m.gestor.restaurar();
    const e = m.gestor.obtenerEstado();
    expect(e.fase).toBe("activa");
    expect(e.sesion?.capacidades).toEqual(CAPACIDADES_CLIENTE);
    expect(m.peticiones).toHaveLength(1);
    expect(esRuta(m.peticiones[0]!, "GET", "/api/v1/auth/movil/sesion")).toBe(true);
    expect(m.peticiones[0]!.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_A}`);
  });

  it("token expirado o revocado (401): se borra del almacén, queda anónima con aviso y no se vuelve a usar", async () => {
    const m = montar(() => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") }), { token: TOKEN_A });
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", sesion: null, aviso: { tipo: "vencida" } });
    expect(await m.almacen.leer()).toBeNull();
    await m.gestor.alVolverAPrimerPlano();
    expect(m.peticiones).toHaveLength(1);
  });

  it("sin conexión al abrir: conserva el token, ofrece reintentar y al volver la red restaura", async () => {
    let enLinea = false;
    const m = montar(() => {
      if (!enLinea) throw new TypeError("Network request failed");
      return { estado: 200, cuerpo: SESION_OK };
    }, { token: TOKEN_A });
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado().fase).toBe("sin_conexion");
    expect(await m.almacen.leer()).toBe(TOKEN_A);
    enLinea = true;
    await m.gestor.reintentarRestauracion();
    expect(m.gestor.obtenerEstado().fase).toBe("activa");
  });

  it("contraseña temporal pendiente: fase de cambio obligatorio", async () => {
    const m = montar(() => ({ estado: 200, cuerpo: sesionDe(["CLIENTE"], ["sesion.propia"], { cambioContrasenaRequerido: true }) }), { token: TOKEN_A });
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "cambio_contrasena" });
  });
});

describe("inicio de sesión", () => {
  const login: Manejador = (p) => (esRuta(p, "POST", "/api/v1/auth/movil/sesion") ? { estado: 200, cuerpo: accesoDe(TOKEN_A) } : { estado: 500 });

  it("guarda solo el token en el almacén seguro; la contraseña y el token no quedan en el estado ni se reenvían", async () => {
    const m = montar(login);
    await m.gestor.iniciarSesion("laura@softarq.test", "contraseña-secreta-123");
    const e = m.gestor.obtenerEstado();
    expect(e).toMatchObject({ fase: "activa", aviso: null });
    expect(await m.almacen.leer()).toBe(TOKEN_A);
    expect(JSON.stringify(e)).not.toContain(TOKEN_A);
    expect(JSON.stringify(e)).not.toContain("contraseña-secreta-123");
    expect(m.peticiones[0]!.cabeceras["Authorization"]).toBeUndefined();
    expect(m.peticiones[0]!.cuerpo).toEqual({ correo: "laura@softarq.test", contrasena: "contraseña-secreta-123" });
    // Después del acceso, ninguna petición vuelve a llevar la contraseña.
    await m.gestor.cliente.obtener("/api/v1/cliente/solicitudes", Cualquiera).catch(() => {});
    expect(JSON.stringify(m.peticiones.slice(1))).not.toContain("contraseña-secreta-123");
  });

  it("credenciales incorrectas: error de la API, sigue anónima y nada se guarda", async () => {
    const m = montar(() => ({ estado: 401, cuerpo: errorApi("CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.") }));
    await m.gestor.restaurar(); // la app siempre restaura antes de mostrar el acceso
    const e = await m.gestor.iniciarSesion("a@b.test", "mala").catch((x: unknown) => x);
    expect(esFalloApi(e) && e.tipo).toBe("credenciales");
    expect(m.gestor.obtenerEstado().fase).toBe("anonima");
    expect(await m.almacen.leer()).toBeNull();
  });

  it("un acceso con contraseña temporal entra en cambio obligatorio", async () => {
    const m = montar(() => ({ estado: 200, cuerpo: accesoDe(TOKEN_A, { capacidades: ["sesion.propia"], cambioContrasenaRequerido: true }) }));
    await m.gestor.iniciarSesion("a@b.test", "temporal");
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "cambio_contrasena" });
    expect(m.gestor.obtenerEstado().sesion?.capacidades).toEqual(["sesion.propia"]);
  });

  it("si el almacén seguro falla, no se mantiene la sesión: se revoca en el servidor y se informa", async () => {
    const roto: AlmacenToken = { leer: async () => null, guardar: async () => { throw new Error("keystore"); }, borrar: async () => {} };
    const m = montar((p) => (esRuta(p, "POST", "/api/v1/auth/movil/sesion") ? { estado: 200, cuerpo: accesoDe(TOKEN_A) } : { estado: 204 }), { almacen: roto });
    const e = await m.gestor.iniciarSesion("a@b.test", "x").catch((x: unknown) => x);
    expect(esFalloApi(e) && e.message).toMatch(/guardar la sesión de forma segura/);
    expect(m.gestor.obtenerEstado().fase).not.toBe("activa");
    expect(m.peticiones.some((p) => esRuta(p, "DELETE", "/api/v1/auth/sesion") && p.cabeceras["Authorization"] === `Bearer ${TOKEN_A}`)).toBe(true);
  });
});

describe("cambio obligatorio de contraseña", () => {
  const conTemporal: Manejador = (p) => {
    if (esRuta(p, "POST", "/api/v1/auth/movil/sesion")) return { estado: 200, cuerpo: accesoDe(TOKEN_A, { capacidades: ["sesion.propia"], cambioContrasenaRequerido: true }) };
    if (esRuta(p, "POST", "/api/v1/auth/contrasena")) return { estado: 204 };
    return { estado: 500 };
  };

  it("el cambio exitoso revoca todo en el servidor: se borra el token y se vuelve al acceso con un aviso", async () => {
    const m = montar(conTemporal);
    await m.gestor.iniciarSesion("a@b.test", "temporal");
    await m.gestor.cambiarContrasena("temporal", "Nueva-contraseña-123", "Nueva-contraseña-123");
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", sesion: null, aviso: { tipo: "contrasena_cambiada" } });
    expect(await m.almacen.leer()).toBeNull();
    const cambio = m.peticiones.find((p) => esRuta(p, "POST", "/api/v1/auth/contrasena"))!;
    expect(cambio.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_A}`);
    expect(cambio.cuerpo).toEqual({ actual: "temporal", nueva: "Nueva-contraseña-123", confirmacion: "Nueva-contraseña-123" });
  });

  it("si la API rechaza el cambio, sigue en cambio obligatorio y se ven los campos inválidos", async () => {
    const m = montar((p) => (esRuta(p, "POST", "/api/v1/auth/contrasena") ? { estado: 422, cuerpo: errorApi("CONTRASENA_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.", { campos: [{ ruta: "actual", mensaje: "La contraseña actual no es correcta." }] }) } : conTemporal(p)));
    await m.gestor.iniciarSesion("a@b.test", "temporal");
    const e = await m.gestor.cambiarContrasena("mala", "Nueva-contraseña-123", "Nueva-contraseña-123").catch((x: unknown) => x);
    expect(esFalloApi(e) && e.detalle.campos).toEqual([{ ruta: "actual", mensaje: "La contraseña actual no es correcta." }]);
    expect(m.gestor.obtenerEstado().fase).toBe("cambio_contrasena");
    expect(await m.almacen.leer()).toBe(TOKEN_A);
  });

  it("un 403 CAMBIO_CONTRASENA_REQUERIDO en cualquier consulta lleva a la pantalla de cambio (la API restringió la sesión)", async () => {
    let restringida = false;
    const m = montar((p) => {
      if (esRuta(p, "GET", "/api/v1/auth/movil/sesion")) return { estado: 200, cuerpo: restringida ? sesionDe(["CLIENTE"], ["sesion.propia"], { cambioContrasenaRequerido: true }) : SESION_OK };
      if (restringida) return { estado: 403, cuerpo: errorApi("CAMBIO_CONTRASENA_REQUERIDO") };
      return { estado: 200, cuerpo: {} };
    }, { token: TOKEN_A });
    await m.gestor.restaurar();
    restringida = true; // un restablecimiento del Administrador del sistema
    await m.gestor.cliente.obtener("/api/v1/cliente/solicitudes", Cualquiera).catch(() => {});
    await m.gestor.revalidarYaMismo();
    expect(m.gestor.obtenerEstado().fase).toBe("cambio_contrasena");
  });
});

describe("cierre, expiración y revocación", () => {
  const activa = (extra: Manejador = () => ({ estado: 500 })): Manejador => (p) => (esRuta(p, "GET", "/api/v1/auth/movil/sesion") ? { estado: 200, cuerpo: SESION_OK } : extra(p));

  it("cerrar sesión revoca en el servidor con el token, borra el almacén y no deja aviso", async () => {
    const m = montar(activa((p) => (esRuta(p, "DELETE", "/api/v1/auth/sesion") ? { estado: 204 } : { estado: 500 })), { token: TOKEN_A });
    await m.gestor.restaurar();
    await m.gestor.cerrarSesion();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", sesion: null, aviso: null });
    expect(await m.almacen.leer()).toBeNull();
    const cierre = m.peticiones.find((p) => esRuta(p, "DELETE", "/api/v1/auth/sesion"))!;
    expect(cierre.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_A}`);
  });

  it("cerrar sin red o con la sesión ya vencida igual limpia el teléfono, sin presentarlo como «sesión vencida»", async () => {
    for (const cierre of [() => { throw new TypeError("sin red"); }, () => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") })] as Manejador[]) {
      const m = montar(activa((p) => (esRuta(p, "DELETE", "/api/v1/auth/sesion") ? cierre(p) : { estado: 500 })), { token: TOKEN_A });
      await m.gestor.restaurar();
      await m.gestor.cerrarSesion();
      expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", aviso: null });
      expect(await m.almacen.leer()).toBeNull();
    }
  });

  it("un 401 en cualquier consulta (vencida, revocada, cuenta desactivada) cierra la sesión local con aviso y avisa a las cachés", async () => {
    const m = montar(activa(() => ({ estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") })), { token: TOKEN_A });
    await m.gestor.restaurar();
    const limpiar = vi.fn();
    m.gestor.alPerderSesion(limpiar);
    const generacion = m.gestor.obtenerEstado().generacion;
    await m.gestor.cliente.obtener("/api/v1/cliente/cotizaciones", Cualquiera).catch(() => {});
    await vi.waitFor(() => expect(m.gestor.obtenerEstado().fase).toBe("anonima"));
    expect(m.gestor.obtenerEstado()).toMatchObject({ aviso: { tipo: "vencida" }, sesion: null });
    expect(m.gestor.obtenerEstado().generacion).toBeGreaterThan(generacion);
    expect(limpiar).toHaveBeenCalled();
    expect(await m.almacen.leer()).toBeNull();
  });
});

describe("cambio de cuenta y respuestas tardías", () => {
  it("lo que llega de la cuenta anterior después de un cierre o un acceso nuevo nunca se entrega", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    const m = montar((p) => {
      if (esRuta(p, "GET", "/api/v1/auth/movil/sesion")) return { estado: 200, cuerpo: SESION_OK };
      if (esRuta(p, "GET", "/api/v1/cliente/solicitudes")) return { estado: 200, cuerpo: { clientes: ["de la cuenta A"] }, espera };
      if (esRuta(p, "POST", "/api/v1/auth/movil/sesion")) return { estado: 200, cuerpo: accesoDe(TOKEN_B, { usuario: { nombre: "Otra", correo: "otra@softarq.test" } }) };
      if (esRuta(p, "DELETE", "/api/v1/auth/sesion")) return { estado: 204 };
      return { estado: 500 };
    }, { token: TOKEN_A });
    await m.gestor.restaurar();
    const pendiente = m.gestor.cliente.obtener("/api/v1/cliente/solicitudes", Cualquiera).catch((x: unknown) => x);
    await m.gestor.cerrarSesion();
    await m.gestor.iniciarSesion("otra@softarq.test", "x");
    soltar();
    expect(await pendiente).toMatchObject({ tipo: "cancelada" });
    expect(m.gestor.obtenerEstado().sesion?.usuario.correo).toBe("otra@softarq.test");
    // Y las solicitudes nuevas ya llevan el token de la cuenta nueva.
    await m.gestor.cliente.obtener("/api/v1/cliente/solicitudes", Cualquiera).catch(() => {});
    expect(m.peticiones.at(-1)!.cabeceras["Authorization"]).toBe(`Bearer ${TOKEN_B}`);
  });

  it("el acceso nuevo avisa a las cachés (limpiar) antes de entregar nada de la cuenta nueva", async () => {
    const orden: string[] = [];
    const m = montar(() => ({ estado: 200, cuerpo: accesoDe(TOKEN_B) }));
    m.gestor.alPerderSesion(() => orden.push("limpiar"));
    m.gestor.suscribir(() => orden.push("estado"));
    await m.gestor.iniciarSesion("a@b.test", "x");
    expect(orden[0]).toBe("limpiar");
  });
});

describe("revalidación al volver a primer plano", () => {
  it("como mucho una vez por minuto; después del mínimo vuelve a preguntar al servidor, que decide", async () => {
    let n = 0;
    const m = montar((p) => {
      if (!esRuta(p, "GET", "/api/v1/auth/movil/sesion")) return { estado: 500 };
      n++;
      return { estado: 200, cuerpo: n >= 3 ? sesionDe(["CLIENTE"], ["sesion.propia", "cliente.solicitudes"]) : SESION_OK };
    }, { token: TOKEN_A });
    await m.gestor.restaurar(); // n = 1
    await m.gestor.alVolverAPrimerPlano();
    expect(n).toBe(1); // demasiado pronto
    m.avanzar(MINIMO_REVALIDAR_MS + 1);
    await m.gestor.alVolverAPrimerPlano(); // n = 2
    expect(n).toBe(2);
    m.avanzar(MINIMO_REVALIDAR_MS + 1);
    await m.gestor.alVolverAPrimerPlano(); // n = 3: el servidor cambió las funciones
    expect(m.gestor.obtenerEstado().sesion).toMatchObject({ funciones: ["CLIENTE"], capacidades: ["sesion.propia", "cliente.solicitudes"] });
  });

  it("si al volver la sesión ya no existe (401), se cierra con aviso", async () => {
    let vigente = true;
    const m = montar((p) => (esRuta(p, "GET", "/api/v1/auth/movil/sesion") ? (vigente ? { estado: 200, cuerpo: SESION_OK } : { estado: 401, cuerpo: errorApi("SESION_NO_VALIDA") }) : { estado: 500 }), { token: TOKEN_A });
    await m.gestor.restaurar();
    vigente = false;
    m.avanzar(MINIMO_REVALIDAR_MS + 1);
    await m.gestor.alVolverAPrimerPlano();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", aviso: { tipo: "vencida" } });
    expect(await m.almacen.leer()).toBeNull();
  });

  it("un fallo de red al revalidar no cierra una sesión abierta", async () => {
    let enLinea = true;
    const m = montar(() => {
      if (!enLinea) throw new TypeError("sin red");
      return { estado: 200, cuerpo: SESION_OK };
    }, { token: TOKEN_A });
    await m.gestor.restaurar();
    enLinea = false;
    m.avanzar(MINIMO_REVALIDAR_MS + 1);
    await m.gestor.alVolverAPrimerPlano();
    expect(m.gestor.obtenerEstado().fase).toBe("activa");
    expect(await m.almacen.leer()).toBe(TOKEN_A);
  });

  it("revalidaciones simultáneas comparten una sola solicitud", async () => {
    const m = montar(() => ({ estado: 200, cuerpo: SESION_OK }), { token: TOKEN_A });
    await m.gestor.restaurar();
    await Promise.all([m.gestor.revalidarYaMismo(), m.gestor.revalidarYaMismo(), m.gestor.revalidarYaMismo()]);
    expect(m.peticiones.filter((p) => esRuta(p, "GET", "/api/v1/auth/movil/sesion"))).toHaveLength(2); // restaurar + una
  });

  it("un 403 SIN_PERMISO refresca las capacidades (pudieron cambiar en el servidor)", async () => {
    let reducida = false;
    const m = montar((p) => {
      if (esRuta(p, "GET", "/api/v1/auth/movil/sesion")) return { estado: 200, cuerpo: reducida ? sesionDe(["CLIENTE"], ["sesion.propia", "cliente.solicitudes"]) : SESION_OK };
      return { estado: 403, cuerpo: errorApi("SIN_PERMISO") };
    }, { token: TOKEN_A });
    await m.gestor.restaurar();
    reducida = true;
    await m.gestor.cliente.obtener("/api/v1/cliente/cotizaciones", Cualquiera).catch(() => {});
    await vi.waitFor(() => expect(m.gestor.obtenerEstado().sesion?.capacidades).toEqual(["sesion.propia", "cliente.solicitudes"]));
    expect(m.gestor.obtenerEstado().fase).toBe("activa");
  });

  it("si el permiso de solicitudes se retira con la sesión abierta, se cierra con un aviso claro y se limpian las cachés", async () => {
    let retirado = false;
    const m = montar((p) => {
      if (esRuta(p, "GET", "/api/v1/auth/movil/sesion")) return { estado: 200, cuerpo: retirado ? sesionDe(["CLIENTE"], ["sesion.propia"]) : SESION_OK };
      return { estado: 403, cuerpo: errorApi("SIN_PERMISO") };
    }, { token: TOKEN_A });
    await m.gestor.restaurar();
    const limpiar = vi.fn();
    m.gestor.alPerderSesion(limpiar);
    retirado = true;
    await m.gestor.cliente.obtener("/api/v1/cliente/solicitudes", Cualquiera).catch(() => {});
    await vi.waitFor(() => expect(m.gestor.obtenerEstado().fase).toBe("anonima"));
    expect(m.gestor.obtenerEstado().aviso).toMatchObject({ tipo: "sin_acceso" });
    expect(limpiar).toHaveBeenCalled();
    expect(await m.almacen.leer()).toBeNull();
  });
});

describe("la app es del cliente (ADR-0021)", () => {
  const INTERNA = sesionDe(["PREPARADOR"], ["sesion.propia", "clientes.consultar", "cotizaciones.consultar"]);

  it("una sesión interna que quedó guardada de la etapa 1 se revoca, se borra y se explica", async () => {
    const m = montar((p) => (esRuta(p, "GET", "/api/v1/auth/movil/sesion") ? { estado: 200, cuerpo: INTERNA } : { estado: 204 }), { token: TOKEN_A });
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", sesion: null, aviso: { tipo: "cuenta_interna" } });
    expect(m.gestor.obtenerEstado().aviso?.mensaje).toContain("panel web");
    expect(await m.almacen.leer()).toBeNull();
    expect(m.peticiones.some((p) => esRuta(p, "DELETE", "/api/v1/auth/sesion"))).toBe(true);
  });

  it("si el servidor responde CUENTA_INTERNA_USE_PANEL al restaurar, también queda anónima con ese aviso", async () => {
    const m = montar(() => ({ estado: 403, cuerpo: errorApi("CUENTA_INTERNA_USE_PANEL", "Tu cuenta es del equipo.", { panelUrl: "http://localhost:5173" }) }), { token: TOKEN_A });
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", aviso: { tipo: "cuenta_interna" } });
    expect(await m.almacen.leer()).toBeNull();
  });

  it("al iniciar sesión, una cuenta interna recibe la dirección del panel y no se guarda nada", async () => {
    const m = montar(() => ({ estado: 403, cuerpo: errorApi("CUENTA_INTERNA_USE_PANEL", "Esta aplicación es para clientes.", { panelUrl: "http://localhost:5173" }) }));
    await m.gestor.restaurar();
    const e = await m.gestor.iniciarSesion("preparadora@softarq.test", "x").catch((x: unknown) => x);
    expect(esFalloApi(e) && e.tipo).toBe("cuenta_interna");
    expect(esFalloApi(e) && e.detalle.panelUrl).toBe("http://localhost:5173");
    expect(m.gestor.obtenerEstado().fase).toBe("anonima");
    expect(await m.almacen.leer()).toBeNull();
  });

  it("si la API entregara una sesión que no es de cliente, la app la revoca y no la guarda", async () => {
    const m = montar((p) => (esRuta(p, "POST", "/api/v1/auth/movil/sesion") ? { estado: 200, cuerpo: { ...INTERNA, tokenSesion: TOKEN_A } } : { estado: 204 }));
    const e = await m.gestor.iniciarSesion("preparadora@softarq.test", "x").catch((x: unknown) => x);
    expect(esFalloApi(e) && e.tipo).toBe("cuenta_interna");
    expect(await m.almacen.leer()).toBeNull();
    expect(m.peticiones.some((p) => esRuta(p, "DELETE", "/api/v1/auth/sesion") && p.cabeceras["Authorization"] === `Bearer ${TOKEN_A}`)).toBe(true);
  });

  it("un 403 de permiso al restaurar (acceso retirado mientras la app estaba cerrada) deja anónima con aviso de acceso", async () => {
    const m = montar(() => ({ estado: 403, cuerpo: errorApi("SIN_PERMISO") }), { token: TOKEN_A });
    await m.gestor.restaurar();
    expect(m.gestor.obtenerEstado()).toMatchObject({ fase: "anonima", aviso: { tipo: "sin_acceso" } });
    expect(await m.almacen.leer()).toBeNull();
  });

  it("la contraseña temporal caducada se informa con el tipo de fallo correspondiente", async () => {
    const m = montar(() => ({ estado: 401, cuerpo: errorApi("CONTRASENA_TEMPORAL_CADUCADA", "La contraseña temporal caducó.") }));
    const e = await m.gestor.iniciarSesion("laura@softarq.test", "vieja").catch((x: unknown) => x);
    expect(esFalloApi(e) && e.tipo).toBe("temporal_caducada");
  });
});
