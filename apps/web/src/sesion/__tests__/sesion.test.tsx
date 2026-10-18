// @vitest-environment jsdom
/**
 * Sesión en la web (ADR-0007): restauración, acceso, función Revisor, cierre, sesión vencida,
 * limpieza de la captura y ausencia de almacenamiento del navegador. La API se simula con un
 * `fetch` que reproduce los contratos (cookie y CSRF los decide el «servidor» simulado).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RespuestaSesion } from "@softarq/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CON_AREA, CON_VOLUMEN, OPCIONES_AREA, TIPOS, diferida } from "../../pruebas/datos.ts";
import { ProveedorSesion } from "../ProveedorSesion.tsx";
import { Raiz } from "../Raiz.tsx";

const CSRF_PREVIO = "p".repeat(43);
const CSRF_SESION = "s".repeat(43);
const CLAVE = "clave-de-prueba";
/** Módulo 13: contraseña temporal vigente y caducada del «servidor» simulado. */
const TEMPORAL = "temporal-de-prueba";
const CADUCADA = "temporal-caducada";
const NUEVA = "una frase nueva y larga";

function sesion(funciones: RespuestaSesion["funciones"]): RespuestaSesion {
  const preparador = funciones.includes("PREPARADOR");
  return {
    usuario: { nombre: preparador ? "[DEMO] Preparador 1" : "[DEMO] Revisor 1", correo: preparador ? "preparador.demo@softarq.test" : "revisor.demo@softarq.test" },
    organizacion: { codigo: "DEMO", nombre: "[DEMO] SoftArq", esDemo: true },
    funciones,
    capacidades: preparador ? ["sesion.propia", "catalogos.consultar", "calculo.ejecutar"] : ["sesion.propia", "catalogos.consultar"],
    expiraEn: "2026-10-03T00:00:00.000Z",
    inactividadMinutos: 30,
    csrfToken: CSRF_SESION,
    cambioContrasenaRequerido: false,
  };
}

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
const error = (estado: number, codigo: string) => json(estado, { error: { codigo, mensaje: "m", solicitudId: "id" } });

/** «Servidor» simulado con estado de sesión. */
function apiFalsa(inicial: RespuestaSesion | null = null) {
  const estado = { sesion: inicial, vencida: false, retenerConceptos: null as null | ReturnType<typeof diferida<Response>> };
  const llamadas: { metodo: string; ruta: string; csrf: string | undefined }[] = [];
  const hacerFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url));
    const metodo = init?.method ?? "GET";
    const csrf = (init?.headers as Record<string, string> | undefined)?.["X-CSRF-Token"];
    llamadas.push({ metodo, ruta: u.pathname, csrf });
    const autenticada = estado.sesion !== null && !estado.vencida;
    switch (`${metodo} ${u.pathname}`) {
      case "GET /api/v1/auth/sesion":
        return autenticada ? json(200, estado.sesion) : error(401, estado.vencida ? "SESION_NO_VALIDA" : "NO_AUTENTICADO");
      case "GET /api/v1/auth/csrf":
        return json(200, { csrfToken: CSRF_PREVIO });
      case "POST /api/v1/auth/sesion": {
        if (csrf !== CSRF_PREVIO) return error(403, "CSRF_NO_VALIDO");
        const { correo, contrasena } = JSON.parse(String(init?.body)) as { correo: string; contrasena: string };
        if (contrasena === CADUCADA) return error(401, "CONTRASENA_TEMPORAL_CADUCADA");
        if (contrasena !== CLAVE && contrasena !== TEMPORAL) return error(401, "CREDENCIALES_INVALIDAS");
        estado.vencida = false;
        estado.sesion = sesion(correo.startsWith("revisor") ? ["REVISOR"] : ["PREPARADOR"]);
        // Sesión restringida: solo sesión propia; la API real rechaza el resto (403 CAMBIO_CONTRASENA_REQUERIDO).
        if (contrasena === TEMPORAL) estado.sesion = { ...estado.sesion, capacidades: ["sesion.propia"], cambioContrasenaRequerido: true };
        return json(200, estado.sesion);
      }
      case "POST /api/v1/auth/contrasena": {
        if (!autenticada) return error(401, "SESION_NO_VALIDA");
        if (csrf !== CSRF_SESION) return error(403, "CSRF_NO_VALIDO");
        const c = JSON.parse(String(init?.body)) as { actual: string; nueva: string; confirmacion: string };
        if (c.actual !== TEMPORAL) {
          return json(422, { error: { codigo: "CONTRASENA_ACTUAL_INCORRECTA", mensaje: "m", solicitudId: "id", campos: [{ ruta: "actual", mensaje: "La contraseña actual no es correcta." }] } });
        }
        // El servidor revoca todas las sesiones, también esta.
        estado.sesion = null;
        return new Response(null, { status: 204 });
      }
      case "DELETE /api/v1/auth/sesion":
        if (!autenticada) return error(401, "SESION_NO_VALIDA");
        if (csrf !== CSRF_SESION) return error(403, "CSRF_NO_VALIDO");
        estado.sesion = null;
        return new Response(null, { status: 204 });
    }
    if (!autenticada) return error(401, estado.sesion ? "SESION_NO_VALIDA" : "NO_AUTENTICADO");
    if (estado.sesion?.cambioContrasenaRequerido) return error(403, "CAMBIO_CONTRASENA_REQUERIDO");
    if (u.pathname === "/api/v1/catalogos/conceptos") {
      if (estado.retenerConceptos) return estado.retenerConceptos.promesa;
      return json(200, { conceptos: [CON_AREA, CON_VOLUMEN], limite: 20 });
    }
    if (u.pathname === "/api/v1/catalogos/opciones-precio") return json(200, { fechaReferencia: "2026-09-25", insumos: OPCIONES_AREA });
    if (u.pathname === "/api/v1/catalogos/tipos-adicional") return json(200, { tiposAdicional: TIPOS, limite: 100 });
    return error(404, "NO_ENCONTRADO");
  });
  return { estado, llamadas, hacerFetch: hacerFetch as unknown as typeof fetch };
}

function montar(api: ReturnType<typeof apiFalsa>) {
  return render(
    <ProveedorSesion urlApi="http://localhost:3000" hacerFetch={api.hacerFetch}>
      <Raiz />
    </ProveedorSesion>,
  );
}

async function entrar(usuario: ReturnType<typeof userEvent.setup>, correo = "preparador.demo@softarq.test", clave = CLAVE) {
  await usuario.type(await screen.findByLabelText("Correo"), correo);
  await usuario.type(screen.getByLabelText("Contraseña"), clave);
  await usuario.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}

const espiasAlmacen: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  for (const m of ["getItem", "setItem", "removeItem", "clear", "key"] as const) espiasAlmacen.push(vi.spyOn(Storage.prototype, m));
});
afterEach(() => {
  // Ni localStorage ni sessionStorage: el token CSRF solo vive en memoria.
  for (const e of espiasAlmacen) expect(e).not.toHaveBeenCalled();
  for (const e of espiasAlmacen.splice(0)) e.mockRestore();
});

describe("sesión en la web", () => {
  it("sin sesión: pantalla de acceso, sin cotizador ni credenciales precargadas", async () => {
    montar(apiFalsa());
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cargar ejemplo/ })).toBeNull();
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Contraseña") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Contraseña").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByLabelText("Correo").getAttribute("autocomplete")).toBe("username");
  });

  it("restaura la sesión consultando al servidor y muestra identidad, función y organización", async () => {
    montar(apiFalsa(sesion(["PREPARADOR"])));
    expect(await screen.findByText("[DEMO] Preparador 1")).toBeTruthy();
    expect(screen.getByText("Preparador · [DEMO] SoftArq")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Cargar ejemplo/ })).toHaveLength(4);
  });

  it("campos vacíos: errores junto al campo y ninguna solicitud de acceso", async () => {
    const api = apiFalsa();
    const usuario = userEvent.setup();
    montar(api);
    await usuario.click(await screen.findByRole("button", { name: "Iniciar sesión" }));
    expect(screen.getByText("Escriba su correo.")).toBeTruthy();
    expect(api.llamadas.some((l) => l.ruta === "/api/v1/auth/csrf")).toBe(false);
  });

  it("acceso incorrecto: mensaje genérico; correcto: CSRF previo en el POST y cotizador", async () => {
    const api = apiFalsa();
    const usuario = userEvent.setup();
    montar(api);
    await entrar(usuario, "preparador.demo@softarq.test", "otra");
    expect((await screen.findByRole("alert")).textContent).toContain("Correo o contraseña incorrectos");
    await usuario.clear(screen.getByLabelText("Contraseña"));
    await usuario.type(screen.getByLabelText("Contraseña"), CLAVE);
    await usuario.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("[DEMO] Preparador 1")).toBeTruthy();
    expect(api.llamadas.filter((l) => l.metodo === "POST").every((l) => l.csrf === CSRF_PREVIO)).toBe(true);
  });

  it("mostrar u ocultar la contraseña", async () => {
    const usuario = userEvent.setup();
    montar(apiFalsa());
    const campo = (await screen.findByLabelText("Contraseña")) as HTMLInputElement;
    expect(campo.type).toBe("password");
    await usuario.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(campo.type).toBe("text");
    await usuario.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(campo.type).toBe("password");
  });

  it("Revisor: «Calcular» deshabilitado con el motivo (la API lo rechaza de todos modos)", async () => {
    const usuario = userEvent.setup();
    montar(apiFalsa(sesion(["REVISOR"])));
    await usuario.click(await screen.findByRole("button", { name: "Iniciar captura propia" }));
    const calcular = screen.getByRole("button", { name: "Calcular" }) as HTMLButtonElement;
    expect(calcular.disabled).toBe(true);
    expect(screen.getByText(/Su función \(Revisor\) no incluye calcular/)).toBeTruthy();
    expect(calcular.getAttribute("aria-describedby")).toBe("motivo-sin-calculo");
  });

  it("cerrar sesión: DELETE con el CSRF de la sesión, captura descartada y nada al volver a entrar", async () => {
    const api = apiFalsa(sesion(["PREPARADOR"]));
    const usuario = userEvent.setup();
    montar(api);
    await usuario.click(await screen.findByRole("button", { name: "Iniciar captura propia" }));
    expect(screen.getByRole("heading", { name: "Captura propia", level: 1 })).toBeTruthy();
    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByText("Sesión cerrada")).toBeTruthy();
    expect(api.llamadas.find((l) => l.metodo === "DELETE")?.csrf).toBe(CSRF_SESION);
    await entrar(usuario);
    expect(await screen.findByText("[DEMO] Preparador 1")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Captura propia", level: 1 })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Cargar ejemplo/ })).toHaveLength(4);
  });

  it("sesión vencida en el servidor: la siguiente consulta lleva al acceso con el aviso y sin la captura", async () => {
    const api = apiFalsa(sesion(["PREPARADOR"]));
    const usuario = userEvent.setup();
    montar(api);
    await usuario.click(await screen.findByRole("button", { name: "Iniciar captura propia" }));
    api.estado.vencida = true;
    await usuario.type(screen.getByLabelText("Buscar concepto por código o descripción"), "CON");
    expect(await screen.findByText("Su sesión terminó")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Captura propia", level: 1 })).toBeNull();
    await entrar(usuario);
    expect(await screen.findByText("[DEMO] Preparador 1")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Captura propia", level: 1 })).toBeNull();
  });

  it("una respuesta tardía de la sesión anterior no vuelve a la pantalla tras cerrar y entrar con otro usuario", async () => {
    const api = apiFalsa(sesion(["PREPARADOR"]));
    const usuario = userEvent.setup();
    montar(api);
    await usuario.click(await screen.findByRole("button", { name: "Iniciar captura propia" }));
    api.estado.retenerConceptos = diferida<Response>();
    const retenida = api.estado.retenerConceptos;
    await usuario.type(screen.getByLabelText("Buscar concepto por código o descripción"), "CON");
    await waitFor(() => expect(api.llamadas.some((l) => l.ruta === "/api/v1/catalogos/conceptos")).toBe(true));
    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await screen.findByText("Sesión cerrada");
    api.estado.retenerConceptos = null;
    await entrar(usuario, "revisor.demo@softarq.test");
    expect(await screen.findByText("[DEMO] Revisor 1")).toBeTruthy();
    retenida.resolver(json(200, { conceptos: [{ ...CON_AREA, descripcion: "[ANTERIOR] no debe verse" }], limite: 20 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain("[ANTERIOR]");
    expect(screen.queryByRole("heading", { name: "Captura propia", level: 1 })).toBeNull();
  });

  it("con contraseña temporal solo se puede cambiarla o cerrar: el cotizador no se monta ni pide datos", async () => {
    const api = apiFalsa();
    const usuario = userEvent.setup();
    montar(api);
    await entrar(usuario, "preparador.demo@softarq.test", TEMPORAL);
    expect(await screen.findByRole("heading", { name: "Cambie su contraseña temporal" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cargar ejemplo/ })).toBeNull();
    expect(api.llamadas.some((l) => l.ruta.startsWith("/api/v1/catalogos"))).toBe(false);
    expect(screen.getByLabelText("Contraseña nueva").getAttribute("autocomplete")).toBe("new-password");
  });

  it("cambio propio: valida antes de enviar, muestra el error del servidor y, al cambiar, vuelve al acceso", async () => {
    const api = apiFalsa();
    const usuario = userEvent.setup();
    montar(api);
    await entrar(usuario, "preparador.demo@softarq.test", TEMPORAL);
    await screen.findByRole("heading", { name: "Cambie su contraseña temporal" });
    await usuario.type(screen.getByLabelText("Contraseña temporal"), TEMPORAL);
    await usuario.type(screen.getByLabelText("Contraseña nueva"), "corta");
    await usuario.type(screen.getByLabelText("Confirmación"), "otra");
    await usuario.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(screen.getByText(/al menos 12 caracteres/)).toBeTruthy();
    expect(screen.getByText("La confirmación no coincide con la contraseña nueva.")).toBeTruthy();
    expect(api.llamadas.some((l) => l.ruta === "/api/v1/auth/contrasena")).toBe(false);

    await usuario.clear(screen.getByLabelText("Contraseña temporal"));
    await usuario.type(screen.getByLabelText("Contraseña temporal"), "equivocada");
    await usuario.clear(screen.getByLabelText("Contraseña nueva"));
    await usuario.type(screen.getByLabelText("Contraseña nueva"), NUEVA);
    await usuario.clear(screen.getByLabelText("Confirmación"));
    await usuario.type(screen.getByLabelText("Confirmación"), NUEVA);
    await usuario.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeTruthy();

    await usuario.clear(screen.getByLabelText("Contraseña temporal"));
    await usuario.type(screen.getByLabelText("Contraseña temporal"), TEMPORAL);
    await usuario.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("Contraseña cambiada")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    const cambio = api.llamadas.filter((l) => l.ruta === "/api/v1/auth/contrasena");
    expect(cambio).toHaveLength(2);
    expect(cambio.every((l) => l.csrf === CSRF_SESION)).toBe(true);
    // Ninguna contraseña queda en el DOM tras volver al acceso.
    expect(document.body.innerHTML).not.toContain(TEMPORAL);
    expect(document.body.innerHTML).not.toContain(NUEVA);
  });

  it("temporal caducada: el acceso lo explica y pide un restablecimiento", async () => {
    const usuario = userEvent.setup();
    montar(apiFalsa());
    await entrar(usuario, "preparador.demo@softarq.test", CADUCADA);
    expect((await screen.findByRole("alert")).textContent).toContain("Pida al Administrador del sistema un restablecimiento");
  });
});
