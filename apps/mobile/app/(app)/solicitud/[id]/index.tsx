import { Redirect, useLocalSearchParams } from "expo-router";
import { useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { rutas } from "../../../../src/navegacion/rutas";

/** Entrada de una solicitud: si todavía es un borrador se sigue editando; si no, se muestra su seguimiento. */
export default function EntradaSolicitud() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado } = useSolicitud();
  if (!id) return null;
  return <Redirect href={estado.soloLectura ? rutas.seguimiento(id) : rutas.resumen(id)} />;
}
