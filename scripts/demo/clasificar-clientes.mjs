#!/usr/bin/env node
// Clasifica los clientes ya existentes como PRESENTACION, QA o HUMO con reglas EXPLÍCITAS (E3.8). Usa la API normal con la cuenta DEMO
// del Administrador del sistema: la clasificación queda con su motivo y su autor en la bitácora y se puede cambiar o retirar.
//
// Por omisión solo muestra lo que haría (modo de prueba). Con `--aplicar` escribe. Nunca toca un cliente que YA tenga clasificación y
// deja SIN CLASIFICAR todo lo que no tenga evidencia: llevar [DEMO] en el nombre no basta para considerarlo desechable.
//
// Evidencia de cada regla:
//   PRESENTACION: los tres clientes ficticios con acceso a la app (carga `db:cargar-clientes-demo`, HANDOFF §28) y «[DEMO] Raul Herrera»
//                 (cuenta principal de la presentación, decisión del propietario del 31/10/2026).
//   QA:           los clientes cuyo nombre empieza por «[QA]» (cuenta de pruebas automatizadas).
//   HUMO:         nombres que dicen ser restos de pruebas de módulos anteriores (humo, curl, respaldo, comprobación, excepción de
//                 prueba, prueba de acentos), documentados en HANDOFF §5 y los módulos 8, 10, 12, 14 y 15.
//
// Uso (desde la raíz del repositorio, con la API local en marcha):
//   node scripts/demo/clasificar-clientes.mjs --api http://127.0.0.1:3000            # solo muestra
//   node scripts/demo/clasificar-clientes.mjs --api http://127.0.0.1:3000 --aplicar   # escribe
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const opcion = (n, d) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const API = opcion("--api", "http://127.0.0.1:3000");
const ORIGEN = "http://localhost:5173";
const CUENTAS = resolve(import.meta.dirname, "..", "..", "..", "_work", "secrets", "accesos-demo-softarq_dev.json");

const PRESENTACION = new Set(["Laura Méndez", "Constructora Ríos y Asociados", "Despacho Aranda Arquitectos", "[DEMO] Raul Herrera"]);
const TERMINOS_HUMO = ["humo", "curl", "respaldo", "comprobación m12", "excepción", "prueba de acentos"];

function decidir(nombre) {
  const n = nombre.toLowerCase();
  if (nombre.startsWith("[QA]")) return { categoria: "QA", motivo: "Cuenta de pruebas automatizadas (no es de presentación)" };
  if (PRESENTACION.has(nombre)) return { categoria: "PRESENTACION", motivo: "Cliente de la presentación del DEMO local (carga de clientes ficticios o cuenta de Raul Herrera)" };
  if (TERMINOS_HUMO.some((t) => n.includes(t))) return { categoria: "HUMO", motivo: "Resto de una prueba de humo o verificación de un módulo anterior (HANDOFF)" };
  return null;
}

class Sesion {
  cookie = null;
  csrf = null;
  async llamar(metodo, ruta, cuerpo) {
    const h = { Accept: "application/json" };
    if (this.cookie) h.Cookie = `softarq_sesion=${this.cookie}`;
    if (metodo !== "GET") {
      h.Origin = ORIGEN;
      h["Content-Type"] = "application/json; charset=utf-8";
      if (this.csrf) h["X-CSRF-Token"] = this.csrf;
      h["Idempotency-Key"] = randomUUID();
    }
    const r = await fetch(`${API}${ruta}`, { method: metodo, headers: h, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) });
    const g = r.headers.getSetCookie().find((c) => c.startsWith("softarq_sesion="));
    if (g) this.cookie = g.slice("softarq_sesion=".length).split(";")[0] || null;
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  }
  async entrar(correo, contrasena) {
    this.csrf = (await this.llamar("GET", "/api/v1/auth/csrf")).json?.csrfToken ?? null;
    const r = await this.llamar("POST", "/api/v1/auth/sesion", { correo, contrasena });
    if (r.status !== 200) throw new Error(`No se pudo iniciar la sesión del Administrador (HTTP ${r.status}).`);
    this.csrf = r.json.csrfToken;
  }
}

const cuentas = JSON.parse(readFileSync(CUENTAS, "utf8")).cuentas;
const admin = cuentas["administrador.demo@softarq.test"];
const s = new Sesion();
await s.entrar("administrador.demo@softarq.test", admin.contrasena);
try {
  const lista = await s.llamar("GET", "/api/v1/clientes?incluirInactivos=true&limite=100");
  if (lista.status !== 200) throw new Error(`No se pudo listar los clientes (HTTP ${lista.status}).`);
  const clientes = lista.json.clientes;
  const cuenta = { PRESENTACION: [], QA: [], HUMO: [], SIN_EVIDENCIA: [], YA_CLASIFICADOS: [] };
  for (const c of clientes) {
    if (c.clasificacion) {
      cuenta.YA_CLASIFICADOS.push(c);
      continue;
    }
    const d = decidir(c.nombre);
    (d ? cuenta[d.categoria] : cuenta.SIN_EVIDENCIA).push({ ...c, decision: d });
  }
  console.log(`${aplicar ? "APLICANDO" : "MODO DE PRUEBA (no escribe)"} · ${clientes.length} clientes`);
  for (const k of ["PRESENTACION", "QA", "HUMO"]) console.log(`  ${k}: ${cuenta[k].length} → ${cuenta[k].map((c) => c.codigo).join(", ") || "—"}`);
  console.log(`  Sin evidencia (se dejan sin clasificar): ${cuenta.SIN_EVIDENCIA.length} → ${cuenta.SIN_EVIDENCIA.map((c) => `${c.codigo} ${c.nombre}`).join("; ") || "—"}`);
  console.log(`  Ya clasificados (no se tocan): ${cuenta.YA_CLASIFICADOS.length}`);
  if (aplicar) {
    let hechos = 0;
    for (const k of ["PRESENTACION", "QA", "HUMO"]) {
      for (const c of cuenta[k]) {
        const r = await s.llamar("PUT", `/api/v1/clientes/${c.id}/clasificacion`, { categoria: k, motivo: c.decision.motivo });
        if (r.status !== 200) throw new Error(`No se pudo clasificar ${c.codigo} (HTTP ${r.status}).`);
        hechos++;
      }
    }
    console.log(`Clasificados: ${hechos}.`);
  }
} finally {
  await s.llamar("DELETE", "/api/v1/auth/sesion");
}
