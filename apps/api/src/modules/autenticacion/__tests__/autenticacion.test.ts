/**
 * Pruebas unitarias de la autenticación (ADR-0007): matriz de permisos, política de sesiones,
 * limitador de accesos, tokens, CSRF y Argon2id (con los parámetros reales, sin reducirlos).
 */
import { CAPACIDADES, FUNCIONES_USUARIO } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { LimitadorAccesos } from "../aplicacion/limitador-accesos.js";
import { CAPACIDADES_POR_FUNCION, capacidadesDe } from "../dominio/capacidades.js";
import { POLITICA_SESION, debeActualizarActividad, estadoTemporal, normalizarCorreo } from "../dominio/politica.js";
import { ErrorContrasenasSaturado, PARAMETROS_ARGON2ID, PREFIJO_PHC, ServicioContrasenas } from "../infraestructura/contrasenas.js";
import { GeneradorCsrf } from "../infraestructura/csrf.js";
import { generarToken, hashDeToken, tieneFormaDeToken } from "../infraestructura/tokens.js";

const MIN = 60_000;

describe("matriz de permisos (contrastada con el libro)", () => {
  it("solo el Preparador calcula (BTN_Calcular exige FN_PREP)", () => {
    expect(capacidadesDe(["PREPARADOR"])).toContain("calculo.ejecutar");
    for (const f of ["REVISOR", "ADMIN_CATALOGO", "ADMIN_SISTEMA"] as const) {
      expect(capacidadesDe([f])).not.toContain("calculo.ejecutar");
    }
  });

  it("toda función consulta catálogos y su propia sesión", () => {
    for (const f of FUNCIONES_USUARIO) {
      expect(capacidadesDe([f])).toEqual(expect.arrayContaining(["sesion.propia", "catalogos.consultar"]));
    }
  });

  it("varias funciones suman capacidades sin duplicarlas y en orden estable", () => {
    // Módulo 8: `emisor.configurar` es del Administrador del sistema (17 CONFIG); módulo 11:
    // `catalogos.administrar` es del Administrador del catálogo; módulo 13: parámetros y personas son
    // del Administrador del sistema. Las cuatro funciones juntas suman todas las capacidades.
    // Módulo 17: las capacidades `cliente.*` son solo de la función CLIENTE; ninguna interna las recibe.
    const deAdministradores = ["emisor.configurar", "catalogos.administrar", "parametros.administrar", "personas.administrar"];
    const delCliente = ["cliente.solicitudes", "cliente.cotizaciones"];
    expect(capacidadesDe(["REVISOR", "PREPARADOR"])).toEqual(CAPACIDADES.filter((c) => !deAdministradores.includes(c) && !delCliente.includes(c)));
    expect(capacidadesDe([...FUNCIONES_USUARIO])).toEqual(CAPACIDADES.filter((c) => !delCliente.includes(c)));
    expect(capacidadesDe(["CLIENTE"])).toEqual(["sesion.propia", "cliente.solicitudes", "cliente.cotizaciones"]);
    expect(capacidadesDe([])).toEqual([]);
  });

  it("emitir: Preparador y Revisor (adaptación autorizada, ADR-0010); configurar el emisor: Administrador del sistema", () => {
    expect(capacidadesDe(["PREPARADOR"])).toContain("emisiones.emitir");
    expect(capacidadesDe(["REVISOR"])).toContain("emisiones.emitir");
    expect(capacidadesDe(["ADMIN_CATALOGO"])).not.toContain("emisiones.emitir");
    expect(capacidadesDe(["ADMIN_SISTEMA"])).not.toContain("emisiones.emitir");
    expect(capacidadesDe(["ADMIN_SISTEMA"])).toContain("emisor.configurar");
    for (const f of ["PREPARADOR", "REVISOR", "ADMIN_CATALOGO"] as const) expect(capacidadesDe([f])).not.toContain("emisor.configurar");
    // Poder emitir no concede aprobar.
    expect(capacidadesDe(["PREPARADOR"])).not.toContain("revisiones.decidir");
  });

  it("salidas internas (ADR-0018): Preparador y Revisor; los administradores no, salvo por otra función", () => {
    expect(capacidadesDe(["PREPARADOR"])).toContain("salidas.consultar");
    expect(capacidadesDe(["REVISOR"])).toContain("salidas.consultar");
    expect(capacidadesDe(["ADMIN_CATALOGO"])).not.toContain("salidas.consultar");
    expect(capacidadesDe(["ADMIN_SISTEMA"])).not.toContain("salidas.consultar");
    expect(capacidadesDe(["ADMIN_CATALOGO", "ADMIN_SISTEMA"])).not.toContain("salidas.consultar");
    expect(capacidadesDe(["ADMIN_SISTEMA", "PREPARADOR"])).toContain("salidas.consultar");
    // Consultar costos no concede calcular, aprobar ni emitir.
    expect(capacidadesDe(["REVISOR"])).not.toContain("calculo.ejecutar");
    expect(capacidadesDe(["PREPARADOR"])).not.toContain("revisiones.decidir");
  });

  it("administrar catálogos: solo el Administrador del catálogo (Req_Funcion FN_ADMCAT, ADR-0015)", () => {
    expect(capacidadesDe(["ADMIN_CATALOGO"])).toContain("catalogos.administrar");
    // Consultar datos técnicos o decidir excepciones no concede administrar el catálogo.
    for (const f of ["PREPARADOR", "REVISOR", "ADMIN_SISTEMA"] as const) {
      expect(capacidadesDe([f])).not.toContain("catalogos.administrar");
    }
  });

  it("parámetros y personas: solo el Administrador del sistema (BTN_Parametros y BTN_Personas exigen FN_ADMSIS, ADR-0017)", () => {
    for (const c of ["parametros.administrar", "personas.administrar"] as const) {
      expect(capacidadesDe(["ADMIN_SISTEMA"])).toContain(c);
      // El Administrador del catálogo no recibe la administración de personas ni de parámetros.
      for (const f of ["PREPARADOR", "REVISOR", "ADMIN_CATALOGO"] as const) expect(capacidadesDe([f])).not.toContain(c);
    }
  });

  it("la matriz solo usa capacidades del contrato", () => {
    for (const lista of Object.values(CAPACIDADES_POR_FUNCION)) {
      for (const c of lista) expect(CAPACIDADES).toContain(c);
    }
  });
});

describe("política de sesiones", () => {
  const creada = new Date("2026-10-02T12:00:00.000Z");
  const sesion = (extra: Partial<{ ultimaActividadEn: Date; revocadaEn: Date | null }> = {}) => ({
    creadaEn: creada,
    ultimaActividadEn: extra.ultimaActividadEn ?? creada,
    expiraEn: new Date(creada.getTime() + POLITICA_SESION.absolutaMs),
    revocadaEn: extra.revocadaEn ?? null,
  });
  const en = (ms: number) => new Date(creada.getTime() + ms);

  it("valores justificados en ADR-0007: 8 h absoluta, 30 min de inactividad, 15 min la previa", () => {
    expect(POLITICA_SESION.absolutaMs).toBe(8 * 60 * MIN);
    expect(POLITICA_SESION.inactividadMs).toBe(30 * MIN);
    expect(POLITICA_SESION.previaMs).toBe(15 * MIN);
  });

  it("vigente, vencida por inactividad (límite exclusivo) y revocada", () => {
    expect(estadoTemporal(sesion(), en(29 * MIN))).toBe("VIGENTE");
    expect(estadoTemporal(sesion(), en(30 * MIN))).toBe("VENCIDA_INACTIVIDAD");
    expect(estadoTemporal(sesion({ revocadaEn: en(1) }), en(2))).toBe("REVOCADA");
  });

  it("la actividad no evita la expiración absoluta", () => {
    const activa = sesion({ ultimaActividadEn: en(POLITICA_SESION.absolutaMs - MIN) });
    expect(estadoTemporal(activa, en(POLITICA_SESION.absolutaMs - 1))).toBe("VIGENTE");
    expect(estadoTemporal(activa, en(POLITICA_SESION.absolutaMs))).toBe("VENCIDA_ABSOLUTA");
  });

  it("la actividad se registra como mucho una vez por minuto", () => {
    expect(debeActualizarActividad(creada, en(59_999))).toBe(false);
    expect(debeActualizarActividad(creada, en(MIN))).toBe(true);
  });

  it("normaliza el correo igual que el CHECK de la tabla", () => {
    expect(normalizarCorreo("  Preparador.Demo@SoftArq.TEST ")).toBe("preparador.demo@softarq.test");
  });
});

describe("limitador de accesos", () => {
  const politica = { ventanaMs: 15 * MIN, fallosPorCuentaEIp: 5, fallosPorCuenta: 20, intentosPorIp: 30 };
  const crear = () => {
    let t = 0;
    const l = new LimitadorAccesos(politica, () => t);
    return { l, avanzar: (ms: number) => (t += ms) };
  };

  it("cuenta + IP: 5 fallos bloquean hasta el fin de la ventana, con el tiempo restante", () => {
    const { l, avanzar } = crear();
    for (let i = 0; i < 5; i++) {
      expect(l.comprobar("a@x.test", "1.1.1.1").permitido).toBe(true);
      l.registrarFallo("a@x.test", "1.1.1.1");
    }
    avanzar(5 * MIN);
    expect(l.comprobar("a@x.test", "1.1.1.1")).toEqual({ permitido: false, reintentarEnSegundos: 600 });
    // Otra IP para la misma cuenta, y otra cuenta desde la misma IP, siguen permitidas.
    expect(l.comprobar("a@x.test", "2.2.2.2").permitido).toBe(true);
    expect(l.comprobar("b@x.test", "1.1.1.1").permitido).toBe(true);
    avanzar(10 * MIN);
    expect(l.comprobar("a@x.test", "1.1.1.1").permitido).toBe(true); // nunca permanente
  });

  it("cuenta (todas las IP): 20 fallos frenan un ataque distribuido", () => {
    const { l } = crear();
    for (let i = 0; i < 20; i++) l.registrarFallo("a@x.test", `10.0.0.${i}`);
    expect(l.comprobar("a@x.test", "10.0.0.99").permitido).toBe(false);
  });

  it("IP: 30 intentos de cualquier resultado", () => {
    const { l } = crear();
    for (let i = 0; i < 30; i++) l.registrarIntento("3.3.3.3");
    expect(l.comprobar("cualquiera@x.test", "3.3.3.3").permitido).toBe(false);
  });

  it("un acceso correcto reinicia solo cuenta + IP", () => {
    const { l } = crear();
    for (let i = 0; i < 4; i++) l.registrarFallo("a@x.test", "1.1.1.1");
    l.registrarExito("a@x.test", "1.1.1.1");
    for (let i = 0; i < 4; i++) l.registrarFallo("a@x.test", "1.1.1.1");
    expect(l.comprobar("a@x.test", "1.1.1.1").permitido).toBe(true);
  });
});

describe("tokens opacos y CSRF", () => {
  it("32 bytes aleatorios en base64url; solo se guarda SHA-256", () => {
    const a = generarToken();
    const b = generarToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toHaveLength(32);
    expect(a.hash.equals(hashDeToken(a.token))).toBe(true);
    expect(a.hash.toString("base64url")).not.toBe(a.token);
  });

  it("rechaza valores sin la forma de un token", () => {
    for (const v of [undefined, "", "x".repeat(42), "x".repeat(44), "a+b/".repeat(11), 123]) {
      expect(tieneFormaDeToken(v)).toBe(false);
    }
  });

  it("el CSRF está ligado a la sesión y a la clave del proceso", () => {
    const g = new GeneradorCsrf();
    const t = g.tokenPara("sesion-1");
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(g.tokenPara("sesion-1")).toBe(t); // se recalcula: no hace falta guardarlo
    expect(g.esValido(t, "sesion-1")).toBe(true);
    expect(g.esValido(t, "sesion-2")).toBe(false);
    expect(g.esValido(undefined, "sesion-1")).toBe(false);
    // Se altera el PRIMER carácter: el último de 43 en base64url solo lleva 4 bits de datos y
    // cambiarlo (p. ej., «A» → «B») puede producir los mismos bytes.
    expect(g.esValido((t.startsWith("A") ? "B" : "A") + t.slice(1), "sesion-1")).toBe(false);
    expect(new GeneradorCsrf().esValido(t, "sesion-1")).toBe(false); // otra clave (reinicio)
  });
});

describe("contraseñas con Argon2id (parámetros reales)", () => {
  it("usa Argon2id m=64 MiB, t=3, p=4 y produce una cadena PHC verificable", async () => {
    expect(PARAMETROS_ARGON2ID).toMatchObject({ memoryCost: 65_536, timeCost: 3, parallelism: 4 });
    const s = new ServicioContrasenas();
    const h = await s.crearHash("clave de prueba ñ");
    expect(h.startsWith(PREFIJO_PHC)).toBe(true);
    expect(h).not.toContain("clave de prueba");
    expect(await s.verificar(h, "clave de prueba ñ")).toBe(true);
    expect(await s.verificar(h, "clave de prueba n")).toBe(false);
    expect(await s.verificar("no-es-un-hash", "x")).toBe(false);
    expect(await s.verificarFicticio("x")).toBe(false);
  });

  it("limita la concurrencia y rechaza cuando la cola está llena", async () => {
    const s = new ServicioContrasenas(1, 1);
    const h = await s.crearHash("x");
    const primera = s.verificar(h, "x");
    const segunda = s.verificar(h, "x"); // en cola
    await expect(s.verificar(h, "x")).rejects.toBeInstanceOf(ErrorContrasenasSaturado);
    expect(await primera).toBe(true);
    expect(await segunda).toBe(true);
  });
});
