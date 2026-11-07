/**
 * Hoja de confirmación del envío (ADR-0021). Antes de enviar explica lo que cambia —la solicitud ya no se edita—; durante
 * el envío no se puede cerrar ni repetir; al terminar confirma con el folio. Si falla, muestra el error y permite
 * reintentar: el servidor trata el reintento como el mismo envío, no crea otra solicitud.
 */
import { Text, View } from "react-native";
import { mensajeDeFallo } from "../api/errores";
import { Aviso, Boton, Hoja, Texto } from "../ui/componentes";
import { Palomita } from "../ui/componentes-captura";
import { ESP, FUENTE, TEXTO, useTema } from "../ui/tema";
import { useSolicitud } from "./ProveedorSolicitud";

/** Tiempo para que termine de cerrarse la hoja (animación «slide») antes de cambiar de pantalla. */
export const ESPERA_CIERRE_HOJA_MS = 400;

export function HojaEnvio({ visible, sinEstimacion = false, alCerrar, alTerminar }: { visible: boolean; sinEstimacion?: boolean; alCerrar: () => void; alTerminar: () => void }) {
  const t = useTema();
  const { controlador, estado } = useSolicitud();
  const enviada = estado.envio === "enviada";
  const enviando = estado.envio === "enviando";

  if (enviada) {
    return (
      // Respeta `visible`: el llamador la cierra ANTES de navegar; un diálogo nativo que sigue abierto mientras la pantalla se
      // desmonta queda huérfano sobre el seguimiento y no responde (reproducido en el teléfono el 07/11/2026).
      <Hoja visible={visible} etiqueta="Solicitud enviada">
        <View style={{ alignItems: "center", gap: ESP[3] }}>
          <Palomita />
          <Texto variante="titulo" centrado>
            Solicitud enviada
          </Texto>
          <Texto variante="atenuado" centrado>
            El equipo revisará tus medidas y preparará tu cotización formal. Aquí podrás seguir el avance y verla cuando esté lista.
          </Texto>
          {estado.solicitud ? <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs + 1, color: t.suave, fontVariant: ["tabular-nums"] }}>Referencia {estado.solicitud.folio}</Text> : null}
        </View>
        <Boton texto="Ver seguimiento" alPulsar={alTerminar} />
      </Hoja>
    );
  }

  return (
    <Hoja visible={visible} etiqueta="Enviar solicitud" {...(enviando ? {} : { alCerrar })}>
      <Texto variante="subtitulo">¿Enviar tu solicitud?</Texto>
      <Texto variante="atenuado">
        {sinEstimacion ? "La enviarás sin calcular una estimación. " : ""}
        Al enviarla, el equipo la recibe y ya no podrás cambiarla desde la app. Mientras no la atienda, podrás retirarla y crear una nueva.
      </Texto>
      {estado.errorEnvio ? <Aviso tono="error" texto={mensajeDeFallo(estado.errorEnvio)} /> : null}
      <Boton texto={estado.errorEnvio ? "Reintentar el envío" : "Enviar solicitud"} alPulsar={() => void controlador.enviar()} cargando={enviando} />
      <Boton texto="Todavía no" variante="secundario" alPulsar={alCerrar} deshabilitado={enviando} />
    </Hoja>
  );
}
