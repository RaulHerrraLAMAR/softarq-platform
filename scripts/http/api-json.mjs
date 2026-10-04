#!/usr/bin/env node
// Cliente HTTP reproducible para la API local (módulo 8, corrección del proceso de pruebas).
//
// Motivo: en los módulos 6 y 7, pasar el JSON como ARGUMENTO de curl en Git Bash dañó los acentos
// (Windows recodifica los argumentos). Aquí el JSON SIEMPRE se lee de un archivo UTF-8 o se
// construye dentro del propio script, y `fetch` lo envía como UTF-8. Ningún dato viaja por argv.
//
// Mismo flujo que el navegador: cookie de sesión, token CSRF y `Origin` permitido. El estado
// (cookie y CSRF) se guarda en un archivo de `_work` (fuera del repositorio) y nunca se imprime.
//
// Uso (desde la raíz del repositorio):
//   node scripts/http/api-json.mjs --api http://localhost:3200 --estado ../_work/tmp/sesion.json entrar <credencial.json>
//   node scripts/http/api-json.mjs ... comprobar-acentos              # obligatorio antes de crear datos de prueba
//   node scripts/http/api-json.mjs ... get  /api/v1/cotizaciones
//   node scripts/http/api-json.mjs ... post /api/v1/clientes <cuerpo.json> [--idem <uuid>]
//   node scripts/http/api-json.mjs ... put|patch <ruta> <cuerpo.json>
//   node scripts/http/api-json.mjs ... descargar /api/v1/emisiones/<id>/documento <salida.pdf>
//   node scripts/http/api-json.mjs ... salir
// <credencial.json> = {"correo": "...", "contrasena": "..."} (p. ej., copiado del archivo local de
// accesos en _work\secrets; nunca en la línea de comandos). Las respuestas se imprimen como JSON;
// el código de salida es 0 solo con 2xx.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
function opcion(nombre, porOmision) {
  const i = args.indexOf(nombre);
  if (i === -1) return porOmision;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
const API = opcion("--api", "http://localhost:3000");
const ORIGEN = opcion("--origen", "http://localhost:5173");
const ESTADO = opcion("--estado", "../_work/tmp/api-json-sesion.json");
const IDEM = opcion("--idem", null);
const [orden, ...resto] = args;

const leerEstado = () => (existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, "utf8")) : { cookie: null, csrf: null });
function guardarEstado(e) {
  mkdirSync(dirname(ESTADO), { recursive: true });
  writeFileSync(ESTADO, JSON.stringify(e), { encoding: "utf8", mode: 0o600 });
}
const leerJson = (archivo) => JSON.parse(readFileSync(archivo, "utf8"));

async function solicitar(metodo, ruta, cuerpo, { idem = null, binario = false } = {}) {
  const e = leerEstado();
  const h = { Accept: binario ? "application/pdf" : "application/json" };
  if (e.cookie) h.Cookie = `softarq_sesion=${e.cookie}`;
  if (metodo !== "GET") {
    h.Origin = ORIGEN;
    if (e.csrf) h["X-CSRF-Token"] = e.csrf;
  }
  if (cuerpo !== undefined) h["Content-Type"] = "application/json; charset=utf-8";
  if (idem) h["Idempotency-Key"] = idem;
  const r = await fetch(`${API}${ruta}`, { method: metodo, headers: h, ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}) });
  const galleta = r.headers.getSetCookie().find((c) => c.startsWith("softarq_sesion="));
  if (galleta) {
    const valor = galleta.slice("softarq_sesion=".length).split(";")[0];
    guardarEstado({ ...leerEstado(), cookie: /max-age=0/i.test(galleta) || !valor ? null : valor });
  }
  if (binario && r.ok) return { status: r.status, headers: r.headers, bytes: Buffer.from(await r.arrayBuffer()) };
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { status: r.status, headers: r.headers, json };
}

function imprimir(r) {
  const extra = r.headers.get("idempotent-replayed") ? ` (Idempotent-Replayed: ${r.headers.get("idempotent-replayed")})` : "";
  console.log(`HTTP ${r.status}${extra}`);
  console.log(JSON.stringify(r.json, null, 2));
  process.exitCode = r.status >= 200 && r.status < 300 ? 0 : 1;
}

/** Puntos de código de un texto (para comparar acentos sin depender de la consola). */
const puntos = (t) => [...t].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

async function principal() {
  switch (orden) {
    case "entrar": {
      const credencial = leerJson(resto[0]);
      guardarEstado({ cookie: null, csrf: null });
      const previa = await solicitar("GET", "/api/v1/auth/csrf");
      guardarEstado({ ...leerEstado(), csrf: previa.json?.csrfToken ?? null });
      const r = await solicitar("POST", "/api/v1/auth/sesion", { correo: credencial.correo, contrasena: credencial.contrasena });
      if (r.status === 200) guardarEstado({ ...leerEstado(), csrf: r.json.csrfToken });
      console.log(`HTTP ${r.status}`);
      if (r.status === 200) console.log(`Sesión: ${r.json.usuario.nombre} · ${r.json.organizacion.codigo} · ${r.json.funciones.join(", ")}`);
      else console.log(JSON.stringify(r.json));
      process.exitCode = r.status === 200 ? 0 : 1;
      return;
    }
    case "comprobar-acentos": {
      // Ida y vuelta con caracteres que el `curl` por argumento dañó (ó, ñ, Ñ, é, «», —).
      const esperado = "[DEMO] Prueba de acentos: Construcción Peñasco — Ñandú, Mérida «UTF-8»";
      const contacto = "Begoña Íñiguez";
      const alta = await solicitar("POST", "/api/v1/clientes", { nombre: esperado, contactoNombre: contacto }, { idem: randomUUID() });
      if (alta.status !== 201) {
        imprimir(alta);
        throw new Error("No se pudo crear el cliente de comprobación.");
      }
      const leido = await solicitar("GET", `/api/v1/clientes/${alta.json.id}`);
      const nombre = leido.json?.cliente?.nombre ?? "";
      const contactoLeido = leido.json?.cliente?.contactoNombre ?? "";
      const ok = alta.json.nombre === esperado && nombre === esperado && contactoLeido === contacto;
      console.log(`Enviado:  ${puntos(esperado)}`);
      console.log(`Devuelto: ${puntos(nombre)}`);
      console.log(`Contacto: ${puntos(contactoLeido)}`);
      console.log(ok ? `CORRECTO: ida y vuelta UTF-8 sin pérdidas (${alta.json.codigo}, cliente [DEMO] de comprobación).` : "ERROR: los acentos no se conservaron. No cree datos de prueba.");
      // Huella para el registro, sin datos personales.
      console.log(`SHA-256 del nombre devuelto: ${createHash("sha256").update(nombre, "utf8").digest("hex")}`);
      process.exitCode = ok ? 0 : 2;
      return;
    }
    case "get":
      return imprimir(await solicitar("GET", resto[0]));
    case "post":
    case "put":
    case "patch": {
      const cuerpo = resto[1] ? leerJson(resto[1]) : {};
      const idem = orden === "post" ? (IDEM ?? randomUUID()) : IDEM;
      if (orden === "post") console.log(`Idempotency-Key: ${idem}`);
      return imprimir(await solicitar(orden.toUpperCase(), resto[0], cuerpo, { idem }));
    }
    case "descargar": {
      const r = await solicitar("GET", resto[0], undefined, { binario: true });
      if (!r.bytes) return imprimir(r);
      writeFileSync(resto[1], r.bytes);
      console.log(`HTTP ${r.status} · ${r.bytes.length} bytes · ${r.headers.get("content-disposition")}`);
      console.log(`SHA-256: ${createHash("sha256").update(r.bytes).digest("hex")} · Repr-Digest: ${r.headers.get("repr-digest")}`);
      return;
    }
    case "salir": {
      const r = await solicitar("DELETE", "/api/v1/auth/sesion");
      guardarEstado({ cookie: null, csrf: null });
      console.log(`HTTP ${r.status}`);
      return;
    }
    default:
      console.error("Órdenes: entrar, comprobar-acentos, get, post, put, patch, descargar, salir (ver el encabezado del archivo).");
      process.exitCode = 2;
  }
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
