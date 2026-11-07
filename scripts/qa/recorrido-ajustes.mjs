#!/usr/bin/env node
// QA en el teléfono: recorre el asistente (Resumen → Medidas con teclado → Resumen → Estimación) con un ajuste de accesibilidad
// y revisa que las acciones (botones) queden dentro de la zona visible (sobre la barra del sistema y, con el teclado, sobre él).
// No envía nada. Uso: node scripts/qa/recorrido-ajustes.mjs <grande|claro|reducido|base>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { iniciarApp, entrar } from "./escenarios-android.mjs";
import { adb, atras, captura, cerrarTeclado, esperar, esperarTexto, hay, nodos, tecladoAbierto, textos, tocar } from "./android.mjs";

const QA = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "..", "..", "_work", "secrets", "acceso-cliente-qa-softarq_dev.json"), "utf8"));
const modo = process.argv[2] ?? "base";
const ajustes = {
  grande: () => adb("shell", "settings", "put", "system", "font_scale", "1.5"),
  claro: () => adb("shell", "cmd", "uimode", "night", "no"),
  reducido: () => ["animator_duration_scale", "transition_animation_scale", "window_animation_scale"].forEach((k) => adb("shell", "settings", "put", "global", k, "0")),
  base: () => {},
};
const restaurar = () => {
  adb("shell", "settings", "put", "system", "font_scale", "1.1");
  adb("shell", "cmd", "uimode", "night", "yes");
  adb("shell", "settings", "delete", "global", "animator_duration_scale");
  adb("shell", "settings", "put", "global", "transition_animation_scale", "1.0");
  adb("shell", "settings", "put", "global", "window_animation_scale", "1.0");
};
const ALTO = 2340;
const NAV = 150; // barra de navegación de tres botones
const problemas = [];
const revisar = (pantalla) => {
  const bajo = tecladoAbierto() ? 1500 : ALTO - NAV;
  const ocultos = nodos().filter((n) => n.clic && n.clase === "Button" && n.cy > 0 && (n.y2 > ALTO - 5 || (n.y2 > bajo + 20 && !tecladoAbierto())));
  const sinEtiqueta = nodos().filter((n) => n.clic && n.clase === "Button" && n.cy > 0 && !n.texto);
  console.log(`  [${pantalla}] botones: ${nodos().filter((n) => n.clic && n.clase === "Button").length}; fuera de la zona visible: ${ocultos.length}; sin etiqueta: ${sinEtiqueta.length}; teclado: ${tecladoAbierto()}`);
  for (const o of ocultos) problemas.push(`${pantalla}: «${o.texto.slice(0, 40)}» parcialmente fuera (y2=${o.y2})`);
  for (const o of sinEtiqueta) problemas.push(`${pantalla}: botón sin etiqueta en (${o.cx},${o.cy})`);
  captura(`ajuste-${modo}-${pantalla}`);
};
try {
  ajustes[modo]();
  adb("shell", "am", "force-stop", "com.softarq.demo");
  await esperar(1500);
  await iniciarApp();
  if (hay("Iniciar sesión")) await entrar(QA.correo, QA.contrasena);
  await esperarTexto("Nueva cotización", 25000);
  revisar("inicio");
  tocar("Retomar el borrador");
  await esperarTexto("Paso 4", 15000);
  revisar("resumen");
  // Se desplaza sobre el contenido (no sobre la barra de acciones) hasta que «Editar» queda libre.
  for (let i = 0; i < 4; i++) {
    const e = nodos().find((n) => n.clase === "Button" && n.texto === "Editar");
    if (e && e.cy < 1400) break;
    adb("shell", "input", "swipe", "540", "1250", "540", "450", "300");
    await esperar(700);
  }
  tocar("Editar", { exacto: true, clase: "Button" });
  await esperarTexto("Paso 3", 15000).catch(() => {});
  await esperar(1500);
  console.log("  medidas:", textos().filter((t) => /^Paso|Largo|Ancho|Espesor|Continuar/.test(t)).slice(0, 6).join(" | "));
  revisar("medidas");
  let campo = null;
  for (let i = 0; i < 5 && !campo; i++) {
    campo = nodos().find((n) => n.clase === "EditText" && n.cy > 450 && n.cy < 1450);
    if (!campo) { adb("shell", "input", "swipe", "540", "1500", "540", "700", "300"); await esperar(700); }
  }
  console.log("  campo para el teclado:", campo ? `@${campo.cx},${campo.cy}` : "no accesible");
  if (campo) {
    adb("shell", "input", "tap", String(campo.cx), String(campo.cy));
    await esperar(1500);
    revisar("medidas-con-teclado");
    await cerrarTeclado();
  }
  atras();
  await esperar(2000);
  await esperarTexto("Paso 4", 10000);
  tocar("Calcular estimación", { clase: "Button" });
  await esperarTexto("ESTIMACIÓN PRELIMINAR", 30000);
  revisar("estimacion");
  console.log(problemas.length ? `PROBLEMAS (${modo}):\n - ${problemas.join("\n - ")}` : `Sin acciones fuera de la zona visible ni sin etiqueta (${modo}).`);
} catch (e) {
  console.log("ERROR:", e.message.slice(0, 200));
} finally {
  restaurar();
  adb("shell", "am", "force-stop", "com.softarq.demo");
}
