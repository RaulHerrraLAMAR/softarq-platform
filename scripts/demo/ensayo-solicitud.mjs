#!/usr/bin/env node
// Ensayo de una solicitud de cliente de punta a punta por la API normal (sin escribir estados en SQL):
// atender → preparar (precios elegidos explícitamente, consolidar compras) → calcular → enviar a revisión →
// aprobar por OTRA persona → emitir. Es idempotente por fases: si una fase ya está hecha, la reconoce y sigue.
//
// Usa las cuentas de equipo DEMO de `_work\secrets\accesos-demo-softarq_dev.json` (nunca se imprimen las
// contraseñas). La API debe estar en 127.0.0.1:3000 contra softarq_dev.
//
// Uso (raíz del repositorio):  node scripts/demo/ensayo-solicitud.mjs SOL-2026-00003 [--api http://127.0.0.1:3000]
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--api");
const API = i >= 0 ? args.splice(i, 2)[1] : "http://127.0.0.1:3000";
const FOLIO = args[0];
if (!FOLIO) throw new Error("Indica el folio de la solicitud (p. ej. SOL-2026-00003).");
const CONTACTO = (() => { const j = args.indexOf("--contacto-correo"); return j >= 0 ? args.splice(j, 2)[1] : null; })();
const ORIGEN = "http://localhost:5173";
const accesos = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "..", "..", "_work", "secrets", "accesos-demo-softarq_dev.json"), "utf8")).cuentas;

class Sesion {
  cookie = null;
  csrf = null;
  async pedir(metodo, ruta, cuerpo) {
    const h = { Origin: ORIGEN };
    if (this.cookie) h.Cookie = `softarq_sesion=${this.cookie}`;
    if (metodo !== "GET") {
      if (this.csrf) h["X-CSRF-Token"] = this.csrf;
      h["Idempotency-Key"] = randomUUID();
    }
    if (cuerpo !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(`${API}${ruta}`, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const set = r.headers.getSetCookie().find((c) => c.startsWith("softarq_sesion="));
    if (set) this.cookie = set.slice("softarq_sesion=".length).split(";")[0] || null;
    const t = await r.text();
    let c = null;
    try { c = t ? JSON.parse(t) : null; } catch { c = t; }
    return { status: r.status, cuerpo: c, texto: t };
  }
  get = (r) => this.pedir("GET", r);
  post = (r, c) => this.pedir("POST", r, c);
  put = (r, c) => this.pedir("PUT", r, c);
  async entrar(correo) {
    const cred = accesos[correo];
    if (!cred) throw new Error(`Sin credencial local para ${correo}`);
    const a = await this.pedir("GET", "/api/v1/auth/csrf");
    this.csrf = a.cuerpo.csrfToken;
    const r = await this.pedir("POST", "/api/v1/auth/sesion", { correo, contrasena: cred.contrasena });
    if (r.status !== 200) throw new Error(`Acceso fallido de ${correo}: ${r.status} ${r.cuerpo?.error?.codigo ?? ""}`);
    this.csrf = r.cuerpo.csrfToken;
    return this;
  }
}
const exigir = (r, esperado, que) => {
  if (!esperado.includes(r.status)) throw new Error(`${que}: ${r.status} ${r.texto.slice(0, 400)}`);
  return r.cuerpo;
};
const paso = (m) => console.log(`• ${m}`);

const prep = await new Sesion().entrar("preparador.demo@softarq.test");
const rev = await new Sesion().entrar("revisor.demo@softarq.test");

// 1. Localizar la solicitud en cualquier estado.
const lista = exigir(await prep.get("/api/v1/solicitudes?estado=ENVIADA,EN_PREPARACION,COTIZADA,RETIRADA"), [200], "Listar solicitudes");
const fila = (lista.solicitudes ?? lista.elementos ?? []).find((s) => s.folio === FOLIO);
if (!fila) throw new Error(`No encontré ${FOLIO} en la bandeja.`);
let sol = exigir(await prep.get(`/api/v1/solicitudes/${fila.id}`), [200], "Detalle de la solicitud");
paso(`${FOLIO}: estado ${sol.estado}`);

// 2. Atender (crea la cotización formal en borrador, sin precios elegidos).
const s0 = sol;
let cotId = s0.cotizacionId ?? null;
if (!cotId) {
  const a = exigir(await prep.post(`/api/v1/solicitudes/${fila.id}/atencion`, { revision: s0.revision }), [200, 201], "Atender");
  cotId = a.cotizacionId;
  paso(`Atendida → ${a.folio} (${a.repetida ? "ya estaba" : "nueva"})`);
} else paso("Ya atendida.");

// 3. Preparar: precios elegidos de forma explícita y compras consolidadas.
let cot = exigir(await prep.get(`/api/v1/cotizaciones/${cotId}`), [200], "Detalle de la cotización");
paso(`Cotización ${cot.cotizacion.folio}, versiones: ${cot.versiones?.length ?? 0}`);
if (!cot.versiones || cot.versiones.length === 0) {
  const codigos = cot.borrador.captura.partidas.filter((p) => p.tipo === "CONCEPTO").map((p) => p.conceptoCodigo);
  const op = exigir(await prep.get(`/api/v1/catalogos/opciones-precio?conceptos=${codigos.join(",")}`), [200], "Opciones de precio");
  const seleccion = op.insumos.map((x) => {
    const elegida = x.opciones.find((o) => o.esMenorPrecio) ?? x.opciones[0];
    if (!elegida) throw new Error(`Sin precio vigente para ${x.insumoCodigo}: se requiere una acción humana (precio) o una excepción.`);
    return { insumoCodigo: x.insumoCodigo, precioCodigo: elegida.precioCodigo };
  });
  paso(`Precios elegidos (menor precio vigente, ${op.fechaReferencia}): ${seleccion.map((s) => `${s.insumoCodigo}→${s.precioCodigo}`).join(", ")}`);
  const captura = { ...cot.borrador.captura, consolidarCompras: true, seleccion };
  const g = exigir(await prep.put(`/api/v1/cotizaciones/${cotId}/borrador`, { revision: cot.borrador.revision, captura }), [200], "Guardar borrador");
  if (g.completitud && g.completitud.completo === false) throw new Error("Borrador incompleto: " + JSON.stringify(g.completitud).slice(0, 300));
  const v = exigir(await prep.post(`/api/v1/cotizaciones/${cotId}/versiones`, { revisionBorrador: g.revision }), [201], "Calcular y guardar versión");
  paso(`Versión ${v.version.idVersion} calculada por el servidor, total ${v.version.total}.`);
  cot = exigir(await prep.get(`/api/v1/cotizaciones/${cotId}`), [200], "Detalle tras calcular");
}
const ultima = cot.versiones[cot.versiones.length - 1];
const numero = ultima.numero;
paso(`Última versión: ${ultima.idVersion}, estado ${ultima.estado}, total ${ultima.total}`);

// 4. Revisión por otra persona y aprobación.
let revisionId = ultima.revisionVigente?.id ?? null;
if (ultima.estado === "BORRADOR") {
  const e = exigir(await prep.post(`/api/v1/cotizaciones/${cotId}/versiones/${numero}/revisiones`, { revisionBorrador: cot.borrador.revision }), [201], "Enviar a revisión");
  revisionId = e.revision.id;
  paso("Enviada a revisión (Preparador).");
  const d = exigir(await rev.post(`/api/v1/revisiones/${revisionId}/decision`, { decision: "APROBAR", versionId: e.revision.version.id, revision: e.revision.revision }), [200], "Aprobar");
  paso(`Aprobada: estado de la revisión ${d.revision?.estado ?? "?"} (otra persona distinta del preparador).`);
  cot = exigir(await prep.get(`/api/v1/cotizaciones/${cotId}`), [200], "Detalle tras aprobar");
}
const u2 = cot.versiones[cot.versiones.length - 1];

// 5. Emisión por el Preparador.
if (!u2.emision) {
  const val = exigir(await prep.get(`/api/v1/cotizaciones/${cotId}/versiones/${numero}/emision/validacion`), [200], "Validar emisión");
  paso(`Validación de emisión: ${JSON.stringify(val).slice(0, 200)}`);
  const rid = revisionId ?? u2.revisionVigente?.id;
  const emitir = () => prep.post(`/api/v1/cotizaciones/${cotId}/versiones/${numero}/emision`, { versionId: u2.id, revisionId: rid });
  let r = await emitir();
  const sinContacto = r.status === 422 && r.cuerpo?.error?.problemas?.find((x) => x.codigo === "BL-01" && /medio de contacto/.test(x.mensaje));
  if (sinContacto && CONTACTO) {
    // BL-01: el cliente necesita un medio de contacto. Se corrige por la edición normal del cliente (con revisión), no por SQL.
    const cli = exigir(await prep.get("/api/v1/clientes"), [200], "Listar clientes");
    const c = (cli.clientes ?? cli.elementos ?? []).find((x) => x.codigo === sinContacto.referencia);
    if (!c) throw new Error(`No encontré el cliente ${sinContacto.referencia}.`);
    exigir(await prep.pedir("PATCH", `/api/v1/clientes/${c.id}`, { revision: c.revision, contactoCorreo: CONTACTO }), [200], "Completar el contacto del cliente");
    paso(`Contacto DEMO añadido al cliente ${c.codigo} (BL-01).`);
    r = await emitir();
  }
  const em = exigir(r, [201], "Emitir");
  paso(`Emitida: ${JSON.stringify(em).slice(0, 220)}`);
} else paso("Ya emitida.");

sol = exigir(await prep.get(`/api/v1/solicitudes/${fila.id}`), [200], "Detalle final");
paso(`${FOLIO}: estado final ${sol.estado}, cotización ${sol.folioCotizacion ?? "—"}`);
