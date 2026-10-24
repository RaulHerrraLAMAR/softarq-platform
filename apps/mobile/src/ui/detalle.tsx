import type { ReactNode } from "react";
import { View } from "react-native";
import { mensajeDeFallo } from "../api/errores";
import type { EstadoConsulta } from "../consultas/ejecutor";
import { Aviso, Boton, Cargando, ErrorConsulta, Pantalla } from "./componentes";
import { ESP } from "./tema";

interface Props<T> {
  estado: EstadoConsulta<T>;
  alReintentar: () => void;
  textoCargando?: string;
  children: (datos: T) => ReactNode;
}

/**
 * Pantalla de detalle con todos los estados: cargando, error con reintento, datos (arrastrar para
 * refrescar) y, si falla una actualización, los datos anteriores se conservan con un aviso visible.
 */
export function Detalle<T>({ estado, alReintentar, textoCargando, children }: Props<T>) {
  if (estado.datos === null) {
    return <Pantalla>{estado.fase === "error" && estado.error ? <ErrorConsulta fallo={estado.error} alReintentar={alReintentar} /> : <Cargando texto={textoCargando ?? "Cargando…"} />}</Pantalla>;
  }
  return (
    <Pantalla refrescando={estado.actualizando} alRefrescar={alReintentar}>
      {estado.error ? (
        <View style={{ gap: ESP[2] }}>
          <Aviso tono="aviso" texto={`No se pudo actualizar (${mensajeDeFallo(estado.error)}). Lo que ve puede estar desactualizado.`} />
          <Boton texto="Reintentar" variante="secundario" alPulsar={alReintentar} />
        </View>
      ) : null}
      {children(estado.datos)}
    </Pantalla>
  );
}
