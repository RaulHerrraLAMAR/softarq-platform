#!/usr/bin/env node
// Arranca Metro para la development build con el ajuste IPv4 documentado (ADR-0020 §4).
//
// Uso (desde la raíz del repositorio):  pnpm --filter @softarq/mobile start
// Metro escucha solo en loopback; el teléfono llega por `adb reverse tcp:8081 tcp:8081`.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { argumentosExpo, nodeOptionsIpv4 } from "./opciones-metro.mjs";

const requerir = createRequire(import.meta.url);
const cliExpo = requerir.resolve("expo/bin/cli");

const hijo = spawn(process.execPath, [cliExpo, ...argumentosExpo(process.argv.slice(2))], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptionsIpv4(process.env.NODE_OPTIONS), EXPO_NO_TELEMETRY: "1" },
});

for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => hijo.kill(senal));
hijo.on("exit", (codigo, senal) => process.exit(codigo ?? (senal ? 1 : 0)));
