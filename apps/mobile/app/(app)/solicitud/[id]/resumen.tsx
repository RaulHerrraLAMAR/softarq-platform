import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { mensajeDeFallo } from "../../../../src/api/errores";
import { ESPERA_CIERRE_HOJA_MS, HojaEnvio } from "../../../../src/captura/HojaEnvio";
import { useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { cambiarNotas, quitarTrabajo } from "../../../../src/captura/modelo";
import { indiceDeRuta, resumirTrabajos, textoDeAvance, trabajosCompletos } from "../../../../src/captura/resumen";
import { rutas } from "../../../../src/navegacion/rutas";
import { Aviso, BarraAccion, Boton, Campo, Enlace, Hoja, Insignia, Pantalla, Texto } from "../../../../src/ui/componentes";
import { Anillo, Encabezado, IndicadorGuardado } from "../../../../src/ui/componentes-captura";
import { Ilustracion } from "../../../../src/ui/ilustraciones";
import { ESP, FUENTE, RADIO, TEXTO, useTema } from "../../../../src/ui/tema";

/**
 * Paso 4 · Resumen editable. Todo lo capturado antes de calcular: cada trabajo se puede corregir o quitar, y lo que falta
 * se señala con un acceso directo al campo. Calcular la estimación y enviar son acciones separadas: se puede enviar la
 * solicitud sin estimación y calcular no envía nada.
 */
export default function Resumen() {
  const t = useTema();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { controlador, catalogo, estado } = useSolicitud();
  const [quitando, setQuitando] = useState<string | null>(null);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  if (!id) return null;

  const resumen = resumirTrabajos(estado.local, catalogo);
  const f = controlador.faltantes;
  const listo = f.errores.length === 0 && f.pendientes.length === 0;
  const avance = resumen.length === 0 ? 0 : trabajosCompletos(resumen) / resumen.length;
  const porQuitar = resumen.find((r) => r.id === quitando);
  const idDeTrabajo = (ruta: string) => {
    const i = indiceDeRuta(ruta);
    return i === null ? undefined : estado.local.trabajos[i]?.id;
  };

  return (
    <Pantalla
      encabezado={<Encabezado titulo="Resumen" alVolver={() => router.back()} paso={4} total={5} etiquetaPaso="Revisa tu solicitud" />}
      pie={
        <BarraAccion>
          <Boton texto="Calcular estimación" subtitulo="No envía tu solicitud" alPulsar={() => router.push(rutas.estimacion(id))} deshabilitado={!listo} />
          <Boton texto="Enviar sin estimación" variante="secundario" alPulsar={() => setConfirmarEnvio(true)} deshabilitado={!listo} ayuda="Envía la solicitud al equipo sin calcular una estimación" />
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs + 1, color: t.suave, textAlign: "center" }}>
            {listo ? "Todo listo para calcular o enviar" : "Completa lo que falta para continuar"}
          </Text>
        </BarraAccion>
      }
    >
      <View style={{ gap: ESP[2] }}>
        {estado.solicitud ? <Insignia texto={`Proyecto: ${estado.solicitud.proyecto.nombre}`} tono="info" /> : null}
        <Texto variante="titulo">Revisa tu solicitud</Texto>
        <Texto variante="atenuado">Corrige lo que necesites antes de calcular. Se guarda solo.</Texto>
        <IndicadorGuardado estado={estado.guardado} alReintentar={() => void controlador.guardarAhora()} />
      </View>

      {resumen.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[3] }}>
          <Anillo avance={avance} texto={`${trabajosCompletos(resumen)}/${resumen.length}`} />
          <Text style={{ flex: 1, fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta }}>{textoDeAvance(resumen)}</Text>
        </View>
      ) : null}

      {resumen.length === 0 ? <Aviso tono="aviso" titulo="Aún no hay trabajos" texto="Agrega al menos un trabajo para poder calcular o enviar tu solicitud." /> : null}

      {resumen.map((r) => (
        <View key={r.id} style={{ borderRadius: RADIO.medio, borderWidth: 1, borderColor: r.estado === "completo" ? t.linea : r.estado === "con_errores" ? t.rojo : t.ocre, backgroundColor: t.papel, padding: ESP[3], gap: ESP[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[3] }}>
            <Ilustracion tipo={r.tipo} ancho={84} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.lg, color: t.tinta }}>{r.nombre}</Text>
              {r.variasOpciones ? <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>{r.opcion}</Text> : null}
              <Insignia texto={r.estado === "completo" ? "Completo" : r.estado === "con_errores" ? "Hay que corregir" : "Faltan datos"} tono={r.estado === "completo" ? "correcto" : r.estado === "con_errores" ? "error" : "aviso"} />
            </View>
          </View>
          <View style={{ gap: ESP[1] }}>
            {r.secciones.map((s, i) => (
              <Text key={i} style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm + 1, color: t.tinta }}>
                <Text style={{ fontFamily: FUENTE.textoFuerte }}>Sección {i + 1} · </Text>
                {s}
              </Text>
            ))}
            {r.huecos.map((s, i) => (
              <Text key={`h${i}`} style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm + 1, color: t.tinta }}>
                <Text style={{ fontFamily: FUENTE.textoFuerte }}>Hueco {i + 1} · </Text>
                {s}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: ESP[4], flexWrap: "wrap" }}>
            <Enlace texto="Editar" ayuda={`Edita las medidas de ${r.nombre}`} alPulsar={() => router.push(rutas.medidas(id, r.id))} />
            <Enlace texto="Quitar trabajo" ayuda={`Quita ${r.nombre} de la solicitud`} alPulsar={() => setQuitando(r.id)} />
          </View>
        </View>
      ))}

      <Boton texto="Agregar otro trabajo" icono="mas" variante="secundario" alPulsar={() => router.push(rutas.elegirTrabajo(id))} />

      {!listo && resumen.length > 0 ? (
        <View style={{ gap: ESP[2] }}>
          <Texto variante="etiqueta">Por completar</Texto>
          {[...f.errores, ...f.pendientes].slice(0, 8).map((c, i) => {
            const trabajoId = idDeTrabajo(c.ruta);
            return (
              <View key={`${c.ruta}${i}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ESP[2] }}>
                <Text style={{ flex: 1, fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.tinta }}>
                  {trabajoId ? `${resumen.find((r) => r.id === trabajoId)?.nombre ?? "Trabajo"}: ` : ""}
                  {c.mensaje}
                </Text>
                {trabajoId ? <Enlace texto="Corregir" ayuda={c.mensaje} alPulsar={() => router.push(rutas.medidas(id, trabajoId))} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {estado.camposServidor.length > 0 ? <Aviso tono="error" titulo="El servidor pidió revisar" texto={estado.camposServidor.map((c) => c.mensaje).join(" ")} /> : null}
      {estado.errorEnvio ? <Aviso tono="error" texto={mensajeDeFallo(estado.errorEnvio)} /> : null}

      <Campo etiqueta="Notas para el equipo (opcional)" valor={estado.local.notas} alCambiar={(v) => controlador.modificar((c) => cambiarNotas(c, v))} textoLibre multilinea maximo={500} ayuda="Cualquier dato que ayude a cotizar mejor: acceso a la obra, plazos, materiales que prefieres." />

      <Hoja visible={quitando !== null} etiqueta="Quitar trabajo" alCerrar={() => setQuitando(null)}>
        <Texto variante="subtitulo">¿Quitar {porQuitar?.nombre ?? "el trabajo"}?</Texto>
        <Texto variante="atenuado">Se quitará de esta solicitud junto con sus medidas. Tus otros trabajos no cambian.</Texto>
        <Boton
          texto="Quitar trabajo"
          alPulsar={() => {
            const q = quitando;
            setQuitando(null);
            if (q) controlador.modificar((c) => quitarTrabajo(c, q));
          }}
        />
        <Boton texto="Cancelar" variante="secundario" alPulsar={() => setQuitando(null)} />
      </Hoja>

      <HojaEnvio
        visible={confirmarEnvio}
        sinEstimacion
        alCerrar={() => setConfirmarEnvio(false)}
        alTerminar={() => {
          setConfirmarEnvio(false);
          setTimeout(() => {
            router.dismissAll();
            router.push(rutas.seguimiento(id));
          }, ESPERA_CIERRE_HOJA_MS);
        }}
      />
    </Pantalla>
  );
}
