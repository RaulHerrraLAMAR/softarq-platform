#!/usr/bin/env node
// Escenarios de la guía móvil (§10) sobre el teléfono autorizado, con el conductor `android.mjs` (adb + uiautomator).
// Cuentas: QA del cliente (`_work\secrets\acceso-cliente-qa-softarq_dev.json`) y Preparador DEMO para C4. Las contraseñas
// viajan por la entrada estándar de `adb shell`; nunca se imprimen. Cada escenario imprime su resultado observado.
//
// Uso:  node scripts/qa/escenarios-android.mjs <c4|c16|c17|c2|…>   (API en 3000 y Metro en 8081 con `adb reverse`)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adb, abrirApp, atras, buscar, captura, cerrarTeclado, esperar, esperarSinTexto, esperarTexto, hay, mostrar, PAQUETE, textos, tocar, escribir, deslizar } from "./android.mjs";

const RAIZ = resolve(import.meta.dirname, "..", "..", "..");
const secreto = (f) => JSON.parse(readFileSync(resolve(RAIZ, "_work", "secrets", f), "utf8"));
const QA = secreto("acceso-cliente-qa-softarq_dev.json");
const EQUIPO = secreto("accesos-demo-softarq_dev.json").cuentas;
const API = "http://127.0.0.1:3000";

export const informe = (id, ok, detalle) => console.log(`${ok ? "✔" : "✘"} ${id}: ${detalle}`);

/** Abre la app en el servidor de desarrollo (Metro) aunque el cliente de desarrollo muestre su lanzador. */
export async function iniciarApp() {
  adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
  adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "exp+softarq-demo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081", PAQUETE);
  for (let i = 0; i < 60; i++) {
    await esperar(2000);
    try {
      if (hay("Iniciar sesión") || hay("Nueva cotización") || hay("Sin conexión") || hay("Mis solicitudes") || hay("Cerrar sesión")) return;
    } catch {
      /* la app aún no está en primer plano */
    }
  }
  throw new Error("La app no llegó a una pantalla conocida.");
}
export async function cerrarMenuDelCliente() {
  if (hay("Reload") || hay("Go home")) atras();
}
export async function entrar(correo, contrasena) {
  tocar("Correo", { clase: "EditText" });
  await esperar(400);
  escribir(correo);
  tocar("Contraseña", { clase: "EditText" });
  await esperar(400);
  escribir(contrasena);
  await cerrarTeclado();
  tocar("Iniciar sesión", { clase: "Button" });
}

/** `fetch` con un reintento: el servidor cierra las conexiones inactivas y la reutilizada puede llegar reseteada. */
async function pedirHttp(url, opciones) {
  try {
    return await fetch(url, opciones);
  } catch (e) {
    if (e.cause?.code !== "ECONNRESET") throw e;
    return await fetch(url, opciones);
  }
}

/** Revoca/crea la sesión de administración (API del equipo) para escenarios que cambian el acceso. */
export async function sesionAdmin() {
  const cuentas = EQUIPO;
  const O = "http://localhost:5173";
  const ckDe = (r) => r.headers.getSetCookie().find((c) => c.startsWith("softarq_sesion="))?.split(";")[0] ?? null;
  let r = await pedirHttp(`${API}/api/v1/auth/csrf`);
  let ck = ckDe(r);
  let csrf = (await r.json()).csrfToken;
  const correo = "administrador.demo@softarq.test";
  r = await pedirHttp(`${API}/api/v1/auth/sesion`, { method: "POST", headers: { Origin: O, Cookie: ck, "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ correo, contrasena: cuentas[correo].contrasena }) });
  ck = ckDe(r) ?? ck;
  csrf = (await r.json()).csrfToken;
  const pedir = async (m, ruta, cuerpo) => {
    const h = { Origin: O, Cookie: ck, "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() };
    if (cuerpo) h["Content-Type"] = "application/json";
    const x = await pedirHttp(`${API}${ruta}`, { method: m, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const t = await x.text();
    return { status: x.status, cuerpo: t ? JSON.parse(t) : null };
  };
  return { pedir };
}

/** Id del usuario del acceso QA (por el Administrador del sistema, API normal). */
async function accesoQa(adm) {
  const cl = await adm.pedir("GET", "/api/v1/clientes");
  const lista = cl.cuerpo.clientes ?? cl.cuerpo.elementos ?? [];
  const c = lista.find((x) => x.codigo === QA.cliente);
  if (!c) throw new Error(`No encontré el cliente ${QA.cliente} (respuesta ${cl.status}).`);
  const a = await adm.pedir("GET", `/api/v1/clientes/${c.id}/acceso`);
  const acceso = (a.cuerpo.accesos ?? [a.cuerpo.acceso ?? a.cuerpo]).find((x) => x.correo === QA.correo);
  if (!acceso) throw new Error("No encontré el acceso QA.");
  return acceso;
}

const escenarios = {
  async c4() {
    await iniciarApp();
    if (hay("Cerrar sesión")) throw new Error("Había una sesión abierta; cierre sesión antes.");
    const eq = EQUIPO["preparador.demo@softarq.test"];
    await entrar("preparador.demo@softarq.test", eq.contrasena);
    const visto = await esperarTexto("equipo", 15000);
    const t = textos().filter((x) => /equipo|panel|localhost|5173/i.test(x)).join(" | ");
    captura("c4-cuenta-equipo");
    informe("C4", visto && hay("Iniciar sesión"), `mensaje: ${t.slice(0, 220)}; sigue en el acceso: ${hay("Iniciar sesión")}`);
  },
  async c17() {
    const adm = await sesionAdmin();
    const acceso = await accesoQa(adm);
    await iniciarApp();
    if (hay("Iniciar sesión")) await entrar(QA.correo, QA.contrasena);
    informe("C17a", await esperarTexto("Nueva cotización", 20000), "sesión QA abierta en el teléfono");
    const adm2 = await sesionAdmin();
    const off = await adm2.pedir("PUT", `/api/v1/admin/accesos-cliente/${acceso.usuarioId}/estado`, { activo: false, motivo: "QA automatizada C17" });
    informe("C17b", off.status === 200, `el Administrador desactiva el acceso (HTTP ${off.status})`);
    try {
      // La siguiente acción (abrir «Mis solicitudes» o recargar) debe devolver al acceso con un aviso.
      tocar("Retomar el borrador"); // abre el borrador: llama a la API con la sesión ya revocada
      await esperar(3000);
      const vuelve = await esperarTexto("Iniciar sesión", 20000);
      captura("c17-acceso-desactivado");
      informe("C17c", vuelve, `vuelve al acceso; avisos: ${textos().filter((t) => /venci|desactiv|acceso|sesión/i.test(t)).join(" | ").slice(0, 200)}`);
    } finally {
      const on = await (await sesionAdmin()).pedir("PUT", `/api/v1/admin/accesos-cliente/${acceso.usuarioId}/estado`, { activo: true, motivo: "QA automatizada C17: reactivación" });
      informe("C17d", on.status === 200, `acceso QA reactivado (HTTP ${on.status})`);
    }
  },
  /** C14: conflicto de edición. Segunda sesión móvil de la misma cuenta QA, por la API normal. */
  async c14() {
    const r = await pedirHttp(`${API}/api/v1/auth/movil/sesion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo: QA.correo, contrasena: QA.contrasena }) });
    const j = await r.json();
    if (r.status !== 200) throw new Error(`Segunda sesión QA rechazada (${r.status}).`);
    const h = { Authorization: `Bearer ${j.tokenSesion}`, "Content-Type": "application/json" };
    await iniciarApp();
    if (hay("Iniciar sesión")) await entrar(QA.correo, QA.contrasena);
    informe("C14a", await esperarTexto("Retomar el borrador", 20000), "borrador visible en el teléfono");
    tocar("Retomar el borrador");
    await esperar(4000);
    captura("c14-borrador-abierto");
    const lista = await (await pedirHttp(`${API}/api/v1/cliente/solicitudes`, { headers: h })).json();
    const fila = lista.solicitudes.find((x) => x.estado === "BORRADOR");
    const d = await (await pedirHttp(`${API}/api/v1/cliente/solicitudes/${fila.id}`, { headers: h })).json();
    const put = await pedirHttp(`${API}/api/v1/cliente/solicitudes/${fila.id}`, { method: "PUT", headers: h, body: JSON.stringify({ revision: d.revision, captura: { ...d.captura, notas: "[QA] editada desde la segunda sesión (C14)" } }) });
    informe("C14b", put.status === 200, `la segunda sesión edita la misma solicitud (HTTP ${put.status}, revisión ${d.revision} → ${(await put.json()).revision})`);
    // El teléfono sigue con la revisión anterior: al avanzar se guarda y debe detectar el cambio ajeno.
    const avanzar = ["Continuar", "Calcular", "Continuar al resumen"].find((t) => buscar(t));
    if (avanzar) tocar(avanzar);
    const hoja = await esperarTexto("cambió en otro lugar", 20000);
    captura("c14-conflicto");
    informe("C14c", hoja, `hoja de conflicto visible: ${textos().filter((t) => /otro lugar|cambió|conserv|recarg|tus cambios|Usar/i.test(t)).join(" | ").slice(0, 260)} (acción tocada: ${avanzar ?? "ninguna"})`);
    await pedirHttp(`${API}/api/v1/auth/sesion`, { method: "DELETE", headers: h }).catch(() => {});
  },
  async c16() {
    await iniciarApp();
    if (hay("Iniciar sesión")) await entrar(QA.correo, QA.contrasena);
    const dentro = await esperarTexto("Nueva cotización", 20000);
    informe("C16a", dentro, "acceso con la cuenta QA llega al inicio");
    adb("shell", "am", "force-stop", PAQUETE);
    await esperar(1500);
    await iniciarApp();
    const restaurada = await esperarTexto("Nueva cotización", 20000);
    captura("c16-restaurada");
    informe("C16b", restaurada && !hay("Iniciar sesión"), "al cerrar la app sin cerrar sesión y reabrirla, la sesión se restaura (SecureStore)");
  },
};

const [orden] = process.argv.slice(2);
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  if (!escenarios[orden]) {
    console.error(`Escenarios: ${Object.keys(escenarios).join(", ")}`);
    process.exit(2);
  }
  try {
    await escenarios[orden]();
  } catch (e) {
    console.error("ERROR:", e.message, e.cause?.code ?? e.cause?.message ?? "", String(e.stack ?? "").slice(0, 400));
    try {
      mostrar();
    } catch {}
    process.exitCode = 1;
  }
}
