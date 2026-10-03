/**
 * Claves de idempotencia por intención (ADR-0008 §5). La misma intención (misma operación y mismo
 * contenido) reutiliza su clave en cada reintento —doble clic, respuesta perdida o renovación del
 * token CSRF—, de modo que el servidor no duplica el alta; otra intención recibe otra clave.
 * Solo viven en memoria y se descartan con la sesión.
 */
import { useCallback, useRef } from "react";

export function useIntenciones() {
  const claves = useRef(new Map<string, string>());
  const id = (ambito: string, contenido: unknown) => `${ambito}:${JSON.stringify(contenido)}`;
  const clave = useCallback((ambito: string, contenido: unknown): string => {
    const k = id(ambito, contenido);
    let c = claves.current.get(k);
    if (!c) {
      c = crypto.randomUUID();
      claves.current.set(k, c);
    }
    return c;
  }, []);
  /** La intención terminó con una respuesta definitiva: la próxima vez será otra operación. */
  const olvidar = useCallback((ambito: string, contenido: unknown) => {
    claves.current.delete(id(ambito, contenido));
  }, []);
  return { clave, olvidar };
}
