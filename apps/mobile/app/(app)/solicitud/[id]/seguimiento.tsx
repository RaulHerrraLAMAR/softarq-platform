import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { mensajeDeFallo } from "../../../../src/api/errores";
import { useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { resumirTrabajos } from "../../../../src/captura/resumen";
import { rutas } from "../../../../src/navegacion/rutas";
import { Aviso, Boton, Enlace, Hoja, Insignia, Pantalla, Texto } from "../../../../src/ui/componentes";
import { Encabezado } from "../../../../src/ui/componentes-captura";
import { ESTADOS, PASOS_SEGUIMIENTO } from "../../../../src/ui/etiquetas";
import { formatearImporte, formatearInstante } from "../../../../src/ui/formato";
import { Ilustracion } from "../../../../src/ui/ilustraciones";
import { ESP, FUENTE, RADIO, TEXTO, useTema } from "../../../../src/ui/tema";

/**
 * Seguimiento de una solicitud ya enviada: dónde va, qué envió y, cuando el equipo la emite, el acceso a la cotización
 * formal. Es solo de lectura: lo enviado no se edita. Mientras el equipo no la atienda se puede retirar.
 */
export default function Seguimiento() {
  const t = useTema();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { controlador, catalogo, estado } = useSolicitud();
  const [retirando, setRetirando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const s = estado.solicitud;
  if (!id || !s) return null;
  if (s.editable) return <Redirect href={rutas.resumen(id)} />;

  const info = ESTADOS[s.estado];
  const indiceActual = PASOS_SEGUIMIENTO.findIndex((p) => p.estado === s.estado);
  const resumen = resumirTrabajos(estado.local, catalogo);
  const comercial = s.ultimaEstimacion?.comercial ?? null;

  return (
    <Pantalla encabezado={<Encabezado titulo="Seguimiento" alVolver={() => (router.canGoBack() ? router.back() : router.replace(rutas.inicio))} etiquetaVolver="Volver" />}>
      <View style={{ gap: ESP[2] }}>
        <Insignia texto={`Proyecto: ${s.proyecto.nombre}`} tono="info" />
        <Texto variante="titulo">{info.texto}</Texto>
        <Texto variante="atenuado">{info.explicacion}</Texto>
        <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs + 1, color: t.suave, fontVariant: ["tabular-nums"] }}>
          Referencia {s.folio}
          {s.enviadaEn ? ` · enviada el ${formatearInstante(s.enviadaEn)}` : ""}
        </Text>
      </View>

      {s.estado !== "RETIRADA" ? (
        <View accessibilityRole="progressbar" accessibilityLabel={`Estado: ${info.texto}`} style={{ gap: ESP[2] }}>
          {PASOS_SEGUIMIENTO.map((p, i) => {
            const hecho = i < indiceActual;
            const actual = i === indiceActual;
            return (
              <View key={p.estado} style={{ flexDirection: "row", alignItems: "center", gap: ESP[3] }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: hecho ? t.verde : actual ? t.petroleoFondo : "transparent", borderWidth: hecho || actual ? 0 : 2, borderColor: t.linea }}>
                  {hecho || actual ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hecho ? t.papel : t.sobrePetroleo }} /> : null}
                </View>
                <Text style={{ fontFamily: actual ? FUENTE.titulo : FUENTE.texto, fontSize: TEXTO.md, color: hecho || actual ? t.tinta : t.suave }}>{p.texto}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {s.estado === "COTIZADA" && s.cotizacionFormal ? <Boton texto="Ver cotización formal" subtitulo={`${s.cotizacionFormal.folio} · ${formatearImporte(s.cotizacionFormal.total)}`} alPulsar={() => router.push(rutas.cotizacion(s.cotizacionFormal!.emisionId))} /> : null}

      {comercial ? (
        <View style={{ backgroundColor: t.papel, borderRadius: RADIO.medio, borderWidth: 1, borderColor: t.linea, padding: ESP[3], gap: ESP[1] }}>
          <Texto variante="etiqueta">Estimación preliminar al enviar</Texto>
          <Texto variante="subtitulo">{formatearImporte(comercial.total)}</Texto>
          <Texto variante="pequeno">MXN · IVA incluido. Es orientativa: no es una cotización formal.</Texto>
        </View>
      ) : s.ultimaEstimacion ? (
        <Aviso tono="info" texto="Enviaste esta solicitud sin una estimación con importe. El equipo completará la valoración al preparar tu cotización." />
      ) : null}

      <View style={{ gap: ESP[3] }}>
        <Texto variante="etiqueta">Lo que enviaste</Texto>
        {resumen.map((r) => (
          <View key={r.id} style={{ flexDirection: "row", gap: ESP[3], alignItems: "center", borderTopWidth: 1, borderTopColor: t.linea, paddingTop: ESP[3] }}>
            <Ilustracion tipo={r.tipo} ancho={70} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: t.tinta }}>
                {r.nombre}
                {r.variasOpciones ? ` · ${r.opcion}` : ""}
              </Text>
              {r.secciones.map((x, i) => (
                <Text key={i} style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>
                  Sección {i + 1} · {x}
                </Text>
              ))}
              {r.huecos.map((x, i) => (
                <Text key={`h${i}`} style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>
                  Hueco {i + 1} · {x}
                </Text>
              ))}
            </View>
          </View>
        ))}
        {estado.local.notas.trim() !== "" ? (
          <View style={{ gap: 2 }}>
            <Texto variante="etiqueta">Tus notas</Texto>
            <Texto variante="atenuado">{estado.local.notas}</Texto>
          </View>
        ) : null}
      </View>

      {estado.errorEnvio ? <Aviso tono="error" texto={mensajeDeFallo(estado.errorEnvio)} /> : null}

      {s.estado === "ENVIADA" ? <Enlace texto="Retirar solicitud" ayuda="La retira antes de que el equipo la atienda" alPulsar={() => setRetirando(true)} /> : null}

      <Hoja visible={retirando} etiqueta="Retirar solicitud" alCerrar={() => setRetirando(false)}>
        <Texto variante="subtitulo">¿Retirar esta solicitud?</Texto>
        <Texto variante="atenuado">El equipo dejará de atenderla. Para cotizar esta obra tendrás que crear una solicitud nueva.</Texto>
        <Boton
          texto="Retirar solicitud"
          cargando={trabajando}
          alPulsar={() => {
            setTrabajando(true);
            void controlador.retirar().finally(() => {
              setTrabajando(false);
              setRetirando(false);
            });
          }}
        />
        <Boton texto="Conservarla" variante="secundario" alPulsar={() => setRetirando(false)} deshabilitado={trabajando} />
      </Hoja>
    </Pantalla>
  );
}
