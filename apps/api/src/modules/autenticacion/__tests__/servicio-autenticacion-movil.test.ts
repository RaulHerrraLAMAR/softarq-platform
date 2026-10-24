// Servicio de autenticación: sesión de tipo MOVIL (módulo 16, ADR-0020). Repositorio en memoria; sin PostgreSQL.
import type { FuncionUsuario } from "@softarq/contracts";
import { describe, expect, it } from "vitest";
import { LimitadorAccesos } from "../aplicacion/limitador-accesos.js";
import { ServicioAutenticacion } from "../aplicacion/servicio-autenticacion.js";
import { POLITICA_SESION } from "../dominio/politica.js";
import type { ServicioContrasenas } from "../infraestructura/contrasenas.js";
import { GeneradorCsrf } from "../infraestructura/csrf.js";
import type { MotivoRevocacion, NuevaSesion, RepositorioSesiones, SesionCompleta } from "../infraestructura/repositorio-sesiones.js";
import { hashDeToken } from "../infraestructura/tokens.js";

const MIN = 60_000;
const ORG = { id: "org-1", codigo: "DEMO", nombre: "Organización", esDemo: true };

interface Cuenta {
  usuarioId: string;
  correo: string;
  contrasena: string;
  activo: boolean;
  temporalExpiraEn: Date | null;
  membresias: { organizacionId: string; activa: boolean; funciones: FuncionUsuario[] }[];
}

/** Repositorio en memoria con la misma semántica que el de Prisma para lo que usa el servicio. */
class RepoMemoria {
  readonly sesiones = new Map<string, { id: string; nueva: NuevaSesion; actividad: Date; revocadaEn: Date | null; motivo: string | null }>();
  readonly cuentas: Cuenta[] = [];
  private n = 0;

  cuentaPorCorreo = async (correo: string) => {
    const c = this.cuentas.find((x) => x.correo === correo);
    return c
      ? {
          usuarioId: c.usuarioId,
          hashContrasena: `hash:${c.contrasena}`,
          activo: c.activo,
          temporalExpiraEn: c.temporalExpiraEn,
          membresiasActivas: c.membresias.filter((m) => m.activa).map((m) => ({ organizacionId: m.organizacionId })),
        }
      : null;
  };

  sesionPorHash = async (hash: Buffer): Promise<SesionCompleta | null> => {
    const s = [...this.sesiones.values()].find((x) => x.nueva.tokenHash.equals(hash));
    if (!s) return null;
    const t = s.nueva.titular;
    const cuenta = t ? this.cuentas.find((c) => c.usuarioId === t.usuarioId) : undefined;
    const m = cuenta?.membresias.find((x) => x.organizacionId === t?.organizacionId);
    return {
      id: s.id,
      tipo: s.nueva.tipo,
      creadaEn: s.nueva.creadaEn,
      ultimaActividadEn: s.actividad,
      expiraEn: s.nueva.expiraEn,
      revocadaEn: s.revocadaEn,
      titular:
        cuenta && m
          ? {
              usuarioId: cuenta.usuarioId,
              nombre: "Persona de prueba",
              correo: cuenta.correo,
              usuarioActivo: cuenta.activo,
              membresiaActiva: m.activa,
              temporalExpiraEn: cuenta.temporalExpiraEn,
              funciones: m.funciones,
              organizacion: ORG,
            }
          : null,
    };
  };

  reemplazar = async (anteriorId: string | null, motivo: MotivoRevocacion, nueva: NuevaSesion, ahora: Date): Promise<string> => {
    if (anteriorId) {
      const a = this.sesiones.get(anteriorId);
      if (a && !a.revocadaEn) {
        a.revocadaEn = ahora;
        a.motivo = motivo;
      }
    }
    const id = `s${++this.n}`;
    this.sesiones.set(id, { id, nueva, actividad: nueva.creadaEn, revocadaEn: null, motivo: null });
    return id;
  };

  registrarActividad = async (id: string, ahora: Date) => {
    const s = this.sesiones.get(id);
    if (s && !s.revocadaEn) s.actividad = ahora;
  };

  revocar = async (id: string, motivo: MotivoRevocacion, ahora: Date) => {
    const s = this.sesiones.get(id);
    if (s && !s.revocadaEn) {
      s.revocadaEn = ahora;
      s.motivo = motivo;
    }
  };

  hashDe = async () => null;
  cambiarContrasenaPropia = async () => undefined;
}

function montar(extra: Partial<Cuenta> = {}) {
  const repo = new RepoMemoria();
  repo.cuentas.push({
    usuarioId: "u1",
    correo: "persona@softarq.test",
    contrasena: "correcta-0123456789",
    activo: true,
    temporalExpiraEn: null,
    membresias: [{ organizacionId: ORG.id, activa: true, funciones: ["PREPARADOR"] }],
    ...extra,
  });
  let ahora = new Date("2026-10-24T12:00:00Z");
  const contrasenas = {
    verificar: async (hash: string, contrasena: string) => hash === `hash:${contrasena}`,
    verificarFicticio: async () => false,
    crearHash: async (c: string) => `hash:${c}`,
  } as unknown as ServicioContrasenas;
  const limitador = new LimitadorAccesos({ ventanaMs: 15 * MIN, fallosPorCuentaEIp: 5, fallosPorCuenta: 20, intentosPorIp: 30 }, () => ahora.getTime());
  const servicio = new ServicioAutenticacion(repo as unknown as RepositorioSesiones, contrasenas, limitador, new GeneradorCsrf(), { ahora: () => ahora });
  return { repo, servicio, avanzar: (ms: number) => (ahora = new Date(ahora.getTime() + ms)), ahora: () => ahora };
}

const ENTRAR = ["persona@softarq.test", "correcta-0123456789", "127.0.0.1"] as const;

describe("acceso móvil", () => {
  it("crea una sesión de tipo MOVIL con titular, sin sesión previa, y guarda solo el SHA-256 del token", async () => {
    const { servicio, repo } = montar();
    const r = await servicio.iniciarSesionMovil(...ENTRAR);
    expect(r.estado).toBe("CORRECTO");
    if (r.estado !== "CORRECTO") return;
    const guardadas = [...repo.sesiones.values()];
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]!.nueva.tipo).toBe("MOVIL");
    expect(guardadas[0]!.nueva.titular).toEqual({ usuarioId: "u1", organizacionId: ORG.id });
    expect(guardadas[0]!.nueva.tokenHash.equals(hashDeToken(r.tokens.tokenSesion))).toBe(true);
    expect(JSON.stringify([...repo.sesiones.values()])).not.toContain(r.tokens.tokenSesion);
    expect(r.contexto).toMatchObject({ funciones: ["PREPARADOR"], organizacion: { codigo: "DEMO" }, cambioContrasenaRequerido: false });
    expect(r.tokens.expiraEn.getTime() - montar().ahora().getTime()).toBe(POLITICA_SESION.absolutaMs);
  });

  it("credenciales incorrectas, cuenta inexistente, inactiva o sin pertenencia: el mismo resultado genérico", async () => {
    const m = montar();
    expect((await m.servicio.iniciarSesionMovil("persona@softarq.test", "mala", "127.0.0.1")).estado).toBe("CREDENCIALES_INVALIDAS");
    expect((await m.servicio.iniciarSesionMovil("nadie@softarq.test", "x", "127.0.0.1")).estado).toBe("CREDENCIALES_INVALIDAS");
    const inactiva = montar({ activo: false });
    expect((await inactiva.servicio.iniciarSesionMovil(...ENTRAR)).estado).toBe("CREDENCIALES_INVALIDAS");
    const sinMembresia = montar({ membresias: [] });
    expect((await sinMembresia.servicio.iniciarSesionMovil(...ENTRAR)).estado).toBe("CREDENCIALES_INVALIDAS");
    const dos = montar({ membresias: [{ organizacionId: "a", activa: true, funciones: ["REVISOR"] }, { organizacionId: "b", activa: true, funciones: ["REVISOR"] }] });
    expect((await dos.servicio.iniciarSesionMovil(...ENTRAR)).estado).toBe("CREDENCIALES_INVALIDAS");
    expect(m.repo.sesiones.size + inactiva.repo.sesiones.size + sinMembresia.repo.sesiones.size + dos.repo.sesiones.size).toBe(0);
  });

  it("el limitador de accesos también cubre el canal móvil (cuenta + IP: 5 fallos)", async () => {
    const { servicio } = montar();
    for (let i = 0; i < 5; i++) expect((await servicio.iniciarSesionMovil("persona@softarq.test", "mala", "10.0.0.1")).estado).toBe("CREDENCIALES_INVALIDAS");
    const bloqueado = await servicio.iniciarSesionMovil("persona@softarq.test", "correcta-0123456789", "10.0.0.1");
    expect(bloqueado.estado).toBe("LIMITE");
  });

  it("contraseña temporal vigente: sesión restringida a lo propio; caducada: no entra", async () => {
    const m = montar({ temporalExpiraEn: new Date("2026-10-26T12:00:00Z") });
    const r = await m.servicio.iniciarSesionMovil(...ENTRAR);
    expect(r.estado).toBe("CORRECTO");
    if (r.estado === "CORRECTO") expect(r.contexto).toMatchObject({ cambioContrasenaRequerido: true, capacidades: ["sesion.propia"] });
    const vieja = montar({ temporalExpiraEn: new Date("2026-10-24T11:00:00Z") });
    expect((await vieja.servicio.iniciarSesionMovil(...ENTRAR)).estado).toBe("TEMPORAL_CADUCADA");
    expect(vieja.repo.sesiones.size).toBe(0);
  });
});

describe("aislamiento entre canales", () => {
  it("el token móvil lo resuelve resolverMovil y NO resolver (cookie)", async () => {
    const { servicio } = montar();
    const r = await servicio.iniciarSesionMovil(...ENTRAR);
    if (r.estado !== "CORRECTO") throw new Error("acceso");
    expect((await servicio.resolverMovil(r.tokens.tokenSesion)).estado).toBe("VIGENTE");
    expect(await servicio.resolver(r.tokens.tokenSesion)).toEqual({ estado: "NO_VALIDA", motivo: "DESCONOCIDA" });
  });

  it("el token de una sesión web (cookie) lo resuelve resolver y NO resolverMovil", async () => {
    const { servicio, repo } = montar();
    const previa = await servicio.crearSesionPrevia(undefined);
    const idPrevia = [...repo.sesiones.values()][0]!.id;
    const web = await servicio.iniciarSesion({ sesionId: idPrevia }, ...ENTRAR);
    if (web.estado !== "CORRECTO") throw new Error("acceso web");
    expect((await servicio.resolver(web.tokens.tokenSesion)).estado).toBe("VIGENTE");
    expect(await servicio.resolverMovil(web.tokens.tokenSesion)).toEqual({ estado: "NO_VALIDA", motivo: "DESCONOCIDA" });
    expect(await servicio.resolverMovil(previa.tokenSesion)).toEqual({ estado: "NO_VALIDA", motivo: "DESCONOCIDA" });
  });

  it("un acceso móvil no revoca la sesión web de la misma persona (son sesiones independientes)", async () => {
    const { servicio, repo } = montar();
    await servicio.crearSesionPrevia(undefined);
    const idPrevia = [...repo.sesiones.values()][0]!.id;
    const web = await servicio.iniciarSesion({ sesionId: idPrevia }, ...ENTRAR);
    await servicio.iniciarSesionMovil(...ENTRAR);
    if (web.estado !== "CORRECTO") throw new Error("acceso web");
    expect((await servicio.resolver(web.tokens.tokenSesion)).estado).toBe("VIGENTE");
  });
});

describe("vida de la sesión móvil", () => {
  async function entrar(extra: Partial<Cuenta> = {}) {
    const m = montar(extra);
    const r = await m.servicio.iniciarSesionMovil(...ENTRAR);
    if (r.estado !== "CORRECTO") throw new Error("acceso");
    return { ...m, token: r.tokens.tokenSesion };
  }

  it("vence a los 30 min sin actividad y a las 8 h aunque haya actividad", async () => {
    const a = await entrar();
    a.avanzar(29 * MIN);
    expect((await a.servicio.resolverMovil(a.token)).estado).toBe("VIGENTE");
    a.avanzar(29 * MIN);
    expect((await a.servicio.resolverMovil(a.token)).estado).toBe("VIGENTE"); // la actividad renovó la ventana
    a.avanzar(31 * MIN);
    expect(await a.servicio.resolverMovil(a.token)).toEqual({ estado: "NO_VALIDA", motivo: "VENCIDA_INACTIVIDAD" });

    const b = await entrar();
    // 16 × 29 min = 7 h 44 min: la actividad mantiene viva la sesión; a las 8 h vence igualmente.
    for (let i = 0; i < 16; i++) {
      b.avanzar(29 * MIN);
      expect((await b.servicio.resolverMovil(b.token)).estado).toBe("VIGENTE");
    }
    b.avanzar(29 * MIN); // 8 h 13 min desde el acceso
    expect(await b.servicio.resolverMovil(b.token)).toEqual({ estado: "NO_VALIDA", motivo: "VENCIDA_ABSOLUTA" });
  });

  it("cerrar la sesión la revoca: el mismo token deja de servir", async () => {
    const a = await entrar();
    const sesionId = (await a.servicio.resolverMovil(a.token)).estado === "VIGENTE" ? [...a.repo.sesiones.keys()][0]! : "";
    await a.servicio.cerrarSesion(sesionId);
    expect(await a.servicio.resolverMovil(a.token)).toEqual({ estado: "NO_VALIDA", motivo: "REVOCADA" });
  });

  it("usuario o pertenencia desactivados: la siguiente solicitud la revoca con su motivo", async () => {
    const a = await entrar();
    a.repo.cuentas[0]!.activo = false;
    expect(await a.servicio.resolverMovil(a.token)).toEqual({ estado: "NO_VALIDA", motivo: "USUARIO_INACTIVO" });
    a.repo.cuentas[0]!.activo = true; // reactivar no revive la sesión
    expect((await a.servicio.resolverMovil(a.token)).estado).toBe("NO_VALIDA");

    const b = await entrar();
    b.repo.cuentas[0]!.membresias[0]!.activa = false;
    expect(await b.servicio.resolverMovil(b.token)).toEqual({ estado: "NO_VALIDA", motivo: "MEMBRESIA_INACTIVA" });
    expect([...b.repo.sesiones.values()][0]!.motivo).toBe("MEMBRESIA_INACTIVA");
  });

  it("las funciones se leen en cada solicitud: un cambio afecta a la siguiente, no se copian a la sesión", async () => {
    const a = await entrar();
    const antes = await a.servicio.resolverMovil(a.token);
    expect(antes.estado === "VIGENTE" && antes.sesion.capacidades.includes("calculo.ejecutar")).toBe(true);
    a.repo.cuentas[0]!.membresias[0]!.funciones = ["REVISOR"];
    const despues = await a.servicio.resolverMovil(a.token);
    expect(despues.estado === "VIGENTE" && despues.sesion.capacidades.includes("calculo.ejecutar")).toBe(false);
    expect(despues.estado === "VIGENTE" && despues.sesion.funciones).toEqual(["REVISOR"]);
  });

  it("un temporal que aparece después (restablecimiento) restringe la sesión viva", async () => {
    const a = await entrar();
    a.repo.cuentas[0]!.temporalExpiraEn = new Date("2026-10-30T00:00:00Z");
    const r = await a.servicio.resolverMovil(a.token);
    expect(r.estado === "VIGENTE" && r.sesion.cambioContrasenaRequerido).toBe(true);
    expect(r.estado === "VIGENTE" && r.sesion.capacidades).toEqual(["sesion.propia"]);
  });

  it("formatos que no son un token se descartan sin consultar la base", async () => {
    const { servicio } = montar();
    expect(await servicio.resolverMovil(undefined)).toEqual({ estado: "SIN_COOKIE" });
    expect(await servicio.resolverMovil("corto")).toEqual({ estado: "NO_VALIDA", motivo: "FORMATO" });
  });
});
