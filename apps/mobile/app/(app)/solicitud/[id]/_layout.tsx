import { Stack, useGlobalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ProveedorSolicitud, useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { rutas } from "../../../../src/navegacion/rutas";
import { Boton, Hoja, Texto } from "../../../../src/ui/componentes";
import { useMovimientoReducido } from "../../../../src/ui/movimiento";
import { useTema } from "../../../../src/ui/tema";

/**
 * Recorrido de una solicitud: trabajo → medidas → resumen → estimación, y el seguimiento después de enviarla. Aquí viven las
 * dos situaciones que pueden aparecer en cualquier paso: otro dispositivo guardó cambios (conflicto) o la solicitud ya no
 * se puede editar (se envió o la atendió el equipo). Ninguna se resuelve en silencio.
 */
function Avisos({ id }: { id: string }) {
  const { controlador, estado } = useSolicitud();
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  // Solo avisa si la solicitud dejó de ser editable MIENTRAS se editaba; abrir una ya enviada es el seguimiento normal.
  const editableAlAbrir = useRef(estado.solicitud?.editable === true);
  const noEditable = editableAlAbrir.current && estado.soloLectura && estado.envio !== "enviada";
  const [visto, setVisto] = useState(false);

  return (
    <>
      <Hoja visible={estado.guardado === "conflicto" && estado.conflicto !== null} etiqueta="Esta solicitud cambió en otro lugar">
        <Texto variante="subtitulo">Esta solicitud cambió en otro lugar</Texto>
        <Texto variante="atenuado">Mientras la editabas, se guardaron cambios desde otro dispositivo o pantalla. No vamos a sobrescribirlos sin que tú decidas.</Texto>
        <Boton texto="Usar la versión guardada" subtitulo="Descarta lo que escribiste aquí" alPulsar={() => controlador.usarVersionGuardada()} variante="petroleo" />
        <Boton
          texto="Conservar mis cambios"
          subtitulo="Se guardarán sobre la versión más reciente"
          variante="secundario"
          cargando={trabajando}
          alPulsar={() => {
            setTrabajando(true);
            void controlador.conservarMisCambios().finally(() => setTrabajando(false));
          }}
        />
      </Hoja>
      <Hoja visible={noEditable && !visto} etiqueta="Esta solicitud ya no se puede editar">
        <Texto variante="subtitulo">Esta solicitud ya no se puede editar</Texto>
        <Texto variante="atenuado">Ya fue enviada o el equipo empezó a atenderla. Tus cambios más recientes pueden no haberse guardado. Puedes ver su seguimiento.</Texto>
        <Boton
          texto="Ver seguimiento"
          alPulsar={() => {
            setVisto(true);
            router.replace(rutas.seguimiento(id));
          }}
        />
      </Hoja>
    </>
  );
}

export default function LayoutSolicitud() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const t = useTema();
  const reducido = useMovimientoReducido();
  if (!id) return null;
  return (
    <ProveedorSolicitud id={id}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.fondo }, animation: reducido ? "none" : "slide_from_right" }} />
      <Avisos id={id} />
    </ProveedorSolicitud>
  );
}
