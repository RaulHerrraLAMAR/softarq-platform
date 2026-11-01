#!/usr/bin/env node
// Alta idempotente del cliente de presentación «[DEMO] Raul Herrera» (cliente, proyecto y acceso CLIENTE).
//
// Usa solo las rutas normales de la API, con las cuentas DEMO del equipo (Preparador para el cliente y
// el proyecto; Administrador del sistema para el acceso). No escribe en SQL ni toca nada existente.
// La contraseña temporal llega una sola vez en la respuesta del alta y se guarda únicamente en un archivo
// de `_work\secrets` con permisos restringidos al usuario de Windows. Nunca se imprime.
//
// Uso (desde la raíz del repositorio, con la API local en marcha):
//   node scripts/demo/acceso-presentacion.mjs --api http://127.0.0.1:3000 [--perfil raul|qa]
//
// Si el cliente, el proyecto o el acceso ya existen, no los duplica ni restablece contraseña alguna.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Perfiles: «raul» es la cuenta principal de la presentación; «qa» es una cuenta separada para pruebas automatizadas,
// de modo que la automatización nunca toque ni reinicie la de Raul.
const PERFILES = {
  raul: {
    cliente: "[DEMO] Raul Herrera",
    contacto: "Raul Herrera",
    busqueda: "Raul Herrera",
    proyecto: "[DEMO] Casa Raul Herrera — ampliación de planta alta",
    descripcion: "Proyecto de presentación: ampliación de una planta alta con losa y muro de carga. Datos ficticios para la demostración.",
    correo: "raul.demo@clientes.softarq.test",
    motivo: "Cuenta de presentación del propietario del proyecto (DEMO)",
    archivo: "acceso-cliente-raul-softarq_dev.json",
  },
  qa: {
    cliente: "[QA] Cuenta de pruebas automatizadas",
    contacto: "Pruebas QA",
    busqueda: "Cuenta de pruebas automatizadas",
    proyecto: "[QA] Proyecto de pruebas automatizadas",
    descripcion: "Proyecto de pruebas automatizadas del DEMO local. No es un dato de presentación.",
    correo: "qa.cliente@clientes.softarq.test",
    motivo: "Cuenta QA para pruebas automatizadas (no es de presentación)",
    archivo: "acceso-cliente-qa-softarq_dev.json",
  },
};
const MUNICIPIO = "Tlalnepantla de Baz";
const ENTIDAD = "Estado de México";

const args = process.argv.slice(2);
const opcion = (n, d) => {
  const i = args.indexOf(n);
  if (i === -1) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const API = opcion("--api", "http://127.0.0.1:3000");
const ORIGEN = opcion("--origen", "http://localhost:5173");
const RAIZ_TRABAJO = resolve(import.meta.dirname, "..", "..", "..", "_work");
const ARCHIVO_EQUIPO = opcion("--cuentas", resolve(RAIZ_TRABAJO, "secrets", "accesos-demo-softarq_dev.json"));
const PERFIL = PERFILES[opcion("--perfil", "raul")];
if (!PERFIL) throw new Error("Perfil no válido: use raul o qa.");
const NOMBRE_CLIENTE = PERFIL.cliente;
const NOMBRE_PROYECTO = PERFIL.proyecto;
const DESCRIPCION_PROYECTO = PERFIL.descripcion;
const CORREO = PERFIL.correo;
const MOTIVO_ACCESO = PERFIL.motivo;
const ARCHIVO_SALIDA = resolve(RAIZ_TRABAJO, "secrets", PERFIL.archivo);

class Sesion {
  cookie = null;
  csrf = null;
  async llamar(metodo, ruta, cuerpo, idem) {
    const h = { Accept: "application/json" };
    if (this.cookie) h.Cookie = `softarq_sesion=${this.cookie}`;
    if (metodo !== "GET") {
      h.Origin = ORIGEN;
      if (this.csrf) h["X-CSRF-Token"] = this.csrf;
      h["Content-Type"] = "application/json; charset=utf-8";
      h["Idempotency-Key"] = idem ?? randomUUID();
    }
    const r = await fetch(`${API}${ruta}`, { method: metodo, headers: h, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) });
    const g = r.headers.getSetCookie().find((c) => c.startsWith("softarq_sesion="));
    if (g) this.cookie = g.slice("softarq_sesion=".length).split(";")[0] || null;
    const t = await r.text();
    let json = null;
    try {
      json = t ? JSON.parse(t) : null;
    } catch {
      json = null;
    }
    return { status: r.status, json };
  }
  async entrar(correo, contrasena) {
    const previa = await this.llamar("GET", "/api/v1/auth/csrf");
    this.csrf = previa.json?.csrfToken ?? null;
    const r = await this.llamar("POST", "/api/v1/auth/sesion", { correo, contrasena });
    if (r.status !== 200) throw new Error(`No se pudo iniciar la sesión de ${correo} (HTTP ${r.status}).`);
    this.csrf = r.json.csrfToken;
    return this;
  }
  async salir() {
    await this.llamar("DELETE", "/api/v1/auth/sesion");
  }
}

function esperar(r, ...validos) {
  if (!validos.includes(r.status)) throw new Error(`HTTP ${r.status}: ${r.json?.error?.codigo ?? "respuesta inesperada"}`);
  return r.json;
}

function restringirArchivo(ruta) {
  // Quita la herencia y deja el permiso solo al usuario actual de Windows.
  const usuario = `${process.env.USERDOMAIN ?? ""}\\${process.env.USERNAME ?? ""}`;
  execFileSync("icacls", [ruta, "/inheritance:r", "/grant:r", `${usuario}:F`], { stdio: "ignore" });
}

async function principal() {
  const cuentas = JSON.parse(readFileSync(ARCHIVO_EQUIPO, "utf8")).cuentas;
  const prep = cuentas["preparador.demo@softarq.test"];
  const adm = cuentas["administrador.demo@softarq.test"];
  if (!prep || !adm) throw new Error("Faltan las cuentas DEMO del Preparador o del Administrador en el archivo de accesos.");

  const p = await new Sesion().entrar("preparador.demo@softarq.test", prep.contrasena);
  const a = await new Sesion().entrar("administrador.demo@softarq.test", adm.contrasena);
  try {
    // 1) Cliente
    const busqueda = esperar(await p.llamar("GET", `/api/v1/clientes?buscar=${encodeURIComponent(PERFIL.busqueda)}&incluirInactivos=true&limite=50`), 200);
    let cliente = busqueda.clientes.find((c) => c.nombre === NOMBRE_CLIENTE);
    if (cliente) console.log(`Cliente ya existía: ${cliente.codigo} (no se duplica).`);
    else {
      cliente = esperar(await p.llamar("POST", "/api/v1/clientes", { nombre: NOMBRE_CLIENTE, contactoNombre: PERFIL.contacto }), 201);
      console.log(`Cliente creado: ${cliente.codigo}.`);
    }

    // 1b) Clasificación explícita (E3.8): lo de Raul es presentación y lo de QA, QA. Solo si todavía no tiene una.
    if (!cliente.clasificacion) {
      const categoria = PERFIL === PERFILES.qa ? "QA" : "PRESENTACION";
      const motivo = categoria === "QA" ? "Cuenta de pruebas automatizadas (no es de presentación)" : "Cuenta principal de la presentación del DEMO local";
      esperar(await a.llamar("PUT", `/api/v1/clientes/${cliente.id}/clasificacion`, { categoria, motivo }), 200);
      console.log(`Cliente clasificado como ${categoria}.`);
    }

    // 2) Proyecto
    const proyectos = esperar(await p.llamar("GET", `/api/v1/proyectos?clienteId=${cliente.id}&incluirInactivos=true&limite=50`), 200);
    let proyecto = proyectos.proyectos.find((x) => x.nombre === NOMBRE_PROYECTO);
    if (proyecto) console.log(`Proyecto ya existía: ${proyecto.codigo} (no se duplica).`);
    else {
      proyecto = esperar(
        await p.llamar("POST", "/api/v1/proyectos", {
          clienteId: cliente.id,
          nombre: NOMBRE_PROYECTO,
          municipio: MUNICIPIO,
          entidadFederativa: ENTIDAD,
          descripcion: DESCRIPCION_PROYECTO,
        }),
        201,
      );
      console.log(`Proyecto creado: ${proyecto.codigo}.`);
    }

    // 3) Acceso CLIENTE (cuenta separada de la de administración)
    const existentes = await a.llamar("GET", `/api/v1/clientes/${cliente.id}/acceso`);
    const accesoPrevio = existentes.status === 200 ? existentes.json : null;
    if (accesoPrevio?.acceso ?? accesoPrevio?.usuarioId) {
      console.log("El acceso ya existía: no se restablece ni se escribe archivo de contraseña.");
      return;
    }
    if (existsSync(ARCHIVO_SALIDA)) throw new Error("Ya hay un archivo de acceso local pero el acceso no existe en la base: revísalo antes de continuar.");
    const alta = esperar(await a.llamar("POST", `/api/v1/clientes/${cliente.id}/acceso`, { correo: CORREO, nombre: PERFIL.contacto, motivo: MOTIVO_ACCESO }), 201);
    if (!alta.contrasenaTemporal) throw new Error("La API no entregó la contraseña temporal (reintento idempotente): revisa el estado antes de repetir.");
    mkdirSync(dirname(ARCHIVO_SALIDA), { recursive: true });
    writeFileSync(
      ARCHIVO_SALIDA,
      JSON.stringify(
        {
          advertencia: "Acceso DEMO local de presentación. NO VERSIONAR NI COMPARTIR. Solo válido en softarq_dev local.",
          correo: CORREO,
          contrasenaTemporal: alta.contrasenaTemporal,
          temporalExpiraEn: alta.temporalExpiraEn,
          cliente: cliente.codigo,
          proyecto: proyecto.codigo,
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    restringirArchivo(ARCHIVO_SALIDA);
    console.log(`Acceso creado para ${CORREO}; la temporal vence ${alta.temporalExpiraEn}.`);
    console.log(`Credencial guardada en: ${ARCHIVO_SALIDA}`);
  } finally {
    await p.salir();
    await a.salir();
  }
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
