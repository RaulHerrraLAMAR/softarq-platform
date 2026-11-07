#!/usr/bin/env node
// QA en el teléfono: apertura limpia → borrador QA → Calcular estimación → Enviar → hoja «Solicitud enviada» → «Ver seguimiento» → Atrás.
// Reproduce el defecto del 07/11/2026 (hoja huérfana que no respondía) y comprueba su corrección. Requiere un borrador QA nuevo
// (`node scripts/qa/borrador-qa.mjs`), la API en 3000 y Metro en 8081 con `adb reverse`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { iniciarApp, entrar } from "./escenarios-android.mjs";
import { adb, atras, buscar, captura, esperar, esperarTexto, hay, textos, tocar } from "./android.mjs";

const QA = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "..", "..", "_work", "secrets", "acceso-cliente-qa-softarq_dev.json"), "utf8"));
adb("shell", "am", "force-stop", "com.softarq.demo");
adb("logcat", "-c");
await esperar(1500);
await iniciarApp();
if (hay("Iniciar sesión")) await entrar(QA.correo, QA.contrasena);
await esperarTexto("Retomar el borrador", 25000);
tocar("Retomar el borrador");
console.log("resumen:", await esperarTexto("Paso 4", 15000));
tocar("Calcular estimación", { clase: "Button" });
console.log("estimación:", await esperarTexto("ESTIMACIÓN PRELIMINAR", 30000));
tocar("Enviar solicitud", { clase: "Button" });
console.log("confirmación:", await esperarTexto("¿Enviar tu solicitud?", 10000));
tocar("Enviar solicitud", { clase: "Button" });
console.log("hoja «Solicitud enviada»:", await esperarTexto("Solicitud enviada", 25000));
await esperar(2000);
const b = buscar("Ver seguimiento", { clase: "Button" });
adb("shell", "input", "tap", String(b.cx), String(b.cy));
await esperar(4500);
captura("envio-estimacion-tras-ver-seguimiento");
const sigue = !!buscar("Ver seguimiento", { clase: "Button" });
console.log("la hoja se cerró y se ve el seguimiento:", !sigue && hay("Seguimiento"), "|", textos().slice(0, 5).join(" | ").slice(0, 160));
atras();
await esperar(2500);
captura("envio-estimacion-tras-atras");
console.log("«Atrás» lleva al Inicio:", hay("Nueva cotización") && !hay("Paso "));
const e = adb("logcat", "-d", "-s", "ReactNativeJS:E", "AndroidRuntime:E").split(String.fromCharCode(10)).filter(Boolean);
console.log("errores JS/Runtime:", e.length ? e.slice(-4).join(" || ").slice(0, 500) : "ninguno");
