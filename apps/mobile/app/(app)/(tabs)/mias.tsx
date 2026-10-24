import { useRouter } from "expo-router";
import { View } from "react-native";
import { useConsulta } from "../../../src/consultas/usar-consulta";
import { useRecargarAlEnfocar } from "../../../src/consultas/recargar-al-enfocar";
import { seccionesDe } from "../../../src/navegacion/capacidades";
import { rutas } from "../../../src/navegacion/rutas";
import { servicios } from "../../../src/servicios/instancia";
import { useSesion } from "../../../src/sesion/uso";
import { Aviso, Esqueleto, ErrorConsulta, Pantalla, Texto, Vacio } from "../../../src/ui/componentes";
import { FilaLista } from "../../../src/ui/componentes-captura";
import { ESTADOS } from "../../../src/ui/etiquetas";
import { formatearFecha, formatearImporte } from "../../../src/ui/formato";
import { Ilustracion } from "../../../src/ui/ilustraciones";
import { ESP } from "../../../src/ui/tema";

/** Solicitudes del cliente y sus cotizaciones emitidas. Una estimación es orientativa; la cotización la prepara y emite el equipo. */
export default function MisCotizaciones() {
  const router = useRouter();
  const { sesion } = useSesion();
  const s = seccionesDe(sesion?.capacidades ?? []);
  const { estado, reintentar } = useConsulta("mias", async (senal) => {
    const [solicitudes, cotizaciones] = await Promise.all([s.solicitudes ? servicios.solicitudes({ senal }) : Promise.resolve([]), s.cotizaciones ? servicios.cotizaciones({ senal }) : Promise.resolve([])]);
    return { solicitudes, cotizaciones };
  });
  useRecargarAlEnfocar(reintentar);
  const datos = estado.datos;

  return (
    <Pantalla bordes={["top", "left", "right"]} refrescando={estado.actualizando} alRefrescar={reintentar}>
      <View style={{ gap: ESP[1] }}>
        <Texto variante="titulo">Mis cotizaciones</Texto>
        <Texto variante="atenuado">Una estimación es orientativa. Una cotización la prepara y emite el equipo.</Texto>
      </View>

      {estado.fase === "error" && estado.error && !datos ? <ErrorConsulta fallo={estado.error} alReintentar={reintentar} /> : null}
      {estado.error && datos ? <Aviso tono="aviso" texto="No pudimos actualizar. Lo que ves puede estar desactualizado." /> : null}
      {estado.fase === "cargando" && !datos ? (
        <View style={{ gap: ESP[3] }}>
          <Esqueleto alto={72} />
          <Esqueleto alto={72} />
        </View>
      ) : null}

      {datos && datos.solicitudes.length > 0 ? (
        <View style={{ gap: ESP[1] }}>
          <Texto variante="etiqueta">Solicitudes</Texto>
          {datos.solicitudes.map((x) => (
            <FilaLista
              key={x.id}
              titulo={x.proyecto}
              detalle={x.trabajos.join(" · ")}
              estado={ESTADOS[x.estado].texto}
              tonoEstado={ESTADOS[x.estado].tono}
              {...(x.totalEstimado ? { derecha: formatearImporte(x.totalEstimado), notaDerecha: "Estimación" } : {})}
              etiqueta={`${x.proyecto}, ${ESTADOS[x.estado].texto}`}
              alPulsar={() => router.push(rutas.solicitud(x.id))}
            />
          ))}
        </View>
      ) : null}

      {datos && datos.cotizaciones.length > 0 ? (
        <View style={{ gap: ESP[1] }}>
          <Texto variante="etiqueta">Cotizaciones emitidas</Texto>
          {datos.cotizaciones.map((c) => (
            <FilaLista
              key={c.emisionId}
              titulo={c.proyecto}
              detalle={`${c.folio} · emitida el ${formatearFecha(c.fechaEmision)}`}
              estado={c.vigente ? `Vigente hasta el ${formatearFecha(c.vigenteHasta)}` : `Venció el ${formatearFecha(c.vigenteHasta)}`}
              tonoEstado={c.vigente ? "correcto" : "neutro"}
              derecha={formatearImporte(c.total)}
              notaDerecha="Total"
              etiqueta={`Cotización ${c.folio} de ${c.proyecto}, total ${formatearImporte(c.total)}`}
              alPulsar={() => router.push(rutas.cotizacion(c.emisionId))}
            />
          ))}
        </View>
      ) : null}

      {datos && datos.solicitudes.length === 0 && datos.cotizaciones.length === 0 && estado.fase === "listo" ? (
        <Vacio ilustracion={<Ilustracion tipo="muro" ancho={150} />} titulo="Todavía no hay nada aquí" texto="Cuando envíes una solicitud o el equipo emita una cotización para ti, la verás en esta lista." />
      ) : null}
    </Pantalla>
  );
}
