#!/usr/bin/env node
// Crea un borrador NUEVO de la cuenta QA (copia la captura de su última solicitud) por la API normal del cliente,
// para repetir pruebas de envío sin tocar los borradores de Raul. La contraseña QA viene de `_work/secrets` y no se imprime.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "http://127.0.0.1:3000";
const QA = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "..", "..", "_work", "secrets", "acceso-cliente-qa-softarq_dev.json"), "utf8"));
const llamar = async (m, ruta, token, cuerpo) => {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(m !== "GET" ? { "Idempotency-Key": randomUUID() } : {}) };
  const r = await fetch(`${API}${ruta}`, { method: m, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const t = await r.text();
  return { status: r.status, cuerpo: t ? JSON.parse(t) : null };
};
const ses = await fetch(`${API}/api/v1/auth/movil/sesion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo: QA.correo, contrasena: QA.contrasena }) });
const token = (await ses.json()).tokenSesion;
const lista = (await llamar("GET", "/api/v1/cliente/solicitudes", token)).cuerpo.solicitudes;
const origen = lista[0];
const d = (await llamar("GET", `/api/v1/cliente/solicitudes/${origen.id}`, token)).cuerpo;
const proyectoId = d.proyectoId ?? d.proyecto?.id ?? origen.proyectoId;
if (!proyectoId) throw new Error(`Sin proyectoId; claves: ${Object.keys(d)}`);
const r = await llamar("POST", "/api/v1/cliente/solicitudes", token, { proyectoId, captura: { trabajos: d.captura.trabajos, notas: "[QA] borrador para I-02" } });
console.log(`POST ${r.status}`, r.status < 300 ? `${r.cuerpo.folio ?? r.cuerpo.solicitud?.folio} estado ${r.cuerpo.estado ?? r.cuerpo.solicitud?.estado}` : JSON.stringify(r.cuerpo).slice(0, 300));
await llamar("DELETE", "/api/v1/auth/sesion", token);
