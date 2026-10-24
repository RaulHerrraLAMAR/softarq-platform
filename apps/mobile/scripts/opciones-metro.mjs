// Entorno y argumentos con los que se arranca Metro para el teléfono por USB (ADR-0020 §4).
//
// Node 24 resuelve `localhost` a ::1 antes que a 127.0.0.1. `adb reverse tcp:8081` reenvía hacia IPv4, así que
// Metro, ligado a ::1, no recibía las conexiones del teléfono. `--dns-result-order=ipv4first` hace que
// `localhost` se resuelva primero a 127.0.0.1. Se añade a NODE_OPTIONS (no a la línea de `node`) para que lo
// hereden también los procesos de trabajo de Metro.
export const OPCION_IPV4 = "--dns-result-order=ipv4first";

/** Devuelve NODE_OPTIONS con la opción IPv4 una sola vez, conservando las que ya hubiera. */
export function nodeOptionsIpv4(actual) {
  const previas = (actual ?? "").trim();
  if (previas.split(/\s+/).includes(OPCION_IPV4)) return previas;
  return previas === "" ? OPCION_IPV4 : `${previas} ${OPCION_IPV4}`;
}

/** Argumentos de `expo start` para la development build: solo loopback, puerto fijo, más lo que pase la persona. */
export function argumentosExpo(extra = []) {
  const base = ["start", "--dev-client", "--localhost"];
  return extra.includes("--port") ? [...base, ...extra] : [...base, "--port", "8081", ...extra];
}
