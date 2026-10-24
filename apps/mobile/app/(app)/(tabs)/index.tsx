import { useRouter } from "expo-router";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConsulta } from "../../../src/consultas/usar-consulta";
import { useRecargarAlEnfocar } from "../../../src/consultas/recargar-al-enfocar";
import { primerNombre, seccionesDe } from "../../../src/navegacion/capacidades";
import { rutas } from "../../../src/navegacion/rutas";
import { servicios } from "../../../src/servicios/instancia";
import { useSesion } from "../../../src/sesion/uso";
import { Aviso, Boton, Enlace, Esqueleto, ErrorConsulta, Pantalla, Texto, Vacio } from "../../../src/ui/componentes";
import { FilaLista } from "../../../src/ui/componentes-captura";
import { ESTADOS } from "../../../src/ui/etiquetas";
import { formatearImporte } from "../../../src/ui/formato";
import { EscenaInicio, Ilustracion } from "../../../src/ui/ilustraciones";
import { Icono, Logo } from "../../../src/ui/iconos";
import { ESP, FUENTE, RADIO, TEXTO, useTema } from "../../../src/ui/tema";

/**
 * Inicio del cliente: encabezado con «Nueva cotización» al frente, el borrador por retomar, la cotización lista que
 * necesita su atención y sus solicitudes recientes. Todo sale de la API; nada se calcula aquí.
 */
export default function Inicio() {
  const t = useTema();
  const router = useRouter();
  const { sesion } = useSesion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const s = seccionesDe(sesion?.capacidades ?? []);

  const { estado, reintentar } = useConsulta("inicio", async (senal) => {
    const [solicitudes, cotizaciones] = await Promise.all([s.solicitudes ? servicios.solicitudes({ senal }) : Promise.resolve([]), s.cotizaciones ? servicios.cotizaciones({ senal }) : Promise.resolve([])]);
    return { solicitudes, cotizaciones };
  });
  useRecargarAlEnfocar(reintentar);

  const datos = estado.datos;
  const borrador = datos?.solicitudes.find((x) => x.estado === "BORRADOR");
  const lista = datos?.solicitudes.find((x) => x.estado === "COTIZADA");
  const cotizacionLista = lista ? datos?.cotizaciones.find((c) => c.solicitudFolio === lista.folio) : undefined;
  const recientes = [...(datos?.solicitudes ?? [])].sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn)).slice(0, 4);
  const nombre = primerNombre(sesion?.usuario.nombre ?? "");

  return (
    <Pantalla relleno={false} bordes={["left", "right"]} refrescando={estado.actualizando} alRefrescar={reintentar}>
      <View style={{ backgroundColor: t.petroleoFondo, paddingTop: insets.top + ESP[3], paddingHorizontal: ESP[4], paddingBottom: ESP[10] + ESP[8], borderBottomRightRadius: 40, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ESP[4] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: ESP[2] }}>
            <Logo />
            <Text style={{ fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.lg, color: t.sobrePetroleo, letterSpacing: -0.4 }}>SoftArq</Text>
          </View>
          {sesion?.organizacion.esDemo ? (
            <View style={{ borderWidth: 1.5, borderColor: t.sobrePetroleo, borderRadius: RADIO.pildora, paddingHorizontal: ESP[3], paddingVertical: 2 }}>
              <Text accessibilityLabel="Versión de demostración" style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.xs, letterSpacing: 1.2, color: t.sobrePetroleo }}>
                DEMO
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ position: "absolute", right: -ESP[3], bottom: ESP[8] + ESP[2] }}>
          <EscenaInicio ancho={Math.min(width * 0.54, 240)} />
        </View>
        <View style={{ maxWidth: width * 0.62, gap: ESP[2] }}>
          <Text accessibilityRole="header" style={{ fontFamily: FUENTE.tituloFuerte, fontSize: TEXTO.xl + 2, lineHeight: (TEXTO.xl + 2) * 1.08, letterSpacing: -0.8, color: t.sobrePetroleo }}>
            {nombre ? `Hola, ${nombre}.` : "Hola."}
            {"\n"}¿Qué vamos a construir?
          </Text>
          <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.md - 1, color: t.sobrePetroleo, opacity: 0.92 }}>Cotiza tu obra en pocos pasos.</Text>
        </View>
      </View>

      {s.solicitudes ? (
        <View style={{ marginTop: -(ESP[8] + ESP[2]), marginHorizontal: ESP[4] }}>
          <Boton texto="Nueva cotización" subtitulo="Cubierta, losa o muro" icono="mas" alPulsar={() => router.push(rutas.nueva)} />
        </View>
      ) : null}

      <View style={{ padding: ESP[4], gap: ESP[5] }}>
        {estado.fase === "error" && estado.error && !datos ? <ErrorConsulta fallo={estado.error} alReintentar={reintentar} /> : null}
        {estado.error && datos ? <Aviso tono="aviso" texto="No pudimos actualizar. Lo que ves puede estar desactualizado." /> : null}

        {estado.fase === "cargando" && !datos ? (
          <View style={{ gap: ESP[3] }}>
            <Esqueleto alto={72} />
            <Esqueleto alto={72} />
            <Esqueleto alto={72} />
          </View>
        ) : null}

        {borrador ? (
          <View style={{ gap: ESP[1] }}>
            <Texto variante="etiqueta">Para retomar</Texto>
            <FilaLista
              titulo={borrador.proyecto}
              detalle={borrador.trabajos.length > 0 ? borrador.trabajos.join(" · ") : "Aún sin trabajos"}
              estado={ESTADOS.BORRADOR.texto}
              tonoEstado={ESTADOS.BORRADOR.tono}
              derecha="Seguir"
              etiqueta={`Retomar el borrador de ${borrador.proyecto}`}
              alPulsar={() => router.push(rutas.solicitud(borrador.id))}
            />
          </View>
        ) : null}

        {lista && cotizacionLista ? (
          <View style={{ gap: ESP[2] }}>
            <Texto variante="etiqueta">Necesita tu atención</Texto>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tu cotización de ${lista.proyecto} está lista. Ya puedes revisarla y descargar el PDF.`}
              onPress={() => router.push(rutas.cotizacion(cotizacionLista.emisionId))}
              style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: ESP[3], backgroundColor: t.verdeTinte, borderRadius: RADIO.medio, borderTopRightRadius: 6, borderBottomLeftRadius: 6, padding: ESP[3] }}
            >
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.verde }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md, color: t.tinta }}>Tu cotización de {lista.proyecto} está lista</Text>
                <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.tinta }}>Ya puedes revisarla y descargar el PDF</Text>
              </View>
              <Icono nombre="siguiente" tam={18} color={t.tinta} />
            </Pressable>
          </View>
        ) : null}

        {datos && datos.solicitudes.length > 0 ? (
          <View style={{ gap: ESP[1] }}>
            <Texto variante="etiqueta">Mis solicitudes</Texto>
            {recientes.map((x) => (
              <FilaLista
                key={x.id}
                titulo={x.proyecto}
                detalle={x.trabajos.join(" · ")}
                estado={ESTADOS[x.estado].texto}
                tonoEstado={ESTADOS[x.estado].tono}
                {...(x.totalEstimado ? { derecha: formatearImporte(x.totalEstimado), notaDerecha: "Estimación" } : {})}
                etiqueta={`${x.proyecto}, ${ESTADOS[x.estado].texto}${x.totalEstimado ? `, estimación ${formatearImporte(x.totalEstimado)}` : ""}`}
                alPulsar={() => router.push(rutas.solicitud(x.id))}
              />
            ))}
            {datos.solicitudes.length > recientes.length ? <Enlace texto="Ver todas" alPulsar={() => router.push(rutas.misCotizaciones)} /> : null}
          </View>
        ) : null}

        {datos && datos.solicitudes.length === 0 && estado.fase === "listo" ? (
          <Vacio
            ilustracion={<Ilustracion tipo="losa" ancho={150} />}
            titulo="Aún no tienes cotizaciones"
            texto="Empieza con «Nueva cotización»: elige el tipo de trabajo, escribe las medidas y recibe una estimación al momento."
          />
        ) : null}
      </View>
    </Pantalla>
  );
}
