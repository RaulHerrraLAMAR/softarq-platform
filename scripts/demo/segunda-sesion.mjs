#!/usr/bin/env node
// Segunda sesión móvil independiente de una cuenta de cliente DEMO, para probar conflictos de edición
// (C14) y la pérdida de acceso (C17) sin un segundo teléfono. Usa las reglas normales de la API.
//
// La contraseña NUNCA viaja por argumentos, variables de entorno ni chat: `iniciar` la pide en la
// terminal con entrada oculta. Solo se guarda el token de la sesión (revocable) en un archivo de
// `_work\secrets` con permisos restringidos. Nada de lo secreto se imprime.
//
// Uso (desde la raíz del repositorio):
//   node scripts/demo/segunda-sesion.mjs iniciar <correo> [--api http://127.0.0.1:3100]   # lo ejecuta el propietario
//   node scripts/demo/segunda-sesion.mjs estado [folio]
//   node scripts/demo/segunda-sesion.mjs editar <folio> [marca]    # cambia las notas del borrador (revisión +1)
//   node scripts/demo/segunda-sesion.mjs cerrar                    # revoca la sesión y borra el archivo
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const opcion = (n, d) => {
  const i = args.indexOf(n);
  if (i === -1) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const API_ARG = opcion("--api", null);
const ARCHIVO = resolve(import.meta.dirname, "..", "..", "..", "_work", "secrets", "segunda-sesion-cliente.json");
const [orden, ...resto] = args;

function pedirContrasenaOculta(pregunta) {
  return new Promise((resolver, rechazar) => {
    if (!process.stdin.isTTY) return rechazar(new Error("Ejecuta este comando en una terminal interactiva (con `!` o en tu propia terminal)."));
    process.stdout.write(pregunta);
    let texto = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const alDato = (c) => {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", alDato);
          process.stdout.write("\n");
          return resolver(texto);
        }
        if (ch === "\u0003") {
          process.stdin.setRawMode(false);
          return rechazar(new Error("Cancelado."));
        }
        if (ch === "\u007f" || ch === "\b") texto = texto.slice(0, -1);
        else texto += ch;
      }
    };
    process.stdin.on("data", alDato);
  });
}

function guardar(estado) {
  mkdirSync(dirname(ARCHIVO), { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(estado), { encoding: "utf8", mode: 0o600 });
  const usuario = `${process.env.USERDOMAIN ?? ""}\\${process.env.USERNAME ?? ""}`;
  execFileSync("icacls", [ARCHIVO, "/inheritance:r", "/grant:r", `${usuario}:F`], { stdio: "ignore" });
}
function leer() {
  if (!existsSync(ARCHIVO)) throw new Error("No hay segunda sesión. El propietario debe ejecutar `iniciar` primero.");
  return JSON.parse(readFileSync(ARCHIVO, "utf8"));
}

async function llamar(e, metodo, ruta, cuerpo) {
  const h = { Accept: "application/json", Authorization: `Bearer ${e.token}` };
  if (cuerpo !== undefined) h["Content-Type"] = "application/json; charset=utf-8";
  const r = await fetch(`${e.api}${ruta}`, { method: metodo, headers: h, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) });
  const t = await r.text();
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {
    json = null;
  }
  return { status: r.status, json };
}

async function buscarSolicitud(e, folio) {
  const lista = await llamar(e, "GET", "/api/v1/cliente/solicitudes");
  if (lista.status !== 200) throw new Error(`HTTP ${lista.status} al listar solicitudes (${lista.json?.error?.codigo ?? "?"}).`);
  const item = lista.json.solicitudes.find((s) => s.folio === folio);
  if (!item) throw new Error(`La solicitud ${folio} no es de esta cuenta o no existe.`);
  const d = await llamar(e, "GET", `/api/v1/cliente/solicitudes/${item.id}`);
  if (d.status !== 200) throw new Error(`HTTP ${d.status} al leer ${folio}.`);
  return d.json;
}

async function principal() {
  switch (orden) {
    case "iniciar": {
      const correo = resto[0];
      if (!correo) throw new Error("Indica el correo de la cuenta de cliente.");
      const api = API_ARG ?? "http://127.0.0.1:3100";
      const contrasena = await pedirContrasenaOculta(`Contraseña de ${correo} (no se muestra): `);
      const r = await fetch(`${api}/api/v1/auth/movil/sesion`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
        body: JSON.stringify({ correo, contrasena }),
      });
      const j = await r.json().catch(() => null);
      if (r.status !== 200) throw new Error(`Acceso rechazado (HTTP ${r.status}: ${j?.error?.codigo ?? "?"}).`);
      if (j.cambioContrasenaRequerido) throw new Error("La cuenta aún tiene contraseña temporal: haz primero el cambio desde el teléfono.");
      guardar({ api, correo, token: j.tokenSesion, creada: new Date().toISOString() });
      console.log(`Segunda sesión abierta para ${correo}. Token guardado en ${ARCHIVO} (permisos restringidos).`);
      return;
    }
    case "estado": {
      const e = leer();
      const s = await llamar(e, "GET", "/api/v1/auth/movil/sesion");
      console.log(`Sesión de ${e.correo}: HTTP ${s.status}`);
      if (resto[0]) {
        const d = await buscarSolicitud(e, resto[0]);
        console.log(`${d.folio}: estado ${d.estado}, revisión ${d.revision}`);
      }
      return;
    }
    case "editar": {
      const e = leer();
      const folio = resto[0];
      if (!folio) throw new Error("Indica el folio de la solicitud.");
      const marca = resto[1] ?? "Edición desde la segunda sesión";
      const d = await buscarSolicitud(e, folio);
      const captura = { ...d.captura, notas: marca };
      const r = await llamar(e, "PUT", `/api/v1/cliente/solicitudes/${d.id}`, { revision: d.revision, captura });
      console.log(`PUT ${folio}: HTTP ${r.status}; revisión ${d.revision} → ${r.json?.revision ?? "(sin cambio)"}${r.status >= 400 ? ` (${r.json?.error?.codigo ?? "?"})` : ""}`);
      process.exitCode = r.status === 200 ? 0 : 1;
      return;
    }
    case "cerrar": {
      const e = leer();
      const r = await llamar(e, "DELETE", "/api/v1/auth/sesion");
      rmSync(ARCHIVO, { force: true });
      console.log(`Sesión revocada (HTTP ${r.status}) y archivo borrado.`);
      return;
    }
    default:
      console.error("Órdenes: iniciar <correo>, estado [folio], editar <folio> [marca], cerrar.");
      process.exitCode = 2;
  }
}

principal().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
