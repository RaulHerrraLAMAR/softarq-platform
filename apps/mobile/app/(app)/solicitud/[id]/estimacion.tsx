import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { mensajeDeFallo } from "../../../../src/api/errores";
import { HojaEnvio } from "../../../../src/captura/HojaEnvio";
import { useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { rutas } from "../../../../src/navegacion/rutas";
import { Aviso, BarraAccion, Boton, Desplegable, Enlace, Esqueleto, Insignia, Pantalla, Texto } from "../../../../src/ui/componentes";
import { Encabezado } from "../../../../src/ui/componentes-captura";
import { formatearCantidad, formatearFecha, formatearImporte, formatearTasa } from "../../../../src/ui/formato";
import { ESP, FUENTE, RADIO, TEXTO, useTema } from "../../../../src/ui/tema";

/**
 * Paso 5 · Estimación. El importe lo calcula SIEMPRE la API con precios de referencia; la app solo lo muestra. Una
 * estimación solo se presenta como vigente mientras corresponda a lo que hay capturado: si algo cambió, se pide recalcular
 * y no se enseña el importe anterior. Sin precio de referencia no hay importe (nunca un cero). Calcular no envía nada.
 */
export default function Estimacion() {
  const t = useTema();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { controlador, estado } = useSolicitud();
  const [confirmando, setConfirmando] = useState(false);

  // Al llegar desde «Calcular estimación» se calcula de inmediato (solo si no hay ya una vigente).
  useEffect(() => {
    const e = controlador.obtenerEstado();
    if (e.soloLectura || e.estimacion === "vigente" || e.estimacion === "calculando") return;
    void controlador.estimar();
  }, [controlador]);

  if (!id) return null;
  const datos = estado.datosEstimacion;
  const vigente = estado.estimacion === "vigente" && datos !== null;
  const calculando = estado.estimacion === "calculando";
  const comercial = vigente ? datos.comercial : null;
  const f = controlador.faltantes;
  const listo = f.errores.length === 0 && f.pendientes.length === 0;

  return (
    <Pantalla
      encabezado={<Encabezado titulo="Estimación" alVolver={() => router.back()} paso={5} total={5} etiquetaPaso="Resultado" />}
      pie={
        <BarraAccion>
          {vigente ? (
            <Boton texto="Enviar solicitud" subtitulo="El equipo prepara tu cotización formal" alPulsar={() => setConfirmando(true)} />
          ) : (
            <Boton texto={datos ? "Recalcular estimación" : "Calcular estimación"} alPulsar={() => void controlador.estimar()} cargando={calculando} deshabilitado={!listo} />
          )}
          <Boton texto="Editar medidas" variante="secundario" alPulsar={() => router.dismissTo(rutas.resumen(id))} deshabilitado={calculando} />
          {!vigente && !calculando ? <Enlace texto="Enviar sin estimación" alPulsar={() => setConfirmando(true)} deshabilitado={!listo} /> : null}
        </BarraAccion>
      }
    >
      {calculando ? (
        <View accessibilityLiveRegion="polite" style={{ gap: ESP[3] }}>
          <Texto variante="subtitulo">Calculando tu estimación…</Texto>
          <Esqueleto alto={110} />
          <Esqueleto alto={72} />
        </View>
      ) : null}

      {!calculando && estado.estimacion === "error" && estado.errorEstimacion ? (
        <View style={{ gap: ESP[3] }}>
          {estado.guardado === "error" ? (
            <Aviso tono="error" titulo="No se pudo guardar tu solicitud" texto={`${mensajeDeFallo(estado.errorEstimacion)} Tus cambios siguen en este teléfono; cuando vuelva la conexión, vuelve a pulsar el botón de calcular para reintentar.`} />
          ) : (
            <Aviso tono="error" titulo="No pudimos calcular tu estimación" texto={mensajeDeFallo(estado.errorEstimacion)} />
          )}
          {estado.camposServidor.length > 0 ? <Aviso tono="aviso" texto={estado.camposServidor.map((c) => c.mensaje).join(" ")} /> : null}
        </View>
      ) : null}

      {!calculando && estado.estimacion === "desactualizada" ? (
        <Aviso tono="aviso" titulo="Hace falta recalcular" texto="Cambiaste algo desde el último cálculo, así que ya no mostramos ese resultado. Recalcula para ver la estimación de lo que tienes ahora." />
      ) : null}

      {vigente && datos ? (
        <>
          <View style={{ gap: ESP[2] }}>
            <View style={{ alignSelf: "flex-start", borderWidth: 2.5, borderColor: t.tinta, borderRadius: RADIO.chico, paddingHorizontal: ESP[3], paddingVertical: ESP[1], backgroundColor: t.ocreTinte, transform: [{ rotate: "-1.5deg" }] }}>
              <Text accessibilityRole="header" style={{ fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.sm, letterSpacing: 1, textTransform: "uppercase", color: t.tinta }}>
                Estimación preliminar
              </Text>
            </View>
            <Texto variante="atenuado">No es una cotización formal. No equivale a una aprobación ni a una emisión.</Texto>
            {estado.solicitud ? <Insignia texto={`Proyecto: ${estado.solicitud.proyecto.nombre}`} tono="info" /> : null}
          </View>

          {comercial ? (
            <>
              <View accessible accessibilityLabel={`Total estimado ${formatearImporte(comercial.total)} pesos mexicanos, IVA incluido`} style={{ gap: ESP[1] }}>
                <Texto variante="importe">{formatearImporte(comercial.total)}</Texto>
                <Texto variante="pequeno">MXN · IVA incluido</Texto>
              </View>
              {comercial.leyenda ? <Insignia texto="DEMO · datos ilustrativos, sin validez comercial" tono="demo" /> : null}

              <View style={{ gap: ESP[1] }}>
                <Texto variante="etiqueta">Qué incluye</Texto>
                {comercial.partidas.map((p) => (
                  <View key={p.numero} style={{ flexDirection: "row", justifyContent: "space-between", gap: ESP[3], paddingVertical: ESP[2], borderTopWidth: 1, borderTopColor: t.linea }}>
                    <Text style={{ flex: 1, fontFamily: FUENTE.titulo, fontSize: TEXTO.md, color: t.tinta }}>{p.descripcion}</Text>
                    <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm + 1, color: t.suave, fontVariant: ["tabular-nums"] }}>
                      {formatearCantidad(p.cantidad)} {p.unidad}
                    </Text>
                  </View>
                ))}
              </View>

              <Desplegable titulo="Ver desglose comercial">
                <View style={{ gap: ESP[2] }}>
                  {comercial.partidas.map((p) => (
                    <View key={p.numero} style={{ flexDirection: "row", justifyContent: "space-between", gap: ESP[3] }}>
                      <Text style={{ flex: 1, fontFamily: FUENTE.texto, fontSize: TEXTO.sm + 1, color: t.tinta }}>
                        {p.descripcion} · {formatearCantidad(p.cantidad)} {p.unidad} × {formatearImporte(p.precioUnitario)}
                      </Text>
                      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm + 1, color: t.tinta, fontVariant: ["tabular-nums"] }}>{formatearImporte(p.importe)}</Text>
                    </View>
                  ))}
                  <Linea etiqueta="Subtotal" valor={formatearImporte(comercial.subtotal)} />
                  <Linea etiqueta={`${comercial.impuesto.nombre} ${formatearTasa(comercial.impuesto.tasa)}`} valor={formatearImporte(comercial.impuesto.importe)} />
                  <Linea etiqueta="Total estimado" valor={formatearImporte(comercial.total)} fuerte />
                  <Texto variante="pequeno">
                    Calculada el {formatearFecha(datos.fechaCalculo)} con precios de referencia. El equipo confirmará materiales y precios al preparar tu cotización formal.
                  </Texto>
                </View>
              </Desplegable>
            </>
          ) : (
            <View style={{ backgroundColor: t.ocreTinte, borderRadius: RADIO.medio, padding: ESP[4], gap: ESP[2] }}>
              <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.lg, color: t.tinta }}>El equipo completará la valoración</Text>
              <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.md, color: t.tinta }}>{datos.motivo?.mensaje ?? "Todavía no tenemos todos los precios de referencia para estimar este trabajo."}</Text>
              <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.tinta }}>Puedes enviar la solicitud igualmente: el equipo preparará tu cotización formal.</Text>
            </View>
          )}

          {datos.avisos.map((a) => (
            <Aviso key={a.codigo + a.mensaje} tono="info" texto={a.mensaje} />
          ))}
        </>
      ) : null}

      {estado.errorEnvio && !confirmando ? (
        <Aviso tono="error" titulo={estado.guardado === "error" ? "No se pudo guardar tu solicitud" : "No se pudo enviar"} texto={`${mensajeDeFallo(estado.errorEnvio)}${estado.guardado === "error" ? " Tus cambios siguen en este teléfono; no se envió nada. Reintenta cuando vuelva la conexión." : ""}`} />
      ) : null}

      <HojaEnvio
        visible={confirmando}
        sinEstimacion={!vigente}
        alCerrar={() => setConfirmando(false)}
        alTerminar={() => {
          setConfirmando(false);
          // Se sale de todo el recorrido de captura (no solo de su pila): al volver desde el seguimiento no reaparecen las
          // pantallas de edición de una solicitud que ya no se puede modificar.
          router.dismissTo(rutas.inicio);
          router.push(rutas.seguimiento(id));
        }}
      />
    </Pantalla>
  );
}

function Linea({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  const t = useTema();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: fuerte ? ESP[2] : 0, borderTopWidth: fuerte ? 1 : 0, borderTopColor: t.linea }}>
      <Text style={{ fontFamily: fuerte ? FUENTE.titulo : FUENTE.texto, fontSize: TEXTO.md, color: t.tinta }}>{etiqueta}</Text>
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta, fontVariant: ["tabular-nums"] }}>{valor}</Text>
    </View>
  );
}
